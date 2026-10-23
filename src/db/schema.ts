// LEADOS — Part 53: Contract & Obligation Intelligence
//
// Reads on prior parts (per standing order):
//   - Part 29 obligation tracker -> `controls`, `obligations` carry owner/deadline/control linkage
//     and jurisdiction tags consistent with the tracker's shape.
//   - Part 11 grounded extraction -> `clauses` always store a `documentId` + `spanStart`/`spanEnd`
//     + `excerptText` so every extraction is literally re-derivable from source text (span-citation).
//   - Part 34 connectors/quarantine -> `documents.quarantineStatus` / `ocrStatus` model the seam;
//     nothing is extracted from a document until quarantineStatus = 'clean'.
//   - Part 50 ecosystem graph -> `parties.ecosystemNodeId` is the join key into that graph; we do not
//     duplicate the graph here, only reference it (see src/lib/legal/ecosystemSeam.ts).
//
// HONESTY: nothing in this schema represents a committed legal obligation until a human sets
// `confirmedBy`/`confirmedAt`. Draft rows are decision support only, never legal advice.

import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Parties & contracts (Part 50 ecosystem join + Part 29 tracker linkage)
// ---------------------------------------------------------------------------

export const parties = pgTable("legal_parties", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  partyType: varchar("party_type", { length: 32 }).notNull(), // 'counterparty' | 'internal_owner'
  jurisdiction: varchar("jurisdiction", { length: 16 }), // e.g. 'US-DE', 'EU'
  // Seam into Part 50's ecosystem graph. We never copy graph edges here; we only
  // store the join key and let src/lib/legal/ecosystemSeam.ts resolve leverage points.
  ecosystemNodeId: varchar("ecosystem_node_id", { length: 64 }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const controls = pgTable("legal_controls", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  framework: varchar("framework", { length: 64 }).notNull(), // e.g. 'SOC2', 'GDPR-Art28'
  description: text("description"),
  // Part 29's tracker id, if this control mirrors one already tracked there.
  obligationTrackerRef: varchar("obligation_tracker_ref", { length: 64 }),
});

export const documents = pgTable("legal_documents", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  sourceType: varchar("source_type", { length: 32 }).notNull(), // 'upload' | 'connector' | 'import_seam'
  connectorSource: varchar("connector_source", { length: 64 }), // e.g. 'sharepoint', 'gdrive' (Part 34)
  // Part 34 quarantine/OCR seam — extraction is blocked until these are 'clean' / 'done'|'not_needed'.
  quarantineStatus: varchar("quarantine_status", { length: 24 }).notNull().default("pending"),
  ocrStatus: varchar("ocr_status", { length: 24 }).notNull().default("not_needed"),
  rawText: text("raw_text").notNull(),
  checksum: varchar("checksum", { length: 64 }).notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contracts = pgTable("legal_contracts", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  counterpartyPartyId: integer("counterparty_party_id")
    .notNull()
    .references(() => parties.id),
  internalOwnerPartyId: integer("internal_owner_party_id").references(() => parties.id),
  status: varchar("status", { length: 24 }).notNull().default("active"), // active | expired | terminated | draft
  effectiveDate: timestamp("effective_date", { withTimezone: true }).notNull(),
  termMonths: integer("term_months").notNull().default(12),
  renewalWindowDays: integer("renewal_window_days").notNull().default(60),
  terminationNoticeDays: integer("termination_notice_days").notNull().default(30),
  governingLaw: varchar("governing_law", { length: 16 }),
  autoRenews: boolean("auto_renews").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Clause extraction (Part 11 grounded pipeline: span-cited, human-confirmed)
// ---------------------------------------------------------------------------

export const CLAUSE_TYPES = [
  "term",
  "renewal",
  "termination",
  "sla",
  "indemnity",
  "liability_cap",
  "change_of_control",
  "data_protection",
] as const;
export type ClauseType = (typeof CLAUSE_TYPES)[number];

export const clauses = pgTable(
  "legal_clauses",
  {
    id: serial("id").primaryKey(),
    documentId: integer("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    contractId: integer("contract_id").references(() => contracts.id, { onDelete: "cascade" }),
    clauseType: varchar("clause_type", { length: 32 }).notNull(),
    spanStart: integer("span_start").notNull(),
    spanEnd: integer("span_end").notNull(),
    excerptText: text("excerpt_text").notNull(),
    confidence: real("confidence").notNull(),
    extractionMethod: varchar("extraction_method", { length: 64 }).notNull(),
    // Draft semantics: nothing downstream may treat this as fact until confirmed.
    status: varchar("status", { length: 16 }).notNull().default("draft"), // draft | confirmed | rejected
    confirmedBy: varchar("confirmed_by", { length: 128 }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("legal_clauses_document_idx").on(t.documentId),
    index("legal_clauses_contract_idx").on(t.contractId),
    index("legal_clauses_type_idx").on(t.clauseType),
  ],
);

// ---------------------------------------------------------------------------
// Obligations (Part 29 tracker): owners, deadlines, linked controls
// ---------------------------------------------------------------------------

export const obligations = pgTable(
  "legal_obligations",
  {
    id: serial("id").primaryKey(),
    clauseId: integer("clause_id")
      .notNull()
      .references(() => clauses.id, { onDelete: "cascade" }),
    contractId: integer("contract_id")
      .notNull()
      .references(() => contracts.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    ownerPartyId: integer("owner_party_id").references(() => parties.id),
    controlId: integer("control_id").references(() => controls.id),
    dueDate: timestamp("due_date", { withTimezone: true }),
    cadence: varchar("cadence", { length: 24 }), // null | 'quarterly' | 'annual' ... (Part 25 seam)
    jurisdictionTags: jsonb("jurisdiction_tags").$type<string[]>().notNull().default([]),
    severity: varchar("severity", { length: 16 }).notNull().default("medium"), // low|medium|high|critical
    // Human-confirmation gate: status can only reach 'active' once confirmedAt is set.
    status: varchar("status", { length: 16 }).notNull().default("draft"), // draft|confirmed|active|breached|completed
    confirmedBy: varchar("confirmed_by", { length: 128 }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("legal_obligations_contract_idx").on(t.contractId),
    index("legal_obligations_owner_idx").on(t.ownerPartyId),
    index("legal_obligations_due_idx").on(t.dueDate),
  ],
);

// ---------------------------------------------------------------------------
// Compliance mapping (clause type -> regulatory obligation), documented/revisable
// ---------------------------------------------------------------------------

export const complianceMappings = pgTable("legal_compliance_mappings", {
  id: serial("id").primaryKey(),
  clauseType: varchar("clause_type", { length: 32 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 16 }).notNull(), // Part 29 jurisdiction tag
  regulatoryObligation: text("regulatory_obligation").notNull(),
  provenanceNote: text("provenance_note").notNull(), // where this mapping judgment came from
  documentedBy: varchar("documented_by", { length: 128 }).notNull(),
  revisable: boolean("revisable").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Cascade analysis (change-of-control / M&A — Part 54 seam)
// ---------------------------------------------------------------------------

export const cascadeTriggers = pgTable("legal_cascade_triggers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  triggerType: varchar("trigger_type", { length: 32 }).notNull(), // 'change_of_control' | 'ma_event' | ...
  description: text("description"),
  // Part 54 seam: planned M&A / corporate-action events live there; we only reference by id.
  sourceSeam: varchar("source_seam", { length: 64 }).notNull().default("part54_ma_planning"),
  externalEventRef: varchar("external_event_ref", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cascadeImpacts = pgTable(
  "legal_cascade_impacts",
  {
    id: serial("id").primaryKey(),
    cascadeTriggerId: integer("cascade_trigger_id")
      .notNull()
      .references(() => cascadeTriggers.id, { onDelete: "cascade" }),
    clauseId: integer("clause_id")
      .notNull()
      .references(() => clauses.id, { onDelete: "cascade" }),
    contractId: integer("contract_id")
      .notNull()
      .references(() => contracts.id, { onDelete: "cascade" }),
    impactDescription: text("impact_description").notNull(),
    severity: varchar("severity", { length: 16 }).notNull().default("medium"),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("legal_cascade_impacts_trigger_idx").on(t.cascadeTriggerId)],
);

// ---------------------------------------------------------------------------
// Negotiation dossiers (evidence-cited, citation-linted)
// ---------------------------------------------------------------------------

export const dossiers = pgTable("legal_dossiers", {
  id: serial("id").primaryKey(),
  counterpartyPartyId: integer("counterparty_party_id")
    .notNull()
    .references(() => parties.id),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  status: varchar("status", { length: 16 }).notNull().default("draft"), // draft|lint_failed|ready
  content: jsonb("content").notNull(), // DossierContent (see citationLint.ts)
  citationsValid: boolean("citations_valid").notNull().default(false),
  lintReport: jsonb("lint_report"),
  // Access control classification — dossiers concentrate sensitive leverage info.
  accessTier: varchar("access_tier", { length: 24 }).notNull().default("deal_team_only"),
});

export const auditLog = pgTable("legal_audit_log", {
  id: serial("id").primaryKey(),
  entityType: varchar("entity_type", { length: 32 }).notNull(),
  entityId: integer("entity_id").notNull(),
  action: varchar("action", { length: 48 }).notNull(),
  actor: varchar("actor", { length: 128 }).notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  details: jsonb("details"),
});

// ---------------------------------------------------------------------------
// eval:legal — labeled contract corpus (>= 60 docs, holdout split)
// ---------------------------------------------------------------------------

export const evalDocuments = pgTable(
  "legal_eval_documents",
  {
    id: serial("id").primaryKey(),
    docKey: varchar("doc_key", { length: 64 }).notNull(),
    splitSet: varchar("split_set", { length: 16 }).notNull(), // 'train' | 'holdout'
    rawText: text("raw_text").notNull(),
    source: varchar("source", { length: 64 }).notNull().default("synthetic_corpus_v1"),
  },
  (t) => [uniqueIndex("legal_eval_documents_key_idx").on(t.docKey)],
);

export const evalAnnotations = pgTable("legal_eval_annotations", {
  id: serial("id").primaryKey(),
  evalDocumentId: integer("eval_document_id")
    .notNull()
    .references(() => evalDocuments.id, { onDelete: "cascade" }),
  clauseType: varchar("clause_type", { length: 32 }).notNull(),
  spanStart: integer("span_start").notNull(),
  spanEnd: integer("span_end").notNull(),
  excerptText: text("excerpt_text").notNull(),
});
