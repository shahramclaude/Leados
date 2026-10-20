"use client";

// Dev convenience: (re)generate demo signals through the real notification +
// attention pipeline so the cockpit has something to show. Not part of the
// production surface area, just the fastest way to demonstrate Part 8.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function SeedControls() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  const seed = async () => {
    setMessage(null);
    const res = await fetch("/api/dev/seed", { method: "POST" });
    const data = await res.json();
    setMessage(res.ok ? "Seeded demo findings, approvals, tasks & anomalies." : data.error ?? "Seed failed");
    startTransition(() => router.refresh());
  };

  const reset = async () => {
    setMessage(null);
    await fetch("/api/dev/seed", { method: "DELETE" });
    setMessage("Reset — all demo data cleared.");
    startTransition(() => router.refresh());
  };

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={seed}
        disabled={pending}
        className="rounded-full bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm disabled:opacity-50"
      >
        Seed demo data
      </button>
      <button
        onClick={reset}
        disabled={pending}
        className="rounded-full border border-slate-300 px-4 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-50"
      >
        Reset
      </button>
      {message && <span className="text-xs text-slate-500">{message}</span>}
    </div>
  );
}
