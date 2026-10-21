"use client";

// ---------------------------------------------------------------------------
// Rendered whenever an entity's AsyncState.status === "conflict". Never
// auto-resolves: the user must explicitly pick mine / theirs / merge.
// ---------------------------------------------------------------------------

import { useState } from "react";

export function ConflictResolutionPanel<T extends Record<string, unknown>>({
  mine,
  theirs,
  fields,
  onResolve,
}: {
  mine: T;
  theirs: T;
  fields: { key: keyof T; label: string }[];
  onResolve: (resolution: "mine" | "theirs" | { merged: Partial<T> }) => void;
}) {
  const [merged, setMerged] = useState<Partial<T>>({});

  return (
    <div
      role="dialog"
      aria-label="Resolve conflicting changes"
      className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-5"
    >
      <p className="text-sm font-semibold text-amber-900">
        Someone else changed this while you were editing. Nothing has been overwritten — choose how
        to resolve it.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your version</p>
          <dl className="mt-2 space-y-2 text-sm">
            {fields.map((f) => (
              <div key={String(f.key)}>
                <dt className="text-xs text-slate-400">{f.label}</dt>
                <dd className="text-slate-800">{String(mine[f.key] ?? "—")}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Their version</p>
          <dl className="mt-2 space-y-2 text-sm">
            {fields.map((f) => (
              <div key={String(f.key)}>
                <dt className="text-xs text-slate-400">{f.label}</dt>
                <dd className="text-slate-800">{String(theirs[f.key] ?? "—")}</dd>
                <label className="mt-1 flex items-center gap-1.5 text-xs text-amber-700">
                  <input
                    type="checkbox"
                    className="focus-visible:ring-2 focus-visible:ring-amber-500"
                    onChange={(e) =>
                      setMerged((prev) => ({
                        ...prev,
                        [f.key]: e.target.checked ? theirs[f.key] : undefined,
                      }))
                    }
                  />
                  take theirs for this field
                </label>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => onResolve("mine")}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
        >
          Keep mine, reapply
        </button>
        <button
          onClick={() => onResolve("theirs")}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
        >
          Discard mine, accept theirs
        </button>
        <button
          onClick={() => onResolve({ merged })}
          disabled={Object.keys(merged).length === 0}
          className="rounded-lg border border-amber-400 bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Merge selected fields
        </button>
      </div>
    </div>
  );
}
