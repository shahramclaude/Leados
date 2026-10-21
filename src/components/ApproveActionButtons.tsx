"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ApproveActionButtons({ runId, actionId }: { runId: string; actionId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function decide(decision: "approve" | "reject") {
    setSubmitting(true);
    await fetch(`/api/agent-runs/${runId}/actions/${actionId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    setSubmitting(false);
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      <button
        disabled={submitting}
        onClick={() => decide("approve")}
        className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
      >
        Approve
      </button>
      <button
        disabled={submitting}
        onClick={() => decide("reject")}
        className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
      >
        Reject
      </button>
    </div>
  );
}
