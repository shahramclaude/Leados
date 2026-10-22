import { useMemo, useState } from "react";
import { SEED_SCENARIOS } from "../../lib/scenarios/strategicScenarios";
import { generateAfterActionReview, type AfterActionReview } from "../../lib/wargame/afterAction";
import { getScopedView, readScopedField, RoleScopeViolation, runWarGame, type WarGameResult } from "../../lib/wargame/engine";
import { ROLE_DEFINITIONS, getRole, type RoleId } from "../../lib/wargame/roles";
import { createTwin } from "../../lib/twin/twinEngine";
import { PossibilityBanner } from "./PossibilityBanner";
import { Card, Pill, SectionHeading, StatTile } from "./ui";

const PHASE_TONE: Record<string, "slate" | "indigo" | "emerald" | "amber"> = {
  observe: "slate",
  decide: "indigo",
  act: "amber",
  resolve: "emerald",
};

export function WarRoom() {
  const [scenarioId, setScenarioId] = useState(SEED_SCENARIOS[0].id);
  const [activeRoles, setActiveRoles] = useState<RoleId[]>(ROLE_DEFINITIONS.map((r) => r.id));
  const [turns, setTurns] = useState(4);
  const [seed, setSeed] = useState(1337);
  const [result, setResult] = useState<WarGameResult | null>(null);
  const [review, setReview] = useState<AfterActionReview | null>(null);
  const [scopeTestOutcome, setScopeTestOutcome] = useState<string | null>(null);

  const scenario = useMemo(() => SEED_SCENARIOS.find((s) => s.id === scenarioId)!, [scenarioId]);

  function toggleRole(id: RoleId) {
    setActiveRoles((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  }

  function runGame() {
    const r = runWarGame(scenario, activeRoles, turns, seed);
    setResult(r);
    setReview(generateAfterActionReview(r));
  }

  function runScopeSelfTest() {
    const state = createTwin(scenario.twinConfig);
    const regulator = getRole("regulator");
    const view = getScopedView(regulator, state, scenario, 1);
    try {
      // Regulator's knowledge scope never includes cash runway — this must throw.
      readScopedField(view, "cashRunwayMonths");
      setScopeTestOutcome("UNEXPECTED: out-of-scope read was not blocked.");
    } catch (err) {
      if (err instanceof RoleScopeViolation) {
        setScopeTestOutcome(`Blocked as expected: ${err.message}`);
      } else {
        setScopeTestOutcome(`Unexpected error type: ${String(err)}`);
      }
    }
  }

  return (
    <div className="space-y-6">
      <PossibilityBanner authoredAt="2026-03-06T10:00:00.000Z" authoredBy="war-room" extra="Role moves below come from deterministic rule-based stand-ins scoped to each role's knowledge — not omniscient AI players." />

      <Card>
        <SectionHeading title="Set up the game" subtitle="Each role only ever sees its declared knowledge scope." />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Scenario</span>
            <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={scenarioId} onChange={(e) => setScenarioId(e.target.value)}>
              {SEED_SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Turns</span>
              <input type="number" min={1} max={10} value={turns} onChange={(e) => setTurns(Number(e.target.value))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Seed</span>
              <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </label>
          </div>
        </div>

        <div className="mt-4">
          <span className="mb-1 block text-sm font-medium text-slate-700">Roles in play</span>
          <div className="flex flex-wrap gap-2">
            {ROLE_DEFINITIONS.map((role) => (
              <button
                key={role.id}
                onClick={() => toggleRole(role.id)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  activeRoles.includes(role.id) ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-400"
                }`}
              >
                {role.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button onClick={runGame} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-500">
            Run war-game
          </button>
          <button onClick={runScopeSelfTest} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Run role-scoping self-test
          </button>
        </div>
        {scopeTestOutcome ? (
          <p className={`mt-2 text-xs font-medium ${scopeTestOutcome.startsWith("Blocked") ? "text-emerald-700" : "text-rose-700"}`}>{scopeTestOutcome}</p>
        ) : null}
      </Card>

      {result ? (
        <Card>
          <SectionHeading title="Event log" subtitle={`Scenario: ${scenario.name} · seed ${result.seed} · ${result.turns} turn(s)`} />
          <div className="max-h-96 space-y-1 overflow-y-auto pr-1">
            {result.events.map((event, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg border border-slate-100 px-2 py-1.5 text-xs">
                <span className="w-10 shrink-0 font-mono text-slate-400">T{event.turn}</span>
                <Pill tone={PHASE_TONE[event.phase]}>{event.phase}</Pill>
                <span className="w-24 shrink-0 font-medium text-slate-600">{event.roleId}</span>
                <span className="text-slate-700">{event.description}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {review ? (
        <Card>
          <SectionHeading title="After-action review (auto-generated)" subtitle={`Generated ${new Date(review.generatedAt).toLocaleString()}`} />
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {review.metricDeltas.map((m) => (
              <StatTile key={m.metric} label={m.metric} value={`${m.delta >= 0 ? "+" : ""}${m.delta.toFixed(3)}`} hint={`${m.start.toFixed(2)} → ${m.end.toFixed(2)}`} />
            ))}
          </div>
          <div className="mb-4 space-y-2">
            {review.roleSummaries.map((rs) => (
              <div key={rs.roleId} className="rounded-lg border border-slate-100 p-2 text-xs">
                <div className="mb-1 font-semibold text-slate-700">
                  {getRole(rs.roleId).label} — {rs.activeMoves}/{rs.totalMoves} active move(s)
                </div>
                <div className="text-slate-500">{rs.actions.join(" · ")}</div>
              </div>
            ))}
          </div>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            {review.narrative.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
