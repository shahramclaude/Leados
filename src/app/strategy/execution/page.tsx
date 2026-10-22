import { listInitiatives, listMilestones, listTeams } from "@/lib/strategy/initiatives";
import { listObjectives } from "@/lib/strategy/objectives";
import { rankInitiatives } from "@/lib/strategy/initiativesEngine";
import { computeCriticalPath, deliveryDateDistribution } from "@/lib/strategy/portfolioMath";
import { ExecutionTable, type ExecutionRow } from "../_components/ExecutionTable";

export const dynamic = "force-dynamic";

export default async function ExecutionBoardPage() {
  const [initiatives, milestones, teams, objectives] = await Promise.all([
    listInitiatives(),
    listMilestones(),
    listTeams(),
    listObjectives(),
  ]);

  const ranked = rankInitiatives(initiatives);
  const objectivesById = new Map(objectives.map((o) => [o.id, o]));
  const teamsById = new Map(teams.map((t) => [t.id, t]));

  const rows: ExecutionRow[] = ranked.map((r, idx) => {
    const path = computeCriticalPath(r.initiative.id, milestones);
    const dist =
      path.path.length > 0 && r.initiative.startDate
        ? deliveryDateDistribution(r.initiative.startDate, path.totalTe, path.totalVariance)
        : null;
    return {
      id: r.initiative.id,
      title: r.initiative.title,
      status: r.initiative.status,
      blockerNote: r.initiative.blockerNote,
      wsjf: r.wsjf,
      rank: idx + 1,
      teamName: r.initiative.teamId ? teamsById.get(r.initiative.teamId)?.name ?? null : null,
      budgetAllocated: r.initiative.budgetAllocated,
      budgetSpent: r.initiative.budgetSpent,
      p50: dist?.p50 ?? null,
      p80: dist?.p80 ?? null,
      p95: dist?.p95 ?? null,
      objectiveTitle: objectivesById.get(r.initiative.objectiveId)?.title ?? r.initiative.objectiveId,
      objectiveId: r.initiative.objectiveId,
    };
  });

  const totalBudget = initiatives.reduce((s, i) => s + i.budgetAllocated, 0);
  const totalSpent = initiatives.reduce((s, i) => s + i.budgetSpent, 0);
  const blockedCount = initiatives.filter((i) => i.status === "blocked").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">Execution Board</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Initiatives ranked by WSJF = (timeCriticality + riskReduction + userValue) / jobSize. Delivery dates are a
          PERT-derived Normal(Σtₑ, Σσ²) distribution along the critical path — P50/P80/P95 are confidence bands, not
          commitments.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 sm:max-w-xl">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase text-slate-500">Budget burn</p>
          <p className="mt-1 text-lg font-semibold text-slate-950">
            ${totalSpent.toLocaleString()} / ${totalBudget.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase text-slate-500">Blocked</p>
          <p className="mt-1 text-lg font-semibold text-rose-600">{blockedCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase text-slate-500">Total initiatives</p>
          <p className="mt-1 text-lg font-semibold text-slate-950">{initiatives.length}</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-slate-500">No initiatives yet. Seed demo data from the overview page.</p>
      ) : (
        <ExecutionTable rows={rows} />
      )}
    </div>
  );
}
