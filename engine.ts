import type {
  LeadosEvent,
  Projection,
  Person,
  Goal,
  Decision,
  Commitment,
  Finding,
  Domain,
} from "./types";

/**
 * LEADOS.engine — project() folds the append-only log into read state on
 * every call (nothing derived is persisted); run() derives findings from
 * that projection. Fresh construction for this sandbox — see
 * AI-SESSION-LOG.md for what the real engine.js actually contains
 * (a much larger per-module fold; verified, not reused verbatim because
 * its entity shapes are domain-specific, not this brief's generic P).
 */

export const DECAY = 0.85; // verified real-repo constant: heatmapDecayFactor
export const CORRELATION_WINDOW_DAYS = 90; // verified real-repo constant: correlationWindowDays
export const DECISION_MAX_OPEN_DAYS = 21; // verified real-repo constant: decisionMaxOpenDays

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

export const engine = { _days, _dayUTC, iso };

export function project(events: LeadosEvent[]): Projection {
  const peopleById: Record<string, Person> = {};
  const goalById: Record<string, Goal> = {};
  const decisionById: Record<string, Decision> = {};
  const commitmentById: Record<string, Commitment> = {};

  events.forEach((e) => {
    switch (e.type) {
      case "person.added": {
        const p: Person = {
          id: e.data.id,
          name: e.data.name,
          title: e.data.title,
          reportsTo: e.data.reportsTo ?? null,
          createdAt: e.data.createdAt ?? e.ts,
        };
        peopleById[p.id] = p;
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
  };
}

/**
 * run() derives "active findings" at `today`. This is this session's own
 * rule set (disclosed) — deliberately small: one rule per structural
 * entropy indicator, plus one finding per un-resolved domain signal inside
 * the correlation window. sev is on a 1–5 scale throughout.
 */
export function run(P: Projection, today: string | Date): { findings: Finding[] } {
  const todayIso = iso(today);
  const findings: Finding[] = [];

  // Domain signals: every signal.raised event not later signal.resolved,
  // still inside the correlation window.
  const resolvedSignalIds = new Set(
    P.state.events.filter((e) => e.type === "signal.resolved").map((e) => e.data.signalId)
  );
  P.state.events
    .filter((e) => e.type === "signal.raised")
    .forEach((e) => {
      if (resolvedSignalIds.has(e.id)) return;
      const age = _days(e.ts, todayIso);
      if (age < 0 || age > CORRELATION_WINDOW_DAYS) return;
      findings.push({
        key: "signal:" + e.id,
        domain: e.data.domain as Domain,
        sev: e.data.severity,
        ts: e.ts,
        title: e.data.title,
        rule: "SIGNAL",
      });
    });

  // Stale open decisions.
  P.openDecisions.forEach((d) => {
    const age = _days(d.ts, todayIso);
    if (age > DECISION_MAX_OPEN_DAYS) {
      findings.push({
        key: "decision-stale:" + d.id,
        domain: d.domain,
        sev: 3,
        ts: d.ts,
        title: `Decision "${d.title}" open ${Math.round(age)}d (> ${DECISION_MAX_OPEN_DAYS}d gate)`,
        rule: "DECISION_STALE",
      });
    }
  });

  // Overdue commitments.
  P.openCommitments.forEach((c) => {
    const age = _days(c.by_date, todayIso);
    if (age > 0) {
      findings.push({
        key: "commitment-overdue:" + c.id,
        domain: "org",
        sev: 3,
        ts: c.by_date,
        title: `Commitment "${c.desc}" overdue ${Math.round(age)}d`,
        rule: "COMMITMENT_OVERDUE",
      });
    }
  });

  // Ownerless / silent goals.
  P.openGoals.forEach((g) => {
    if (g.ownerId == null) {
      findings.push({
        key: "goal-ownerless:" + g.id,
        domain: g.domain,
        sev: 2,
        ts: g.ts,
        title: `Goal "${g.title}" has no owner`,
        rule: "GOAL_OWNERLESS",
      });
    }
    const ref = g.lastProgressTs || g.ts;
    const silentDays = _days(ref, todayIso);
    if (silentDays > 30) {
      findings.push({
        key: "goal-silent:" + g.id,
        domain: g.domain,
        sev: 2,
        ts: ref,
        title: `Goal "${g.title}" silent ${Math.round(silentDays)}d`,
        rule: "GOAL_SILENT",
      });
    }
  });

  // Blocked information pipelines.
  P.state.events
    .filter((e) => e.type === "info.pipeline.check" && e.data.blocked)
    .forEach((e) => {
      findings.push({
        key: "pipeline-blocked:" + e.id,
        domain: "org",
        sev: 3,
        ts: e.ts,
        title: `Pipeline "${e.data.name}" blocked`,
        rule: "PIPELINE_BLOCKED",
      });
    });

  findings.sort((a, b) => b.sev - a.sev || Date.parse(b.ts) - Date.parse(a.ts));
  return { findings };
}
