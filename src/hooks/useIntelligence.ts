"use client";

import { useAppContext } from "@/lib/AppContext";
import type { IntelligenceReport, DomainHealth } from "@/lib/types";

export interface UseIntelligenceResult {
  intelligence: IntelligenceReport;
  loading: boolean;
  refetch: () => void;
  domain: (domain: string) => DomainHealth | undefined;
}

// Thin convenience hook over AppContext for components that only need the
// intelligence slice (keeps call sites terse and typed).
export function useIntelligence(): UseIntelligenceResult {
  const { intelligence, loading, refetch } = useAppContext();
  return {
    intelligence,
    loading,
    refetch,
    domain: (domain: string) => intelligence.domainHealth.find((d) => d.domain === domain),
  };
}
