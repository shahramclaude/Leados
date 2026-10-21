"use client";

// Cheap client clock used for relative-time display ("3m ago") and for
// re-evaluating quiet-hours/local-hour-dependent UI without a full data
// refetch. Deliberately ticks infrequently (30s) — this is a presentation
// aid, not a realtime data source (that's useRealtimeIntelligence).

import { useEffect, useState } from "react";

export function useNowTick(intervalMs = 30_000): Date {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}

export function timeAgo(iso: string, now: Date): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}
