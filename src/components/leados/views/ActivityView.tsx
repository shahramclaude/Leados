"use client";

import { useEffect, useState } from "react";

interface Person {
  id: number;
  name: string;
}

const EVENT_TYPES = [
  { type: "decision", domain: "strategy", fields: ["topic", "status"] },
  { type: "okr_review", domain: "strategy", fields: ["quarter"] },
  { type: "meeting", domain: "strategy", fields: ["topic"] },
  { type: "incident", domain: "ops", fields: ["severity"] },
  { type: "support_ticket", domain: "ops", fields: ["subject", "status"] },
  { type: "deal", domain: "sales", fields: ["stage", "daysInStage"] },
] as const;

export default function ActivityView({ onChanged }: { onChanged: () => void }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [eventType, setEventType] = useState<(typeof EVENT_TYPES)[number]["type"]>("decision");
  const [personId, setPersonId] = useState<string>("");
  const [field1, setField1] = useState("");
  const [field2, setField2] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    fetch("/api/people")
      .then((r) => r.json())
      .then(setPeople);
  }, []);

  const config = EVENT_TYPES.find((e) => e.type === eventType)!;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const data: Record<string, unknown> = {};
    if (config.fields[0]) data[config.fields[0]] = field1 || undefined;
    if (config.fields[1]) data[config.fields[1]] = field2 || undefined;

    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: eventType,
        domain: config.domain,
        personId: personId ? Number(personId) : null,
        data,
      }),
    });
    setField1("");
    setField2("");
    setStatus("Logged.");
    onChanged();
    setTimeout(() => setStatus(null), 2000);
  }

  async function runSeed() {
    setSeeding(true);
    await fetch("/api/seed", { method: "POST" });
    setSeeding(false);
    onChanged();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Activity Log</h2>
          <p className="text-sm text-slate-400">Log org-wide signals: decisions, incidents, deals, meetings…</p>
        </div>
        <button
          onClick={runSeed}
          disabled={seeding}
          className="rounded-lg border border-emerald-700 bg-emerald-900/40 px-3 py-1.5 text-sm text-emerald-200 hover:bg-emerald-900/70 disabled:opacity-50"
        >
          {seeding ? "Seeding…" : "Seed demo data"}
        </button>
      </div>

      <form onSubmit={submit} className="max-w-xl space-y-4 rounded-xl border border-slate-800 bg-slate-900/50 p-5">
        <div>
          <label className="block text-xs text-slate-500">Event type</label>
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value as typeof eventType)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-white"
          >
            {EVENT_TYPES.map((e) => (
              <option key={e.type} value={e.type}>
                {e.type} ({e.domain})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-slate-500">Related person (optional)</label>
          <select
            value={personId}
            onChange={(e) => setPersonId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-white"
          >
            <option value="">— none —</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {config.fields[0] && (
          <div>
            <label className="block text-xs capitalize text-slate-500">{config.fields[0]}</label>
            <input
              value={field1}
              onChange={(e) => setField1(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-white"
            />
          </div>
        )}
        {config.fields[1] && (
          <div>
            <label className="block text-xs capitalize text-slate-500">{config.fields[1]}</label>
            <input
              value={field2}
              onChange={(e) => setField2(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-white"
            />
          </div>
        )}

        <button className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500">
          Log event
        </button>
        {status && <p className="text-xs text-emerald-400">{status}</p>}
      </form>
    </div>
  );
}
