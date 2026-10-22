"use client";

import { useEffect, useState } from "react";

interface BannerState {
  enabled: boolean;
  message?: string;
}

// Security UX without security theater (Part 19 Phase 2): a plain, visible
// banner any signed-in user sees when an admin has flipped incident mode on
// via PATCH /api/admin/incident-banner. Fails silent/invisible on error —
// an incident banner that itself breaks the page would be worse than none.
export function IncidentBanner() {
  const [banner, setBanner] = useState<BannerState | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/incident-banner", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.banner) setBanner(data.banner);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!banner?.enabled) return null;

  return (
    <div className="w-full bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-amber-950">
      ⚠ Incident mode: {banner.message || "The team is actively investigating an issue. Some features may be degraded."}
    </div>
  );
}
