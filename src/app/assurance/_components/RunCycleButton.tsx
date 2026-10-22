"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function RunCycleButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="flex items-center gap-3">
      <button
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            setMessage(null);
            const res = await fetch("/api/assurance/run-cycle", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({}),
            });
            const data = await res.json();
            if (data.claimed === false) {
              setMessage(`Cycle already ${data.reason === "already_completed" ? "completed" : "running"} for today (idempotent — no duplicate run).`);
            } else if (data.error) {
              setMessage(`Cycle failed: ${data.error}`);
            } else {
              setMessage(`Cycle complete: ${data.outcomes?.length ?? 0} checks run, report v${data.reportVersion}.`);
            }
            router.refresh();
          });
        }}
        className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? "Running nightly cycle…" : "Run nightly cycle now"}
      </button>
      {message && <span className="text-sm text-slate-600">{message}</span>}
    </div>
  );
}
