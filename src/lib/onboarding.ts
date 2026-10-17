// onboarding.ts — Part 4: adaptive onboarding.
// ORIGINAL to this session. Implements the functional idea of
// LEADOS.onboarding from the pasted "pt-N" brief against this build's own
// stage model. No onboarding.ts / equivalent stage-detector was found
// anywhere in wbweve/Leados's src/lib listing fetched this session.

import { AppState, Finding } from './types';

export type Stage = 'EMPTY' | 'JUST_STARTED' | 'BUILDING' | 'LOGGING_CLEAN' | 'FINDING_NO_ACTION' | 'ACTING' | 'OPERATIONAL';

export function detectStage(state: AppState, findings: Finding[]): Stage {
  const events = state.events.length;
  const people = state.people.length;
  const playsCompleted = state.events.filter((e) => e.type === 'playbook.completed').length;

  if (people === 0) return 'EMPTY';
  if (events < 5) return 'JUST_STARTED';
  if (events < 20) return 'BUILDING';
  if (findings.length === 0) return 'LOGGING_CLEAN';
  if (playsCompleted === 0) return 'FINDING_NO_ACTION';
  if (playsCompleted < 5) return 'ACTING';
  return 'OPERATIONAL';
}

export interface Guidance {
  headline: string;
  instruction: string;
  actionLabel: string;
  actionTab: 'today' | 'roster' | 'docs' | 'memory' | 'improve';
  whyItMatters?: string;
}

export function getGuidance(state: AppState, findings: Finding[]): { stage: Stage; guidance: Guidance } {
  const stage = detectStage(state, findings);

  const GUIDANCE: Record<Stage, Guidance> = {
    EMPTY: {
      headline: 'LeadOS is ready. Your data is not here yet.',
      instruction: 'Start by adding your direct reports on the Roster tab. Each person you add becomes trackable for cadence and signals — LeadOS cannot advise on what it does not know.',
      actionLabel: 'Add your first person',
      actionTab: 'roster',
      whyItMatters: 'Without people, no cadence rule can ever fire.',
    },
    JUST_STARTED: {
      headline: `You have ${state.events.length} event(s) and ${state.people.length} people.`,
      instruction: 'Log your first 1:1 with whoever you spoke to most recently, using Quick Capture on Today. That alone lets R1 start evaluating.',
      actionLabel: 'Log a 1:1 now',
      actionTab: 'today',
      whyItMatters: 'The first ~20 events calibrate the system to your actual rhythm.',
    },
    BUILDING: {
      headline: 'LeadOS is learning your patterns.',
      instruction: `You have ${state.events.length} events. Log a couple weeks of recent history — 1:1s, decisions, goals — so trend-based rules have something to evaluate.`,
      actionLabel: 'Log recent events',
      actionTab: 'today',
    },
    LOGGING_CLEAN: {
      headline: 'No active findings. Good — but verify it.',
      instruction: 'Either your organization is genuinely clear, or there is unlogged data. Check: are all 1:1s current? Do all goals have owners? Are decisions closed with outcomes?',
      actionLabel: 'Review your data',
      actionTab: 'docs',
    },
    FINDING_NO_ACTION: {
      headline: `${findings.length} finding(s) are active. None acted on yet.`,
      instruction: `Your top finding is "${findings[0]?.title ?? ''}". Open its playbook from the Today tab and complete it — one leadership action, grounded in your data.`,
      actionLabel: 'Open top finding',
      actionTab: 'today',
      whyItMatters: 'A system you observe but never act on is just a display.',
    },
    ACTING: {
      headline: 'You are using LeadOS — now calibrate it.',
      instruction: 'Check Improve for threshold proposals based on your actual cadence, and review any coverage gaps.',
      actionLabel: 'Review proposals',
      actionTab: 'improve',
    },
    OPERATIONAL: {
      headline: 'LeadOS is fully operational for your context.',
      instruction: 'Keep logging decisions and their outcomes, check Memory periodically for accumulated institutional learnings, and revisit Improve as your rhythm shifts.',
      actionLabel: 'Open institutional memory',
      actionTab: 'memory',
    },
  };

  return { stage, guidance: GUIDANCE[stage] };
}
