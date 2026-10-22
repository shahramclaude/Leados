// src/lib/platform/pipeline.ts
//
// Shared normalize+score pipeline used by both the push path (Import Studio /
// src/lib/import.ts) and the pull path (src/lib/syncEngine.ts). Keeping this
// in one place guarantees a CSV upload and an HRIS pull are quality-gated
// identically.
import type { ConnectorDefinition } from "./connectors/types";
import type { NormalizedLead } from "./types";
import { runQualityEngine, type QualityReport } from "./quality/engine";

export interface PipelineResult {
  normalizedRows: NormalizedLead[];
  qualityReport: QualityReport;
  parseErrorCount: number;
}

/**
 * Parses + normalizes raw connector output. Parse-level failures (e.g. a CSV
 * row with the wrong column count, or an HRIS payload whose `employees` is
 * not an array) are counted and surfaced but never coerced into fake rows.
 */
export function normalizeAndScore(
  connector: ConnectorDefinition,
  rawObjects: Array<Record<string, unknown>>,
  parseErrorCount = 0
): PipelineResult {
  const normalizedRows = rawObjects.map((row) => connector.normalizeRow(row));
  const qualityReport = runQualityEngine(normalizedRows);
  return { normalizedRows, qualityReport, parseErrorCount };
}
