"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SeedButton() {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState<string>("");
  const router = useRouter();

  async function runSeed() {
    setStatus("loading");
    try {
      const res = await fetch("/api/org-design/seed", { method: "POST" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "seed failed");
      setStatus("done");
      setMessage(`Seeded ${data.result.units.length} org units and demo deal #${data.result.dealId}.`);
      router.refresh();
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
      <p className="m-0 text-sm text-amber-900">
        First time here? Seed the demo org chart, people, support plans, historical moves, and a sample deal.
      </p>
      <button
        onClick={runSeed}
        disabled={status === "loading"}
        className="mt-3 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
      >
        {status === "loading" ? "Seeding…" : "Seed demo data"}
      </button>
      {message && <p className="mt-2 text-sm text-amber-900">{message}</p>}
    </div>
  );
}
