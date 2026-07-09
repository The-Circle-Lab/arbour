import type { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS users (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE members
      ADD COLUMN user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ADD CONSTRAINT members_user_team_unique UNIQUE (user_id, team_id);
  `)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE members
      DROP CONSTRAINT IF EXISTS members_user_team_unique;

    ALTER TABLE members
      DROP COLUMN IF EXISTS user_id;

    DROP TABLE IF EXISTS users;
  `)
}
