"""
Migration script: create contacts table + add contact_id columns to existing tables.
Uses synchronous psycopg2 for direct DDL execution.
"""
import psycopg2

DB_DSN = "host=localhost port=5432 dbname=crm_db user=crm_user password=crm_password"

STATEMENTS = [
    # 1. Create contacts table
    """
    CREATE TABLE IF NOT EXISTS contacts (
        id VARCHAR(36) PRIMARY KEY,
        company_id VARCHAR(36) REFERENCES clients(id) ON DELETE SET NULL,
        assigned_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
        name VARCHAR(100) NOT NULL,
        first_name VARCHAR(50),
        last_name VARCHAR(50),
        role VARCHAR(50),
        phone VARCHAR(30),
        phone_e164 VARCHAR(20),
        email VARCHAR(255),
        is_primary BOOLEAN DEFAULT FALSE,
        source VARCHAR(20) NOT NULL DEFAULT 'manual',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    )
    """,

    # 2. Indexes on contacts
    "CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company_id)",
    "CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(assigned_user_id)",
    "CREATE INDEX IF NOT EXISTS idx_contacts_phone_e164 ON contacts(phone_e164)",
    "CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name)",

    # 3. Add contact_id to calls (if not exists)
    """
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='calls' AND column_name='contact_id'
        ) THEN
            ALTER TABLE calls ADD COLUMN contact_id VARCHAR(36) REFERENCES contacts(id) ON DELETE SET NULL;
            CREATE INDEX idx_calls_contact ON calls(contact_id);
        END IF;
    END $$
    """,

    # 4. Add contact_id to phone_index (if not exists)
    """
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='phone_index' AND column_name='contact_id'
        ) THEN
            ALTER TABLE phone_index ADD COLUMN contact_id VARCHAR(36) REFERENCES contacts(id) ON DELETE SET NULL;
            CREATE INDEX idx_phone_contact ON phone_index(contact_id);
        END IF;
    END $$
    """,

    # 5. Add contact_id to client_audit_logs (if not exists)
    """
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='client_audit_logs' AND column_name='contact_id'
        ) THEN
            ALTER TABLE client_audit_logs ADD COLUMN contact_id VARCHAR(36) REFERENCES contacts(id) ON DELETE CASCADE;
        END IF;
    END $$
    """,

    # 6. Make client_audit_logs.client_id nullable (was NOT NULL before)
    """
    DO $$
    BEGIN
        ALTER TABLE client_audit_logs ALTER COLUMN client_id DROP NOT NULL;
    EXCEPTION WHEN others THEN
        NULL;
    END $$
    """,
]


def main():
    conn = psycopg2.connect(DB_DSN)
    conn.autocommit = True
    cur = conn.cursor()

    for i, stmt in enumerate(STATEMENTS, 1):
        try:
            cur.execute(stmt)
            print(f"[OK] Statement {i} executed successfully")
        except Exception as e:
            print(f"[WARN] Statement {i}: {e}")

    # Verify
    cur.execute("SELECT COUNT(*) FROM information_schema.tables WHERE table_name='contacts'")
    print(f"\ncontacts table exists: {cur.fetchone()[0] > 0}")

    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='calls' AND column_name='contact_id'")
    print(f"calls.contact_id exists: {cur.fetchone() is not None}")

    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='phone_index' AND column_name='contact_id'")
    print(f"phone_index.contact_id exists: {cur.fetchone() is not None}")

    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='client_audit_logs' AND column_name='contact_id'")
    print(f"client_audit_logs.contact_id exists: {cur.fetchone() is not None}")

    cur.close()
    conn.close()
    print("\nMigration complete!")


if __name__ == "__main__":
    main()
