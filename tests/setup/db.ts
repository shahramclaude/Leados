// Ephemeral-database fixture for integration tests.
//
// Tests run against the same local Postgres instance the app uses in this
// sandbox (DATABASE_URL in .env, schema applied via `npx drizzle-kit push`).
// Rather than wrap each test in a transaction (Next.js route handlers each
// grab their own connection from the pool, which defeats a single
// transaction-per-test wrapper without a lot of ceremony), each integration
// test file truncates the tables it touches in `beforeEach`, giving every
// test a clean, deterministic slate. In CI (.github/workflows/ci.yml) this
// same contract is satisfied by a dockerized `postgres:16` service that is
// migrated fresh for the run — see docs/TESTING.md "Database fixture".
import {
  truncateEvents,
} from "@/lib/platform/db/eventsRepository";
import { truncateFindings } from "@/lib/platform/db/findingsRepository";
import { truncateDecisions } from "@/lib/platform/db/decisionsRepository";
import { truncateRuns } from "@/lib/platform/db/runsRepository";
import { truncateBoardPacks } from "@/lib/platform/db/boardPacksRepository";

export async function resetDatabase(): Promise<void> {
  // Order matters only if FKs are added later; today these are independent.
  await Promise.all([
    truncateEvents(),
    truncateFindings(),
    truncateDecisions(),
    truncateRuns(),
    truncateBoardPacks(),
  ]);
}
