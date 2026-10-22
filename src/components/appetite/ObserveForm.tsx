"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function ObserveForm({ metricId, unit }: { metricId: number; unit: string }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/appetite/${metricId}/observe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: Number(value), actor: "risk-analyst" }),
    });
    const data = await res.json();
    if (data.error) {
      setMessage(data.error);
      return;
    }
    setMessage(`Recorded: status ${data.status}${data.findingId ? `, finding #${data.findingId} raised` : ""}`);
    setValue("");
    startTransition(() => router.refresh());
  }

  return (
    <form onSubmit={submit} className="mt-3 flex items-center gap-2">
      <input
        type="number"
        step="any"
        required
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={`value (${unit})`}
        className="w-36 rounded-lg border border-slate-300 px-2 py-1 text-sm"
      />
      <button type="submit" disabled={pending} className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
        Record observation
      </button>
      {message && <span className="text-xs text-slate-600">{message}</span>}
    </form>
  );
}
