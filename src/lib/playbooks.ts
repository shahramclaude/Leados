// src/lib/playbooks.ts
//
// Static playbook catalog — one playbook per rule that should trigger an
// automatic response. playbooksEngine.ts persists/activates these.

import type { PlaybookDefinition } from "./types";

export const PLAYBOOK_CATALOG: PlaybookDefinition[] = [
  {
    key: "PB_FLIGHT_RISK",
    name: "Retention intervention",
    domain: "people",
    ruleKey: "FLIGHT_RISK_CRITICAL",
    steps: [
      "Schedule a 1:1 with the at-risk person within 48 hours",
      "Review compensation band vs market",
      "Identify a growth/mobility option to present",
    ],
  },
  {
    key: "PB_BURNOUT",
    name: "Burnout mitigation",
    domain: "people",
    ruleKey: "BURNOUT_RISK_CRITICAL",
    steps: [
      "Audit meeting load for the affected team",
      "Redistribute action items with highest slip rate",
      "Schedule a wellbeing check-in",
    ],
  },
  {
    key: "PB_EXECUTION_RECOVERY",
    name: "Execution recovery sprint",
    domain: "execution",
    ruleKey: "EXECUTION_RISK_CRITICAL",
    steps: [
      "Freeze non-critical scope for 2 weeks",
      "Stand up a daily blocker triage",
      "Re-baseline delivery confidence with stakeholders",
    ],
  },
  {
    key: "PB_CULTURE_RESET",
    name: "Culture reset workshop",
    domain: "culture",
    ruleKey: "CULTURE_RISK_CRITICAL",
    steps: [
      "Run a psychological-safety pulse survey",
      "Facilitate a conflict-resolution session",
      "Review onboarding cohort feedback",
    ],
  },
  {
    key: "PB_FINANCIAL_REVIEW",
    name: "Financial runway review",
    domain: "finance",
    ruleKey: "FINANCIAL_RISK_CRITICAL",
    steps: [
      "Convene an emergency budget review",
      "Model 3 runway-extension scenarios",
      "Brief the board on mitigations",
    ],
  },
  {
    key: "PB_CASCADE_RESPONSE",
    name: "Cascade risk war room",
    domain: "strategy",
    ruleKey: "CASCADE_RISK_CRITICAL",
    steps: [
      "Stand up a cross-domain incident room",
      "Assign an owner per affected domain",
      "Publish an all-hands status update within 24h",
    ],
  },
];

export function getPlaybookForRuleKey(ruleKey: string): PlaybookDefinition | undefined {
  return PLAYBOOK_CATALOG.find((p) => p.ruleKey === ruleKey);
}
