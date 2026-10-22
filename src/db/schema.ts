// LEADOS — Part 37: Global Operations (multi-entity / multi-currency / multi-zone)
//
// This schema models:
//  - EntityGroup -> Entity -> Unit hierarchy with ownership % and consolidation method
//  - FX rate table with provenance (date, source, method) — rates are versioned data
//  - Per-entity fiscal calendars (calendar / 4-4-5 / custom)
//  - Financial figures (actuals) booked per entity/period/account, in local currency
//  - Intercompany eliminations (documented, auditable)
//  - Jurisdiction-tagged regulatory obligations (extends Part 29's tracker)
//  - Data residency policies (data class x allowed regions) enforced at the repository layer
//  - Board-pack entity notes (feeds Part 32's board pack with an entity-level notes section)
//
// Every amount is modeled as { value, currency, rateDate, rateSource } at the application
// layer (see src/lib/global-ops/types.ts) — the DB stores the raw local-currency value plus
// enough provenance to reconstruct translated figures on demand. We never store a
// pre-translated "group currency" number without also keeping the local figure.

import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  jsonb,
  date,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Entity hierarchy: EntityGroup -> Entity -> Unit
// ---------------------------------------------------------------------------

export const entityGroups = pgTable("entity_groups", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  // The currency the group reports consolidated results in.
  groupCurrency: text("group_currency").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const entities = pgTable(
  "entities",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => entityGroups.id, { onDelete: "cascade" }),
    // Self-reference for sub-holding entities (nullable = direct child of the group).
    parentEntityId: integer("parent_entity_id"),
    code: text("code").notNull(),
    legalName: text("legal_name").notNull(),
    jurisdictionCode: text("jurisdiction_code").notNull(), // ISO-3166-1 alpha-2, e.g. "US", "DE", "SG"
    region: text("region").notNull(), // data-residency region bucket, e.g. "eu", "us", "apac"
    functionalCurrency: text("functional_currency").notNull(), // ISO 4217
    // Percentage of this entity owned by its parent (0-100). 100 = wholly owned.
    ownershipPct: numeric("ownership_pct", { precision: 6, scale: 3, mode: "number" }).notNull().default(100),
    // How this entity rolls into its parent's consolidated statements.
    consolidationMethod: text("consolidation_method", {
      enum: ["full", "proportional", "equity"],
    })
      .notNull()
      .default("full"),
    fiscalCalendarType: text("fiscal_calendar_type", {
      enum: ["calendar", "445", "544", "454", "custom"],
    })
      .notNull()
      .default("calendar"),
    // For "calendar": { "yearStartMonth": 1 }
    // For "4-4-5" family: { "yearStartMonth": 1, "weekStartsOn": 1 }
    // For "custom": { "periods": [{ "label": "P1", "startDate": "...", "endDate": "..." }, ...] }
    fiscalCalendarConfig: jsonb("fiscal_calendar_config").notNull().default({}),
    timezone: text("timezone").notNull(), // IANA tz, e.g. "Europe/Berlin"
    localeTag: text("locale_tag").notNull().default("en-US"), // BCP-47 for number/date formatting
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("entities_group_code_uq").on(table.groupId, table.code)],
);

export const units = pgTable(
  "units",
  {
    id: serial("id").primaryKey(),
    entityId: integer("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("units_entity_code_uq").on(table.entityId, table.code)],
);

// ---------------------------------------------------------------------------
// FX rate table — versioned data with provenance
// ---------------------------------------------------------------------------

export const fxRates = pgTable(
  "fx_rates",
  {
    id: serial("id").primaryKey(),
    baseCurrency: text("base_currency").notNull(), // e.g. "EUR"
    quoteCurrency: text("quote_currency").notNull(), // e.g. "USD" -> 1 EUR = rate USD
    rateDate: date("rate_date", { mode: "string" }).notNull(),
    rate: numeric("rate", { precision: 18, scale: 8, mode: "number" }).notNull(),
    // Translation method this rate row is intended for.
    method: text("method", { enum: ["closing", "average", "historical"] }).notNull(),
    // Provenance: where the rate came from. Never a silent default.
    rateSource: text("rate_source").notNull(), // e.g. "ECB reference rate", "manual override: treasury"
    fiscalYear: integer("fiscal_year").notNull(),
    fiscalPeriod: integer("fiscal_period").notNull(), // 1-12 (or 1-13 for 4-4-5)
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("fx_rates_uq").on(
      table.baseCurrency,
      table.quoteCurrency,
      table.fiscalYear,
      table.fiscalPeriod,
      table.method,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Financial figures (actuals) booked per entity/period/account in local currency
// ---------------------------------------------------------------------------

export const financialFigures = pgTable("financial_figures", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id")
    .notNull()
    .references(() => entities.id, { onDelete: "cascade" }),
  fiscalYear: integer("fiscal_year").notNull(),
  fiscalPeriod: integer("fiscal_period").notNull(),
  statement: text("statement", { enum: ["BS", "PL", "EQ"] }).notNull(),
  accountCode: text("account_code").notNull(),
  accountLabel: text("account_label").notNull(),
  // Positive = debit-normal per account convention documented in lib/global-ops/consolidation.ts
  amountValue: numeric("amount_value", { precision: 18, scale: 2, mode: "number" }).notNull(),
  amountCurrency: text("amount_currency").notNull(), // should equal the entity's functional currency
  // true if this line is an intercompany balance that must be eliminated on consolidation
  isIntercompany: boolean("is_intercompany").notNull().default(false),
  counterpartyEntityId: integer("counterparty_entity_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Intercompany eliminations — documented, auditable entries
// ---------------------------------------------------------------------------

export const intercompanyEliminations = pgTable("intercompany_eliminations", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id")
    .notNull()
    .references(() => entityGroups.id, { onDelete: "cascade" }),
  fiscalYear: integer("fiscal_year").notNull(),
  fiscalPeriod: integer("fiscal_period").notNull(),
  fromEntityId: integer("from_entity_id")
    .notNull()
    .references(() => entities.id),
  toEntityId: integer("to_entity_id")
    .notNull()
    .references(() => entities.id),
  accountCode: text("account_code").notNull(),
  amountValue: numeric("amount_value", { precision: 18, scale: 2, mode: "number" }).notNull(),
  amountCurrency: text("amount_currency").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Jurisdiction-tagged obligations tracker (extends Part 29)
// ---------------------------------------------------------------------------

export const obligations = pgTable("obligations", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  jurisdictionCode: text("jurisdiction_code").notNull(), // ISO-3166-1 alpha-2, or "*" for global
  // Applicability rule evaluated against an entity record (see lib/global-ops/obligations.ts)
  applicabilityRule: jsonb("applicability_rule").notNull().default({}),
  frequency: text("frequency", {
    enum: ["monthly", "quarterly", "annual", "one-off"],
  }).notNull(),
  dataClass: text("data_class").notNull().default("regulatory"), // ties to residency policy
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const obligationInstances = pgTable("obligation_instances", {
  id: serial("id").primaryKey(),
  obligationId: integer("obligation_id")
    .notNull()
    .references(() => obligations.id, { onDelete: "cascade" }),
  entityId: integer("entity_id")
    .notNull()
    .references(() => entities.id, { onDelete: "cascade" }),
  periodLabel: text("period_label").notNull(), // e.g. "2025-FY" or "2025-P03"
  dueDate: date("due_date", { mode: "string" }).notNull(),
  status: text("status", {
    enum: ["not_started", "in_progress", "filed", "overdue", "waived"],
  })
    .notNull()
    .default("not_started"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Data residency policy — data class x allowed regions
// ---------------------------------------------------------------------------

export const dataResidencyPolicies = pgTable("data_residency_policies", {
  id: serial("id").primaryKey(),
  dataClass: text("data_class").notNull().unique(),
  description: text("description").notNull(),
  allowedRegions: jsonb("allowed_regions").notNull().default([]), // string[] of region codes
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Board pack entity notes (Part 32 integration point)
// ---------------------------------------------------------------------------

export const boardPackEntityNotes = pgTable("board_pack_entity_notes", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id")
    .notNull()
    .references(() => entityGroups.id, { onDelete: "cascade" }),
  entityId: integer("entity_id")
    .notNull()
    .references(() => entities.id, { onDelete: "cascade" }),
  fiscalYear: integer("fiscal_year").notNull(),
  fiscalPeriod: integer("fiscal_period").notNull(),
  noteText: text("note_text").notNull(),
  flagLevel: text("flag_level", { enum: ["info", "watch", "risk"] }).notNull().default("info"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
