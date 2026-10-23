import Link from "next/link";
import { notFound } from "next/navigation";
import { getCollectiveView, getMarketState } from "@/lib/collective/service";
import { ForecastForm } from "../_components/ForecastForm";
import { WhoThinksWhat } from "../_components/WhoThinksWhat";
import { ResolveButton } from "../_components/ResolveButton";

export const dynamic = "force-dynamic";

const METHOD_LABEL: Record<string, string> = {
  mean: "Simple mean pooling",
  extremized: "Extremized pooling",
  calibration_weighted: "Calibration-weighted pooling",
};

const METHOD_BADGE: Record<string, string> = {
  mean: "bg-slate-100 text-slate-700",
  extremized: "bg-fuchsia-100 text-fuchsia-800",
  calibration_weighted: "bg-indigo-100 text-indigo-800",
};

export default async function CollectiveViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await getCollectiveView(id);
  if (!view) notFound();
  const market = await getMarketState(id);

  const headline = view.methods.calibration_weighted;

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <Link href="/collective" className="text-xs text-slate-500 underline underline-offset-4">
        ← All registered questions
      </Link>
      <h1 className="mt-3 text-[clamp(1.5rem,3.5vw,2.25rem)] font-semibold text-slate-950">{view.question.title}</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-600">{view.question.description}</p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
          {view.question.questionClass}
        </span>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
          status: {view.question.status}
        </span>
        {view.question.status !== "resolved" && <ResolveButton questionId={id} />}
      </div>

      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        {(["calibration_weighted", "extremized", "mean"] as const).map((method) => {
          const result = view.methods[method];
          return (
            <div key={method} className="rounded-2xl bg-white p-5 shadow-[0_12px_30px_rgba(16,24,40,0.08)]">
              <span className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-medium ${METHOD_BADGE[method]}`}>
                {METHOD_LABEL[method]}
              </span>
              <p className="mt-3 text-3xl font-semibold text-slate-950">{(result.value * 100).toFixed(1)}%</p>
              <p className="mt-1 text-xs text-slate-500">
                n={result.n} · σ={result.stdDev.toFixed(3)} · {result.minorityReports.length} minority report
                {result.minorityReports.length === 1 ? "" : "s"}
              </p>
            </div>
          );
        })}
      </section>

      {market && (
        <section className="mt-6 rounded-2xl bg-white p-5 shadow-[0_12px_30px_rgba(16,24,40,0.08)]">
          <h3 className="text-sm font-semibold text-slate-950">Crowd vs. model vs. market</h3>
          <div className="mt-3 flex flex-wrap gap-6 text-sm text-slate-700">
            <div>
              <p className="text-xs uppercase text-slate-400">Crowd (calibration-weighted)</p>
              <p className="text-xl font-semibold text-slate-950">{(headline.value * 100).toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-400">Model (Part 11 ensemble)</p>
              <p className="text-xl font-semibold text-slate-950">
                {view.crowdVsModel.model !== null ? `${(view.crowdVsModel.model * 100).toFixed(1)}%` : "n/a"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-400">Market price</p>
              <p className="text-xl font-semibold text-slate-950">{(market.price * 100).toFixed(1)}%</p>
            </div>
          </div>
        </section>
      )}

      <section className="mt-6 rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
        <h3 className="text-sm font-semibold text-amber-900">
          Minority reports ({headline.minorityReports.length}) — never averaged away
        </h3>
        {headline.minorityReports.length === 0 ? (
          <p className="mt-2 text-xs text-amber-800">
            No individual estimate currently diverges from the calibration-weighted aggregate by more than{" "}
            {(Number(headline.params.minorityThreshold) * 100).toFixed(0)} points.
          </p>
        ) : (
          <ul className="mt-3 grid gap-3">
            {headline.minorityReports.map((r) => (
              <li key={r.forecasterId} className="rounded-xl bg-white p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-mono text-slate-700">{(r.probability * 100).toFixed(0)}%</span>
                  <span className="text-xs text-amber-800">divergence {(r.divergence * 100).toFixed(1)} pts</span>
                </div>
                <p className="mt-1 text-xs text-slate-700">{r.rationale || "(no rationale provided)"}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 grid gap-6 sm:grid-cols-2">
        <WhoThinksWhat rows={view.rawForecasts} />
        <ForecastForm questionId={id} />
      </section>

      <div className="mt-8 flex gap-4 text-sm font-medium">
        <Link href={`/collective/${id}/delphi`} className="text-slate-950 underline underline-offset-4">
          Open Delphi Workspace →
        </Link>
        <Link href={`/collective/${id}/market`} className="text-slate-950 underline underline-offset-4">
          Open Market Floor →
        </Link>
      </div>
    </main>
  );
}
