"use client";

// src/views/PeopleIntelligenceView.tsx
//
// Part 3 deliverable — the People Intelligence command center at /people.
// Renders src/app/api/people/intelligence's PeopleIntelligenceReport:
// KPI strip, 9-box SVG matrix, sortable people grid, team chemistry
// panels, and a right-side person detail slide-in.

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  NineBoxPlacement,
  PeopleIntelligenceReport,
  PersonId,
  PersonProfile,
  SuccessionRisk,
  TeamChemistryReport,
} from "@/lib/types";

type SortKey = "flightRisk" | "burnoutRisk" | "name" | "performanceScoreResolved" | "lastOneOnOneDate";

const RETENTION_LABELS: Record<string, { label: string; className: string }> = {
  critical: { label: "Critical", className: "bg-red-500/20 text-red-300 border border-red-500/40" },
  high: { label: "High", className: "bg-orange-500/20 text-orange-300 border border-orange-500/40" },
  medium: { label: "Medium", className: "bg-amber-500/20 text-amber-300 border border-amber-500/40" },
  low: { label: "Low", className: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40" },
};

function retentionTier(flightRisk: number): keyof typeof RETENTION_LABELS {
  if (flightRisk >= 0.75) return "critical";
  if (flightRisk >= 0.5) return "high";
  if (flightRisk >= 0.25) return "medium";
  return "low";
}

function gaugeColor(value0to100: number): string {
  if (value0to100 >= 66) return "#ef4444"; // red = high risk / or high positive depending on context
  if (value0to100 >= 33) return "#f59e0b";
  return "#10b981";
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatPct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function Gauge({
  label,
  value,
  invert = false,
}: {
  label: string;
  value: number; // 0-100
  invert?: boolean; // true: higher value is BAD (risk gauges)
}) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, value));
  const offset = circumference - (pct / 100) * circumference;
  const colorValue = invert ? pct : 100 - pct;
  const color = gaugeColor(colorValue);

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="84" height="84" viewBox="0 0 84 84" className="-rotate-90">
        <circle cx="42" cy="42" r={radius} stroke="#1e293b" strokeWidth="8" fill="none" />
        <circle
          cx="42"
          cy="42"
          r={radius}
          stroke={color}
          strokeWidth="8"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="-mt-14 text-lg font-semibold text-slate-100">{Math.round(pct)}</div>
      <div className="mt-8 text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}

function RiskBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 66 ? "bg-red-500" : pct >= 33 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-800">
      <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function QualityRing({ signals }: { signals: PersonProfile["conversationSignals"] }) {
  const avg = signals.length > 0 ? signals.reduce((s, x) => s + x.notesQualityScore, 0) / signals.length : 0;
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (avg / 100) * circumference;
  const color = avg >= 66 ? "#10b981" : avg >= 33 ? "#f59e0b" : "#64748b";
  return (
    <div title={`Avg 1:1 quality: ${Math.round(avg)}/100`} className="inline-block">
    <svg width="36" height="36" viewBox="0 0 36 36" className="-rotate-90">
      <circle cx="18" cy="18" r={radius} stroke="#1e293b" strokeWidth="4" fill="none" />
      <circle
        cx="18"
        cy="18"
        r={radius}
        stroke={color}
        strokeWidth="4"
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sublabel,
  onClick,
  tone = "default",
}: {
  label: string;
  value: string | number;
  sublabel?: string;
  onClick?: () => void;
  tone?: "default" | "danger" | "warning" | "good";
}) {
  const toneClass =
    tone === "danger"
      ? "text-red-300"
      : tone === "warning"
        ? "text-amber-300"
        : tone === "good"
          ? "text-emerald-300"
          : "text-slate-100";
  return (
    <button
      onClick={onClick}
      className="flex-1 min-w-[180px] rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-left transition hover:border-slate-600 hover:bg-slate-900"
    >
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-2 text-3xl font-bold ${toneClass}`}>{value}</div>
      {sublabel && <div className="mt-1 text-xs text-slate-500">{sublabel}</div>}
    </button>
  );
}

const CELL_COLORS: Record<string, string> = {
  "low-low": "rgba(220,38,38,0.35)",
  "mid-low": "rgba(220,38,38,0.18)",
  "high-low": "rgba(100,116,139,0.25)",
  "low-mid": "rgba(100,116,139,0.25)",
  "mid-mid": "rgba(245,158,11,0.22)",
  "high-mid": "rgba(245,158,11,0.3)",
  "low-high": "rgba(100,116,139,0.25)",
  "mid-high": "rgba(16,185,129,0.22)",
  "high-high": "rgba(16,185,129,0.4)",
};

function NineBoxGrid({
  placements,
  profileById,
  onSelect,
}: {
  placements: NineBoxPlacement[];
  profileById: Map<PersonId, PersonProfile>;
  onSelect: (id: PersonId) => void;
}) {
  const perfBands: Array<"low" | "mid" | "high"> = ["low", "mid", "high"];
  const potBandsTopDown: Array<"low" | "mid" | "high"> = ["high", "mid", "low"];
  const cell = 160;
  const pad = 56;
  const size = cell * 3;

  const grouped = new Map<string, NineBoxPlacement[]>();
  for (const p of placements) {
    grouped.set(p.box, [...(grouped.get(p.box) ?? []), p]);
  }

  return (
    <svg
      viewBox={`0 0 ${size + pad + 20} ${size + pad}`}
      width="100%"
      style={{ maxWidth: 640 }}
      className="mx-auto"
    >
      {potBandsTopDown.map((potBand, rowIdx) =>
        perfBands.map((perfBand, colIdx) => {
          const key = `${perfBand}-${potBand}`;
          const items = grouped.get(key) ?? [];
          const x = pad + colIdx * cell;
          const y = rowIdx * cell;
          const dotR = 15;
          const perRow = 4;
          return (
            <g key={key}>
              <rect
                x={x}
                y={y}
                width={cell - 2}
                height={cell - 2}
                fill={CELL_COLORS[key] ?? "rgba(100,116,139,0.2)"}
                stroke="#1e293b"
                strokeWidth={1}
              />
              <text x={x + 8} y={y + 18} fill="#94a3b8" fontSize="11" fontFamily="ui-monospace">
                {items.length}
              </text>
              {items.map((item, i) => {
                const row = Math.floor(i / perRow);
                const col = i % perRow;
                const cx = x + 28 + col * 34;
                const cy = y + 40 + row * 34;
                const profile = profileById.get(item.personId);
                const highFlightRisk = (profile?.flightRisk ?? 0) >= 0.5;
                return (
                  <g
                    key={item.personId}
                    onClick={() => onSelect(item.personId)}
                    style={{ cursor: "pointer" }}
                  >
                    <title>{`${item.name} — ${item.quadrantLabel}`}</title>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={dotR}
                      fill="#0f172a"
                      stroke={highFlightRisk ? "#ef4444" : "#475569"}
                      strokeWidth={highFlightRisk ? 3 : 1.5}
                    />
                    <text
                      x={cx}
                      y={cy + 4}
                      fill="#e2e8f0"
                      fontSize="10"
                      textAnchor="middle"
                      fontFamily="ui-monospace"
                    >
                      {initials(item.name)}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })
      )}

      {/* axis labels */}
      {["Low", "Med", "High"].map((label, i) => (
        <text
          key={`perf-${label}`}
          x={pad + i * cell + cell / 2}
          y={size + 20}
          fill="#cbd5e1"
          fontSize="12"
          textAnchor="middle"
        >
          {label}
        </text>
      ))}
      <text x={pad + size / 2} y={size + 38} fill="#94a3b8" fontSize="12" textAnchor="middle">
        Performance →
      </text>
      {["High", "Med", "Low"].map((label, i) => (
        <text key={`pot-${label}`} x={pad - 10} y={i * cell + cell / 2} fill="#cbd5e1" fontSize="12" textAnchor="end">
          {label}
        </text>
      ))}
      <text
        x={16}
        y={size / 2}
        fill="#94a3b8"
        fontSize="12"
        textAnchor="middle"
        transform={`rotate(-90 16 ${size / 2})`}
      >
        Potential →
      </text>
    </svg>
  );
}

function LogOneOnOneModal({
  person,
  onClose,
  onSaved,
}: {
  person: PersonProfile;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/people/one-on-ones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId: person.id, date, notes }),
      });
      if (!res.ok) throw new Error("Failed to save");
      onSaved();
      onClose();
    } catch {
      setError("Couldn't save the 1:1. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-slate-100">Log 1:1 — {person.name}</h3>
        <label className="mt-4 block text-xs uppercase tracking-wide text-slate-400">Date</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
        />
        <label className="mt-4 block text-xs uppercase tracking-wide text-slate-400">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={8}
          placeholder="What did you discuss? Mood, blockers, career topics, action items..."
          className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
        />
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || notes.trim().length === 0}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save 1:1"}
          </button>
        </div>
      </div>
    </div>
  );
}

function nextOneOnOneTopics(profile: PersonProfile): string[] {
  const topics: string[] = [];
  const latest = profile.conversationSignals[0];

  if (latest?.hasExitSignal) {
    topics.push("Retention conversation — understand the exit signal and consider a retention offer.");
  }
  if (profile.flightRisk > 0.5) {
    topics.push("Career conversation — talk growth path, scope, and what 'staying' needs to look like.");
  }
  if (profile.burnoutRisk > 0.5) {
    topics.push("Workload check-in — review current load, on-call, and upcoming time off.");
  }
  if (latest?.hasCompensationSignal) {
    topics.push("Compensation discussion — review market benchmarking and timeline for a comp review.");
  }
  if (topics.length < 2) {
    topics.push("General check-in — progress on current goals and any blockers.");
  }
  if (topics.length < 2 && profile.potentialScore > 70) {
    topics.push("Growth opportunity — identify a stretch project or visibility opportunity.");
  }
  return topics.slice(0, 4);
}

function PersonDetailPanel({
  profile,
  nineBoxPlacement,
  succession,
  candidateNames,
  centralityPercentile,
  lowConfidence,
  onClose,
  onLogOneOnOne,
}: {
  profile: PersonProfile;
  nineBoxPlacement: NineBoxPlacement | undefined;
  succession: SuccessionRisk | undefined;
  candidateNames: string[];
  centralityPercentile: number;
  lowConfidence: boolean;
  onClose: () => void;
  onLogOneOnOne: () => void;
}) {
  const tier = retentionTier(profile.flightRisk);
  const retention = RETENTION_LABELS[tier];
  const tenureYears = (profile.tenureMonths / 12).toFixed(1);

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-[480px] overflow-y-auto border-l border-slate-800 bg-slate-950 p-6 shadow-2xl">
      <button onClick={onClose} className="text-sm text-slate-400 hover:text-slate-200">
        ✕ Close
      </button>

      <div className="mt-4">
        <h2 className="text-2xl font-bold text-slate-100">{profile.name}</h2>
        <p className="text-sm text-slate-400">
          {profile.role} · {profile.team} · {tenureYears}y tenure
        </p>
        <span className={`mt-3 inline-block rounded-full px-3 py-1 text-xs font-medium ${retention.className}`}>
          Retention Risk: {retention.label}
        </span>
      </div>

      <div className="mt-6 grid grid-cols-4 gap-2">
        <Gauge label="Flight Risk" value={profile.flightRisk * 100} invert />
        <Gauge label="Burnout" value={profile.burnoutRisk * 100} invert />
        <Gauge label="Performance" value={profile.performanceScoreResolved} />
        <Gauge label="Potential" value={profile.potentialScore} />
      </div>

      {nineBoxPlacement && (
        <div className="mt-6 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="text-sm font-semibold text-slate-200">9-Box Placement</h3>
          <p className="mt-1 text-lg text-slate-100">{nineBoxPlacement.quadrantLabel}</p>
          <p className="mt-1 text-sm text-slate-400">{nineBoxPlacement.suggestedAction}</p>
        </div>
      )}

      {succession && (
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="text-sm font-semibold text-slate-200">Succession Risk</h3>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {succession.isKeyPerson && (
              <span className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-1 text-red-300">
                Key Person
              </span>
            )}
            <span className="rounded-full border border-slate-700 px-2 py-1 text-slate-300">
              {succession.hasSuccessor ? "Successor ready" : `Time to readiness: ${succession.timeToReadiness}mo`}
            </span>
            <span className="rounded-full border border-slate-700 px-2 py-1 text-slate-300">
              Risk score: {succession.riskScore}
            </span>
          </div>
          {candidateNames.length > 0 && (
            <p className="mt-2 text-sm text-slate-400">Candidates: {candidateNames.join(", ")}</p>
          )}
          {succession.gapSkills.length > 0 && (
            <p className="mt-1 text-xs text-slate-500">Gap skills: {succession.gapSkills.join(", ")}</p>
          )}
        </div>
      )}

      <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">Conversation Intelligence</h3>
          <button
            onClick={onLogOneOnOne}
            className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500"
          >
            + Log 1:1
          </button>
        </div>
        {profile.conversationSignals.length === 0 && (
          <p className="mt-2 text-sm text-slate-500">No 1:1 notes logged yet.</p>
        )}
        <div className="mt-3 space-y-3">
          {profile.conversationSignals.map((s, idx) => (
            <div key={idx} className="rounded-md border border-slate-800 bg-slate-950 p-3">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{idx === 0 ? "Most recent" : `${idx + 1} back`}</span>
                <span>Sentiment: {s.sentimentScore.toFixed(2)} · Energy: {s.energyLevel}</span>
              </div>
              {s.hasExitSignal && (
                <p className="mt-2 text-sm font-medium text-red-400">⚠ Exit signal detected</p>
              )}
              <div className="mt-2 flex flex-wrap gap-1">
                {s.topicFlags.map((f, fi) => (
                  <span
                    key={fi}
                    title={f.evidence}
                    className={`rounded-full px-2 py-0.5 text-[11px] ${
                      f.severity === 3
                        ? "bg-red-500/20 text-red-300"
                        : f.severity === 2
                          ? "bg-amber-500/20 text-amber-300"
                          : "bg-slate-700/40 text-slate-300"
                    }`}
                  >
                    {f.type.replace(/_/g, " ")}
                  </span>
                ))}
                {s.topicFlags.length === 0 && <span className="text-xs text-slate-600">No flags</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="text-sm font-semibold text-slate-200">Next 1:1 Topics</h3>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-400">
          {nextOneOnOneTopics(profile).map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      </div>

      <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="text-sm font-semibold text-slate-200">Network Position</h3>
        <p className="mt-1 text-sm text-slate-400">
          Centrality percentile: {centralityPercentile}th
        </p>
        {profile.centrality > 0.7 && (
          <p className="mt-1 text-sm font-medium text-amber-400">⚠ This person is a network bridge.</p>
        )}
      </div>

      {lowConfidence && (
        <div className="mt-4 rounded-lg border border-amber-700/40 bg-amber-500/10 p-3 text-sm text-amber-300">
          Low confidence — log more data to improve accuracy.
        </div>
      )}
    </div>
  );
}

function TeamChemistryCard({ report }: { report: TeamChemistryReport }) {
  const healthColor =
    report.collaborationHealth === "strong"
      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
      : report.collaborationHealth === "adequate"
        ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
        : report.collaborationHealth === "fragile"
          ? "bg-orange-500/20 text-orange-300 border-orange-500/40"
          : "bg-red-500/20 text-red-300 border-red-500/40";

  return (
    <details className="rounded-lg border border-slate-800 bg-slate-900/60 p-4" open>
      <summary className="cursor-pointer text-sm font-semibold text-slate-100">
        {report.team} <span className="ml-2 text-xs text-slate-500">({report.teamMoodTrend})</span>
      </summary>
      <div className="mt-3 flex flex-wrap items-center gap-6">
        <Gauge label="Cohesion" value={report.cohesionScore} />
        <Gauge label="Psych Safety" value={report.psychologicalSafetyScore} />
        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${healthColor}`}>
          {report.collaborationHealth}
        </span>
      </div>
      {report.dominantTopics.length > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          Dominant topics: {report.dominantTopics.join(", ")}
        </p>
      )}
      {report.redFlags.length > 0 && (
        <ul className="mt-3 space-y-1">
          {report.redFlags.map((flag, i) => (
            <li key={i} className="text-sm text-red-300">
              🚩 {flag.description}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

export default function PeopleIntelligenceView() {
  const [report, setReport] = useState<PeopleIntelligenceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("flightRisk");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedId, setSelectedId] = useState<PersonId | null>(null);
  const [logModalPerson, setLogModalPerson] = useState<PersonProfile | null>(null);

  const nineBoxRef = useRef<HTMLDivElement>(null);
  const peopleRef = useRef<HTMLDivElement>(null);
  const chemistryRef = useRef<HTMLDivElement>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/people/intelligence");
      if (!res.ok) throw new Error("Request failed");
      const data = (await res.json()) as PeopleIntelligenceReport;
      setReport(data);
    } catch {
      setError("Couldn't load the People Intelligence report.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const profileById = useMemo(() => {
    const map = new Map<PersonId, PersonProfile>();
    report?.profiles.forEach((p) => map.set(p.id, p));
    return map;
  }, [report]);

  const sortedProfiles = useMemo(() => {
    if (!report) return [];
    const list = [...report.profiles];
    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "lastOneOnOneDate") {
        cmp = (a.lastOneOnOneDate ?? "").localeCompare(b.lastOneOnOneDate ?? "");
      } else {
        cmp = (a[sortKey] as number) - (b[sortKey] as number);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [report, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const centralityPercentile = useMemo(() => {
    if (!report) return () => 0;
    const sorted = [...report.profiles].map((p) => p.centrality).sort((a, b) => a - b);
    return (value: number) => {
      const idx = sorted.findIndex((v) => v >= value);
      const rank = idx === -1 ? sorted.length : idx;
      return Math.round((rank / Math.max(1, sorted.length)) * 100);
    };
  }, [report]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        Loading People Intelligence…
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 text-slate-400">
        <p>{error ?? "No data"}</p>
        <button onClick={load} className="rounded-md bg-indigo-600 px-4 py-2 text-sm text-white">
          Retry
        </button>
      </div>
    );
  }

  const burnoutCount = report.profiles.filter((p) => p.burnoutRisk >= 0.5).length;
  const flightRiskCount = report.profiles.filter((p) => p.flightRisk >= 0.5).length;
  const keyPersonNoSuccessor = report.successionRisks.filter((s) => s.isKeyPerson && !s.hasSuccessor).length;

  const selectedProfile = selectedId ? profileById.get(selectedId) : undefined;
  const selectedPlacement = selectedId
    ? report.nineBox.placements.find((p) => p.personId === selectedId)
    : undefined;
  const selectedSuccession = selectedId
    ? report.successionRisks.find((s) => s.personId === selectedId)
    : undefined;
  const selectedCandidateNames = (selectedSuccession?.candidateIds ?? [])
    .map((id) => profileById.get(id)?.name)
    .filter((n): n is string => Boolean(n));
  const selectedLowConfidence = report.uncertaintyFlags.some((f) => f.personId === selectedId);

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-8 text-slate-100">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">People Intelligence</h1>
        <p className="text-sm text-slate-500">Generated {new Date(report.generatedAt).toLocaleString()}</p>
      </header>

      {/* SECTION 1 — Org at a Glance */}
      <section className="mb-8 flex flex-wrap gap-3">
        <KpiCard
          label="Team Health Score"
          value={report.teamHealthScore}
          tone={report.teamHealthScore >= 70 ? "good" : report.teamHealthScore >= 40 ? "warning" : "danger"}
          onClick={() => chemistryRef.current?.scrollIntoView({ behavior: "smooth" })}
        />
        <KpiCard
          label="Active Flight Risks"
          value={flightRiskCount}
          tone={flightRiskCount > 0 ? "danger" : "good"}
          onClick={() => peopleRef.current?.scrollIntoView({ behavior: "smooth" })}
        />
        <KpiCard
          label="Burnout Risks"
          value={burnoutCount}
          tone={burnoutCount > 0 ? "warning" : "good"}
          onClick={() => peopleRef.current?.scrollIntoView({ behavior: "smooth" })}
        />
        <KpiCard
          label="Key Person Risks"
          value={keyPersonNoSuccessor}
          sublabel="no successor identified"
          tone={keyPersonNoSuccessor > 0 ? "danger" : "good"}
          onClick={() => peopleRef.current?.scrollIntoView({ behavior: "smooth" })}
        />
        <KpiCard
          label="Stars in Danger"
          value={report.nineBox.flightRiskInTopRight}
          sublabel="top-right + flight risk"
          tone={report.nineBox.flightRiskInTopRight > 0 ? "danger" : "good"}
          onClick={() => nineBoxRef.current?.scrollIntoView({ behavior: "smooth" })}
        />
      </section>

      {/* SECTION 2 — 9-Box */}
      <section ref={nineBoxRef} className="mb-8 rounded-xl border border-slate-800 bg-slate-900/40 p-6">
        <h2 className="mb-4 text-lg font-semibold">9-Box Matrix</h2>
        <NineBoxGrid placements={report.nineBox.placements} profileById={profileById} onSelect={setSelectedId} />
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-400">
          <span>Stars (top-right): {report.nineBox.topRightCount}</span>
          <span>Underperformers (bottom-left): {report.nineBox.bottomLeftCount}</span>
          <span>Stars with flight risk: {report.nineBox.flightRiskInTopRight}</span>
        </div>
      </section>

      {/* SECTION 3 — People grid */}
      <section ref={peopleRef} className="mb-8 rounded-xl border border-slate-800 bg-slate-900/40 p-6">
        <h2 className="mb-4 text-lg font-semibold">People</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
                <th className="cursor-pointer py-2 pr-4" onClick={() => toggleSort("name")}>
                  Name
                </th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Team</th>
                <th className="py-2 pr-4">Retention Risk</th>
                <th className="cursor-pointer py-2 pr-4" onClick={() => toggleSort("flightRisk")}>
                  Flight Risk {sortKey === "flightRisk" ? (sortDir === "desc" ? "↓" : "↑") : ""}
                </th>
                <th className="cursor-pointer py-2 pr-4" onClick={() => toggleSort("burnoutRisk")}>
                  Burnout Risk {sortKey === "burnoutRisk" ? (sortDir === "desc" ? "↓" : "↑") : ""}
                </th>
                <th className="py-2 pr-4">1:1 Quality</th>
                <th className="cursor-pointer py-2 pr-4" onClick={() => toggleSort("lastOneOnOneDate")}>
                  Last 1:1
                </th>
                <th className="py-2 pr-4">Exit Signals</th>
                <th className="py-2 pr-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {sortedProfiles.map((p) => {
                const tier = retentionTier(p.flightRisk);
                const retention = RETENTION_LABELS[tier];
                const exitSignal = p.conversationSignals.find((s) => s.hasExitSignal);
                const evidence = exitSignal?.topicFlags.find((f) => f.type === "flight_risk")?.evidence;
                return (
                  <tr key={p.id} className="border-b border-slate-900 hover:bg-slate-900/60">
                    <td className="py-2 pr-4 font-medium text-slate-100">{p.name}</td>
                    <td className="py-2 pr-4 text-slate-400">{p.role}</td>
                    <td className="py-2 pr-4 text-slate-400">{p.team}</td>
                    <td className="py-2 pr-4">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${retention.className}`}>
                        {retention.label}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <RiskBar value={p.flightRisk} />
                        <span className="text-xs text-slate-500">{formatPct(p.flightRisk)}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <RiskBar value={p.burnoutRisk} />
                        <span className="text-xs text-slate-500">{formatPct(p.burnoutRisk)}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-4">
                      <QualityRing signals={p.conversationSignals} />
                    </td>
                    <td className="py-2 pr-4 text-slate-400">{p.lastOneOnOneDate ?? "—"}</td>
                    <td className="py-2 pr-4">
                      {exitSignal ? (
                        <span title={evidence ?? "Exit signal detected"} className="cursor-help text-red-400">
                          ⚠
                        </span>
                      ) : (
                        <span className="text-slate-700">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setSelectedId(p.id)}
                          className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                        >
                          View
                        </button>
                        <button
                          onClick={() => setLogModalPerson(p)}
                          className="rounded-md bg-indigo-600 px-2 py-1 text-xs text-white hover:bg-indigo-500"
                        >
                          Log 1:1
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* SECTION 4 — Team chemistry */}
      <section ref={chemistryRef} className="mb-8">
        <h2 className="mb-4 text-lg font-semibold">Team Chemistry</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {report.teamChemistry.map((t) => (
            <TeamChemistryCard key={t.team} report={t} />
          ))}
        </div>
      </section>

      {report.networkAnomalies.length > 0 && (
        <section className="mb-8 rounded-xl border border-amber-700/40 bg-amber-500/5 p-4">
          <h2 className="mb-2 text-sm font-semibold text-amber-300">Network Anomalies</h2>
          <ul className="space-y-1 text-sm text-amber-200">
            {report.networkAnomalies.map((a, i) => (
              <li key={i}>{a.description}</li>
            ))}
          </ul>
        </section>
      )}

      <footer className="text-xs text-slate-600">
        Knowledge Silo Index: {report.knowledgeSiloIndex.toFixed(2)} · {report.uncertaintyFlags.length} low-confidence
        flags
      </footer>

      {selectedProfile && (
        <PersonDetailPanel
          profile={selectedProfile}
          nineBoxPlacement={selectedPlacement}
          succession={selectedSuccession}
          candidateNames={selectedCandidateNames}
          centralityPercentile={centralityPercentile(selectedProfile.centrality)}
          lowConfidence={selectedLowConfidence}
          onClose={() => setSelectedId(null)}
          onLogOneOnOne={() => setLogModalPerson(selectedProfile)}
        />
      )}

      {logModalPerson && (
        <LogOneOnOneModal
          person={logModalPerson}
          onClose={() => setLogModalPerson(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
