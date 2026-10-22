"use client";

// src/components/adaptation/CognitiveStyleQuestionnaire.tsx
//
// First-run cognitive-style questionnaire. Optional, skippable, and
// revisable at any time from settings. Declared answers seed the style
// profile with a strong prior that behavior can still gradually shift
// (see src/lib/humanNeeds.ts blendStyle).

import { useState } from "react";
import { useAdaptation } from "@/components/adaptation/AdaptationProvider";

interface Props {
  forceOpen?: boolean;
  onClose?: () => void;
}

const QUESTIONS: Array<{ key: "detailVsSummary" | "visualVsTabular" | "deliberativeVsQuick"; left: string; right: string }> = [
  { key: "detailVsSummary", left: "Give me the short summary", right: "Give me the full detail" },
  { key: "visualVsTabular", left: "I prefer tables", right: "I prefer charts/visuals" },
  { key: "deliberativeVsQuick", left: "I decide quickly", right: "I like to deliberate" },
];

export function CognitiveStyleQuestionnaire({ forceOpen, onClose }: Props) {
  const { userId, profile, refreshProfile } = useAdaptation();
  const [answers, setAnswers] = useState<Record<string, number>>({
    detailVsSummary: 0,
    visualVsTabular: 0,
    deliberativeVsQuick: 0,
  });
  const [saving, setSaving] = useState(false);

  const shouldShowFirstRun = !forceOpen && profile ? !profile.profile.onboardingCompleted && !profile.profile.onboardingSkipped : false;
  const visible = forceOpen || shouldShowFirstRun;

  if (!visible) return null;

  const save = async () => {
    setSaving(true);
    try {
      await fetch("/api/adaptation/questionnaire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, answers }),
      });
      await refreshProfile();
      onClose?.();
    } finally {
      setSaving(false);
    }
  };

  const skip = async () => {
    await fetch("/api/adaptation/questionnaire", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, skipped: true }),
    });
    await refreshProfile();
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" data-testid="cognitive-questionnaire">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">Help us tailor how information is shown</h2>
        <p className="mt-1 text-sm text-slate-600">
          This only changes how things look (detail level, charts vs. tables, pacing) — never which facts you see. Skip any time, revise
          later in Settings.
        </p>

        <div className="mt-5 space-y-5">
          {QUESTIONS.map((q) => (
            <div key={q.key}>
              <div className="flex justify-between text-xs text-slate-500">
                <span>{q.left}</span>
                <span>{q.right}</span>
              </div>
              <input
                type="range"
                min={-1}
                max={1}
                step={0.1}
                value={answers[q.key]}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [q.key]: Number(e.target.value) }))}
                className="mt-1 w-full"
                aria-label={`${q.left} vs ${q.right}`}
              />
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={skip} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Skip for now
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save preferences"}
          </button>
        </div>
      </div>
    </div>
  );
}
