// External Radar ingestion: scores external observations for reliability
// (Part 27 seam), classifies evidence, and checks crisis-elevation
// thresholds (Part 47 seam).

import {
  reliabilityClassFromScore,
  reliabilityClassToEvidenceClass,
  type EvidenceClass,
  type ReliabilityClass,
} from "@/lib/seams/part27-evidence";
import { shouldElevate, type ElevationDecision } from "@/lib/seams/part47-crisis";
import type { RawExternalObservation } from "@/lib/seams/part13-sensing";

export interface ScoredSignal {
  title: string;
  summary: string;
  signalType: string;
  severity: "low" | "moderate" | "high" | "critical";
  reliabilityScore: number;
  reliabilityClass: ReliabilityClass;
  evidenceClass: EvidenceClass;
  elevation: ElevationDecision;
}

/**
 * Combines a raw observation with its source's reliability score into a
 * scored signal, carrying an explicit evidence class and an elevation
 * decision. Never silently drops the provenance trail.
 */
export function scoreSignal(raw: RawExternalObservation, sourceReliabilityScore: number): ScoredSignal {
  const reliabilityClass = reliabilityClassFromScore(sourceReliabilityScore);
  const evidenceClass = reliabilityClassToEvidenceClass(reliabilityClass);
  const elevation = shouldElevate({ severity: raw.severityHint, reliabilityClass });

  return {
    title: raw.title,
    summary: raw.summary,
    signalType: raw.signalType,
    severity: raw.severityHint,
    reliabilityScore: sourceReliabilityScore,
    reliabilityClass,
    evidenceClass,
    elevation,
  };
}
