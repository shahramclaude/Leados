"use client";

import { useState } from "react";
import { DEMO_USER_ID } from "@/lib/leaderState/demo";

const SCALE_OPTIONS = [1, 2, 3, 4, 5];
const REVERSIBILITY_OPTIONS = [
  { value: "reversible", label: "Reversible" },
  { value: "costly-to-reverse", label: "Costly to reverse" },
  { value: "irreversible", label: "Irreversible" },
];

export function DecisionLogForm() {
  const [stakes, setStakes] = useState(3);
  const [timePressure, setTimePressure] = useState(3);
  const [informationCompleteness, setInformationCompleteness] = useState(3);
  const [clarity, setClarity] = useState(3);
  const [reversibility, setReversibility] = useState("reversible");
  const [selfRatedQuality, setSelfRatedQuality] = useState<number | "">("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    try {
      const res = await fetch("/api/leader-state/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": DEMO_USER_ID },
        body: JSON.stringify({
          stakes,
          timePressure,
          informationCompleteness,
          clarity,
          reversibility,
          selfRatedQuality: selfRatedQuality === "" ? null : selfRatedQuality,
          category: category || undefined,
        }),
      });
      if (!res.ok) throw new Error("failed");
      setStatus("saved");
      setCategory("");
      setSelfRatedQuality("");
    } catch {
      setStatus("error");
    }
  }

  function scaleField(label: string, value: number, onChange: (v: number) => void) {
    return (
      <label className="flex items-center justify-between gap-3 text-sm text-slate-700">
        <span>{label}</span>
        <select
          className="rounded border border-slate-300 px-2 py-1"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        >
          {SCALE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="m-0 text-sm font-semibold text-slate-900">Log a decision</h3>
      <p className="m-0 text-xs text-slate-500">
        Private to you. Rating self-perceived quality later (after you see how it played out) is optional
        but is what powers the decision-window suggestion.
      </p>
      <label className="flex items-center justify-between gap-3 text-sm text-slate-700">
        <span>Category (optional)</span>
        <input
          className="rounded border border-slate-300 px-2 py-1"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="e.g. hiring"
        />
      </label>
      {scaleField("Stakes (1–5)", stakes, setStakes)}
      {scaleField("Time pressure (1–5)", timePressure, setTimePressure)}
      {scaleField("Information completeness (1–5)", informationCompleteness, setInformationCompleteness)}
      {scaleField("Clarity of criteria (1–5)", clarity, setClarity)}
      <label className="flex items-center justify-between gap-3 text-sm text-slate-700">
        <span>Reversibility</span>
        <select
          className="rounded border border-slate-300 px-2 py-1"
          value={reversibility}
          onChange={(e) => setReversibility(e.target.value)}
        >
          {REVERSIBILITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center justify-between gap-3 text-sm text-slate-700">
        <span>Self-rated quality, optional (1–5)</span>
        <select
          className="rounded border border-slate-300 px-2 py-1"
          value={selfRatedQuality}
          onChange={(e) => setSelfRatedQuality(e.target.value === "" ? "" : Number(e.target.value))}
        >
          <option value="">—</option>
          {SCALE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={status === "saving"}
        className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {status === "saving" ? "Saving…" : "Log decision"}
      </button>
      {status === "saved" ? <p className="m-0 text-xs text-emerald-700">Saved — only you can see this.</p> : null}
      {status === "error" ? <p className="m-0 text-xs text-red-700">Something went wrong. Try again.</p> : null}
    </form>
  );
}
