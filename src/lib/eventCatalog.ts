// Original to this delivery. One catalog entry per event type referenced by
// src/lib/maturity.ts, used to drive the "log an event" panel.

import type { EventCatalogItem } from "./types";

export const EVENT_CATALOG: EventCatalogItem[] = [
  { type: "oneonone.logged", label: "Logged a 1:1", dimensions: ["PEOPLE_SYSTEMS"], hint: "Regular manager/report check-in." },
  { type: "feedback.given", label: "Gave feedback", dimensions: ["PEOPLE_SYSTEMS"], hint: "Ad-hoc or structured feedback moment." },
  { type: "goal.created", label: "Created a goal (owned)", dimensions: ["PEOPLE_SYSTEMS", "STRATEGIC_CLARITY"], hint: "A goal with a named owner." },
  { type: "growthplan.created", label: "Created a growth plan", dimensions: ["PEOPLE_SYSTEMS"], hint: "Multi-step development plan for a person." },
  { type: "succession.candidate", label: "Named a succession candidate", dimensions: ["PEOPLE_SYSTEMS"], hint: "Identified a successor for a key role." },
  { type: "leadership.360", label: "Ran a 360 review", dimensions: ["PEOPLE_SYSTEMS", "SELF_AWARENESS_MATURITY"], hint: "Multi-rater feedback cycle." },

  { type: "fin.pl.logged", label: "Logged P&L", dimensions: ["FINANCIAL_INTELLIGENCE"], hint: "Revenue / cost snapshot." },
  { type: "fin.unit.logged", label: "Logged unit economics", dimensions: ["FINANCIAL_INTELLIGENCE"], hint: "LTV, CAC, churn." },
  { type: "fin.scenario.modeled", label: "Modeled a financial scenario", dimensions: ["FINANCIAL_INTELLIGENCE", "STRATEGIC_CLARITY"], hint: "Forecast / scenario plan." },
  { type: "fin.cohort.logged", label: "Logged a cohort", dimensions: ["FINANCIAL_INTELLIGENCE"], hint: "Cohort retention / revenue data." },
  { type: "simulation.run", label: "Ran a simulation", dimensions: ["FINANCIAL_INTELLIGENCE", "ANALYTICAL_MATURITY", "INNOVATION_MATURITY"], hint: "Monte Carlo or similar." },

  { type: "ops.incident.logged", label: "Logged an incident", dimensions: ["OPERATIONAL_MATURITY"], hint: "Operational incident with impact." },
  { type: "sprint.review", label: "Held a sprint review", dimensions: ["OPERATIONAL_MATURITY", "EXECUTION_MATURITY"], hint: "End-of-cycle review." },
  { type: "blocker.logged", label: "Logged a blocker", dimensions: ["OPERATIONAL_MATURITY", "EXECUTION_MATURITY"], hint: "Something stopping progress." },
  { type: "ops.capacity.logged", label: "Logged team capacity", dimensions: ["OPERATIONAL_MATURITY"], hint: "Capacity / utilization snapshot." },
  { type: "blocker.escalated", label: "Escalated a blocker", dimensions: ["EXECUTION_MATURITY"], hint: "Raised a blocker before it became a crisis." },
  { type: "commitment.made", label: "Made a commitment", dimensions: ["EXECUTION_MATURITY"], hint: "A visible, owned commitment." },

  { type: "okr.created", label: "Created an OKR", dimensions: ["STRATEGIC_CLARITY"], hint: "Objective with key results." },
  { type: "wargame.scenario", label: "Ran a wargame scenario", dimensions: ["STRATEGIC_CLARITY", "ANALYTICAL_MATURITY", "INNOVATION_MATURITY", "MARKET_INTELLIGENCE"], hint: "Structured adversarial scenario." },
  { type: "tech.disruption", label: "Logged a tech disruption signal", dimensions: ["STRATEGIC_CLARITY", "INNOVATION_MATURITY", "MARKET_INTELLIGENCE"], hint: "An external technology shift." },

  { type: "exec.board.meeting", label: "Held a board meeting", dimensions: ["GOVERNANCE_MATURITY"], hint: "Board cadence event." },
  { type: "legal.compliance.check", label: "Ran a compliance check", dimensions: ["GOVERNANCE_MATURITY"], hint: "Legal / compliance review." },
  { type: "reg.jurisdiction", label: "Logged a regulatory jurisdiction", dimensions: ["GOVERNANCE_MATURITY"], hint: "Cross-border regulatory tracking." },
  { type: "stakeholder.mapped", label: "Mapped a stakeholder", dimensions: ["GOVERNANCE_MATURITY", "MARKET_INTELLIGENCE"], hint: "Internal or external stakeholder." },
  { type: "board.presented", label: "Presented to the board", dimensions: ["GOVERNANCE_MATURITY"], hint: "Narrative delivered to the board." },

  { type: "exec.crisis.logged", label: "Logged a crisis", dimensions: ["RESILIENCE_MATURITY"], hint: "Acute organizational crisis." },
  { type: "continuity.plan", label: "Wrote a continuity plan", dimensions: ["RESILIENCE_MATURITY"], hint: "Plan for a critical process." },
  { type: "stress.test.logged", label: "Logged a stress test", dimensions: ["RESILIENCE_MATURITY"], hint: "Deliberate stress test." },
  { type: "key.dependency.logged", label: "Logged a key-person dependency", dimensions: ["RESILIENCE_MATURITY"], hint: "Single point of failure." },
  { type: "crisis.postmortem", label: "Closed a crisis postmortem", dimensions: ["RESILIENCE_MATURITY"], hint: "Lesson captured after a crisis." },

  { type: "culture.signal", label: "Logged a culture signal", dimensions: ["CULTURE_MATURITY"], hint: "e.g. psychological safety pulse." },
  { type: "org.network.edge", label: "Logged a collaboration edge", dimensions: ["CULTURE_MATURITY"], hint: "Who works with whom." },
  { type: "leadership.value", label: "Logged a values moment", dimensions: ["CULTURE_MATURITY"], hint: "Behavior tied to a stated value." },

  { type: "reflection.logged", label: "Logged a reflection", dimensions: ["SELF_AWARENESS_MATURITY"], hint: "Personal leadership reflection." },
  { type: "decision.calibration", label: "Logged a decision calibration", dimensions: ["SELF_AWARENESS_MATURITY"], hint: "Predicted vs. actual outcome." },
  { type: "bias.flagged", label: "Flagged a cognitive bias", dimensions: ["SELF_AWARENESS_MATURITY"], hint: "Named bias in a decision." },
  { type: "avoidance.named", label: "Named an avoidance pattern", dimensions: ["SELF_AWARENESS_MATURITY"], hint: "A thing being avoided, named." },
  { type: "legacy.defined", label: "Defined a leadership legacy", dimensions: ["SELF_AWARENESS_MATURITY"], hint: "What you want to be remembered for." },

  { type: "rd.experiment.logged", label: "Logged an experiment", dimensions: ["INNOVATION_MATURITY"], hint: "Hypothesis-driven experiment." },
  { type: "initiative.logged", label: "Logged a modeled initiative", dimensions: ["INNOVATION_MATURITY"], hint: "Initiative with a stated model.", },

  { type: "competitor.logged", label: "Logged a competitor move", dimensions: ["MARKET_INTELLIGENCE"], hint: "Competitive signal." },
  { type: "customer.interview", label: "Logged a customer interview", dimensions: ["MARKET_INTELLIGENCE"], hint: "Direct customer voice." },
  { type: "ecosystem.map", label: "Updated the ecosystem map", dimensions: ["MARKET_INTELLIGENCE"], hint: "Partners, platforms, substitutes." },
  { type: "intel.signal", label: "Logged an intelligence signal", dimensions: ["ANALYTICAL_MATURITY", "MARKET_INTELLIGENCE"], hint: "External signal worth tracking." },
];

export const EVENT_LABELS: Record<string, string> = Object.fromEntries(EVENT_CATALOG.map((e) => [e.type, e.label]));
