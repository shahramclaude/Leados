"use client";

// LEADOS Part 14 — useNowTick
// A single shared "current time" tick for relative-time labels ("2m ago"),
// quiet-hours countdowns, and budget-reset countdowns. Ticks at `intervalMs`
// (default 30s) rather than every second, since nothing on these surfaces
// needs sub-second precision and a slower tick means fewer re-renders.
import { useEffect, useState } from "react";

export function useNowTick(intervalMs = 30000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}

export function relativeTimeFrom(iso: string, now: Date): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}
