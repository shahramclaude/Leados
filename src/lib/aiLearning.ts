// src/lib/aiLearning.ts
//
// Learning/decay engine — Part 41.
//
// Ties familiarity.ts (expertise) and humanNeeds.ts (cognitive style)
// together into a single reducer over a stream of raw interaction events.
// Pure functions: given the same events + "now", always produces the same
// profile. No DB access here — src/lib/state/profileStore.ts persists this.

import {
  computeAllExpertise,
  defaultExpertise,
  DOMAINS,
  type Domain,
  type ExpertiseScore,
  type InteractionSignal,
} from "@/lib/familiarity";
import {
  blendStyle,
  DEFAULT_STYLE,
  inferCognitiveStyle,
  type BehaviorSample,
  type CognitiveStyleProfile,
  type StyleActionType,
} from "@/lib/humanNeeds";

export type InteractionEventType =
  | "drilldown"
  | "vocabulary_use"
  | "time_on_detail"
  | "time_on_summary"
  | "expand_detail"
  | "collapse_detail"
  | "switch_to_table"
  | "switch_to_chart"
  | "quick_decision"
  | "deliberate_review"
  | "question_select";

export interface InteractionEvent {
  domain: Domain;
  eventType: InteractionEventType;
  /** 0..1 normalized magnitude. */
  magnitude: number;
  timestamp: number;
}

export interface LearnedProfile {
  expertise: Record<Domain, ExpertiseScore>;
  inferredStyle: CognitiveStyleProfile;
  effectiveStyle: CognitiveStyleProfile;
  eventCount: number;
  asOf: number;
}

const EXPERTISE_EVENT_TYPES: Partial<Record<InteractionEventType, { depth?: number; vocabulary?: number; drilldown?: number }>> = {
  drilldown: { drilldown: 1, depth: 0.5 },
  vocabulary_use: { vocabulary: 1 },
  time_on_detail: { depth: 0.8 },
  expand_detail: { depth: 0.6, drilldown: 0.3 },
  question_select: { depth: 0.2 },
};

const STYLE_EVENT_TYPES: StyleActionType[] = [
  "expand_detail",
  "collapse_detail",
  "switch_to_table",
  "switch_to_chart",
  "time_on_detail",
  "time_on_summary",
  "quick_decision",
  "deliberate_review",
];

function toInteractionSignal(event: InteractionEvent): InteractionSignal | null {
  const mapping = EXPERTISE_EVENT_TYPES[event.eventType];
  if (!mapping) return null;
  return {
    domain: event.domain,
    depth: (mapping.depth ?? 0) * event.magnitude,
    vocabulary: (mapping.vocabulary ?? 0) * event.magnitude,
    drilldown: (mapping.drilldown ?? 0) * event.magnitude,
    timestamp: event.timestamp,
  };
}

function toBehaviorSample(event: InteractionEvent): BehaviorSample | null {
  if (!STYLE_EVENT_TYPES.includes(event.eventType as StyleActionType)) return null;
  return {
    domain: event.domain,
    action: event.eventType as StyleActionType,
    value: event.magnitude,
    timestamp: event.timestamp,
  };
}

/**
 * Reduce a raw event stream into a learned profile.
 * `declaredStyle` is the user's explicit questionnaire answer, if any — it is
 * blended with (never replaced outright by) inferred behavior.
 */
export function reduceEvents(
  events: InteractionEvent[],
  declaredStyle: CognitiveStyleProfile | null,
  now: number = Date.now(),
): LearnedProfile {
  const signals = events.map(toInteractionSignal).filter((s): s is InteractionSignal => s !== null);
  const samples = events.map(toBehaviorSample).filter((s): s is BehaviorSample => s !== null);

  const expertise = events.length === 0
    ? Object.fromEntries(DOMAINS.map((d) => [d, defaultExpertise(d, now)])) as Record<Domain, ExpertiseScore>
    : computeAllExpertise(signals, now);

  const inferredStyle = events.length === 0 ? DEFAULT_STYLE : inferCognitiveStyle(samples, now);
  const effectiveStyle = blendStyle(declaredStyle, inferredStyle);

  return { expertise, inferredStyle, effectiveStyle, eventCount: events.length, asOf: now };
}

/** Cold-start default — zero evidence, safe guided defaults, fully transparent. */
export function coldStartProfile(now: number = Date.now()): LearnedProfile {
  return reduceEvents([], null, now);
}
