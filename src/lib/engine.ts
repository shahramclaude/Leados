// engine.ts — original, small, disclosed-fabricated findings engine.
// Not a port of anything verified in wbweve/Leados. That repo's own
// src/lib/engine.ts was read in a PRIOR session (per that repo's own
// AI-SESSION-LOG.md, fetched this session) and described as "a small,
// explicitly disclosed-fabricated 6-rule findings engine" — this file does
// not copy that one's rule bodies (not fetched this session), it follows
// the same *disclosure convention*: a small rule set, openly original,
// scored by severity x confidence-factor.

import { AppState, AppEvent, Finding, RuleDef, CONF_FACTOR, DismissEntry } from './types';

export const RULES: RuleDef[] = [
  {
    id: 'R1',
    title: 'Overdue 1:1',
    domain: 'cadence',
    params: 'days since last oneonone.logged for a person > settings.cadenceDays',
    playbook: 'schedule_1on1',
    baseSev: 2,
  },
  {
    id: 'R2',
    title: 'Overdue skip-level',
    domain: 'cadence',
    params: 'days since last skip.logged for a person > settings.skipDays',
    baseSev: 2,
    // disclosed: no playbook wired for R2 (mirrors the "no playbook" pattern
    // the pasted pt-N brief describes for its own R9) — resolve it directly
    // by logging a skip.logged event instead.
  },
  {
    id: 'R3',
    title: 'Decision open past threshold',
    domain: 'decisions',
    params: 'decision.made with no matching decision.outcome within settings.decisionMaxOpenDays',
    playbook: 'close_decision_loop',
    baseSev: 3,
  },
  {
    id: 'R4',
    title: 'Crisis without postmortem',
    domain: 'crisis',
    params: 'crisis.logged with no matching crisis.postmortem within settings.crisisPostmortemDays',
    playbook: 'run_postmortem',
    baseSev: 4,
  },
  {
    id: 'R5',
    title: 'Goal without owner',
    domain: 'goals',
    params: 'goal.set with no data.owner',
    playbook: 'assign_goal_owner',
    baseSev: 2,
  },
];

export const PLAYBOOKS: Record<string, string> = {
  schedule_1on1: 'Schedule a 1:1',
  close_decision_loop: 'Log the decision outcome',
  run_postmortem: 'Run a postmortem',
  assign_goal_owner: 'Assign a goal owner',
};

export function daysBetween(aISO: string, bISO: string): number {
  return Math.round((new Date(bISO).getTime() - new Date(aISO).getTime()) / 86400000);
}

function latestByPerson(events: AppEvent[], type: string, personId: string): AppEvent | undefined {
  return events
    .filter((e) => e.type === type && e.personId === personId)
    .sort((a, b) => (a.ts < b.ts ? 1 : -1))[0];
}

export function run(state: AppState, todayISO: string): Finding[] {
  const findings: Finding[] = [];
  const { people, events, settings } = state;

  // R1 — overdue 1:1
  for (const p of people) {
    const last = latestByPerson(events, 'oneonone.logged', p.id);
    const priorCount = events.filter((e) => e.type === 'oneonone.logged' && e.personId === p.id).length;
    const days = last ? daysBetween(last.ts, todayISO) : Infinity;
    if (days > settings.cadenceDays) {
      const conf = priorCount >= 3 ? 'high' : priorCount >= 1 ? 'med' : 'low';
      const sev = 2 + (days > settings.cadenceDays * 2 ? 1 : 0);
      findings.push(
        makeFinding('R1', `Overdue 1:1 with ${p.name}`, sev, conf, last ? [last.id] : [], [
          last
            ? `Last 1:1 with ${p.name} was ${days} days ago (threshold ${settings.cadenceDays}).`
            : `No 1:1 has ever been logged with ${p.name}.`,
        ], 'schedule_1on1', p.id)
      );
    }
  }

  // R2 — overdue skip-level
  for (const p of people) {
    const last = latestByPerson(events, 'skip.logged', p.id);
    const days = last ? daysBetween(last.ts, todayISO) : Infinity;
    if (days > settings.skipDays) {
      findings.push(
        makeFinding(
          'R2',
          `Overdue skip-level with ${p.name}`,
          2,
          last ? 'med' : 'low',
          last ? [last.id] : [],
          [
            last
              ? `Last skip-level with ${p.name} was ${days} days ago (threshold ${settings.skipDays}).`
              : `No skip-level has ever been logged with ${p.name}.`,
          ],
          undefined,
          p.id
        )
      );
    }
  }

  // R3 — stale open decisions
  const decisionsMade = events.filter((e) => e.type === 'decision.made');
  const outcomes = events.filter((e) => e.type === 'decision.outcome');
  for (const d of decisionsMade) {
    const outcome = outcomes.find((o) => o.data.decisionId === d.id);
    const days = daysBetween(d.ts, todayISO);
    if (!outcome && days > settings.decisionMaxOpenDays) {
      findings.push(
        makeFinding(
          'R3',
          `Decision open ${days}d: "${d.data.title || 'untitled'}"`,
          3,
          'high',
          [d.id],
          [`Decision "${d.data.title}" was made ${days} days ago with no logged outcome (threshold ${settings.decisionMaxOpenDays}).`],
          'close_decision_loop',
          d.personId
        )
      );
    }
  }

  // R4 — crisis without postmortem
  const crises = events.filter((e) => e.type === 'crisis.logged');
  const postmortems = events.filter((e) => e.type === 'crisis.postmortem');
  for (const c of crises) {
    const pm = postmortems.find((p) => p.data.crisisId === c.id);
    const days = daysBetween(c.ts, todayISO);
    if (!pm && days > settings.crisisPostmortemDays) {
      findings.push(
        makeFinding(
          'R4',
          `Crisis without postmortem (${days}d old)`,
          4,
          'high',
          [c.id],
          [`"${c.data.what || 'Unlabeled crisis'}" happened ${days} days ago with no postmortem logged (threshold ${settings.crisisPostmortemDays}).`],
          'run_postmortem',
          c.personId
        )
      );
    }
  }

  // R5 — goal without owner
  const goals = events.filter((e) => e.type === 'goal.set');
  for (const g of goals) {
    if (!g.data.owner) {
      findings.push(
        makeFinding(
          'R5',
          `Goal without owner: "${g.data.title || 'untitled'}"`,
          2,
          'high',
          [g.id],
          [`Goal "${g.data.title}" has no data.owner set.`],
          'assign_goal_owner',
          undefined
        )
      );
    }
  }

  return findings.sort((a, b) => b.score - a.score);
}

function makeFinding(
  rule: string,
  title: string,
  sev: number,
  conf: Finding['conf'],
  sources: string[],
  basis: string[],
  play: string | undefined,
  personId: string | undefined
): Finding {
  const score = Math.round(sev * CONF_FACTOR[conf] * 10) / 10;
  return {
    key: `${rule}:${personId || 'org'}:${sources.join(',')}`,
    rule,
    title,
    sev,
    conf,
    score,
    sources,
    basis,
    play,
    personId,
  };
}

export function filterActive(findings: Finding[], dismissed: DismissEntry[], todayISO: string): Finding[] {
  const SNOOZE_DAYS = 3;
  return findings.filter((f) => {
    const entries = dismissed.filter((d) => d.key === f.key);
    for (const d of entries) {
      if (d.mode === 'dismiss') return false;
      if (d.mode === 'snooze' && daysBetween(d.ts, todayISO) < SNOOZE_DAYS) return false;
    }
    return true;
  });
}
