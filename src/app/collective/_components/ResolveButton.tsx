"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ResolveButton({ questionId }: { questionId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function resolve(outcome: 0 | 1) {
    setLoading(true);
    await fetch(`/api/collective/questions/${questionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resolve", outcome }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      <button
        disabled={loading}
        onClick={() => resolve(1)}
        className="rounded-full border border-emerald-600 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
      >
        Resolve YES
      </button>
      <button
        disabled={loading}
        onClick={() => resolve(0)}
        className="rounded-full border border-rose-600 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
      >
        Resolve NO
      </button>
    </div>
  );
}
