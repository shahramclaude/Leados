// src/lib/engine.ts
//
// LEADOS.engine — a small, disclosed-fabricated findings engine.
//
// WHY THIS FILE EXISTS: the pt-L brief's `signalToNoise()` function calls
// `LEADOS.engine.run(P, today)` and expects findings with a `.sources`
// array of event ids. No such engine was found anywhere in the real
// wbweve/Leados repository under this or any equivalent name (verified
// this session — see AI-SESSION-LOG.md). Rather than stub it out or fake
// its output, this file is a small, original, disclosed implementation:
// six illustrative rules over the synthetic event log in ./seed.ts, just
// enough to make Part 1's information-theoretic functions computable
// against real (if synthetic) data. Thresholds (21 days, 45 days, etc.)
// are arbitrary and labeled as such — not derived from any study.

import type { EngineResult, Finding, OrgEvent, Projection } from "./types";

export function iso(d: string | Date): string {
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/** Days between an ISO date string `ts` and `todayIso` (today - ts, can be fractional->rounded by caller). */
export function days(ts: string, todayIso: string): number {
  const a = Date.parse(ts + "T00:00:00Z");
  const b = Date.parse(todayIso + "T00:00:00Z");
  return (b - a) / 86400000;
}

function byType(events: OrgEvent[], type: string) {
  return events.filter((e) => e.type === type);
}

export function run(P: Projection, today: string | Date): EngineResult {
  const todayIso = iso(today);
  const events = P.state.events;
  const findings: Finding[] = [];

  // RULE: SIGNAL — a raised signal stays an active finding for 45 days.
  byType(events, "signal.raised").forEach((e) => {
    const age = days(e.ts, todayIso);
    if (age >= 0 && age <= 45) {
      findings.push({
        key: `signal:${e.id}`,
        rule: "SIGNAL",
        domain: e.data.domain || "org",
        sev: e.data.severity ?? 2,
        ts: e.ts,
        title: e.data.title || "Signal raised",
        detail: `Raised ${Math.round(age)}d ago.`,
        sources: [e.id],
      });
    }
  });

  // RULE: DECISION_STALE — logged decision with no matching resolution within 21 days.
  const resolvedIds = new Set(byType(events, "decision.resolved").map((e) => e.data.decisionId));
  byType(events, "decision.logged").forEach((d) => {
    if (resolvedIds.has(d.data.decisionId)) return;
    const age = days(d.ts, todayIso);
    if (age > 21) {
      findings.push({
        key: `decision:${d.data.decisionId}`,
        rule: "DECISION_STALE",
        domain: d.data.domain || "org",
        sev: age > 45 ? 4 : 3,
        ts: d.ts,
        title: `Decision "${d.data.title}" open ${Math.round(age)}d`,
        detail: "No resolution event logged within the 21-day staleness gate (arbitrary threshold).",
        sources: [d.id],
      });
    }
  });

  // RULE: GOAL_OWNERLESS — goal event with no ownerId.
  byType(events, "goal.updated").forEach((g) => {
    if (!g.data.ownerId) {
      findings.push({
        key: `goal:${g.data.goalId || g.id}`,
        rule: "GOAL_OWNERLESS",
        domain: g.data.domain || "strategy",
        sev: 2,
        ts: g.ts,
        title: `Goal "${g.data.title || g.data.goalId}" has no owner`,
        detail: "",
        sources: [g.id],
      });
    }
  });

  // RULE: CONFLICT_UNRESOLVED — conflict raised, no matching resolution within 14 days.
  const conflictResolvedIds = new Set(byType(events, "conflict.resolved").map((e) => e.data.conflictId));
  byType(events, "conflict.raised").forEach((c) => {
    if (conflictResolvedIds.has(c.data.conflictId)) return;
    const age = days(c.ts, todayIso);
    if (age > 14) {
      findings.push({
        key: `conflict:${c.data.conflictId}`,
        rule: "CONFLICT_UNRESOLVED",
        domain: "people",
        sev: age > 30 ? 4 : 3,
        ts: c.ts,
        title: `Conflict involving ${c.data.personId || "team"} open ${Math.round(age)}d`,
        detail: "",
        sources: [c.id],
      });
    }
  });

  // RULE: ONEONONE_GAP — a direct report with no 1:1 logged in 21+ days.
  P.directs.forEach((p) => {
    const theirs = byType(events, "oneOnOne.held")
      .filter((e) => e.data.personId === p.id)
      .sort((a, b) => b.ts.localeCompare(a.ts));
    const last = theirs[0];
    const age = last ? days(last.ts, todayIso) : 9999;
    if (age > 21) {
      findings.push({
        key: `1on1:${p.id}`,
        rule: "ONEONONE_GAP",
        domain: "people",
        sev: age > 42 ? 4 : 2,
        ts: last ? last.ts : todayIso,
        title: `1:1 cadence slipping with ${p.name}`,
        detail: last ? `Last 1:1 was ${Math.round(age)}d ago.` : "No 1:1 logged yet.",
        sources: last ? [last.id] : [],
      });
    }
  });

  // RULE: NETWORK_ISOLATION — a person with zero recorded collaboration edges.
  const edgeCount: Record<string, number> = {};
  byType(events, "org.network.edge").forEach((e) => {
    edgeCount[e.data.fromId] = (edgeCount[e.data.fromId] || 0) + 1;
    edgeCount[e.data.toId] = (edgeCount[e.data.toId] || 0) + 1;
  });
  [...P.directs, ...P.skips].forEach((p) => {
    if (!edgeCount[p.id]) {
      findings.push({
        key: `isolated:${p.id}`,
        rule: "NETWORK_ISOLATION",
        domain: "people",
        sev: 2,
        ts: todayIso,
        title: `${p.name} has no recorded collaboration edges`,
        detail: "",
        sources: [],
      });
    }
  });

  findings.sort((a, b) => b.sev - a.sev || b.ts.localeCompare(a.ts));
  return { findings };
}

export const engine = { run, iso, _days: days };
