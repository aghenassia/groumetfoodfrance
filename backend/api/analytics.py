"""
Analytics API — Briques strategiques pour pilotage CEO/Manager.
Impayes, Produits, Geo, Funnel, IA agregee, Reporting.
"""
from datetime import date, datetime, timedelta, timezone
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func, case, and_, or_, text, desc, asc, distinct, extract
from sqlalchemy.ext.asyncio import AsyncSession
import csv, io, json

from core.database import get_db
from core.security import get_current_user
from models.user import User
from models.sales_line import SalesLine
from models.client import Client
from models.client_score import ClientScore
from models.product import Product
from models.call import Call
from models.ai_analysis import AiAnalysis
from models.qualification import CallQualification
from models.client_audit import ClientAuditLog

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


# ---------------------------------------------------------------------------
# 1. IMPAYES / BALANCE AGEE
# ---------------------------------------------------------------------------

@router.get("/receivables")
async def receivables_dashboard(
    date_from: str | None = None,
    date_to: str | None = None,
    user_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    today = date.today()
    base = select(SalesLine).where(
        SalesLine.sage_doc_type == 6,
        SalesLine.doc_total_ttc.isnot(None),
    )
    if date_from:
        base = base.where(SalesLine.date >= date_from)
    if date_to:
        base = base.where(SalesLine.date <= date_to)
    if user_id:
        base = base.where(SalesLine.user_id == user_id)

    unpaid_q = base.where(
        or_(
            SalesLine.doc_amount_paid.is_(None),
            SalesLine.doc_amount_paid < SalesLine.doc_total_ttc,
        )
    )

    rows = await db.execute(
        select(
            SalesLine.sage_piece_id,
            SalesLine.client_name,
            SalesLine.client_id,
            SalesLine.client_sage_id,
            SalesLine.date,
            SalesLine.sales_rep,
            SalesLine.user_id,
            func.max(SalesLine.doc_total_ttc).label("total_ttc"),
            func.max(SalesLine.doc_amount_paid).label("amount_paid"),
        )
        .where(
            SalesLine.sage_doc_type == 6,
            SalesLine.doc_total_ttc.isnot(None),
            or_(
                SalesLine.doc_amount_paid.is_(None),
                SalesLine.doc_amount_paid < SalesLine.doc_total_ttc,
            ),
            *([SalesLine.date >= date_from] if date_from else []),
            *([SalesLine.date <= date_to] if date_to else []),
            *([SalesLine.user_id == user_id] if user_id else []),
        )
        .group_by(
            SalesLine.sage_piece_id,
            SalesLine.client_name,
            SalesLine.client_id,
            SalesLine.client_sage_id,
            SalesLine.date,
            SalesLine.sales_rep,
            SalesLine.user_id,
        )
        .order_by(SalesLine.date.asc())
    )
    invoices = rows.all()

    buckets = {"current": [], "30": [], "60": [], "90": []}
    total_outstanding = 0.0
    top_debtors: dict[str, dict] = {}

    for inv in invoices:
        ttc = float(inv.total_ttc or 0)
        paid = float(inv.amount_paid or 0)
        remaining = ttc - paid
        if remaining <= 0.01:
            continue
        days_overdue = (today - inv.date).days
        total_outstanding += remaining

        bucket = "current"
        if days_overdue > 90:
            bucket = "90"
        elif days_overdue > 60:
            bucket = "60"
        elif days_overdue > 30:
            bucket = "30"

        entry = {
            "piece_id": inv.sage_piece_id,
            "client_name": inv.client_name,
            "client_id": inv.client_id,
            "date": str(inv.date),
            "days_overdue": days_overdue,
            "total_ttc": round(ttc, 2),
            "amount_paid": round(paid, 2),
            "remaining": round(remaining, 2),
            "sales_rep": inv.sales_rep,
            "bucket": bucket,
        }
        buckets[bucket].append(entry)

        key = inv.client_sage_id or inv.client_name or "unknown"
        if key not in top_debtors:
            top_debtors[key] = {
                "client_name": inv.client_name,
                "client_id": inv.client_id,
                "total_remaining": 0,
                "invoice_count": 0,
                "oldest_date": str(inv.date),
            }
        top_debtors[key]["total_remaining"] += remaining
        top_debtors[key]["invoice_count"] += 1

    all_invoices = buckets["current"] + buckets["30"] + buckets["60"] + buckets["90"]
    sorted_debtors = sorted(top_debtors.values(), key=lambda x: -x["total_remaining"])[:15]

    monthly_q = await db.execute(
        select(
            func.to_char(SalesLine.date, "YYYY-MM").label("month"),
            func.sum(SalesLine.doc_total_ttc - func.coalesce(SalesLine.doc_amount_paid, 0)).label("outstanding"),
        )
        .where(
            SalesLine.sage_doc_type == 6,
            SalesLine.doc_total_ttc.isnot(None),
            or_(
                SalesLine.doc_amount_paid.is_(None),
                SalesLine.doc_amount_paid < SalesLine.doc_total_ttc,
            ),
        )
        .group_by(text("1"))
        .order_by(text("1"))
    )
    monthly_trend = [{"month": r.month, "outstanding": round(float(r.outstanding or 0), 2)} for r in monthly_q.all()]

    return {
        "total_outstanding": round(total_outstanding, 2),
        "invoice_count": len(all_invoices),
        "avg_days_overdue": round(sum(i["days_overdue"] for i in all_invoices) / max(len(all_invoices), 1), 1),
        "buckets": {
            "current": {"count": len(buckets["current"]), "total": round(sum(i["remaining"] for i in buckets["current"]), 2)},
            "over_30": {"count": len(buckets["30"]), "total": round(sum(i["remaining"] for i in buckets["30"]), 2)},
            "over_60": {"count": len(buckets["60"]), "total": round(sum(i["remaining"] for i in buckets["60"]), 2)},
            "over_90": {"count": len(buckets["90"]), "total": round(sum(i["remaining"] for i in buckets["90"]), 2)},
        },
        "top_debtors": sorted_debtors,
        "invoices": sorted(all_invoices, key=lambda x: -x["remaining"]),
        "monthly_trend": monthly_trend,
    }


# ---------------------------------------------------------------------------
# 2. ANALYTICS PRODUITS
# ---------------------------------------------------------------------------

@router.get("/products")
async def products_analytics(
    months: int = Query(default=12, ge=1, le=36),
    date_from: str | None = None,
    date_to: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if date_from and date_to:
        cutoff = date.fromisoformat(date_from)
        end_date = date.fromisoformat(date_to)
    else:
        cutoff = date.today() - timedelta(days=months * 30)
        end_date = date.today()
    prev_cutoff = cutoff - timedelta(days=(end_date - cutoff).days)

    top_q = await db.execute(
        select(
            SalesLine.article_ref,
            func.max(SalesLine.designation).label("designation"),
            func.sum(SalesLine.amount_ht).label("total_ca"),
            func.sum(SalesLine.quantity).label("total_qty"),
            func.avg(SalesLine.margin_percent).label("avg_margin"),
            func.sum(SalesLine.margin_value).label("total_margin"),
            func.count(distinct(SalesLine.client_sage_id)).label("client_count"),
            func.count(distinct(SalesLine.sage_piece_id)).label("order_count"),
        )
        .where(SalesLine.date >= cutoff, SalesLine.sage_doc_type.in_([6, 3]))
        .group_by(SalesLine.article_ref)
        .order_by(desc(func.sum(SalesLine.amount_ht)))
        .limit(50)
    )
    top_products = []
    for r in top_q.all():
        top_products.append({
            "article_ref": r.article_ref,
            "designation": r.designation,
            "total_ca": round(float(r.total_ca or 0), 2),
            "total_qty": round(float(r.total_qty or 0), 2),
            "avg_margin": round(float(r.avg_margin or 0), 1),
            "total_margin": round(float(r.total_margin or 0), 2),
            "client_count": r.client_count,
            "order_count": r.order_count,
        })

    family_q = await db.execute(
        select(
            Product.family_label,
            Product.family,
            func.sum(SalesLine.amount_ht).label("total_ca"),
            func.sum(SalesLine.quantity).label("total_qty"),
            func.avg(SalesLine.margin_percent).label("avg_margin"),
            func.sum(SalesLine.margin_value).label("total_margin"),
            func.count(distinct(SalesLine.article_ref)).label("product_count"),
        )
        .join(Product, Product.article_ref == SalesLine.article_ref, isouter=True)
        .where(SalesLine.date >= cutoff, SalesLine.sage_doc_type.in_([6, 3]))
        .group_by(Product.family_label, Product.family)
        .order_by(desc(func.sum(SalesLine.amount_ht)))
    )
    families = []
    for r in family_q.all():
        families.append({
            "family": r.family,
            "family_label": r.family_label or r.family or "Non classé",
            "total_ca": round(float(r.total_ca or 0), 2),
            "total_qty": round(float(r.total_qty or 0), 2),
            "avg_margin": round(float(r.avg_margin or 0), 1),
            "total_margin": round(float(r.total_margin or 0), 2),
            "product_count": r.product_count,
        })

    monthly_family_q = await db.execute(
        select(
            func.to_char(SalesLine.date, "YYYY-MM").label("month"),
            Product.family_label,
            func.sum(SalesLine.amount_ht).label("ca"),
        )
        .join(Product, Product.article_ref == SalesLine.article_ref, isouter=True)
        .where(SalesLine.date >= cutoff, SalesLine.sage_doc_type.in_([6, 3]))
        .group_by(text("1"), Product.family_label)
        .order_by(text("1"))
    )
    monthly_by_family: dict[str, list] = {}
    for r in monthly_family_q.all():
        fam = r.family_label or "Non classé"
        if fam not in monthly_by_family:
            monthly_by_family[fam] = []
        monthly_by_family[fam].append({"month": r.month, "ca": round(float(r.ca or 0), 2)})

    stock_q = await db.execute(
        select(Product)
        .where(
            Product.is_active == True,
            Product.stock_min.isnot(None),
            Product.stock_available.isnot(None),
            Product.stock_available < Product.stock_min,
        )
        .order_by(asc(Product.stock_available - Product.stock_min))
        .limit(20)
    )
    stock_alerts = []
    for p in stock_q.scalars().all():
        stock_alerts.append({
            "article_ref": p.article_ref,
            "designation": p.designation,
            "stock_available": float(p.stock_available or 0),
            "stock_min": float(p.stock_min or 0),
            "deficit": round(float((p.stock_min or 0) - (p.stock_available or 0)), 2),
        })

    flop_q = await db.execute(
        select(
            SalesLine.article_ref,
            func.max(SalesLine.designation).label("designation"),
            func.sum(SalesLine.amount_ht).label("total_ca"),
            func.avg(SalesLine.margin_percent).label("avg_margin"),
        )
        .where(SalesLine.date >= cutoff, SalesLine.sage_doc_type.in_([6, 3]))
        .group_by(SalesLine.article_ref)
        .having(func.avg(SalesLine.margin_percent) < 10)
        .order_by(asc(func.avg(SalesLine.margin_percent)))
        .limit(20)
    )
    low_margin = []
    for r in flop_q.all():
        low_margin.append({
            "article_ref": r.article_ref,
            "designation": r.designation,
            "total_ca": round(float(r.total_ca or 0), 2),
            "avg_margin": round(float(r.avg_margin or 0), 1),
        })

    return {
        "top_products": top_products,
        "families": families,
        "monthly_by_family": monthly_by_family,
        "stock_alerts": stock_alerts,
        "low_margin_products": low_margin,
    }


# ---------------------------------------------------------------------------
# 3. GEO
# ---------------------------------------------------------------------------

@router.get("/geo")
async def geo_analytics(
    months: int = Query(default=12, ge=1, le=36),
    date_from: str | None = None,
    date_to: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if date_from and date_to:
        cutoff = date.fromisoformat(date_from)
        end_date = date.fromisoformat(date_to)
    else:
        cutoff = date.today() - timedelta(days=months * 30)
        end_date = date.today()

    dept_q = await db.execute(
        select(
            func.left(Client.postal_code, 2).label("dept"),
            func.count(distinct(Client.id)).label("client_count"),
            func.sum(SalesLine.amount_ht).label("total_ca"),
            func.avg(SalesLine.margin_percent).label("avg_margin"),
            func.count(distinct(SalesLine.sage_piece_id)).label("order_count"),
        )
        .join(SalesLine, SalesLine.client_id == Client.id)
        .where(
            Client.postal_code.isnot(None),
            Client.postal_code != "",
            SalesLine.date >= cutoff,
            SalesLine.sage_doc_type.in_([6, 3]),
        )
        .group_by(text("1"))
        .order_by(desc(func.sum(SalesLine.amount_ht)))
    )
    departments = []
    for r in dept_q.all():
        departments.append({
            "dept": r.dept,
            "client_count": r.client_count,
            "total_ca": round(float(r.total_ca or 0), 2),
            "avg_margin": round(float(r.avg_margin or 0), 1),
            "order_count": r.order_count,
        })

    region_q = await db.execute(
        select(
            Client.region,
            func.count(distinct(Client.id)).label("client_count"),
            func.sum(SalesLine.amount_ht).label("total_ca"),
            func.avg(SalesLine.margin_percent).label("avg_margin"),
            func.count(distinct(SalesLine.sage_piece_id)).label("order_count"),
        )
        .join(SalesLine, SalesLine.client_id == Client.id)
        .where(
            Client.region.isnot(None),
            Client.region != "",
            SalesLine.date >= cutoff,
            SalesLine.sage_doc_type.in_([6, 3]),
        )
        .group_by(Client.region)
        .order_by(desc(func.sum(SalesLine.amount_ht)))
    )
    regions = []
    for r in region_q.all():
        regions.append({
            "region": r.region,
            "client_count": r.client_count,
            "total_ca": round(float(r.total_ca or 0), 2),
            "avg_margin": round(float(r.avg_margin or 0), 1),
            "order_count": r.order_count,
        })

    city_q = await db.execute(
        select(
            Client.city,
            Client.postal_code,
            func.count(distinct(Client.id)).label("client_count"),
            func.sum(SalesLine.amount_ht).label("total_ca"),
        )
        .join(SalesLine, SalesLine.client_id == Client.id)
        .where(
            Client.city.isnot(None),
            Client.city != "",
            SalesLine.date >= cutoff,
            SalesLine.sage_doc_type.in_([6, 3]),
        )
        .group_by(Client.city, Client.postal_code)
        .order_by(desc(func.sum(SalesLine.amount_ht)))
        .limit(30)
    )
    top_cities = []
    for r in city_q.all():
        top_cities.append({
            "city": r.city,
            "postal_code": r.postal_code,
            "client_count": r.client_count,
            "total_ca": round(float(r.total_ca or 0), 2),
        })

    no_activity_q = await db.execute(
        select(
            func.left(Client.postal_code, 2).label("dept"),
            func.count(Client.id).label("count"),
        )
        .outerjoin(
            SalesLine,
            and_(SalesLine.client_id == Client.id, SalesLine.date >= cutoff),
        )
        .where(
            Client.postal_code.isnot(None),
            Client.postal_code != "",
            Client.is_prospect == False,
            SalesLine.id.is_(None),
        )
        .group_by(text("1"))
        .order_by(desc(func.count(Client.id)))
        .limit(20)
    )
    dormant_zones = [{"dept": r.dept, "count": r.count} for r in no_activity_q.all()]

    return {
        "departments": departments,
        "regions": regions,
        "top_cities": top_cities,
        "dormant_zones": dormant_zones,
    }


# ---------------------------------------------------------------------------
# 4. FUNNEL / LIFECYCLE / COHORTES
# ---------------------------------------------------------------------------

@router.get("/funnel")
async def funnel_analytics(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    status_q = await db.execute(
        select(Client.status, func.count(Client.id))
        .group_by(Client.status)
    )
    status_counts = {r[0]: r[1] for r in status_q.all()}

    total_prospects = status_counts.get("prospect", 0) + status_counts.get("lead", 0)
    total_clients = status_counts.get("client", 0)
    total_at_risk = status_counts.get("at_risk", 0)
    total_dormant = status_counts.get("dormant", 0)
    total_dead = status_counts.get("dead", 0)

    today = date.today()
    cohorts = []
    for months_ago in range(11, -1, -1):
        cohort_start = date(today.year, today.month, 1) - timedelta(days=months_ago * 30)
        cohort_start = date(cohort_start.year, cohort_start.month, 1)
        if cohort_start.month == 12:
            cohort_end = date(cohort_start.year + 1, 1, 1)
        else:
            cohort_end = date(cohort_start.year, cohort_start.month + 1, 1)

        acquired_q = await db.execute(
            select(func.count(Client.id))
            .where(
                Client.sage_created_at >= cohort_start,
                Client.sage_created_at < cohort_end,
                Client.is_prospect == False,
            )
        )
        acquired = acquired_q.scalar() or 0

        still_active_q = await db.execute(
            select(func.count(distinct(SalesLine.client_id)))
            .join(Client, Client.id == SalesLine.client_id)
            .where(
                Client.sage_created_at >= cohort_start,
                Client.sage_created_at < cohort_end,
                SalesLine.date >= today - timedelta(days=90),
                SalesLine.sage_doc_type.in_([6, 3]),
            )
        )
        still_active = still_active_q.scalar() or 0

        cohorts.append({
            "month": cohort_start.strftime("%Y-%m"),
            "acquired": acquired,
            "still_active": still_active,
            "retention_pct": round(still_active / max(acquired, 1) * 100, 1),
        })

    ltv_q = await db.execute(
        select(
            func.avg(ClientScore.total_revenue_all).label("avg_ltv"),
            func.percentile_cont(0.5).within_group(ClientScore.total_revenue_all).label("median_ltv"),
            func.avg(ClientScore.avg_basket).label("avg_basket"),
            func.avg(ClientScore.avg_frequency_days).label("avg_freq"),
        )
        .where(ClientScore.order_count_total > 0)
    )
    ltv_row = ltv_q.one_or_none()

    churn_monthly_q = await db.execute(
        select(
            func.to_char(ClientAuditLog.created_at, "YYYY-MM").label("month"),
            func.count(ClientAuditLog.id).label("count"),
        )
        .where(
            ClientAuditLog.field_name == "status",
            ClientAuditLog.new_value.in_(["dormant", "dead"]),
        )
        .group_by(text("1"))
        .order_by(text("1"))
    )
    churn_trend = [{"month": r.month, "lost": r.count} for r in churn_monthly_q.all()]

    new_clients_monthly_q = await db.execute(
        select(
            func.to_char(Client.sage_created_at, "YYYY-MM").label("month"),
            func.count(Client.id).label("count"),
        )
        .where(Client.sage_created_at.isnot(None), Client.is_prospect == False)
        .group_by(text("1"))
        .order_by(text("1"))
    )
    new_clients_trend = [{"month": r.month, "new": r.count} for r in new_clients_monthly_q.all()][-12:]

    return {
        "funnel": {
            "prospects": total_prospects,
            "clients": total_clients,
            "at_risk": total_at_risk,
            "dormant": total_dormant,
            "dead": total_dead,
        },
        "cohorts": cohorts,
        "ltv": {
            "avg": round(float(ltv_row.avg_ltv or 0), 2) if ltv_row else 0,
            "median": round(float(ltv_row.median_ltv or 0), 2) if ltv_row else 0,
            "avg_basket": round(float(ltv_row.avg_basket or 0), 2) if ltv_row else 0,
            "avg_frequency_days": round(float(ltv_row.avg_freq or 0), 1) if ltv_row else 0,
        },
        "churn_trend": churn_trend,
        "new_clients_trend": new_clients_trend,
    }


# ---------------------------------------------------------------------------
# 5. IA AGREGEE
# ---------------------------------------------------------------------------

@router.get("/ai-insights")
async def ai_insights(
    months: int = Query(default=6, ge=1, le=24),
    date_from: str | None = None,
    date_to: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if date_from and date_to:
        cutoff = datetime.combine(date.fromisoformat(date_from), datetime.min.time(), tzinfo=timezone.utc)
        end_dt = datetime.combine(date.fromisoformat(date_to), datetime.max.time(), tzinfo=timezone.utc)
    else:
        cutoff = datetime.now(timezone.utc) - timedelta(days=months * 30)
        end_dt = datetime.now(timezone.utc)

    sentiment_q = await db.execute(
        select(
            func.to_char(AiAnalysis.analyzed_at, "YYYY-MM").label("month"),
            AiAnalysis.client_sentiment,
            func.count(AiAnalysis.id).label("cnt"),
        )
        .where(AiAnalysis.analyzed_at >= cutoff, AiAnalysis.is_voicemail == False)
        .group_by(text("1"), AiAnalysis.client_sentiment)
        .order_by(text("1"))
    )
    sentiment_by_month: dict[str, dict] = {}
    for r in sentiment_q.all():
        m = r.month
        if m not in sentiment_by_month:
            sentiment_by_month[m] = {"month": m, "positive": 0, "neutral": 0, "negative": 0, "total": 0}
        s = (r.client_sentiment or "neutral").lower()
        if "pos" in s or "satisf" in s:
            sentiment_by_month[m]["positive"] += r.cnt
        elif "neg" in s or "insatisf" in s or "mecont" in s:
            sentiment_by_month[m]["negative"] += r.cnt
        else:
            sentiment_by_month[m]["neutral"] += r.cnt
        sentiment_by_month[m]["total"] += r.cnt
    sentiment_trend = list(sentiment_by_month.values())

    score_q = await db.execute(
        select(
            func.to_char(AiAnalysis.analyzed_at, "YYYY-MM").label("month"),
            func.avg(AiAnalysis.overall_score).label("avg_score"),
            func.avg(AiAnalysis.politeness_score).label("politeness"),
            func.avg(AiAnalysis.objection_handling).label("objection"),
            func.avg(AiAnalysis.closing_attempt).label("closing"),
            func.avg(AiAnalysis.product_knowledge).label("product"),
            func.avg(AiAnalysis.listening_quality).label("listening"),
            func.count(AiAnalysis.id).label("total"),
        )
        .where(AiAnalysis.analyzed_at >= cutoff, AiAnalysis.is_voicemail == False, AiAnalysis.overall_score.isnot(None))
        .group_by(text("1"))
        .order_by(text("1"))
    )
    quality_trend = []
    for r in score_q.all():
        quality_trend.append({
            "month": r.month,
            "avg_score": round(float(r.avg_score or 0), 1),
            "politeness": round(float(r.politeness or 0), 1),
            "objection": round(float(r.objection or 0), 1),
            "closing": round(float(r.closing or 0), 1),
            "product": round(float(r.product or 0), 1),
            "listening": round(float(r.listening or 0), 1),
            "total_calls": r.total,
        })

    per_rep_q = await db.execute(
        select(
            Call.user_name,
            Call.user_id,
            func.avg(AiAnalysis.overall_score).label("avg_score"),
            func.count(AiAnalysis.id).label("call_count"),
        )
        .join(AiAnalysis, AiAnalysis.call_id == Call.id)
        .where(AiAnalysis.analyzed_at >= cutoff, AiAnalysis.is_voicemail == False, AiAnalysis.overall_score.isnot(None))
        .group_by(Call.user_name, Call.user_id)
        .order_by(desc(func.avg(AiAnalysis.overall_score)))
    )
    quality_by_rep = []
    for r in per_rep_q.all():
        quality_by_rep.append({
            "user_name": r.user_name,
            "user_id": r.user_id,
            "avg_score": round(float(r.avg_score or 0), 1),
            "call_count": r.call_count,
        })

    opps_q = await db.execute(
        select(
            AiAnalysis.id,
            AiAnalysis.detected_opportunities,
            AiAnalysis.client_sentiment,
            Call.contact_name,
            Call.user_name,
            Call.client_id,
            Client.name.label("client_name"),
            AiAnalysis.analyzed_at,
        )
        .join(Call, Call.id == AiAnalysis.call_id)
        .outerjoin(Client, Client.id == Call.client_id)
        .where(
            AiAnalysis.analyzed_at >= cutoff,
            AiAnalysis.detected_opportunities.isnot(None),
            AiAnalysis.detected_opportunities != "",
        )
        .order_by(desc(AiAnalysis.analyzed_at))
        .limit(30)
    )
    opportunities = []
    for r in opps_q.all():
        opportunities.append({
            "id": r.id,
            "opportunity": r.detected_opportunities,
            "sentiment": r.client_sentiment,
            "client_name": r.client_name,
            "client_id": r.client_id,
            "contact_name": r.contact_name,
            "user_name": r.user_name,
            "date": r.analyzed_at.strftime("%Y-%m-%d") if r.analyzed_at else None,
        })

    topics_q = await db.execute(
        select(AiAnalysis.key_topics)
        .where(AiAnalysis.analyzed_at >= cutoff, AiAnalysis.key_topics.isnot(None))
    )
    topic_counts: dict[str, int] = {}
    for (topics_raw,) in topics_q.all():
        if isinstance(topics_raw, list):
            for t in topics_raw:
                label = str(t).strip().lower()
                if label:
                    topic_counts[label] = topic_counts.get(label, 0) + 1
        elif isinstance(topics_raw, dict):
            for k in topics_raw:
                label = str(k).strip().lower()
                if label:
                    topic_counts[label] = topic_counts.get(label, 0) + 1
    top_topics = sorted(topic_counts.items(), key=lambda x: -x[1])[:20]

    # KPIs globaux appels
    call_kpis_q = await db.execute(
        select(
            func.count(Call.id).label("total_calls"),
            func.count(case((Call.is_answered == True, 1))).label("answered"),
            func.count(case((Call.direction == "outbound", 1))).label("outbound"),
            func.count(case((Call.direction == "inbound", 1))).label("inbound"),
            func.sum(Call.incall_duration).label("total_duration"),
            func.avg(case((Call.is_answered == True, Call.incall_duration))).label("avg_duration"),
        )
        .where(Call.start_time >= cutoff, Call.start_time <= end_dt)
    )
    ck = call_kpis_q.one()

    analyzed_count_q = await db.execute(
        select(func.count(AiAnalysis.id))
        .where(AiAnalysis.analyzed_at >= cutoff, AiAnalysis.analyzed_at <= end_dt, AiAnalysis.is_voicemail == False)
    )
    analyzed_count = analyzed_count_q.scalar() or 0

    qual_outcome_q = await db.execute(
        select(
            CallQualification.outcome,
            func.count(CallQualification.id).label("cnt"),
        )
        .where(CallQualification.qualified_at >= cutoff, CallQualification.qualified_at <= end_dt)
        .group_by(CallQualification.outcome)
    )
    qualification_outcomes = {r.outcome: r.cnt for r in qual_outcome_q.all()}

    qual_mood_q = await db.execute(
        select(
            CallQualification.mood,
            func.count(CallQualification.id).label("cnt"),
        )
        .where(CallQualification.qualified_at >= cutoff, CallQualification.qualified_at <= end_dt)
        .group_by(CallQualification.mood)
    )
    mood_distribution = {r.mood: r.cnt for r in qual_mood_q.all()}

    avg_scores_q = await db.execute(
        select(
            func.avg(AiAnalysis.overall_score).label("overall"),
            func.avg(AiAnalysis.politeness_score).label("politeness"),
            func.avg(AiAnalysis.objection_handling).label("objection"),
            func.avg(AiAnalysis.closing_attempt).label("closing"),
            func.avg(AiAnalysis.product_knowledge).label("product"),
            func.avg(AiAnalysis.listening_quality).label("listening"),
        )
        .where(AiAnalysis.analyzed_at >= cutoff, AiAnalysis.analyzed_at <= end_dt, AiAnalysis.is_voicemail == False, AiAnalysis.overall_score.isnot(None))
    )
    avg_s = avg_scores_q.one()

    return {
        "call_kpis": {
            "total_calls": ck.total_calls or 0,
            "answered": ck.answered or 0,
            "outbound": ck.outbound or 0,
            "inbound": ck.inbound or 0,
            "pickup_rate": round((ck.answered or 0) / max(ck.total_calls or 1, 1) * 100, 1),
            "total_duration_min": round(float(ck.total_duration or 0) / 60, 0),
            "avg_duration_sec": round(float(ck.avg_duration or 0), 0),
            "analyzed_count": analyzed_count,
        },
        "avg_scores": {
            "overall": round(float(avg_s.overall or 0), 1),
            "politeness": round(float(avg_s.politeness or 0), 1),
            "objection": round(float(avg_s.objection or 0), 1),
            "closing": round(float(avg_s.closing or 0), 1),
            "product": round(float(avg_s.product or 0), 1),
            "listening": round(float(avg_s.listening or 0), 1),
        },
        "qualification_outcomes": qualification_outcomes,
        "mood_distribution": mood_distribution,
        "sentiment_trend": sentiment_trend,
        "quality_trend": quality_trend,
        "quality_by_rep": quality_by_rep,
        "opportunities": opportunities,
        "top_topics": [{"topic": t, "count": c} for t, c in top_topics],
    }


# ---------------------------------------------------------------------------
# 6. REPORTING / EXPORTS
# ---------------------------------------------------------------------------

@router.get("/summary")
async def global_summary(
    date_from: str | None = None,
    date_to: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """KPIs globaux avec comparaison N vs N-1."""
    today = date.today()
    if date_from and date_to:
        d_from = date.fromisoformat(date_from)
        d_to = date.fromisoformat(date_to)
    else:
        d_from = date(today.year, today.month, 1)
        d_to = today

    period_days = (d_to - d_from).days or 1
    prev_from = d_from - timedelta(days=period_days)
    prev_to = d_from - timedelta(days=1)

    async def _period_kpis(start: date, end: date):
        q = await db.execute(
            select(
                func.sum(SalesLine.amount_ht).label("ca"),
                func.count(distinct(SalesLine.sage_piece_id)).label("orders"),
                func.count(distinct(SalesLine.client_sage_id)).label("clients"),
                func.avg(SalesLine.margin_percent).label("margin"),
                func.sum(SalesLine.margin_value).label("margin_total"),
                func.sum(SalesLine.quantity).label("qty"),
            )
            .where(SalesLine.date >= start, SalesLine.date <= end, SalesLine.sage_doc_type.in_([6, 3]))
        )
        r = q.one()
        calls_q = await db.execute(
            select(func.count(Call.id)).where(Call.start_time >= datetime.combine(start, datetime.min.time(), tzinfo=timezone.utc), Call.start_time <= datetime.combine(end, datetime.max.time(), tzinfo=timezone.utc))
        )
        return {
            "ca": round(float(r.ca or 0), 2),
            "orders": r.orders or 0,
            "clients": r.clients or 0,
            "avg_margin": round(float(r.margin or 0), 1),
            "total_margin": round(float(r.margin_total or 0), 2),
            "total_qty": round(float(r.qty or 0), 2),
            "calls": calls_q.scalar() or 0,
        }

    current = await _period_kpis(d_from, d_to)
    previous = await _period_kpis(prev_from, prev_to)

    def pct_change(cur, prev):
        if not prev:
            return None
        return round((cur - prev) / abs(prev) * 100, 1)

    return {
        "period": {"from": str(d_from), "to": str(d_to)},
        "current": current,
        "previous": previous,
        "evolution": {
            "ca": pct_change(current["ca"], previous["ca"]),
            "orders": pct_change(current["orders"], previous["orders"]),
            "clients": pct_change(current["clients"], previous["clients"]),
            "margin": pct_change(current["avg_margin"], previous["avg_margin"]),
            "calls": pct_change(current["calls"], previous["calls"]),
        },
    }


@router.get("/export/clients")
async def export_clients(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = await db.execute(
        select(
            Client.sage_id, Client.name, Client.city, Client.region,
            Client.postal_code, Client.phone, Client.email, Client.sales_rep,
            Client.status, Client.client_type, Client.client_subtype,
            Client.tariff_category,
            ClientScore.total_revenue_all, ClientScore.total_revenue_12m,
            ClientScore.order_count_total, ClientScore.order_count_12m,
            ClientScore.avg_basket, ClientScore.avg_margin_percent,
            ClientScore.churn_risk_score, ClientScore.upsell_score,
            ClientScore.last_order_date, ClientScore.days_since_last_order,
        )
        .outerjoin(ClientScore, ClientScore.client_id == Client.id)
        .order_by(Client.name)
    )
    rows = q.all()

    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow([
        "Code Sage", "Nom", "Ville", "Region", "CP", "Tel", "Email",
        "Commercial", "Statut", "Type", "Sous-type", "Cat. Tarif",
        "CA Total", "CA 12m", "Cdes Total", "Cdes 12m",
        "Panier Moy", "Marge Moy %", "Risque Churn", "Score Upsell",
        "Derniere Cde", "Jours depuis",
    ])
    for r in rows:
        w.writerow([
            r.sage_id, r.name, r.city, r.region, r.postal_code,
            r.phone, r.email, r.sales_rep, r.status,
            r.client_type, r.client_subtype, r.tariff_category,
            r.total_revenue_all, r.total_revenue_12m,
            r.order_count_total, r.order_count_12m,
            r.avg_basket, r.avg_margin_percent,
            r.churn_risk_score, r.upsell_score,
            r.last_order_date, r.days_since_last_order,
        ])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=clients_export_{date.today()}.csv"},
    )


@router.get("/export/products")
async def export_products(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = await db.execute(select(Product).order_by(Product.article_ref))
    products = q.scalars().all()

    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow([
        "Ref", "Designation", "Famille", "Sous-famille", "Unite",
        "Prix Vente", "Prix Achat", "Poids", "Actif",
        "Stock Dispo", "Stock Min", "Stock Max", "Valeur Stock",
    ])
    for p in products:
        w.writerow([
            p.article_ref, p.designation, p.family_label or p.family,
            p.sub_family, p.unit, p.sale_price, p.cost_price, p.weight,
            "Oui" if p.is_active else "Non",
            p.stock_available, p.stock_min, p.stock_max, p.stock_value,
        ])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=produits_export_{date.today()}.csv"},
    )
