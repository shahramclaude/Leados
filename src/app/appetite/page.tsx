import { GrcNav } from "@/components/GrcNav";
import { latestObservations, observationHistory } from "@/lib/appetite";
import { ObserveForm } from "@/components/appetite/ObserveForm";

export const dynamic = "force-dynamic";

const statusStyles: Record<string, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-600",
};

export default async function AppetiteDashboardPage() {
  const rows = await latestObservations();

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10">
      <GrcNav active="/appetite" />
      <h1 className="text-3xl font-semibold text-slate-950">Appetite Dashboard</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-600">
        Thresholds are sourced from Part 08 finance outputs / Part 06 twin outputs (provenance recorded per
        metric). A breach automatically raises a Finding, which can be referred into the decision register.
      </p>
      <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
        <strong>Default-view caveat:</strong> the gauges below show only the <em>latest</em> observation. A
        metric that is currently green may have breached red twice this quarter and recovered — the gauge
        alone would hide that. Expand &quot;recent history&quot; on each metric before presenting this as
        &quot;all clear&quot;.
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
        {await Promise.all(
          rows.map(async ({ metric, latest }) => {
            const history = await observationHistory(metric.id, 8);
            const amber = Number(metric.thresholdAmber);
            const red = Number(metric.thresholdRed);
            const value = latest ? Number(latest.value) : null;
            const maxScale = Math.max(red, value ?? 0) * 1.3 || 1;
            const status = latest?.status ?? "no_observation";

            return (
              <div key={metric.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  {metric.code} · unit: {metric.unit} · source: {metric.source}
                </p>
                <h2 className="mt-1 text-lg font-semibold text-slate-950">{metric.name}</h2>

                <div className="mt-3">
                  <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                    {value !== null && (
                      <div
                        className={`h-3 rounded-full ${statusStyles[status] ?? "bg-slate-400"}`}
                        style={{ width: `${Math.min(100, (value / maxScale) * 100)}%` }}
                      />
                    )}
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] text-slate-400">
                    <span>0</span>
                    <span>amber {metric.thresholdAmber}</span>
                    <span>red {metric.thresholdRed}</span>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <p className="text-2xl font-semibold text-slate-950">
                    {value !== null ? value : "—"} <span className="text-sm font-normal text-slate-500">{metric.unit}</span>
                  </p>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold text-white ${statusStyles[status] ?? "bg-slate-400"}`}
                  >
                    {status.toUpperCase()}
                  </span>
                </div>

                {latest && status !== "green" && (
                  <p className="mt-2 text-xs text-red-700">
                    Breach explanation: {metric.direction === "above" ? "value exceeds" : "value is below"} the{" "}
                    {status} threshold ({status === "red" ? metric.thresholdRed : metric.thresholdAmber}
                    {metric.unit === "percent" ? "%" : ""}). Finding raised: #{latest.findingId ?? "n/a"}.
                  </p>
                )}

                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-medium text-slate-500">Recent history ({history.length})</summary>
                  <ul className="mt-2 space-y-1 text-xs text-slate-600">
                    {history.map((h) => (
                      <li key={h.id} className="flex justify-between">
                        <span>{new Date(h.observedAt).toLocaleString()}</span>
                        <span className="font-medium">
                          {h.value} ({h.status})
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>

                <ObserveForm metricId={metric.id} unit={metric.unit} />
              </div>
            );
          }),
        )}
      </div>
    </main>
  );
}
