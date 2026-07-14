import type { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE users
      ADD COLUMN display_name TEXT,
      ADD COLUMN pronouns TEXT;

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

    ALTER TABLE users
      DROP COLUMN display_name,
      DROP COLUMN pronouns;
  `)
}
