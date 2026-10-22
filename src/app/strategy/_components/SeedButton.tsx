"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SeedButton({ objectiveCount = 24 }: { objectiveCount?: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/strategy/seed", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objectiveCount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "seed failed");
      setMessage(`Seeded ${data.objectives} objectives, ${data.initiatives} initiatives.`);
      router.refresh();
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
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {loading ? "Seeding…" : "Seed demo data"}
      </button>
      {message && <span className="text-sm text-slate-600">{message}</span>}
    </div>
  );
}
