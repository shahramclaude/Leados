-- LEADOS Part 01 — append-only enforcement for the event log.
--
-- Migration kind: EXPAND-ONLY. This migration adds a function and two
-- triggers; it does not alter, rename, or drop any column, table, or row.
-- It is safe to run on top of a live `events` table — it only restricts
-- future UPDATE/DELETE, which the application never performs anyway
-- (src/lib/eventStore.ts and src/lib/platform/eventRepository.ts only INSERT).
--
-- ROLLBACK (documented, not automated — see AI-SESSION-LOG.md Part 01):
--   DROP TRIGGER IF EXISTS events_no_update ON events;
--   DROP TRIGGER IF EXISTS events_no_delete ON events;
--   DROP FUNCTION IF EXISTS prevent_event_mutation();
--   DROP INDEX IF EXISTS idx_events_idempotency_key_partial;
-- Rolling back removes the DB-level guarantee but is non-destructive to data:
-- no rows are touched by either applying or rolling back this script.
--
-- Why a trigger instead of relying only on the repository guard:
-- The repository guard (src/lib/platform/eventRepository.ts) throws if any
-- code path attempts update/delete, but a trigger is the only guarantee that
-- also covers: future scripts, ad-hoc `psql` access, a bug in a future
-- refactor, or a different service connecting to the same database. Defense
-- in depth: application guard for a fast, friendly error in-process; trigger
-- as the non-negotiable backstop.

create or replace function prevent_event_mutation() returns trigger as $$
begin
  raise exception 'events table is append-only: % is not permitted (event_id=%)',
    tg_op,
    coalesce(old.event_id, 'unknown');
end;
$$ language plpgsql;

drop trigger if exists events_no_update on events;
create trigger events_no_update
  before update on events
  for each row execute function prevent_event_mutation();

drop trigger if exists events_no_delete on events;
create trigger events_no_delete
  before delete on events
  for each row execute function prevent_event_mutation();

-- Belt-and-braces partial unique index for idempotency_key. Drizzle's
-- `.where()` partial index (defined in src/db/schema.ts) already creates
-- this; the statement below is idempotent (IF NOT EXISTS) so re-running this
-- script after `drizzle-kit push` is always safe.
create unique index if not exists idx_events_idempotency_key_partial
  on events (idempotency_key)
  where idempotency_key is not null;
