import type { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    -- Add optional pronouns to members
    ALTER TABLE members
      ADD COLUMN IF NOT EXISTS pronouns TEXT;

    -- Add project fields and plant info to teams
    ALTER TABLE teams
      ADD COLUMN IF NOT EXISTS project_title TEXT,
      ADD COLUMN IF NOT EXISTS deadline DATE,
      ADD COLUMN IF NOT EXISTS assignment_brief TEXT,
      ADD COLUMN IF NOT EXISTS plant_type TEXT,
      ADD COLUMN IF NOT EXISTS plant_votes JSONB;

    -- Ensure plant_votes has a sensible default JSON object
    ALTER TABLE teams
      ALTER COLUMN plant_votes SET DEFAULT '{}'::jsonb;
  `)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE teams
      DROP COLUMN IF EXISTS plant_votes,
      DROP COLUMN IF EXISTS plant_type,
      DROP COLUMN IF EXISTS assignment_brief,
      DROP COLUMN IF EXISTS deadline,
      DROP COLUMN IF EXISTS project_title;

    ALTER TABLE members
      DROP COLUMN IF EXISTS pronouns;
  `)
}