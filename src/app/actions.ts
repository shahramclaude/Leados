"use server";

// Part 43 server actions — thin, auditable wrappers around the lib modules.
// Every mutation that touches a cross-person surface (manager views,
// feedback) logs an access-audit row so the fairness/confidentiality tests
// (and any future audit UI) have a real trail.

import { revalidatePath } from "next/cache";
import {
  createGrowthGoal,
  recordEvidenceEvent,
  recommendGrowthPaths,
  type EvidenceEventType,
} from "@/lib/development";
import {
  createFeedbackRequest,
  linkFeedbackThemeToGrowth,
  submitFeedbackResponse,
  type ConfidentialityPolicy,
} from "@/lib/feedback";
import {
  confirmCommitment,
  postPersonTurn,
  startCoachingSession,
  recordCommitmentProgress,
} from "@/lib/coaching";
import {
  acknowledgeNudge,
  generateNudgesForManager,
  scheduleOneOnOne,
} from "@/lib/managerEnablement";
import { logAccess } from "@/lib/fairness";

export async function createGoalAction(params: {
  personId: string;
  competencyId: string;
  title: string;
  description: string;
  visibility: "private" | "shared_with_manager";
}) {
  await createGrowthGoal(params);
  revalidatePath(`/dashboard/${params.personId}`);
}

export async function recordEvidenceAction(params: {
  personId: string;
  competencyId: string;
  eventType: EvidenceEventType;
  narrative: string;
  evidenceWeight: number;
}) {
  await recordEvidenceEvent(params);
  revalidatePath(`/dashboard/${params.personId}`);
}

export async function computeRecommendationsAction(personId: string) {
  await recommendGrowthPaths(personId);
  revalidatePath(`/dashboard/${personId}`);
}

export async function createFeedbackRequestAction(params: {
  subjectId: string;
  themeCompetencyId?: string;
  message: string;
  confidentialityPolicy: ConfidentialityPolicy;
  aggregationThreshold: number;
  raterIds: string[];
}) {
  await createFeedbackRequest({ ...params, requestedById: params.subjectId });
  revalidatePath(`/dashboard/${params.subjectId}/feedback`);
}

export async function submitFeedbackResponseAction(params: {
  invitationId: string;
  raterId: string;
  qualitativeText: string;
  ratingValue: number;
  ratingKey: string;
  attributionConsent?: boolean;
  returnPersonId: string;
}) {
  await submitFeedbackResponse({
    invitationId: params.invitationId,
    raterId: params.raterId,
    ratingsJson: { [params.ratingKey]: params.ratingValue },
    qualitativeText: params.qualitativeText,
    attributionConsent: params.attributionConsent,
  });
  revalidatePath(`/dashboard/${params.returnPersonId}/feedback`);
}

export async function linkFeedbackThemeAction(params: {
  requestId: string;
  subjectId: string;
  competencyId: string;
  developmentThemeSummary: string;
  consent: boolean;
}) {
  await linkFeedbackThemeToGrowth(params);
  revalidatePath(`/dashboard/${params.subjectId}/feedback`);
  revalidatePath(`/dashboard/${params.subjectId}`);
}

export async function startCoachingSessionAction(personId: string, topic: string) {
  const { session } = await startCoachingSession(personId, topic);
  revalidatePath(`/dashboard/${personId}/coach`);
  return session.id;
}

export async function postCoachingTurnAction(sessionId: string, personId: string, content: string) {
  await postPersonTurn(sessionId, personId, content);
  revalidatePath(`/dashboard/${personId}/coach/${sessionId}`);
}

export async function confirmCommitmentAction(params: {
  sessionId: string;
  personId: string;
  title: string;
  description: string;
  competencyId?: string;
  visibility: "private" | "shared_with_manager";
}) {
  await confirmCommitment(params);
  revalidatePath(`/dashboard/${params.personId}/coach/${params.sessionId}`);
  revalidatePath(`/dashboard/${params.personId}`);
  revalidatePath(`/dashboard/${params.personId}/one-on-one`);
}

export async function recordCommitmentProgressAction(
  commitmentId: string,
  personId: string,
  status: "open" | "in_progress" | "done" | "dropped",
) {
  await recordCommitmentProgress(commitmentId, personId, status);
  revalidatePath(`/dashboard/${personId}`);
  revalidatePath(`/dashboard/${personId}/one-on-one`);
}

export async function scheduleOneOnOneAction(managerId: string, personId: string, scheduledAt: string) {
  await scheduleOneOnOne({ managerId, personId, scheduledAt: new Date(scheduledAt) });
  revalidatePath(`/manager/${managerId}/${personId}`);
  revalidatePath(`/dashboard/${personId}/one-on-one`);
}

export async function generateNudgesAction(managerId: string, personId: string) {
  await logAccess({
    actorId: managerId,
    actorRole: "manager",
    action: "generate_nudges",
    targetPersonId: personId,
    surface: "growth",
    allowed: true,
    reason: "Manager generated nudges from the person's own shared goals/commitments only.",
  });
  await generateNudgesForManager(managerId, personId);
  revalidatePath(`/manager/${managerId}/${personId}`);
}

export async function acknowledgeNudgeAction(nudgeId: string, managerId: string, personId: string) {
  await acknowledgeNudge(nudgeId);
  revalidatePath(`/manager/${managerId}/${personId}`);
}
