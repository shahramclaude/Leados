// LEADOS Part 01 — the event catalog. This is the ontology: the complete,
// documented list of every event type any domain may emit. Later parts
// EXTEND this file (add new types, add new versions in eventSchema.ts); they
// must never fork it into a second, competing list.
//
// Domains (from the Part 00/01 audit — see docs/AUDIT-2026.md):
//   people, finance, strategy, execution, rd_product, sales_customers,
//   knowledge, manufacturing_ops — plus two cross-cutting namespaces,
//   `privacy` (erasure/compliance) and `system` (export/import/admin).
//
// Every event type string is "<domain>.<past_tense_fact>" (never a command/
// verb-first name — events describe something that already happened).

export const DOMAINS = [
  "people",
  "finance",
  "strategy",
  "execution",
  "rd_product",
  "sales_customers",
  "knowledge",
  "manufacturing_ops",
  "privacy",
  "system",
] as const;

export type Domain = (typeof DOMAINS)[number];

/** The complete, closed list of event type identifiers. */
export const EVENT_TYPE_IDS = [
  // ---- people ---------------------------------------------------------
  "people.person_added",
  "people.flight_risk_changed",
  "people.role_changed",
  // ---- finance ----------------------------------------------------------
  "finance.burn_updated",
  "finance.invoice_raised",
  "finance.expense_recorded",
  // ---- strategy -----------------------------------------------------
  "strategy.initiative_created",
  "strategy.initiative_status_changed",
  "strategy.okr_progress_recorded",
  // ---- execution ------------------------------------------------------
  "execution.task_created",
  "execution.task_completed",
  "execution.sprint_velocity_recorded",
  // ---- rd_product -----------------------------------------------------
  "rd_product.feature_proposed",
  "rd_product.experiment_result_logged",
  "rd_product.roadmap_item_scheduled",
  // ---- sales_customers --------------------------------------------------
  "sales.deal_created",
  "sales.deal_stage_changed",
  "sales.customer_health_scored",
  // ---- knowledge ------------------------------------------------------
  "knowledge.doc_published",
  "knowledge.doc_viewed",
  "knowledge.doc_flagged_outdated",
  // ---- manufacturing_ops ------------------------------------------------
  "manufacturing.batch_started",
  "manufacturing.batch_completed",
  "manufacturing.downtime_logged",
  // ---- privacy (cross-cutting) -----------------------------------------
  "privacy.person_erased",
  // ---- system (cross-cutting) --------------------------------------------
  "system.export_performed",
  "system.import_performed",
] as const;

export type EventTypeId = (typeof EVENT_TYPE_IDS)[number];

export type RetentionPolicy = {
  /** How long the raw payload should remain fully readable before it becomes
   * a candidate for PII redaction. Does NOT mean deletion — events are
   * append-only; "retention" here means "candidate for a redaction
   * tombstone", surfaced by src/lib/platform/retention.ts for human review.
   */
  redactAfterDays: number;
  /** Whether this event type's payload can contain fields that identify a
   * natural person (name, assigneeId, viewerId, authorId, …). Drives which
   * projectors must implement erasure handling for `privacy.person_erased`.
   */
  containsPii: boolean;
};

export type EventCatalogEntry = {
  domain: Domain;
  description: string;
  /** Which UI surface or engine emits this event. */
  emittedBy: string;
  /** Which projector(s) fold this event into a read model. */
  consumedBy: string[];
  /** Name of the entity field in the payload that becomes `entityId`. */
  entityIdField: string;
  /** If true, every append of this type also writes an outbox row (Part 12
   * realtime/notification consumer). */
  notify: boolean;
  retention: RetentionPolicy;
};

export const EVENT_CATALOG: Record<EventTypeId, EventCatalogEntry> = {
  "people.person_added": {
    domain: "people",
    description: "A new person was added to the roster.",
    emittedBy: "People UI — Add Person form",
    consumedBy: ["peopleRoster"],
    entityIdField: "personId",
    notify: false,
    retention: { redactAfterDays: 365 * 2, containsPii: true },
  },
  "people.flight_risk_changed": {
    domain: "people",
    description:
      "A person's flight-risk assessment changed (manager judgement or model inference).",
    emittedBy: "People UI — flight risk editor / retention risk model",
    consumedBy: ["peopleFlightRisk", "cockpit"],
    entityIdField: "personId",
    notify: true,
    retention: { redactAfterDays: 365 * 2, containsPii: false },
  },
  "people.role_changed": {
    domain: "people",
    description: "A person's role or title changed.",
    emittedBy: "People UI — role editor",
    consumedBy: ["peopleRoster"],
    entityIdField: "personId",
    notify: false,
    retention: { redactAfterDays: 365 * 2, containsPii: false },
  },
  "finance.burn_updated": {
    domain: "finance",
    description: "The org's monthly burn and cash-on-hand were updated.",
    emittedBy: "Finance UI — burn entry / finance import",
    consumedBy: ["financeBurn", "cockpit"],
    entityIdField: "orgId",
    notify: true,
    retention: { redactAfterDays: 365 * 7, containsPii: false },
  },
  "finance.invoice_raised": {
    domain: "finance",
    description:
      "An invoice was raised against a customer. The event's aggregate (entityId) is the org-level finance ledger (orgId); invoiceId is carried in the payload for reference/lookup, not used as the projection key, so this rolls up into the same financeBurn row as burn_updated.",
    emittedBy: "Finance UI — invoicing",
    consumedBy: ["financeBurn"],
    entityIdField: "orgId",
    notify: false,
    retention: { redactAfterDays: 365 * 7, containsPii: false },
  },
  "finance.expense_recorded": {
    domain: "finance",
    description:
      "An expense was recorded. Aggregate (entityId) is the org-level finance ledger (orgId); expenseId is carried in the payload, not used as the projection key — see finance.invoice_raised for the same rationale.",
    emittedBy: "Finance UI — expense entry",
    consumedBy: ["financeBurn"],
    entityIdField: "orgId",
    notify: false,
    retention: { redactAfterDays: 365 * 7, containsPii: false },
  },
  "strategy.initiative_created": {
    domain: "strategy",
    description: "A strategic initiative was created.",
    emittedBy: "Strategy UI — initiative planner",
    consumedBy: ["strategyInitiative"],
    entityIdField: "initiativeId",
    notify: false,
    retention: { redactAfterDays: 365 * 3, containsPii: false },
  },
  "strategy.initiative_status_changed": {
    domain: "strategy",
    description: "A strategic initiative's RAG status changed.",
    emittedBy: "Strategy UI — initiative status update",
    consumedBy: ["strategyInitiative", "cockpit"],
    entityIdField: "initiativeId",
    notify: true,
    retention: { redactAfterDays: 365 * 3, containsPii: false },
  },
  "strategy.okr_progress_recorded": {
    domain: "strategy",
    description:
      "Progress against an OKR tied to an initiative was recorded. Aggregate (entityId) is the parent initiativeId so progress rolls up into the initiative's projection row; okrId is carried in the payload to key the per-OKR map inside that row.",
    emittedBy: "Strategy UI — OKR tracker",
    consumedBy: ["strategyInitiative"],
    entityIdField: "initiativeId",
    notify: false,
    retention: { redactAfterDays: 365 * 3, containsPii: false },
  },
  "execution.task_created": {
    domain: "execution",
    description: "A delivery task was created.",
    emittedBy: "Execution UI — task board",
    consumedBy: ["executionBoard"],
    entityIdField: "taskId",
    notify: false,
    retention: { redactAfterDays: 365, containsPii: true },
  },
  "execution.task_completed": {
    domain: "execution",
    description: "A delivery task was completed.",
    emittedBy: "Execution UI — task board",
    consumedBy: ["executionBoard"],
    entityIdField: "taskId",
    notify: false,
    retention: { redactAfterDays: 365, containsPii: false },
  },
  "execution.sprint_velocity_recorded": {
    domain: "execution",
    description: "A team's sprint velocity was recorded.",
    emittedBy: "Execution UI — sprint retro form",
    consumedBy: ["executionBoard"],
    entityIdField: "sprintId",
    notify: false,
    retention: { redactAfterDays: 365, containsPii: false },
  },
  "rd_product.feature_proposed": {
    domain: "rd_product",
    description: "A product/R&D feature was proposed.",
    emittedBy: "R&D UI — feature intake form",
    consumedBy: ["rdProductRoadmap"],
    entityIdField: "featureId",
    notify: false,
    retention: { redactAfterDays: 365 * 3, containsPii: true },
  },
  "rd_product.experiment_result_logged": {
    domain: "rd_product",
    description: "The result of a product experiment was logged.",
    emittedBy: "R&D UI — experiment tracker",
    consumedBy: ["rdProductRoadmap"],
    entityIdField: "experimentId",
    notify: false,
    retention: { redactAfterDays: 365 * 3, containsPii: false },
  },
  "rd_product.roadmap_item_scheduled": {
    domain: "rd_product",
    description: "A roadmap item was scheduled into a quarter.",
    emittedBy: "R&D UI — roadmap planner",
    consumedBy: ["rdProductRoadmap"],
    entityIdField: "itemId",
    notify: false,
    retention: { redactAfterDays: 365 * 3, containsPii: false },
  },
  "sales.deal_created": {
    domain: "sales_customers",
    description: "A sales deal entered the pipeline.",
    emittedBy: "Sales UI — CRM pipeline",
    consumedBy: ["salesPipeline"],
    entityIdField: "dealId",
    notify: false,
    retention: { redactAfterDays: 365 * 5, containsPii: false },
  },
  "sales.deal_stage_changed": {
    domain: "sales_customers",
    description: "A sales deal moved to a new pipeline stage.",
    emittedBy: "Sales UI — CRM pipeline",
    consumedBy: ["salesPipeline", "cockpit"],
    entityIdField: "dealId",
    notify: true,
    retention: { redactAfterDays: 365 * 5, containsPii: false },
  },
  "sales.customer_health_scored": {
    domain: "sales_customers",
    description: "A customer's health score was (re)computed.",
    emittedBy: "Sales UI — customer health model",
    consumedBy: ["salesPipeline", "cockpit"],
    entityIdField: "customerId",
    notify: true,
    retention: { redactAfterDays: 365 * 5, containsPii: false },
  },
  "knowledge.doc_published": {
    domain: "knowledge",
    description: "A knowledge-base document was published.",
    emittedBy: "Knowledge UI — doc editor",
    consumedBy: ["knowledgeActivity"],
    entityIdField: "docId",
    notify: false,
    retention: { redactAfterDays: 365 * 3, containsPii: true },
  },
  "knowledge.doc_viewed": {
    domain: "knowledge",
    description:
      "A document view was observed (analytics fact; carries confidence).",
    emittedBy: "Knowledge UI — view beacon",
    consumedBy: ["knowledgeActivity"],
    entityIdField: "docId",
    notify: false,
    retention: { redactAfterDays: 180, containsPii: true },
  },
  "knowledge.doc_flagged_outdated": {
    domain: "knowledge",
    description: "A document was flagged as outdated.",
    emittedBy: "Knowledge UI — flag action",
    consumedBy: ["knowledgeActivity"],
    entityIdField: "docId",
    notify: false,
    retention: { redactAfterDays: 365 * 3, containsPii: true },
  },
  "manufacturing.batch_started": {
    domain: "manufacturing_ops",
    description: "A production batch started on a line.",
    emittedBy: "Ops UI — line control / MES import",
    consumedBy: ["manufacturingThroughput"],
    entityIdField: "batchId",
    notify: false,
    retention: { redactAfterDays: 365 * 3, containsPii: false },
  },
  "manufacturing.batch_completed": {
    domain: "manufacturing_ops",
    description: "A production batch completed on a line.",
    emittedBy: "Ops UI — line control / MES import",
    consumedBy: ["manufacturingThroughput"],
    entityIdField: "batchId",
    notify: false,
    retention: { redactAfterDays: 365 * 3, containsPii: false },
  },
  "manufacturing.downtime_logged": {
    domain: "manufacturing_ops",
    description: "Unplanned downtime was logged against a line.",
    emittedBy: "Ops UI — downtime log",
    consumedBy: ["manufacturingThroughput", "cockpit"],
    entityIdField: "line",
    notify: true,
    retention: { redactAfterDays: 365 * 3, containsPii: false },
  },
  "privacy.person_erased": {
    domain: "privacy",
    description:
      "A person-level erasure request was carried out (payload-scrub tombstone, not a row delete).",
    emittedBy: "Admin UI — privacy & erasure panel",
    consumedBy: ["peopleRoster", "peopleFlightRisk"],
    entityIdField: "personId",
    notify: true,
    retention: { redactAfterDays: 365 * 7, containsPii: false },
  },
  "system.export_performed": {
    domain: "system",
    description: "A full data export was performed.",
    emittedBy: "Admin UI / API — /api/export",
    consumedBy: [],
    entityIdField: "exportId",
    notify: true,
    retention: { redactAfterDays: 365 * 7, containsPii: false },
  },
  "system.import_performed": {
    domain: "system",
    description: "A data import was committed.",
    emittedBy: "Admin UI / API — /api/import",
    consumedBy: [],
    entityIdField: "importId",
    notify: true,
    retention: { redactAfterDays: 365 * 7, containsPii: false },
  },
};

export function isKnownEventType(type: string): type is EventTypeId {
  return Object.prototype.hasOwnProperty.call(EVENT_CATALOG, type);
}
