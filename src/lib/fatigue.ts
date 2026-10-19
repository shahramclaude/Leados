// src/lib/fatigue.ts
//
// NEW MODULE standing in for the "Part 2" fatigue/burnout model referenced
// by this brief (no prior file existed — see provenance note in
// src/lib/types.ts). Combines a workload-frequency proxy from logged
// events with 1:1 conversation burnout flags via noisy-OR fusion.

import type { ConversationSignals } from "./conversationIntelligence";
import type { LeadosEvent, PersonRecord } from "./types";
import { noisyOr } from "./beliefFabric";

/**
 * Burnout risk, 0-1. CITATION: src/lib/beliefFabric.ts, noisyOr() (fusion
 * formula cited there) combines three independent probability proxies:
 *  1. event-load proxy (more "goal"/"collab" events than a baseline rate)
 *  2. conversation burnout topic flags (severity-weighted)
 *  3. low self-reported psychological safety on recent pulse events
 * Caller: src/lib/talentEngine.ts (buildPersonProfile, 1 call site).
 */
export function computeBurnoutRisk(
  person: PersonRecord,
  recentEvents: LeadosEvent[],
  conversationSignals: ConversationSignals[]
): number {
  const personEvents = recentEvents.filter((e) => e.personId === person.id);

  const workloadEvents = personEvents.filter((e) => e.type === "goal" || e.type === "collab").length;
  const workloadProxy = Math.max(0, Math.min(1, workloadEvents / 12)); // UNVERIFIED heuristic scale

  const burnoutFlagSeverities = conversationSignals
    .flatMap((s) => s.topicFlags)
    .filter((f) => f.type === "burnout")
    .map((f) => f.severity / 3);
  const conversationProxy = burnoutFlagSeverities.length > 0 ? Math.max(...burnoutFlagSeverities) : 0;

  const pulseEvents = personEvents.filter(
    (e) => e.type === "pulse" && typeof e.psychologicalSafetyIndex === "number"
  );
  const avgPsychSafety =
    pulseEvents.length > 0
      ? pulseEvents.reduce((sum, e) => sum + (e.psychologicalSafetyIndex ?? 0.5), 0) / pulseEvents.length
      : 0.5;
  const lowSafetyProxy = Math.max(0, Math.min(1, 1 - avgPsychSafety));

  return Math.max(0, Math.min(1, noisyOr([workloadProxy, conversationProxy, lowSafetyProxy])));
}
