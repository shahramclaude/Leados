// Part 43 — Phase 1/3(b): 360-style feedback with confidentiality enforced
// at the STORAGE layer (not just access control). See schema.ts comment on
// `feedbackResponses` for the no-link-ever-persisted guarantee.

import { db } from "@/db";
import {
  evidenceEvents,
  feedbackInvitations,
  feedbackRequests,
  feedbackResponses,
  feedbackThemeLinks,
} from "@/db/schema";
import { newId } from "@/lib/ids";
import { and, eq } from "drizzle-orm";

export type FeedbackRequest = typeof feedbackRequests.$inferSelect;
export type FeedbackInvitation = typeof feedbackInvitations.$inferSelect;
export type FeedbackResponse = typeof feedbackResponses.$inferSelect;
export type ConfidentialityPolicy = FeedbackRequest["confidentialityPolicy"];

export async function createFeedbackRequest(params: {
  subjectId: string;
  requestedById: string;
  themeCompetencyId?: string;
  message: string;
  confidentialityPolicy?: ConfidentialityPolicy;
  aggregationThreshold?: number;
  raterIds: string[];
}): Promise<{ request: FeedbackRequest; invitations: FeedbackInvitation[] }> {
  const [request] = await db
    .insert(feedbackRequests)
    .values({
      id: newId("fbreq"),
      subjectId: params.subjectId,
      requestedById: params.requestedById,
      themeCompetencyId: params.themeCompetencyId,
      message: params.message,
      confidentialityPolicy: params.confidentialityPolicy ?? "anonymous_aggregate",
      aggregationThreshold: params.aggregationThreshold ?? 3,
    })
    .returning();

  const invitations: FeedbackInvitation[] = [];
  for (const raterId of params.raterIds) {
    const [inv] = await db
      .insert(feedbackInvitations)
      .values({ id: newId("fbinv"), requestId: request.id, raterId })
      .returning();
    invitations.push(inv);
  }

  return { request, invitations };
}

export async function listInvitationsForRater(raterId: string): Promise<FeedbackInvitation[]> {
  return db.select().from(feedbackInvitations).where(eq(feedbackInvitations.raterId, raterId));
}

/**
 * Submit a response. This is the ONLY writer of `feedback_responses` in the
 * codebase. For anonymous policy, or when the rater declines attribution
 * consent even under an attributed policy, we deliberately do NOT persist
 * `invitationId`/`attributedRaterId` — the link to the rater's identity is
 * never written anywhere, so it cannot later be recovered by any query,
 * including raw SQL run outside the app.
 */
export async function submitFeedbackResponse(params: {
  invitationId: string;
  raterId: string;
  ratingsJson: Record<string, number>;
  qualitativeText: string;
  attributionConsent?: boolean;
}): Promise<FeedbackResponse> {
  const [invitation] = await db
    .select()
    .from(feedbackInvitations)
    .where(eq(feedbackInvitations.id, params.invitationId))
    .limit(1);
  if (!invitation) throw new Error("invitation not found");
  if (invitation.raterId !== params.raterId) throw new Error("rater mismatch");
  if (invitation.status === "responded") throw new Error("already responded");

  const [request] = await db
    .select()
    .from(feedbackRequests)
    .where(eq(feedbackRequests.id, invitation.requestId))
    .limit(1);
  if (!request) throw new Error("request not found");

  const canAttribute =
    request.confidentialityPolicy === "attributed_with_consent" && params.attributionConsent === true;

  const [response] = await db
    .insert(feedbackResponses)
    .values({
      id: newId("fbresp"),
      requestId: request.id,
      // Deliberately NULL unless attribution is both policy-permitted AND
      // explicitly consented to by the rater at submit time.
      invitationId: canAttribute ? invitation.id : null,
      attributedRaterId: canAttribute ? params.raterId : null,
      attributionConsent: canAttribute,
      ratingsJson: params.ratingsJson,
      qualitativeText: params.qualitativeText,
    })
    .returning();

  // Mark the invitation responded (for duplicate prevention / completion
  // tracking) WITHOUT this row ever being joinable to the response above
  // when anonymous — the update happens on a separate table keyed only by
  // invitation id, and the response row holds no invitation id in that case.
  await db
    .update(feedbackInvitations)
    .set({ status: "responded", respondedAt: new Date() })
    .where(eq(feedbackInvitations.id, invitation.id));

  return response;
}

export type FeedbackViewForSubject =
  | { status: "withheld"; respondedCount: number; threshold: number }
  | {
      status: "available";
      respondedCount: number;
      threshold: number;
      aggregateRatings: Record<string, number>;
      qualitativeExcerpts: string[];
    };

/**
 * The ONLY read path a subject (or anyone) gets for feedback content.
 * Enforces the aggregation threshold regardless of caller role — even an
 * admin cannot see below-threshold feedback through this function, and there
 * is no other function in the codebase that reads `feedback_responses`
 * content for display.
 */
export async function getFeedbackForSubject(requestId: string): Promise<FeedbackViewForSubject> {
  const [request] = await db.select().from(feedbackRequests).where(eq(feedbackRequests.id, requestId)).limit(1);
  if (!request) throw new Error("request not found");

  const responses = await db.select().from(feedbackResponses).where(eq(feedbackResponses.requestId, requestId));

  if (responses.length < request.aggregationThreshold) {
    return { status: "withheld", respondedCount: responses.length, threshold: request.aggregationThreshold };
  }

  const ratingTotals: Record<string, { sum: number; count: number }> = {};
  for (const r of responses) {
    for (const [key, value] of Object.entries(r.ratingsJson)) {
      ratingTotals[key] ??= { sum: 0, count: 0 };
      ratingTotals[key].sum += value;
      ratingTotals[key].count += 1;
    }
  }
  const aggregateRatings = Object.fromEntries(
    Object.entries(ratingTotals).map(([k, v]) => [k, Number((v.sum / v.count).toFixed(2))]),
  );

  return {
    status: "available",
    respondedCount: responses.length,
    threshold: request.aggregationThreshold,
    aggregateRatings,
    qualitativeExcerpts: responses.map((r) => r.qualitativeText),
  };
}

/**
 * Feedback-to-growth linkage: the SUBJECT must consent before an aggregate
 * feedback theme is turned into a development evidence event. Declining
 * leaves the feedback visible only inside Feedback Flows, never folded into
 * the growth graph.
 */
export async function linkFeedbackThemeToGrowth(params: {
  requestId: string;
  subjectId: string;
  competencyId: string;
  developmentThemeSummary: string;
  consent: boolean;
}): Promise<{ linked: boolean; evidenceEventId?: string }> {
  if (!params.consent) {
    await db.insert(feedbackThemeLinks).values({
      id: newId("fblink"),
      requestId: params.requestId,
      subjectId: params.subjectId,
      competencyId: params.competencyId,
      developmentThemeSummary: params.developmentThemeSummary,
      consentGivenAt: null,
    });
    return { linked: false };
  }

  const view = await getFeedbackForSubject(params.requestId);
  if (view.status !== "available") {
    throw new Error("cannot link below aggregation threshold");
  }

  const [evidenceRow] = await db
    .insert(evidenceEvents)
    .values({
      id: newId("evidence"),
      personId: params.subjectId,
      competencyId: params.competencyId,
      eventType: "peer_feedback_theme",
      narrative: params.developmentThemeSummary,
      evidenceWeight: 3.5,
      sourceRef: params.requestId,
      visibility: "private",
    })
    .returning();

  await db.insert(feedbackThemeLinks).values({
    id: newId("fblink"),
    requestId: params.requestId,
    subjectId: params.subjectId,
    competencyId: params.competencyId,
    developmentThemeSummary: params.developmentThemeSummary,
    consentGivenAt: new Date(),
    evidenceEventId: evidenceRow.id,
  });

  return { linked: true, evidenceEventId: evidenceRow.id };
}

export async function listRequestsForSubject(subjectId: string): Promise<FeedbackRequest[]> {
  return db.select().from(feedbackRequests).where(eq(feedbackRequests.subjectId, subjectId));
}

export type PendingInvitationWithRequest = FeedbackInvitation & { request: FeedbackRequest };

/** Invitations this person still owes a response for, joined with the
 * request so the UI can show the subject/message/confidentiality policy. */
export async function listPendingInvitationsForRater(raterId: string): Promise<PendingInvitationWithRequest[]> {
  const invitations = await db
    .select()
    .from(feedbackInvitations)
    .where(and(eq(feedbackInvitations.raterId, raterId), eq(feedbackInvitations.status, "pending")));

  const results: PendingInvitationWithRequest[] = [];
  for (const inv of invitations) {
    const [request] = await db.select().from(feedbackRequests).where(eq(feedbackRequests.id, inv.requestId)).limit(1);
    if (request) results.push({ ...inv, request });
  }
  return results;
}

export async function pendingInvitationFor(raterId: string, requestId: string) {
  const rows = await db
    .select()
    .from(feedbackInvitations)
    .where(and(eq(feedbackInvitations.raterId, raterId), eq(feedbackInvitations.requestId, requestId)));
  return rows[0];
}
