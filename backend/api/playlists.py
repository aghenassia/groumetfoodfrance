import logging
from datetime import date, datetime, timedelta, timezone
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func as sqlfunc
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user
from models.user import User
from models.client import Client
from models.contact import Contact
from models.client_score import ClientScore
from models.playlist import DailyPlaylist
from models.sales_line import SalesLine

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/playlists", tags=["playlists"])


class PlaylistContactInfo(BaseModel):
    id: str
    name: str
    role: str | None = None
    phone: str | None = None
    phone_e164: str | None = None
    email: str | None = None
    is_primary: bool = False


class PlaylistItemResponse(BaseModel):
    id: str
    sage_id: str
    name: str
    short_name: str | None = None
    contact_name: str | None = None
    address: str | None = None
    postal_code: str | None = None
    city: str | None = None
    country: str | None = None
    phone: str | None = None
    phone_e164: str | None = None
    email: str | None = None
    sales_rep: str | None = None
    tariff_category: str | None = None
    is_prospect: bool = False
    is_dormant: bool = False
    client_status: str = "prospect"
    playlist_id: str
    priority: int
    reason: str
    reason_detail: str | None = None
    score: int = 0
    status: str = "pending"
    primary_contact: PlaylistContactInfo | None = None


@router.get("", response_model=list[PlaylistItemResponse])
async def get_my_playlist(
    target_date: date | None = None,
    user_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    target = target_date or date.today()

    effective_user_id = user.id
    if user_id and user.role in ("admin", "manager") and user_id != user.id:
        effective_user_id = user_id

    stmt = (
        select(DailyPlaylist, Client)
        .join(Client, DailyPlaylist.client_id == Client.id)
        .where(
            DailyPlaylist.user_id == effective_user_id,
            DailyPlaylist.generated_date == target,
        )
        .order_by(DailyPlaylist.priority)
    )

    result = await db.execute(stmt)
    rows = result.all()

    client_ids = [r[1].id for r in rows]
    primary_contacts: dict[str, Contact] = {}
    if client_ids:
        contact_result = await db.execute(
            select(Contact)
            .where(Contact.company_id.in_(client_ids), Contact.is_primary == True)
        )
        for ct in contact_result.scalars().all():
            primary_contacts[ct.company_id] = ct

    items = []
    for playlist, client in rows:
        pc = primary_contacts.get(client.id)
        pc_info = None
        if pc:
            pc_info = PlaylistContactInfo(
                id=pc.id, name=pc.name, role=pc.role,
                phone=pc.phone, phone_e164=pc.phone_e164,
                email=pc.email, is_primary=True,
            )

        call_phone = pc.phone_e164 if pc and pc.phone_e164 else client.phone_e164

        items.append(PlaylistItemResponse(
            id=client.id,
            sage_id=client.sage_id,
            name=client.name,
            short_name=client.short_name,
            contact_name=pc.name if pc else client.contact_name,
            address=client.address,
            postal_code=client.postal_code,
            city=client.city,
            country=client.country,
            phone=pc.phone if pc else client.phone,
            phone_e164=call_phone,
            email=pc.email if pc else client.email,
            sales_rep=client.sales_rep,
            tariff_category=client.tariff_category,
            is_prospect=client.is_prospect,
            is_dormant=client.is_dormant,
            client_status=client.status or "prospect",
            playlist_id=playlist.id,
            priority=playlist.priority,
            reason=playlist.reason,
            reason_detail=playlist.reason_detail,
            score=playlist.score,
            status=playlist.status,
            primary_contact=pc_info,
        ))

    return items


@router.patch("/{playlist_id}/status")
async def update_playlist_status(
    playlist_id: str,
    status: str = Query(..., pattern="^(pending|called|skipped|done|postponed)$"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(DailyPlaylist).where(
            DailyPlaylist.id == playlist_id,
            DailyPlaylist.user_id == user.id,
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entrée playlist introuvable")

    entry.status = status
    if status in ("called", "done"):
        entry.called_at = datetime.now(timezone.utc)

    await db.commit()
    return {"ok": True, "status": status}


# ──────────────── ASSISTANT UPSELL ────────────────


class UpsellProductItem(BaseModel):
    article_ref: str | None = None
    designation: str
    total_qty: float
    total_ht: float
    order_count: int
    last_order_date: str | None = None


class UpsellRecommendation(BaseModel):
    article_ref: str
    designation: str
    score: float
    similar_clients_count: int
    avg_revenue: float


class UpsellInsight(BaseModel):
    client_name: str
    client_city: str | None = None
    reason: str
    reason_detail: str | None = None
    score_churn: int
    score_upsell: int
    days_since_last_order: int | None = None
    ca_12m: float
    ca_total: float
    avg_basket: float
    upsell_recommendations: list[UpsellRecommendation]
    top_products: list[UpsellProductItem]
    ai_suggestion: str | None = None


@router.get("/{playlist_id}/insight")
async def get_playlist_insight(
    playlist_id: str,
    with_ai: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Retourne le contexte client + top produits + suggestion IA optionnelle."""
    result = await db.execute(
        select(DailyPlaylist).where(
            DailyPlaylist.id == playlist_id,
            DailyPlaylist.user_id == user.id,
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(404, "Entrée introuvable")

    client_q = await db.execute(select(Client).where(Client.id == entry.client_id))
    client = client_q.scalar_one()

    score_q = await db.execute(
        select(ClientScore).where(ClientScore.client_id == client.id)
    )
    score = score_q.scalar_one_or_none()

    from models.product import Product
    service_refs = select(Product.article_ref).where(Product.is_service == True).scalar_subquery()

    top_prods_result = await db.execute(
        select(
            SalesLine.article_ref,
            sqlfunc.max(SalesLine.designation).label("designation"),
            sqlfunc.coalesce(sqlfunc.sum(SalesLine.quantity), 0).label("total_qty"),
            sqlfunc.coalesce(sqlfunc.sum(SalesLine.amount_ht), 0).label("total_ht"),
            sqlfunc.count(SalesLine.id).label("order_count"),
            sqlfunc.max(SalesLine.date).label("last_date"),
        )
        .where(
            SalesLine.client_sage_id == client.sage_id,
            SalesLine.article_ref.isnot(None),
            SalesLine.article_ref.notin_(service_refs),
        )
        .group_by(SalesLine.article_ref)
        .order_by(sqlfunc.sum(SalesLine.amount_ht).desc())
        .limit(10)
    )
    top_prods_rows = top_prods_result.all()
    top_products = [
        UpsellProductItem(
            article_ref=r.article_ref,
            designation=r.designation or "",
            total_qty=float(r.total_qty),
            total_ht=float(r.total_ht),
            order_count=r.order_count,
            last_order_date=str(r.last_date) if r.last_date else None,
        )
        for r in top_prods_rows
    ]

    # --- Upsell recommendations via collaborative filtering ---
    client_refs = {r.article_ref for r in top_prods_rows if r.article_ref}
    upsell_recommendations: list[UpsellRecommendation] = []

    if client_refs:
        twelve_m_ago = date.today() - timedelta(days=365)

        similar_clients_sq = (
            select(SalesLine.client_sage_id)
            .where(
                SalesLine.article_ref.in_(client_refs),
                SalesLine.client_sage_id != client.sage_id,
                SalesLine.date >= twelve_m_ago,
            )
            .group_by(SalesLine.client_sage_id)
            .having(sqlfunc.count(sqlfunc.distinct(SalesLine.article_ref)) >= 2)
            .scalar_subquery()
        )

        reco_q = await db.execute(
            select(
                SalesLine.article_ref,
                sqlfunc.max(SalesLine.designation).label("designation"),
                sqlfunc.count(sqlfunc.distinct(SalesLine.client_sage_id)).label("nb_clients"),
                sqlfunc.coalesce(
                    sqlfunc.sum(SalesLine.amount_ht)
                    / sqlfunc.nullif(sqlfunc.count(sqlfunc.distinct(SalesLine.client_sage_id)), 0),
                    0,
                ).label("avg_revenue"),
            )
            .where(
                SalesLine.client_sage_id.in_(similar_clients_sq),
                SalesLine.article_ref.isnot(None),
                SalesLine.article_ref.notin_(client_refs),
                SalesLine.article_ref.notin_(service_refs),
                SalesLine.date >= twelve_m_ago,
            )
            .group_by(SalesLine.article_ref)
            .order_by(sqlfunc.count(sqlfunc.distinct(SalesLine.client_sage_id)).desc())
            .limit(5)
        )
        for r in reco_q.all():
            upsell_recommendations.append(
                UpsellRecommendation(
                    article_ref=r.article_ref,
                    designation=r.designation or "",
                    score=round(float(r.nb_clients) / max(1, len(client_refs)) * 100, 0),
                    similar_clients_count=r.nb_clients,
                    avg_revenue=round(float(r.avg_revenue), 2),
                )
            )

    twelve_months_ago = date.today() - timedelta(days=365)

    ca_q = await db.execute(
        select(
            sqlfunc.coalesce(sqlfunc.sum(SalesLine.amount_ht), 0).label("ca_total"),
            sqlfunc.count(sqlfunc.distinct(SalesLine.sage_piece_id)).label("nb_commandes"),
            sqlfunc.max(SalesLine.date).label("last_order"),
        ).where(SalesLine.client_sage_id == client.sage_id)
    )
    ca_row = ca_q.one()
    ca_total = float(ca_row.ca_total)
    last_order = ca_row.last_order
    days_since = (date.today() - last_order).days if last_order else None

    ca_12m_q = await db.execute(
        select(
            sqlfunc.coalesce(sqlfunc.sum(SalesLine.amount_ht), 0).label("ca_12m"),
            sqlfunc.count(sqlfunc.distinct(SalesLine.sage_piece_id)).label("nb_12m"),
        ).where(SalesLine.client_sage_id == client.sage_id, SalesLine.date >= twelve_months_ago)
    )
    ca_12m_row = ca_12m_q.one()
    ca_12m = float(ca_12m_row.ca_12m)
    nb_12m = ca_12m_row.nb_12m
    avg_basket = ca_12m / nb_12m if nb_12m > 0 else 0

    insight = UpsellInsight(
        client_name=client.name,
        client_city=client.city,
        reason=entry.reason,
        reason_detail=entry.reason_detail,
        score_churn=score.churn_risk_score if score else 0,
        score_upsell=score.upsell_score if score else 0,
        days_since_last_order=days_since,
        ca_12m=round(ca_12m, 2),
        ca_total=round(ca_total, 2),
        avg_basket=round(avg_basket, 2),
        upsell_recommendations=upsell_recommendations,
        top_products=top_products,
        ai_suggestion=None,
    )

    if with_ai:
        try:
            insight.ai_suggestion = await _generate_ai_suggestion(insight, entry.reason)
        except Exception as e:
            logger.error(f"AI suggestion error: {e}")
            insight.ai_suggestion = "Erreur lors de la génération de la suggestion IA."

    return insight


async def _generate_ai_suggestion(insight: UpsellInsight, reason: str) -> str:
    from config import get_settings
    from openai import OpenAI
    import asyncio

    settings = get_settings()
    if not settings.openai_api_key:
        return "Clé API OpenAI non configurée."

    products_text = "\n".join(
        f"- {p.designation} (ref: {p.article_ref}) — {p.order_count} commandes, {p.total_ht:.0f}€ HT, dernière cde: {p.last_order_date or 'inconnue'}"
        for p in insight.top_products
    )

    reco_text = "\n".join(
        f"- {r.designation} (ref: {r.article_ref}) — acheté par {r.similar_clients_count} clients similaires, CA moyen {r.avg_revenue:.0f}€"
        for r in insight.upsell_recommendations
    ) if insight.upsell_recommendations else ""

    context_map = {
        "upsell": "Ce client a un potentiel de vente additionnelle. Analyse ses achats et suggère des produits complémentaires ou des montées en gamme.",
        "churn_risk": "Ce client risque de partir. Analyse ses achats passés et propose une stratégie de rétention personnalisée.",
        "dormant": "Ce client est inactif depuis longtemps. Propose un plan de réactivation avec des arguments concrets.",
        "new_prospect": "C'est un nouveau prospect. Propose une approche de premier contact efficace.",
        "callback": "Un rappel est prévu. Prépare les points clés à aborder.",
        "relationship": "C'est un suivi de relation. Propose des sujets de conversation pertinents basés sur l'historique.",
    }
    context_instruction = context_map.get(reason, "Propose des actions commerciales adaptées.")

    prompt = f"""Tu es un assistant commercial expert en vente B2B (secteur alimentaire/restauration).
{context_instruction}

CONTEXTE CLIENT :
- Nom : {insight.client_name}
- Ville : {insight.client_city or 'inconnue'}
- CA 12 mois : {insight.ca_12m:.0f}€
- CA total historique : {insight.ca_total:.0f}€
- Panier moyen : {insight.avg_basket:.0f}€
- Jours depuis dernière commande : {insight.days_since_last_order or 'inconnu'}
- Score churn : {insight.score_churn}%
- Score upsell : {insight.score_upsell}%
- Raison du contact : {insight.reason_detail or reason}

PRODUITS HABITUELLEMENT COMMANDÉS :
{products_text if products_text else "Aucun historique de commande"}

PRODUITS RECOMMANDÉS (achetés par des clients similaires, pas encore par ce client) :
{reco_text if reco_text else "Aucune recommandation disponible"}

Donne une recommandation en 3-5 points maximum, concise et actionnable. Chaque point doit être une phrase courte. Si des produits recommandés sont pertinents, mentionne-les. Sois direct et pragmatique."""

    def _call_openai():
        client = OpenAI(api_key=settings.openai_api_key)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=400,
            temperature=0.7,
        )
        return response.choices[0].message.content

    return await asyncio.get_event_loop().run_in_executor(None, _call_openai)
