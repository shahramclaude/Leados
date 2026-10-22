"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function GenerateBriefButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/strategy/brief", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.error === "citation_lint_failed"
            ? `Citation lint failed — uncited numbers: ${data.uncitedNumbers.join(", ")}`
            : data.error ?? "brief generation failed",
        );
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Brief generation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleClick}
        disabled={loading}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {loading ? "Generating…" : "Generate weekly brief"}
      </button>
      {error && <span className="text-sm text-rose-600">{error}</span>}
    </div>
  );
}
