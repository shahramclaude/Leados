import { useState } from "react";
import { Card } from "./Card";
import { getProfileForDate } from "../lib/circadian";
import { DECISION_WEIGHTS, levelFor, fatigueAdjustedConfidence } from "../lib/fatigue";
import { vibrate, tone, PATTERNS } from "../lib/sensory";
import type { DecisionType } from "../lib/types";

export function EnergyView({
  sessionFatigue,
  onRecordDecision,
  onLogEnergy,
}: {
  sessionFatigue: number;
  onRecordDecision: (type: DecisionType) => void;
  onLogEnergy: (level: number, note: string) => void;
}) {
  const [level, setLevel] = useState(6);
  const [note, setNote] = useState("");
  const [confidence, setConfidence] = useState(0.8);
  const profile = getProfileForDate();
  const fatigueLevel = levelFor(sessionFatigue);
  const adjusted = fatigueAdjustedConfidence(confidence, sessionFatigue);

  const fatigueColor =
    fatigueLevel === "CRITICAL" ? "bg-red-500" : fatigueLevel === "HIGH" ? "bg-orange-500" : fatigueLevel === "MODERATE" ? "bg-amber-400" : "bg-emerald-500";

  return (
    <div className="space-y-6">
      <Card title="Session decision fatigue (resets each session — heuristic, not clinical)">
        <div className="mb-2 flex items-center gap-3">
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full ${fatigueColor} transition-all`} style={{ width: `${sessionFatigue}%` }} />
          </div>
          <span className="font-mono text-sm">{sessionFatigue}/100</span>
          <span className="rounded-full border px-2 py-0.5 text-xs font-medium">{fatigueLevel}</span>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          Each logged decision type adds a different illustrative weight (termination-prep highest at{" "}
          {DECISION_WEIGHTS["termination-prep"]}, vendor lowest among weighted types at {DECISION_WEIGHTS.vendor}).
        </p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(DECISION_WEIGHTS) as DecisionType[]).map((t) => (
            <button
              key={t}
              onClick={() => onRecordDecision(t)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              log "{t}" (+{DECISION_WEIGHTS[t]})
            </button>
          ))}
        </div>

        <div className="mt-5 rounded-lg bg-slate-50 p-4">
          <div className="mb-2 text-sm font-medium text-slate-700">Fatigue-adjusted confidence demo</div>
          <label className="flex items-center gap-3 text-sm">
            Stated confidence
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={confidence}
              onChange={(e) => setConfidence(Number(e.target.value))}
            />
            <span className="font-mono">{confidence.toFixed(2)}</span>
          </label>
          <p className="mt-2 text-sm">
            Adjusted for current session fatigue: <span className="font-mono font-semibold">{adjusted}</span>
          </p>
          <p className="mt-1 text-xs text-slate-400">Illustrative linear decay only — not a validated psychometric model.</p>
        </div>
      </Card>

      <Card title="Circadian profile (heuristic — see About for sourcing caveats)">
        <div className="text-sm text-slate-700">
          Current phase: <span className="font-semibold">{profile.label}</span>
        </div>
        <p className="mt-1 text-sm text-slate-500">{profile.note}</p>
      </Card>

      <Card title="Log energy">
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-sm">
            Energy level (1–10)
            <input
              type="range"
              min={1}
              max={10}
              value={level}
              onChange={(e) => setLevel(Number(e.target.value))}
              className="mt-1 block"
            />
            <span className="font-mono text-xs">{level}</span>
          </label>
          <input
            className="flex-1 min-w-[200px] rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="optional note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button
            onClick={() => {
              onLogEnergy(level, note);
              setNote("");
            }}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Log (auto-tags phase: {profile.phase})
          </button>
        </div>
      </Card>

      <Card title="Sensory feedback (real browser APIs — feature-detected, not faked)">
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => {
              const ok = vibrate(PATTERNS.SUCCESS);
              tone(660, 0.1);
              if (!ok) announceUnsupported();
            }}
            className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 hover:bg-emerald-100"
          >
            ✅ Success pulse
          </button>
          <button
            onClick={() => {
              vibrate(PATTERNS.WARNING);
              tone(330, 0.18);
            }}
            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 hover:bg-amber-100"
          >
            ⚠️ Warning pulse
          </button>
          <button
            onClick={() => {
              vibrate(PATTERNS.CRITICAL);
              tone(220, 0.25);
            }}
            className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 hover:bg-red-100"
          >
            🛑 Critical pulse
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          navigator.vibrate() only works on some Android/Chrome contexts — it silently no-ops elsewhere (iOS Safari,
          desktop). Tones use the Web Audio API and should work in any modern browser after a user gesture.
        </p>
      </Card>
    </div>
  );
}

function announceUnsupported() {
  // No-op beyond the disclosure text in the UI; vibration support cannot be
  // assumed, so we avoid claiming success the API itself didn't confirm.
}
