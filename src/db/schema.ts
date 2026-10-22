// LEADOS Part 34 — Data Platform (connectors, quality, lineage, MDM, export integrity)
//
// Conventions:
//  - Primary keys are app-generated text UUIDs (crypto.randomUUID()) rather than DB-generated,
//    so lib code can build lineage/audit graphs before the row is committed.
//  - jsonb columns hold structured-but-flexible payloads (schema maps, quality reports, etc.)
//    documented in src/lib/platform/* alongside the code that writes them.
import {
  pgTable,
  text,
  integer,
  numeric,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Connector framework (Part 16 extension seam)
// ---------------------------------------------------------------------------
export const connectors = pgTable("connectors", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull(), // "pull" | "push" | "webhook"
  authType: text("auth_type").notNull(), // "none" | "apiKey" | "oauth2" | "basic"
  config: jsonb("config").notNull().default({}),
  schemaMap: jsonb("schema_map").notNull().default({}),
  rateLimits: jsonb("rate_limits").notNull().default({}),
  retryPolicy: jsonb("retry_policy").notNull().default({}),
  // Lower rank = higher trust for golden-record field precedence (MDM).
  precedenceRank: integer("precedence_rank").notNull().default(100),
  healthState: text("health_state").notNull().default("unknown"), // unknown|healthy|degraded|down
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastErrorMessage: text("last_error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const syncRuns = pgTable("sync_runs", {
  id: text("id").primaryKey(),
  connectorId: text("connector_id").notNull(),
  mode: text("mode").notNull(), // "dry_run" | "commit"
  status: text("status").notNull(), // running|success|partial|failed
  rowsRead: integer("rows_read").notNull().default(0),
  rowsValid: integer("rows_valid").notNull().default(0),
  rowsQuarantined: integer("rows_quarantined").notNull().default(0),
  rowsImported: integer("rows_imported").notNull().default(0),
  rowsMergedPending: integer("rows_merged_pending").notNull().default(0),
  rowsMergedAuto: integer("rows_merged_auto").notNull().default(0),
  errorSummary: jsonb("error_summary"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Import Studio (preview -> dry-run diff -> commit)
// ---------------------------------------------------------------------------
export const importBatches = pgTable("import_batches", {
  id: text("id").primaryKey(),
  connectorId: text("connector_id").notNull(),
  syncRunId: text("sync_run_id"),
  status: text("status").notNull().default("previewed"), // previewed|committed|discarded
  rawRowCount: integer("raw_row_count").notNull().default(0),
  mapping: jsonb("mapping").notNull().default({}),
  qualityReport: jsonb("quality_report"),
  // Cached, fully-processed rows from preview so commit is deterministic and
  // never silently re-derives different results from a changed source file.
  previewPayload: jsonb("preview_payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  committedAt: timestamp("committed_at", { withTimezone: true }),
});

export const quarantinedRows = pgTable("quarantined_rows", {
  id: text("id").primaryKey(),
  batchId: text("batch_id").notNull(),
  rowIndex: integer("row_index").notNull(),
  rawPayload: jsonb("raw_payload").notNull(),
  reasons: jsonb("reasons").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rawRecords = pgTable("raw_records", {
  id: text("id").primaryKey(),
  connectorId: text("connector_id").notNull(),
  batchId: text("batch_id").notNull(),
  externalId: text("external_id"),
  entityType: text("entity_type").notNull(), // person|organization
  normalized: jsonb("normalized").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Master Data Management: golden entities + entity resolution
// ---------------------------------------------------------------------------
export const entities = pgTable("entities", {
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  goldenRecord: jsonb("golden_record").notNull(),
  sourcePrecedence: jsonb("source_precedence").notNull().default([]),
  fieldProvenance: jsonb("field_provenance").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const entityLinks = pgTable("entity_links", {
  id: text("id").primaryKey(),
  entityId: text("entity_id").notNull(),
  rawRecordId: text("raw_record_id").notNull(),
  confidence: numeric("confidence").notNull(),
  linkMethod: text("link_method").notNull(), // initial|auto_duplicate|human_confirmed
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dedupCandidates = pgTable("dedup_candidates", {
  id: text("id").primaryKey(),
  entityId: text("entity_id").notNull(),
  rawRecordId: text("raw_record_id").notNull(),
  score: numeric("score").notNull(),
  matchedRules: jsonb("matched_rules").notNull(),
  status: text("status").notNull().default("pending"), // pending|confirmed|rejected
  decidedBy: text("decided_by"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  preMergeSnapshot: jsonb("pre_merge_snapshot"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Lineage & provenance graph
// ---------------------------------------------------------------------------
export const lineageNodes = pgTable("lineage_nodes", {
  id: text("id").primaryKey(),
  nodeType: text("node_type").notNull(), // source|transform|projection|surface
  refTable: text("ref_table"),
  refId: text("ref_id"),
  label: text("label").notNull(),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const lineageEdges = pgTable("lineage_edges", {
  id: text("id").primaryKey(),
  fromNodeId: text("from_node_id").notNull(),
  toNodeId: text("to_node_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Export integrity
// ---------------------------------------------------------------------------
export const exportManifests = pgTable("export_manifests", {
  id: text("id").primaryKey(),
  exportName: text("export_name").notNull(),
  format: text("format").notNull(),
  rowCount: integer("row_count").notNull(),
  checksumSha256: text("checksum_sha256").notNull(),
  provenance: jsonb("provenance").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Cross-cutting: domain events (outbox) + audit log
// ---------------------------------------------------------------------------
export const platformEvents = pgTable("platform_events", {
  id: text("id").primaryKey(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: text("id").primaryKey(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  targetTable: text("target_table").notNull(),
  targetId: text("target_id").notNull(),
  details: jsonb("details").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
