// src/lib/platform/connectors/hrisConnector.ts
//
// Reference connector #2: HRIS employee-directory API (pull), implemented as
// a STUB driven entirely by recorded fixtures — there is no live network
// call in this build.
//
// DOCUMENTED LIMITS:
//  - No real HRIS vendor is wired up; `fetchRaw` requires an injected
//    `transport` (tests/production both must supply one). Calling it without
//    a transport throws rather than silently returning fabricated data.
//  - Retry policy is a fixed exponential backoff (maxAttempts/backoffMs/
//    backoffMultiplier); there is no jitter and no circuit breaker across
//    connector instances (single in-process attempt loop only).
//  - Pagination is modeled (`hasMore`/`nextCursor`) but the stub fixtures
//    only ever return a single page.
import type { NormalizedLead, SchemaMap } from "../types";
import {
  asStringOrNull,
  resolveField,
  type ConnectorDefinition,
  type FetchContext,
  type RawFetchResult,
} from "./types";

export const HRIS_SCHEMA_MAP: SchemaMap = {
  externalId: ["employeeId", "id"],
  entityType: [],
  fullName: ["employeeName", "fullLegalName", "name"],
  email: ["workEmail", "primaryEmailAddress", "email"],
  phone: ["mobilePhone", "contactNumber", "phone"],
  company: ["department", "orgUnit", "company"],
  title: ["jobTitle", "positionTitle", "title"],
  country: ["country"],
  sourceUpdatedAt: ["updatedAt"],
};

function normalizeRow(row: Record<string, unknown>, schemaMap: SchemaMap): NormalizedLead {
  return {
    externalId: asStringOrNull(resolveField(schemaMap, "externalId", row)),
    entityType: "person",
    fullName: asStringOrNull(resolveField(schemaMap, "fullName", row)),
    email: asStringOrNull(resolveField(schemaMap, "email", row)),
    phone: asStringOrNull(resolveField(schemaMap, "phone", row)),
    company: asStringOrNull(resolveField(schemaMap, "company", row)),
    title: asStringOrNull(resolveField(schemaMap, "title", row)),
    country: asStringOrNull(resolveField(schemaMap, "country", row)),
    sourceUpdatedAt: asStringOrNull(resolveField(schemaMap, "sourceUpdatedAt", row)),
  };
}

export class ConnectorFetchError extends Error {
  constructor(message: string, public readonly attempts: number, public readonly lastStatus: number | null) {
    super(message);
    this.name = "ConnectorFetchError";
  }
}

export const hrisConnector: ConnectorDefinition = {
  id: "hris-directory",
  displayName: "HRIS employee directory (API stub)",
  kind: "pull",
  authType: "apiKey",
  schemaMap: HRIS_SCHEMA_MAP,
  rateLimits: { maxRequestsPerMinute: 30 },
  retryPolicy: { maxAttempts: 3, backoffMs: 250, backoffMultiplier: 2 },
  precedenceRank: 100, // more trusted than the CSV connector for employee contact data
  limits: [
    "Stub only: no live HRIS vendor integration is wired up; a `transport` must be injected.",
    "Pagination is modeled but untested beyond a single page in the recorded fixtures.",
    "Retry/backoff is in-process only; no durable queue or circuit breaker across runs.",
    "`employees` payload must be an array; any other shape is treated as a hard parse failure, not coerced.",
  ],
  async fetchRaw(ctx: FetchContext): Promise<RawFetchResult> {
    if (!ctx.transport) {
      throw new ConnectorFetchError(
        "No transport configured for hris-directory connector (stub requires an injected transport).",
        0,
        null
      );
    }
    const { maxAttempts, backoffMs, backoffMultiplier } = hrisConnector.retryPolicy;
    let attempt = 0;
    let lastStatus: number | null = null;
    let delay = backoffMs;

    while (attempt < maxAttempts) {
      attempt += 1;
      const res = await ctx.transport({ url: "stub://hris/employees", attempt });
      lastStatus = res.status;
      if (res.status >= 200 && res.status < 300) {
        const body = res.body as { hasMore?: boolean; nextCursor?: string | null };
        return {
          raw: res.body,
          hasMore: !!body?.hasMore,
          nextCursor: body?.nextCursor ?? null,
        };
      }
      if (res.status >= 500 && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, delay));
        delay *= backoffMultiplier;
        continue;
      }
      throw new ConnectorFetchError(`HRIS fetch failed with status ${res.status}`, attempt, res.status);
    }
    throw new ConnectorFetchError("HRIS fetch exhausted retry attempts", attempt, lastStatus);
  },
  parseRaw(raw: unknown) {
    const body = raw as { employees?: unknown } | undefined;
    if (!body || !Array.isArray(body.employees)) {
      throw new Error("Malformed HRIS payload: `employees` is missing or not an array.");
    }
    return body.employees as Array<Record<string, unknown>>;
  },
  normalizeRow(row) {
    return normalizeRow(row, HRIS_SCHEMA_MAP);
  },
};
