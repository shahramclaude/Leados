import type { QuestionDef } from "../../lib/questionOntology";
import type { AnswerResult } from "../../lib/types";
import { isAnswerable } from "../../lib/types";
import { ConfidenceBadge } from "../shared/ConfidenceBadge";
import { cn } from "../../utils/cn";

const ICON_BY_ID: Record<string, string> = {
  "ops.needsMeToday": "📥",
  "ops.whatChanged": "🔔",
  "finance.onPlan": "📊",
  "risk.topRisk": "🛡️",
  "strategy.recentDecisions": "🧭",
};

export function QuestionCard({ question, answer, active, onClick }: { question: QuestionDef; answer: AnswerResult; active: boolean; onClick: () => void }) {
  const answerable = isAnswerable(answer);
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex h-full flex-col justify-between rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
        active ? "border-indigo-400 ring-2 ring-indigo-200" : "border-slate-200",
      )}
    >
      <div>
        <div className="flex items-center justify-between">
          <span className="text-2xl">{ICON_BY_ID[question.id] ?? "❓"}</span>
          {answerable && <ConfidenceBadge confidence={answer.confidenceClass} compact />}
        </div>
        <p className="mt-3 text-sm font-semibold text-slate-900">{question.text}</p>
        <p className="mt-1 line-clamp-2 text-xs text-slate-500">
          {answerable ? answer.headline : `Not answerable yet — ${answer.reason}`}
        </p>
      </div>
      <p className="mt-3 text-[11px] font-medium text-indigo-600">1 click → full narrative →</p>
    </button>
  );
}
