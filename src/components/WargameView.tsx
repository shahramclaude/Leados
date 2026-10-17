import { useMemo, useState } from "react";
import type { AppState } from "../lib/types";
import { toProjection, appendEvent } from "../lib/store";
import { buildCompetitiveLandscape, runScenario } from "../lib/wargame";
import { Card, SectionTitle, Button, Label, Badge, DisclosureNote, EmptyState } from "./ui";
import { fmtDate } from "../lib/format";

export function WargameView({ state, setState }: { state: AppState; setState: (s: AppState) => void }) {
  const today = new Date().toISOString();
  const P = useMemo(() => toProjection(state), [state]);
  const landscape = useMemo(() => buildCompetitiveLandscape(P, today), [P, today]);

  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("");
  const [blueMove, setBlueMove] = useState("");
  const [result, setResult] = useState<ReturnType<typeof runScenario> | null>(null);

  const history = state.events.filter((e) => e.type === "wargame.scenario").sort((a, b) => (a.ts > b.ts ? -1 : 1));

  function run() {
    if (!name || !trigger || !blueMove) return;
    const r = runScenario({ name, trigger, blueMove }, landscape, P, today);
    setResult(r);
  }

  function saveScenario() {
    if (!name || !trigger || !blueMove) return;
    const next = appendEvent(state, "wargame.scenario", { name, trigger, blueMove, turns: 4, outcome: "simulated" });
    setState(next);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Wargame</h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-400">
          Multi-turn simulation: your move → probable competitor responses → customer reaction → decision options.
          Built against {landscape.redTeams.length} tracked competitor(s) and your logged customer intelligence.
        </p>
      </div>

      <Card>
        <SectionTitle>Scenario builder</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <Label>Scenario name</Label>
            <input
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-600"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Respond to a rival price cut"
            />
          </div>
          <div>
            <Label>Trigger / situation</Label>
            <input
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-600"
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
              placeholder="e.g. Competitor X cut entry pricing 15%"
            />
          </div>
          <div>
            <Label>Your move</Label>
            <input
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-600"
              value={blueMove}
              onChange={(e) => setBlueMove(e.target.value)}
              placeholder="e.g. Launch a new product tier"
            />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button onClick={run}>Run wargame</Button>
          <Button variant="secondary" onClick={saveScenario}>
            Save scenario to event log
          </Button>
        </div>
      </Card>

      {result && (
        <Card>
          <SectionTitle sub={result.label}>Turn log — {result.scenario}</SectionTitle>
          <ol className="space-y-3">
            {result.log.map((turn: any, i: number) => (
              <li key={i} className="rounded-lg border border-zinc-800 p-3">
                <div className="mb-1 flex items-center gap-2 text-xs">
                  <Badge>{`turn ${turn.turn}`}</Badge>
                  <Badge tone={actorTone(turn.actor)}>{turn.actor}</Badge>
                </div>
                <p className="text-sm text-zinc-200">{turn.action}</p>
                {turn.rationale && <p className="mt-1 text-xs text-zinc-500">{turn.rationale}</p>}
                {turn.probability !== undefined && <p className="mt-1 text-xs text-zinc-500">probability: {Math.round(turn.probability * 100)}%</p>}
                {turn.sentiment && <p className="mt-1 text-xs text-zinc-500">sentiment: {turn.sentiment}</p>}
                {turn.analysis && (
                  <div className="mt-2 rounded-md bg-zinc-950/60 p-2 text-xs text-zinc-400">
                    internal readiness: <span className="font-medium text-zinc-200">{turn.analysis.internalReadiness}</span>
                    {turn.analysis.vulnerabilitiesDuringMove.length > 0 && (
                      <ul className="mt-1 list-inside list-disc">
                        {turn.analysis.vulnerabilitiesDuringMove.map((v: string, j: number) => (
                          <li key={j}>{v}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {turn.options && (
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {turn.options.map((o: any) => (
                      <div key={o.option} className="rounded-md border border-zinc-800 p-2">
                        <div className="text-xs font-semibold text-violet-300">{o.option}</div>
                        <div className="mt-0.5 text-xs text-zinc-400">{o.description}</div>
                        <div className="mt-1 text-[11px] text-zinc-500">risk: {o.risk}</div>
                        <div className="text-[11px] text-zinc-500">enabler: {o.enabler}</div>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ol>
          <div className="mt-4 rounded-lg border border-violet-900/50 bg-violet-950/20 p-3">
            <div className="text-sm font-medium text-violet-200">{result.verdict.summary}</div>
            <div className="mt-1 text-xs text-violet-300/80">{result.verdict.keyRisk}</div>
          </div>
        </Card>
      )}

      <div>
        <SectionTitle>Saved scenarios</SectionTitle>
        {history.length === 0 ? (
          <EmptyState>No wargame.scenario events logged yet.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {history.map((h) => (
              <li key={h.id} className="rounded-lg border border-zinc-800 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-zinc-100">{h.data.name}</span>
                  <span className="text-xs text-zinc-500">{fmtDate(h.ts)}</span>
                </div>
                <div className="mt-1 text-xs text-zinc-400">trigger: {h.data.trigger}</div>
                <div className="text-xs text-zinc-400">move: {h.data.blueMove}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <DisclosureNote>
        Every "RED" turn is a probability estimate from a small, hand-authored response matrix keyed on each
        competitor's dominant logged move category — it is not a prediction and not based on any non-public
        information. The simulation requires at least a few competitor.logged and customer.pain / win.loss.logged
        events to produce anything other than the BLUE and decision-point turns.
      </DisclosureNote>
    </div>
  );
}

function actorTone(actor: string): any {
  if (actor === "BLUE") return "sky";
  if (actor?.startsWith("RED")) return "red";
  if (actor === "GREEN") return "emerald";
  if (actor === "SITUATION") return "amber";
  return "zinc";
}
