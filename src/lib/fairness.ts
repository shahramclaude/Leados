// Part 09 reconstruction + Part 43 extension: fairness/disparity auditing,
// now covering coaching-access and feedback-distribution surfaces as
// required by Phase 3(e)/Phase 4(4). Every reported row carries its sample
// size; any group smaller than MIN_SAMPLE_SIZE is suppressed from
// disaggregated output to avoid re-identifying individuals through small
// cells — it still counts in the overall total.

import { db } from "@/db";
import { accessAuditLog, coachingSessions, feedbackInvitations, feedbackRequests, people } from "@/db/schema";
import { newId } from "@/lib/ids";
import { eq } from "drizzle-orm";

export const MIN_SAMPLE_SIZE = 5;

export async function logAccess(params: {
  actorId: string;
  actorRole: string;
  action: string;
  targetPersonId?: string;
  surface: "coaching" | "feedback" | "growth" | "one_on_one";
  allowed: boolean;
  reason: string;
}): Promise<void> {
  await db.insert(accessAuditLog).values({ id: newId("audit"), ...params });
}

export type GroupMetric = {
  group: string;
  sampleSize: number;
  value: number; // e.g. proportion with >=1 coaching session
  suppressed: boolean;
};

export type DisparityReport = {
  surface: string;
  metric: string;
  groups: GroupMetric[];
  maxObservedDisparity: number | null; // max-min across NON-suppressed groups
  note: string;
};

function groupBy<T, K extends string>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k) ?? [];
    list.push(item);
    map.set(k, list);
  }
  return map;
}

/** Coaching-access audit: proportion of each demographic group that has
 * started at least one coaching session, with sample sizes. */
export async function coachingAccessAudit(): Promise<DisparityReport> {
  const allPeople = await db.select().from(people);
  const allSessions = await db.select().from(coachingSessions);
  const peopleWithSession = new Set(allSessions.map((s) => s.personId));

  const byGroup = groupBy(allPeople, (p) => p.demographicGroup ?? "undeclared");
  const groups: GroupMetric[] = [];
  for (const [group, members] of byGroup) {
    const sampleSize = members.length;
    const withSession = members.filter((m) => peopleWithSession.has(m.id)).length;
    const value = sampleSize > 0 ? Number((withSession / sampleSize).toFixed(3)) : 0;
    groups.push({ group, sampleSize, value, suppressed: sampleSize < MIN_SAMPLE_SIZE });
  }

  const visible = groups.filter((g) => !g.suppressed);
  const maxObservedDisparity =
    visible.length >= 2 ? Number((Math.max(...visible.map((g) => g.value)) - Math.min(...visible.map((g) => g.value))).toFixed(3)) : null;

  return {
    surface: "coaching",
    metric: "share_of_group_with_at_least_one_coaching_session",
    groups,
    maxObservedDisparity,
    note: `Groups with n<${MIN_SAMPLE_SIZE} are suppressed from disaggregated reporting to protect privacy.`,
  };
}

/** Feedback-distribution audit: are some groups systematically asked to give
 * less feedback, or do their feedback requests resolve less often (stuck
 * below the confidentiality threshold, meaning they get no signal back)? */
export async function feedbackDistributionAudit(): Promise<DisparityReport> {
  const allPeople = await db.select().from(people);
  const allRequests = await db.select().from(feedbackRequests);
  const allInvitations = await db.select().from(feedbackInvitations);

  const respondedCountByRequest = new Map<string, number>();
  for (const inv of allInvitations) {
    if (inv.status === "responded") {
      respondedCountByRequest.set(inv.requestId, (respondedCountByRequest.get(inv.requestId) ?? 0) + 1);
    }
  }

  const requestsBySubject = groupBy(allRequests, (r) => r.subjectId);
  const byGroup = groupBy(allPeople, (p) => p.demographicGroup ?? "undeclared");

  const groups: GroupMetric[] = [];
  for (const [group, members] of byGroup) {
    const sampleSize = members.length;
    let resolved = 0;
    let total = 0;
    for (const member of members) {
      const requests = requestsBySubject.get(member.id) ?? [];
      for (const r of requests) {
        total += 1;
        if ((respondedCountByRequest.get(r.id) ?? 0) >= r.aggregationThreshold) resolved += 1;
      }
    }
    const value = total > 0 ? Number((resolved / total).toFixed(3)) : 0;
    groups.push({ group, sampleSize, value, suppressed: sampleSize < MIN_SAMPLE_SIZE });
  }

  const visible = groups.filter((g) => !g.suppressed);
  const maxObservedDisparity =
    visible.length >= 2 ? Number((Math.max(...visible.map((g) => g.value)) - Math.min(...visible.map((g) => g.value))).toFixed(3)) : null;

  return {
    surface: "feedback",
    metric: "share_of_feedback_requests_reaching_confidentiality_threshold",
    groups,
    maxObservedDisparity,
    note: `Groups with n<${MIN_SAMPLE_SIZE} are suppressed from disaggregated reporting to protect privacy. Low resolution rates may indicate under-staffed rater pools rather than bias — investigate before acting.`,
  };
}

export async function fullFairnessReport() {
  return {
    generatedAt: new Date().toISOString(),
    minSampleSize: MIN_SAMPLE_SIZE,
    reports: [await coachingAccessAudit(), await feedbackDistributionAudit()],
  };
}
