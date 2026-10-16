import { DomainHeatmap, Sparkline } from "../viz";
import { domainHeatmap, patternList, correlationClusters, benchmarkGaps, domainScoreSparklines } from "../viz/sampleData";

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-white p-4" style={{ borderColor: "var(--line)" }}>
      <h3 className="mb-2 font-semibold" style={{ fontSize: "var(--text-sm)" }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

const sevColor: Record<number, string> = {
  1: "var(--sev-1)",
  2: "var(--sev-2)",
  3: "var(--sev-3)",
  4: "var(--sev-4)",
  5: "var(--sev-5)",
};

export function IntelligenceDashboard() {
  return (
    <div className="space-y-4">
      <Panel title="Domain health heatmap">
        <DomainHeatmap cells={domainHeatmap} meta={{ source: "health.domainScore, n=14 domains", confidence: "medium", label: "Current score per domain" }} />
      </Panel>

      <Panel title="Pattern list">
        <ul className="space-y-1.5">
          {patternList.map((p) => (
            <li key={p.pattern} className="flex items-center gap-2 font-mono-ui" style={{ fontSize: "var(--text-xs)" }}>
              <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: sevColor[p.severity] }} />
              <span style={{ color: "var(--ink-1)" }}>{p.pattern}</span>
              <span style={{ color: "var(--ink-3)" }}>· {p.domain}</span>
            </li>
          ))}
        </ul>
        <p className="mt-1 font-mono-ui" style={{ fontSize: "var(--text-2xs)", color: "var(--ink-3)" }}>
          engine.learnPatterns() · medium · behavioral pattern observation, derived from suppression/playbook history
        </p>
      </Panel>

      <Panel title="Correlation cluster tree">
        <div className="font-mono-ui" style={{ fontSize: "var(--text-xs)" }}>
          {correlationClusters.map((c) => (
            <div key={c.cluster} className="mb-2">
              <div style={{ color: "var(--ink-1)" }}>▾ {c.cluster}</div>
              {c.members.map((m) => (
                <div key={m} className="pl-4" style={{ color: "var(--ink-2)" }}>
                  ├─ {m}
                </div>
              ))}
            </div>
          ))}
        </div>
        <p className="mt-1 font-mono-ui" style={{ fontSize: "var(--text-2xs)", color: "var(--ink-3)" }}>
          correlate.cluster() · low · indented text structure, not a layout claim
        </p>
      </Panel>

      <Panel title="Benchmark gap table">
        <table className="w-full font-mono-ui" style={{ fontSize: "var(--text-xs)" }}>
          <thead>
            <tr style={{ color: "var(--ink-2)" }}>
              <th className="text-left font-normal">metric</th>
              <th className="text-right font-normal">you</th>
              <th className="text-right font-normal">benchmark</th>
              <th className="text-right font-normal">gap</th>
            </tr>
          </thead>
          <tbody>
            {benchmarkGaps.map((b) => (
              <tr key={b.metric} style={{ borderTop: "1px solid var(--surface-2)" }}>
                <td className="py-1">{b.metric}</td>
                <td className="text-right">{b.you}</td>
                <td className="text-right">{b.benchmark}</td>
                <td className="text-right" style={{ color: b.gap < 0 ? "var(--sev-4)" : "var(--sev-1)" }}>
                  {b.gap > 0 ? "+" : ""}
                  {b.gap}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 font-mono-ui" style={{ fontSize: "var(--text-2xs)", color: "var(--ink-3)" }}>
          benchmarks are third-party reference points, not your logged events · low · industry medians, illustrative
        </p>
      </Panel>

      <Panel title="30-day domain score trend">
        <div className="flex flex-wrap gap-4">
          {domainScoreSparklines.map((d) => (
            <div key={d.domain} className="text-center">
              <Sparkline points={d.series} type="line" color={d.color} label={d.domain} />
              <p className="mt-0.5 font-mono-ui" style={{ fontSize: "var(--text-2xs)", color: "var(--ink-3)" }}>
                {d.domain}
              </p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
