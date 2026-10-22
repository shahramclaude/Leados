// src/lib/state/profileStore.ts
//
// Server-side persistence layer (Part 03 surface) reconstructed for Part 41.
// Wraps Drizzle access so API routes never touch the DB directly. All
// profile-shaping logic stays in the pure modules (familiarity, humanNeeds,
// aiLearning, presentationAdapter, manipulationGuard) — this file only
// reads/writes rows and translates them to/from those pure types.

import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import {
  adaptationAttentionProfiles,
  adaptationInteractionEvents,
  adaptationLogs,
  adaptationUserProfiles,
  cognitiveQuestionnaireResponses,
  manipulationGuardLogs,
} from "@/db/schema";
import { type Domain } from "@/lib/familiarity";
import { declaredStyleFromAnswers, type CognitiveStyleProfile } from "@/lib/humanNeeds";
import { reduceEvents, type InteractionEvent, type InteractionEventType, type LearnedProfile } from "@/lib/aiLearning";
import {
  defaultAttentionProfile,
  type AttentionProfile,
  type DigestTiming,
} from "@/lib/adaptation/attentionProfile";
import type { AppliedAction } from "@/lib/adaptation/presentationAdapter";
import type { DensityMode } from "@/lib/design/tokens";

const EVENT_LOOKBACK_MS = 180 * 24 * 60 * 60 * 1000;

export interface ProfileRow {
  userId: string;
  declaredStyle: CognitiveStyleProfile | null;
  densityModeOverride: DensityMode | null;
  adaptationPaused: boolean;
  onboardingCompleted: boolean;
  onboardingSkipped: boolean;
}

export async function getOrCreateProfileRow(userId: string): Promise<ProfileRow> {
  const existing = await db
    .select()
    .from(adaptationUserProfiles)
    .where(eq(adaptationUserProfiles.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    const row = existing[0];
    return {
      userId: row.userId,
      declaredStyle: row.declaredStyle,
      densityModeOverride: row.densityModeOverride,
      adaptationPaused: row.adaptationPaused,
      onboardingCompleted: row.onboardingCompleted,
      onboardingSkipped: row.onboardingSkipped,
    };
  }

  await db
    .insert(adaptationUserProfiles)
    .values({ userId })
    .onConflictDoNothing({ target: adaptationUserProfiles.userId });

  const inserted = await db
    .select()
    .from(adaptationUserProfiles)
    .where(eq(adaptationUserProfiles.userId, userId))
    .limit(1);
  const row = inserted[0];
  return {
    userId: row.userId,
    declaredStyle: row.declaredStyle,
    densityModeOverride: row.densityModeOverride,
    adaptationPaused: row.adaptationPaused,
    onboardingCompleted: row.onboardingCompleted,
    onboardingSkipped: row.onboardingSkipped,
  };
}

export interface ProfilePatch {
  densityModeOverride?: DensityMode | null;
  adaptationPaused?: boolean;
  onboardingCompleted?: boolean;
  onboardingSkipped?: boolean;
  declaredStyle?: CognitiveStyleProfile | null;
}

export async function updateProfileRow(userId: string, patch: ProfilePatch): Promise<ProfileRow> {
  await getOrCreateProfileRow(userId);
  await db
    .update(adaptationUserProfiles)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(adaptationUserProfiles.userId, userId));
  return getOrCreateProfileRow(userId);
}

/** Reset-to-default: clears density override and un-pauses. Restores the auto-adaptive baseline in one call. */
export async function resetProfileRow(userId: string): Promise<ProfileRow> {
  return updateProfileRow(userId, { densityModeOverride: null, adaptationPaused: false });
}

export async function setAdaptationPaused(userId: string, paused: boolean): Promise<ProfileRow> {
  return updateProfileRow(userId, { adaptationPaused: paused });
}

export async function recordInteractionEvent(
  userId: string,
  domain: Domain,
  eventType: InteractionEventType,
  magnitude: number,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await db.insert(adaptationInteractionEvents).values({
    userId,
    domain,
    eventType,
    magnitude: Math.max(0, Math.min(1, magnitude)),
    metadata: metadata ?? {},
  });
}

export async function getUsageCountsByQuestion(userId: string): Promise<Record<string, number>> {
  const events = await db
    .select()
    .from(adaptationInteractionEvents)
    .where(and(eq(adaptationInteractionEvents.userId, userId), eq(adaptationInteractionEvents.eventType, "question_select")));
  const counts: Record<string, number> = {};
  for (const event of events) {
    const questionId = (event.metadata as Record<string, unknown> | null)?.questionId;
    if (typeof questionId === "string") {
      counts[questionId] = (counts[questionId] ?? 0) + 1;
    }
  }
  return counts;
}

const FACT_USAGE_EVENT_TYPES: InteractionEventType[] = ["drilldown", "expand_detail", "time_on_detail"];

/** Usage counts keyed by `factId`, drawn from drill-down style events that carry `metadata.factId`. */
export async function getUsageCountsByFact(userId: string, domain: Domain): Promise<Record<string, number>> {
  const events = await db
    .select()
    .from(adaptationInteractionEvents)
    .where(and(eq(adaptationInteractionEvents.userId, userId), eq(adaptationInteractionEvents.domain, domain)));
  const counts: Record<string, number> = {};
  for (const event of events) {
    if (!FACT_USAGE_EVENT_TYPES.includes(event.eventType as InteractionEventType)) continue;
    const factId = (event.metadata as Record<string, unknown> | null)?.factId;
    if (typeof factId === "string") {
      counts[factId] = (counts[factId] ?? 0) + 1;
    }
  }
  return counts;
}

export async function getLearnedProfile(userId: string, now: number = Date.now()): Promise<LearnedProfile> {
  const since = new Date(now - EVENT_LOOKBACK_MS);
  const rows = await db
    .select()
    .from(adaptationInteractionEvents)
    .where(and(eq(adaptationInteractionEvents.userId, userId), gte(adaptationInteractionEvents.createdAt, since)))
    .orderBy(desc(adaptationInteractionEvents.createdAt));

  const events: InteractionEvent[] = rows.map((row) => ({
    domain: row.domain,
    eventType: row.eventType as InteractionEventType,
    magnitude: row.magnitude,
    timestamp: row.createdAt.getTime(),
  }));

  const profileRow = await getOrCreateProfileRow(userId);
  return reduceEvents(events, profileRow.declaredStyle, now);
}

export async function getOrCreateAttentionProfile(userId: string): Promise<AttentionProfile> {
  const existing = await db
    .select()
    .from(adaptationAttentionProfiles)
    .where(eq(adaptationAttentionProfiles.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    const row = existing[0];
    return {
      userId: row.userId,
      interruptThresholds: row.interruptThresholds as AttentionProfile["interruptThresholds"],
      digestTiming: row.digestTiming as DigestTiming,
      questionOrder: row.questionOrder,
    };
  }

  const defaults = defaultAttentionProfile(userId);
  await db
    .insert(adaptationAttentionProfiles)
    .values({
      userId,
      interruptThresholds: defaults.interruptThresholds,
      digestTiming: defaults.digestTiming,
      questionOrder: defaults.questionOrder,
    })
    .onConflictDoNothing({ target: adaptationAttentionProfiles.userId });
  return defaults;
}

export async function saveAttentionProfile(profile: AttentionProfile): Promise<AttentionProfile> {
  await getOrCreateAttentionProfile(profile.userId);
  await db
    .update(adaptationAttentionProfiles)
    .set({
      interruptThresholds: profile.interruptThresholds,
      digestTiming: profile.digestTiming,
      questionOrder: profile.questionOrder,
      updatedAt: new Date(),
    })
    .where(eq(adaptationAttentionProfiles.userId, profile.userId));
  return profile;
}

export async function getQuestionnaire(userId: string) {
  const rows = await db
    .select()
    .from(cognitiveQuestionnaireResponses)
    .where(eq(cognitiveQuestionnaireResponses.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function saveQuestionnaire(
  userId: string,
  answers: { detailVsSummary: number; visualVsTabular: number; deliberativeVsQuick: number },
): Promise<CognitiveStyleProfile> {
  const style = declaredStyleFromAnswers(answers);
  await db
    .insert(cognitiveQuestionnaireResponses)
    .values({ userId, ...answers })
    .onConflictDoUpdate({
      target: cognitiveQuestionnaireResponses.userId,
      set: { ...answers, updatedAt: new Date() },
    });
  await updateProfileRow(userId, { declaredStyle: style, onboardingCompleted: true, onboardingSkipped: false });
  return style;
}

export async function skipQuestionnaire(userId: string): Promise<void> {
  await updateProfileRow(userId, { onboardingSkipped: true });
}

export async function logAppliedActions(userId: string, actions: AppliedAction[]): Promise<void> {
  if (actions.length === 0) return;
  await db.insert(adaptationLogs).values(
    actions.map((action) => ({
      userId,
      surface: action.surface,
      actionId: action.id,
      actionClass: action.class,
      description: action.description,
      rationale: action.rationale ?? null,
      counterfactual: action.counterfactual ?? null,
      blocked: action.verdict.blocked,
    })),
  );
  await db.insert(manipulationGuardLogs).values(
    actions.map((action) => ({
      actionId: action.verdict.actionId,
      blocked: action.verdict.blocked,
      pattern: action.verdict.pattern ?? null,
      reason: action.verdict.reason,
    })),
  );
}
