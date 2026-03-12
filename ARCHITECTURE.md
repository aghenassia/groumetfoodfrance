# GFF CRM — Architecture Technique

> CRM "Phone-First" sur mesure pour Gourmet Food France
> Connecté à Sage 100 (ERP/Compta) + Ringover (Téléphonie)
> Version : 3.3 — Mars 2026

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Stack technique](#2-stack-technique)
3. [Infrastructure & Déploiement](#3-infrastructure--déploiement)
4. [Connecteur Sage 100](#4-connecteur-sage-100)
5. [Connecteur Ringover](#5-connecteur-ringover)
6. [Schéma de base de données](#6-schéma-de-base-de-données)
7. [Moteur de scoring & playlists](#7-moteur-de-scoring--playlists)
8. [Gamification](#8-gamification)
9. [Objectifs multi-KPI & Marge nette](#9-objectifs-multi-kpi--marge-nette)
10. [Challenges commerciaux](#10-challenges-commerciaux)
11. [IA de coaching (Phase 2)](#11-ia-de-coaching-phase-2)
12. [Frontend — Pages & composants](#12-frontend--pages--composants)
13. [Authentification & sécurité](#13-authentification--sécurité)
14. [Flux de données](#14-flux-de-données)
15. [Jobs planifiés (CRON)](#15-jobs-planifiés-cron)
16. [Structure des fichiers](#16-structure-des-fichiers)
17. [Plan de livraison](#17-plan-de-livraison)
18. [Coûts de fonctionnement révisés](#18-coûts-de-fonctionnement-révisés)

---

## 1. Vue d'ensemble

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     SERVEUR LOCAL CLIENT                                │
│                                                                         │
│  ┌──────────────┐         ┌──────────────────────────────────────────┐  │
│  │  SAGE 100    │         │            VPS (Linux)                   │  │
│  │  SQL Server  │◄─ODBC──►│                                          │  │
│  │              │ (R/O)   │  ┌────────────────────────────────────┐  │  │
│  │  F_COMPTET   │         │  │  FastAPI (Python 3.11+)            │  │  │
│  │  F_DOCLIGNE  │         │  │                                    │  │  │
│  │  F_DOCENTETE │         │  │  /api/clients      /api/calls      │  │  │
│  │  F_COLLABORA │         │  │  /api/sales        /api/stats      │  │  │
│  │  F_ARTICLE   │         │  │  /api/playlists    /api/gamify      │  │  │
│  │              │         │  │  /api/qualify       /api/admin       │  │  │
│  │              │         │  │  /api/me/stats     /api/products    │  │  │
│  │              │         │  │  /api/objectives   /api/challenges   │  │  │
│  │              │         │  │  /api/admin/margin-rules             │  │  │
│  │              │         │  │  /api/me/margins   /api/me/top-*     │  │  │
│  └──────────────┘         │  │  /api/webhooks/ringover             │  │  │
│                           │  └──────────┬─────────────────────────┘  │  │
│                           │             │                            │  │
│                           │  ┌──────────▼─────────────────────────┐  │  │
│                           │  │  PostgreSQL 16                     │  │  │
│                           │  │                                    │  │  │
│                           │  │  clients │ sales_lines │ calls     │  │  │
│                           │  │  users   │ playlists   │ scores    │  │  │
│                           │  │  qualifications │ gamification     │  │  │
│                           │  │  phone_index │ ai_analyses         │  │  │
│                           │  │  products                          │  │  │
│                           │  │  margin_rules │ user_objectives       │  │  │
│                           │  │  challenges │ challenge_rankings      │  │  │
│                           │  └──────────┬─────────────────────────┘  │  │
│                           │             │                            │  │
│                           │  ┌──────────▼─────────────────────────┐  │  │
│                           │  │  Next.js 16 (Frontend SSR)         │  │  │
│                           │  │                                    │  │  │
│                           │  │  Dashboard │ Playlist │ Fiche 360° │  │  │
│                           │  │  Produits │ Leaderboard │ Admin    │  │  │
│                           │  └────────────────────────────────────┘  │  │
│                           │                                          │  │
│                           │  ┌────────────────────────────────────┐  │  │
│                           │  │  Redis (cache + sessions)          │  │  │
│                           │  └────────────────────────────────────┘  │  │
│                           └──────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
                                      │
                          HTTPS       │       API REST
                                      │
                    ┌─────────────────▼───────────────────────┐
                    │           SERVICES CLOUD                 │
                    │                                          │
                    │  ┌──────────────┐  ┌─────────────────┐  │
                    │  │  Ringover    │  │  OpenAI (Ph.2)  │  │
                    │  │  API v2      │  │  Whisper + GPT  │  │
                    │  │  + Webhooks  │  │                 │  │
                    │  └──────────────┘  └─────────────────┘  │
                    └──────────────────────────────────────────┘
```

**Principe fondamental :** Toutes les données restent sur le serveur du client.
Seuls les appels API sortants (Ringover, OpenAI) transitent par Internet.

---

## 2. Stack technique

| Couche | Technologie | Justification |
|--------|-------------|---------------|
| **Backend API** | FastAPI (Python 3.11+) | Async natif, WebSockets/SSE, validation Pydantic, auto-doc OpenAPI, performances |
| **Frontend** | Next.js 14 (App Router) | SSR, routing, React Server Components, écosystème riche |
| **Base de données CRM** | PostgreSQL 16 | Robuste, requêtes analytiques, JSON natif, full-text search |
| **Base de données Sage** | SQL Server (Sage 100) | Accès ODBC en lecture seule depuis le même réseau |
| **Cache & Sessions** | Redis 7 | Sessions JWT, cache des présences Ringover, rate limiting |
| **ORM** | SQLAlchemy 2.0 + Alembic | Migrations versionnées, async support |
| **Auth** | NextAuth.js (frontend) + JWT (API) | Gratuit, simple, tokens signés |
| **Realtime** | Server-Sent Events (SSE) | Suffisant pour 10-20 users, zéro dépendance externe |
| **Scheduler** | APScheduler | Jobs Python intégrés (sync Sage, scoring, playlists) |
| **Téléphonie** | Ringover API v2 + Webhooks | Sync appels, contacts, présences |
| **IA (Phase 2)** | OpenAI Whisper + GPT-4o | Transcription + analyse qualitative |
| **Normalisation tél.** | python-phonenumbers | Format E.164 unifié pour le matching |
| **Reverse Proxy** | Nginx | SSL, load balancing, static files |

### Dépendances Python principales

```
fastapi>=0.110.0
uvicorn[standard]>=0.27.0
sqlalchemy[asyncio]>=2.0.0
asyncpg>=0.29.0
alembic>=1.13.0
pyodbc>=5.1.0
httpx>=0.27.0
python-jose[cryptography]>=3.3.0
passlib[bcrypt]>=1.7.4
phonenumbers>=8.13.0
apscheduler>=3.10.0
redis>=5.0.0
pydantic>=2.6.0
pydantic-settings>=2.1.0
```

---

## 3. Infrastructure & Déploiement

### Architecture serveur (VPS OVH — Production)

```
VPS OVH (Ubuntu 25.04) — gff.wrz.fr (51.83.69.51)
│
├── Services systemd
│   ├── crm-backend.service   → FastAPI (uvicorn, 1 worker, port 8000)
│   ├── crm-frontend.service  → Next.js (node, port 3000)
│   └── Docker Compose (deploy/)
│       ├── postgres           → PostgreSQL 16 (port 5432, volume persistant)
│       └── redis              → Redis 7 (port 6379)
│
├── Nginx (reverse proxy)
│   ├── HTTPS (443)            → Let's Encrypt SSL (gff.wrz.fr)
│   ├── /                      → proxy_pass http://127.0.0.1:3000 (frontend)
│   ├── /api/                  → proxy_pass http://127.0.0.1:8000 (backend)
│   └── HTTP (80)              → redirect 301 → HTTPS
│
├── Tailscale VPN
│   └── Connexion sécurisée vers le serveur Sage 100 (100.117.57.116)
│
└── CI/CD
    └── GitHub Actions → deploy.yml → /opt/deploy-crm.sh
        (push main → pull + build + restart auto)
```

### Connexion au réseau Sage

Le VPS se connecte au serveur Sage 100 via **Tailscale** (VPN mesh).
Tailscale est installé sur le VPS et sur le serveur Windows du client.
L'accès ODBC se fait en lecture seule via un utilisateur SQL dédié
(`crm_readonly`, droits SELECT uniquement).

**Connexion directe par port** : pour contourner les problèmes de résolution
d'instance nommée (SQL Server Browser / UDP 1434), la connexion utilise
`SERVER=100.117.57.116,1433` (port TCP direct) au lieu de `SERVER=ip\SAGE100`.

### CI/CD — Déploiement automatique

À chaque `push` sur la branche `main`, un workflow GitHub Actions SSH dans le
VPS et exécute `/opt/deploy-crm.sh` :

1. `git fetch origin main && git reset --hard origin/main`
2. Si `requirements.txt` modifié → `pip install -r requirements.txt`
3. Si `frontend/` modifié → `npm install && npm run build` + restart frontend
4. Restart backend (toujours)

Secrets GitHub requis : `VPS_HOST`, `VPS_SSH_KEY`.

---

## 4. Connecteur Sage 100

### Tables Sage 100 utilisées (lecture seule)

Sage 100 Gestion Commerciale stocke ses données dans SQL Server.
Voici les tables que nous interrogeons et leur mapping vers notre CRM :

#### F_COMPTET (Comptes Tiers → `clients`)

| Colonne Sage | Type | Description | Colonne CRM |
|-------------|------|-------------|-------------|
| `CT_Num` | VARCHAR(17) | N° compte tiers (clé) | `sage_id` |
| `CT_Intitule` | VARCHAR(69) | Intitulé / Raison sociale | `name` |
| `CT_Type` | SMALLINT | 0=Client, 1=Fournisseur | filtre `= 0` |
| `CT_Qualite` | VARCHAR(17) | Qualité | `quality` |
| `CT_Contact` | VARCHAR(35) | Nom du contact | `contact_name` |
| `CT_Adresse` | VARCHAR(35) | Adresse | `address` |
| `CT_Complement` | VARCHAR(35) | Complément adresse | `address_complement` |
| `CT_CodePostal` | VARCHAR(9) | Code postal | `postal_code` |
| `CT_Ville` | VARCHAR(35) | Ville | `city` |
| `CT_CodeRegion` | VARCHAR(25) | Région | `region` |
| `CT_Pays` | VARCHAR(35) | Pays | `country` |
| `CT_Telephone` | VARCHAR(21) | Téléphone | `phone` → normalisé E.164 |
| `CT_Telecopie` | VARCHAR(21) | Fax | `fax` |
| `CT_Email` | VARCHAR(69) | Email | `email` |
| `CT_Site` | VARCHAR(69) | Site web | `website` |
| `CT_Siret` | VARCHAR(14) | SIRET | `siret` |
| `CT_Identifiant` | VARCHAR(25) | N° TVA intracommunautaire | `vat_number` |
| `CT_Ape` | VARCHAR(7) | Code NAF/APE | `naf_code` |
| `CT_Sommeil` | SMALLINT | Mise en sommeil (0/1) | `is_dormant` |
| `CT_DateCreate` | DATETIME | Date de création | `sage_created_at` |
| `CO_No` | INTEGER | N° collaborateur (représentant) | jointure → `sales_rep` |

**Requête d'extraction :**

```sql
SELECT
    c.CT_Num,
    c.CT_Intitule,
    c.CT_Qualite,
    c.CT_Contact,
    c.CT_Adresse,
    c.CT_Complement,
    c.CT_CodePostal,
    c.CT_Ville,
    c.CT_CodeRegion,
    c.CT_Pays,
    c.CT_Telephone,
    c.CT_Telecopie,
    c.CT_Email,
    c.CT_Site,
    c.CT_Siret,
    c.CT_Identifiant,
    c.CT_Ape,
    c.CT_Sommeil,
    c.CT_DateCreate,
    ISNULL(co.CO_Nom, '') + ' ' + ISNULL(co.CO_Prenom, '') AS Representant
FROM F_COMPTET c
LEFT JOIN F_COLLABORATEUR co ON c.CO_No = co.CO_No
WHERE c.CT_Type = 0  -- Clients uniquement
```

#### F_DOCENTETE + F_DOCLIGNE (Documents → `sales_lines`)

| Colonne Sage | Table | Type | Description | Colonne CRM |
|-------------|-------|------|-------------|-------------|
| `DO_Piece` | ENTETE/LIGNE | VARCHAR(13) | N° de pièce | `sage_piece_id` |
| `DO_Type` | ENTETE/LIGNE | SMALLINT | Type doc (1=BC, 3=BL, 6=Facture, 7=Avoir) | `sage_doc_type` |
| `DO_Date` | LIGNE | DATETIME | Date du document | `date` |
| `CT_Num` | LIGNE | VARCHAR(17) | N° tiers client | `client_sage_id` |
| `AR_Ref` | LIGNE | VARCHAR(18) | Référence article | `article_ref` |
| `DL_Design` | LIGNE | VARCHAR(69) | Désignation | `designation` |
| `DL_Qte` | LIGNE | FLOAT | Quantité | `quantity` |
| `DL_PrixUnitaire` | LIGNE | FLOAT | Prix unitaire HT | `unit_price` |
| `DL_MontantHT` | LIGNE | FLOAT | Montant HT | `amount_ht` |
| `DL_PrixRU` | LIGNE | FLOAT | Prix de revient unitaire | `cost_price` |
| `DL_PoidsNet` | LIGNE | FLOAT | Poids net | `net_weight` |
| `DL_Remise01REM_Valeur` | LIGNE | FLOAT | Remise | `discount` |
| `CO_No` | LIGNE | INTEGER | N° collaborateur | jointure → `sales_rep` |

**Requête d'extraction :**

```sql
SELECT
    dl.DO_Piece,
    dl.DO_Type,
    dl.DO_Date,
    dl.CT_Num,
    ct.CT_Intitule,
    dl.AR_Ref,
    dl.DL_Design,
    dl.DL_Qte,
    dl.DL_PrixUnitaire,
    dl.DL_MontantHT,
    dl.DL_PrixRU,
    dl.DL_PoidsNet,
    dl.DL_Remise01REM_Valeur,
    dl.DL_MontantHT - (dl.DL_PrixRU * dl.DL_Qte) AS MargeValeur,
    CASE
        WHEN dl.DL_MontantHT > 0
        THEN ((dl.DL_MontantHT - (dl.DL_PrixRU * dl.DL_Qte)) / dl.DL_MontantHT) * 100
        ELSE 0
    END AS MargePourcent,
    ISNULL(co.CO_Nom, '') + ' ' + ISNULL(co.CO_Prenom, '') AS Collaborateur
FROM F_DOCLIGNE dl
INNER JOIN F_COMPTET ct ON dl.CT_Num = ct.CT_Num
LEFT JOIN F_COLLABORATEUR co ON dl.CO_No = co.CO_No
WHERE dl.DO_Type IN (1, 3, 6, 7)  -- BC, BL, Factures et avoirs
ORDER BY dl.DO_Date DESC
```

#### F_COLLABORATEUR (Collaborateurs → `users`)

| Colonne Sage | Type | Description | Colonne CRM |
|-------------|------|-------------|-------------|
| `CO_No` | INTEGER | N° collaborateur (clé) | `sage_collaborator_id` |
| `CO_Nom` | VARCHAR(35) | Nom | `name` (partie) |
| `CO_Prenom` | VARCHAR(35) | Prénom | `name` (partie) |
| `CO_Telephone` | VARCHAR(21) | Téléphone | `phone` |
| `CO_EMail` | VARCHAR(69) | Email | `email` |

#### F_ARTICLE (Articles → `products`)

| Colonne Sage | Type | Description | Colonne CRM |
|-------------|------|-------------|-------------|
| `AR_Ref` | VARCHAR(18) | Référence article (clé) | `article_ref` |
| `AR_Design` | VARCHAR(69) | Désignation | `designation` |
| `FA_CodeFamille` | VARCHAR(18) | Famille d'articles | `family` |
| `FA_CodeSousFamille` | VARCHAR(18) | Sous-famille | `sub_family` |
| `AR_UniteVen` | VARCHAR(10) | Unité de vente | `unit` |
| `AR_PrixVen` | FLOAT | Prix de vente | `sale_price` |
| `AR_PrixAch` | FLOAT | Prix d'achat | `cost_price` |
| `AR_PoidsNet` | FLOAT | Poids net | `weight` |
| `AR_CodeBarre` | VARCHAR(50) | Code barre | `barcode` |
| `AR_Sommeil` | SMALLINT | Mise en sommeil (0/1) | `is_active` (inversé) |
| `cbModification` | DATETIME | Dernière modification | Delta sync |

**Requête d'extraction :**

```sql
SELECT
    AR_Ref, AR_Design,
    FA_CodeFamille, FA_CodeSousFamille,
    AR_UniteVen, AR_PrixVen, AR_PrixAch,
    AR_PoidsNet, AR_CodeBarre,
    AR_Sommeil, cbModification
FROM F_ARTICLE
```

### Stratégie de synchronisation

```
┌─────────────────────────────────────────────────────────┐
│  SAGE SYNC STRATEGY                                      │
│                                                          │
│  Mode 1 — FULL SYNC (1x/nuit à 02h00)                  │
│  ├── Tous les clients (F_COMPTET WHERE CT_Type=0)       │
│  ├── Toutes les lignes de ventes (F_DOCLIGNE)           │
│  │   ├── Filtre AR_Ref NOT NULL (exclut commentaires)   │
│  │   ├── Reclassification FA/AV sur DO_Type=7           │
│  │   └── Enrichissement paiement depuis F_DOCENTETE     │
│  ├── Tous les articles/produits (F_ARTICLE)             │
│  ├── Stock multi-dépôts (F_ARTSTOCK)                    │
│  └── Upsert dans PostgreSQL (ON CONFLICT)               │
│                                                          │
│  Mode 2 — DELTA SYNC (toutes les 15 min, 6h-22h)       │
│  ├── Utilise cbModification (timestamp Sage)             │
│  ├── Ne récupère que les enregistrements modifiés        │
│  ├── Clients + Ventes + Produits + Stock                 │
│  ├── Chaque type a son propre last_sync_time             │
│  └── max_instances=1 (pas de chevauchement)              │
│                                                          │
│  Post-sync :                                             │
│  ├── Suppression lignes commentaire en base              │
│  ├── Reclassification factures/avoirs (DO_Type=7)       │
│  └── Enrichissement paiement (doc_total_ttc/paid)       │
│                                                          │
│  Sécurité :                                              │
│  ├── Connexion ODBC lecture seule via Tailscale VPN     │
│  ├── Utilisateur SQL dédié (SELECT only)                │
│  ├── Appels ODBC wrappés dans asyncio.to_thread()       │
│  └── Aucune écriture sur Sage, jamais                    │
└─────────────────────────────────────────────────────────┘
```

Le champ `cbModification` (DATETIME) présent sur toutes les tables Sage 100
permet de faire du delta sync : on ne récupère que les lignes modifiées
depuis le dernier sync réussi. Chaque type de sync (clients, sales, products,
stock) maintient son propre `last_sync_time` dans la table `sync_logs`.

---

## 5. Connecteur Ringover

### API Ringover v2 — Endpoints utilisés

| Endpoint | Méthode | Usage | Fréquence |
|----------|---------|-------|-----------|
| `GET /v2/calls` | GET | Historique des appels | Polling 2 min |
| `GET /v2/contacts` | GET | Contacts Ringover | Sync quotidien |
| `GET /v2/presences` | GET | Qui est connecté/en appel | Polling 30s |
| `GET /v2/team/members` | GET | Liste des utilisateurs | Sync initial |
| `POST /v2/callback` | POST | Click-to-call (lancer un appel) | À la demande |
| `POST /v2/webhooks` | POST | Enregistrement webhooks | Setup initial |

### Click-to-Call (Callback API)

Le CRM permet de lancer un appel directement depuis l'interface web via
l'endpoint Ringover `POST /v2/callback`. Workflow :

1. L'utilisateur clique sur le bouton "Appeler" dans le CRM
2. Le CRM envoie un `POST /api/calls/dial` au backend FastAPI
3. Le backend appelle `POST /v2/callback` avec `to_number` et `device`
4. Ringover appelle l'utilisateur sur son poste/app
5. Quand il décroche, Ringover appelle automatiquement le destinataire

Paramètres disponibles :
- `to_number` (requis) : numéro au format E.164 sans le `+`
- `from_number` (optionnel) : numéro Ringover de l'appelant
- `timeout` : délai avant abandon (20-300s, défaut: 45s)
- `device` : `ALL` | `APP` | `WEB` | `SIP` | `MOB` | `EXT`
- `clir` : masquer le numéro appelant (défaut: false)

Le bouton click-to-call est disponible sur :
- Fiche client 360° (à côté du téléphone)
- Playlist du jour (chaque entrée)
- Rappels du dashboard

### Système de rappels

Les rappels sont gérés via le système de qualification des appels :

1. Lors de la qualification d'un appel, le commercial peut saisir :
   - **Prochaine étape** (texte libre) : "Rappeler lundi", "Envoyer devis"...
   - **Date de rappel** (date picker) : date à laquelle le rappel apparaîtra

2. Les rappels remontent dans :
   - **Dashboard** : section "Rappels à venir" avec bouton click-to-call
   - **Playlist du jour** : le générateur inclut automatiquement les rappels
     dont la `next_step_date` = date du jour (priorité 1, avant churn/upsell)
   - **API** : `GET /api/calls/reminders` (avec filtre `include_past`)

### Webhooks Ringover (temps réel)

```
Ringover ──webhook──▶ POST /api/webhooks/ringover ──▶ FastAPI
                                                         │
                     Événements capturés :               │
                     ├── call.started                     ├──▶ Insert calls (status=ringing)
                     ├── call.answered                    ├──▶ Update calls (status=answered)
                     ├── call.ended                       ├──▶ Update calls (duration, record_url)
                     ├── call.missed                      ├──▶ Insert calls (status=missed)
                     └── voicemail.received               └──▶ Insert calls (voicemail_url)
                                                         │
                     Après chaque événement :             │
                     ├── Matching téléphone → client      │
                     ├── Push SSE au commercial concerné  │
                     └── Création entrée To-Do List       │
```

### Auto-création de profils clients (numéros inconnus)

Lors de la synchronisation des appels (`sync_calls`), si un numéro de téléphone
n'est pas trouvé dans `phone_index`, le système crée automatiquement :

1. Un **Client** avec des valeurs par défaut :
   - `name` = numéro E.164, `sage_id` = `AUTO-{uuid}`, `source` = `ringover`
2. Une entrée **PhoneIndex** associée au nouveau client
3. Une entrée **ClientAuditLog** (action = `created`, details = "Auto-créé depuis appel Ringover")

Cela garantit que chaque appel est toujours rattaché à un client, même si le
numéro n'existe pas dans Sage 100.

### Matching téléphonique (Phone Index)

Le matching est le coeur du système "Phone-First". On maintient une table
`phone_index` qui normalise tous les numéros au format E.164 :

```
Numéro brut Sage         →  Normalisation  →  E.164
"06 74 72 87 59"          →  phonenumbers   →  "+33674728759"
"+33 (0)1 40 23 52 32"   →  phonenumbers   →  "+33140235232"
"0049 40 64666180"        →  phonenumbers   →  "+494064666180"
"(596) (0) 596 70 10 2"  →  phonenumbers   →  "+596596701002"

Appel entrant Ringover    →  "+33674728759"
                                    │
                                    ▼
                          phone_index lookup
                                    │
                                    ▼
                          client_id = "uuid-xxx"
```

---

## 6. Schéma de base de données

### Tables complètes (PostgreSQL)

#### `users` — Utilisateurs CRM (commerciaux + admins)

```sql
CREATE TABLE users (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email                 VARCHAR(255) UNIQUE NOT NULL,
    password_hash         VARCHAR(255) NOT NULL,
    name                  VARCHAR(100) NOT NULL,
    role                  VARCHAR(20) NOT NULL DEFAULT 'sales',
        -- 'admin' | 'sales' | 'manager'
    ringover_user_id      VARCHAR(50),
    ringover_number       VARCHAR(20),          -- n° Ringover assigné (+33176340XXX)
    ringover_email        VARCHAR(255),          -- email Ringover (matching alternatif)
    sage_collaborator_id  INTEGER,               -- CO_No de F_COLLABORATEUR
    sage_rep_name         VARCHAR(70),
    phone                 VARCHAR(20),           -- téléphone perso du commercial
    target_ca_monthly     DECIMAL(15,2),         -- objectif CA mensuel (€)
    is_active             BOOLEAN DEFAULT TRUE,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW()
);
```

#### `clients` — Clients (source: Sage F_COMPTET)

```sql
CREATE TABLE clients (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sage_id             VARCHAR(17) UNIQUE NOT NULL,
    name                VARCHAR(100) NOT NULL,
    short_name          VARCHAR(35),
    quality             VARCHAR(17),
    contact_name        VARCHAR(35),
    address             VARCHAR(100),
    address_complement  VARCHAR(100),
    postal_code         VARCHAR(9),
    city                VARCHAR(50),
    region              VARCHAR(25),
    country             VARCHAR(35) DEFAULT 'France',
    phone               VARCHAR(21),
    phone_e164          VARCHAR(20),
    fax                 VARCHAR(21),
    email               VARCHAR(255),
    website             VARCHAR(255),
    siret               VARCHAR(20),
    vat_number          VARCHAR(30),
    naf_code            VARCHAR(7),
    sales_rep           VARCHAR(70),
    assigned_user_id    UUID REFERENCES users(id),
    tariff_category     VARCHAR(50),
    accounting_category VARCHAR(20),
    margin_group        VARCHAR(50),
    is_prospect         BOOLEAN DEFAULT FALSE,
    is_dormant          BOOLEAN DEFAULT FALSE,
    sage_created_at     TIMESTAMPTZ,
    synced_at           TIMESTAMPTZ DEFAULT NOW(),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_clients_sage_id ON clients(sage_id);
CREATE INDEX idx_clients_phone_e164 ON clients(phone_e164);
CREATE INDEX idx_clients_assigned_user ON clients(assigned_user_id);
CREATE INDEX idx_clients_sales_rep ON clients(sales_rep);
```

#### `contacts` (NEW)

| Colonne | Type | Description |
|---------|------|-------------|
| id | UUID | PK |
| company_id | UUID FK → clients | Entreprise rattachée (nullable) |
| assigned_user_id | UUID FK → users | Commercial assigné |
| name | VARCHAR(100) | Nom complet |
| first_name | VARCHAR(50) | Prénom (optionnel) |
| last_name | VARCHAR(50) | Nom de famille (optionnel) |
| role | VARCHAR(50) | Rôle/fonction (ex: Directeur, Acheteur) |
| phone | VARCHAR(30) | Téléphone brut |
| phone_e164 | VARCHAR(20) | Téléphone E.164 |
| email | VARCHAR(255) | Email |
| is_primary | BOOLEAN | Contact principal de l'entreprise |
| source | VARCHAR(20) | sage / ringover / manual |
| created_at | TIMESTAMP | Date de création |
| updated_at | TIMESTAMP | Date de dernière modification |

#### `phone_index` — Index de matching téléphonique

```sql
CREATE TABLE phone_index (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_e164   VARCHAR(20) NOT NULL,
    client_id    UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    contact_id   UUID REFERENCES contacts(id) ON DELETE SET NULL,  -- FK → contacts
    source       VARCHAR(20) NOT NULL DEFAULT 'sage',
        -- 'sage' | 'ringover' | 'manual'
    raw_phone    VARCHAR(50),
    label        VARCHAR(20),
        -- 'main' | 'mobile' | 'fax' | 'other'
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_phone_index_e164_client
    ON phone_index(phone_e164, client_id);
CREATE INDEX idx_phone_index_e164
    ON phone_index(phone_e164);
```

#### `sales_lines` — Lignes de ventes (source: Sage F_DOCLIGNE)

```sql
CREATE TABLE sales_lines (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sage_piece_id    VARCHAR(13) NOT NULL,
    sage_doc_type    SMALLINT NOT NULL,
        -- 1=BC (Bon de Commande), 3=BL (Bon de Livraison), 6=Facture, 7=Avoir
    client_sage_id   VARCHAR(17) NOT NULL,
    client_id        UUID REFERENCES clients(id),
    client_name      VARCHAR(100),
    date             DATE NOT NULL,
    article_ref      VARCHAR(18),
    designation      VARCHAR(100),
    quantity         DECIMAL(15,4),
    unit_price       DECIMAL(15,4),
    net_weight       DECIMAL(15,4),
    discount         DECIMAL(15,4) DEFAULT 0,
    net_unit_price   DECIMAL(15,4),
    cost_price       DECIMAL(15,4),
    amount_ht        DECIMAL(15,2) NOT NULL,
    sales_rep        VARCHAR(70),
    sage_collaborator_id INTEGER,                -- CO_No du collaborateur Sage
    user_id          UUID REFERENCES users(id),  -- lien direct vers le commercial CRM
    margin_value     DECIMAL(15,2),
    margin_percent   DECIMAL(5,2),
    doc_total_ttc    DECIMAL(15,2),          -- total TTC du document (F_DOCENTETE)
    doc_amount_paid  DECIMAL(15,2),          -- montant réglé du document (F_DOCENTETE)
    synced_at        TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(sage_piece_id, article_ref, client_sage_id, date)
);

CREATE INDEX idx_sales_lines_client ON sales_lines(client_sage_id);
CREATE INDEX idx_sales_lines_client_id ON sales_lines(client_id);
CREATE INDEX idx_sales_lines_date ON sales_lines(date DESC);
CREATE INDEX idx_sales_lines_rep ON sales_lines(sales_rep);
CREATE INDEX idx_sales_lines_article ON sales_lines(article_ref);
CREATE INDEX idx_sales_lines_user_id ON sales_lines(user_id);
```

#### `calls` — Appels (source: Ringover)

```sql
CREATE TABLE calls (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ringover_cdr_id  BIGINT UNIQUE NOT NULL,
    call_id          VARCHAR(100),
    direction        VARCHAR(10) NOT NULL,
        -- 'IN' | 'OUT'
    is_answered      BOOLEAN DEFAULT FALSE,
    last_state       VARCHAR(20),
    start_time       TIMESTAMPTZ NOT NULL,
    end_time         TIMESTAMPTZ,
    total_duration   INTEGER DEFAULT 0,
    incall_duration  INTEGER DEFAULT 0,
    from_number      VARCHAR(20),
    to_number        VARCHAR(20),
    contact_number   VARCHAR(20),
    contact_e164     VARCHAR(20),
    hangup_by        VARCHAR(20),
    voicemail_url    TEXT,
    record_url       TEXT,
    user_id          UUID REFERENCES users(id),
    user_name        VARCHAR(100),
    user_email       VARCHAR(255),
    client_id        UUID REFERENCES clients(id),
    contact_id       UUID REFERENCES contacts(id),  -- FK → contacts
    contact_name     VARCHAR(100),
    synced_at        TIMESTAMPTZ DEFAULT NOW(),
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_calls_cdr ON calls(ringover_cdr_id);
CREATE INDEX idx_calls_client ON calls(client_id);
CREATE INDEX idx_calls_user ON calls(user_id);
CREATE INDEX idx_calls_start ON calls(start_time DESC);
CREATE INDEX idx_calls_contact_e164 ON calls(contact_e164);
```

#### `call_qualifications` — Qualification des appels (To-Do List)

```sql
CREATE TABLE call_qualifications (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id       UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES users(id),
    mood          VARCHAR(20),
        -- 'hot' | 'warm' | 'cold' | 'voicemail' | 'no_answer' | 'callback'
    tags          TEXT[],
    outcome       VARCHAR(30),
        -- 'order_placed' | 'quote_sent' | 'callback_scheduled'
        -- | 'not_interested' | 'info_given' | 'wrong_number'
    next_step     TEXT,
    next_step_date DATE,
    notes         TEXT,
    xp_earned     INTEGER DEFAULT 0,
    qualified_at  TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(call_id)
);

CREATE INDEX idx_qualif_user ON call_qualifications(user_id);
CREATE INDEX idx_qualif_pending ON call_qualifications(user_id)
    WHERE qualified_at IS NULL;
```

#### `client_scores` — Scoring algorithmique (calculé chaque nuit)

```sql
CREATE TABLE client_scores (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id               UUID UNIQUE NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

    -- Métriques RFM (Recency, Frequency, Monetary)
    last_order_date         DATE,
    days_since_last_order   INTEGER,
    order_count_12m         INTEGER DEFAULT 0,
    order_count_total       INTEGER DEFAULT 0,
    avg_frequency_days      DECIMAL(8,1),
    avg_basket              DECIMAL(12,2) DEFAULT 0,
    total_revenue_12m       DECIMAL(15,2) DEFAULT 0,
    total_revenue_all       DECIMAL(15,2) DEFAULT 0,
    total_margin_12m        DECIMAL(15,2) DEFAULT 0,
    avg_margin_percent      DECIMAL(5,2) DEFAULT 0,

    -- Scores calculés (0 à 100)
    churn_risk_score        INTEGER DEFAULT 0,
    upsell_score            INTEGER DEFAULT 0,
    global_priority_score   INTEGER DEFAULT 0,

    -- Metadata
    computed_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_scores_churn ON client_scores(churn_risk_score DESC);
CREATE INDEX idx_scores_priority ON client_scores(global_priority_score DESC);
```

#### `daily_playlists` — Playlists quotidiennes (générées chaque matin)

```sql
CREATE TABLE daily_playlists (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    client_id       UUID NOT NULL REFERENCES clients(id),
    generated_date  DATE NOT NULL DEFAULT CURRENT_DATE,
    priority        INTEGER NOT NULL,
    reason          VARCHAR(50) NOT NULL,
        -- 'churn_risk' | 'reactivation' | 'upsell'
        -- | 'regular_followup' | 'new_prospect' | 'callback'
    reason_detail   TEXT,
    score           INTEGER DEFAULT 0,
    status          VARCHAR(20) DEFAULT 'pending',
        -- 'pending' | 'called' | 'skipped' | 'done' | 'postponed'
    called_at       TIMESTAMPTZ,
    call_id         UUID REFERENCES calls(id),

    UNIQUE(user_id, client_id, generated_date)
);

CREATE INDEX idx_playlist_user_date
    ON daily_playlists(user_id, generated_date DESC);
CREATE INDEX idx_playlist_status
    ON daily_playlists(user_id, generated_date, status);
```

#### `gamification` — Scoring hybride (Effort + Cash)

```sql
CREATE TABLE gamification (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id),
    period_start        DATE NOT NULL,
    period_type         VARCHAR(10) NOT NULL DEFAULT 'daily',
        -- 'daily' | 'weekly' | 'monthly'

    -- XP Effort (hygiène CRM)
    xp_effort           INTEGER DEFAULT 0,
    calls_made          INTEGER DEFAULT 0,
    calls_qualified     INTEGER DEFAULT 0,
    playlist_completed  INTEGER DEFAULT 0,
    playlist_total      INTEGER DEFAULT 0,

    -- XP Cash (résultats business, alimenté par Sage)
    xp_cash             INTEGER DEFAULT 0,
    revenue_generated   DECIMAL(15,2) DEFAULT 0,
    orders_count        INTEGER DEFAULT 0,
    new_clients_count   INTEGER DEFAULT 0,

    -- Total
    total_xp            INTEGER DEFAULT 0,

    UNIQUE(user_id, period_start, period_type)
);

CREATE INDEX idx_gamif_leaderboard
    ON gamification(period_start, period_type, total_xp DESC);
```

#### `products` — Catalogue produits (source: Sage F_ARTICLE)

```sql
CREATE TABLE products (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_ref     VARCHAR(18) UNIQUE NOT NULL,
    designation     VARCHAR(255),
    family          VARCHAR(35),
    sub_family      VARCHAR(35),
    unit            VARCHAR(10),
    sale_price      DECIMAL(15,4),
    cost_price      DECIMAL(15,4),
    weight          DECIMAL(15,4),
    is_active       BOOLEAN DEFAULT TRUE,
    barcode         VARCHAR(50),
    is_service      BOOLEAN DEFAULT FALSE,
        -- TRUE pour les articles de service (TRANSPORT, ARTDIVERS, ZACOMPTE, etc.)
        -- Exclus des listings produits, suggestions upsell et co-achats
    notes           TEXT,

    -- Stock (synced from F_ARTSTOCK, dépôt principal DE_No=1)
    stock_quantity    DECIMAL(15,4),   -- AS_QteSto : quantité brute
    stock_reserved    DECIMAL(15,4),   -- AS_QteRes : réservé client
    stock_ordered     DECIMAL(15,4),   -- AS_QteCom : commandé fournisseur
    stock_preparing   DECIMAL(15,4),   -- AS_QtePrepa : en préparation
    stock_available   DECIMAL(15,4),   -- calculé : QteSto - QteRes - QtePrepa
    stock_forecast    DECIMAL(15,4),   -- calculé : disponible + QteCom
    stock_min         DECIMAL(15,4),   -- AS_QteMini : seuil de réappro
    stock_max         DECIMAL(15,4),   -- AS_QteMaxi : capacité max
    stock_value       DECIMAL(15,2),   -- AS_MontSto : valeur du stock €
    stock_synced_at   TIMESTAMPTZ,     -- dernière sync stock

    synced_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_product_family ON products(family);
CREATE INDEX idx_product_ref ON products(article_ref);
```

#### `ai_analyses` — IA transcription + double feedback (v1.3)

```sql
CREATE TABLE ai_analyses (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id               UUID UNIQUE NOT NULL REFERENCES calls(id) ON DELETE CASCADE,

    -- Transcription brute
    transcript            TEXT,
    summary               TEXT,

    -- Feedback Sales (coaching)
    sales_feedback        TEXT,           -- Coaching constructif pour le commercial
    client_sentiment      VARCHAR(20),    -- positive / neutral / negative
    detected_opportunities TEXT,          -- Upsell, nouveaux produits détectés
    next_actions          TEXT,           -- Actions recommandées par l'IA
    key_topics            JSONB,          -- Liste des sujets abordés

    -- Feedback Admin (scoring qualité)
    politeness_score      SMALLINT CHECK (politeness_score BETWEEN 0 AND 10),
    objection_handling    SMALLINT CHECK (objection_handling BETWEEN 0 AND 10),
    closing_attempt       SMALLINT CHECK (closing_attempt BETWEEN 0 AND 10),
    product_knowledge     SMALLINT CHECK (product_knowledge BETWEEN 0 AND 10),
    listening_quality     SMALLINT CHECK (listening_quality BETWEEN 0 AND 10),
    overall_score         SMALLINT CHECK (overall_score BETWEEN 0 AND 10),
    admin_feedback        TEXT,           -- Feedback détaillé pour le manager
    admin_scores_raw      JSONB,          -- JSON brut de l'évaluation GPT

    -- Méta
    duration_seconds      INTEGER,
    cost_transcription    DECIMAL(6,4),
    cost_analysis         DECIMAL(6,4),
    analyzed_at           TIMESTAMPTZ DEFAULT NOW()
);
```

#### `sync_logs` — Journal de synchronisation

```sql
CREATE TABLE sync_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source          VARCHAR(20) NOT NULL,
        -- 'sage_clients' | 'sage_sales' | 'ringover_calls' | 'ringover_contacts'
    sync_type       VARCHAR(10) NOT NULL,
        -- 'full' | 'delta'
    status          VARCHAR(20) NOT NULL DEFAULT 'running',
        -- 'running' | 'success' | 'error'
    records_found   INTEGER DEFAULT 0,
    records_created INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    records_errors  INTEGER DEFAULT 0,
    error_message   TEXT,
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    finished_at     TIMESTAMPTZ
);
```

#### `client_audit_logs` — Journal d'audit des modifications clients

```sql
CREATE TABLE client_audit_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    contact_id  UUID REFERENCES contacts(id) ON DELETE SET NULL,  -- FK → contacts
    user_id     UUID REFERENCES users(id),
    action      VARCHAR(30) NOT NULL,
        -- 'created' | 'updated' | 'merged' | 'phone_added' | 'phone_removed'
    field_name  VARCHAR(50),              -- champ modifié (ex: 'name', 'email')
    old_value   TEXT,                     -- ancienne valeur (NULL si création)
    new_value   TEXT,                     -- nouvelle valeur
    details     TEXT,                     -- contexte libre (ex: "Auto-créé depuis appel Ringover")
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_client_audit_client ON client_audit_logs(client_id);
CREATE INDEX idx_client_audit_action ON client_audit_logs(action);
```

#### `margin_rules` — Règles de calcul de marge nette (configurable)

```sql
CREATE TABLE margin_rules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL,
    description     TEXT,
    calc_type       VARCHAR(20) NOT NULL, -- 'per_kg' | 'percent_ca'
    value           DECIMAL(15,4) NOT NULL,
    applies_to      VARCHAR(100) DEFAULT 'all', -- 'all' | 'group:metro' | 'group:csf'
    effective_from  DATE,
    effective_to    DATE, -- NULL = actif
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

#### `user_objectives` — Objectifs multi-KPI par commercial

```sql
CREATE TABLE user_objectives (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    metric          VARCHAR(30) NOT NULL, -- 'ca','margin_gross','margin_net','quantity_kg','quantity_units','avg_basket','avg_ca_per_order','order_count'
    period_type     VARCHAR(15) DEFAULT 'monthly', -- 'monthly' | 'quarterly' | 'yearly'
    target_value    DECIMAL(15,2) NOT NULL,
    start_date      DATE,
    end_date        DATE,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

#### `challenges` — Challenges commerciaux (concours sur produits)

```sql
CREATE TABLE challenges (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(150) NOT NULL,
    description     TEXT,
    article_ref     VARCHAR(18),        -- legacy : produit unique
    article_refs    TEXT,               -- multi-ref (CSV : "REF1,REF2,REF3")
    article_family  VARCHAR(50),        -- ou ciblage par famille entière
    article_name    VARCHAR(100),
    metric          VARCHAR(30) NOT NULL, -- 'quantity_kg','quantity_units','ca','margin_gross'
    target_value    DECIMAL(15,2),
    reward          VARCHAR(200),
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    status          VARCHAR(15) DEFAULT 'draft', -- 'draft' | 'active' | 'completed'
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

#### `challenge_rankings` — Classement live des challenges

```sql
CREATE TABLE challenge_rankings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_id    UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id),
    current_value   DECIMAL(15,2) DEFAULT 0,
    rank            INTEGER DEFAULT 0,
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

#### `suppliers` — Base globale des fournisseurs (intel commerciale)

```sql
CREATE TABLE suppliers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(200) UNIQUE NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

#### `competitors` — Base globale des concurrents (intel commerciale)

```sql
CREATE TABLE competitors (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(200) UNIQUE NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

#### `client_suppliers` — Association client ↔ fournisseur

```sql
CREATE TABLE client_suppliers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id   UUID NOT NULL REFERENCES clients(id),
    supplier_id UUID NOT NULL REFERENCES suppliers(id),
    notes       TEXT,
    added_by    UUID REFERENCES users(id),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(client_id, supplier_id)
);
```

#### `client_competitors` — Association client ↔ concurrent

```sql
CREATE TABLE client_competitors (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id   UUID NOT NULL REFERENCES clients(id),
    competitor_id UUID NOT NULL REFERENCES competitors(id),
    notes       TEXT,
    added_by    UUID REFERENCES users(id),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(client_id, competitor_id)
);
```

#### `client_product_interests` — Produits d'intérêt d'un client

```sql
CREATE TABLE client_product_interests (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id   UUID NOT NULL REFERENCES clients(id),
    article_ref VARCHAR(18),           -- réf catalogue (nullable pour saisie libre)
    product_name VARCHAR(200) NOT NULL, -- nom affiché
    notes       TEXT,
    added_by    UUID REFERENCES users(id),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

#### `call_sessions` — Sessions Call Companion (pré-qualification)

```sql
CREATE TABLE call_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id       UUID NOT NULL REFERENCES clients(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    phone_number    VARCHAR(30),
    mood            VARCHAR(20),        -- 'positive' | 'neutral' | 'negative'
    outcome         VARCHAR(30),        -- 'interested' | 'callback' | 'order' | 'nrp' | 'not_interested' | 'quote_sent'
    notes           TEXT,
    next_step       VARCHAR(200),
    next_step_date  DATE,
    matched_call_id UUID REFERENCES calls(id), -- appairé après sync Ringover
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    ended_at        TIMESTAMPTZ
);
```

#### `client_notes` — Notes libres sur un client

```sql
CREATE TABLE client_notes (
    id          VARCHAR(36) PRIMARY KEY,
    client_id   VARCHAR(50) NOT NULL REFERENCES clients(id),
    user_id     VARCHAR(36) REFERENCES users(id),
    user_name   VARCHAR(100),
    content     TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 7. Moteur de scoring & playlists

### Algorithme RFM (Recency, Frequency, Monetary)

Le scoring s'exécute chaque nuit après la sync Sage. Il analyse les `sales_lines`
pour calculer des métriques par client.

**Distinction clé BC/BL vs Factures :**
- **Recency** (`last_order_date`, `days_since_last_order`) : calculée sur **tous les types de documents** (BC=1, BL=3, Factures=6, Avoirs=7) pour refléter l'activité réelle du client, y compris les commandes non encore facturées.
- **Métriques financières** (CA, marge, order_count, avg_basket) : calculées uniquement sur les **factures et avoirs** (types 6, 7) pour éviter le double-comptage avec les BC/BL qui seront transformés en factures.

```
Pour chaque client ayant au moins 1 commande :

1. RECENCY (Dernière activité — TOUS types : BC, BL, Factures, Avoirs)
   └─ days_since_last_order = TODAY - MAX(sales_lines.date WHERE sage_doc_type IN (1,3,6,7))

2. FREQUENCY (Fréquence — Factures uniquement : types 6, 7)
   ├─ order_count_12m = COUNT(DISTINCT sage_piece_id) sur 12 mois
   └─ avg_frequency_days = 365 / order_count_12m

3. MONETARY (Valeur — Factures uniquement : types 6, 7)
   ├─ total_revenue_12m = SUM(amount_ht) sur 12 mois
   ├─ avg_basket = total_revenue_12m / order_count_12m
   └─ total_margin_12m = SUM(margin_value) sur 12 mois
```

### Lifecycle des clients (status)

Le champ `clients.status` remplace les booléens `is_prospect`/`is_dormant` (conservés pour rétrocompatibilité). C'est un enum qui pilote tout le CRM : scoring, playlists, UI.

```
                   Appel décroché >30s
   ┌──────────┐ ─────────────────────► ┌──────────────┐
   │ PROSPECT │                        │     LEAD     │
   └──────────┘                        │  (qualifié)  │
                                       └──────┬───────┘
                                              │ 1ère vente (sync Sage)
                                              ▼
                   ┌──────────────────────────────────────────────┐
                   │                  CLIENT                       │
                   │              (actif, commande)                │
                   └──────────────┬────────────────┬──────────────┘
                                  │                │
                   churn ≥ 60%    │                │ churn < 60%
                   (scoring RFM)  ▼                │ (retour normal)
                           ┌──────────────┐        │
                           │   AT_RISK    │ ◄──────┘
                           │  (à risque)  │
                           └──────┬───────┘
                                  │ days_since ≥ 180j
                                  ▼
                           ┌──────────────┐  nouvelle commande
                           │   DORMANT    │ ──────────────────► CLIENT
                           │  (inactif)   │    (réactivation)
                           └──────┬───────┘
                                  │ MANUEL uniquement
                                  │ outcome = 'not_interested'
                                  ▼
                           ┌──────────────┐
                           │     DEAD     │  ← jamais automatique
                           │   (perdu)    │  ← aucune transition sortante auto
                           └──────────────┘
```

#### Transitions automatiques

| Transition | Déclencheur | Quand |
|-----------|------------|-------|
| prospect → lead | Appel décroché (`is_answered=true`, `incall_duration > 30s`) matché sur ce client | À la qualification de l'appel |
| lead → client | Première `sales_line` rattachée au client | Sync Sage (delta ou full) |
| client → at_risk | `churn_risk_score ≥ 60` (scoring RFM) | Scoring quotidien (06h30) |
| at_risk → dormant | `days_since_last_order ≥ 180` | Scoring quotidien |
| at_risk → client | `churn_risk_score < 60` (client a recommandé) | Scoring quotidien |
| dormant → client | Nouvelle commande détectée (réactivation, +300 XP) | Sync Sage |
| * → dead | `outcome = 'not_interested'` lors d'une qualification | Manuel uniquement |

#### Cooldown dormant contacté

Quand un dormant est contacté (appel >30s), il **ne passe pas en dead**. Il reste dormant mais sort de la playlist pendant **14 jours** (cooldown) pour éviter la saturation.

```sql
clients.contact_cooldown_until = DATE(NOW() + INTERVAL '14 days')
clients.dormant_contact_count += 1
clients.dormant_first_contact_at = COALESCE(dormant_first_contact_at, NOW())
```

Après **5 tentatives** sur **6 mois** sans commande, le dormant remonte en tête de playlist avec un flag "⚠ décision requise" pour que le manager tranche (dead ou pas).

#### Feedback de qualification dans le scoring playlist

Les données de qualification des appels alimentent la fiche client et influencent le tri des playlists :

| Champ client | Alimenté par | Impact playlist |
|-------------|-------------|-----------------|
| `last_qualification_mood` | Mood de la dernière qualification | — |
| `last_qualification_outcome` | Outcome de la dernière qualification | dead si not_interested |
| `qualification_hot_count` | Compteur de moods "hot" | Priorité de tri (hot clients d'abord) |
| `qualification_cold_count` | Compteur de moods "cold" | — |

Le générateur de playlist trie par `qualification_hot_count DESC` dans chaque catégorie, garantissant que les clients "chauds" remontent en priorité.

### Calcul du Churn Risk Score (0-100) — Multi-facteurs

Le score est la somme de trois composantes indépendantes, plafonnée à 100 :

| Composante | Plage | Ce qu'elle mesure |
|---|---|---|
| **Recency** | 0-40 | Temps absolu depuis la dernière commande |
| **Freq. deviation** | 0-35 | Retard par rapport au rythme habituel (≥ 3 commandes) |
| **Tendance** | 0-25 | Déclin d'activité (volume et/ou CA vs historique) |

```
Recency (jours depuis dernière activité — BC, BL, Factures, Avoirs)
  ≤ 30j → 0  |  31-60j → 10  |  61-90j → 20  |  91-180j → 30  |  180+ → 40

Frequency deviation (ratio = jours_depuis / freq_moyenne, si ≥ 3 commandes)
  ≤ 1.2x → 0  |  1.2-1.8x → 10  |  1.8-2.5x → 20  |  2.5-4x → 30  |  4x+ → 35
  Clients ≤ 2 commandes + 180j+ d'inactivité → +20 (one-shot perdu)

Tendance d'activité (si ≥ 3 commandes)
  0 commande sur 12 mois → +20
  Nb commandes 12m < 50% du rythme attendu → +15
  Nb commandes 12m < 70% du rythme attendu → +8
  CA 12m < 30% du CA annuel moyen historique → +5

Bonus haute valeur : panier moyen > 2× médiane → +5
```

Exemples de calibration réelle :

| Client | Cmd total | Freq. moy | Jours inactif | Cmd 12m | Score | Interprétation |
|---|---|---|---|---|---|---|
| METRO FRANCE | 602 | 3j | 8j | 115 | 35 | Léger retard pour un client quotidien |
| AVIGROS | 122 | 14j | 67j | 9 | 75 | Déclin critique (9 vs 25 attendues) |
| BARBECUE AND CO | 32 | 57j | 68j | 5 | 25 | Dans les temps |
| EUROVOLAILLES | 68 | 25j | 434j | 0 | 100 | Perdu |
| MIDO (1 commande) | 1 | — | 1695j | 0 | 60 | One-shot jamais revenu |

### Génération des To Do (chaque matin à 6h30)

Chaque commercial possède une **PlaylistConfig** configurable par l'admin, définissant la répartition en pourcentages, les seuils et les filtres intel optionnels.

#### Table `playlist_configs`

```sql
CREATE TABLE playlist_configs (
    id                      VARCHAR(36) PRIMARY KEY,
    user_id                 VARCHAR(36) NOT NULL REFERENCES users(id) UNIQUE,
    is_active               BOOLEAN DEFAULT TRUE,
    total_size              INTEGER DEFAULT 15,
    pct_callback            INTEGER DEFAULT 10,   -- conservé en config, mais rappels hors budget
    pct_dormant             INTEGER DEFAULT 35,   -- % clients dormants
    pct_churn_risk          INTEGER DEFAULT 25,   -- % risque churn
    pct_upsell              INTEGER DEFAULT 25,   -- % opportunités upsell
    pct_prospect            INTEGER DEFAULT 15,   -- % nouveaux prospects
    dormant_min_days        INTEGER DEFAULT 90,   -- seuil jours inactivité
    churn_min_score         INTEGER DEFAULT 40,   -- seuil score churn minimum
    upsell_min_score        INTEGER DEFAULT 30,   -- seuil score upsell minimum
    filter_mode             VARCHAR(30) DEFAULT 'disabled',
    filter_competitor_ids   TEXT[],
    filter_supplier_ids     TEXT[],
    filter_product_refs     TEXT[],
    filter_product_families TEXT[]
);
```

| Colonne | Rôle |
|---|---|
| `filter_mode` | `disabled` (par défaut), `replace_prospects` ou `dedicated_pool` |
| `filter_competitor_ids` | IDs concurrents pour filtrage intel |
| `filter_supplier_ids` | IDs fournisseurs pour filtrage intel |
| `filter_product_refs` | Références produits pour filtrage intel |
| `filter_product_families` | Familles de produits pour filtrage intel |

#### Algorithme de génération

```
Pour chaque commercial (user.role in ['sales', 'manager', 'admin']) :

1. Charger la PlaylistConfig (ou valeurs par défaut)
2. Charger les entrées pending existantes du user (toutes dates)
   → leurs client_ids alimentent seen_clients au démarrage (stacking)
3. Calculer les slots : total_size × pct / 100
   Les 4 pourcentages éditables : pct_dormant (35%), pct_churn_risk (25%),
   pct_upsell (25%), pct_prospect (15%)

4. CALLBACKS (rappels planifiés) — HORS BUDGET
   Qualifications avec next_step_date ≤ TODAY
   Ajoutés en plus de total_size (ne consomment aucun slot)
   pct_callback existe en config mais les rappels sont toujours ajoutés

5. DORMANTS (clients inactifs)
   Clients is_dormant = TRUE, triés par ancienneté
   Matching flexible sur sales_rep (ILIKE)

6. CHURN RISK (risque de perte)
   Clients actifs avec churn_risk_score ≥ seuil configuré
   Triés par score décroissant

7. UPSELL (vente additionnelle)
   Clients avec upsell_score ≥ seuil configuré
   Triés par score décroissant

8. PROSPECTS (nouveaux clients)
   Clients is_prospect = TRUE, sélection aléatoire
   ⚠ Si filter_mode = "replace_prospects" : les slots prospect sont
   remplis par des clients correspondant aux filtres intel

9. FILTER MODE "dedicated_pool" (opé éclair)
   100% du To Do est rempli exclusivement par des clients correspondant
   aux filtres intel (concurrents, fournisseurs, produits, familles)

Stacking : la génération ne supprime jamais les entrées pending existantes.
Les nouveaux leads sont ajoutés par-dessus.

Entrées protégées : les entrées manuelles et callback ne sont jamais
supprimées par un clear ou une régénération.

Total configurable : 5 à 50 clients/jour par commercial
```

#### Protection anti-doublons

Trois mécanismes complémentaires empêchent les doublons :

**1. Cross-user dedup (7 jours glissants)**

Les clients ayant une entrée au statut `pending` dans le To Do d'un autre commercial sur les **7 derniers jours** sont exclus de la génération (pas uniquement le jour même).

```
Génération batch :
    global_seen = ∅
    pending_7d = SELECT DISTINCT client_id FROM playlist_entries
                 WHERE status = 'pending'
                 AND created_at ≥ NOW() - INTERVAL '7 days'

    Pour chaque commercial :
        seen_clients = copy(global_seen) ∪ pending_7d
        ... sélection clients ...
        global_seen ∪= seen_clients

    Résultat : aucun doublon inter-commerciaux sur 7 jours
```

**2. Phone e164 dedup**

Les clients partageant le même `phone_e164` sont dédupliqués pour éviter qu'un même numéro de téléphone apparaisse dans plusieurs To Do (ou plusieurs fois dans le même To Do).

**3. Stacking (préservation des pending)**

Les entrées pending existantes (toutes dates confondues) sont chargées dans `seen_clients` au démarrage de la génération pour chaque commercial. Cela garantit qu'un client déjà présent dans le To Do ne sera pas ajouté une seconde fois.

> **Note :** Les entrées manuelles (`source = 'manual'`) et les rappels (`source = 'callback'`) sont **protégées** : elles ne sont jamais supprimées par un clear ou une régénération.

#### Réassignation de clients

L'admin peut transférer des clients d'un commercial à un autre via la page `/admin/assignments`. Cela met à jour `assigned_user_id` et `sales_rep` sur la table `clients`, ce qui impacte directement la prochaine génération de To Do.

#### Assistant d'opportunité (Insight)

Chaque entrée de To Do peut être inspectée via l'endpoint `/api/playlists/{id}/insight` :
- **KPIs client** : CA total, CA 12 mois, panier moyen, scores churn/upsell — calculés en temps réel directement depuis `sales_lines` (pas depuis les scores pré-calculés, pour garantir la fraîcheur)
- **Top 10 produits** commandés avec quantités, CA, dernière date
- **Recommandation IA** (optionnelle, `with_ai=true`) : GPT-4o-mini génère 3-5 points d'action contextués selon le type d'opportunité (upsell, churn, dormant, prospect...)

#### Endpoints admin To Do

| Méthode | Endpoint | Description |
|---|---|---|
| `GET` | `/api/admin/playlist/overview` | Progression To Do par commercial avec entrées détaillées |
| `DELETE` | `/api/admin/playlist/entries` | Suppression d'entrées (unitaire ou en masse) |
| `POST` | `/api/admin/playlist/add-entry` | Ajout manuel d'un client dans le To Do d'un commercial |
| `GET` | `/api/admin/filters/competitors` | Données dropdown concurrents pour filtres intel |
| `GET` | `/api/admin/filters/suppliers` | Données dropdown fournisseurs pour filtres intel |
| `GET` | `/api/admin/filters/product-families` | Données dropdown familles de produits pour filtres intel |
| `GET` | `/api/admin/filters/products` | Données dropdown produits pour filtres intel |

---

## 8. Gamification

### Barème XP Effort (hygiène CRM)

| Action | XP |
|--------|-----|
| Qualifier un appel (mood + notes) | +10 XP |
| Qualifier avec tags + next step | +15 XP |
| Compléter 100% de sa playlist du jour | +50 XP bonus |
| Compléter 80%+ de sa playlist | +25 XP bonus |
| Premier appel avant 9h | +5 XP |

### Barème XP Cash (résultats Sage)

| Événement | XP |
|-----------|-----|
| Nouvelle commande facturée (client existant) | +100 XP |
| Commande d'un nouveau client | +200 XP |
| Commande > panier moyen client | +50 XP bonus |
| Réactivation client dormant (churn_risk > 60) | +300 XP |

### Leaderboard

Affiché en temps réel sur le dashboard. Trois vues :
- **Aujourd'hui** : Qui est le plus actif maintenant
- **Cette semaine** : Classement hebdomadaire
- **Ce mois** : Classement mensuel (reset le 1er)

---

## 9. Objectifs multi-KPI & Marge nette

### Objectifs par commercial

Chaque commercial peut avoir **plusieurs objectifs** sur différents KPIs :

| Métrique | Clé | Unité |
|----------|-----|-------|
| Chiffre d'affaires | `ca` | € |
| Marge brute | `margin_gross` | € |
| Marge nette | `margin_net` | € |
| Quantité vendue | `quantity_kg` | kg |
| Quantité (unités) | `quantity_units` | unités |
| Panier moyen | `avg_basket` | € |
| CA moyen / commande | `avg_ca_per_order` | € |
| Nombre de commandes | `order_count` | — |

Chaque objectif a une **période** (mensuel, trimestriel, annuel) et une **cible** numérique.
La progression est calculée en temps réel sur le dashboard.

### Calcul de la marge nette

La marge nette est calculée à partir de la marge brute en appliquant des **règles de déduction** configurables :

**Formule :**
```
Marge nette = Prix de vente HT - Prix de revient HT - Forfait logistique - Forfait structure - Étiquetage - RFA
```

**Règles de déduction :**

| Règle | Type | Valeur | Appliqué à |
|-------|------|--------|------------|
| Forfait logistique | par kg | 1,00 €/kg | Tous |
| Forfait structure | par kg | 1,00 €/kg | Tous |
| Étiquetage | par kg | 0,15 €/kg | group:metro |
| RFA (Remise) | % CA | 2% | group:csf,promocash |

Les règles sont administrables via `/admin/margins` avec support de dates d'effet (`effective_from` / `effective_to`).
Le poids (`net_weight`) provenant de Sage est stocké en grammes et converti en kg dans les calculs.

### Endpoints API

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/api/objectives` | GET | Liste des objectifs |
| `/api/objectives` | POST | Créer un objectif (admin) |
| `/api/objectives/progress` | GET | Progression temps réel |
| `/api/admin/margin-rules` | GET/POST/PUT/DELETE | CRUD règles de marge |
| `/api/admin/margin-rules/net-margin-stats` | GET | Stats marge nette par commercial |
| `/api/me/margins` | GET | Marges du commercial connecté |

---

## 10. Challenges commerciaux

### Principe

Les challenges sont des **concours ponctuels** pour motiver les commerciaux sur un produit ou un objectif spécifique.

Chaque challenge définit :
- **Nom** et **description** du challenge
- **Ciblage produit** (3 modes) :
  - **Tous les produits** : pas de filtre
  - **Multi-ref** : liste de références articles (`article_refs`, stocké en CSV)
  - **Par famille** : famille de produits (`article_family`) — inclut automatiquement toutes les refs de la famille
- **Métrique** : kg vendus, unités, CA ou marge brute
- **Objectif** : valeur cible (optionnel)
- **Récompense** : texte libre visible par les commerciaux (ex: "iPhone 16", "Week-end spa")
- **Période** : date de début et fin
- **Statut** : brouillon → actif → terminé

### Classement live

Le classement est calculé en temps réel à partir des lignes de vente Sage :
- Filtré par `article_refs` (multi-ref), `article_family` (famille entière) ou `article_ref` (legacy single-ref) et par période
- Agrégation par commercial selon la métrique choisie
- Affiché sur le **dashboard** (top 3 compact + position personnelle) et la **page classement** (détail complet avec barres de progression)

### Endpoints API

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/api/challenges` | GET | Liste des challenges |
| `/api/challenges` | POST | Créer un challenge (admin) |
| `/api/challenges/{id}` | PUT | Modifier un challenge |
| `/api/challenges/{id}/ranking` | GET | Classement live |

---

## 11. IA — Transcription & Double Analyse

> **Statut v1.3 :** Pipeline complet opérationnel. Auto-transcription après sync,
> cache DB, double feedback (sales coaching + admin quality scoring),
> scores intégrés dans le leaderboard.

### Pipeline `backend/ai/transcription.py`

```
full_analysis(record_url, duration) → dict complet stocké en DB
  1. download_recording(url)     → fichier MP3 temporaire (httpx async)
  2. transcribe_audio(path)      → texte (Whisper, langue=fr)
  3. analyze_for_sales(text)     → JSON coaching commercial
     - summary, client_sentiment, sales_feedback
     - detected_opportunities, next_actions, key_topics
  4. analyze_for_admin(text)     → JSON scoring qualité manager
     - politeness_score, objection_handling, closing_attempt
     - product_knowledge, listening_quality, overall_score
     - admin_feedback
```

### Auto-transcription

Après chaque sync Ringover (`POST /api/admin/sync/ringover`), le système
transcrit automatiquement les appels remplissant ces critères :
- `incall_duration > 10` secondes
- `record_url` non null
- Pas encore d'entrée dans `ai_analyses`

Limité à 20 appels par sync pour maîtriser les coûts.

### Cache DB

L'endpoint `POST /api/calls/{id}/transcribe` vérifie d'abord la table
`ai_analyses`. Si l'appel est déjà analysé, retourne le cache instantanément
(~500ms vs ~25s pour une analyse complète).

### Frontend — Vue duale

Dans la page **Appels** (`/calls`), chaque appel avec `record_url` affiche
un bouton casque violet. La modale propose :
- **Player audio HTML5** : lecture directe du MP3 Ringover
- **Vue Commercial** : résumé, coaching, sentiment, opportunités, actions
- **Vue Manager** : grille de scores /10 (politesse, objections, closing,
  produits, écoute, global) + feedback manager
- **Transcription** : verbatim complet en section dépliable

Les scores IA apparaissent aussi directement dans la liste des appels
(badge sentiment + score global).

### Pipeline

```
1. Appel terminé avec recording_url
   │
   ▼
2. Téléchargement audio (Ringover API)
   │
   ▼
3. Transcription (OpenAI Whisper)
   Coût : ~0.006€ / minute
   │
   ▼
4. Analyse (GPT-4o)
   Prompt structuré avec critères client
   Output JSON : scores + résumé + conseils
   Coût : ~0.01-0.03€ / appel selon longueur
   │
   ▼
5. Stockage dans ai_analyses
   │
   ▼
6. Visible dans la fiche appel + stats globales par commercial
```

### Critères d'analyse configurables

```json
{
  "criteria": [
    {
      "name": "politeness_score",
      "label": "Politesse & ton",
      "description": "Le commercial est-il poli, professionnel et agréable ?"
    },
    {
      "name": "objection_handling",
      "label": "Traitement des objections",
      "description": "Le commercial reformule-t-il, argumente-t-il face aux objections ?"
    },
    {
      "name": "closing_attempt",
      "label": "Tentative de closing",
      "description": "Le commercial tente-t-il de conclure (prise de commande, RDV, devis) ?"
    },
    {
      "name": "product_knowledge",
      "label": "Connaissance produit",
      "description": "Le commercial maîtrise-t-il les caractéristiques des produits (coupe, origine, grade) ?"
    }
  ]
}
```

---

## 12. Frontend — Pages & composants

### Arborescence des pages

```
/login                          → Connexion (email + mot de passe)
/                               → Dashboard personnel :
                                  Blocs Business (CA, Commandes, Panier moyen, Volume),
                                  Marges (brute, nette, déductions, taux), Activité téléphonique,
                                  Rappels et Alertes côte à côte, Playlist du jour,
                                  Objectifs multi-KPI et Challenges en cours (côte à côte),
                                  Top clients et Top produits (côte à côte, réactifs aux filtres dates),
                                  Graphique CA,
                                  Sélecteur "Voir en tant que" pour les admins (filtre TOUTES les données)
/playlist                       → Playlist du jour (clients à appeler)
/clients                        → Liste des clients (recherche, filtres, tri, **filtres fournisseur/concurrent/produit**)
/clients/[id]                   → Fiche client 360° (ventes, appels, upsell, **intel commerciale, notes, retours unifiés**)
/calls                          → Historique des appels (panel client intégré, **dédup qualification companion**)
/orders                         → Liste des commandes (filtres type, dates, statut paiement impayé/partiel/payé)
/products                       → Catalogue produits (stats, co-achats, **filtre par entrepôt**)
/leaderboard                    → Classement gamification
/admin                          → Dashboard admin (tour de contrôle)
/admin/users                    → Gestion des utilisateurs (CRUD, Ringover, Sage, objectifs)
/admin/playlists                → Configuration playlists par commercial (répartition %, seuils)
/admin/sales-dashboard          → Dashboard pilotage commercial (KPIs, comparatif, drill-down appels)
/admin/assignments              → Réassignation clients entre commerciaux
/admin/margins              → Configuration des règles de marge nette
/admin/challenges           → Gestion des challenges commerciaux
/admin/glossaire                → Glossaire des variables clés (statuts, scores, seuils)
/admin/settings                 → Paramètres (barèmes XP, critères IA...)
```

### Dashboard Commercial (`/`)

```
┌─────────────────────────────────────────────────────────────────┐
│  Bonjour, Mathieu                              🟢 Connecté     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐      │
│  │ Appels    │ │ Qualifiés │ │ Playlist  │ │ XP        │      │
│  │ aujourd'  │ │ en attente│ │ restante  │ │ aujourd'  │      │
│  │ hui       │ │           │ │           │ │ hui       │      │
│  │   12      │ │   ⚠ 3    │ │   7/10    │ │   85 pts  │      │
│  └───────────┘ └───────────┘ └───────────┘ └───────────┘      │
│                                                                 │
│  ┌─ APPELS À QUALIFIER ────────────────────────────────┐       │
│  │                                                      │       │
│  │  ⚠ 10:23  OUT  +33612345678  (LA FRINGALE)  2m34   │       │
│  │     → [Hot] [Warm] [Cold] [Voicemail]               │       │
│  │     → Notes: ______  Tags: [___]  Next: [___]      │       │
│  │     → [Valider la qualification]                     │       │
│  │                                                      │       │
│  │  ⚠ 10:45  IN   +33698765432  (MUZY)         1m12   │       │
│  │     → ...                                            │       │
│  │                                                      │       │
│  └──────────────────────────────────────────────────────┘       │
│                                                                 │
│  ┌─ MA PLAYLIST DU JOUR ───────────────────────────────┐       │
│  │  1. 🔴 LA FRINGALE        Churn Risk (67j)    [▶]  │       │
│  │  2. 🟡 MUZY               Callback (RDV)      [▶]  │       │
│  │  3. 🟡 PROMOCASH ISTRES   Upsell (prod. B)    [▶]  │       │
│  │  4. ⚪ BUTCHER'S SIGN.    Nouveau prospect     [▶]  │       │
│  │  ...                                                 │       │
│  └──────────────────────────────────────────────────────┘       │
│                                                                 │
│  ┌─ MINI LEADERBOARD ──────────────────────────────────┐       │
│  │  🥇 Mathieu M.  1250 XP  │  🥈 Cecilia C. 980 XP  │       │
│  └──────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

### Fiche Client 360° (`/clients/[id]`)

```
┌─────────────────────────────────────────────────────────────────┐
│  LA FRINGALE                               Sage #10618014      │
│  Rep: PAPIN  │  Cat: Restauration  │  Client depuis 2021       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─ INDICATEURS ───────────────────────────────────────┐       │
│  │ CA 12 mois │ Marge moy. │ Dernière cmd │ Freq │ ⚠ │       │
│  │ 12 450€    │ 34.2%      │ il y a 67j   │ 28j  │ 80│       │
│  │ 🔴 Impayés : 2 factures — 1 234€ restant dû        │       │
│  └──────────────────────────────────────────────────────┘       │
│                                                                 │
│  ┌─ INTEL COMMERCIALE (éditable en direct) ────────────┐       │
│  │ Fournisseurs   │ Concurrents      │ Produits         │       │
│  │ [Metro] [x]    │ [Brake] [x]      │ [Entrecôte] [x]  │       │
│  │ [+ Rechercher] │ [+ Rechercher]   │ [+ Rechercher]   │       │
│  └──────────────────────────────────────────────────────┘       │
│                                                                 │
│  Onglets : Ventes │ Commandes │ Appels │ Retours │ Upsell │   │
│                    │           │        │ Audit   │        │   │
│                                                                 │
│  ┌─ RETOURS (timeline unifiée) ────────────────────────┐       │
│  │ [Ajouter une note sur ce client...          ] [+]   │       │
│  │                                                      │       │
│  │ 🟣 Note  11 mar 19:52 · Admin                       │       │
│  │   "Client très intéressé par le Wagyu A4"           │       │
│  │                                                      │       │
│  │ 🟢 Companion  11 mar 14:30  +33612345678            │       │
│  │   Positif │ Intéressé                                │       │
│  │   "Veut un devis pour 50kg de Wagyu"                │       │
│  │   📅 Rappel vendredi                                 │       │
│  │                                                      │       │
│  │ 🔵 Appel  10 mar 10:23 · Mathieu                    │       │
│  │   Neutre │ Callback                                  │       │
│  │   "Demande catalogue mis à jour"                    │       │
│  │   IA : Client hésite entre 2 fournisseurs...        │       │
│  └──────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

### Dashboard Admin (`/admin`)

```
┌─────────────────────────────────────────────────────────────────┐
│  Tour de Contrôle                          Lun 24 Fév 2026     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─ PRÉSENCES ─────────────────────────────────────────┐       │
│  │ 🟢 Mathieu (en appel — LA FRINGALE — 2m34)         │       │
│  │ 🟢 Cecilia (disponible)                              │       │
│  │ 🟡 Nicolas (pause)                                   │       │
│  │ 🔴 Thomas (déconnecté)                               │       │
│  └──────────────────────────────────────────────────────┘       │
│                                                                 │
│  ┌─ KPIs AUJOURD'HUI ─────────────────────────────────┐       │
│  │ Appels sortants │ Appels connectés │ Durée moy     │       │
│  │      47         │       31         │    3m12       │       │
│  │                                                      │       │
│  │ Qualifications  │ Playlists faites │ Commandes     │       │
│  │   28/31         │    65%           │    4 (Sage)   │       │
│  └──────────────────────────────────────────────────────┘       │
│                                                                 │
│  ┌─ PIPELINE ALGO ─────────────────────────────────────┐       │
│  │ Clients scorés  │ Churn Risk > 50  │ Traités       │       │
│  │     97          │      23          │   18/23       │       │
│  └──────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

### Call Companion (widget flottant)

Le Call Companion est un panneau flottant qui s'ouvre automatiquement au clic sur "Appeler" (ClickToCall). Il **persiste lors de la navigation** entre les pages grâce à un React Context au niveau du layout.

**Architecture :**

- `CallCompanionProvider` (context) → état global (isOpen, isMinimized, sessionId, clientId, intel)
- `CallCompanionWidget` → panneau flottant fixe (desktop: coin bas-droit, mobile: fullscreen)
- `ClickToCall` → appelle `companion.openCompanion()` après `api.dial()` réussi

**Workflow :**

1. Le sales clique sur "Appeler" → Ringover lance l'appel + le Companion s'ouvre
2. Pendant/après l'appel, le sales renseigne : mood, outcome, notes, fournisseurs, concurrents, produits d'intérêt
3. Le sales peut naviguer sur le CRM pendant que le Companion reste ouvert (minimisable)
4. À la soumission, une `CallSession` est créée en base
5. À la prochaine sync Ringover, la session est **automatiquement appairée** au CDR correspondant (matching par user_id + phone + fenêtre temporelle ±2min/30min)
6. Si un appel est qualifié via le Companion, il n'apparaît plus dans "À qualifier" sur la page Appels

**Composants intel (réutilisables) :**

- `SupplierPicker` — recherche/ajout fournisseurs (base globale partagée entre tous les clients)
- `CompetitorPicker` — recherche/ajout concurrents (idem)
- `ProductInterestPicker` — recherche produit dans le catalogue Sage + saisie libre

Ces composants sont utilisés à la fois dans le Call Companion (mode compact) et dans la section "Intel Commerciale" de la fiche client (mode full).

---

## 13. Authentification & sécurité

### Stratégie d'auth

```
1. Login : email + mot de passe → POST /api/auth/login
2. Backend génère un JWT signé (HS256, secret dans .env)
   Payload : { user_id, role, exp (24h) }
3. JWT stocké en httpOnly cookie (secure, sameSite=strict)
4. Chaque requête API vérifie le JWT via middleware FastAPI
5. Refresh token en Redis (durée : 7 jours)
```

### Rôles et permissions

| Ressource | `sales` | `manager` | `admin` |
|-----------|---------|-----------|---------|
| Voir sa playlist | oui | oui | oui |
| Voir ses appels | oui | oui | oui |
| Voir tous les appels | non | oui | oui |
| Qualifier ses appels | oui | oui | oui |
| Voir la fiche client | oui | oui | oui |
| Voir le leaderboard | oui | oui | oui |
| Voir le dashboard admin | non | oui | oui |
| Voir les présences | non | oui | oui |
| Gérer les utilisateurs | non | non | oui |
| Configurer les paramètres | non | non | oui |
| Voir les marges | non | configurable | oui |

### Sécurité réseau

```
- HTTPS obligatoire (Let's Encrypt via Nginx)
- API Ringover key : variable d'environnement, jamais dans le code
- Connexion Sage ODBC : réseau local uniquement, user SQL read-only
- Base PostgreSQL : écoute localhost uniquement (pas exposée)
- Redis : pas de mot de passe nécessaire (localhost bind)
- Rate limiting : 100 req/min par user (via Redis)
```

---

## 14. Flux de données

### Flux A — Sync Sage (nocturne + delta)

```
02h00 (CRON)
    │
    ├─ 1. Connexion ODBC → SQL Server Sage 100
    │
    ├─ 2. SELECT F_COMPTET (clients)
    │     └─ Upsert → table clients
    │        └─ Normalisation téléphone → phone_index
    │
    ├─ 3. SELECT F_DOCLIGNE + F_DOCENTETE (ventes)
    │     └─ Upsert → table sales_lines
    │        └─ Lien client_id via client_sage_id
    │
    ├─ 4. SELECT F_ARTICLE (produits)
    │     └─ Upsert → table products
    │        └─ Merge non-destructif (article_ref)
    │
    ├─ 5. SELECT F_ARTSTOCK (stock, dépôt principal DE_No=1)
    │     └─ Update → colonnes stock_* sur products
    │        └─ Calcul : stock_available = QteSto - QteRes - QtePrepa
    │           stock_forecast = stock_available + QteCom
    │
    ├─ 6. Log résultat → sync_logs
    │
    └─ 6. Trigger scoring_engine

06h30 (CRON)
    │
    ├─ 1. scoring_engine → Calcul RFM par client
    │     └─ Upsert → table client_scores
    │
    └─ 2. playlist_generator → Génère les playlists du jour
          └─ Insert → table daily_playlists

07h00-20h00 (toutes les 15 min)
    │
    └─ Delta sync : SELECT WHERE cbModification > last_sync
       └─ Upsert clients + sales_lines + products modifiés
```

### Flux B — Ringover (temps réel + polling)

```
Temps réel (Webhook) :
    │
    ├─ Ringover POST → /api/webhooks/ringover
    │     │
    │     ├─ Parse événement (call.started, call.ended...)
    │     ├─ Normaliser contact_number → E.164
    │     ├─ Lookup phone_index → trouver client_id
    │     ├─ Upsert → table calls
    │     ├─ Si call.ended :
    │     │   └─ Créer entrée To-Do (call_qualifications vide)
    │     └─ SSE push → commercial concerné
    │
    └─ Fallback (si webhook down) : polling /v2/calls toutes les 2 min

Polling présences (toutes les 30s) :
    │
    └─ GET /v2/presences → Cache Redis (TTL 60s) → SSE push admin
```

### Flux C — Qualification (action commerciale)

```
Commercial clique "Valider" :
    │
    ├─ POST /api/qualify
    │     │
    │     ├─ Insert/Update call_qualifications
    │     ├─ Calcul XP effort (+10 ou +15)
    │     ├─ Update gamification (daily)
    │     ├─ Update daily_playlists (status → 'done')
    │     └─ Si next_step_date → sera dans la playlist future
    │
    └─ SSE push → mise à jour dashboard en temps réel
```

### Flux D — Gamification Cash (nightly après sync Sage)

```
Après scoring_engine :
    │
    ├─ Détecter nouvelles commandes (sales_lines)
    │   └─ Comparer avec sales_lines.synced_at de la veille
    │
    ├─ Pour chaque nouvelle commande :
    │   ├─ Trouver le commercial (sales_rep → user)
    │   ├─ +100 XP (commande standard)
    │   ├─ +200 XP si nouveau client
    │   ├─ +300 XP si réactivation (churn_risk > 60)
    │   └─ +50 XP si panier > moyenne
    │
    └─ Update gamification (daily, weekly, monthly)
```

### Flux E — Mapping utilisateurs (lors des syncs)

```
Sync Ringover (sync_calls) :
    │
    ├─ Pré-charger 3 maps de résolution :
    │   ├─ {ringover_user_id → user.id}   (prioritaire)
    │   ├─ {email → user.id}              (fallback 1)
    │   └─ {name → user.id}              (fallback 2)
    │
    └─ Pour chaque appel :
        └─ Résoudre user_id → Call.user_id (au lieu de juste user_name)

Sync Sage (sync_sales_from_sage) :
    │
    ├─ Pré-charger map {CO_No → user.id} (via sage_collaborator_id)
    │
    ├─ JOIN F_DOCLIGNE + F_COLLABORATEUR pour récupérer CO_Nom + CO_Prenom
    │
    └─ Pour chaque vente :
        ├─ SalesLine.sales_rep = "CO_Nom CO_Prenom"
        ├─ SalesLine.sage_collaborator_id = CO_No
        └─ SalesLine.user_id = collab_map[CO_No]
```

---

## 15. Jobs planifiés (CRON)

| Job | Fréquence | Horaire | Description |
|-----|-----------|---------|-------------|
| `sage_full_sync` | 1x/jour | 02:00 | Sync complète clients + ventes + produits + stock depuis Sage |
| `sage_delta_sync` | /15 min | 06:00-22:00 | Sync incrémentale clients + ventes + produits + stock (cbModification). `max_instances=1` pour éviter les doublons |
| `scoring_engine` | 1x/jour | 06:00 | Calcul RFM + churn risk + upsell scores |
| `playlist_generator` | 1x/jour | 06:30 | Génère les playlists quotidiennes |
| `gamification_daily` | 1x/jour | 23:00 | Consolide les XP du jour, crée les weekly/monthly |
| `ringover_sync` | /3 min | 06:00-22:00 | Sync appels + contacts + auto-qualification + auto-transcription IA. `max_instances=1` |
| `cleanup_old_playlists` | 1x/semaine | Dim 04:00 | Archivage playlists > 30 jours |

**Notes sur le scheduler :**
- Tous les jobs utilisent `max_instances=1` et `misfire_grace_time` pour éviter les exécutions parallèles
- Le backend tourne avec **1 seul worker uvicorn** pour garantir une seule instance APScheduler
- Les appels ODBC bloquants sont wrappés dans `asyncio.to_thread()` pour ne pas bloquer l'event loop

---

## 16. Structure des fichiers

```
ringover-crm/
│
├── ARCHITECTURE.md                    ← CE FICHIER
│
├── docker-compose.yml                 # Orchestration des services
├── .env.example                       # Template variables d'environnement
├── .gitignore
│
├── backend/                           # API FastAPI (Python)
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py                        # Point d'entrée FastAPI
│   ├── config.py                      # Settings (Pydantic BaseSettings)
│   │
│   ├── api/                           # Routes API
│   │   ├── __init__.py
│   │   ├── auth.py                    # POST /login, /logout, /me
│   │   ├── clients.py                 # GET /clients, /clients/{id}, notes
│   │   ├── contacts.py                # CRUD contacts, assign, move
│   │   ├── calls.py                   # GET /calls, /calls/{id}, unqualified (dédup companion)
│   │   ├── sales.py                   # GET /sales, stats ventes
│   │   ├── playlists.py               # GET /playlists, PATCH status, GET insight + IA
│   │   ├── products.py                # GET /products, /products/{ref}, upsell, co-achats, orders
│   │   ├── orders.py                  # GET /orders (filtres type/date/commercial/paiement)
│   │   ├── intel.py                   # CRUD fournisseurs, concurrents, intel client
│   │   ├── call_sessions.py           # CRUD sessions Call Companion
│   │   ├── qualify.py                 # POST /qualify
│   │   ├── enrich.py                  # POST /clients/{id}/enrich (enrichissement IA)
│   │   ├── gamification.py            # GET /leaderboard, /my-xp
│   │   ├── admin.py                   # CRUD users, sync, leaderboard, lignes Ringover/Sage
│   │   ├── my_dashboard.py            # GET /me/stats, /me/clients, /me/top-products
│   │   ├── margin_rules.py            # CRUD règles de marge + stats marge nette
│   │   ├── objectives.py              # CRUD objectifs multi-KPI + progression
│   │   ├── challenges.py              # CRUD challenges multi-ref/famille + classement live
│   │   ├── webhooks.py                # POST /webhooks/ringover
│   │   └── sse.py                     # GET /events (Server-Sent Events)
│   │
│   ├── connectors/                    # Connecteurs sources de données
│   │   ├── __init__.py
│   │   ├── sage_odbc.py               # ODBC → Sage 100 SQL Server (connexion directe)
│   │   ├── sage_sync.py               # Logique sync Sage → PostgreSQL (clients + ventes + produits)
│   │   ├── sage_connector.py          # Import Excel Sage (fallback)
│   │   ├── ringover_connector.py      # API Ringover v2
│   │   └── phone_normalizer.py        # Normalisation E.164
│   │
│   ├── engines/                       # Moteurs métier
│   │   ├── __init__.py
│   │   ├── scoring_engine.py          # Calcul RFM + scores + transitions lifecycle
│   │   ├── playlist_generator.py      # Génération playlists (status + cooldown + feedback)
│   │   ├── lifecycle_engine.py        # Transitions automatiques du lifecycle client
│   │   └── gamification_engine.py     # Calcul XP + leaderboard
│   │
│   ├── ai/                            # IA de coaching (Phase 2)
│   │   ├── __init__.py
│   │   ├── transcription.py           # Whisper API
│   │   └── analysis.py                # GPT-4o scoring
│   │
│   ├── models/                        # SQLAlchemy models
│   │   ├── __init__.py
│   │   ├── user.py
│   │   ├── client.py
│   │   ├── contact.py                 # Contact (rattaché à clients/company)
│   │   ├── client_audit.py            # ClientAuditLog (journal d'audit clients)
│   │   ├── client_intel.py            # ClientSupplier, ClientCompetitor, ClientProductInterest
│   │   ├── client_note.py             # ClientNote (notes libres)
│   │   ├── call.py
│   │   ├── call_session.py            # CallSession (pré-qualification via Companion)
│   │   ├── sales_line.py
│   │   ├── qualification.py
│   │   ├── playlist.py
│   │   ├── playlist_config.py
│   │   ├── gamification.py
│   │   ├── product.py
│   │   ├── ai_analysis.py
│   │   ├── supplier.py                # Supplier (base globale fournisseurs)
│   │   ├── competitor.py              # Competitor (base globale concurrents)
│   │   ├── margin_rule.py             # MarginRule (règles de déduction marge)
│   │   ├── user_objective.py          # UserObjective (objectifs multi-KPI)
│   │   ├── challenge.py               # Challenge + ChallengeRanking (multi-ref, famille)
│   │   └── sync_log.py
│   │
│   ├── schemas/                       # Pydantic schemas (request/response)
│   │   ├── __init__.py
│   │   ├── auth.py
│   │   ├── client.py
│   │   ├── call.py
│   │   └── ...
│   │
│   ├── core/                          # Utilitaires
│   │   ├── __init__.py
│   │   ├── database.py                # Engine + Session async
│   │   ├── security.py                # JWT, hashing, middleware auth
│   │   ├── redis.py                   # Client Redis
│   │   └── scheduler.py              # APScheduler config + jobs
│   │
│   └── alembic/                       # Migrations DB
│       ├── alembic.ini
│       ├── env.py
│       └── versions/
│           └── 001_initial_schema.py
│
├── frontend/                          # Next.js 14
│   ├── Dockerfile
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.ts
│   │
│   ├── app/
│   │   ├── layout.tsx                 # Layout racine
│   │   ├── (auth)/
│   │   │   └── login/
│   │   │       └── page.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx             # Layout avec sidebar
│   │   │   ├── page.tsx               # Dashboard commercial
│   │   │   ├── playlist/
│   │   │   │   └── page.tsx
│   │   │   ├── clients/
│   │   │   │   ├── page.tsx           # Liste clients
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx       # Fiche 360°
│   │   │   ├── calls/
│   │   │   │   └── page.tsx
│   │   │   ├── products/
│   │   │   │   └── page.tsx           # Catalogue produits + panel détail + onglet commandes
│   │   │   ├── orders/
│   │   │   │   └── page.tsx           # Liste globale commandes + panel détail + filtres
│   │   │   ├── leaderboard/
│   │   │   │   └── page.tsx
│   │   │   └── admin/
│   │   │       ├── page.tsx           # Tour de contrôle
│   │   │       ├── users/
│   │   │       │   └── page.tsx
│   │   │       ├── playlists/
│   │   │       │   └── page.tsx       # Config playlists par commercial
│   │   │       ├── sales-dashboard/
│   │   │       │   └── page.tsx       # Dashboard pilotage commercial
│   │   │       ├── assignments/
│   │   │       │   └── page.tsx       # Réassignation clients
│   │   │       ├── margins/
│   │   │       │   └── page.tsx       # Config règles de marge
│   │   │       ├── challenges/
│   │   │       │   └── page.tsx       # Gestion challenges
│   │   │       ├── glossaire/
│   │   │       │   └── page.tsx       # Glossaire variables clés
│   │   │       └── settings/
│   │   │           └── page.tsx
│   │   └── api/
│   │       └── auth/
│   │           └── [...nextauth]/
│   │               └── route.ts
│   │
│   ├── components/
│   │   ├── ui/                        # Composants génériques (shadcn/ui)
│   │   │   ├── textarea.tsx           # Shadcn textarea
│   │   │   ├── spark-line.tsx         # Mini graphique sparkline
│   │   │   └── ...
│   │   ├── call-companion/            # Call Companion (widget flottant)
│   │   │   ├── context.tsx            # CallCompanionProvider + useCallCompanion hook
│   │   │   └── widget.tsx             # Panneau flottant (mood, outcome, intel, notes)
│   │   ├── intel/                     # Composants intel commerciale (réutilisables)
│   │   │   ├── supplier-picker.tsx    # Recherche/ajout fournisseurs
│   │   │   ├── competitor-picker.tsx  # Recherche/ajout concurrents
│   │   │   └── product-interest-picker.tsx # Recherche produit catalogue + saisie libre
│   │   ├── click-to-call.tsx          # Bouton appel → ouvre le Companion
│   │   ├── status-badge.tsx           # Badge statut client
│   │   ├── dashboard/
│   │   │   ├── StatsCards.tsx
│   │   │   ├── TodoCallsList.tsx
│   │   │   └── MiniLeaderboard.tsx
│   │   ├── clients/
│   │   │   ├── ClientCard.tsx
│   │   │   ├── ClientDetail360.tsx
│   │   │   ├── SalesHistory.tsx
│   │   │   └── ProductsChart.tsx
│   │   ├── calls/
│   │   │   ├── CallRow.tsx
│   │   │   ├── CallQualification.tsx
│   │   │   └── AudioPlayer.tsx
│   │   ├── playlist/
│   │   │   └── PlaylistItem.tsx
│   │   ├── gamification/
│   │   │   ├── Leaderboard.tsx
│   │   │   └── XpBadge.tsx
│   │   └── admin/
│   │       ├── PresencePanel.tsx
│   │       └── KpiDashboard.tsx
│   │
│   └── lib/
│       ├── api.ts                     # Client API (fetch wrapper)
│       ├── auth.ts                    # NextAuth config
│       ├── sse.ts                     # Hook useSSE pour temps réel
│       └── utils.ts
│
└── nginx/
    └── nginx.conf                     # Config reverse proxy
```

---

## 17. Plan de livraison

### Phase 1 — Le CRM qui marche (10 jours)

| Jour | Livrable |
|------|----------|
| **J1** | Setup projet (Docker, PostgreSQL, FastAPI, Next.js, migrations) |
| **J2** | Connecteur Sage 100 (ODBC, import clients + ventes, phone_index) |
| **J3** | Connecteur Ringover (migration du prototype, webhooks, matching) |
| **J4** | API : auth, clients, calls, sales |
| **J5** | Frontend : login, dashboard, layout |
| **J6** | Frontend : fiche client 360° (Sage + Ringover) |
| **J7** | Scoring engine + playlist generator |
| **J8** | Frontend : playlist du jour + qualification appels |
| **J9** | Tests d'intégration, fix bugs, données réelles |
| **J10** | Déploiement, test sur site, formation initiale |

### Phase 2 — Gamification + Admin (5 jours)

| Jour | Livrable |
|------|----------|
| **J11** | Gamification engine (XP effort + cash) |
| **J12** | Frontend : leaderboard + badges |
| **J13** | Dashboard admin (présences, KPIs, pipeline) |
| **J14** | SSE temps réel (push appels, présences) |
| **J15** | Polish, tests, formation complète |

### Phase 3 — IA Coaching (post-livraison, budget additionnel)

| Étape | Livrable |
|-------|----------|
| **S1** | Pipeline Whisper (transcription) |
| **S2** | Pipeline GPT-4o (analyse + scoring) |
| **S3** | Interface IA (vue dans fiche appel, stats par commercial) |
| **S4** | Calibration des prompts avec le client |

---

## 18. Coûts de fonctionnement révisés

### Architecture révisée (sans Supabase)

| Poste | Détails | 1 User | 5 Users | 10 Users | 20 Users |
|-------|---------|--------|---------|----------|----------|
| **Téléphonie** | Licence Ringover | 21€ | 105€ | 210€ | 420€ |
| **VPS** | PostgreSQL + FastAPI + Next.js + Redis | 6€ | 6€ | 12€ | 20€ |
| **IA Transcription** | Whisper (~0.35€/h, 20h/mois/user) | ~7€ | ~35€ | ~70€ | ~140€ |
| **IA Analyse** | GPT-4o (résumé, scoring) | ~10€ | ~50€ | ~100€ | ~200€ |
| **TOTAL** | | **~44€** | **~196€** | **~392€** | **~780€** |
| **Coût/user** | | 44€ | 39€ | 39€ | 39€ |

**Gain vs architecture Supabase : -25 à -50€/mois** (licence Supabase Pro supprimée).

Sans l'IA (Phase 1+2 uniquement) :

| | 1 User | 5 Users | 10 Users | 20 Users |
|---|--------|---------|----------|----------|
| **TOTAL** | **27€** | **111€** | **222€** | **440€** |
| **Coût/user** | 27€ | 22€ | 22€ | 22€ |

Le CRM coûte **1€/jour par commercial** hors téléphonie. Imbattable.

---

## Annexe — Variables d'environnement (.env)

```bash
# --- Application ---
APP_ENV=production
APP_SECRET_KEY=<clé-aléatoire-64-chars>
APP_CORS_ORIGINS=https://crm.client.com

# --- PostgreSQL ---
DATABASE_URL=postgresql+asyncpg://crm_user:password@localhost:5432/crm_db

# --- Redis ---
REDIS_URL=redis://localhost:6379/0

# --- Sage 100 (ODBC via Tailscale) ---
SAGE_ODBC_DRIVER={ODBC Driver 18 for SQL Server}
SAGE_ODBC_SERVER=100.117.57.116,1433
SAGE_ODBC_DATABASE=NP_DEVELOPPEMENT
SAGE_ODBC_USER=crm_readonly
SAGE_ODBC_PASSWORD=<password>

# --- Ringover ---
RINGOVER_API_KEY=<clé-api>
RINGOVER_WEBHOOK_SECRET=<secret-webhook>
RINGOVER_BASE_URL=https://public-api.ringover.com/v2

# --- OpenAI (Phase 2) ---
OPENAI_API_KEY=<clé-api>

# --- Google Places (Enrichissement IA) ---
GOOGLE_PLACES_API_KEY=<clé-api>

# --- JWT ---
JWT_SECRET=<clé-aléatoire-32-chars>
JWT_ALGORITHM=HS256
JWT_EXPIRATION_HOURS=24
JWT_REFRESH_DAYS=7
```

---

## Annexe — API Endpoints (référence rapide)

### Auth
| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/auth/login` | Connexion (email + password → JWT) |
| GET | `/api/auth/me` | Utilisateur courant |
| POST | `/api/auth/users` | Créer un utilisateur (admin) |

### Clients
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/clients` | Liste avec filtres (search, sales_rep, is_prospect, is_dormant, **supplier_id, competitor_id, product_ref**) |
| GET | `/api/clients/{id}` | Fiche 360° (score, ventes, appels, **tous les numéros phone_index**, **impayés**) |
| POST | `/api/clients` | **Créer un prospect** (nom, tel, email, ville — pas dans Sage) |
| PUT | `/api/clients/{id}` | **Modifier un client** (UpdateClientRequest — champs éditables avec audit trail par champ) |
| POST | `/api/clients/{id}/phones` | **Ajouter un numéro** (phone, label) à un client |
| DELETE | `/api/clients/{id}/phones/{phone_id}` | **Supprimer un numéro** (interdit pour source sage) |
| POST | `/api/clients/{id}/enrich` | **Enrichissement IA** |
| POST | `/api/clients/{source_id}/merge-into/{target_id}` | **Fusionner** source dans target |
| GET | `/api/clients/{id}/audit` | **Historique d'audit** |
| GET | `/api/clients/{id}/notes` | **Notes libres** du client (timeline) |
| POST | `/api/clients/{id}/notes` | **Ajouter une note** (content → user_name + created_at) |

### API Contacts (`/api/contacts`)

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/contacts` | Liste/recherche de contacts (params: search, company_id) |
| GET | `/api/contacts/{id}` | Détail d'un contact |
| POST | `/api/contacts` | Créer un contact |
| PUT | `/api/contacts/{id}` | Modifier un contact |
| POST | `/api/contacts/{id}/assign/{company_id}` | Rattacher un contact à une entreprise |
| POST | `/api/contacts/{id}/move/{company_id}` | Déplacer un contact vers une autre entreprise |
| DELETE | `/api/contacts/{id}` | Supprimer un contact (sauf principal) |

### Intel commerciale (`/api/intel`)
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/intel/suppliers?q=` | Rechercher un fournisseur (autocomplete global) |
| POST | `/api/intel/suppliers` | Créer un fournisseur (ajout à la base globale) |
| GET | `/api/intel/competitors?q=` | Rechercher un concurrent (autocomplete global) |
| POST | `/api/intel/competitors` | Créer un concurrent (ajout à la base globale) |
| GET | `/api/intel/clients/{id}/intel` | Intel d'un client (fournisseurs, concurrents, produits d'intérêt) |
| POST | `/api/intel/clients/{id}/intel` | Ajouter en batch (suppliers, competitors, product_interests) |
| DELETE | `/api/intel/clients/{id}/suppliers/{supplier_id}` | Retirer un fournisseur d'un client |
| DELETE | `/api/intel/clients/{id}/competitors/{competitor_id}` | Retirer un concurrent d'un client |
| DELETE | `/api/intel/clients/{id}/product-interests/{interest_id}` | Retirer un produit d'intérêt |

### Call Sessions (`/api/call-sessions`)
| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/call-sessions` | Créer une session (ouverture du Call Companion) |
| PUT | `/api/call-sessions/{id}` | Mettre à jour une session (mood, outcome, notes, next_step) |
| GET | `/api/call-sessions/pending` | Sessions non terminées de l'utilisateur courant |
| GET | `/api/call-sessions/client/{client_id}` | Historique des sessions pour un client |

### Appels
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/calls` | Liste avec filtres + ai_analysis brief + **client_name, client_ca_total, has_session_qualification** |
| GET | `/api/calls/unqualified` | Appels non qualifiés (exclut ceux qualifiés via Call Companion) |
| GET | `/api/calls/stats?date_from=&date_to=&user_id=&mine=` | KPIs **filtrés par période et par utilisateur** (total, answered, missed, avg duration, outbound/inbound, qualified) |
| POST | `/api/calls/dial` | Click-to-call via Ringover Callback API |
| GET | `/api/calls/reminders` | Rappels à venir (next_step_date) |
| POST | `/api/calls/{id}/transcribe` | Transcription + double analyse (cache DB) |
| GET | `/api/calls/{id}/analysis` | Lecture seule de l'analyse IA |

### Qualification
| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/qualify` | Qualifier un appel (mood, outcome, next_step, date, notes) |

### Playlists
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/playlists` | Playlist quotidienne de l'utilisateur |
| PATCH | `/api/playlists/{id}/status` | Mettre à jour le statut (pending/done/skipped/postponed) |
| GET | `/api/playlists/{id}/insight` | Contexte client + top produits + suggestion IA |

### Produits
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/products` | **Liste produits** avec search, tri (CA, qté, clients, commandes, marge), filtre has_sales. Exclut les articles de service (`is_service=true`). Inclut pipeline (BC/BL) |
| GET | `/api/products/families` | **Familles de produits** distinctes |
| GET | `/api/products/{article_ref}` | **Détail produit** : stats, top 10 clients, ventes mensuelles, co-achats. Articles de service exclus des suggestions |
| GET | `/api/products/orders?article_ref=&limit=&offset=` | **Historique commandes produit** : liste paginée des commandes (tous types) pour un article |
| GET | `/api/products/orders/{sage_piece_id}` | **Détail commande** : toutes les lignes d'une pièce commerciale |
| GET | `/api/products/upsell/{client_id}` | **Suggestions upsell** : produits achetés par des clients similaires (articles de service exclus) |

### Commandes (global)
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/orders?doc_type=&date_from=&date_to=&user_id=&search=&sort_by=&sort_dir=&limit=&offset=` | **Liste commandes** : paginée, tous types de documents (BC, BL, FA, AV). Filtres par type, dates, commercial, recherche. KPIs de synthèse |

### Dashboard personnel
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/me/stats?date_from=&date_to=` | **KPIs personnels** : CA, commandes, appels, score IA, évolution %, progression objectif, CA mensuel 12 mois (factures uniquement) |
| GET | `/api/me/clients?limit=&offset=` | **Mes clients** : liste des clients assignés au commercial connecté |
| GET | `/api/me/top-products?limit=` | **Mes top produits** : produits les plus vendus par ce commercial (articles de service exclus) |
| GET | `/api/me/pipeline?date_from=&date_to=` | **Pipeline** : KPIs des commandes en cours (BC/BL), top commandes récentes |

### Admin — Gestion utilisateurs
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/admin/users` | **Liste users** avec stats (appels, CA, commandes, dernière activité) |
| GET | `/api/admin/users/{id}` | **Détail user** avec métriques complètes (appels, ventes, clients) |
| POST | `/api/admin/users` | **Créer un utilisateur** (nom, email, mdp, rôle, Ringover, Sage, objectif CA) |
| PUT | `/api/admin/users/{id}` | **Modifier un utilisateur** (champs partiels, mot de passe optionnel) |
| DELETE | `/api/admin/users/{id}` | **Toggle actif/inactif** (soft delete réversible) |
| GET | `/api/admin/ringover/lines` | **Lignes Ringover** : membres de l'équipe via `GET /v2/team/members` |
| GET | `/api/admin/sage/collaborateurs` | **Collaborateurs Sage** : liste depuis `F_COLLABORATEUR` via ODBC |

### Admin — Sync & outils
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/admin/dashboard` | Tableau de bord admin (stats, presences) |
| POST | `/api/admin/sync/ringover` | Sync appels + auto-transcription IA (> 10s) |
| GET | `/api/admin/sync/sage/test` | Tester la connexion ODBC Sage |
| POST | `/api/admin/sync/sage/odbc/clients?mode=` | Sync clients ODBC (full/delta/auto) |
| POST | `/api/admin/sync/sage/odbc/sales?mode=` | Sync ventes ODBC (full/delta/auto) |
| POST | `/api/admin/sync/sage/odbc/products?mode=` | Sync produits ODBC (full/delta/auto) |
| POST | `/api/admin/sync/sage/odbc/stock?mode=` | Sync stock ODBC depuis F_ARTSTOCK (full/delta/auto) |
| POST | `/api/admin/sync/sage/odbc/full` | Full sync ODBC (clients + ventes + produits + stock) |
| POST | `/api/admin/sync/sage/clients` | Upload Excel clients Sage (fallback) |
| POST | `/api/admin/sync/sage/sales` | Upload Excel ventes Sage (fallback) |
| POST | `/api/admin/scoring/run` | Lancer le scoring RFM |
| GET | `/api/admin/playlist/configs` | Liste des configs playlist par commercial |
| PUT | `/api/admin/playlist/configs/{user_id}` | Créer/modifier config playlist d'un commercial |
| POST | `/api/admin/playlist/generate` | Générer les playlists (optionnel `?user_id=`) |
| DELETE | `/api/admin/playlist/clear` | Supprimer playlists du jour (optionnel `?user_id=`) |
| GET | `/api/admin/sales-dashboard` | Dashboard pilotage commercial (`?period=today\|week\|month\|quarter`) |
| GET | `/api/admin/sales-dashboard/{user_id}/calls` | Appels d'un commercial avec qualification + scores IA (`?start=&end=`) |
| GET | `/api/admin/clients/assignments` | Résumé des affectations clients par commercial |
| GET | `/api/admin/clients/by-user/{user_id}` | Liste des clients assignés à un commercial (`?search=`) |
| GET | `/api/admin/clients/unassigned` | Liste des clients non assignés (`?search=`) |
| POST | `/api/admin/clients/reassign` | Réassigner des clients en masse (`client_ids[]`, `target_user_id`) |
| GET | `/api/admin/sync-logs` | Historique des synchronisations (30 dernières) |
| GET | `/api/admin/leaderboard` | Classement commerciaux + scores IA |
| GET | `/api/admin/sage/diagnostic-bdc?since=` | **Diagnostic BDC** : compare le nombre de BC dans Sage vs CRM pour une date donnée (écarts de sync) |

### Santé
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/health` | Statut de l'API |

---

## Annexe — Journal des modifications

| Date | Version | Description |
|------|---------|-------------|
| 2026-03-12 | v3.3 | Rappels avec heure + popup, Playlist manuelle, Vue Kg produits, Rebranding GFF CRM, Tags intel cliquables |
| 2026-03-11 | v3.2 | Call Companion, Intel commerciale, Notes client, Retours unifiés, Challenges multi-ref, Filtre entrepôt, Statut paiement commandes |
| 2026-03-11 | v3.1 | Déploiement VPS, CI/CD, filtrage données Sage, reclassification avoirs, suivi impayés |
| 2026-02-23 | Refonte Company/Contact | Séparation Client → Company + Contact. Nouvelle table contacts, nouveaux endpoints API, adaptation sync Sage/Ringover, lifecycle engine, frontend fiche 360 et page appels. |

### v3.3 — 12 Mars 2026

**Système de rappels avancé :**

- **Rappels avec heure** : nouveau champ `reminder_time` (TIME) sur `daily_playlists` pour planifier un rappel à une heure précise
- **Popup de notification** : composant `ReminderNotifier` intégré au layout global, poll toutes les 30s via `GET /api/playlists/reminders/due`, affiche une popup flottante animée quand un rappel est dû
- **CRUD complet** : endpoints `GET /api/playlists/reminders`, `PATCH /api/playlists/reminders/{id}`, `DELETE /api/playlists/reminders/{id}` pour lister, modifier et supprimer les rappels
- **Gestion depuis le dashboard** : boutons modifier (dialog) et supprimer (inline) sur chaque rappel playlist, compteur badge sur la section
- **Rappel depuis l'onglet appels** : bouton "Rappel" dans le panneau droit de la page appels avec date + heure + note
- **Intégration Call Companion** : quand une date de rappel est renseignée dans le widget, un rappel playlist est automatiquement créé avec l'heure si précisée

**Playlist manuelle :**

- **Ajout manuel** : endpoint `POST /api/playlists/add` pour ajouter un client à la playlist du jour (reason="manual")
- **Boutons sur la fiche client** : popovers "Playlist" et "Rappel" dans le header, avec sélecteur de commercial pour les admins/managers
- **Protection des ajouts manuels** : l'endpoint `DELETE /playlist/clear` préserve les entrées `reason IN ("manual", "callback")` lors de la regénération

**Vue Kg sur les produits :**

- **Nouvel onglet "Kg"** dans le panneau détail produit (entre Aperçu et Commandes)
- **KPI en poids** : poids total vendu, moyenne par commande, moyenne par client
- **Top clients par poids** : classement par quantité au lieu du CA
- **Barres mensuelles en poids** : visualisation distincte (couleur émeraude) avec formatage intelligent kg/t (>1000kg → tonnes)
- **Fonction `formatWeight`** : formatage automatique en kg ou tonnes selon le seuil

**Rebranding GFF CRM :**

- Renommage de "Sales Machine" en "GFF CRM" sur toute l'application (sidebar, login, metadata, wiki)
- Logo `gff-white.svg` dans la sidebar, favicon `favicon-GFF-black.png`
- Onglet "Playlist" renommé "To do"

**Améliorations UX :**

- **Tags intel tronqués** : `max-w-[200px]` + `truncate` + tooltip `title` au survol sur les badges fournisseurs, concurrents et produits d'intérêt
- **Tags produit cliquables** : clic sur un tag produit d'intérêt avec `article_ref` redirige vers la fiche produit
- **AuthProvider** ajouté au layout dashboard pour que `useAuth()` fonctionne sur toutes les pages (fix dropdown admin)
- **Fix contact édition** : pré-remplissage intelligent first_name/last_name depuis le champ name pour les contacts Sage

### v3.2 — 11 Mars 2026

**Call Companion (widget flottant de collecte d'info) :**

- **Widget persistant** : panneau flottant qui s'ouvre au clic sur "Appeler" et persiste lors de la navigation CRM (React Context dans le layout)
- **Qualification intégrée** : mood (positif/neutre/négatif), outcome (intéressé/rappel/commande/NRP/devis envoyé/pas intéressé), notes, prochaine étape + date
- **Intel commerciale** : fournisseurs, concurrents et produits d'intérêt renseignables pendant l'appel (mode compact)
- **Matching automatique** : à chaque sync Ringover, les `call_sessions` sont appairées aux CDR correspondants (user_id + phone + fenêtre temporelle ±2min/30min)
- **Déduplication qualification** : un appel qualifié via le Companion n'apparaît plus dans "À qualifier" (backend + frontend)

**Intel commerciale (nouvelle section permanente sur la fiche client) :**

- **Fournisseurs** : base globale partagée, recherche autocomplete, ajout de nouveaux fournisseurs
- **Concurrents** : même système que les fournisseurs
- **Produits d'intérêt** : recherche dans le catalogue Sage + saisie libre pour produits hors catalogue
- **Filtres sur la liste clients** : filtrage par fournisseur, concurrent ou produit d'intérêt
- **Nouvelles tables** : `suppliers`, `competitors`, `client_suppliers`, `client_competitors`, `client_product_interests`

**Notes client (onglet Retours unifié) :**

- **Notes libres** : tout utilisateur peut ajouter une note sur un client sans lien à un appel
- **Timeline unifiée** : l'onglet "Retours" fusionne 3 sources dans une chronologie unique :
  - Qualifications d'appels (badge bleu "Appel")
  - Sessions Call Companion (badge vert "Companion")
  - Notes libres (badge violet "Note")
- Chaque entrée affiche le nom de l'utilisateur, la date/heure et les détails associés
- **Nouvelle table** : `client_notes`

**Challenges commerciaux multi-référence :**

- **Multi-ref** : un challenge peut cibler plusieurs références articles (stockées en CSV)
- **Par famille** : un challenge peut cibler une famille entière de produits (toutes les refs de la famille sont prises en compte)
- **UI enrichie** : sélection par radio (Tous / Produits choisis / Par famille) dans l'admin challenges

**Filtre par entrepôt (page produits) :**

- Nouveau filtre `depot_id` sur la page catalogue produits
- Charge dynamiquement la liste des dépôts disponibles

**Statut paiement sur les commandes :**

- Colonnes `doc_total_ttc` et `doc_amount_paid` sur `sales_lines` (alimentées depuis `F_DOCENTETE`)
- **Filtres paiement** sur la page commandes : Tous / Impayé / Partiel / Payé
- Badge coloré (rouge/ambre/vert) dans le tableau et le panneau de détail commande
- Endpoint `/api/orders` enrichi avec `payment_status`, `remaining_due`

**Corrections techniques :**

- Fix `logger` non importé dans `ringover_connector.py` (crash silencieux du matching de sessions)
- Fix crash du scoring engine quand un client n'a que des BDC/BL sans factures (`stats is None`)
- Fix TypeScript `useRef` sans argument initial dans les pickers intel
- Fix `PlaylistItem` props (`id`/`name` au lieu de `client_id`/`client_name`)
- Fix taille colonne `client_notes.client_id` (VARCHAR(20) → VARCHAR(50) pour UUID)

---

### v3.1 — 11 Mars 2026

**Déploiement en production (VPS OVH) :**

- **Infrastructure** : VPS OVH Ubuntu 25.04, PostgreSQL 16 + Redis 7 (Docker Compose), Nginx reverse proxy, HTTPS via Let's Encrypt (gff.wrz.fr)
- **Tailscale VPN** : connexion sécurisée entre le VPS et le serveur Sage 100 du client
- **CI/CD** : workflow GitHub Actions (`deploy.yml`) pour déploiement automatique sur push vers `main`
- **Services systemd** : `crm-backend.service` (uvicorn, 1 worker) et `crm-frontend.service` (Next.js)
- **Connexion Sage optimisée** : passage à ODBC Driver 18, connexion TCP directe par port (`SERVER=ip,1433`) au lieu de l'instance nommée, `Encrypt=no;`, `timeout=60`, retry automatique sur connexion stale

**Filtrage et nettoyage des données Sage :**

- **Exclusion des lignes commentaire** : les lignes de `F_DOCLIGNE` sans `AR_Ref` (MAD, commentaires, frais de port en texte libre) sont exclues de l'import. Seules les lignes avec une référence article valide sont synchronisées
- **Nettoyage post-sync** : suppression automatique des lignes commentaire existantes en base (`AR_Ref IS NULL` ou vide)
- **Reclassification factures / avoirs** : les documents `DO_Type=7` sont reclassifiés selon le préfixe du `DO_Piece` :
  - Préfixe `xxA` → Avoir (type 7)
  - Autres préfixes → Facture comptabilisée (reclassifié en type 6)

**Suivi des factures impayées :**

- **Nouveau connecteur** : `get_invoices_payment_status()` sur `SageConnector`, requête `F_DOCENTETE` pour récupérer `DO_TotalTTC`, `DO_MontantRegle` et le reste à payer pour chaque facture (DO_Domaine=0, DO_Type IN 6,7)
- **Enrichissement sync** : après le sync des lignes de vente, les colonnes `doc_total_ttc` et `doc_amount_paid` sont mises à jour sur chaque `SalesLine` correspondante
- **API client** : l'endpoint `/api/clients/{id}` retourne un objet `unpaid` avec `unpaid_count`, `unpaid_total_ttc`, `unpaid_remaining` et `oldest_unpaid_date`
- **Frontend** : carte KPI "Impayés" en rouge sur la fiche client 360°, affichant le montant restant dû et le nombre de factures impayées

**Corrections de cohérence financière :**

- **CA produits** : les KPIs produits (CA, marge, top clients, évolution mensuelle) sont calculés uniquement sur les factures (type 6) et avoirs (type 7), plus de cumul avec BC/BL
- **Dashboard global admin** : correction du bug où le changement de date ne mettait pas à jour les stats en vue globale (gestion correcte de `user_id="all"`)
- **Résilience frontend** : les appels API du dashboard utilisent des `.then().catch()` individuels au lieu de `Promise.all()` pour éviter qu'une erreur bloque tous les KPIs

**Améliorations navigation :**

- **Liens commande ↔ produit** : sur la fiche client, les IDs de commande sont cliquables (→ page commandes), les noms de produit sont cliquables (→ fiche produit)
- **Recherche produit dans commandes** : le lien "Voir les X commandes →" d'un produit redirige vers `/orders?search=<ref>` avec recherche pré-remplie
- **Recherche backend améliorée** : la recherche sur `/api/orders` utilise un sous-requête pour trouver les commandes contenant un article ou une désignation correspondante

**Scheduler et sync automatique :**

- **Sage delta sync** : toutes les 15 min de 6h à 22h, `max_instances=1`
- **Ringover sync** : toutes les 3 min de 6h à 22h, `max_instances=1`, inclut auto-qualification des appels sortants sans réponse et auto-transcription IA
- **Fix FK violation** : la qualification automatique des appels ne crée plus d'entrées avec un `user_id` NULL (skip si le call n'est pas mappé à un utilisateur)
- **Sync type tracking** : chaque type de sync (clients, sales, products, stock) a son propre `last_sync_time` pour des deltas indépendants

---

### v1.8 — 24 Février 2026

**Stock multi-dépôts (F_ARTSTOCK + F_DEPOT) :**

- **Connecteur ODBC** (`backend/connectors/sage_odbc.py`) :
  - `get_stock(since?)` : requête F_ARTSTOCK x F_DEPOT (tous dépôts, plus filtré sur DE_No=1)
  - Retourne AR_Ref, DE_No, DepotNom, QteSto, QteRes, QteCom, QtePrepa, MontSto, QteMini, QteMaxi + StockDisponible et StockPrévisionnel calculés
  - Support delta sync via `cbModification > ?`

- **Nouveau modèle `ProductStockDepot`** (`backend/models/product_stock_depot.py`) :
  - Table `product_stock_depots` : stock détaillé par article et par dépôt
  - Colonnes : `article_ref`, `depot_id`, `depot_name`, `stock_quantity`, `stock_reserved`, `stock_ordered`, `stock_preparing`, `stock_available`, `stock_min`, `stock_max`, `stock_value`, `synced_at`
  - Index unique sur `(article_ref, depot_id)` pour upsert

- **Sync stock enrichie** (`backend/connectors/sage_sync.py`) :
  - `sync_stock_from_sage(db, since?)` :
    1. Upsert chaque ligne dépôt dans `product_stock_depots` (via `ON CONFLICT DO UPDATE`)
    2. Agrège les totaux tous dépôts confondus → met à jour `stock_*` sur `products`
  - Résultat : `{ depot_lines, products_updated, errors }`

- **API produit détail** (`backend/api/products.py`) :
  - `GET /api/products/detail?ref=...` retourne maintenant `stock_depots: StockDepotItem[]`
  - Chaque `StockDepotItem` : depot_id, depot_name, stock_quantity, stock_reserved, stock_ordered, stock_preparing, stock_available, stock_min, stock_max, stock_value

- **Frontend panel produit** (`frontend/src/app/(dashboard)/products/page.tsx`) :
  - Section "Stock total" avec agrégats tous dépôts (inchangé : 3 KPI + jauge + détails)
  - Nouveau : bouton "Voir le détail par dépôt (N actifs)" déroulant
  - Chaque dépôt affiché en carte colorée (vert/orange/rouge selon niveau)
  - Détails par dépôt : stock brut, réservé, commandé, en prépa, valeur
  - Dépôts vides affichés en opacité réduite

---

### v1.7 — 23 Février 2026

**Module Stock produits (F_ARTSTOCK → CRM) :**

- Première implémentation stock (dépôt principal uniquement)
- 10 colonnes stock sur `products`, sync, filtres et tri stock, badges colorés
- Remplacé par v1.8 multi-dépôts

---

### v1.6 — 24 Février 2026

**Gestion utilisateurs, sessions Ringover et dashboard personnel :**

- **Modèle `User` enrichi** (`backend/models/user.py`) :
  - Nouvelles colonnes : `ringover_number` (n° Ringover assigné), `ringover_email` (email Ringover), `phone` (tél perso), `target_ca_monthly` (objectif CA mensuel en €)
  - Ces champs permettent le mapping fiable Ringover/Sage et le suivi d'objectifs personnalisés

- **Modèle `SalesLine` étendu** (`backend/models/sales_line.py`) :
  - Nouvelles colonnes : `sage_collaborator_id` (CO_No du collaborateur Sage), `user_id` (FK vers `users`)
  - Index `idx_sales_user_id` ajouté pour les requêtes de performance par commercial

- **CRUD Admin users** (`backend/api/admin.py`) :
  - `GET /api/admin/users` : liste complète avec stats résumées (appels aujourd'hui, CA total, commandes)
  - `GET /api/admin/users/{id}` : détail avec métriques (appels, ventes, clients assignés)
  - `POST /api/admin/users` : création enrichie (Ringover, Sage, objectif CA)
  - `PUT /api/admin/users/{id}` : modification partielle (y compris mot de passe)
  - `DELETE /api/admin/users/{id}` : toggle actif/inactif réversible
  - `GET /api/admin/ringover/lines` : récupère les membres Ringover via `GET /v2/team/members` (user_id, nom, email, numéros)
  - `GET /api/admin/sage/collaborateurs` : liste les collaborateurs depuis `F_COLLABORATEUR` via ODBC

- **Mapping Ringover fiable** (`backend/connectors/ringover_connector.py`) :
  - Nouvelle fonction `get_team_members()` : appel API `GET /v2/team/members`
  - Fonctions `_build_user_maps()` et `_resolve_user_id()` : résolution user_id par `ringover_user_id` (prioritaire), puis par email, puis par nom (fallback)
  - `sync_calls()` remplit désormais `Call.user_id` à chaque sync au lieu de juste stocker le nom brut
  - Le leaderboard utilise `Call.user_id` au lieu du fragile `Call.user_name == User.name`

- **Mapping Sage fiable** (`backend/connectors/sage_sync.py` + `sage_odbc.py`) :
  - `get_sales_lines()` joint avec `F_COLLABORATEUR` pour récupérer `CO_Nom + CO_Prenom` en plus de `CO_No`
  - `sync_sales_from_sage()` pré-charge le mapping `{CO_No: user_id}` depuis la table users et remplit `SalesLine.user_id` + `sales_rep` à chaque sync

- **Dashboard personnel** (`backend/api/my_dashboard.py`) :
  - `GET /api/me/stats` : KPIs du commercial connecté, filtrables par période (date_from, date_to)
    - CA généré, nb commandes, nb clients, panier moyen, marge moyenne
    - Évolution CA vs période précédente (%)
    - Comparaison avec objectif mensuel (`target_ca_monthly`) + progression en %
    - CA mensuel sur 12 mois (pour graphique barres)
    - Nb appels, durée totale, taux de réponse, taux de qualification, score IA moyen
  - `GET /api/me/clients` : clients du commercial (via `assigned_user_id` ou `sales_rep`)
  - `GET /api/me/top-products` : top produits vendus par le commercial
  - `GET /api/calls/stats` étendu : paramètres `user_id` et `mine=true` pour filtrer par commercial

- **Frontend — Page admin/users** (`frontend/src/app/(dashboard)/admin/users/page.tsx`) :
  - Tableau CRUD de tous les utilisateurs avec colonnes : nom, email, rôle, ligne Ringover, collaborateur Sage, appels, CA, statut
  - Formulaire de création/édition avec :
    - Dropdown Ringover (chargé depuis `GET /api/admin/ringover/lines`) avec auto-remplissage user_id, email, numéro
    - Dropdown Sage (chargé depuis `GET /api/admin/sage/collaborateurs`) avec auto-remplissage CO_No et nom
    - Champ objectif CA mensuel
  - Toggle actif/inactif par utilisateur
  - Vue mobile responsive avec cards

- **Frontend — Dashboard personnel refondé** (`frontend/src/app/(dashboard)/page.tsx`) :
  - 4 KPIs principaux : Mon CA (avec jauge de progression vs objectif), Commandes, Appels, Score IA
  - Graphique barres CA mensuel (12 mois) avec ligne d'objectif en pointillés
  - Évolution CA vs période précédente (badge vert/rouge avec %)
  - Stats appels détaillées (décrochés, manqués, durée, qualifiés)
  - Dropdown admin/manager pour switcher la vue vers un autre commercial
  - Filtres période conservés (Aujourd'hui, Hier, 7j, 30j, 90j, période personnalisée)
  - Sections existantes conservées : Playlist, Rappels, Alertes

- **Schemas Pydantic enrichis** (`backend/schemas/auth.py`) :
  - `UserResponse` : ajout `ringover_number`, `ringover_email`, `sage_collaborator_id`, `phone`, `target_ca_monthly`
  - `CreateUserRequest` : ajout des mêmes champs
  - Nouveau `UpdateUserRequest` : tous les champs optionnels pour modification partielle

- **Navigation** : lien "Utilisateurs" ajouté dans la sidebar admin

### v1.5 — 24 Février 2026

**Module Produits (catalogue, insights, upsell) :**
- **Modèle `Product`** (`backend/models/product.py`) : table `products` avec `article_ref` (unique), `designation`, `family`, `sub_family`, `unit`, `sale_price`, `cost_price`, `weight`, `barcode`, `is_active`, `synced_at`
- **Sync Sage → Produits** (`sage_sync.py`) :
  - `sync_products_from_sage(db, since?)` : full ou delta sync articles depuis F_ARTICLE
  - Merge non-destructif (upsert ON CONFLICT article_ref)
  - Intégré dans `job_sage_full_sync` (02h00) et `job_sage_delta_sync` (15min, 7h-20h)
- **API `/api/products`** (`backend/api/products.py`) :
  - `GET /api/products` : liste paginée avec search, tri (CA, qté, clients, commandes, marge, nom), filtre `has_sales`
  - `GET /api/products/families` : familles d'articles distinctes
  - `GET /api/products/{article_ref}` : détail produit avec stats globales, top 10 clients, ventes mensuelles, co-achats (produits achetés ensemble)
  - `GET /api/products/orders/{sage_piece_id}` : détail complet d'une commande (toutes les lignes)
  - `GET /api/products/upsell/{client_id}` : algo upsell par affinité (market basket analysis — produits achetés par des clients similaires mais pas par le client cible)
- **Endpoint admin** : `POST /api/admin/sync/sage/odbc/products?mode=full|delta|auto`
- **Full sync admin** : `POST /api/admin/sync/sage/odbc/full` retourne maintenant `{ clients, sales, products }`
- **Frontend** : nouvel onglet "Produits" (`/products`) avec :
  - Catalogue avec recherche, filtres (avec/sans ventes), tri multi-critères
  - Panel détail latéral : KPIs produit, top 10 clients, co-achats, graphique ventes mensuelles
- **Fiche client 360°** enrichie :
  - `sage_piece_id` cliquable dans l'historique des ventes → modale détail commande
  - Nouvel onglet "Suggestions upsell" avec recommandations par affinité produit

**Dashboard — Filtrage par date :**
- Boutons rapides : "Aujourd'hui", "Hier", "7 jours", "30 jours", "90 jours"
- Sélecteur de plage de dates personnalisé (calendrier shadcn/ui)
- 5 KPIs dynamiques filtrés par période : Appels (total + out/in), Décrochés (taux + nb), Manqués, Durée moyenne (+ durée totale), Qualifiés
- Endpoint `GET /api/calls/stats` étendu avec paramètres `date_from` et `date_to`

**Page Appels — Refonte UI :**
- Priorité affichage : nom entreprise → nom contact → numéro de téléphone
- Badge CA total pour les clients avec historique de ventes
- Clic sur le nom client → panel latéral droit avec fiche 360° (KPIs, scores, top produits, derniers appels, dernières ventes)
- Recherche enrichie (entreprise, contact, numéro)
- Badges IA compacts, qualification et rappels plus visibles

**Liste Clients — Filtres et tri avancés :**
- Tri par : Nom, CA total, CA 12 mois, Dernière commande, Nb commandes, Panier moyen, Marge %, Risque churn, Potentiel upsell, Priorité globale
- Filtres : Avec commandes / Sans commandes, Prospects, Dormants
- Colonnes enrichies : CA, commandes (total + 12m), panier moyen, statut (Actif/Prospect/Dormant + badge churn)
- Pagination maintenue

**Correctifs de données :**
- Création de 152 clients manquants depuis les `client_sage_id` orphelins dans `sales_lines`
- Re-mapping de tous les `client_id` sur les 1090 lignes de ventes
- `avg_margin_percent` élargi de NUMERIC(5,2) à NUMERIC(10,2) pour supporter les marges négatives extrêmes

### v1.4 — 23 Février 2026 (nuit)

**Connecteur Sage 100 ODBC (connexion directe) :**
- **`SageConnector` class** (`backend/connectors/sage_odbc.py`) : connexion ODBC directe vers SQL Server Sage via Tailscale VPN
  - `get_clients(since?)` : récupère F_COMPTET (1827 clients)
  - `get_sales_lines(since?)` : récupère F_DOCLIGNE (BC=1, BL=3, Factures=6, Avoirs=7)
  - `get_collaborateurs()` : récupère F_COLLABORATEUR
  - `test_connection()` : vérifie l'accès et compte les enregistrements
- **`sage_sync.py`** : logique de synchronisation vers PostgreSQL
  - `sync_clients_from_sage(db, since?)` : full ou delta sync clients avec merge non-destructif
  - `sync_sales_from_sage(db, since?)` : full ou delta sync ventes
  - `get_last_sync_time()` : timestamp de la dernière sync réussie
  - Delta sync via `cbModification > ?` (colonne Sage de dernière modification)
- **Nouveaux endpoints API admin** :
  - `GET /api/admin/sync/sage/test` : tester la connexion Sage ODBC
  - `POST /api/admin/sync/sage/odbc/clients?mode=full|delta|auto` : sync clients
  - `POST /api/admin/sync/sage/odbc/sales?mode=full|delta|auto` : sync ventes
  - `POST /api/admin/sync/sage/odbc/full` : sync complète (clients + ventes)
  - Endpoints Excel conservés en fallback (`POST /api/admin/sync/sage/clients|sales`)
- **Scheduler APScheduler** (`backend/core/scheduler.py`) :
  - Full sync Sage : 02h00 tous les jours
  - Delta sync Sage : toutes les 15min entre 7h et 20h
  - Sync Ringover : toutes les 10min entre 7h et 20h
  - Scoring + playlists : 06h30 tous les jours
  - Intégré au lifespan FastAPI (démarrage/arrêt automatique)
- **Page admin frontend enrichie** :
  - Section Sage 100 avec boutons Test / Full Sync / Delta Sync
  - Historique des synchronisations (tableau avec source, type, statut, compteurs, date)

**Variables .env ajoutées :**
```
SAGE_ODBC_SERVER=100.117.57.116\SAGE100
SAGE_ODBC_DATABASE=NP_DEVELOPPEMENT
SAGE_ODBC_USER=crm_readonly
SAGE_ODBC_PASSWORD=CRM2026secure!
```

**Prérequis serveur :**
- Tailscale VPN connecté au même réseau que le serveur Sage (IP 100.117.57.116)
- ODBC Driver 17 for SQL Server installé
- `pyodbc` installé dans le venv Python

### v1.3 — 23 Février 2026 (soir)

**Nouvelles fonctionnalités :**
- **Double analyse IA** : chaque appel analysé avec 2 passes GPT-4o
  - *Vue Commercial* : résumé, coaching, sentiment client, opportunités détectées, actions recommandées
  - *Vue Manager* : scoring qualité /10 sur 5 critères (politesse, objections, closing, produits, écoute) + feedback manager
- **Auto-transcription** : après chaque sync Ringover, les appels > 10s avec enregistrement sont automatiquement transcrits et analysés
- **Cache DB** : les analyses sont stockées dans `ai_analyses`, pas de re-transcription (500ms vs 25s)
- **Leaderboard enrichi** : classement des commerciaux avec scores IA intégrés (score moyen, politesse, closing)
- **Création de prospects** : formulaire frontend + endpoint `POST /api/clients` pour ajouter des prospects directement dans le CRM (sage_id préfixé `CRM-`, pas dans Sage)
- **Navigation enrichie** : noms de clients cliquables partout, sentiment client et score IA affichés dans la liste des appels
- **Multi-numéros par client** : un client peut avoir N numéros de téléphone (table `phone_index`). L'API `GET /clients/{id}` retourne le champ `phone_numbers[]`. Endpoints `POST /DELETE` pour ajouter/supprimer un numéro. La fiche client 360° affiche tous les numéros avec click-to-call et suppression (sauf source Sage)
- **Sync Sage non-destructive (merge)** : l'import Excel Sage ne met à jour que les champs non-null côté Sage. Les données ajoutées manuellement dans le CRM (numéros, email, notes) ne sont jamais écrasées par un champ vide/null de Sage

**Modèle `ai_analyses` refondu :**
- Ajout colonnes : `sales_feedback`, `client_sentiment`, `detected_opportunities`, `next_actions`, `listening_quality`, `admin_feedback`, `admin_scores_raw` (JSONB)

### v2.4 — 25 Février 2026

**Gestion avancée des clients — Auto-création, enrichissement IA, fusion & audit :**

- **Auto-création de profils clients** : lors de `sync_calls`, les numéros inconnus génèrent automatiquement un Client + PhoneIndex + ClientAuditLog avec valeurs par défaut (source = `ringover`)
- **Enrichissement IA** (`POST /api/clients/{id}/enrich`) : pipeline en 4 phases :
  1. Recherche SIRET (base publique)
  2. Google Places par téléphone
  3. Google Places par nom (reverse)
  4. Recherche web d'informations légales (OpenAI web search)
  - Utilise Google Places API (`GOOGLE_PLACES_API_KEY` dans Settings) et OpenAI
  - Retourne `EnrichSuggestion` : name, contact_name, address, postal_code, city, website, siret, email, naf_code, phone, confidence
  - Frontend : dialog avec badges "nouveau" / "déjà renseigné" par champ
- **Fusion de clients** (`POST /api/clients/{source_id}/merge-into/{target_id}`) :
  - Transfère les entrées PhoneIndex (déduplique par `phone_e164`)
  - Transfère tous les enregistrements Call
  - Crée une entrée ClientAuditLog sur le client cible (action = `merged`)
  - Supprime le client source
- **ClientAuditLog** (`backend/models/client_audit.py`) : nouveau modèle de traçabilité
  - Table `client_audit_logs` : `user_id`, `action`, `field_name`, `old_value`, `new_value`, `details`
  - Actions : `created`, `updated`, `merged`, `phone_added`, `phone_removed`
  - Endpoint `GET /api/clients/{id}/audit` pour consulter l'historique
- **Profils clients éditables** (`PUT /api/clients/{id}`) : mise à jour via `UpdateClientRequest` avec audit trail automatique par champ modifié
- **Config** : `google_places_api_key` ajouté aux Settings Pydantic

---

### v2.3 — 25 Février 2026

**Wiki — Centre d'aide intégré :**

- **Page Wiki** (`/wiki`) : centre d'aide complet accessible à tous les utilisateurs (sales + admin) depuis la sidebar principale
  - 17 articles couvrant toutes les fonctionnalités du CRM
  - 3 catégories : Commercial (dashboard, playlist, clients, appels, qualification, produits, classement), Concepts (analyse IA, statuts lifecycle, scoring), Administration (sync, config playlist, assignation, pilotage, glossaire)
  - Recherche par mot-clé (titre, résumé, tags)
  - Liens croisés entre articles (ex: cliquer sur "scoring" dans l'article Playlist ouvre l'article Scoring)
  - Articles connexes suggérés en bas de chaque article (basé sur les tags communs)
  - Navigation accueil → article → retour fluide avec scroll auto

---

### v2.2 — 24 Février 2026

**Fiche client 360° enrichie avec feedback commercial et IA :**

- **Historique qualifications sur la fiche client** : chaque appel dans l'onglet "Appels" affiche désormais le mood (chaud/neutre/froid), l'outcome (rappel, vente, intéressé…), les tags, les notes du commercial, et la prochaine étape planifiée. Les lignes sont expansibles pour voir le détail complet.
- **Analyse IA intégrée** : chaque appel affiche le score IA global, le résumé automatique, le sentiment client détecté, le feedback coaching, et les opportunités identifiées. L'enregistrement audio est lisible directement depuis la fiche.
- **Card Feedback commercial** : nouveau bloc en haut de la fiche montrant les compteurs hot/cold, le dernier mood, le dernier outcome et la date de dernière qualification.
- **Backend** :
  - `CallBrief` enrichi avec `CallQualificationBrief` et `CallAiAnalysisBrief` (schemas imbriqués)
  - `ClientDetailResponse` inclut `last_qualification_mood`, `last_qualification_outcome`, `last_qualification_at`, `qualification_hot_count`, `qualification_cold_count`
  - L'endpoint `GET /api/clients/{id}` charge les appels avec `selectinload(Call.qualification, Call.ai_analysis)` et retourne 30 derniers appels avec toutes les données
- **Frontend** : interfaces `CallQualificationBrief` et `CallAiAnalysisBrief` ajoutées, `CallBrief` et `ClientDetail` enrichis

---

### v2.1 — 24 Février 2026

**Lifecycle des leads (status dynamique) :**

- **Nouveau champ `clients.status`** (VARCHAR enum) remplace les booléens `is_prospect`/`is_dormant` :
  - Valeurs : `prospect`, `lead`, `client`, `at_risk`, `dormant`, `dead`
  - Transitions automatiques pilotées par le scoring RFM, les appels et les sync Sage
  - `dead` = transition manuelle uniquement (outcome = 'not_interested')

- **Lifecycle engine** (`backend/engines/lifecycle_engine.py`) :
  - `on_call_answered(call)` : prospect → lead si appel décroché >30s ; dormant contacté → cooldown 14j
  - `on_qualification(client_id, mood, outcome, ...)` : alimente les compteurs hot/cold sur la fiche, transition → dead
  - `on_new_sales_line(client_id)` : lead/prospect → client, dormant → client (réactivation)
  - `needs_manager_review(client)` : détecte les dormants ayant atteint 5 tentatives sur 6 mois

- **Scoring engine enrichi** (`backend/engines/scoring_engine.py`) :
  - **Churn multi-facteurs** : remplacement du ratio simple `jours/freq` par un scoring à 3 composantes (Recency 0-40 + Freq deviation 0-35 + Tendance 0-25), résolvant les faux négatifs (clients one-shot à 0) et les calibrations excessives
  - Transitions automatiques : client → at_risk (churn ≥ 60), at_risk → dormant (180+ jours), dormant → client (réactivation)
  - Retourne `transitions: { to_at_risk, to_dormant, to_client }` dans le résultat du scoring
  - Sync booléens legacy `is_prospect`/`is_dormant` pour rétrocompatibilité

- **Playlist generator refondu** (`backend/engines/playlist_generator.py`) :
  - Utilise `Client.status` au lieu de `is_prospect`/`is_dormant` pour toutes les catégories
  - Respecte `contact_cooldown_until` : dormants en cooldown exclus de la playlist
  - Dormants avec ≥5 tentatives remontent en priorité avec mention "⚠ décision requise"
  - Leads triés avant prospects dans la catégorie "new_prospect"
  - Tri par `qualification_hot_count DESC` dans chaque catégorie (clients "chauds" en premier)
  - Clients dead exclus de toutes les sélections

- **Qualification enrichie** (`backend/api/qualify.py`) :
  - Appelle `on_qualification()` et `on_call_answered()` du lifecycle engine
  - Le feedback (mood, outcome, tags, notes) alimente la fiche client en temps réel

- **Sync Sage + lifecycle** (`backend/connectors/sage_sync.py`) :
  - Détecte les `client_id` avec nouvelles ventes et appelle `on_new_sales_line()` pour chaque
  - Transitions lead→client et dormant→client (réactivation) automatiques après sync

- **Nouveaux champs `clients`** :
  - `status`, `status_changed_at`
  - `contact_cooldown_until` (date de fin de cooldown)
  - `dormant_contact_count`, `dormant_first_contact_at` (tracking tentatives)
  - `last_qualification_mood`, `last_qualification_outcome`, `last_qualification_at`
  - `qualification_hot_count`, `qualification_cold_count`

- **Frontend** :
  - Badges status colorés sur la playlist, la liste clients et la fiche client 360°
  - 6 statuts visuels : Prospect (ambre), Lead (bleu), Client (vert), A risque (orange), Dormant (violet), Perdu (gris)
  - **Page Glossaire** (`/admin/glossaire`) : référence complète pour les admins — statuts du lifecycle avec conditions d'entrée/sortie, détail du calcul churn multi-facteurs (tables de seuils), scores calculés (upsell, priority), variables de playlist et système de cooldown dormants
  - **Dashboard Pilotage Commercial** (`/admin/sales-dashboard`) : vue manager complète avec :
    - Sélecteur de période (aujourd'hui, semaine, mois, trimestre) + **calendrier date-range** pour choisir une plage libre
    - 8 KPIs équipe : appels sortants, entrants, taux de décroché, qualifiés, CA, marge, complétion playlist, score IA
    - **Breakdown inbound/outbound** : chaque commercial affiche ses appels sortants et entrants séparément avec le détail des décrochés en tooltip
    - **Note de performance A/B/C/D** : grade composite par commercial basé sur le volume d'appels sortants (≥15/≥8), taux de décroché (≥60%), qualification (≥50%/≥30%), complétion playlist (≥80%/≥50%), atteinte objectif CA (≥80%/≥50%). Permet au manager d'identifier en un coup d'œil qui performe et qui est en retard
    - Tableau comparatif triable sur toutes les colonnes (nom, out, in, décr.%, CA, cmd, objectif, IA, qualif.%, playlist, humeurs)
    - **Playlist suivi** : colonne affichant `X/Y` (items traités/total) avec code couleur (vert ≥80%, jaune ≥50%, orange <50%)
    - Drill-down par commercial : scores IA détaillés (6 axes), portefeuille clients, résultats de qualification, derniers 50 appels
    - Détail d'appel dans un volet latéral : lecture audio, qualification complète, analyse IA avec barres de score, résumé, feedback, sentiment, opportunités détectées
    - **Guide "Comment lire cette page ?"** : popover explicatif intégré dans le header pour aider le manager à exploiter le dashboard

---

### v2.0 — 24 Février 2026

**Réassignation clients & protection anti-doublons :**

- **Page Réassignation** (`/admin/assignments`) : interface admin pour transférer des clients entre commerciaux
  - Vue d'ensemble de chaque commercial avec nombre de clients assignés
  - Sélection multiple de clients avec recherche par nom, code Sage ou ville
  - Transfert vers un commercial cible via dropdown + bouton "Transférer"
  - Les champs `assigned_user_id` et `sales_rep` sont mis à jour simultanément en base
  - Compteur "Non assignés" pour les clients orphelins

- **Anti-doublons inter-commerciaux** (`backend/engines/playlist_generator.py`) :
  - `global_seen: set[str]` partagé entre toutes les itérations lors de la génération batch
  - Un client attribué à un commercial ne sera jamais proposé à un autre le même jour
  - Protection active uniquement en mode batch (génération pour tous) ; en mode individuel, pas de restriction

- **CA temps réel dans l'Insight** (`backend/api/playlists.py`) :
  - Le CA total, CA 12 mois et panier moyen sont désormais calculés directement depuis `sales_lines` (requête SQL en temps réel)
  - Suppression de la dépendance aux `client_scores` pré-calculés pour ces métriques dans l'insight, garantissant des chiffres toujours à jour
  - Correctif : AVIGROS SAS affichait 5 620€ au lieu de 312 862€ (scoring obsolète)

- **Sidebar admin enrichie** : nouveau lien "Assignation Clients" dans la navigation admin

- **Endpoints API** :
  - `GET /api/admin/clients/assignments` : résumé des affectations par commercial
  - `GET /api/admin/clients/by-user/{user_id}?search=` : clients d'un commercial
  - `GET /api/admin/clients/unassigned?search=` : clients sans attribution
  - `POST /api/admin/clients/reassign` : réassigner `client_ids[]` à `target_user_id`

---

### v1.9 — 24 Février 2026

**Refonte complète du système Playlist :**
- **PlaylistConfig par commercial** : nouveau modèle `playlist_configs` permettant à l'admin de configurer la répartition (% callback, dormant, churn, upsell, prospect) et les seuils pour chaque commercial. Validation : total % = 100%.
- **Générateur refondu** : 6 catégories (callbacks → dormants → churn → upsell → prospects → relation), matching flexible `sales_rep` via ILIKE, complément automatique "relation client" si pool insuffisant.
- **Page admin Playlists** (`/admin/playlists`) : vue de tous les commerciaux avec barre de répartition colorée, dialog de configuration avec preview en temps réel, génération individuelle ou globale, suppression du jour.
- **UI Playlist compacte** : remplacement des grosses cards par un format table avec lignes compactes (numéro, badge raison avec emoji, nom client, détail, ville, actions).
- **Undo statut** : possibilité de remettre un item "done"/"skipped" en "pending" via bouton ↩️.
- **Panneau Insight** : bouton 👁 sur chaque ligne ouvrant un dialog riche avec KPIs client (CA, panier moyen, scores), top 10 produits commandés (cliquables vers fiche produit), jours depuis dernière commande.
- **Assistant IA** : bouton "Demander une recommandation IA" dans le panneau Insight, appel GPT-4o-mini contextué (historique, produits, scores, type d'opportunité) retournant 3-5 points d'action concrets.
- **Endpoints API** : `GET /api/playlists/{id}/insight`, `GET/PUT /api/admin/playlist/configs`, `POST /api/admin/playlist/generate`, `DELETE /api/admin/playlist/clear`.

**Bugs corrigés :**
- Doublon méthode `generatePlaylists()` dans le client API frontend (ancienne route `/api/admin/playlists/generate` écrasait la nouvelle)
- `ValidationError` Pydantic v2 sur `PlaylistItemResponse.model_validate(client)` — champs requis absents → construction manuelle
- Rôle "admin" exclu de la génération playlist → ajouté
- Contrainte SQL `uq_playlist_config_user` vs `playlist_configs_user_id_key` → nom corrigé

### v1.2 — 23 Février 2026 (après-midi)

**Nouvelles fonctionnalités :**
- **Écoute des enregistrements** : player audio HTML5 intégré dans la page Appels, lecture directe des MP3 Ringover CDN
- **Transcription IA** : pipeline Whisper → GPT-4o (`POST /api/calls/{id}/transcribe`) avec résumé structuré (résumé, ressenti, sujets, actions, opportunités). Module `backend/ai/transcription.py`
- **Navigation enrichie** : noms de clients cliquables partout (dashboard, appels, playlist, liste clients) vers la fiche 360°
- **Click-to-call universel** : boutons d'appel ajoutés dans la page Appels (historique), le dashboard (playlist + rappels)

**Bugs corrigés :**
- `.env` non sauvegardé sur disque → clé `OPENAI_API_KEY` vide au runtime, fichier réécrit
- Bug download audio : données MP3 lues après fermeture du client httpx → lecture dans le context manager

### v1.6 — 1 Mars 2026

**Pipeline commercial (BC / BL) :**
- **Élargissement de la sync Sage** : `get_sales_lines()` récupère désormais 4 types de documents : Bons de Commande (DO_Type=1), Bons de Livraison (DO_Type=3), Factures (DO_Type=6) et Avoirs (DO_Type=7)
- **Pipeline dashboard** : nouveau bloc « Pipeline en cours » sur le dashboard avec KPIs (CA en commande, en livraison, commandes en cours, livraisons en cours) et liste des dernières commandes avec liens cliquables vers les fiches clients
- **Pipeline fiche client** : nouvel onglet « Commandes en cours » sur la fiche client 360° affichant les BC/BL en cours
- **Distinction scoring Recency / Financier** : la composante Recency du score de churn utilise **tous les types** (BC, BL, FA, AV) pour refléter l'activité réelle, tandis que les métriques financières (CA, marge, order_count) restent basées uniquement sur les factures (types 6, 7) pour éviter le double-comptage

**Articles de service :**
- **Flag `is_service`** sur le modèle `Product` : les articles de service (TRANSPORT, ARTDIVERS, ZACOMPTE, ZREMISE, etc.) sont automatiquement taggés lors de la sync Sage
- **Exclusion automatique** : les articles de service sont exclus des listings produits, des suggestions upsell, des co-achats et du top produits du dashboard
- **Migration** : script `apply_service_flag_migration.py` pour ajouter la colonne et tagger les articles existants

**Page Commandes (global) :**
- **Nouvelle page `/orders`** dans la navigation principale : liste paginée de toutes les pièces commerciales (BC, BL, FA, AV) avec KPIs de synthèse, recherche, tri et filtres
- **Filtres avancés** : par type de document, plage de dates (presets + calendrier), et **par commercial** (admin/manager uniquement)
- **Panel de détail** à droite (même UX que la fiche produit) avec les lignes de la commande, chaque ligne cliquable vers la fiche produit correspondante
- **Endpoint API** : `GET /api/orders` avec paramètres `doc_type`, `date_from`, `date_to`, `user_id`, `search`, `sort_by`, `sort_dir`, `limit`, `offset`
- **Formatage K€/M€** pour les KPIs de CA sur la page commandes

**Onglet Commandes sur fiche produit :**
- **Nouvel onglet « Commandes »** dans le panel de détail produit : historique paginé des commandes (tous types) pour cet article
- Chaque commande est un lien vers la page `/orders?piece_id=xxx`
- Client cliquable (navigation vers la fiche client)

**Corrections :**
- `article_ref` NULL : correction du bug où les valeurs `None` de Sage étaient stockées en tant que chaîne `"None"` au lieu de `NULL` en base
- Noms de clients « Inconnu » : utilisation systématique de `func.coalesce(Client.name, SalesLine.client_name)` pour prioriser le nom de la table clients
- Erreur HTML nested `<a>` tags : remplacement des `Link` imbriqués par des `<button>` avec navigation programmatique

### v1.1 — 23 Février 2026

**Nouvelles fonctionnalités :**
- **Click-to-call** : lancement d'appel depuis le CRM via Ringover Callback API (`POST /v2/callback`)
- **Système de rappels** : date picker dans la qualification, section rappels dans le dashboard, endpoint `/api/calls/reminders`
- **Frontend complet** : Next.js 16 + Tailwind + shadcn/ui, thème sombre, 8 pages fonctionnelles

**Bugs corrigés :**
- `bcrypt` / `passlib` incompatibilité → downgrade bcrypt à 4.1.3
- `NUMERIC(5,2)` overflow sur `margin_percent` → élargi à `NUMERIC(8,2)`
- Transaction PostgreSQL cassée sur erreur d'import → ajout `rollback` par ligne
- `InvalidSchemaNameError` → droits `GRANT ALL ON SCHEMA public`
- `MissingGreenlet` sur lazy loading async (Pydantic + SQLAlchemy) → `selectinload` explicite
- `.env` non trouvé quand backend lancé depuis `backend/` → fallback `../.env`
- `incall_duration: null` sur appels annulés Ringover → default à 0
- `StaleDataError` sur `sync_logs` → séparation commit sync et commit log
- Hydration mismatch Next.js (extension Chrome) → `suppressHydrationWarning`
- Page Next.js par défaut masquait le dashboard → suppression de `src/app/page.tsx`
