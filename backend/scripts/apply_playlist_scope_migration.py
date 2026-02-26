"""
Migration: Add client_scope and sage_rep_filter columns to playlist_configs.
"""
import psycopg2

CONN = "host=localhost dbname=crm_db user=crm_user password=crm_password"

DDL = [
    """
    ALTER TABLE playlist_configs
    ADD COLUMN IF NOT EXISTS client_scope VARCHAR(20) DEFAULT 'own';
    """,
    """
    ALTER TABLE playlist_configs
    ADD COLUMN IF NOT EXISTS sage_rep_filter VARCHAR(70);
    """,
]


def main():
    conn = psycopg2.connect(CONN)
    conn.autocommit = True
    cur = conn.cursor()

    for stmt in DDL:
        try:
            cur.execute(stmt)
            print(f"OK: {stmt.strip()[:60]}...")
        except Exception as e:
            print(f"SKIP: {e}")

    cur.close()
    conn.close()
    print("Migration playlist_scope done.")


if __name__ == "__main__":
    main()
