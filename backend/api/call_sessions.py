"""
Call Sessions — données collectées pendant un appel via le Call Companion.
"""
from datetime import datetime, timezone, date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from core.database import get_db
from core.security import get_current_user
from models.user import User
from models.client import Client
from models.call_session import CallSession
from models.client_audit import ClientAuditLog

router = APIRouter(prefix="/api/call-sessions", tags=["call-sessions"])


class CallSessionCreate(BaseModel):
    client_id: str
    phone_number: str | None = None

class CallSessionUpdate(BaseModel):
    mood: str | None = None
    outcome: str | None = None
    notes: str | None = None
    next_step: str | None = None
    next_step_date: date | None = None

class CallSessionResponse(BaseModel):
    id: str
    client_id: str
    client_name: str | None = None
    user_id: str
    phone_number: str | None = None
    mood: str | None = None
    outcome: str | None = None
    notes: str | None = None
    next_step: str | None = None
    next_step_date: date | None = None
    matched_call_id: str | None = None
    started_at: str
    ended_at: str | None = None


@router.post("", response_model=CallSessionResponse)
async def create_session(
    body: CallSessionCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    client = await db.get(Client, body.client_id)
    if not client:
        raise HTTPException(404, "Client introuvable")

    session = CallSession(
        client_id=body.client_id,
        user_id=user.id,
        phone_number=body.phone_number,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    return CallSessionResponse(
        id=session.id,
        client_id=session.client_id,
        client_name=client.name,
        user_id=session.user_id,
        phone_number=session.phone_number,
        started_at=str(session.started_at),
    )


@router.put("/{session_id}", response_model=CallSessionResponse)
async def update_session(
    session_id: str,
    body: CallSessionUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session = await db.get(CallSession, session_id)
    if not session:
        raise HTTPException(404, "Session introuvable")
    if session.user_id != user.id:
        raise HTTPException(403, "Pas autorisé")

    for field in ("mood", "outcome", "notes", "next_step", "next_step_date"):
        val = getattr(body, field)
        if val is not None:
            setattr(session, field, val)

    session.ended_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(session)

    client = await db.get(Client, session.client_id)

    return CallSessionResponse(
        id=session.id,
        client_id=session.client_id,
        client_name=client.name if client else None,
        user_id=session.user_id,
        phone_number=session.phone_number,
        mood=session.mood,
        outcome=session.outcome,
        notes=session.notes,
        next_step=session.next_step,
        next_step_date=session.next_step_date,
        matched_call_id=session.matched_call_id,
        started_at=str(session.started_at),
        ended_at=str(session.ended_at) if session.ended_at else None,
    )


@router.get("/pending", response_model=list[CallSessionResponse])
async def pending_sessions(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Sessions non terminées du user courant."""
    result = await db.execute(
        select(CallSession, Client.name)
        .outerjoin(Client, Client.id == CallSession.client_id)
        .where(
            CallSession.user_id == user.id,
            CallSession.ended_at == None,
        )
        .order_by(CallSession.started_at.desc())
        .limit(10)
    )
    return [
        CallSessionResponse(
            id=s.id,
            client_id=s.client_id,
            client_name=cname,
            user_id=s.user_id,
            phone_number=s.phone_number,
            mood=s.mood,
            outcome=s.outcome,
            notes=s.notes,
            next_step=s.next_step,
            next_step_date=s.next_step_date,
            matched_call_id=s.matched_call_id,
            started_at=str(s.started_at),
            ended_at=str(s.ended_at) if s.ended_at else None,
        )
        for s, cname in result.all()
    ]


@router.get("/client/{client_id}", response_model=list[CallSessionResponse])
async def client_sessions(
    client_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Historique des sessions d'appel pour un client."""
    result = await db.execute(
        select(CallSession, Client.name)
        .outerjoin(Client, Client.id == CallSession.client_id)
        .where(CallSession.client_id == client_id)
        .order_by(CallSession.started_at.desc())
        .limit(50)
    )
    return [
        CallSessionResponse(
            id=s.id,
            client_id=s.client_id,
            client_name=cname,
            user_id=s.user_id,
            phone_number=s.phone_number,
            mood=s.mood,
            outcome=s.outcome,
            notes=s.notes,
            next_step=s.next_step,
            next_step_date=s.next_step_date,
            matched_call_id=s.matched_call_id,
            started_at=str(s.started_at),
            ended_at=str(s.ended_at) if s.ended_at else None,
        )
        for s, cname in result.all()
    ]


@router.delete("/{session_id}")
async def delete_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session = await db.get(CallSession, session_id)
    if not session:
        raise HTTPException(404, "Session introuvable")

    summary = f"{session.mood or ''} / {session.outcome or ''}"
    if session.notes:
        summary += f" — {session.notes[:100]}"

    if session.client_id:
        db.add(ClientAuditLog(
            client_id=session.client_id,
            user_id=user.id,
            user_name=user.name,
            action="feedback_deleted",
            field_name="companion",
            old_value=summary.strip(" /"),
            details=f"Session Companion supprimée ({session.started_at.strftime('%d/%m/%Y %H:%M') if session.started_at else ''})",
        ))

    await db.delete(session)
    await db.commit()
    return {"deleted": True}
