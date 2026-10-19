import type { RetentionRisk } from "@/lib/peopleIntelligence";

const STYLES: Record<RetentionRisk, { bg: string; text: string; label: string }> = {
  low: { bg: "bg-emerald-500/15", text: "text-emerald-300", label: "Low" },
  medium: { bg: "bg-amber-500/15", text: "text-amber-300", label: "Medium" },
  high: { bg: "bg-orange-500/15", text: "text-orange-300", label: "High" },
  critical: { bg: "bg-rose-500/15", text: "text-rose-300", label: "Critical" },
};

export default function RetentionRiskBadge({ risk }: { risk: RetentionRisk }) {
  const style = STYLES[risk];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}
    >
      {style.label} retention risk
    </span>
  );
}
