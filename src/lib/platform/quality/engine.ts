// src/lib/platform/quality/engine.ts
//
// Computes the six data-quality dimensions for a batch of normalized rows,
// decides per-row hard quarantine, and flags batch-level "low-quality input"
// dimensions for the UI chips. NEVER repairs/invents values — a row that
// fails a hard assertion is quarantined with its reasons, not silently fixed.
import type { Explain } from "../types";
import type { NormalizedLead } from "../types";
import { explain } from "../types";
import { normalizeEmail, normalizeName, normalizePhone } from "../normalize";
import { ROW_ASSERTIONS, type AssertionResult } from "./assertions";
import { QUALITY_THRESHOLDS, type QualityDimension } from "./thresholds";

export interface RowQualityResult {
  rowIndex: number;
  assertions: AssertionResult[];
  hardFailReasons: string[];
  quarantined: boolean;
  warnings: string[];
}

export interface QualityReport {
  dimensions: Record<QualityDimension, Explain<number>>;
  thresholds: Record<QualityDimension, number>;
  lowQualityDimensions: QualityDimension[];
  rowResults: RowQualityResult[];
  schemaDriftSuspected: Explain<boolean>;
  totalRows: number;
  quarantinedCount: number;
}

const HARD_ASSERTION_NAMES = new Set(
  ROW_ASSERTIONS.filter((a) => a.hardQuarantineOnFail).map((a) => a.name)
);

function duplicateKey(row: NormalizedLead): string | null {
  const email = normalizeEmail(row.email);
  if (email) return `email:${email}`;
  const phone = normalizePhone(row.phone);
  const name = normalizeName(row.fullName);
  if (phone && name) return `phone+name:${phone}:${name}`;
  return null;
}

/**
 * Detects likely schema drift: raw rows exist (non-empty) but a critical
 * canonical field (email, phone, fullName) resolved for ZERO rows in the
 * whole batch. That pattern means the mapping/aliases didn't match the
 * source's current headers/fields, not that the source has no such data.
 */
function detectSchemaDrift(rows: NormalizedLead[]): Explain<boolean> {
  if (rows.length === 0) {
    return explain(false, "No rows to evaluate for schema drift.");
  }
  const criticalFields: Array<keyof NormalizedLead> = ["email", "phone", "fullName"];
  const zeroResolvedFields = criticalFields.filter((f) => rows.every((r) => !r[f]));
  const suspected = zeroResolvedFields.length > 0;
  return explain(
    suspected,
    suspected
      ? `No row in this batch resolved a value for: ${zeroResolvedFields.join(", ")}. This usually means the source changed its field names/headers and the connector's schemaMap needs a new alias, not that the data is actually empty.`
      : "All critical canonical fields (email, phone, fullName) resolved for at least one row.",
    { zeroResolvedFields }
  );
}

export function runQualityEngine(rows: NormalizedLead[]): QualityReport {
  const rowResults: RowQualityResult[] = rows.map((row, rowIndex) => {
    const assertions = ROW_ASSERTIONS.map((a) => a.check(row));
    const hardFailReasons = assertions
      .filter((r) => !r.passed && HARD_ASSERTION_NAMES.has(r.name))
      .map((r) => r.reason!)
      .filter(Boolean);
    const warnings = assertions
      .filter((r) => !r.passed && !HARD_ASSERTION_NAMES.has(r.name))
      .map((r) => r.reason!)
      .filter(Boolean);
    return {
      rowIndex,
      assertions,
      hardFailReasons,
      quarantined: hardFailReasons.length > 0,
      warnings,
    };
  });

  const total = rows.length || 1; // guard against div-by-zero while still reporting 0 rows honestly

  // completeness: has_contact_identifier + has_name both must pass
  const completenessPassed = rowResults.filter(
    (r) => !r.assertions.find((a) => (a.name === "has_contact_identifier" || a.name === "has_name") && !a.passed)
  ).length;
  const completeness = explain(
    rows.length === 0 ? 0 : completenessPassed / total,
    `${completenessPassed}/${rows.length} rows had both a contact identifier (email or phone) and a name.`,
    { passed: completenessPassed, total: rows.length }
  );

  // validity: email_format_valid + phone_format_valid both must pass
  const validityPassed = rowResults.filter(
    (r) => !r.assertions.find((a) => (a.name === "email_format_valid" || a.name === "phone_format_valid") && !a.passed)
  ).length;
  const validity = explain(
    rows.length === 0 ? 0 : validityPassed / total,
    `${validityPassed}/${rows.length} rows had well-formed email and phone values where present.`,
    { passed: validityPassed, total: rows.length }
  );

  // uniqueness: fraction of rows that are the FIRST occurrence of their duplicate key
  const seen = new Set<string>();
  let uniqueCount = 0;
  let keyedRows = 0;
  for (const row of rows) {
    const key = duplicateKey(row);
    if (key === null) continue; // can't evaluate uniqueness without an identifying key
    keyedRows += 1;
    if (!seen.has(key)) {
      uniqueCount += 1;
      seen.add(key);
    }
  }
  const uniqueness = explain(
    keyedRows === 0 ? 1 : uniqueCount / keyedRows,
    keyedRows === 0
      ? "No rows had an identifying key (email, or phone+name) to evaluate uniqueness against."
      : `${uniqueCount}/${keyedRows} rows with an identifying key were first-seen (not exact/near duplicates within this batch).`,
    { uniqueCount, keyedRows }
  );

  // timeliness: source_timestamp_fresh
  const freshCount = rowResults.filter((r) => !r.assertions.find((a) => a.name === "source_timestamp_fresh" && !a.passed)).length;
  const noTimestampAtAll = rows.length > 0 && rows.every((r) => !r.sourceUpdatedAt);
  const timeliness = explain(
    rows.length === 0 ? 0 : freshCount / total,
    noTimestampAtAll
      ? "No row in this batch carried a source updatedAt timestamp; freshness cannot be assessed and is scored as unmet rather than assumed fresh."
      : `${freshCount}/${rows.length} rows reported a source timestamp within the freshness window.`,
    { freshCount, total: rows.length, noTimestampAtAll }
  );

  // consistency: email_domain_not_placeholder
  const consistentCount = rowResults.filter((r) => !r.assertions.find((a) => a.name === "email_domain_not_placeholder" && !a.passed)).length;
  const consistency = explain(
    rows.length === 0 ? 0 : consistentCount / total,
    `${consistentCount}/${rows.length} rows passed cross-field consistency checks (e.g. no placeholder email domains).`,
    { consistentCount, total: rows.length }
  );

  // accuracy-proxy: NO independent ground truth exists in this system. We report
  // the fraction of rows with BOTH email and phone present (redundant identifiers
  // that *could* be cross-checked by a human), explicitly marked as a weak proxy.
  const redundantIdCount = rows.filter((r) => !!r.email && !!r.phone).length;
  const accuracyProxy: Explain<number> = {
    ...explain(
      rows.length === 0 ? 0 : redundantIdCount / total,
      `${redundantIdCount}/${rows.length} rows have both email and phone present, which is the only independent cross-check available in this system. This dimension has NO ground-truth ` +
        `ground truth and must not be read as a measure of real-world accuracy.`,
      { redundantIdCount, total: rows.length }
    ),
    isProxy: true,
  };

  const dimensions: Record<QualityDimension, Explain<number>> = {
    completeness,
    validity,
    uniqueness,
    timeliness,
    consistency,
    accuracyProxy,
  };

  const lowQualityDimensions = (Object.keys(dimensions) as QualityDimension[]).filter(
    (d) => dimensions[d].value < QUALITY_THRESHOLDS[d]
  );

  return {
    dimensions,
    thresholds: QUALITY_THRESHOLDS,
    lowQualityDimensions,
    rowResults,
    schemaDriftSuspected: detectSchemaDrift(rows),
    totalRows: rows.length,
    quarantinedCount: rowResults.filter((r) => r.quarantined).length,
  };
}
