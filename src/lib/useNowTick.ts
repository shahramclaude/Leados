"use client";

import { useEffect, useState } from "react";

// Forces a re-render on an interval so relative-time strings ("3m ago")
// and countdowns stay fresh even when no new data has arrived over SSE.
export function useNowTick(intervalMs = 15000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
