import type { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE teams ADD COLUMN IF NOT EXISTS project_manager_votes JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE teams ADD COLUMN IF NOT EXISTS project_manager_id UUID REFERENCES members(id) ON DELETE SET NULL;
  `)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE teams DROP COLUMN IF EXISTS project_manager_id;
    ALTER TABLE teams DROP COLUMN IF EXISTS project_manager_votes;
  `)
}
