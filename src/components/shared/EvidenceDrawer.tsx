import type { Fact } from "../../lib/citations";
import { ConfidenceBadge } from "./ConfidenceBadge";

export interface EvidenceDrawerProps {
  fact: Fact | null;
  onClose: () => void;
  onJumpToSource: (sourceView: string) => void;
}

const SOURCE_VIEW_LABEL: Record<string, string> = {
  finance: "Finance dashboard",
  strategy: "Strategy / OKR view",
  people: "People dashboard",
  risk: "Risk register",
  operations: "Execution / delivery view",
  market: "Market intelligence",
  inbox: "Approvals inbox",
  decisions: "Decision log",
  audit: "Audit / What-changed log",
};

/** Clicking a footnote anywhere (narrative thread, slide deck, PDF caption
 * text) opens this drawer — "click a footnote -> source view" traceability
 * required by Phase 1's presentation-generation contract. */
export function EvidenceDrawer({ fact, onClose, onJumpToSource }: EvidenceDrawerProps) {
  if (!fact) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30" onClick={onClose}>
      <div
        className="h-full w-full max-w-sm overflow-y-auto bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <p className="text-xs uppercase tracking-wide text-slate-400">Evidence · fact #{fact.id}</p>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
            ✕
          </button>
        </div>
        <h3 className="mt-2 text-lg font-semibold text-slate-900">{fact.label}</h3>
        <p className="mt-1 text-3xl font-bold text-slate-900">{fact.formatted}</p>
        <div className="mt-3">
          <ConfidenceBadge confidence={fact.confidence} />
        </div>
        {fact.interval && (
          <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            Range: {fact.interval.p10.toLocaleString()} (P10) – {fact.interval.p90.toLocaleString()} (P90), median {fact.interval.p50.toLocaleString()} (P50).
            The interval is shown even here, in the shortest possible view of this number.
          </p>
        )}
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between border-b border-slate-100 py-1.5">
            <dt className="text-slate-500">Domain</dt>
            <dd className="font-medium capitalize text-slate-900">{fact.domain}</dd>
          </div>
          <div className="flex justify-between border-b border-slate-100 py-1.5">
            <dt className="text-slate-500">Source view</dt>
            <dd className="font-medium text-slate-900">{SOURCE_VIEW_LABEL[fact.sourceView] ?? fact.sourceView}</dd>
          </div>
        </dl>
        <button
          onClick={() => onJumpToSource(fact.sourceView)}
          className="mt-5 w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
        >
          Jump to {SOURCE_VIEW_LABEL[fact.sourceView] ?? fact.sourceView} →
        </button>
      </div>
    </div>
  );
}
