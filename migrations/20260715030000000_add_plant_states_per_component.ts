import type { MigrationBuilder } from 'node-pg-migrate'

// src/app/api/plant/[code]/[cycle]/route.ts reads and writes plant_states.per_component,
// but no prior migration ever added that column — every request to that route
// (cached or fresh) 500s with "column per_component does not exist" until this runs.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE plant_states
      ADD COLUMN IF NOT EXISTS per_component JSONB;
  `)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE plant_states
      DROP COLUMN IF EXISTS per_component;
  `)
}
