from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user
from models.user import User
from models.client import Client
from models.contact import Contact
from models.call import Call
from models.phone_index import PhoneIndex
from models.client_audit import ClientAuditLog
from schemas.client import ContactResponse, ContactBrief
from connectors.phone_normalizer import normalize_phone

router = APIRouter(prefix="/api/contacts", tags=["contacts"])


class CreateContactRequest(BaseModel):
    name: str
    first_name: str | None = None
    last_name: str | None = None
    role: str | None = None
    phone: str | None = None
    email: str | None = None
    company_id: str | None = None
    is_primary: bool = False


class UpdateContactRequest(BaseModel):
    name: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    role: str | None = None
    phone: str | None = None
    email: str | None = None
    is_primary: bool | None = None


def _contact_to_response(contact: Contact, company_name: str | None = None, user_name: str | None = None) -> ContactResponse:
    return ContactResponse(
        id=contact.id,
        name=contact.name,
        first_name=contact.first_name,
        last_name=contact.last_name,
        role=contact.role,
        phone=contact.phone,
        phone_e164=contact.phone_e164,
        email=contact.email,
        is_primary=contact.is_primary,
        source=contact.source,
        assigned_user_id=contact.assigned_user_id,
        assigned_user_name=user_name,
        company_id=contact.company_id,
        company_name=company_name,
        created_at=contact.created_at,
        updated_at=contact.updated_at,
    )


@router.get("")
async def list_contacts(
    search: str | None = None,
    company_id: str | None = None,
    orphan_only: bool = False,
    has_phone: bool | None = None,
    assigned_user_id: str | None = None,
    sort_by: str = Query(default="name", pattern="^(name|created_at|company_name)$"),
    sort_dir: str = Query(default="asc", pattern="^(asc|desc)$"),
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    base = (
        select(Contact, Client.name.label("company_name"), User.name.label("user_name"))
        .outerjoin(Client, Client.id == Contact.company_id)
        .outerjoin(User, User.id == Contact.assigned_user_id)
    )

    if company_id:
        base = base.where(Contact.company_id == company_id)
    if orphan_only:
        base = base.where(Contact.company_id.is_(None))
    if has_phone is True:
        base = base.where(Contact.phone_e164.isnot(None))
    elif has_phone is False:
        base = base.where(Contact.phone_e164.is_(None))
    if assigned_user_id:
        base = base.where(Contact.assigned_user_id == assigned_user_id)
    if search:
        pattern = f"%{search}%"
        base = base.where(
            Contact.name.ilike(pattern)
            | Contact.first_name.ilike(pattern)
            | Contact.last_name.ilike(pattern)
            | Contact.phone.ilike(pattern)
            | Contact.phone_e164.ilike(pattern)
            | Contact.email.ilike(pattern)
            | Contact.role.ilike(pattern)
            | Client.name.ilike(pattern)
        )

    count_stmt = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    sort_col_map = {
        "name": Contact.name,
        "created_at": Contact.created_at,
        "company_name": Client.name,
    }
    sort_col = sort_col_map.get(sort_by, Contact.name)
    order = sort_col.desc() if sort_dir == "desc" else sort_col.asc()
    stmt = base.order_by(order).offset(offset).limit(limit)

    result = await db.execute(stmt)
    rows = result.all()

    return {
        "contacts": [_contact_to_response(row[0], row[1], row[2]) for row in rows],
        "total": total,
    }


@router.get("/{contact_id}", response_model=ContactResponse)
async def get_contact(
    contact_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Contact, Client.name.label("company_name"), User.name.label("user_name"))
        .outerjoin(Client, Client.id == Contact.company_id)
        .outerjoin(User, User.id == Contact.assigned_user_id)
        .where(Contact.id == contact_id)
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Contact introuvable")
    return _contact_to_response(row[0], row[1], row[2])


@router.post("", response_model=ContactResponse)
async def create_contact(
    body: CreateContactRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if body.company_id:
        company = (await db.execute(select(Client).where(Client.id == body.company_id))).scalar_one_or_none()
        if not company:
            raise HTTPException(status_code=404, detail="Entreprise introuvable")

    phone_e164 = normalize_phone(body.phone) if body.phone else None

    contact = Contact(
        name=body.name,
        first_name=body.first_name,
        last_name=body.last_name,
        role=body.role,
        phone=body.phone,
        phone_e164=phone_e164,
        email=body.email,
        company_id=body.company_id,
        assigned_user_id=user.id,
        is_primary=body.is_primary,
        source="manual",
    )
    db.add(contact)
    await db.flush()

    if phone_e164 and body.company_id:
        pi = PhoneIndex(
            phone_e164=phone_e164,
            client_id=body.company_id,
            contact_id=contact.id,
            source="crm_manual",
            raw_phone=body.phone,
            label="contact",
        )
        db.add(pi)

    audit_target = body.company_id or None
    db.add(ClientAuditLog(
        client_id=audit_target,
        contact_id=contact.id,
        user_id=user.id,
        user_name=user.name,
        action="contact_created",
        details=f"Contact créé : {body.name}" + (f" (rôle: {body.role})" if body.role else ""),
    ))

    await db.commit()
    await db.refresh(contact)

    company_name = None
    if contact.company_id:
        company_name = (await db.execute(select(Client.name).where(Client.id == contact.company_id))).scalar()

    return _contact_to_response(contact, company_name, user.name)


@router.put("/{contact_id}", response_model=ContactResponse)
async def update_contact(
    contact_id: str,
    body: UpdateContactRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Contact).where(Contact.id == contact_id))
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact introuvable")

    changes = body.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="Aucun champ à modifier")

    for field, new_val in changes.items():
        old_val = getattr(contact, field, None)
        old_str = str(old_val) if old_val is not None else None
        new_str = str(new_val) if new_val is not None else None
        if old_str == new_str:
            continue

        setattr(contact, field, new_val)
        db.add(ClientAuditLog(
            client_id=contact.company_id,
            contact_id=contact.id,
            user_id=user.id,
            user_name=user.name,
            action="contact_updated",
            field_name=field,
            old_value=old_str,
            new_value=new_str,
        ))

    if "phone" in changes and changes["phone"]:
        new_e164 = normalize_phone(changes["phone"])
        if new_e164 and new_e164 != contact.phone_e164:
            contact.phone_e164 = new_e164

    if "first_name" in changes or "last_name" in changes:
        parts = [p for p in [contact.first_name, contact.last_name] if p and p.strip()]
        if parts:
            contact.name = " ".join(parts)

    contact.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(contact)

    company_name = None
    user_name = None
    if contact.company_id:
        company_name = (await db.execute(select(Client.name).where(Client.id == contact.company_id))).scalar()
    if contact.assigned_user_id:
        user_name = (await db.execute(select(User.name).where(User.id == contact.assigned_user_id))).scalar()

    return _contact_to_response(contact, company_name, user_name)


@router.post("/{contact_id}/assign/{company_id}")
async def assign_contact(
    contact_id: str,
    company_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Rattache un contact orphelin à une entreprise."""
    contact = (await db.execute(select(Contact).where(Contact.id == contact_id))).scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact introuvable")

    company = (await db.execute(select(Client).where(Client.id == company_id))).scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Entreprise introuvable")

    old_company_id = contact.company_id
    contact.company_id = company_id
    contact.updated_at = datetime.now(timezone.utc)

    await db.execute(
        update(PhoneIndex)
        .where(PhoneIndex.contact_id == contact_id)
        .values(client_id=company_id)
    )
    await db.execute(
        update(Call)
        .where(Call.contact_id == contact_id)
        .values(client_id=company_id)
    )

    db.add(ClientAuditLog(
        client_id=company_id,
        contact_id=contact_id,
        user_id=user.id,
        user_name=user.name,
        action="contact_assigned",
        details=f"Contact \"{contact.name}\" rattaché à \"{company.name}\"",
    ))

    await db.commit()

    return {
        "status": "assigned",
        "contact_id": contact_id,
        "company_id": company_id,
        "old_company_id": old_company_id,
    }


@router.post("/{contact_id}/move/{company_id}")
async def move_contact(
    contact_id: str,
    company_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Déplace un contact (avec ses appels et numéros) vers une autre entreprise."""
    contact = (await db.execute(select(Contact).where(Contact.id == contact_id))).scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact introuvable")

    target = (await db.execute(select(Client).where(Client.id == company_id))).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Entreprise cible introuvable")

    old_company_id = contact.company_id
    if old_company_id == company_id:
        raise HTTPException(status_code=400, detail="Le contact est déjà dans cette entreprise")

    calls_updated = (await db.execute(
        update(Call)
        .where(Call.contact_id == contact_id)
        .values(client_id=company_id)
    )).rowcount

    phones_updated = (await db.execute(
        update(PhoneIndex)
        .where(PhoneIndex.contact_id == contact_id)
        .values(client_id=company_id)
    )).rowcount

    contact.company_id = company_id
    contact.updated_at = datetime.now(timezone.utc)

    old_company_name = None
    if old_company_id:
        old_company_name = (await db.execute(select(Client.name).where(Client.id == old_company_id))).scalar()

    db.add(ClientAuditLog(
        client_id=company_id,
        contact_id=contact_id,
        user_id=user.id,
        user_name=user.name,
        action="contact_moved",
        details=f"Contact \"{contact.name}\" déplacé de \"{old_company_name or 'orphelin'}\" → \"{target.name}\" ({calls_updated} appels, {phones_updated} numéros)",
    ))

    if old_company_id:
        db.add(ClientAuditLog(
            client_id=old_company_id,
            contact_id=contact_id,
            user_id=user.id,
            user_name=user.name,
            action="contact_moved_out",
            details=f"Contact \"{contact.name}\" déplacé vers \"{target.name}\"",
        ))

    await db.commit()

    return {
        "status": "moved",
        "contact_id": contact_id,
        "from_company_id": old_company_id,
        "to_company_id": company_id,
        "calls_moved": calls_updated,
        "phones_moved": phones_updated,
    }


@router.get("/{contact_id}/calls")
async def contact_calls(
    contact_id: str,
    limit: int = Query(default=30, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Historique des appels d'un contact."""
    from sqlalchemy.orm import selectinload
    from models.qualification import CallQualification

    contact = (await db.execute(select(Contact).where(Contact.id == contact_id))).scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact introuvable")

    stmt = (
        select(Call)
        .where(Call.contact_id == contact_id)
        .options(selectinload(Call.qualification), selectinload(Call.ai_analysis))
        .order_by(Call.start_time.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    calls = result.scalars().all()

    return [{
        "id": c.id,
        "direction": c.direction,
        "is_answered": c.is_answered,
        "start_time": c.start_time,
        "incall_duration": c.incall_duration or 0,
        "total_duration": c.total_duration or 0,
        "contact_number": c.contact_number,
        "user_name": c.user_name,
        "record_url": c.record_url,
        "qualification": {
            "mood": c.qualification.mood,
            "outcome": c.qualification.outcome,
        } if c.qualification else None,
        "ai_score": c.ai_analysis.overall_score if c.ai_analysis else None,
    } for c in calls]


@router.delete("/{contact_id}")
async def delete_contact(
    contact_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    contact = (await db.execute(select(Contact).where(Contact.id == contact_id))).scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact introuvable")

    if contact.is_primary:
        raise HTTPException(status_code=400, detail="Impossible de supprimer le contact principal. Désignez d'abord un autre contact comme principal.")

    db.add(ClientAuditLog(
        client_id=contact.company_id,
        contact_id=None,
        user_id=user.id,
        user_name=user.name,
        action="contact_deleted",
        details=f"Contact supprimé : {contact.name} ({contact.phone or 'sans tél'})",
    ))

    await db.execute(
        update(Call).where(Call.contact_id == contact_id).values(contact_id=None)
    )

    await db.delete(contact)
    await db.commit()
    return {"deleted": True}
