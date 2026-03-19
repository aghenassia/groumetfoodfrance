import uuid
from datetime import date
from calendar import monthrange

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func, distinct, or_
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user
from models.user import User
from models.client import Client
from models.client_objective import ClientObjective
from models.sales_line import SalesLine
from models.product import Product
from models.margin_rule import MarginRule
from api.margin_rules import rule_applies_to_client

router = APIRouter(prefix="/api/clients", tags=["client-objectives"])

METRIC_LABELS = {
    "ca": "Chiffre d'affaires",
    "margin_gross": "Marge brute",
    "margin_net": "Marge nette",
    "quantity_kg": "Quantité (kg)",
    "quantity_units": "Quantité (unités)",
    "avg_basket": "Panier moyen",
    "order_count": "Nombre de commandes",
}


class ClientObjectiveCreate(BaseModel):
    metric: str
    year: int
    annual_target: float
    monthly_targets: dict[str, float]
    filter_product_family: str | None = None


class ClientObjectiveUpdate(BaseModel):
    annual_target: float | None = None
    monthly_targets: dict[str, float] | None = None
    is_active: bool | None = None


@router.get("/{client_id}/objectives")
async def list_client_objectives(
    client_id: str,
    year: int | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(ClientObjective).where(
        ClientObjective.client_id == client_id,
        ClientObjective.is_active == True,
    )
    if year:
        stmt = stmt.where(ClientObjective.year == year)
    stmt = stmt.order_by(ClientObjective.year.desc(), ClientObjective.metric)
    result = await db.execute(stmt)
    objectives = result.scalars().all()

    return [
        {
            "id": o.id,
            "client_id": o.client_id,
            "metric": o.metric,
            "metric_label": METRIC_LABELS.get(o.metric, o.metric),
            "year": o.year,
            "annual_target": float(o.annual_target),
            "monthly_targets": o.monthly_targets,
            "filter_product_family": o.filter_product_family,
            "is_active": o.is_active,
            "created_at": o.created_at.isoformat() if o.created_at else None,
        }
        for o in objectives
    ]


@router.post("/{client_id}/objectives")
async def create_client_objective(
    client_id: str,
    body: ClientObjectiveCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if body.metric not in METRIC_LABELS:
        raise HTTPException(400, f"Métrique inconnue: {body.metric}")

    expected_keys = {f"{m:02d}" for m in range(1, 13)}
    if set(body.monthly_targets.keys()) != expected_keys:
        raise HTTPException(400, "monthly_targets doit contenir les clés 01 à 12")

    existing = await db.execute(
        select(ClientObjective).where(
            ClientObjective.client_id == client_id,
            ClientObjective.metric == body.metric,
            ClientObjective.year == body.year,
            ClientObjective.filter_product_family == body.filter_product_family,
            ClientObjective.is_active == True,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Un objectif actif existe déjà pour ce client/métrique/année/famille")

    obj = ClientObjective(
        id=str(uuid.uuid4()),
        client_id=client_id,
        metric=body.metric,
        year=body.year,
        annual_target=body.annual_target,
        monthly_targets=body.monthly_targets,
        filter_product_family=body.filter_product_family,
        created_by=user.id,
    )
    db.add(obj)
    await db.commit()
    await db.refresh(obj)

    return {
        "id": obj.id,
        "client_id": obj.client_id,
        "metric": obj.metric,
        "metric_label": METRIC_LABELS.get(obj.metric, obj.metric),
        "year": obj.year,
        "annual_target": float(obj.annual_target),
        "monthly_targets": obj.monthly_targets,
        "filter_product_family": obj.filter_product_family,
        "is_active": obj.is_active,
    }


@router.put("/{client_id}/objectives/{obj_id}")
async def update_client_objective(
    client_id: str,
    obj_id: str,
    body: ClientObjectiveUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ClientObjective).where(
            ClientObjective.id == obj_id,
            ClientObjective.client_id == client_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(404, "Objectif introuvable")

    if body.annual_target is not None:
        obj.annual_target = body.annual_target
    if body.monthly_targets is not None:
        expected_keys = {f"{m:02d}" for m in range(1, 13)}
        if set(body.monthly_targets.keys()) != expected_keys:
            raise HTTPException(400, "monthly_targets doit contenir les clés 01 à 12")
        obj.monthly_targets = body.monthly_targets
    if body.is_active is not None:
        obj.is_active = body.is_active

    await db.commit()
    return {"ok": True}


@router.delete("/{client_id}/objectives/{obj_id}")
async def delete_client_objective(
    client_id: str,
    obj_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ClientObjective).where(
            ClientObjective.id == obj_id,
            ClientObjective.client_id == client_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(404, "Objectif introuvable")

    await db.delete(obj)
    await db.commit()
    return {"ok": True}


@router.get("/{client_id}/objectives/progress")
async def client_objective_progress(
    client_id: str,
    year: int | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    target_year = year or date.today().year

    client_q = await db.execute(select(Client).where(Client.id == client_id))
    client = client_q.scalar_one_or_none()
    if not client:
        raise HTTPException(404, "Client introuvable")

    stmt = select(ClientObjective).where(
        ClientObjective.client_id == client_id,
        ClientObjective.year == target_year,
        ClientObjective.is_active == True,
    )
    objectives = (await db.execute(stmt)).scalars().all()

    all_rules = None
    results = []

    for obj in objectives:
        months_data = []
        annual_actual = 0.0
        today = date.today()
        current_month = today.month if target_year == today.year else 12
        ytd_target = 0.0
        ytd_actual = 0.0

        for m in range(1, 13):
            mk = f"{m:02d}"
            m_start = date(target_year, m, 1)
            m_end = date(target_year, m, monthrange(target_year, m)[1])

            month_target = float(obj.monthly_targets.get(mk, 0))

            if obj.metric == "margin_net":
                if all_rules is None:
                    rq = await db.execute(select(MarginRule).where(MarginRule.is_active == True))
                    all_rules = rq.scalars().all()
                actual = await _compute_client_net_margin(
                    db, client, m_start, m_end, obj.filter_product_family, all_rules
                )
            else:
                actual = await _compute_client_metric(
                    db, client, obj.metric, m_start, m_end, obj.filter_product_family
                )

            pct = round(actual / month_target * 100, 1) if month_target > 0 else 0
            months_data.append({
                "month": mk,
                "target": month_target,
                "actual": round(actual, 2),
                "pct": min(pct, 999),
            })

            annual_actual += actual
            if m <= current_month:
                ytd_target += month_target
                ytd_actual += actual

        annual_target = float(obj.annual_target)
        annual_pct = round(annual_actual / annual_target * 100, 1) if annual_target > 0 else 0
        ytd_pct = round(ytd_actual / ytd_target * 100, 1) if ytd_target > 0 else 0

        results.append({
            "id": obj.id,
            "metric": obj.metric,
            "metric_label": METRIC_LABELS.get(obj.metric, obj.metric),
            "year": obj.year,
            "annual_target": annual_target,
            "annual_actual": round(annual_actual, 2),
            "annual_pct": min(annual_pct, 999),
            "filter_product_family": obj.filter_product_family,
            "monthly_targets": obj.monthly_targets,
            "months": months_data,
            "ytd_target": round(ytd_target, 2),
            "ytd_actual": round(ytd_actual, 2),
            "ytd_pct": min(ytd_pct, 999),
        })

    return results


async def _compute_client_metric(
    db: AsyncSession, client: Client, metric: str,
    start: date, end: date, product_family: str | None,
) -> float:
    def _base():
        q = select(SalesLine).where(
            SalesLine.client_sage_id == client.sage_id,
            SalesLine.date >= start,
            SalesLine.date <= end,
        )
        if product_family:
            q = q.join(Product, Product.sage_ref == SalesLine.article_ref).where(
                or_(Product.family_label == product_family, Product.family == product_family)
            )
        return q

    if metric == "ca":
        q = _base().with_only_columns(func.coalesce(func.sum(SalesLine.amount_ht), 0))
        return float((await db.execute(q)).scalar())

    elif metric == "margin_gross":
        q = _base().with_only_columns(func.coalesce(func.sum(SalesLine.margin_value), 0))
        return float((await db.execute(q)).scalar())

    elif metric == "quantity_kg":
        q = _base().with_only_columns(func.coalesce(func.sum(SalesLine.net_weight), 0))
        return float((await db.execute(q)).scalar()) / 1000

    elif metric == "quantity_units":
        q = _base().with_only_columns(func.coalesce(func.sum(SalesLine.quantity), 0))
        return float((await db.execute(q)).scalar())

    elif metric == "order_count":
        q = _base().with_only_columns(func.count(distinct(SalesLine.sage_piece_id)))
        return float((await db.execute(q)).scalar())

    elif metric in ("avg_basket",):
        ca_q = _base().with_only_columns(func.coalesce(func.sum(SalesLine.amount_ht), 0))
        total_ca = float((await db.execute(ca_q)).scalar())
        cnt_q = _base().with_only_columns(func.count(distinct(SalesLine.sage_piece_id)))
        count = int((await db.execute(cnt_q)).scalar())
        return total_ca / count if count > 0 else 0

    return 0


async def _compute_client_net_margin(
    db: AsyncSession, client: Client,
    start: date, end: date, product_family: str | None,
    all_rules: list,
) -> float:
    q = select(
        SalesLine.amount_ht, SalesLine.margin_value, SalesLine.net_weight,
        SalesLine.date, SalesLine.article_ref,
    ).where(
        SalesLine.client_sage_id == client.sage_id,
        SalesLine.date >= start,
        SalesLine.date <= end,
    )
    if product_family:
        q = q.join(Product, Product.sage_ref == SalesLine.article_ref).where(
            or_(Product.family_label == product_family, Product.family == product_family)
        )

    result = await db.execute(q)
    margin_group = getattr(client, "margin_group", None)
    total_net = 0.0
    for row in result.all():
        ca = float(row.amount_ht or 0)
        mg = float(row.margin_value or 0)
        weight_kg = float(row.net_weight or 0) / 1000
        net = mg
        for rule in all_rules:
            if not rule_applies_to_client(rule, margin_group, row.date):
                continue
            if rule.calc_type == "per_kg":
                net -= weight_kg * float(rule.value)
            elif rule.calc_type == "percent_ca":
                net -= ca * float(rule.value) / 100
        total_net += net
    return total_net
