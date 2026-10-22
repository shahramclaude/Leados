// src/lib/adaptation/attentionProfile.ts
//
// Personal attention profile — extends Part 14. Individual interrupt
// thresholds, digest timing, and preferred question ordering (Part 32's
// ontology reordered per usage). Every field here is user-editable and the
// defaults are transparent, documented values — never silently tuned.

import { DOMAINS, type Domain } from "@/lib/familiarity";
import { defaultQuestionOrder, QUESTION_ONTOLOGY } from "@/lib/executive/ontology";

export type DigestTiming = "realtime" | "daily-08:00" | "daily-17:00" | "weekly-mon-08:00";

export const DIGEST_TIMING_OPTIONS: DigestTiming[] = ["realtime", "daily-08:00", "daily-17:00", "weekly-mon-08:00"];

export interface AttentionProfile {
  userId: string;
  /** 0..1 per domain — higher means "only interrupt me for more severe issues". */
  interruptThresholds: Record<Domain, number>;
  digestTiming: DigestTiming;
  /** Ontology question ids, in the order they should be presented to this user. */
  questionOrder: string[];
}

const DEFAULT_INTERRUPT_THRESHOLDS: Record<Domain, number> = {
  finance: 0.6,
  people: 0.6,
  risk: 0.5,
  tech: 0.6,
};

export function defaultAttentionProfile(userId: string): AttentionProfile {
  return {
    userId,
    interruptThresholds: { ...DEFAULT_INTERRUPT_THRESHOLDS },
    digestTiming: "daily-08:00",
    questionOrder: defaultQuestionOrder(),
  };
}

export function setInterruptThreshold(profile: AttentionProfile, domain: Domain, value: number): AttentionProfile {
  const clamped = Math.max(0, Math.min(1, value));
  return { ...profile, interruptThresholds: { ...profile.interruptThresholds, [domain]: clamped } };
}

export function setDigestTiming(profile: AttentionProfile, timing: DigestTiming): AttentionProfile {
  return { ...profile, digestTiming: timing };
}

function isValidQuestionOrder(order: string[]): boolean {
  const known = new Set(QUESTION_ONTOLOGY.map((q) => q.id));
  if (order.length !== known.size) return false;
  const seen = new Set<string>();
  for (const id of order) {
    if (!known.has(id) || seen.has(id)) return false;
    seen.add(id);
  }
  return true;
}

/** User-initiated reorder (e.g. drag/drop in settings). Rejects invalid/partial sets. */
export function reorderQuestions(profile: AttentionProfile, newOrder: string[]): AttentionProfile {
  if (!isValidQuestionOrder(newOrder)) {
    throw new Error("reorderQuestions: newOrder must contain every ontology question id exactly once");
  }
  return { ...profile, questionOrder: newOrder };
}

export function resetAttentionProfile(userId: string): AttentionProfile {
  return defaultAttentionProfile(userId);
}

/**
 * Suggest a usage-weighted reorder (most-asked questions first), as a
 * SUGGESTION only. Callers must route the result through the manipulation
 * guard (it is a `sequence`-class adaptation) before applying it, and must
 * never demote a question whose domain currently has a critical fact.
 */
export function suggestQuestionOrderFromUsage(usageCounts: Record<string, number>): string[] {
  return [...QUESTION_ONTOLOGY]
    .sort((a, b) => {
      const ua = usageCounts[a.id] ?? 0;
      const ub = usageCounts[b.id] ?? 0;
      if (ua !== ub) return ub - ua;
      return b.defaultWeight - a.defaultWeight;
    })
    .map((q) => q.id);
}

export function allDomains(): Domain[] {
  return [...DOMAINS];
}
