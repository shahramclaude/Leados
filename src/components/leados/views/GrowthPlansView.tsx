"use client";

import { useCallback, useEffect, useState } from "react";

interface Plan {
  id: number;
  personId: number | null;
  title: string;
  status: string;
  lastCheckinAt: string;
  createdAt: string;
}

interface Person {
  id: number;
  name: string;
}

export default function GrowthPlansView({ onChanged }: { onChanged: () => void }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [title, setTitle] = useState("");
  const [personId, setPersonId] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [plansRes, peopleRes] = await Promise.all([
      fetch("/api/growth-plans", { cache: "no-store" }),
      fetch("/api/people", { cache: "no-store" }),
    ]);
    setPlans(await plansRes.json());
    setPeople(await peopleRes.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function personName(id: number | null) {
    return people.find((p) => p.id === id)?.name ?? "Unassigned";
  }

  function daysSince(iso: string) {
    return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
  }

  async function addPlan(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await fetch("/api/growth-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, personId: personId ? Number(personId) : null }),
    });
    setTitle("");
    setPersonId("");
    await load();
    onChanged();
  }

  async function checkin(id: number) {
    await fetch("/api/growth-plans", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, checkin: true }),
    });
    await load();
    onChanged();
  }

  async function complete(id: number) {
    await fetch("/api/growth-plans", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "completed" }),
    });
    await load();
    onChanged();
  }

  return (
    <div>
      <h2 className="mb-1 text-2xl font-bold text-white">Growth Plans</h2>
      <p className="mb-6 text-sm text-slate-400">Track development plans and check-in cadence per person.</p>

      <form onSubmit={addPlan} className="mb-8 flex flex-wrap items-end gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <div>
          <label className="block text-xs text-slate-500">Plan title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-56 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-white"
            placeholder="Senior engineer track"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500">Person</label>
          <select
            value={personId}
            onChange={(e) => setPersonId(e.target.value)}
            className="mt-1 w-48 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-white"
          >
            <option value="">— unassigned —</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <button className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500">
          Create plan
        </button>
      </form>

      {loading ? (
        <p className="text-slate-400">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {plans.map((plan) => {
            const days = daysSince(plan.lastCheckinAt);
            const stalled = plan.status === "open" && days > 30;
            return (
              <div
                key={plan.id}
                className={`rounded-xl border p-4 ${
                  stalled ? "border-orange-500/40 bg-orange-500/5" : "border-slate-800 bg-slate-900/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-white">{plan.title}</p>
                    <p className="text-xs text-slate-500">{personName(plan.personId)}</p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                      plan.status === "completed" ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-300"
                    }`}
                  >
                    {plan.status}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  Last check-in: {days}d ago {stalled && <span className="text-orange-300">· stalled</span>}
                </p>
                {plan.status === "open" && (
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => checkin(plan.id)}
                      className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-200 hover:bg-slate-700"
                    >
                      Log check-in
                    </button>
                    <button
                      onClick={() => complete(plan.id)}
                      className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
                    >
                      Mark complete
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {plans.length === 0 && <p className="text-sm text-slate-500">No growth plans yet.</p>}
        </div>
      )}
    </div>
  );
}
