"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function RevertRemediationButton({ actionId, reversible }: { actionId: number; reversible: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!reversible) {
    return <span className="text-xs text-slate-400">not reversible</span>;
  }

  return (
    <button
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await fetch("/api/assurance/remediation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ actionId }),
          });
          router.refresh();
        });
      }}
      className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
    >
      {pending ? "Reverting…" : "Revert"}
    </button>
  );
}
