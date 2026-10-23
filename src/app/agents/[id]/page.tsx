"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { Badge, Button, Card, PageHeader, SecondaryButton } from "@/components/ui";

type Agent = {
  id: number;
  name: string;
  kernelType: string;
  description: string;
  status: string;
  autonomyLevel: string;
  lastRunAt: string | null;
};

type Run = {
  id: number;
  status: string;
  summary: string;
  log: string;
  startedAt: string;
  finishedAt: string | null;
};

export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch(`/api/agents/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    setAgent(data.agent);
    setRuns(data.runs);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function triggerRun() {
    setBusy(true);
    await fetch(`/api/agents/${id}/run`, { method: "POST" });
    await load();
    setBusy(false);
  }

  if (!agent) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div>
      <Link href="/agents" className="mb-4 inline-block text-xs text-cyan-400 hover:underline">
        ← All agents
      </Link>
      <PageHeader
        eyebrow={`Agent #${agent.id} · ${agent.kernelType} kernel`}
        title={agent.name}
        description={agent.description || "No description."}
        action={<Badge value={agent.status} />}
      />

      <div className="mb-6 flex gap-2">
        <Button onClick={triggerRun} disabled={busy || agent.status === "running"}>
          {busy || agent.status === "running" ? "Running…" : "Trigger run"}
        </Button>
        <SecondaryButton
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await fetch(`/api/agents/${id}`, { method: "DELETE" });
            window.location.href = "/agents";
          }}
        >
          Decommission agent
        </SecondaryButton>
      </div>

      <Card>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Run history</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-slate-500">No runs yet. Trigger one above.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {runs.map((r) => (
              <div key={r.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-100">Run #{r.id}</p>
                  <Badge value={r.status} />
                </div>
                <p className="text-sm text-slate-400">{r.summary}</p>
                <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-black/40 p-3 text-xs text-slate-500">{r.log}</pre>
                <p className="mt-2 text-xs text-slate-600">
                  {new Date(r.startedAt).toLocaleString()}
                  {r.finishedAt ? ` → ${new Date(r.finishedAt).toLocaleString()}` : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
