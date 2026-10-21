import { getCompositeHealth } from "@/lib/ops/health/composite";
import type { CheckStatus } from "@/lib/ops/health/checks";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<CheckStatus, string> = {
  ok: "bg-emerald-50 text-emerald-800 border-emerald-200",
  warn: "bg-amber-50 text-amber-800 border-amber-200",
  fail: "bg-rose-50 text-rose-800 border-rose-200",
};

const OVERALL_STYLES: Record<string, string> = {
  healthy: "bg-emerald-600",
  degraded: "bg-amber-500",
  unhealthy: "bg-rose-600",
};

export default async function HealthPage() {
  const health = await getCompositeHealth();

  return (
    <main className="min-h-screen px-6 py-12">
      <section className="mx-auto w-full max-w-4xl">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-white p-8 shadow-[0_24px_60px_rgba(16,24,40,0.12)]">
          <div>
            <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-600">Composite health</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">System status</h1>
            <p className="mt-2 text-sm text-slate-600">As of {health.timestamp}{health.draining ? " — draining for shutdown" : ""}</p>
          </div>
          <span className={`rounded-full px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white ${OVERALL_STYLES[health.status]}`}>
            {health.status}
          </span>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {health.checks.map((check) => (
            <div key={check.id} className={`rounded-2xl border p-5 ${STATUS_STYLES[check.status]}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="m-0 font-semibold">{check.label}</p>
                <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-bold uppercase">{check.status}</span>
              </div>
              <p className="mt-1 text-sm">{check.summary}</p>
              {check.status !== "ok" && (
                <p className="mt-2 text-xs font-medium">
                  Remediation: {check.remediation} <span className="opacity-70">({check.runbook})</span>
                </p>
              )}
              <details className="mt-2 text-xs opacity-80">
                <summary className="cursor-pointer select-none">details</summary>
                <pre className="mt-1 whitespace-pre-wrap break-all">{JSON.stringify(check.details, null, 2)}</pre>
              </details>
              {check.critical && <p className="mt-2 text-[10px] font-bold uppercase tracking-wide opacity-60">critical dependency</p>}
            </div>
          ))}
        </div>

        <p className="mt-6 text-xs text-slate-500">
          Machine-readable: <code>GET /api/health</code>. Metrics: <code>GET /api/metrics</code>. Full runbook text: {" "}
          <code>docs/RUNBOOKS.md</code>.
        </p>
      </section>
    </main>
  );
}
