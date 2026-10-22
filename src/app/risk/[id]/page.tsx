import { notFound } from "next/navigation";
import Link from "next/link";
import { GrcNav } from "@/components/GrcNav";
import { getRisk, summarizeBeliefs } from "@/lib/risk";
import { BowTie } from "@/components/risk/BowTie";
import { SimulatePanel } from "@/components/risk/SimulatePanel";

export const dynamic = "force-dynamic";

export default async function RiskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const risk = await getRisk(Number(id));
  if (!risk) notFound();

  const beliefs = summarizeBeliefs(risk);

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10">
      <GrcNav active="/risk" />
      <Link href="/risk" className="text-sm text-slate-500 hover:underline">
        ← Back to Risk Register
      </Link>
      <p className="mt-3 text-xs uppercase tracking-wide text-slate-500">
        {risk.code} · {risk.category} · owner: {risk.owner}
      </p>
      <h1 className="mt-1 text-3xl font-semibold text-slate-950">{risk.title}</h1>

      {risk.impact.kind === "categorical" && (
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          This risk's impact is modelled categorically ({risk.impact.labels.join(", ")}) — it is{" "}
          <strong>not</strong> included in the firm's financial VaR/TVaR aggregate. Treat its simulation
          below as an ordinal severity-rank distribution only.
        </p>
      )}

      <div className="mt-6">
        <BowTie scenario={risk.scenario} controls={risk.controls} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Likelihood (mean)" value={`${(beliefs.likelihoodMean * 100).toFixed(1)}%`} sub={`90% CI: ${(beliefs.likelihoodInterval90.low * 100).toFixed(1)}%–${(beliefs.likelihoodInterval90.high * 100).toFixed(1)}%`} />
        <StatCard label="Detectability (mean)" value={`${(beliefs.detectabilityMean * 100).toFixed(1)}%`} sub={`90% CI: ${(beliefs.detectabilityInterval90.low * 100).toFixed(1)}%–${(beliefs.detectabilityInterval90.high * 100).toFixed(1)}%`} />
        <StatCard label="Velocity" value={`${risk.velocityDays} days`} sub="cause → peak consequence" />
      </div>

      <div className="mt-6">
        <SimulatePanel riskId={risk.id} />
      </div>

      {risk.linkedIndicators.length > 0 && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="text-lg font-semibold text-slate-950">Linked early-warning indicators</h3>
          <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
            {risk.linkedIndicators.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{sub}</p>
    </div>
  );
}
