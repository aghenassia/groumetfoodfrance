"""
Moteur de scoring RFM (Recency, Frequency, Monetary).
Calcule le churn risk, l'upsell score et la priorité globale pour chaque client.
Gère les transitions automatiques du lifecycle :
  client → at_risk → dormant (basé sur le ratio RFM)
  dormant → client (réactivation si nouvelle commande détectée)
"""
import logging
from datetime import date, datetime, timezone, timedelta

from sqlalchemy import select, func, distinct, update as sql_update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert as pg_insert

from models.client import Client
from models.sales_line import SalesLine
from models.client_score import ClientScore

logger = logging.getLogger(__name__)

DORMANT_THRESHOLD_DAYS = 180
AT_RISK_CHURN_MIN = 60


async def compute_all_scores(db: AsyncSession) -> dict:
    """Recalcule les scores pour tous les clients ayant au moins une commande,
    puis met à jour le lifecycle status automatiquement."""
    today = date.today()
    twelve_months_ago = today - timedelta(days=365)

    stmt = select(
        SalesLine.client_sage_id,
        func.max(SalesLine.date).label("last_order_date"),
        func.count(distinct(SalesLine.sage_piece_id)).label("order_count_total"),
        func.sum(SalesLine.amount_ht).label("total_revenue_all"),
        func.sum(SalesLine.margin_value).label("total_margin_all"),
    ).group_by(SalesLine.client_sage_id)

    result = await db.execute(stmt)
    all_stats = {row.client_sage_id: row for row in result.all()}

    stmt_12m = select(
        SalesLine.client_sage_id,
        func.count(distinct(SalesLine.sage_piece_id)).label("order_count_12m"),
        func.sum(SalesLine.amount_ht).label("total_revenue_12m"),
        func.sum(SalesLine.margin_value).label("total_margin_12m"),
    ).where(SalesLine.date >= twelve_months_ago).group_by(SalesLine.client_sage_id)

    result_12m = await db.execute(stmt_12m)
    stats_12m = {row.client_sage_id: row for row in result_12m.all()}

    all_baskets = []
    for sage_id, stats in all_stats.items():
        count = stats.order_count_total or 1
        rev = float(stats.total_revenue_all or 0)
        all_baskets.append(rev / count)
    all_baskets.sort()
    median_basket = all_baskets[len(all_baskets) // 2] if all_baskets else 0

    q = await db.execute(select(Client.sage_id, Client.id, Client.status))
    client_rows = {row[0]: (row[1], row[2]) for row in q.all()}

    scored = 0
    transitions = {"to_at_risk": 0, "to_dormant": 0, "to_client": 0}

    for sage_id, stats in all_stats.items():
        client_data = client_rows.get(sage_id)
        if not client_data:
            continue
        client_id, current_status = client_data

        s12 = stats_12m.get(sage_id)

        order_count_total = stats.order_count_total or 0
        total_rev_all = float(stats.total_revenue_all or 0)
        last_order = stats.last_order_date
        days_since = (today - last_order).days if last_order else 9999

        order_count_12m = s12.order_count_12m if s12 else 0
        total_rev_12m = float(s12.total_revenue_12m or 0) if s12 else 0
        total_margin_12m = float(s12.total_margin_12m or 0) if s12 else 0

        first_order_stmt = select(func.min(SalesLine.date)).where(
            SalesLine.client_sage_id == sage_id
        )
        first_result = await db.execute(first_order_stmt)
        first_order_date = first_result.scalar()

        if first_order_date and order_count_total > 1:
            span_days = (today - first_order_date).days
            avg_freq = span_days / (order_count_total - 1) if order_count_total > 1 else span_days
        else:
            avg_freq = None

        avg_basket = total_rev_12m / order_count_12m if order_count_12m > 0 else 0
        avg_margin = (total_margin_12m / total_rev_12m * 100) if total_rev_12m > 0 else 0

        churn = _compute_churn_risk(
            days_since, avg_freq, order_count_total, order_count_12m,
            total_rev_all, total_rev_12m, avg_basket, median_basket,
        )

        # Upsell prend en compte le feedback de qualification
        upsell = min(100, int(order_count_12m * 5 + avg_basket / 50)) if order_count_12m > 0 else 0

        global_priority = int(churn * 0.5 + upsell * 0.3 + min(100, total_rev_12m / 100) * 0.2)

        values = {
            "client_id": client_id,
            "last_order_date": last_order,
            "days_since_last_order": days_since,
            "order_count_12m": order_count_12m,
            "order_count_total": order_count_total,
            "avg_frequency_days": round(avg_freq, 1) if avg_freq else None,
            "avg_basket": round(avg_basket, 2),
            "total_revenue_12m": round(total_rev_12m, 2),
            "total_revenue_all": round(total_rev_all, 2),
            "total_margin_12m": round(total_margin_12m, 2),
            "avg_margin_percent": round(avg_margin, 2),
            "churn_risk_score": churn,
            "upsell_score": upsell,
            "global_priority_score": global_priority,
            "computed_at": datetime.now(timezone.utc),
        }

        stmt = pg_insert(ClientScore).values(**values)
        stmt = stmt.on_conflict_do_update(
            index_elements=["client_id"],
            set_={k: v for k, v in values.items() if k != "client_id"},
        )
        await db.execute(stmt)
        scored += 1

        # --- LIFECYCLE TRANSITIONS ---
        new_status = _compute_new_status(current_status, churn, days_since, order_count_12m, order_count_total)
        if new_status and new_status != current_status:
            await _transition_client(db, client_id, current_status, new_status)
            if new_status == "at_risk":
                transitions["to_at_risk"] += 1
            elif new_status == "dormant":
                transitions["to_dormant"] += 1
            elif new_status == "client":
                transitions["to_client"] += 1

    await db.commit()
    logger.info(f"Scoring terminé: {scored} clients, transitions: {transitions}")
    return {"clients_scored": scored, "transitions": transitions}


def _compute_new_status(
    current: str, churn_score: int, days_since: int,
    order_count_12m: int, order_count_total: int = 0,
) -> str | None:
    """Détermine la transition automatique de status basée sur le scoring.

    Règle fondamentale : un client qui a des commandes en base n'est JAMAIS
    un prospect/lead. Le scoring corrige automatiquement les incohérences.
    """
    if current == "dead":
        return None

    if current == "dormant" and order_count_12m > 0 and days_since < 90:
        return "client"

    if current in ("prospect", "lead"):
        if order_count_total > 0:
            if days_since >= DORMANT_THRESHOLD_DAYS:
                return "dormant"
            if churn_score >= AT_RISK_CHURN_MIN:
                return "at_risk"
            return "client"
        return None

    if current in ("client", "at_risk"):
        if days_since >= DORMANT_THRESHOLD_DAYS:
            return "dormant"
        if churn_score >= AT_RISK_CHURN_MIN:
            return "at_risk"
        if churn_score < AT_RISK_CHURN_MIN and current == "at_risk":
            return "client"

    return None


async def _transition_client(
    db: AsyncSession, client_id: str, old_status: str, new_status: str
):
    """Applique une transition de status sur un client."""
    now = datetime.now(timezone.utc)
    update_vals: dict = {
        "status": new_status,
        "status_changed_at": now,
        "is_dormant": new_status == "dormant",
        "is_prospect": new_status == "prospect",
    }

    if new_status == "client" and old_status == "dormant":
        update_vals["dormant_contact_count"] = 0
        update_vals["dormant_first_contact_at"] = None
        update_vals["contact_cooldown_until"] = None

    await db.execute(
        sql_update(Client).where(Client.id == client_id).values(**update_vals)
    )
    logger.info(f"Client {client_id}: {old_status} → {new_status}")


def _compute_churn_risk(
    days_since: int,
    avg_freq: float | None,
    order_count_total: int,
    order_count_12m: int,
    total_revenue_all: float,
    total_revenue_12m: float,
    avg_basket: float,
    median_basket: float,
) -> int:
    """Scoring multi-facteurs :
    - Recency (0-40)        : temps absolu depuis dernière commande
    - Freq deviation (0-35) : retard vs rythme habituel (≥3 commandes)
    - Tendance (0-25)       : déclin d'activité / arrêt complet
    """
    score = 0

    # --- Recency (0-40) ---
    if days_since <= 30:
        recency = 0
    elif days_since <= 60:
        recency = 10
    elif days_since <= 90:
        recency = 20
    elif days_since <= 180:
        recency = 30
    else:
        recency = 40
    score += recency

    # --- Frequency deviation (0-35) ---
    if avg_freq and avg_freq > 0 and order_count_total >= 3:
        ratio = days_since / avg_freq
        if ratio <= 1.2:
            freq_dev = 0
        elif ratio <= 1.8:
            freq_dev = 10
        elif ratio <= 2.5:
            freq_dev = 20
        elif ratio <= 4.0:
            freq_dev = 30
        else:
            freq_dev = 35
        score += freq_dev
    elif order_count_total <= 2 and days_since > 180:
        score += 20

    # --- Tendance d'activité (0-25) ---
    if order_count_total >= 3:
        if order_count_12m == 0:
            score += 20
        elif avg_freq and avg_freq > 0:
            expected_annual = 365 / avg_freq
            if expected_annual > 0:
                activity_ratio = order_count_12m / expected_annual
                if activity_ratio < 0.5:
                    score += 15
                elif activity_ratio < 0.7:
                    score += 8

    if order_count_total >= 5 and avg_freq and avg_freq > 0:
        lifespan_years = max(1.0, (order_count_total * avg_freq) / 365)
        avg_annual_rev = total_revenue_all / lifespan_years
        if avg_annual_rev > 0 and total_revenue_12m < avg_annual_rev * 0.3:
            score += 5

    # --- Bonus haute valeur ---
    if avg_basket > median_basket * 2 and score > 0:
        score = min(100, score + 5)

    return min(100, score)
