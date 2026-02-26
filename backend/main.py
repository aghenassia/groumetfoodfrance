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


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup : créer les tables si elles n'existent pas
    async with engine.begin() as conn:
        import models  # noqa: F401
        await conn.run_sync(Base.metadata.create_all)

    # Démarrer le scheduler (syncs automatiques)
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


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}
