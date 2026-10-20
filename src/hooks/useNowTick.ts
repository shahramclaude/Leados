"use client";

// Low-frequency clock used for relative-time labels ("3m ago"), quiet-hours
// countdowns, and periodic (not per-event) refreshes of the Now cockpit. A
// single shared interval avoids every component re-rendering on its own
// timer, which would otherwise fight the "cap re-render frequency"
// performance budget.

import { useEffect, useState } from "react";

const DEFAULT_INTERVAL_MS = 30_000;

export function useNowTick(intervalMs: number = DEFAULT_INTERVAL_MS): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}

export function formatRelativeTime(iso: string, nowMs: number): string {
  const diffMs = nowMs - new Date(iso).getTime();
  const diffSec = Math.max(0, Math.round(diffMs / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.round(diffHour / 24);
  return `${diffDay}d ago`;
}
