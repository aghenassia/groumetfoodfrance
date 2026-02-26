from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user
from models.user import User
from models.call import Call
from models.qualification import CallQualification
from schemas.call import QualifyCallRequest, QualificationResponse
from engines.lifecycle_engine import on_qualification, on_call_answered

router = APIRouter(prefix="/api/qualify", tags=["qualify"])

XP_BASE = 10
XP_FULL = 15


@router.post("", response_model=QualificationResponse)
async def qualify_call(
    body: QualifyCallRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    call_result = await db.execute(select(Call).where(Call.id == body.call_id))
    call = call_result.scalar_one_or_none()
    if not call:
        raise HTTPException(status_code=404, detail="Appel introuvable")

    existing = await db.execute(
        select(CallQualification).where(CallQualification.call_id == body.call_id)
    )
    qualif = existing.scalar_one_or_none()

    has_full_data = bool(body.tags and body.next_step)
    xp = XP_FULL if has_full_data else XP_BASE

    if qualif:
        qualif.mood = body.mood
        qualif.tags = body.tags
        qualif.outcome = body.outcome
        qualif.next_step = body.next_step
        qualif.next_step_date = body.next_step_date
        qualif.notes = body.notes
        qualif.xp_earned = xp
        qualif.qualified_at = datetime.now(timezone.utc)
    else:
        qualif = CallQualification(
            call_id=body.call_id,
            user_id=user.id,
            mood=body.mood,
            tags=body.tags,
            outcome=body.outcome,
            next_step=body.next_step,
            next_step_date=body.next_step_date,
            notes=body.notes,
            xp_earned=xp,
        )
        db.add(qualif)

    # Lifecycle: qualification feedback → fiche client
    if call.client_id:
        await on_qualification(
            db, call.client_id, body.mood, body.outcome, body.tags, body.notes
        )
        # Lifecycle: appel décroché → prospect→lead, dormant cooldown
        await on_call_answered(db, call)

    await db.commit()
    await db.refresh(qualif)
    return QualificationResponse.model_validate(qualif)
