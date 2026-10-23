"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function StartRoundButton({ questionId }: { questionId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function start() {
    setLoading(true);
    await fetch(`/api/collective/questions/${questionId}/delphi`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anonymityMode: "anonymous_delayed" }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <button
      onClick={start}
      disabled={loading}
      className="rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
    >
      {loading ? "Starting…" : "Start next round"}
    </button>
  );
}

export function CloseRoundButton({ roundId }: { roundId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function close() {
    setLoading(true);
    await fetch(`/api/collective/delphi/rounds/${roundId}/close`, { method: "POST" });
    setLoading(false);
    router.refresh();
  }

  return (
    <button
      onClick={close}
      disabled={loading}
      className="rounded-full border border-slate-400 px-3 py-1.5 text-xs font-medium text-slate-800 hover:border-slate-700 disabled:opacity-50"
    >
      {loading ? "Closing…" : "Close round + summarize"}
    </button>
  );
}

export function EstimateForm({ roundId, disabled }: { roundId: string; disabled: boolean }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [anonymousTag, setAnonymousTag] = useState("");
  const [estimate, setEstimate] = useState(50);
  const [rationale, setRationale] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setStatus(null);
    const res = await fetch(`/api/collective/delphi/rounds/${roundId}/estimates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, anonymousTag, estimate: estimate / 100, rationale }),
    });
    setSubmitting(false);
    if (res.ok) {
      setStatus("Estimate recorded (hidden from others until the round closes).");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setStatus(`Error: ${data.error ?? res.statusText}`);
    }
  }

  if (disabled) {
    return <p className="text-xs text-slate-500">This round is closed.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3">
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
          placeholder="Anonymous tag"
          value={anonymousTag}
          onChange={(e) => setAnonymousTag(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <label className="text-xs text-slate-600">
        Your estimate: <span className="font-semibold text-slate-950">{estimate}%</span>
      </label>
      <input type="range" min={1} max={99} value={estimate} onChange={(e) => setEstimate(Number(e.target.value))} />
      <textarea
        placeholder="Rationale (anonymized and sampled back to the panel as controlled feedback)"
        value={rationale}
        onChange={(e) => setRationale(e.target.value)}
        rows={2}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={submitting}
        className="justify-self-start rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Submit estimate"}
      </button>
      {status && <p className="text-xs text-slate-600">{status}</p>}
    </form>
  );
}
