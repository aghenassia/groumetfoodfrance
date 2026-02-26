import uuid
from datetime import date, datetime, timezone
from calendar import monthrange

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user
from models.user import User
from models.user_objective import UserObjective
from models.sales_line import SalesLine
from models.client import Client
from models.margin_rule import MarginRule
from api.margin_rules import rule_applies_to_client

router = APIRouter(prefix="/api/objectives", tags=["objectives"])

METRIC_LABELS = {
    "ca": "Chiffre d'affaires",
    "margin_gross": "Marge brute",
    "margin_net": "Marge nette",
    "quantity_kg": "Quantité (kg)",
    "quantity_units": "Quantité (unités)",
    "avg_basket": "Panier moyen",
    "avg_ca_per_order": "CA moyen / commande",
    "order_count": "Nombre de commandes",
}


class ObjectiveCreate(BaseModel):
    user_id: str
    metric: str
    period_type: str = "monthly"
    target_value: float
    start_date: date | None = None
    end_date: date | None = None


class ObjectiveUpdate(BaseModel):
    target_value: float | None = None
    is_active: bool | None = None
    end_date: date | None = None


class ObjectiveResponse(BaseModel):
    id: str
    user_id: str
    metric: str
    metric_label: str | None = None
    period_type: str
    target_value: float
    start_date: date | None
    end_date: date | None
    is_active: bool
    created_at: datetime | None
    updated_at: datetime | None


def _to_response(obj: UserObjective) -> ObjectiveResponse:
    return ObjectiveResponse(
        id=obj.id,
        user_id=obj.user_id,
        metric=obj.metric,
        metric_label=METRIC_LABELS.get(obj.metric, obj.metric),
        period_type=obj.period_type,
        target_value=float(obj.target_value),
        start_date=obj.start_date,
        end_date=obj.end_date,
        is_active=obj.is_active,
        created_at=obj.created_at,
        updated_at=obj.updated_at,
    )


def _require_admin(user: User):
    if user.role not in ("admin", "manager"):
        raise HTTPException(403, "Admin/manager requis")


@router.get("/metrics")
async def list_metrics(user: User = Depends(get_current_user)):
    return [{"key": k, "label": v} for k, v in METRIC_LABELS.items()]


@router.get("", response_model=list[ObjectiveResponse])
async def list_objectives(
    user_id: str | None = None,
    active_only: bool = True,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(UserObjective)
    if user_id:
        stmt = stmt.where(UserObjective.user_id == user_id)
    if active_only:
        stmt = stmt.where(UserObjective.is_active.is_(True))
    stmt = stmt.order_by(UserObjective.metric)
    result = await db.execute(stmt)
    return [_to_response(o) for o in result.scalars().all()]


@router.post("", response_model=ObjectiveResponse)
async def create_objective(
    body: ObjectiveCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_admin(user)
    if body.metric not in METRIC_LABELS:
        raise HTTPException(400, f"Métrique invalide. Valeurs: {list(METRIC_LABELS.keys())}")
    if body.period_type not in ("monthly", "quarterly", "yearly"):
        raise HTTPException(400, "period_type: monthly, quarterly, yearly")
    obj = UserObjective(
        id=str(uuid.uuid4()),
        user_id=body.user_id,
        metric=body.metric,
        period_type=body.period_type,
        target_value=body.target_value,
        start_date=body.start_date,
        end_date=body.end_date,
    )
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return _to_response(obj)


@router.put("/{obj_id}", response_model=ObjectiveResponse)
async def update_objective(
    obj_id: str,
    body: ObjectiveUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_admin(user)
    obj = await db.get(UserObjective, obj_id)
    if not obj:
        raise HTTPException(404, "Objectif non trouvé")
    if body.target_value is not None:
        obj.target_value = body.target_value
    if body.is_active is not None:
        obj.is_active = body.is_active
    if body.end_date is not None:
        obj.end_date = body.end_date
    obj.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(obj)
    return _to_response(obj)


@router.delete("/{obj_id}")
async def delete_objective(
    obj_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_admin(user)
    obj = await db.get(UserObjective, obj_id)
    if not obj:
        raise HTTPException(404, "Objectif non trouvé")
    await db.delete(obj)
    await db.commit()
    return {"ok": True}


def _period_range(period_type: str, ref_date: date | None = None) -> tuple[date, date]:
    d = ref_date or date.today()
    if period_type == "monthly":
        start = d.replace(day=1)
        _, last_day = monthrange(d.year, d.month)
        end = d.replace(day=last_day)
    elif period_type == "quarterly":
        q_month = ((d.month - 1) // 3) * 3 + 1
        start = date(d.year, q_month, 1)
        end_month = q_month + 2
        _, last_day = monthrange(d.year, end_month)
        end = date(d.year, end_month, last_day)
    else:  # yearly
        start = date(d.year, 1, 1)
        end = date(d.year, 12, 31)
    return start, end


@router.get("/progress")
async def objectives_progress(
    user_id: str,
    ref_date: date | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Progression de tous les objectifs actifs d'un commercial."""
    obj_stmt = select(UserObjective).where(
        UserObjective.user_id == user_id,
        UserObjective.is_active.is_(True),
    )
    objectives = (await db.execute(obj_stmt)).scalars().all()
    if not objectives:
        return []

    rules_result = await db.execute(select(MarginRule))
    all_rules = rules_result.scalars().all()

    results = []
    for obj in objectives:
        start, end = _period_range(obj.period_type, ref_date)

        if obj.metric in ("ca", "margin_gross", "quantity_kg", "quantity_units", "order_count", "avg_basket", "avg_ca_per_order"):
            current = await _compute_simple_metric(db, user_id, obj.metric, start, end)
        elif obj.metric == "margin_net":
            current = await _compute_net_margin(db, user_id, start, end, all_rules)
        else:
            current = 0

        target = float(obj.target_value)
        pct = round((current / target * 100) if target > 0 else 0, 1)

        results.append({
            "id": obj.id,
            "metric": obj.metric,
            "metric_label": METRIC_LABELS.get(obj.metric, obj.metric),
            "period_type": obj.period_type,
            "period_start": start.isoformat(),
            "period_end": end.isoformat(),
            "target_value": target,
            "current_value": round(current, 2),
            "progress_pct": min(pct, 999),
        })

    return results


async def _compute_simple_metric(db: AsyncSession, user_id: str, metric: str, start: date, end: date) -> float:
    base = select(SalesLine).where(
        SalesLine.user_id == user_id,
        SalesLine.date >= start,
        SalesLine.date <= end,
    )

    if metric == "ca":
        stmt = select(func.coalesce(func.sum(SalesLine.amount_ht), 0)).where(
            SalesLine.user_id == user_id, SalesLine.date >= start, SalesLine.date <= end)
        return float((await db.execute(stmt)).scalar())

    elif metric == "margin_gross":
        stmt = select(func.coalesce(func.sum(SalesLine.margin_value), 0)).where(
            SalesLine.user_id == user_id, SalesLine.date >= start, SalesLine.date <= end)
        return float((await db.execute(stmt)).scalar())

    elif metric == "quantity_kg":
        stmt = select(func.coalesce(func.sum(SalesLine.net_weight), 0)).where(
            SalesLine.user_id == user_id, SalesLine.date >= start, SalesLine.date <= end)
        return float((await db.execute(stmt)).scalar()) / 1000  # Sage stores grams

    elif metric == "quantity_units":
        stmt = select(func.coalesce(func.sum(SalesLine.quantity), 0)).where(
            SalesLine.user_id == user_id, SalesLine.date >= start, SalesLine.date <= end)
        return float((await db.execute(stmt)).scalar())

    elif metric == "order_count":
        stmt = select(func.count(func.distinct(SalesLine.sage_piece_id))).where(
            SalesLine.user_id == user_id, SalesLine.date >= start, SalesLine.date <= end)
        return float((await db.execute(stmt)).scalar())

    elif metric in ("avg_basket", "avg_ca_per_order"):
        ca_stmt = select(func.coalesce(func.sum(SalesLine.amount_ht), 0)).where(
            SalesLine.user_id == user_id, SalesLine.date >= start, SalesLine.date <= end)
        total_ca = float((await db.execute(ca_stmt)).scalar())
        count_stmt = select(func.count(func.distinct(SalesLine.sage_piece_id))).where(
            SalesLine.user_id == user_id, SalesLine.date >= start, SalesLine.date <= end)
        count = int((await db.execute(count_stmt)).scalar())
        return total_ca / count if count > 0 else 0

    return 0


async def _compute_net_margin(db: AsyncSession, user_id: str, start: date, end: date, all_rules: list) -> float:
    stmt = (
        select(SalesLine.amount_ht, SalesLine.margin_value, SalesLine.net_weight, SalesLine.date, Client.margin_group)
        .outerjoin(Client, Client.id == SalesLine.client_id)
        .where(SalesLine.user_id == user_id, SalesLine.date >= start, SalesLine.date <= end)
    )
    result = await db.execute(stmt)
    total_net = 0.0
    for row in result.all():
        ca = float(row.amount_ht or 0)
        mg = float(row.margin_value or 0)
        weight_kg = float(row.net_weight or 0) / 1000  # Sage stores grams
        net = mg
        for rule in all_rules:
            if not rule_applies_to_client(rule, row.margin_group, row.date):
                continue
            if rule.calc_type == "per_kg":
                net -= weight_kg * float(rule.value)
            elif rule.calc_type == "percent_ca":
                net -= ca * float(rule.value) / 100
        total_net += net
    return total_net
