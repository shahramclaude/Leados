"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function RunSweepButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    const res = await fetch("/api/controls/tests/sweep", { method: "POST" });
    const data = await res.json();
    setMessage(`${data.overdueCount} test(s) flagged overdue; ${data.findingsRaised.length} finding(s) raised.`);
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={run}
        disabled={pending}
        className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Run overdue-test sweep
      </button>
      {message && <span className="text-sm text-slate-600">{message}</span>}
    </div>
  );
}

export function ExecuteTestButton({ controlTestId, mechanism }: { controlTestId: number; mechanism: "manual" | "automated" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  async function run(manualResult?: "pass" | "fail") {
    const res = await fetch(`/api/controls/tests/${controlTestId}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(manualResult ? { manualResult, manualNote: "Recorded via Control Assurance UI." } : {}),
    });
    const data = await res.json();
    if (data.error) {
      setResult(`Error: ${data.error}`);
      return;
    }
    setResult(`Result: ${data.result.result} (evidence #${data.result.evidenceAuditEventId})`);
    startTransition(() => router.refresh());
  }

  if (mechanism === "automated") {
    return (
      <div className="flex flex-col items-start gap-1">
        <button
          onClick={() => run()}
          disabled={pending}
          className="rounded-full bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          Run automated test now
        </button>
        {result && <span className="text-xs text-slate-600">{result}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex gap-2">
        <button onClick={() => run("pass")} disabled={pending} className="rounded-full bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
          Attest: Pass
        </button>
        <button onClick={() => run("fail")} disabled={pending} className="rounded-full bg-red-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
          Attest: Fail
        </button>
      </div>
      {result && <span className="text-xs text-slate-600">{result}</span>}
    </div>
  );
}
