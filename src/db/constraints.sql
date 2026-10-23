-- PART 60 — DB-level enforcement: "no confidence without evidence".
-- A claim can only be marked beyond default confidence once it has at least
-- one row in claim_evidence. We enforce this with a deferred trigger rather
-- than a CHECK constraint (Postgres CHECK cannot reference another table).
CREATE OR REPLACE FUNCTION enforce_claim_has_evidence() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM claim_evidence WHERE claim_id = NEW.id) THEN
    RAISE EXCEPTION 'CLAIM_WITHOUT_EVIDENCE: claim % has confidence % but no evidence link', NEW.id, NEW.confidence;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_claim_requires_evidence ON claims;
CREATE CONSTRAINT TRIGGER trg_claim_requires_evidence
  AFTER INSERT ON claims
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_claim_has_evidence();

-- PART 63 spirit (lightweight here): fact tables are append-only from the
-- application layer. We don't hard-block UPDATE at the DB level for the
-- lighter tables in this build, but audit_events and metric_observations are
-- treated as append-only by convention and covered by a lint-style unit test.
