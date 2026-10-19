import type { Viewer } from "../../domain/types";
import { canView } from "../../domain/people/privacy";
import { growthRepository } from "../../platform/db/growthRepository";
import { accessAuditRepository } from "../../platform/db/accessAuditRepository";
import { eventsRepository } from "../../platform/db/eventsRepository";
import { computeGrowthProgress } from "../../domain/people/growth";

export async function listGrowthPlans(viewer: Viewer, personId: number) {
  const allowed = canView(viewer, personId, "growthPlan");
  await accessAuditRepository.log({
    viewer,
    subjectId: personId,
    resource: "growthPlan.list",
    fieldsRedacted: allowed ? [] : ["all"],
    allowed,
    reason: allowed ? "Self/manager/HR may view growth plans." : "Growth plans are visible to self, manager, and HR only.",
  });
  if (!allowed) return { ok: false as const, error: "forbidden" };

  const plans = await growthRepository.listForPerson(personId);
  return { ok: true as const, plans: plans.map((p) => ({ ...p, progress: computeGrowthProgress(p) })) };
}

export async function createGrowthPlan(viewer: Viewer, personId: number, title: string) {
  const allowed = viewer.id === personId || viewer.role === "manager" || viewer.role === "hr";
  if (!allowed) return { ok: false as const, error: "forbidden" };
  const plan = await growthRepository.createPlan({ personId, title });
  return { ok: true as const, plan };
}

export async function addMilestone(
  viewer: Viewer,
  personId: number,
  input: { planId: number; title: string; skill: string; targetDate?: string | null },
) {
  const allowed = viewer.id === personId || viewer.role === "manager" || viewer.role === "hr";
  if (!allowed) return { ok: false as const, error: "forbidden" };
  const milestone = await growthRepository.addMilestone(input);
  return { ok: true as const, milestone };
}

export async function completeMilestone(
  viewer: Viewer,
  personId: number,
  planId: number,
  milestoneId: number,
  evidence: string,
) {
  const allowed = viewer.id === personId || viewer.role === "manager" || viewer.role === "hr";
  if (!allowed) return { ok: false as const, error: "forbidden" };
  const milestone = await growthRepository.completeMilestone(milestoneId, evidence);
  if (!milestone) return { ok: false as const, error: "not_found" };

  await eventsRepository.record({
    type: "growth.milestone_completed",
    version: 1,
    subjectId: personId,
    actorId: viewer.id,
    payload: { personId, planId, milestoneId, skill: milestone.skill, evidence },
  });

  return { ok: true as const, milestone };
}
