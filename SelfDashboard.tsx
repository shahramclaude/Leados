import { CalibrationCurve, Radar, Sparkline, BulletGraph } from "../viz";
import {
  calibrationBuckets,
  calibrationTotalN,
  calibrationSampleMin,
  calibrationWindowDays,
  radarAxes,
  radarSeries,
  energyTimeline,
  legacyScorecard,
  avoidanceTracker,
  reflectionStreak,
} from "../viz/sampleData";

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

export function SelfDashboard() {
  return (
    <div className="space-y-4">
      <Panel title="Calibration curve">
        <CalibrationCurve
          buckets={calibrationBuckets}
          totalN={calibrationTotalN}
          sampleMin={calibrationSampleMin}
          windowDays={calibrationWindowDays}
          meta={{ source: "self.decision.logged, n=33 decisions", confidence: "medium", label: "Stated confidence vs realized accuracy" }}
        />
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="360 radar: self vs rater mean">
          <Radar axes={radarAxes} series={radarSeries} raterN={9} period="H2 2026" meta={{ source: "self.assessment.logged + self.rater.logged", confidence: "medium", label: "Self vs rater mean, 8 dimensions" }} />
        </Panel>

        <Panel title="Energy timeline (30d)">
          <Sparkline points={energyTimeline} type="area" size="extended" color="var(--domain-executive)" unit="/10" label="energy" />
          <p className="mt-1 font-mono-ui" style={{ fontSize: "var(--text-2xs)", color: "var(--ink-3)" }}>
            self.pulse.logged · high · n=30 daily self-reports
          </p>
        </Panel>
      </div>

      <Panel title="Legacy scorecard">
        <div className="space-y-5">
          {legacyScorecard.map((l) => (
            <BulletGraph
              key={l.label}
              metric={l}
              meta={{ source: "self.legacy.logged, n=1 self-rating", confidence: "low", label: `${l.label} vs target`, caveat: "self-rated, not externally verified" }}
            />
          ))}
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Avoidance tracker">
          <table className="w-full font-mono-ui" style={{ fontSize: "var(--text-xs)" }}>
            <thead>
              <tr style={{ color: "var(--ink-2)" }}>
                <th className="text-left font-normal">domain</th>
                <th className="text-right font-normal">days since touch</th>
                <th className="text-left font-normal">note</th>
              </tr>
            </thead>
            <tbody>
              {avoidanceTracker.map((a) => (
                <tr key={a.domain} style={{ borderTop: "1px solid var(--surface-2)" }}>
                  <td className="py-1">{a.domain}</td>
                  <td className="text-right" style={{ color: a.daysSinceTouch > 45 ? "var(--sev-4)" : "var(--ink-1)" }}>
                    {a.daysSinceTouch}
                  </td>
                  <td style={{ color: "var(--ink-2)" }}>{a.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 font-mono-ui" style={{ fontSize: "var(--text-2xs)", color: "var(--ink-3)" }}>
            leadership_self.avoidancePatterns() · medium · domains with no logged touch events
          </p>
        </Panel>

        <Panel title="Reflection streak">
          <div className="flex items-end gap-3">
            <span className="font-mono-ui" style={{ fontSize: 40, color: "var(--ink-1)" }}>
              {reflectionStreak}
            </span>
            <span className="mb-1 font-mono-ui" style={{ fontSize: "var(--text-xs)", color: "var(--ink-2)" }}>
              consecutive weeks with a reflection.logged entry
            </span>
          </div>
          <p className="mt-1 font-mono-ui" style={{ fontSize: "var(--text-2xs)", color: "var(--ink-3)" }}>
            self.reflection.logged · high · n={reflectionStreak} consecutive weekly entries
          </p>
        </Panel>
      </div>
    </div>
  );
}
