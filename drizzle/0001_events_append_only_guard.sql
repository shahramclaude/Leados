-- 0001_events_append_only_guard.sql
--
-- Enforces that `events` is append-only at the database level, not just by
-- convention in the repository layer (defense in depth — see
-- src/lib/events/eventStore.ts and docs/DATA.md §2).
--
-- Rules enforced:
--   1. DELETE is never allowed, for any row, under any circumstance.
--   2. UPDATE is rejected UNLESS it is the one documented, narrow
--      "redaction" shape used by retention/GDPR erasure
--      (src/lib/people/erasure.ts, src/lib/retention.ts):
--        - every column is identical to the old row EXCEPT `data` and
--          `redacted`
--        - redacted may only transition false -> true (never back)
--      This lets us remove PII from a payload after the fact without
--      allowing arbitrary rewrites of history, and it is the ONLY mutation
--      path the schema permits on this table.
--
-- Rationale for a DB trigger (not just an app-level guard): the repository
-- layer already refuses to expose any update/delete helpers for `events`,
-- but a trigger means even a future bug, a raw SQL migration, or a
-- different service connecting to the same database cannot silently
-- corrupt the event log. Defense in depth for the single source of truth.

CREATE OR REPLACE FUNCTION events_forbid_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'events is append-only: DELETE is not permitted (attempted on id=%)', OLD.id;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION events_guard_update() RETURNS trigger AS $$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id
     OR OLD.seq IS DISTINCT FROM NEW.seq
     OR OLD.type IS DISTINCT FROM NEW.type
     OR OLD.domain IS DISTINCT FROM NEW.domain
     OR OLD.entity_id IS DISTINCT FROM NEW.entity_id
     OR OLD.ts IS DISTINCT FROM NEW.ts
     OR OLD.recorded_at IS DISTINCT FROM NEW.recorded_at
     OR OLD.source IS DISTINCT FROM NEW.source
     OR OLD.schema_version IS DISTINCT FROM NEW.schema_version
     OR OLD.correlation_id IS DISTINCT FROM NEW.correlation_id
     OR OLD.causation_id IS DISTINCT FROM NEW.causation_id
     OR OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key
     OR OLD.created_at IS DISTINCT FROM NEW.created_at
  THEN
    RAISE EXCEPTION 'events is append-only: only the retention-redaction path may UPDATE a row (id=%). Only "data" and "redacted" may change.', OLD.id;
  END IF;

  IF OLD.redacted = true THEN
    RAISE EXCEPTION 'events is append-only: event id=% was already redacted and cannot be modified again', OLD.id;
  END IF;

  IF NEW.redacted IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'events is append-only: UPDATE must set redacted = true (id=%)', OLD.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

DROP TRIGGER IF EXISTS events_forbid_delete_trigger ON "events";
--> statement-breakpoint
CREATE TRIGGER events_forbid_delete_trigger
  BEFORE DELETE ON "events"
  FOR EACH ROW EXECUTE FUNCTION events_forbid_delete();
--> statement-breakpoint

DROP TRIGGER IF EXISTS events_guard_update_trigger ON "events";
--> statement-breakpoint
CREATE TRIGGER events_guard_update_trigger
  BEFORE UPDATE ON "events"
  FOR EACH ROW EXECUTE FUNCTION events_guard_update();
--> statement-breakpoint

INSERT INTO "schema_version" ("version", "description") VALUES (2, 'events_append_only_guard: DB triggers enforce append-only + narrow redaction path');
