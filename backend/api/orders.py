"""
Historique global des commandes — toutes pièces commerciales.
"""
from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, distinct, case, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user
from models.user import User
from models.sales_line import SalesLine
from models.client import Client

router = APIRouter(prefix="/api/orders", tags=["orders"])

DOC_TYPE_LABEL = case(
    (SalesLine.sage_doc_type == 1, "BC"),
    (SalesLine.sage_doc_type == 3, "BL"),
    (SalesLine.sage_doc_type == 6, "FA"),
    (SalesLine.sage_doc_type == 7, "AV"),
    else_="Autre",
)


@router.get("")
async def list_orders(
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    search: str | None = None,
    doc_type: str | None = Query(default=None, description="BC,BL,FA,AV ou combinaison"),
    date_from: str | None = None,
    date_to: str | None = None,
    user_id: str | None = Query(default=None, description="Filtrer par commercial (user_id)"),
    sort_by: str = Query(default="date", pattern="^(date|ca|client|type)$"),
    sort_dir: str = Query(default="desc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Liste paginée de toutes les pièces commerciales."""

    type_map = {"BC": 1, "BL": 3, "FA": 6, "AV": 7}
    filters = []

    if doc_type:
        selected_types = [type_map[t.strip().upper()] for t in doc_type.split(",") if t.strip().upper() in type_map]
        if selected_types:
            filters.append(SalesLine.sage_doc_type.in_(selected_types))

    if date_from:
        filters.append(SalesLine.date >= date.fromisoformat(date_from))
    if date_to:
        filters.append(SalesLine.date <= date.fromisoformat(date_to))

    if user_id and user_id != "all":
        target = await db.get(User, user_id)
        if target:
            filters.append(
                or_(SalesLine.user_id == target.id, SalesLine.sales_rep == target.name)
            )

    base = (
        select(
            SalesLine.sage_piece_id,
            SalesLine.date,
            func.coalesce(func.max(Client.name), func.max(SalesLine.client_name)).label("client_name"),
            func.max(Client.id).label("client_id"),
            func.max(SalesLine.client_sage_id).label("client_sage_id"),
            func.sum(SalesLine.amount_ht).label("total_ht"),
            func.count(SalesLine.id).label("nb_lines"),
            func.count(distinct(SalesLine.article_ref)).label("nb_articles"),
            func.sum(SalesLine.quantity).label("total_qty"),
            func.avg(SalesLine.margin_percent).label("avg_margin"),
            func.max(DOC_TYPE_LABEL).label("doc_type"),
            func.max(SalesLine.sage_doc_type).label("doc_type_raw"),
            func.max(SalesLine.sales_rep).label("sales_rep"),
        )
        .outerjoin(Client, Client.sage_id == SalesLine.client_sage_id)
        .group_by(SalesLine.sage_piece_id, SalesLine.date)
    )

    if filters:
        base = base.where(*filters)

    if search:
        pattern = f"%{search}%"
        pieces_with_article = (
            select(SalesLine.sage_piece_id)
            .where(
                or_(
                    SalesLine.article_ref.ilike(pattern),
                    SalesLine.designation.ilike(pattern),
                )
            )
            .distinct()
        )
        base = base.having(
            or_(
                SalesLine.sage_piece_id.ilike(pattern),
                func.coalesce(func.max(Client.name), func.max(SalesLine.client_name)).ilike(pattern),
                SalesLine.sage_piece_id.in_(pieces_with_article),
            )
        )

    count_q = await db.execute(select(func.count()).select_from(base.subquery()))
    total = count_q.scalar() or 0

    agg_subq = base.subquery()
    summary_q = await db.execute(
        select(
            func.coalesce(func.sum(agg_subq.c.total_ht), 0),
            func.count(),
            func.count(distinct(agg_subq.c.client_sage_id)),
            func.avg(agg_subq.c.avg_margin),
        )
    )
    summary_row = summary_q.one()

    sort_col = {
        "date": SalesLine.date,
        "ca": func.sum(SalesLine.amount_ht),
        "client": func.coalesce(func.max(Client.name), func.max(SalesLine.client_name)),
        "type": func.max(SalesLine.sage_doc_type),
    }.get(sort_by, SalesLine.date)

    if sort_dir == "asc":
        base = base.order_by(sort_col.asc())
    else:
        base = base.order_by(sort_col.desc())

    base = base.offset(offset).limit(limit)
    result = await db.execute(base)

    orders = [
        {
            "piece_id": r.sage_piece_id,
            "date": str(r.date) if r.date else None,
            "client_name": r.client_name or "Inconnu",
            "client_id": r.client_id,
            "client_sage_id": r.client_sage_id,
            "total_ht": round(float(r.total_ht or 0), 2),
            "nb_lines": r.nb_lines,
            "nb_articles": r.nb_articles,
            "total_qty": round(float(r.total_qty or 0), 2),
            "avg_margin": round(float(r.avg_margin), 1) if r.avg_margin else None,
            "doc_type": r.doc_type,
            "doc_type_raw": r.doc_type_raw,
            "sales_rep": r.sales_rep,
        }
        for r in result.all()
    ]

    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "summary": {
            "total_ca": round(float(summary_row[0]), 2),
            "total_orders": summary_row[1],
            "total_clients": summary_row[2],
            "avg_margin": round(float(summary_row[3]), 1) if summary_row[3] else None,
        },
        "orders": orders,
    }
