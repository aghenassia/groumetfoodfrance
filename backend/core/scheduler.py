"""
APScheduler — Jobs automatisés.

- Full sync Sage : tous les jours à 02h00
- Delta sync Sage : toutes les 15min entre 6h et 22h
- Ringover fast poll : toutes les 4s (appels uniquement, léger)
- Ringover post-traitement : toutes les 30s (qualification, lifecycle, playlist)
- Scoring + playlists : tous les jours à 06h30
"""
import logging
from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from core.database import async_session

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler(timezone="Europe/Paris")


async def _run_in_session(func, *args):
    """Exécute une fonction avec une session DB fraîche."""
    async with async_session() as db:
        try:
            result = await func(db, *args)
            logger.info(f"Job {func.__name__}: {result}")
        except Exception as e:
            logger.error(f"Job {func.__name__} erreur: {e}")


async def job_sage_full_sync():
    """Full sync Sage (nuit) — clients + ventes + produits + stock."""
    from connectors.sage_sync import sync_clients_from_sage, sync_sales_from_sage, sync_products_from_sage, sync_stock_from_sage
    async with async_session() as db:
        try:
            clients = await sync_clients_from_sage(db, since=None)
            sales = await sync_sales_from_sage(db, since=None)
            products = await sync_products_from_sage(db, since=None)
            stock = await sync_stock_from_sage(db, since=None)
            logger.info(f"Full sync Sage: clients={clients}, sales={sales}, products={products}, stock={stock}")
        except Exception as e:
            logger.error(f"Full sync Sage erreur: {e}")


async def job_sage_delta_sync():
    """Delta sync Sage (journée) — clients + ventes + produits + stock."""
    from connectors.sage_sync import sync_clients_from_sage, sync_sales_from_sage, sync_products_from_sage, sync_stock_from_sage, get_last_sync_time
    async with async_session() as db:
        try:
            since_clients = await get_last_sync_time(db, "sage_odbc", sync_type="clients")
            since_sales = await get_last_sync_time(db, "sage_odbc", sync_type="sales")
            since_products = await get_last_sync_time(db, "sage_odbc", sync_type="products")
            since_stock = await get_last_sync_time(db, "sage_odbc", sync_type="stock")
            if not any([since_clients, since_sales, since_products, since_stock]):
                logger.info("Delta sync Sage ignoré : pas de full sync précédent")
                return

            clients = await sync_clients_from_sage(db, since=since_clients)
            sales = await sync_sales_from_sage(db, since=since_sales)
            products = await sync_products_from_sage(db, since=since_products)
            stock = await sync_stock_from_sage(db, since=since_stock)
            logger.info(f"Delta sync Sage: clients={clients}, sales={sales}, products={products}, stock={stock}")
        except Exception as e:
            logger.error(f"Delta sync Sage erreur: {e}")


async def job_ringover_fast():
    """Fast poll Ringover — new calls only, every 4s."""
    from connectors.ringover_connector import sync_calls_fast
    async with async_session() as db:
        try:
            result = await sync_calls_fast(db)
            if result.get("new", 0) > 0:
                logger.info(f"Ringover fast: {result}")
        except Exception as e:
            logger.error(f"Ringover fast erreur: {e}")


async def job_ringover_post_process():
    """Post-processing Ringover — auto-qualify, lifecycle, playlist, sessions. Every 30s."""
    from connectors.ringover_connector import post_process_calls
    async with async_session() as db:
        try:
            result = await post_process_calls(db)
            total = sum(result.values())
            if total > 0:
                logger.info(f"Ringover post-process: {result}")
        except Exception as e:
            logger.error(f"Ringover post-process erreur: {e}")


async def job_ringover_transcribe():
    """AI transcription of new calls — every 5 minutes."""
    from connectors.ringover_connector import auto_transcribe_new_calls
    async with async_session() as db:
        try:
            ai = await auto_transcribe_new_calls(db)
            if ai.get("analyzed", 0) > 0:
                logger.info(f"Ringover AI transcription: {ai}")
        except Exception as e:
            logger.error(f"Ringover transcription erreur: {e}")


async def job_scoring_and_playlists():
    """Recalcul des scores + génération des playlists."""
    from engines.scoring_engine import compute_all_scores
    from engines.playlist_generator import generate_playlists
    async with async_session() as db:
        try:
            scores = await compute_all_scores(db)
            playlists = await generate_playlists(db)
            logger.info(f"Scoring: {scores}, Playlists: {playlists}")
        except Exception as e:
            logger.error(f"Scoring/Playlists erreur: {e}")


def setup_scheduler():
    """Configure et démarre tous les jobs planifiés."""

    # Full sync Sage : 02h00 tous les jours
    scheduler.add_job(
        job_sage_full_sync,
        CronTrigger(hour=2, minute=0),
        id="sage_full_sync",
        name="Sage Full Sync (nuit)",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=300,
    )

    # Delta sync Sage : toutes les 15min entre 6h et 22h
    scheduler.add_job(
        job_sage_delta_sync,
        CronTrigger(minute="*/15", hour="6-22"),
        id="sage_delta_sync",
        name="Sage Delta Sync (journée)",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=60,
    )

    # Ringover fast poll : toutes les 4 secondes entre 6h et 22h
    scheduler.add_job(
        job_ringover_fast,
        IntervalTrigger(seconds=4),
        id="ringover_fast",
        name="Ringover Fast Poll (4s)",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=5,
    )

    # Ringover post-processing : toutes les 30 secondes
    scheduler.add_job(
        job_ringover_post_process,
        IntervalTrigger(seconds=30),
        id="ringover_post_process",
        name="Ringover Post-Process (30s)",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=15,
    )

    # Ringover AI transcription : toutes les 5 minutes entre 6h et 22h
    scheduler.add_job(
        job_ringover_transcribe,
        CronTrigger(minute="*/5", hour="6-22"),
        id="ringover_transcribe",
        name="Ringover AI Transcription (5min)",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=60,
    )

    # Scoring + playlists : 06h30 tous les jours
    scheduler.add_job(
        job_scoring_and_playlists,
        CronTrigger(hour=6, minute=30),
        id="scoring_playlists",
        name="Scoring & Playlists (matin)",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=300,
    )

    scheduler.start()
    logger.info("Scheduler démarré avec 6 jobs configurés (Ringover fast poll 4s)")
