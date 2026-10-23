/**
 * Encoding validator — the mechanical enforcement of the honesty rule:
 * "depth is a WEAK encoding — permitted only for categorical separation,
 * never magnitude."
 *
 * This is a pure, dependency-free module so it can be unit-tested from
 * scripts/verify.ts without spinning up a renderer.
 */
import type { SpatialEncoding } from "@/types/spatial";
import { PERCEPTUAL_RANKING } from "@/types/spatial";

export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  severity: ValidationSeverity;
  code: string;
  message: string;
  encoding: SpatialEncoding;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

/** Rule 1 (hard fail): magnitude data must never be mapped to `depth`. */
function ruleNoMagnitudeOnDepth(e: SpatialEncoding): ValidationIssue | null {
  if (e.dimension === "depth" && e.fieldKind === "magnitude") {
    return {
      severity: "error",
      code: "MAGNITUDE_ON_DEPTH",
      message: `Field "${e.dataField}" is a magnitude but is encoded via depth. Depth is a weak, non-quantitative channel — use position3d, size, or length instead.`,
      encoding: e,
    };
  }
  return null;
}

/** Rule 2 (hard fail): depth may only be used for categorical/ordinal grouping. */
function ruleDepthOnlyCategorical(e: SpatialEncoding): ValidationIssue | null {
  if (e.dimension === "depth" && e.fieldKind !== "categorical" && e.fieldKind !== "ordinal") {
    return {
      severity: "error",
      code: "DEPTH_NOT_CATEGORICAL",
      message: `Depth encoding on "${e.dataField}" must carry categorical or ordinal data only (fieldKind="${e.fieldKind}" given).`,
      encoding: e,
    };
  }
  return null;
}

/** Rule 3 (warning): decorative encodings must be explicitly labeled. */
function ruleDecorativeMustBeLabeled(e: SpatialEncoding): ValidationIssue | null {
  if (e.decorative && !e.note) {
    return {
      severity: "warning",
      code: "DECORATIVE_UNLABELED",
      message: `Decorative encoding on "${e.dataField}" has no explanatory note for the Encoding Legend.`,
      encoding: e,
    };
  }
  return null;
}

/** Rule 4 (warning): magnitude fields should prefer the strongest available channel. */
function ruleMagnitudePrefersStrongChannel(e: SpatialEncoding): ValidationIssue | null {
  if (e.fieldKind !== "magnitude") return null;
  const weakChannels: SpatialEncoding["dimension"][] = ["color", "depth"];
  if (weakChannels.includes(e.dimension)) {
    return {
      severity: "warning",
      code: "MAGNITUDE_ON_WEAK_CHANNEL",
      message: `Magnitude field "${e.dataField}" uses a weaker channel ("${e.dimension}"). Prefer position3d/size for quantitative accuracy.`,
      encoding: e,
    };
  }
  return null;
}

/** Rule 5 (error): perceptualRanking must match the declared dimension's known rank. */
function ruleRankingConsistency(e: SpatialEncoding): ValidationIssue | null {
  const expected =
    e.dimension === "depth"
      ? PERCEPTUAL_RANKING.depth
      : e.dimension === "color"
        ? PERCEPTUAL_RANKING["color-categorical"]
        : e.dimension === "size"
          ? PERCEPTUAL_RANKING.area
          : e.dimension === "position3d"
            ? PERCEPTUAL_RANKING["position-nonaligned-scale"]
            : undefined;
  if (expected !== undefined && e.perceptualRanking !== expected) {
    return {
      severity: "error",
      code: "RANKING_MISMATCH",
      message: `Encoding on "${e.dataField}" declares perceptualRanking=${e.perceptualRanking}, expected ${expected} for dimension="${e.dimension}".`,
      encoding: e,
    };
  }
  return null;
}

const RULES = [
  ruleNoMagnitudeOnDepth,
  ruleDepthOnlyCategorical,
  ruleDecorativeMustBeLabeled,
  ruleMagnitudePrefersStrongChannel,
  ruleRankingConsistency,
];

export function validateEncodings(encodings: SpatialEncoding[]): ValidationResult {
  const issues: ValidationIssue[] = [];
  for (const e of encodings) {
    for (const rule of RULES) {
      const issue = rule(e);
      if (issue) issues.push(issue);
    }
  }
  const ok = !issues.some((i) => i.severity === "error");
  return { ok, issues };
}
