"""
Connecteur Ringover API v2.
Migré depuis le prototype Flask (app.py).

Architecture sync :
- sync_calls_fast()  : poll léger toutes les 4s, seulement les nouveaux appels
- post_process_calls() : traitement lourd toutes les 30s (qualification, lifecycle, playlist)
- sync_calls()       : full sync legacy (gardé pour admin / première exécution)
"""
import logging
from datetime import datetime, timezone, timedelta

import httpx

logger = logging.getLogger(__name__)
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert as pg_insert

import uuid

from config import get_settings
from models.call import Call
from models.client import Client
from models.contact import Contact
from models.phone_index import PhoneIndex
from models.sync_log import SyncLog
from models.ai_analysis import AiAnalysis
from models.qualification import CallQualification
from models.client_audit import ClientAuditLog
from models.playlist import DailyPlaylist
from connectors.phone_normalizer import normalize_phone

settings = get_settings()

_known_cdr_ids: set[str] = set()
_cdr_cache_loaded = False
_last_fast_sync_ts: datetime | None = None
_fast_sync_counter = 0
_fast_sync_new_total = 0
_last_heartbeat: datetime | None = None


async def ringover_request(endpoint: str, params: dict | None = None) -> dict | None:
    """Effectue une requête à l'API Ringover v2."""
    headers = {"Authorization": settings.ringover_api_key}
    url = f"{settings.ringover_base_url}/{endpoint}"

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(url, headers=headers, params=params)
        if response.status_code == 200:
            return response.json()
        print(f"Ringover API error: {response.status_code} - {response.text[:200]}")
        return None


async def _build_user_maps(db: AsyncSession) -> tuple[dict, dict, dict]:
    """Construit les maps pour résoudre user_id depuis les données Ringover."""
    from models.user import User as UserModel
    result = await db.execute(
        select(
            UserModel.id, UserModel.ringover_user_id,
            UserModel.ringover_email, UserModel.email, UserModel.name,
        ).where(UserModel.is_active == True)
    )
    by_ringover_id = {}
    by_email = {}
    by_name = {}
    for row in result.all():
        uid, ring_id, ring_email, email, name = row
        if ring_id:
            by_ringover_id[str(ring_id)] = uid
        if ring_email:
            by_email[ring_email.lower()] = uid
        if email:
            by_email[email.lower()] = uid
        if name:
            by_name[name.lower()] = uid
    return by_ringover_id, by_email, by_name


def _resolve_user_id(
    user_data: dict,
    by_ringover_id: dict,
    by_email: dict,
    by_name: dict,
) -> str | None:
    ring_uid = str(user_data.get("user_id", ""))
    if ring_uid and ring_uid in by_ringover_id:
        return by_ringover_id[ring_uid]

    email = (user_data.get("email") or "").lower()
    if email and email in by_email:
        return by_email[email]

    name = (user_data.get("concat_name") or "").lower()
    if name and name in by_name:
        return by_name[name]

    return None


async def _ensure_cdr_cache(db: AsyncSession):
    """Load known cdr_ids into memory on first run."""
    global _known_cdr_ids, _cdr_cache_loaded, _last_fast_sync_ts
    if _cdr_cache_loaded:
        return
    result = await db.execute(select(Call.ringover_cdr_id))
    _known_cdr_ids = {row[0] for row in result.all() if row[0]}
    ts = (await db.execute(select(func.max(Call.start_time)))).scalar()
    _last_fast_sync_ts = ts or (datetime.now(timezone.utc) - timedelta(hours=2))
    _cdr_cache_loaded = True
    logger.info(f"CDR cache loaded: {len(_known_cdr_ids)} known calls, last={_last_fast_sync_ts}")


async def _upsert_call(call_data: dict, phone_map: dict, phone_contact_map: dict,
                       by_ringover_id: dict, by_email: dict, by_name: dict,
                       db: AsyncSession) -> bool:
    """Process a single call from Ringover API. Returns True if new call inserted."""
    user = call_data.get("user") or {}
    contact = call_data.get("contact")
    voicemail = call_data.get("voicemail")
    record = call_data.get("record")

    voicemail_url = None
    if voicemail:
        voicemail_url = voicemail if isinstance(voicemail, str) else voicemail.get("url")

    record_url = None
    if record:
        record_url = record if isinstance(record, str) else record.get("url")

    contact_number = call_data.get("contact_number")
    contact_e164 = normalize_phone(str(contact_number)) if contact_number else None

    client_id = phone_map.get(contact_e164) if contact_e164 else None
    contact_id = phone_contact_map.get(contact_e164) if contact_e164 else None
    resolved_user_id = _resolve_user_id(user, by_ringover_id, by_email, by_name)

    if client_id is None and contact_e164:
        auto_sage_id = f"AUTO-{uuid.uuid4().hex[:8].upper()}"
        new_client = Client(
            sage_id=auto_sage_id,
            name=contact_e164,
            phone=str(contact_number) if contact_number else contact_e164,
            phone_e164=contact_e164,
            status="prospect",
            is_prospect=True,
            is_dormant=False,
            assigned_user_id=resolved_user_id,
        )
        db.add(new_client)
        await db.flush()

        new_contact = Contact(
            company_id=new_client.id,
            name=contact_e164,
            phone=str(contact_number) if contact_number else contact_e164,
            phone_e164=contact_e164,
            assigned_user_id=resolved_user_id,
            is_primary=True,
            source="ringover",
        )
        db.add(new_contact)
        await db.flush()

        db.add(PhoneIndex(
            phone_e164=contact_e164,
            client_id=new_client.id,
            contact_id=new_contact.id,
            source="ringover_auto",
            raw_phone=str(contact_number) if contact_number else contact_e164,
            label="principal",
        ))
        db.add(ClientAuditLog(
            client_id=new_client.id,
            contact_id=new_contact.id,
            user_id=resolved_user_id,
            user_name=user.get("concat_name") or "system",
            action="created",
            details=f"Création auto depuis appel Ringover ({contact_e164})",
        ))

        client_id = new_client.id
        contact_id = new_contact.id
        phone_map[contact_e164] = client_id
        phone_contact_map[contact_e164] = contact_id

    start_time_raw = call_data.get("start_time")
    start_time = _parse_ringover_datetime(start_time_raw) or datetime.now(timezone.utc)
    end_time = _parse_ringover_datetime(call_data.get("end_time"))

    values = {
        "ringover_cdr_id": call_data["cdr_id"],
        "call_id": call_data.get("call_id"),
        "direction": call_data.get("direction", "OUT"),
        "is_answered": bool(call_data.get("is_answered")),
        "last_state": call_data.get("last_state"),
        "start_time": start_time,
        "end_time": end_time,
        "total_duration": call_data.get("total_duration") or 0,
        "incall_duration": call_data.get("incall_duration") or 0,
        "from_number": call_data.get("from_number"),
        "to_number": call_data.get("to_number"),
        "contact_number": str(contact_number) if contact_number else None,
        "contact_e164": contact_e164,
        "hangup_by": call_data.get("hangup_by"),
        "voicemail_url": voicemail_url,
        "record_url": record_url,
        "user_id": resolved_user_id,
        "user_name": user.get("concat_name"),
        "user_email": user.get("email"),
        "client_id": client_id,
        "contact_id": contact_id,
        "contact_name": contact.get("concat_name") if isinstance(contact, dict) else None,
        "synced_at": datetime.now(timezone.utc),
    }

    stmt = pg_insert(Call).values(**values)
    stmt = stmt.on_conflict_do_update(
        index_elements=["ringover_cdr_id"],
        set_={k: v for k, v in values.items() if k != "ringover_cdr_id"},
    )
    await db.execute(stmt)
    return True


async def sync_calls_fast(db: AsyncSession) -> dict:
    """Lightweight fast poll — only fetches new calls, no post-processing.
    Designed to run every 4 seconds."""
    global _known_cdr_ids, _last_fast_sync_ts

    await _ensure_cdr_cache(db)

    params: dict = {"limit_count": 30, "limit_offset": 0}
    if _last_fast_sync_ts:
        params["after_created_at"] = _last_fast_sync_ts.strftime("%Y-%m-%dT%H:%M:%SZ")

    data = await ringover_request("calls", params)
    if not data or not data.get("call_list"):
        return {"new": 0, "from_api": 0}

    api_calls = data["call_list"]
    new_calls = [c for c in api_calls if str(c.get("cdr_id", "")) not in _known_cdr_ids]

    if not new_calls:
        return {"new": 0, "from_api": len(api_calls)}

    q = await db.execute(select(PhoneIndex.phone_e164, PhoneIndex.client_id, PhoneIndex.contact_id))
    phone_map: dict[str, str] = {}
    phone_contact_map: dict[str, str | None] = {}
    for row in q.all():
        phone_map[row[0]] = row[1]
        phone_contact_map[row[0]] = row[2]

    by_ringover_id, by_email, by_name = await _build_user_maps(db)

    created, errors = 0, 0
    for call_data in new_calls:
        try:
            await _upsert_call(call_data, phone_map, phone_contact_map,
                               by_ringover_id, by_email, by_name, db)
            cdr_id = str(call_data["cdr_id"])
            _known_cdr_ids.add(cdr_id)
            st = _parse_ringover_datetime(call_data.get("start_time"))
            if st and (_last_fast_sync_ts is None or st > _last_fast_sync_ts):
                _last_fast_sync_ts = st
            created += 1
        except Exception as e:
            errors += 1
            await db.rollback()
            logger.warning(f"Fast sync erreur cdr {call_data.get('cdr_id')}: {e}")

    await db.commit()

    global _fast_sync_counter, _fast_sync_new_total, _last_heartbeat
    _fast_sync_counter += 1
    _fast_sync_new_total += created

    if created > 0:
        log = SyncLog(
            source="ringover_calls",
            sync_type="fast",
            status="success",
            records_found=len(api_calls),
            records_created=created,
            records_errors=errors,
            finished_at=datetime.now(timezone.utc),
        )
        db.add(log)
        await db.commit()
        logger.info(f"Fast sync: {created} new calls ingested")

    now = datetime.now(timezone.utc)
    if _last_heartbeat is None or (now - _last_heartbeat).total_seconds() >= 300:
        log = SyncLog(
            source="ringover_calls",
            sync_type="heartbeat",
            status="success",
            records_found=_fast_sync_counter,
            records_created=_fast_sync_new_total,
            records_errors=0,
            finished_at=now,
        )
        db.add(log)
        await db.commit()
        logger.info(f"Ringover heartbeat: {_fast_sync_counter} polls, {_fast_sync_new_total} new calls since last heartbeat")
        _fast_sync_counter = 0
        _fast_sync_new_total = 0
        _last_heartbeat = now

    return {"new": created, "errors": errors, "from_api": len(api_calls)}


async def post_process_calls(db: AsyncSession) -> dict:
    """Heavy post-processing — runs every 30s separately from fast sync.
    Auto-qualification, lifecycle, playlist updates, session matching."""

    auto_qualified = 0
    existing_qualifs = await db.execute(select(CallQualification.call_id))
    qualified_ids = {row[0] for row in existing_qualifs.all()}

    unanswered_out = await db.execute(
        select(Call).where(
            Call.is_answered == False,
            Call.direction.in_(["out", "outbound", "OUT"]),
            ~Call.id.in_(qualified_ids) if qualified_ids else Call.id.isnot(None),
        )
    )
    for call in unanswered_out.scalars().all():
        if not call.user_id:
            continue
        qualif = CallQualification(
            call_id=call.id,
            user_id=call.user_id,
            mood="neutral",
            outcome="Injoignable",
            notes="Qualification automatique — appel sortant sans réponse du client",
            xp_earned=0,
        )
        db.add(qualif)
        auto_qualified += 1

    if auto_qualified:
        await db.commit()

    from engines.lifecycle_engine import on_call_answered
    lifecycle_applied = 0
    answered_calls = await db.execute(
        select(Call).where(
            Call.is_answered == True,
            Call.incall_duration > 30,
            Call.client_id.isnot(None),
        ).join(Client, Client.id == Call.client_id).where(
            Client.status == "prospect",
        )
    )
    for call in answered_calls.scalars().all():
        result = await on_call_answered(db, call)
        if result:
            lifecycle_applied += 1
    if lifecycle_applied:
        await db.commit()

    from datetime import date as date_type
    today = date_type.today()
    playlist_updated = 0

    pending_entries = await db.execute(
        select(DailyPlaylist).where(
            DailyPlaylist.generated_date == today,
            DailyPlaylist.status == "pending",
        )
    )
    pending_map: dict[tuple[str, str], DailyPlaylist] = {}
    for entry in pending_entries.scalars().all():
        pending_map[(entry.user_id, entry.client_id)] = entry

    if pending_map:
        recent_calls = await db.execute(
            select(Call).where(
                Call.start_time >= datetime(today.year, today.month, today.day, tzinfo=timezone.utc),
                Call.client_id.isnot(None),
                Call.user_id.isnot(None),
                Call.is_answered == True,
            )
        )
        for call in recent_calls.scalars().all():
            key = (call.user_id, call.client_id)
            entry = pending_map.get(key)
            if entry:
                entry.status = "called"
                entry.called_at = call.start_time
                entry.call_id = call.id
                playlist_updated += 1
                del pending_map[key]

        if playlist_updated:
            await db.commit()

    sessions_matched = 0
    try:
        sessions_matched = await _match_call_sessions(db)
    except Exception as e:
        logger.warning(f"Erreur matching call_sessions: {e}")

    return {
        "auto_qualified": auto_qualified,
        "lifecycle": lifecycle_applied,
        "playlist_updated": playlist_updated,
        "sessions_matched": sessions_matched,
    }


async def sync_calls(db: AsyncSession, limit: int = 500) -> dict:
    """Full sync legacy — used for admin-triggered syncs and first run."""
    global _known_cdr_ids, _cdr_cache_loaded, _last_fast_sync_ts

    all_calls = []
    offset = 0
    batch_size = 100

    while len(all_calls) < limit:
        data = await ringover_request("calls", {
            "limit_count": batch_size,
            "limit_offset": offset,
        })
        if not data or not data.get("call_list"):
            break
        all_calls.extend(data["call_list"])
        if len(data["call_list"]) < batch_size:
            break
        offset += batch_size

    q = await db.execute(select(PhoneIndex.phone_e164, PhoneIndex.client_id, PhoneIndex.contact_id))
    phone_map: dict[str, str] = {}
    phone_contact_map: dict[str, str | None] = {}
    for row in q.all():
        phone_map[row[0]] = row[1]
        phone_contact_map[row[0]] = row[2]

    by_ringover_id, by_email, by_name = await _build_user_maps(db)

    created, errors = 0, 0

    for call_data in all_calls:
        try:
            await _upsert_call(call_data, phone_map, phone_contact_map,
                               by_ringover_id, by_email, by_name, db)
            _known_cdr_ids.add(str(call_data["cdr_id"]))
            created += 1
        except Exception as e:
            errors += 1
            await db.rollback()
            print(f"Erreur sync appel {call_data.get('cdr_id')}: {e}")

    await db.commit()

    pp = await post_process_calls(db)

    _cdr_cache_loaded = True
    ts = (await db.execute(select(func.max(Call.start_time)))).scalar()
    if ts:
        _last_fast_sync_ts = ts

    log = SyncLog(
        source="ringover_calls",
        sync_type="delta",
        status="success",
        records_found=len(all_calls),
        records_created=created,
        records_errors=errors,
        finished_at=datetime.now(timezone.utc),
    )
    db.add(log)
    await db.commit()

    return {
        "synced": created,
        "errors": errors,
        "auto_qualified": pp.get("auto_qualified", 0),
        "playlist_auto_called": pp.get("playlist_updated", 0),
        "sessions_matched": pp.get("sessions_matched", 0),
        "total_from_api": len(all_calls),
    }


async def dial(to_number: str, from_number: int | None = None, device: str = "ALL") -> dict:
    """Lance un appel via l'API Ringover Callback (click-to-call).
    
    Workflow Ringover:
    1. L'utilisateur reçoit un appel sur son poste/app
    2. Quand il décroche, Ringover appelle automatiquement le destinataire
    """
    headers = {"Authorization": settings.ringover_api_key}
    url = f"{settings.ringover_base_url}/callback"

    body: dict = {
        "to_number": int(to_number.replace("+", "")),
        "timeout": 120,
        "device": device,
        "clir": False,
    }
    if from_number:
        body["from_number"] = from_number

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(url, headers=headers, json=body)
        if response.status_code == 200:
            return {"success": True, "data": response.json()}
        return {
            "success": False,
            "error": f"{response.status_code}: {response.text[:200]}",
        }


async def auto_transcribe_new_calls(db: AsyncSession) -> dict:
    """Transcrit automatiquement les appels > 10s avec enregistrement et sans analyse IA."""
    from ai.transcription import full_analysis

    subq = select(AiAnalysis.call_id)
    stmt = (
        select(Call)
        .where(
            Call.record_url.isnot(None),
            Call.incall_duration > 10,
            ~Call.id.in_(subq),
        )
        .order_by(Call.start_time.desc())
        .limit(20)
    )
    result = await db.execute(stmt)
    calls_to_analyze = result.scalars().all()

    analyzed, errors = 0, 0
    for call in calls_to_analyze:
        try:
            data = await full_analysis(call.record_url, call.incall_duration)
            ai_obj = AiAnalysis(call_id=call.id, **data)
            db.add(ai_obj)
            await db.commit()
            analyzed += 1
            print(f"  ✓ Transcrit appel {call.id} ({call.incall_duration}s)")
        except Exception as e:
            await db.rollback()
            errors += 1
            print(f"  ✗ Erreur transcription {call.id}: {e}")

    return {"analyzed": analyzed, "errors": errors}


async def get_presences() -> list[dict]:
    """Récupère les présences en temps réel."""
    data = await ringover_request("presences")
    if not data:
        return []
    return data.get("presence_list", data.get("presences", []))


async def get_team_members() -> list[dict]:
    """Récupère les membres de l'équipe Ringover avec leurs numéros."""
    data = await ringover_request("team/members")
    if not data:
        return []

    raw_members = data.get("user_list", data.get("members", []))
    members = []
    for m in raw_members:
        numbers = []
        for n in (m.get("numbers") or m.get("number_list") or []):
            if isinstance(n, dict):
                numbers.append(n.get("number") or n.get("format_international", ""))
            else:
                numbers.append(str(n))

        members.append({
            "user_id": str(m.get("user_id", "")),
            "name": m.get("concat_name") or f"{m.get('firstname', '')} {m.get('lastname', '')}".strip(),
            "email": m.get("email", ""),
            "numbers": numbers,
            "is_active": not m.get("is_disabled", False),
        })

    return members


async def _match_call_sessions(db: AsyncSession) -> int:
    """Match unmatched call_sessions to recently synced calls by user + phone + time proximity."""
    from models.call_session import CallSession
    from models.qualification import CallQualification
    from connectors.phone_normalizer import normalize_phone
    from sqlalchemy import and_

    unmatched_q = await db.execute(
        select(CallSession).where(
            CallSession.matched_call_id == None,
            CallSession.ended_at != None,
        )
    )
    unmatched = unmatched_q.scalars().all()
    if not unmatched:
        return 0

    matched = 0
    for session in unmatched:
        phone_norm = session.phone_number
        if phone_norm:
            try:
                phone_norm = normalize_phone(phone_norm)
            except Exception:
                pass

        window_start = session.started_at - timedelta(minutes=2)
        window_end = session.started_at + timedelta(minutes=30)

        filters = [
            Call.start_time >= window_start,
            Call.start_time <= window_end,
            Call.user_id == session.user_id,
        ]
        if phone_norm:
            filters.append(Call.contact_e164 == phone_norm)

        call_q = await db.execute(
            select(Call)
            .where(and_(*filters))
            .order_by(Call.start_time.desc())
            .limit(1)
        )
        call = call_q.scalar_one_or_none()
        if not call:
            continue

        session.matched_call_id = call.id

        existing_qualif = await db.execute(
            select(CallQualification).where(CallQualification.call_id == call.id)
        )
        if not existing_qualif.scalar_one_or_none() and session.mood:
            qualif = CallQualification(
                call_id=call.id,
                user_id=session.user_id,
                mood=session.mood,
                outcome=session.outcome,
                notes=session.notes,
                next_step=session.next_step,
                next_step_date=session.next_step_date,
            )
            db.add(qualif)

        matched += 1

    if matched:
        await db.commit()
    logger.info(f"Call sessions matched: {matched}/{len(unmatched)}")
    return matched


def _parse_ringover_datetime(raw) -> datetime | None:
    if not raw:
        return None
    if isinstance(raw, datetime):
        return raw.replace(tzinfo=timezone.utc)
    try:
        for fmt in ("%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d %H:%M:%S"):
            try:
                return datetime.strptime(str(raw), fmt).replace(tzinfo=timezone.utc)
            except ValueError:
                continue
    except Exception:
        pass
    return None
