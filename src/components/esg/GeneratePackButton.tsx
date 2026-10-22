"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function GeneratePackButton({ period }: { period: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div>
      <button
        className="rounded-full bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              const res = await fetch("/api/esg/disclosure", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ period }),
              });
              const json = await res.json();
              if (!json.ok) throw new Error(json.error ?? "generation failed");
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : "generation failed");
            }
          });
        }}
      >
        {isPending ? "Generating…" : `Generate disclosure pack for ${period}`}
      </button>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
