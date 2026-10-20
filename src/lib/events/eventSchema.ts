// LEADOS Part 01 — versioned payload schemas + upcaster chains.
//
// Every event type has one zod schema PER VERSION it has ever had. Reading
// code never deals with old shapes directly: `toCurrent()` below runs the
// stored payload through the upcaster chain (v1 -> v2 -> ... -> current) and
// returns the current shape, validated against the current schema. Writing
// code always writes the current version (schemaVersion is stamped by
// src/lib/eventStore.ts, callers never choose it).
//
// To add a new field in a backward-incompatible way in a later part:
//   1. Add `3: z.object({...})` to the type's `versions` map.
//   2. Add an upcaster `2: (v2Payload) => v3Payload` to `upcasters`.
//   3. Bump nothing else — `currentVersion` is derived automatically.
// Old rows keep their original `schema_version` column value forever; only
// the *read* path advances them.

import { z } from "zod";
import type { EventTypeId } from "./eventCatalog";
import { EVENT_TYPE_IDS } from "./eventCatalog";

// ---------------------------------------------------------------------------
// Per-type version maps
// ---------------------------------------------------------------------------

const peoplePersonAddedV1 = z.object({
  personId: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  team: z.string().min(1),
  startDate: z.string(), // ISO date
});

const peopleFlightRiskV1 = z.object({
  personId: z.string().min(1),
  riskLevel: z.enum(["low", "medium", "high"]),
  reason: z.string().min(1),
});
const peopleFlightRiskV2 = peopleFlightRiskV1.extend({
  score: z.number().min(0).max(1),
  previousLevel: z.enum(["low", "medium", "high"]).nullable(),
});

const peopleRoleChangedV1 = z.object({
  personId: z.string().min(1),
  fromRole: z.string().min(1),
  toRole: z.string().min(1),
  effectiveDate: z.string(),
});

const financeBurnUpdatedV1 = z.object({
  monthlyBurnUsd: z.number().nonnegative(),
  cashOnHandUsd: z.number().nonnegative(),
});
const financeBurnUpdatedV2 = financeBurnUpdatedV1.extend({
  runwayMonths: z.number().nonnegative(),
});

const financeInvoiceRaisedV1 = z.object({
  invoiceId: z.string().min(1),
  customerId: z.string().min(1),
  amountUsd: z.number().positive(),
  dueDate: z.string(),
});

const financeExpenseRecordedV1 = z.object({
  expenseId: z.string().min(1),
  category: z.string().min(1),
  amountUsd: z.number().positive(),
  incurredAt: z.string(),
});

const strategyInitiativeCreatedV1 = z.object({
  initiativeId: z.string().min(1),
  title: z.string().min(1),
  owner: z.string().min(1),
  quarter: z.string().min(1),
});

const strategyInitiativeStatusChangedV1 = z.object({
  initiativeId: z.string().min(1),
  status: z.enum(["on_track", "at_risk", "off_track"]),
  note: z.string().optional(),
});

const strategyOkrProgressRecordedV1 = z.object({
  okrId: z.string().min(1),
  initiativeId: z.string().min(1),
  progressPct: z.number().min(0).max(100),
});

const executionTaskCreatedV1 = z.object({
  taskId: z.string().min(1),
  title: z.string().min(1),
  assigneeId: z.string().min(1),
  dueDate: z.string(),
});

const executionTaskCompletedV1 = z.object({
  taskId: z.string().min(1),
  completedAt: z.string(),
});

const executionSprintVelocityRecordedV1 = z.object({
  teamId: z.string().min(1),
  sprintId: z.string().min(1),
  velocityPoints: z.number().nonnegative(),
});

const rdFeatureProposedV1 = z.object({
  featureId: z.string().min(1),
  title: z.string().min(1),
  proposedBy: z.string().min(1),
});

const rdExperimentResultLoggedV1 = z.object({
  experimentId: z.string().min(1),
  featureId: z.string().min(1),
  outcome: z.enum(["positive", "neutral", "negative"]),
  metricDelta: z.number(),
});

const rdRoadmapItemScheduledV1 = z.object({
  itemId: z.string().min(1),
  quarter: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

const salesDealCreatedV1 = z.object({
  dealId: z.string().min(1),
  customerId: z.string().min(1),
  stage: z.string().min(1),
  amountUsd: z.number().nonnegative(),
});

const salesDealStageChangedV1 = z.object({
  dealId: z.string().min(1),
  fromStage: z.string().min(1),
  toStage: z.string().min(1),
});

const salesCustomerHealthScoredV1 = z.object({
  customerId: z.string().min(1),
  healthScore: z.number().min(0).max(100),
  driver: z.string().min(1),
});

const knowledgeDocPublishedV1 = z.object({
  docId: z.string().min(1),
  title: z.string().min(1),
  authorId: z.string().min(1),
  space: z.string().min(1),
});

const knowledgeDocViewedV1 = z.object({
  docId: z.string().min(1),
  viewerId: z.string().min(1),
});

const knowledgeDocFlaggedOutdatedV1 = z.object({
  docId: z.string().min(1),
  flaggedBy: z.string().min(1),
  reason: z.string().min(1),
});

const manufacturingBatchStartedV1 = z.object({
  batchId: z.string().min(1),
  line: z.string().min(1),
  sku: z.string().min(1),
  plannedUnits: z.number().positive(),
});

const manufacturingBatchCompletedV1 = z.object({
  batchId: z.string().min(1),
  actualUnits: z.number().nonnegative(),
  defectUnits: z.number().nonnegative(),
});

const manufacturingDowntimeLoggedV1 = z.object({
  line: z.string().min(1),
  minutes: z.number().positive(),
  cause: z.string().min(1),
});

const privacyPersonErasedV1 = z.object({
  personId: z.string().min(1),
  requestedBy: z.string().min(1),
  method: z.literal("tombstone-scrub"),
});

const systemExportPerformedV1 = z.object({
  exportId: z.string().min(1),
  requestedBy: z.string().min(1),
  scope: z.string().min(1),
});

const systemImportPerformedV1 = z.object({
  importId: z.string().min(1),
  requestedBy: z.string().min(1),
  summary: z.object({
    inserted: z.number().nonnegative(),
    skippedExisting: z.number().nonnegative(),
  }),
});

// ---------------------------------------------------------------------------
// Registry plumbing
// ---------------------------------------------------------------------------

type ZodAny = z.ZodType<any, any>;

type SchemaDef = {
  versions: Record<number, ZodAny>;
  // key = fromVersion, value = fn that turns that version's payload into
  // (fromVersion + 1)'s payload.
  upcasters: Record<number, (payload: any) => any>;
  currentVersion: number;
  /** A valid v1 fixture, used by seed data and the upcaster regression test. */
  v1Fixture: unknown;
};

function def(
  versions: Record<number, ZodAny>,
  upcasters: Record<number, (payload: any) => any>,
  v1Fixture: unknown,
): SchemaDef {
  const currentVersion = Math.max(...Object.keys(versions).map(Number));
  return { versions, upcasters, currentVersion, v1Fixture };
}

export const EVENT_SCHEMA_REGISTRY: Record<EventTypeId, SchemaDef> = {
  "people.person_added": def(
    { 1: peoplePersonAddedV1 },
    {},
    {
      personId: "person_synthetic_001",
      name: "Ada Synthetic",
      role: "Staff Engineer",
      team: "Platform",
      startDate: "2024-01-15",
    },
  ),
  "people.flight_risk_changed": def(
    { 1: peopleFlightRiskV1, 2: peopleFlightRiskV2 },
    {
      1: (p: z.infer<typeof peopleFlightRiskV1>) => ({
        ...p,
        score: p.riskLevel === "high" ? 0.8 : p.riskLevel === "medium" ? 0.5 : 0.2,
        previousLevel: null,
      }),
    },
    {
      personId: "person_synthetic_001",
      riskLevel: "medium",
      reason: "Synthetic seed fixture for upcaster test",
    },
  ),
  "people.role_changed": def(
    { 1: peopleRoleChangedV1 },
    {},
    {
      personId: "person_synthetic_001",
      fromRole: "Senior Engineer",
      toRole: "Staff Engineer",
      effectiveDate: "2025-01-01",
    },
  ),
  "finance.burn_updated": def(
    { 1: financeBurnUpdatedV1, 2: financeBurnUpdatedV2 },
    {
      1: (p: z.infer<typeof financeBurnUpdatedV1>) => ({
        ...p,
        runwayMonths:
          p.monthlyBurnUsd > 0
            ? Math.round((p.cashOnHandUsd / p.monthlyBurnUsd) * 10) / 10
            : 0,
      }),
    },
    { monthlyBurnUsd: 120000, cashOnHandUsd: 1800000 },
  ),
  "finance.invoice_raised": def(
    { 1: financeInvoiceRaisedV1 },
    {},
    {
      invoiceId: "inv_synthetic_001",
      customerId: "cust_synthetic_001",
      amountUsd: 24000,
      dueDate: "2026-03-01",
    },
  ),
  "finance.expense_recorded": def(
    { 1: financeExpenseRecordedV1 },
    {},
    {
      expenseId: "exp_synthetic_001",
      category: "cloud_infra",
      amountUsd: 8200,
      incurredAt: "2026-01-20",
    },
  ),
  "strategy.initiative_created": def(
    { 1: strategyInitiativeCreatedV1 },
    {},
    {
      initiativeId: "init_synthetic_001",
      title: "Synthetic expansion initiative",
      owner: "person_synthetic_002",
      quarter: "2026-Q1",
    },
  ),
  "strategy.initiative_status_changed": def(
    { 1: strategyInitiativeStatusChangedV1 },
    {},
    {
      initiativeId: "init_synthetic_001",
      status: "at_risk",
      note: "Synthetic fixture",
    },
  ),
  "strategy.okr_progress_recorded": def(
    { 1: strategyOkrProgressRecordedV1 },
    {},
    {
      okrId: "okr_synthetic_001",
      initiativeId: "init_synthetic_001",
      progressPct: 42,
    },
  ),
  "execution.task_created": def(
    { 1: executionTaskCreatedV1 },
    {},
    {
      taskId: "task_synthetic_001",
      title: "Synthetic onboarding task",
      assigneeId: "person_synthetic_001",
      dueDate: "2026-02-01",
    },
  ),
  "execution.task_completed": def(
    { 1: executionTaskCompletedV1 },
    {},
    { taskId: "task_synthetic_001", completedAt: "2026-01-30T10:00:00.000Z" },
  ),
  "execution.sprint_velocity_recorded": def(
    { 1: executionSprintVelocityRecordedV1 },
    {},
    { teamId: "team_synthetic_platform", sprintId: "sprint_synthetic_12", velocityPoints: 34 },
  ),
  "rd_product.feature_proposed": def(
    { 1: rdFeatureProposedV1 },
    {},
    {
      featureId: "feat_synthetic_001",
      title: "Synthetic bulk-import feature",
      proposedBy: "person_synthetic_002",
    },
  ),
  "rd_product.experiment_result_logged": def(
    { 1: rdExperimentResultLoggedV1 },
    {},
    {
      experimentId: "exp_rd_synthetic_001",
      featureId: "feat_synthetic_001",
      outcome: "positive",
      metricDelta: 0.06,
    },
  ),
  "rd_product.roadmap_item_scheduled": def(
    { 1: rdRoadmapItemScheduledV1 },
    {},
    { itemId: "road_synthetic_001", quarter: "2026-Q2", confidence: 0.7 },
  ),
  "sales.deal_created": def(
    { 1: salesDealCreatedV1 },
    {},
    {
      dealId: "deal_synthetic_001",
      customerId: "cust_synthetic_001",
      stage: "discovery",
      amountUsd: 56000,
    },
  ),
  "sales.deal_stage_changed": def(
    { 1: salesDealStageChangedV1 },
    {},
    { dealId: "deal_synthetic_001", fromStage: "discovery", toStage: "proposal" },
  ),
  "sales.customer_health_scored": def(
    { 1: salesCustomerHealthScoredV1 },
    {},
    { customerId: "cust_synthetic_001", healthScore: 72, driver: "usage_growth" },
  ),
  "knowledge.doc_published": def(
    { 1: knowledgeDocPublishedV1 },
    {},
    {
      docId: "doc_synthetic_001",
      title: "Synthetic runbook",
      authorId: "person_synthetic_002",
      space: "engineering",
    },
  ),
  "knowledge.doc_viewed": def(
    { 1: knowledgeDocViewedV1 },
    {},
    { docId: "doc_synthetic_001", viewerId: "person_synthetic_001" },
  ),
  "knowledge.doc_flagged_outdated": def(
    { 1: knowledgeDocFlaggedOutdatedV1 },
    {},
    {
      docId: "doc_synthetic_001",
      flaggedBy: "person_synthetic_001",
      reason: "References a deprecated synthetic API",
    },
  ),
  "manufacturing.batch_started": def(
    { 1: manufacturingBatchStartedV1 },
    {},
    {
      batchId: "batch_synthetic_001",
      line: "line_synthetic_a",
      sku: "sku_synthetic_001",
      plannedUnits: 500,
    },
  ),
  "manufacturing.batch_completed": def(
    { 1: manufacturingBatchCompletedV1 },
    {},
    { batchId: "batch_synthetic_001", actualUnits: 480, defectUnits: 6 },
  ),
  "manufacturing.downtime_logged": def(
    { 1: manufacturingDowntimeLoggedV1 },
    {},
    { line: "line_synthetic_a", minutes: 35, cause: "synthetic sensor fault" },
  ),
  "privacy.person_erased": def(
    { 1: privacyPersonErasedV1 },
    {},
    {
      personId: "person_synthetic_001",
      requestedBy: "person_synthetic_admin",
      method: "tombstone-scrub",
    },
  ),
  "system.export_performed": def(
    { 1: systemExportPerformedV1 },
    {},
    { exportId: "export_synthetic_001", requestedBy: "person_synthetic_admin", scope: "full" },
  ),
  "system.import_performed": def(
    { 1: systemImportPerformedV1 },
    {},
    {
      importId: "import_synthetic_001",
      requestedBy: "person_synthetic_admin",
      summary: { inserted: 0, skippedExisting: 0 },
    },
  ),
};

// Exhaustiveness guard: every catalog entry must have a registry entry and
// vice versa. Runs at module load (cheap, 27 entries) so a missing schema
// fails fast instead of at write time.
for (const id of EVENT_TYPE_IDS) {
  if (!EVENT_SCHEMA_REGISTRY[id]) {
    throw new Error(`eventSchema.ts: missing schema registration for "${id}"`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getCurrentVersion(type: EventTypeId): number {
  return EVENT_SCHEMA_REGISTRY[type].currentVersion;
}

/** Validate a payload that is about to be WRITTEN (must be current version). */
export function validateForWrite(type: EventTypeId, payload: unknown): unknown {
  const def = EVENT_SCHEMA_REGISTRY[type];
  const schema = def.versions[def.currentVersion];
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new Error(
      `Payload for "${type}" does not match current schema v${def.currentVersion}: ${result.error.message}`,
    );
  }
  return result.data;
}

/**
 * Upcast a stored payload from `fromVersion` to the current version, running
 * it through every intermediate upcaster and validating each intermediate
 * shape against its own schema. This is what every read path must call
 * before handing a payload to a projector or to the UI.
 */
export function toCurrent(
  type: EventTypeId,
  fromVersion: number,
  payload: unknown,
): { version: number; payload: unknown } {
  const def = EVENT_SCHEMA_REGISTRY[type];
  const fromSchema = def.versions[fromVersion];
  if (!fromSchema) {
    throw new Error(`Unknown schema version ${fromVersion} for event type "${type}"`);
  }
  let version = fromVersion;
  let current = fromSchema.parse(payload);
  while (version < def.currentVersion) {
    const upcast = def.upcasters[version];
    if (!upcast) {
      throw new Error(
        `Missing upcaster from v${version} to v${version + 1} for event type "${type}"`,
      );
    }
    current = upcast(current);
    version += 1;
    const nextSchema = def.versions[version];
    current = nextSchema.parse(current);
  }
  return { version, payload: current };
}

/** Returns the labelled-synthetic v1 fixture used for seeding/tests. */
export function getV1Fixture(type: EventTypeId): unknown {
  return EVENT_SCHEMA_REGISTRY[type].v1Fixture;
}

export type { SchemaDef };
