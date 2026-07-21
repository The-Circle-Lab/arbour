import type { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    -- Unified plant health ledger: an append-only log of level changes.
    -- "Current" level for a team is always just its latest row here — deadline
    -- misses/recoveries and check-in results all write into the same ledger
    -- instead of three disconnected signals.
    CREATE TABLE plant_health_events (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id      UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      level        INT NOT NULL CHECK (level BETWEEN 0 AND 3),
      delta        INT NOT NULL,
      source       TEXT NOT NULL CHECK (source IN ('deadline_missed','task_recovered','checkin')),
      task_id      UUID REFERENCES tasks(id) ON DELETE SET NULL,
      cycle_number INT,
      detail       JSONB NOT NULL DEFAULT '{}'::jsonb
    );
    CREATE INDEX idx_plant_health_events_team_id_occurred_at ON plant_health_events(team_id, occurred_at);

    CREATE TABLE final_reports (
      team_id      UUID PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
      summary      TEXT NOT NULL,
      highlights   JSONB NOT NULL DEFAULT '[]'::jsonb,
      growth_areas JSONB NOT NULL DEFAULT '[]'::jsonb,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP TABLE IF EXISTS final_reports CASCADE;
    DROP TABLE IF EXISTS plant_health_events CASCADE;
  `)
}
