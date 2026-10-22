// Persists a small synthetic org into the database so the Strategy Map,
// Execution Board, Drift Radar, and Review Cadence pages have something real
// to render. Idempotent: clears previously-seeded demo rows first (tracked
// via the "demo-" id prefix convention is avoided in favor of a full wipe of
// the strategy tables, since this is a demo/dev seed, not production data).
import { db } from "@/db";
import {
  evidenceRefs,
  initiativeMilestones,
  initiatives,
  keyResults,
  northStarMetrics,
  objectiveLinks,
  objectives,
  strategyBriefs,
  teams,
} from "@/db/schema";
import { generateSyntheticOrg } from "./seedDemo";

export async function seedDemoData(objectiveCount = 24): Promise<{ objectives: number; initiatives: number }> {
  const org = generateSyntheticOrg(objectiveCount, 7);

  // Wipe in FK-safe order.
  await db.delete(evidenceRefs);
  await db.delete(initiativeMilestones);
  await db.delete(initiatives);
  await db.delete(keyResults);
  await db.delete(objectiveLinks);
  await db.delete(objectives);
  await db.delete(teams);
  await db.delete(northStarMetrics);
  await db.delete(strategyBriefs);

  if (org.teams.length > 0) {
    await db.insert(teams).values(org.teams.map((t) => ({ id: t.id, name: t.name, capacityHoursPerWeek: t.capacityHoursPerWeek, skills: t.skills })));
  }
  if (org.objectives.length > 0) {
    await db.insert(objectives).values(
      org.objectives.map((o) => ({
        id: o.id,
        title: o.title,
        description: "",
        level: o.level,
        timeframe: o.timeframe,
        ownerName: o.ownerName,
        status: o.status,
        stretch: o.stretch,
        isNorthStarAligned: o.isNorthStarAligned,
        parentId: o.parentId,
        priorityRank: o.priorityRank,
      })),
    );
  }
  if (org.links.length > 0) {
    await db.insert(objectiveLinks).values(
      org.links.map((l) => ({ id: l.id, fromObjectiveId: l.fromObjectiveId, toObjectiveId: l.toObjectiveId, linkType: l.linkType })),
    );
  }
  if (org.keyResults.length > 0) {
    await db.insert(keyResults).values(
      org.keyResults.map((k) => ({
        id: k.id,
        objectiveId: k.objectiveId,
        title: k.title,
        baseline: k.baseline,
        target: k.target,
        current: k.current,
        unit: k.unit,
        direction: k.direction,
        progressMode: k.progressMode,
        weight: k.weight,
        stretch: k.stretch,
        confidenceClass: k.confidenceClass,
        milestonesTotal: k.milestonesTotal,
        milestonesComplete: k.milestonesComplete,
        thresholdValue: k.thresholdValue,
      })),
    );
  }
  if (org.evidence.length > 0) {
    await db.insert(evidenceRefs).values(
      org.evidence.map((e) => ({
        id: e.id,
        keyResultId: e.keyResultId,
        sourceType: e.sourceType,
        sourceId: e.sourceId,
        value: e.value,
        observedAt: new Date(e.observedAt),
        note: e.note,
      })),
    );
  }
  if (org.initiatives.length > 0) {
    await db.insert(initiatives).values(
      org.initiatives.map((i) => ({
        id: i.id,
        objectiveId: i.objectiveId,
        teamId: i.teamId,
        title: i.title,
        description: "",
        status: i.status,
        blockerNote: i.blockerNote,
        budgetAllocated: i.budgetAllocated,
        budgetSpent: i.budgetSpent,
        timeCriticality: i.timeCriticality,
        riskReduction: i.riskReduction,
        userValue: i.userValue,
        jobSize: i.jobSize,
        requiredSkill: i.requiredSkill,
        requiredHoursPerWeek: i.requiredHoursPerWeek,
        startDate: i.startDate ? new Date(i.startDate) : null,
        targetEndDate: i.targetEndDate ? new Date(i.targetEndDate) : null,
      })),
    );
  }
  if (org.milestones.length > 0) {
    await db.insert(initiativeMilestones).values(
      org.milestones.map((m) => ({
        id: m.id,
        initiativeId: m.initiativeId,
        name: m.name,
        sequence: m.sequence,
        dependsOnMilestoneId: m.dependsOnMilestoneId,
        optimisticDays: m.optimisticDays,
        mostLikelyDays: m.mostLikelyDays,
        pessimisticDays: m.pessimisticDays,
        status: m.status,
      })),
    );
  }

  await db.insert(northStarMetrics).values([
    { id: "ns-1", name: "Net Revenue Retention", unit: "%", currentValue: 104, targetValue: 115, observedAt: new Date() },
  ]);

  return { objectives: org.objectives.length, initiatives: org.initiatives.length };
}
