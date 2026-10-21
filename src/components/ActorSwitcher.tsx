"use client";

import { useActor } from "@/lib/actorContext";

const ROLE_LABEL: Record<string, string> = {
  employee: "Employee",
  manager: "Manager",
  hr: "HR",
  executive: "Executive",
};

/** Demo-only actor switcher so privacy scoping (self/manager/HR/executive)
 * can be exercised interactively. See docs/FAIRNESS.md for the declared
 * visibility policy this enforces server-side. */
export function ActorSwitcher() {
  const { actors, currentActorId, setCurrentActorId, currentActor, loading } = useActor();

  if (loading) return <div className="text-xs text-slate-400">Loading actors…</div>;

  return (
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor="actor-select" className="text-xs text-slate-500">
        Viewing as
      </label>
      <select
        id="actor-select"
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
        value={currentActorId ?? ""}
        onChange={(e) => setCurrentActorId(e.target.value)}
      >
        {actors.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} ({ROLE_LABEL[a.globalRole] ?? a.globalRole})
          </option>
        ))}
      </select>
      {currentActor && (
        <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-medium text-white">
          {ROLE_LABEL[currentActor.globalRole]}
        </span>
      )}
    </div>
  );
}
