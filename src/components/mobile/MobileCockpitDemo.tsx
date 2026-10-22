import { useMemo, useState } from "react";
import { ORG_DATASETS } from "../../lib/domainData";
import { compileDailyBrief } from "../../lib/briefingCompiler";
import { runMobileLeadershipLoop } from "../../lib/journey";

/** Phase 2 "Mobile cockpit" — the full leadership loop (read brief, approve,
 * decide, comment) rendered live at a 390px frame (iPhone 12/13/14 width),
 * not just described. This is the same `compileDailyBrief` output the
 * desktop cockpit uses — no separate "mobile data path" to drift. */
export function MobileCockpitDemo() {
  const [orgId, setOrgId] = useState<keyof typeof ORG_DATASETS>("northwind");
  const ds = ORG_DATASETS[orgId];
  const brief = useMemo(() => compileDailyBrief(ds), [ds]);
  const loop = useMemo(() => runMobileLeadershipLoop(ds), [ds]);
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [decisionNote, setDecisionNote] = useState("");
  const [comment, setComment] = useState("");
  const [decisionSaved, setDecisionSaved] = useState(false);
  const [commentSaved, setCommentSaved] = useState(false);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">LEADOS · Mobile cockpit (390px)</p>
          <h1 className="text-2xl font-bold text-slate-900">The full leadership loop, on a phone</h1>
          <p className="mt-0.5 text-sm text-slate-500">Estimated loop time: {(loop.totalEstimateMs / 1000).toFixed(1)}s</p>
        </div>
        <select value={orgId} onChange={(e) => setOrgId(e.target.value as keyof typeof ORG_DATASETS)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          {Object.values(ORG_DATASETS).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </header>

      <div className="flex justify-center">
        <div className="w-[390px] shrink-0 rounded-[2.5rem] border-8 border-slate-900 bg-slate-900 shadow-2xl">
          <div className="h-6 rounded-t-[2rem] bg-slate-900" />
          <div className="h-[720px] overflow-y-auto bg-slate-50 px-4 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-500">{brief.title}</p>
            <h2 className="mt-0.5 text-lg font-bold text-slate-900">{ds.label}</h2>
            <p className="text-[11px] text-slate-400">~{brief.estReadMinutes} min read · {brief.wordCount} words</p>

            {/* 1. Read brief — narrative thread, top-down */}
            <div className="mt-3 space-y-3">
              {brief.threads.map((t) => (
                <div key={t.questionId} className="rounded-xl bg-white p-3 shadow-sm">
                  <p className="text-[11px] font-semibold text-indigo-600">{t.question}</p>
                  <p className="mt-0.5 text-sm font-medium text-slate-900">{t.verdict}</p>
                </div>
              ))}
            </div>

            {/* 2. Approve */}
            <p className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Approve</p>
            {ds.approvalsInbox.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 p-2 text-xs text-slate-400">Queue empty — true zero.</p>
            ) : (
              <div className="space-y-2">
                {ds.approvalsInbox.map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-lg bg-white p-2.5 text-xs shadow-sm">
                    <span className="truncate pr-2 text-slate-700">{a.title}</span>
                    <button
                      onClick={() => setApproved((prev) => new Set(prev).add(a.id))}
                      disabled={approved.has(a.id)}
                      className="shrink-0 rounded-md bg-emerald-600 px-2 py-1 font-semibold text-white disabled:bg-emerald-300"
                    >
                      {approved.has(a.id) ? "Approved ✓" : "Approve"}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 3. Decide */}
            <p className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Decide</p>
            <textarea
              value={decisionNote}
              onChange={(e) => { setDecisionNote(e.target.value); setDecisionSaved(false); }}
              placeholder="Record a decision against today's top risk…"
              className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs"
              rows={2}
            />
            <button onClick={() => setDecisionSaved(true)} className="mt-1.5 rounded-md bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">
              {decisionSaved ? "Saved ✓" : "Save decision"}
            </button>

            {/* 4. Comment */}
            <p className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Comment</p>
            <textarea
              value={comment}
              onChange={(e) => { setComment(e.target.value); setCommentSaved(false); }}
              placeholder="Leave a note for the team on this thread…"
              className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs"
              rows={2}
            />
            <button onClick={() => setCommentSaved(true)} className="mt-1.5 rounded-md bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">
              {commentSaved ? "Posted ✓" : "Post comment"}
            </button>
            <div className="h-6" />
          </div>
        </div>
      </div>
    </div>
  );
}
