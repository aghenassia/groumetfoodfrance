"""
Intel commerciale : fournisseurs, concurrents, produits d'intérêt par client.
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from core.database import get_db
from core.security import get_current_user
from models.user import User
from models.supplier import Supplier
from models.competitor import Competitor
from models.client_intel import ClientSupplier, ClientCompetitor, ClientProductInterest
from models.client import Client

router = APIRouter(prefix="/api/intel", tags=["intel"])


# ── Pydantic schemas ──────────────────────────────────────────

class NameItem(BaseModel):
    id: str
    name: str

class SupplierCreate(BaseModel):
    name: str

class CompetitorCreate(BaseModel):
    name: str

class ProductInterestCreate(BaseModel):
    article_ref: str | None = None
    product_name: str
    notes: str | None = None

class ClientIntelBatch(BaseModel):
    supplier_ids: list[str] = []
    competitor_ids: list[str] = []
    product_interests: list[ProductInterestCreate] = []

class ClientSupplierResponse(BaseModel):
    id: str
    supplier_id: str
    supplier_name: str
    notes: str | None = None
    created_at: str

class ClientCompetitorResponse(BaseModel):
    id: str
    competitor_id: str
    competitor_name: str
    notes: str | None = None
    created_at: str

class ClientProductInterestResponse(BaseModel):
    id: str
    article_ref: str | None = None
    product_name: str
    notes: str | None = None
    created_at: str

class ClientIntelResponse(BaseModel):
    suppliers: list[ClientSupplierResponse] = []
    competitors: list[ClientCompetitorResponse] = []
    product_interests: list[ClientProductInterestResponse] = []


# ── Suppliers CRUD ─────────────────────────────────────────────

@router.get("/suppliers", response_model=list[NameItem])
async def list_suppliers(
    search: str = "",
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(Supplier.id, Supplier.name).order_by(Supplier.name)
    if search:
        stmt = stmt.where(Supplier.name.ilike(f"%{search}%"))
    result = await db.execute(stmt.limit(50))
    return [{"id": r[0], "name": r[1]} for r in result.all()]


@router.post("/suppliers", response_model=NameItem)
async def create_supplier(
    body: SupplierCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Le nom est requis")
    existing = await db.execute(select(Supplier).where(func.lower(Supplier.name) == name.lower()))
    row = existing.scalar_one_or_none()
    if row:
        return {"id": row.id, "name": row.name}
    s = Supplier(name=name)
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return {"id": s.id, "name": s.name}


# ── Competitors CRUD ───────────────────────────────────────────

@router.get("/competitors", response_model=list[NameItem])
async def list_competitors(
    search: str = "",
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(Competitor.id, Competitor.name).order_by(Competitor.name)
    if search:
        stmt = stmt.where(Competitor.name.ilike(f"%{search}%"))
    result = await db.execute(stmt.limit(50))
    return [{"id": r[0], "name": r[1]} for r in result.all()]


@router.post("/competitors", response_model=NameItem)
async def create_competitor(
    body: CompetitorCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Le nom est requis")
    existing = await db.execute(select(Competitor).where(func.lower(Competitor.name) == name.lower()))
    row = existing.scalar_one_or_none()
    if row:
        return {"id": row.id, "name": row.name}
    c = Competitor(name=name)
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return {"id": c.id, "name": c.name}


# ── Client Intel (associations) ───────────────────────────────

@router.get("/clients/{client_id}", response_model=ClientIntelResponse)
async def get_client_intel(
    client_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    client = await db.get(Client, client_id)
    if not client:
        raise HTTPException(404, "Client introuvable")

    suppliers_q = await db.execute(
        select(ClientSupplier, Supplier.name)
        .join(Supplier, ClientSupplier.supplier_id == Supplier.id)
        .where(ClientSupplier.client_id == client_id)
        .order_by(Supplier.name)
    )
    competitors_q = await db.execute(
        select(ClientCompetitor, Competitor.name)
        .join(Competitor, ClientCompetitor.competitor_id == Competitor.id)
        .where(ClientCompetitor.client_id == client_id)
        .order_by(Competitor.name)
    )
    products_q = await db.execute(
        select(ClientProductInterest)
        .where(ClientProductInterest.client_id == client_id)
        .order_by(ClientProductInterest.product_name)
    )

    return ClientIntelResponse(
        suppliers=[
            ClientSupplierResponse(
                id=cs.id, supplier_id=cs.supplier_id,
                supplier_name=name, notes=cs.notes,
                created_at=str(cs.created_at),
            )
            for cs, name in suppliers_q.all()
        ],
        competitors=[
            ClientCompetitorResponse(
                id=cc.id, competitor_id=cc.competitor_id,
                competitor_name=name, notes=cc.notes,
                created_at=str(cc.created_at),
            )
            for cc, name in competitors_q.all()
        ],
        product_interests=[
            ClientProductInterestResponse(
                id=pi.id, article_ref=pi.article_ref,
                product_name=pi.product_name, notes=pi.notes,
                created_at=str(pi.created_at),
            )
            for pi in products_q.scalars().all()
        ],
    )


@router.post("/clients/{client_id}", response_model=ClientIntelResponse)
async def save_client_intel(
    client_id: str,
    body: ClientIntelBatch,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Ajoute des fournisseurs, concurrents, produits d'intérêt à un client (additif)."""
    client = await db.get(Client, client_id)
    if not client:
        raise HTTPException(404, "Client introuvable")

    for sid in body.supplier_ids:
        existing = await db.execute(
            select(ClientSupplier).where(
                ClientSupplier.client_id == client_id,
                ClientSupplier.supplier_id == sid,
            )
        )
        if not existing.scalar_one_or_none():
            db.add(ClientSupplier(client_id=client_id, supplier_id=sid, added_by=user.id))

    for cid in body.competitor_ids:
        existing = await db.execute(
            select(ClientCompetitor).where(
                ClientCompetitor.client_id == client_id,
                ClientCompetitor.competitor_id == cid,
            )
        )
        if not existing.scalar_one_or_none():
            db.add(ClientCompetitor(client_id=client_id, competitor_id=cid, added_by=user.id))

    for pi in body.product_interests:
        db.add(ClientProductInterest(
            client_id=client_id,
            article_ref=pi.article_ref,
            product_name=pi.product_name,
            notes=pi.notes,
            added_by=user.id,
        ))

    await db.commit()
    return await get_client_intel(client_id, db, user)


@router.delete("/clients/{client_id}/suppliers/{supplier_id}")
async def remove_client_supplier(
    client_id: str, supplier_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await db.execute(
        delete(ClientSupplier).where(
            ClientSupplier.client_id == client_id,
            ClientSupplier.supplier_id == supplier_id,
        )
    )
    await db.commit()
    return {"ok": True}


@router.delete("/clients/{client_id}/competitors/{competitor_id}")
async def remove_client_competitor(
    client_id: str, competitor_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await db.execute(
        delete(ClientCompetitor).where(
            ClientCompetitor.client_id == client_id,
            ClientCompetitor.competitor_id == competitor_id,
        )
    )
    await db.commit()
    return {"ok": True}


@router.delete("/clients/{client_id}/product-interests/{interest_id}")
async def remove_product_interest(
    client_id: str, interest_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await db.execute(
        delete(ClientProductInterest).where(
            ClientProductInterest.id == interest_id,
            ClientProductInterest.client_id == client_id,
        )
    )
    await db.commit()
    return {"ok": True}
