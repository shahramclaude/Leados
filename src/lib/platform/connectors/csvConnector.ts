// src/lib/platform/connectors/csvConnector.ts
//
// Reference connector #1: CSV/Excel-export file push.
//
// DOCUMENTED LIMITS:
//  - "push" kind: a human/other system uploads a file; there is no polling.
//  - Only UTF-8 text CSV is supported (see csvUtils.ts header comment).
//  - Column mapping is alias-based (schemaMap); unmapped columns are ignored,
//    never guessed by position.
import { parseCsv, csvRowsToObjects } from "@/lib/csvUtils";
import type { NormalizedLead, SchemaMap } from "../types";
import { asStringOrNull, resolveField, type ConnectorDefinition } from "./types";

export const CSV_SCHEMA_MAP: SchemaMap = {
  externalId: ["id", "lead id", "contact id"],
  entityType: ["type", "entity type"],
  fullName: ["full name", "name", "contact name"],
  email: ["email", "e-mail", "email address"],
  phone: ["phone", "phone number", "mobile", "telephone"],
  company: ["company", "organization", "organisation", "account"],
  title: ["title", "job title", "role"],
  country: ["country", "country code"],
  sourceUpdatedAt: ["updated at", "last modified", "modified date"],
};

export function parseCsvRaw(csvText: string): {
  objects: Array<Record<string, unknown>>;
  malformedRows: Array<{ rowIndex: number; message: string; raw: string }>;
  header: string[];
} {
  const { header, rows, errors } = parseCsv(csvText);
  const objects = csvRowsToObjects(header, rows);
  return { objects, malformedRows: errors, header };
}

function normalizeRow(row: Record<string, unknown>, schemaMap: SchemaMap): NormalizedLead {
  const entityTypeRaw = asStringOrNull(resolveField(schemaMap, "entityType", row));
  return {
    externalId: asStringOrNull(resolveField(schemaMap, "externalId", row)),
    entityType: entityTypeRaw?.toLowerCase() === "organization" ? "organization" : "person",
    fullName: asStringOrNull(resolveField(schemaMap, "fullName", row)),
    email: asStringOrNull(resolveField(schemaMap, "email", row)),
    phone: asStringOrNull(resolveField(schemaMap, "phone", row)),
    company: asStringOrNull(resolveField(schemaMap, "company", row)),
    title: asStringOrNull(resolveField(schemaMap, "title", row)),
    country: asStringOrNull(resolveField(schemaMap, "country", row)),
    sourceUpdatedAt: asStringOrNull(resolveField(schemaMap, "sourceUpdatedAt", row)),
  };
}

export const csvConnector: ConnectorDefinition = {
  id: "csv-upload",
  displayName: "CSV / Excel-export upload",
  kind: "push",
  authType: "none",
  schemaMap: CSV_SCHEMA_MAP,
  rateLimits: { maxRequestsPerMinute: 60 },
  retryPolicy: { maxAttempts: 1, backoffMs: 0, backoffMultiplier: 1 },
  precedenceRank: 200, // least trusted of the two reference connectors
  limits: [
    "Push-only: a human uploads a file, there is no scheduled polling.",
    "UTF-8 text CSV only; XLSX binary workbooks are not parsed (export to CSV first).",
    "Rows with a column count mismatch vs. the header are rejected as malformed, never padded or truncated.",
    "Column mapping is alias-based; unrecognized columns are dropped, not guessed by position.",
  ],
  parseRaw(raw: unknown) {
    const csvText = typeof raw === "string" ? raw : "";
    return parseCsvRaw(csvText).objects;
  },
  normalizeRow(row) {
    return normalizeRow(row, CSV_SCHEMA_MAP);
  },
};
