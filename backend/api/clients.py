from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func, delete, update, exists, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.database import get_db
from core.security import get_current_user
from models.user import User
from models.client import Client
from models.client_score import ClientScore
from models.sales_line import SalesLine
from models.call import Call
from models.phone_index import PhoneIndex
from models.contact import Contact
from models.client_audit import ClientAuditLog
from models.product import Product
from models.playlist import DailyPlaylist
from schemas.client import (
    ClientResponse,
    ClientListItem,
    ClientDetailResponse,
    ClientScoreResponse,
    SalesLineBrief,
    CallBrief,
    CallQualificationBrief,
    CallAiAnalysisBrief,
    PhoneNumberResponse,
    ContactBrief,
)
from connectors.phone_normalizer import normalize_phone

router = APIRouter(prefix="/api/clients", tags=["clients"])


class CreateProspectRequest(BaseModel):
    name: str
    contact_name: str | None = None
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    postal_code: str | None = None
    city: str | None = None
    country: str = "France"
    notes: str | None = None
    sales_rep: str | None = None


class AddPhoneRequest(BaseModel):
    phone: str
    label: str = "autre"


@router.get("")
async def list_clients(
    search: str | None = None,
    sales_rep: str | None = None,
    assigned_user_id: str | None = None,
    is_prospect: bool | None = None,
    is_dormant: bool | None = None,
    has_orders: bool | None = None,
    status: str | None = None,
    churn_min: int | None = None,
    churn_max: int | None = None,
    sort_by: str = Query(default="name", pattern="^(name|ca_total|ca_12m|last_order|order_count|order_count_12m|avg_basket|margin|churn|upsell|priority)$"),
    sort_dir: str = Query(default="asc", pattern="^(asc|desc)$"),
    limit: int = Query(default=50, le=500),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from sqlalchemy import func as sqlfunc
    from sqlalchemy.orm import aliased

    AssignedUser = aliased(User)

    base = (
        select(Client, ClientScore, AssignedUser.name.label("assigned_user_name"))
        .outerjoin(ClientScore, Client.id == ClientScore.client_id)
        .outerjoin(AssignedUser, Client.assigned_user_id == AssignedUser.id)
    )

    if search:
        pattern = f"%{search}%"
        contact_match = exists(
            select(Contact.id).where(
                Contact.company_id == Client.id,
                or_(
                    Contact.name.ilike(pattern),
                    Contact.phone.ilike(pattern),
                    Contact.phone_e164.ilike(pattern),
                    Contact.email.ilike(pattern),
                    Contact.role.ilike(pattern),
                ),
            )
        )
        base = base.where(
            or_(
                Client.name.ilike(pattern),
                Client.sage_id.ilike(pattern),
                Client.city.ilike(pattern),
                Client.contact_name.ilike(pattern),
                Client.phone.ilike(pattern),
                Client.email.ilike(pattern),
                contact_match,
            )
        )

    if assigned_user_id == "__none__":
        base = base.where(Client.assigned_user_id.is_(None))
    elif assigned_user_id:
        base = base.where(Client.assigned_user_id == assigned_user_id)
    if sales_rep:
        base = base.where(Client.sales_rep == sales_rep)
    if status:
        base = base.where(Client.status == status)
    elif is_prospect is not None:
        base = base.where(Client.is_prospect == is_prospect)
    elif is_dormant is not None:
        base = base.where(Client.is_dormant == is_dormant)
    if churn_min is not None:
        base = base.where(ClientScore.churn_risk_score >= churn_min)
    if churn_max is not None:
        base = base.where(ClientScore.churn_risk_score <= churn_max)
    if has_orders is True:
        base = base.where(ClientScore.order_count_total > 0)
    elif has_orders is False:
        base = base.where(
            (ClientScore.order_count_total == 0) | (ClientScore.order_count_total == None)
        )

    sort_map = {
        "name": Client.name,
        "ca_total": ClientScore.total_revenue_all,
        "ca_12m": ClientScore.total_revenue_12m,
        "last_order": ClientScore.last_order_date,
        "order_count": ClientScore.order_count_total,
        "order_count_12m": ClientScore.order_count_12m,
        "avg_basket": ClientScore.avg_basket,
        "margin": ClientScore.avg_margin_percent,
        "churn": ClientScore.churn_risk_score,
        "upsell": ClientScore.upsell_score,
        "priority": ClientScore.global_priority_score,
    }
    sort_col = sort_map.get(sort_by, Client.name)
    from sqlalchemy import asc, desc, nulls_last
    order_fn = desc if sort_dir == "desc" else asc
    order_clause = nulls_last(order_fn(sort_col))

    count_sub = base.with_only_columns(sqlfunc.count(Client.id))
    total = (await db.execute(count_sub)).scalar() or 0

    stmt = base.order_by(order_clause).offset(offset).limit(limit)
    result = await db.execute(stmt)
    rows = result.all()

    clients = []
    for client, score, user_name in rows:
        item = ClientListItem.model_validate(client)
        item.assigned_user_name = user_name
        if score:
            item.total_revenue_all = float(score.total_revenue_all or 0)
            item.total_revenue_12m = float(score.total_revenue_12m or 0)
            item.order_count_total = score.order_count_total or 0
            item.order_count_12m = score.order_count_12m or 0
            item.last_order_date = score.last_order_date
            item.avg_basket = float(score.avg_basket or 0)
            item.avg_margin_percent = float(score.avg_margin_percent or 0)
            item.churn_risk_score = score.churn_risk_score or 0
            item.upsell_score = score.upsell_score or 0
            item.global_priority_score = score.global_priority_score or 0
        clients.append(item)

    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "clients": clients,
    }


@router.get("/stats/commercial")
async def commercial_stats(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Stats commerciales globales : top clients, CA mensuel, répartition."""
    from sqlalchemy import func as sqlfunc, distinct

    top_clients = await db.execute(
        select(
            Client.id,
            Client.name,
            Client.sage_id,
            Client.city,
            Client.sales_rep,
            sqlfunc.count(SalesLine.id).label("order_count"),
            sqlfunc.coalesce(sqlfunc.sum(SalesLine.amount_ht), 0).label("total_ht"),
            sqlfunc.coalesce(sqlfunc.avg(SalesLine.margin_percent), 0).label("avg_margin"),
        )
        .join(SalesLine, (SalesLine.client_id == Client.id) | (SalesLine.client_sage_id == Client.sage_id))
        .group_by(Client.id, Client.name, Client.sage_id, Client.city, Client.sales_rep)
        .order_by(sqlfunc.sum(SalesLine.amount_ht).desc())
        .limit(10)
    )
    top = [
        {
            "id": r.id,
            "name": r.name,
            "sage_id": r.sage_id,
            "city": r.city,
            "sales_rep": r.sales_rep,
            "order_count": r.order_count,
            "total_ht": float(r.total_ht),
            "avg_margin": round(float(r.avg_margin), 1),
        }
        for r in top_clients.all()
    ]

    month_label = sqlfunc.to_char(SalesLine.date, "YYYY-MM")
    monthly = await db.execute(
        select(
            month_label.label("month"),
            sqlfunc.sum(SalesLine.amount_ht).label("total_ht"),
            sqlfunc.count(SalesLine.id).label("order_count"),
            sqlfunc.count(distinct(SalesLine.client_sage_id)).label("unique_clients"),
        )
        .group_by(month_label)
        .order_by(month_label)
    )
    monthly_data = [
        {
            "month": r.month,
            "total_ht": float(r.total_ht),
            "order_count": r.order_count,
            "unique_clients": r.unique_clients,
        }
        for r in monthly.all()
    ]

    totals = await db.execute(
        select(
            sqlfunc.count(SalesLine.id).label("total_lines"),
            sqlfunc.coalesce(sqlfunc.sum(SalesLine.amount_ht), 0).label("total_ht"),
            sqlfunc.coalesce(sqlfunc.sum(SalesLine.margin_value), 0).label("total_margin"),
            sqlfunc.count(distinct(SalesLine.client_sage_id)).label("unique_clients"),
            sqlfunc.count(distinct(SalesLine.article_ref)).label("unique_products"),
        )
    )
    t = totals.one()

    return {
        "totals": {
            "total_lines": t.total_lines,
            "total_ht": float(t.total_ht),
            "total_margin": float(t.total_margin),
            "unique_clients": t.unique_clients,
            "unique_products": t.unique_products,
        },
        "top_clients": top,
        "monthly": monthly_data,
    }


@router.get("/{client_id}", response_model=ClientDetailResponse)
async def get_client(
    client_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from sqlalchemy import func as sqlfunc, extract, cast, String

    from sqlalchemy import func as sqlfunc, distinct

    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client introuvable")

    assigned_user_name = None
    if client.assigned_user_id:
        u_q = await db.execute(
            select(User.name).where(User.id == client.assigned_user_id)
        )
        assigned_user_name = u_q.scalar()

    phones_result = await db.execute(
        select(PhoneIndex)
        .where(PhoneIndex.client_id == client_id)
        .order_by(PhoneIndex.created_at.asc())
    )
    phone_numbers = [
        PhoneNumberResponse.model_validate(p)
        for p in phones_result.scalars().all()
    ]

    # Score
    score_result = await db.execute(
        select(ClientScore).where(ClientScore.client_id == client_id)
    )
    score_obj = score_result.scalar_one_or_none()

    INVOICE_TYPES = [6, 7]
    PIPELINE_TYPES = [1, 3]
    client_match = (SalesLine.client_id == client_id) | (SalesLine.client_sage_id == client.sage_id)

    # Ventes facturées (par sage_id aussi, pas seulement client_id)
    sales_result = await db.execute(
        select(SalesLine)
        .where(client_match, SalesLine.sage_doc_type.in_(INVOICE_TYPES))
        .order_by(SalesLine.date.desc())
        .limit(50)
    )
    all_sales = sales_result.scalars().all()
    recent_sales = [SalesLineBrief.model_validate(s) for s in all_sales]

    # Commandes en cours (BC + BL)
    orders_result = await db.execute(
        select(SalesLine)
        .where(client_match, SalesLine.sage_doc_type.in_(PIPELINE_TYPES))
        .order_by(SalesLine.date.desc())
        .limit(20)
    )
    all_orders = orders_result.scalars().all()
    recent_orders = [SalesLineBrief.model_validate(o) for o in all_orders]

    # Pipeline summary
    from schemas.client import PipelineSummary
    pipeline_q = await db.execute(
        select(
            sqlfunc.count(distinct(SalesLine.sage_piece_id)),
            sqlfunc.coalesce(sqlfunc.sum(SalesLine.amount_ht), 0),
            sqlfunc.max(SalesLine.date),
        )
        .where(client_match, SalesLine.sage_doc_type.in_(PIPELINE_TYPES))
    )
    pq = pipeline_q.one()
    pipeline = PipelineSummary(
        orders_count=pq[0] or 0,
        orders_ca=round(float(pq[1] or 0), 2),
        last_order_date=pq[2],
    ) if pq[0] else None

    # Résumé des ventes (factures uniquement)
    summary_result = await db.execute(
        select(
            sqlfunc.count(SalesLine.id).label("total_orders"),
            sqlfunc.coalesce(sqlfunc.sum(SalesLine.amount_ht), 0).label("total_ht"),
            sqlfunc.coalesce(sqlfunc.sum(SalesLine.margin_value), 0).label("total_margin"),
            sqlfunc.coalesce(sqlfunc.avg(SalesLine.amount_ht), 0).label("avg_basket"),
            sqlfunc.coalesce(sqlfunc.avg(SalesLine.margin_percent), 0).label("avg_margin_percent"),
            sqlfunc.min(SalesLine.date).label("first_order_date"),
            sqlfunc.max(SalesLine.date).label("last_order_date"),
            sqlfunc.count(distinct(SalesLine.article_ref)).label("distinct_products"),
        )
        .where(client_match, SalesLine.sage_doc_type.in_(INVOICE_TYPES))
    )
    sr = summary_result.one()
    from schemas.client import SalesSummary
    sales_summary = SalesSummary(
        total_orders=sr.total_orders,
        total_ht=float(sr.total_ht),
        total_margin=float(sr.total_margin),
        avg_basket=round(float(sr.avg_basket), 2),
        avg_margin_percent=round(float(sr.avg_margin_percent), 1),
        first_order_date=sr.first_order_date,
        last_order_date=sr.last_order_date,
        distinct_products=sr.distinct_products,
    ) if sr.total_orders > 0 else None

    # Top produits achetés (factures uniquement, hors articles service)
    from schemas.client import TopProduct
    service_refs = select(Product.article_ref).where(Product.is_service == True).scalar_subquery()
    top_prods_result = await db.execute(
        select(
            SalesLine.article_ref,
            sqlfunc.max(SalesLine.designation).label("designation"),
            sqlfunc.coalesce(sqlfunc.sum(SalesLine.quantity), 0).label("total_qty"),
            sqlfunc.coalesce(sqlfunc.sum(SalesLine.amount_ht), 0).label("total_ht"),
            sqlfunc.count(SalesLine.id).label("order_count"),
        )
        .where(
            client_match,
            SalesLine.sage_doc_type.in_(INVOICE_TYPES),
            SalesLine.article_ref.notin_(service_refs),
        )
        .group_by(SalesLine.article_ref)
        .order_by(sqlfunc.sum(SalesLine.amount_ht).desc())
        .limit(10)
    )
    top_products = [
        TopProduct(
            article_ref=r.article_ref,
            designation=r.designation,
            total_qty=float(r.total_qty),
            total_ht=float(r.total_ht),
            order_count=r.order_count,
        )
        for r in top_prods_result.all()
    ]

    # CA mensuel (factures uniquement)
    from schemas.client import MonthlySales
    client_month = sqlfunc.to_char(SalesLine.date, "YYYY-MM")
    monthly_result = await db.execute(
        select(
            client_month.label("month"),
            sqlfunc.coalesce(sqlfunc.sum(SalesLine.amount_ht), 0).label("total_ht"),
            sqlfunc.count(SalesLine.id).label("order_count"),
            sqlfunc.avg(SalesLine.margin_percent).label("margin_avg"),
        )
        .where(client_match, SalesLine.sage_doc_type.in_(INVOICE_TYPES))
        .group_by(client_month)
        .order_by(client_month)
    )
    monthly_sales = [
        MonthlySales(
            month=r.month,
            total_ht=float(r.total_ht),
            order_count=r.order_count,
            margin_avg=round(float(r.margin_avg), 1) if r.margin_avg else None,
        )
        for r in monthly_result.all()
    ]

    # Contacts
    contacts_result = await db.execute(
        select(Contact, User.name.label("user_name"))
        .outerjoin(User, User.id == Contact.assigned_user_id)
        .where(Contact.company_id == client_id)
        .order_by(Contact.is_primary.desc(), Contact.name)
    )
    contacts = []
    for row in contacts_result.all():
        ct = row[0]
        contacts.append(ContactBrief(
            id=ct.id,
            name=ct.name,
            first_name=ct.first_name,
            last_name=ct.last_name,
            role=ct.role,
            phone=ct.phone,
            phone_e164=ct.phone_e164,
            email=ct.email,
            is_primary=ct.is_primary,
            source=ct.source,
            assigned_user_id=ct.assigned_user_id,
            assigned_user_name=row[1],
        ))

    # Derniers appels avec qualifications + analyses IA
    from models.qualification import CallQualification
    from models.ai_analysis import AiAnalysis

    calls_result = await db.execute(
        select(Call)
        .where(Call.client_id == client_id)
        .options(selectinload(Call.qualification), selectinload(Call.ai_analysis))
        .order_by(Call.start_time.desc())
        .limit(30)
    )
    recent_calls = []
    for c in calls_result.scalars().all():
        cb = CallBrief(
            id=c.id,
            direction=c.direction,
            start_time=c.start_time,
            incall_duration=c.incall_duration or 0,
            is_answered=c.is_answered,
            user_name=c.user_name,
            contact_name=c.contact_name,
            contact_id=c.contact_id,
            record_url=c.record_url,
            qualification=CallQualificationBrief.model_validate(c.qualification)
            if c.qualification else None,
            ai_analysis=CallAiAnalysisBrief.model_validate(c.ai_analysis)
            if c.ai_analysis else None,
        )
        recent_calls.append(cb)

    return ClientDetailResponse(
        id=client.id,
        sage_id=client.sage_id,
        name=client.name,
        short_name=client.short_name,
        contact_name=client.contact_name,
        address=client.address,
        postal_code=client.postal_code,
        city=client.city,
        country=client.country,
        phone=client.phone,
        phone_e164=client.phone_e164,
        email=client.email,
        sales_rep=client.sales_rep,
        assigned_user_name=assigned_user_name,
        tariff_category=client.tariff_category,
        is_prospect=client.is_prospect,
        is_dormant=client.is_dormant,
        status=client.status,
        website=client.website,
        siret=client.siret,
        vat_number=client.vat_number,
        naf_code=client.naf_code,
        sage_created_at=client.sage_created_at,
        phone_numbers=phone_numbers,
        contacts=contacts,
        score=ClientScoreResponse.model_validate(score_obj) if score_obj else None,
        sales_summary=sales_summary,
        top_products=top_products,
        monthly_sales=monthly_sales,
        recent_sales=recent_sales,
        recent_orders=recent_orders,
        pipeline=pipeline,
        recent_calls=recent_calls,
        last_qualification_mood=client.last_qualification_mood,
        last_qualification_outcome=client.last_qualification_outcome,
        last_qualification_at=client.last_qualification_at,
        qualification_hot_count=client.qualification_hot_count or 0,
        qualification_cold_count=client.qualification_cold_count or 0,
    )


@router.post("/{client_id}/phones", response_model=PhoneNumberResponse)
async def add_phone_number(
    client_id: str,
    body: AddPhoneRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Ajoute un numéro de téléphone à un client."""
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client introuvable")

    phone_e164 = normalize_phone(body.phone)
    if not phone_e164:
        raise HTTPException(status_code=400, detail="Numéro invalide")

    # Vérifier s'il existe déjà
    existing = await db.execute(
        select(PhoneIndex).where(
            PhoneIndex.phone_e164 == phone_e164,
            PhoneIndex.client_id == client_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Ce numéro existe déjà pour ce client")

    phone_idx = PhoneIndex(
        phone_e164=phone_e164,
        client_id=client_id,
        source="crm_manual",
        raw_phone=body.phone,
        label=body.label,
    )
    db.add(phone_idx)

    db.add(ClientAuditLog(
        client_id=client_id,
        user_id=user.id,
        user_name=user.name,
        action="phone_added",
        field_name="phone",
        new_value=phone_e164,
        details=f"Label: {body.label or 'principal'}",
    ))

    if not client.phone_e164:
        client.phone = body.phone
        client.phone_e164 = phone_e164

    await db.commit()
    await db.refresh(phone_idx)
    return PhoneNumberResponse.model_validate(phone_idx)


@router.delete("/{client_id}/phones/{phone_id}")
async def remove_phone_number(
    client_id: str,
    phone_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Supprime un numéro de téléphone d'un client (sauf source sage)."""
    result = await db.execute(
        select(PhoneIndex).where(
            PhoneIndex.id == phone_id,
            PhoneIndex.client_id == client_id,
        )
    )
    phone = result.scalar_one_or_none()
    if not phone:
        raise HTTPException(status_code=404, detail="Numéro introuvable")

    db.add(ClientAuditLog(
        client_id=client_id,
        user_id=user.id,
        user_name=user.name,
        action="phone_removed",
        field_name="phone",
        old_value=phone.phone_e164,
    ))

    await db.execute(
        delete(PhoneIndex).where(PhoneIndex.id == phone_id)
    )
    await db.commit()
    return {"deleted": True}


@router.delete("/{client_id}")
async def delete_client(
    client_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Supprime un client et nettoie toutes les données liées."""
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client introuvable")

    await db.execute(
        update(SalesLine).where(SalesLine.client_id == client_id).values(client_id=None)
    )
    await db.execute(
        update(Call).where(Call.client_id == client_id).values(client_id=None)
    )
    await db.execute(
        delete(DailyPlaylist).where(DailyPlaylist.client_id == client_id)
    )

    await db.delete(client)
    await db.commit()
    return {"deleted": True, "name": client.name}


@router.post("", response_model=ClientResponse)
async def create_prospect(
    body: CreateProspectRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Crée un nouveau prospect dans la base CRM (pas dans Sage)."""
    import uuid as _uuid

    prospect_id = f"CRM-{_uuid.uuid4().hex[:8].upper()}"
    phone_e164 = normalize_phone(body.phone) if body.phone else None

    client = Client(
        sage_id=prospect_id,
        name=body.name,
        contact_name=body.contact_name,
        phone=body.phone,
        phone_e164=phone_e164,
        email=body.email,
        address=body.address,
        postal_code=body.postal_code,
        city=body.city,
        country=body.country,
        sales_rep=body.sales_rep or user.sage_rep_name or user.name,
        assigned_user_id=user.id,
        is_prospect=True,
        is_dormant=False,
    )
    db.add(client)
    await db.flush()

    primary_contact = Contact(
        company_id=client.id,
        name=body.contact_name or body.name,
        phone=body.phone,
        phone_e164=phone_e164,
        email=body.email,
        assigned_user_id=user.id,
        is_primary=True,
        source="manual",
    )
    db.add(primary_contact)
    await db.flush()

    if phone_e164:
        phone_idx = PhoneIndex(
            phone_e164=phone_e164,
            client_id=client.id,
            contact_id=primary_contact.id,
            source="crm_manual",
            raw_phone=body.phone,
            label="principal",
        )
        db.add(phone_idx)

    db.add(ClientAuditLog(
        client_id=client.id,
        user_id=user.id,
        user_name=user.name,
        action="created",
        details=f"Prospect créé manuellement : {body.name}",
    ))

    await db.commit()
    await db.refresh(client)
    return ClientResponse.model_validate(client)


class AuditLogResponse(BaseModel):
    id: str
    client_id: str
    user_id: str | None = None
    user_name: str
    action: str
    field_name: str | None = None
    old_value: str | None = None
    new_value: str | None = None
    details: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("/{client_id}/audit", response_model=list[AuditLogResponse])
async def get_client_audit(
    client_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Récupère l'historique complet des modifications d'un client."""
    result = await db.execute(
        select(ClientAuditLog)
        .where(ClientAuditLog.client_id == client_id)
        .order_by(ClientAuditLog.created_at.desc())
    )
    logs = result.scalars().all()
    return [AuditLogResponse.model_validate(log) for log in logs]


class UpdateClientRequest(BaseModel):
    name: str | None = None
    contact_name: str | None = None
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    postal_code: str | None = None
    city: str | None = None
    country: str | None = None
    website: str | None = None
    siret: str | None = None
    vat_number: str | None = None
    naf_code: str | None = None
    tariff_category: str | None = None


EDITABLE_FIELDS = {
    "name", "contact_name", "phone", "email", "address",
    "postal_code", "city", "country", "website", "siret",
    "vat_number", "naf_code", "tariff_category",
}


@router.put("/{client_id}", response_model=ClientResponse)
async def update_client(
    client_id: str,
    body: UpdateClientRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Met à jour les champs éditables d'un client avec audit trail."""
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client introuvable")

    changes = body.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="Aucun champ à modifier")

    now = datetime.now(timezone.utc)
    for field, new_val in changes.items():
        if field not in EDITABLE_FIELDS:
            continue
        old_val = getattr(client, field, None)
        old_str = str(old_val) if old_val is not None else None
        new_str = str(new_val) if new_val is not None else None
        if old_str == new_str:
            continue

        setattr(client, field, new_val)
        db.add(ClientAuditLog(
            client_id=client_id,
            user_id=user.id,
            user_name=user.name,
            action="updated",
            field_name=field,
            old_value=old_str,
            new_value=new_str,
        ))

    if "phone" in changes and changes["phone"]:
        new_e164 = normalize_phone(changes["phone"])
        if new_e164 and new_e164 != client.phone_e164:
            client.phone_e164 = new_e164

    client.updated_at = now
    await db.commit()
    await db.refresh(client)
    return ClientResponse.model_validate(client)


@router.post("/{client_id}/merge-into/{target_id}")
async def merge_client(
    client_id: str,
    target_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Rattache un client orphelin à un client existant : transfère numéros, appels, puis supprime l'orphelin."""
    if client_id == target_id:
        raise HTTPException(status_code=400, detail="Impossible de fusionner un client avec lui-même")

    src = (await db.execute(select(Client).where(Client.id == client_id))).scalar_one_or_none()
    tgt = (await db.execute(select(Client).where(Client.id == target_id))).scalar_one_or_none()
    if not src:
        raise HTTPException(status_code=404, detail="Client source introuvable")
    if not tgt:
        raise HTTPException(status_code=404, detail="Client cible introuvable")

    now = datetime.now(timezone.utc)

    phones = (await db.execute(
        select(PhoneIndex).where(PhoneIndex.client_id == client_id)
    )).scalars().all()
    existing_phones = {p.phone_e164 for p in (await db.execute(
        select(PhoneIndex).where(PhoneIndex.client_id == target_id)
    )).scalars().all()}

    transferred_phones = []
    for pi in phones:
        if pi.phone_e164 not in existing_phones:
            pi.client_id = target_id
            transferred_phones.append(pi.phone_e164)
        else:
            await db.delete(pi)

    calls_result = await db.execute(select(Call).where(Call.client_id == client_id))
    calls = calls_result.scalars().all()
    for call in calls:
        call.client_id = target_id

    db.add(ClientAuditLog(
        client_id=target_id,
        user_id=user.id,
        user_name=user.name,
        action="merged",
        details=f"Fusion de \"{src.name or src.phone_e164 or client_id}\" → {len(transferred_phones)} numéro(s) et {len(calls)} appel(s) transférés",
    ))

    await db.execute(delete(ClientAuditLog).where(ClientAuditLog.client_id == client_id))
    await db.delete(src)

    tgt.updated_at = now
    await db.commit()

    return {
        "status": "merged",
        "target_id": target_id,
        "phones_transferred": len(transferred_phones),
        "calls_transferred": len(calls),
    }


ENRICH_EXTRACT_PROMPT = """Tu enrichis la fiche d'un client existant. Tu dois UNIQUEMENT proposer des données qui correspondent à CE client.

DONNÉES EXISTANTES DU CLIENT :
{existing_data}

RÉSULTATS DE RECHERCHE :
{search_results}

RÈGLES CRITIQUES :
- Remplis TOUS les champs MANQUANTS avec les données trouvées.
- Si le client a déjà un nom et que les résultats parlent d'une AUTRE entreprise (nom clairement différent), mets null partout et confidence="low".
- Si le client n'a PAS de nom (MANQUANT), propose le nom trouvé dans les résultats.
- Ne remplace PAS les données existantes déjà renseignées.
- Le champ "phone" est prioritaire : cherche le numéro de téléphone associé à cette entreprise.

Retourne UNIQUEMENT un JSON valide (pas de markdown, pas de texte autour) :
{{
  "name": "Nom de l'entreprise trouvé (ou null)",
  "contact_name": null,
  "address": "Adresse trouvée (ou null)",
  "postal_code": "Code postal (ou null)",
  "city": "Ville (ou null)",
  "country": null,
  "website": "Site web (ou null)",
  "siret": "SIRET 14 chiffres (ou null)",
  "email": "Email (ou null)",
  "naf_code": "Code NAF (ou null)",
  "phone": "Numéro de téléphone en format international (ou null)",
  "confidence": "high" si les données correspondent clairement au client, "medium" si partiel, "low" si rien trouvé ou si les résultats ne correspondent pas
}}"""


def _format_phone_variants(phone: str) -> list[str]:
    """Retourne plusieurs formats du numéro pour maximiser les résultats de recherche."""
    variants = [phone]
    if phone.startswith("+33") and len(phone) == 12:
        digits = phone[3:]
        variants.append(f"0{digits}")
        variants.append(f"0{digits[0]} {digits[1:3]} {digits[3:5]} {digits[5:7]} {digits[7:9]}")
        variants.append(f"+33 {digits[0]} {digits[1:3]} {digits[3:5]} {digits[5:7]} {digits[7:9]}")
    return variants


async def _search_google_places(phone: str, api_key: str) -> str | None:
    """Recherche un numéro dans Google Places API (Find Place + Place Details)."""
    import httpx

    if not api_key:
        return None

    phone_intl = phone if phone.startswith("+") else f"+33{phone[1:]}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://maps.googleapis.com/maps/api/place/findplacefromtext/json",
                params={
                    "input": phone_intl,
                    "inputtype": "phonenumber",
                    "fields": "name,formatted_address,business_status,types,place_id",
                    "key": api_key,
                },
            )
            data = resp.json()
            candidates = data.get("candidates", [])
            if not candidates:
                return None

            place = candidates[0]
            parts = [f"Nom: {place.get('name', 'Inconnu')}"]
            if place.get("formatted_address"):
                parts.append(f"Adresse: {place['formatted_address']}")
            if place.get("types"):
                parts.append(f"Type: {', '.join(place['types'][:3])}")

            place_id = place.get("place_id")
            if place_id:
                details_resp = await client.get(
                    "https://maps.googleapis.com/maps/api/place/details/json",
                    params={
                        "place_id": place_id,
                        "fields": "website,formatted_phone_number,url",
                        "key": api_key,
                    },
                )
                details = details_resp.json().get("result", {})
                if details.get("website"):
                    parts.append(f"Site web: {details['website']}")

            return "\n".join(parts)
    except Exception as e:
        print(f"[ENRICH] Google Places error: {e}")
        return None


async def _search_google_places_by_name(name: str, city: str | None, api_key: str) -> str | None:
    """Recherche inversée : trouver le téléphone d'une entreprise par son nom."""
    import httpx

    if not api_key:
        return None

    query = f"{name} {city}" if city else name
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://maps.googleapis.com/maps/api/place/findplacefromtext/json",
                params={
                    "input": query,
                    "inputtype": "textquery",
                    "fields": "name,formatted_address,place_id",
                    "locationbias": "ipbias",
                    "key": api_key,
                },
            )
            candidates = resp.json().get("candidates", [])
            if not candidates:
                return None

            place = candidates[0]
            place_id = place.get("place_id")
            if not place_id:
                return None

            details_resp = await client.get(
                "https://maps.googleapis.com/maps/api/place/details/json",
                params={
                    "place_id": place_id,
                    "fields": "name,formatted_address,formatted_phone_number,international_phone_number,website",
                    "key": api_key,
                },
            )
            details = details_resp.json().get("result", {})
            parts = [f"Nom: {details.get('name', place.get('name', 'Inconnu'))}"]
            if details.get("formatted_address"):
                parts.append(f"Adresse: {details['formatted_address']}")
            if details.get("international_phone_number"):
                parts.append(f"Téléphone: {details['international_phone_number']}")
            elif details.get("formatted_phone_number"):
                parts.append(f"Téléphone: {details['formatted_phone_number']}")
            if details.get("website"):
                parts.append(f"Site web: {details['website']}")
            return "\n".join(parts)
    except Exception as e:
        print(f"[ENRICH] Google Places by name error: {e}")
        return None


async def _search_by_siret(siret: str, openai_client) -> str:
    """Recherche par SIRET sur pappers.fr / société.com pour trouver téléphone, email, etc."""
    try:
        response = openai_client.responses.create(
            model="gpt-4o-mini",
            tools=[{
                "type": "web_search",
                "search_context_size": "high",
                "user_location": {"type": "approximate", "country": "FR"},
            }],
            input=f'Trouve les informations de l\'entreprise avec le SIRET {siret}. Cherche sur pappers.fr, société.com, infogreffe.fr, ou annuaire.com. Je veux le numéro de téléphone, l\'email, le site web, le code NAF, et le nom du dirigeant. Donne uniquement les faits trouvés.',
        )
        for item in response.output:
            if item.type == "message":
                for block in item.content:
                    if hasattr(block, "text") and block.text:
                        return block.text
    except Exception as e:
        print(f"[ENRICH] SIRET search error: {e}")
    return ""


async def _search_legal_info(company_name: str, city: str | None, openai_client) -> str:
    """Recherche SIRET, NAF, email, téléphone via web search."""
    try:
        location = f" à {city}" if city else " en France"
        response = openai_client.responses.create(
            model="gpt-4o",
            tools=[{
                "type": "web_search",
                "search_context_size": "high",
                "user_location": {"type": "approximate", "country": "FR"},
            }],
            input=(
                f'Cherche "{company_name}"{location} sur pappers.fr ou société.com ou societe.ninja. '
                f'Donne-moi le SIRET (14 chiffres), le code NAF, le numéro de téléphone, '
                f'l\'email, le site web et le nom du dirigeant. '
                f'Réponds UNIQUEMENT avec les faits trouvés, pas de commentaire.'
            ),
        )
        result_text = ""
        for item in response.output:
            if item.type == "message":
                for block in item.content:
                    if hasattr(block, "text") and block.text:
                        result_text = block.text
                        break
        print(f"[ENRICH] Legal search result: {result_text[:300]}")
        return result_text
    except Exception as e:
        print(f"[ENRICH] legal search error: {e}")
    return ""


class EnrichSuggestion(BaseModel):
    name: str | None = None
    contact_name: str | None = None
    address: str | None = None
    postal_code: str | None = None
    city: str | None = None
    country: str | None = None
    website: str | None = None
    siret: str | None = None
    email: str | None = None
    naf_code: str | None = None
    phone: str | None = None
    confidence: str | None = None


def _build_existing_context(client) -> str:
    """Construit une description textuelle des données existantes du client."""
    fields = [
        ("Nom", client.name),
        ("Téléphone", client.phone_e164 or client.phone),
        ("Email", client.email),
        ("Adresse", client.address),
        ("Code postal", client.postal_code),
        ("Ville", client.city),
        ("Pays", client.country),
        ("SIRET", client.siret),
        ("Code NAF", client.naf_code),
        ("Site web", client.website),
    ]
    lines = []
    for label, val in fields:
        if val:
            lines.append(f"- {label}: {val}")
        else:
            lines.append(f"- {label}: MANQUANT")
    return "\n".join(lines)


@router.post("/{client_id}/enrich", response_model=EnrichSuggestion)
async def enrich_client(
    client_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Enrichit une fiche client en utilisant toutes les données disponibles."""
    import json
    from openai import OpenAI
    from config import get_settings

    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client introuvable")

    phone = client.phone_e164 or client.phone
    has_phone = bool(phone and not phone.startswith("+0") and len(phone) > 5)
    has_name = bool(client.name and not client.name.startswith("+") and not client.name.replace(" ", "").isdigit())
    has_siret = bool(client.siret and len(client.siret) >= 9)

    if not has_phone and not has_name and not has_siret:
        raise HTTPException(status_code=400, detail="Pas assez de données pour enrichir (ni téléphone, ni nom, ni SIRET)")

    settings = get_settings()
    openai_client = OpenAI(api_key=settings.openai_api_key)
    all_search_parts: list[str] = []

    try:
        # --- Phase 1 : recherche par SIRET (la plus fiable) ---
        if has_siret:
            siret_result = await _search_by_siret(client.siret, openai_client)
            if siret_result:
                all_search_parts.append(f"[Recherche SIRET {client.siret}]\n{siret_result}")

        # --- Phase 2 : recherche par téléphone ---
        if has_phone:
            places_result = await _search_google_places(phone, settings.google_places_api_key)
            if places_result:
                all_search_parts.append(f"[Google Places - téléphone]\n{places_result}")

        # --- Phase 3 : recherche par nom (avec adresse/ville pour précision) ---
        if has_name and not has_phone:
            search_city = client.city
            if not search_city and client.address:
                search_city = client.address
            name_result = await _search_google_places_by_name(
                client.name, search_city, settings.google_places_api_key,
            )
            if name_result:
                all_search_parts.append(f"[Google Places - nom]\n{name_result}")

        # --- Extraire le nom découvert par les recherches précédentes ---
        discovered_name = client.name if has_name else None
        discovered_city = client.city
        if not discovered_name and all_search_parts:
            for part in all_search_parts:
                for line in part.split("\n"):
                    if line.startswith("Nom:"):
                        discovered_name = line.split(":", 1)[1].strip()
                        break
                if discovered_name:
                    break
        if not discovered_city and all_search_parts:
            for part in all_search_parts:
                for line in part.split("\n"):
                    if line.startswith("Adresse:"):
                        discovered_city = line.split(":", 1)[1].strip()
                        break
                if discovered_city:
                    break

        # --- Phase 4 : recherche légale ---
        if discovered_name and not has_siret:
            legal_result = await _search_legal_info(
                discovered_name, discovered_city, openai_client,
            )
            if legal_result:
                all_search_parts.append(f"[Infos légales]\n{legal_result}")

        combined = "\n\n".join(all_search_parts) if all_search_parts else "Aucun résultat trouvé."
        existing_ctx = _build_existing_context(client)
        print(f"[ENRICH] client={client.name} siret={client.siret} phone={phone} parts={len(all_search_parts)}")
        for i, part in enumerate(all_search_parts):
            print(f"[ENRICH] part[{i}]: {part[:200]}")

        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{
                "role": "user",
                "content": ENRICH_EXTRACT_PROMPT.format(
                    existing_data=existing_ctx,
                    search_results=combined,
                ),
            }],
            max_tokens=500,
            temperature=0.1,
        )
        raw = response.choices[0].message.content or "{}"
        raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        suggestions = json.loads(raw)
        for k, v in suggestions.items():
            if v == "null" or v == "":
                suggestions[k] = None
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail=f"Réponse IA non parsable : {raw[:200]}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erreur IA : {e}")

    return EnrichSuggestion(**suggestions)
