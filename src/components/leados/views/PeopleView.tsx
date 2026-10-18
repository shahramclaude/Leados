"use client";

import { useCallback, useEffect, useState } from "react";

interface Person {
  id: number;
  name: string;
  role: string;
  email: string;
  createdAt: string;
}

const QUICK_ACTIONS: { type: string; domain: string; label: string; buildData: () => Record<string, unknown> }[] = [
  { type: "oneonone", domain: "people", label: "Log 1:1", buildData: () => ({ notes: "Logged via LeadOS" }) },
  { type: "pulse", domain: "people", label: "Pulse: Low", buildData: () => ({ mood: 2 }) },
  { type: "pulse", domain: "people", label: "Pulse: Good", buildData: () => ({ mood: 4 }) },
  { type: "feedback", domain: "people", label: "Feedback +", buildData: () => ({ sentiment: "positive", text: "Nice work" }) },
  { type: "feedback", domain: "people", label: "Feedback −", buildData: () => ({ sentiment: "negative", text: "Needs improvement" }) },
  { type: "task_assigned", domain: "people", label: "+ Task", buildData: () => ({ title: "New task" }) },
];

export default function PeopleView({ onChanged }: { onChanged: () => void }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/people", { cache: "no-store" });
    setPeople(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addPerson(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await fetch("/api/people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, role }),
    });
    setName("");
    setRole("");
    await load();
    onChanged();
  }

  async function logAction(personId: number, type: string, domain: string, data: Record<string, unknown>) {
    setBusyId(personId);
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, domain, personId, data }),
    });
    setBusyId(null);
    onChanged();
  }

  return (
    <div>
      <h2 className="mb-1 text-2xl font-bold text-white">People</h2>
      <p className="mb-6 text-sm text-slate-400">Add team members and log day-to-day signals.</p>

      <form onSubmit={addPerson} className="mb-8 flex flex-wrap items-end gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <div>
          <label className="block text-xs text-slate-500">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-48 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-white"
            placeholder="Jordan Lee"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500">Role</label>
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="mt-1 w-48 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-white"
            placeholder="Software Engineer"
          />
        </div>
        <button className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500">
          Add person
        </button>
      </form>

      {loading ? (
        <p className="text-slate-400">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {people.map((p) => (
            <div key={p.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-white">{p.name}</p>
                  <p className="text-xs text-slate-500">{p.role || "—"}</p>
                </div>
                <span className="text-[11px] text-slate-500">
                  joined {new Date(p.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {QUICK_ACTIONS.map((a) => (
                  <button
                    key={a.label}
                    disabled={busyId === p.id}
                    onClick={() => logAction(p.id, a.type, a.domain, a.buildData())}
                    className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {people.length === 0 && (
            <p className="text-sm text-slate-500">No people yet — add one above, or seed demo data.</p>
          )}
        </div>
      )}
    </div>
  );
}
