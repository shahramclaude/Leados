import { ForecastPanel } from "@/components/panels/ForecastPanel";
import { NetworkPanel } from "@/components/panels/NetworkPanel";
import { HeatmapPanel } from "@/components/panels/HeatmapPanel";
import { PeoplePanel } from "@/components/panels/PeoplePanel";

export interface KpiSummary {
  headcount: number;
  avgRisk: number;
  decisions90d: number;
  relationships: number;
}

/**
 * Server component: KPI strip is rendered from props already fetched in
 * parallel by the page (src/app/cockpit/page.tsx), so there is zero
 * server-side waterfall for the above-the-fold content. Everything below —
 * forecast chart, network graph, heatmap, people table — is a client
 * component that fetches its own data lazily (network/heatmap/people are
 * gated by `useInView`; forecast is eager because it's the headline KPI but
 * its chart renderer is still code-split).
 */
export function CockpitDashboard({ kpis }: { kpis: KpiSummary }) {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-10">
      <header>
        <p className="text-xs uppercase tracking-wide text-slate-500">LEADOS · Cockpit</p>
        <h1 className="text-2xl font-semibold text-slate-900">Org cockpit</h1>
      </header>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="Headcount" value={kpis.headcount.toLocaleString()} />
        <KpiCard label="Avg risk" value={kpis.avgRisk.toFixed(2)} />
        <KpiCard label="Decisions (90d)" value={kpis.decisions90d.toLocaleString()} />
        <KpiCard label="Relationships" value={kpis.relationships.toLocaleString()} />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <ForecastPanel />
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <NetworkPanel />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <HeatmapPanel />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <PeoplePanel />
      </section>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}
