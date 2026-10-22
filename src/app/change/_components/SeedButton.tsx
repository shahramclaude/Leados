"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SeedButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/change/seed", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setMessage(`Seeded ${data.summary.groups} groups, ${data.summary.people} people, ${data.summary.events} events.`);
        router.refresh();
      } else {
        setMessage(`Seed failed: ${data.error}`);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Seed failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleClick}
        disabled={loading}
        className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {loading ? "Seeding…" : "Seed demo data"}
      </button>
      {message && <span className="text-xs text-slate-600">{message}</span>}
    </div>
  );
}
