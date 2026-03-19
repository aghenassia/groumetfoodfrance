"""
Migration: Create client_objectives table.
"""
import psycopg2

CONN = "host=localhost dbname=crm_db user=crm_user password=crm_password"

DDL = [
    """
    CREATE TABLE IF NOT EXISTS client_objectives (
        id VARCHAR(36) PRIMARY KEY,
        client_id VARCHAR(36) NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        metric VARCHAR(30) NOT NULL,
        year INTEGER NOT NULL,
        annual_target NUMERIC(15,2) NOT NULL,
        monthly_targets JSONB NOT NULL,
        filter_product_family VARCHAR(100),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by VARCHAR(36) REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT uq_client_objective UNIQUE (client_id, metric, year, filter_product_family)
    );
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_client_objectives_client ON client_objectives(client_id);
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_client_objectives_year ON client_objectives(year);
    """,
]

if __name__ == "__main__":
    conn = psycopg2.connect(CONN)
    cur = conn.cursor()
    for stmt in DDL:
        cur.execute(stmt)
        print(f"OK: {stmt.strip()[:60]}...")
    conn.commit()
    cur.close()
    conn.close()
    print("Migration client_objectives terminée.")
