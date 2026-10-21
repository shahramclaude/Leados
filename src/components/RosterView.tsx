"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useActor, actorFetch } from "@/lib/actorContext";

interface RosterPerson {
  id: string;
  name: string;
  email: string;
  role: string;
  title: string;
  teamId: string | null;
  teamName: string | null;
  managerId: string | null;
  status: string;
}

/** Roster, scoped server-side by src/app/api/people/route.ts — this
 * component renders only whatever the API already filtered; it performs no
 * additional client-side filtering for privacy (that would be a UI-only
 * gate, which the standing order forbids). */
export function RosterView() {
  const { currentActorId, currentActor } = useActor();
  const [people, setPeople] = useState<RosterPerson[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentActorId) return;
    setPeople(null);
    setError(null);
    actorFetch(currentActorId, "/api/people")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed to load roster");
        return r.json();
      })
      .then((data) => setPeople(data.people))
      .catch((e) => setError(e.message));
  }, [currentActorId]);

  return (
    <div>
      <p className="mb-3 text-sm text-slate-600">
        Scoped to <strong>{currentActor?.name ?? "…"}</strong>&rsquo;s role ({currentActor?.globalRole}). HR and
        executives see the whole roster; managers see their direct reports; everyone else sees only themselves — this
        is enforced in <code>src/app/api/people/route.ts</code>, not in this component.
      </p>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {!people && !error && <p className="text-sm text-slate-400">Loading…</p>}
      {people && (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {people.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2 font-medium text-slate-800">{p.name}</td>
                  <td className="px-3 py-2 text-slate-600">{p.title}</td>
                  <td className="px-3 py-2 text-slate-600">{p.teamName ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{p.status}</td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/people/${p.id}`} className="text-indigo-600 hover:underline">
                      Open profile →
                    </Link>
                  </td>
                </tr>
              ))}
              {people.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                    No people visible to this actor.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
