"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Label, buttonClass, inputClass } from "@/components/ui";

export function MetricForm() {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, name, unit }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error === "duplicate_key" ? "A metric with that key already exists." : "Could not create metric — check the fields.");
        return;
      }
      setKey("");
      setName("");
      setUnit("");
      router.refresh();
    } catch {
      setError("Network error — please retry.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-4 sm:items-end">
      <div>
        <Label htmlFor="metric-key">Key</Label>
        <input id="metric-key" className={inputClass} placeholder="mrr" value={key} onChange={(e) => setKey(e.target.value)} required />
      </div>
      <div>
        <Label htmlFor="metric-name">Name</Label>
        <input
          id="metric-name"
          className={inputClass}
          placeholder="Monthly Recurring Revenue"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div>
        <Label htmlFor="metric-unit">Unit</Label>
        <input id="metric-unit" className={inputClass} placeholder="USD" value={unit} onChange={(e) => setUnit(e.target.value)} />
      </div>
      <div>
        <button type="submit" className={buttonClass} disabled={submitting}>
          {submitting ? "Adding…" : "Add metric"}
        </button>
      </div>
      {error && <p className="col-span-full text-sm text-rose-600">{error}</p>}
    </form>
  );
}
