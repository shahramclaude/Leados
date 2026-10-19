"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  AdaptivePlaybook,
  DecisionLedgerEntry,
  Domain,
  GraphSubgraph,
  InstitutionalMemoryDigest,
  MemoryEdge,
  MemoryNode,
  NodeType,
  RelationType,
  RepeatingPattern,
} from "@/lib/types";
import { ALL_DOMAINS } from "@/lib/types";

// ---------------------------------------------------------------------------
// Force-directed layout
//
// Fruchterman, T. M. J., & Reingold, E. M. (1991). "Graph Drawing by
// Force-directed Placement." Software: Practice and Experience, 21(11).
//
// This is a from-scratch adaptation run for a *fixed* number of iterations
// (no continuous animation loop — React renders the final static layout).
// Every tunable below is explicitly a DESIGN PARAMETER, not derived from the
// paper itself.
// ---------------------------------------------------------------------------
interface Point {
  x: number;
  y: number;
}

const LAYOUT_ITERATIONS = 50; // DESIGN PARAMETER
const LAYOUT_DAMPING = 0.85; // DESIGN PARAMETER
const LAYOUT_CENTER_GRAVITY = 0.05; // DESIGN PARAMETER
const LAYOUT_MARGIN = 36; // DESIGN PARAMETER (keeps nodes inside the viewBox)

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function computeForceLayout(
  nodeIds: number[],
  edges: { source: number; target: number }[],
  width: number,
  height: number,
): Record<number, Point> {
  const area = width * height;
  // k = sqrt(area / n) — the "ideal" distance between connected nodes.
  const k = Math.sqrt(area / Math.max(1, nodeIds.length)); // DESIGN PARAMETER (formula per FR91)

  const positions: Record<number, Point> = {};
  nodeIds.forEach((id) => {
    positions[id] = {
      x: width / 2 + (seededRandom(id * 2 + 1) - 0.5) * width * 0.8,
      y: height / 2 + (seededRandom(id * 3 + 7) - 0.5) * height * 0.8,
    };
  });

  const centerX = width / 2;
  const centerY = height / 2;

  for (let iter = 0; iter < LAYOUT_ITERATIONS; iter += 1) {
    const disp: Record<number, Point> = {};
    nodeIds.forEach((id) => {
      disp[id] = { x: 0, y: 0 };
    });

    // Repulsion: every pair of nodes pushes apart, F_repel = k^2 / distance
    for (let i = 0; i < nodeIds.length; i += 1) {
      for (let j = i + 1; j < nodeIds.length; j += 1) {
        const a = nodeIds[i];
        const b = nodeIds[j];
        const dx = positions[a].x - positions[b].x;
        const dy = positions[a].y - positions[b].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const force = (k * k) / dist;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        disp[a].x += fx;
        disp[a].y += fy;
        disp[b].x -= fx;
        disp[b].y -= fy;
      }
    }

    // Attraction: connected nodes pulled together, F_attract = distance^2 / k
    for (const edge of edges) {
      if (!positions[edge.source] || !positions[edge.target]) continue;
      const dx = positions[edge.source].x - positions[edge.target].x;
      const dy = positions[edge.source].y - positions[edge.target].y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const force = (dist * dist) / k;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      disp[edge.source].x -= fx;
      disp[edge.source].y -= fy;
      disp[edge.target].x += fx;
      disp[edge.target].y += fy;
    }

    // Center gravity + damped position update
    nodeIds.forEach((id) => {
      const pos = positions[id];
      const gx = LAYOUT_CENTER_GRAVITY * (centerX - pos.x);
      const gy = LAYOUT_CENTER_GRAVITY * (centerY - pos.y);
      pos.x += (disp[id].x + gx) * LAYOUT_DAMPING;
      pos.y += (disp[id].y + gy) * LAYOUT_DAMPING;
      pos.x = Math.min(width - LAYOUT_MARGIN, Math.max(LAYOUT_MARGIN, pos.x));
      pos.y = Math.min(height - LAYOUT_MARGIN, Math.max(LAYOUT_MARGIN, pos.y));
    });
  }

  return positions;
}

// ---------------------------------------------------------------------------
// Visual mapping
// ---------------------------------------------------------------------------
const NODE_TYPES: NodeType[] = ["person", "decision", "finding", "insight", "belief", "playbook", "domain"];

const NODE_COLOR_VAR: Record<NodeType, string> = {
  person: "var(--node-person)",
  decision: "var(--node-decision)",
  finding: "var(--node-finding)",
  insight: "var(--node-insight)",
  belief: "var(--node-insight)",
  playbook: "var(--node-playbook)",
  domain: "var(--node-domain)",
};

const EDGE_COLOR_VAR: Record<RelationType, string> = {
  caused: "var(--edge-caused)",
  resolved: "var(--edge-resolved)",
  informed: "var(--edge-informed)",
  triggered: "var(--edge-triggered)",
  blocked: "var(--edge-blocked)",
  created: "var(--edge-created)",
};

const DATE_RANGE_OPTIONS = [7, 30, 90, 365] as const;

function nodeRadius(importance: number): number {
  return 8 + Math.min(1, Math.max(0, importance)) * 14;
}

function NodeShape({ node, radius, fill, opacity }: { node: MemoryNode; radius: number; fill: string; opacity: number }) {
  switch (node.type) {
    case "person":
      return <circle r={radius} fill={fill} opacity={opacity} />;
    case "domain":
      return <circle r={radius * 1.3} fill={fill} opacity={opacity} />;
    case "decision": {
      const r = radius;
      return (
        <rect
          x={-r}
          y={-r}
          width={r * 2}
          height={r * 2}
          fill={fill}
          opacity={opacity}
          transform="rotate(45)"
        />
      );
    }
    case "finding": {
      const r = radius;
      const points = `0,${-r} ${r},${r} ${-r},${r}`;
      return <polygon points={points} fill={fill} opacity={opacity} />;
    }
    case "playbook": {
      const r = radius;
      return <rect x={-r} y={-r} width={r * 2} height={r * 2} fill={fill} opacity={opacity} />;
    }
    case "insight":
    case "belief":
    default: {
      const r = radius;
      const pts = Array.from({ length: 6 }, (_, i) => {
        const angle = (Math.PI / 3) * i - Math.PI / 2;
        return `${r * Math.cos(angle)},${r * Math.sin(angle)}`;
      }).join(" ");
      return <polygon points={pts} fill={fill} opacity={opacity} />;
    }
  }
}

function formatAgeDays(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
}

export default function KnowledgeView() {
  const [graph, setGraph] = useState<GraphSubgraph | null>(null);
  const [digest, setDigest] = useState<InstitutionalMemoryDigest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rangeDays, setRangeDays] = useState<number>(90);
  const [activeTypes, setActiveTypes] = useState<Set<NodeType>>(new Set(NODE_TYPES));
  const [domainFilter, setDomainFilter] = useState<Domain | "all">("all");
  const [ruleKeyFilter, setRuleKeyFilter] = useState<string | null>(null);

  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<number | null>(null);

  const [ledgerOpen, setLedgerOpen] = useState(true);

  const [playbookModal, setPlaybookModal] = useState<AdaptivePlaybook | null>(null);
  const [playbookLoading, setPlaybookLoading] = useState<number | null>(null);
  const [playbookError, setPlaybookError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`/api/knowledge/graph?days=${rangeDays}`).then((r) => r.json()),
      fetch(`/api/knowledge/digest`).then((r) => r.json()),
    ])
      .then(([graphRes, digestRes]) => {
        if (cancelled) return;
        if (graphRes?.error) throw new Error(graphRes.error);
        if (digestRes?.error) throw new Error(digestRes.error);
        setGraph(graphRes as GraphSubgraph);
        setDigest(digestRes as InstitutionalMemoryDigest);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || "Failed to load knowledge data");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rangeDays]);

  const filteredNodes = useMemo<MemoryNode[]>(() => {
    if (!graph) return [];
    return graph.nodes.filter((n) => {
      if (!activeTypes.has(n.type)) return false;
      if (domainFilter !== "all" && n.domain !== domainFilter) return false;
      if (ruleKeyFilter && String(n.metadata.ruleKey ?? "") !== ruleKeyFilter) return false;
      return true;
    });
  }, [graph, activeTypes, domainFilter, ruleKeyFilter]);

  const filteredNodeIds = useMemo(() => new Set(filteredNodes.map((n) => n.id)), [filteredNodes]);

  const filteredEdges = useMemo<MemoryEdge[]>(() => {
    if (!graph) return [];
    return graph.edges.filter((e) => filteredNodeIds.has(e.sourceId) && filteredNodeIds.has(e.targetId));
  }, [graph, filteredNodeIds]);

  const width = 960;
  const height = 560;

  const positions = useMemo(() => {
    return computeForceLayout(
      filteredNodes.map((n) => n.id),
      filteredEdges.map((e) => ({ source: e.sourceId, target: e.targetId })),
      width,
      height,
    );
  }, [filteredNodes, filteredEdges]);

  const nodeById = useMemo(() => new Map(filteredNodes.map((n) => [n.id, n])), [filteredNodes]);
  const allNodeById = useMemo(() => new Map((graph?.nodes ?? []).map((n) => [n.id, n])), [graph]);

  const neighborIds = useMemo(() => {
    if (hoveredNodeId == null) return new Set<number>();
    const set = new Set<number>();
    filteredEdges.forEach((e) => {
      if (e.sourceId === hoveredNodeId) set.add(e.targetId);
      if (e.targetId === hoveredNodeId) set.add(e.sourceId);
    });
    return set;
  }, [hoveredNodeId, filteredEdges]);

  const selectedNode = selectedNodeId != null ? allNodeById.get(selectedNodeId) ?? null : null;
  const selectedNodeEdges = useMemo(() => {
    if (!graph || selectedNodeId == null) return [];
    return graph.edges.filter((e) => e.sourceId === selectedNodeId || e.targetId === selectedNodeId);
  }, [graph, selectedNodeId]);

  async function startPlaybook(node: MemoryNode) {
    const findingId = Number(node.metadata.findingId ?? NaN);
    setPlaybookError(null);
    if (Number.isNaN(findingId)) {
      setPlaybookError("This issue has no linked finding record to generate a playbook from.");
      return;
    }
    setPlaybookLoading(node.id);
    try {
      const res = await fetch(`/api/knowledge/playbook?findingId=${findingId}`);
      const data = await res.json();
      if (data?.error) throw new Error(data.error);
      setPlaybookModal(data as AdaptivePlaybook);
    } catch (err) {
      setPlaybookError(err instanceof Error ? err.message : "Failed to generate playbook");
    } finally {
      setPlaybookLoading(null);
    }
  }

  const meanConfidenceError = useMemo(() => {
    const entries = (digest?.decisionsWithOutcomes ?? []).filter((d) => d.confidenceError != null);
    if (entries.length === 0) return null;
    return (entries.reduce((sum, d) => sum + (d.confidenceError ?? 0), 0) / entries.length) * 100;
  }, [digest]);

  const calibrationBias = useMemo(() => {
    const entries = (digest?.decisionsWithOutcomes ?? []).filter((d) => d.outcome != null);
    if (entries.length === 0) return null;
    const avgConfidence = entries.reduce((sum, d) => sum + d.confidenceAtDecision, 0) / entries.length;
    const avgActual = entries.reduce((sum, d) => sum + (d.outcome ? 1 : 0), 0) / entries.length;
    return avgConfidence > avgActual ? "overconfident" : "underconfident";
  }, [digest]);

  function toggleType(type: NodeType) {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <header>
          <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-600">Leados · Part 8</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950 sm:text-4xl">Knowledge Architecture</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            The organization&apos;s central memory: a force-directed graph of people, decisions, findings and
            playbooks, plus the institutional memory digest and decision ledger derived from it.
          </p>
        </header>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* SECTION 1 — Graph Explorer                                    */}
        {/* ------------------------------------------------------------- */}
        <section className="rounded-3xl bg-white p-5 shadow-[0_20px_50px_rgba(16,24,40,0.08)]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-950">Graph Explorer</h2>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {DATE_RANGE_OPTIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => setRangeDays(d)}
                  className={`rounded-full px-3 py-1 font-medium transition ${
                    rangeDays === d ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  Last {d}d
                </button>
              ))}
              <select
                value={domainFilter}
                onChange={(e) => setDomainFilter(e.target.value as Domain | "all")}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-medium text-slate-700"
              >
                <option value="all">All domains</option>
                {ALL_DOMAINS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              {ruleKeyFilter && (
                <button
                  onClick={() => setRuleKeyFilter(null)}
                  className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-800"
                >
                  Pattern: {ruleKeyFilter} ✕
                </button>
              )}
            </div>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {NODE_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => toggleType(type)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
                  activeTypes.has(type)
                    ? "border-slate-300 bg-white text-slate-800"
                    : "border-slate-100 bg-slate-50 text-slate-400"
                }`}
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: NODE_COLOR_VAR[type], opacity: activeTypes.has(type) ? 1 : 0.3 }}
                />
                {type}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="grid h-[420px] place-items-center text-sm text-slate-500">Loading knowledge graph…</div>
          ) : filteredNodes.length === 0 ? (
            <div className="grid h-[420px] place-items-center text-sm text-slate-500">
              No nodes match the current filters.
            </div>
          ) : (
            <svg viewBox={`0 0 ${width} ${height}`} className="h-[420px] w-full rounded-2xl bg-slate-50">
              <g>
                {filteredEdges.map((edge) => {
                  const source = positions[edge.sourceId];
                  const target = positions[edge.targetId];
                  if (!source || !target) return null;
                  const dim =
                    hoveredNodeId != null && edge.sourceId !== hoveredNodeId && edge.targetId !== hoveredNodeId;
                  return (
                    <line
                      key={edge.id}
                      x1={source.x}
                      y1={source.y}
                      x2={target.x}
                      y2={target.y}
                      stroke={EDGE_COLOR_VAR[edge.relation]}
                      strokeWidth={1.5}
                      opacity={dim ? 0.08 : 0.55}
                    />
                  );
                })}
              </g>
              <g>
                {filteredNodes.map((node) => {
                  const pos = positions[node.id];
                  if (!pos) return null;
                  const isSelected = selectedNodeId === node.id;
                  const isHovered = hoveredNodeId === node.id;
                  const isNeighbor = neighborIds.has(node.id);
                  const dim = hoveredNodeId != null && !isHovered && !isNeighbor;
                  return (
                    <g
                      key={node.id}
                      transform={`translate(${pos.x}, ${pos.y})`}
                      onClick={() => setSelectedNodeId(node.id)}
                      onMouseEnter={() => setHoveredNodeId(node.id)}
                      onMouseLeave={() => setHoveredNodeId(null)}
                      style={{ cursor: "pointer" }}
                    >
                      <NodeShape
                        node={node}
                        radius={nodeRadius(node.importance)}
                        fill={NODE_COLOR_VAR[node.type]}
                        opacity={dim ? 0.2 : 1}
                      />
                      {(isSelected || isHovered) && (
                        <text y={-nodeRadius(node.importance) - 6} textAnchor="middle" fontSize={10} fill="#0f172a">
                          {node.label}
                        </text>
                      )}
                      {isSelected && (
                        <NodeShape node={node} radius={nodeRadius(node.importance) + 4} fill="none" opacity={1} />
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>
          )}

          {/* Node detail panel */}
          <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
            {selectedNode ? (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-semibold text-slate-950">{selectedNode.label}</h3>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
                    {selectedNode.type} · {selectedNode.domain}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Created {new Date(selectedNode.createdAt).toLocaleString()} · importance{" "}
                  {selectedNode.importance.toFixed(2)}
                  {selectedNode.severity != null ? ` · severity ${selectedNode.severity}` : ""}
                </p>
                {selectedNode.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selectedNode.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-600">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Edges</p>
                  {selectedNodeEdges.length === 0 ? (
                    <p className="mt-1 text-xs text-slate-500">No recorded relationships.</p>
                  ) : (
                    <ul className="mt-1 space-y-1 text-xs text-slate-700">
                      {selectedNodeEdges.map((edge) => {
                        const isOutgoing = edge.sourceId === selectedNode.id;
                        const otherId = isOutgoing ? edge.targetId : edge.sourceId;
                        const other = allNodeById.get(otherId);
                        return (
                          <li key={edge.id} className="flex items-center gap-1.5">
                            <span
                              className="inline-block h-2 w-2 rounded-full"
                              style={{ background: EDGE_COLOR_VAR[edge.relation] }}
                            />
                            {isOutgoing ? (
                              <span>
                                <strong>{edge.relation}</strong> → {other?.label ?? `#${otherId}`}
                              </span>
                            ) : (
                              <span>
                                {other?.label ?? `#${otherId}`} <strong>{edge.relation}</strong> → this
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Click a node to inspect its details and relationships.</p>
            )}
          </div>
        </section>

        {/* ------------------------------------------------------------- */}
        {/* SECTION 2 — Institutional Memory                               */}
        {/* ------------------------------------------------------------- */}
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-3xl bg-white p-5 shadow-[0_20px_50px_rgba(16,24,40,0.08)]">
            <h2 className="text-lg font-semibold text-slate-950">Repeating Patterns</h2>
            <p className="mt-1 text-xs text-slate-500">Click a row to filter the graph to that issue type.</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-slate-500">
                    <th className="pb-2">Issue type</th>
                    <th className="pb-2">Count</th>
                    <th className="pb-2">Avg severity</th>
                    <th className="pb-2">Avg resolution</th>
                    <th className="pb-2">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {(digest?.repeatingPatterns ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-4 text-sm text-slate-500">
                        No repeating patterns detected yet (need 3+ occurrences in 12 months).
                      </td>
                    </tr>
                  ) : (
                    digest!.repeatingPatterns.map((p: RepeatingPattern) => (
                      <tr
                        key={p.ruleKey}
                        onClick={() => setRuleKeyFilter(p.ruleKey)}
                        className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                      >
                        <td className="py-2 pr-2 font-medium text-slate-800">{p.label}</td>
                        <td className="py-2 pr-2">{p.occurrences}</td>
                        <td className="py-2 pr-2">{p.avgSeverity.toFixed(1)}</td>
                        <td className="py-2 pr-2">
                          {p.avgResolutionDays != null ? `${p.avgResolutionDays.toFixed(0)}d` : "—"}
                        </td>
                        <td className="py-2 pr-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              p.trend === "worsening"
                                ? "bg-red-100 text-red-700"
                                : p.trend === "improving"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {p.trend}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-[0_20px_50px_rgba(16,24,40,0.08)]">
            <h2 className="text-lg font-semibold text-slate-950">Chronic Issues</h2>
            <p className="mt-1 text-xs text-slate-500">Open findings older than 90 days with no recorded resolution.</p>
            {playbookError && <p className="mt-2 text-xs text-red-600">{playbookError}</p>}
            <ul className="mt-3 space-y-2">
              {(digest?.unresolvedChronicIssues ?? []).length === 0 ? (
                <li className="text-sm text-slate-500">No chronic issues — nice work.</li>
              ) : (
                digest!.unresolvedChronicIssues.map((issue) => (
                  <li
                    key={issue.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800">{issue.label}</p>
                      <p className="text-xs text-slate-500">
                        {formatAgeDays(issue.createdAt)}d old · severity {issue.severity ?? "—"} · {issue.domain}
                      </p>
                    </div>
                    <button
                      onClick={() => startPlaybook(issue)}
                      disabled={playbookLoading === issue.id}
                      className="shrink-0 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                    >
                      {playbookLoading === issue.id ? "Generating…" : "Start Playbook"}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </section>

        {/* ------------------------------------------------------------- */}
        {/* SECTION 3 — Decision Ledger                                    */}
        {/* ------------------------------------------------------------- */}
        <section className="rounded-3xl bg-white p-5 shadow-[0_20px_50px_rgba(16,24,40,0.08)]">
          <button
            onClick={() => setLedgerOpen((v) => !v)}
            className="flex w-full items-center justify-between text-left"
          >
            <h2 className="text-lg font-semibold text-slate-950">Decision Ledger</h2>
            <span className="text-sm text-slate-500">{ledgerOpen ? "Collapse ▲" : "Expand ▼"}</span>
          </button>
          {ledgerOpen && (
            <>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-slate-500">
                      <th className="pb-2">Decision</th>
                      <th className="pb-2">Domain</th>
                      <th className="pb-2">Outcome</th>
                      <th className="pb-2">Days to outcome</th>
                      <th className="pb-2">Confidence at decision</th>
                      <th className="pb-2">Confidence error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(digest?.decisionsWithOutcomes ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-4 text-sm text-slate-500">
                          No decisions with recorded outcomes yet.
                        </td>
                      </tr>
                    ) : (
                      digest!.decisionsWithOutcomes.map((d: DecisionLedgerEntry) => (
                        <tr key={d.id} className="border-t border-slate-100">
                          <td className="py-2 pr-2 font-medium text-slate-800">{d.label}</td>
                          <td className="py-2 pr-2">{d.domain}</td>
                          <td className="py-2 pr-2">{d.outcome ? "✓" : "✗"}</td>
                          <td className="py-2 pr-2">{d.daysToOutcome != null ? d.daysToOutcome.toFixed(0) : "—"}</td>
                          <td className="py-2 pr-2">{(d.confidenceAtDecision * 100).toFixed(0)}%</td>
                          <td className="py-2 pr-2">
                            {d.confidenceError != null ? `${(d.confidenceError * 100).toFixed(0)}%` : "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {meanConfidenceError != null && (
                <div className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  Mean confidence error: <strong>{meanConfidenceError.toFixed(1)}%</strong>
                  {meanConfidenceError > 25 && calibrationBias && (
                    <span className="ml-1 text-amber-700">
                      — Your confidence calibration needs work: you are systematically {calibrationBias}.
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {playbookModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4"
          onClick={() => setPlaybookModal(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Adaptive Playbook · urgency {playbookModal.urgency.replace("_", " ")}
                </p>
                <h3 className="mt-1 text-xl font-semibold text-slate-950">{playbookModal.name}</h3>
              </div>
              <button onClick={() => setPlaybookModal(null)} className="text-slate-400 hover:text-slate-700">
                ✕
              </button>
            </div>
            <p className="mt-3 text-sm text-slate-600">{playbookModal.description}</p>

            <ol className="mt-4 space-y-2">
              {playbookModal.steps.map((step) => (
                <li key={step.order} className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-800">
                      {step.order}. {step.title}
                    </span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-600">
                      {step.responsible} · {step.timeboxDays}d
                    </span>
                  </div>
                  {step.automaticallyDone && (
                    <p className="mt-1 text-xs text-emerald-700">
                      ⚙ Automated by Leados: {step.automationAction}
                    </p>
                  )}
                </li>
              ))}
            </ol>

            <div className="mt-4 space-y-1 text-sm">
              <p>
                <strong>Expected outcome:</strong> {playbookModal.expectedOutcome}
              </p>
              <p>
                <strong>Success metric:</strong> {playbookModal.successMetric}
              </p>
              <p>
                <strong>Failure signal:</strong> {playbookModal.failureSignal}
              </p>
              <p className="text-xs text-slate-500">
                Confidence score: {(playbookModal.confidenceScore * 100).toFixed(0)}%
                {playbookModal.basedOnPastPattern && (
                  <> · based on past pattern &ldquo;{playbookModal.basedOnPastPattern.node.label}&rdquo;</>
                )}
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
