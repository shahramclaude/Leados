// src/lib/platform/types.ts
//
// Shared primitives for the data platform (connectors, quality, lineage, MDM).
// `Explain<T>` is the house convention (consumed by Part 32's footnotes) for
// any scored/derived value: never emit a bare number, always carry the
// reasoning and evidence that produced it.

export interface Explain<T> {
  value: T;
  /** Human-readable explanation of how `value` was derived. */
  explanation: string;
  /** Opaque evidence payload (sample rows, counts, rule ids, etc.). */
  evidence?: Record<string, unknown>;
  /** Set when the computation is a best-effort proxy, not ground truth. */
  isProxy?: boolean;
}

export function explain<T>(
  value: T,
  explanation: string,
  evidence?: Record<string, unknown>,
  isProxy = false
): Explain<T> {
  return { value, explanation, evidence, isProxy };
}

// ---------------------------------------------------------------------------
// Canonical lead record shape that every connector normalizes into.
// ---------------------------------------------------------------------------
export type EntityType = "person" | "organization";

export interface NormalizedLead {
  externalId: string | null;
  entityType: EntityType;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  title: string | null;
  country: string | null;
  /** ISO 8601 timestamp reported by the source system, used for timeliness scoring. */
  sourceUpdatedAt: string | null;
}

export const CANONICAL_FIELDS: Array<keyof NormalizedLead> = [
  "externalId",
  "entityType",
  "fullName",
  "email",
  "phone",
  "company",
  "title",
  "country",
  "sourceUpdatedAt",
];

export type ConnectorKind = "pull" | "push" | "webhook";
export type ConnectorAuthType = "none" | "apiKey" | "oauth2" | "basic";
export type ConnectorHealthState = "unknown" | "healthy" | "degraded" | "down";

export interface RateLimitPolicy {
  maxRequestsPerMinute: number;
}

export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: number;
  backoffMultiplier: number;
}

/** Field-mapping dictionary: canonical field -> list of accepted raw header/field aliases. */
export type SchemaMap = Record<keyof NormalizedLead, string[]>;
