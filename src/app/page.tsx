import { loadDashboard } from "@/lib/dashboard";
import { ActionForm } from "@/components/ActionForm";

export const dynamic = "force-dynamic";

function Section({
  title,
  seam,
  children,
}: {
  title: string;
  seam: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl bg-white p-6 shadow-[0_12px_30px_rgba(16,24,40,0.08)]">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
          {seam}
        </span>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? "bg-emerald-500" : score >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="h-2 w-full rounded-full bg-slate-100">
      <div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.min(100, score)}%` }} />
    </div>
  );
}

export default async function HomePage() {
  const data = await loadDashboard();

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-6 py-12">
      <header>
        <p className="text-sm uppercase tracking-[0.08em] text-slate-500">LEADOS</p>
        <h1 className="mt-2 text-[clamp(1.75rem,4vw,2.75rem)] font-semibold text-slate-950">
          Organizational intelligence, under human command
        </h1>
        <p className="mt-3 max-w-3xl text-slate-600">
          Six proven seams: domain fitness, engine assurance, chaos-tested risk belief, global
          consolidation into a board pack, voice-of-customer linked to strategy, and process
          mining feeding automation scoring. See{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm">docs/EVIDENCE-LEDGER.md</code>{" "}
          for what is verified versus planned.
        </p>
      </header>

      <Section title="Fitness — every domain's metrics" seam="Seam 1">
        <div className="grid gap-4 sm:grid-cols-2">
          {data.fitnessByDomain.map(({ domain, metrics, fitness }) => (
            <div key={domain.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium text-slate-900">{domain.name}</p>
                <p className="text-sm font-semibold text-slate-700">{fitness.score}/100</p>
              </div>
              <div className="mt-2">
                <ScoreBar score={fitness.score} />
              </div>
              <ul className="mt-3 space-y-1 text-xs text-slate-500">
                {metrics.map((m) => (
                  <li key={m.id}>
                    {m.name}: {m.value} / {m.target} {m.unit}
                  </li>
                ))}
                {metrics.length === 0 ? <li>No metrics recorded — score is 0, not fabricated.</li> : null}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Assurance — every engine monitored" seam="Seam 2">
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr]">
          <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-700">
            <p>
              Coverage: <strong>{data.assuranceSummary.coveragePct}%</strong>
            </p>
            <p>
              Worst severity:{" "}
              <strong className={data.assuranceSummary.worstSeverity === "critical" ? "text-red-600" : ""}>
                {data.assuranceSummary.worstSeverity}
              </strong>
            </p>
            <p>
              Pass {data.assuranceSummary.passing} / Warn {data.assuranceSummary.warning} / Fail{" "}
              {data.assuranceSummary.failing}
            </p>
            {data.assuranceSummary.unmonitored.length > 0 ? (
              <p className="mt-2 text-amber-700">
                Unmonitored: {data.assuranceSummary.unmonitored.join(", ")}
              </p>
            ) : null}
          </div>
          <ul className="space-y-1 text-sm text-slate-700">
            {data.latestCheckByEngine.map(({ engine, latest }) => (
              <li key={engine.id} className="flex justify-between border-b border-slate-100 py-1">
                <span>{engine.name}</span>
                <span className={!latest ? "text-amber-600" : latest.result === "fail" ? "text-red-600" : ""}>
                  {latest ? `${latest.result} (${latest.severity})` : "never checked"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section title="Chaos → risk belief" seam="Seam 3">
        <ul className="space-y-2 text-sm text-slate-700">
          {data.risks.map((risk) => (
            <li key={risk.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
              <div>
                <p className="font-medium text-slate-900">{risk.title}</p>
                <p className="text-xs text-slate-500">{risk.category}</p>
              </div>
              <div className="w-40">
                <ScoreBar score={Number(risk.beliefScore) * 100} />
                <p className="mt-1 text-right text-xs text-slate-500">
                  belief {Math.round(Number(risk.beliefScore) * 100)}%
                </p>
              </div>
            </li>
          ))}
        </ul>
        <ActionForm
          endpoint="/api/chaos"
          submitLabel="Run chaos experiment"
          description="Runs an experiment against risk id 1 and updates its belief score."
          fields={[
            { name: "name", label: "Experiment name", defaultValue: "Ad hoc drill" },
            { name: "targetRiskId", label: "Risk ID", defaultValue: String(data.risks[0]?.id ?? 1) },
            {
              name: "outcome",
              label: "Outcome",
              type: "select",
              options: ["held", "breached", "inconclusive"],
              defaultValue: "held",
            },
          ]}
        />
      </Section>

      <Section title="Global entities → consolidation → board pack" seam="Seam 4">
        <table className="w-full text-left text-sm text-slate-700">
          <thead>
            <tr className="text-xs uppercase text-slate-400">
              <th className="py-1">Entity</th>
              <th>Region</th>
              <th>Currency</th>
              <th>Revenue</th>
              <th>Costs</th>
            </tr>
          </thead>
          <tbody>
            {data.entities.map((e) => (
              <tr key={e.id} className="border-t border-slate-100">
                <td className="py-1">{e.name}</td>
                <td>{e.region}</td>
                <td>{e.currency}</td>
                <td>{Number(e.revenue).toLocaleString()}</td>
                <td>{Number(e.costs).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ActionForm
          endpoint="/api/consolidation"
          submitLabel="Run consolidation"
          fields={[{ name: "period", label: "Period", defaultValue: "2026-Q1" }]}
        />
        {data.boardPacks[0] ? (
          <pre className="mt-4 whitespace-pre-wrap rounded-xl bg-slate-900 p-4 text-xs text-slate-100">
            {data.boardPacks[0].summary}
          </pre>
        ) : (
          <p className="mt-4 text-xs text-slate-500">No board pack generated yet.</p>
        )}
      </Section>

      <Section title="Voice of customer → strategy" seam="Seam 5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-400">Top themes by urgency</p>
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {data.vocThemes.map((t) => (
                <li key={t.theme} className="flex justify-between border-b border-slate-100 py-1">
                  <span>{t.theme}</span>
                  <span className="text-xs text-slate-500">
                    {t.count} items · urgency {t.urgency.toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-400">Strategy items</p>
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {data.strategyItems.map((s) => (
                <li key={s.id} className="border-b border-slate-100 py-1">
                  {s.title} <span className="text-xs text-slate-400">({s.status})</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <ActionForm
          endpoint="/api/voc"
          submitLabel="Log feedback"
          fields={[
            { name: "source", label: "Source", defaultValue: "nps-survey" },
            { name: "theme", label: "Theme", defaultValue: "onboarding" },
            {
              name: "sentiment",
              label: "Sentiment",
              type: "select",
              options: ["positive", "neutral", "negative"],
              defaultValue: "negative",
            },
            { name: "text", label: "Text", defaultValue: "New feedback item" },
          ]}
        />
      </Section>

      <Section title="Process mining → automation scoring" seam="Seam 6">
        <ul className="space-y-2 text-sm text-slate-700">
          {data.automationPreview.map((p) => (
            <li key={p.processName} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <p className="font-medium text-slate-900">{p.processName}</p>
                <p className="text-sm font-semibold">{p.live.score}%</p>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                automatable steps: {p.live.basis.automatableSteps.join(", ") || "none"}
              </p>
            </li>
          ))}
        </ul>
        <ActionForm
          endpoint="/api/automation-score"
          submitLabel="Persist automation score"
          fields={[{ name: "processName", label: "Process name", defaultValue: "invoice-processing" }]}
        />
      </Section>

      <footer className="pt-4 text-xs text-slate-400">
        See docs/LEADOS-VISION.md, docs/EVIDENCE-LEDGER.md and docs/RED-TEAM-FINAL.md for what this
        build does and does not claim.
      </footer>
    </main>
  );
}
