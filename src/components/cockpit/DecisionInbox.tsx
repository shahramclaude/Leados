import type { ApprovalItem } from "../../lib/domainData";

const RISK_STYLE: Record<ApprovalItem["riskClass"], string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-rose-100 text-rose-700",
};

/** Decision/approval inbox (Part 10/23 pattern): rich context (requester,
 * risk class, due date), one-click approve/reject — mirrors
 * `src/lib/kernel/approvals.ts`'s human-in-the-loop queue shape. */
export function DecisionInbox({
  items,
  onDecide,
}: {
  items: ApprovalItem[];
  onDecide: (id: string, decision: "approved" | "rejected") => void;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
        Approval queue is empty — a true zero, not a loading state.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">{item.title}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Requested by {item.requestedBy} · due {item.dueDate}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${RISK_STYLE[item.riskClass]}`}>{item.riskClass} risk</span>
            <button
              onClick={() => onDecide(item.id, "approved")}
              className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
            >
              Approve
            </button>
            <button
              onClick={() => onDecide(item.id, "rejected")}
              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Reject
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
