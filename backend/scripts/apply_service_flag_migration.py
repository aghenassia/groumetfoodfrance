"""
Migration: add is_service column to products and tag service articles.
"""
import psycopg2

DB_DSN = "host=localhost port=5432 dbname=crm_db user=crm_user password=crm_password"

SERVICE_REFS = (
    "TRANSPORT", "ARTDIVERS", "ARTDIVERS20", "ARTDIVERS5",
    "ZACOMPTE", "ZAVOIR", "ZESCOMPTE",
    "ZPORTSOUMIS", "ZPORTNONSOUMIS", "ZREMISE",
)

STATEMENTS = [
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS is_service BOOLEAN DEFAULT FALSE",
    f"""
    UPDATE products SET is_service = TRUE
    WHERE article_ref IN ({','.join(f"'{r}'" for r in SERVICE_REFS)})
    """,
]


def main():
    conn = psycopg2.connect(DB_DSN)
    conn.autocommit = True
    cur = conn.cursor()

    for sql in STATEMENTS:
        try:
            cur.execute(sql)
            print(f"OK: {sql.strip()[:80]}...")
        except Exception as e:
            print(f"SKIP: {e}")

    cur.execute("SELECT article_ref, designation FROM products WHERE is_service = TRUE")
    rows = cur.fetchall()
    print(f"\n{len(rows)} articles marqués comme service:")
    for r in rows:
        print(f"  {r[0]:25s} {r[1]}")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
