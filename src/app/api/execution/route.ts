import { db } from "@/db";
import { execProjects, execMilestones, execBlockers, execDependencies } from "@/db/schema";
import { jsonError } from "@/lib/api";
import { analyzeProject, buildDependencyMap, type ExecBlocker, type ExecMilestone, type ExecProjectRecord } from "@/lib/executionEngine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [projectRows, milestoneRows, blockerRows, dependencyRows] = await Promise.all([
      db.select().from(execProjects),
      db.select().from(execMilestones),
      db.select().from(execBlockers),
      db.select().from(execDependencies),
    ]);

    const reports = new Map<number, ReturnType<typeof analyzeProject>>();
    const summaries = projectRows.map((p) => {
      const project: ExecProjectRecord = { id: p.id, name: p.name, status: p.status, startDate: p.startDate, targetDate: p.targetDate };
      const milestones: ExecMilestone[] = milestoneRows
        .filter((m) => m.projectId === p.id)
        .map((m) => ({ id: m.id, projectId: m.projectId, title: m.title, durationDays: m.durationDays, durationP90Days: m.durationP90Days, dependsOn: (m.dependsOn as number[]) ?? [], dueDate: m.dueDate, status: m.status as ExecMilestone["status"], completedAt: m.completedAt ? m.completedAt.toISOString() : null }));
      const blockers: ExecBlocker[] = blockerRows
        .filter((b) => b.projectId === p.id)
        .map((b) => ({ id: b.id, projectId: b.projectId, milestoneId: b.milestoneId, title: b.title, severity: b.severity as ExecBlocker["severity"], impactDays: b.impactDays, raisedAt: b.raisedAt.toISOString(), resolvedAt: b.resolvedAt ? b.resolvedAt.toISOString() : null }));
      const report = analyzeProject(project, milestones, blockers);
      reports.set(p.id, report);
      return report;
    });

    const dependencyMap = buildDependencyMap(
      dependencyRows.map((d) => ({ upstreamProjectId: d.upstreamProjectId, downstreamProjectId: d.downstreamProjectId, note: d.note })),
      reports,
    );

    return Response.json({ projects: summaries, dependencyMap });
  } catch (err) {
    return jsonError((err as Error).message, 500);
  }
}
