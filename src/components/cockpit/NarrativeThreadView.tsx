import type { NarrativeThread } from "../../lib/briefingCompiler";
import type { Fact } from "../../lib/citations";
import { ConfidenceBadge } from "../shared/ConfidenceBadge";

export function NarrativeThreadView({
  thread,
  facts,
  onFootnoteClick,
  onApproveAction,
}: {
  thread: NarrativeThread;
  facts: Fact[];
  onFootnoteClick: (factId: number) => void;
  onApproveAction?: (label: string) => void;
}) {
  const factsById = new Map(facts.map((f) => [f.id, f]));

  function renderRefs(refs: number[]) {
    if (refs.length === 0) return null;
    return (
      <span className="ml-1 space-x-0.5">
        {refs.map((r) => (
          <button
            key={r}
            onClick={() => onFootnoteClick(r)}
            className="rounded bg-indigo-50 px-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
            title={factsById.get(r)?.label}
          >
            [{r}]
          </button>
        ))}
      </span>
    );
  }

  return (
    <article className="space-y-5">
      {/* Verdict — read top-down, the headline answer comes first, no scrolling needed */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">Verdict</p>
        <p className="mt-1 text-xl font-semibold leading-snug text-slate-900">{thread.verdict}</p>
        {thread.confidenceClass && <div className="mt-2"><ConfidenceBadge confidence={thread.confidenceClass as any} /></div>}
      </div>

      {/* Why */}
      {thread.why.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Why</p>
          <ul className="mt-2 space-y-1.5">
            {thread.why.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                <span>
                  {s.text}
                  {renderRefs(s.refs)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* What to do */}
      {thread.whatToDo.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">What to do</p>
          <ul className="mt-2 space-y-2">
            {thread.whatToDo.map((a, i) => (
              <li key={i} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <span className="text-slate-700">{a.label}</span>
                {a.kind !== "note" && onApproveAction && (
                  <button
                    onClick={() => onApproveAction(a.label)}
                    className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-500"
                  >
                    {a.kind === "approval" ? "Approve" : "Decide"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Evidence appendix */}
      {thread.evidenceAppendix.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Evidence appendix</p>
          <ul className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {thread.evidenceAppendix.map((e) => (
              <li key={e.factId}>
                <button
                  onClick={() => onFootnoteClick(e.factId)}
                  className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-left text-xs text-slate-600 hover:border-indigo-300 hover:bg-indigo-50"
                >
                  [{e.factId}] {e.label} <span className="text-slate-400">→ {e.sourceView}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
