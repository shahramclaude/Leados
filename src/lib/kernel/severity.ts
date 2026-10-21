// Part 04 (minimal, reconstructed) — severity scale + anomaly tripwire +
// interrupt policy.
//
// Severity scale (1 = info .. 5 = critical) matches the mission's references
// to a "sev5 finding" and "severity-5 trigger". The tripwire threshold is
// itself a self-improvable rule (see selfImprove.ts): it is read from
// `kernel_active_rules` at call time, not hard-coded, so a human-approved
// self-improvement proposal can retune it without a code change — but it can
// never be changed silently (see selfImprove.ts honesty tests).
import { db } from "@/db";
import { kernelActiveRules, kernelDomainPauses, kernelFindings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { newId } from "./ids";
import { appendEvent } from "./events";
import type { Actor } from "./types";

export const DEFAULT_DRIFT_SEVERITY5_THRESHOLD = 0.4; // 40% relative drift from baseline

export async function getDriftThreshold(): Promise<number> {
  const [row] = await db
    .select()
    .from(kernelActiveRules)
    .where(eq(kernelActiveRules.ruleKey, "tripwire.drift.severity5Threshold"))
    .limit(1);
  if (!row) return DEFAULT_DRIFT_SEVERITY5_THRESHOLD;
  const v = row.value as { threshold?: number };
  return typeof v.threshold === "number" ? v.threshold : DEFAULT_DRIFT_SEVERITY5_THRESHOLD;
}

export function severityForDrift(relativeDrift: number, threshold: number): 1 | 2 | 3 | 4 | 5 {
  const ratio = relativeDrift / threshold;
  if (ratio >= 1) return 5;
  if (ratio >= 0.75) return 4;
  if (ratio >= 0.5) return 3;
  if (ratio >= 0.25) return 2;
  return 1;
}

export interface FindingInput {
  severity: 1 | 2 | 3 | 4 | 5;
  title: string;
  description: string;
  domain: string;
  metadata?: Record<string, unknown>;
}

export async function openFinding(input: FindingInput, actor: Actor) {
  const id = newId("find");
  const [row] = await db
    .insert(kernelFindings)
    .values({
      id,
      severity: input.severity,
      title: input.title,
      description: input.description,
      domain: input.domain,
      metadata: input.metadata ?? {},
    })
    .returning();

  await appendEvent({
    type: "finding.created",
    actor,
    correlationId: id,
    payload: row,
    notify: { topic: "findings" },
  });

  // Interrupt policy: a severity-5 finding auto-pauses the affected domain
  // (not the whole system — that is what the global kill switch is for) and
  // is itself the event the "severity-5 trigger" scheduler job listens for.
  if (input.severity === 5) {
    await pauseDomain(input.domain, `auto-pause: sev5 finding ${id}`, actor);
  }

  return row;
}

export async function pauseDomain(domain: string, reason: string, actor: Actor) {
  await db
    .insert(kernelDomainPauses)
    .values({ domain, paused: true, reason, pausedAt: new Date() })
    .onConflictDoUpdate({
      target: kernelDomainPauses.domain,
      set: { paused: true, reason, pausedAt: new Date() },
    });
  await appendEvent({
    type: "domain.paused",
    actor,
    correlationId: `domain:${domain}`,
    payload: { domain, reason },
  });
}

export async function resumeDomain(domain: string, actor: Actor) {
  await db
    .insert(kernelDomainPauses)
    .values({ domain, paused: false, reason: null, pausedAt: null })
    .onConflictDoUpdate({
      target: kernelDomainPauses.domain,
      set: { paused: false, reason: null, pausedAt: null },
    });
  await appendEvent({
    type: "domain.resumed",
    actor,
    correlationId: `domain:${domain}`,
    payload: { domain },
  });
}

export async function isDomainPaused(domain: string): Promise<boolean> {
  const [row] = await db
    .select()
    .from(kernelDomainPauses)
    .where(eq(kernelDomainPauses.domain, domain))
    .limit(1);
  return Boolean(row?.paused);
}

/** Anomaly tripwire: compares a live reading against baseline; auto-opens a
 * sev5 finding (and therefore pauses the domain) when drift crosses the
 * configured threshold. Returns the computed severity even when below 5 so
 * callers (the scheduler's metric-anomaly job) can log sub-critical drift. */
export async function checkAnomalyTripwire(params: {
  metricKey: string;
  value: number;
  baseline: number;
  domain: string;
  actor: Actor;
}): Promise<{ severity: 1 | 2 | 3 | 4 | 5; relativeDrift: number; findingId?: string }> {
  const threshold = await getDriftThreshold();
  const relativeDrift = params.baseline === 0 ? 0 : Math.abs(params.value - params.baseline) / Math.abs(params.baseline);
  const severity = severityForDrift(relativeDrift, threshold);
  if (severity >= 5) {
    const finding = await openFinding(
      {
        severity: 5,
        title: `Anomaly tripwire: ${params.metricKey} drifted ${(relativeDrift * 100).toFixed(1)}%`,
        description: `Metric ${params.metricKey} value=${params.value} baseline=${params.baseline} exceeds the ${(threshold * 100).toFixed(0)}% drift threshold.`,
        domain: params.domain,
        metadata: { metricKey: params.metricKey, value: params.value, baseline: params.baseline, relativeDrift },
      },
      params.actor,
    );
    return { severity, relativeDrift, findingId: finding.id };
  }
  return { severity, relativeDrift };
}
