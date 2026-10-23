"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Label, buttonClass, inputClass } from "@/components/ui";

export function ObservationForm({ metricId }: { metricId: string }) {
  const router = useRouter();
  const [period, setPeriod] = useState("");
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/metrics/${metricId}/observations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, value: Number(value) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not add observation.");
        return;
      }
      setPeriod("");
      setValue("");
      router.refresh();
    } catch {
      setError("Network error — please retry.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-3 sm:items-end">
      <div>
        <Label htmlFor="obs-period">Period (YYYY-MM-DD)</Label>
        <input id="obs-period" type="date" className={inputClass} value={period} onChange={(e) => setPeriod(e.target.value)} required />
      </div>
      <div>
        <Label htmlFor="obs-value">Value</Label>
        <input id="obs-value" type="number" step="any" className={inputClass} value={value} onChange={(e) => setValue(e.target.value)} required />
      </div>
      <div>
        <button type="submit" className={buttonClass} disabled={submitting}>
          {submitting ? "Saving…" : "Add observation"}
        </button>
      </div>
      {error && <p className="col-span-full text-sm text-rose-600">{error}</p>}
    </form>
  );
}
