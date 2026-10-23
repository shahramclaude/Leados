"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ForecastForm({ questionId }: { questionId: string }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [anonymousTag, setAnonymousTag] = useState("");
  const [probability, setProbability] = useState(50);
  const [rationale, setRationale] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setStatus(null);
    const res = await fetch(`/api/collective/questions/${questionId}/forecasts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, anonymousTag, probability: probability / 100, rationale }),
    });
    setSubmitting(false);
    if (res.ok) {
      setStatus("Forecast submitted.");
      setRationale("");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setStatus(`Error: ${data.error ?? res.statusText}`);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 rounded-2xl bg-white p-6 shadow-[0_12px_30px_rgba(16,24,40,0.08)]">
      <h3 className="text-sm font-semibold text-slate-950">Submit your forecast</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          required
          placeholder="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          required
          placeholder="Anonymous tag (e.g. Forecaster-Nova)"
          value={anonymousTag}
          onChange={(e) => setAnonymousTag(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <label className="text-xs text-slate-600">
        Probability of YES: <span className="font-semibold text-slate-950">{probability}%</span>
      </label>
      <input
        type="range"
        min={1}
        max={99}
        value={probability}
        onChange={(e) => setProbability(Number(e.target.value))}
      />
      <textarea
        placeholder="Rationale (shown verbatim if this becomes a minority report)"
        value={rationale}
        onChange={(e) => setRationale(e.target.value)}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        rows={2}
      />
      <button
        type="submit"
        disabled={submitting}
        className="justify-self-start rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Submit forecast"}
      </button>
      {status && <p className="text-xs text-slate-600">{status}</p>}
    </form>
  );
}
