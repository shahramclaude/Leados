"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Status = "pending" | "in_progress" | "resolved" | "dismissed";

interface LinkRef {
  id: number;
  title: string;
}

interface WorkItemRow {
  id: number;
  title: string;
  steps: string[];
  status: Status;
  domain: string;
  source: string;
  findingKey: string;
  priority: number;
  dueAt: string | null;
  assignedTo: number | null;
  assignedToName: string | null;
  blockedBy: number[];
  blockedByTitles: LinkRef[];
  blocking: LinkRef[];
  outcomeNotes: string | null;
  suggestedAction: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

interface Person {
  id: number;
  name: string;
}

const PRIORITY_CLASSES: Record<number, string> = {
  5: "bg-red-100 text-red-800 border-red-300",
  4: "bg-orange-100 text-orange-800 border-orange-300",
  3: "bg-amber-100 text-amber-800 border-amber-300",
  2: "bg-sky-100 text-sky-800 border-sky-300",
  1: "bg-slate-100 text-slate-700 border-slate-300",
};

const STATUS_LABEL: Record<Status, string> = {
  pending: "Pending",
  in_progress: "In progress",
  resolved: "Resolved",
  dismissed: "Dismissed",
};

const DOMAINS = ["people", "finance", "sales", "ops", "strategy"];

function formatDue(dueAt: string | null): { label: string; overdue: boolean } {
  if (!dueAt) return { label: "No due date", overdue: false };
  const d = new Date(dueAt);
  const overdue = d.getTime() < Date.now();
  const label = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return { label: overdue ? `Overdue (${label})` : `Due ${label}`, overdue };
}

export default function WorkQueueView() {
  const [items, setItems] = useState<WorkItemRow[]>([]);
  const [, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("pending");
  const [priority, setPriority] = useState<string>("all");
  const [domain, setDomain] = useState<string>("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const esRef = useRef<EventSource | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status !== "all") params.set("status", status);
      if (priority !== "all") params.set("priority", priority);
      if (domain !== "all") params.set("domain", domain);
      const res = await fetch(`/api/work-queue?${params.toString()}`);
      const data = await res.json();
      setItems(data.items ?? []);
      setPeople(data.people ?? []);
    } finally {
      setLoading(false);
    }
  }, [status, priority, domain]);

  useEffect(() => {
    load();
  }, [load]);

  // Live refresh: any work_item event from the background intelligence loop
  // should update this view without the user doing anything.
  useEffect(() => {
    const es = new EventSource("/api/events/stream");
    esRef.current = es;
    const refresh = () => load();
    es.addEventListener("work_item", refresh);
    es.addEventListener("run", refresh);
    es.onerror = () => {
      // The ProactiveRail owns reconnect/backoff UX; here we just drop and
      // let the next manual filter change or periodic focus re-trigger load.
      es.close();
    };
    return () => {
      es.removeEventListener("work_item", refresh);
      es.removeEventListener("run", refresh);
      es.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => (prev.size === items.length ? new Set() : new Set(items.map((i) => i.id))));
  };

  const bulkDismiss = useCallback(async () => {
    if (selected.size === 0) return;
    await fetch("/api/work-queue", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selected), action: "dismiss" }),
    });
    setSelected(new Set());
    load();
  }, [selected, load]);

  const pending = useMemo(() => items.filter((i) => i.status === "pending" || i.status === "in_progress"), [items]);
  const resolvedOrDismissed = useMemo(
    () => items.filter((i) => i.status === "resolved" || i.status === "dismissed"),
    [items],
  );

  return (
    <section className="flex h-full flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Work Queue</h1>
        <p className="text-sm text-slate-500">
          Findings with severity ≥ 3 automatically generate work here — the system prepares work before you ask.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <FilterSelect
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            ["all", "All"],
            ["pending", "Pending"],
            ["in_progress", "In progress"],
            ["resolved", "Resolved"],
            ["dismissed", "Dismissed"],
          ]}
        />
        <FilterSelect
          label="Priority"
          value={priority}
          onChange={setPriority}
          options={[["all", "All"], ["5", "5 — Critical"], ["4", "4 — High"], ["3", "3 — Elevated"], ["2", "2 — Low"], ["1", "1 — Minor"]]}
        />
        <FilterSelect
          label="Domain"
          value={domain}
          onChange={setDomain}
          options={[["all", "All"], ...DOMAINS.map((d) => [d, d[0].toUpperCase() + d.slice(1)] as [string, string])]}
        />

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-500">{selected.size} selected</span>
          <button
            onClick={bulkDismiss}
            disabled={selected.size === 0}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Dismiss selected
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <div className="flex flex-col gap-6 overflow-y-auto">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={items.length > 0 && selected.size === items.length}
                onChange={toggleAll}
                className="h-3.5 w-3.5"
              />
              <h2 className="text-sm font-semibold text-slate-700">Active ({pending.length})</h2>
            </div>
            {pending.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-400">
                Nothing pending. Nice.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {pending.map((item) => (
                  <WorkItemCard
                    key={item.id}
                    item={item}
                    selected={selected.has(item.id)}
                    onToggle={() => toggle(item.id)}
                  />
                ))}
              </ul>
            )}
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold text-slate-700">History ({resolvedOrDismissed.length})</h2>
            {resolvedOrDismissed.length === 0 ? (
              <p className="text-xs text-slate-400">Nothing resolved or dismissed yet.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {resolvedOrDismissed.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500"
                  >
                    <span className="truncate">{item.title}</span>
                    <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5">
                      {STATUS_LABEL[item.status]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-slate-500">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function WorkItemCard({
  item,
  selected,
  onToggle,
}: {
  item: WorkItemRow;
  selected: boolean;
  onToggle: () => void;
}) {
  const due = formatDue(item.dueAt);
  return (
    <li className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <input type="checkbox" checked={selected} onChange={onToggle} className="mt-1 h-3.5 w-3.5" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${PRIORITY_CLASSES[item.priority] ?? PRIORITY_CLASSES[1]}`}
          >
            P{item.priority}
          </span>
          <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-500">
            {item.domain}
          </span>
          <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-500">
            source: {item.source}
          </span>
          <span className={`text-[11px] font-medium ${due.overdue ? "text-red-600" : "text-slate-500"}`}>
            {due.label}
          </span>
          {item.assignedToName && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
              👤 {item.assignedToName}
            </span>
          )}
        </div>

        <p className="mt-1.5 text-sm font-semibold text-slate-900">{item.title}</p>

        {item.suggestedAction && (
          <p className="mt-0.5 text-xs text-slate-500">Suggested: {item.suggestedAction}</p>
        )}

        {item.steps?.length > 0 && (
          <ul className="mt-1.5 list-disc pl-4 text-xs text-slate-500">
            {item.steps.map((s, idx) => (
              <li key={idx}>{s}</li>
            ))}
          </ul>
        )}

        {(item.blockedByTitles.length > 0 || item.blocking.length > 0) && (
          <p className="mt-1.5 text-[11px] text-slate-400">
            {item.blockedByTitles.length > 0 && (
              <span className="mr-3">
                ⛔ Blocked by{" "}
                {item.blockedByTitles.map((b, i) => (
                  <span key={b.id}>
                    {i > 0 && ", "}#{b.id} {b.title}
                  </span>
                ))}
              </span>
            )}
            {item.blocking.length > 0 && (
              <span>
                🔗 Blocks{" "}
                {item.blocking.map((b, i) => (
                  <span key={b.id}>
                    {i > 0 && ", "}#{b.id} {b.title}
                  </span>
                ))}
              </span>
            )}
          </p>
        )}

        <p className="mt-1.5 text-[10px] text-slate-400">
          Auto-created {new Date(item.createdAt).toLocaleString()}
        </p>
      </div>
    </li>
  );
}
