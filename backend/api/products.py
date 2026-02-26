from datetime import date, datetime
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func, distinct, case, and_
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user
from models.user import User
from models.product import Product
from models.product_stock_depot import ProductStockDepot
from models.sales_line import SalesLine
from models.client import Client

router = APIRouter(prefix="/api/products", tags=["products"])


class ProductResponse(BaseModel):
    id: str
    article_ref: str
    designation: str | None = None
    family: str | None = None
    sub_family: str | None = None
    unit: str | None = None
    sale_price: float | None = None
    cost_price: float | None = None
    weight: float | None = None
    is_active: bool = True
    stock_quantity: float | None = None
    stock_reserved: float | None = None
    stock_ordered: float | None = None
    stock_preparing: float | None = None
    stock_available: float | None = None
    stock_forecast: float | None = None
    stock_min: float | None = None
    stock_max: float | None = None
    stock_value: float | None = None
    stock_synced_at: datetime | None = None

    model_config = {"from_attributes": True}


class ProductListItem(ProductResponse):
    total_ca: float | None = None
    total_qty: float | None = None
    nb_clients: int | None = None
    nb_orders: int | None = None
    last_sale_date: date | None = None
    avg_margin_percent: float | None = None


class StockDepotItem(BaseModel):
    depot_id: int
    depot_name: str | None = None
    stock_quantity: float | None = None
    stock_reserved: float | None = None
    stock_ordered: float | None = None
    stock_preparing: float | None = None
    stock_available: float | None = None
    stock_min: float | None = None
    stock_max: float | None = None
    stock_value: float | None = None
    synced_at: datetime | None = None

    model_config = {"from_attributes": True}


class ProductDetail(ProductListItem):
    top_clients: list[dict] = []
    monthly_sales: list[dict] = []
    co_purchased: list[dict] = []
    stock_depots: list[StockDepotItem] = []


class OrderDetail(BaseModel):
    sage_piece_id: str
    date: date
    client_sage_id: str
    client_name: str | None = None
    client_id: str | None = None
    total_ht: float = 0
    lines: list[dict] = []


@router.get("")
async def list_products(
    search: str | None = None,
    family: str | None = None,
    sort_by: str = Query(default="ca", pattern="^(name|ref|ca|qty|clients|orders|last_sale|margin|stock)$"),
    sort_dir: str = Query(default="desc", pattern="^(asc|desc)$"),
    has_sales: bool | None = None,
    stock_filter: str | None = Query(default=None, pattern="^(in_stock|low|out|no_data)$"),
    limit: int = Query(default=50, le=500),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    base = (
        select(
            Product,
            func.coalesce(func.sum(SalesLine.amount_ht), 0).label("total_ca"),
            func.coalesce(func.sum(SalesLine.quantity), 0).label("total_qty"),
            func.count(distinct(SalesLine.client_sage_id)).label("nb_clients"),
            func.count(distinct(SalesLine.sage_piece_id)).label("nb_orders"),
            func.max(SalesLine.date).label("last_sale_date"),
            func.avg(SalesLine.margin_percent).label("avg_margin"),
        )
        .outerjoin(SalesLine, SalesLine.article_ref == Product.article_ref)
        .group_by(Product.id)
    )

    if search:
        pattern = f"%{search}%"
        base = base.having(
            Product.designation.ilike(pattern)
            | Product.article_ref.ilike(pattern)
            | Product.family.ilike(pattern)
        )

    if family:
        base = base.having(Product.family == family)

    if has_sales is True:
        base = base.having(func.count(SalesLine.id) > 0)
    elif has_sales is False:
        base = base.having(func.count(SalesLine.id) == 0)

    if stock_filter == "in_stock":
        base = base.where(Product.stock_available > 0)
    elif stock_filter == "low":
        base = base.where(
            Product.stock_available != None,
            Product.stock_min != None,
            Product.stock_available <= Product.stock_min,
            Product.stock_available > 0,
        )
    elif stock_filter == "out":
        base = base.where(Product.stock_available != None, Product.stock_available <= 0)
    elif stock_filter == "no_data":
        base = base.where(Product.stock_available == None)

    sort_map = {
        "name": Product.designation,
        "ref": Product.article_ref,
        "ca": func.coalesce(func.sum(SalesLine.amount_ht), 0),
        "qty": func.coalesce(func.sum(SalesLine.quantity), 0),
        "clients": func.count(distinct(SalesLine.client_sage_id)),
        "orders": func.count(distinct(SalesLine.sage_piece_id)),
        "last_sale": func.max(SalesLine.date),
        "margin": func.avg(SalesLine.margin_percent),
        "stock": Product.stock_available,
    }
    from sqlalchemy import asc, desc, nulls_last
    sort_col = sort_map.get(sort_by, func.sum(SalesLine.amount_ht))
    order_fn = desc if sort_dir == "desc" else asc
    order_clause = nulls_last(order_fn(sort_col))

    count_sub = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_sub)).scalar() or 0

    stmt = base.order_by(order_clause).offset(offset).limit(limit)
    result = await db.execute(stmt)
    rows = result.all()

    items = []
    for row in rows:
        product = row[0]
        item = ProductListItem.model_validate(product)
        item.total_ca = float(row[1]) if row[1] else 0
        item.total_qty = float(row[2]) if row[2] else 0
        item.nb_clients = row[3] or 0
        item.nb_orders = row[4] or 0
        item.last_sale_date = row[5]
        item.avg_margin_percent = round(float(row[6]), 1) if row[6] else None
        items.append(item)

    return {"total": total, "offset": offset, "limit": limit, "products": items}


@router.get("/orders/{sage_piece_id}")
async def get_order_detail(
    sage_piece_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Détail d'une commande/facture avec toutes ses lignes."""
    lines_q = await db.execute(
        select(SalesLine)
        .where(SalesLine.sage_piece_id == sage_piece_id)
        .order_by(SalesLine.designation)
    )
    lines = lines_q.scalars().all()
    if not lines:
        raise HTTPException(status_code=404, detail="Commande introuvable")

    first = lines[0]
    client_q = await db.execute(
        select(Client.id, Client.name).where(Client.sage_id == first.client_sage_id)
    )
    client_row = client_q.first()

    return {
        "sage_piece_id": sage_piece_id,
        "date": str(first.date),
        "client_sage_id": first.client_sage_id,
        "client_name": first.client_name or (client_row[1] if client_row else None),
        "client_id": client_row[0] if client_row else first.client_id,
        "total_ht": sum(float(l.amount_ht or 0) for l in lines),
        "lines": [
            {
                "article_ref": l.article_ref,
                "designation": l.designation,
                "quantity": float(l.quantity) if l.quantity else None,
                "unit_price": float(l.unit_price) if l.unit_price else None,
                "amount_ht": float(l.amount_ht),
                "margin_percent": float(l.margin_percent) if l.margin_percent else None,
                "margin_value": float(l.margin_value) if l.margin_value else None,
                "net_weight": float(l.net_weight) if l.net_weight else None,
            }
            for l in lines
        ],
    }


@router.get("/upsell/{client_id}")
async def product_upsell(
    client_id: str,
    limit: int = Query(default=10, le=30),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Suggestions d'upsell pour un client.
    Algo : trouve les produits que les clients similaires achètent
    mais que ce client n'a jamais acheté.
    """
    client_q = await db.execute(select(Client.sage_id).where(Client.id == client_id))
    client_sage = client_q.scalar_one_or_none()
    if not client_sage:
        raise HTTPException(status_code=404, detail="Client introuvable")

    client_products = await db.execute(
        select(distinct(SalesLine.article_ref)).where(
            SalesLine.client_sage_id == client_sage,
            SalesLine.article_ref != None,
        )
    )
    owned_refs = {r[0] for r in client_products.all()}

    if not owned_refs:
        return {"suggestions": [], "message": "Ce client n'a aucun historique d'achat"}

    similar_clients = await db.execute(
        select(distinct(SalesLine.client_sage_id)).where(
            SalesLine.article_ref.in_(owned_refs),
            SalesLine.client_sage_id != client_sage,
        )
    )
    similar_ids = [r[0] for r in similar_clients.all()]

    if not similar_ids:
        return {"suggestions": [], "message": "Pas assez de données pour des suggestions"}

    suggestions_q = await db.execute(
        select(
            SalesLine.article_ref,
            func.max(SalesLine.designation).label("designation"),
            func.count(distinct(SalesLine.client_sage_id)).label("bought_by"),
            func.sum(SalesLine.amount_ht).label("total_ca"),
            func.avg(SalesLine.unit_price).label("avg_price"),
            func.count(distinct(SalesLine.sage_piece_id)).label("nb_orders"),
        )
        .where(
            SalesLine.client_sage_id.in_(similar_ids),
            SalesLine.article_ref.notin_(owned_refs),
            SalesLine.article_ref != None,
        )
        .group_by(SalesLine.article_ref)
        .order_by(func.count(distinct(SalesLine.client_sage_id)).desc())
        .limit(limit)
    )
    suggestions = suggestions_q.all()
    total_similar = len(similar_ids)

    return {
        "client_products_count": len(owned_refs),
        "similar_clients_count": total_similar,
        "suggestions": [
            {
                "article_ref": r[0],
                "designation": r[1],
                "bought_by_similar": r[2],
                "affinity_pct": round(r[2] / total_similar * 100, 1) if total_similar else 0,
                "total_ca": float(r[3]),
                "avg_price": round(float(r[4]), 2) if r[4] else None,
                "nb_orders": r[5],
            }
            for r in suggestions
        ],
    }


@router.get("/families")
async def get_families(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Retourne les familles de produits distinctes."""
    result = await db.execute(
        select(Product.family, func.count(Product.id))
        .where(Product.family != None)
        .group_by(Product.family)
        .order_by(func.count(Product.id).desc())
    )
    return [{"family": r[0], "count": r[1]} for r in result.all()]


@router.get("/detail")
async def get_product(
    ref: str = Query(..., description="Référence article"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Détail produit avec top clients, ventes mensuelles et co-achats."""
    article_ref = ref
    result = await db.execute(select(Product).where(Product.article_ref == article_ref))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Produit introuvable")

    resp = ProductDetail.model_validate(product)

    # Stats globales
    stats = await db.execute(
        select(
            func.coalesce(func.sum(SalesLine.amount_ht), 0),
            func.coalesce(func.sum(SalesLine.quantity), 0),
            func.count(distinct(SalesLine.client_sage_id)),
            func.count(distinct(SalesLine.sage_piece_id)),
            func.max(SalesLine.date),
            func.avg(SalesLine.margin_percent),
        )
        .where(SalesLine.article_ref == article_ref)
    )
    s = stats.one()
    resp.total_ca = float(s[0])
    resp.total_qty = float(s[1])
    resp.nb_clients = s[2]
    resp.nb_orders = s[3]
    resp.last_sale_date = s[4]
    resp.avg_margin_percent = round(float(s[5]), 1) if s[5] else None

    # Top 10 clients pour ce produit
    top_clients_q = await db.execute(
        select(
            SalesLine.client_sage_id,
            func.max(SalesLine.client_name).label("name"),
            func.max(Client.id).label("client_id"),
            func.sum(SalesLine.amount_ht).label("ca"),
            func.sum(SalesLine.quantity).label("qty"),
            func.count(distinct(SalesLine.sage_piece_id)).label("orders"),
            func.max(SalesLine.date).label("last_date"),
        )
        .outerjoin(Client, Client.sage_id == SalesLine.client_sage_id)
        .where(SalesLine.article_ref == article_ref)
        .group_by(SalesLine.client_sage_id)
        .order_by(func.sum(SalesLine.amount_ht).desc())
        .limit(10)
    )
    resp.top_clients = [
        {
            "client_sage_id": r[0],
            "client_name": r[1],
            "client_id": r[2],
            "ca": float(r[3]),
            "qty": float(r[4]),
            "orders": r[5],
            "last_date": str(r[6]) if r[6] else None,
        }
        for r in top_clients_q.all()
    ]

    # Ventes mensuelles
    month_label = func.to_char(SalesLine.date, "YYYY-MM")
    monthly_q = await db.execute(
        select(
            month_label.label("month"),
            func.sum(SalesLine.amount_ht).label("ca"),
            func.sum(SalesLine.quantity).label("qty"),
            func.count(distinct(SalesLine.client_sage_id)).label("clients"),
        )
        .where(SalesLine.article_ref == article_ref)
        .group_by(month_label)
        .order_by(month_label)
    )
    resp.monthly_sales = [
        {
            "month": r[0],
            "ca": float(r[1]),
            "qty": float(r[2]),
            "clients": r[3],
        }
        for r in monthly_q.all()
    ]

    # Co-achats : produits achetés dans les mêmes commandes
    co_q = await db.execute(
        select(
            SalesLine.article_ref,
            func.max(SalesLine.designation).label("designation"),
            func.count(distinct(SalesLine.sage_piece_id)).label("co_orders"),
            func.count(distinct(SalesLine.client_sage_id)).label("co_clients"),
            func.sum(SalesLine.amount_ht).label("co_ca"),
        )
        .where(
            SalesLine.sage_piece_id.in_(
                select(SalesLine.sage_piece_id).where(
                    SalesLine.article_ref == article_ref
                )
            ),
            SalesLine.article_ref != article_ref,
            SalesLine.article_ref != None,
        )
        .group_by(SalesLine.article_ref)
        .order_by(func.count(distinct(SalesLine.sage_piece_id)).desc())
        .limit(15)
    )
    resp.co_purchased = [
        {
            "article_ref": r[0],
            "designation": r[1],
            "co_orders": r[2],
            "co_clients": r[3],
            "co_ca": float(r[4]),
        }
        for r in co_q.all()
    ]

    depots_q = await db.execute(
        select(ProductStockDepot)
        .where(ProductStockDepot.article_ref == article_ref)
        .order_by(ProductStockDepot.depot_name)
    )
    resp.stock_depots = [
        StockDepotItem.model_validate(d) for d in depots_q.scalars().all()
    ]

    return resp
