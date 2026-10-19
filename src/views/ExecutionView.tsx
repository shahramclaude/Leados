"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import type {
  Blocker,
  CrossDependency,
  ExecutionIntelligenceReport,
  Milestone,
  PersonRecord,
  Project,
  ProjectDeliveryModel,
} from "@/lib/types";

interface ExecutionApiResponse {
  report: ExecutionIntelligenceReport;
  projects: Project[];
  milestones: Milestone[];
  blockers: Blocker[];
  crossDependencies: CrossDependency[];
  people: PersonRecord[];
}

type SortKey =
  | "name"
  | "status"
  | "owner"
  | "confidence"
  | "delta"
  | "probability"
  | "expected"
  | "blockers";

function confidenceColor(conf: number): string {
  const hue = Math.max(0, Math.min(120, conf * 1.2));
  return `hsl(${hue}, 62%, 45%)`;
}

function rowClass(conf: number): string {
  if (conf < 50) return "bg-red-50 hover:bg-red-100";
  if (conf < 70) return "bg-amber-50 hover:bg-amber-100";
  return "hover:bg-slate-50";
}

function fmtDate(d: string | Date | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function meterColor(value: number, invert = false): string {
  const v = invert ? 1 - value : value;
  if (v > 0.66) return "bg-emerald-500";
  if (v > 0.33) return "bg-amber-500";
  return "bg-red-500";
}

export default function ExecutionView() {
  const [data, setData] = useState<ExecutionApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("confidence");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [heatmapFilter, setHeatmapFilter] = useState<{ domain: string; severity: number } | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/execution", { cache: "no-store" });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const json = (await res.json()) as ExecutionApiResponse;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load execution intelligence");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const peopleById = useMemo(() => {
    const map = new Map<number, PersonRecord>();
    for (const p of data?.people ?? []) map.set(p.id, p);
    return map;
  }, [data]);

  const projectsById = useMemo(() => {
    const map = new Map<number, Project>();
    for (const p of data?.projects ?? []) map.set(p.id, p);
    return map;
  }, [data]);

  const deliveryById = useMemo(() => {
    const map = new Map<number, ProjectDeliveryModel>();
    for (const d of data?.report.deliveryConfidence ?? []) map.set(d.projectId, d);
    return map;
  }, [data]);

  const openBlockersByProject = useMemo(() => {
    const map = new Map<number, Blocker[]>();
    for (const b of data?.blockers ?? []) {
      if (b.resolvedAt) continue;
      const arr = map.get(b.projectId) ?? [];
      arr.push(b);
      map.set(b.projectId, arr);
    }
    return map;
  }, [data]);

  const milestonesByProject = useMemo(() => {
    const map = new Map<number, Milestone[]>();
    for (const m of data?.milestones ?? []) {
      const arr = map.get(m.projectId) ?? [];
      arr.push(m);
      map.set(m.projectId, arr);
    }
    return map;
  }, [data]);

  const filteredBlockers = useMemo(() => {
    if (!heatmapFilter || !data) return [];
    return data.blockers.filter(
      (b) =>
        !b.resolvedAt &&
        (b.domain ?? "operations") === heatmapFilter.domain &&
        b.severity === heatmapFilter.severity,
    );
  }, [heatmapFilter, data]);

  const sortedRows = useMemo(() => {
    const rows = data?.report.deliveryConfidence ?? [];
    const withExtras = rows.map((r) => ({
      ...r,
      ownerName: projectsById.get(r.projectId)?.ownerId
        ? peopleById.get(projectsById.get(r.projectId)!.ownerId!)?.name ?? "Unassigned"
        : "Unassigned",
      openBlockerCount: openBlockersByProject.get(r.projectId)?.length ?? 0,
    }));

    const dir = sortDir === "asc" ? 1 : -1;
    return withExtras.sort((a, b) => {
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "status":
          return a.status.localeCompare(b.status) * dir;
        case "owner":
          return a.ownerName.localeCompare(b.ownerName) * dir;
        case "confidence":
          return (a.computedConfidence - b.computedConfidence) * dir;
        case "delta":
          return (a.confidenceDelta - b.confidenceDelta) * dir;
        case "probability":
          return (a.completionProbability - b.completionProbability) * dir;
        case "expected":
          return (
            ((a.expectedCompletionDate ? new Date(a.expectedCompletionDate).getTime() : 0) -
              (b.expectedCompletionDate ? new Date(b.expectedCompletionDate).getTime() : 0)) *
            dir
          );
        case "blockers":
          return (a.openBlockerCount - b.openBlockerCount) * dir;
        default:
          return 0;
      }
    });
  }, [data, projectsById, peopleById, openBlockersByProject, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  async function resolveBlocker(id: number) {
    await fetch(`/api/execution/blockers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolve: true }),
    });
    await load();
  }

  if (loading && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500">
        Loading execution intelligence…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-red-600">
        {error ?? "No data available"}
      </div>
    );
  }

  const { report } = data;
  const onTrackCount = report.deliveryConfidence.filter((d) => d.computedConfidence > 70).length;
  const atRiskCount = report.atRiskProjects.length;
  const sev4Count = data.blockers.filter((b) => !b.resolvedAt && b.severity >= 4).length;

  const selected = selectedProjectId ? deliveryById.get(selectedProjectId) : null;
  const selectedProject = selectedProjectId ? projectsById.get(selectedProjectId) : null;

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <header className="border-b border-slate-200 bg-white px-8 py-6">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Leados</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Execution Intelligence</h1>
        <p className="mt-1 text-sm text-slate-500">
          Generated {new Date(report.generatedAt).toLocaleString()}
        </p>
      </header>

      <main className="mx-auto max-w-[1600px] px-8 py-6">
        {/* KPI ROW */}
        <section className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <Kpi label="Execution Health" value={`${report.executionHealthScore}`} suffix="/100" />
          <Kpi label="On-Track Projects" value={`${onTrackCount}`} tone="good" />
          <Kpi label="At-Risk Projects" value={`${atRiskCount}`} tone={atRiskCount > 0 ? "bad" : "good"} />
          <Kpi label="Open Sev4+ Blockers" value={`${sev4Count}`} tone={sev4Count > 0 ? "bad" : "good"} />
          <Kpi label="Org Momentum Index" value={`${report.momentumIndex}`} suffix="/100" trend={report.velocityTrend} />
        </section>

        {/* PHYSICS STATUS BAR */}
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
            <Meter label="Entropy" value={report.physicsState.entropy} invert />
            <Meter label="Energy" value={report.physicsState.energyBudget} />
            <Meter label="Inertia" value={report.physicsState.inertia} invert />
            <Meter label="Momentum" value={report.physicsState.momentum} />
            <Meter label="Friction" value={report.physicsState.frictionIndex} invert />
          </div>
          <p className="mt-4 text-sm italic text-slate-600">
            {report.deliveryConfidence[0]?.physicsAnnotation ?? "No active projects to annotate."}
          </p>
        </section>

        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
          {/* CRITICAL PATH DAG */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Critical Path</h2>
              {report.criticalPath.cyclesDetected.length > 0 && (
                <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-red-700">
                  ⚠ Cycle Detected
                </span>
              )}
            </div>
            <CriticalPathDag
              projects={data.projects}
              edges={data.crossDependencies}
              deliveryById={deliveryById}
              criticalChain={report.criticalPath.chain}
              cycles={report.criticalPath.cyclesDetected}
              onSelect={setSelectedProjectId}
            />
            <p className="mt-3 text-sm text-slate-600">{report.criticalPath.bottleneckReason}</p>
          </section>

          {/* BLOCKER HEATMAP */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-lg font-semibold text-slate-900">Blocker Heatmap</h2>
            <BlockerHeatmap
              grid={report.blockerHeatmap}
              onSelectCell={(domain, severity) => setHeatmapFilter({ domain, severity })}
              active={heatmapFilter}
            />
            {heatmapFilter && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-600">
                    {heatmapFilter.domain} · sev {heatmapFilter.severity}
                  </p>
                  <button
                    className="text-xs text-indigo-600 hover:underline"
                    onClick={() => setHeatmapFilter(null)}
                  >
                    clear
                  </button>
                </div>
                {filteredBlockers.length === 0 ? (
                  <p className="text-xs text-slate-400">No open blockers in this cell.</p>
                ) : (
                  <ul className="space-y-1">
                    {filteredBlockers.map((b) => (
                      <li key={b.id} className="text-xs text-slate-700">
                        <span className="font-medium">{b.title}</span> —{" "}
                        {projectsById.get(b.projectId)?.name ?? "unknown project"}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        </div>

        {/* PROJECT TABLE */}
        <section className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Projects</h2>
          <table className="w-full min-w-[1100px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <Th label="Project" sortKey="name" current={sortKey} dir={sortDir} onClick={toggleSort} />
                <Th label="Status" sortKey="status" current={sortKey} dir={sortDir} onClick={toggleSort} />
                <Th label="Owner" sortKey="owner" current={sortKey} dir={sortDir} onClick={toggleSort} />
                <Th label="Confidence" sortKey="confidence" current={sortKey} dir={sortDir} onClick={toggleSort} />
                <Th label="Delta" sortKey="delta" current={sortKey} dir={sortDir} onClick={toggleSort} />
                <Th label="Completion Prob." sortKey="probability" current={sortKey} dir={sortDir} onClick={toggleSort} />
                <Th label="Expected Date" sortKey="expected" current={sortKey} dir={sortDir} onClick={toggleSort} />
                <Th label="Blockers" sortKey="blockers" current={sortKey} dir={sortDir} onClick={toggleSort} />
                <th className="px-3 py-2">Physics</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <tr
                  key={row.projectId}
                  className={`cursor-pointer border-b border-slate-100 ${rowClass(row.computedConfidence)}`}
                  onClick={() => setSelectedProjectId(row.projectId)}
                >
                  <td className="px-3 py-2 font-medium text-slate-900">{row.name}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-3 py-2 text-slate-600">{row.ownerName}</td>
                  <td className="px-3 py-2 font-semibold" style={{ color: confidenceColor(row.computedConfidence) }}>
                    {Math.round(row.computedConfidence)}%
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <DeltaCell base={row.baseConfidence} computed={row.computedConfidence} />
                  </td>
                  <td className="px-3 py-2 text-slate-600">{Math.round(row.completionProbability * 100)}%</td>
                  <td className="px-3 py-2 text-slate-600">
                    {fmtDate(row.expectedCompletionDate)}
                    {row.lateByDays ? (
                      <span className="ml-1 text-xs text-red-500">(+{Math.round(row.lateByDays)}d)</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{row.openBlockerCount}</td>
                  <td className="max-w-[260px] truncate px-3 py-2 text-xs italic text-slate-500">
                    {row.physicsAnnotation}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>

      {selected && selectedProject && (
        <ProjectDetailPanel
          delivery={selected}
          project={selectedProject}
          owner={selectedProject.ownerId ? peopleById.get(selectedProject.ownerId) ?? null : null}
          milestones={milestonesByProject.get(selected.projectId) ?? []}
          blockers={openBlockersByProject.get(selected.projectId) ?? []}
          peopleById={peopleById}
          crossDeps={data.crossDependencies}
          projectsById={projectsById}
          deliveryById={deliveryById}
          onClose={() => setSelectedProjectId(null)}
          onResolveBlocker={resolveBlocker}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// KPI card
// -----------------------------------------------------------------------------

function Kpi({
  label,
  value,
  suffix,
  tone,
  trend,
}: {
  label: string;
  value: string;
  suffix?: string;
  tone?: "good" | "bad";
  trend?: "accelerating" | "stable" | "decelerating";
}) {
  const color = tone === "bad" ? "text-red-600" : tone === "good" ? "text-emerald-600" : "text-slate-900";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${color}`}>
        {value}
        {suffix && <span className="text-base font-medium text-slate-400">{suffix}</span>}
      </p>
      {trend && (
        <p className="mt-1 text-xs text-slate-400">
          {trend === "accelerating" ? "▲ accelerating" : trend === "decelerating" ? "▼ decelerating" : "● stable"}
        </p>
      )}
    </div>
  );
}

function Meter({ label, value, invert }: { label: string; value: number; invert?: boolean }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
        <span className="font-semibold uppercase tracking-wide">{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${meterColor(value, invert)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    planning: "bg-slate-100 text-slate-600",
    active: "bg-blue-100 text-blue-700",
    blocked: "bg-red-100 text-red-700",
    complete: "bg-emerald-100 text-emerald-700",
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${styles[status] ?? "bg-slate-100 text-slate-600"}`}>
      {status}
    </span>
  );
}

function DeltaCell({ base, computed }: { base: number; computed: number }) {
  const delta = computed - base;
  if (computed < base - 15) {
    return <span className="font-semibold text-red-600">⚠ Manager overconfident by {Math.abs(Math.round(delta))}%</span>;
  }
  if (delta > 15) {
    return <span className="font-semibold text-emerald-600">↑ Underestimated by {Math.round(delta)}%</span>;
  }
  return <span className="text-slate-500">{delta > 0 ? "+" : ""}{Math.round(delta)}%</span>;
}

function Th({
  label,
  sortKey,
  current,
  dir,
  onClick,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: "asc" | "desc";
  onClick: (key: SortKey) => void;
}) {
  const active = current === sortKey;
  return (
    <th
      className="cursor-pointer select-none px-3 py-2 hover:text-slate-800"
      onClick={() => onClick(sortKey)}
    >
      {label} {active ? (dir === "asc" ? "▲" : "▼") : ""}
    </th>
  );
}

// -----------------------------------------------------------------------------
// Blocker heatmap (8 domains x 5 severities)
// -----------------------------------------------------------------------------

function BlockerHeatmap({
  grid,
  onSelectCell,
  active,
}: {
  grid: ExecutionIntelligenceReport["blockerHeatmap"];
  onSelectCell: (domain: string, severity: number) => void;
  active: { domain: string; severity: number } | null;
}) {
  function cellColor(count: number) {
    if (count === 0) return "bg-transparent border border-slate-100";
    if (count === 1) return "bg-slate-400";
    if (count === 2) return "bg-amber-500";
    return "bg-red-600";
  }

  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-1">
        <thead>
          <tr>
            <th className="w-20"></th>
            {[1, 2, 3, 4, 5].map((s) => (
              <th key={s} className="pb-1 text-center text-[10px] text-slate-400">
                S{s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((row) => (
            <tr key={row[0]?.domain}>
              <td className="pr-2 text-right text-[10px] capitalize text-slate-500">{row[0]?.domain}</td>
              {row.map((cell) => {
                const isActive = active?.domain === cell.domain && active?.severity === cell.severity;
                return (
                  <td key={`${cell.domain}-${cell.severity}`}>
                    <button
                      title={`${cell.domain} · sev ${cell.severity} · ${cell.count} open`}
                      onClick={() => onSelectCell(cell.domain, cell.severity)}
                      className={`h-8 w-8 rounded-sm ${cellColor(cell.count)} ${isActive ? "ring-2 ring-indigo-500" : ""} flex items-center justify-center text-[10px] font-bold text-white`}
                    >
                      {cell.count > 0 ? cell.count : ""}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Critical path DAG (pure SVG)
// -----------------------------------------------------------------------------

function CriticalPathDag({
  projects,
  edges,
  deliveryById,
  criticalChain,
  cycles,
  onSelect,
}: {
  projects: Project[];
  edges: CrossDependency[];
  deliveryById: Map<number, ProjectDeliveryModel>;
  criticalChain: number[];
  cycles: number[][];
  onSelect: (id: number) => void;
}) {
  const blocksEdges = edges.filter((e) => e.type === "blocks");
  const cycleNodeSet = new Set(cycles.flat());

  // Layer assignment via longest-path-from-source over the (acyclic portion
  // of the) graph; cycle nodes fall back to level 0 so rendering never hangs.
  const level = new Map<number, number>();
  for (const p of projects) level.set(p.id, 0);
  const adjacency = new Map<number, number[]>();
  for (const p of projects) adjacency.set(p.id, []);
  for (const e of blocksEdges) {
    if (!adjacency.has(e.fromProject)) continue;
    adjacency.get(e.fromProject)!.push(e.toProject);
  }

  for (let iter = 0; iter < projects.length; iter++) {
    for (const e of blocksEdges) {
      if (cycleNodeSet.has(e.fromProject) || cycleNodeSet.has(e.toProject)) continue;
      const nextLevel = (level.get(e.fromProject) ?? 0) + 1;
      if (nextLevel > (level.get(e.toProject) ?? 0)) {
        level.set(e.toProject, nextLevel);
      }
    }
  }

  const levelBuckets = new Map<number, number[]>();
  for (const p of projects) {
    const lvl = level.get(p.id) ?? 0;
    const arr = levelBuckets.get(lvl) ?? [];
    arr.push(p.id);
    levelBuckets.set(lvl, arr);
  }

  const colWidth = 180;
  const rowHeight = 90;
  const positions = new Map<number, { x: number; y: number }>();
  for (const [lvl, ids] of levelBuckets.entries()) {
    ids.forEach((id, i) => {
      positions.set(id, { x: 80 + lvl * colWidth, y: 60 + i * rowHeight });
    });
  }

  const maxLevel = Math.max(0, ...Array.from(levelBuckets.keys()));
  const maxRows = Math.max(1, ...Array.from(levelBuckets.values()).map((v) => v.length));
  const width = Math.max(600, 80 + (maxLevel + 1) * colWidth);
  const height = Math.max(400, 60 + maxRows * rowHeight);

  function isChainEdge(a: number, b: number) {
    const ia = criticalChain.indexOf(a);
    const ib = criticalChain.indexOf(b);
    return ia >= 0 && ib === ia + 1;
  }

  return (
    <div className="overflow-auto rounded-xl border border-slate-100 bg-slate-50" style={{ maxHeight: 420 }}>
      <svg width={width} height={height}>
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="#94a3b8" />
          </marker>
          <marker id="arrow-amber" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="#d97706" />
          </marker>
        </defs>

        {blocksEdges.map((e) => {
          const from = positions.get(e.fromProject);
          const to = positions.get(e.toProject);
          if (!from || !to) return null;
          const chainEdge = isChainEdge(e.fromProject, e.toProject);
          return (
            <line
              key={e.id}
              x1={from.x + 30}
              y1={from.y}
              x2={to.x - 34}
              y2={to.y}
              stroke={chainEdge ? "#d97706" : "#cbd5e1"}
              strokeWidth={chainEdge ? 3 : 1.5}
              markerEnd={chainEdge ? "url(#arrow-amber)" : "url(#arrow)"}
            />
          );
        })}

        {projects.map((p) => {
          const pos = positions.get(p.id);
          if (!pos) return null;
          const delivery = deliveryById.get(p.id);
          const conf = delivery?.computedConfidence ?? 50;
          const inChain = criticalChain.includes(p.id);
          const inCycle = cycleNodeSet.has(p.id);
          return (
            <g key={p.id} transform={`translate(${pos.x}, ${pos.y})`} className="cursor-pointer" onClick={() => onSelect(p.id)}>
              <circle
                r={30}
                fill={confidenceColor(conf)}
                stroke={inCycle ? "#dc2626" : inChain ? "#d97706" : "#1f2937"}
                strokeWidth={inChain ? 4 : inCycle ? 2.5 : 1}
                strokeDasharray={inCycle ? "4 3" : undefined}
                opacity={0.9}
              />
              <text textAnchor="middle" y={-2} fontSize={10} fontWeight={700} fill="white">
                {p.name.length > 12 ? `${p.name.slice(0, 11)}…` : p.name}
              </text>
              <text textAnchor="middle" y={12} fontSize={10} fill="white">
                {Math.round(conf)}%
              </text>
              {inCycle && (
                <text textAnchor="middle" y={46} fontSize={9} fontWeight={700} fill="#dc2626">
                  CYCLE
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Completion probability gauge (SVG arc)
// -----------------------------------------------------------------------------

function ProbabilityGauge({ probability }: { probability: number }) {
  const radius = 54;
  const circumference = Math.PI * radius; // half circle
  const pct = Math.max(0, Math.min(1, probability));
  const dash = circumference * pct;
  const color = pct > 0.66 ? "#059669" : pct > 0.33 ? "#d97706" : "#dc2626";

  return (
    <svg width={140} height={80} viewBox="0 0 140 80">
      <path d="M10,70 A54,54 0 0 1 130,70" fill="none" stroke="#e2e8f0" strokeWidth={12} strokeLinecap="round" />
      <path
        d="M10,70 A54,54 0 0 1 130,70"
        fill="none"
        stroke={color}
        strokeWidth={12}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference}`}
      />
      <text x={70} y={62} textAnchor="middle" fontSize={20} fontWeight={700} fill="#0f172a">
        {Math.round(pct * 100)}%
      </text>
    </svg>
  );
}

// -----------------------------------------------------------------------------
// Milestone timeline (SVG)
// -----------------------------------------------------------------------------

function MilestoneTimeline({ milestones }: { milestones: Milestone[] }) {
  if (milestones.length === 0) {
    return <p className="text-xs text-slate-400">No milestones defined.</p>;
  }
  const sorted = [...milestones].sort(
    (a, b) => (a.dueDate ? a.dueDate.valueOf() : 0) - (b.dueDate ? b.dueDate.valueOf() : 0),
  );
  const colorFor: Record<string, string> = {
    done: "#059669",
    pending: "#64748b",
    overdue: "#dc2626",
    cancelled: "#94a3b8",
  };
  const width = Math.max(480, sorted.length * 110);

  return (
    <div className="overflow-x-auto">
      <svg width={width} height={90}>
        <line x1={20} y1={30} x2={width - 20} y2={30} stroke="#e2e8f0" strokeWidth={3} />
        {sorted.map((m, i) => {
          const x = 20 + (i * (width - 40)) / Math.max(1, sorted.length - 1 || 1);
          return (
            <g key={m.id} transform={`translate(${x}, 30)`}>
              <circle r={7} fill={colorFor[m.status] ?? "#64748b"} />
              <text y={-14} textAnchor="middle" fontSize={9} fill="#334155">
                {m.title.length > 14 ? `${m.title.slice(0, 13)}…` : m.title}
              </text>
              <text y={26} textAnchor="middle" fontSize={8} fill="#94a3b8">
                {fmtDate(m.dueDate)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Project detail panel (slide-in)
// -----------------------------------------------------------------------------

function ProjectDetailPanel({
  delivery,
  project,
  owner,
  milestones,
  blockers,
  peopleById,
  crossDeps,
  projectsById,
  deliveryById,
  onClose,
  onResolveBlocker,
}: {
  delivery: ProjectDeliveryModel;
  project: Project;
  owner: PersonRecord | null;
  milestones: Milestone[];
  blockers: Blocker[];
  peopleById: Map<number, PersonRecord>;
  crossDeps: CrossDependency[];
  projectsById: Map<number, Project>;
  deliveryById: Map<number, ProjectDeliveryModel>;
  onClose: () => void;
  onResolveBlocker: (id: number) => void;
}) {
  const upstream = crossDeps.filter((d) => d.toProject === project.id && d.type === "blocks");
  const downstream = crossDeps.filter((d) => d.fromProject === project.id && d.type === "blocks");

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <aside className="relative z-50 h-full w-[520px] max-w-full overflow-y-auto bg-white p-6 shadow-2xl">
        <button onClick={onClose} className="absolute right-4 top-4 text-slate-400 hover:text-slate-700">
          ✕
        </button>

        <div className="mb-4">
          <h2 className="text-xl font-bold text-slate-900">{project.name}</h2>
          <div className="mt-2 flex items-center gap-2">
            <StatusBadge status={project.status} />
            <span className="text-sm text-slate-500">Owner: {owner?.name ?? "Unassigned"}</span>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Self-assessed</p>
            <p className="text-2xl font-bold text-slate-700">{delivery.baseConfidence}%</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Computed</p>
            <p className="text-2xl font-bold" style={{ color: confidenceColor(delivery.computedConfidence) }}>
              {Math.round(delivery.computedConfidence)}%
            </p>
          </div>
        </div>

        <div className="mb-5 flex items-center gap-4">
          <ProbabilityGauge probability={delivery.completionProbability} />
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Expected completion</p>
            <p className="text-sm font-semibold text-slate-800">{fmtDate(delivery.expectedCompletionDate)}</p>
            {delivery.lateByDays ? (
              <p className="text-xs text-red-500">{Math.round(delivery.lateByDays)} days past target</p>
            ) : (
              <p className="text-xs text-emerald-600">On schedule</p>
            )}
          </div>
        </div>

        <div className="mb-5">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Risk factors</h3>
          <ul className="space-y-1">
            {delivery.riskFactors.length === 0 && (
              <li className="text-xs text-slate-400">No risk factors detected.</li>
            )}
            {delivery.riskFactors.map((f, i) => (
              <li key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-xs">
                <span className="text-slate-600">{f.label}</span>
                <span className={`font-bold ${f.impact < 0 ? "text-red-600" : "text-emerald-600"}`}>
                  {f.impact > 0 ? "+" : ""}
                  {f.impact}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mb-5">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Milestones</h3>
          <MilestoneTimeline milestones={milestones} />
        </div>

        <div className="mb-5">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Open blockers</h3>
          {blockers.length === 0 ? (
            <p className="text-xs text-slate-400">No open blockers.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400">
                  <th className="py-1">Title</th>
                  <th className="py-1">Sev</th>
                  <th className="py-1">Assigned</th>
                  <th className="py-1"></th>
                </tr>
              </thead>
              <tbody>
                {blockers.map((b) => (
                  <tr key={b.id} className="border-t border-slate-100">
                    <td className="py-1.5">{b.title}</td>
                    <td className="py-1.5">{b.severity}</td>
                    <td className="py-1.5">{b.assignedTo ? peopleById.get(b.assignedTo)?.name ?? "—" : "Unassigned"}</td>
                    <td className="py-1.5">
                      <button
                        onClick={() => onResolveBlocker(b.id)}
                        className="rounded-md bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-emerald-700"
                      >
                        Resolve
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="mb-5 grid grid-cols-2 gap-4">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Upstream</h3>
            {upstream.length === 0 ? (
              <p className="text-xs text-slate-400">None</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {upstream.map((d) => {
                  const p = projectsById.get(d.fromProject);
                  const conf = deliveryById.get(d.fromProject)?.computedConfidence;
                  return (
                    <li key={d.id}>
                      {p?.name ?? "unknown"} {conf !== undefined ? `(${Math.round(conf)}%)` : ""}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Downstream</h3>
            {downstream.length === 0 ? (
              <p className="text-xs text-slate-400">None</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {downstream.map((d) => {
                  const p = projectsById.get(d.toProject);
                  const conf = deliveryById.get(d.toProject)?.computedConfidence;
                  return (
                    <li key={d.id}>
                      {p?.name ?? "unknown"} {conf !== undefined ? `(${Math.round(conf)}%)` : ""}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <p className="text-xs italic text-slate-500">{delivery.physicsAnnotation}</p>
      </aside>
    </div>
  );
}
