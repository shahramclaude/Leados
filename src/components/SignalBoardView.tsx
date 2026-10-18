import { RULES } from "../lib/rules";
import { moodTrendFor } from "../lib/engine";
import { syntheticGoalHitRate } from "../lib/seed";
import type { AppState, ManualEvidenceState, MoodScenario, RuleId } from "../lib/types";
import { Badge, Card, Toggle } from "./ui";

const MANUAL_EVIDENCE_META: {
  key: keyof ManualEvidenceState;
  label: string;
  hypothesis: string;
  ratio: string;
}[] = [
  { key: "comp.at_market", label: "Compensation at/above market", hypothesis: "attrition.next60d", ratio: "0.6×" },
  { key: "promotion.recent", label: "Recent promotion", hypothesis: "attrition.next60d", ratio: "0.4×" },
  { key: "pipeline.shrinking", label: "Pipeline shrinking", hypothesis: "revenue.miss.next_quarter", ratio: "3.0×" },
  { key: "nps.high", label: "NPS is high", hypothesis: "revenue.miss.next_quarter", ratio: "0.7×" },
  { key: "velocity.stable", label: "Execution velocity stable", hypothesis: "okr.on_track", ratio: "1.8×" },
];

export function SignalBoardView({
  state,
  onChange,
}: {
  state: AppState;
  onChange: (next: AppState) => void;
}) {
  const moodTrend = moodTrendFor(state);

  const toggleRule = (id: RuleId) => {
    onChange({ ...state, ruleFlags: { ...state.ruleFlags, [id]: !state.ruleFlags[id] } });
  };

  const setMood = (m: MoodScenario) => onChange({ ...state, moodScenario: m });

  const toggleManual = (key: keyof ManualEvidenceState) => {
    onChange({
      ...state,
      manualEvidence: { ...state.manualEvidence, [key]: !state.manualEvidence[key] },
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-lg font-semibold text-white">Signal Board</h2>
        <p className="mt-1 text-sm text-slate-400">
          Toggle synthetic findings on/off to simulate evidence arriving. Rule IDs are reused from the
          task's pasted brief so its own named evidence-mapping logic is directly explorable — titles and
          descriptions are invented for this build.
        </p>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-white">Rule-derived findings (auto-mapped to evidence)</h3>
        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {RULES.map((rule) => (
            <Toggle
              key={rule.id}
              checked={state.ruleFlags[rule.id]}
              onChange={() => toggleRule(rule.id)}
              label={`${rule.id} · ${rule.title}`}
              sub={rule.description}
            />
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-white">Team mood trajectory (8 synthetic pulses)</h3>
        <p className="mt-1 text-xs text-slate-500">
          Feeds the <code>mood.declining</code> evidence signal when the regression slope is below -0.1 —
          this mirrors the pasted brief's reference to a <code>flightRisk._computeTrend</code> helper that
          was not found anywhere in the real repo, so it is implemented fresh here (see About tab).
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["declining", "stable", "improving"] as MoodScenario[]).map((m) => (
            <button
              key={m}
              onClick={() => setMood(m)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                state.moodScenario === m
                  ? "border-indigo-400/40 bg-indigo-500/15 text-indigo-200"
                  : "border-white/10 bg-white/[0.02] text-slate-400 hover:bg-white/5"
              }`}
            >
              {m}
            </button>
          ))}
          <Badge tone={moodTrend < -0.1 ? "bad" : moodTrend > 0.1 ? "good" : "neutral"}>
            slope {moodTrend.toFixed(2)} {moodTrend < -0.1 ? "(declining — evidence active)" : ""}
          </Badge>
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-white">Goal / OKR hit rate</h3>
        <p className="mt-1 text-xs text-slate-500">
          Feeds <code>goal_hit_rate.high</code> when above 70%. Synthetic mode derives from a fixed
          10-goal ledger ({Math.round(syntheticGoalHitRate() * 100)}% achieved); manual mode lets you
          explore other values directly.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-lg border border-white/10 bg-white/[0.02] p-1">
            {(["synthetic", "manual"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => onChange({ ...state, goalHitRateMode: mode })}
                className={`rounded-md px-2.5 py-1 text-xs capitalize ${
                  state.goalHitRateMode === mode
                    ? "bg-indigo-500 text-white"
                    : "text-slate-400 hover:bg-white/5"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
          <input
            type="range"
            min={0}
            max={100}
            disabled={state.goalHitRateMode === "synthetic"}
            value={Math.round(
              (state.goalHitRateMode === "synthetic" ? syntheticGoalHitRate() : state.goalHitRateManual) * 100
            )}
            onChange={(e) => onChange({ ...state, goalHitRateManual: Number(e.target.value) / 100 })}
            className="h-1.5 w-48 accent-indigo-500 disabled:opacity-40"
          />
          <span className="text-sm font-semibold tabular-nums text-white">
            {Math.round(
              (state.goalHitRateMode === "synthetic" ? syntheticGoalHitRate() : state.goalHitRateManual) * 100
            )}
            %
          </span>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Manual-only evidence</h3>
          <Badge tone="warn">disclosed gap</Badge>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          These five likelihood ratios are defined in the pasted brief's <code>LIKELIHOODS</code> table but
          its own <code>_extractEvidenceSignals()</code> never emits any of them — they are dead code in the
          source spec. Rather than silently wiring them into the automatic rules above (which would
          misattribute a connection the brief never made), they're exposed here as explicit manual toggles.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {MANUAL_EVIDENCE_META.map((m) => (
            <Toggle
              key={m.key}
              checked={state.manualEvidence[m.key]}
              onChange={() => toggleManual(m.key)}
              label={`${m.label} (${m.ratio})`}
              sub={`affects ${m.hypothesis}`}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}
