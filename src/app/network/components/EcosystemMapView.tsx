"use client";

import { useEffect, useMemo, useState } from "react";
import type { EdgeType, GraphEdge, GraphNode, NodeType } from "@/lib/network/types";
import { getJson, postJson } from "../lib/api";

interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface ChokeScanResult {
  source: string;
  sourceName: string;
  sink: string;
  sinkName: string;
  minCutValue: number;
  cutEdgeIds: string[];
}

interface ShockAffected {
  nodeId: string;
  nodeName: string;
  hops: number;
  estimatedRecoveryDays: number;
}

interface ShockResponse {
  removedNodeId: string;
  affected: ShockAffected[];
  totalAffectedNodes: number;
  maxRecoveryDays: number;
  summary: string;
}

const NODE_TYPE_COLOR: Record<NodeType, string> = {
  internal_team: "#1d4ed8",
  internal_person: "#2563eb",
  partner: "#b45309",
  supplier: "#78350f",
  customer: "#047857",
  regulator: "#7c3aed",
};

const EDGE_TYPE_COLOR: Record<EdgeType, string> = {
  employs: "#94a3b8",
  reports_to: "#64748b",
  depends_on: "#dc2626",
  partners_with: "#b45309",
  serves: "#047857",
  regulated_by: "#7c3aed",
  supplies: "#0891b2",
};

const EDGE_TYPES: EdgeType[] = [
  "employs",
  "reports_to",
  "depends_on",
  "partners_with",
  "serves",
  "regulated_by",
  "supplies",
];

function layout(nodes: GraphNode[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const groups: Record<string, GraphNode[]> = {};
  for (const n of nodes) {
    groups[n.type] = groups[n.type] ?? [];
    groups[n.type].push(n);
  }
  const typeOrder: NodeType[] = [
    "internal_team",
    "internal_person",
    "partner",
    "supplier",
    "customer",
    "regulator",
  ];
  const ringRadius: Record<string, number> = {
    internal_team: 0,
    internal_person: 150,
    partner: 260,
    supplier: 260,
    customer: 260,
    regulator: 260,
  };
  const center = { x: 320, y: 320 };

  let externalIndex = 0;
  const externalTotal = nodes.filter((n) => n.isExternal).length || 1;

  for (const type of typeOrder) {
    const group = groups[type] ?? [];
    if (type === "internal_team") {
      group.forEach((n) => positions.set(n.id, { ...center }));
      continue;
    }
    if (type === "internal_person") {
      group.forEach((n, i) => {
        const angle = (2 * Math.PI * i) / Math.max(group.length, 1);
        positions.set(n.id, {
          x: center.x + ringRadius.internal_person * Math.cos(angle),
          y: center.y + ringRadius.internal_person * Math.sin(angle),
        });
      });
      continue;
    }
    // External rings share one big circle so different types interleave by angle
    group.forEach((n) => {
      const angle = (2 * Math.PI * externalIndex) / externalTotal;
      positions.set(n.id, {
        x: center.x + ringRadius.partner * Math.cos(angle),
        y: center.y + ringRadius.partner * Math.sin(angle),
      });
      externalIndex += 1;
    });
  }

  return positions;
}

export function EcosystemMapView() {
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edgeTypeFilter, setEdgeTypeFilter] = useState<EdgeType | "all">("all");
  const [viewMode, setViewMode] = useState<"graph" | "list">("graph");
  const [chokeScan, setChokeScan] = useState<ChokeScanResult[] | null>(null);
  const [shockNodeId, setShockNodeId] = useState<string>("");
  const [shock, setShock] = useState<ShockResponse | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getJson<GraphResponse>("/api/network/graph")
      .then(setGraph)
      .catch((e) => setError(e.message));
  }, []);

  const positions = useMemo(() => (graph ? layout(graph.nodes) : new Map()), [graph]);

  const visibleEdges = useMemo(() => {
    if (!graph) return [];
    return edgeTypeFilter === "all" ? graph.edges : graph.edges.filter((e) => e.edgeType === edgeTypeFilter);
  }, [graph, edgeTypeFilter]);

  const chokeEdgeIds = useMemo(() => {
    if (!chokeScan) return new Set<string>();
    const worst = [...chokeScan].sort((a, b) => a.minCutValue - b.minCutValue).slice(0, 3);
    return new Set(worst.flatMap((w) => w.cutEdgeIds));
  }, [chokeScan]);

  const affectedIds = useMemo(() => new Set((shock?.affected ?? []).map((a) => a.nodeId)), [shock]);

  async function runChokeScan() {
    setBusy(true);
    setError(null);
    try {
      const result = await getJson<{ results: ChokeScanResult[] }>("/api/network/metrics/choke-points");
      setChokeScan(result.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : "choke-point scan failed");
    } finally {
      setBusy(false);
    }
  }

  async function runShock() {
    if (!shockNodeId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await postJson<ShockResponse>("/api/network/scenarios/shock", {
        type: "partner_loss",
        nodeId: shockNodeId,
      });
      setShock(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "shock scenario failed");
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return <p role="alert" className="text-red-700">{error}</p>;
  }
  if (!graph) {
    return <p aria-live="polite">Loading ecosystem graph…</p>;
  }

  const nodeName = (id: string) => graph.nodes.find((n) => n.id === id)?.name ?? id;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-white p-4">
        <label className="flex flex-col text-sm">
          <span className="font-medium text-slate-700">Filter by edge type</span>
          <select
            className="mt-1 rounded-md border border-slate-300 px-2 py-1"
            value={edgeTypeFilter}
            onChange={(e) => setEdgeTypeFilter(e.target.value as EdgeType | "all")}
          >
            <option value="all">All edge types</option>
            {EDGE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col text-sm">
          <span className="font-medium text-slate-700">Blast-radius: simulate losing…</span>
          <select
            className="mt-1 rounded-md border border-slate-300 px-2 py-1"
            value={shockNodeId}
            onChange={(e) => setShockNodeId(e.target.value)}
          >
            <option value="">Select a node</option>
            {graph.nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name} ({n.type})
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={runShock}
          disabled={!shockNodeId || busy}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          Run shock scenario
        </button>

        <button
          type="button"
          onClick={runChokeScan}
          disabled={busy}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 disabled:opacity-40"
        >
          Highlight choke points
        </button>

        <div className="ml-auto flex gap-2" role="group" aria-label="View mode">
          <button
            type="button"
            aria-pressed={viewMode === "graph"}
            onClick={() => setViewMode("graph")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              viewMode === "graph" ? "bg-blue-700 text-white" : "border border-slate-300 text-slate-800"
            }`}
          >
            Graph view
          </button>
          <button
            type="button"
            aria-pressed={viewMode === "list"}
            onClick={() => setViewMode("list")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              viewMode === "list" ? "bg-blue-700 text-white" : "border border-slate-300 text-slate-800"
            }`}
          >
            Accessible list view
          </button>
        </div>
      </div>

      {shock && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" aria-live="polite">
          <p className="font-medium">{shock.summary}</p>
          {shock.affected.length > 0 && (
            <p className="mt-1">Worst-case estimated recovery: {shock.maxRecoveryDays} day(s).</p>
          )}
        </div>
      )}

      {viewMode === "graph" ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <svg
            viewBox="0 0 640 640"
            role="img"
            aria-hidden="true"
            className="h-[560px] w-full"
          >
            {visibleEdges.map((e) => {
              const s = positions.get(e.source);
              const t = positions.get(e.target);
              if (!s || !t) return null;
              const isChoke = chokeEdgeIds.has(e.id);
              return (
                <line
                  key={e.id}
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  stroke={isChoke ? "#dc2626" : EDGE_TYPE_COLOR[e.edgeType]}
                  strokeWidth={isChoke ? 3.5 : 1 + e.strength * 2}
                  strokeDasharray={isChoke ? "6 3" : undefined}
                  opacity={0.65}
                />
              );
            })}
            {graph.nodes.map((n) => {
              const p = positions.get(n.id);
              if (!p) return null;
              const isAffected = affectedIds.has(n.id);
              const isRemoved = shock?.removedNodeId === n.id;
              return (
                <g key={n.id} transform={`translate(${p.x}, ${p.y})`}>
                  <circle
                    r={isRemoved ? 14 : 10}
                    fill={isRemoved ? "#111827" : NODE_TYPE_COLOR[n.type]}
                    stroke={isAffected ? "#dc2626" : "white"}
                    strokeWidth={isAffected ? 3 : 1.5}
                  />
                  <text x={14} y={4} fontSize={11} fill="#0f172a">
                    {n.name}
                  </text>
                </g>
              );
            })}
          </svg>
          <p className="mt-2 text-xs text-slate-500">
            Decorative graph — see the “Accessible list view” for a full keyboard/screen-reader equivalent of
            every node, edge, and the current blast-radius / choke-point overlay.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[640px] text-left text-sm">
              <caption className="p-3 text-left text-sm font-medium text-slate-700">
                Ecosystem nodes ({graph.nodes.length}). Nodes affected by the current shock scenario are
                marked in the “Blast radius” column.
              </caption>
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th scope="col" className="px-3 py-2">Name</th>
                  <th scope="col" className="px-3 py-2">Type</th>
                  <th scope="col" className="px-3 py-2">External</th>
                  <th scope="col" className="px-3 py-2">Blast radius</th>
                </tr>
              </thead>
              <tbody>
                {graph.nodes.map((n) => {
                  const affected = shock?.affected.find((a) => a.nodeId === n.id);
                  return (
                    <tr key={n.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-medium text-slate-900">{n.name}</td>
                      <td className="px-3 py-2">{n.type}</td>
                      <td className="px-3 py-2">{n.isExternal ? "Yes" : "No"}</td>
                      <td className="px-3 py-2">
                        {n.id === shock?.removedNodeId
                          ? "Scenario subject"
                          : affected
                            ? `${affected.hops} hop(s), ~${affected.estimatedRecoveryDays}d recovery`
                            : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[720px] text-left text-sm">
              <caption className="p-3 text-left text-sm font-medium text-slate-700">
                Ecosystem edges ({visibleEdges.length} shown of {graph.edges.length} total, filter: {edgeTypeFilter}).
                Choke-point edges from the latest scan are marked.
              </caption>
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th scope="col" className="px-3 py-2">Source</th>
                  <th scope="col" className="px-3 py-2">Edge type</th>
                  <th scope="col" className="px-3 py-2">Target</th>
                  <th scope="col" className="px-3 py-2">Strength</th>
                  <th scope="col" className="px-3 py-2">Substitutability</th>
                  <th scope="col" className="px-3 py-2">Evidence class</th>
                  <th scope="col" className="px-3 py-2">Choke point</th>
                </tr>
              </thead>
              <tbody>
                {visibleEdges.map((e) => (
                  <tr key={e.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{nodeName(e.source)}</td>
                    <td className="px-3 py-2">{e.edgeType}</td>
                    <td className="px-3 py-2">{nodeName(e.target)}</td>
                    <td className="px-3 py-2">{e.strength.toFixed(2)}</td>
                    <td className="px-3 py-2">{e.substitutability.toFixed(2)}</td>
                    <td className="px-3 py-2">{e.evidenceClass}</td>
                    <td className="px-3 py-2">{chokeEdgeIds.has(e.id) ? "Yes" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {chokeScan && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-800">Choke-point scan (lowest min-cut pairs)</h3>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {chokeScan
              .slice()
              .sort((a, b) => a.minCutValue - b.minCutValue)
              .slice(0, 5)
              .map((c) => (
                <li key={`${c.source}-${c.sink}`}>
                  {c.sourceName} → {c.sinkName}: min-cut value {c.minCutValue.toFixed(3)} ({c.cutEdgeIds.length}{" "}
                  edge(s) in the cut)
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
