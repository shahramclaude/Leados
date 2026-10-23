import { db } from "@/db";
import { decisions } from "@/db/schema";
import { desc } from "drizzle-orm";
import { createDecision, deleteDecision, updateDecisionStatus } from "@/lib/actions";
import { Badge, Card, EmptyState, PageHeader, fmtDate } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS = ["proposed", "under_review", "committed", "implemented", "reversed"] as const;

export default async function DecisionsPage() {
  const rows = await db.select().from(decisions).orderBy(desc(decisions.createdAt));

  return (
    <div>
      <PageHeader
        title="Decisions"
        description="A governed decision log: what was decided, by whom, why, and its current status."
      />

      <Card className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Log a new decision</h2>
        <form action={createDecision} className="grid gap-4 sm:grid-cols-2">
          <input name="title" required placeholder="Decision title" className="input sm:col-span-2" />
          <input name="owner" required placeholder="Owner" className="input" />
          <select name="status" defaultValue="proposed" className="input">
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <textarea name="description" placeholder="Description" className="input sm:col-span-2" rows={2} />
          <textarea name="rationale" placeholder="Rationale" className="input" rows={2} />
          <textarea name="impact" placeholder="Expected impact" className="input" rows={2} />
          <button type="submit" className="btn-primary sm:col-span-2">
            Log decision
          </button>
        </form>
      </Card>

      {rows.length === 0 ? (
        <EmptyState message="No decisions logged yet. Use the form above to create the first one." />
      ) : (
        <div className="space-y-4">
          {rows.map((decision) => (
            <Card key={decision.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">{decision.title}</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Owner: {decision.owner} · Logged {fmtDate(decision.createdAt)}
                    {decision.decidedAt ? ` · Decided ${fmtDate(decision.decidedAt)}` : ""}
                  </p>
                </div>
                <Badge value={decision.status} />
              </div>
              {decision.description ? (
                <p className="mt-3 text-sm text-slate-700">{decision.description}</p>
              ) : null}
              <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                {decision.rationale ? (
                  <p>
                    <span className="font-medium text-slate-800">Rationale: </span>
                    {decision.rationale}
                  </p>
                ) : null}
                {decision.impact ? (
                  <p>
                    <span className="font-medium text-slate-800">Impact: </span>
                    {decision.impact}
                  </p>
                ) : null}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
                <form action={updateDecisionStatus} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={decision.id} />
                  <select name="status" defaultValue={decision.status} className="input-sm">
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="btn-secondary">
                    Update
                  </button>
                </form>
                <form action={deleteDecision}>
                  <input type="hidden" name="id" value={decision.id} />
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
