// selfImprove.ts — Part 3: the self-improving system.
// ORIGINAL to this session. Implements the functional idea of
// LEADOS.selfImprove from the pasted "pt-N" brief (calibration, coverage
// gaps, playbook review, domain neglect) against this build's own data —
// no "calibrateRules.ts" / "knowledge.ts" file or export was found anywhere
// in wbweve/Leados's src/lib listing fetched this session (23 files
// enumerated, neither name present — see AI-SESSION-LOG.md). All proposals
// here require explicit user approval; nothing is auto-applied.

import { AppState, Finding, KNOWN_EVENT_TYPES } from './types';

export interface Proposal {
  type: 'RULE_THRESHOLD' | 'COVERAGE_GAP' | 'PLAYBOOK_REVIEW' | 'DOMAIN_NEGLECT';
  evidence: string;
  impact: string;
  apply?: () => Partial<AppState['settings']>;
  detail?: string[];
}

const DOMAIN_MAP: Record<string, string[]> = {
  cadence: ['oneonone.logged', 'skip.logged'],
  decisions: ['decision.made', 'decision.outcome'],
  crisis: ['crisis.logged', 'crisis.postmortem'],
  goals: ['goal.set'],
  growth: ['reflection.logged', 'feedback.logged'],
};

export function generateImprovementProposals(state: AppState, findings: Finding[], today: string): { proposals: Proposal[]; label: string } {
  const proposals: Proposal[] = [];

  // 1. Cadence threshold calibration — compare actual average interval to configured setting.
  const oneOnOnes = state.events.filter((e) => e.type === 'oneonone.logged').sort((a, b) => (a.ts < b.ts ? -1 : 1));
  if (oneOnOnes.length >= 4) {
    const gaps: number[] = [];
    const byPerson: Record<string, string[]> = {};
    for (const e of oneOnOnes) {
      if (!e.personId) continue;
      (byPerson[e.personId] ||= []).push(e.ts);
    }
    for (const ts of Object.values(byPerson)) {
      for (let i = 1; i < ts.length; i++) {
        gaps.push(Math.round((new Date(ts[i]).getTime() - new Date(ts[i - 1]).getTime()) / 86400000));
      }
    }
    if (gaps.length >= 2) {
      const avg = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
      const current = state.settings.cadenceDays;
      if (Math.abs(avg - current) / current > 0.25) {
        proposals.push({
          type: 'RULE_THRESHOLD',
          evidence: `Your actual average interval between 1:1s with the same person is ${avg} days, computed from ${gaps.length} consecutive-pair samples. Configured threshold is ${current} days.`,
          impact: avg > current ? 'R1 is likely over-firing relative to your real rhythm.' : 'R1 is likely under-firing relative to your real rhythm.',
          apply: () => ({ cadenceDays: avg }),
          detail: [`Proposed cadenceDays: ${avg} (currently ${current})`],
        });
      }
    }
  }

  // 2. Coverage gaps — event types never logged.
  const loggedTypes = new Set(state.events.map((e) => e.type));
  const unused = KNOWN_EVENT_TYPES.filter((t) => !loggedTypes.has(t) && t !== 'playbook.completed');
  if (unused.length >= 3) {
    proposals.push({
      type: 'COVERAGE_GAP',
      evidence: `You have never logged: ${unused.join(', ')}. Without this data, rules that depend on it cannot fire, which can look like "all clear" when it is actually "unmeasured."`,
      impact: 'Expanding logging coverage would let more rules evaluate meaningfully.',
      detail: unused,
    });
  }

  // 3. Playbook effectiveness — crude resolution-rate proxy per rule that has a playbook.
  const completions = state.events.filter((e) => e.type === 'playbook.completed');
  const triggerCounts: Record<string, number> = {};
  for (const f of findings) if (f.play) triggerCounts[f.play] = (triggerCounts[f.play] || 0) + 1;
  const completionCounts: Record<string, number> = {};
  for (const c of completions) completionCounts[c.data.playId] = (completionCounts[c.data.playId] || 0) + 1;
  const lowEffectiveness = Object.entries(triggerCounts)
    .filter(([, triggered]) => triggered >= 1)
    .map(([playId, triggered]) => {
      const completed = completionCounts[playId] || 0;
      const rate = Math.min(1, completed / Math.max(triggered, 1));
      return { playId, triggered, completed, rate };
    })
    .filter((p) => p.rate < 0.5);
  if (lowEffectiveness.length) {
    proposals.push({
      type: 'PLAYBOOK_REVIEW',
      evidence: `Playbooks currently active relative to findings that cite them, with completion-count as a crude proxy (not a true before/after resolution measurement — disclosed limitation).`,
      impact: 'Low completion relative to active findings suggests the playbook is being surfaced but not used — may need a shorter form or better placement.',
      detail: lowEffectiveness.map((p) => `${p.playId}: ${p.completed} completed vs ${p.triggered} currently-active findings citing it`),
    });
  }

  // 4. Domain neglect — percentage of event log per domain.
  const total = state.events.length;
  if (total > 0) {
    const neglected = Object.entries(DOMAIN_MAP)
      .map(([domain, types]) => ({ domain, pct: (state.events.filter((e) => types.includes(e.type)).length / total) * 100 }))
      .filter((d) => d.pct < 5);
    if (neglected.length) {
      proposals.push({
        type: 'DOMAIN_NEGLECT',
        evidence: `${neglected.map((d) => `${d.domain} (${d.pct.toFixed(0)}%)`).join(', ')} make up under 5% of your event log.`,
        impact: 'Rules in these domains may be silently missing real issues due to sparse data, not because things are actually fine.',
        detail: neglected.map((d) => d.domain),
      });
    }
  }

  return {
    proposals,
    label: `${proposals.length} self-improvement proposal${proposals.length === 1 ? '' : 's'} generated from system effectiveness analysis on ${today.slice(0, 10)}. All require explicit approval — nothing changes automatically.`,
  };
}
