"use client";
import { useState } from "react";
import type { IntelligenceData } from "@/hooks/useIntelligence";

export function SettingsView({ data, onRefetch }: { data: IntelligenceData; onRefetch: () => void }) {
  const [people, setPeople] = useState(data.flightRisk.map((r: any) => ({ id: r.personId, name: r.personName, role: r.role })));
  const [edits, setEdits] = useState<Record<number, { name: string; role: string; cadenceDays: number }>>({});
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newCadence, setNewCadence] = useState(14);
  const [reseeding, setReseeding] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);

  async function loadPeople() {
    const res = await fetch("/api/people");
    if (res.ok) setPeople(await res.json());
  }

  function edit(id: number, patch: Partial<{ name: string; role: string; cadenceDays: number }>) {
    setEdits((e) => {
      const base = people.find((p: any) => p.id === id) ?? {};
      const existing = e[id] ?? { name: "", role: "", cadenceDays: 14, ...base };
      return { ...e, [id]: { ...existing, ...patch } };
    });
  }

  async function save(id: number) {
    const patch = edits[id];
    if (!patch) return;
    await fetch(`/api/people/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setSavedId(id);
    setTimeout(() => setSavedId(null), 1500);
    await loadPeople();
    onRefetch();
  }

  async function archive(id: number, archived: boolean) {
    await fetch(`/api/people/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived }),
    });
    await loadPeople();
    onRefetch();
  }

  async function addPerson() {
    if (!newName.trim()) return;
    await fetch("/api/people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, role: newRole, cadenceDays: newCadence }),
    });
    setNewName("");
    setNewRole("");
    setNewCadence(14);
    await loadPeople();
    onRefetch();
  }

  async function reseed() {
    if (!confirm("This will wipe and reseed all LeadOS data. Continue?")) return;
    setReseeding(true);
    try {
      await fetch("/api/seed", { method: "POST" });
      await loadPeople();
      onRefetch();
    } finally {
      setReseeding(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <section>
        <div className="text-sm font-semibold text-slate-300 mb-2">People</div>
        <div className="space-y-2">
          {people.map((p: any) => {
            const current = edits[p.id] ?? { name: p.name, role: p.role, cadenceDays: p.cadenceDays ?? 14 };
            return (
              <div key={p.id} className="bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3 flex flex-wrap items-center gap-2">
                <input
                  value={current.name}
                  onChange={(e) => edit(p.id, { name: e.target.value })}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-sm text-slate-100 outline-none w-40"
                />
                <input
                  value={current.role}
                  onChange={(e) => edit(p.id, { role: e.target.value })}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-sm text-slate-100 outline-none w-48"
                />
                <input
                  type="number"
                  value={current.cadenceDays}
                  onChange={(e) => edit(p.id, { cadenceDays: Number(e.target.value) })}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-sm text-slate-100 outline-none w-20"
                  title="Cadence days"
                />
                <button onClick={() => save(p.id)} className="bg-indigo-600 hover:bg-indigo-500 rounded-lg px-3 py-1.5 text-xs text-white">
                  {savedId === p.id ? "Saved ✓" : "Save"}
                </button>
                <button onClick={() => archive(p.id, true)} className="bg-slate-700 hover:bg-slate-600 rounded-lg px-3 py-1.5 text-xs text-slate-200 ml-auto">
                  Archive
                </button>
              </div>
            );
          })}
        </div>

        <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-xl px-4 py-3 mt-3 flex flex-wrap items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name"
            className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-sm text-slate-100 outline-none w-40"
          />
          <input
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            placeholder="Role"
            className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-sm text-slate-100 outline-none w-48"
          />
          <input
            type="number"
            value={newCadence}
            onChange={(e) => setNewCadence(Number(e.target.value))}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-sm text-slate-100 outline-none w-20"
            title="Cadence days"
          />
          <button onClick={addPerson} className="bg-indigo-600 hover:bg-indigo-500 rounded-lg px-3 py-1.5 text-xs text-white">
            + Add person
          </button>
        </div>
      </section>

      <section>
        <div className="text-sm font-semibold text-slate-300 mb-2">Database</div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3 flex items-center justify-between">
          <div className="text-xs text-slate-500">Reset all LeadOS tables and reseed demo data.</div>
          <button
            disabled={reseeding}
            onClick={reseed}
            className="bg-red-700 hover:bg-red-600 disabled:opacity-50 rounded-lg px-3 py-1.5 text-xs text-white"
          >
            {reseeding ? "Resetting…" : "Reset and reseed"}
          </button>
        </div>
      </section>
    </div>
  );
}
