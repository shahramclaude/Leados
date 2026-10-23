"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Detail = {
  crisis: { id: string; title: string; state: string };
  timeline: { id: string; occurredAt: string; actorLabel: string; eventType: string; summary: string }[];
  decisions: { id: string; title: string; rationale: string; decidedByRoleKey: string; decideBy: string; status: string }[];
  assumptions: { id: string; decisionId: string; statement: string; status: string; reverifyAt: string; escalated: boolean; reverificationNote?: string }[];
  learnings: { id: string; category: string; statement: string; actionItem: string }[];
};

export default function PostMortemClient({ crisisId }: { crisisId: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [category, setCategory] = useState("process");
  const [statement, setStatement] = useState("");
  const [actionItem, setActionItem] = useState("");

  async function load() {
    const res = await fetch(`/api/crisis/${crisisId}`, { cache: "no-store" });
    if (res.ok) setDetail(await res.json());
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crisisId]);

  if (!detail) return <main className="px-6 py-12"><p>Loading…</p></main>;

  const wrongAssumptions = detail.assumptions.filter((a) => a.status === "reverified_false" || a.status === "overdue");
  const rightAssumptions = detail.assumptions.filter((a) => a.status === "reverified_true");

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-4xl">
        <Link href={`/crisis/${crisisId}`} className="text-xs text-slate-500">
          ← Back to Crisis Room
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">Post-Mortem Studio — {detail.crisis.title}</h1>
        <p className="text-sm text-slate-600">Current state: {detail.crisis.state}</p>

        <section className="mt-8 rounded-2xl bg-white p-5 shadow">
          <h2 className="text-lg font-semibold">Timeline reconstruction</h2>
          <ol className="mt-3 space-y-2 border-l-2 border-slate-200 pl-4">
            {detail.timeline.map((e) => (
              <li key={e.id} className="text-sm">
                <span className="font-mono text-xs text-slate-400">{new Date(e.occurredAt).toLocaleString()}</span>{" "}
                <strong>{e.eventType}</strong>: {e.summary}
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-8 rounded-2xl bg-white p-5 shadow">
          <h2 className="text-lg font-semibold">Decisions &amp; assumptions review</h2>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-emerald-700">Assumptions that held up</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {rightAssumptions.map((a) => (
                  <li key={a.id}>✓ {a.statement}</li>
                ))}
                {rightAssumptions.length === 0 && <li className="text-slate-500">None recorded as reverified-true yet.</li>}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-red-700">Assumptions that were wrong or went overdue</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {wrongAssumptions.map((a) => (
                  <li key={a.id}>
                    ✗ {a.statement} — <em>{a.status}</em>
                  </li>
                ))}
                {wrongAssumptions.length === 0 && <li className="text-slate-500">None.</li>}
              </ul>
            </div>
          </div>

          <ul className="mt-6 space-y-2">
            {detail.decisions.map((d) => (
              <li key={d.id} className="rounded-lg border p-3 text-sm">
                <p className="font-semibold">{d.title}</p>
                <p className="text-slate-600">{d.rationale}</p>
                <p className="text-xs text-slate-500">
                  by {d.decidedByRoleKey} · decide-by {new Date(d.decideBy).toLocaleString()} · {d.status}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-8 rounded-2xl bg-white p-5 shadow">
          <h2 className="text-lg font-semibold">Learning capture → Part 12 knowledge base / Part 30 (seam)</h2>
          <ul className="mt-3 space-y-2">
            {detail.learnings.map((l) => (
              <li key={l.id} className="rounded-lg border p-3 text-sm">
                <p className="font-semibold">[{l.category}] {l.statement}</p>
                <p className="text-slate-600">Action: {l.actionItem}</p>
              </li>
            ))}
            {detail.learnings.length === 0 && <p className="text-sm text-slate-500">No learnings captured yet.</p>}
          </ul>

          <div className="mt-4 rounded-lg border p-3">
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border p-2 text-sm">
              <option value="process">process</option>
              <option value="tooling">tooling</option>
              <option value="comms">comms</option>
              <option value="authority">authority</option>
              <option value="detection">detection</option>
            </select>
            <input
              placeholder="Learning statement"
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              className="mt-2 block w-full rounded-lg border p-2 text-sm"
            />
            <input
              placeholder="Action item"
              value={actionItem}
              onChange={(e) => setActionItem(e.target.value)}
              className="mt-2 block w-full rounded-lg border p-2 text-sm"
            />
            <button
              disabled={!statement}
              onClick={async () => {
                await fetch(`/api/crisis/${crisisId}/learnings`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ category, statement, actionItem, targetSystem: "part12_knowledge_base" }),
                });
                setStatement("");
                setActionItem("");
                load();
              }}
              className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              Capture learning
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
