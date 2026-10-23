"use client";

import { useMemo, useState } from "react";

export type MinutesRow = {
  id: number;
  meetingId: number;
  generatedSummary: string;
  finalized: boolean;
  finalizedByTier: string | null;
  verbatimExcerpts: { speaker: string; quote: string; timestampLabel: string }[];
  hash: string | null;
};

export type ResolutionRow = {
  id: number;
  meetingId: number;
  text: string;
  type: string;
  status: string;
  votes: { directorId: number; vote: string; conflictDeclared: boolean }[];
  links: { taskId: number }[];
  milestones: { id: number; status: string; milestoneDate: string }[];
};

export function SearchableMinutes({
  minutes,
  resolutions,
}: {
  minutes: MinutesRow[];
  resolutions: ResolutionRow[];
}) {
  const [query, setQuery] = useState("");

  const filteredMinutes = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return minutes;
    return minutes.filter(
      (m) =>
        m.generatedSummary.toLowerCase().includes(q) ||
        m.verbatimExcerpts.some((e) => e.quote.toLowerCase().includes(q) || e.speaker.toLowerCase().includes(q)),
    );
  }, [minutes, query]);

  const filteredResolutions = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return resolutions;
    return resolutions.filter((r) => r.text.toLowerCase().includes(q) || r.status.includes(q));
  }, [resolutions, query]);

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search minutes and resolutions…"
        className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-slate-500 focus:outline-none"
      />

      <section className="mt-6">
        <h2 className="text-lg font-semibold text-slate-900">Minutes</h2>
        <div className="mt-3 space-y-4">
          {filteredMinutes.map((m) => (
            <div key={m.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-slate-900">Meeting #{m.meetingId} minutes</h3>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    m.finalized ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {m.finalized ? `finalized (${m.finalizedByTier})` : "draft"}
                </span>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Verbatim excerpts (manual, immutable once finalized)
                  </p>
                  <ul className="mt-1 space-y-1 text-sm text-slate-700">
                    {m.verbatimExcerpts.map((e, i) => (
                      <li key={i} className="rounded-lg bg-slate-50 px-2 py-1">
                        <span className="font-medium">{e.speaker}</span> ({e.timestampLabel}): &ldquo;
                        {e.quote}&rdquo;
                      </li>
                    ))}
                    {m.verbatimExcerpts.length === 0 && (
                      <li className="text-slate-400">None recorded.</li>
                    )}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Generated narrative summary
                  </p>
                  <p className="mt-1 text-sm text-slate-700">{m.generatedSummary || "—"}</p>
                </div>
              </div>
              {m.hash && (
                <p className="mt-3 truncate text-xs text-slate-400" title={m.hash}>
                  chain hash: {m.hash}
                </p>
              )}
            </div>
          ))}
          {filteredMinutes.length === 0 && (
            <p className="text-sm text-slate-400">No minutes match your search.</p>
          )}
        </div>
      </section>

      <section className="mt-10 mb-10">
        <h2 className="text-lg font-semibold text-slate-900">Resolutions register</h2>
        <div className="mt-3 space-y-4">
          {filteredResolutions.map((r) => (
            <div key={r.id} id={`resolution-${r.id}`} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium text-slate-900">
                  #{r.id} · {r.type} · meeting #{r.meetingId}
                </h3>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                  {r.status}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-700">{r.text}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3 text-xs">
                <div>
                  <p className="font-semibold uppercase tracking-wide text-slate-500">Votes</p>
                  <ul className="mt-1 space-y-0.5 text-slate-600">
                    {r.votes.map((v, i) => (
                      <li key={i}>
                        director #{v.directorId}: {v.vote}
                        {v.conflictDeclared ? " (conflict declared)" : ""}
                      </li>
                    ))}
                    {r.votes.length === 0 && <li className="text-slate-400">No votes recorded.</li>}
                  </ul>
                </div>
                <div>
                  <p className="font-semibold uppercase tracking-wide text-slate-500">
                    Implementation linkage
                  </p>
                  {r.links.length > 0 ? (
                    <ul className="mt-1 space-y-0.5 text-slate-600">
                      {r.links.map((l, i) => (
                        <li key={i}>task #{l.taskId}</li>
                      ))}
                    </ul>
                  ) : r.status === "passed" ? (
                    <p className="mt-1 font-medium text-rose-700">
                      unlinked — flagged after grace period
                    </p>
                  ) : (
                    <p className="mt-1 text-slate-400">n/a</p>
                  )}
                </div>
                <div>
                  <p className="font-semibold uppercase tracking-wide text-slate-500">
                    Oversight milestones
                  </p>
                  <ul className="mt-1 space-y-0.5 text-slate-600">
                    {r.milestones.map((ms) => (
                      <li key={ms.id}>
                        {new Date(ms.milestoneDate).toLocaleDateString()} — {ms.status}
                      </li>
                    ))}
                    {r.milestones.length === 0 && <li className="text-slate-400">None scheduled.</li>}
                  </ul>
                </div>
              </div>
            </div>
          ))}
          {filteredResolutions.length === 0 && (
            <p className="text-sm text-slate-400">No resolutions match your search.</p>
          )}
        </div>
      </section>
    </div>
  );
}
