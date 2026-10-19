import type { DomainKey, Projection } from "./types";
import { DOMAINS } from "./types";
import { DECAY, engine } from "./engine";

/**
 * src/lib/velocity.ts — Temporal Velocity Measurement.
 * Fresh implementation for this sandbox: per-domain score is a decay-weighted
 * sum of that domain's `signal.raised` events (half-life governed by DECAY =
 * 0.85/day), clamped to [0,10]. Velocity re-derives the same score as of
 * `lookbackDays` ago by re-filtering events, then takes the slope.
 */

export interface DomainMathRow {
  key: string;
  sev: number;
  ageDays: number;
  weight: number;
  ts: string;
  title: string;
}

export interface DomainScore {
  domain: DomainKey;
  asOf: string;
  score: number; // clamped 0..10
  rawScore: number; // unclamped
  rows: DomainMathRow[];
}

/** Per-domain score at `asOf`: decay-weighted sum of that domain's signal.raised events with ts <= asOf, clamped to [0,10]. */
export function domainMath(domain: DomainKey, P: Projection, asOf: string | Date): DomainScore {
  const asOfIso = engine.iso(asOf);
  const rows: DomainMathRow[] = P.state.events
    .filter((e) => e.type === "signal.raised" && e.data.domain === domain)
    .filter((e) => Date.parse(e.ts) <= Date.parse(asOfIso))
    .map((e) => {
      const ageDays = Math.max(0, engine._days(e.ts, asOfIso));
      const weight = e.data.severity * Math.pow(DECAY, ageDays);
      return {
        key: e.id,
        sev: e.data.severity,
        ageDays: Math.round(ageDays * 10) / 10,
        weight: Math.round(weight * 1000) / 1000,
        ts: e.ts,
        title: e.data.title,
      };
    })
    .sort((a, b) => b.weight - a.weight);

  const rawScore = rows.reduce((a, r) => a + r.weight, 0);
  const score = Math.max(0, Math.min(10, rawScore));
  return { domain, asOf: asOfIso, score: Math.round(score * 100) / 100, rawScore, rows };
}

export function heatmap(P: Projection, asOf: string | Date): Record<DomainKey, DomainScore> {
  const out = {} as Record<DomainKey, DomainScore>;
  DOMAINS.forEach((d) => {
    out[d] = domainMath(d, P, asOf);
  });
  return out;
}

export type VelocityDirection = "WORSENING" | "IMPROVING" | "STABLE";

export interface Velocity {
  domain: DomainKey;
  current: number;
  historical: number;
  velocity: number; // score points per day
  direction: VelocityDirection;
  projectedIn14d: number;
  projectedIn30d: number;
  projectedClamped14: number;
  projectedClamped30: number;
  lookbackDays: number;
  eventCount90d: number;
  dataConfidence: "HIGH" | "MED" | "LOW";
  label: string;
}

/**
 * Reconstructs the same domain's score `lookbackDays` ago by re-filtering
 * events to ts <= (today - lookbackDays) and re-scoring. Every "as of"
 * argument is normalized through engine.iso() so both Date and ISO string
 * inputs work.
 */
export function measureVelocity(domain: DomainKey, P: Projection, today: string | Date, lookbackDays = 30): Velocity {
  const todayIso = engine.iso(today);
  const lookbackIso = new Date(Date.parse(todayIso) - lookbackDays * 86400000).toISOString();

  const current = domainMath(domain, P, todayIso).score;
  const historical = domainMath(domain, P, lookbackIso).score;
  const velocity = (current - historical) / lookbackDays;
  const projectedIn14d = current + velocity * 14;
  const projectedIn30d = current + velocity * 30;

  const direction: VelocityDirection = velocity > 0.01 ? "WORSENING" : velocity < -0.01 ? "IMPROVING" : "STABLE";

  const eventCount90d = P.state.events.filter((e) => {
    if (e.type !== "signal.raised" || e.data.domain !== domain) return false;
    const age = engine._days(e.ts, todayIso);
    return age >= 0 && age <= 90;
  }).length;

  const dataConfidence: "HIGH" | "MED" | "LOW" = eventCount90d >= 10 ? "HIGH" : eventCount90d >= 5 ? "MED" : "LOW";

  return {
    domain,
    current,
    historical,
    velocity: Math.round(velocity * 1000) / 1000,
    direction,
    projectedIn14d: Math.round(projectedIn14d * 100) / 100,
    projectedIn30d: Math.round(projectedIn30d * 100) / 100,
    projectedClamped14: Math.max(0, Math.min(10, projectedIn14d)),
    projectedClamped30: Math.max(0, Math.min(10, projectedIn30d)),
    lookbackDays,
    eventCount90d,
    dataConfidence,
    label:
      `${domain}: score ${current} now vs ${historical} ${lookbackDays}d ago → ` +
      `${velocity >= 0 ? "+" : ""}${(Math.round(velocity * 1000) / 1000).toFixed(3)}/d (${direction}). ` +
      `Linear projection, not a forecast model. ${eventCount90d} signal.raised event(s) in the trailing 90 days.`,
  };
}
