import { currentModelCard } from "@/lib/org-design/modelCard";
import SeedButton from "./_components/SeedButton";

export const dynamic = "force-dynamic";

export default async function OrgDesignOverviewPage() {
  const card = await currentModelCard();

  return (
    <div className="space-y-6">
      <SeedButton />

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="m-0 text-lg font-semibold text-slate-950">What this module does</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li><strong>Org Design Lab</strong> — model structural moves (merge, split, reporting-line change, centralize, decentralize) on the org twin and see delivery, network, and human impact side by side.</li>
          <li><strong>Human-Impact Ledger</strong> — mandatory per-person accounting of every structural move. Each person sees their own status first, before any org-wide announcement.</li>
          <li><strong>Deal Room</strong> — M&amp;A deal phases, synergy estimates as intervals, change-of-control obligation cascades, integration-difficulty scoring, and a Day-1 readiness checklist.</li>
          <li><strong>Scenario Comparison</strong> — alternative structures compared across delivery / network / human dimensions. No single "winner" score is produced.</li>
          <li><strong>Post-Mortem Bridge</strong> — realized outcomes vs. predictions, feeding a damped recalibration loop so the twin learns from each reorg.</li>
        </ul>
      </section>

      <section className="rounded-2xl border border-slate-300 bg-white p-6 shadow-sm">
        <h2 className="m-0 text-lg font-semibold text-slate-950">Twin model card</h2>
        <p className="mt-1 text-sm text-slate-500">
          Version {card.version} · {card.validationStatus} · last calibrated {new Date(card.lastCalibratedAt).toLocaleString()}
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="m-0 text-sm font-semibold text-slate-800">What it models</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
              {card.whatItModels.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="m-0 text-sm font-semibold text-rose-700">Known limits (read before trusting a number)</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-rose-800">
              {card.knownLimits.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-4">
          <h3 className="m-0 text-sm font-semibold text-slate-800">Declared error margins</h3>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-slate-700 md:grid-cols-3">
            {Object.entries(card.declaredErrorMargins).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                <dt className="font-medium">{k}</dt>
                <dd className="text-slate-500">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="mt-4">
          <h3 className="m-0 text-sm font-semibold text-slate-800">Lineage</h3>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
            {card.lineage.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  );
}
