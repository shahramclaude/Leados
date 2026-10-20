import { desc } from "drizzle-orm";
import { db } from "@/db";
import { automationRuns } from "@/db/schema";
import { getCompositeHealth } from "@/lib/health/composite";
import type { CheckStatus, CompositeStatus } from "@/lib/health/types";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<CheckStatus, string> = {
  ok: "bg-emerald-100 text-emerald-800 ring-emerald-600/20",
  warn: "bg-amber-100 text-amber-800 ring-amber-600/20",
  fail: "bg-rose-100 text-rose-800 ring-rose-600/20",
  unknown: "bg-slate-100 text-slate-600 ring-slate-500/20",
};

const COMPOSITE_STYLES: Record<CompositeStatus, string> = {
  healthy: "bg-emerald-600 text-white",
  degraded: "bg-amber-500 text-white",
  unhealthy: "bg-rose-600 text-white",
};

function Badge({ status }: { status: CheckStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[status]}`}>
      {status}
    </span>
  );
}

export default async function HealthPage() {
  const health = await getCompositeHealth();
  const recentRuns = await db.select().from(automationRuns).orderBy(desc(automationRuns.queuedAt)).limit(10);

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-600">LEADOS diagnostics</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">System health</h1>
        </div>
        <span className={`rounded-full px-4 py-2 text-sm font-semibold ${COMPOSITE_STYLES[health.status]}`}>
          {health.status.toUpperCase()}
        </span>
      </div>

      <p className="mt-4 text-sm text-slate-600">
        Generated {health.generatedAt} · version {health.version} · correlation id{" "}
        <code className="rounded bg-slate-200 px-1 py-0.5 text-xs">{health.correlationId}</code>
      </p>

      <section className="mt-8 space-y-3">
        {health.checks.map((check) => (
          <div key={check.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-base font-semibold text-slate-900">{check.label}</h2>
              <Badge status={check.status} />
            </div>
            <p className="mt-2 text-sm text-slate-700">{check.summary}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span>{check.durationMs}ms</span>
              {check.critical ? <span className="font-medium text-slate-700">critical dependency</span> : null}
              {check.runbook ? (
                <span>
                  Remediation: <code className="rounded bg-slate-100 px-1 py-0.5">docs/RUNBOOKS.md{check.runbook}</code>
                </span>
              ) : null}
            </div>
            {check.details ? (
              <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
                {JSON.stringify(check.details, null, 2)}
              </pre>
            ) : null}
          </div>
        ))}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-slate-900">Recent automation runs</h2>
        <p className="mt-1 text-sm text-slate-600">
          Backs the queue-depth and freshness checks above. Create one with{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5">POST /api/automation/runs</code>.
        </p>
        <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Queued at</th>
                <th className="px-4 py-2">Duration</th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-4 text-slate-500">
                    No automation runs recorded yet.
                  </td>
                </tr>
              ) : (
                recentRuns.map((run) => (
                  <tr key={run.id} className="border-t border-slate-100">
                    <td className="px-4 py-2">{run.name}</td>
                    <td className="px-4 py-2">
                      <Badge status={run.status === "failed" ? "fail" : run.status === "succeeded" ? "ok" : "warn"} />
                    </td>
                    <td className="px-4 py-2 text-slate-600">{run.queuedAt.toISOString()}</td>
                    <td className="px-4 py-2 text-slate-600">{run.durationMs ? `${run.durationMs}ms` : "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-10 text-xs text-slate-500">
        Machine-readable: <code className="rounded bg-slate-100 px-1 py-0.5">GET /api/health</code> ·{" "}
        <code className="rounded bg-slate-100 px-1 py-0.5">GET /api/metrics</code>
      </p>
    </main>
  );
}
