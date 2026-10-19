"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import type { Blocker, CrossDependency, Milestone, Person, Project, ProjectId } from "@/lib/types";
import {
  CRITICAL_SEVERITY_THRESHOLD,
  isOpen,
  type BlockerHeatmapRow,
  type DeliveryConfidence,
  type ExecutionIntelligenceReport,
} from "@/lib/executionIntelligence";

interface ExecutionApiResponse extends ExecutionIntelligenceReport {
  projects: Project[];
  milestones: Milestone[];
  blockers: Blocker[];
  crossDependencies: CrossDependency[];
  people: Person[];
}

const COLUMNS: { key: Project["status"]; label: string }[] = [
  { key: "planning", label: "Planning" },
  { key: "active", label: "Active" },
  { key: "blocked", label: "Blocked" },
  { key: "complete", label: "Complete" },
];

const SEVERITIES = [1, 2, 3, 4, 5] as const;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function formatDate(iso: string | null): string {
  if (!iso) return "No date";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "No date";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function confidenceTextColor(confidence: number): string {
  if (confidence >= 70) return "text-emerald-600";
  if (confidence >= 40) return "text-amber-600";
  return "text-rose-600";
}

function confidenceRingColor(confidence: number): string {
  if (confidence >= 70) return "#059669";
  if (confidence >= 40) return "#d97706";
  return "#e11d48";
}

function healthScoreColor(score: number): string {
  if (score >= 70) return "text-emerald-600";
  if (score >= 40) return "text-amber-600";
  return "text-rose-600";
}

function heatColor(count: number, max: number): string {
  if (count === 0) return "bg-slate-100 text-slate-400";
  const intensity = max === 0 ? 0 : count / max;
  if (intensity > 0.75) return "bg-rose-600 text-white";
  if (intensity > 0.5) return "bg-rose-400 text-white";
  if (intensity > 0.25) return "bg-amber-300 text-slate-900";
  return "bg-amber-100 text-slate-700";
}

function ConfidenceRing({ confidence }: { confidence: number }) {
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - confidence / 100);
  const color = confidenceRingColor(confidence);
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" className="shrink-0">
      <circle cx="20" cy="20" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="4" />
      <circle
        cx="20"
        cy="20"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 20 20)"
      />
      <text x="20" y="24" textAnchor="middle" fontSize="10" fontWeight="700" fill="#0f172a">
        {confidence}
      </text>
    </svg>
  );
}

export default function ExecutionView() {
  const [data, setData] = useState<ExecutionApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<ProjectId | null>(null);
  const [heatmapFilter, setHeatmapFilter] = useState<{ domain: string; sev: number } | null>(null);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [showBlockerForm, setShowBlockerForm] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/execution", { cache: "no-store" });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = (await res.json()) as ExecutionApiResponse;
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load execution intelligence");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const confidenceByProject = useMemo(() => {
    const map = new Map<ProjectId, DeliveryConfidence>();
    data?.deliveryConfidence.forEach((d) => map.set(d.projectId, d));
    return map;
  }, [data]);

  const blockersByProject = useMemo(() => {
    const map = new Map<ProjectId, Blocker[]>();
    data?.blockers.forEach((b) => {
      const list = map.get(b.projectId) ?? [];
      list.push(b);
      map.set(b.projectId, list);
    });
    return map;
  }, [data]);

  const peopleById = useMemo(() => {
    const map = new Map<number, Person>();
    data?.people.forEach((p) => map.set(p.id, p));
    return map;
  }, [data]);

  const projectById = useMemo(() => {
    const map = new Map<ProjectId, Project>();
    data?.projects.forEach((p) => map.set(p.id, p));
    return map;
  }, [data]);

  async function resolveBlocker(id: number) {
    setBusy(true);
    try {
      await fetch(`/api/execution/blockers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved: true }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function createProject(formData: FormData) {
    setBusy(true);
    try {
      await fetch("/api/execution/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.get("name"),
          domain: formData.get("domain"),
          status: formData.get("status") || "planning",
          targetDate: formData.get("targetDate") || null,
        }),
      });
      setShowProjectForm(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function createBlocker(formData: FormData) {
    setBusy(true);
    try {
      await fetch("/api/execution/blockers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: Number(formData.get("projectId")),
          title: formData.get("title"),
          severity: Number(formData.get("severity")),
          domain: formData.get("domain") || null,
        }),
      });
      setShowBlockerForm(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <main className="min-h-screen px-6 py-12 text-slate-600">Loading execution intelligence…</main>;
  }

  if (error || !data) {
    return (
      <main className="min-h-screen px-6 py-12">
        <p className="text-rose-600">{error ?? "No data available"}</p>
      </main>
    );
  }

  const projects = data.projects;
  const onTrackPct =
    projects.length === 0
      ? 0
      : Math.round(
          (projects.filter((p) => (confidenceByProject.get(p.id)?.confidence ?? 0) > 70).length /
            projects.length) *
            100,
        );
  const openCriticalBlockers = data.blockers.filter(
    (b) => isOpen(b) && b.severity >= CRITICAL_SEVERITY_THRESHOLD,
  ).length;

  const selectedProject = selectedProjectId !== null ? projectById.get(selectedProjectId) ?? null : null;
  const maxHeat = Math.max(1, ...data.blockerHeatmap.flatMap((r) => SEVERITIES.map((s) => r[`sev${s}` as keyof BlockerHeatmapRow] as number)));

  const filteredHeatmapBlockers = heatmapFilter
    ? data.blockers.filter((b) => {
        const domain = b.domain ?? projectById.get(b.projectId)?.domain ?? "unassigned";
        return domain === heatmapFilter.domain && b.severity === heatmapFilter.sev;
      })
    : [];

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.08em] text-slate-500">Leados</p>
            <h1 className="text-3xl font-semibold text-slate-950">Execution Intelligence</h1>
            <p className="mt-1 text-sm text-slate-500">
              Generated {new Date(data.generatedAt).toLocaleString()}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowProjectForm((v) => !v)}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              + New project
            </button>
            <button
              onClick={() => setShowBlockerForm((v) => !v)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              + Report blocker
            </button>
          </div>
        </header>

        {showProjectForm && (
          <form
            action={createProject}
            className="flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 shadow-sm"
          >
            <div>
              <label className="block text-xs text-slate-500">Name</label>
              <input name="name" required className="rounded border border-slate-300 px-2 py-1 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-500">Domain</label>
              <input name="domain" required className="rounded border border-slate-300 px-2 py-1 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-500">Status</label>
              <select name="status" className="rounded border border-slate-300 px-2 py-1 text-sm">
                {COLUMNS.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500">Target date</label>
              <input type="date" name="targetDate" className="rounded border border-slate-300 px-2 py-1 text-sm" />
            </div>
            <button
              disabled={busy}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Create
            </button>
          </form>
        )}

        {showBlockerForm && (
          <form
            action={createBlocker}
            className="flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 shadow-sm"
          >
            <div>
              <label className="block text-xs text-slate-500">Project</label>
              <select name="projectId" required className="rounded border border-slate-300 px-2 py-1 text-sm">
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500">Title</label>
              <input name="title" required className="rounded border border-slate-300 px-2 py-1 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-500">Severity (1-5)</label>
              <input
                type="number"
                name="severity"
                min={1}
                max={5}
                defaultValue={3}
                className="w-20 rounded border border-slate-300 px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500">Domain (optional)</label>
              <input name="domain" className="rounded border border-slate-300 px-2 py-1 text-sm" />
            </div>
            <button
              disabled={busy}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Report
            </button>
          </form>
        )}

        {/* KPI row */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-500">Execution health score</p>
            <p className={`mt-2 text-5xl font-bold ${healthScoreColor(data.executionHealthScore)}`}>
              {data.executionHealthScore}
            </p>
            <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">
              Velocity: {data.velocityTrend}
            </p>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-500">Projects on track</p>
            <p className="mt-2 text-5xl font-bold text-slate-900">{onTrackPct}%</p>
            <p className="mt-1 text-xs text-slate-400">confidence above 70</p>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-500">Open critical blockers</p>
            <p
              className={`mt-2 text-5xl font-bold ${
                openCriticalBlockers > 0 ? "text-rose-600" : "text-emerald-600"
              }`}
            >
              {openCriticalBlockers}
            </p>
            <p className="mt-1 text-xs text-slate-400">severity ≥ {CRITICAL_SEVERITY_THRESHOLD}</p>
          </div>
        </section>

        {data.executionNarratives.length > 0 && (
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold text-slate-900">Narratives</h2>
            <ul className="space-y-1.5 text-sm text-slate-700">
              {data.executionNarratives.map((n, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-slate-400">•</span>
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Kanban board */}
        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Project board</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            {COLUMNS.map((col) => {
              const colProjects = projects.filter((p) => p.status === col.key);
              return (
                <div key={col.key} className="rounded-2xl bg-slate-50 p-3">
                  <div className="mb-2 flex items-center justify-between px-1">
                    <h3 className="text-sm font-semibold text-slate-700">{col.label}</h3>
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
                      {colProjects.length}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {colProjects.map((project) => {
                      const confidence = confidenceByProject.get(project.id)?.confidence ?? 100;
                      const owner = project.ownerId ? peopleById.get(project.ownerId) : null;
                      const openBlockerCount = (blockersByProject.get(project.id) ?? []).filter(isOpen).length;
                      return (
                        <button
                          key={project.id}
                          onClick={() => setSelectedProjectId(project.id)}
                          className={`w-full rounded-xl border bg-white p-3 text-left shadow-sm transition hover:shadow-md ${
                            selectedProjectId === project.id ? "border-slate-900" : "border-slate-200"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-medium text-slate-900">{project.name}</p>
                              <p className="text-xs text-slate-500">{project.domain}</p>
                            </div>
                            <ConfidenceRing confidence={confidence} />
                          </div>
                          <div className="mt-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="grid h-6 w-6 place-items-center rounded-full bg-slate-800 text-[10px] font-semibold text-white">
                                {owner ? initials(owner.name) : "—"}
                              </span>
                              <span className="text-xs text-slate-500">{formatDate(project.targetDate)}</span>
                            </div>
                            {openBlockerCount > 0 && (
                              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
                                {openBlockerCount} blocker{openBlockerCount === 1 ? "" : "s"}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                    {colProjects.length === 0 && (
                      <p className="px-1 text-xs text-slate-400">No projects</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Project detail panel */}
        {selectedProject && (
          <ProjectDetailPanel
            project={selectedProject}
            confidence={confidenceByProject.get(selectedProject.id) ?? null}
            milestones={data.milestones.filter((m) => m.projectId === selectedProject.id)}
            blockers={data.blockers.filter((b) => b.projectId === selectedProject.id)}
            crossDependencies={data.crossDependencies}
            projectById={projectById}
            peopleById={peopleById}
            onResolveBlocker={resolveBlocker}
            onClose={() => setSelectedProjectId(null)}
            busy={busy}
          />
        )}

        {/* Critical path */}
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Critical path</h2>
          <CriticalPathSvg
            path={data.criticalPath}
            projectById={projectById}
            confidenceByProject={confidenceByProject}
          />
        </section>

        {/* Blocker heatmap */}
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Blocker heatmap</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-1 text-sm">
              <thead>
                <tr>
                  <th className="px-2 text-left text-xs font-semibold uppercase text-slate-500">Domain</th>
                  {SEVERITIES.map((s) => (
                    <th key={s} className="px-2 text-xs font-semibold uppercase text-slate-500">
                      Sev {s}
                    </th>
                  ))}
                  <th className="px-2 text-xs font-semibold uppercase text-slate-500">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.blockerHeatmap.map((row) => (
                  <tr key={row.domain}>
                    <td className="px-2 py-1 font-medium text-slate-700">{row.domain}</td>
                    {SEVERITIES.map((s) => {
                      const count = row[`sev${s}` as keyof BlockerHeatmapRow] as number;
                      const active =
                        heatmapFilter?.domain === row.domain && heatmapFilter?.sev === s;
                      return (
                        <td key={s} className="px-1 py-1 text-center">
                          <button
                            onClick={() =>
                              setHeatmapFilter(
                                active ? null : { domain: row.domain, sev: s },
                              )
                            }
                            className={`h-10 w-10 rounded-md text-sm font-semibold transition ${heatColor(
                              count,
                              maxHeat,
                            )} ${active ? "ring-2 ring-slate-900" : ""}`}
                          >
                            {count}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-2 py-1 text-center font-semibold text-slate-700">{row.total}</td>
                  </tr>
                ))}
                {data.blockerHeatmap.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-2 py-4 text-center text-slate-400">
                      No blockers recorded
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {heatmapFilter && (
            <div className="mt-4 rounded-xl bg-slate-50 p-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-700">
                {heatmapFilter.domain} · severity {heatmapFilter.sev} ({filteredHeatmapBlockers.length})
              </h3>
              <ul className="space-y-1 text-sm text-slate-600">
                {filteredHeatmapBlockers.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-2">
                    <span>
                      {b.title} — {projectById.get(b.projectId)?.name ?? `#${b.projectId}`}
                    </span>
                    <span className={isOpen(b) ? "text-rose-600" : "text-emerald-600"}>
                      {isOpen(b) ? "open" : "resolved"}
                    </span>
                  </li>
                ))}
                {filteredHeatmapBlockers.length === 0 && <li className="text-slate-400">No blockers</li>}
              </ul>
            </div>
          )}
        </section>

        {/* Dependency risk */}
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Dependency risk</h2>
          <div className="space-y-2">
            {data.dependencyRisk.map((d) => (
              <div
                key={d.dependencyId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm"
              >
                <span>
                  {projectById.get(d.fromProject)?.name ?? `#${d.fromProject}`}{" "}
                  <span className="text-slate-400">→ {d.type} →</span>{" "}
                  {projectById.get(d.toProject)?.name ?? `#${d.toProject}`}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">{d.reason}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      d.risk === "critical"
                        ? "bg-rose-100 text-rose-700"
                        : d.risk === "high"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {d.risk}
                  </span>
                </span>
              </div>
            ))}
            {data.dependencyRisk.length === 0 && (
              <p className="text-sm text-slate-400">No cross-project dependencies recorded</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function ProjectDetailPanel({
  project,
  confidence,
  milestones,
  blockers,
  crossDependencies,
  projectById,
  peopleById,
  onResolveBlocker,
  onClose,
  busy,
}: {
  project: Project;
  confidence: DeliveryConfidence | null;
  milestones: Milestone[];
  blockers: Blocker[];
  crossDependencies: CrossDependency[];
  projectById: Map<ProjectId, Project>;
  peopleById: Map<number, Person>;
  onResolveBlocker: (id: number) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const upstream = crossDependencies.filter((d) => d.toProject === project.id);
  const downstream = crossDependencies.filter((d) => d.fromProject === project.id);
  const owner = project.ownerId ? peopleById.get(project.ownerId) : null;

  return (
    <section className="rounded-2xl border-2 border-slate-900 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{project.name}</h2>
          <p className="text-sm text-slate-500">
            {project.domain} · Owner: {owner ? owner.name : "Unassigned"} · Status: {project.status}
          </p>
        </div>
        <button onClick={onClose} className="text-sm text-slate-400 hover:text-slate-700">
          Close ✕
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Milestones
          </h3>
          <ul className="space-y-1.5 text-sm">
            {milestones.map((m) => (
              <li key={m.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span>{m.title}</span>
                <span className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400">{formatDate(m.dueDate)}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 font-semibold ${
                      m.status === "done"
                        ? "bg-emerald-100 text-emerald-700"
                        : m.status === "overdue"
                          ? "bg-rose-100 text-rose-700"
                          : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {m.status}
                  </span>
                </span>
              </li>
            ))}
            {milestones.length === 0 && <li className="text-slate-400">No milestones</li>}
          </ul>

          <h3 className="mb-2 mt-5 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Blockers
          </h3>
          <ul className="space-y-1.5 text-sm">
            {blockers.map((b) => (
              <li key={b.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span>
                  {b.title}{" "}
                  <span className="text-xs text-slate-400">(sev {b.severity})</span>
                </span>
                {b.resolvedAt ? (
                  <span className="text-xs font-semibold text-emerald-600">resolved</span>
                ) : (
                  <button
                    disabled={busy}
                    onClick={() => onResolveBlocker(b.id)}
                    className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Resolve
                  </button>
                )}
              </li>
            ))}
            {blockers.length === 0 && <li className="text-slate-400">No blockers</li>}
          </ul>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Delivery confidence breakdown
          </h3>
          {confidence ? (
            <div>
              <p className={`text-3xl font-bold ${confidenceTextColor(confidence.confidence)}`}>
                {confidence.confidence}
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {confidence.factors.map((f, i) => (
                  <li key={i} className="flex items-center justify-between rounded bg-rose-50 px-2 py-1">
                    <span className="text-slate-700">{f.label}</span>
                    <span className="font-semibold text-rose-600">{f.impact}</span>
                  </li>
                ))}
                {confidence.factors.length === 0 && (
                  <li className="text-emerald-600">No negative factors — healthy project</li>
                )}
              </ul>
            </div>
          ) : (
            <p className="text-slate-400">No confidence data</p>
          )}

          <h3 className="mb-2 mt-5 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Dependencies
          </h3>
          <p className="mb-1 text-xs font-semibold text-slate-500">Upstream (what we block on)</p>
          <ul className="mb-3 space-y-1 text-sm">
            {upstream.map((d) => (
              <li key={d.id} className="rounded bg-slate-50 px-2 py-1">
                {projectById.get(d.fromProject)?.name ?? `#${d.fromProject}`} ({d.type})
              </li>
            ))}
            {upstream.length === 0 && <li className="text-slate-400">None</li>}
          </ul>
          <p className="mb-1 text-xs font-semibold text-slate-500">Downstream (who blocks on us)</p>
          <ul className="space-y-1 text-sm">
            {downstream.map((d) => (
              <li key={d.id} className="rounded bg-slate-50 px-2 py-1">
                {projectById.get(d.toProject)?.name ?? `#${d.toProject}`} ({d.type})
              </li>
            ))}
            {downstream.length === 0 && <li className="text-slate-400">None</li>}
          </ul>
        </div>
      </div>
    </section>
  );
}

function CriticalPathSvg({
  path,
  projectById,
  confidenceByProject,
}: {
  path: ProjectId[];
  projectById: Map<ProjectId, Project>;
  confidenceByProject: Map<ProjectId, DeliveryConfidence>;
}) {
  if (path.length === 0) {
    return <p className="text-sm text-slate-400">No critical path (no blocking dependencies found)</p>;
  }

  const nodeWidth = 160;
  const nodeHeight = 60;
  const gap = 60;
  const width = path.length * nodeWidth + (path.length - 1) * gap + 20;
  const height = nodeHeight + 20;

  return (
    <svg width={width} height={height} className="max-w-full" role="img" aria-label="Critical path">
      {path.map((id, i) => {
        const project = projectById.get(id);
        const confidence = confidenceByProject.get(id)?.confidence ?? 100;
        const x = 10 + i * (nodeWidth + gap);
        const y = 10;
        const color = confidenceRingColor(confidence);
        return (
          <g key={id}>
            {i > 0 && (
              <line
                x1={x - gap}
                y1={y + nodeHeight / 2}
                x2={x}
                y2={y + nodeHeight / 2}
                stroke="#94a3b8"
                strokeWidth={2}
                markerEnd="url(#arrowhead)"
              />
            )}
            <rect
              x={x}
              y={y}
              width={nodeWidth}
              height={nodeHeight}
              rx={10}
              fill="white"
              stroke={color}
              strokeWidth={3}
            />
            <text x={x + nodeWidth / 2} y={y + 24} textAnchor="middle" fontSize="12" fontWeight="600" fill="#0f172a">
              {project ? project.name.slice(0, 18) : `#${id}`}
            </text>
            <text x={x + nodeWidth / 2} y={y + 42} textAnchor="middle" fontSize="11" fill={color} fontWeight="700">
              {confidence}% confidence
            </text>
          </g>
        );
      })}
      <defs>
        <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="#94a3b8" />
        </marker>
      </defs>
    </svg>
  );
}
