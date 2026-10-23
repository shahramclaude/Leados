"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RecomputeWisdomButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function recompute() {
    setLoading(true);
    await fetch("/api/collective/wisdom", { method: "POST" });
    setLoading(false);
    router.refresh();
  }

  return (
    <button
      onClick={recompute}
      disabled={loading}
      className="rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
    >
      {loading ? "Recomputing…" : "Recompute from resolved questions"}
    </button>
  );
}
