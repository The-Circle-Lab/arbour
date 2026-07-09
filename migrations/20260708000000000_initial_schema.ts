import type { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    -- Enable pgcrypto for gen_random_uuid()
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    -- Create enum types if missing
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chat_component') THEN
        CREATE TYPE chat_component AS ENUM (
          'object',
          'subject',
          'division_of_labor',
          'rules',
          'tools',
          'community'
        );
      END IF;
    END$$;

    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plant_state') THEN
        CREATE TYPE plant_state AS ENUM ('thriving', 'healthy', 'struggling', 'wilting');
      END IF;
    END$$;

    -- Teams table (includes project and plant fields expected by the app)
    CREATE TABLE IF NOT EXISTS teams (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      join_code CHAR(6) NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      project_title TEXT,
      deadline DATE,
      assignment_brief TEXT,
      plant_type TEXT,
      plant_votes JSONB NOT NULL DEFAULT '{}'::jsonb
    );

    -- Members
    CREATE TABLE IF NOT EXISTS members (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      display_name TEXT NOT NULL,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      pronouns TEXT
    );

    -- Individual reflections
    CREATE TABLE IF NOT EXISTS individual_reflections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      component chat_component NOT NULL,
      response_data JSONB NOT NULL,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(member_id, component)
    );

    -- Reveal AI per-team record
    CREATE TABLE IF NOT EXISTS reveal_ai (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE UNIQUE,
      per_component JSONB NOT NULL,
      flagged_components TEXT[] NOT NULL DEFAULT '{}',
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Agreements
    CREATE TABLE IF NOT EXISTS agreements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      component chat_component NOT NULL,
      resolution_note TEXT,
      draft_text TEXT,
      final_text TEXT,
      recorded_by UUID REFERENCES members(id),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(team_id, component)
    );

    -- Agreement approvals
    CREATE TABLE IF NOT EXISTS agreement_approvals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      component chat_component NOT NULL,
      member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(team_id, component, member_id)
    );

    -- Checkins
    CREATE TABLE IF NOT EXISTS checkins (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      cycle_number SMALLINT NOT NULL CHECK (cycle_number IN (1, 2)),
      component chat_component NOT NULL,
      response_data JSONB NOT NULL,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(member_id, cycle_number, component)
    );

    -- Plant states
    CREATE TABLE IF NOT EXISTS plant_states (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      cycle_number SMALLINT NOT NULL CHECK (cycle_number IN (1, 2)),
      computed_state plant_state NOT NULL,
      flagged_components TEXT[] NOT NULL DEFAULT '{}',
      ai_nudge_text TEXT,
      computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(team_id, cycle_number)
    );

    -- Resolutions
    CREATE TABLE IF NOT EXISTS resolutions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      component chat_component NOT NULL,
      cycle_number SMALLINT NOT NULL CHECK (cycle_number IN (1, 2)),
      resolution_note TEXT,
      resolved_by UUID REFERENCES members(id),
      resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(team_id, component, cycle_number)
    );
  `)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP TABLE IF EXISTS agreement_approvals CASCADE;
    DROP TABLE IF EXISTS agreements CASCADE;
    DROP TABLE IF EXISTS individual_reflections CASCADE;
    DROP TABLE IF EXISTS checkins CASCADE;
    DROP TABLE IF EXISTS reveal_ai CASCADE;
    DROP TABLE IF EXISTS plant_states CASCADE;
    DROP TABLE IF EXISTS resolutions CASCADE;

    DROP TABLE IF EXISTS members CASCADE;
    DROP TABLE IF EXISTS teams CASCADE;

    DROP TYPE IF EXISTS chat_component;
    DROP TYPE IF EXISTS plant_state;

    DROP EXTENSION IF EXISTS "pgcrypto";
  `)
}