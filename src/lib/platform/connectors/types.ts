// src/lib/platform/connectors/types.ts
//
// Connector SDK (Part 16 extension seam). Any future source (calendar, CRM,
// marketing automation, etc.) implements `ConnectorDefinition` and registers
// itself with `registerConnector` — nothing else in the platform needs to
// change. Two reference connectors ship for real: CSV/Excel-export (push)
// and an HRIS API stub (pull) driven entirely by recorded fixtures.

import type {
  ConnectorAuthType,
  ConnectorHealthState,
  ConnectorKind,
  NormalizedLead,
  RateLimitPolicy,
  RetryPolicy,
  SchemaMap,
} from "../types";

export interface FetchContext {
  /** Injectable transport so tests can feed recorded fixtures instead of live HTTP. */
  transport?: ConnectorTransport;
  cursor?: string | null;
}

export interface ConnectorTransport {
  (request: { url: string; attempt: number }): Promise<{ status: number; body: unknown }>;
}

export interface RawFetchResult {
  raw: unknown;
  /** True when the source reported more pages are available (pull connectors). */
  hasMore: boolean;
  nextCursor: string | null;
}

export interface ValidationIssue {
  field: string;
  message: string;
}

export interface ConnectorDefinition {
  id: string;
  displayName: string;
  kind: ConnectorKind;
  authType: ConnectorAuthType;
  schemaMap: SchemaMap;
  rateLimits: RateLimitPolicy;
  retryPolicy: RetryPolicy;
  precedenceRank: number; // lower = more trusted in golden-record resolution
  /** Documented, honest limits surfaced in Data Sources UI. */
  limits: string[];

  /** Pull connectors fetch raw payloads from a remote system (with retry/backoff). */
  fetchRaw?(ctx: FetchContext): Promise<RawFetchResult>;

  /** Parses a raw payload (API JSON, CSV text, etc.) into row-shaped records prior to schema mapping. */
  parseRaw(raw: unknown): Array<Record<string, unknown>>;

  /** Normalizes one raw row (already keyed by raw field names) into the canonical shape using schemaMap. */
  normalizeRow(row: Record<string, unknown>): NormalizedLead;
}

export interface ConnectorRuntimeState {
  healthState: ConnectorHealthState;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastErrorMessage: string | null;
}

export function resolveField(
  schemaMap: SchemaMap,
  canonicalField: keyof NormalizedLead,
  row: Record<string, unknown>
): unknown {
  const aliases = schemaMap[canonicalField] ?? [];
  for (const alias of aliases) {
    const key = Object.keys(row).find((k) => k.trim().toLowerCase() === alias.toLowerCase());
    if (key && row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
      return row[key];
    }
  }
  return null;
}

export function asStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}
