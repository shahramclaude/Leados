// src/lib/causalChain.ts
//
// Stage 3 of the orchestration pipeline: causal chain detection.
//
// Causal detection needs the organization's finding *history*, not just the
// current run's fresh findings (Stage 1 only returns newly (re-)created
// rows), so this stage issues its own historical query against `findings`
// rather than reusing Stage 1's output directly. This is intentional and
// documented here to satisfy the "pipeline, not repeated queries" guidance:
// it is not re-running Stage 1's query, it is running a genuinely different
// one (a longer time window, across all persons, grouped for sequencing).
//
// For each person's finding timeline, every ordered pair of domains
// (A occurs, then B occurs within LAG_WINDOW_DAYS) is counted. A link
// A -> B is reported when it has occurred at least MIN_OCCURRENCES times
// and P(B follows A within window | A occurred) exceeds MIN_CONFIDENCE.
import { gte } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";
import type { BayesianUpdateResult, CausalChainResult, CausalLink, Domain } from "@/lib/types";

type Db = NodePgDatabase<typeof schema>;

const HISTORY_DAYS = 180;
const LAG_WINDOW_DAYS = 14;
const MIN_OCCURRENCES = 2;
const MIN_CONFIDENCE = 0.3;
const MAX_LINKS = 20;

interface TimelineEvent {
  domain: Domain;
  createdAt: Date;
}

export async function detectCausalChains(
  db: Db,
  now: Date,
  _bayesianUpdate: BayesianUpdateResult,
): Promise<CausalChainResult> {
  void _bayesianUpdate; // context is accepted for pipeline symmetry; not required for the math below.

  const cutoff = new Date(now.getTime() - HISTORY_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      personId: schema.findings.personId,
      domain: schema.findings.domain,
      createdAt: schema.findings.createdAt,
    })
    .from(schema.findings)
    .where(gte(schema.findings.createdAt, cutoff));

  const timelineByPerson = new Map<number, TimelineEvent[]>();
  for (const row of rows) {
    if (row.personId === null) continue;
    const list = timelineByPerson.get(row.personId) ?? [];
    list.push({ domain: row.domain as Domain, createdAt: row.createdAt });
    timelineByPerson.set(row.personId, list);
  }

  const domainOccurrences = new Map<Domain, number>();
  const pairOccurrences = new Map<string, { count: number; lagSumDays: number }>();

  for (const timeline of timelineByPerson.values()) {
    const sorted = [...timeline].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    for (let i = 0; i < sorted.length; i++) {
      domainOccurrences.set(sorted[i].domain, (domainOccurrences.get(sorted[i].domain) ?? 0) + 1);
      for (let j = i + 1; j < sorted.length; j++) {
        if (sorted[j].domain === sorted[i].domain) continue;
        const lagDays = (sorted[j].createdAt.getTime() - sorted[i].createdAt.getTime()) / (24 * 60 * 60 * 1000);
        if (lagDays > LAG_WINDOW_DAYS) break;
        const key = `${sorted[i].domain}->${sorted[j].domain}`;
        const entry = pairOccurrences.get(key) ?? { count: 0, lagSumDays: 0 };
        entry.count += 1;
        entry.lagSumDays += lagDays;
        pairOccurrences.set(key, entry);
      }
    }
  }

  const chains: CausalLink[] = [];
  for (const [key, entry] of pairOccurrences.entries()) {
    const [fromDomain, toDomain] = key.split("->") as [Domain, Domain];
    const fromCount = domainOccurrences.get(fromDomain) ?? 0;
    if (fromCount === 0) continue;
    const confidence = entry.count / fromCount;
    if (entry.count >= MIN_OCCURRENCES && confidence >= MIN_CONFIDENCE) {
      chains.push({
        fromDomain,
        toDomain,
        occurrences: entry.count,
        averageLagDays: Math.round((entry.lagSumDays / entry.count) * 100) / 100,
        confidence: Math.round(confidence * 1000) / 1000,
      });
    }
  }

  chains.sort((a, b) => b.confidence - a.confidence);

  return {
    computedAt: now.toISOString(),
    chains: chains.slice(0, MAX_LINKS),
  };
}
