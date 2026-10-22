"use client";

import { useState, useTransition } from "react";
import { apiFetch } from "@/lib/client/api";

interface Person {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
}

export function PeoplePanel({ initialPeople, canWrite }: { initialPeople: Person[]; canWrite: boolean }) {
  const [people, setPeople] = useState(initialPeople);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function refresh() {
    const res = await apiFetch("/api/people");
    if (res.ok) {
      const data = await res.json();
      setPeople(data.people);
    }
  }

  async function addPerson(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await apiFetch("/api/people", {
        method: "POST",
        body: JSON.stringify({ firstName, lastName, email: email || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error?.message ?? "Could not add person");
        return;
      }
      setFirstName("");
      setLastName("");
      setEmail("");
      await refresh();
    });
  }

  async function requestExport() {
    setError(null);
    const consentRes = await apiFetch("/api/consent/export", {
      method: "POST",
      body: JSON.stringify({ scope: "people_export", acknowledge: true }),
    });
    if (!consentRes.ok) {
      setError("Could not record export consent");
      return;
    }
    window.location.href = "/api/people/export";
  }

  return (
    <div className="space-y-4">
      {canWrite && (
        <form onSubmit={addPerson} className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 shadow-sm">
          <div>
            <label className="block text-xs font-medium text-slate-600">First name</label>
            <input
              required
              maxLength={120}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="mt-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Last name</label>
            <input
              required
              maxLength={120}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="mt-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Email (optional)</label>
            <input
              type="email"
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Add person
          </button>
          <button type="button" onClick={requestExport} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">
            Export CSV (requires consent)
          </button>
        </form>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">First name</th>
              <th className="px-4 py-2">Last name</th>
              <th className="px-4 py-2">Email</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-4 py-2">{p.firstName}</td>
                <td className="px-4 py-2">{p.lastName}</td>
                <td className="px-4 py-2">{p.email ?? "—"}</td>
              </tr>
            ))}
            {people.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-slate-400">
                  No people yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
