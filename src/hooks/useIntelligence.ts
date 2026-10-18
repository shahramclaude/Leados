"use client";
import { useState, useEffect, useCallback } from "react";

export interface IntelligenceData {
  findings: any[];
  domainScores: any[];
  decisions: any[];
  eventCount: number;
  peopleCount: number;
  pulseByPerson: Record<string, any>;
  openGoals: any[];
  openPlans: any[];
  correlations: any[];
  inferences: any[];
  beliefs: Record<string, any>;
  flightRisk: any[];
  healthScore: any;
  temporalMode: string;
  orgEntropy: number;
  feedbackLoops: any[];
  simulation: any;
  attentionPlan: any;
  highestLeverageAction: any;
  generatedAt: string;
}

export function useIntelligence(pollIntervalMs = 30_000) {
  const [data, setData] = useState<IntelligenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch("/api/intelligence");
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      setData(json);
      setLastUpdated(new Date());
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch_();
    const id = setInterval(fetch_, pollIntervalMs);
    return () => clearInterval(id);
  }, [fetch_, pollIntervalMs]);

  return { data, loading, error, lastUpdated, refetch: fetch_ };
}
