"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SeedButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSeed() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/collective/seed", { method: "POST" });
      const data = await res.json();
      if (data.seeded) {
        setMessage("Demo data seeded — including a flagged market-manipulation attempt.");
        router.refresh();
      } else {
        setMessage(`Seed failed: ${data.error}`);
      }
    } catch (err) {
      setMessage(`Seed failed: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        onClick={handleSeed}
        disabled={loading}
        className="rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
      >
        {loading ? "Seeding…" : "Seed demo data"}
      </button>
      {message && <p className="text-xs text-slate-600">{message}</p>}
    </div>
  );
}
