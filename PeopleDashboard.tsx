import { BulletGraph, Sparkline, CalendarHeatmap } from "../viz";
import { spanLoadBullet, headcountSparkline, oneOnOneCadence, directs } from "../viz/sampleData";

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

export function PeopleDashboard() {
  return (
    <div className="space-y-4">
      <Panel title="Span of control">
        <BulletGraph metric={spanLoadBullet} meta={{ source: "people.org.logged, n=1 snapshot", confidence: "high", label: "Directs + skips vs capacity" }} />
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Headcount trend (90d)">
          <Sparkline points={headcountSparkline} type="line" size="extended" color="var(--domain-people)" label="headcount" />
          <p className="mt-1 font-mono-ui" style={{ fontSize: "var(--text-2xs)", color: "var(--ink-3)" }}>
            people.headcount.logged · high · n=90 daily snapshots
          </p>
        </Panel>

        <Panel title="1:1 cadence (who was met, when)">
          <CalendarHeatmap data={oneOnOneCadence} meta={{ source: "people.oneonone.logged, n=91 days", confidence: "high", label: "1:1 meetings logged per day, last 13 weeks" }} />
        </Panel>
      </div>

      <Panel title="Pulse trend per direct (load / mood)">
        <table className="w-full font-mono-ui" style={{ fontSize: "var(--text-xs)" }}>
          <thead>
            <tr style={{ color: "var(--ink-2)" }}>
              <th className="text-left font-normal">name</th>
              <th className="text-left font-normal">load (7d)</th>
              <th className="text-left font-normal">mood (7d)</th>
              <th className="text-left font-normal">feedback balance</th>
            </tr>
          </thead>
          <tbody>
            {directs.map((d) => (
              <tr key={d.name} style={{ borderTop: "1px solid var(--surface-2)" }}>
                <td className="py-1.5">{d.name}</td>
                <td>
                  <Sparkline points={d.load} type="bar" color="var(--sev-3)" unit="" label={`${d.name} load`} />
                </td>
                <td>
                  <Sparkline points={d.mood} type="line" color="var(--domain-people)" label={`${d.name} mood`} />
                </td>
                <td>
                  <div className="flex h-3 w-28 overflow-hidden rounded">
                    <div
                      style={{
                        width: `${(d.positive / (d.positive + d.corrective)) * 100}%`,
                        background: "var(--sev-1)",
                      }}
                    />
                    <div
                      style={{
                        width: `${(d.corrective / (d.positive + d.corrective)) * 100}%`,
                        background: "var(--sev-5)",
                      }}
                    />
                  </div>
                  <span className="font-mono-ui" style={{ fontSize: "var(--text-2xs)", color: "var(--ink-3)" }}>
                    {d.positive}:{d.corrective}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 font-mono-ui" style={{ fontSize: "var(--text-2xs)", color: "var(--ink-3)" }}>
          people.pulse.logged + people.feedback.logged · medium · n=4 directs, trailing 7 days
        </p>
      </Panel>
    </div>
  );
}
