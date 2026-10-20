"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/httpClient";
import { useSession } from "@/components/SessionProvider";

interface Person {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  createdAt: string;
}

export default function DashboardPage() {
  const { user, loading: sessionLoading } = useSession();
  const router = useRouter();
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", notes: "" });

  useEffect(() => {
    if (!sessionLoading && !user) router.replace("/login");
  }, [sessionLoading, user, router]);

  async function loadPeople() {
    setLoading(true);
    setError(null);
    try {
      const data = (await apiFetch("/api/people")) as { people: Person[] };
      setPeople(data.people);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load people.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user) void loadPeople();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/api/people", { method: "POST", body: form });
      setForm({ firstName: "", lastName: "", email: "", phone: "", notes: "" });
      await loadPeople();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create person.");
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await apiFetch(`/api/people/${id}`, { method: "DELETE" });
      await loadPeople();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete person.");
    }
  }

  if (sessionLoading || !user) return null;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-slate-950">People</h1>
      <p className="mt-1 text-sm text-slate-600">
        Scoped to your organization only. Every read and write below is recorded in the audit log.
      </p>

      <form onSubmit={handleCreate} className="mt-6 grid grid-cols-1 gap-3 rounded-2xl bg-white p-6 shadow sm:grid-cols-2">
        <input
          placeholder="First name"
          required
          value={form.firstName}
          onChange={(e) => setForm({ ...form, firstName: e.target.value })}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          placeholder="Last name"
          required
          value={form.lastName}
          onChange={(e) => setForm({ ...form, lastName: e.target.value })}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          placeholder="Email"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          placeholder="Phone"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <textarea
          placeholder="Notes"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          className="col-span-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="col-span-full rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Add person
        </button>
      </form>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-6 overflow-hidden rounded-2xl bg-white shadow">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="px-4 py-3 text-slate-500" colSpan={4}>
                  Loading…
                </td>
              </tr>
            )}
            {!loading && people.length === 0 && (
              <tr>
                <td className="px-4 py-3 text-slate-500" colSpan={4}>
                  No people yet.
                </td>
              </tr>
            )}
            {people.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  {p.firstName} {p.lastName}
                </td>
                <td className="px-4 py-3">{p.email ?? "—"}</td>
                <td className="px-4 py-3">{p.phone ?? "—"}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleDelete(p.id)}
                    className="text-xs font-medium text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
