import re
from datetime import datetime, date
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user
from models.user import User
from models.call import Call
from models.client import Client
from models.contact import Contact
from models.client_score import ClientScore
from models.qualification import CallQualification
from models.ai_analysis import AiAnalysis
from models.phone_index import PhoneIndex
from models.playlist import DailyPlaylist
from schemas.call import CallResponse, QualifyCallRequest, QualificationResponse
from connectors.ringover_connector import dial
from ai.transcription import full_analysis

router = APIRouter(prefix="/api/calls", tags=["calls"])

_PHONE_RE = re.compile(r'^[\d\s+\-().]{6,}$')

def _resolve_contact_display(name: str | None, first_name: str | None, last_name: str | None) -> str | None:
    """Build the best display name from contact fields, preferring first+last over raw name."""
    if first_name or last_name:
        parts = [p for p in [first_name, last_name] if p and p.strip()]
        if parts:
            full = " ".join(parts)
            if not _PHONE_RE.match(full.strip()):
                return full
    if name and not _PHONE_RE.match(name.strip()):
        return name
    return name


class DialRequest(BaseModel):
    to_number: str
    from_number: int | None = None
    device: str = "ALL"


class ReminderResponse(BaseModel):
    call_id: str
    client_id: str | None = None
    client_name: str | None = None
    next_step: str | None = None
    next_step_date: date
    outcome: str | None = None
    contact_number: str | None = None
    contact_e164: str | None = None
    user_name: str | None = None
    qualified_at: datetime

    model_config = {"from_attributes": True}


class AiAnalysisResponse(BaseModel):
    id: str
    transcript: str | None = None
    summary: str | None = None
    client_sentiment: str | None = None
    sales_feedback: str | None = None
    detected_opportunities: str | None = None
    next_actions: str | None = None
    key_topics: list | None = None
    politeness_score: int | None = None
    objection_handling: int | None = None
    closing_attempt: int | None = None
    product_knowledge: int | None = None
    listening_quality: int | None = None
    overall_score: int | None = None
    admin_feedback: str | None = None
    analyzed_at: datetime

    model_config = {"from_attributes": True}


@router.get("", response_model=list[CallResponse])
async def list_calls(
    direction: str | None = None,
    is_answered: bool | None = None,
    client_id: str | None = None,
    user_id: str | None = None,
    search: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = (
        select(
            Call,
            Client.name.label("company_name_col"),
            Client.city,
            ClientScore.total_revenue_all,
            ClientScore.last_order_date,
            Contact.name.label("resolved_contact_name"),
            Contact.first_name.label("contact_first"),
            Contact.last_name.label("contact_last"),
            Contact.role.label("contact_role_col"),
            Contact.email.label("contact_email_col"),
            Contact.phone.label("contact_phone_col"),
            Contact.company_id.label("contact_company_id"),
        )
        .outerjoin(Client, Client.id == Call.client_id)
        .outerjoin(Contact, Contact.id == Call.contact_id)
        .outerjoin(ClientScore, ClientScore.client_id == Call.client_id)
        .options(selectinload(Call.qualification), selectinload(Call.ai_analysis))
    )

    if user.role == "sales":
        stmt = stmt.where(Call.user_id == user.id)
    elif user_id:
        stmt = stmt.where(Call.user_id == user_id)

    if direction:
        stmt = stmt.where(Call.direction == direction)
    if is_answered is not None:
        stmt = stmt.where(Call.is_answered == is_answered)
    if client_id:
        stmt = stmt.where(Call.client_id == client_id)
    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(
            Call.contact_number.ilike(pattern)
            | Call.contact_name.ilike(pattern)
            | Call.user_name.ilike(pattern)
            | Client.name.ilike(pattern)
            | Contact.name.ilike(pattern)
            | Contact.first_name.ilike(pattern)
            | Contact.last_name.ilike(pattern)
        )
    if date_from:
        stmt = stmt.where(func.date(Call.start_time) >= date_from)
    if date_to:
        stmt = stmt.where(func.date(Call.start_time) <= date_to)

    stmt = stmt.order_by(Call.start_time.desc()).offset(offset).limit(limit)
    result = await db.execute(stmt)
    rows = result.all()

    calls = []
    for row in rows:
        call_obj = row[0]
        resp = CallResponse.model_validate(call_obj)
        resp.company_name = row[1]
        resp.client_name = row[1]
        resp.client_city = row[2]
        resp.client_ca_total = float(row[3]) if row[3] else None
        resp.client_last_order = row[4]
        resolved_name = _resolve_contact_display(row[5], row[6], row[7])
        if resolved_name:
            resp.contact_name = resolved_name
        resp.contact_role = row[8]
        resp.contact_email = row[9]
        resp.contact_phone = row[10]
        resp.company_id = row[11] or resp.client_id
        calls.append(resp)

    return calls


@router.get("/unqualified", response_model=list[CallResponse])
async def unqualified_calls(
    user_id: str | None = None,
    mine: bool = False,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from sqlalchemy import or_

    subq = select(CallQualification.call_id)
    user_filters = []
    if user.role == "sales":
        user_filters.append(or_(Call.user_id == user.id, Call.user_name == user.name))
    elif mine:
        user_filters.append(or_(Call.user_id == user.id, Call.user_name == user.name))
    elif user_id and user.role in ("admin", "manager"):
        target = await db.execute(select(User).where(User.id == user_id))
        tu = target.scalar_one_or_none()
        if tu:
            user_filters.append(or_(Call.user_id == tu.id, Call.user_name == tu.name))

    stmt = (
        select(
            Call,
            Client.name.label("company_name_col"),
            Client.city,
            ClientScore.total_revenue_all,
            ClientScore.last_order_date,
            Contact.name.label("resolved_contact_name"),
            Contact.first_name.label("contact_first"),
            Contact.last_name.label("contact_last"),
            Contact.role.label("contact_role_col"),
            Contact.email.label("contact_email_col"),
            Contact.phone.label("contact_phone_col"),
            Contact.company_id.label("contact_company_id"),
        )
        .outerjoin(Client, Client.id == Call.client_id)
        .outerjoin(Contact, Contact.id == Call.contact_id)
        .outerjoin(ClientScore, ClientScore.client_id == Call.client_id)
        .options(selectinload(Call.qualification), selectinload(Call.ai_analysis))
        .where(
            Call.is_answered == True,
            ~Call.id.in_(subq),
            *user_filters,
        )
        .order_by(Call.start_time.desc())
        .limit(50)
    )
    result = await db.execute(stmt)
    rows = result.all()

    calls = []
    for row in rows:
        call_obj = row[0]
        resp = CallResponse.model_validate(call_obj)
        resp.company_name = row[1]
        resp.client_name = row[1]
        resp.client_city = row[2]
        resp.client_ca_total = float(row[3]) if row[3] else None
        resp.client_last_order = row[4]
        resolved_name = _resolve_contact_display(row[5], row[6], row[7])
        if resolved_name:
            resp.contact_name = resolved_name
        resp.contact_role = row[8]
        resp.contact_email = row[9]
        resp.contact_phone = row[10]
        resp.company_id = row[11] or resp.client_id
        calls.append(resp)

    return calls


@router.get("/stats")
async def call_stats(
    date_from: date | None = None,
    date_to: date | None = None,
    user_id: str | None = None,
    mine: bool = False,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from sqlalchemy import or_

    base_filter = []
    if date_from:
        base_filter.append(func.date(Call.start_time) >= date_from)
    if date_to:
        base_filter.append(func.date(Call.start_time) <= date_to)

    if mine:
        base_filter.append(or_(Call.user_id == user.id, Call.user_name == user.name))
    elif user_id:
        target = await db.execute(select(User).where(User.id == user_id))
        tu = target.scalar_one_or_none()
        if tu:
            base_filter.append(or_(Call.user_id == tu.id, Call.user_name == tu.name))

    total = await db.execute(select(func.count(Call.id)).where(*base_filter))
    answered = await db.execute(
        select(func.count(Call.id)).where(Call.is_answered == True, *base_filter)
    )
    missed = await db.execute(
        select(func.count(Call.id)).where(
            Call.is_answered == False,
            Call.direction.in_(["in", "inbound", "IN"]),
            *base_filter,
        )
    )
    no_answer = await db.execute(
        select(func.count(Call.id)).where(
            Call.is_answered == False,
            Call.direction.in_(["out", "outbound", "OUT"]),
            *base_filter,
        )
    )
    avg_duration = await db.execute(
        select(func.avg(Call.incall_duration)).where(Call.is_answered == True, *base_filter)
    )
    total_duration = await db.execute(
        select(func.sum(Call.incall_duration)).where(Call.is_answered == True, *base_filter)
    )

    outbound = await db.execute(
        select(func.count(Call.id)).where(
            Call.direction.in_(["out", "outbound"]), *base_filter
        )
    )
    inbound = await db.execute(
        select(func.count(Call.id)).where(
            Call.direction.in_(["in", "inbound"]), *base_filter
        )
    )

    qualified_sub = select(CallQualification.call_id)
    qualified = await db.execute(
        select(func.count(Call.id)).where(
            Call.id.in_(qualified_sub), *base_filter
        )
    )

    today = date.today()
    today_filter = [func.date(Call.start_time) == today]
    if mine:
        today_filter.append(or_(Call.user_id == user.id, Call.user_name == user.name))
    elif user_id:
        target2 = await db.execute(select(User).where(User.id == user_id))
        tu2 = target2.scalar_one_or_none()
        if tu2:
            today_filter.append(or_(Call.user_id == tu2.id, Call.user_name == tu2.name))

    today_count = await db.execute(
        select(func.count(Call.id)).where(*today_filter)
    )
    today_answered = await db.execute(
        select(func.count(Call.id)).where(
            Call.is_answered == True,
            *today_filter,
        )
    )

    return {
        "total_calls": total.scalar() or 0,
        "total_answered": answered.scalar() or 0,
        "total_missed": missed.scalar() or 0,
        "total_no_answer": no_answer.scalar() or 0,
        "avg_duration_seconds": round(avg_duration.scalar() or 0, 1),
        "total_duration_seconds": total_duration.scalar() or 0,
        "outbound_calls": outbound.scalar() or 0,
        "inbound_calls": inbound.scalar() or 0,
        "qualified_calls": qualified.scalar() or 0,
        "today_calls": today_count.scalar() or 0,
        "today_answered": today_answered.scalar() or 0,
    }


@router.post("/dial")
async def dial_number(
    body: DialRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from_number = body.from_number
    if not from_number and user.ringover_number:
        from_number = _to_e164_int(user.ringover_number)

    result = await dial(
        to_number=body.to_number,
        from_number=from_number,
        device=body.device,
    )
    if not result["success"]:
        raise HTTPException(status_code=502, detail=result.get("error", "Erreur Ringover"))

    from connectors.phone_normalizer import normalize_phone
    from datetime import timezone as tz
    dialed_e164 = normalize_phone(body.to_number)
    if dialed_e164:
        pi = (await db.execute(
            select(PhoneIndex.client_id).where(PhoneIndex.phone_e164 == dialed_e164).limit(1)
        )).scalar_one_or_none()
        if pi:
            today = date.today()
            entry = (await db.execute(
                select(DailyPlaylist).where(
                    DailyPlaylist.user_id == user.id,
                    DailyPlaylist.client_id == pi,
                    DailyPlaylist.generated_date == today,
                    DailyPlaylist.status == "pending",
                )
            )).scalar_one_or_none()
            if entry:
                entry.status = "called"
                entry.called_at = datetime.now(tz.utc)
                await db.commit()
                result["playlist_updated"] = True

    return result


def _to_e164_int(number: str) -> int | None:
    """Convertit un numéro en integer E.164 sans le + (format Ringover).
    Ex: '0184808799' → 33184808799, '+33184808799' → 33184808799, '33184808799' → 33184808799
    """
    raw = number.replace("+", "").replace(" ", "").replace(".", "").replace("-", "")
    if not raw.isdigit():
        return None
    if raw.startswith("0") and len(raw) == 10:
        raw = "33" + raw[1:]
    return int(raw)


@router.get("/reminders", response_model=list[ReminderResponse])
async def get_reminders(
    include_past: bool = False,
    user_id: str | None = None,
    mine: bool = False,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from sqlalchemy import or_

    today = date.today()
    stmt = (
        select(
            CallQualification.call_id,
            Call.client_id,
            Client.name.label("client_name"),
            CallQualification.next_step,
            CallQualification.next_step_date,
            CallQualification.outcome,
            Call.contact_number,
            Call.contact_e164,
            Call.user_name,
            CallQualification.qualified_at,
        )
        .join(Call, Call.id == CallQualification.call_id)
        .outerjoin(Client, Client.id == Call.client_id)
        .where(CallQualification.next_step_date.isnot(None))
    )
    if mine:
        stmt = stmt.where(or_(Call.user_id == user.id, Call.user_name == user.name))
    elif user_id and user.role in ("admin", "manager"):
        target = await db.execute(select(User).where(User.id == user_id))
        tu = target.scalar_one_or_none()
        if tu:
            stmt = stmt.where(or_(Call.user_id == tu.id, Call.user_name == tu.name))
    if not include_past:
        stmt = stmt.where(CallQualification.next_step_date >= today)
    stmt = stmt.order_by(CallQualification.next_step_date.asc()).limit(50)
    result = await db.execute(stmt)
    return [ReminderResponse(**dict(row._mapping)) for row in result.all()]


@router.post("/{call_id}/transcribe", response_model=AiAnalysisResponse)
async def transcribe_call(
    call_id: str,
    force: bool = False,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Transcrit et analyse un appel. Retourne le cache DB si déjà analysé."""
    # Vérifier le cache
    if not force:
        cached = await db.execute(
            select(AiAnalysis).where(AiAnalysis.call_id == call_id)
        )
        existing = cached.scalar_one_or_none()
        if existing:
            return AiAnalysisResponse.model_validate(existing)

    # Charger l'appel
    result = await db.execute(select(Call).where(Call.id == call_id))
    call = result.scalar_one_or_none()
    if not call:
        raise HTTPException(status_code=404, detail="Appel introuvable")
    if not call.record_url:
        raise HTTPException(status_code=400, detail="Pas d'enregistrement pour cet appel")

    try:
        analysis_data = await full_analysis(call.record_url, call.incall_duration)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erreur IA: {str(e)}")

    # Upsert en DB
    existing_result = await db.execute(
        select(AiAnalysis).where(AiAnalysis.call_id == call_id)
    )
    ai_obj = existing_result.scalar_one_or_none()
    if ai_obj:
        for k, v in analysis_data.items():
            setattr(ai_obj, k, v)
    else:
        ai_obj = AiAnalysis(call_id=call_id, **analysis_data)
        db.add(ai_obj)
    await db.commit()
    await db.refresh(ai_obj)

    return AiAnalysisResponse.model_validate(ai_obj)


@router.get("/{call_id}/analysis", response_model=AiAnalysisResponse)
async def get_call_analysis(
    call_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Récupère l'analyse IA d'un appel (lecture seule, pas de transcription)."""
    result = await db.execute(
        select(AiAnalysis).where(AiAnalysis.call_id == call_id)
    )
    ai = result.scalar_one_or_none()
    if not ai:
        raise HTTPException(status_code=404, detail="Aucune analyse pour cet appel")
    return AiAnalysisResponse.model_validate(ai)
