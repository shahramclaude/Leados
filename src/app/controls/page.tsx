import { GrcNav } from "@/components/GrcNav";
import { db } from "@/db";
import { controls, riskControls, controlTests, risks } from "@/db/schema";
import { eq, desc, isNull } from "drizzle-orm";
import { betaMean, betaCredibleInterval, evidenceStrengthLabel } from "@/lib/beta";
import { computeComplianceStatus, statusColor } from "@/lib/complianceStatus";
import { RunSweepButton, ExecuteTestButton } from "@/components/controls/ControlTestActions";

export const dynamic = "force-dynamic";

const badgeClasses: Record<string, string> = {
  green: "bg-emerald-100 text-emerald-800",
  red: "bg-red-100 text-red-800",
  amber: "bg-amber-100 text-amber-800",
  slate: "bg-slate-200 text-slate-700",
};

export default async function ControlAssurancePage() {
  const now = Date.now();
  const ctrlRows = await db.select().from(controls);
  const pendingTests = await db
    .select({
      testId: controlTests.id,
      scheduledFor: controlTests.scheduledFor,
      overdue: controlTests.overdue,
      riskControlId: controlTests.riskControlId,
      controlCode: controls.code,
      controlName: controls.name,
      mechanism: controls.mechanism,
      riskCode: risks.code,
    })
    .from(controlTests)
    .innerJoin(riskControls, eq(controlTests.riskControlId, riskControls.id))
    .innerJoin(controls, eq(riskControls.controlId, controls.id))
    .innerJoin(risks, eq(riskControls.riskId, risks.id))
    .where(isNull(controlTests.executedAt));

  const rows = [];
  for (const c of ctrlRows) {
    const links = await db
      .select({
        riskControlId: riskControls.id,
        riskId: riskControls.riskId,
        riskCode: risks.code,
        riskTitle: risks.title,
        effectiveness: riskControls.effectiveness,
        lastTestedAt: riskControls.lastTestedAt,
        nextTestDueAt: riskControls.nextTestDueAt,
      })
      .from(riskControls)
      .innerJoin(risks, eq(riskControls.riskId, risks.id))
      .where(eq(riskControls.controlId, c.id));

    const linkDetails = [];
    for (const l of links) {
      const [latestTest] = await db
        .select()
        .from(controlTests)
        .where(eq(controlTests.riskControlId, l.riskControlId))
        .orderBy(desc(controlTests.createdAt))
        .limit(1);
      const status = computeComplianceStatus({
        dueAt: latestTest ? new Date(latestTest.scheduledFor) : new Date(l.nextTestDueAt),
        executedAt: latestTest?.executedAt ? new Date(latestTest.executedAt) : null,
        result: (latestTest?.result as "pass" | "fail" | null) ?? null,
        evidenceAuditEventId: latestTest?.evidenceAuditEventId ?? null,
      });
      linkDetails.push({ ...l, status });
    }
    rows.push({ control: c, links: linkDetails });
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10">
      <GrcNav active="/controls" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold text-slate-950">Control Assurance</h1>
        <RunSweepButton />
      </div>
      <p className="mt-2 max-w-3xl text-sm text-slate-600">
        Status labels are generated exclusively by <code>computeComplianceStatus()</code>, which requires an
        audit-chain evidence reference before it will show anything other than &quot;no evidence&quot;. There
        is no code path that renders a green checkmark without one.
      </p>

      {pendingTests.length > 0 && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-950">Scheduled tests awaiting execution</h2>
          <table className="mt-3 w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="py-1">Control</th>
                <th className="py-1">Risk</th>
                <th className="py-1">Scheduled for</th>
                <th className="py-1">Overdue?</th>
                <th className="py-1">Action</th>
              </tr>
            </thead>
            <tbody>
              {pendingTests.map((t) => (
                <tr key={t.testId} className="border-t border-slate-100">
                  <td className="py-2">
                    {t.controlCode} — {t.controlName}
                  </td>
                  <td className="py-2">{t.riskCode}</td>
                  <td className="py-2">{new Date(t.scheduledFor).toLocaleString()}</td>
                  <td className="py-2">
                    {t.overdue || new Date(t.scheduledFor).getTime() < now ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">overdue</span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">on schedule</span>
                    )}
                  </td>
                  <td className="py-2">
                    <ExecuteTestButton controlTestId={t.testId} mechanism={t.mechanism as "manual" | "automated"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="mt-6 space-y-4">
        {rows.map(({ control, links }) => (
          <div key={control.id} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  {control.code} · {control.type} · {control.mechanism} · cadence {control.cadenceDays}d
                </p>
                <h2 className="mt-1 text-lg font-semibold text-slate-950">{control.name}</h2>
                <p className="mt-1 text-sm text-slate-600">{control.description}</p>
                <p className="mt-1 text-xs text-slate-400">Test procedure: {control.testProcedure}</p>
              </div>
            </div>
            <table className="mt-3 w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-400">
                <tr>
                  <th className="py-1">Risk</th>
                  <th className="py-1">Effectiveness (90% CI)</th>
                  <th className="py-1">Evidence</th>
                  <th className="py-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {links.map((l) => {
                  const mean = betaMean(l.effectiveness);
                  const ci = betaCredibleInterval(l.effectiveness, 0.9);
                  const evidence = evidenceStrengthLabel(l.effectiveness);
                  const color = statusColor(l.status.label);
                  return (
                    <tr key={l.riskControlId} className="border-t border-slate-100 align-top">
                      <td className="py-2">
                        {l.riskCode} — {l.riskTitle}
                      </td>
                      <td className="py-2">
                        {(mean * 100).toFixed(1)}% ({(ci.low * 100).toFixed(0)}%–{(ci.high * 100).toFixed(0)}%),{" "}
                        <span className="italic text-slate-500">{evidence} evidence</span>
                      </td>
                      <td className="py-2 text-xs text-slate-500">
                        Next due {new Date(l.nextTestDueAt).toLocaleDateString()}
                        {l.lastTestedAt ? `, last tested ${new Date(l.lastTestedAt).toLocaleDateString()}` : ", never tested"}
                      </td>
                      <td className="py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badgeClasses[color]}`}>
                          {l.status.display}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {links.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-2 text-xs text-slate-400">
                      Not yet mapped to any risk.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ))}
      </section>
    </main>
  );
}
