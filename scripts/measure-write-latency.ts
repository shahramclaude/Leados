// Measures observed write-path latency (repository.create, full path:
// validate -> append event (hash chain + outbox, same transaction) ->
// synchronously drain outbox -> read back projection) against a seeded org.
// Prints p50/p95/p99 and writes nothing — this is a measurement tool, not a
// benchmark harness with warmup discarding, so the number is conservative
// (includes cold Postgres connection overhead on the first few calls).
//
// Usage: npx tsx scripts/measure-write-latency.ts --n=200

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import * as schema from "../src/db/schema";
import { skillRepository } from "../src/lib/platform/repositories";
import { SYSTEM_ACTOR, type OrgContext } from "../src/lib/platform/orgContext";

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of argv) {
    const m = /^--([^=]+)=(.*)$/.exec(arg);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const n = Number(args.n ?? "200");
  const slug = args.slug ?? "leados-perf";

  const existing = await db.select().from(schema.orgs).where(eq(schema.orgs.slug, slug)).limit(1);
  const orgId = existing[0]?.id ?? (await db.insert(schema.orgs).values({ id: randomUUID(), name: "LEADOS Perf", slug }).returning())[0].id;
  const ctx: OrgContext = { orgId, actor: SYSTEM_ACTOR };

  const latenciesMs: number[] = [];
  for (let i = 0; i < n; i++) {
    const id = randomUUID();
    const start = performance.now();
    const result = await skillRepository.create(ctx, {
      entity: { id, orgId, version: 0, validFrom: new Date().toISOString(), validTo: null, deletedAt: null, name: `perf-skill-${i}-${randomUUID()}`, category: "technical" },
      idempotencyKey: `perf:create:skill:${id}`,
    });
    const elapsed = performance.now() - start;
    if (!result.ok) throw new Error(`write failed: ${JSON.stringify(result.error)}`);
    latenciesMs.push(elapsed);
  }

  const sorted = [...latenciesMs].sort((a, b) => a - b);
  const p50 = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);
  const p99 = percentile(sorted, 99);
  const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;

  console.log(`write-path latency over n=${n} writes (org=${slug}):`);
  console.log(`  avg=${avg.toFixed(2)}ms p50=${p50.toFixed(2)}ms p95=${p95.toFixed(2)}ms p99=${p99.toFixed(2)}ms max=${sorted[sorted.length - 1].toFixed(2)}ms`);
  console.log(p95 <= 50 ? "GATE: write path p95 <= 50ms -> PASS" : "GATE: write path p95 <= 50ms -> FAIL");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
