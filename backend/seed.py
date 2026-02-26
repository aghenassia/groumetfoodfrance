"""
Script de seed initial.
Crée un admin, importe les données Excel Sage, lance le scoring.

Usage:
    cd backend
    python seed.py
"""
import asyncio
import sys
from pathlib import Path

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from config import get_settings
from core.database import Base

settings = get_settings()


async def run_seed():
    engine = create_async_engine(settings.database_url, echo=False)

    # Créer toutes les tables
    async with engine.begin() as conn:
        import models  # noqa: F401
        await conn.run_sync(Base.metadata.create_all)

    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        # 1. Créer l'utilisateur admin
        from sqlalchemy import select
        from models.user import User
        from core.security import hash_password

        existing = await db.execute(select(User).where(User.email == "admin@salesmachine.fr"))
        if not existing.scalar_one_or_none():
            admin = User(
                email="admin@salesmachine.fr",
                password_hash=hash_password("admin123"),
                name="Admin",
                role="admin",
            )
            db.add(admin)

            # Créer les commerciaux basés sur les représentants Sage
            for rep_name, rep_email in [
                ("PAPIN", "papin@salesmachine.fr"),
                ("MAEDER Mathieu", "maeder@salesmachine.fr"),
                ("COLLOT Cecilia", "collot@salesmachine.fr"),
                ("LECANTHE", "lecanthe@salesmachine.fr"),
            ]:
                user = User(
                    email=rep_email,
                    password_hash=hash_password("sales123"),
                    name=rep_name,
                    role="sales",
                    sage_rep_name=rep_name.split()[0] if " " in rep_name else rep_name,
                )
                db.add(user)

            await db.commit()
            print("[OK] Utilisateurs créés (admin + 4 commerciaux)")
        else:
            print("[SKIP] Utilisateurs déjà existants")

        # 2. Importer les clients Sage
        clients_file = Path(__file__).parent / "data" / "sage_clients_sample.xlsx"
        if clients_file.exists():
            from connectors.sage_connector import import_clients_from_excel
            result = await import_clients_from_excel(db, str(clients_file))
            print(f"[OK] Clients importés: {result}")
        else:
            print(f"[SKIP] Fichier clients non trouvé: {clients_file}")

        # 3. Importer les ventes Sage
        sales_file = Path(__file__).parent / "data" / "sage_sales_sample.xlsx"
        if sales_file.exists():
            from connectors.sage_connector import import_sales_from_excel
            result = await import_sales_from_excel(db, str(sales_file))
            print(f"[OK] Ventes importées: {result}")
        else:
            print(f"[SKIP] Fichier ventes non trouvé: {sales_file}")

        # 4. Lancer le scoring
        from engines.scoring_engine import compute_all_scores
        result = await compute_all_scores(db)
        print(f"[OK] Scoring terminé: {result}")

        # 5. Générer les playlists
        from engines.playlist_generator import generate_playlists
        result = await generate_playlists(db)
        print(f"[OK] Playlists générées: {result}")

    await engine.dispose()
    print("\n✅ Seed terminé avec succès!")


if __name__ == "__main__":
    asyncio.run(run_seed())
