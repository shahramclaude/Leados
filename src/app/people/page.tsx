"use client";

import { useEffect, useState, type FormEvent } from "react";

type Person = {
  id: number;
  name: string;
  role: string;
  department: string;
  email: string;
};

export default function PeoplePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: "", role: "", department: "", email: "" });

  async function load() {
    setLoading(true);
    const res = await fetch("/api/people");
    const data = await res.json();
    setPeople(data.people ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to add person.");
      }
      setForm({ name: "", role: "", department: "", email: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add person.");
    } finally {
      setSubmitting(false);
    }
  }

  const byDepartment = people.reduce<Record<string, Person[]>>((acc, person) => {
    const key = person.department || "General";
    acc[key] = acc[key] ? [...acc[key], person] : [person];
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-8">
      <section>
        <p className="text-sm font-medium uppercase tracking-[0.1em] text-indigo-600">Org Intelligence</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">People Directory</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Keep a lightweight directory of decision owners and stakeholders for accountability tracking.
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-950">Add a person</h2>
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Name</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Role</label>
            <input
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Department</label>
            <input
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
            >
              {submitting ? "Adding…" : "Add person"}
            </button>
          </div>
        </form>
        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-950">Directory</h2>
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : people.length === 0 ? (
          <p className="text-sm text-slate-500">No people added yet.</p>
        ) : (
          <div className="flex flex-col gap-6">
            {Object.entries(byDepartment).map(([department, members]) => (
              <div key={department}>
                <h3 className="mb-2 text-sm font-semibold text-slate-700">{department}</h3>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {members.map((person) => (
                    <li key={person.id} className="rounded-xl border border-slate-100 px-4 py-3">
                      <p className="text-sm font-medium text-slate-900">{person.name}</p>
                      <p className="text-xs text-slate-500">{person.role || "—"}</p>
                      {person.email && <p className="mt-1 text-xs text-indigo-600">{person.email}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
