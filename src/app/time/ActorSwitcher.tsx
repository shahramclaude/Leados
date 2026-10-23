"use client";

import { useActor } from "./ActorContext";

export function ActorSwitcher() {
  const { users, actorId, actor, setActorId, loading } = useActor();

  if (loading) return <p className="text-sm text-slate-500">Loading demo org…</p>;
  if (users.length === 0) {
    return <p className="text-sm text-red-600">No demo org seeded — run scripts/seed-time-economics.ts</p>;
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
      <span className="text-slate-500">View as</span>
      <select
        className="rounded-lg border border-slate-300 bg-white px-2 py-1 font-medium text-slate-900"
        value={actorId ?? ""}
        onChange={(e) => setActorId(e.target.value)}
      >
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name} · {u.role}
          </option>
        ))}
      </select>
      {actor ? (
        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
          {actor.chronotype} · {actor.timezone}
        </span>
      ) : null}
    </div>
  );
}
