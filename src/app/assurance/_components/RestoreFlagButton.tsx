"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function RestoreFlagButton({ flagKey }: { flagKey: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await fetch("/api/assurance/features", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: flagKey }),
          });
          router.refresh();
        });
      }}
      className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
    >
      {pending ? "Restoring…" : "Restore feature"}
    </button>
  );
}
