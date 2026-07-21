import type { MigrationBuilder } from 'node-pg-migrate'

// The `plant_state` enum (from the initial schema) was created with
// ('thriving','healthy','struggling','wilting'), but the application's plant
// logic (src/lib/plant-logic.ts, src/components/PlantVisual.tsx, and the
// unified plant health ledger) has always used
// ('thriving','doing_okay','wilting','dead') instead — meaning any check-in
// that flagged a CHAT component (i.e. produced 'doing_okay' or 'dead')
// threw a Postgres enum error when plant_states.computed_state was written.
// Switching to TEXT + CHECK matches how the same kind of state/enum column is
// already handled elsewhere in this schema (plant_health_events.state,
// task_deadline_events.resolution).
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE plant_states ALTER COLUMN computed_state TYPE TEXT;
    ALTER TABLE plant_states ADD CONSTRAINT plant_states_computed_state_check
      CHECK (computed_state IN ('thriving','doing_okay','wilting','dead'));
    DROP TYPE IF EXISTS plant_state;
  `)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TYPE plant_state AS ENUM ('thriving', 'healthy', 'struggling', 'wilting');
    ALTER TABLE plant_states DROP CONSTRAINT IF EXISTS plant_states_computed_state_check;
    ALTER TABLE plant_states ALTER COLUMN computed_state TYPE plant_state USING computed_state::plant_state;
  `)
}
