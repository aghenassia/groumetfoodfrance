"""
Migration: Create margin_rules, user_objectives, challenges, challenge_rankings tables.
Add margin_group column to clients.
Migrate existing target_ca_monthly to user_objectives.
Seed initial margin rules.
"""
import psycopg2

CONN = "host=localhost dbname=crm_db user=crm_user password=crm_password"

DDL = [
    # margin_group on clients
    """
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS margin_group VARCHAR(50);
    """,

    # margin_rules
    """
    CREATE TABLE IF NOT EXISTS margin_rules (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        calc_type VARCHAR(20) NOT NULL,
        value NUMERIC(10,4) NOT NULL,
        applies_to VARCHAR(200) NOT NULL DEFAULT 'all',
        effective_from DATE NOT NULL,
        effective_to DATE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    """,

    # user_objectives
    """
    CREATE TABLE IF NOT EXISTS user_objectives (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL REFERENCES users(id),
        metric VARCHAR(30) NOT NULL,
        period_type VARCHAR(15) NOT NULL DEFAULT 'monthly',
        target_value NUMERIC(15,2) NOT NULL,
        start_date DATE,
        end_date DATE,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    """,

    # challenges
    """
    CREATE TABLE IF NOT EXISTS challenges (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        description TEXT,
        article_ref VARCHAR(18),
        article_name VARCHAR(100),
        metric VARCHAR(30) NOT NULL,
        target_value NUMERIC(15,2),
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        status VARCHAR(15) NOT NULL DEFAULT 'draft',
        created_by VARCHAR(36) NOT NULL REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    """,

    # challenge_rankings
    """
    CREATE TABLE IF NOT EXISTS challenge_rankings (
        id VARCHAR(36) PRIMARY KEY,
        challenge_id VARCHAR(36) NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
        user_id VARCHAR(36) NOT NULL REFERENCES users(id),
        current_value NUMERIC(15,2) NOT NULL DEFAULT 0,
        rank INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    """,
]

SEED_RULES = """
INSERT INTO margin_rules (id, name, description, calc_type, value, applies_to, effective_from, created_at, updated_at)
VALUES
    (gen_random_uuid()::text, 'Forfait logistique', 'Coûts transport et livraison', 'per_kg', 1.0000, 'all', '2020-01-01', NOW(), NOW()),
    (gen_random_uuid()::text, 'Forfait structure', 'Coûts de stockage et infrastructure', 'per_kg', 1.0000, 'all', '2020-01-01', NOW(), NOW()),
    (gen_random_uuid()::text, 'Étiquetage Metro', 'Opération étiquetage spécifique Metro', 'per_kg', 0.1500, 'group:metro', '2020-01-01', NOW(), NOW()),
    (gen_random_uuid()::text, 'RFA CSF + Promocash', 'Remise de fin d''année', 'percent_ca', 2.0000, 'group:csf,group:promocash', '2020-01-01', NOW(), NOW())
ON CONFLICT DO NOTHING;
"""

MIGRATE_OBJECTIVES = """
INSERT INTO user_objectives (id, user_id, metric, period_type, target_value, is_active, created_at, updated_at)
SELECT gen_random_uuid()::text, id, 'ca', 'monthly', target_ca_monthly, TRUE, NOW(), NOW()
FROM users
WHERE target_ca_monthly IS NOT NULL AND target_ca_monthly > 0
AND NOT EXISTS (
    SELECT 1 FROM user_objectives uo WHERE uo.user_id = users.id AND uo.metric = 'ca' AND uo.period_type = 'monthly'
);
"""

def main():
    conn = psycopg2.connect(CONN)
    conn.autocommit = True
    cur = conn.cursor()

    for ddl in DDL:
        print(f"Executing: {ddl.strip()[:60]}...")
        cur.execute(ddl)

    print("Seeding initial margin rules...")
    cur.execute(SEED_RULES)

    print("Migrating target_ca_monthly → user_objectives...")
    cur.execute(MIGRATE_OBJECTIVES)

    cur.close()
    conn.close()
    print("Migration complete!")


if __name__ == "__main__":
    main()
