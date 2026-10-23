"use client";

import Link from "next/link";
import { useEffect, useState, use } from "react";
import { Badge, Button, Card, PageHeader, SecondaryButton, Select } from "@/components/ui";

type Decision = {
  id: number;
  title: string;
  description: string;
  category: string;
  status: string;
  owner: string;
  impact: string;
  confidence: number;
  createdAt: string;
  committedAt: string | null;
};

type DecisionEvent = {
  id: number;
  type: string;
  payload: string;
  createdAt: string;
};

export default function DecisionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [events, setEvents] = useState<DecisionEvent[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch(`/api/decisions/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    setDecision(data.decision);
    setEvents(data.events);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function updateStatus(status: string) {
    setBusy(true);
    await fetch(`/api/decisions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await load();
    setBusy(false);
  }

  async function commit() {
    setBusy(true);
    await fetch(`/api/decisions/${id}/commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "Committed from cockpit." }),
    });
    await load();
    setBusy(false);
  }

  if (!decision) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  return (
    <div>
      <Link href="/decisions" className="mb-4 inline-block text-xs text-cyan-400 hover:underline">
        ← All decisions
      </Link>
      <PageHeader
        eyebrow={`Decision #${decision.id}`}
        title={decision.title}
        description={decision.description || "No description provided."}
        action={<Badge value={decision.status} />}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Details</h2>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Owner</dt><dd>{decision.owner}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Category</dt><dd className="capitalize">{decision.category}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Impact</dt><dd><Badge value={decision.impact} /></dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Confidence</dt><dd>{decision.confidence}%</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Created</dt><dd>{new Date(decision.createdAt).toLocaleString()}</dd></div>
            {decision.committedAt ? (
              <div className="flex justify-between"><dt className="text-slate-500">Committed</dt><dd>{new Date(decision.committedAt).toLocaleString()}</dd></div>
            ) : null}
          </dl>

          <div className="mt-5 flex flex-col gap-2">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Change status</label>
            <Select
              value={decision.status}
              disabled={busy}
              onChange={(e) => updateStatus(e.target.value)}
            >
              <option value="proposed">Proposed</option>
              <option value="under_review">Under review</option>
              <option value="committed">Committed</option>
              <option value="closed">Closed</option>
            </Select>
            {decision.status !== "committed" ? (
              <Button disabled={busy} onClick={commit}>
                Commit decision
              </Button>
            ) : null}
            <SecondaryButton
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await fetch(`/api/decisions/${id}`, { method: "DELETE" });
                window.location.href = "/decisions";
              }}
            >
              Delete
            </SecondaryButton>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Event timeline (truth core)
          </h2>
          <ol className="relative flex flex-col gap-4 border-l border-slate-800 pl-5">
            {events.map((ev) => (
              <li key={ev.id} className="relative">
                <span className="absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full bg-cyan-500" />
                <p className="text-xs uppercase tracking-wide text-slate-500">{ev.type.replace(/_/g, " ")}</p>
                <p className="text-sm text-slate-200">{ev.payload}</p>
                <p className="text-xs text-slate-600">{new Date(ev.createdAt).toLocaleString()}</p>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}
