import {
  LineChart,
  Sparkline,
  BulletGraph,
  DomainHeatmap,
  CalendarHeatmap,
  Histogram,
  Waterfall,
  Radar,
  Network,
  GanttText,
  CohortGrid,
  CalibrationCurve,
  ScoreMath,
} from "../viz";
import {
  grossMarginSeries,
  marginBullet,
  domainHeatmap,
  genCalendarActivity,
  findingSeverityHistogram,
  plWaterfall,
  radarAxes,
  radarSeries,
  networkNodes,
  networkEdges,
  ganttItems,
  ganttColumns,
  ganttToday,
  cohortRows,
  calibrationBuckets,
  calibrationTotalN,
  calibrationSampleMin,
  calibrationWindowDays,
} from "../viz/sampleData";

const calActivity = genCalendarActivity(52);

function Card({ title, n, children }: { title: string; n: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-white p-4" style={{ borderColor: "var(--line)" }}>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="font-semibold" style={{ fontSize: "var(--text-sm)" }}>
          {title}
        </h3>
        <span className="font-mono-ui" style={{ fontSize: "var(--text-2xs)", color: "var(--ink-3)" }}>
          {n}
        </span>
      </div>
      {children}
    </div>
  );
}

export function Catalog() {
  return (
    <div className="space-y-5">
      <p style={{ fontSize: "var(--text-sm)", color: "var(--ink-2)" }}>
        All twelve LEADOS.viz visualization types from the pt-C brief, each rendered against labeled sample data (see{" "}
        <code className="font-mono-ui">src/viz/sampleData.ts</code>). Every chart below carries a caption of the
        form <code className="font-mono-ui">[source] · [confidence] · [label]</code> and a "Show as table" toggle.
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="1 · Temporal Line Chart" n="viz.lineChart">
          <LineChart
            series={grossMarginSeries}
            options={{ yLabel: "%", yUnit: "%", target: 60, showDots: true, annotations: [{ x: "2025-07-01", label: "pricing change" }] }}
            meta={{ source: "from fin.pl.logged, n=7 measured points in window", confidence: "high", label: "Gross margin over 8 quarters" }}
          />
        </Card>

        <Card title="2 · Bullet Graph" n="viz.bulletGraph">
          <div className="space-y-4">
            <BulletGraph metric={marginBullet} meta={{ source: "from fin.pl.logged, n=1 period", confidence: "high", label: "Gross margin vs target" }} />
          </div>
        </Card>

        <Card title="3 · Sparklines" n="viz.sparkline">
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <p className="mb-1 font-mono-ui" style={{ fontSize: "var(--text-2xs)", color: "var(--ink-3)" }}>line</p>
              <Sparkline points={[4, 5, 4, 6, 7, 6, 8]} type="line" label="velocity" />
            </div>
            <div>
              <p className="mb-1 font-mono-ui" style={{ fontSize: "var(--text-2xs)", color: "var(--ink-3)" }}>bar</p>
              <Sparkline points={[2, 3, 1, 4, 3, 5, 4]} type="bar" color="var(--domain-engineering)" label="sprint points" />
            </div>
            <div>
              <p className="mb-1 font-mono-ui" style={{ fontSize: "var(--text-2xs)", color: "var(--ink-3)" }}>area (low conf)</p>
              <Sparkline points={[61, 60, 58, 59, 57, 58, 58]} type="area" conf="low" unit="%" color="var(--domain-finance)" label="gross margin" />
            </div>
            <div>
              <p className="mb-1 font-mono-ui" style={{ fontSize: "var(--text-2xs)", color: "var(--ink-3)" }}>win/loss</p>
              <Sparkline points={[1, 1, -1, 1, -1, -1, 1]} type="winloss" label="deals" />
            </div>
          </div>
        </Card>

        <Card title="4a · Heatmap — Domain Health" n="viz.heatmap(domain)">
          <DomainHeatmap cells={domainHeatmap} meta={{ source: "from health.domainScore, n=14 domains", confidence: "medium", label: "Current domain health scores" }} />
        </Card>

        <Card title="4b · Heatmap — Calendar Activity" n="viz.heatmap(calendar)">
          <CalendarHeatmap data={calActivity} meta={{ source: "from events log, n=364 days", confidence: "high", label: "Daily event-logging density, last 52 weeks", caveat: "sparse weekends by design" }} />
        </Card>

        <Card title="5 · Histogram" n="viz.histogram">
          <Histogram buckets={findingSeverityHistogram} meta={{ source: "from engine.findings, n=41 active findings", confidence: "high", label: "Finding severity distribution" }} meanLabel="mean sev" />
        </Card>

        <Card title="6 · Waterfall" n="viz.waterfall">
          <Waterfall items={plWaterfall} meta={{ source: "from fin.pl.logged, n=1 period", confidence: "high", label: "Revenue to EBITDA bridge, current quarter" }} />
        </Card>

        <Card title="7 · Radar (360)" n="viz.radar">
          <Radar axes={radarAxes} series={radarSeries} raterN={9} period="H2 2026" meta={{ source: "from self.assessment.logged + self.rater.logged", confidence: "medium", label: "Self vs rater mean across 8 leadership dimensions" }} />
        </Card>

        <Card title="8 · Network Graph" n="viz.network">
          <Network nodes={networkNodes} edges={networkEdges} meta={{ source: "from org.network.edge, n=8 edges", confidence: "low", label: "Org network map, layout is approximate", caveat: "positions carry no meaning" }} />
        </Card>

        <Card title="9 · Gantt Text" n="viz.ganttText">
          <GanttText items={ganttItems} columns={ganttColumns} today={ganttToday} meta={{ source: "from product.milestone.logged + sprint.review.logged", confidence: "medium", label: "Roadmap vs current sprint velocity trend" }} />
        </Card>

        <Card title="10 · Cohort Retention Grid" n="viz.cohortGrid">
          <CohortGrid rows={cohortRows} meta={{ source: "from fin.cohort.logged · source: your logged data", confidence: "medium", label: "Retention by signup cohort, M1/M3/M6/M12" }} />
        </Card>

        <Card title="11 · Calibration Curve" n="viz.calibrationCurve">
          <CalibrationCurve
            buckets={calibrationBuckets}
            totalN={calibrationTotalN}
            sampleMin={calibrationSampleMin}
            windowDays={calibrationWindowDays}
            meta={{ source: "from self.decision.logged, n=33 decisions", confidence: "medium", label: "Stated confidence vs realized accuracy" }}
          />
        </Card>

        <Card title="12 · Score Math Block" n="viz.scoreMath">
          <ScoreMath
            f={{
              severity: 4,
              confidence: "high",
              confidenceFactor: 1.0,
              smartFactors: [
                { label: "morning", mult: 1.4 },
                { label: "structural", mult: 1.2 },
              ],
              rank: 1,
              totalActive: 23,
              rule: "R103",
              domain: "finance",
              key: "R103:Q3-2026-gross-margin",
              source: "fin.pl.logged",
              eventId: "e742",
              date: "2026-10-01",
            }}
          />
        </Card>
      </div>
    </div>
  );
}
