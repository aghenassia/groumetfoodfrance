"""
Connecteur Ringover API v2.
Migré depuis le prototype Flask (app.py).
"""
from datetime import datetime, timezone

import httpx
from sqlalchemy import select
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
from connectors.phone_normalizer import normalize_phone

settings = get_settings()


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


async def sync_calls(db: AsyncSession, limit: int = 500) -> dict:
    """Synchronise les appels depuis Ringover vers PostgreSQL."""
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
            created += 1

        except Exception as e:
            errors += 1
            await db.rollback()
            print(f"Erreur sync appel {call_data.get('cdr_id')}: {e}")

    await db.commit()

    # Auto-qualifier les appels sortants sans réponse comme "Injoignable"
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
        qualif = CallQualification(
            call_id=call.id,
            user_id=call.user_id or "system",
            mood="neutral",
            outcome="Injoignable",
            notes="Qualification automatique — appel sortant sans réponse du client",
            xp_earned=0,
        )
        db.add(qualif)
        auto_qualified += 1

    if auto_qualified:
        await db.commit()

    # Appliquer les transitions lifecycle pour les appels fraîchement synchés
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

    # Log de sync dans une opération séparée
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
        "auto_qualified": auto_qualified,
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
