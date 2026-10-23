import type { DailyDecisionLoad } from "@/lib/leaderState/decisionLoad";

export function DecisionLoadChart({ dailyLoad }: { dailyLoad: DailyDecisionLoad[] }) {
  if (dailyLoad.length === 0) {
    return <p className="text-sm text-slate-500">No logged decisions yet — this chart fills in as you log them.</p>;
  }

  const recent = dailyLoad.slice(-14);
  const max = Math.max(1, ...recent.map((d) => d.combinedLoadScore));

  return (
    <div>
      <div className="flex h-36 items-end gap-1.5">
        {recent.map((d) => {
          const heightPct = Math.max(4, Math.round((d.combinedLoadScore / max) * 100));
          return (
            <div key={d.date} className="group relative flex-1">
              <div
                className="w-full rounded-t-sm bg-indigo-400 transition group-hover:bg-indigo-600"
                style={{ height: `${heightPct}%` }}
                title={`${d.date}: load ${d.combinedLoadScore}, ${d.decisionCount} decision(s)`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-400">
        <span>{recent[0]?.date}</span>
        <span>{recent[recent.length - 1]?.date}</span>
      </div>
    </div>
  );
}
