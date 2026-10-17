// docs.ts — Part 1: the self-documenting system.
// ORIGINAL to this session. Implements the *functional idea* in the pasted
// "pt-N" brief (LEADOS.docs.generateUserGuide / generateFindingExplanation /
// generateChangelog) against this build's own data model and engine. No
// file or export resembling this was found anywhere in wbweve/Leados during
// this session's inspection (see AI-SESSION-LOG.md) — the brief is treated
// as an unverified specification of *behavior to build toward*, not as a
// description of existing code to port.

import { AppState, Finding } from './types';
import { RULES, PLAYBOOKS, daysBetween } from './engine';

export interface DocSection {
  title: string;
  content: string;
}

export function generateUserGuide(state: AppState, findings: Finding[], today: string): { sections: DocSection[]; generatedAt: string; dataVersion: string } {
  const topFinding = findings[0];
  const byType: Record<string, number> = {};
  for (const e of state.events) byType[e.type] = (byType[e.type] || 0) + 1;
  const topTypes = Object.entries(byType)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([t, n]) => `${t} (${n}x)`);

  const sections: DocSection[] = [
    {
      title: 'What this LeadOS build is',
      content:
        `This is a leadership operating system. It reads your event log (currently ${state.events.length} events ` +
        `across ${state.people.length} people), and runs ${RULES.length} rules to surface what needs attention. ` +
        `Right now it has found ${findings.length} active finding${findings.length === 1 ? '' : 's'}.`,
    },
    {
      title: 'Your current top finding (a live example)',
      content: topFinding
        ? `Your highest-priority finding right now is "${topFinding.title}" (rule ${topFinding.rule}, ` +
          `severity ${topFinding.sev}, confidence ${topFinding.conf}, score ${topFinding.score}). ` +
          `It comes from event(s): ${topFinding.sources.join(', ') || 'none'}.`
        : 'No active findings right now — every rule is currently passing against your logged data.',
    },
    {
      title: 'How to log an event (based on what you actually log most)',
      content: topTypes.length
        ? `The event types you log most are: ${topTypes.join(', ')}. Use the Quick Capture panel on the Today tab ` +
          `to log a new one — pick a type, fill the fields, submit.`
        : `You have not logged anything yet. Use the Quick Capture panel on the Today tab to log your first event.`,
    },
    {
      title: 'The rules currently installed',
      content: RULES.map((r) => `${r.id} — ${r.title}: fires when ${r.params}.${r.playbook ? ` Resolved via playbook "${PLAYBOOKS[r.playbook]}".` : ' No playbook wired — resolve it by logging the missing event directly.'}`).join(' \n'),
    },
  ];

  return {
    sections,
    generatedAt: today,
    dataVersion: `${state.events.length} events, ${state.people.length} people`,
  };
}

export function generateFindingExplanation(finding: Finding, state: AppState) {
  const rule = RULES.find((r) => r.id === finding.rule);
  const sourceEvents = finding.sources.map((id) => state.events.find((e) => e.id === id)).filter(Boolean) as any[];

  return {
    headline: `${finding.rule} fires when: ${rule?.params ?? 'unknown condition'}`,
    yourCase: `In your case: ${finding.basis.join(' | ')}`,
    sourceData: sourceEvents.map((e) => `${e.type} at ${e.ts.slice(0, 10)}: ${JSON.stringify(e.data).slice(0, 120)}...`),
    resolution: finding.play
      ? `This finding goes quiet once you complete the "${PLAYBOOKS[finding.play]}" playbook, or once the underlying event is logged (e.g. a new 1:1, outcome, or postmortem).`
      : 'This finding has no playbook. Resolve it by logging the missing event directly (see rule description above).',
    playbook: finding.play ? `Open the "${PLAYBOOKS[finding.play]}" playbook from the finding card to act.` : 'No playbook is wired for this rule — this is a disclosed gap, not a bug.',
  };
}

export function generateChangelog(state: AppState) {
  return [...state.audit]
    .slice(-60)
    .reverse()
    .map((a) => ({ when: a.ts, what: humanizeAuditAction(a.action, a.ref), category: categorize(a.action) }));
}

function humanizeAuditAction(action: string, ref?: string): string {
  const eventMatch = action.match(/^event:(.+)$/);
  if (eventMatch) return `Logged ${eventMatch[1]} event${ref ? ` (${ref})` : ''}`;
  if (action === 'person.added') return `Added person "${ref}" to roster`;
  if (action === 'seeded') return `Loaded sample data set (${ref})`;
  if (action === 'settings.updated') return `Updated settings: ${ref}`;
  if (action === 'finding.snooze') return `Snoozed finding ${ref}`;
  if (action === 'finding.dismiss') return `Dismissed finding ${ref}`;
  if (action === 'session.started') return 'Session started';
  return ref ? `${action}: ${ref}` : action;
}

function categorize(action: string): string {
  if (action.startsWith('event:')) return 'data';
  if (action === 'person.added') return 'roster';
  if (action === 'settings.updated') return 'config';
  if (action.startsWith('finding.')) return 'triage';
  return 'system';
}

export function daysAgoLabel(ts: string, today: string): string {
  return `${daysBetween(ts, today)}d ago`;
}
