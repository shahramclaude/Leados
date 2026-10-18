"use client";

import { useCallback, useEffect, useState } from "react";

interface Person {
  id: number;
  name: string;
  role: string;
  cadenceDays: number;
  archived: boolean;
}

interface Counts {
  events: number;
  people: number;
  decisions: number;
  hypotheses: number;
}

export function SettingsView() {
  const [people, setPeople] = useState<Person[]>([]);
  const [counts, setCounts] = useState<Counts>({ events: 0, people: 0, decisions: 0, hypotheses: 0 });
  const [editing, setEditing] = useState<Record<number, Partial<Person>>>({});
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newCadence, setNewCadence] = useState(14);
  const [reseeding, setReseeding] = useState(false);
  const [saving, setSaving] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [peopleRes, eventsRes, decisionsRes, hypothesesRes] = await Promise.all([
      fetch("/api/people", { cache: "no-store" }),
      fetch("/api/events", { cache: "no-store" }),
      fetch("/api/decisions", { cache: "no-store" }),
      fetch("/api/hypotheses", { cache: "no-store" }),
    ]);
    const activePeople: Person[] = peopleRes.ok ? await peopleRes.json() : [];
    const events = eventsRes.ok ? await eventsRes.json() : [];
    const decisions = decisionsRes.ok ? await decisionsRes.json() : [];
    const hypotheses = hypothesesRes.ok ? await hypothesesRes.json() : [];
    setPeople(activePeople);
    setCounts({ events: events.length, people: activePeople.length, decisions: decisions.length, hypotheses: hypotheses.length });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function editField(id: number, field: keyof Person, value: string | number | boolean) {
    setEditing((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  async function save(person: Person) {
    const patch = editing[person.id];
    if (!patch) return;
    setSaving(person.id);
    try {
      await fetch(`/api/people/${person.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      setEditing((prev) => {
        const next = { ...prev };
        delete next[person.id];
        return next;
      });
      await load();
    } finally {
      setSaving(null);
    }
  }

  async function toggleArchive(person: Person) {
    await fetch(`/api/people/${person.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: !person.archived }),
    });
    await load();
  }

  async function addPerson() {
    if (!newName || !newRole) return;
    await fetch("/api/people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, role: newRole, cadenceDays: newCadence }),
    });
    setNewName("");
    setNewRole("");
    setNewCadence(14);
    await load();
  }

  async function reseed() {
    setReseeding(true);
    try {
      await fetch("/api/seed", { method: "POST" });
      await load();
    } finally {
      setReseeding(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold text-slate-100">Settings</h2>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-300">People</h3>
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/80 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Cadence (d)</th>
                <th className="px-3 py-2">Archived</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => {
                const patch = editing[p.id] ?? {};
                return (
                  <tr key={p.id} className="border-t border-slate-800">
                    <td className="px-3 py-1.5">
                      <input
                        defaultValue={p.name}
                        onChange={(e) => editField(p.id, "name", e.target.value)}
                        className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-slate-200 hover:border-slate-700 focus:border-slate-600 focus:bg-slate-800"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        defaultValue={p.role}
                        onChange={(e) => editField(p.id, "role", e.target.value)}
                        className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-slate-200 hover:border-slate-700 focus:border-slate-600 focus:bg-slate-800"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="number"
                        defaultValue={p.cadenceDays}
                        onChange={(e) => editField(p.id, "cadenceDays", Number(e.target.value))}
                        className="w-20 rounded border border-transparent bg-transparent px-1 py-0.5 text-slate-200 hover:border-slate-700 focus:border-slate-600 focus:bg-slate-800"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <span className={p.archived ? "text-amber-400" : "text-slate-500"}>{p.archived ? "Yes" : "No"}</span>
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex gap-2">
                        <button
                          onClick={() => save(p)}
                          disabled={!editing[p.id] || saving === p.id}
                          className="rounded-lg bg-indigo-600 px-2 py-1 text-xs text-white hover:bg-indigo-500 disabled:opacity-40"
                        >
                          {saving === p.id ? "…" : "Save"}
                        </button>
                        <button
                          onClick={() => toggleArchive(p)}
                          className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-slate-600"
                        >
                          {p.archived ? "Unarchive" : "Archive"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <label className="text-sm text-slate-400">
            Name
            <input value={newName} onChange={(e) => setNewName(e.target.value)} className="mt-1 block rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-slate-200" />
          </label>
          <label className="text-sm text-slate-400">
            Role
            <input value={newRole} onChange={(e) => setNewRole(e.target.value)} className="mt-1 block rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-slate-200" />
          </label>
          <label className="text-sm text-slate-400">
            Cadence
            <input
              type="number"
              value={newCadence}
              onChange={(e) => setNewCadence(Number(e.target.value))}
              className="mt-1 block w-20 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-slate-200"
            />
          </label>
          <button onClick={addPerson} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500">
            Add person
          </button>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-300">Database</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Object.entries(counts).map(([k, v]) => (
            <div key={k} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-center">
              <div className="text-2xl font-bold text-slate-100">{v}</div>
              <div className="text-xs capitalize text-slate-500">{k}</div>
            </div>
          ))}
        </div>
        <button
          onClick={reseed}
          disabled={reseeding}
          className="mt-3 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {reseeding ? "Reseeding…" : "Reseed database"}
        </button>
      </div>
    </div>
  );
}
