-- src/db/leader-state-rls.sql
--
-- Defense-in-depth row-level security for the `leader_state` schema.
-- Applied by hand (via `psql -f`) rather than through drizzle-kit, because
-- drizzle-kit's schema diffing does not manage RLS policies.
--
-- HONESTY CAVEAT: the app connects to Postgres as the `postgres` superuser
-- in this sandbox (see .env). PostgreSQL superusers and table owners always
-- bypass row-level security, FORCE ROW LEVEL SECURITY notwithstanding, for
-- the table owner's own connection unless FORCE is set — and even FORCE
-- does not stop a session with the superuser attribute, which always
-- bypasses RLS. That means in THIS environment these policies are inert for
-- the connection the app actually uses; they are included so that (a) the
-- posture is correct and ready for a production deployment that connects as
-- a dedicated non-superuser `app_runtime` role, and (b) the SQL is reviewable
-- now rather than invented later. The guarantee this part actually tests and
-- relies on today is the repository-layer check in
-- src/lib/leaderState/repository.ts.
--
-- To make this policy load-bearing in production:
--   1. Create a non-superuser, non-owner role, e.g. `app_runtime`.
--   2. Grant it USAGE on schema leader_state and SELECT/INSERT/UPDATE on
--      these tables (but NOT table ownership).
--   3. Have the app set `SET LOCAL app.current_user_id = '<id>'` at the start
--      of every transaction that touches these tables, to exactly the id
--      the repository layer already verified as the owner.
--   4. Point DATABASE_URL at `app_runtime` instead of `postgres`.

ALTER TABLE leader_state.decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE leader_state.decisions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leader_state_decisions_self_only ON leader_state.decisions;
CREATE POLICY leader_state_decisions_self_only ON leader_state.decisions
  USING (owner_user_id = current_setting('app.current_user_id', true))
  WITH CHECK (owner_user_id = current_setting('app.current_user_id', true));

ALTER TABLE leader_state.recovery_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE leader_state.recovery_signals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leader_state_recovery_self_only ON leader_state.recovery_signals;
CREATE POLICY leader_state_recovery_self_only ON leader_state.recovery_signals
  USING (owner_user_id = current_setting('app.current_user_id', true))
  WITH CHECK (owner_user_id = current_setting('app.current_user_id', true));

ALTER TABLE leader_state.grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE leader_state.grants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leader_state_grants_self_only ON leader_state.grants;
CREATE POLICY leader_state_grants_self_only ON leader_state.grants
  USING (owner_user_id = current_setting('app.current_user_id', true))
  WITH CHECK (owner_user_id = current_setting('app.current_user_id', true));

-- research_contributions intentionally has NO row-level restriction here:
-- its read path (readResearchAggregate) is meant to combine rows across
-- owners, gated instead by the k-anonymity check in application code
-- (src/lib/leaderState/research.ts). Per-owner write/list still goes
-- through the self-scope check in that same file.

CREATE INDEX IF NOT EXISTS leader_state_decisions_owner_idx ON leader_state.decisions (owner_user_id, decided_at DESC);
CREATE INDEX IF NOT EXISTS leader_state_recovery_owner_idx ON leader_state.recovery_signals (owner_user_id, date);
CREATE INDEX IF NOT EXISTS leader_state_grants_owner_idx ON leader_state.grants (owner_user_id, scope, expires_at);
CREATE INDEX IF NOT EXISTS leader_state_research_cohort_idx ON leader_state.research_contributions (cohort_key, metric_type);
