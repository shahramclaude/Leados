import type { Finding, Projection } from "./types";

/**
 * src/lib/engine.ts — minimal event-math substrate.
 * Mirrors the shape the reference LEADOS `engine` namespace exposes
 * (iso / _days / _dayUTC / DECAY / run) — reimplemented fresh for this
 * sandbox, not copied from any upstream source.
 */

export const DECAY = 0.85;

function iso(d: string | Date): string {
  return typeof d === "string" ? new Date(d).toISOString() : d.toISOString();
}

/** Whole/fractional days between two ISO timestamps (b - a). */
function _days(a: string, b: string): number {
  return (Date.parse(b) - Date.parse(a)) / 86400000;
}

function _dayUTC(ts: string): number {
  return Math.floor(Date.parse(ts) / 86400000);
}

export const engine = { iso, _days, _dayUTC };

/**
 * `run` — recomputes "active findings" as of `today`: any signal.raised
 * event in the last 14 days becomes a Finding at its logged severity.
 * This is a simplified, disclosed substitute for a full rule engine —
 * sufficient to drive computeLeadershipEnergyBudget's sev>=4 drain count.
 */
export function run(P: Projection, today: string | Date): { findings: Finding[] } {
  const todayIso = iso(today);
  const findings: Finding[] = P.state.events
    .filter((e) => e.type === "signal.raised")
    .filter((e) => {
      const age = _days(e.ts, todayIso);
      return age >= 0 && age <= 14;
    })
    .map((e) => ({
      id: e.id,
      domain: e.data.domain,
      sev: e.data.severity,
      title: e.data.title,
    }));
  return { findings };
}
