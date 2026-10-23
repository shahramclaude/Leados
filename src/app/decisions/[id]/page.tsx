"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Badge from "@/components/Badge";
import { formatDate, formatDateTime } from "@/lib/format";

type Decision = {
  id: number;
  title: string;
  description: string;
  owner: string;
  status: "proposed" | "under_review" | "committed" | "archived";
  impact: "low" | "medium" | "high" | "critical";
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  committedAt: string | null;
};

type DecisionEvent = {
  id: number;
  eventType: string;
  actor: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

const NEXT_STEPS: Record<string, { status: string; label: string; tone: string }[]> = {
  proposed: [
    { status: "under_review", label: "Move to Review", tone: "bg-blue-600 hover:bg-blue-500" },
    { status: "archived", label: "Archive", tone: "bg-slate-500 hover:bg-slate-400" },
  ],
  under_review: [
    { status: "committed", label: "Commit Decision", tone: "bg-emerald-600 hover:bg-emerald-500" },
    { status: "proposed", label: "Send Back to Proposed", tone: "bg-slate-500 hover:bg-slate-400" },
    { status: "archived", label: "Archive", tone: "bg-slate-500 hover:bg-slate-400" },
  ],
  committed: [{ status: "archived", label: "Archive", tone: "bg-slate-500 hover:bg-slate-400" }],
  archived: [],
};

export default function DecisionDetailPage() {
  const params = useParams<{ id: string }>();
  const [decision, setDecision] = useState<Decision | null>(null);
  const [events, setEvents] = useState<DecisionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/decisions/${params.id}`);
    if (res.status === 404) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    const data = await res.json();
    setDecision(data.decision);
    setEvents(data.events ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (params.id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function transition(status: string) {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/decisions/${params.id}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Transition failed.");
      }
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Transition failed.");
    } finally {
      setBusy(false);
    }
  }

  if (notFound) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-lg font-semibold text-slate-900">Decision not found</p>
        <Link href="/decisions" className="mt-3 inline-block text-sm font-medium text-indigo-600 hover:underline">
          ← Back to decisions
        </Link>
      </div>
    );
  }

  if (loading || !decision) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  const nextSteps = NEXT_STEPS[decision.status] ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Link href="/decisions" className="text-sm font-medium text-indigo-600 hover:underline">
        ← Back to decisions
      </Link>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-950">{decision.title}</h1>
            <p className="mt-1 text-sm text-slate-500">
              Owner: {decision.owner} · Due {formatDate(decision.dueDate)}
            </p>
          </div>
          <div className="flex gap-2">
            <Badge value={decision.impact} />
            <Badge value={decision.status} />
          </div>
        </div>
        {decision.description && <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">{decision.description}</p>}

        <div className="mt-5 grid grid-cols-2 gap-4 text-xs text-slate-500 sm:grid-cols-4">
          <div>
            <p className="uppercase tracking-wide">Created</p>
            <p className="mt-1 text-sm text-slate-700">{formatDateTime(decision.createdAt)}</p>
          </div>
          <div>
            <p className="uppercase tracking-wide">Updated</p>
            <p className="mt-1 text-sm text-slate-700">{formatDateTime(decision.updatedAt)}</p>
          </div>
          <div>
            <p className="uppercase tracking-wide">Committed</p>
            <p className="mt-1 text-sm text-slate-700">{formatDateTime(decision.committedAt)}</p>
          </div>
        </div>

        {nextSteps.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-100 pt-5">
            {nextSteps.map((step) => (
              <button
                key={step.status}
                disabled={busy}
                onClick={() => transition(step.status)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-60 ${step.tone}`}
              >
                {step.label}
              </button>
            ))}
          </div>
        )}
        {actionError && <p className="mt-3 text-sm text-rose-600">{actionError}</p>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-950">Audit trail</h2>
        {events.length === 0 ? (
          <p className="text-sm text-slate-500">No events recorded.</p>
        ) : (
          <ol className="flex flex-col gap-4">
            {events.map((event) => (
              <li key={event.id} className="flex gap-3 border-l-2 border-indigo-200 pl-4">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {event.eventType.replace("_", " ")}
                    {typeof event.payload?.from === "string" && typeof event.payload?.to === "string"
                      ? `: ${event.payload.from} → ${event.payload.to}`
                      : ""}
                  </p>
                  <p className="text-xs text-slate-500">
                    {event.actor} · {formatDateTime(event.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
