// Board effectiveness indicators — board-level aggregates only.
// Individual-director scoring is structurally blocked unless a documented
// governance_policy record exists (an explicit board decision), per the
// standing order: "never individual director scoring without the board's
// own governance decision (documented policy)".

import { db } from "@/db";
import {
  resolutions,
  resolutionImplementationLinks,
  boardMeetings,
  agendaItems,
  governancePolicy,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { informationRequestMetrics } from "./informationRequests";
import { findUnlinkedResolutions } from "./resolutions";

export class IndividualScoringNotAuthorizedError extends Error {
  constructor() {
    super(
      "Individual director scoring is disabled. It requires a documented governance_policy record created by an explicit board decision (key: 'individual_director_scoring_enabled').",
    );
    this.name = "IndividualScoringNotAuthorizedError";
  }
}

/** Hard stop used by any future individual-level metric. There is no code
 * path that returns individual-director numbers without this check passing
 * first. */
export async function assertIndividualScoringPolicyEnabled() {
  const [policy] = await db
    .select()
    .from(governancePolicy)
    .where(eq(governancePolicy.key, "individual_director_scoring_enabled"));
  if (!policy || policy.value !== true) {
    throw new IndividualScoringNotAuthorizedError();
  }
  return policy;
}

export async function decisionLatencyMetric() {
  const all = await db.select().from(resolutions);
  const decided = all.filter((r) => r.decidedAt);
  const latenciesDays = decided.map(
    (r) => (r.decidedAt!.getTime() - r.proposedAt.getTime()) / (24 * 60 * 60 * 1000),
  );
  const avg =
    latenciesDays.length > 0
      ? latenciesDays.reduce((a, b) => a + b, 0) / latenciesDays.length
      : 0;
  return {
    resolutionsDecided: decided.length,
    averageDecisionLatencyDays: Math.round(avg * 10) / 10,
  };
}

export async function followThroughMetric() {
  const passed = await db.select().from(resolutions).where(eq(resolutions.status, "passed"));
  let linkedCount = 0;
  for (const r of passed) {
    const links = await db
      .select()
      .from(resolutionImplementationLinks)
      .where(eq(resolutionImplementationLinks.resolutionId, r.id));
    if (links.length > 0) linkedCount += 1;
  }
  const unlinked = await findUnlinkedResolutions();
  return {
    resolutionsPassed: passed.length,
    resolutionsLinkedToImplementation: linkedCount,
    followThroughRate: passed.length > 0 ? linkedCount / passed.length : 1,
    unlinkedFlaggedCount: unlinked.length,
    unlinkedFlagged: unlinked.map((r) => ({ id: r.id, text: r.text })),
  };
}

export async function meetingValueDensityMetric() {
  const meetings = await db.select().from(boardMeetings);
  const out = [];
  for (const meeting of meetings) {
    const agenda = await db
      .select()
      .from(agendaItems)
      .where(eq(agendaItems.meetingId, meeting.id));
    const resolutionsAtMeeting = await db
      .select()
      .from(resolutions)
      .where(eq(resolutions.meetingId, meeting.id));
    const decided = resolutionsAtMeeting.filter((r) => r.status !== "proposed");
    out.push({
      meetingId: meeting.id,
      agendaItemCount: agenda.length,
      resolutionsConsidered: resolutionsAtMeeting.length,
      resolutionsDecided: decided.length,
      // "value density" approximated as decisions reached per agenda item —
      // from Part 45's meeting-value-density concept.
      valueDensity: agenda.length > 0 ? decided.length / agenda.length : 0,
    });
  }
  return out;
}

export async function boardEffectivenessSummary() {
  const [latency, followThrough, infoRequestMetrics, density] = await Promise.all([
    decisionLatencyMetric(),
    followThroughMetric(),
    informationRequestMetrics(),
    meetingValueDensityMetric(),
  ]);

  return {
    decisionLatency: latency,
    resolutionFollowThrough: followThrough,
    informationRequests: infoRequestMetrics,
    meetingValueDensity: density,
    scope: "board-level aggregate only — no individual director scoring without documented board policy",
  };
}
