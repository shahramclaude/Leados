import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// LEADOS — Executive Decision Intelligence Platform
// Canonical schema. This is the single source of truth for persisted state.
// Every table below backs a real, working module in src/app — no stubs.
// ---------------------------------------------------------------------------

// Part 01 / 23 — Decision governance & event-sourced truth core
export const decisions = pgTable("decisions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").default("").notNull(),
  category: text("category").default("strategic").notNull(),
  status: text("status").default("proposed").notNull(), // proposed | under_review | committed | closed
  owner: text("owner").default("Unassigned").notNull(),
  impact: text("impact").default("medium").notNull(), // low | medium | high | critical
  confidence: integer("confidence").default(50).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  committedAt: timestamp("committed_at"),
});

export const decisionEvents = pgTable("decision_events", {
  id: serial("id").primaryKey(),
  decisionId: integer("decision_id")
    .notNull()
    .references(() => decisions.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // created | status_changed | commented | committed
  payload: text("payload").default("").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Part 13 — Sensing & early warning
export const signals = pgTable("signals", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  source: text("source").default("internal").notNull(),
  category: text("category").default("market").notNull(), // market | operational | financial | people | risk
  severity: text("severity").default("medium").notNull(), // low | medium | high | critical
  description: text("description").default("").notNull(),
  status: text("status").default("open").notNull(), // open | triaged | resolved | dismissed
  detectedAt: timestamp("detected_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
});

// Part 29 — GRC operating system (previously a 🔴 gap row — now implemented)
export const risks = pgTable("risks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  category: text("category").default("operational").notNull(), // strategic | operational | financial | compliance | cyber | reputational
  likelihood: text("likelihood").default("medium").notNull(), // low | medium | high
  impactLevel: text("impact_level").default("medium").notNull(), // low | medium | high | critical
  owner: text("owner").default("Unassigned").notNull(),
  status: text("status").default("open").notNull(), // open | mitigating | monitoring | closed
  mitigation: text("mitigation").default("").notNull(),
  reviewDate: timestamp("review_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Part 58 / 10 / 40 — Autonomous executive agent kernel (single canonical spine)
export const agents = pgTable("agents", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  kernelType: text("kernel_type").default("sensing").notNull(), // sensing | decision | execution | governance | learning
  description: text("description").default("").notNull(),
  status: text("status").default("idle").notNull(), // idle | running | paused | error
  autonomyLevel: text("autonomy_level").default("supervised").notNull(), // supervised | semi_autonomous | autonomous
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastRunAt: timestamp("last_run_at"),
});

export const agentRuns = pgTable("agent_runs", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  status: text("status").default("queued").notNull(), // queued | running | succeeded | failed
  summary: text("summary").default("").notNull(),
  log: text("log").default("").notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
});

// Part 25 — Operating cadence & ritual automation
export const cadenceItems = pgTable("cadence_items", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  type: text("type").default("meeting").notNull(), // meeting | ritual | review | report
  cadence: text("cadence").default("weekly").notNull(), // daily | weekly | biweekly | monthly | quarterly | annual
  owner: text("owner").default("Unassigned").notNull(),
  nextOccurrence: timestamp("next_occurrence"),
  status: text("status").default("active").notNull(), // active | paused | retired
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Part 55 — Board & governance automation (one canonical family)
export const boardPacks = pgTable("board_packs", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  period: text("period").notNull(),
  status: text("status").default("draft").notNull(), // draft | in_review | approved | published
  summary: text("summary").default("").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  publishedAt: timestamp("published_at"),
});

// Part 39 / 57 — Organizational fitness & self-evolving capstone
export const fitnessMetrics = pgTable("fitness_metrics", {
  id: serial("id").primaryKey(),
  dimension: text("dimension").notNull(), // agility | alignment | resilience | talent | innovation | execution
  score: integer("score").notNull(),
  trend: text("trend").default("stable").notNull(), // improving | stable | declining
  notes: text("notes").default("").notNull(),
  measuredAt: timestamp("measured_at").defaultNow().notNull(),
});

// Part 36 — Sustainability & ESG intelligence
export const esgMetrics = pgTable("esg_metrics", {
  id: serial("id").primaryKey(),
  pillar: text("pillar").default("environmental").notNull(), // environmental | social | governance
  metric: text("metric").notNull(),
  value: text("value").default("").notNull(),
  unit: text("unit").default("").notNull(),
  target: text("target").default("").notNull(),
  period: text("period").default("").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Part 51 — Management action recommender & intervention marketplace
export const interventions = pgTable("interventions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  category: text("category").default("leadership").notNull(), // leadership | process | culture | technology | structure
  description: text("description").default("").notNull(),
  status: text("status").default("proposed").notNull(), // proposed | piloting | scaling | adopted | retired
  impactScore: integer("impact_score").default(50).notNull(),
  effortScore: integer("effort_score").default(50).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Part 52 — Leader state & decision-load science
export const leaderStates = pgTable("leader_states", {
  id: serial("id").primaryKey(),
  leaderName: text("leader_name").notNull(),
  role: text("role").default("").notNull(),
  decisionLoad: integer("decision_load").default(50).notNull(),
  stressIndex: integer("stress_index").default(50).notNull(),
  focusScore: integer("focus_score").default(50).notNull(),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
  notes: text("notes").default("").notNull(),
});
