import type { Domain, Projection } from "./types";
import { DOMAINS } from "./types";
import { DECAY, engine } from "./engine";

/**
 * LEADOS.correlate — Part 1, Temporal Velocity Measurement.
 *
 * DISCLOSURE: `LEADOS.correlate.heatmap` / `measureVelocity` as named
 * shapes were NOT found in the real wbweve/Leados repo this session
 * (engine.js has a conceptually similar decay-weighted per-domain rollup,
 * independently confirmed in fragments such as
 * `const w = r.sev * Math.pow(decay, r.ageDays)`, under different names —
 * see AI-SESSION-LOG.md). This module is a fresh implementation of the
 * pasted brief, reusing only the verified decay constant (0.85).
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
  domain: Domain;
  asOf: string;
  score: number; // clamped 0..10
  rawScore: number; // unclamped
  rows: DomainMathRow[];
}

/** Per-domain score at `asOf`: decay-weighted sum of that domain's signal.raised events with ts <= asOf, clamped to [0,10]. */
export function domainMath(domain: Domain, P: Projection, asOf: string | Date): DomainScore {
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

export function heatmap(P: Projection, asOf: string | Date): Record<Domain, DomainScore> {
  const out = {} as Record<Domain, DomainScore>;
  DOMAINS.forEach((d) => {
    out[d] = domainMath(d, P, asOf);
  });
  return out;
}

export type VelocityDirection = "WORSENING" | "IMPROVING" | "STABLE";

export interface Velocity {
  domain: Domain;
  current: number;
  historical: number;
  velocity: number; // score points per day
  direction: VelocityDirection;
  projectedIn30d: number;
  projectedClamped: number;
  lookbackDays: number;
  label: string;
}

/**
 * Reconstructs the same domain's score `lookbackDays` ago by re-filtering
 * events to ts <= (today - lookbackDays) and re-scoring — implemented
 * essentially verbatim from the pasted brief's intent. One disclosed
 * normalization: the brief's own pseudocode passes `today` inconsistently
 * (Date in one call, guaranteed ISO string in the next); here every
 * "as of" argument is normalized through engine.iso() so both forms work.
 */
export function measureVelocity(domain: Domain, P: Projection, today: string | Date, lookbackDays = 30): Velocity {
  const todayIso = engine.iso(today);
  const lookbackIso = new Date(Date.parse(todayIso) - lookbackDays * 86400000).toISOString();

  const current = domainMath(domain, P, todayIso).score;
  const historical = domainMath(domain, P, lookbackIso).score;
  const velocity = (current - historical) / lookbackDays;
  const projectedIn30d = current + velocity * 30;

  const direction: VelocityDirection = velocity > 0.01 ? "WORSENING" : velocity < -0.01 ? "IMPROVING" : "STABLE";

  return {
    domain,
    current,
    historical,
    velocity: Math.round(velocity * 1000) / 1000,
    direction,
    projectedIn30d: Math.round(projectedIn30d * 100) / 100,
    projectedClamped: Math.max(0, Math.min(10, projectedIn30d)),
    lookbackDays,
    label:
      `${domain}: score ${current} now vs ${historical} ${lookbackDays}d ago → ` +
      `${velocity >= 0 ? "+" : ""}${(Math.round(velocity * 1000) / 1000).toFixed(3)}/d (${direction}). ` +
      `Linear projection, not a forecast model.`,
  };
}
