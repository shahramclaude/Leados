import { db } from "@/db";
import { initiatives, keyResults, objectives } from "@/db/schema";
import { DEFAULT_ORG_ID } from "@/lib/org";
import { Badge, Card, EmptyState, PageHeader, ProgressBar, RiskBadge } from "@/components/ui";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const statusTone = { on_track: "success", at_risk: "warning", off_track: "danger", done: "brand" } as const;
const initiativeTone = { planned: "neutral", active: "brand", blocked: "danger", done: "success" } as const;

export default async function PlanPage() {
  const [objectiveRows, krRows, initiativeRows] = await Promise.all([
    db.select().from(objectives).where(eq(objectives.orgId, DEFAULT_ORG_ID)),
    db.select().from(keyResults),
    db.select().from(initiatives).where(eq(initiatives.orgId, DEFAULT_ORG_ID)),
  ]);

  return (
    <div>
      <PageHeader
        eyebrow="Plan"
        title="OKRs & Initiative Portfolio"
        description="Every objective traces to key results; every initiative traces to the objective it serves."
      />

      <section>
        <h2 className="m-0 text-[18px] font-semibold text-[var(--text-primary)]">Objectives</h2>
        {objectiveRows.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No objectives yet" />
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-4">
            {objectiveRows.map((o) => {
              const krs = krRows.filter((k) => k.objectiveId === o.id);
              return (
                <Card key={o.id}>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="m-0 text-[16px] font-semibold text-[var(--text-primary)]">{o.title}</p>
                      {o.description ? (
                        <p className="mt-1 m-0 text-[13px] text-[var(--text-secondary)]">{o.description}</p>
                      ) : null}
                    </div>
                    <Badge tone={statusTone[o.status]}>{o.status.replace("_", " ")}</Badge>
                  </div>
                  <div className="mt-4 flex flex-col gap-3">
                    {krs.map((kr) => {
                      const pct = kr.target !== kr.baseline ? ((kr.current - kr.baseline) / (kr.target - kr.baseline)) * 100 : 0;
                      return (
                        <div key={kr.id}>
                          <div className="flex items-center justify-between text-[13px]">
                            <span className="text-[var(--text-primary)]">{kr.title}</span>
                            <span className="text-[var(--text-muted)]">
                              {kr.current}
                              {kr.unit} / {kr.target}
                              {kr.unit}
                            </span>
                          </div>
                          <div className="mt-1">
                            <ProgressBar pct={pct} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="m-0 text-[18px] font-semibold text-[var(--text-primary)]">Initiative portfolio</h2>
        {initiativeRows.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No initiatives yet" />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border-default)]">
            <table className="w-full border-collapse text-left text-[14px]">
              <thead className="bg-[var(--surface-sunken)] text-[12px] uppercase tracking-wide text-[var(--text-muted)]">
                <tr>
                  <th className="px-4 py-3">Initiative</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Risk</th>
                  <th className="px-4 py-3">Budget</th>
                  <th className="px-4 py-3">Progress</th>
                </tr>
              </thead>
              <tbody>
                {initiativeRows.map((i) => (
                  <tr key={i.id} className="border-t border-[var(--border-default)]">
                    <td className="px-4 py-3 text-[var(--text-primary)]">{i.title}</td>
                    <td className="px-4 py-3">
                      <Badge tone={initiativeTone[i.status]}>{i.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <RiskBadge tier={i.riskTier} />
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">${i.budgetUsd.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <div className="w-32">
                        <ProgressBar pct={i.progressPct} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
