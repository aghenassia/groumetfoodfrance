"""
Import CSV de leads — parse, validation, détection doublons, import async.
"""
import asyncio
import csv
import io
import re
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, UploadFile, File, Query, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, func, or_
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db, async_session
from core.security import require_admin
from models.user import User
from models.client import Client
from models.contact import Contact
from models.phone_index import PhoneIndex
from connectors.phone_normalizer import normalize_phone, country_to_region

router = APIRouter(prefix="/api/admin/import", tags=["import"])

# ── In-memory store for parsed files (TTL managed manually) ──────────

_parsed_store: dict[str, dict] = {}
_job_store: dict[str, dict] = {}

STORE_TTL_SECONDS = 1800  # 30 min


def _cleanup_stores():
    now = datetime.now(timezone.utc).timestamp()
    for store in (_parsed_store, _job_store):
        expired = [k for k, v in store.items() if now - v.get("_ts", 0) > STORE_TTL_SECONDS]
        for k in expired:
            del store[k]


# ── CSV column definitions ───────────────────────────────────────────

COMPANY_COLUMNS = [
    "nom_entreprise", "type_entreprise", "sous_type_entreprise",
    "telephone", "email", "adresse", "code_postal",
    "ville", "pays", "siret", "code_naf", "site_web", "commercial",
    "est_prospect",
]

CONTACT_COLUMNS_INLINE = [
    "contact_nom", "contact_prenom", "contact_role", "contact_titre",
    "contact_telephone", "contact_telephone_2", "contact_telephone_3",
    "contact_email",
]

CONTACT_COLUMNS_SEPARATE = [
    "nom_entreprise", "nom", "prenom", "role", "titre",
    "telephone", "telephone_2", "telephone_3",
    "email", "est_principal",
]

COMPANY_EXAMPLE_1 = {
    "nom_entreprise": "RESTAURANT LE GOURMET",
    "type_entreprise": "Restaurant",
    "sous_type_entreprise": "Restaurant gastronomique",
    "telephone": "01 42 33 44 55",
    "email": "contact@legourmet.fr",
    "adresse": "12 Rue de la Paix",
    "code_postal": "75002",
    "ville": "Paris",
    "pays": "France",
    "siret": "12345678901234",
    "code_naf": "5610A",
    "site_web": "www.legourmet.fr",
    "commercial": "PAPIN",
    "est_prospect": "oui",
}

COMPANY_EXAMPLE_2 = {
    "nom_entreprise": "BRASSERIE DU PORT",
    "type_entreprise": "Restaurant",
    "sous_type_entreprise": "Brasserie",
    "telephone": "04 91 22 33 44",
    "email": "info@brasserieduport.com",
    "adresse": "8 Quai du Port",
    "code_postal": "13002",
    "ville": "Marseille",
    "pays": "France",
    "siret": "",
    "code_naf": "",
    "site_web": "",
    "commercial": "COLLOT",
    "est_prospect": "oui",
}

SINGLE_EXAMPLE_1 = {
    **COMPANY_EXAMPLE_1,
    "contact_nom": "MARTIN",
    "contact_prenom": "Jean",
    "contact_role": "Gérant",
    "contact_titre": "Chef de cuisine",
    "contact_telephone": "06 12 34 56 78",
    "contact_telephone_2": "",
    "contact_telephone_3": "",
    "contact_email": "jean.martin@legourmet.fr",
}

SINGLE_EXAMPLE_2 = {
    **COMPANY_EXAMPLE_2,
    "contact_nom": "DUPONT",
    "contact_prenom": "Marie",
    "contact_role": "Acheteur",
    "contact_titre": "Directrice des achats",
    "contact_telephone": "06 98 76 54 32",
    "contact_telephone_2": "04 91 22 33 45",
    "contact_telephone_3": "",
    "contact_email": "m.dupont@brasserieduport.com",
}


# ── Template endpoint ────────────────────────────────────────────────

@router.get("/template")
async def download_template(
    mode: str = Query(default="single", pattern="^(single|companies|contacts)$"),
    user: User = Depends(require_admin),
):
    buf = io.StringIO()
    if mode == "single":
        cols = COMPANY_COLUMNS + CONTACT_COLUMNS_INLINE
        writer = csv.DictWriter(buf, fieldnames=cols, delimiter=";")
        writer.writeheader()
        writer.writerow(SINGLE_EXAMPLE_1)
        writer.writerow(SINGLE_EXAMPLE_2)
        filename = "template_import_leads.csv"
    elif mode == "companies":
        writer = csv.DictWriter(buf, fieldnames=COMPANY_COLUMNS, delimiter=";")
        writer.writeheader()
        writer.writerow(COMPANY_EXAMPLE_1)
        writer.writerow(COMPANY_EXAMPLE_2)
        filename = "template_import_entreprises.csv"
    else:
        writer = csv.DictWriter(buf, fieldnames=CONTACT_COLUMNS_SEPARATE, delimiter=";")
        writer.writeheader()
        writer.writerow({
            "nom_entreprise": "RESTAURANT LE GOURMET",
            "nom": "MARTIN", "prenom": "Jean", "role": "Gérant",
            "titre": "Chef de cuisine",
            "telephone": "06 12 34 56 78", "telephone_2": "", "telephone_3": "",
            "email": "jean.martin@legourmet.fr",
            "est_principal": "oui",
        })
        filename = "template_import_contacts.csv"

    buf.seek(0)
    bom = b"\xef\xbb\xbf"
    content = bom + buf.getvalue().encode("utf-8")
    return StreamingResponse(
        io.BytesIO(content),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Parse endpoint ───────────────────────────────────────────────────

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class ParseResponse(BaseModel):
    total: int
    valid: int
    errors: list[dict[str, Any]]
    duplicates: list[dict[str, Any]]
    preview: list[dict[str, Any]]
    parsed_file_id: str


@router.post("/parse", response_model=ParseResponse)
async def parse_csv(
    file: UploadFile = File(...),
    mode: str = Query(default="single", pattern="^(single|companies|contacts)$"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    _cleanup_stores()

    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")

    for delim in [";", ",", "\t"]:
        if delim in text.split("\n")[0]:
            break
    else:
        delim = ";"

    reader = csv.DictReader(io.StringIO(text), delimiter=delim)
    if not reader.fieldnames:
        raise HTTPException(400, "Fichier CSV vide ou mal formaté")

    clean_fieldnames = [f.strip().lower().replace(" ", "_") for f in reader.fieldnames]

    users_q = await db.execute(select(User).where(User.is_active == True))
    all_users = {u.sage_rep_name.upper(): u for u in users_q.scalars().all() if u.sage_rep_name}
    user_names = {u.name.upper(): u for u in (await db.execute(select(User).where(User.is_active == True))).scalars().all()}

    rows: list[dict] = []
    errors: list[dict] = []
    duplicates: list[dict] = []

    for line_idx, raw_row in enumerate(reader, start=2):
        row = {clean_fieldnames[i]: (v.strip() if v else "") for i, (_, v) in enumerate(raw_row.items()) if i < len(clean_fieldnames)}

        company_name = row.get("nom_entreprise", "").strip()
        if not company_name and mode != "contacts":
            errors.append({"line": line_idx, "field": "nom_entreprise", "message": "Nom d'entreprise requis"})
            continue
        if mode == "contacts":
            contact_name = row.get("nom", "").strip() or row.get("contact_nom", "").strip()
            if not contact_name:
                errors.append({"line": line_idx, "field": "nom", "message": "Nom du contact requis"})
                continue

        phone_raw = row.get("telephone", "")
        phone_e164 = normalize_phone(phone_raw) if phone_raw else None
        if phone_raw and not phone_e164:
            errors.append({"line": line_idx, "field": "telephone", "message": f"Numéro invalide : {phone_raw}"})

        email = row.get("email", "")
        if email and not EMAIL_RE.match(email):
            errors.append({"line": line_idx, "field": "email", "message": f"Email invalide : {email}"})
            email = ""

        contact_phone_raw = (row.get("contact_telephone", "") or row.get("telephone", "")) if mode == "contacts" else row.get("contact_telephone", "")
        contact_phone_e164 = normalize_phone(contact_phone_raw) if contact_phone_raw else None
        if contact_phone_raw and not contact_phone_e164:
            errors.append({"line": line_idx, "field": "contact_telephone", "message": f"Numéro contact invalide : {contact_phone_raw}"})

        phone2_raw = row.get("contact_telephone_2", "") or row.get("telephone_2", "")
        phone2_e164 = normalize_phone(phone2_raw) if phone2_raw else None
        if phone2_raw and not phone2_e164:
            errors.append({"line": line_idx, "field": "telephone_2", "message": f"Numéro secondaire invalide : {phone2_raw}"})

        phone3_raw = row.get("contact_telephone_3", "") or row.get("telephone_3", "")
        phone3_e164 = normalize_phone(phone3_raw) if phone3_raw else None
        if phone3_raw and not phone3_e164:
            errors.append({"line": line_idx, "field": "telephone_3", "message": f"Numéro tertiaire invalide : {phone3_raw}"})

        commercial_name = row.get("commercial", "").strip()
        matched_user_id = None
        if commercial_name:
            u = all_users.get(commercial_name.upper()) or user_names.get(commercial_name.upper())
            if u:
                matched_user_id = u.id
            else:
                errors.append({"line": line_idx, "field": "commercial", "message": f"Commercial inconnu : {commercial_name}"})

        raw_nom = row.get("contact_nom", "") or row.get("nom", "")
        raw_prenom = row.get("contact_prenom", "") or row.get("prenom", "")
        c_last = raw_nom.strip()
        c_first = raw_prenom.strip()
        c_full = f"{c_first} {c_last}".strip() if c_first and c_last else (c_last or c_first)

        parsed = {
            "line": line_idx,
            "nom_entreprise": company_name,
            "type_entreprise": row.get("type_entreprise", ""),
            "sous_type_entreprise": row.get("sous_type_entreprise", ""),
            "telephone": phone_raw,
            "phone_e164": phone_e164,
            "email": email,
            "adresse": row.get("adresse", ""),
            "code_postal": row.get("code_postal", ""),
            "ville": row.get("ville", ""),
            "pays": row.get("pays", "") or "France",
            "siret": row.get("siret", ""),
            "code_naf": row.get("code_naf", ""),
            "site_web": row.get("site_web", ""),
            "commercial": commercial_name,
            "matched_user_id": matched_user_id,
            "est_prospect": row.get("est_prospect", "oui").lower() in ("oui", "yes", "1", "true", "o", ""),
            "contact_nom": c_full,
            "contact_prenom": c_first,
            "contact_nom_famille": c_last,
            "contact_role": row.get("contact_role", "") or row.get("role", ""),
            "contact_titre": row.get("contact_titre", "") or row.get("titre", ""),
            "contact_telephone": contact_phone_raw,
            "contact_phone_e164": contact_phone_e164,
            "telephone_2": phone2_raw,
            "phone2_e164": phone2_e164,
            "telephone_3": phone3_raw,
            "phone3_e164": phone3_e164,
            "contact_email": row.get("contact_email", "") or (row.get("email", "") if mode == "contacts" else ""),
            "contact_est_principal": row.get("est_principal", "oui").lower() in ("oui", "yes", "1", "true", "o", ""),
            "status": "new",
        }
        rows.append(parsed)

    if mode != "contacts":
        phones_to_check = [r["phone_e164"] for r in rows if r["phone_e164"]]
        phone_matches: dict[str, tuple[str, str]] = {}
        if phones_to_check:
            existing = await db.execute(
                select(PhoneIndex.phone_e164, Client.id, Client.name)
                .join(Client, Client.id == PhoneIndex.client_id)
                .where(PhoneIndex.phone_e164.in_(phones_to_check))
            )
            for ph, cid, cname in existing.all():
                phone_matches[ph] = (cid, cname)

        contact_phones = [r["contact_phone_e164"] for r in rows if r["contact_phone_e164"]]
        if contact_phones:
            existing2 = await db.execute(
                select(PhoneIndex.phone_e164, Client.id, Client.name)
                .join(Client, Client.id == PhoneIndex.client_id)
                .where(PhoneIndex.phone_e164.in_(contact_phones))
            )
            for ph, cid, cname in existing2.all():
                if ph not in phone_matches:
                    phone_matches[ph] = (cid, cname)

        name_city_pairs = [(r["nom_entreprise"], r["ville"]) for r in rows]
        name_matches: dict[str, tuple[str, str]] = {}
        if name_city_pairs:
            for name, city in name_city_pairs:
                key = f"{name.upper()}|{city.upper()}"
                if key in name_matches:
                    continue
                q = select(Client.id, Client.name).where(
                    func.upper(Client.name) == name.upper()
                )
                if city:
                    q = q.where(func.upper(Client.city) == city.upper())
                res = await db.execute(q.limit(1))
                match = res.first()
                if match:
                    name_matches[key] = (match[0], match[1])

        for r in rows:
            if r["phone_e164"] and r["phone_e164"] in phone_matches:
                cid, cname = phone_matches[r["phone_e164"]]
                r["status"] = "duplicate"
                duplicates.append({
                    "line": r["line"],
                    "csv_name": r["nom_entreprise"],
                    "existing_id": cid,
                    "existing_name": cname,
                    "match_type": "phone",
                })
            elif r["contact_phone_e164"] and r["contact_phone_e164"] in phone_matches:
                cid, cname = phone_matches[r["contact_phone_e164"]]
                r["status"] = "duplicate"
                duplicates.append({
                    "line": r["line"],
                    "csv_name": r["nom_entreprise"],
                    "existing_id": cid,
                    "existing_name": cname,
                    "match_type": "contact_phone",
                })
            else:
                key = f"{r['nom_entreprise'].upper()}|{r['ville'].upper()}"
                if key in name_matches:
                    cid, cname = name_matches[key]
                    r["status"] = "duplicate"
                    duplicates.append({
                        "line": r["line"],
                        "csv_name": r["nom_entreprise"],
                        "existing_id": cid,
                        "existing_name": cname,
                        "match_type": "name_city",
                    })

    parsed_id = str(uuid.uuid4())
    _parsed_store[parsed_id] = {
        "_ts": datetime.now(timezone.utc).timestamp(),
        "rows": rows,
        "mode": mode,
    }

    valid_count = sum(1 for r in rows if r["status"] == "new")
    preview = rows[:20]

    return ParseResponse(
        total=len(rows),
        valid=valid_count,
        errors=errors,
        duplicates=duplicates,
        preview=[{k: v for k, v in p.items() if k != "matched_user_id"} for p in preview],
        parsed_file_id=parsed_id,
    )


# ── Execute endpoint ─────────────────────────────────────────────────

class ExecuteRequest(BaseModel):
    parsed_file_id: str
    duplicate_actions: dict[str, str] = {}  # "line_N": "skip"|"update"|"create"


class ExecuteResponse(BaseModel):
    job_id: str


@router.post("/execute", response_model=ExecuteResponse)
async def execute_import(
    body: ExecuteRequest,
    user: User = Depends(require_admin),
):
    parsed = _parsed_store.get(body.parsed_file_id)
    if not parsed:
        raise HTTPException(404, "Fichier parsé expiré ou introuvable. Re-uploadez le CSV.")

    job_id = str(uuid.uuid4())
    _job_store[job_id] = {
        "_ts": datetime.now(timezone.utc).timestamp(),
        "status": "running",
        "total": len(parsed["rows"]),
        "done": 0,
        "created": 0,
        "updated": 0,
        "skipped": 0,
        "errors": [],
    }

    asyncio.create_task(_run_import(job_id, parsed["rows"], body.duplicate_actions, parsed["mode"]))

    del _parsed_store[body.parsed_file_id]

    return ExecuteResponse(job_id=job_id)


async def _run_import(job_id: str, rows: list[dict], dup_actions: dict[str, str], mode: str):
    job = _job_store[job_id]
    batch_size = 50

    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        async with async_session() as db:
            try:
                for row in batch:
                    try:
                        action = "create"
                        if row["status"] == "duplicate":
                            action = dup_actions.get(f"line_{row['line']}", "skip")

                        if action == "skip":
                            job["skipped"] += 1
                            job["done"] += 1
                            continue

                        if mode == "contacts":
                            await _import_contact_only(db, row)
                            job["created"] += 1
                        elif action == "update":
                            await _update_existing(db, row)
                            job["updated"] += 1
                        else:
                            await _create_new(db, row)
                            job["created"] += 1

                        job["done"] += 1
                    except Exception as e:
                        job["errors"].append({"line": row["line"], "message": str(e)[:200]})
                        job["done"] += 1

                await db.commit()
            except Exception as e:
                job["errors"].append({"line": f"batch {i}-{i+batch_size}", "message": str(e)[:200]})
                await db.rollback()

    job["status"] = "completed"


async def _create_new(db: AsyncSession, row: dict):
    sage_id = f"LEAD-{uuid.uuid4().hex[:8].upper()}"
    client_id = str(uuid.uuid4())

    client = Client(
        id=client_id,
        sage_id=sage_id,
        name=row["nom_entreprise"],
        phone=row["telephone"],
        phone_e164=row["phone_e164"],
        email=row["email"],
        address=row["adresse"],
        postal_code=row["code_postal"],
        city=row["ville"],
        country=row["pays"] or "France",
        siret=row["siret"] or None,
        naf_code=row["code_naf"] or None,
        website=row["site_web"] or None,
        client_type=row.get("type_entreprise") or None,
        client_subtype=row.get("sous_type_entreprise") or None,
        assigned_user_id=row["matched_user_id"],
        is_prospect=row["est_prospect"],
        status="lead",
    )
    db.add(client)
    await db.flush()

    if row["phone_e164"]:
        stmt = pg_insert(PhoneIndex).values(
            id=str(uuid.uuid4()),
            phone_e164=row["phone_e164"],
            client_id=client_id,
            source="csv_import",
            raw_phone=row["telephone"],
            label="main",
        ).on_conflict_do_nothing(constraint="uq_phone_client")
        await db.execute(stmt)

    if row["contact_nom"]:
        contact_id = str(uuid.uuid4())
        contact = Contact(
            id=contact_id,
            company_id=client_id,
            name=row["contact_nom"],
            first_name=row["contact_prenom"] or None,
            last_name=row.get("contact_nom_famille") or None,
            role=row["contact_role"] or None,
            title=row.get("contact_titre") or None,
            phone=row["contact_telephone"],
            phone_e164=row["contact_phone_e164"],
            email=row["contact_email"] or None,
            is_primary=True,
            source="csv_import",
        )
        db.add(contact)
        await db.flush()

        phones_to_index = []
        if row["contact_phone_e164"]:
            phones_to_index.append((row["contact_phone_e164"], row["contact_telephone"], "contact"))
        if row.get("phone2_e164"):
            phones_to_index.append((row["phone2_e164"], row.get("telephone_2", ""), "contact_2"))
        if row.get("phone3_e164"):
            phones_to_index.append((row["phone3_e164"], row.get("telephone_3", ""), "contact_3"))

        for ph_e164, ph_raw, ph_label in phones_to_index:
            stmt = pg_insert(PhoneIndex).values(
                id=str(uuid.uuid4()),
                phone_e164=ph_e164,
                client_id=client_id,
                contact_id=contact_id,
                source="csv_import",
                raw_phone=ph_raw,
                label=ph_label,
            ).on_conflict_do_nothing(constraint="uq_phone_client")
            await db.execute(stmt)


async def _update_existing(db: AsyncSession, row: dict):
    dup_info = None
    for d in _job_store.values():
        pass

    phones = [row["phone_e164"], row["contact_phone_e164"]]
    phones = [p for p in phones if p]
    client = None
    if phones:
        res = await db.execute(
            select(Client)
            .join(PhoneIndex, PhoneIndex.client_id == Client.id)
            .where(PhoneIndex.phone_e164.in_(phones))
            .limit(1)
        )
        client = res.scalar_one_or_none()

    if not client:
        res = await db.execute(
            select(Client).where(
                func.upper(Client.name) == row["nom_entreprise"].upper(),
                func.upper(Client.city) == row["ville"].upper() if row["ville"] else True,
            ).limit(1)
        )
        client = res.scalar_one_or_none()

    if not client:
        await _create_new(db, row)
        return

    if row["email"] and not client.email:
        client.email = row["email"]
    if row["adresse"] and not client.address:
        client.address = row["adresse"]
    if row["code_postal"] and not client.postal_code:
        client.postal_code = row["code_postal"]
    if row["ville"] and not client.city:
        client.city = row["ville"]
    if row["siret"] and not client.siret:
        client.siret = row["siret"]
    if row["site_web"] and not client.website:
        client.website = row["site_web"]
    if row.get("type_entreprise") and not client.client_type:
        client.client_type = row["type_entreprise"]
    if row.get("sous_type_entreprise") and not client.client_subtype:
        client.client_subtype = row["sous_type_entreprise"]
    if row["matched_user_id"] and not client.assigned_user_id:
        client.assigned_user_id = row["matched_user_id"]
    if row["phone_e164"] and not client.phone_e164:
        client.phone = row["telephone"]
        client.phone_e164 = row["phone_e164"]

    if row["phone_e164"]:
        stmt = pg_insert(PhoneIndex).values(
            id=str(uuid.uuid4()),
            phone_e164=row["phone_e164"],
            client_id=client.id,
            source="csv_import",
            raw_phone=row["telephone"],
            label="main",
        ).on_conflict_do_nothing(constraint="uq_phone_client")
        await db.execute(stmt)

    if row["contact_nom"]:
        existing_contact = await db.execute(
            select(Contact).where(
                Contact.company_id == client.id,
                func.upper(Contact.name) == row["contact_nom"].upper(),
            ).limit(1)
        )
        if not existing_contact.scalar_one_or_none():
            contact_id = str(uuid.uuid4())
            contact = Contact(
                id=contact_id,
                company_id=client.id,
                name=row["contact_nom"],
                first_name=row["contact_prenom"] or None,
                last_name=row.get("contact_nom_famille") or None,
                role=row["contact_role"] or None,
                title=row.get("contact_titre") or None,
                phone=row["contact_telephone"],
                phone_e164=row["contact_phone_e164"],
                email=row["contact_email"] or None,
                is_primary=False,
                source="csv_import",
            )
            db.add(contact)
            await db.flush()

            phones_to_index = []
            if row["contact_phone_e164"]:
                phones_to_index.append((row["contact_phone_e164"], row["contact_telephone"], "contact"))
            if row.get("phone2_e164"):
                phones_to_index.append((row["phone2_e164"], row.get("telephone_2", ""), "contact_2"))
            if row.get("phone3_e164"):
                phones_to_index.append((row["phone3_e164"], row.get("telephone_3", ""), "contact_3"))

            for ph_e164, ph_raw, ph_label in phones_to_index:
                stmt = pg_insert(PhoneIndex).values(
                    id=str(uuid.uuid4()),
                    phone_e164=ph_e164,
                    client_id=client.id,
                    contact_id=contact_id,
                    source="csv_import",
                    raw_phone=ph_raw,
                    label=ph_label,
                ).on_conflict_do_nothing(constraint="uq_phone_client")
                await db.execute(stmt)


async def _import_contact_only(db: AsyncSession, row: dict):
    company_name = row.get("nom_entreprise", "").strip()
    client = None
    if company_name:
        res = await db.execute(
            select(Client).where(func.upper(Client.name) == company_name.upper()).limit(1)
        )
        client = res.scalar_one_or_none()
        if not client:
            raise ValueError(f"Entreprise introuvable : {company_name}")

    contact_name = row.get("contact_nom", "")
    contact_id = str(uuid.uuid4())
    contact = Contact(
        id=contact_id,
        company_id=client.id if client else None,
        name=contact_name,
        first_name=row.get("contact_prenom") or None,
        last_name=row.get("contact_nom_famille") or None,
        role=row.get("contact_role") or None,
        title=row.get("contact_titre") or None,
        phone=row.get("contact_telephone") or row.get("telephone", ""),
        phone_e164=row.get("contact_phone_e164") or row.get("phone_e164"),
        email=row.get("contact_email") or row.get("email", "") or None,
        is_primary=row.get("contact_est_principal", False),
        source="csv_import",
    )
    db.add(contact)
    await db.flush()

    phones_to_index = []
    primary_phone = row.get("contact_phone_e164") or row.get("phone_e164")
    if primary_phone:
        phones_to_index.append((primary_phone, row.get("contact_telephone") or row.get("telephone", ""), "contact"))
    phone2_raw = row.get("telephone_2", "")
    phone2_e164 = row.get("phone2_e164")
    if phone2_e164:
        phones_to_index.append((phone2_e164, phone2_raw, "contact_2"))
    phone3_raw = row.get("telephone_3", "")
    phone3_e164 = row.get("phone3_e164")
    if phone3_e164:
        phones_to_index.append((phone3_e164, phone3_raw, "contact_3"))

    for ph_e164, ph_raw, ph_label in phones_to_index:
        if client:
            stmt = pg_insert(PhoneIndex).values(
                id=str(uuid.uuid4()),
                phone_e164=ph_e164,
                client_id=client.id,
                contact_id=contact_id,
                source="csv_import",
                raw_phone=ph_raw,
                label=ph_label,
            ).on_conflict_do_nothing(constraint="uq_phone_client")
            await db.execute(stmt)


# ── Status endpoint ──────────────────────────────────────────────────

@router.get("/status/{job_id}")
async def import_status(
    job_id: str,
    user: User = Depends(require_admin),
):
    job = _job_store.get(job_id)
    if not job:
        raise HTTPException(404, "Job introuvable ou expiré")
    return {
        "status": job["status"],
        "total": job["total"],
        "done": job["done"],
        "created": job["created"],
        "updated": job["updated"],
        "skipped": job["skipped"],
        "errors": job["errors"][:50],
    }
