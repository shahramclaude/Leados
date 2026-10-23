"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function TradeForm({ questionId }: { questionId: string }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [anonymousTag, setAnonymousTag] = useState("");
  const [side, setSide] = useState<"YES" | "NO">("YES");
  const [shares, setShares] = useState(10);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setStatus(null);
    const res = await fetch(`/api/collective/questions/${questionId}/market`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, anonymousTag, side, shares }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (res.ok) {
      setStatus(
        `Trade executed at cost ${Number(data.trade.cost).toFixed(2)} play-money.${
          data.flags.length ? ` ⚠ Flagged: ${data.flags.join(", ")}` : ""
        }`,
      );
      router.refresh();
    } else {
      setStatus(`Rejected: ${data.reason ?? data.error}`);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 rounded-2xl bg-white p-6 shadow-[0_12px_30px_rgba(16,24,40,0.08)]">
      <h3 className="text-sm font-semibold text-slate-950">Trade (play money)</h3>
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
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" checked={side === "YES"} onChange={() => setSide("YES")} /> YES
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" checked={side === "NO"} onChange={() => setSide("NO")} /> NO
        </label>
        <input
          type="number"
          min={1}
          value={shares}
          onChange={(e) => setShares(Number(e.target.value))}
          className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <span className="text-xs text-slate-500">shares</span>
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="justify-self-start rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {submitting ? "Trading…" : "Place trade"}
      </button>
      {status && <p className="text-xs text-slate-600">{status}</p>}
    </form>
  );
}
