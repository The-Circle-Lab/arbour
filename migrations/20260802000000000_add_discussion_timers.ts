import type { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE discussion_timers (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id      UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      step         TEXT NOT NULL CHECK (step IN ('AGREEING', 'CHECKIN_AGREE')),
      cycle_number SMALLINT CHECK (cycle_number IS NULL OR cycle_number IN (1, 2)),
      started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at   TIMESTAMPTZ NOT NULL,
      resolved_at  TIMESTAMPTZ,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Only one active (unresolved) timer per team+step+cycle. NULLS NOT
    -- DISTINCT so this also holds when cycle_number IS NULL (the AGREEING
    -- step) — Postgres treats NULLs as distinct from each other by default,
    -- which would otherwise allow two "active" AGREEING rows per team.
    CREATE UNIQUE INDEX discussion_timers_active_uq
      ON discussion_timers (team_id, step, cycle_number)
      NULLS NOT DISTINCT
      WHERE resolved_at IS NULL;

    CREATE INDEX idx_discussion_timers_team_id ON discussion_timers(team_id);

    CREATE TABLE discussion_timer_extensions (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      timer_id      UUID NOT NULL REFERENCES discussion_timers(id) ON DELETE CASCADE,
      extended_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      minutes_added INT NOT NULL DEFAULT 5
    );
    CREATE INDEX idx_discussion_timer_extensions_timer_id ON discussion_timer_extensions(timer_id);
  `)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP TABLE IF EXISTS discussion_timer_extensions CASCADE;
    DROP TABLE IF EXISTS discussion_timers CASCADE;
  `)
}
