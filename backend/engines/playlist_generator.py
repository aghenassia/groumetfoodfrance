"""
Génère les playlists quotidiennes pour chaque commercial.
Utilise le champ `status` du client (lifecycle) au lieu des booléens is_prospect/is_dormant.
Respecte le cooldown des dormants contactés.
Prend en compte le feedback de qualification pour le tri (hot_count, cold_count, mood).
"""
import logging
from datetime import date, datetime, timezone

from sqlalchemy import select, func, and_, or_, case
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert as pg_insert

from models.user import User
from models.client import Client
from models.client_score import ClientScore
from models.qualification import CallQualification
from models.call import Call
from models.playlist import DailyPlaylist
from models.playlist_config import PlaylistConfig
from models.sales_line import SalesLine
from engines.lifecycle_engine import needs_manager_review

logger = logging.getLogger(__name__)

DEFAULT_CONFIG = {
    "total_size": 15,
    "pct_callback": 10,
    "pct_dormant": 30,
    "pct_churn_risk": 25,
    "pct_upsell": 20,
    "pct_prospect": 15,
    "dormant_min_days": 90,
    "churn_min_score": 40,
    "upsell_min_score": 30,
}


async def generate_playlists(db: AsyncSession, target_date: date | None = None) -> dict:
    target = target_date or date.today()

    q = await db.execute(
        select(User).where(User.is_active == True, User.role.in_(["sales", "manager", "admin"]))
    )
    users = q.scalars().all()

    total_entries = 0
    user_details = []
    global_seen: set[str] = set()

    for user in users:
        config = await _get_config(db, user.id)
        if not config.get("is_active", True):
            continue
        entries = await _generate_for_user(db, user, target, config, global_seen)
        total_entries += entries
        user_details.append({"name": user.name, "entries": entries})
        logger.info(f"Playlist {user.name}: {entries} entrées générées")

    await db.commit()
    return {
        "users": len(user_details),
        "total_entries": total_entries,
        "date": str(target),
        "details": user_details,
    }


async def generate_playlist_for_user(
    db: AsyncSession, user_id: str, target_date: date | None = None
) -> dict:
    target = target_date or date.today()
    user_q = await db.execute(select(User).where(User.id == user_id))
    user = user_q.scalar_one_or_none()
    if not user:
        return {"error": "Utilisateur introuvable"}

    already_assigned_q = await db.execute(
        select(DailyPlaylist.client_id).where(
            DailyPlaylist.generated_date == target,
            DailyPlaylist.user_id != user_id,
        )
    )
    global_seen: set[str] = {r[0] for r in already_assigned_q.all()}

    config = await _get_config(db, user.id)
    entries = await _generate_for_user(db, user, target, config, global_seen)
    await db.commit()
    return {"user": user.name, "entries": entries, "date": str(target)}


async def _get_config(db: AsyncSession, user_id: str) -> dict:
    q = await db.execute(
        select(PlaylistConfig).where(PlaylistConfig.user_id == user_id)
    )
    cfg = q.scalar_one_or_none()
    if cfg:
        return {
            "is_active": cfg.is_active,
            "total_size": cfg.total_size,
            "pct_callback": cfg.pct_callback,
            "pct_dormant": cfg.pct_dormant,
            "pct_churn_risk": cfg.pct_churn_risk,
            "pct_upsell": cfg.pct_upsell,
            "pct_prospect": cfg.pct_prospect,
            "dormant_min_days": cfg.dormant_min_days,
            "churn_min_score": cfg.churn_min_score,
            "upsell_min_score": cfg.upsell_min_score,
            "client_scope": cfg.client_scope or "own",
            "sage_rep_filter": cfg.sage_rep_filter,
        }
    return {**DEFAULT_CONFIG, "is_active": True, "client_scope": "own", "sage_rep_filter": None}


def _slots(total: int, pcts: dict[str, int]) -> dict[str, int]:
    raw = {k: total * v / 100 for k, v in pcts.items()}
    floored = {k: int(v) for k, v in raw.items()}
    remainders = {k: raw[k] - floored[k] for k in raw}

    allocated = sum(floored.values())
    leftover = total - allocated
    for k in sorted(remainders, key=remainders.get, reverse=True):
        if leftover <= 0:
            break
        floored[k] += 1
        leftover -= 1

    return floored


def _build_assigned_filter(user: User, config: dict | None = None):
    scope = (config or {}).get("client_scope", "own")
    sage_rep = (config or {}).get("sage_rep_filter")

    if scope == "sage_rep" and sage_rep:
        return Client.sales_rep.ilike(f"%{sage_rep}%")

    if scope == "unassigned":
        return and_(
            Client.assigned_user_id.is_(None),
            or_(Client.sales_rep.is_(None), Client.sales_rep == ""),
        )

    if scope == "own_and_unassigned":
        return or_(
            Client.assigned_user_id == user.id,
            and_(
                Client.assigned_user_id.is_(None),
                or_(Client.sales_rep.is_(None), Client.sales_rep == ""),
            ),
        )

    if scope == "all":
        conditions = []
        if user.sage_rep_name:
            conditions.append(Client.sales_rep.ilike(f"%{user.sage_rep_name}%"))
        conditions.append(Client.assigned_user_id == user.id)
        return or_(*conditions) if conditions else (Client.assigned_user_id == user.id)

    # scope == "own" (default) : uniquement les entreprises assignées au commercial
    return Client.assigned_user_id == user.id


def _not_dead():
    """Exclure les clients dead de toutes les sélections."""
    return Client.status != "dead"


def _not_in_cooldown(target: date):
    """Exclure les dormants en période de cooldown."""
    return or_(
        Client.contact_cooldown_until == None,
        Client.contact_cooldown_until <= target,
    )


async def _generate_for_user(
    db: AsyncSession, user: User, target: date, config: dict,
    global_seen: set[str] | None = None,
) -> int:
    total = config["total_size"]

    slots = _slots(total, {
        "callback": config["pct_callback"],
        "dormant": config["pct_dormant"],
        "churn_risk": config["pct_churn_risk"],
        "upsell": config["pct_upsell"],
        "prospect": config["pct_prospect"],
    })

    assigned = _build_assigned_filter(user, config)
    seen_clients: set[str] = set(global_seen) if global_seen else set()
    entries: list[dict] = []
    priority = 0

    # --- 1. CALLBACKS (rappels planifiés) ---
    max_cb = max(slots["callback"], 3)
    callbacks = await db.execute(
        select(CallQualification).where(
            CallQualification.user_id == user.id,
            CallQualification.next_step_date == target,
        ).limit(max_cb)
    )
    for qualif in callbacks.scalars().all():
        call_q = await db.execute(select(Call.client_id).where(Call.id == qualif.call_id))
        client_id = call_q.scalar()
        if client_id and client_id not in seen_clients:
            priority += 1
            seen_clients.add(client_id)
            entries.append(_entry(user.id, client_id, target, priority,
                                  "callback", qualif.next_step or "Rappel prévu", 100))

    # --- 2. DORMANTS (status = 'dormant', respecte cooldown) ---
    dormant_q = await db.execute(
        select(
            Client.id, Client.name, Client.dormant_contact_count,
            ClientScore.days_since_last_order,
        )
        .outerjoin(ClientScore, ClientScore.client_id == Client.id)
        .where(
            assigned,
            _not_dead(),
            Client.status == "dormant",
            _not_in_cooldown(target),
            Client.id.notin_(seen_clients) if seen_clients else True,
        )
        .order_by(
            # Priorité : dormants nécessitant décision managériale d'abord
            case(
                (Client.dormant_contact_count >= 5, 0),
                else_=1,
            ),
            ClientScore.last_order_date.asc().nullsfirst(),
        )
        .limit(slots["dormant"] + 5)
    )
    for row in dormant_q.all():
        if len([e for e in entries if e["reason"] == "dormant"]) >= slots["dormant"]:
            break
        cid = row[0]
        if cid in seen_clients:
            continue
        days = row[3] if row[3] else 999
        contact_count = row[2] or 0
        detail = f"Inactif depuis {days}j"
        if contact_count >= 5:
            detail += f" — ⚠ {contact_count} tentatives, décision requise"
        priority += 1
        seen_clients.add(cid)
        entries.append(_entry(user.id, cid, target, priority,
                              "dormant", detail, min(days, 100)))

    # --- 3. CHURN RISK (status = 'at_risk') ---
    churn_min = config["churn_min_score"]
    churn_q = await db.execute(
        select(Client.id, ClientScore.churn_risk_score, ClientScore.days_since_last_order)
        .join(ClientScore, ClientScore.client_id == Client.id)
        .where(
            assigned,
            _not_dead(),
            Client.status == "at_risk",
            ClientScore.churn_risk_score >= churn_min,
            Client.id.notin_(seen_clients) if seen_clients else True,
        )
        .order_by(
            # Hot clients en priorité (feedback qualification)
            Client.qualification_hot_count.desc(),
            ClientScore.churn_risk_score.desc(),
        )
        .limit(slots["churn_risk"] + 5)
    )
    for row in churn_q.all():
        if len([e for e in entries if e["reason"] == "churn_risk"]) >= slots["churn_risk"]:
            break
        cid, churn_score, days = row
        if cid in seen_clients:
            continue
        priority += 1
        seen_clients.add(cid)
        entries.append(_entry(user.id, cid, target, priority,
                              "churn_risk", f"Risque churn {churn_score}% — {days}j sans cde", churn_score))

    # --- 4. UPSELL (status = 'client', score élevé) ---
    upsell_min = config["upsell_min_score"]
    upsell_q = await db.execute(
        select(Client.id, ClientScore.upsell_score)
        .join(ClientScore, ClientScore.client_id == Client.id)
        .where(
            assigned,
            _not_dead(),
            Client.status.in_(["client", "at_risk"]),
            ClientScore.upsell_score >= upsell_min,
            Client.id.notin_(seen_clients) if seen_clients else True,
        )
        .order_by(
            Client.qualification_hot_count.desc(),
            ClientScore.upsell_score.desc(),
        )
        .limit(slots["upsell"] + 5)
    )
    for row in upsell_q.all():
        if len([e for e in entries if e["reason"] == "upsell"]) >= slots["upsell"]:
            break
        cid, upsell_score = row
        if cid in seen_clients:
            continue
        priority += 1
        seen_clients.add(cid)
        entries.append(_entry(user.id, cid, target, priority,
                              "upsell", f"Potentiel upsell {upsell_score}%", upsell_score))

    # --- 5. PROSPECTS + LEADS (status in ('prospect', 'lead')) ---
    prospect_q = await db.execute(
        select(Client.id, Client.name, Client.status)
        .where(
            assigned,
            _not_dead(),
            Client.status.in_(["prospect", "lead"]),
            Client.id.notin_(seen_clients) if seen_clients else True,
        )
        .order_by(
            # Leads avant prospects (déjà contactés avec succès)
            case(
                (Client.status == "lead", 0),
                else_=1,
            ),
            Client.qualification_hot_count.desc(),
            func.random(),
        )
        .limit(slots["prospect"] + 3)
    )
    for row in prospect_q.all():
        if len([e for e in entries if e["reason"] == "new_prospect"]) >= slots["prospect"]:
            break
        cid, name, status = row
        if cid in seen_clients:
            continue
        priority += 1
        seen_clients.add(cid)
        label = "Lead qualifié à relancer" if status == "lead" else "Prospect à contacter"
        entries.append(_entry(user.id, cid, target, priority,
                              "new_prospect", label, 30 if status == "lead" else 20))

    # --- 6. COMPLÉMENT (clients actifs, tri par feedback + CA) ---
    if len(entries) < total:
        remaining = total - len(entries)
        filler_q = await db.execute(
            select(Client.id, func.sum(SalesLine.amount_ht).label("ca"))
            .outerjoin(SalesLine, SalesLine.client_sage_id == Client.sage_id)
            .where(
                assigned,
                _not_dead(),
                Client.status == "client",
                Client.id.notin_(seen_clients) if seen_clients else True,
            )
            .group_by(Client.id)
            .order_by(
                Client.qualification_hot_count.desc(),
                func.random(),
            )
            .limit(remaining + 5)
        )
        for row in filler_q.all():
            if len(entries) >= total:
                break
            cid = row[0]
            if cid in seen_clients:
                continue
            priority += 1
            seen_clients.add(cid)
            entries.append(_entry(user.id, cid, target, priority,
                                  "relationship", "Suivi relation client", 10))

    for entry in entries[:total]:
        stmt = pg_insert(DailyPlaylist).values(**entry)
        stmt = stmt.on_conflict_do_nothing(constraint="uq_playlist_entry")
        await db.execute(stmt)

    if global_seen is not None:
        global_seen.update(seen_clients)

    return len(entries[:total])


def _entry(user_id: str, client_id: str, target: date,
           priority: int, reason: str, detail: str, score: int) -> dict:
    return {
        "user_id": user_id,
        "client_id": client_id,
        "generated_date": target,
        "priority": priority,
        "reason": reason,
        "reason_detail": detail,
        "score": score,
        "status": "pending",
    }
