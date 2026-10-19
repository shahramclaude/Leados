"use client";

import { DEMO_PERSONAS, useViewer } from "@/lib/client/viewerContext";

export function ViewerSwitcher() {
  const { persona, setPersonaId } = useViewer();

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Viewing as</span>
      <select
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800"
        value={persona.id}
        onChange={(e) => setPersonaId(Number(e.target.value))}
      >
        {DEMO_PERSONAS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <span className="text-xs text-slate-500">
        role=<code className="rounded bg-slate-100 px-1 py-0.5">{persona.role}</code> · id={persona.id}
      </span>
      <span className="ml-auto text-xs text-slate-400">
        Every field you see or don&apos;t see below is decided server-side for this persona — see docs/PRIVACY.md.
      </span>
    </div>
  );
}
