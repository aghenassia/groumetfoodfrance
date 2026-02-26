"""
APScheduler — Jobs automatisés.

- Full sync Sage : tous les jours à 02h00
- Delta sync Sage : toutes les 15min entre 7h et 20h
- Sync Ringover : toutes les 10min entre 7h et 20h
- Scoring + playlists : tous les jours à 06h30
"""
import logging
from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

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
            since = await get_last_sync_time(db, "sage_odbc")
            if since is None:
                logger.info("Delta sync Sage ignoré : pas de full sync précédent")
                return

            clients = await sync_clients_from_sage(db, since=since)
            sales = await sync_sales_from_sage(db, since=since)
            products = await sync_products_from_sage(db, since=since)
            stock = await sync_stock_from_sage(db, since=since)
            logger.info(f"Delta sync Sage: clients={clients}, sales={sales}, products={products}, stock={stock}")
        except Exception as e:
            logger.error(f"Delta sync Sage erreur: {e}")


async def job_ringover_sync():
    """Sync appels Ringover."""
    from connectors.ringover_connector import sync_calls, auto_transcribe_new_calls
    async with async_session() as db:
        try:
            result = await sync_calls(db)
            ai = await auto_transcribe_new_calls(db)
            logger.info(f"Sync Ringover: {result}, AI: {ai}")
        except Exception as e:
            logger.error(f"Sync Ringover erreur: {e}")


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
    )

    # Delta sync Sage : toutes les 15min entre 7h et 20h
    scheduler.add_job(
        job_sage_delta_sync,
        CronTrigger(minute="*/15", hour="7-20"),
        id="sage_delta_sync",
        name="Sage Delta Sync (journée)",
        replace_existing=True,
    )

    # Sync Ringover : toutes les 10min entre 7h et 20h
    scheduler.add_job(
        job_ringover_sync,
        CronTrigger(minute="*/10", hour="7-20"),
        id="ringover_sync",
        name="Ringover Sync (journée)",
        replace_existing=True,
    )

    # Scoring + playlists : 06h30 tous les jours
    scheduler.add_job(
        job_scoring_and_playlists,
        CronTrigger(hour=6, minute=30),
        id="scoring_playlists",
        name="Scoring & Playlists (matin)",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("Scheduler démarré avec 4 jobs configurés")
