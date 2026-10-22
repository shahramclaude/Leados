// src/lib/adaptation/manipulationGuard.ts
//
// Manipulation guard registry — Part 41.
//
// Every adaptation action that changes the UI must be classified as
// `presentation`, `emphasis`, or `sequence`. `emphasis`/`sequence` actions
// require a logged rationale + counterfactual ("what would the default show")
// and run through this guard before they are allowed to render. Banned
// adaptation patterns are enumerated below, each with its own detector.
//
// This module is pure: it takes an AdaptationAction + GuardContext and
// returns a verdict. Callers (presentationAdapter.ts, API routes) are
// responsible for logging verdicts and for falling back to the neutral
// default whenever a verdict is `blocked`.

export type AdaptationClass = "presentation" | "emphasis" | "sequence";

export interface AdaptationAction {
  id: string;
  surface: string;
  class: AdaptationClass;
  description: string;
  /** Required for emphasis/sequence: why this adaptation was applied. */
  rationale?: string;
  /** Required for emphasis/sequence: what the neutral default would have shown instead. */
  counterfactual?: string;
  /** Free-form text that will actually be rendered to the user, scanned by text-based detectors. */
  renderedText?: string;
  /** Labels of any buttons/links this action introduces (confirmshaming scan target). */
  buttonLabels?: string[];
  payload?: Record<string, unknown>;
}

export type BannedPattern =
  | "urgency_inflation"
  | "hiding_bad_news"
  | "loss_aversion_exploit"
  | "fake_scarcity"
  | "confirmshaming"
  | "missing_rationale";

export interface BannedPatternEntry {
  id: BannedPattern;
  title: string;
  description: string;
}

export const BANNED_PATTERNS: BannedPatternEntry[] = [
  {
    id: "urgency_inflation",
    title: "Urgency inflation",
    description: "Implying a deadline or time pressure that does not actually exist in the underlying data.",
  },
  {
    id: "hiding_bad_news",
    title: "Hiding bad news",
    description: "Demoting a critical/high-severity fact below where the neutral default would rank it.",
  },
  {
    id: "loss_aversion_exploit",
    title: "Loss-aversion exploitation",
    description: "Framing an outcome as a loss to provoke a reaction the data itself doesn't support.",
  },
  {
    id: "fake_scarcity",
    title: "Fake scarcity",
    description: "Suggesting limited availability/capacity that isn't grounded in real constraints.",
  },
  {
    id: "confirmshaming",
    title: "Confirmshaming",
    description: "Shaming or guilt-tripping language on an opt-out/decline control.",
  },
  {
    id: "missing_rationale",
    title: "Missing rationale",
    description: "An emphasis/sequence adaptation without a logged rationale and counterfactual.",
  },
];

export interface GuardContext {
  /** Neutral default order of fact ids (e.g. by severity, descending). */
  defaultOrder?: string[];
  /** The order this action proposes to apply, if it is a `sequence` action. */
  proposedOrder?: string[];
  severityById?: Record<string, "critical" | "high" | "medium" | "low" | "info">;
  /** Whether a real deadline exists in the underlying data. */
  deadlineExists?: boolean;
}

export interface GuardVerdict {
  actionId: string;
  blocked: boolean;
  pattern?: BannedPattern;
  reason: string;
}

const URGENCY_PHRASES = ["act now", "urgent", "immediately", "last chance", "don't wait", "hurry"];
const SCARCITY_PHRASES = ["only 1 left", "spots filling fast", "limited slots", "almost gone", "while supplies last"];
const LOSS_PHRASES = ["you will lose", "you're about to lose", "don't miss out", "you'll regret"];
const CONFIRMSHAME_PHRASES = [
  "no thanks, i don't care",
  "no, i don't want to save money",
  "i'll risk it",
  "no, i prefer to fail",
];

function containsPhrase(haystack: string, phrases: string[]): string | null {
  const lower = haystack.toLowerCase();
  for (const phrase of phrases) {
    if (lower.includes(phrase)) return phrase;
  }
  return null;
}

type Detector = (action: AdaptationAction, context: GuardContext) => GuardVerdict | null;

const missingRationaleDetector: Detector = (action) => {
  if (action.class === "presentation") return null;
  if (!action.rationale || !action.counterfactual) {
    return {
      actionId: action.id,
      blocked: true,
      pattern: "missing_rationale",
      reason: "emphasis/sequence adaptations require a rationale and a counterfactual before they may render",
    };
  }
  return null;
};

const urgencyInflationDetector: Detector = (action, context) => {
  if (!action.renderedText) return null;
  const hit = containsPhrase(action.renderedText, URGENCY_PHRASES);
  if (hit && !context.deadlineExists) {
    return {
      actionId: action.id,
      blocked: true,
      pattern: "urgency_inflation",
      reason: `rendered text implies urgency ("${hit}") but no deadline exists in the underlying data`,
    };
  }
  return null;
};

const fakeScarcityDetector: Detector = (action) => {
  if (!action.renderedText) return null;
  const hit = containsPhrase(action.renderedText, SCARCITY_PHRASES);
  if (hit) {
    return {
      actionId: action.id,
      blocked: true,
      pattern: "fake_scarcity",
      reason: `rendered text implies scarcity ("${hit}") — scarcity framing is banned in this executive context`,
    };
  }
  return null;
};

const lossAversionDetector: Detector = (action) => {
  if (!action.renderedText) return null;
  const hit = containsPhrase(action.renderedText, LOSS_PHRASES);
  if (hit && action.class === "emphasis") {
    return {
      actionId: action.id,
      blocked: true,
      pattern: "loss_aversion_exploit",
      reason: `emphasis adaptation uses loss-framed language ("${hit}") not directly grounded in a cited fact`,
    };
  }
  return null;
};

const confirmshamingDetector: Detector = (action) => {
  if (!action.buttonLabels || action.buttonLabels.length === 0) return null;
  for (const label of action.buttonLabels) {
    const hit = containsPhrase(label, CONFIRMSHAME_PHRASES);
    if (hit) {
      return {
        actionId: action.id,
        blocked: true,
        pattern: "confirmshaming",
        reason: `button label "${label}" uses confirmshaming language`,
      };
    }
  }
  return null;
};

const hidingBadNewsDetector: Detector = (action, context) => {
  if (action.class !== "sequence") return null;
  if (!context.defaultOrder || !context.proposedOrder || !context.severityById) return null;
  for (const factId of context.defaultOrder) {
    const severity = context.severityById[factId];
    if (severity !== "critical" && severity !== "high") continue;
    const defaultRank = context.defaultOrder.indexOf(factId);
    const proposedRank = context.proposedOrder.indexOf(factId);
    if (proposedRank === -1) continue;
    if (proposedRank > defaultRank) {
      return {
        actionId: action.id,
        blocked: true,
        pattern: "hiding_bad_news",
        reason: `fact "${factId}" (severity: ${severity}) would move from rank ${defaultRank} to ${proposedRank} — critical/high facts may never be demoted below the neutral default`,
      };
    }
  }
  return null;
};

const DETECTORS: Detector[] = [
  missingRationaleDetector,
  urgencyInflationDetector,
  fakeScarcityDetector,
  lossAversionDetector,
  confirmshamingDetector,
  hidingBadNewsDetector,
];

/** Run every detector against an action; returns the first blocking verdict, or a pass verdict. */
export function runGuard(action: AdaptationAction, context: GuardContext = {}): GuardVerdict {
  for (const detector of DETECTORS) {
    const verdict = detector(action, context);
    if (verdict) return verdict;
  }
  return { actionId: action.id, blocked: false, reason: "no banned pattern detected" };
}

/** Convenience used by tests to show "what would have happened without the guard". */
export function wouldRenderWithoutGuard(_action: AdaptationAction): true {
  return true;
}
