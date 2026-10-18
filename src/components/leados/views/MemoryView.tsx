"use client";

import { useEffect, useMemo, useState, useCallback } from "react";

// ---------------------------------------------------------------------------
// Local types mirroring the JSON shapes returned by /api/memory, /api/insights
// and /api/playbooks (dates arrive as ISO strings once serialized).
// ---------------------------------------------------------------------------

type NodeType = "person" | "decision" | "metric" | "event" | "finding" | "playbook" | "insight" | "domain";
type RelationType = "caused" | "informed" | "resolved" | "escalated" | "blocked" | "created" | "modified" | "triggered";

interface MemoryNode {
  id: number;
  type: NodeType;
  entityId: string;
  label: string;
  summary: string;
  embeddingStub: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface MemoryEdge {
  id: number;
  fromNodeId: number;
  toNodeId: number;
  relation: RelationType;
  weight: number;
  evidence: string;
  createdAt: string;
}

interface InsightRow {
  id: number;
  type: "pattern" | "anomaly" | "prediction" | "lesson";
  title: string;
  body: string;
  sourceNodes: number[];
  confidence: number;
  status: "new" | "reviewed" | "archived";
  createdAt: string;
}

interface WeeklyBriefing {
  date: string;
  executiveSummary: string;
  topPriorities: string[];
  keyRisks: string[];
  decisionsNeeded: string[];
  teamPulse: string;
  forwardLook: string;
}

interface FindingExplanation {
  rootCauses: string[];
  contributingFactors: string[];
  timeline: string[];
  relatedPeople: string[];
  relatedDecisions: string[];
}

interface RelatedEntity {
  node: MemoryNode;
  combinedWeight: number;
  hops: number;
  relations: RelationType[];
}

interface SearchResult {
  node: MemoryNode;
  score: number;
}

interface PlaybookRow {
  id: number;
  name: string;
  domain: string;
  triggerRule: string;
  steps: string[];
  successRate: number;
}

interface PlaybookMatch {
  findingId: number;
  findingTitle: string;
  playbookId: number;
  playbookName: string;
  score: number;
  reasons: string[];
}

interface PlaybookStats {
  playbookId: number;
  playbookName: string;
  runs: number;
  avgCompletionRate: number;
  avgOutcomeScore: number;
  avgTimeToCompleteMs: number | null;
  frequencyTriggered: number;
  underperforming: boolean;
}

const NODE_COLORS: Record<NodeType, string> = {
  person: "#6366f1",
  decision: "#3b82f6",
  metric: "#22c55e",
  finding: "#ef4444",
  insight: "#a855f7",
  event: "#64748b",
  playbook: "#f59e0b",
  domain: "#94a3b8",
};

const NODE_TYPE_LABEL: Record<NodeType, string> = {
  person: "Person",
  decision: "Decision",
  metric: "Metric",
  finding: "Finding",
  insight: "Insight",
  event: "Event",
  playbook: "Playbook",
  domain: "Domain",
};

type Tab = "graph" | "insights" | "briefing" | "playbooks";

// ---------------------------------------------------------------------------
// Force-directed layout — a small self-contained physics simulation so we
// don't need an extra charting dependency.
// ---------------------------------------------------------------------------

function computeForceLayout(nodes: MemoryNode[], edges: MemoryEdge[], width: number, height: number, iterations = 240) {
  const cx = width / 2;
  const cy = height / 2;
  const state = new Map<number, { x: number; y: number; vx: number; vy: number }>();

  nodes.forEach((n, i) => {
    const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2;
    const r = Math.min(width, height) / 3;
    state.set(n.id, { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), vx: 0, vy: 0 });
  });

  const idealLength = 120;
  const repulsion = 2800;

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      const a = state.get(nodes[i].id)!;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = state.get(nodes[j].id)!;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distSq = Math.max(dx * dx + dy * dy, 0.01);
        const dist = Math.sqrt(distSq);
        const force = repulsion / distSq;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
    }
    for (const e of edges) {
      const a = state.get(e.fromNodeId);
      const b = state.get(e.toNodeId);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 0.01);
      const force = (dist - idealLength) * 0.02;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }
    for (const n of nodes) {
      const p = state.get(n.id)!;
      p.vx += (cx - p.x) * 0.006;
      p.vy += (cy - p.y) * 0.006;
      p.vx *= 0.82;
      p.vy *= 0.82;
      p.x += p.vx;
      p.y += p.vy;
      p.x = Math.max(36, Math.min(width - 36, p.x));
      p.y = Math.max(36, Math.min(height - 36, p.y));
    }
  }

  const result = new Map<number, { x: number; y: number }>();
  for (const n of nodes) {
    const p = state.get(n.id)!;
    result.set(n.id, { x: p.x, y: p.y });
  }
  return result;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

function confidenceBadgeColor(confidence: number): string {
  if (confidence >= 0.75) return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (confidence >= 0.55) return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

const ICONS = {
  priorities: "🎯",
  risks: "⚠️",
  decisions: "🧭",
  pulse: "🫂",
  forward: "🔭",
};

export default function MemoryView() {
  const [tab, setTab] = useState<Tab>("graph");

  const [nodes, setNodes] = useState<MemoryNode[]>([]);
  const [edges, setEdges] = useState<MemoryEdge[]>([]);
  const [loadingGraph, setLoadingGraph] = useState(true);
  const [graphError, setGraphError] = useState<string | null>(null);

  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [related, setRelated] = useState<RelatedEntity[] | null>(null);
  const [explanation, setExplanation] = useState<FindingExplanation | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  const [insights, setInsights] = useState<InsightRow[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightStatusFilter, setInsightStatusFilter] = useState<"all" | InsightRow["status"]>("all");

  const [briefing, setBriefing] = useState<WeeklyBriefing | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);

  const [playbooks, setPlaybooks] = useState<PlaybookRow[]>([]);
  const [playbookMatches, setPlaybookMatches] = useState<PlaybookMatch[]>([]);
  const [playbookStats, setPlaybookStats] = useState<PlaybookStats[]>([]);
  const [playbooksLoading, setPlaybooksLoading] = useState(false);

  const loadGraph = useCallback(async () => {
    setLoadingGraph(true);
    setGraphError(null);
    try {
      const res = await fetch("/api/memory");
      if (!res.ok) throw new Error("request failed");
      const data = await res.json();
      setNodes(data.nodes ?? []);
      setEdges(data.edges ?? []);
    } catch {
      setGraphError("Could not load the knowledge graph. Try refreshing.");
    } finally {
      setLoadingGraph(false);
    }
  }, []);

  const loadInsights = useCallback(async (status: "all" | InsightRow["status"]) => {
    setInsightsLoading(true);
    try {
      const res = await fetch(status === "all" ? "/api/insights" : `/api/insights?status=${status}`);
      const data = await res.json();
      setInsights(data.insights ?? []);
    } finally {
      setInsightsLoading(false);
    }
  }, []);

  const loadBriefing = useCallback(async () => {
    setBriefingLoading(true);
    try {
      const res = await fetch("/api/insights?weekly=1");
      const data = await res.json();
      setBriefing(data);
    } finally {
      setBriefingLoading(false);
    }
  }, []);

  const loadPlaybooks = useCallback(async () => {
    setPlaybooksLoading(true);
    try {
      const res = await fetch("/api/playbooks");
      const data = await res.json();
      setPlaybooks(data.playbooks ?? []);
      setPlaybookMatches(data.matches ?? []);
      setPlaybookStats(data.stats ?? []);
    } finally {
      setPlaybooksLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGraph();
    loadInsights("all");
  }, [loadGraph, loadInsights]);

  useEffect(() => {
    if (tab === "briefing" && !briefing) loadBriefing();
    if (tab === "playbooks" && playbooks.length === 0) loadPlaybooks();
  }, [tab, briefing, loadBriefing, playbooks.length, loadPlaybooks]);

  useEffect(() => {
    loadInsights(insightStatusFilter);
  }, [insightStatusFilter, loadInsights]);

  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const degreeMap = useMemo(() => {
    const m = new Map<number, number>();
    for (const e of edges) {
      m.set(e.fromNodeId, (m.get(e.fromNodeId) ?? 0) + 1);
      m.set(e.toNodeId, (m.get(e.toNodeId) ?? 0) + 1);
    }
    return m;
  }, [edges]);

  const WIDTH = 900;
  const HEIGHT = 560;
  const positions = useMemo(() => computeForceLayout(nodes, edges, WIDTH, HEIGHT), [nodes, edges]);

  const selectedNode = selectedNodeId != null ? nodeMap.get(selectedNodeId) ?? null : null;

  const selectNode = useCallback(async (id: number, options?: { explain?: boolean }) => {
    setSelectedNodeId(id);
    setRelated(null);
    setExplanation(null);
    setTab("graph");
    const node = nodeMap.get(id);
    if (!node) return;
    setDetailLoading(true);
    try {
      if (options?.explain && node.type === "finding") {
        const res = await fetch(`/api/insights?explain=${encodeURIComponent(node.entityId)}`);
        if (res.ok) setExplanation(await res.json());
      } else {
        const res = await fetch(`/api/memory?related=${encodeURIComponent(node.entityId)}&type=${node.type}`);
        if (res.ok) {
          const data = await res.json();
          setRelated(data.related ?? []);
        }
      }
    } finally {
      setDetailLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeMap]);

  const runSearch = useCallback(async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/memory?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setSearchResults(data.results ?? []);
    } finally {
      setSearching(false);
    }
  }, []);

  const updateInsightStatus = useCallback(async (id: number, status: InsightRow["status"]) => {
    setInsights((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    await fetch("/api/insights", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
  }, []);

  const regenerateInsights = useCallback(async () => {
    await fetch("/api/insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "regenerate" }),
    });
    await loadInsights(insightStatusFilter);
  }, [insightStatusFilter, loadInsights]);

  const timelineNodes = useMemo(
    () =>
      nodes
        .filter((n) => n.type !== "domain")
        .slice()
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [nodes],
  );

  const connectionsForSelected = useMemo(() => {
    if (!selectedNode) return [];
    return edges
      .filter((e) => e.fromNodeId === selectedNode.id || e.toNodeId === selectedNode.id)
      .map((e) => {
        const outgoing = e.fromNodeId === selectedNode.id;
        const otherId = outgoing ? e.toNodeId : e.fromNodeId;
        const other = nodeMap.get(otherId);
        return { edge: e, outgoing, other };
      })
      .filter((c) => c.other);
  }, [edges, selectedNode, nodeMap]);

  return (
    <div className="flex h-full flex-col gap-4">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Institutional Memory &amp; Knowledge Graph</h1>
          <p className="mt-1 text-sm text-slate-500">
            Every person, decision, metric, finding, event and playbook — connected, so the org can answer &ldquo;why did we do
            this?&rdquo; from its own data.
          </p>
        </div>
        <div className="relative w-full sm:w-80">
          <input
            value={searchQuery}
            onChange={(e) => runSearch(e.target.value)}
            placeholder="Search memory… (e.g. burn rate, Carol, playbook)"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
          {searchQuery && (
            <div className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
              {searching && <div className="p-3 text-xs text-slate-400">Searching…</div>}
              {!searching && searchResults && searchResults.length === 0 && (
                <div className="p-3 text-xs text-slate-400">No matches.</div>
              )}
              {!searching &&
                searchResults?.map((r) => (
                  <button
                    key={r.node.id}
                    onClick={() => {
                      selectNode(r.node.id);
                      setSearchQuery("");
                      setSearchResults(null);
                    }}
                    className="flex w-full items-center gap-2 border-b border-slate-100 px-3 py-2 text-left text-sm last:border-none hover:bg-slate-50"
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: NODE_COLORS[r.node.type] }} />
                    <span className="flex-1 truncate">{r.node.label}</span>
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-400">{r.node.type}</span>
                  </button>
                ))}
            </div>
          )}
        </div>
      </header>

      <nav className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm font-medium">
        {([
          ["graph", "Knowledge Graph"],
          ["insights", "Insights Feed"],
          ["briefing", "Weekly Briefing"],
          ["playbooks", "Playbooks"],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 rounded-md px-3 py-2 transition ${
              tab === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "graph" && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
            <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
              {loadingGraph && <div className="flex h-[560px] items-center justify-center text-sm text-slate-400">Loading graph…</div>}
              {graphError && <div className="flex h-[560px] items-center justify-center text-sm text-red-500">{graphError}</div>}
              {!loadingGraph && !graphError && (
                <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-[560px] w-full">
                  <defs>
                    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                      <path d="M0,0 L10,5 L0,10 z" fill="#cbd5e1" />
                    </marker>
                  </defs>
                  {edges.map((e) => {
                    const a = positions.get(e.fromNodeId);
                    const b = positions.get(e.toNodeId);
                    if (!a || !b) return null;
                    const dimmed = selectedNode && e.fromNodeId !== selectedNode.id && e.toNodeId !== selectedNode.id;
                    return (
                      <line
                        key={e.id}
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        stroke={dimmed ? "#e2e8f0" : "#94a3b8"}
                        strokeWidth={Math.min(3, 0.6 + e.weight * 0.5)}
                        markerEnd="url(#arrow)"
                        opacity={dimmed ? 0.35 : 0.8}
                      />
                    );
                  })}
                  {nodes.map((n) => {
                    const p = positions.get(n.id);
                    if (!p) return null;
                    const degree = degreeMap.get(n.id) ?? 0;
                    const r = Math.max(9, Math.min(22, 8 + degree * 2));
                    const isSelected = selectedNode?.id === n.id;
                    return (
                      <g
                        key={n.id}
                        transform={`translate(${p.x}, ${p.y})`}
                        className="cursor-pointer"
                        onClick={() => selectNode(n.id)}
                      >
                        <circle
                          r={r}
                          fill={NODE_COLORS[n.type]}
                          stroke={isSelected ? "#0f172a" : "white"}
                          strokeWidth={isSelected ? 3 : 1.5}
                          opacity={selectedNode && !isSelected ? 0.55 : 1}
                        >
                          <title>{`${n.label} (${NODE_TYPE_LABEL[n.type]})`}</title>
                        </circle>
                        <text
                          y={r + 13}
                          textAnchor="middle"
                          fontSize={10}
                          fill="#334155"
                          className="pointer-events-none select-none"
                        >
                          {n.label.length > 18 ? `${n.label.slice(0, 17)}…` : n.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              )}
              <div className="flex flex-wrap gap-3 border-t border-slate-100 px-2 pb-1 pt-2 text-xs text-slate-500">
                {(Object.keys(NODE_COLORS) as NodeType[]).map((t) => (
                  <span key={t} className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full" style={{ background: NODE_COLORS[t] }} />
                    {NODE_TYPE_LABEL[t]}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              {!selectedNode && (
                <p className="text-sm text-slate-400">Click any node in the graph, a timeline event, or a search result to inspect it here.</p>
              )}
              {selectedNode && (
                <div className="flex flex-col gap-3">
                  <div>
                    <span
                      className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
                      style={{ background: NODE_COLORS[selectedNode.type] }}
                    >
                      {NODE_TYPE_LABEL[selectedNode.type]}
                    </span>
                    <h3 className="mt-2 text-lg font-semibold text-slate-900">{selectedNode.label}</h3>
                    <p className="mt-1 text-sm text-slate-600">{selectedNode.summary}</p>
                    <p className="mt-1 text-xs text-slate-400">Logged {timeAgo(selectedNode.createdAt)}</p>
                  </div>

                  {selectedNode.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {selectedNode.tags.map((t) => (
                        <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}

                  {selectedNode.type === "finding" && (
                    <button
                      onClick={() => selectNode(selectedNode.id, { explain: true })}
                      className="self-start rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                    >
                      Explain this
                    </button>
                  )}

                  {detailLoading && <p className="text-xs text-slate-400">Loading…</p>}

                  {explanation && (
                    <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                      <ExplanationSection title="Root causes" items={explanation.rootCauses} />
                      <ExplanationSection title="Contributing factors" items={explanation.contributingFactors} />
                      <ExplanationSection title="Related people" items={explanation.relatedPeople} />
                      <ExplanationSection title="Related decisions" items={explanation.relatedDecisions} />
                      <ExplanationSection title="Timeline" items={explanation.timeline} />
                    </div>
                  )}

                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Connections ({connectionsForSelected.length})
                    </h4>
                    <ul className="mt-2 space-y-1.5">
                      {connectionsForSelected.map(({ edge, outgoing, other }) => (
                        <li key={edge.id}>
                          <button
                            onClick={() => other && selectNode(other.id)}
                            className="flex w-full items-start gap-1.5 rounded-md px-1.5 py-1 text-left text-xs hover:bg-slate-50"
                          >
                            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: other ? NODE_COLORS[other.type] : "#ccc" }} />
                            <span>
                              {outgoing ? (
                                <>
                                  <span className="font-medium text-slate-700">{edge.relation}</span>{" "}
                                  <span className="text-slate-500">→ {other?.label}</span>
                                </>
                              ) : (
                                <>
                                  <span className="text-slate-500">{other?.label} →</span>{" "}
                                  <span className="font-medium text-slate-700">{edge.relation}</span>
                                </>
                              )}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {related && related.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Related entities (2-hop)</h4>
                      <ul className="mt-2 space-y-1.5">
                        {related.slice(0, 8).map((r) => (
                          <li key={r.node.id}>
                            <button
                              onClick={() => selectNode(r.node.id)}
                              className="flex w-full items-center justify-between rounded-md px-1.5 py-1 text-left text-xs hover:bg-slate-50"
                            >
                              <span className="flex items-center gap-1.5">
                                <span className="h-1.5 w-1.5 rounded-full" style={{ background: NODE_COLORS[r.node.type] }} />
                                {r.node.label}
                              </span>
                              <span className="text-[10px] text-slate-400">w={r.combinedWeight.toFixed(2)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700">Timeline</h3>
            <p className="mb-3 text-xs text-slate-400">Scroll to browse every significant org event. Click one to highlight it above.</p>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {timelineNodes.map((n) => {
                const domainTag = n.tags.find((t) => ["People", "Finance", "Product", "Sales", "Operations"].includes(t));
                return (
                  <button
                    key={n.id}
                    onClick={() => selectNode(n.id)}
                    className={`flex w-48 shrink-0 flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left text-xs transition ${
                      selectedNode?.id === n.id ? "border-indigo-400 bg-indigo-50" : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-400">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: NODE_COLORS[n.type] }} />
                      {domainTag ?? NODE_TYPE_LABEL[n.type]}
                    </span>
                    <span className="line-clamp-2 font-medium text-slate-700">{n.label}</span>
                    <span className="text-[10px] text-slate-400">{timeAgo(n.createdAt)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {tab === "insights" && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1">
              {(["all", "new", "reviewed", "archived"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setInsightStatusFilter(s)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${
                    insightStatusFilter === s ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-500"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <button onClick={regenerateInsights} className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">
              Re-scan for patterns
            </button>
          </div>

          {insightsLoading && <p className="text-sm text-slate-400">Loading insights…</p>}
          {!insightsLoading && insights.length === 0 && <p className="text-sm text-slate-400">No insights yet.</p>}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {insights.map((insight) => (
              <div key={insight.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-sm font-semibold text-slate-900">{insight.title}</h4>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${confidenceBadgeColor(insight.confidence)}`}>
                    {Math.round(insight.confidence * 100)}%
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-slate-600">{insight.body}</p>
                <div className="flex flex-wrap gap-1">
                  {insight.sourceNodes.map((id) => {
                    const n = nodeMap.get(id);
                    if (!n) return null;
                    return (
                      <button
                        key={id}
                        onClick={() => selectNode(id)}
                        className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 hover:bg-slate-200"
                      >
                        {n.label}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">{insight.type}</span>
                  <div className="flex gap-1">
                    {(["new", "reviewed", "archived"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => updateInsightStatus(insight.id, s)}
                        className={`rounded-full border px-2 py-0.5 text-[10px] capitalize ${
                          insight.status === s ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-500"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "briefing" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {briefingLoading && <p className="text-sm text-slate-400">Generating this week&rsquo;s briefing…</p>}
          {!briefingLoading && briefing && (
            <div className="space-y-6">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Weekly Briefing — {briefing.date}</p>
                <h2 className="mt-1 text-2xl font-bold leading-snug text-slate-900">{briefing.executiveSummary}</h2>
              </div>

              <BriefingSection icon={ICONS.priorities} title="Top Priorities">
                <ol className="list-decimal space-y-1 pl-4 text-sm text-slate-700">
                  {briefing.topPriorities.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ol>
              </BriefingSection>

              <BriefingSection icon={ICONS.risks} title="Key Risks">
                <ul className="list-disc space-y-1 pl-4 text-sm text-slate-700">
                  {briefing.keyRisks.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </BriefingSection>

              <BriefingSection icon={ICONS.decisions} title="Decisions Needed">
                <ul className="list-disc space-y-1 pl-4 text-sm text-slate-700">
                  {briefing.decisionsNeeded.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </BriefingSection>

              <BriefingSection icon={ICONS.pulse} title="Team Pulse">
                <p className="text-sm text-slate-700">{briefing.teamPulse}</p>
              </BriefingSection>

              <BriefingSection icon={ICONS.forward} title="Forward Look">
                <p className="text-sm text-slate-700">{briefing.forwardLook}</p>
              </BriefingSection>
            </div>
          )}
        </div>
      )}

      {tab === "playbooks" && (
        <div className="flex flex-col gap-4">
          {playbooksLoading && <p className="text-sm text-slate-400">Loading playbooks…</p>}

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700">Recommended playbook matches</h3>
            <p className="mb-3 text-xs text-slate-400">Active findings above severity 3, matched to the best-fit playbook.</p>
            {playbookMatches.length === 0 && <p className="text-xs text-slate-400">No high-severity findings currently need a playbook.</p>}
            <div className="space-y-2">
              {playbookMatches.map((m) => (
                <div key={`${m.findingId}-${m.playbookId}`} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium text-slate-800">{m.findingTitle}</p>
                    <p className="text-xs text-slate-500">
                      → {m.playbookName} <span className="text-slate-400">({m.reasons.join(", ")})</span>
                    </p>
                  </div>
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">{Math.round(m.score * 100)}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700">Playbook effectiveness</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead>
                  <tr className="text-slate-400">
                    <th className="pb-2 pr-4 font-medium">Playbook</th>
                    <th className="pb-2 pr-4 font-medium">Runs</th>
                    <th className="pb-2 pr-4 font-medium">Avg completion</th>
                    <th className="pb-2 pr-4 font-medium">Avg outcome</th>
                    <th className="pb-2 pr-4 font-medium">Avg time to complete</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {playbookStats.map((s) => (
                    <tr key={s.playbookId} className="border-t border-slate-100">
                      <td className="py-2 pr-4 font-medium text-slate-700">{s.playbookName}</td>
                      <td className="py-2 pr-4 text-slate-600">{s.frequencyTriggered}</td>
                      <td className="py-2 pr-4 text-slate-600">{Math.round(s.avgCompletionRate * 100)}%</td>
                      <td className="py-2 pr-4 text-slate-600">{Math.round(s.avgOutcomeScore * 100)}%</td>
                      <td className="py-2 pr-4 text-slate-600">
                        {s.avgTimeToCompleteMs != null ? `${Math.round(s.avgTimeToCompleteMs / 86_400_000)}d` : "—"}
                      </td>
                      <td className="py-2">
                        {s.underperforming ? (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-600">Underperforming</span>
                        ) : (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">Healthy</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700">All playbooks</h3>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              {playbooks.map((pb) => (
                <div key={pb.id} className="rounded-lg border border-slate-100 p-3 text-xs">
                  <p className="font-semibold text-slate-800">{pb.name}</p>
                  <p className="mt-0.5 text-slate-400">
                    {pb.domain} · trigger: {pb.triggerRule} · success rate {Math.round(pb.successRate * 100)}%
                  </p>
                  <ol className="mt-2 list-decimal space-y-0.5 pl-4 text-slate-600">
                    {pb.steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ExplanationSection({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="font-semibold text-slate-500">{title}</p>
      <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function BriefingSection({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        <span>{icon}</span>
        {title}
      </h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}
