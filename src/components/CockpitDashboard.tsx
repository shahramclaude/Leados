import { Suspense } from "react";
import { getEventCount } from "@/lib/stats";
import { getCachedDailyBuckets } from "@/lib/statsCache";
import { getForecast } from "@/lib/forecastCache";
import { getEventsPage, getNetworkGraph, getNotificationsPage } from "@/lib/queries";
import { MetricsView } from "./MetricsView";
import { ForecastPanel } from "./ForecastPanel";
import { HeatmapLazy } from "./charts/HeatmapLazy";
import { NetworkLazy } from "./charts/NetworkLazy";
import { NotificationsPanel } from "./NotificationsPanel";
import { ChartPanelSkeleton, KpiTileSkeleton, TableSkeleton } from "./Skeletons";
import { PanelErrorBoundary } from "./ErrorBoundary";
import { RealtimeClientLazy } from "./RealtimeClientLazy";
import { CommandPaletteLauncher } from "./CommandPaletteLauncher";

// ---------------------------------------------------------------------------
// Each *Section component below fetches exactly the data it needs and is
// wrapped in its own <Suspense> boundary. Because React starts evaluating
// each async Server Component as soon as it is encountered in the tree (it
// does not wait for siblings), these four data fetches effectively run in
// parallel rather than as a request waterfall, and the fast ones (metrics)
// can paint before the slow ones (network layout data) are ready. Within
// each section, independent queries use Promise.all explicitly.
// ---------------------------------------------------------------------------

async function MetricsSection() {
  const [{ value: buckets }, eventsPage, totalCount] = await Promise.all([
    getCachedDailyBuckets(30),
    getEventsPage({ limit: 100 }),
    getEventCount(),
  ]);

  return (
    <MetricsView
      initialBuckets={buckets}
      initialEvents={eventsPage.items}
      initialNextCursor={eventsPage.nextCursor}
      totalEventCount={totalCount}
    />
  );
}

async function ForecastSection() {
  const [{ value: buckets90 }, forecastResult] = await Promise.all([getCachedDailyBuckets(90), getForecast(30)]);
  return <ForecastPanel buckets={buckets90} forecast={forecastResult.payload} />;
}

async function HeatmapSection() {
  const { value: buckets } = await getCachedDailyBuckets(60);
  return <HeatmapLazy buckets={buckets} />;
}

async function NetworkSection() {
  const graph = await getNetworkGraph(120);
  return <NetworkLazy nodes={graph.nodes} edges={graph.edges} />;
}

async function NotificationsSection() {
  const page = await getNotificationsPage({ limit: 50 });
  return <NotificationsPanel items={page.items} />;
}

export async function CockpitDashboard() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.08em] text-slate-400">LEADOS</p>
          <h1 className="text-2xl font-semibold text-slate-900">Cockpit</h1>
        </div>
        <div className="flex items-center gap-2">
          <RealtimeClientLazy />
          <CommandPaletteLauncher />
        </div>
      </header>

      <section id="panel-metrics" aria-label="Metrics">
        <PanelErrorBoundary fallbackTitle="Metrics" minHeight={480}>
          <Suspense
            fallback={
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <KpiTileSkeleton />
                  <KpiTileSkeleton />
                  <KpiTileSkeleton />
                  <KpiTileSkeleton />
                </div>
                <TableSkeleton rows={10} />
              </div>
            }
          >
            <MetricsSection />
          </Suspense>
        </PanelErrorBoundary>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section id="panel-forecast" aria-label="Forecast">
          <PanelErrorBoundary fallbackTitle="Forecast" minHeight={300}>
            <Suspense fallback={<ChartPanelSkeleton title="forecast" height={300} />}>
              <ForecastSection />
            </Suspense>
          </PanelErrorBoundary>
        </section>

        <section id="panel-network" aria-label="Network">
          <PanelErrorBoundary fallbackTitle="Network graph" minHeight={300}>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-700">Entity risk network</h3>
              <Suspense fallback={<ChartPanelSkeleton title="network" height={320} />}>
                <NetworkSection />
              </Suspense>
            </div>
          </PanelErrorBoundary>
        </section>
      </div>

      <section aria-label="Severity heatmap">
        <PanelErrorBoundary fallbackTitle="Severity heatmap" minHeight={150}>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">Severity x day (60d)</h3>
            <Suspense fallback={<ChartPanelSkeleton title="heatmap" height={150} />}>
              <HeatmapSection />
            </Suspense>
          </div>
        </PanelErrorBoundary>
      </section>

      <section id="panel-notifications" aria-label="Notifications">
        <PanelErrorBoundary fallbackTitle="Notifications" minHeight={320}>
          <Suspense fallback={<TableSkeleton rows={6} rowHeight={52} />}>
            <NotificationsSection />
          </Suspense>
        </PanelErrorBoundary>
      </section>
    </div>
  );
}

export default CockpitDashboard;
