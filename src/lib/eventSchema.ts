// Form schema for manually logging intelligence events.
// Field set mirrors the event-type payload shapes from the pasted pt-O spec's
// "New Event Types for Wargaming" section, plus the supporting event types
// the wargame engine itself reads (competitor.logged, cs.health.logged, etc.).
// Original to this build.

export type FieldType = "text" | "textarea" | "number" | "select" | "tags" | "boolean" | "scale5";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  placeholder?: string;
  required?: boolean;
}

export interface EventTypeDef {
  type: string;
  label: string;
  group: string;
  description: string;
  fields: FieldDef[];
}

export const EVENT_GROUPS = [
  "Wargaming",
  "Strategic intelligence",
  "M&A",
  "Regulatory",
  "Organizational design",
  "Technology landscape",
  "Stakeholders",
  "Ecosystem",
  "Competitive intel (supporting)",
  "Customer intel (supporting)",
  "Operating data (supporting)",
] as const;

export const EVENT_TYPES: EventTypeDef[] = [
  // --- Wargaming ---
  {
    type: "wargame.result",
    label: "Wargame result / retro",
    group: "Wargaming",
    description: "Record a learning or strategy implication from a completed wargame.",
    fields: [
      { key: "scenarioId", label: "Scenario reference", type: "text" },
      { key: "verdict", label: "Verdict", type: "textarea" },
      { key: "keyLearning", label: "Key learning", type: "textarea" },
      { key: "strategyImplication", label: "Strategy implication", type: "textarea" },
    ],
  },
  // --- Strategic intelligence ---
  {
    type: "intel.signal",
    label: "Intelligence signal",
    group: "Strategic intelligence",
    description: "Log a piece of raw intelligence — OSINT, customer, partner, employee, or analyst sourced.",
    fields: [
      { key: "type", label: "Source type", type: "select", options: ["OSINT", "customer", "partner", "employee", "analyst"], required: true },
      { key: "source", label: "Source", type: "text", placeholder: "e.g. QBR call, job posting, analyst note" },
      { key: "content", label: "Content", type: "textarea", required: true },
      { key: "reliability", label: "Reliability (1–5)", type: "scale5" },
      { key: "implications", label: "Implications", type: "tags", placeholder: "comma-separated" },
    ],
  },
  {
    type: "intel.confirmed",
    label: "Intelligence confirmed",
    group: "Strategic intelligence",
    description: "Mark a prior signal as confirmed by a second source.",
    fields: [
      { key: "signalId", label: "Signal reference", type: "text" },
      { key: "confirmation", label: "Confirmation detail", type: "textarea" },
      { key: "source", label: "Confirming source", type: "text" },
    ],
  },
  {
    type: "intel.invalidated",
    label: "Intelligence invalidated",
    group: "Strategic intelligence",
    description: "Mark a prior signal as invalidated.",
    fields: [
      { key: "signalId", label: "Signal reference", type: "text" },
      { key: "reason", label: "Reason", type: "textarea" },
    ],
  },
  // --- M&A ---
  {
    type: "ma.target.logged",
    label: "M&A target",
    group: "M&A",
    description: "Log a potential acquisition target.",
    fields: [
      { key: "name", label: "Target name", type: "text", required: true },
      { key: "rationale", label: "Rationale", type: "textarea" },
      { key: "synergies", label: "Synergies", type: "tags" },
      { key: "risks", label: "Risks", type: "tags" },
      { key: "estimatedValue", label: "Estimated value ($)", type: "number" },
      { key: "status", label: "Status", type: "select", options: ["exploring", "active", "paused", "terminated"] },
    ],
  },
  {
    type: "ma.diligence.item",
    label: "M&A diligence item",
    group: "M&A",
    description: "Log a diligence finding against a target.",
    fields: [
      { key: "targetId", label: "Target reference", type: "text" },
      { key: "area", label: "Area", type: "text", placeholder: "e.g. legal, tech, culture" },
      { key: "finding", label: "Finding", type: "textarea" },
      { key: "severity", label: "Severity (1–5)", type: "scale5" },
      { key: "dealBreaker", label: "Deal-breaker?", type: "boolean" },
    ],
  },
  {
    type: "ma.decision",
    label: "M&A decision",
    group: "M&A",
    description: "Record a go/pause/terminate decision on a target.",
    fields: [
      { key: "targetId", label: "Target reference", type: "text" },
      { key: "outcome", label: "Outcome", type: "select", options: ["proceed", "pause", "terminate"] },
      { key: "rationale", label: "Rationale", type: "textarea" },
    ],
  },
  // --- Regulatory ---
  {
    type: "reg.jurisdiction",
    label: "Regulatory jurisdiction",
    group: "Regulatory",
    description: "Log a jurisdiction to watch.",
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "region", label: "Region", type: "text" },
      { key: "type", label: "Type", type: "select", options: ["national", "state", "supranational"] },
      { key: "relevantFrameworks", label: "Relevant frameworks", type: "tags" },
      { key: "watchLevel", label: "Watch level (1–5)", type: "scale5" },
    ],
  },
  {
    type: "reg.interpretation",
    label: "Regulatory interpretation",
    group: "Regulatory",
    description: "Log your organization's interpretation of a framework.",
    fields: [
      { key: "framework", label: "Framework", type: "text" },
      { key: "jurisdiction", label: "Jurisdiction", type: "text" },
      { key: "ourInterpretation", label: "Our interpretation", type: "textarea" },
      { key: "legalCounselReviewed", label: "Legal counsel reviewed?", type: "boolean" },
    ],
  },
  // --- Org design ---
  {
    type: "org.design.scenario",
    label: "Org design scenario",
    group: "Organizational design",
    description: "Log a structural change hypothesis.",
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "currentStructure", label: "Current structure", type: "textarea" },
      { key: "proposedStructure", label: "Proposed structure", type: "textarea" },
      { key: "hypothesis", label: "Hypothesis", type: "textarea" },
      { key: "expectedOutcome", label: "Expected outcome", type: "textarea" },
      { key: "cost_est", label: "Estimated cost ($)", type: "number" },
    ],
  },
  {
    type: "org.design.decided",
    label: "Org design decision",
    group: "Organizational design",
    description: "Record adoption or rejection of a design scenario.",
    fields: [
      { key: "scenarioId", label: "Scenario reference", type: "text" },
      { key: "outcome", label: "Outcome", type: "select", options: ["adopted", "rejected"] },
      { key: "rationale", label: "Rationale", type: "textarea" },
    ],
  },
  // --- Tech ---
  {
    type: "tech.disruption",
    label: "Technology disruption watch",
    group: "Technology landscape",
    description: "Log an emerging or shifting technology relevant to the business.",
    fields: [
      { key: "technology", label: "Technology", type: "text", required: true },
      { key: "maturityLevel", label: "Maturity", type: "select", options: ["emerging", "growing", "mainstream", "declining"] },
      { key: "relevanceToUs", label: "Relevance to us (1–5)", type: "scale5" },
      { key: "timeHorizon_months", label: "Time horizon (months)", type: "number" },
      { key: "threatOrOpportunity", label: "Threat or opportunity", type: "select", options: ["threat", "opportunity", "both"] },
    ],
  },
  {
    type: "tech.assessment",
    label: "Technology capability assessment",
    group: "Technology landscape",
    description: "Compare our capability to competitors on a tracked technology.",
    fields: [
      { key: "technologyId", label: "Technology reference", type: "text" },
      { key: "ourCapability", label: "Our capability (1–5)", type: "scale5" },
      { key: "competitorCapability", label: "Competitor capability (1–5)", type: "scale5" },
      { key: "investmentDecision", label: "Investment decision", type: "select", options: ["watch", "experiment", "invest", "lead"] },
    ],
  },
  // --- Stakeholders ---
  {
    type: "stakeholder.mapped",
    label: "Stakeholder",
    group: "Stakeholders",
    description: "Map a stakeholder's influence and alignment.",
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "type", label: "Type", type: "select", options: ["investor", "board", "customer", "regulator", "partner", "media", "employee", "community"] },
      { key: "influence", label: "Influence (1–5)", type: "scale5" },
      { key: "alignment", label: "Alignment (1–5)", type: "scale5" },
      { key: "engagementFrequency", label: "Engagement frequency", type: "text" },
    ],
  },
  {
    type: "stakeholder.engaged",
    label: "Stakeholder engagement",
    group: "Stakeholders",
    description: "Log an interaction with a stakeholder.",
    fields: [
      { key: "stakeholderId", label: "Stakeholder reference", type: "text" },
      { key: "outcome", label: "Outcome", type: "select", options: ["positive", "neutral", "negative"] },
      { key: "note", label: "Note", type: "textarea" },
      { key: "followUp", label: "Follow-up", type: "text" },
    ],
  },
  {
    type: "stakeholder.risk",
    label: "Stakeholder risk",
    group: "Stakeholders",
    description: "Log a concern tied to a stakeholder.",
    fields: [
      { key: "stakeholderId", label: "Stakeholder reference", type: "text" },
      { key: "concern", label: "Concern", type: "textarea" },
      { key: "severity", label: "Severity (1–5)", type: "scale5" },
      { key: "mitigation", label: "Mitigation", type: "textarea" },
    ],
  },
  // --- Ecosystem ---
  {
    type: "ecosystem.map",
    label: "Ecosystem relationship",
    group: "Ecosystem",
    description: "Map a player in your ecosystem.",
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "role", label: "Role", type: "select", options: ["platform", "complement", "substitute", "enabler", "distributor"] },
      { key: "strength", label: "Strength", type: "select", options: ["strong", "moderate", "weak"] },
      { key: "trend", label: "Trend", type: "select", options: ["growing", "stable", "declining"] },
    ],
  },
  {
    type: "ecosystem.event",
    label: "Ecosystem event",
    group: "Ecosystem",
    description: "Log a shift in the ecosystem.",
    fields: [
      { key: "ecosystemId", label: "Ecosystem reference", type: "text" },
      { key: "type", label: "Type", type: "select", options: ["entry", "exit", "shift", "disruption"] },
      { key: "impact", label: "Impact (1–5)", type: "scale5" },
    ],
  },
  // --- Competitive intel (supporting) ---
  {
    type: "competitor.logged",
    label: "Competitor move",
    group: "Competitive intel (supporting)",
    description: "This is the core red-team feed the wargame engine reads.",
    fields: [
      { key: "name", label: "Competitor name", type: "text", required: true },
      { key: "category", label: "Category", type: "select", options: ["pricing", "product", "marketing", "hiring", "partnership", "expansion"] },
      { key: "description", label: "What happened", type: "textarea" },
      { key: "response_needed", label: "Response needed?", type: "boolean" },
    ],
  },
  {
    type: "market.signal",
    label: "Market signal",
    group: "Competitive intel (supporting)",
    description: "A market-level observation, not a competitor-specific move.",
    fields: [
      { key: "title", label: "Title", type: "text", required: true },
      { key: "description", label: "Description", type: "textarea" },
    ],
  },
  // --- Customer intel (supporting) ---
  {
    type: "cs.health.logged",
    label: "Account health score",
    group: "Customer intel (supporting)",
    description: "Feeds the green-team / at-risk-account read.",
    fields: [
      { key: "accountName", label: "Account", type: "text", required: true },
      { key: "score", label: "Health score (1–5)", type: "scale5" },
    ],
  },
  {
    type: "win.loss.logged",
    label: "Win/loss reason",
    group: "Customer intel (supporting)",
    description: "Feeds green-team win/loss reason tallies.",
    fields: [
      { key: "result", label: "Result", type: "select", options: ["win", "loss"] },
      { key: "primary_reason", label: "Primary reason", type: "text" },
      { key: "dealName", label: "Deal", type: "text" },
    ],
  },
  {
    type: "customer.pain",
    label: "Customer pain point",
    group: "Customer intel (supporting)",
    description: "Feeds the top-pains list used in wargame customer-reaction modeling.",
    fields: [
      { key: "title", label: "Pain point", type: "text", required: true },
      { key: "frequency", label: "Frequency (1–5)", type: "scale5" },
      { key: "severity", label: "Severity (1–5)", type: "scale5" },
    ],
  },
  // --- Operating data (supporting) ---
  {
    type: "fin.kpi.logged",
    label: "Financial / product KPI",
    group: "Operating data (supporting)",
    description: "Generic metric logger, e.g. gross_margin_pct, nps_score.",
    fields: [
      { key: "metric", label: "Metric name", type: "text", required: true, placeholder: "gross_margin_pct" },
      { key: "value", label: "Value", type: "number", required: true },
    ],
  },
  {
    type: "fin.runway.logged",
    label: "Runway",
    group: "Operating data (supporting)",
    description: "Months of runway remaining.",
    fields: [{ key: "months", label: "Months", type: "number", required: true }],
  },
  {
    type: "ops.incident.logged",
    label: "Operational incident",
    group: "Operating data (supporting)",
    description: "",
    fields: [
      { key: "title", label: "Title", type: "text", required: true },
      { key: "severity", label: "Severity (1–5)", type: "scale5" },
    ],
  },
  {
    type: "hr.attrition.logged",
    label: "Attrition event",
    group: "Operating data (supporting)",
    description: "",
    fields: [
      { key: "personName", label: "Person / role", type: "text" },
      { key: "reason", label: "Reason", type: "text" },
    ],
  },
  {
    type: "partnership.logged",
    label: "Partnership status",
    group: "Operating data (supporting)",
    description: "",
    fields: [
      { key: "name", label: "Partnership", type: "text", required: true },
      { key: "status", label: "Status", type: "select", options: ["active", "dormant", "ended"] },
    ],
  },
];

export function getEventType(type: string): EventTypeDef | undefined {
  return EVENT_TYPES.find((e) => e.type === type);
}
