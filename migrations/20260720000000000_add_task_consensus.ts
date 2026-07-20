import type { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE task_submissions ADD COLUMN summary TEXT;

    -- Task-submitted review: single-round vote, decline is an immediate veto.
    CREATE TABLE task_submission_votes (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      submission_id UUID NOT NULL REFERENCES task_submissions(id) ON DELETE CASCADE,
      member_id     UUID REFERENCES members(id) ON DELETE SET NULL,
      vote          TEXT NOT NULL CHECK (vote IN ('approve','decline')),
      reason        TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT task_submission_votes_reason_required
        CHECK (vote = 'approve' OR (reason IS NOT NULL AND length(trim(reason)) > 0))
    );
    CREATE UNIQUE INDEX task_submission_votes_uq
      ON task_submission_votes (submission_id, member_id) WHERE member_id IS NOT NULL;

    CREATE TABLE task_submission_comments (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      submission_id UUID NOT NULL REFERENCES task_submissions(id) ON DELETE CASCADE,
      member_id     UUID REFERENCES members(id) ON DELETE SET NULL,
      comment       TEXT NOT NULL CHECK (length(trim(comment)) > 0),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX idx_task_submission_comments_submission_id ON task_submission_comments(submission_id);

    -- Deadline missed: two-phase consensus.
    CREATE TABLE task_deadline_events (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id           UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      deadline          TIMESTAMPTZ NOT NULL,
      detected_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      phase             TEXT NOT NULL DEFAULT 'voting' CHECK (phase IN ('voting','proposing')),
      round             INT NOT NULL DEFAULT 1,
      resolved_at       TIMESTAMPTZ,
      resolution        TEXT CHECK (resolution IN ('extended','reassigned','dismissed','custom')),
      resolution_detail JSONB,
      resolved_by       UUID REFERENCES members(id) ON DELETE SET NULL,
      suggestions       JSONB NOT NULL DEFAULT '[]'::jsonb,
      CONSTRAINT task_deadline_events_resolution_consistency CHECK (
        (resolved_at IS NULL AND resolution IS NULL) OR
        (resolved_at IS NOT NULL AND resolution IS NOT NULL)
      )
    );
    CREATE INDEX idx_task_deadline_events_task_id_detected_at ON task_deadline_events(task_id, detected_at DESC);

    -- Round 1 free vote. One row per member per event; upsertable while phase='voting'.
    CREATE TABLE task_deadline_votes (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id       UUID NOT NULL REFERENCES task_deadline_events(id) ON DELETE CASCADE,
      member_id      UUID REFERENCES members(id) ON DELETE SET NULL,
      choice_key     TEXT NOT NULL,
      choice_payload JSONB NOT NULL,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX task_deadline_votes_uq
      ON task_deadline_votes (event_id, member_id) WHERE member_id IS NOT NULL;

    -- Round 2+: whoever acts first proposes one of round 1's distinct choices;
    -- everyone else agrees/disagrees. A disagree kills the proposal and bumps the round.
    CREATE TABLE task_deadline_proposals (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id       UUID NOT NULL REFERENCES task_deadline_events(id) ON DELETE CASCADE,
      round          INT NOT NULL,
      proposed_by    UUID REFERENCES members(id) ON DELETE SET NULL,
      choice_key     TEXT NOT NULL,
      choice_payload JSONB NOT NULL,
      status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX idx_task_deadline_proposals_event_id ON task_deadline_proposals(event_id, round DESC);

    CREATE TABLE task_deadline_proposal_responses (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      proposal_id  UUID NOT NULL REFERENCES task_deadline_proposals(id) ON DELETE CASCADE,
      member_id    UUID REFERENCES members(id) ON DELETE SET NULL,
      response     TEXT NOT NULL CHECK (response IN ('agree','disagree')),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX task_deadline_proposal_responses_uq
      ON task_deadline_proposal_responses (proposal_id, member_id) WHERE member_id IS NOT NULL;
  `)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP TABLE IF EXISTS task_deadline_proposal_responses CASCADE;
    DROP TABLE IF EXISTS task_deadline_proposals CASCADE;
    DROP TABLE IF EXISTS task_deadline_votes CASCADE;
    DROP TABLE IF EXISTS task_deadline_events CASCADE;
    DROP TABLE IF EXISTS task_submission_comments CASCADE;
    DROP TABLE IF EXISTS task_submission_votes CASCADE;
    ALTER TABLE task_submissions DROP COLUMN IF EXISTS summary;
  `)
}
