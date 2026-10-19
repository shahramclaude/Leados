/**
 * src/lib/catalog.ts — rule + playbook + domain catalog.
 *
 * REPLACES the old fabricated catalog. The real repo's root-level
 * `catalog.ts` carried this header (quoted verbatim, inspected this
 * session):
 *
 *   "FABRICATED: the real repo (verified this session) has exactly 40
 *   rules (R1-R40, in js/engine.js) ... Only a subset ("wired: true") has
 *   live firing logic below in engine.ts; the rest exist so search/
 *   explain/mute have a believable 40-rule surface to query against."
 *   — 12 of 40 rules wired:true, 30 wired:false.
 *
 * This catalog is generated directly from `ruleEngine.ts`: all 48 rules
 * (6 per domain x 8 domains) are wired:true because every one of them
 * has a real `evaluate()` implementation. There is no unwired entry left.
 */

import type { DomainKey, PlaybookDef, RuleDef } from "./types";
import { DOMAIN_KEYS } from "./types";
import { ALL_RULES } from "./ruleEngine";

export const DOMAINS: DomainKey[] = DOMAIN_KEYS;

export const RULES: RuleDef[] = ALL_RULES.map((r) => ({
  id: r.id,
  tag: r.name,
  domain: r.domain,
  firesWhen: `See src/lib/ruleEngine.ts evaluate() for ${r.id} — real logic, not prose.`,
  severityRule: "0-5, computed live by evaluate() each run (see RuleEvaluation.scoreMath).",
  confidence: "HIGH",
  playbook: null,
  resolvesWhen: "Rule stops firing on the next project()/run() cycle once its evaluate() condition is no longer true.",
  dismissible: false,
  settingsKeys: [],
  wired: true,
}));

export const PLAYBOOKS: PlaybookDef[] = [
  { id: "pl-review", title: "P&L Review", domain: "finance", forRules: ["F02", "F03", "F06"], forWhat: "Walk gross margin, rule-of-40, and revenue concentration line by line against plan." },
  { id: "finance-reforecast", title: "Finance Re-forecast", domain: "finance", forRules: ["F01", "F04", "F05"], forWhat: "Re-baseline budget, runway, and CAC payback against actuals in one pass." },
  { id: "weekly-1-1", title: "Weekly 1:1", domain: "people", forRules: ["P01", "P05"], forWhat: "Log a 1:1 and reset the cadence/commitment clock for a report." },
  { id: "leadership-audit", title: "Leadership Audit", domain: "people", forRules: ["P02", "P03", "P06", "C03"], forWhat: "Audit operating rhythm: reviews, goal ownership, check-ins, training." },
  { id: "ops-review", title: "Ops Review", domain: "operations", forRules: ["O01", "O02", "O03", "O04", "O05", "M03", "M05", "CS01", "CS02", "CS03", "CS04", "CS05", "CS06"], forWhat: "Run the weekly ops review and log it." },
  { id: "decision-forcing", title: "Decision Forcing Function", domain: "strategy", forRules: ["S01", "S03", "S06", "O06"], forWhat: "Force a close on decisions that have been open too long." },
  { id: "okr-reset", title: "OKR Reset", domain: "strategy", forRules: ["S02", "S04", "S05", "P04"], forWhat: "Re-check in on goals that have drifted past cadence." },
  { id: "production-stop", title: "Production Stop + Audit", domain: "manufacturing", forRules: ["M01", "M02", "M04", "C01", "C02", "C04", "C05", "C06"], forWhat: "Stop the line, audit yield/safety/compliance together, resume only with audit on record." },
  { id: "innovation-reset", title: "Innovation Reset", domain: "rd", forRules: ["R01", "R02", "R03", "R04", "R05", "R06"], forWhat: "Call the debt, kill or staff stalled work, reopen the roadmap line." },
];

export const DEFAULT_SETTINGS = {
  grossMarginFloorPct: 60,
  cadenceDays: 14,
  oneOnOneCadenceDays: 21,
  decisionMaxOpenDays: 21,
  okrCheckInCadenceDays: 14,
  complianceAuditCadenceDays: 30,
};
