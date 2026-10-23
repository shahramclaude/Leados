"use client";

import { useActor } from "@/components/governance/ActorContext";

export default function ActingAsPage() {
  const { users, actingAsId, setActingAsId, actor } = useActor();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-slate-950">Acting-as settings</h1>
      <p className="mt-2 text-sm text-slate-600">
        This demo has no login system of its own. Pick a seeded board member to act as — every
        write action in the Board Portal and Governance Dashboard is sent with that user&apos;s
        board tier via the <code>x-gov-user-id</code> header, and the API enforces board-tier
        access scoping server-side regardless of what the UI shows.
      </p>

      {actor && (
        <div className="mt-6 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Currently acting as <strong>{actor.name}</strong> — board tier{" "}
          <code>{actor.boardTier}</code>
        </div>
      )}

      <div className="mt-6 grid gap-2">
        {users.length === 0 && (
          <p className="text-sm text-slate-500">Loading seeded users…</p>
        )}
        {users.map((u) => (
          <button
            key={u.id}
            onClick={() => setActingAsId(u.id)}
            className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition ${
              actingAsId === u.id
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white hover:border-slate-400"
            }`}
          >
            <span>{u.name}</span>
            <span className={actingAsId === u.id ? "text-slate-300" : "text-slate-500"}>
              {u.boardTier}
            </span>
          </button>
        ))}
      </div>

      {actingAsId !== null && (
        <button
          onClick={() => setActingAsId(null)}
          className="mt-6 text-sm text-slate-500 underline hover:text-slate-900"
        >
          Clear selection
        </button>
      )}
    </main>
  );
}
