"use client";

import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div role="status" className="w-full bg-amber-500/90 px-4 py-1.5 text-center text-sm font-medium text-amber-950">
      You&apos;re offline. Changes you make won&apos;t be saved until you&apos;re back online — see{" "}
      <span className="underline decoration-dotted">docs/FRONTEND.md</span> for the current scope of offline support.
    </div>
  );
}
