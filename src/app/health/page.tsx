import { getCompositeHealth } from "@/lib/health";
import type { Status, SubsystemHealth } from "@/lib/health";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<Status, string> = {
  healthy: "bg-emerald-100 text-emerald-900 border-emerald-300",
  degraded: "bg-amber-100 text-amber-900 border-amber-300",
  failing: "bg-red-100 text-red-900 border-red-300",
};

const STATUS_DOT: Record<Status, string> = {
  healthy: "bg-emerald-500",
  degraded: "bg-amber-500",
  failing: "bg-red-500",
};

function SubsystemCard({ subsystem }: { subsystem: SubsystemHealth }) {
  return (
    <details className={`rounded-xl border p-4 ${STATUS_STYLES[subsystem.status]}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
        <span className="flex items-center gap-2 font-semibold">
          <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[subsystem.status]}`} />
          {subsystem.name}
        </span>
        <span className="text-xs uppercase tracking-wide">{subsystem.status}</span>
      </summary>
      <div className="mt-3 space-y-2 text-sm">
        <p>{subsystem.message}</p>
        {subsystem.remediation && (
          <p>
            <span className="font-semibold">What to do: </span>
            {subsystem.remediation}
            {subsystem.runbook && (
              <>
                {" "}
                (<code className="rounded bg-white/60 px-1">{subsystem.runbook}</code>)
              </>
            )}
          </p>
        )}
        <pre className="overflow-x-auto rounded bg-white/60 p-2 text-xs">
          {JSON.stringify(subsystem.metrics, null, 2)}
        </pre>
        <p className="text-xs opacity-70">checked at {subsystem.checkedAt}</p>
      </div>
    </details>
  );
}

export default async function HealthPage() {
  const health = await getCompositeHealth();

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className={`mb-6 rounded-2xl border p-6 ${STATUS_STYLES[health.status]}`}>
        <p className="text-sm uppercase tracking-wide opacity-80">Composite status</p>
        <h1 className="mt-1 text-3xl font-bold">{health.status.toUpperCase()}</h1>
        {health.draining && <p className="mt-2 font-medium">⚠️ Server is draining for shutdown.</p>}
        <p className="mt-2 text-sm opacity-80">Checked at {health.checkedAt}</p>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900">Subsystems</h2>
        <p className="text-sm text-slate-500">
          Machine-readable: <code className="rounded bg-white px-1">GET /api/health</code> · Metrics:{" "}
          <code className="rounded bg-white px-1">GET /api/metrics</code>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {health.subsystems.map((s) => (
          <SubsystemCard key={s.name} subsystem={s} />
        ))}
      </div>

      <p className="mt-8 text-sm text-slate-500">
        Each degraded/failing subsystem links to the matching section of{" "}
        <code className="rounded bg-white px-1">docs/RUNBOOKS.md</code>. See{" "}
        <code className="rounded bg-white px-1">docs/SLO.md</code> for the thresholds behind these
        statuses.
      </p>
    </main>
  );
}
