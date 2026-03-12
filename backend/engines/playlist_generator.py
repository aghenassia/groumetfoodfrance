"""
Génère les playlists (To Do) quotidiennes pour chaque commercial.

Règles clés :
- Les rappels (callback) et ajouts manuels sont HORS BUDGET : ils ne consomment pas de slot %
- L'empilement : la génération n'écrase jamais les entrées pending existantes
- Anti-duplication cross-user : un client pending chez un user ne peut pas aller chez un autre
- Anti-duplication phone : deux clients avec le même numéro ne sont pas proposés dans la même To Do
- Filtres intel : l'admin peut cibler des concurrents, fournisseurs, produits ou familles
"""
import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select, func, and_, or_, case, exists
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
from models.client_intel import ClientSupplier, ClientCompetitor, ClientProductInterest
from models.product import Product

logger = logging.getLogger(__name__)

DEFAULT_CONFIG = {
    "total_size": 15,
    "pct_dormant": 35,
    "pct_churn_risk": 25,
    "pct_upsell": 25,
    "pct_prospect": 15,
    "dormant_min_days": 90,
    "churn_min_score": 40,
    "upsell_min_score": 30,
}

CROSS_USER_LOOKBACK_DAYS = 7


async def generate_playlists(db: AsyncSession, target_date: date | None = None) -> dict:
    target = target_date or date.today()

    q = await db.execute(
        select(User).where(User.is_active == True, User.role.in_(["sales", "manager", "admin"]))
    )
    users = q.scalars().all()

    global_seen: set[str] = set()
    seen_phones: set[str] = set()

    total_entries = 0
    user_details = []

    for user in users:
        config = await _get_config(db, user.id)
        if not config.get("is_active", True):
            continue
        entries = await _generate_for_user(db, user, target, config, global_seen, seen_phones)
        total_entries += entries
        user_details.append({"name": user.name, "entries": entries})
        logger.info(f"To Do {user.name}: {entries} entrées générées")

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

    global_seen: set[str] = set()
    seen_phones: set[str] = set()

    config = await _get_config(db, user.id)
    entries = await _generate_for_user(db, user, target, config, global_seen, seen_phones)
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
            "pct_dormant": cfg.pct_dormant,
            "pct_churn_risk": cfg.pct_churn_risk,
            "pct_upsell": cfg.pct_upsell,
            "pct_prospect": cfg.pct_prospect,
            "dormant_min_days": cfg.dormant_min_days,
            "churn_min_score": cfg.churn_min_score,
            "upsell_min_score": cfg.upsell_min_score,
            "client_scope": cfg.client_scope or "own",
            "sage_rep_filter": cfg.sage_rep_filter,
            "filter_mode": getattr(cfg, "filter_mode", None) or "disabled",
            "filter_competitor_ids": getattr(cfg, "filter_competitor_ids", None) or [],
            "filter_supplier_ids": getattr(cfg, "filter_supplier_ids", None) or [],
            "filter_product_refs": getattr(cfg, "filter_product_refs", None) or [],
            "filter_product_families": getattr(cfg, "filter_product_families", None) or [],
        }
    return {
        **DEFAULT_CONFIG,
        "is_active": True,
        "client_scope": "own",
        "sage_rep_filter": None,
        "filter_mode": "disabled",
        "filter_competitor_ids": [],
        "filter_supplier_ids": [],
        "filter_product_refs": [],
        "filter_product_families": [],
    }


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
        if user.role == "admin":
            return True
        conditions = []
        if user.sage_rep_name:
            conditions.append(Client.sales_rep.ilike(f"%{user.sage_rep_name}%"))
        conditions.append(Client.assigned_user_id == user.id)
        return or_(*conditions) if conditions else (Client.assigned_user_id == user.id)

    return Client.assigned_user_id == user.id


def _not_dead():
    return Client.status != "dead"


def _not_in_cooldown(target: date):
    return or_(
        Client.contact_cooldown_until == None,
        Client.contact_cooldown_until <= target,
    )


def _build_intel_filter(config: dict):
    """Build a list of EXISTS filters based on intel config (competitors, suppliers, products, families)."""
    filters = []
    competitor_ids = config.get("filter_competitor_ids") or []
    supplier_ids = config.get("filter_supplier_ids") or []
    product_refs = config.get("filter_product_refs") or []
    product_families = config.get("filter_product_families") or []

    if competitor_ids:
        filters.append(exists(
            select(ClientCompetitor.id).where(
                ClientCompetitor.client_id == Client.id,
                ClientCompetitor.competitor_id.in_(competitor_ids),
            )
        ))
    if supplier_ids:
        filters.append(exists(
            select(ClientSupplier.id).where(
                ClientSupplier.client_id == Client.id,
                ClientSupplier.supplier_id.in_(supplier_ids),
            )
        ))
    if product_refs:
        filters.append(exists(
            select(ClientProductInterest.id).where(
                ClientProductInterest.client_id == Client.id,
                ClientProductInterest.article_ref.in_(product_refs),
            )
        ))
    if product_families:
        filters.append(exists(
            select(ClientProductInterest.id)
            .join(Product, Product.article_ref == ClientProductInterest.article_ref)
            .where(
                ClientProductInterest.client_id == Client.id,
                Product.family.in_(product_families),
            )
        ))

    return filters


async def _generate_for_user(
    db: AsyncSession, user: User, target: date, config: dict,
    global_seen: set[str] | None = None,
    seen_phones: set[str] | None = None,
) -> int:
    total = config["total_size"]

    slots = _slots(total, {
        "dormant": config.get("pct_dormant", 35),
        "churn_risk": config.get("pct_churn_risk", 25),
        "upsell": config.get("pct_upsell", 25),
        "prospect": config.get("pct_prospect", 15),
    })

    assigned = _build_assigned_filter(user, config)
    seen_clients: set[str] = set(global_seen) if global_seen else set()
    phone_seen: set[str] = set(seen_phones) if seen_phones else set()
    entries: list[dict] = []
    priority = 0

    # --- Load existing pending entries for this user (stacking: don't overwrite) ---
    existing_pending_q = await db.execute(
        select(DailyPlaylist.client_id).where(
            DailyPlaylist.user_id == user.id,
            DailyPlaylist.status == "pending",
        )
    )
    for r in existing_pending_q.all():
        seen_clients.add(r[0])

    # --- Cross-user dedup: exclude clients pending in other users' To Do (last N days) ---
    cross_user_q = await db.execute(
        select(DailyPlaylist.client_id).where(
            DailyPlaylist.status == "pending",
            DailyPlaylist.generated_date >= target - timedelta(days=CROSS_USER_LOOKBACK_DAYS),
            DailyPlaylist.user_id != user.id,
        )
    )
    for r in cross_user_q.all():
        seen_clients.add(r[0])

    # --- Load existing manual/callback entries for this date (protect reminders) ---
    protected_q = await db.execute(
        select(DailyPlaylist.client_id).where(
            DailyPlaylist.user_id == user.id,
            DailyPlaylist.generated_date == target,
            DailyPlaylist.reason.in_(["callback", "manual"]),
        )
    )
    for r in protected_q.all():
        seen_clients.add(r[0])

    # --- Phone dedup helper ---
    async def _check_phone_dup(client_id: str) -> bool:
        """Returns True if this client's phone is already seen (duplicate phone)."""
        ph_q = await db.execute(
            select(Client.phone_e164).where(Client.id == client_id)
        )
        phone = ph_q.scalar()
        if phone and phone in phone_seen:
            return True
        if phone:
            phone_seen.add(phone)
        return False

    def _add_seen(cid: str):
        seen_clients.add(cid)

    # --- 0. CALLBACKS (rappels planifiés) — HORS BUDGET ---
    callbacks = await db.execute(
        select(CallQualification).where(
            CallQualification.user_id == user.id,
            CallQualification.next_step_date == target,
        ).limit(20)
    )
    for qualif in callbacks.scalars().all():
        call_q = await db.execute(select(Call.client_id).where(Call.id == qualif.call_id))
        client_id = call_q.scalar()
        if client_id and client_id not in seen_clients:
            if await _check_phone_dup(client_id):
                continue
            priority += 1
            _add_seen(client_id)
            entries.append(_entry(user.id, client_id, target, priority,
                                  "callback", qualif.next_step or "Rappel prévu", 100))

    # --- Check filter mode ---
    filter_mode = config.get("filter_mode", "disabled")
    intel_filters = _build_intel_filter(config)
    has_intel = bool(intel_filters)

    if filter_mode == "dedicated_pool" and has_intel:
        # 100% of To Do filled from intel-matched clients
        intel_condition = and_(*intel_filters) if len(intel_filters) > 1 else intel_filters[0]
        pool_q = await db.execute(
            select(Client.id, Client.name, Client.status)
            .where(
                assigned, _not_dead(), intel_condition,
                Client.id.notin_(seen_clients) if seen_clients else True,
            )
            .order_by(Client.qualification_hot_count.desc(), func.random())
            .limit(total + 5)
        )
        for row in pool_q.all():
            if len(entries) - len([e for e in entries if e["reason"] == "callback"]) >= total:
                break
            cid, name, status = row
            if cid in seen_clients:
                continue
            if await _check_phone_dup(cid):
                continue
            priority += 1
            _add_seen(cid)
            entries.append(_entry(user.id, cid, target, priority,
                                  "intel_target", f"Opé éclair — {name}", 80))
    else:
        # Standard distribution
        await _fill_dormants(db, user, target, config, assigned, slots, seen_clients, phone_seen, entries, priority)
        priority = max(e["priority"] for e in entries) if entries else priority
        await _fill_churn_risk(db, config, assigned, slots, seen_clients, phone_seen, entries, priority)
        priority = max(e["priority"] for e in entries) if entries else priority
        await _fill_upsell(db, config, assigned, slots, seen_clients, phone_seen, entries, priority)
        priority = max(e["priority"] for e in entries) if entries else priority

        if filter_mode == "replace_prospects" and has_intel:
            await _fill_intel_prospects(db, config, assigned, intel_filters, slots, seen_clients, phone_seen, entries, priority)
        else:
            await _fill_prospects(db, assigned, slots, seen_clients, phone_seen, entries, priority)
        priority = max(e["priority"] for e in entries) if entries else priority

        # Filler
        non_cb_count = len([e for e in entries if e["reason"] != "callback"])
        if non_cb_count < total:
            await _fill_relationship(db, user, assigned, total - non_cb_count, seen_clients, phone_seen, entries, priority)

    # Insert new entries (callbacks are hors budget, so we insert all)
    non_callback_entries = [e for e in entries if e["reason"] != "callback"]
    callback_entries = [e for e in entries if e["reason"] == "callback"]

    for entry in callback_entries + non_callback_entries[:total]:
        stmt = pg_insert(DailyPlaylist).values(**entry)
        stmt = stmt.on_conflict_do_nothing(constraint="uq_playlist_entry")
        await db.execute(stmt)

    if global_seen is not None:
        global_seen.update(seen_clients)
    if seen_phones is not None:
        seen_phones.update(phone_seen)

    return len(callback_entries) + len(non_callback_entries[:total])


# ── Section fillers ───────────────────────────────────────


async def _fill_dormants(db, user, target, config, assigned, slots, seen_clients, phone_seen, entries, priority):
    dormant_q = await db.execute(
        select(Client.id, Client.name, Client.dormant_contact_count, ClientScore.days_since_last_order)
        .outerjoin(ClientScore, ClientScore.client_id == Client.id)
        .where(assigned, _not_dead(), Client.status == "dormant", _not_in_cooldown(target),
               Client.id.notin_(seen_clients) if seen_clients else True)
        .order_by(case((Client.dormant_contact_count >= 5, 0), else_=1), ClientScore.last_order_date.asc().nullsfirst())
        .limit(slots["dormant"] + 5)
    )
    count = 0
    for row in dormant_q.all():
        if count >= slots["dormant"]:
            break
        cid = row[0]
        if cid in seen_clients:
            continue
        ph_q = await db.execute(select(Client.phone_e164).where(Client.id == cid))
        phone = ph_q.scalar()
        if phone and phone in phone_seen:
            continue
        if phone:
            phone_seen.add(phone)
        days = row[3] if row[3] else 999
        contact_count = row[2] or 0
        detail = f"Inactif depuis {days}j"
        if contact_count >= 5:
            detail += f" — ⚠ {contact_count} tentatives, décision requise"
        priority += 1
        seen_clients.add(cid)
        entries.append(_entry(user.id, cid, target, priority, "dormant", detail, min(days, 100)))
        count += 1


async def _fill_churn_risk(db, config, assigned, slots, seen_clients, phone_seen, entries, priority):
    churn_min = config["churn_min_score"]
    churn_q = await db.execute(
        select(Client.id, Client.phone_e164, ClientScore.churn_risk_score, ClientScore.days_since_last_order)
        .join(ClientScore, ClientScore.client_id == Client.id)
        .where(assigned, _not_dead(), Client.status == "at_risk",
               ClientScore.churn_risk_score >= churn_min,
               Client.id.notin_(seen_clients) if seen_clients else True)
        .order_by(Client.qualification_hot_count.desc(), ClientScore.churn_risk_score.desc())
        .limit(slots["churn_risk"] + 5)
    )
    count = 0
    for row in churn_q.all():
        if count >= slots["churn_risk"]:
            break
        cid, phone, churn_score, days = row
        if cid in seen_clients:
            continue
        if phone and phone in phone_seen:
            continue
        if phone:
            phone_seen.add(phone)
        priority += 1
        seen_clients.add(cid)
        user_id = entries[0]["user_id"] if entries else None
        entries.append(_entry(user_id or "", cid, entries[0]["generated_date"] if entries else date.today(),
                              priority, "churn_risk", f"Risque churn {churn_score}% — {days}j sans cde", churn_score))
        count += 1


async def _fill_upsell(db, config, assigned, slots, seen_clients, phone_seen, entries, priority):
    upsell_min = config["upsell_min_score"]
    upsell_q = await db.execute(
        select(Client.id, Client.phone_e164, ClientScore.upsell_score)
        .join(ClientScore, ClientScore.client_id == Client.id)
        .where(assigned, _not_dead(), Client.status.in_(["client", "at_risk"]),
               ClientScore.upsell_score >= upsell_min,
               Client.id.notin_(seen_clients) if seen_clients else True)
        .order_by(Client.qualification_hot_count.desc(), ClientScore.upsell_score.desc())
        .limit(slots["upsell"] + 5)
    )
    count = 0
    for row in upsell_q.all():
        if count >= slots["upsell"]:
            break
        cid, phone, upsell_score = row
        if cid in seen_clients:
            continue
        if phone and phone in phone_seen:
            continue
        if phone:
            phone_seen.add(phone)
        priority += 1
        seen_clients.add(cid)
        user_id = entries[0]["user_id"] if entries else None
        entries.append(_entry(user_id or "", cid, entries[0]["generated_date"] if entries else date.today(),
                              priority, "upsell", f"Potentiel upsell {upsell_score}%", upsell_score))
        count += 1


async def _fill_prospects(db, assigned, slots, seen_clients, phone_seen, entries, priority):
    prospect_q = await db.execute(
        select(Client.id, Client.name, Client.status, Client.phone_e164)
        .where(assigned, _not_dead(), Client.status.in_(["prospect", "lead"]),
               Client.id.notin_(seen_clients) if seen_clients else True)
        .order_by(case((Client.status == "lead", 0), else_=1), Client.qualification_hot_count.desc(), func.random())
        .limit(slots["prospect"] + 3)
    )
    count = 0
    for row in prospect_q.all():
        if count >= slots["prospect"]:
            break
        cid, name, status, phone = row
        if cid in seen_clients:
            continue
        if phone and phone in phone_seen:
            continue
        if phone:
            phone_seen.add(phone)
        priority += 1
        seen_clients.add(cid)
        label = "Lead qualifié à relancer" if status == "lead" else "Prospect à contacter"
        user_id = entries[0]["user_id"] if entries else None
        entries.append(_entry(user_id or "", cid, entries[0]["generated_date"] if entries else date.today(),
                              priority, "new_prospect", label, 30 if status == "lead" else 20))
        count += 1


async def _fill_intel_prospects(db, config, assigned, intel_filters, slots, seen_clients, phone_seen, entries, priority):
    intel_condition = and_(*intel_filters) if len(intel_filters) > 1 else intel_filters[0]
    q = await db.execute(
        select(Client.id, Client.name, Client.phone_e164)
        .where(assigned, _not_dead(), intel_condition,
               Client.id.notin_(seen_clients) if seen_clients else True)
        .order_by(Client.qualification_hot_count.desc(), func.random())
        .limit(slots["prospect"] + 5)
    )
    count = 0
    for row in q.all():
        if count >= slots["prospect"]:
            break
        cid, name, phone = row
        if cid in seen_clients:
            continue
        if phone and phone in phone_seen:
            continue
        if phone:
            phone_seen.add(phone)
        priority += 1
        seen_clients.add(cid)
        user_id = entries[0]["user_id"] if entries else None
        entries.append(_entry(user_id or "", cid, entries[0]["generated_date"] if entries else date.today(),
                              priority, "intel_target", f"Cible intel — {name}", 70))
        count += 1


async def _fill_relationship(db, user, assigned, remaining, seen_clients, phone_seen, entries, priority):
    filler_q = await db.execute(
        select(Client.id, Client.phone_e164, func.sum(SalesLine.amount_ht).label("ca"))
        .outerjoin(SalesLine, SalesLine.client_sage_id == Client.sage_id)
        .where(assigned, _not_dead(), Client.status == "client",
               Client.id.notin_(seen_clients) if seen_clients else True)
        .group_by(Client.id, Client.phone_e164)
        .order_by(Client.qualification_hot_count.desc(), func.random())
        .limit(remaining + 5)
    )
    count = 0
    for row in filler_q.all():
        if count >= remaining:
            break
        cid, phone, _ = row
        if cid in seen_clients:
            continue
        if phone and phone in phone_seen:
            continue
        if phone:
            phone_seen.add(phone)
        priority += 1
        seen_clients.add(cid)
        target = entries[0]["generated_date"] if entries else date.today()
        entries.append(_entry(user.id, cid, target, priority, "relationship", "Suivi relation client", 10))
        count += 1


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
