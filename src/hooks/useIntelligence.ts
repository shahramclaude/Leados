"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { IntelligenceData } from "@/lib/intelligence";

export function useIntelligence() {
  const [data, setData] = useState<IntelligenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/intelligence", { cache: "no-store" });
      if (!res.ok) throw new Error("bad response");
      const json = (await res.json()) as IntelligenceData;
      setData(json);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
    timer.current = setInterval(refetch, 30000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [refetch]);

  return { data, loading, error, refetch };
}
