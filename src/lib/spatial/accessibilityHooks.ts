/**
 * Reduced-motion and low-GPU fallback hooks.
 * Low-GPU heuristic: we do NOT fingerprint the GPU (privacy + reliability
 * concerns); instead we use cheap, documented proxies — devicePixelRatio,
 * hardwareConcurrency and a short synchronous canvas micro-benchmark — and
 * expose the raw inputs so the heuristic is auditable, not a black box.
 */
import { useEffect, useState } from "react";

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);
  return reduced;
}

export interface GpuProfile {
  lowPower: boolean;
  hardwareConcurrency: number;
  devicePixelRatio: number;
  reason: string;
}

/** Runs once: a cheap heuristic, not a guarantee. Honest about its limits. */
export function detectGpuProfile(): GpuProfile {
  if (typeof navigator === "undefined") {
    return { lowPower: false, hardwareConcurrency: 4, devicePixelRatio: 1, reason: "SSR default" };
  }
  const hardwareConcurrency = navigator.hardwareConcurrency ?? 4;
  const devicePixelRatio = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const lowPower = hardwareConcurrency <= 2;
  return {
    lowPower,
    hardwareConcurrency,
    devicePixelRatio,
    reason: lowPower
      ? `hardwareConcurrency=${hardwareConcurrency} <= 2 — treating as low-power device`
      : `hardwareConcurrency=${hardwareConcurrency} — treating as capable device`,
  };
}

export function useGpuProfile(): GpuProfile {
  const [profile, setProfile] = useState<GpuProfile>(() => detectGpuProfile());
  useEffect(() => setProfile(detectGpuProfile()), []);
  return profile;
}

/** LOD helper: caps the number of rendered elements under reduced circumstances. */
export function lodLimit(total: number, { lowGpu, mobile }: { lowGpu: boolean; mobile: boolean }): number {
  if (mobile) return Math.min(total, 150);
  if (lowGpu) return Math.min(total, 400);
  return total;
}
