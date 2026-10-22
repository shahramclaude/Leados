import { METHOD_BADGE } from "@/lib/global-ops/format";
import type { TranslationMethod } from "@/lib/global-ops/types";

const COLORS: Record<TranslationMethod, string> = {
  closing: "bg-blue-100 text-blue-800",
  average: "bg-amber-100 text-amber-800",
  historical: "bg-purple-100 text-purple-800",
  none: "bg-slate-100 text-slate-600",
};

export default function MethodBadge({ method }: { method: TranslationMethod }) {
  const badge = METHOD_BADGE[method];
  return (
    <span
      title={badge.title}
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${COLORS[method]}`}
    >
      {badge.label}
    </span>
  );
}
