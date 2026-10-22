// LEADOS — Part 31: Ecosystem Intelligence (network / stakeholder / dependency layer)
//
// NOTE ON LINEAGE: this repository snapshot does not contain the Part 01 substrate,
// Part 06 digital-twin, Part 09 roster/skills, or Part 29 risk-register tables described
// in the standing order. To keep Part 31 runnable and internally consistent, this file
// defines minimal, clearly-labelled stand-in tables for those dependencies
// (`people`, `skillCoverage`, `riskRegister`) using the same field names/shapes the
// standing order calls for, so a future part that lands the real Part 01/06/09/29
// tables can rename/merge rather than redesign. Everything under "Part 31 core" is net
// new for this part.

import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

// ---------------------------------------------------------------------------
// Stand-ins for prior parts (Part 09 roster, Part 29 risk register)
// ---------------------------------------------------------------------------

/** Part 09 stand-in: minimal roster so bus-factor / privacy scoping has real rows. */
export const people = pgTable("eco_people", {
  id: id(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  team: text("team").notNull(),
  managerId: text("manager_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Part 29 stand-in: risk register rows that partner scorecards link evidence to. */
export const riskRegister = pgTable("eco_risk_register", {
  id: id(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  severity: text("severity").notNull(), // low | medium | high | critical
  likelihood: text("likelihood").notNull(), // low | medium | high
  status: text("status").notNull().default("open"), // open | mitigated | closed
  owner: text("owner"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Part 31 core: ecosystem graph
// ---------------------------------------------------------------------------

export const nodeTypeEnum = pgEnum("eco_node_type", [
  "internal_person",
  "internal_team",
  "partner",
  "supplier",
  "customer",
  "regulator",
]);

export const edgeTypeEnum = pgEnum("eco_edge_type", [
  "employs",
  "reports_to",
  "depends_on",
  "partners_with",
  "serves",
  "regulated_by",
  "supplies",
]);

export const evidenceClassEnum = pgEnum("eco_evidence_class", [
  "verified_primary", // e.g. signed contract, system-of-record export
  "verified_secondary", // corroborated but indirect (e.g. finance extract)
  "self_reported", // asserted by a party without corroboration
  "inferred", // derived by a model/heuristic, not directly observed
]);

export const ecosystemNodes = pgTable("eco_nodes", {
  id: id(),
  type: nodeTypeEnum("type").notNull(),
  name: text("name").notNull(),
  isExternal: boolean("is_external").notNull().default(false),
  /** Links back to `people` when type = internal_person, for privacy scoping. */
  personId: text("person_id"),
  scopeTags: jsonb("scope_tags").$type<string[]>().notNull().default([]),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ecosystemEdges = pgTable("eco_edges", {
  id: id(),
  sourceId: text("source_id").notNull(),
  targetId: text("target_id").notNull(),
  edgeType: edgeTypeEnum("edge_type").notNull(),
  /** Relationship strength, 0..1 (how material the dependency is). */
  strength: numeric("strength", { precision: 5, scale: 4 }).notNull().default("0.5"),
  /** 0 = irreplaceable, 1 = freely substitutable. */
  substitutability: numeric("substitutability", { precision: 5, scale: 4 })
    .notNull()
    .default("0.5"),
  evidenceClass: evidenceClassEnum("evidence_class").notNull().default("self_reported"),
  evidenceRefs: jsonb("evidence_refs").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Capability / bus-factor data (reads Part 09 skill data, stand-in here)
// ---------------------------------------------------------------------------

export const skillCoverage = pgTable("eco_skill_coverage", {
  id: id(),
  capability: text("capability").notNull(),
  personId: text("person_id").notNull(),
  /** Relative capacity this person contributes to the capability (any positive unit). */
  capacity: numeric("capacity", { precision: 10, scale: 2 }).notNull().default("1"),
  isPrimary: boolean("is_primary").notNull().default(false),
});

// ---------------------------------------------------------------------------
// Concentration inputs (spend / revenue)
// ---------------------------------------------------------------------------

export const spendRecords = pgTable("eco_spend_records", {
  id: id(),
  partnerNodeId: text("partner_node_id").notNull(),
  category: text("category").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  period: text("period").notNull(), // e.g. "2026-Q1"
});

export const revenueRecords = pgTable("eco_revenue_records", {
  id: id(),
  customerNodeId: text("customer_node_id").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  period: text("period").notNull(),
});

export const concentrationSnapshots = pgTable("eco_concentration_snapshots", {
  id: id(),
  dimension: text("dimension").notNull(), // spend | revenue | skill | partner
  period: text("period").notNull(),
  hhi: numeric("hhi", { precision: 6, scale: 4 }).notNull(),
  topShare: numeric("top_share", { precision: 6, scale: 4 }).notNull(),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Dependency alerts (wired to Part 13 notification surface — stand-in channel field)
// ---------------------------------------------------------------------------

export const dependencyAlerts = pgTable("eco_dependency_alerts", {
  id: id(),
  alertType: text("alert_type").notNull(), // bus_factor | single_source | concentration | choke_point
  subjectRef: text("subject_ref").notNull(), // capability name, node id, or dimension
  severity: text("severity").notNull(), // low | medium | high | critical
  message: text("message").notNull(),
  status: text("status").notNull().default("open"), // open | acknowledged | resolved
  notifyChannel: text("notify_channel").notNull().default("part13:inbox"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Stakeholder management
// ---------------------------------------------------------------------------

export const stakeholders = pgTable("eco_stakeholders", {
  id: id(),
  nodeId: text("node_id").notNull(),
  interest: integer("interest").notNull(), // 0..10
  influence: integer("influence").notNull(), // 0..10
  affectedness: integer("affectedness").notNull(), // 0..10
  engagementPlan: text("engagement_plan").notNull().default(""),
  owner: text("owner").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const commitmentStatusEnum = pgEnum("eco_commitment_status", [
  "open",
  "in_progress",
  "closed",
  "missed",
]);

export const commitments = pgTable("eco_commitments", {
  id: id(),
  stakeholderId: text("stakeholder_id").notNull(),
  description: text("description").notNull(),
  promisedBy: text("promised_by").notNull(),
  dueDate: timestamp("due_date", { withTimezone: true }),
  status: commitmentStatusEnum("status").notNull().default("open"),
  evidenceClass: evidenceClassEnum("evidence_class").notNull().default("self_reported"),
  evidenceRefs: jsonb("evidence_refs").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

/** Aggregate-safe interaction log — counts/cadence only, no message content. */
export const interactions = pgTable("eco_interactions", {
  id: id(),
  stakeholderId: text("stakeholder_id").notNull(),
  channel: text("channel").notNull(), // meeting | email | call | event
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  sentiment: text("sentiment"), // positive | neutral | negative | null (optional, coarse)
});

// ---------------------------------------------------------------------------
// Partner scorecards (linked to Part 29 risk register, evidence classed per Part 27)
// ---------------------------------------------------------------------------

export const partnerScorecards = pgTable("eco_partner_scorecards", {
  id: id(),
  partnerNodeId: text("partner_node_id").notNull(),
  deliveryQuality: numeric("delivery_quality", { precision: 5, scale: 2 }), // 0..100
  deliveryEvidenceClass: evidenceClassEnum("delivery_evidence_class"),
  concentrationScore: numeric("concentration_score", { precision: 5, scale: 4 }), // HHI contribution
  substitutabilityScore: numeric("substitutability_score", { precision: 5, scale: 4 }),
  riskScore: numeric("risk_score", { precision: 5, scale: 2 }), // 0..100
  linkedRiskIds: jsonb("linked_risk_ids").$type<string[]>().notNull().default([]),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  notes: text("notes").notNull().default(""),
});

// ---------------------------------------------------------------------------
// Privacy guardrails (Part 09 scopes stand-in): who may view per-person metrics
// ---------------------------------------------------------------------------

export const scopeEnum = pgEnum("eco_scope", ["self", "manager", "hr_admin", "exec"]);

export const personMetricGrants = pgTable(
  "eco_person_metric_grants",
  {
    id: id(),
    personId: text("person_id").notNull(),
    granteeUserId: text("grantee_user_id").notNull(),
    scope: scopeEnum("scope").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqGrant: uniqueIndex("eco_person_metric_grants_uniq").on(
      table.personId,
      table.granteeUserId,
    ),
  }),
);
