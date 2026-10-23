import { db } from "@/db";
import { riskItems } from "@/db/schema";
import { desc } from "drizzle-orm";
import { createRiskItem, deleteRiskItem, updateRiskStatus } from "@/lib/actions";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const CATEGORY_OPTIONS = ["strategic", "operational", "financial", "compliance", "reputational"] as const;
const STATUS_OPTIONS = ["open", "mitigating", "closed"] as const;
const SCALE = [1, 2, 3, 4, 5] as const;

function riskScoreTone(score: number): "emerald" | "amber" | "rose" {
  if (score >= 16) return "rose";
  if (score >= 9) return "amber";
  return "emerald";
}

export default async function RiskPage() {
  const rows = await db.select().from(riskItems).orderBy(desc(riskItems.createdAt));

  return (
    <div>
      <PageHeader
        title="Risk & GRC"
        description="Governance, risk, and compliance register with likelihood × impact scoring."
      />

      <Card className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Add a risk</h2>
        <form action={createRiskItem} className="grid gap-4 sm:grid-cols-2">
          <input name="title" required placeholder="Risk title" className="input sm:col-span-2" />
          <input name="owner" required placeholder="Owner" className="input" />
          <select name="category" defaultValue="operational" className="input">
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Likelihood (1-5)
            <select name="likelihood" defaultValue="3" className="input">
              {SCALE.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Impact (1-5)
            <select name="impact" defaultValue="3" className="input">
              {SCALE.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <textarea name="mitigation" placeholder="Mitigation plan" className="input sm:col-span-2" rows={2} />
          <button type="submit" className="btn-primary sm:col-span-2">
            Add risk
          </button>
        </form>
      </Card>

      {rows.length === 0 ? (
        <EmptyState message="No risks logged yet." />
      ) : (
        <div className="space-y-4">
          {rows.map((risk) => {
            const score = risk.likelihood * risk.impact;
            return (
              <Card key={risk.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">{risk.title}</h3>
                    <p className="mt-1 text-xs capitalize text-slate-500">
                      {risk.category} · Owner: {risk.owner}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge value={risk.status} />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-700">
                  <span>Likelihood: {risk.likelihood}/5</span>
                  <span>Impact: {risk.impact}/5</span>
                  <span className="flex items-center gap-1">
                    Score:
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        riskScoreTone(score) === "rose"
                          ? "bg-rose-100 text-rose-700"
                          : riskScoreTone(score) === "amber"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {score}
                    </span>
                  </span>
                </div>
                {risk.mitigation ? (
                  <p className="mt-3 text-sm text-slate-700">
                    <span className="font-medium text-slate-800">Mitigation: </span>
                    {risk.mitigation}
                  </p>
                ) : null}
                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
                  <form action={updateRiskStatus} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={risk.id} />
                    <select name="status" defaultValue={risk.status} className="input-sm">
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="btn-secondary">
                      Update
                    </button>
                  </form>
                  <form action={deleteRiskItem}>
                    <input type="hidden" name="id" value={risk.id} />
                    <button type="submit" className="btn-danger">
                      Delete
                    </button>
                  </form>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
