import uuid
from datetime import date, datetime, timezone
from calendar import monthrange

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func, distinct, or_
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user
from models.user import User
from models.user_objective import UserObjective
from models.sales_line import SalesLine
from models.client import Client
from models.product import Product
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
    "client_count": "Nombre de clients",
}


class ObjectiveCreate(BaseModel):
    user_id: str
    metric: str
    period_type: str = "monthly"
    target_value: float
    start_date: date | None = None
    end_date: date | None = None
    filter_client_category: str | None = None
    filter_region: str | None = None
    filter_product_family: str | None = None


class ObjectiveUpdate(BaseModel):
    target_value: float | None = None
    is_active: bool | None = None
    end_date: date | None = None
    filter_client_category: str | None = None
    filter_region: str | None = None
    filter_product_family: str | None = None


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
    filter_client_category: str | None = None
    filter_region: str | None = None
    filter_product_family: str | None = None
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
        filter_client_category=obj.filter_client_category,
        filter_region=obj.filter_region,
        filter_product_family=obj.filter_product_family,
        created_at=obj.created_at,
        updated_at=obj.updated_at,
    )


def _require_admin(user: User):
    if user.role not in ("admin", "manager"):
        raise HTTPException(403, "Admin/manager requis")


@router.get("/metrics")
async def list_metrics(user: User = Depends(get_current_user)):
    return [{"key": k, "label": v} for k, v in METRIC_LABELS.items()]


@router.get("/filters")
async def list_filter_options(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Returns distinct values for client categories, regions, product families."""
    cat_q = await db.execute(
        select(distinct(Client.tariff_category))
        .where(Client.tariff_category.isnot(None), Client.tariff_category != "")
        .order_by(Client.tariff_category)
    )
    region_q = await db.execute(
        select(distinct(Client.region))
        .where(Client.region.isnot(None), Client.region != "")
        .order_by(Client.region)
    )
    family_q = await db.execute(
        select(distinct(Product.family_label))
        .where(Product.family_label.isnot(None), Product.family_label != "")
        .order_by(Product.family_label)
    )
    return {
        "client_categories": [r[0] for r in cat_q.all()],
        "regions": [r[0] for r in region_q.all()],
        "product_families": [r[0] for r in family_q.all()],
    }


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
    if body.period_type not in ("monthly", "quarterly", "yearly", "custom"):
        raise HTTPException(400, "period_type: monthly, quarterly, yearly, custom")
    if body.period_type == "custom" and not body.start_date:
        raise HTTPException(400, "start_date requis pour period_type=custom")

    obj = UserObjective(
        id=str(uuid.uuid4()),
        user_id=body.user_id,
        metric=body.metric,
        period_type=body.period_type,
        target_value=body.target_value,
        start_date=body.start_date,
        end_date=body.end_date,
        filter_client_category=body.filter_client_category or None,
        filter_region=body.filter_region or None,
        filter_product_family=body.filter_product_family or None,
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
    if body.filter_client_category is not None:
        obj.filter_client_category = body.filter_client_category or None
    if body.filter_region is not None:
        obj.filter_region = body.filter_region or None
    if body.filter_product_family is not None:
        obj.filter_product_family = body.filter_product_family or None
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


def _period_range(period_type: str, ref_date: date | None = None,
                  start: date | None = None, end: date | None = None) -> tuple[date, date]:
    if period_type == "custom" and start:
        if end:
            return start, end
        _, last_day = monthrange(start.year, start.month)
        return start, date(start.year, start.month, last_day)

    d = ref_date or date.today()
    if period_type == "monthly":
        s = d.replace(day=1)
        _, last_day = monthrange(d.year, d.month)
        return s, d.replace(day=last_day)
    elif period_type == "quarterly":
        q_month = ((d.month - 1) // 3) * 3 + 1
        s = date(d.year, q_month, 1)
        end_month = q_month + 2
        _, last_day = monthrange(d.year, end_month)
        return s, date(d.year, end_month, last_day)
    else:  # yearly
        return date(d.year, 1, 1), date(d.year, 12, 31)


def _apply_filters(stmt, obj: UserObjective):
    """Add WHERE clauses for objective filters (client category, region, product family)."""
    if obj.filter_client_category:
        stmt = stmt.where(Client.tariff_category == obj.filter_client_category)
    if obj.filter_region:
        stmt = stmt.where(or_(
            Client.region == obj.filter_region,
            Client.city.ilike(f"%{obj.filter_region}%"),
        ))
    if obj.filter_product_family:
        stmt = stmt.join(Product, Product.sage_ref == SalesLine.article_ref).where(
            or_(
                Product.family_label == obj.filter_product_family,
                Product.family == obj.filter_product_family,
            )
        )
    return stmt


def _has_filters(obj: UserObjective) -> bool:
    return bool(obj.filter_client_category or obj.filter_region or obj.filter_product_family)


def _base_filtered(user_id: str, start: date, end: date, obj: UserObjective):
    """Build base query with user/date/filter conditions, joining Client when needed."""
    needs_client = bool(obj.filter_client_category or obj.filter_region)
    stmt = select(SalesLine)
    if needs_client:
        stmt = stmt.join(Client, Client.id == SalesLine.client_id)
    stmt = stmt.where(
        SalesLine.user_id == user_id,
        SalesLine.date >= start,
        SalesLine.date <= end,
    )
    if needs_client:
        if obj.filter_client_category:
            stmt = stmt.where(Client.tariff_category == obj.filter_client_category)
        if obj.filter_region:
            stmt = stmt.where(or_(
                Client.region == obj.filter_region,
                Client.city.ilike(f"%{obj.filter_region}%"),
            ))
    if obj.filter_product_family:
        stmt = stmt.join(Product, Product.sage_ref == SalesLine.article_ref).where(
            or_(
                Product.family_label == obj.filter_product_family,
                Product.family == obj.filter_product_family,
            )
        )
    return stmt


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
        start, end = _period_range(obj.period_type, ref_date, obj.start_date, obj.end_date)

        if obj.metric == "margin_net":
            current = await _compute_net_margin(db, user_id, start, end, all_rules, obj)
        else:
            current = await _compute_metric(db, user_id, obj.metric, start, end, obj)

        target = float(obj.target_value)
        pct = round((current / target * 100) if target > 0 else 0, 1)

        filter_tags = []
        if obj.filter_client_category:
            filter_tags.append(f"Cat: {obj.filter_client_category}")
        if obj.filter_region:
            filter_tags.append(f"Rég: {obj.filter_region}")
        if obj.filter_product_family:
            filter_tags.append(f"Fam: {obj.filter_product_family}")

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
            "filter_tags": filter_tags,
        })

    return results


async def _compute_metric(db: AsyncSession, user_id: str, metric: str,
                          start: date, end: date, obj: UserObjective) -> float:
    has_f = _has_filters(obj)
    needs_client = bool(obj.filter_client_category or obj.filter_region)

    def _build_base():
        q = select(SalesLine)
        if needs_client:
            q = q.join(Client, Client.id == SalesLine.client_id)
        q = q.where(SalesLine.user_id == user_id, SalesLine.date >= start, SalesLine.date <= end)
        if obj.filter_client_category:
            q = q.where(Client.tariff_category == obj.filter_client_category)
        if obj.filter_region:
            q = q.where(or_(Client.region == obj.filter_region, Client.city.ilike(f"%{obj.filter_region}%")))
        if obj.filter_product_family:
            q = q.join(Product, Product.sage_ref == SalesLine.article_ref).where(
                or_(Product.family_label == obj.filter_product_family, Product.family == obj.filter_product_family))
        return q

    if metric == "ca":
        base = _build_base().with_only_columns(func.coalesce(func.sum(SalesLine.amount_ht), 0))
        return float((await db.execute(base)).scalar())

    elif metric == "margin_gross":
        base = _build_base().with_only_columns(func.coalesce(func.sum(SalesLine.margin_value), 0))
        return float((await db.execute(base)).scalar())

    elif metric == "quantity_kg":
        base = _build_base().with_only_columns(func.coalesce(func.sum(SalesLine.net_weight), 0))
        return float((await db.execute(base)).scalar()) / 1000

    elif metric == "quantity_units":
        base = _build_base().with_only_columns(func.coalesce(func.sum(SalesLine.quantity), 0))
        return float((await db.execute(base)).scalar())

    elif metric == "order_count":
        base = _build_base().with_only_columns(func.count(distinct(SalesLine.sage_piece_id)))
        return float((await db.execute(base)).scalar())

    elif metric == "client_count":
        base = _build_base().with_only_columns(func.count(distinct(SalesLine.client_sage_id)))
        return float((await db.execute(base)).scalar())

    elif metric in ("avg_basket", "avg_ca_per_order"):
        ca_base = _build_base().with_only_columns(func.coalesce(func.sum(SalesLine.amount_ht), 0))
        total_ca = float((await db.execute(ca_base)).scalar())
        cnt_base = _build_base().with_only_columns(func.count(distinct(SalesLine.sage_piece_id)))
        count = int((await db.execute(cnt_base)).scalar())
        return total_ca / count if count > 0 else 0

    return 0


async def _compute_net_margin(db: AsyncSession, user_id: str, start: date, end: date,
                              all_rules: list, obj: UserObjective) -> float:
    needs_client = bool(obj.filter_client_category or obj.filter_region)

    base = select(
        SalesLine.amount_ht, SalesLine.margin_value, SalesLine.net_weight,
        SalesLine.date, SalesLine.article_ref, Client.margin_group
    ).outerjoin(Client, Client.id == SalesLine.client_id).where(
        SalesLine.user_id == user_id, SalesLine.date >= start, SalesLine.date <= end
    )
    if obj.filter_client_category:
        base = base.where(Client.tariff_category == obj.filter_client_category)
    if obj.filter_region:
        base = base.where(or_(Client.region == obj.filter_region, Client.city.ilike(f"%{obj.filter_region}%")))
    if obj.filter_product_family:
        base = base.join(Product, Product.sage_ref == SalesLine.article_ref).where(
            or_(Product.family_label == obj.filter_product_family, Product.family == obj.filter_product_family))

    result = await db.execute(base)
    total_net = 0.0
    for row in result.all():
        ca = float(row.amount_ht or 0)
        mg = float(row.margin_value or 0)
        weight_kg = float(row.net_weight or 0) / 1000
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
