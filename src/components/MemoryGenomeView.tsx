import { Card } from "./Card";
import { computeTemporalPatterns, splitLayers } from "../lib/memory";
import { identify } from "../lib/genome";
import type { AppEvent } from "../lib/types";

export function MemoryGenomeView({
  events,
  sessionStartedAt,
  plans,
  directs,
}: {
  events: AppEvent[];
  sessionStartedAt: string;
  plans: number;
  directs: number;
}) {
  const { shortTerm, longTerm } = splitLayers(events, sessionStartedAt);
  const pattern = computeTemporalPatterns(longTerm);
  const genome = identify(plans, directs);
  const maxCount = Math.max(1, ...pattern.countsByHour);

  return (
    <div className="space-y-6">
      <Card title="Memory layers">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">Short-term (this session)</div>
            <div className="text-2xl font-semibold">{shortTerm.length}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">Long-term (all localStorage history)</div>
            <div className="text-2xl font-semibold">{longTerm.length}</div>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          "Short-term" = events with a timestamp at/after this session started. "Long-term" = everything ever
          persisted to localStorage on this device/browser. Simple partitioning, not a cognitive model.
        </p>
      </Card>

      <Card title={`Temporal pattern — activity by hour of day (peak hour: ${pattern.peakHour}:00)`}>
        <div className="flex h-28 items-end gap-0.5">
          {pattern.countsByHour.map((c, h) => (
            <div key={h} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-violet-400"
                style={{ height: `${(c / maxCount) * 100}%`, minHeight: c > 0 ? "2px" : "0" }}
                title={`${h}:00 — ${c} events`}
              />
              {h % 4 === 0 && <span className="text-[8px] text-slate-400">{h}</span>}
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-400">Plain frequency count by hour — not a learned or predictive model.</p>
      </Card>

      <Card title="Organizational genome (behavioral heuristic — not a psychological assessment)">
        <div className="flex flex-wrap items-center gap-6">
          <div className="rounded-lg bg-slate-900 px-4 py-3 text-white">
            <div className="text-[11px] uppercase tracking-wide text-slate-400">Current label</div>
            <div className="text-xl font-semibold">{genome.name}</div>
          </div>
          <div className="text-sm text-slate-600">
            <div>
              plans: <span className="font-mono">{genome.plans}</span> &nbsp;·&nbsp; directs:{" "}
              <span className="font-mono">{genome.directs}</span> &nbsp;·&nbsp; ratio:{" "}
              <span className="font-mono">{genome.ratio}</span>
            </div>
            <div>
              sample confidence: <span className="font-mono">{genome.confidence}</span>{" "}
              {genome.confidence === "low" && "(fewer than 10 logged entries)"}
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">{genome.note}</p>
        <p className="mt-1 text-xs text-slate-400">
          Log entries from the "Quick behavioral log" on the Today tab to change this.
        </p>
      </Card>
    </div>
  );
}
