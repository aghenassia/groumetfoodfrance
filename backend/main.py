"""
Sales Machine CRM — Point d'entrée FastAPI.
"""
import sys
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from core.database import engine, Base

settings = get_settings()


async def _run_migrations(conn):
    """Add missing columns to existing tables (safe, idempotent)."""
    from sqlalchemy import text

    migrations = [
        # daily_playlists
        "ALTER TABLE daily_playlists ADD COLUMN IF NOT EXISTS reminder_time TIME",
        "ALTER TABLE daily_playlists ADD COLUMN IF NOT EXISTS created_by VARCHAR(36)",
        # playlist_configs
        "ALTER TABLE playlist_configs ADD COLUMN IF NOT EXISTS client_scope VARCHAR(20) DEFAULT 'own'",
        "ALTER TABLE playlist_configs ADD COLUMN IF NOT EXISTS sage_rep_filter VARCHAR(70)",
        "ALTER TABLE playlist_configs ADD COLUMN IF NOT EXISTS filter_mode VARCHAR(30) DEFAULT 'disabled'",
        "ALTER TABLE playlist_configs ADD COLUMN IF NOT EXISTS filter_competitor_ids TEXT[] DEFAULT '{}'",
        "ALTER TABLE playlist_configs ADD COLUMN IF NOT EXISTS filter_supplier_ids TEXT[] DEFAULT '{}'",
        "ALTER TABLE playlist_configs ADD COLUMN IF NOT EXISTS filter_product_refs TEXT[] DEFAULT '{}'",
        "ALTER TABLE playlist_configs ADD COLUMN IF NOT EXISTS filter_product_families TEXT[] DEFAULT '{}'",
        # products
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS is_service BOOLEAN DEFAULT FALSE",
        # clients
        "ALTER TABLE clients ADD COLUMN IF NOT EXISTS margin_group VARCHAR(50)",
        # challenges
        "ALTER TABLE challenges ADD COLUMN IF NOT EXISTS article_refs TEXT",
        "ALTER TABLE challenges ADD COLUMN IF NOT EXISTS article_family VARCHAR(50)",
        "ALTER TABLE challenges ADD COLUMN IF NOT EXISTS reward VARCHAR(200)",
    ]
    for sql in migrations:
        try:
            await conn.execute(text(sql))
        except Exception as e:
            print(f"[migration] skip: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        import models  # noqa: F401
        await conn.run_sync(Base.metadata.create_all)
        await _run_migrations(conn)

    from core.scheduler import setup_scheduler, scheduler
    setup_scheduler()

    print("\n" + "=" * 50)
    print("   SALES MACHINE CRM — API Ready")
    print("=" * 50)
    print(f"   Docs: http://localhost:8000/docs")
    print(f"   Env:  {settings.app_env}")
    print(f"   Scheduler: {len(scheduler.get_jobs())} jobs actifs\n")
    yield
    # Shutdown
    scheduler.shutdown(wait=False)
    await engine.dispose()


app = FastAPI(
    title="Sales Machine CRM",
    description="CRM Phone-First — Sage 100 + Ringover",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Enregistrer les routes
from api.auth import router as auth_router
from api.clients import router as clients_router
from api.contacts import router as contacts_router
from api.calls import router as calls_router
from api.qualify import router as qualify_router
from api.playlists import router as playlists_router
from api.admin import router as admin_router
from api.products import router as products_router
from api.my_dashboard import router as my_dashboard_router
from api.margin_rules import router as margin_rules_router
from api.objectives import router as objectives_router
from api.challenges import router as challenges_router
from api.orders import router as orders_router
from api.intel import router as intel_router
from api.call_sessions import router as call_sessions_router

app.include_router(auth_router)
app.include_router(clients_router)
app.include_router(contacts_router)
app.include_router(calls_router)
app.include_router(qualify_router)
app.include_router(playlists_router)
app.include_router(admin_router)
app.include_router(products_router)
app.include_router(my_dashboard_router)
app.include_router(margin_rules_router)
app.include_router(objectives_router)
app.include_router(challenges_router)
app.include_router(orders_router)
app.include_router(intel_router)
app.include_router(call_sessions_router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}
