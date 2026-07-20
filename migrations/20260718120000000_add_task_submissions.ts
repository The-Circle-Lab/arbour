import type { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.noTransaction()

  pgm.sql(`ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'submitted';`)

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS task_submissions (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id      UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      submitted_by UUID REFERENCES members(id) ON DELETE SET NULL,
      content      TEXT NOT NULL,
      url          TEXT,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_task_submissions_task_id ON task_submissions(task_id);
  `)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Removing an enum value requires rebuilding the type and rewriting every
  // column that uses it, so 'submitted' is left in place — ADD VALUE IF NOT
  // EXISTS in up() keeps re-running this migration safe regardless.
  pgm.sql(`
    UPDATE tasks SET status = 'in_progress' WHERE status = 'submitted';
    DROP TABLE IF EXISTS task_submissions CASCADE;
  `)
}
