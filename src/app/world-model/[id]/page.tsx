import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { metrics, simulationRuns } from "@/db/schema";
import { getObservations } from "@/lib/worldModel";
import { Card } from "@/components/ui";
import { ObservationForm } from "./ObservationForm";
import { SimulationPanel } from "./SimulationPanel";

export const dynamic = "force-dynamic";

export default async function MetricDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const metricRows = await db.select().from(metrics).where(eq(metrics.id, id)).limit(1);
  const metric = metricRows[0];
  if (!metric) notFound();

  const observations = await getObservations(id);
  const latestRunRows = await db
    .select()
    .from(simulationRuns)
    .where(eq(simulationRuns.metricId, id))
    .orderBy(desc(simulationRuns.createdAt))
    .limit(1);
  const latestRun = latestRunRows[0];

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Link href="/world-model" className="text-sm text-slate-500 hover:text-slate-800">
        ← All metrics
      </Link>
      <header className="mt-2 mb-8">
        <h1 className="text-3xl font-semibold text-slate-950">{metric.name}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {metric.key}
          {metric.unit ? ` · ${metric.unit}` : ""} · {observations.length} observations
        </p>
        {metric.description && <p className="mt-2 text-sm text-slate-600">{metric.description}</p>}
      </header>

      <Card className="mb-8">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Simulate</h2>
        {observations.length === 0 ? (
          <p className="text-sm text-slate-600">Add at least one observation before running a simulation.</p>
        ) : (
          <SimulationPanel
            metricId={id}
            history={observations}
            latestBands={(latestRun?.bands as never) ?? null}
            observationCount={observations.length}
          />
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Observations</h2>
        <ObservationForm metricId={id} />
        {observations.length > 0 && (
          <table className="mt-4 w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="py-1 pr-4">Period</th>
                <th className="py-1">Value</th>
              </tr>
            </thead>
            <tbody>
              {[...observations].reverse().map((o) => (
                <tr key={o.period} className="border-t border-slate-100">
                  <td className="py-1 pr-4 text-slate-700">{o.period}</td>
                  <td className="py-1 text-slate-900">{o.value.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </main>
  );
}
