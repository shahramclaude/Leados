const LABEL_STYLES: Record<string, string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-sky-100 text-sky-700",
  critical: "bg-emerald-100 text-emerald-700",
};

export function ScoreBadge({ score, label }: { score: number; label: string }) {
  const style = LABEL_STYLES[label] ?? LABEL_STYLES.low;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${style}`}>
      <span>{score}</span>
      <span className="opacity-70">/ 100</span>
      <span className="ml-1 uppercase tracking-wide">{label}</span>
    </span>
  );
}
