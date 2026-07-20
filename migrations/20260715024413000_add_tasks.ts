import type { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status') THEN
        CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'done');
      END IF;
    END$$;

    CREATE TABLE IF NOT EXISTS tasks (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id      UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      title        TEXT NOT NULL,
      description  TEXT,
      status       task_status NOT NULL DEFAULT 'todo',
      deadline     TIMESTAMPTZ,
      assigned_to  UUID REFERENCES members(id) ON DELETE SET NULL,
      created_by   UUID REFERENCES members(id) ON DELETE SET NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Team-wide approval of the *current* state of the task list — same shape
    -- as agreement_approvals, but not component-scoped since there's one
    -- shared list per team.
    CREATE TABLE IF NOT EXISTS task_approvals (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      member_id   UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(team_id, member_id)
    );
  `)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP TABLE IF EXISTS task_approvals CASCADE;
    DROP TABLE IF EXISTS tasks CASCADE;
    DROP TYPE IF EXISTS task_status;
  `)
}
