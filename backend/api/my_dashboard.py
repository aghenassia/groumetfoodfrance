"""
Dashboard personnel du commercial.
Endpoints filtrable par période pour CA, appels, scores.
"""
from datetime import date, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, distinct, case, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user
from models.user import User
from models.call import Call
from models.sales_line import SalesLine
from models.client import Client
from models.client_score import ClientScore
from models.qualification import CallQualification
from models.ai_analysis import AiAnalysis
from models.margin_rule import MarginRule

router = APIRouter(prefix="/api/me", tags=["my-dashboard"])


def _user_calls_filter(user: User):
    """Filtre appels pour un utilisateur (user_id ou fallback nom)."""
    return or_(Call.user_id == user.id, Call.user_name == user.name)


def _user_sales_filter(user: User):
    """Filtre ventes pour un utilisateur (user_id ou fallback sage_rep_name)."""
    conditions = [SalesLine.user_id == user.id]
    if user.sage_rep_name:
        conditions.append(SalesLine.sales_rep == user.sage_rep_name)
    return or_(*conditions)


def _user_clients_filter(user: User):
    """Filtre clients assignés à un utilisateur."""
    conditions = [Client.assigned_user_id == user.id]
    if user.sage_rep_name:
        conditions.append(Client.sales_rep == user.sage_rep_name)
    return or_(*conditions)


@router.get("/stats")
async def my_stats(
    date_from: str | None = None,
    date_to: str | None = None,
    user_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """KPIs personnels. Admin peut filtrer par user_id."""
    target_user = user
    if user_id and user_id not in (user.id, "all"):
        if user.role in ("admin", "manager"):
            found = await db.get(User, user_id)
            if found:
                target_user = found

    today = date.today()
    d_from = date.fromisoformat(date_from) if date_from else today.replace(day=1)
    d_to = date.fromisoformat(date_to) if date_to else today

    prev_length = (d_to - d_from).days + 1
    prev_from = d_from - timedelta(days=prev_length)
    prev_to = d_from - timedelta(days=1)

    calls_filter = _user_calls_filter(target_user)
    sales_filter = _user_sales_filter(target_user)

    # --- Call stats current period ---
    call_q = await db.execute(
        select(
            func.count(Call.id),
            func.count(case((Call.is_answered == True, 1))),
            func.count(case((Call.direction == "OUT", 1))),
            func.coalesce(func.sum(Call.incall_duration), 0),
            func.count(case((and_(Call.is_answered == False, Call.direction.in_(["in", "inbound", "IN"])), 1))),
            func.count(case((and_(Call.is_answered == False, Call.direction.in_(["out", "outbound", "OUT"])), 1))),
        )
        .where(
            calls_filter,
            func.date(Call.start_time) >= d_from,
            func.date(Call.start_time) <= d_to,
        )
    )
    cr = call_q.one()

    qualif_q = await db.execute(
        select(func.count(CallQualification.id))
        .join(Call, Call.id == CallQualification.call_id)
        .where(
            calls_filter,
            func.date(Call.start_time) >= d_from,
            func.date(Call.start_time) <= d_to,
        )
    )
    qualified = qualif_q.scalar() or 0

    ai_q = await db.execute(
        select(func.avg(AiAnalysis.overall_score))
        .join(Call, Call.id == AiAnalysis.call_id)
        .where(
            calls_filter,
            func.date(Call.start_time) >= d_from,
            func.date(Call.start_time) <= d_to,
        )
    )
    avg_ai = ai_q.scalar()

    # --- Sales stats current period ---
    sales_q = await db.execute(
        select(
            func.coalesce(func.sum(SalesLine.amount_ht), 0),
            func.count(distinct(SalesLine.sage_piece_id)),
            func.count(distinct(SalesLine.client_sage_id)),
            func.coalesce(func.avg(SalesLine.margin_percent), 0),
        )
        .where(
            sales_filter,
            SalesLine.date >= d_from,
            SalesLine.date <= d_to,
        )
    )
    sr = sales_q.one()

    # --- Sales stats previous period ---
    prev_sales_q = await db.execute(
        select(func.coalesce(func.sum(SalesLine.amount_ht), 0))
        .where(
            sales_filter,
            SalesLine.date >= prev_from,
            SalesLine.date <= prev_to,
        )
    )
    prev_ca = float(prev_sales_q.scalar() or 0)

    current_ca = float(sr[0])
    ca_evolution = 0.0
    if prev_ca > 0:
        ca_evolution = round(((current_ca - prev_ca) / prev_ca) * 100, 1)

    # --- Monthly CA (last 12 months) ---
    from sqlalchemy import func as sqlfunc
    month_label = sqlfunc.to_char(SalesLine.date, "YYYY-MM")
    monthly_q = await db.execute(
        select(
            month_label.label("month"),
            func.sum(SalesLine.amount_ht).label("ca"),
            func.count(distinct(SalesLine.sage_piece_id)).label("orders"),
        )
        .where(
            sales_filter,
            SalesLine.date >= today - timedelta(days=365),
        )
        .group_by(month_label)
        .order_by(month_label)
    )
    monthly = [
        {"month": r[0], "ca": float(r[1]), "orders": r[2]}
        for r in monthly_q.all()
    ]

    target = float(user.target_ca_monthly) if user.target_ca_monthly else None
    target_progress = None
    if target and target > 0:
        target_progress = round((current_ca / target) * 100, 1)

    return {
        "period": {"from": str(d_from), "to": str(d_to)},
        "calls": {
            "total": cr[0] or 0,
            "answered": cr[1] or 0,
            "outbound": cr[2] or 0,
            "total_duration": cr[3] or 0,
            "missed": cr[4] or 0,
            "no_answer": cr[5] or 0,
            "qualified": qualified,
            "avg_duration": round(cr[3] / cr[1], 0) if cr[1] else 0,
            "answer_rate": round(cr[1] / cr[0] * 100, 1) if cr[0] else 0,
        },
        "sales": {
            "ca": current_ca,
            "orders": sr[1] or 0,
            "clients": sr[2] or 0,
            "avg_basket": round(current_ca / sr[1], 2) if sr[1] else 0,
            "avg_margin": round(float(sr[3]), 1) if sr[3] else 0,
            "ca_evolution_pct": ca_evolution,
            "prev_ca": prev_ca,
        },
        "ai_score": round(float(avg_ai), 1) if avg_ai else None,
        "target": {
            "monthly": target,
            "progress_pct": target_progress,
        },
        "monthly_ca": monthly,
    }


@router.get("/clients")
async def my_clients(
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Clients du commercial connecté."""
    clients_filter = _user_clients_filter(user)

    total_q = await db.execute(
        select(func.count(Client.id)).where(clients_filter)
    )
    total = total_q.scalar() or 0

    result = await db.execute(
        select(Client, ClientScore)
        .outerjoin(ClientScore, ClientScore.client_id == Client.id)
        .where(clients_filter)
        .order_by(ClientScore.total_revenue_all.desc().nulls_last())
        .offset(offset)
        .limit(limit)
    )

    clients = []
    for row in result.all():
        c, s = row
        clients.append({
            "id": c.id,
            "name": c.name,
            "city": c.city,
            "sage_id": c.sage_id,
            "phone": c.phone,
            "total_ca": float(s.total_revenue_all) if s and s.total_revenue_all else 0,
            "last_order_date": str(s.last_order_date) if s and s.last_order_date else None,
            "churn_risk": s.churn_risk_score if s else 0,
            "order_count": s.order_count_total if s else 0,
        })

    return {"total": total, "clients": clients}


@router.get("/top-products")
async def my_top_products(
    limit: int = Query(default=10, le=30),
    date_from: date | None = None,
    date_to: date | None = None,
    user_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Top produits vendus, filtrable par dates et user."""
    target_user = user
    if user_id and user_id not in (user.id, "all"):
        if user.role in ("admin", "manager"):
            found = await db.get(User, user_id)
            if found:
                target_user = found

    filters = []
    if user_id != "all":
        filters.append(_user_sales_filter(target_user))
    filters.append(SalesLine.article_ref != None)
    if date_from:
        filters.append(SalesLine.date >= date_from)
    if date_to:
        filters.append(SalesLine.date <= date_to)

    result = await db.execute(
        select(
            SalesLine.article_ref,
            func.max(SalesLine.designation).label("designation"),
            func.sum(SalesLine.amount_ht).label("total_ca"),
            func.sum(SalesLine.quantity).label("total_qty"),
            func.count(distinct(SalesLine.client_sage_id)).label("nb_clients"),
            func.count(distinct(SalesLine.sage_piece_id)).label("nb_orders"),
        )
        .where(*filters)
        .group_by(SalesLine.article_ref)
        .order_by(func.sum(SalesLine.amount_ht).desc())
        .limit(limit)
    )

    return [
        {
            "article_ref": r[0],
            "designation": r[1],
            "total_ca": float(r[2]) if r[2] else 0,
            "total_qty": float(r[3]) if r[3] else 0,
            "nb_clients": r[4],
            "nb_orders": r[5],
        }
        for r in result.all()
    ]


@router.get("/top-clients")
async def my_top_clients(
    limit: int = Query(default=10, le=30),
    date_from: date | None = None,
    date_to: date | None = None,
    user_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Top clients par CA, filtrable par dates et user."""
    target_user = user
    if user_id and user_id not in (user.id, "all"):
        if user.role in ("admin", "manager"):
            found = await db.get(User, user_id)
            if found:
                target_user = found

    filters = []
    if user_id != "all":
        filters.append(_user_sales_filter(target_user))
    if date_from:
        filters.append(SalesLine.date >= date_from)
    if date_to:
        filters.append(SalesLine.date <= date_to)

    result = await db.execute(
        select(
            SalesLine.client_id,
            func.max(Client.name).label("client_name"),
            func.sum(SalesLine.amount_ht).label("total_ca"),
            func.sum(SalesLine.margin_value).label("total_margin"),
            func.count(distinct(SalesLine.sage_piece_id)).label("nb_orders"),
            func.count(distinct(SalesLine.article_ref)).label("nb_products"),
        )
        .outerjoin(Client, Client.id == SalesLine.client_id)
        .where(SalesLine.client_id.isnot(None), *filters)
        .group_by(SalesLine.client_id)
        .order_by(func.sum(SalesLine.amount_ht).desc())
        .limit(limit)
    )

    return [
        {
            "client_id": r[0],
            "client_name": r[1] or "Inconnu",
            "total_ca": float(r[2]) if r[2] else 0,
            "total_margin": float(r[3]) if r[3] else 0,
            "nb_orders": r[4],
            "nb_products": r[5],
        }
        for r in result.all()
    ]


@router.get("/margins")
async def my_margins(
    date_from: date | None = None,
    date_to: date | None = None,
    user_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Marges brute et nette sur la période. Admin peut filtrer par user_id."""
    from api.margin_rules import rule_applies_to_client

    target_user = user
    if user_id and user_id != user.id:
        if user.role not in ("admin", "manager"):
            from fastapi import HTTPException
            raise HTTPException(403, "Admin requis pour voir les marges d'un autre utilisateur")
        target_user = await db.get(User, user_id)
        if not target_user:
            from fastapi import HTTPException
            raise HTTPException(404, "Utilisateur non trouvé")

    rules_result = await db.execute(select(MarginRule))
    all_rules = rules_result.scalars().all()

    base_filter = _user_sales_filter(target_user) if user_id != "all" else True
    stmt = (
        select(
            SalesLine.amount_ht,
            SalesLine.margin_value,
            SalesLine.net_weight,
            SalesLine.date,
            Client.margin_group,
        )
        .outerjoin(Client, Client.id == SalesLine.client_id)
    )
    if user_id != "all":
        stmt = stmt.where(base_filter)
    if date_from:
        stmt = stmt.where(SalesLine.date >= date_from)
    if date_to:
        stmt = stmt.where(SalesLine.date <= date_to)

    result = await db.execute(stmt)

    total_ca = 0.0
    total_margin_gross = 0.0
    total_margin_net = 0.0
    total_weight = 0.0

    for row in result.all():
        ca = float(row.amount_ht or 0)
        mg = float(row.margin_value or 0)
        weight_kg = float(row.net_weight or 0) / 1000  # Sage stores grams
        total_ca += ca
        total_margin_gross += mg
        total_weight += weight_kg

        net = mg
        for rule in all_rules:
            if not rule_applies_to_client(rule, row.margin_group, row.date):
                continue
            if rule.calc_type == "per_kg":
                net -= weight_kg * float(rule.value)
            elif rule.calc_type == "percent_ca":
                net -= ca * float(rule.value) / 100
        total_margin_net += net

    margin_gross_pct = (total_margin_gross / total_ca * 100) if total_ca > 0 else 0
    margin_net_pct = (total_margin_net / total_ca * 100) if total_ca > 0 else 0

    return {
        "total_ca": round(total_ca, 2),
        "total_margin_gross": round(total_margin_gross, 2),
        "total_margin_net": round(total_margin_net, 2),
        "margin_gross_pct": round(margin_gross_pct, 1),
        "margin_net_pct": round(margin_net_pct, 1),
        "total_weight_kg": round(total_weight, 1),
    }
