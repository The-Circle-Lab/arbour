import type { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE users
      ADD COLUMN display_name TEXT,
      ADD COLUMN pronouns TEXT;

    -- Carry each user's earliest membership name/pronouns forward before the
    -- per-team columns disappear, instead of silently dropping that data.
    UPDATE users u
    SET display_name = m.display_name, pronouns = m.pronouns
    FROM (
      SELECT DISTINCT ON (user_id) user_id, display_name, pronouns
      FROM members
      ORDER BY user_id, joined_at ASC
    ) m
    WHERE m.user_id = u.id;

    ALTER TABLE members
      DROP COLUMN display_name,
      DROP COLUMN pronouns;
  `)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE members
      ADD COLUMN display_name TEXT,
      ADD COLUMN pronouns TEXT;

    UPDATE members m
    SET display_name = u.display_name, pronouns = u.pronouns
    FROM users u
    WHERE u.id = m.user_id;

    ALTER TABLE users
      DROP COLUMN display_name,
      DROP COLUMN pronouns;
  `)
}
