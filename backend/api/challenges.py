import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user
from models.user import User
from models.challenge import Challenge, ChallengeRanking
from models.sales_line import SalesLine

router = APIRouter(prefix="/api/challenges", tags=["challenges"])


class ChallengeCreate(BaseModel):
    name: str
    description: str | None = None
    article_ref: str | None = None
    article_name: str | None = None
    metric: str  # quantity_kg, quantity_units, ca, margin_gross
    target_value: float | None = None
    reward: str | None = None
    start_date: date
    end_date: date
    status: str = "draft"


class ChallengeUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    target_value: float | None = None
    reward: str | None = None
    status: str | None = None
    end_date: date | None = None


class ChallengeResponse(BaseModel):
    id: str
    name: str
    description: str | None
    article_ref: str | None
    article_name: str | None
    metric: str
    target_value: float | None
    reward: str | None = None
    start_date: date
    end_date: date
    status: str
    created_by: str
    creator_name: str | None = None
    created_at: datetime | None
    updated_at: datetime | None


class RankingEntry(BaseModel):
    user_id: str
    user_name: str
    current_value: float
    rank: int
    progress_pct: float | None = None


METRIC_AGG = {
    "quantity_kg": SalesLine.net_weight,
    "quantity_units": SalesLine.quantity,
    "ca": SalesLine.amount_ht,
    "margin_gross": SalesLine.margin_value,
}


def _require_admin(user: User):
    if user.role not in ("admin", "manager"):
        raise HTTPException(403, "Admin/manager requis")


@router.get("", response_model=list[ChallengeResponse])
async def list_challenges(
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = (
        select(Challenge, User.name.label("creator_name"))
        .outerjoin(User, User.id == Challenge.created_by)
        .order_by(Challenge.start_date.desc())
    )
    if status:
        stmt = stmt.where(Challenge.status == status)
    result = await db.execute(stmt)
    out = []
    for row in result.all():
        ch = row[0]
        out.append(ChallengeResponse(
            id=ch.id, name=ch.name, description=ch.description,
            article_ref=ch.article_ref, article_name=ch.article_name,
            metric=ch.metric, target_value=float(ch.target_value) if ch.target_value else None,
            reward=ch.reward,
            start_date=ch.start_date, end_date=ch.end_date, status=ch.status,
            created_by=ch.created_by, creator_name=row[1],
            created_at=ch.created_at, updated_at=ch.updated_at,
        ))
    return out


@router.post("", response_model=ChallengeResponse)
async def create_challenge(
    body: ChallengeCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_admin(user)
    if body.metric not in METRIC_AGG:
        raise HTTPException(400, f"Métrique invalide. Valeurs: {list(METRIC_AGG.keys())}")
    ch = Challenge(
        id=str(uuid.uuid4()),
        name=body.name,
        description=body.description,
        article_ref=body.article_ref,
        article_name=body.article_name,
        metric=body.metric,
        target_value=body.target_value,
        reward=body.reward,
        start_date=body.start_date,
        end_date=body.end_date,
        status=body.status,
        created_by=user.id,
    )
    db.add(ch)
    await db.commit()
    await db.refresh(ch)
    return ChallengeResponse(
        id=ch.id, name=ch.name, description=ch.description,
        article_ref=ch.article_ref, article_name=ch.article_name,
        metric=ch.metric, target_value=float(ch.target_value) if ch.target_value else None,
        reward=ch.reward,
        start_date=ch.start_date, end_date=ch.end_date, status=ch.status,
        created_by=ch.created_by, creator_name=user.name,
        created_at=ch.created_at, updated_at=ch.updated_at,
    )


@router.put("/{challenge_id}", response_model=ChallengeResponse)
async def update_challenge(
    challenge_id: str,
    body: ChallengeUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_admin(user)
    ch = await db.get(Challenge, challenge_id)
    if not ch:
        raise HTTPException(404, "Challenge non trouvé")
    if body.name is not None:
        ch.name = body.name
    if body.description is not None:
        ch.description = body.description
    if body.target_value is not None:
        ch.target_value = body.target_value
    if body.reward is not None:
        ch.reward = body.reward
    if body.status is not None:
        ch.status = body.status
    if body.end_date is not None:
        ch.end_date = body.end_date
    ch.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(ch)
    creator_name = (await db.execute(select(User.name).where(User.id == ch.created_by))).scalar()
    return ChallengeResponse(
        id=ch.id, name=ch.name, description=ch.description,
        article_ref=ch.article_ref, article_name=ch.article_name,
        metric=ch.metric, target_value=float(ch.target_value) if ch.target_value else None,
        reward=ch.reward,
        start_date=ch.start_date, end_date=ch.end_date, status=ch.status,
        created_by=ch.created_by, creator_name=creator_name,
        created_at=ch.created_at, updated_at=ch.updated_at,
    )


@router.delete("/{challenge_id}")
async def delete_challenge(
    challenge_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_admin(user)
    ch = await db.get(Challenge, challenge_id)
    if not ch:
        raise HTTPException(404, "Challenge non trouvé")
    await db.delete(ch)
    await db.commit()
    return {"ok": True}


@router.get("/{challenge_id}/ranking", response_model=list[RankingEntry])
async def challenge_ranking(
    challenge_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ch = await db.get(Challenge, challenge_id)
    if not ch:
        raise HTTPException(404, "Challenge non trouvé")

    agg_col = METRIC_AGG.get(ch.metric)
    if agg_col is None:
        raise HTTPException(400, "Métrique non supportée")

    stmt = (
        select(SalesLine.user_id, User.name, func.coalesce(func.sum(agg_col), 0).label("total"))
        .outerjoin(User, User.id == SalesLine.user_id)
        .where(SalesLine.date >= ch.start_date, SalesLine.date <= ch.end_date)
    )
    if ch.article_ref:
        stmt = stmt.where(SalesLine.article_ref == ch.article_ref)
    stmt = stmt.where(SalesLine.user_id.isnot(None))
    stmt = stmt.group_by(SalesLine.user_id, User.name).order_by(func.sum(agg_col).desc())

    result = await db.execute(stmt)
    rows = result.all()

    rankings = []
    for i, row in enumerate(rows):
        val = float(row[2])
        if ch.metric == "quantity_kg":
            val /= 1000  # Sage stores grams
        pct = None
        if ch.target_value and float(ch.target_value) > 0:
            pct = round(val / float(ch.target_value) * 100, 1)
        rankings.append(RankingEntry(
            user_id=row[0],
            user_name=row[1] or "Inconnu",
            current_value=round(val, 2),
            rank=i + 1,
            progress_pct=pct,
        ))

    # Persist rankings
    await db.execute(
        ChallengeRanking.__table__.delete().where(ChallengeRanking.challenge_id == challenge_id)
    )
    for r in rankings:
        db.add(ChallengeRanking(
            id=str(uuid.uuid4()),
            challenge_id=challenge_id,
            user_id=r.user_id,
            current_value=r.current_value,
            rank=r.rank,
        ))
    await db.commit()

    return rankings
