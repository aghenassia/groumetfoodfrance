# Connexion Sage 100 — Guide Technique

> Document de référence pour le développement du connecteur Sage 100
> Dernière mise à jour : 24 février 2026

---

## 1. Informations de connexion

### Accès réseau (Tailscale VPN)

Le serveur Sage est accessible via Tailscale (VPN mesh).
**Tailscale doit être installé et connecté** sur la machine qui exécute le backend.

```
IP Tailscale serveur : 100.117.57.116
Nom du serveur      : NP-SRV
```

### Connexion SQL Server

```
Driver   : ODBC Driver 17 for SQL Server
Server   : 100.117.57.116\SAGE100
Database : NP_DEVELOPPEMENT
Username : crm_readonly
Password : CRM2026secure!
Port     : 1433 (TCP)
```

### Connection string Python (pyodbc)

```python
import pyodbc

CONNECTION_STRING = (
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=100.117.57.116\\SAGE100;"
    "DATABASE=NP_DEVELOPPEMENT;"
    "UID=crm_readonly;"
    "PWD=CRM2026secure!;"
    "TrustServerCertificate=yes;"
)

conn = pyodbc.connect(CONNECTION_STRING)
```

### Connection string SQLAlchemy (async)

```python
# Pour SQLAlchemy avec aioodbc
SAGE_DATABASE_URL = (
    "mssql+pyodbc://crm_readonly:CRM2026secure!@"
    "100.117.57.116\\SAGE100/NP_DEVELOPPEMENT"
    "?driver=ODBC+Driver+17+for+SQL+Server"
    "&TrustServerCertificate=yes"
)
```

---

## 2. Bases de données disponibles

| Base | Description | Accès |
|------|-------------|-------|
| **NP_DEVELOPPEMENT** | Base de production (1827 clients) | ✅ Utilisée |
| BIJOU | Base de démo Sage | ✅ Accessible |
| SAGE_SAGEGESTCOM | Gestion commerciale (config) | ❌ Accès refusé |
| SAGE_SAGECOMPTA | Comptabilité | ❌ Non testé |
| DOS18, DOS19, DOS20 | Autres bases | ❌ Pas de tables Sage |

**Base à utiliser : `NP_DEVELOPPEMENT`**

---

## 3. Tables Sage 100 disponibles

### F_COMPTET — Clients / Tiers

Table principale des clients. Contient 1827 enregistrements.

| Colonne | Type | Description | Mapping CRM |
|---------|------|-------------|-------------|
| `CT_Num` | VARCHAR(17) | N° compte tiers (clé primaire) | `sage_id` |
| `CT_Intitule` | VARCHAR(69) | Raison sociale | `name` |
| `CT_Type` | SMALLINT | 0=Client, 1=Fournisseur | Filtrer `= 0` |
| `CT_Qualite` | VARCHAR(17) | Qualité | `quality` |
| `CT_Contact` | VARCHAR(35) | Nom du contact | `contact_name` |
| `CT_Adresse` | VARCHAR(35) | Adresse | `address` |
| `CT_Complement` | VARCHAR(35) | Complément adresse | `address_complement` |
| `CT_CodePostal` | VARCHAR(9) | Code postal | `postal_code` |
| `CT_Ville` | VARCHAR(35) | Ville | `city` |
| `CT_CodeRegion` | VARCHAR(25) | Région | `region` |
| `CT_Pays` | VARCHAR(35) | Pays | `country` |
| `CT_Telephone` | VARCHAR(21) | Téléphone | `phone` |
| `CT_Telecopie` | VARCHAR(21) | Fax | `fax` |
| `CT_Email` | VARCHAR(69) | Email | `email` |
| `CT_Site` | VARCHAR(69) | Site web | `website` |
| `CT_Siret` | VARCHAR(14) | SIRET | `siret` |
| `CT_Identifiant` | VARCHAR(25) | N° TVA | `vat_number` |
| `CT_Ape` | VARCHAR(7) | Code NAF/APE | `naf_code` |
| `CT_Sommeil` | SMALLINT | En sommeil (0/1) | `is_dormant` |
| `CT_DateCreate` | DATETIME | Date création | `sage_created_at` |
| `CO_No` | INTEGER | N° collaborateur | FK vers F_COLLABORATEUR |
| `cbModification` | DATETIME | Dernière modification | Pour delta sync |

**Requête d'extraction clients :**

```sql
SELECT
    CT_Num,
    CT_Intitule,
    CT_Qualite,
    CT_Contact,
    CT_Adresse,
    CT_Complement,
    CT_CodePostal,
    CT_Ville,
    CT_CodeRegion,
    CT_Pays,
    CT_Telephone,
    CT_Telecopie,
    CT_Email,
    CT_Site,
    CT_Siret,
    CT_Identifiant,
    CT_Ape,
    CT_Sommeil,
    CT_DateCreate,
    CO_No,
    cbModification
FROM F_COMPTET
WHERE CT_Type = 0  -- Clients uniquement
```

### F_DOCENTETE — Entêtes de documents (factures, devis, etc.)

| Colonne | Type | Description |
|---------|------|-------------|
| `DO_Piece` | VARCHAR(13) | N° de pièce |
| `DO_Type` | SMALLINT | Type document (6=Facture, 7=Avoir) |
| `DO_Date` | DATETIME | Date du document |
| `CT_NumPayeur` | VARCHAR(17) | N° client payeur |
| `DO_TotalHT` | FLOAT | Total HT |
| `DO_TotalTTC` | FLOAT | Total TTC |
| `CO_No` | INTEGER | N° collaborateur |
| `cbModification` | DATETIME | Dernière modification |

### F_DOCLIGNE — Lignes de documents (détail des ventes)

| Colonne | Type | Description | Mapping CRM |
|---------|------|-------------|-------------|
| `DO_Piece` | VARCHAR(13) | N° de pièce | `sage_piece_id` |
| `DO_Type` | SMALLINT | Type document | Filtrer `IN (6, 7)` |
| `DO_Date` | DATETIME | Date | `date` |
| `CT_Num` | VARCHAR(17) | N° client | `client_sage_id` |
| `AR_Ref` | VARCHAR(18) | Référence article | `article_ref` |
| `DL_Design` | VARCHAR(69) | Désignation | `designation` |
| `DL_Qte` | FLOAT | Quantité | `quantity` |
| `DL_PrixUnitaire` | FLOAT | Prix unitaire HT | `unit_price` |
| `DL_MontantHT` | FLOAT | Montant HT | `amount_ht` |
| `DL_PrixRU` | FLOAT | Prix de revient | `cost_price` |
| `DL_PoidsNet` | FLOAT | Poids net | `net_weight` |
| `CO_No` | INTEGER | N° collaborateur | FK |
| `cbModification` | DATETIME | Dernière modification | Pour delta sync |

**Requête d'extraction ventes :**

```sql
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
    dl.cbModification
FROM F_DOCLIGNE dl
WHERE dl.DO_Type IN (6, 7)  -- Factures et avoirs
ORDER BY dl.DO_Date DESC
```

### F_COLLABORATEUR — Commerciaux / Représentants

| Colonne | Type | Description |
|---------|------|-------------|
| `CO_No` | INTEGER | N° collaborateur (clé) |
| `CO_Nom` | VARCHAR(35) | Nom |
| `CO_Prenom` | VARCHAR(35) | Prénom |
| `CO_Telephone` | VARCHAR(21) | Téléphone |
| `CO_EMail` | VARCHAR(69) | Email |

### F_ARTICLE — Articles / Produits

| Colonne | Type | Description |
|---------|------|-------------|
| `AR_Ref` | VARCHAR(18) | Référence article (clé) |
| `AR_Design` | VARCHAR(69) | Désignation |
| `FA_CodeFamille` | VARCHAR(18) | Code famille |
| `AR_Sommeil` | SMALLINT | En sommeil (0/1) |

### F_DEPOT — Dépôts / Entrepôts

Liste des dépôts où le stock est réparti.

| Colonne | Type | Description | Mapping CRM |
|---------|------|-------------|-------------|
| `DE_No` | INTEGER | N° dépôt (clé) | `depot_id` |
| `DE_Intitule` | VARCHAR(35) | Nom du dépôt | `depot_name` |
| `DE_Adresse` | VARCHAR(35) | Adresse | `depot_address` |
| `DE_Ville` | VARCHAR(35) | Ville | `depot_city` |
| `DE_Contact` | VARCHAR(35) | Contact | `depot_contact` |
| `DE_Principal` | SMALLINT | Dépôt principal (0/1) | `is_main` |

**Dépôts disponibles (NP_DEVELOPPEMENT) :**

| DE_No | Nom | Articles en stock |
|-------|-----|-------------------|
| 1 | ANTOINE DISTRIBUTION | 4 |
| 3 | KLOOSTERBOER | 1 |
| 6 | LFP by DELANCHY | **115** |
| 7 | LOGIPROX | 10 |
| 9 | CFROID | **104** |
| 10 | METRO FRANCE | 2 |
| 11 | BUREAU | **58** |

**Requête d'extraction dépôts :**

```sql
SELECT DE_No, DE_Intitule, DE_Adresse, DE_Ville, DE_Contact, DE_Principal
FROM F_DEPOT
ORDER BY DE_No
```

### F_ARTSTOCK — Stock par article et dépôt

Table des quantités en stock par article et par dépôt.

| Colonne | Type | Description | Mapping CRM |
|---------|------|-------------|-------------|
| `AR_Ref` | VARCHAR(18) | Référence article (FK) | `article_ref` |
| `DE_No` | INTEGER | N° dépôt | `depot_id` |
| `AS_QteSto` | FLOAT | **Quantité en stock** | `quantity_stock` |
| `AS_QteRes` | FLOAT | Quantité réservée | `quantity_reserved` |
| `AS_QteCom` | FLOAT | Quantité commandée (fournisseur) | `quantity_ordered` |
| `AS_QteMini` | FLOAT | Stock minimum | `stock_min` |
| `AS_QteMaxi` | FLOAT | Stock maximum | `stock_max` |
| `AS_MontSto` | FLOAT | Valeur du stock (€) | `stock_value` |
| `AS_QtePrepa` | FLOAT | Quantité en préparation | `quantity_preparing` |
| `cbModification` | DATETIME | Dernière modification | Pour delta sync |
| `cbCreation` | DATETIME | Date de création | — |

**Requête d'extraction stock (tous les dépôts) :**

```sql
SELECT
    s.AR_Ref,
    a.AR_Design,
    s.DE_No,
    d.DE_Intitule AS DepotNom,
    s.AS_QteSto,
    s.AS_QteRes,
    s.AS_QteCom,
    s.AS_QteMini,
    s.AS_QteMaxi,
    s.AS_MontSto,
    s.AS_QtePrepa,
    s.cbModification
FROM F_ARTSTOCK s
INNER JOIN F_ARTICLE a ON s.AR_Ref = a.AR_Ref
INNER JOIN F_DEPOT d ON s.DE_No = d.DE_No
WHERE s.AS_QteSto > 0
ORDER BY d.DE_Intitule, a.AR_Design
```

**Requête stock disponible réel (avec dépôt) :**

```sql
SELECT
    s.AR_Ref,
    a.AR_Design,
    s.DE_No,
    d.DE_Intitule AS DepotNom,
    s.AS_QteSto AS StockBrut,
    s.AS_QteRes AS Reserve,
    s.AS_QtePrepa AS EnPrepa,
    (s.AS_QteSto - s.AS_QteRes - s.AS_QtePrepa) AS StockDisponible,
    s.AS_QteCom AS EnCommande,
    s.AS_MontSto AS ValeurStock
FROM F_ARTSTOCK s
INNER JOIN F_ARTICLE a ON s.AR_Ref = a.AR_Ref
INNER JOIN F_DEPOT d ON s.DE_No = d.DE_No
WHERE a.AR_Sommeil = 0  -- Articles actifs uniquement
  AND s.AS_QteSto > 0   -- Avec stock uniquement
ORDER BY d.DE_Intitule, a.AR_Design
```

**Requête stock total par article (somme tous dépôts) :**

```sql
SELECT
    s.AR_Ref,
    a.AR_Design,
    SUM(s.AS_QteSto) AS StockTotal,
    SUM(s.AS_QteRes) AS ReserveTotal,
    SUM(s.AS_QteSto - s.AS_QteRes - s.AS_QtePrepa) AS DisponibleTotal,
    SUM(s.AS_MontSto) AS ValeurTotale,
    COUNT(DISTINCT s.DE_No) AS NbDepots
FROM F_ARTSTOCK s
INNER JOIN F_ARTICLE a ON s.AR_Ref = a.AR_Ref
WHERE a.AR_Sommeil = 0
GROUP BY s.AR_Ref, a.AR_Design
HAVING SUM(s.AS_QteSto) > 0
ORDER BY a.AR_Design
```

**Calcul du stock disponible :**
```
Stock Disponible = AS_QteSto - AS_QteRes - AS_QtePrepa
Stock Prévisionnel = Stock Disponible + AS_QteCom
```

---

## 4. Stratégie de synchronisation

### Full Sync (1x par nuit à 02h00)

```python
# Synchronise tous les clients et toutes les ventes
# Upsert dans PostgreSQL sur sage_id / sage_piece_id

async def full_sync_clients():
    query = """
        SELECT * FROM F_COMPTET WHERE CT_Type = 0
    """
    # ... upsert dans table clients

async def full_sync_sales():
    query = """
        SELECT * FROM F_DOCLIGNE WHERE DO_Type IN (6, 7)
    """
    # ... upsert dans table sales_lines
```

### Delta Sync (toutes les 15 min, 7h-20h)

```python
# Utilise cbModification pour ne récupérer que les changements
# Stocke last_sync_timestamp dans Redis ou en DB

async def delta_sync_clients(last_sync: datetime):
    query = """
        SELECT * FROM F_COMPTET
        WHERE CT_Type = 0
        AND cbModification > ?
    """
    # ... upsert uniquement les modifiés

async def delta_sync_sales(last_sync: datetime):
    query = """
        SELECT * FROM F_DOCLIGNE
        WHERE DO_Type IN (6, 7)
        AND cbModification > ?
    """
    # ... upsert uniquement les modifiés

async def delta_sync_stock(last_sync: datetime):
    query = """
        SELECT s.*, a.AR_Design
        FROM F_ARTSTOCK s
        INNER JOIN F_ARTICLE a ON s.AR_Ref = a.AR_Ref
        WHERE s.DE_No = 1
        AND s.cbModification > ?
    """
    # ... upsert uniquement les modifiés
```

---

## 5. Installation des dépendances

### macOS (développement local)

```bash
# Driver ODBC Microsoft
brew tap microsoft/mssql-release https://github.com/Microsoft/homebrew-mssql-release
brew update
brew install msodbcsql17 mssql-tools

# Dépendances Python
pip install pyodbc

# Tailscale
brew install --cask tailscale
```

### Linux / VPS (production)

```bash
# Ubuntu/Debian
curl https://packages.microsoft.com/keys/microsoft.asc | apt-key add -
curl https://packages.microsoft.com/config/ubuntu/22.04/prod.list > /etc/apt/sources.list.d/mssql-release.list
apt-get update
ACCEPT_EULA=Y apt-get install -y msodbcsql17 unixodbc-dev

# Dépendances Python
pip install pyodbc

# Tailscale
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up
```

---

## 6. Script de test de connexion

```python
#!/usr/bin/env python3
"""
Test de connexion à Sage 100 via Tailscale
Exécuter : python test_sage_connection.py
"""

import pyodbc
from datetime import datetime

# Configuration
CONFIG = {
    "driver": "{ODBC Driver 17 for SQL Server}",
    "server": "100.117.57.116\\SAGE100",
    "database": "NP_DEVELOPPEMENT",
    "username": "crm_readonly",
    "password": "CRM2026secure!",
}

def get_connection_string():
    return (
        f"DRIVER={CONFIG['driver']};"
        f"SERVER={CONFIG['server']};"
        f"DATABASE={CONFIG['database']};"
        f"UID={CONFIG['username']};"
        f"PWD={CONFIG['password']};"
        f"TrustServerCertificate=yes;"
    )

def test_connection():
    print("=" * 50)
    print("TEST CONNEXION SAGE 100")
    print("=" * 50)

    try:
        print(f"\n[1] Connexion à {CONFIG['server']}...")
        conn = pyodbc.connect(get_connection_string(), timeout=10)
        print("    ✅ Connexion établie")

        cursor = conn.cursor()

        # Test 1: Compter les clients
        print("\n[2] Comptage des clients...")
        cursor.execute("SELECT COUNT(*) FROM F_COMPTET WHERE CT_Type = 0")
        count = cursor.fetchone()[0]
        print(f"    ✅ {count} clients trouvés")

        # Test 2: Récupérer quelques clients
        print("\n[3] Échantillon de clients...")
        cursor.execute("""
            SELECT TOP 5 CT_Num, CT_Intitule, CT_Ville, CT_Telephone
            FROM F_COMPTET
            WHERE CT_Type = 0
            ORDER BY CT_Intitule
        """)
        for row in cursor:
            print(f"    - {row.CT_Num}: {row.CT_Intitule} ({row.CT_Ville})")

        # Test 3: Compter les lignes de ventes
        print("\n[4] Comptage des lignes de ventes...")
        cursor.execute("SELECT COUNT(*) FROM F_DOCLIGNE WHERE DO_Type IN (6, 7)")
        count = cursor.fetchone()[0]
        print(f"    ✅ {count} lignes de ventes trouvées")

        # Test 4: Dernière modification
        print("\n[5] Dernière modification...")
        cursor.execute("""
            SELECT MAX(cbModification) as LastMod
            FROM F_COMPTET
        """)
        last_mod = cursor.fetchone()[0]
        print(f"    ✅ Dernière modif clients: {last_mod}")

        # Test 5: Dépôts
        print("\n[6] Comptage des dépôts...")
        cursor.execute("SELECT COUNT(*) FROM F_DEPOT")
        count = cursor.fetchone()[0]
        print(f"    ✅ {count} dépôts trouvés")

        # Test 6: Stock par dépôt
        print("\n[7] Stock par dépôt...")
        cursor.execute("""
            SELECT d.DE_Intitule, COUNT(*) as nb
            FROM F_ARTSTOCK s
            INNER JOIN F_DEPOT d ON s.DE_No = d.DE_No
            WHERE s.AS_QteSto > 0
            GROUP BY d.DE_Intitule
            ORDER BY nb DESC
        """)
        for row in cursor:
            print(f"    - {row.DE_Intitule}: {row.nb} articles")

        # Test 7: Échantillon stock avec dépôt
        print("\n[8] Échantillon de stock...")
        cursor.execute("""
            SELECT TOP 5 s.AR_Ref, a.AR_Design, d.DE_Intitule, s.AS_QteSto
            FROM F_ARTSTOCK s
            INNER JOIN F_ARTICLE a ON s.AR_Ref = a.AR_Ref
            INNER JOIN F_DEPOT d ON s.DE_No = d.DE_No
            WHERE s.AS_QteSto > 0
            ORDER BY s.AS_QteSto DESC
        """)
        for row in cursor:
            print(f"    - {row.AR_Design[:30]}: {row.AS_QteSto} ({row.DE_Intitule})")

        conn.close()
        print("\n" + "=" * 50)
        print("✅ TOUS LES TESTS PASSÉS")
        print("=" * 50)
        return True

    except pyodbc.Error as e:
        print(f"\n❌ ERREUR: {e}")
        print("\nVérifiez que:")
        print("  1. Tailscale est connecté")
        print("  2. Le serveur 100.117.57.116 est accessible")
        print("  3. Les credentials sont corrects")
        return False

if __name__ == "__main__":
    test_connection()
```

---

## 7. Structure du connecteur (backend)

```
backend/
├── connectors/
│   ├── __init__.py
│   ├── sage_connector.py      # Connexion et requêtes Sage
│   ├── sage_sync.py           # Logique de synchronisation
│   └── phone_normalizer.py    # Normalisation E.164
│
├── models/
│   ├── client.py              # Modèle SQLAlchemy clients
│   ├── sales_line.py          # Modèle SQLAlchemy ventes
│   ├── article.py             # Modèle SQLAlchemy articles
│   ├── depot.py               # Modèle SQLAlchemy dépôts
│   └── stock.py               # Modèle SQLAlchemy stock (par article + dépôt)
│
└── core/
    └── scheduler.py           # APScheduler pour les syncs
```

### Exemple sage_connector.py

```python
import pyodbc
from typing import List, Dict, Any, Optional
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

class SageConnector:
    def __init__(self, connection_string: str):
        self.connection_string = connection_string
        self._conn: Optional[pyodbc.Connection] = None

    def connect(self) -> pyodbc.Connection:
        if self._conn is None:
            self._conn = pyodbc.connect(self.connection_string, timeout=30)
        return self._conn

    def close(self):
        if self._conn:
            self._conn.close()
            self._conn = None

    def get_clients(self, since: Optional[datetime] = None) -> List[Dict[str, Any]]:
        """Récupère les clients, optionnellement depuis une date."""
        conn = self.connect()
        cursor = conn.cursor()

        query = """
            SELECT
                CT_Num, CT_Intitule, CT_Qualite, CT_Contact,
                CT_Adresse, CT_Complement, CT_CodePostal, CT_Ville,
                CT_CodeRegion, CT_Pays, CT_Telephone, CT_Telecopie,
                CT_Email, CT_Site, CT_Siret, CT_Identifiant,
                CT_Ape, CT_Sommeil, CT_DateCreate, CO_No, cbModification
            FROM F_COMPTET
            WHERE CT_Type = 0
        """

        if since:
            query += " AND cbModification > ?"
            cursor.execute(query, since)
        else:
            cursor.execute(query)

        columns = [column[0] for column in cursor.description]
        results = []
        for row in cursor:
            results.append(dict(zip(columns, row)))

        logger.info(f"Récupéré {len(results)} clients depuis Sage")
        return results

    def get_sales_lines(self, since: Optional[datetime] = None) -> List[Dict[str, Any]]:
        """Récupère les lignes de ventes."""
        conn = self.connect()
        cursor = conn.cursor()

        query = """
            SELECT
                DO_Piece, DO_Type, DO_Date, CT_Num, AR_Ref,
                DL_Design, DL_Qte, DL_PrixUnitaire, DL_MontantHT,
                DL_PrixRU, DL_PoidsNet, CO_No, cbModification,
                DL_MontantHT - (DL_PrixRU * DL_Qte) AS MargeValeur
            FROM F_DOCLIGNE
            WHERE DO_Type IN (6, 7)
        """

        if since:
            query += " AND cbModification > ?"
            cursor.execute(query, since)
        else:
            cursor.execute(query)

        columns = [column[0] for column in cursor.description]
        results = []
        for row in cursor:
            results.append(dict(zip(columns, row)))

        logger.info(f"Récupéré {len(results)} lignes de ventes depuis Sage")
        return results

    def get_depots(self) -> List[Dict[str, Any]]:
        """Récupère la liste des dépôts."""
        conn = self.connect()
        cursor = conn.cursor()

        query = """
            SELECT DE_No, DE_Intitule, DE_Adresse, DE_Ville, DE_Contact, DE_Principal
            FROM F_DEPOT
            ORDER BY DE_No
        """
        cursor.execute(query)

        columns = [column[0] for column in cursor.description]
        results = []
        for row in cursor:
            results.append(dict(zip(columns, row)))

        logger.info(f"Récupéré {len(results)} dépôts depuis Sage")
        return results

    def get_stock(self, depot_id: Optional[int] = None, since: Optional[datetime] = None) -> List[Dict[str, Any]]:
        """Récupère le stock par article. Si depot_id=None, récupère tous les dépôts."""
        conn = self.connect()
        cursor = conn.cursor()

        query = """
            SELECT
                s.AR_Ref,
                a.AR_Design,
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
                s.cbModification
            FROM F_ARTSTOCK s
            INNER JOIN F_ARTICLE a ON s.AR_Ref = a.AR_Ref
            INNER JOIN F_DEPOT d ON s.DE_No = d.DE_No
            WHERE a.AR_Sommeil = 0
        """

        params = []
        if depot_id is not None:
            query += " AND s.DE_No = ?"
            params.append(depot_id)

        if since:
            query += " AND s.cbModification > ?"
            params.append(since)

        cursor.execute(query, params) if params else cursor.execute(query)

        columns = [column[0] for column in cursor.description]
        results = []
        for row in cursor:
            results.append(dict(zip(columns, row)))

        logger.info(f"Récupéré {len(results)} lignes de stock depuis Sage")
        return results

    def get_stock_total_by_article(self, since: Optional[datetime] = None) -> List[Dict[str, Any]]:
        """Récupère le stock total par article (somme de tous les dépôts)."""
        conn = self.connect()
        cursor = conn.cursor()

        query = """
            SELECT
                s.AR_Ref,
                a.AR_Design,
                SUM(s.AS_QteSto) AS StockTotal,
                SUM(s.AS_QteRes) AS ReserveTotal,
                SUM(s.AS_QteSto - s.AS_QteRes - s.AS_QtePrepa) AS DisponibleTotal,
                SUM(s.AS_MontSto) AS ValeurTotale,
                COUNT(DISTINCT s.DE_No) AS NbDepots,
                MAX(s.cbModification) AS cbModification
            FROM F_ARTSTOCK s
            INNER JOIN F_ARTICLE a ON s.AR_Ref = a.AR_Ref
            WHERE a.AR_Sommeil = 0
        """

        params = []
        if since:
            query += " AND s.cbModification > ?"
            params.append(since)

        query += " GROUP BY s.AR_Ref, a.AR_Design HAVING SUM(s.AS_QteSto) > 0"

        cursor.execute(query, params) if params else cursor.execute(query)

        columns = [column[0] for column in cursor.description]
        results = []
        for row in cursor:
            results.append(dict(zip(columns, row)))

        logger.info(f"Récupéré {len(results)} articles avec stock depuis Sage")
        return results
```

---

## 8. Variables d'environnement

```bash
# .env

# Sage 100 (via Tailscale)
SAGE_ODBC_DRIVER={ODBC Driver 17 for SQL Server}
SAGE_ODBC_SERVER=100.117.57.116\SAGE100
SAGE_ODBC_DATABASE=NP_DEVELOPPEMENT
SAGE_ODBC_USER=crm_readonly
SAGE_ODBC_PASSWORD=CRM2026secure!

# Sync schedule
SAGE_FULL_SYNC_HOUR=2
SAGE_DELTA_SYNC_MINUTES=15
SAGE_SYNC_START_HOUR=7
SAGE_SYNC_END_HOUR=20
```

---

## 9. Sécurité

### Droits SQL

L'utilisateur `crm_readonly` a uniquement les droits **SELECT** (lecture seule) :

```sql
-- Droits accordés
EXEC sp_addrolemember 'db_datareader', 'crm_readonly'

-- Peut lire : F_COMPTET, F_DOCLIGNE, F_DOCENTETE, F_COLLABORATEUR, F_ARTICLE, F_ARTSTOCK, F_DEPOT
-- Ne peut PAS : INSERT, UPDATE, DELETE (aucun risque de corruption)
```

### Réseau

- Connexion via **Tailscale VPN** (chiffré, pas d'exposition internet)
- Port 1433 ouvert uniquement pour le réseau Tailscale
- Aucune donnée Sage n'est modifiable depuis le CRM

---

## 10. Troubleshooting

### Erreur "Login failed"

```
Vérifier que Tailscale est connecté : tailscale status
Vérifier l'IP : ping 100.117.57.116
```

### Erreur "Network error" / Timeout

```
Le serveur client est peut-être éteint ou Tailscale déconnecté côté serveur.
Contacter le client pour vérifier que le serveur est allumé.
```

### Erreur "Driver not found"

```bash
# macOS
brew install msodbcsql17

# Linux
ACCEPT_EULA=Y apt-get install -y msodbcsql17
```

---

## 11. Checklist déploiement VPS

- [ ] Installer Tailscale sur le VPS
- [ ] Se connecter avec le même compte Tailscale
- [ ] Vérifier que 100.117.57.116 est accessible
- [ ] Installer ODBC Driver 17 for SQL Server
- [ ] Tester la connexion avec le script de test
- [ ] Configurer les variables d'environnement
- [ ] Lancer le premier full sync
- [ ] Configurer les crons (APScheduler ou crontab)

---

## Contact

En cas de problème avec le serveur Sage :
- Accès TeamViewer : ID `811694835` / Pass `npdev$75010`
- Le client n'est pas technique, tout doit être fait à distance
