"""Tracking d'activité utilisateur (heartbeats) + analytics réservés au shadow admin."""
from datetime import datetime, timedelta, timezone, date as date_type
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user
from models.user import User
from models.user_activity import UserLoginEvent, UserDailyActivity

router = APIRouter(prefix="/api", tags=["user-activity"])


# Si l'écart entre 2 heartbeats dépasse ce seuil, on considère que c'est une nouvelle session
SESSION_GAP_MINUTES = 5
# Intervalle attendu entre 2 heartbeats côté client (utilisé pour borner les minutes ajoutées)
HEARTBEAT_INTERVAL_SECONDS = 60


@router.post("/me/heartbeat")
async def record_heartbeat(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Le frontend appelle ce endpoint toutes les ~60s quand l'onglet est actif.
    On agrège en minutes par jour, sans stocker chaque heartbeat individuellement.
    """
    now = datetime.now(timezone.utc)
    today = now.date()

    result = await db.execute(
        select(UserDailyActivity).where(
            and_(UserDailyActivity.user_id == user.id, UserDailyActivity.day == today)
        )
    )
    activity = result.scalar_one_or_none()

    if activity is None:
        activity = UserDailyActivity(
            user_id=user.id,
            day=today,
            minutes_active=1,
            session_count=1,
            last_heartbeat_at=now,
        )
        db.add(activity)
    else:
        # Calculer le delta depuis le dernier heartbeat
        last = activity.last_heartbeat_at
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        gap_seconds = (now - last).total_seconds()
        gap_minutes = gap_seconds / 60.0

        if gap_minutes > SESSION_GAP_MINUTES:
            # Nouvelle session : on ne compte que 1 minute pour ce heartbeat
            activity.session_count = (activity.session_count or 0) + 1
            activity.minutes_active = (activity.minutes_active or 0) + 1
        else:
            # Même session : on ajoute le delta réel, borné à 2x l'intervalle attendu
            # (évite qu'un onglet endormi 5min ajoute 5min d'un coup)
            max_add_minutes = (HEARTBEAT_INTERVAL_SECONDS * 2) / 60.0
            add = max(1, min(int(round(gap_minutes)), int(max_add_minutes)))
            activity.minutes_active = (activity.minutes_active or 0) + add

        activity.last_heartbeat_at = now

    await db.commit()
    return {"ok": True, "minutes_today": activity.minutes_active, "sessions_today": activity.session_count}


def _require_shadow(user: User) -> None:
    """Garde stricte : seul le compte shadow voit ces données."""
    if not user.is_shadow:
        raise HTTPException(status_code=404, detail="Not Found")


@router.get("/admin/usage-analytics")
async def get_usage_analytics(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    period: Literal["7d", "30d", "90d", "all"] = Query("30d"),
):
    """
    Reporting d'utilisation du CRM par utilisateur.
    Réservé au compte shadow (renvoie 404 sinon, pour rester invisible).
    """
    _require_shadow(user)

    now = datetime.now(timezone.utc)
    today = now.date()
    if period == "7d":
        since = now - timedelta(days=7)
        since_day = today - timedelta(days=7)
    elif period == "30d":
        since = now - timedelta(days=30)
        since_day = today - timedelta(days=30)
    elif period == "90d":
        since = now - timedelta(days=90)
        since_day = today - timedelta(days=90)
    else:
        since = None
        since_day = None

    # 1) Liste des users actifs (incl. shadow lui-même pour cohérence)
    users_result = await db.execute(
        select(User.id, User.name, User.email, User.role, User.is_active, User.is_shadow)
        .where(User.is_active == True)
        .order_by(User.name)
    )
    users = users_result.all()

    # 2) Agrégats login events
    login_q = select(
        UserLoginEvent.user_id,
        func.count(UserLoginEvent.id).label("total_logins"),
        func.max(UserLoginEvent.logged_in_at).label("last_login_at"),
        func.min(UserLoginEvent.logged_in_at).label("first_login_at"),
    )
    if since is not None:
        login_q = login_q.where(UserLoginEvent.logged_in_at >= since)
    login_q = login_q.group_by(UserLoginEvent.user_id)
    login_rows = (await db.execute(login_q)).all()
    login_map = {r.user_id: r for r in login_rows}

    # 3) Agrégats activité (minutes + jours actifs)
    act_q = select(
        UserDailyActivity.user_id,
        func.coalesce(func.sum(UserDailyActivity.minutes_active), 0).label("total_minutes"),
        func.coalesce(func.sum(UserDailyActivity.session_count), 0).label("total_sessions"),
        func.count(func.distinct(UserDailyActivity.day)).label("days_active"),
        func.max(UserDailyActivity.last_heartbeat_at).label("last_active_at"),
    )
    if since_day is not None:
        act_q = act_q.where(UserDailyActivity.day >= since_day)
    act_q = act_q.group_by(UserDailyActivity.user_id)
    act_rows = (await db.execute(act_q)).all()
    act_map = {r.user_id: r for r in act_rows}

    items = []
    for u in users:
        login = login_map.get(u.id)
        act = act_map.get(u.id)
        items.append({
            "user_id": u.id,
            "name": u.name,
            "email": u.email,
            "role": u.role,
            "is_shadow": u.is_shadow,
            "total_logins": int(login.total_logins) if login else 0,
            "first_login_at": login.first_login_at.isoformat() if login and login.first_login_at else None,
            "last_login_at": login.last_login_at.isoformat() if login and login.last_login_at else None,
            "total_minutes": int(act.total_minutes) if act else 0,
            "total_sessions": int(act.total_sessions) if act else 0,
            "days_active": int(act.days_active) if act else 0,
            "last_active_at": act.last_active_at.isoformat() if act and act.last_active_at else None,
        })

    # Trier par minutes actives décroissantes
    items.sort(key=lambda x: x["total_minutes"], reverse=True)

    return {
        "period": period,
        "generated_at": now.isoformat(),
        "users": items,
    }
