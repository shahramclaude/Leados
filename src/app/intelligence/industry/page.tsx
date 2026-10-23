import { desc } from "drizzle-orm";
import { db } from "@/db";
import { industryMetricSnapshots, industrySegments, valueChainEdges, valueChainNodes } from "@/db/schema";
import { EvidenceChip } from "@/components/EvidenceChip";
import { computeCoverageReport, type ValueChainGraph } from "@/lib/industry/valueChain";
import { directGraphNotAvailableNotice } from "@/lib/seams/part31-ecosystem-graph";

export const dynamic = "force-dynamic";

export default async function IndustryLensPage() {
  const segments = await db.select().from(industrySegments);
  const segment = segments[0];

  if (!segment) {
    return (
      <div className="mx-auto max-w-3xl rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
        No industry segment seeded yet. Run <code>npm run db:seed</code>.
      </div>
    );
  }

  const snapshots = await db
    .select()
    .from(industryMetricSnapshots)
    .orderBy(desc(industryMetricSnapshots.period));

  const nodes = await db.select().from(valueChainNodes);
  const edges = await db.select().from(valueChainEdges);
  const graph: ValueChainGraph = {
    nodes: nodes.map((n) => ({
      id: n.id,
      name: n.name,
      tier: n.tier,
      role: n.role,
      revenueWeight: n.revenueWeight,
      dataConfidence: n.dataConfidence,
      isGapFilled: n.isGapFilled,
      evidenceClass: n.evidenceClass,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      fromNodeId: e.fromNodeId,
      toNodeId: e.toNodeId,
      relationship: e.relationship,
      dependencyWeight: e.dependencyWeight,
      correlatedShockGroup: e.correlatedShockGroup,
      evidenceClass: e.evidenceClass,
      isGapFilled: e.isGapFilled,
    })),
  };
  const coverage = computeCoverageReport(graph);

  const tierOrder = { self: 0, tier1: 1, tier2: 2, tier3: 3 } as const;
  const sortedNodes = [...nodes].sort((a, b) => tierOrder[a.tier] - tierOrder[b.tier]);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-950">Market Structure — {segment.name}</h2>
        <p className="mt-1 text-sm text-slate-500">NAICS {segment.naicsCode} · {segment.description}</p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-2 pr-4">Period</th>
                <th className="py-2 pr-4">HHI</th>
                <th className="py-2 pr-4">Band</th>
                <th className="py-2 pr-4">Entrants / Exits</th>
                <th className="py-2 pr-4">Net Entry Rate</th>
                <th className="py-2 pr-4">Cycle Phase</th>
                <th className="py-2 pr-4">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s) => (
                <tr key={s.id} className="border-b border-slate-100">
                  <td className="py-2 pr-4 font-medium">{s.period}</td>
                  <td className="py-2 pr-4">{s.hhi.toFixed(0)}</td>
                  <td className="py-2 pr-4 capitalize">{s.hhiBand}</td>
                  <td className="py-2 pr-4">
                    {s.entrants} / {s.exits}
                  </td>
                  <td className="py-2 pr-4">{(s.netEntryRate * 100).toFixed(1)}%</td>
                  <td className="py-2 pr-4">
                    {s.cyclePhase ? (
                      <span className="capitalize">
                        {s.cyclePhase}{" "}
                        <span className="text-xs text-slate-400">
                          (confidence {((s.cycleConfidence ?? 0) * 100).toFixed(0)}%)
                        </span>
                      </span>
                    ) : (
                      <span className="text-slate-400">insufficient data</span>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    <EvidenceChip evidenceClass={s.evidenceClass} sourceRef={s.sourceRef} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          HHI band thresholds: &lt;1500 unconcentrated, 1500–2500 moderate, &gt;2500 concentrated (US DOJ/FTC
          convention). Cycle phase is a heuristic slope/level classifier over utilization — a model estimate,
          not a verified macro call.
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-950">Extended Value Chain</h2>
        <p className="mt-1 text-sm text-slate-500">{directGraphNotAvailableNotice()}</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <CoverageStat label="Tier-1 (direct)" value={coverage.tier1Count} />
          <CoverageStat label="Tier-2 (known)" value={coverage.tier2Count} />
          <CoverageStat label="Tier-3 (known)" value={coverage.tier3Count} />
          <CoverageStat label="Gap-filled nodes" value={coverage.gapFilledCount} warn />
        </div>
        <div className="mt-3 space-y-1 text-sm text-amber-700">
          <p>⚠ {coverage.tier2GapNote}</p>
          <p>⚠ {coverage.tier3GapNote}</p>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-2 pr-4">Node</th>
                <th className="py-2 pr-4">Tier</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Data Confidence</th>
                <th className="py-2 pr-4">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {sortedNodes.map((n) => (
                <tr key={n.id} className="border-b border-slate-100">
                  <td className="py-2 pr-4 font-medium">
                    {n.name}
                    {n.isGapFilled ? <span className="ml-2 text-xs text-amber-600">(gap-filled)</span> : null}
                  </td>
                  <td className="py-2 pr-4 uppercase text-xs text-slate-500">{n.tier}</td>
                  <td className="py-2 pr-4 capitalize">{n.role}</td>
                  <td className="py-2 pr-4">{(n.dataConfidence * 100).toFixed(0)}%</td>
                  <td className="py-2 pr-4">
                    <EvidenceChip evidenceClass={n.evidenceClass} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-slate-400">
          {edges.length} dependency edges loaded. Correlated-shock groups (shared regions/vendors/regimes) feed
          the Contagion Map&apos;s correlated-shock extension.
        </p>
      </section>
    </div>
  );
}

function CoverageStat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 text-center ${warn ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
      <div className="text-2xl font-semibold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
