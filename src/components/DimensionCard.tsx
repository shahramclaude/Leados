import type { DimensionResult } from "../lib/types";
import { cn } from "../utils/cn";

export function DimensionCard({ d }: { d: DimensionResult }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">{d.name}</p>
        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-mono text-violet-300">
          L{d.score}/5
        </span>
      </div>
      <div className="mt-2 flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={cn("h-1.5 flex-1 rounded-full", i <= d.score ? "bg-violet-500" : "bg-slate-800")}
          />
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-slate-400">{d.label}</p>
      {d.score < 5 && (
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          <span className="font-semibold text-slate-400">Next: </span>
          {d.nextLevel}
        </p>
      )}
    </div>
  );
}
