"""
Synchronisation Sage 100 → PostgreSQL.

Full sync (nuit) + delta sync (toutes les 15min en journée).
Logique merge : les champs non-null Sage mettent à jour,
les données CRM manuelles ne sont jamais écrasées.
"""
import logging
from datetime import datetime, timezone

import pyodbc
from sqlalchemy import select, update as sqlalchemy_update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert as pg_insert

from models.client import Client
from models.contact import Contact
from models.sales_line import SalesLine
from models.phone_index import PhoneIndex
from models.product import Product
from models.product_stock_depot import ProductStockDepot
from models.user import User
from models.sync_log import SyncLog
from connectors.sage_odbc import SageConnector
from connectors.phone_normalizer import normalize_phone, extract_all_phones

logger = logging.getLogger(__name__)

SAGE_TO_CRM_COUNTRY = {
    "france": "FR", "allemagne": "DE", "espagne": "ES",
    "italie": "IT", "belgique": "BE", "luxembourg": "LU",
    "pays-bas": "NL", "pays bas": "NL", "royaume-uni": "GB",
    "suisse": "CH", "portugal": "PT", "serbie": "RS",
}


def _country_to_region(country: str | None) -> str:
    if not country:
        return "FR"
    return SAGE_TO_CRM_COUNTRY.get(country.lower().strip(), "FR")


def _clean(val) -> str | None:
    if val is None:
        return None
    s = str(val).strip()
    return s if s else None


async def sync_clients_from_sage(
    db: AsyncSession,
    since: datetime | None = None,
) -> dict:
    """
    Synchronise les clients depuis Sage 100 via ODBC.
    - since=None → full sync
    - since=datetime → delta sync (uniquement les modifiés depuis)
    """
    sync_type = "delta" if since else "full"
    log = SyncLog(
        source="sage_odbc",
        sync_type=sync_type,
        status="running",
    )
    db.add(log)
    await db.flush()

    # Mapping Sage CO_No → CRM User pour auto-attribution
    collab_q = await db.execute(
        select(User.sage_collaborator_id, User.id)
        .where(User.sage_collaborator_id.isnot(None))
    )
    collab_map: dict[int, str] = {row[0]: row[1] for row in collab_q.all()}

    connector = SageConnector()
    try:
        sage_clients = connector.get_clients(since=since)
        log.records_found = len(sage_clients)

        created, updated, errors = 0, 0, 0

        for sc in sage_clients:
            try:
                sage_id = _clean(sc.get("CT_Num"))
                if not sage_id:
                    continue

                name = _clean(sc.get("CT_Intitule")) or "Inconnu"
                phone_raw = _clean(sc.get("CT_Telephone"))
                country = _clean(sc.get("CT_Pays")) or "France"
                email_raw = _clean(sc.get("CT_Email"))
                email = email_raw.split(";")[0].strip() if email_raw else None

                sage_created = None
                raw_date = sc.get("cbCreation") or sc.get("CT_DateCreate")
                if raw_date and isinstance(raw_date, datetime):
                    sage_created = raw_date.replace(tzinfo=timezone.utc)

                co_no = sc.get("CO_No")
                mapped_user_id = collab_map.get(co_no) if co_no else None

                client_values = {
                    "sage_id": sage_id,
                    "name": name,
                    "short_name": _clean(sc.get("CT_Qualite")),
                    "quality": _clean(sc.get("CT_Qualite")),
                    "contact_name": _clean(sc.get("CT_Contact")),
                    "address": _clean(sc.get("CT_Adresse")),
                    "address_complement": _clean(sc.get("CT_Complement")),
                    "postal_code": _clean(sc.get("CT_CodePostal")),
                    "city": _clean(sc.get("CT_Ville")),
                    "region": _clean(sc.get("CT_CodeRegion")),
                    "country": country,
                    "phone": phone_raw,
                    "phone_e164": normalize_phone(phone_raw, _country_to_region(country)),
                    "fax": _clean(sc.get("CT_Telecopie")),
                    "email": email,
                    "website": _clean(sc.get("CT_Site")),
                    "siret": _clean(sc.get("CT_Siret")),
                    "vat_number": _clean(sc.get("CT_Identifiant")),
                    "naf_code": _clean(sc.get("CT_Ape")),
                    "is_prospect": False,
                    "is_dormant": bool(sc.get("CT_Sommeil")),
                    "sage_created_at": sage_created,
                    "synced_at": datetime.now(timezone.utc),
                }

                if mapped_user_id:
                    client_values["assigned_user_id"] = mapped_user_id

                # Merge non-destructif : on ne met à jour que les champs
                # avec une valeur non-null côté Sage
                update_set = {}
                for k, v in client_values.items():
                    if k in ("sage_id", "synced_at"):
                        continue
                    if v is not None:
                        update_set[k] = v
                update_set["synced_at"] = client_values["synced_at"]
                # Ne pas écraser une attribution CRM existante par un CO_No non mappé
                if not mapped_user_id:
                    update_set.pop("assigned_user_id", None)

                stmt = pg_insert(Client).values(**client_values)
                stmt = stmt.on_conflict_do_update(
                    index_elements=["sage_id"],
                    set_=update_set,
                )
                result = await db.execute(stmt)

                # Récupérer le client pour son ID (nécessaire pour phone_index)
                q = await db.execute(select(Client).where(Client.sage_id == sage_id))
                client = q.scalar_one()

                # Upsert du Contact primaire depuis contact_name Sage
                contact_name_sage = _clean(sc.get("CT_Contact"))
                contact_phone_e164 = normalize_phone(phone_raw, _country_to_region(country))
                existing_primary = (await db.execute(
                    select(Contact).where(
                        Contact.company_id == client.id,
                        Contact.is_primary == True,
                    )
                )).scalar_one_or_none()

                primary_contact_id = None
                if existing_primary:
                    primary_contact_id = existing_primary.id
                    if contact_name_sage and existing_primary.source == "sage":
                        existing_primary.name = contact_name_sage
                    if contact_phone_e164 and not existing_primary.phone_e164:
                        existing_primary.phone = phone_raw
                        existing_primary.phone_e164 = contact_phone_e164
                    if email and not existing_primary.email:
                        existing_primary.email = email
                    if mapped_user_id:
                        existing_primary.assigned_user_id = mapped_user_id
                elif contact_name_sage or contact_phone_e164:
                    new_contact = Contact(
                        company_id=client.id,
                        name=contact_name_sage or contact_phone_e164 or name,
                        phone=phone_raw,
                        phone_e164=contact_phone_e164,
                        email=email,
                        assigned_user_id=mapped_user_id,
                        is_primary=True,
                        source="sage",
                    )
                    db.add(new_contact)
                    await db.flush()
                    primary_contact_id = new_contact.id

                # Mettre à jour le phone_index (multi-numéros)
                phone_entries = extract_all_phones({
                    "phone": phone_raw,
                    "fax": _clean(sc.get("CT_Telecopie")),
                    "country": country,
                })
                for pe in phone_entries:
                    phone_stmt = pg_insert(PhoneIndex).values(
                        phone_e164=pe["phone_e164"],
                        client_id=client.id,
                        contact_id=primary_contact_id,
                        source=pe["source"],
                        raw_phone=pe["raw_phone"],
                        label=pe["label"],
                    )
                    phone_stmt = phone_stmt.on_conflict_do_nothing(
                        constraint="uq_phone_client"
                    )
                    await db.execute(phone_stmt)

                created += 1

            except Exception as e:
                errors += 1
                if errors <= 5:
                    logger.error(f"Erreur sync client {sc.get('CT_Num')}: {e}")

        await db.commit()

        # Correction des statuts incohérents après sync clients :
        # tout client avec des commandes en base ne doit pas être prospect/lead
        from sqlalchemy import exists as sql_exists
        from models.client_score import ClientScore
        fix_q = await db.execute(
            select(Client.id, ClientScore.days_since_last_order)
            .outerjoin(ClientScore, ClientScore.client_id == Client.id)
            .where(
                Client.status.in_(["prospect", "lead"]),
                sql_exists(
                    select(SalesLine.id).where(SalesLine.client_sage_id == Client.sage_id)
                ),
            )
        )
        status_fixed = 0
        for cid, days_since in fix_q.all():
            new_st = "dormant" if (days_since is not None and days_since >= 180) else "client"
            await db.execute(
                sqlalchemy_update(Client).where(Client.id == cid).values(
                    status=new_st,
                    status_changed_at=datetime.now(timezone.utc),
                    is_prospect=False,
                    is_dormant=(new_st == "dormant"),
                )
            )
            status_fixed += 1
        if status_fixed:
            await db.commit()
            logger.info(f"Lifecycle fix (client sync): {status_fixed} prospect/lead avec commandes → statut corrigé")

        log.records_created = created
        log.records_errors = errors
        log.status = "completed"
        log.finished_at = datetime.now(timezone.utc)
        await db.commit()

        logger.info(
            f"Sync Sage clients ({sync_type}): "
            f"{created} traités, {errors} erreurs sur {len(sage_clients)} trouvés"
        )

        return {
            "sync_type": sync_type,
            "found": len(sage_clients),
            "synced": created,
            "errors": errors,
            "status_fixed": status_fixed,
        }

    except pyodbc.Error as e:
        log.status = "error"
        log.error_message = str(e)
        log.finished_at = datetime.now(timezone.utc)
        await db.commit()
        logger.error(f"Erreur connexion Sage: {e}")
        raise

    finally:
        connector.close()


async def sync_sales_from_sage(
    db: AsyncSession,
    since: datetime | None = None,
) -> dict:
    """
    Synchronise les lignes de ventes depuis Sage 100 via ODBC.
    """
    sync_type = "delta" if since else "full"
    log = SyncLog(
        source="sage_odbc",
        sync_type=f"{sync_type}_sales",
        status="running",
    )
    db.add(log)
    await db.flush()

    q = await db.execute(select(Client.sage_id, Client.id))
    client_map = {row[0]: row[1] for row in q.all()}

    collab_q = await db.execute(select(User.sage_collaborator_id, User.id).where(User.sage_collaborator_id != None))
    collab_map = {row[0]: row[1] for row in collab_q.all()}

    connector = SageConnector()
    try:
        sage_lines = connector.get_sales_lines(since=since)
        log.records_found = len(sage_lines)

        created, errors = 0, 0
        clients_with_new_sales: set[str] = set()

        for sl in sage_lines:
            try:
                piece_id = _clean(str(sl.get("DO_Piece", "")))
                client_sage_id = _clean(str(sl.get("CT_Num", "")))
                if not piece_id or not client_sage_id:
                    continue

                raw_date = sl.get("DO_Date")
                if isinstance(raw_date, datetime):
                    line_date = raw_date.date()
                else:
                    continue

                raw_ref = sl.get("AR_Ref")
                article_ref = _clean(str(raw_ref)) if raw_ref else None
                co_no = sl.get("CO_No")
                sales_rep_name = _clean(str(sl.get("SalesRepName", "")))

                values = {
                    "sage_piece_id": piece_id,
                    "sage_doc_type": int(sl.get("DO_Type", 6)),
                    "client_sage_id": client_sage_id,
                    "client_id": client_map.get(client_sage_id),
                    "date": line_date,
                    "article_ref": article_ref,
                    "designation": _clean(str(sl.get("DL_Design", ""))),
                    "quantity": sl.get("DL_Qte"),
                    "unit_price": sl.get("DL_PrixUnitaire"),
                    "net_weight": sl.get("DL_PoidsNet"),
                    "cost_price": sl.get("DL_PrixRU"),
                    "amount_ht": sl.get("DL_MontantHT") or 0,
                    "sales_rep": sales_rep_name,
                    "sage_collaborator_id": co_no,
                    "user_id": collab_map.get(co_no) if co_no else None,
                    "margin_value": sl.get("MargeValeur"),
                    "margin_percent": sl.get("MargePourcent"),
                    "synced_at": datetime.now(timezone.utc),
                }

                stmt = pg_insert(SalesLine).values(**values)
                stmt = stmt.on_conflict_do_update(
                    constraint="uq_sales_line",
                    set_={
                        k: v for k, v in values.items()
                        if k not in ("sage_piece_id", "article_ref", "client_sage_id", "date")
                    },
                )
                await db.execute(stmt)
                created += 1
                resolved_cid = client_map.get(client_sage_id)
                if resolved_cid:
                    clients_with_new_sales.add(resolved_cid)

                if created % 200 == 0:
                    await db.commit()

            except Exception as e:
                errors += 1
                if errors <= 5:
                    logger.error(f"Erreur sync vente {sl.get('DO_Piece')}: {e}")

        await db.commit()

        # Lifecycle transitions pour les clients avec nouvelles ventes
        if clients_with_new_sales:
            from engines.lifecycle_engine import on_new_sales_line
            lifecycle_transitions = 0
            for cid in clients_with_new_sales:
                result = await on_new_sales_line(db, cid)
                if result:
                    lifecycle_transitions += 1
            if lifecycle_transitions:
                await db.commit()
                logger.info(f"Lifecycle: {lifecycle_transitions} transitions après sync ventes")

        # Correction des statuts incohérents : prospect/lead avec des commandes
        from sqlalchemy import exists
        incoherent = await db.execute(
            select(Client.id)
            .where(
                Client.status.in_(["prospect", "lead"]),
                exists(
                    select(SalesLine.id).where(SalesLine.client_sage_id == Client.sage_id)
                ),
            )
        )
        incoherent_ids = [row[0] for row in incoherent.all()]
        if incoherent_ids:
            from models.client_score import ClientScore
            for cid in incoherent_ids:
                score_q = await db.execute(
                    select(ClientScore.days_since_last_order).where(ClientScore.client_id == cid)
                )
                days_since = score_q.scalar()
                if days_since is not None and days_since >= 180:
                    new_st = "dormant"
                else:
                    new_st = "client"
                await db.execute(
                    sqlalchemy_update(Client).where(Client.id == cid).values(
                        status=new_st,
                        status_changed_at=datetime.now(timezone.utc),
                        is_prospect=False,
                        is_dormant=(new_st == "dormant"),
                    )
                )
            await db.commit()
            logger.info(f"Lifecycle fix: {len(incoherent_ids)} clients prospect/lead avec commandes corrigés")

        log.records_created = created
        log.records_errors = errors
        log.status = "completed"
        log.finished_at = datetime.now(timezone.utc)
        await db.commit()

        logger.info(
            f"Sync Sage ventes ({sync_type}): "
            f"{created} traités, {errors} erreurs sur {len(sage_lines)} trouvés"
        )

        return {
            "sync_type": sync_type,
            "found": len(sage_lines),
            "synced": created,
            "errors": errors,
        }

    except pyodbc.Error as e:
        log.status = "error"
        log.error_message = str(e)
        log.finished_at = datetime.now(timezone.utc)
        await db.commit()
        logger.error(f"Erreur connexion Sage: {e}")
        raise

    finally:
        connector.close()


async def sync_products_from_sage(
    db: AsyncSession,
    since: datetime | None = None,
) -> dict:
    """
    Synchronise les articles depuis Sage 100 (F_ARTICLE) via ODBC.
    """
    sync_type = "delta" if since else "full"
    log = SyncLog(
        source="sage_odbc",
        sync_type=f"{sync_type}_products",
        status="running",
    )
    db.add(log)
    await db.flush()

    connector = SageConnector()
    try:
        sage_articles = connector.get_articles(since=since)
        log.records_found = len(sage_articles)

        SERVICE_REFS = {
            "TRANSPORT", "ARTDIVERS", "ARTDIVERS20", "ARTDIVERS5",
            "ZACOMPTE", "ZAVOIR", "ZESCOMPTE",
            "ZPORTSOUMIS", "ZPORTNONSOUMIS", "ZREMISE",
        }

        created, errors = 0, 0

        for sa in sage_articles:
            try:
                ref = _clean(str(sa.get("AR_Ref", "")))
                if not ref:
                    continue

                values = {
                    "article_ref": ref,
                    "designation": _clean(str(sa.get("AR_Design", ""))),
                    "family": _clean(str(sa.get("FA_CodeFamille", ""))),
                    "sub_family": _clean(str(sa.get("FA_CodeSousFamille", ""))) or None,
                    "unit": _clean(str(sa.get("AR_UniteVen", ""))),
                    "sale_price": sa.get("AR_PrixVen"),
                    "cost_price": sa.get("AR_PrixAch"),
                    "weight": sa.get("AR_PoidsNet"),
                    "barcode": _clean(str(sa.get("AR_CodeBarre", ""))),
                    "is_active": not bool(sa.get("AR_Sommeil")),
                    "is_service": ref.upper() in SERVICE_REFS,
                    "synced_at": datetime.now(timezone.utc),
                }

                update_set = {}
                for k, v in values.items():
                    if k in ("article_ref", "synced_at"):
                        continue
                    if v is not None:
                        update_set[k] = v
                update_set["synced_at"] = values["synced_at"]

                stmt = pg_insert(Product).values(**values)
                stmt = stmt.on_conflict_do_update(
                    index_elements=["article_ref"],
                    set_=update_set,
                )
                await db.execute(stmt)
                created += 1

                if created % 200 == 0:
                    await db.commit()

            except Exception as e:
                errors += 1
                if errors <= 5:
                    logger.error(f"Erreur sync produit {sa.get('AR_Ref')}: {e}")

        await db.commit()

        log.records_created = created
        log.records_errors = errors
        log.status = "completed"
        log.finished_at = datetime.now(timezone.utc)
        await db.commit()

        logger.info(
            f"Sync Sage produits ({sync_type}): "
            f"{created} traités, {errors} erreurs sur {len(sage_articles)} trouvés"
        )

        return {
            "sync_type": sync_type,
            "found": len(sage_articles),
            "synced": created,
            "errors": errors,
        }

    except pyodbc.Error as e:
        log.status = "error"
        log.error_message = str(e)
        log.finished_at = datetime.now(timezone.utc)
        await db.commit()
        logger.error(f"Erreur connexion Sage produits: {e}")
        raise

    finally:
        connector.close()


async def sync_stock_from_sage(
    db: AsyncSession,
    since: datetime | None = None,
) -> dict:
    """
    Synchronise le stock depuis F_ARTSTOCK (tous dépôts) :
    - Détail par dépôt → table product_stock_depots
    - Totaux agrégés → colonnes stock_* sur products
    """
    sync_type = "delta" if since else "full"
    log = SyncLog(
        source="sage_odbc",
        sync_type=f"{sync_type}_stock",
        status="running",
    )
    db.add(log)
    await db.flush()

    connector = SageConnector()
    try:
        stock_rows = connector.get_stock(since=since)
        log.records_found = len(stock_rows)

        depot_upserted, errors = 0, 0
        now = datetime.now(timezone.utc)

        aggregated: dict[str, dict] = {}

        for row in stock_rows:
            try:
                ref = _clean(str(row.get("AR_Ref", "")))
                if not ref:
                    continue

                depot_id = row.get("DE_No")
                depot_name = _clean(str(row.get("DepotNom", "")))
                qty_sto = row.get("AS_QteSto") or 0
                qty_res = row.get("AS_QteRes") or 0
                qty_com = row.get("AS_QteCom") or 0
                qty_prep = row.get("AS_QtePrepa") or 0
                qty_min = row.get("AS_QteMini") or 0
                qty_max = row.get("AS_QteMaxi") or 0
                val_sto = row.get("AS_MontSto") or 0
                available = qty_sto - qty_res - qty_prep

                depot_values = {
                    "article_ref": ref,
                    "depot_id": depot_id,
                    "depot_name": depot_name,
                    "stock_quantity": qty_sto,
                    "stock_reserved": qty_res,
                    "stock_ordered": qty_com,
                    "stock_preparing": qty_prep,
                    "stock_available": available,
                    "stock_min": qty_min,
                    "stock_max": qty_max,
                    "stock_value": val_sto,
                    "synced_at": now,
                }
                stmt = pg_insert(ProductStockDepot).values(**depot_values)
                stmt = stmt.on_conflict_do_update(
                    index_elements=["article_ref", "depot_id"],
                    set_={k: v for k, v in depot_values.items() if k not in ("article_ref", "depot_id")},
                )
                await db.execute(stmt)
                depot_upserted += 1

                if ref not in aggregated:
                    aggregated[ref] = {
                        "stock_quantity": 0, "stock_reserved": 0, "stock_ordered": 0,
                        "stock_preparing": 0, "stock_available": 0, "stock_forecast": 0,
                        "stock_min": 0, "stock_max": 0, "stock_value": 0,
                    }
                agg = aggregated[ref]
                agg["stock_quantity"] += qty_sto
                agg["stock_reserved"] += qty_res
                agg["stock_ordered"] += qty_com
                agg["stock_preparing"] += qty_prep
                agg["stock_available"] += available
                agg["stock_forecast"] += available + qty_com
                agg["stock_min"] += qty_min
                agg["stock_max"] += qty_max
                agg["stock_value"] += val_sto

                if depot_upserted % 200 == 0:
                    await db.commit()

            except Exception as e:
                errors += 1
                if errors <= 5:
                    logger.error(f"Erreur sync stock depot {row.get('AR_Ref')}/{row.get('DE_No')}: {e}")

        await db.commit()

        products_updated = 0
        for ref, agg in aggregated.items():
            stmt = (
                sqlalchemy_update(Product)
                .where(Product.article_ref == ref)
                .values(**agg, stock_synced_at=now)
            )
            result = await db.execute(stmt)
            if result.rowcount > 0:
                products_updated += 1

        await db.commit()

        log.records_created = depot_upserted
        log.records_errors = errors
        log.status = "completed"
        log.finished_at = datetime.now(timezone.utc)
        await db.commit()

        logger.info(
            f"Sync Sage stock ({sync_type}): "
            f"{depot_upserted} lignes dépôts, {products_updated} produits agrégés, "
            f"{errors} erreurs sur {len(stock_rows)} trouvés"
        )

        return {
            "sync_type": sync_type,
            "found": len(stock_rows),
            "depot_lines": depot_upserted,
            "products_updated": products_updated,
            "errors": errors,
        }

    except pyodbc.Error as e:
        log.status = "error"
        log.error_message = str(e)
        log.finished_at = datetime.now(timezone.utc)
        await db.commit()
        logger.error(f"Erreur connexion Sage stock: {e}")
        raise

    except Exception as e:
        log.status = "error"
        log.error_message = str(e)
        log.finished_at = datetime.now(timezone.utc)
        await db.commit()
        logger.error(f"Erreur sync stock: {e}")
        raise

    finally:
        connector.close()


async def get_last_sync_time(db: AsyncSession, source: str = "sage_odbc") -> datetime | None:
    """Retourne le timestamp de la dernière sync Sage réussie."""
    result = await db.execute(
        select(SyncLog.finished_at)
        .where(SyncLog.source == source, SyncLog.status == "completed")
        .order_by(SyncLog.finished_at.desc())
        .limit(1)
    )
    row = result.scalar_one_or_none()
    return row
