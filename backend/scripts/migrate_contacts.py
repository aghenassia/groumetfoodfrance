"""
Migration script: Creates Contact records from existing Client data.

For each Client:
  - If contact_name is set → create a primary Contact (source=sage)
  - Else if phone_e164 is set → create a Contact with just the phone (source=ringover)
Then link PhoneIndex and Call rows to the new Contact.

Run from backend/: python -m scripts.migrate_contacts
"""
import asyncio
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from core.database import engine, Base, async_session
from models import Client, Contact, PhoneIndex, Call


async def migrate():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as db:
        clients = (await db.execute(select(Client))).scalars().all()
        created = 0

        for client in clients:
            existing = (await db.execute(
                select(Contact).where(Contact.company_id == client.id, Contact.is_primary == True)
            )).scalar_one_or_none()
            if existing:
                continue

            contact_name = client.contact_name or ""
            if contact_name.strip() or client.phone_e164:
                name = contact_name.strip() if contact_name.strip() else (client.phone_e164 or client.name)
                source = "sage" if contact_name.strip() else "ringover"
                contact = Contact(
                    id=str(uuid.uuid4()),
                    company_id=client.id,
                    assigned_user_id=client.assigned_user_id,
                    name=name,
                    phone=client.phone,
                    phone_e164=client.phone_e164,
                    email=client.email,
                    is_primary=True,
                    source=source,
                )
                db.add(contact)
                await db.flush()

                await db.execute(
                    update(PhoneIndex)
                    .where(PhoneIndex.client_id == client.id, PhoneIndex.contact_id == None)
                    .values(contact_id=contact.id)
                )

                await db.execute(
                    update(Call)
                    .where(Call.client_id == client.id, Call.contact_id == None)
                    .values(contact_id=contact.id)
                )

                created += 1

        await db.commit()
        print(f"Migration terminée : {created} contacts créés sur {len(clients)} clients.")


if __name__ == "__main__":
    asyncio.run(migrate())
