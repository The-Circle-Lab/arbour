import type { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE teams ADD COLUMN IF NOT EXISTS grade TEXT;

    -- Records the grade value the cached summary was written from, so a grade
    -- typed into the DB after the report was first viewed invalidates the summary
    -- instead of leaving text that never mentions the result.
    ALTER TABLE final_reports ADD COLUMN IF NOT EXISTS graded_on TEXT;
  `)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE final_reports DROP COLUMN IF EXISTS graded_on;
    ALTER TABLE teams DROP COLUMN IF EXISTS grade;
  `)
}
