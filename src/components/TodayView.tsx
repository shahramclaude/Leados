import { useMemo } from "react";
import type { AppState } from "../lib/types";
import { toProjection } from "../lib/store";
import * as engine from "../lib/engine";
import { buildCompetitiveLandscape } from "../lib/wargame";
import { Card, SectionTitle, Stat, SevBadge, DisclosureNote, Badge } from "./ui";
import { fmtMoney, fmtPct, fmtDate } from "../lib/format";

export function TodayView({ state, navigate }: { state: AppState; navigate: (r: string) => void }) {
  const today = new Date().toISOString();
  const P = useMemo(() => toProjection(state), [state]);
  const { findings } = useMemo(() => engine.run(P, today), [P, today]);
  const landscape = useMemo(() => buildCompetitiveLandscape(P, today), [P, today]);

  const runway = landscape.blueTeam.capabilities.runway;
  const activeFindings = findings.filter((f) => f.sev >= 3);
  const recentSignals = state.events
    .filter((e) => e.type === "intel.signal")
    .sort((a, b) => (a.ts > b.ts ? -1 : 1))
    .slice(0, 4);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Today</h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-400">
          Organizational snapshot computed from {state.events.length} logged events. No market data, no external
          feeds — everything below is derived from the event log you control.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Runway" value={typeof runway === "number" ? `${runway.toFixed(1)}mo` : "—"} />
        <Stat label="Headcount" value={landscape.blueTeam.capabilities.headcount} />
        <Stat label="Open findings (sev≥3)" value={activeFindings.length} />
        <Stat label="Win rate (90d)" value={fmtPct(landscape.blueTeam.capabilities.winRate)} />
        <Stat label="Pipeline value" value={fmtMoney(landscape.blueTeam.capabilities.pipelineValue)} />
        <Stat label="Competitors tracked" value={landscape.redTeams.length} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle sub="Rule-based, sev≥3, sorted by severity. Original heuristics — see About / Provenance.">
            Active findings
          </SectionTitle>
          {activeFindings.length === 0 ? (
            <p className="text-sm text-zinc-500">No findings at or above severity 3 in the current event log.</p>
          ) : (
            <ul className="space-y-2">
              {activeFindings.map((f) => (
                <li key={f.id} className="flex items-start justify-between gap-3 rounded-lg border border-zinc-800 p-3">
                  <div>
                    <div className="text-sm font-medium text-zinc-100">{f.title}</div>
                    <div className="mt-0.5 text-xs text-zinc-500">{f.detail}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge>{f.domain}</Badge>
                    <SevBadge sev={f.sev} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4">
            <button onClick={() => navigate("/wargame")} className="text-sm font-medium text-violet-400 hover:text-violet-300">
              Run a wargame against one of these findings →
            </button>
          </div>
        </Card>

        <Card>
          <SectionTitle>Recent intelligence signals</SectionTitle>
          {recentSignals.length === 0 ? (
            <p className="text-sm text-zinc-500">No intel.signal events logged yet.</p>
          ) : (
            <ul className="space-y-3">
              {recentSignals.map((s) => (
                <li key={s.id} className="rounded-lg border border-zinc-800 p-3">
                  <div className="flex items-center justify-between">
                    <Badge tone="sky">{s.data.type}</Badge>
                    <span className="text-xs text-zinc-500">{fmtDate(s.ts)}</span>
                  </div>
                  <p className="mt-2 text-sm text-zinc-300">{s.data.content}</p>
                  <p className="mt-1 text-xs text-zinc-500">source: {s.data.source || "—"}</p>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4">
            <button onClick={() => navigate("/log")} className="text-sm font-medium text-violet-400 hover:text-violet-300">
              Log new intelligence →
            </button>
          </div>
        </Card>
      </div>

      <DisclosureNote>
        Headline numbers above (runway, win rate, pipeline, findings) are computed with original heuristics written for
        this build (e.g. "win rate below 40% in 90d → finding"). These thresholds are illustrative conventions, not
        validated benchmarks — adjust your own judgment accordingly.
      </DisclosureNote>
    </div>
  );
}
