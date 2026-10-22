"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function RunDeadlineSweepButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    const res = await fetch("/api/obligations/sweep", { method: "POST" });
    const data = await res.json();
    setMessage(`${data.changes.length} instance(s) changed status.`);
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex items-center gap-3">
      <button onClick={run} disabled={pending} className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        Run deadline sweep
      </button>
      {message && <span className="text-sm text-slate-600">{message}</span>}
    </div>
  );
}

export function RecordEvidenceButton({ instanceId }: { instanceId: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  async function run() {
    await fetch(`/api/obligations/${instanceId}/evidence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actor: "compliance-officer", note: "Evidence uploaded and reviewed via Obligation Calendar." }),
    });
    setDone(true);
    startTransition(() => router.refresh());
  }

  if (done) return <span className="text-xs font-medium text-emerald-700">Evidence recorded</span>;

  return (
    <button onClick={run} disabled={pending} className="rounded-full bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
      Record evidence
    </button>
  );
}
