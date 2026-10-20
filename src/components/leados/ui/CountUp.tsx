"use client";

import { useEffect, useRef, useState } from "react";

export interface CountUpProps {
  value: number;
  formatter?: (n: number) => string;
  durationMs?: number;
}

/** Numbers count up exactly once per mount (not on every re-render), and
 * respect prefers-reduced-motion by jumping straight to the final value. */
export function CountUp({ value, formatter = (n) => Math.round(n).toLocaleString(), durationMs = 600 }: CountUpProps) {
  const [display, setDisplay] = useState(0);
  const played = useRef(false);

  useEffect(() => {
    if (played.current) {
      setDisplay(value);
      return;
    }
    played.current = true;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    let raf = 0;
    function tick(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <span className="font-mono-nums">{formatter(display)}</span>;
}
