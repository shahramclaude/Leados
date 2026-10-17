import type {
  LeadosEvent,
  Projection,
  Person,
  Goal,
  Decision,
  Commitment,
  Finding,
  Domain,
  GrowthPlan,
  SuccessionCandidate,
  Confidence,
} from "./types";

/**
 * LEADOS.store + LEADOS.engine — append-only event log, folded into read
 * state by project(); findings derived by run(). Fresh construction for
 * this delivery (see AI-SESSION-LOG.md). Distinct storage key chosen
 * deliberately so this build can never collide with the real repo's
 * verified "leados:data" key, or with any of the other disclosed sandbox
 * keys already living in this repo's history
 * ("leados-orgphysics-sandbox:data", "leados-synthesis:data", etc).
 */

export const STORAGE_KEY = "leados-moment:data";
export const SCHEMA_VERSION = 1;

export const DECAY = 0.85; // verified real-repo constant: heatmapDecayFactor
export const CORRELATION_WINDOW_DAYS = 90; // verified real-repo constant: correlationWindowDays
export const DECISION_MAX_OPEN_DAYS = 21; // verified real-repo constant: decisionMaxOpenDays

export const CONF_FACTOR: Record<Confidence, number> = { low: 1, med: 1.3, high: 1.6 };

interface RawStore {
  schemaVersion: number;
  meta: { createdAt: string };
  events: LeadosEvent[];
}

let seq = 0;
function nextId(): string {
  seq += 1;
  return "e-" + String(Date.now()).slice(-6) + "-" + String(seq).padStart(4, "0");
}

function readRaw(): RawStore | null {
  const text = localStorage.getItem(STORAGE_KEY);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("LEADOS: store at " + STORAGE_KEY + " is corrupt and was left untouched.");
  }
}

function writeRaw(raw: RawStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));
}

function genesis(): RawStore {
  return { schemaVersion: SCHEMA_VERSION, meta: { createdAt: new Date().toISOString() }, events: [] };
}

export function load(): LeadosEvent[] {
  let raw = readRaw();
  if (!raw) {
    raw = genesis();
    writeRaw(raw);
  }
  return raw.events;
}

export function metaCreatedAt(): string | null {
  const raw = readRaw();
  return raw ? raw.meta.createdAt : null;
}

export function append(type: string, data: any, meta?: Record<string, any>): LeadosEvent {
  const raw = readRaw() || genesis();
  const ev: LeadosEvent = { id: nextId(), ts: new Date().toISOString(), type, data, meta };
  raw.events.push(ev);
  writeRaw(raw);
  return ev;
}

export function appendAt(type: string, data: any, ts: string): LeadosEvent {
  const raw = readRaw() || genesis();
  const ev: LeadosEvent = { id: nextId(), ts, type, data, meta: { seeded: true } };
  raw.events.push(ev);
  writeRaw(raw);
  return ev;
}

export function reset() {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasData(): boolean {
  const raw = readRaw();
  return !!raw && raw.events.length > 0;
}

export function rawBytes(): number {
  const t = localStorage.getItem(STORAGE_KEY);
  return t ? t.length : 0;
}

export function exportJson(): string {
  return localStorage.getItem(STORAGE_KEY) || "{}";
}

// ---------------------------------------------------------------------------

function _days(fromIso: string | Date, toIso: string | Date): number {
  const a = fromIso instanceof Date ? fromIso.getTime() : Date.parse(fromIso);
  const b = toIso instanceof Date ? toIso.getTime() : Date.parse(toIso);
  return (b - a) / 86400000;
}
function _dayUTC(iso: string): number {
  return Math.floor(Date.parse(iso) / 86400000);
}
function iso(d: string | Date): string {
  return d instanceof Date ? d.toISOString() : d;
}
export const engine = { _days, _dayUTC, iso, CONF_FACTOR };

export function project(events: LeadosEvent[]): Projection {
  const peopleById: Record<string, Person> = {};
  const goalById: Record<string, Goal> = {};
  const decisionById: Record<string, Decision> = {};
  const commitmentById: Record<string, Commitment> = {};
  const growthPlanById: Record<string, GrowthPlan> = {};
  const successionCandidates: SuccessionCandidate[] = [];

  events.forEach((e) => {
    switch (e.type) {
      case "person.added": {
        peopleById[e.data.id] = {
          id: e.data.id,
          name: e.data.name,
          title: e.data.title,
          reportsTo: e.data.reportsTo ?? null,
          createdAt: e.data.createdAt ?? e.ts,
        };
        break;
      }
      case "goal.set": {
        goalById[e.data.id] = {
          id: e.data.id,
          title: e.data.title,
          domain: e.data.domain ?? "org",
          ownerId: e.data.ownerId ?? null,
          ts: e.ts,
          lastProgressTs: null,
          closed: false,
        };
        break;
      }
      case "goal.progress": {
        const g = goalById[e.data.goalId];
        if (g) g.lastProgressTs = e.ts;
        break;
      }
      case "goal.closed": {
        const g = goalById[e.data.goalId];
        if (g) {
          g.closed = true;
          g.result = e.data.result;
        }
        break;
      }
      case "decision.logged": {
        decisionById[e.data.id] = {
          id: e.data.id,
          title: e.data.title,
          domain: e.data.domain ?? "org",
          ts: e.ts,
          confidence: e.data.confidence,
        };
        break;
      }
      case "decision.outcome": {
        const d = decisionById[e.data.decisionId];
        if (d) {
          d.outcome = e.data.outcome;
          d.outcomeTs = e.ts;
        }
        break;
      }
      case "commitment.made": {
        commitmentById[e.data.id] = {
          id: e.data.id,
          ownerId: e.data.ownerId ?? null,
          desc: e.data.desc,
          by_date: e.data.by_date,
          ts: e.ts,
          resolved: false,
        };
        break;
      }
      case "commitment.resolved": {
        const c = commitmentById[e.data.commitmentId];
        if (c) {
          c.resolved = true;
          c.resolvedTs = e.ts;
        }
        break;
      }
      case "growth.plan.opened": {
        growthPlanById[e.data.id] = {
          id: e.data.id,
          personId: e.data.personId,
          domain: e.data.domain ?? "org",
          spine: [{ d: e.data.startD ?? "D1", ts: e.ts }],
        };
        break;
      }
      case "growth.plan.moved": {
        const p = growthPlanById[e.data.planId];
        if (p) p.spine.push({ d: e.data.d, ts: e.ts });
        break;
      }
      case "succession.candidate": {
        successionCandidates.push({ id: e.data.id, personId: e.data.personId, role: e.data.role, ts: e.ts });
        break;
      }
      default:
        break;
    }
  });

  const people = Object.values(peopleById);
  const broken = people
    .filter((p) => p.reportsTo && !peopleById[p.reportsTo])
    .map((p) => ({ personId: p.id, reportsTo: p.reportsTo as string }));

  const goals = Object.values(goalById);
  const openGoals = goals.filter((g) => !g.closed);
  const decisions = Object.values(decisionById);
  const openDecisions = decisions.filter((d) => !d.outcome);
  const commitments = Object.values(commitmentById);
  const openCommitments = commitments.filter((c) => !c.resolved);

  return {
    state: { events },
    meta: { createdAt: events.length ? events.reduce((min, e) => (e.ts < min ? e.ts : min), events[0].ts) : null },
    people,
    peopleById,
    lines: { broken },
    goals,
    goalById,
    openGoals,
    decisions,
    decisionById,
    openDecisions,
    commitments,
    commitmentById,
    openCommitments,
    growthPlans: Object.values(growthPlanById),
    successionCandidates,
  };
}

/**
 * run() derives "active findings" at `today`. Disclosed, small rule set:
 * one rule per structural-entropy indicator, plus one finding per
 * unresolved domain signal inside the correlation window. sev is 1-5.
 * `conf`, `score`, and `play` are this delivery's own additions on top of
 * the prior session's Finding shape, needed by the Section 2 leverage math
 * the current brief specifies (f.conf, f.score, f.play were referenced in
 * the pasted pseudocode but never defined there — definitions below are
 * disclosed inventions, not discovered facts).
 */
export function run(P: Projection, today: string | Date): { findings: Finding[] } {
  const todayIso = iso(today);
  const findings: Finding[] = [];

  const resolvedSignalIds = new Set(
    P.state.events.filter((e) => e.type === "signal.resolved").map((e) => e.data.signalId)
  );
  P.state.events
    .filter((e) => e.type === "signal.raised")
    .forEach((e) => {
      if (resolvedSignalIds.has(e.id)) return;
      const age = _days(e.ts, todayIso);
      if (age < 0 || age > CORRELATION_WINDOW_DAYS) return;
      const conf: Confidence = e.data.severity >= 4 ? "high" : e.data.severity >= 2.5 ? "med" : "low";
      findings.push({
        key: "signal:" + e.id,
        domain: e.data.domain as Domain,
        sev: e.data.severity,
        conf,
        score: Math.round(e.data.severity * CONF_FACTOR[conf] * 10) / 10,
        ts: e.ts,
        title: e.data.title,
        rule: "SIGNAL",
        play: e.data.play,
      });
    });

  P.openDecisions.forEach((d) => {
    const age = _days(d.ts, todayIso);
    if (age > DECISION_MAX_OPEN_DAYS) {
      findings.push({
        key: "decision-stale:" + d.id,
        domain: d.domain,
        sev: 3,
        conf: "med",
        score: Math.round(3 * CONF_FACTOR.med * 10) / 10,
        ts: d.ts,
        title: `Decision "${d.title}" open ${Math.round(age)}d (> ${DECISION_MAX_OPEN_DAYS}d gate)`,
        rule: "DECISION_STALE",
        play: "Decide-or-kill review",
      });
    }
  });

  P.openCommitments.forEach((c) => {
    const age = _days(c.by_date, todayIso);
    if (age > 0) {
      findings.push({
        key: "commitment-overdue:" + c.id,
        domain: "org",
        sev: 3,
        conf: "high",
        score: Math.round(3 * CONF_FACTOR.high * 10) / 10,
        ts: c.by_date,
        title: `Commitment "${c.desc}" overdue ${Math.round(age)}d`,
        rule: "COMMITMENT_OVERDUE",
        play: "Commitment reset",
      });
    }
  });

  P.openGoals.forEach((g) => {
    if (g.ownerId == null) {
      findings.push({
        key: "goal-ownerless:" + g.id,
        domain: g.domain,
        sev: 2,
        conf: "high",
        score: Math.round(2 * CONF_FACTOR.high * 10) / 10,
        ts: g.ts,
        title: `Goal "${g.title}" has no owner`,
        rule: "GOAL_OWNERLESS",
        play: "Assign owner",
      });
    }
    const ref = g.lastProgressTs || g.ts;
    const silentDays = _days(ref, todayIso);
    if (silentDays > 30) {
      findings.push({
        key: "goal-silent:" + g.id,
        domain: g.domain,
        sev: 2,
        conf: "low",
        score: Math.round(2 * CONF_FACTOR.low * 10) / 10,
        ts: ref,
        title: `Goal "${g.title}" silent ${Math.round(silentDays)}d`,
        rule: "GOAL_SILENT",
      });
    }
  });

  P.state.events
    .filter((e) => e.type === "info.pipeline.check" && e.data.blocked)
    .forEach((e) => {
      findings.push({
        key: "pipeline-blocked:" + e.id,
        domain: "org",
        sev: 3,
        conf: "med",
        score: Math.round(3 * CONF_FACTOR.med * 10) / 10,
        ts: e.ts,
        title: `Pipeline "${e.data.name}" blocked`,
        rule: "PIPELINE_BLOCKED",
        play: "Unblock pipeline",
      });
    });

  findings.sort((a, b) => b.sev - a.sev || Date.parse(b.ts) - Date.parse(a.ts));
  return { findings };
}
