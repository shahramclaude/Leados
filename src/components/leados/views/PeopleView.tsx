"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────
// Types mirroring the API payloads (src/app/api/people, /network, /succession)
// ─────────────────────────────────────────────────────────────────────────

interface FlightRiskScore {
  score: number;
  level: "low" | "moderate" | "elevated" | "high";
  components: { factor: string; value: string; contribution: string; action: string }[];
  label: string;
}

interface PersonProfile {
  id: number;
  name: string;
  role: string;
  team: string;
  level: string;
  flightRisk: FlightRiskScore;
  burnoutIndex: number;
  performanceScore: number;
  performanceTrend: "up" | "flat" | "down";
  performanceHistory: number[];
  engagementScore: number;
  moraleHistory: number[];
  growthVelocity: number;
  keyPersonRisk: boolean;
  promotionReadiness: "ready" | "developing" | "not_ready";
  strengths: string[];
  gaps: string[];
  suggestedActions: string[];
  radar: { dimension: string; value: number }[];
}

interface PersonRow {
  id: number;
  name: string;
  role: string;
  team: string;
  managerId: number | null;
  level: string;
  skills: string[];
  okrScore: number | null;
  archived: boolean;
  createdAt: string;
  profile: PersonProfile;
}

interface PersonDetail {
  person: PersonRow;
  profile: PersonProfile;
  snapshots: { snapshotAt: string; healthScore: number; flightRisk: number; performanceScore: number; burnoutIndex: number; morale: number }[];
  suggestedActions: string[];
  keyPersonRisk: { criticalPathsBroken: number; reason: string } | null;
  successionEntries: { role: string; gap: boolean }[];
  networkStanding: { isInfluencer: boolean; isBroker: boolean; isIsolated: boolean; influenceScore: number | null; brokerScore: number | null };
  oneOnOneHistory: { occurredAt: string; notes: unknown }[];
}

interface HighPotential {
  id: number;
  name: string;
  role: string;
  performanceScore: number;
  potentialScore: number;
  box: string;
  row: 0 | 1 | 2;
  col: 0 | 1 | 2;
}

interface SuccessionMapEntry {
  role: string;
  incumbent: { id: number; name: string } | null;
  readyNow: number[];
  readyIn1Year: number[];
  readyIn2Years: number[];
  gap: boolean;
}

interface KeyPersonRisk {
  personId: number;
  name: string;
  role: string;
  criticalPathsBroken: number;
  reason: string;
}

interface SuccessionResponse {
  successionMap: SuccessionMapEntry[];
  keyPersonRisks: KeyPersonRisk[];
  highPotentials: HighPotential[];
}

interface NetworkNode {
  id: number;
  name: string;
  role: string;
  team: string;
  pageRank: number;
}
interface NetworkEdge {
  a: number;
  b: number;
  weight: number;
  types: string[];
}
interface NetworkResponse {
  report: {
    influencers: { id: number; name: string; role: string; score: number }[];
    brokers: { id: number; name: string; role: string; score: number }[];
    cliques: { members: { id: number; name: string }[]; cohesion: number }[];
    isolated: { id: number; name: string; role: string; connections: number }[];
    healthScore: number;
    nodeCount: number;
    edgeCount: number;
  };
  graph: { nodes: NetworkNode[]; edges: NetworkEdge[] };
}

type Tab = "roster" | "ninebox" | "network" | "succession";

// ───────────────────────────────── helpers ─────────────────────────────────

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function riskColor(score: number): string {
  if (score >= 70) return "bg-red-100 text-red-700 ring-red-600/20";
  if (score >= 45) return "bg-orange-100 text-orange-700 ring-orange-600/20";
  if (score >= 25) return "bg-amber-100 text-amber-700 ring-amber-600/20";
  return "bg-emerald-100 text-emerald-700 ring-emerald-600/20";
}

function burnoutColor(score: number): string {
  if (score >= 70) return "text-red-600";
  if (score >= 45) return "text-orange-600";
  if (score >= 25) return "text-amber-600";
  return "text-emerald-600";
}

function readinessBadge(r: PersonProfile["promotionReadiness"]): string {
  if (r === "ready") return "bg-emerald-100 text-emerald-700 ring-emerald-600/20";
  if (r === "developing") return "bg-sky-100 text-sky-700 ring-sky-600/20";
  return "bg-slate-100 text-slate-600 ring-slate-500/20";
}

function trendGlyph(t: PersonProfile["performanceTrend"]): string {
  if (t === "up") return "▲";
  if (t === "down") return "▼";
  return "▬";
}

function trendColor(t: PersonProfile["performanceTrend"]): string {
  if (t === "up") return "text-emerald-600";
  if (t === "down") return "text-red-600";
  return "text-slate-500";
}

// Small sparkline for the roster table / drawer.
function Sparkline({ values, width = 72, height = 24, stroke = "#0f172a" }: { values: number[]; width?: number; height?: number; stroke?: string }) {
  const pts = values.length ? values : [0];
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = max - min || 1;
  const step = pts.length > 1 ? width / (pts.length - 1) : 0;
  const coords = pts.map((v, i) => `${i * step},${height - ((v - min) / range) * height}`);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <polyline fill="none" stroke={stroke} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" points={coords.join(" ")} />
      {pts.length > 0 && (
        <circle cx={(pts.length - 1) * step} cy={height - ((pts[pts.length - 1] - min) / range) * height} r={2.2} fill={stroke} />
      )}
    </svg>
  );
}

// Semi-circular flight-risk gauge.
function RiskGauge({ score }: { score: number }) {
  const angle = (Math.min(100, Math.max(0, score)) / 100) * 180;
  const rad = (Math.PI * angle) / 180;
  const cx = 60;
  const cy = 60;
  const r = 48;
  const needleX = cx - r * Math.cos(rad);
  const needleY = cy - r * Math.sin(rad);
  const color = score >= 70 ? "#dc2626" : score >= 45 ? "#ea580c" : score >= 25 ? "#d97706" : "#059669";
  return (
    <svg width={120} height={72} viewBox="0 0 120 72">
      <path d="M 12 60 A 48 48 0 0 1 108 60" fill="none" stroke="#e2e8f0" strokeWidth={10} strokeLinecap="round" />
      <path
        d="M 12 60 A 48 48 0 0 1 108 60"
        fill="none"
        stroke={color}
        strokeWidth={10}
        strokeLinecap="round"
        strokeDasharray={`${(angle / 180) * 150.8} 999`}
      />
      <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke="#0f172a" strokeWidth={2} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={3.5} fill="#0f172a" />
      <text x={cx} y={cy + 20} textAnchor="middle" className="fill-slate-900" style={{ fontSize: 16, fontWeight: 700 }}>
        {score}
      </text>
    </svg>
  );
}

// 8-dimension radar chart.
function RadarChart({ dims, size = 220 }: { dims: { dimension: string; value: number }[]; size?: number }) {
  const center = size / 2;
  const radius = size / 2 - 36;
  const n = dims.length;
  const angleFor = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;

  const points = dims.map((d, i) => {
    const a = angleFor(i);
    const v = Math.max(0, Math.min(100, d.value)) / 100;
    return [center + radius * v * Math.cos(a), center + radius * v * Math.sin(a)] as const;
  });

  const rings = [0.25, 0.5, 0.75, 1];

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {rings.map((r) => (
        <polygon
          key={r}
          points={dims
            .map((_, i) => {
              const a = angleFor(i);
              return `${center + radius * r * Math.cos(a)},${center + radius * r * Math.sin(a)}`;
            })
            .join(" ")}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={1}
        />
      ))}
      {dims.map((_, i) => {
        const a = angleFor(i);
        return (
          <line
            key={i}
            x1={center}
            y1={center}
            x2={center + radius * Math.cos(a)}
            y2={center + radius * Math.sin(a)}
            stroke="#e2e8f0"
            strokeWidth={1}
          />
        );
      })}
      <polygon points={points.map((p) => p.join(",")).join(" ")} fill="rgba(79,70,229,0.28)" stroke="#4f46e5" strokeWidth={2} />
      {points.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={2.5} fill="#4f46e5" />
      ))}
      {dims.map((d, i) => {
        const a = angleFor(i);
        const lx = center + (radius + 24) * Math.cos(a);
        const ly = center + (radius + 24) * Math.sin(a);
        return (
          <text
            key={d.dimension}
            x={lx}
            y={ly}
            textAnchor="middle"
            dominantBaseline="middle"
            style={{ fontSize: 9.5, fill: "#475569" }}
          >
            {d.dimension}
          </text>
        );
      })}
    </svg>
  );
}

// ───────────────────────────── Force-directed network graph ─────────────────────────────

interface SimNode {
  id: number;
  name: string;
  role: string;
  pageRank: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

function useForceLayout(nodesIn: NetworkNode[], edgesIn: NetworkEdge[], width: number, height: number) {
  const [tick, setTick] = useState(0);
  const nodesRef = useRef<SimNode[]>([]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!nodesIn.length || !width || !height) {
      nodesRef.current = [];
      setTick((t) => t + 1);
      return;
    }
    nodesRef.current = nodesIn.map((n, i) => {
      const angle = (Math.PI * 2 * i) / nodesIn.length;
      return {
        ...n,
        x: width / 2 + Math.cos(angle) * Math.min(width, height) * 0.3,
        y: height / 2 + Math.sin(angle) * Math.min(width, height) * 0.3,
        vx: 0,
        vy: 0,
      };
    });

    let frame = 0;
    const maxFrames = 320;

    function step() {
      const arr = nodesRef.current;
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const dx = arr[j].x - arr[i].x;
          const dy = arr[j].y - arr[i].y;
          let distSq = dx * dx + dy * dy;
          if (distSq < 1) distSq = 1;
          const dist = Math.sqrt(distSq);
          const force = 2600 / distSq;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          arr[i].vx -= fx;
          arr[i].vy -= fy;
          arr[j].vx += fx;
          arr[j].vy += fy;
        }
      }

      edgesIn.forEach((e) => {
        const a = arr.find((n) => n.id === e.a);
        const b = arr.find((n) => n.id === e.b);
        if (!a || !b) return;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const idealLen = 160 - Math.min(90, e.weight * 70);
        const force = (dist - idealLen) * 0.018 * (0.4 + e.weight);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      });

      arr.forEach((n) => {
        n.vx += (width / 2 - n.x) * 0.0012;
        n.vy += (height / 2 - n.y) * 0.0012;
        n.vx *= 0.82;
        n.vy *= 0.82;
        n.x += n.vx;
        n.y += n.vy;
        n.x = Math.max(28, Math.min(width - 28, n.x));
        n.y = Math.max(28, Math.min(height - 28, n.y));
      });

      frame += 1;
      setTick((t) => t + 1);
      if (frame < maxFrames) {
        rafRef.current = requestAnimationFrame(step);
      }
    }

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodesIn, edgesIn, width, height]);

  return { nodes: nodesRef.current, tick };
}

function NetworkGraph({ data, onSelect }: { data: NetworkResponse | null; onSelect: (id: number) => void }) {
  const width = 760;
  const height = 480;
  const nodesIn = useMemo(() => data?.graph.nodes ?? [], [data]);
  const edgesIn = useMemo(() => data?.graph.edges ?? [], [data]);
  const { nodes } = useForceLayout(nodesIn, edgesIn, width, height);

  const maxRank = Math.max(0.001, ...nodesIn.map((n) => n.pageRank));
  const radiusFor = (pr: number) => 9 + (pr / maxRank) * 18;

  if (!data || !nodesIn.length) {
    return <div className="grid h-80 place-items-center text-sm text-slate-500">Not enough relationship data to render a network yet.</div>;
  }

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="rounded-xl border border-slate-200 bg-slate-50">
      {edgesIn.map((e, i) => {
        const a = nodes.find((n) => n.id === e.a);
        const b = nodes.find((n) => n.id === e.b);
        if (!a || !b) return null;
        return (
          <line
            key={i}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={e.types.includes("conflicts") ? "#f87171" : "#94a3b8"}
            strokeWidth={Math.max(0.75, Math.min(6, e.weight * 5))}
            strokeOpacity={0.6}
          />
        );
      })}
      {nodes.map((n) => (
        <g key={n.id} className="cursor-pointer" onClick={() => onSelect(n.id)}>
          <circle cx={n.x} cy={n.y} r={radiusFor(n.pageRank)} fill="#4f46e5" fillOpacity={0.85} stroke="#312e81" strokeWidth={1} />
          <text x={n.x} y={n.y + 3.5} textAnchor="middle" style={{ fontSize: 9, fill: "white", fontWeight: 600 }}>
            {initials(n.name)}
          </text>
          <text x={n.x} y={n.y + radiusFor(n.pageRank) + 11} textAnchor="middle" style={{ fontSize: 9, fill: "#334155" }}>
            {n.name.split(" ")[0]}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ───────────────────────────────── main view ─────────────────────────────────

const QUICK_ACTIONS: { label: string; type: string }[] = [
  { label: "Log 1:1", type: "oneonone.logged" },
  { label: "Log pulse", type: "pulse.mood.logged" },
  { label: "Positive feedback", type: "feedback.logged" },
];

export default function PeopleView() {
  const [tab, setTab] = useState<Tab>("roster");
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [succession, setSuccession] = useState<SuccessionResponse | null>(null);
  const [network, setNetwork] = useState<NetworkResponse | null>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<PersonDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [team, setTeam] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [openMenu, setOpenMenu] = useState<number | null>(null);

  const loadPeople = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/people", { cache: "no-store" });
    setPeople(await res.json());
    setLoading(false);
  }, []);

  const loadSuccession = useCallback(async () => {
    const res = await fetch("/api/succession", { cache: "no-store" });
    setSuccession(await res.json());
  }, []);

  const loadNetwork = useCallback(async () => {
    const res = await fetch("/api/network", { cache: "no-store" });
    setNetwork(await res.json());
  }, []);

  useEffect(() => {
    loadPeople();
    loadSuccession();
    loadNetwork();
  }, [loadPeople, loadSuccession, loadNetwork]);

  const loadDetail = useCallback(async (id: number) => {
    setDetailLoading(true);
    const res = await fetch(`/api/people/${id}`, { cache: "no-store" });
    if (res.ok) setDetail(await res.json());
    setDetailLoading(false);
  }, []);

  useEffect(() => {
    if (selectedId != null) loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  async function refreshAll() {
    await Promise.all([loadPeople(), loadSuccession(), loadNetwork()]);
    if (selectedId != null) await loadDetail(selectedId);
  }

  async function addPerson(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await fetch("/api/people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, role, team }),
    });
    setName("");
    setRole("");
    setTeam("");
    await refreshAll();
  }

  async function logAction(personId: number, type: string) {
    setBusyId(personId);
    setOpenMenu(null);
    const data: Record<string, unknown> =
      type === "pulse.mood.logged"
        ? { mood: 6 + Math.round(Math.random() * 3), load: 4 + Math.round(Math.random() * 4) }
        : type === "feedback.logged"
          ? { polarity: "positive" }
          : { notes: "Logged via People view" };
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, domain: "people", personId, data }),
    });
    await fetch(`/api/people/${personId}/snapshot`, { method: "POST" });
    setBusyId(null);
    await refreshAll();
  }

  const selected = detail;

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="m-0 text-xs font-semibold uppercase tracking-[0.1em] text-indigo-600">People Intelligence</p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-950">Talent &amp; Org Network</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Predictive flight risk, burnout, promotion readiness, 9-box placement and a live force-directed org network —
            computed on the fly from your event log, no HR analytics team required.
          </p>
        </div>
        <form onSubmit={addPerson} className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            className="w-36 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
          />
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Role"
            className="w-32 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
          />
          <input
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            placeholder="Team"
            className="w-28 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
          />
          <button type="submit" className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500">
            Add person
          </button>
        </form>
      </header>

      <nav className="mb-6 flex gap-1 rounded-xl bg-slate-100 p-1 text-sm font-medium">
        {([
          ["roster", "Roster"],
          ["ninebox", "9-Box Grid"],
          ["network", "Network Graph"],
          ["succession", "Succession"],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-lg px-4 py-2 transition ${tab === key ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "roster" && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500">Loading roster…</div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Flight Risk</th>
                  <th className="px-4 py-3">Burnout</th>
                  <th className="px-4 py-3">Performance</th>
                  <th className="px-4 py-3">Promotion</th>
                  <th className="px-4 py-3">Key Person</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => setSelectedId(p.id)}
                    className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="grid h-8 w-8 place-items-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
                          {initials(p.name)}
                        </span>
                        <div>
                          <div className="font-medium text-slate-900">{p.name}</div>
                          <div className="text-xs text-slate-500">{p.team || "—"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{p.role || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${riskColor(p.profile.flightRisk.score)}`}>
                        {p.profile.flightRisk.score}
                      </span>
                    </td>
                    <td className={`px-4 py-3 font-semibold ${burnoutColor(p.profile.burnoutIndex)}`}>{p.profile.burnoutIndex}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Sparkline values={p.profile.performanceHistory} />
                        <span className={`text-xs font-semibold ${trendColor(p.profile.performanceTrend)}`}>
                          {trendGlyph(p.profile.performanceTrend)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${readinessBadge(p.profile.promotionReadiness)}`}>
                        {p.profile.promotionReadiness.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3">{p.profile.keyPersonRisk ? <span title="Key person risk">🔑</span> : <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="relative">
                        <button
                          disabled={busyId === p.id}
                          onClick={() => setOpenMenu(openMenu === p.id ? null : p.id)}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                        >
                          {busyId === p.id ? "…" : "Log ▾"}
                        </button>
                        {openMenu === p.id && (
                          <div className="absolute right-0 z-10 mt-1 w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                            {QUICK_ACTIONS.map((a) => (
                              <button
                                key={a.type}
                                onClick={() => logAction(p.id, a.type)}
                                className="block w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                              >
                                {a.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {people.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                      No people yet — add one above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </section>
      )}

      {tab === "ninebox" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">9-Box Grid — Performance × Potential</h2>
          <p className="mt-1 text-sm text-slate-600">Potential = growth velocity + engagement. Performance = OKR attainment + delivery + feedback.</p>
          <div className="mt-5 grid grid-cols-3 gap-2" style={{ direction: "ltr" }}>
            {[2, 1, 0].map((row) =>
              [0, 1, 2].map((col) => {
                const cellPeople = (succession?.highPotentials ?? []).filter((h) => h.row === row && h.col === col);
                const label = cellPeople[0]?.box ?? "";
                return (
                  <div key={`${row}-${col}`} className="min-h-[120px] rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label || "—"}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {cellPeople.map((h) => (
                        <button
                          key={h.id}
                          onClick={() => setSelectedId(h.id)}
                          title={`${h.name} — performance ${h.performanceScore}, potential ${h.potentialScore}`}
                          className="grid h-9 w-9 place-items-center rounded-full bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-500"
                        >
                          {initials(h.name)}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="mt-3 flex justify-between text-xs text-slate-500">
            <span>↑ Potential</span>
            <span>Performance →</span>
          </div>
        </section>
      )}

      {tab === "network" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Org Network Graph</h2>
              <p className="mt-1 text-sm text-slate-600">Node size = PageRank influence. Edge thickness = relationship strength. Click a node for their profile.</p>
            </div>
            {network && (
              <div className="flex gap-4 text-xs text-slate-600">
                <span>Nodes: <b>{network.report.nodeCount}</b></span>
                <span>Edges: <b>{network.report.edgeCount}</b></span>
                <span>Network health: <b>{network.report.healthScore}/100</b></span>
              </div>
            )}
          </div>
          <NetworkGraph data={network} onSelect={setSelectedId} />

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Top Influencers</h3>
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                {(network?.report.influencers ?? []).slice(0, 5).map((i) => (
                  <li key={i.id} className="flex justify-between">
                    <button className="hover:underline" onClick={() => setSelectedId(i.id)}>{i.name}</button>
                    <span className="text-slate-400">{i.score}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Information Brokers</h3>
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                {(network?.report.brokers ?? []).slice(0, 5).map((i) => (
                  <li key={i.id} className="flex justify-between">
                    <button className="hover:underline" onClick={() => setSelectedId(i.id)}>{i.name}</button>
                    <span className="text-slate-400">{i.score}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Isolation Risk</h3>
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                {(network?.report.isolated ?? []).slice(0, 5).map((i) => (
                  <li key={i.id} className="flex justify-between">
                    <button className="hover:underline" onClick={() => setSelectedId(i.id)}>{i.name}</button>
                    <span className="text-slate-400">{i.connections} conn.</span>
                  </li>
                ))}
                {(network?.report.isolated.length ?? 0) === 0 && <li className="text-slate-400">None detected</li>}
              </ul>
            </div>
          </div>

          {!!network?.report.cliques.length && (
            <div className="mt-4 rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Tightly-Knit Groups (cliques)</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {network.report.cliques.map((c, i) => (
                  <span key={i} className="rounded-full bg-indigo-50 px-3 py-1 text-xs text-indigo-700">
                    {c.members.map((m) => m.name).join(", ")}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {tab === "succession" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Succession Pipeline</h2>
          <p className="mt-1 text-sm text-slate-600">Key roles derived from reporting lines and single-incumbent coverage.</p>
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Incumbent</th>
                  <th className="px-4 py-3">Ready Now</th>
                  <th className="px-4 py-3">Ready in 1 Year</th>
                  <th className="px-4 py-3">Ready in 2 Years</th>
                  <th className="px-4 py-3">Gap</th>
                </tr>
              </thead>
              <tbody>
                {(succession?.successionMap ?? []).map((s) => (
                  <tr key={s.role} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">{s.role}</td>
                    <td className="px-4 py-3 text-slate-700">{s.incumbent?.name ?? "—"}</td>
                    <td className="px-4 py-3">{namesFor(s.readyNow, people)}</td>
                    <td className="px-4 py-3">{namesFor(s.readyIn1Year, people)}</td>
                    <td className="px-4 py-3">{namesFor(s.readyIn2Years, people)}</td>
                    <td className="px-4 py-3">
                      {s.gap ? (
                        <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">No successor</span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">Covered</span>
                      )}
                    </td>
                  </tr>
                ))}
                {(succession?.successionMap.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                      No key roles identified yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {!!succession?.keyPersonRisks.length && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-slate-900">Key-Person Concentration Risk</h3>
              <ul className="mt-2 space-y-2">
                {succession.keyPersonRisks.map((k) => (
                  <li key={k.personId} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <button className="font-semibold hover:underline" onClick={() => setSelectedId(k.personId)}>
                      {k.name}
                    </button>{" "}
                    — {k.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* ───────────────── Person drawer ───────────────── */}
      {selectedId != null && (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/30" onClick={() => setSelectedId(null)}>
          <aside
            className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {detailLoading || !selected ? (
              <div className="grid h-full place-items-center text-sm text-slate-500">Loading profile…</div>
            ) : (
              <>
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-950">{selected.profile.name}</h2>
                    <p className="text-sm text-slate-600">{selected.profile.role} · {selected.profile.team}</p>
                  </div>
                  <button onClick={() => setSelectedId(null)} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100">✕</button>
                </div>

                <div className="flex items-center gap-4">
                  <RiskGauge score={selected.profile.flightRisk.score} />
                  <div className="text-sm">
                    <p className="font-semibold text-slate-900">Flight Risk: {selected.profile.flightRisk.level}</p>
                    <p className="text-slate-600">{selected.profile.flightRisk.label}</p>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs uppercase text-slate-500">Burnout Index</p>
                    <p className={`text-xl font-semibold ${burnoutColor(selected.profile.burnoutIndex)}`}>{selected.profile.burnoutIndex}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs uppercase text-slate-500">Engagement</p>
                    <p className="text-xl font-semibold text-slate-900">{selected.profile.engagementScore}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs uppercase text-slate-500">Growth Velocity</p>
                    <p className="text-xl font-semibold text-slate-900">{selected.profile.growthVelocity}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs uppercase text-slate-500">Promotion Readiness</p>
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${readinessBadge(selected.profile.promotionReadiness)}`}>
                      {selected.profile.promotionReadiness.replace("_", " ")}
                    </span>
                  </div>
                </div>

                <div className="mt-6 flex justify-center">
                  <RadarChart dims={selected.profile.radar} />
                </div>

                <div className="mt-6">
                  <p className="text-xs uppercase text-slate-500">Morale trend (recent snapshots)</p>
                  <div className="mt-2 rounded-xl bg-slate-50 p-3">
                    <Sparkline values={selected.profile.moraleHistory.length ? selected.profile.moraleHistory : [60]} width={200} height={40} stroke="#4f46e5" />
                  </div>
                </div>

                {selected.networkStanding && (selected.networkStanding.isInfluencer || selected.networkStanding.isBroker || selected.networkStanding.isIsolated) && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {selected.networkStanding.isInfluencer && <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-700">Top influencer</span>}
                    {selected.networkStanding.isBroker && <span className="rounded-full bg-purple-100 px-2.5 py-1 text-xs font-semibold text-purple-700">Information broker</span>}
                    {selected.networkStanding.isIsolated && <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">Isolation risk</span>}
                  </div>
                )}

                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-slate-900">Suggested actions</h3>
                  <ul className="mt-2 space-y-1.5">
                    {selected.suggestedActions.map((a, i) => (
                      <li key={i} className="rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-900">{a}</li>
                    ))}
                  </ul>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Strengths</h3>
                    <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm text-slate-700">
                      {selected.profile.strengths.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Gaps</h3>
                    <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm text-slate-700">
                      {selected.profile.gaps.map((g, i) => <li key={i}>{g}</li>)}
                    </ul>
                  </div>
                </div>

                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-slate-900">1:1 history</h3>
                  {selected.oneOnOneHistory.length ? (
                    <ul className="mt-2 space-y-1 text-sm text-slate-600">
                      {selected.oneOnOneHistory.slice(0, 5).map((o, i) => (
                        <li key={i}>{new Date(o.occurredAt).toLocaleDateString()} — {typeof o.notes === "string" && o.notes ? o.notes : "logged"}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">No 1:1s logged yet.</p>
                  )}
                </div>

                <div className="mt-6 flex flex-wrap gap-2">
                  {QUICK_ACTIONS.map((a) => (
                    <button
                      key={a.type}
                      onClick={() => logAction(selected.profile.id, a.type)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function namesFor(ids: number[], people: PersonRow[]): React.ReactNode {
  if (!ids.length) return <span className="text-slate-400">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {ids.map((id) => {
        const p = people.find((pp) => pp.id === id);
        return (
          <span key={id} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
            {p?.name ?? `#${id}`}
          </span>
        );
      })}
    </div>
  );
}
