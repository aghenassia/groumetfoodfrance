"""
Connecteur Sage 100 via ODBC (SQL Server).

Connexion directe au serveur Sage via Tailscale VPN.
Lecture seule — aucune écriture sur la base Sage.
"""
import logging
from typing import Optional
from datetime import datetime

import pyodbc

from config import get_settings

logger = logging.getLogger(__name__)


class SageConnector:
    """Gère la connexion ODBC vers SQL Server Sage 100."""

    def __init__(self):
        s = get_settings()
        self.connection_string = (
            f"DRIVER={s.sage_odbc_driver};"
            f"SERVER={s.sage_odbc_server};"
            f"DATABASE={s.sage_odbc_database};"
            f"UID={s.sage_odbc_user};"
            f"PWD={s.sage_odbc_password};"
            f"TrustServerCertificate=yes;"
        )
        self._conn: Optional[pyodbc.Connection] = None

    def connect(self) -> pyodbc.Connection:
        if self._conn is None:
            self._conn = pyodbc.connect(self.connection_string, timeout=30)
            logger.info("Connexion Sage ODBC établie")
        return self._conn

    def close(self):
        if self._conn:
            self._conn.close()
            self._conn = None
            logger.info("Connexion Sage ODBC fermée")

    def test_connection(self) -> dict:
        """Teste la connexion et retourne un résumé."""
        conn = self.connect()
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*) FROM F_COMPTET WHERE CT_Type = 0")
        client_count = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM F_DOCLIGNE WHERE DO_Type IN (6, 7)")
        sales_count = cursor.fetchone()[0]

        cursor.execute("SELECT MAX(cbModification) FROM F_COMPTET")
        last_mod_clients = cursor.fetchone()[0]

        cursor.execute("SELECT MAX(cbModification) FROM F_DOCLIGNE WHERE DO_Type IN (6,7)")
        last_mod_sales = cursor.fetchone()[0]

        return {
            "status": "connected",
            "clients": client_count,
            "sales_lines": sales_count,
            "last_mod_clients": str(last_mod_clients) if last_mod_clients else None,
            "last_mod_sales": str(last_mod_sales) if last_mod_sales else None,
        }

    def get_clients(self, since: Optional[datetime] = None) -> list[dict]:
        """Récupère les clients (CT_Type=0). Si since est fourni, delta sync."""
        conn = self.connect()
        cursor = conn.cursor()

        query = """
            SELECT
                CT_Num, CT_Intitule, CT_Qualite, CT_Contact,
                CT_Adresse, CT_Complement, CT_CodePostal, CT_Ville,
                CT_CodeRegion, CT_Pays, CT_Telephone, CT_Telecopie,
                CT_Email, CT_Site, CT_Siret, CT_Identifiant,
                CT_Ape, CT_Sommeil, cbCreation, CO_No, cbModification
            FROM F_COMPTET
            WHERE CT_Type = 0
        """

        if since:
            query += " AND cbModification > ?"
            cursor.execute(query, since)
        else:
            cursor.execute(query)

        columns = [col[0] for col in cursor.description]
        results = [dict(zip(columns, row)) for row in cursor]
        logger.info(f"Sage: {len(results)} clients récupérés ({'delta' if since else 'full'})")
        return results

    def get_sales_lines(self, since: Optional[datetime] = None) -> list[dict]:
        """Récupère les lignes de ventes (factures + avoirs) avec nom du collaborateur."""
        conn = self.connect()
        cursor = conn.cursor()

        query = """
            SELECT
                dl.DO_Piece,
                dl.DO_Type,
                dl.DO_Date,
                dl.CT_Num,
                dl.AR_Ref,
                dl.DL_Design,
                dl.DL_Qte,
                dl.DL_PrixUnitaire,
                dl.DL_MontantHT,
                dl.DL_PrixRU,
                dl.DL_PoidsNet,
                dl.DL_MontantHT - (dl.DL_PrixRU * dl.DL_Qte) AS MargeValeur,
                CASE
                    WHEN dl.DL_MontantHT > 0
                    THEN ((dl.DL_MontantHT - (dl.DL_PrixRU * dl.DL_Qte)) / dl.DL_MontantHT) * 100
                    ELSE 0
                END AS MargePourcent,
                dl.CO_No,
                ISNULL(co.CO_Nom, '') + ' ' + ISNULL(co.CO_Prenom, '') AS SalesRepName,
                dl.cbModification
            FROM F_DOCLIGNE dl
            LEFT JOIN F_COLLABORATEUR co ON dl.CO_No = co.CO_No
            WHERE dl.DO_Type IN (6, 7)
        """

        if since:
            query += " AND dl.cbModification > ?"
            cursor.execute(query, since)
        else:
            cursor.execute(query)

        columns = [col[0] for col in cursor.description]
        results = [dict(zip(columns, row)) for row in cursor]
        logger.info(f"Sage: {len(results)} lignes de ventes récupérées ({'delta' if since else 'full'})")
        return results

    def get_articles(self, since: Optional[datetime] = None) -> list[dict]:
        """Récupère les articles (F_ARTICLE)."""
        conn = self.connect()
        cursor = conn.cursor()

        query = """
            SELECT
                AR_Ref, AR_Design,
                FA_CodeFamille,
                AR_UniteVen, AR_PrixVen, AR_PrixAch,
                AR_PoidsNet, AR_CodeBarre,
                AR_Sommeil, cbModification
            FROM F_ARTICLE
        """

        if since:
            query += " WHERE cbModification > ?"
            cursor.execute(query, since)
        else:
            cursor.execute(query)

        columns = [col[0] for col in cursor.description]
        results = [dict(zip(columns, row)) for row in cursor]
        logger.info(f"Sage: {len(results)} articles récupérés ({'delta' if since else 'full'})")
        return results

    def get_collaborateurs(self) -> list[dict]:
        """Récupère la table des collaborateurs/commerciaux."""
        conn = self.connect()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT CO_No, CO_Nom, CO_Prenom, CO_Telephone, CO_EMail
            FROM F_COLLABORATEUR
        """)
        columns = [col[0] for col in cursor.description]
        return [dict(zip(columns, row)) for row in cursor]

    def get_stock(self, since: Optional[datetime] = None) -> list[dict]:
        """Récupère le stock par article et par dépôt depuis F_ARTSTOCK (tous dépôts)."""
        conn = self.connect()
        cursor = conn.cursor()

        query = """
            SELECT
                s.AR_Ref,
                s.DE_No,
                d.DE_Intitule AS DepotNom,
                s.AS_QteSto,
                s.AS_QteRes,
                s.AS_QteCom,
                s.AS_QteMini,
                s.AS_QteMaxi,
                s.AS_MontSto,
                s.AS_QtePrepa,
                (s.AS_QteSto - s.AS_QteRes - s.AS_QtePrepa) AS StockDisponible,
                (s.AS_QteSto - s.AS_QteRes - s.AS_QtePrepa + s.AS_QteCom) AS StockPrevisionnel,
                s.cbModification
            FROM F_ARTSTOCK s
            INNER JOIN F_DEPOT d ON s.DE_No = d.DE_No
        """

        if since:
            query += " WHERE s.cbModification > ?"
            cursor.execute(query, since)
        else:
            cursor.execute(query)

        columns = [col[0] for col in cursor.description]
        results = [dict(zip(columns, row)) for row in cursor]
        logger.info(f"Sage: {len(results)} lignes de stock récupérées ({'delta' if since else 'full'})")
        return results

    def check_stock_table(self) -> dict:
        """
        Vérifie si F_ARTSTOCK existe et est accessible.
        Retourne les colonnes disponibles et un échantillon.
        """
        conn = self.connect()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                SELECT TOP 1 * FROM INFORMATION_SCHEMA.TABLES
                WHERE TABLE_NAME = 'F_ARTSTOCK'
            """)
            exists = cursor.fetchone() is not None
            if not exists:
                return {"exists": False, "message": "Table F_ARTSTOCK introuvable"}

            cursor.execute("""
                SELECT COLUMN_NAME, DATA_TYPE
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = 'F_ARTSTOCK'
                ORDER BY ORDINAL_POSITION
            """)
            columns = [{"name": r[0], "type": r[1]} for r in cursor.fetchall()]

            cursor.execute("SELECT COUNT(*) FROM F_ARTSTOCK")
            count = cursor.fetchone()[0]

            cursor.execute("SELECT TOP 5 * FROM F_ARTSTOCK")
            cols = [col[0] for col in cursor.description]
            sample = [dict(zip(cols, row)) for row in cursor.fetchall()]

            return {
                "exists": True,
                "row_count": count,
                "columns": columns,
                "sample": sample,
            }
        except pyodbc.Error as e:
            return {"exists": False, "error": str(e)}
