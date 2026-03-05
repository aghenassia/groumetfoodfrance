from datetime import date, datetime, timedelta, timezone
from fastapi import APIRouter, Depends, UploadFile, File, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func, case, distinct, or_, and_, update as sql_update
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user, require_admin, hash_password
from models.user import User
from models.client import Client
from models.call import Call
from models.sales_line import SalesLine
from models.client_score import ClientScore
from models.qualification import CallQualification
from models.playlist import DailyPlaylist
from models.sync_log import SyncLog
from models.ai_analysis import AiAnalysis
from schemas.auth import UserResponse, CreateUserRequest, UpdateUserRequest
from connectors.ringover_connector import get_presences, sync_calls, auto_transcribe_new_calls, get_team_members
from connectors.sage_connector import import_clients_from_excel, import_sales_from_excel
from connectors.sage_sync import (
    sync_clients_from_sage,
    sync_sales_from_sage,
    sync_products_from_sage,
    sync_stock_from_sage,
    get_last_sync_time,
)
from connectors.sage_odbc import SageConnector
from engines.scoring_engine import compute_all_scores
from engines.playlist_generator import generate_playlists, generate_playlist_for_user
from models.playlist_config import PlaylistConfig
from sqlalchemy.dialects.postgresql import insert as pg_insert

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/dashboard")
async def admin_dashboard(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    today = date.today()

    total_clients = (await db.execute(select(func.count(Client.id)))).scalar()
    total_calls_today = (await db.execute(
        select(func.count(Call.id)).where(func.date(Call.start_time) == today)
    )).scalar()
    calls_answered_today = (await db.execute(
        select(func.count(Call.id)).where(
            func.date(Call.start_time) == today,
            Call.is_answered == True,
        )
    )).scalar()
    qualifs_today = (await db.execute(
        select(func.count(CallQualification.id)).where(
            func.date(CallQualification.qualified_at) == today
        )
    )).scalar()
    churn_clients = (await db.execute(
        select(func.count(ClientScore.id)).where(ClientScore.churn_risk_score > 50)
    )).scalar()

    presences = await get_presences()

    return {
        "total_clients": total_clients,
        "today": {
            "calls": total_calls_today,
            "answered": calls_answered_today,
            "qualified": qualifs_today,
        },
        "churn_risk_clients": churn_clients,
        "presences": presences,
    }


@router.post("/sync/ringover")
async def trigger_ringover_sync(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    result = await sync_calls(db)
    try:
        ai_result = await auto_transcribe_new_calls(db)
        result["ai_analyzed"] = ai_result["analyzed"]
        result["ai_errors"] = ai_result["errors"]
    except Exception as e:
        result["ai_error"] = str(e)
    return result


# ── Sync Sage ODBC (directe) ──────────────────────────────────────


@router.get("/sync/sage/test")
async def test_sage_connection(
    user: User = Depends(require_admin),
):
    """Teste la connexion ODBC vers Sage 100."""
    connector = SageConnector()
    try:
        info = connector.test_connection()
        return info
    except Exception as e:
        return {"status": "error", "error": str(e)}
    finally:
        connector.close()


@router.post("/sync/sage/odbc/clients")
async def trigger_sage_client_sync(
    mode: str = Query(default="auto", regex="^(full|delta|auto)$"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """
    Sync clients depuis Sage via ODBC.
    - mode=full : récupère tout
    - mode=delta : uniquement les modifiés depuis la dernière sync
    - mode=auto : delta si sync précédente, sinon full
    """
    since = None
    if mode in ("delta", "auto"):
        since = await get_last_sync_time(db, "sage_odbc")
        if mode == "auto" and since is None:
            since = None  # fall back to full

    result = await sync_clients_from_sage(db, since=since)
    return result


@router.post("/sync/sage/odbc/sales")
async def trigger_sage_sales_sync(
    mode: str = Query(default="auto", regex="^(full|delta|auto)$"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Sync lignes de ventes depuis Sage via ODBC."""
    since = None
    if mode in ("delta", "auto"):
        since = await get_last_sync_time(db, "sage_odbc", sync_type="sales")

    result = await sync_sales_from_sage(db, since=since)
    return result


@router.post("/sync/sage/odbc/products")
async def trigger_sage_products_sync(
    mode: str = Query(default="auto", pattern="^(full|delta|auto)$"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Sync articles/produits depuis Sage via ODBC."""
    since = None
    if mode in ("delta", "auto"):
        since = await get_last_sync_time(db, "sage_odbc", sync_type="products")

    result = await sync_products_from_sage(db, since=since)
    return result


@router.post("/sync/sage/odbc/stock")
async def trigger_sage_stock_sync(
    mode: str = Query(default="auto", pattern="^(full|delta|auto)$"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Sync stock depuis F_ARTSTOCK via ODBC."""
    since = None
    if mode in ("delta", "auto"):
        since = await get_last_sync_time(db, "sage_odbc", sync_type="stock")

    result = await sync_stock_from_sage(db, since=since)
    return result


@router.post("/sync/sage/odbc/full")
async def trigger_sage_full_sync(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Sync complète : clients + ventes + produits + stock depuis Sage via ODBC."""
    clients_result = await sync_clients_from_sage(db, since=None)
    sales_result = await sync_sales_from_sage(db, since=None)
    products_result = await sync_products_from_sage(db, since=None)
    stock_result = await sync_stock_from_sage(db, since=None)
    return {
        "clients": clients_result,
        "sales": sales_result,
        "products": products_result,
        "stock": stock_result,
    }


# ── Sync Sage Excel (fallback) ────────────────────────────────────


@router.post("/sync/sage/clients")
async def upload_sage_clients(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Import clients depuis un fichier Excel Sage (fallback)."""
    import tempfile, os
    with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        result = await import_clients_from_excel(db, tmp_path)
        return result
    finally:
        os.unlink(tmp_path)


@router.post("/sync/sage/sales")
async def upload_sage_sales(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Import ventes depuis un fichier Excel Sage (fallback)."""
    import tempfile, os
    with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        result = await import_sales_from_excel(db, tmp_path)
        return result
    finally:
        os.unlink(tmp_path)


# ── Scoring & Playlists ───────────────────────────────────────────


@router.post("/scoring/run")
async def trigger_scoring(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    result = await compute_all_scores(db)
    return result


@router.post("/playlists/generate")
async def trigger_playlist_generation(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    result = await generate_playlists(db)
    return result


# ── Leaderboard ───────────────────────────────────────────────────


@router.get("/leaderboard")
async def leaderboard(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Classement des commerciaux avec scores IA intégrés."""
    from models.user import User as UserModel

    result = await db.execute(
        select(
            UserModel.id,
            UserModel.name,
            func.count(distinct(Call.id)).label("total_calls"),
            func.count(distinct(case((Call.is_answered == True, Call.id)))).label("answered_calls"),
            func.count(distinct(CallQualification.id)).label("qualified_calls"),
            func.coalesce(func.sum(Call.incall_duration), 0).label("total_talk_time"),
            func.coalesce(func.avg(AiAnalysis.overall_score), 0).label("avg_ai_score"),
            func.coalesce(func.avg(AiAnalysis.politeness_score), 0).label("avg_politeness"),
            func.coalesce(func.avg(AiAnalysis.closing_attempt), 0).label("avg_closing"),
        )
        .outerjoin(Call, (Call.user_id == UserModel.id) | (Call.user_name == UserModel.name))
        .outerjoin(CallQualification, CallQualification.call_id == Call.id)
        .outerjoin(AiAnalysis, AiAnalysis.call_id == Call.id)
        .where(UserModel.role == "sales", UserModel.is_active == True)
        .group_by(UserModel.id, UserModel.name)
        .order_by(func.count(distinct(Call.id)).desc())
    )

    entries = []
    for idx, row in enumerate(result.all()):
        entries.append({
            "rank": idx + 1,
            "user_id": row.id,
            "name": row.name,
            "total_calls": row.total_calls,
            "answered_calls": row.answered_calls,
            "qualified_calls": row.qualified_calls,
            "total_talk_time": row.total_talk_time,
            "avg_ai_score": round(float(row.avg_ai_score), 1),
            "avg_politeness": round(float(row.avg_politeness), 1),
            "avg_closing": round(float(row.avg_closing), 1),
            "xp_effort": row.qualified_calls * 10 + row.answered_calls * 2,
        })

    entries.sort(key=lambda e: (e["xp_effort"], e["avg_ai_score"]), reverse=True)
    for idx, e in enumerate(entries):
        e["rank"] = idx + 1

    return entries


# ── User Management (CRUD) ─────────────────────────────────────────


@router.get("/users")
async def list_users(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Liste tous les utilisateurs avec stats résumées."""
    today = date.today()

    result = await db.execute(
        select(
            User,
            func.count(distinct(case((func.date(Call.start_time) == today, Call.id)))).label("calls_today"),
            func.count(distinct(Call.id)).label("total_calls"),
            func.coalesce(func.sum(SalesLine.amount_ht), 0).label("total_ca"),
            func.count(distinct(SalesLine.sage_piece_id)).label("total_orders"),
            func.max(Call.start_time).label("last_call_at"),
        )
        .outerjoin(Call, (Call.user_id == User.id) | (Call.user_name == User.name))
        .outerjoin(
            SalesLine,
            (SalesLine.user_id == User.id) | (SalesLine.sales_rep == User.sage_rep_name),
        )
        .group_by(User.id)
        .order_by(User.name)
    )

    users = []
    for row in result.all():
        u = row[0]
        users.append({
            **UserResponse.model_validate(u).model_dump(),
            "calls_today": row[1] or 0,
            "total_calls": row[2] or 0,
            "total_ca": float(row[3]) if row[3] else 0,
            "total_orders": row[4] or 0,
            "last_call_at": str(row[5]) if row[5] else None,
        })

    return users


@router.get("/users/{user_id}")
async def get_user_detail(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Détail d'un utilisateur avec métriques complètes."""
    result = await db.execute(select(User).where(User.id == user_id))
    u = result.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    resp = UserResponse.model_validate(u).model_dump()
    resp["created_at"] = str(u.created_at)

    call_stats = await db.execute(
        select(
            func.count(Call.id),
            func.count(case((Call.is_answered == True, 1))),
            func.coalesce(func.sum(Call.incall_duration), 0),
            func.coalesce(func.avg(AiAnalysis.overall_score), 0),
        )
        .outerjoin(AiAnalysis, AiAnalysis.call_id == Call.id)
        .where((Call.user_id == user_id) | (Call.user_name == u.name))
    )
    cs = call_stats.one()
    resp["call_stats"] = {
        "total": cs[0] or 0,
        "answered": cs[1] or 0,
        "total_talk_time": cs[2] or 0,
        "avg_ai_score": round(float(cs[3]), 1) if cs[3] else 0,
    }

    sales_stats = await db.execute(
        select(
            func.coalesce(func.sum(SalesLine.amount_ht), 0),
            func.count(distinct(SalesLine.sage_piece_id)),
            func.count(distinct(SalesLine.client_sage_id)),
        )
        .where((SalesLine.user_id == user_id) | (SalesLine.sales_rep == u.sage_rep_name))
    )
    ss = sales_stats.one()
    resp["sales_stats"] = {
        "total_ca": float(ss[0]) if ss[0] else 0,
        "total_orders": ss[1] or 0,
        "total_clients": ss[2] or 0,
    }

    assigned_clients = await db.execute(
        select(func.count(Client.id)).where(
            (Client.assigned_user_id == user_id) | (Client.sales_rep == u.sage_rep_name)
        )
    )
    resp["assigned_clients"] = assigned_clients.scalar() or 0

    return resp


@router.post("/users")
async def create_user(
    body: CreateUserRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Créer un nouvel utilisateur."""
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email déjà utilisé")

    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        name=body.name,
        role=body.role,
        ringover_user_id=body.ringover_user_id,
        ringover_number=body.ringover_number,
        ringover_email=body.ringover_email,
        sage_collaborator_id=body.sage_collaborator_id,
        sage_rep_name=body.sage_rep_name,
        phone=body.phone,
        target_ca_monthly=body.target_ca_monthly,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)


@router.put("/users/{user_id}")
async def update_user(
    user_id: str,
    body: UpdateUserRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Modifier un utilisateur."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    update_data = body.model_dump(exclude_unset=True)

    if "password" in update_data:
        pwd = update_data.pop("password")
        if pwd:
            user.password_hash = hash_password(pwd)

    if "email" in update_data and update_data["email"] != user.email:
        dup = await db.execute(select(User).where(User.email == update_data["email"]))
        if dup.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Email déjà utilisé")

    for key, value in update_data.items():
        if hasattr(user, key):
            setattr(user, key, value)

    user.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)


@router.delete("/users/{user_id}")
async def deactivate_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Désactiver un utilisateur (soft delete)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Impossible de se désactiver soi-même")

    user.is_active = not user.is_active
    user.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return {"id": user.id, "is_active": user.is_active}


# ── Ringover & Sage data for user assignment ──────────────────────


@router.get("/ringover/lines")
async def get_ringover_lines(
    admin: User = Depends(require_admin),
):
    """Récupère les membres Ringover avec leurs numéros."""
    try:
        members = await get_team_members()
        return members
    except Exception as e:
        return {"error": str(e), "members": []}


@router.get("/sage/collaborateurs")
async def get_sage_collaborateurs(
    admin: User = Depends(require_admin),
):
    """Récupère les collaborateurs depuis Sage."""
    connector = SageConnector()
    try:
        collabs = connector.get_collaborateurs()
        return collabs
    except Exception as e:
        return {"error": str(e), "collaborateurs": []}
    finally:
        connector.close()


@router.get("/sage/check-stock")
async def check_sage_stock_table(
    admin: User = Depends(require_admin),
):
    """Vérifie si la table F_ARTSTOCK existe dans Sage et retourne sa structure."""
    connector = SageConnector()
    try:
        return connector.check_stock_table()
    except Exception as e:
        return {"exists": False, "error": str(e)}
    finally:
        connector.close()


# ── Sync Logs ─────────────────────────────────────────────────────


@router.get("/sync-logs")
async def get_sync_logs(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    result = await db.execute(
        select(SyncLog).order_by(SyncLog.started_at.desc()).limit(30)
    )
    logs = result.scalars().all()
    return [
        {
            "id": log.id,
            "source": log.source,
            "sync_type": log.sync_type,
            "status": log.status,
            "records_found": log.records_found,
            "records_created": log.records_created,
            "records_errors": log.records_errors,
            "started_at": str(log.started_at),
            "finished_at": str(log.finished_at) if log.finished_at else None,
            "error_message": log.error_message,
        }
        for log in logs
    ]


# ──────────────── PLAYLIST CONFIG ────────────────


class PlaylistConfigPayload(BaseModel):
    is_active: bool = True
    total_size: int = 15
    pct_callback: int = 10
    pct_dormant: int = 30
    pct_churn_risk: int = 25
    pct_upsell: int = 20
    pct_prospect: int = 15
    dormant_min_days: int = 90
    churn_min_score: int = 40
    upsell_min_score: int = 30
    client_scope: str = "own"
    sage_rep_filter: str | None = None


@router.get("/playlist/configs")
async def get_all_playlist_configs(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Liste les configs playlist de tous les commerciaux."""
    users_q = await db.execute(
        select(User).where(User.is_active == True, User.role.in_(["sales", "manager", "admin"]))
    )
    users = users_q.scalars().all()

    configs_q = await db.execute(select(PlaylistConfig))
    configs = {c.user_id: c for c in configs_q.scalars().all()}

    today = date.today()
    result = []
    for u in users:
        cfg = configs.get(u.id)
        playlist_count_q = await db.execute(
            select(func.count(DailyPlaylist.id)).where(
                DailyPlaylist.user_id == u.id,
                DailyPlaylist.generated_date == today,
            )
        )
        today_count = playlist_count_q.scalar() or 0

        done_count_q = await db.execute(
            select(func.count(DailyPlaylist.id)).where(
                DailyPlaylist.user_id == u.id,
                DailyPlaylist.generated_date == today,
                DailyPlaylist.status.in_(["done", "called"]),
            )
        )
        done_count = done_count_q.scalar() or 0

        result.append({
            "user_id": u.id,
            "user_name": u.name,
            "role": u.role,
            "has_config": cfg is not None,
            "config": {
                "is_active": cfg.is_active if cfg else True,
                "total_size": cfg.total_size if cfg else 15,
                "pct_callback": cfg.pct_callback if cfg else 10,
                "pct_dormant": cfg.pct_dormant if cfg else 30,
                "pct_churn_risk": cfg.pct_churn_risk if cfg else 25,
                "pct_upsell": cfg.pct_upsell if cfg else 20,
                "pct_prospect": cfg.pct_prospect if cfg else 15,
                "dormant_min_days": cfg.dormant_min_days if cfg else 90,
                "churn_min_score": cfg.churn_min_score if cfg else 40,
                "upsell_min_score": cfg.upsell_min_score if cfg else 30,
                "client_scope": cfg.client_scope if cfg else "own",
                "sage_rep_filter": cfg.sage_rep_filter if cfg else None,
            },
            "today_playlist": today_count,
            "today_done": done_count,
        })

    return result


@router.put("/playlist/configs/{user_id}")
async def upsert_playlist_config(
    user_id: str,
    body: PlaylistConfigPayload,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Crée ou met à jour la config playlist d'un commercial."""
    total_pct = body.pct_callback + body.pct_dormant + body.pct_churn_risk + body.pct_upsell + body.pct_prospect
    if total_pct != 100:
        raise HTTPException(400, f"Les pourcentages doivent totaliser 100% (actuellement {total_pct}%)")

    values = {
        "user_id": user_id,
        "is_active": body.is_active,
        "total_size": body.total_size,
        "pct_callback": body.pct_callback,
        "pct_dormant": body.pct_dormant,
        "pct_churn_risk": body.pct_churn_risk,
        "pct_upsell": body.pct_upsell,
        "pct_prospect": body.pct_prospect,
        "dormant_min_days": body.dormant_min_days,
        "churn_min_score": body.churn_min_score,
        "upsell_min_score": body.upsell_min_score,
        "client_scope": body.client_scope,
        "sage_rep_filter": body.sage_rep_filter,
    }

    stmt = pg_insert(PlaylistConfig).values(**values)
    stmt = stmt.on_conflict_do_update(
        constraint="playlist_configs_user_id_key",
        set_={k: v for k, v in values.items() if k != "user_id"},
    )
    await db.execute(stmt)
    await db.commit()
    return {"ok": True, "user_id": user_id}


@router.post("/playlist/generate")
async def trigger_generate_playlists(
    user_id: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Génère les playlists. Si user_id fourni, pour un seul commercial."""
    if user_id:
        result = await generate_playlist_for_user(db, user_id)
    else:
        result = await generate_playlists(db)
    return result


@router.delete("/playlist/clear")
async def clear_playlists_today(
    user_id: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Supprime les playlists du jour (pour regénérer)."""
    from sqlalchemy import delete
    today = date.today()
    stmt = delete(DailyPlaylist).where(DailyPlaylist.generated_date == today)
    if user_id:
        stmt = stmt.where(DailyPlaylist.user_id == user_id)
    result = await db.execute(stmt)
    await db.commit()
    return {"deleted": result.rowcount}


# ──────────────── SALES DASHBOARD ────────────────


def _period_range(period: str, start: date | None, end: date | None):
    today = date.today()
    if start and end:
        return start, end
    if period == "today":
        return today, today
    if period == "week":
        return today - timedelta(days=today.weekday()), today
    if period == "quarter":
        q = ((today.month - 1) // 3) * 3 + 1
        return today.replace(month=q, day=1), today
    return today.replace(day=1), today


@router.get("/sales-dashboard")
async def sales_dashboard(
    period: str = Query(default="month", pattern="^(today|week|month|quarter|custom)$"),
    start: date | None = None,
    end: date | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    d_start, d_end = _period_range(period, start, end)

    users_q = await db.execute(
        select(User).where(User.is_active == True, User.role.in_(["sales", "manager", "admin"]))
    )
    users = users_q.scalars().all()

    team = {
        "calls_total": 0, "calls_answered": 0, "calls_qualified": 0,
        "calls_outbound": 0, "calls_inbound": 0,
        "calls_outbound_answered": 0, "calls_inbound_answered": 0,
        "total_talk_time": 0, "total_ca": 0.0, "total_orders": 0,
        "total_margin": 0.0, "avg_ai_score": 0.0,
        "playlist_total": 0, "playlist_completed": 0,
    }
    ai_scores_accum: list[float] = []
    reps = []

    for u in users:
        user_filter = (Call.user_id == u.id) | (Call.user_name == u.name)
        date_filter = [func.date(Call.start_time) >= d_start, func.date(Call.start_time) <= d_end]

        # -- Calls (with inbound/outbound breakdown) --
        cr = (await db.execute(
            select(
                func.count(Call.id),
                func.count(case((Call.is_answered == True, 1))),
                func.coalesce(func.sum(Call.incall_duration), 0),
                func.coalesce(func.avg(case((Call.is_answered == True, Call.incall_duration))), 0),
                func.count(case((Call.direction == "outbound", 1))),
                func.count(case((Call.direction == "inbound", 1))),
                func.count(case((and_(Call.direction == "outbound", Call.is_answered == True), 1))),
                func.count(case((and_(Call.direction == "inbound", Call.is_answered == True), 1))),
            ).where(user_filter, *date_filter)
        )).one()

        # -- Qualifications --
        qr = (await db.execute(
            select(
                func.count(CallQualification.id),
                func.count(case((CallQualification.mood == "hot", 1))),
                func.count(case((CallQualification.mood == "neutral", 1))),
                func.count(case((CallQualification.mood == "cold", 1))),
                func.count(case((CallQualification.outcome == "callback", 1))),
                func.count(case((CallQualification.outcome == "sale", 1))),
                func.count(case((CallQualification.outcome == "interested", 1))),
                func.count(case((CallQualification.outcome == "not_interested", 1))),
                func.count(case((CallQualification.outcome == "no_answer", 1))),
            )
            .join(Call, Call.id == CallQualification.call_id)
            .where(user_filter, *date_filter)
        )).one()

        # -- AI scores --
        ar = (await db.execute(
            select(
                func.coalesce(func.avg(AiAnalysis.overall_score), 0),
                func.coalesce(func.avg(AiAnalysis.politeness_score), 0),
                func.coalesce(func.avg(AiAnalysis.objection_handling), 0),
                func.coalesce(func.avg(AiAnalysis.closing_attempt), 0),
                func.coalesce(func.avg(AiAnalysis.product_knowledge), 0),
                func.coalesce(func.avg(AiAnalysis.listening_quality), 0),
                func.count(AiAnalysis.id),
            )
            .join(Call, Call.id == AiAnalysis.call_id)
            .where(user_filter, *date_filter)
        )).one()

        # -- Revenue --
        sconds = [SalesLine.user_id == u.id]
        if u.sage_rep_name:
            sconds.append(SalesLine.sales_rep == u.sage_rep_name)
        sr = (await db.execute(
            select(
                func.coalesce(func.sum(SalesLine.amount_ht), 0),
                func.count(distinct(SalesLine.sage_piece_id)),
                func.coalesce(func.sum(SalesLine.margin_value), 0),
            ).where(or_(*sconds), SalesLine.date >= d_start, SalesLine.date <= d_end)
        )).one()

        # -- Portfolio (snapshot, not period-dependent) --
        pconds = [Client.assigned_user_id == u.id]
        if u.sage_rep_name:
            pconds.append(Client.sales_rep.ilike(f"%{u.sage_rep_name}%"))
        pr = (await db.execute(
            select(
                func.count(Client.id),
                func.count(case((Client.status == "client", 1))),
                func.count(case((Client.status == "at_risk", 1))),
                func.count(case((Client.status == "dormant", 1))),
                func.count(case((Client.status.in_(["prospect", "lead"]), 1))),
            ).where(or_(*pconds))
        )).one()

        # -- Playlist completion --
        plr = (await db.execute(
            select(
                func.count(DailyPlaylist.id),
                func.count(case((DailyPlaylist.status.in_(["done", "called"]), 1))),
            ).where(
                DailyPlaylist.user_id == u.id,
                DailyPlaylist.generated_date >= d_start,
                DailyPlaylist.generated_date <= d_end,
            )
        )).one()

        calls_total = cr[0] or 0
        calls_answered = cr[1] or 0
        calls_outbound = cr[4] or 0
        calls_inbound = cr[5] or 0
        calls_outbound_answered = cr[6] or 0
        calls_inbound_answered = cr[7] or 0
        calls_qualified = qr[0] or 0
        ca = float(sr[0])
        margin = float(sr[2])
        ai_overall = round(float(ar[0]), 1)
        playlist_total = plr[0] or 0
        playlist_done = plr[1] or 0

        rep = {
            "user_id": u.id,
            "name": u.name,
            "role": u.role,
            "calls_total": calls_total,
            "calls_answered": calls_answered,
            "calls_outbound": calls_outbound,
            "calls_inbound": calls_inbound,
            "calls_outbound_answered": calls_outbound_answered,
            "calls_inbound_answered": calls_inbound_answered,
            "calls_qualified": calls_qualified,
            "answer_rate": round(calls_answered / calls_total * 100, 1) if calls_total else 0,
            "qualification_rate": round(calls_qualified / calls_total * 100, 1) if calls_total else 0,
            "total_talk_time": cr[2] or 0,
            "avg_call_duration": round(float(cr[3])),
            "total_ca": round(ca, 2),
            "total_orders": sr[1] or 0,
            "total_margin": round(margin, 2),
            "margin_rate": round(margin / ca * 100, 1) if ca > 0 else 0,
            "target_ca": float(u.target_ca_monthly) if u.target_ca_monthly else None,
            "target_progress": round(ca / float(u.target_ca_monthly) * 100, 1) if u.target_ca_monthly and float(u.target_ca_monthly) > 0 else None,
            "ai_scores": {
                "overall": ai_overall,
                "politeness": round(float(ar[1]), 1),
                "objection": round(float(ar[2]), 1),
                "closing": round(float(ar[3]), 1),
                "product": round(float(ar[4]), 1),
                "listening": round(float(ar[5]), 1),
            },
            "analyzed_calls": ar[6] or 0,
            "moods": {"hot": qr[1], "neutral": qr[2], "cold": qr[3]},
            "outcomes": {
                "callback": qr[4], "sale": qr[5], "interested": qr[6],
                "not_interested": qr[7], "no_answer": qr[8],
            },
            "portfolio": {
                "total": pr[0], "active": pr[1], "at_risk": pr[2],
                "dormant": pr[3], "prospects": pr[4],
            },
            "playlist_total": playlist_total,
            "playlist_completed": playlist_done,
            "playlist_rate": round(playlist_done / playlist_total * 100, 1) if playlist_total else 0,
        }
        reps.append(rep)

        team["calls_total"] += calls_total
        team["calls_answered"] += calls_answered
        team["calls_outbound"] += calls_outbound
        team["calls_inbound"] += calls_inbound
        team["calls_outbound_answered"] += calls_outbound_answered
        team["calls_inbound_answered"] += calls_inbound_answered
        team["calls_qualified"] += calls_qualified
        team["total_talk_time"] += cr[2] or 0
        team["total_ca"] += ca
        team["total_orders"] += sr[1] or 0
        team["total_margin"] += margin
        team["playlist_total"] += playlist_total
        team["playlist_completed"] += playlist_done
        if ai_overall > 0:
            ai_scores_accum.append(ai_overall)

    team["total_ca"] = round(team["total_ca"], 2)
    team["total_margin"] = round(team["total_margin"], 2)
    team["answer_rate"] = round(team["calls_answered"] / team["calls_total"] * 100, 1) if team["calls_total"] else 0
    team["qualification_rate"] = round(team["calls_qualified"] / team["calls_total"] * 100, 1) if team["calls_total"] else 0
    team["avg_ai_score"] = round(sum(ai_scores_accum) / len(ai_scores_accum), 1) if ai_scores_accum else 0
    team["playlist_rate"] = round(team["playlist_completed"] / team["playlist_total"] * 100, 1) if team["playlist_total"] else 0

    reps.sort(key=lambda r: r["total_ca"], reverse=True)

    return {
        "period": {"start": str(d_start), "end": str(d_end), "label": period},
        "team": team,
        "reps": reps,
    }


@router.get("/sales-dashboard/{user_id}/calls")
async def get_rep_calls(
    user_id: str,
    start: date | None = None,
    end: date | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    u = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not u:
        raise HTTPException(404, "Utilisateur introuvable")

    today = date.today()
    d_start = start or today.replace(day=1)
    d_end = end or today

    stmt = (
        select(Call, CallQualification, AiAnalysis, Client.name.label("client_name"))
        .outerjoin(CallQualification, CallQualification.call_id == Call.id)
        .outerjoin(AiAnalysis, AiAnalysis.call_id == Call.id)
        .outerjoin(Client, Client.id == Call.client_id)
        .where(
            (Call.user_id == u.id) | (Call.user_name == u.name),
            func.date(Call.start_time) >= d_start,
            func.date(Call.start_time) <= d_end,
        )
        .order_by(Call.start_time.desc())
        .limit(100)
    )

    result = await db.execute(stmt)
    calls = []
    for row in result.all():
        call, qual, ai, client_name = row[0], row[1], row[2], row[3]
        calls.append({
            "id": call.id,
            "start_time": str(call.start_time),
            "direction": call.direction,
            "is_answered": call.is_answered,
            "total_duration": call.total_duration,
            "incall_duration": call.incall_duration,
            "contact_name": call.contact_name or client_name,
            "contact_number": call.contact_number,
            "client_id": call.client_id,
            "record_url": call.record_url,
            "qualification": {
                "mood": qual.mood,
                "outcome": qual.outcome,
                "tags": qual.tags,
                "notes": qual.notes,
                "next_step": qual.next_step,
                "next_step_date": str(qual.next_step_date) if qual.next_step_date else None,
            } if qual else None,
            "ai_scores": {
                "overall": ai.overall_score,
                "politeness": ai.politeness_score,
                "objection": ai.objection_handling,
                "closing": ai.closing_attempt,
                "product": ai.product_knowledge,
                "listening": ai.listening_quality,
                "summary": ai.summary,
                "feedback": ai.sales_feedback,
                "sentiment": ai.client_sentiment,
                "opportunities": ai.detected_opportunities,
            } if ai else None,
        })

    return calls


# ──────────────── CLIENT REASSIGNMENT ────────────────


class ReassignPayload(BaseModel):
    client_ids: list[str]
    target_user_id: str


@router.get("/clients/assignments")
async def get_client_assignments(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Liste les commerciaux avec le nombre de clients assignés."""
    users_q = await db.execute(
        select(User).where(User.is_active == True, User.role.in_(["sales", "manager", "admin"]))
    )
    users = users_q.scalars().all()

    result = []
    for u in users:
        conditions = []
        if u.sage_rep_name:
            conditions.append(Client.sales_rep.ilike(f"%{u.sage_rep_name}%"))
        conditions.append(Client.assigned_user_id == u.id)

        count_q = await db.execute(
            select(func.count(Client.id)).where(or_(*conditions))
        )
        client_count = count_q.scalar() or 0

        result.append({
            "user_id": u.id,
            "user_name": u.name,
            "sage_rep_name": u.sage_rep_name,
            "client_count": client_count,
        })

    unassigned_q = await db.execute(
        select(func.count(Client.id)).where(
            Client.sales_rep == None,
            Client.assigned_user_id == None,
        )
    )
    unassigned = unassigned_q.scalar() or 0
    result.append({
        "user_id": None,
        "user_name": "Non assignés",
        "sage_rep_name": None,
        "client_count": unassigned,
    })

    return result


@router.get("/clients/by-user/{user_id}")
async def get_clients_by_user(
    user_id: str,
    search: str = "",
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Liste les clients assignés à un commercial."""
    target_q = await db.execute(select(User).where(User.id == user_id))
    target_user = target_q.scalar_one_or_none()

    conditions = []
    if target_user and target_user.sage_rep_name:
        conditions.append(Client.sales_rep.ilike(f"%{target_user.sage_rep_name}%"))
    conditions.append(Client.assigned_user_id == user_id)

    stmt = (
        select(Client.id, Client.name, Client.sage_id, Client.city, Client.sales_rep, Client.phone)
        .where(or_(*conditions))
    )

    if search:
        stmt = stmt.where(
            or_(
                Client.name.ilike(f"%{search}%"),
                Client.sage_id.ilike(f"%{search}%"),
                Client.city.ilike(f"%{search}%"),
            )
        )

    stmt = stmt.order_by(Client.name).limit(200)

    result = await db.execute(stmt)
    return [
        {
            "id": r.id,
            "name": r.name,
            "sage_id": r.sage_id,
            "city": r.city,
            "sales_rep": r.sales_rep,
            "phone": r.phone,
        }
        for r in result.all()
    ]


@router.get("/clients/unassigned")
async def get_unassigned_clients(
    search: str = "",
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Liste les clients non assignés."""
    stmt = (
        select(Client.id, Client.name, Client.sage_id, Client.city, Client.sales_rep, Client.phone)
        .where(
            Client.sales_rep == None,
            Client.assigned_user_id == None,
        )
    )

    if search:
        stmt = stmt.where(
            or_(
                Client.name.ilike(f"%{search}%"),
                Client.sage_id.ilike(f"%{search}%"),
                Client.city.ilike(f"%{search}%"),
            )
        )

    stmt = stmt.order_by(Client.name).limit(200)

    result = await db.execute(stmt)
    return [
        {
            "id": r.id,
            "name": r.name,
            "sage_id": r.sage_id,
            "city": r.city,
            "sales_rep": r.sales_rep,
            "phone": r.phone,
        }
        for r in result.all()
    ]


@router.post("/clients/reassign")
async def reassign_clients(
    body: ReassignPayload,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Réassigne une liste de clients à un commercial."""
    target_q = await db.execute(select(User).where(User.id == body.target_user_id))
    target_user = target_q.scalar_one_or_none()
    if not target_user:
        raise HTTPException(404, "Utilisateur cible introuvable")

    stmt = sql_update(Client).where(Client.id.in_(body.client_ids)).values(
        assigned_user_id=target_user.id,
        sales_rep=target_user.sage_rep_name or target_user.name,
    )
    result = await db.execute(stmt)
    await db.commit()
    return {"reassigned": result.rowcount, "target": target_user.name}


@router.post("/fix-statuses")
async def fix_prospect_statuses(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Corrige tous les statuts incohérents en base."""
    from sqlalchemy import exists as sql_exists

    fixed = 0

    # 1. Prospects/leads avec commandes → client ou dormant
    fix_q = await db.execute(
        select(Client.id, Client.status, ClientScore.days_since_last_order)
        .outerjoin(ClientScore, ClientScore.client_id == Client.id)
        .where(
            Client.status.in_(["prospect", "lead"]),
            sql_exists(
                select(SalesLine.id).where(SalesLine.client_sage_id == Client.sage_id)
            ),
        )
    )
    for cid, old_status, days_since in fix_q.all():
        new_status = "dormant" if (days_since is not None and days_since >= 180) else "client"
        await db.execute(
            sql_update(Client).where(Client.id == cid).values(
                status=new_status,
                status_changed_at=datetime.now(timezone.utc),
                is_prospect=False,
                is_dormant=(new_status == "dormant"),
            )
        )
        fixed += 1

    # 2. Prospects avec appels décrochés > 30s → lead
    lead_q = await db.execute(
        select(Client.id).where(
            Client.status == "prospect",
            sql_exists(
                select(Call.id).where(
                    Call.client_id == Client.id,
                    Call.is_answered == True,
                    Call.incall_duration > 30,
                )
            ),
        )
    )
    for (cid,) in lead_q.all():
        await db.execute(
            sql_update(Client).where(Client.id == cid).values(
                status="lead",
                status_changed_at=datetime.now(timezone.utc),
                is_prospect=False,
            )
        )
        fixed += 1

    if fixed:
        await db.commit()
    return {"fixed": fixed, "details": f"{fixed} statuts corrigés"}


@router.post("/clients/auto-assign")
async def auto_assign_clients(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Auto-assigne les clients sans assigned_user_id en mappant CO_No ou sales_rep."""
    users_q = await db.execute(
        select(User).where(User.is_active == True)
    )
    users = users_q.scalars().all()

    # Mapping sage_collaborator_id → User
    collab_map: dict[int, User] = {}
    # Mapping sage_rep_name (lowercase) → User
    name_map: dict[str, User] = {}
    for u in users:
        if u.sage_collaborator_id:
            collab_map[u.sage_collaborator_id] = u
        if u.sage_rep_name:
            name_map[u.sage_rep_name.lower().strip()] = u

    unassigned_q = await db.execute(
        select(Client.id, Client.sales_rep, Client.sage_id)
        .where(Client.assigned_user_id.is_(None))
    )
    unassigned = unassigned_q.all()
    assigned_count = 0

    for cid, sales_rep_text, sage_id in unassigned:
        target_user: User | None = None

        # 1. Tenter le matching par sales_rep texte
        if sales_rep_text:
            target_user = name_map.get(sales_rep_text.lower().strip())

        # 2. Tenter via SalesLine.sage_collaborator_id (CO_No le plus fréquent)
        if not target_user:
            co_q = await db.execute(
                select(SalesLine.sage_collaborator_id, func.count(SalesLine.id).label("cnt"))
                .where(
                    SalesLine.client_sage_id == sage_id,
                    SalesLine.sage_collaborator_id.isnot(None),
                )
                .group_by(SalesLine.sage_collaborator_id)
                .order_by(func.count(SalesLine.id).desc())
                .limit(1)
            )
            top_co = co_q.first()
            if top_co:
                target_user = collab_map.get(top_co[0])

        if target_user:
            await db.execute(
                sql_update(Client).where(Client.id == cid).values(
                    assigned_user_id=target_user.id,
                )
            )
            assigned_count += 1

    if assigned_count:
        await db.commit()

    remaining = len(unassigned) - assigned_count
    return {
        "processed": len(unassigned),
        "assigned": assigned_count,
        "remaining_unassigned": remaining,
    }


@router.get("/clients/orphans")
async def get_orphan_clients(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Liste les clients sans commercial CRM, groupés par ancien nom Sage."""
    from sqlalchemy import func as sqlfunc

    orphans_q = await db.execute(
        select(
            Client.sales_rep,
            sqlfunc.count(Client.id).label("client_count"),
        )
        .where(Client.assigned_user_id.is_(None))
        .group_by(Client.sales_rep)
        .order_by(sqlfunc.count(Client.id).desc())
    )
    groups = []
    total_orphans = 0
    for rep_name, count in orphans_q.all():
        groups.append({
            "sage_rep_name": rep_name or "(vide)",
            "client_count": count,
        })
        total_orphans += count

    return {
        "total_orphans": total_orphans,
        "groups": groups,
    }
