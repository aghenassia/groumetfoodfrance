"""
Moteur de lifecycle des clients.
Gère toutes les transitions automatiques et manuelles du statut client.

Règle fondamentale :
  Un client qui possède au moins une commande Sage N'EST JAMAIS un prospect.
  Le statut est déterminé prioritairement par l'historique de commandes,
  et secondairement par les interactions téléphoniques.

Lifecycle :
  prospect → client/dormant : automatique dès qu'une commande existe en base
  prospect → lead           : appel décroché > 30s (uniquement si 0 commande)
  lead → client             : première sales_line rattachée (sync Sage)
  client → at_risk          : churn_risk_score ≥ 60 (scoring quotidien)
  at_risk → dormant         : days_since_last_order ≥ 180 (scoring quotidien)
  dormant → client          : nouvelle commande détectée (réactivation)
  * → dead                  : MANUEL uniquement (outcome='not_interested')
  dead → (rien)             : pas de transition automatique depuis dead

Cooldown dormant :
  Quand un dormant est contacté (appel >30s), il sort de la playlist pour
  COOLDOWN_DAYS jours. Après MAX_DORMANT_ATTEMPTS tentatives sur
  MAX_DORMANT_MONTHS mois sans commande, il remonte pour décision managériale.
"""
import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select, update as sql_update
from sqlalchemy.ext.asyncio import AsyncSession

from models.client import Client
from models.contact import Contact
from models.call import Call

logger = logging.getLogger(__name__)

COOLDOWN_DAYS = 14
MAX_DORMANT_ATTEMPTS = 5
MAX_DORMANT_MONTHS = 6


async def on_call_answered(db: AsyncSession, call: Call) -> str | None:
    """Appelé quand un appel décroché > 30s est matché sur un client.
    Transition prospect → lead. Cooldown pour les dormants.
    Résout la company via contact.company_id si client_id absent."""
    company_id = call.client_id
    if not company_id and call.contact_id:
        contact_q = await db.execute(
            select(Contact.company_id).where(Contact.id == call.contact_id)
        )
        company_id = contact_q.scalar()
    if not company_id:
        return None
    if not call.is_answered or (call.incall_duration or 0) <= 30:
        return None

    client_q = await db.execute(
        select(Client).where(Client.id == company_id)
    )
    client = client_q.scalar_one_or_none()
    if not client:
        return None

    now = datetime.now(timezone.utc)

    if client.status == "prospect":
        await db.execute(
            sql_update(Client).where(Client.id == client.id).values(
                status="lead",
                status_changed_at=now,
                is_prospect=False,
            )
        )
        logger.info(f"Lifecycle: {client.name} prospect → lead (appel {call.incall_duration}s)")
        return "lead"

    if client.status == "dormant":
        cooldown_until = (date.today() + timedelta(days=COOLDOWN_DAYS))
        new_count = (client.dormant_contact_count or 0) + 1
        first_contact = client.dormant_first_contact_at or date.today()

        await db.execute(
            sql_update(Client).where(Client.id == client.id).values(
                contact_cooldown_until=cooldown_until,
                dormant_contact_count=new_count,
                dormant_first_contact_at=first_contact,
            )
        )
        logger.info(
            f"Lifecycle: dormant {client.name} contacté ({new_count}x), "
            f"cooldown jusqu'au {cooldown_until}"
        )
        return "dormant_contacted"

    return None


async def on_qualification(
    db: AsyncSession, client_id: str, mood: str | None,
    outcome: str | None, tags: list[str] | None, notes: str | None,
) -> str | None:
    """Appelé après qualification d'un appel.
    Met à jour les métriques de qualification sur la fiche client.
    Gère la transition manuelle vers dead."""
    if not client_id:
        return None

    client_q = await db.execute(
        select(Client).where(Client.id == client_id)
    )
    client = client_q.scalar_one_or_none()
    if not client:
        return None

    now = datetime.now(timezone.utc)
    updates: dict = {
        "last_qualification_mood": mood,
        "last_qualification_outcome": outcome,
        "last_qualification_at": now,
    }

    if mood == "hot":
        updates["qualification_hot_count"] = (client.qualification_hot_count or 0) + 1
    elif mood == "cold":
        updates["qualification_cold_count"] = (client.qualification_cold_count or 0) + 1

    if outcome == "not_interested" and client.status != "dead":
        updates["status"] = "dead"
        updates["status_changed_at"] = now
        updates["is_dormant"] = False
        updates["is_prospect"] = False
        logger.info(f"Lifecycle: {client.name} → dead (outcome=not_interested)")

    await db.execute(
        sql_update(Client).where(Client.id == client_id).values(**updates)
    )

    return updates.get("status")


async def on_new_sales_line(db: AsyncSession, client_id: str) -> str | None:
    """Appelé quand une nouvelle sales_line est rattachée à un client.
    Transitions : lead → client, dormant → client (réactivation)."""
    if not client_id:
        return None

    client_q = await db.execute(
        select(Client).where(Client.id == client_id)
    )
    client = client_q.scalar_one_or_none()
    if not client:
        return None

    if client.status in ("lead", "prospect"):
        now = datetime.now(timezone.utc)
        await db.execute(
            sql_update(Client).where(Client.id == client.id).values(
                status="client",
                status_changed_at=now,
                is_prospect=False,
            )
        )
        logger.info(f"Lifecycle: {client.name} {client.status} → client (première vente)")
        return "client"

    if client.status == "dormant":
        now = datetime.now(timezone.utc)
        await db.execute(
            sql_update(Client).where(Client.id == client.id).values(
                status="client",
                status_changed_at=now,
                is_dormant=False,
                dormant_contact_count=0,
                dormant_first_contact_at=None,
                contact_cooldown_until=None,
            )
        )
        logger.info(f"Lifecycle: {client.name} dormant → client (réactivation)")
        return "client"

    return None


def needs_manager_review(client: Client) -> bool:
    """Vérifie si un dormant a atteint les seuils de tentatives
    et doit être escaladé pour décision managériale (dead ou pas)."""
    if client.status != "dormant":
        return False
    if (client.dormant_contact_count or 0) < MAX_DORMANT_ATTEMPTS:
        return False
    if not client.dormant_first_contact_at:
        return False
    months_elapsed = (date.today() - client.dormant_first_contact_at).days / 30
    return months_elapsed >= MAX_DORMANT_MONTHS
