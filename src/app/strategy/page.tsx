import { db } from "@/db";
import { initiatives } from "@/db/schema";
import { desc } from "drizzle-orm";
import { createInitiative, deleteInitiative, updateInitiativeProgress } from "@/lib/actions";
import { Badge, Card, EmptyState, PageHeader, fmtDate } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS = ["planned", "active", "at_risk", "completed"] as const;

export default async function StrategyPage() {
  const rows = await db.select().from(initiatives).orderBy(desc(initiatives.createdAt));

  return (
    <div>
      <PageHeader
        title="Strategy & Execution"
        description="Strategic initiatives: objectives, ownership, and progress against target dates."
      />

      <Card className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Add an initiative</h2>
        <form action={createInitiative} className="grid gap-4 sm:grid-cols-2">
          <input name="title" required placeholder="Initiative title" className="input sm:col-span-2" />
          <input name="owner" required placeholder="Owner" className="input" />
          <input type="date" name="targetDate" className="input" />
          <textarea name="objective" placeholder="Objective" className="input sm:col-span-2" rows={2} />
          <button type="submit" className="btn-primary sm:col-span-2">
            Add initiative
          </button>
        </form>
      </Card>

      {rows.length === 0 ? (
        <EmptyState message="No initiatives yet." />
      ) : (
        <div className="space-y-4">
          {rows.map((initiative) => (
            <Card key={initiative.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">{initiative.title}</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Owner: {initiative.owner}
                    {initiative.targetDate ? ` · Target: ${fmtDate(initiative.targetDate)}` : ""}
                  </p>
                </div>
                <Badge value={initiative.status} />
              </div>
              {initiative.objective ? <p className="mt-3 text-sm text-slate-700">{initiative.objective}</p> : null}
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Progress</span>
                  <span>{initiative.progress}%</span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-indigo-600 transition-all"
                    style={{ width: `${Math.min(100, Math.max(0, initiative.progress))}%` }}
                  />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
                <form action={updateInitiativeProgress} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={initiative.id} />
                  <select name="status" defaultValue={initiative.status} className="input-sm">
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    name="progress"
                    min={0}
                    max={100}
                    defaultValue={initiative.progress}
                    className="input-sm w-20"
                  />
                  <button type="submit" className="btn-secondary">
                    Update
                  </button>
                </form>
                <form action={deleteInitiative}>
                  <input type="hidden" name="id" value={initiative.id} />
                  <button type="submit" className="btn-danger">
                    Delete
                  </button>
                </form>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
