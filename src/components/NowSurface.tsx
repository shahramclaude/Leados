"use client";

// LEADOS Part 14 — the "Now" surface.
// Top-3 decisions needing attention, what-changed-since-last-visit, pending
// approvals, and one recommended next action with evidence.
import { useCallback, useEffect, useState } from "react";
import { useActor } from "./ActorProvider";
import { relativeTimeFrom, useNowTick } from "@/hooks/useNowTick";

interface DecisionItem {
  id: string;
  type: "approval" | "finding";
  title: string;
  detail: string;
  severity: number;
  urgency: number;
  score: number;
  entityRef: string | null;
  createdAt: string;
  evidence: string[];
}

interface WorkQueueResponse {
  top3: DecisionItem[];
  recommendedAction: DecisionItem | null;
  pendingApprovals: Array<{ id: string; title: string; status: string; severity: number; dueAt: string | null }>;
  delta: { sinceISO: string | null; newFindings: number; newApprovals: number; items: DecisionItem[] };
  isEmptyOrg: boolean;
}

export function NowSurface() {
  const { actor, loading } = useActor();
  const now = useNowTick();
  const [data, setData] = useState<WorkQueueResponse | null>(null);
  const [fetching, setFetching] = useState(true);

  const load = useCallback(async () => {
    if (!actor) return;
    setFetching(true);
    const res = await fetch(`/api/work-queue?userId=${actor.userId}`);
    setData(await res.json());
    setFetching(false);
  }, [actor]);

  useEffect(() => {
    void load();
  }, [load]);

  async function seedDemo() {
    await fetch("/api/dev/seed", { method: "POST" });
    void load();
  }

  if (loading || !actor) {
    return <div className="p-10 text-sm text-slate-400">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Now · {actor.role}</p>
          <h1 className="text-2xl font-semibold text-slate-900">What needs you right now</h1>
        </div>
        <button onClick={() => void load()} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-white">
          {fetching ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {data?.isEmptyOrg && (
        <div className="mb-6 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center">
          <p className="text-sm text-slate-500">
            Nothing here yet — this org has no findings or approvals. That&apos;s expected for a brand-new org, not an error.
          </p>
          <button onClick={seedDemo} className="mt-3 rounded-md bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-700">
            Load demo data
          </button>
        </div>
      )}

      {data && data.delta.sinceISO && (data.delta.newFindings > 0 || data.delta.newApprovals > 0) && (
        <div className="mb-6 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          Since your last visit ({relativeTimeFrom(data.delta.sinceISO, now)}): {data.delta.newApprovals} new approval(s), {data.delta.newFindings} new finding(s).
        </div>
      )}

      {data && data.recommendedAction && (
        <section className="mb-6 rounded-xl border border-indigo-200 bg-indigo-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Recommended next action</p>
          <h2 className="mt-1 text-lg font-semibold text-indigo-950">{data.recommendedAction.title}</h2>
          <p className="mt-1 text-sm text-indigo-800">{data.recommendedAction.detail}</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {data.recommendedAction.evidence.map((e) => (
              <li key={e} className="rounded-full bg-white px-2.5 py-1 text-xs text-indigo-700 shadow-sm">
                {e}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Top 3 decisions</h2>
        {data && data.top3.length === 0 && <p className="text-sm text-slate-400">Nothing urgent — you&apos;re caught up.</p>}
        <ol className="space-y-3">
          {data?.top3.map((item, idx) => (
            <li key={item.id} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">{idx + 1}</span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">{item.type}</span>
                  <span className="text-[11px] text-slate-400">severity {item.severity} · score {item.score.toFixed(1)}</span>
                </div>
                <p className="mt-1 font-medium text-slate-900">{item.title}</p>
                <p className="text-sm text-slate-500">{item.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Pending approvals</h2>
        {data && data.pendingApprovals.length === 0 && <p className="text-sm text-slate-400">No approvals waiting on {actor.role}.</p>}
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {data?.pendingApprovals.map((a) => (
            <li key={a.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="text-slate-800">{a.title}</span>
              <span className="text-xs text-slate-400">{a.dueAt ? `due ${new Date(a.dueAt).toLocaleString()}` : "no due date"}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
