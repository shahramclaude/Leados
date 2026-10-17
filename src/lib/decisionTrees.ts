// js/decision_trees.js (requested module) -> src/lib/decisionTrees.ts.
// A tiny original decision-tree engine plus one tree per category, used to
// walk a leader from "a finding fired" to a concrete recommended next step.

import type { Category } from "./types";

export interface DecisionNode {
  id: string;
  question?: string;
  yes?: string; // next node id
  no?: string; // next node id
  result?: string; // leaf recommendation
}

export type DecisionTree = Record<string, DecisionNode>;

export const TREES: Record<Category, DecisionTree> = {
  "Workload & Burnout": {
    start: { id: "start", question: "Has this persisted 2+ weeks?", yes: "n2", no: "leafMonitor" },
    n2: { id: "n2", question: "Is there a willing backup to absorb load?", yes: "leafRebalance", no: "leafEscalate" },
    leafMonitor: { id: "leafMonitor", result: "Monitor and check in next week; no action yet." },
    leafRebalance: { id: "leafRebalance", result: "Rebalance work to the backup immediately." },
    leafEscalate: { id: "leafEscalate", result: "Escalate to skip-level/HRBP — no internal capacity to absorb." },
  },
  "Velocity & Delivery": {
    start: { id: "start", question: "Is the date externally fixed (contract/compliance)?", yes: "n2", no: "leafRenegotiate" },
    n2: { id: "n2", question: "Can scope be cut without breaking the commitment?", yes: "leafCutScope", no: "leafEscalate" },
    leafRenegotiate: { id: "leafRenegotiate", result: "Renegotiate the date with stakeholders." },
    leafCutScope: { id: "leafCutScope", result: "Cut scope transparently and document the tradeoff." },
    leafEscalate: { id: "leafEscalate", result: "Escalate — commitment is structurally unmeetable as scoped." },
  },
  "Financial & Austerity": {
    start: { id: "start", question: "Did scope shrink proportionally to budget?", yes: "leafMonitor", no: "leafRebaseline" },
    leafMonitor: { id: "leafMonitor", result: "No action — cut was matched by scope reduction." },
    leafRebaseline: { id: "leafRebaseline", result: "Re-baseline commitments in writing against new budget." },
  },
  "Trust & Psychological Safety": {
    start: { id: "start", question: "Is this isolated to one person?", yes: "leaf1on1", no: "n2" },
    n2: { id: "n2", question: "Has it persisted across 2+ cycles?", yes: "leafHR", no: "leafForum" },
    leaf1on1: { id: "leaf1on1", result: "Have a direct 1:1 conversation; this may be situational." },
    leafForum: { id: "leafForum", result: "Create a safer forum for dissent before it generalizes." },
    leafHR: { id: "leafHR", result: "Involve HRBP — pattern is confirmed, not isolated." },
  },
  "Communication & Information Flow": {
    start: { id: "start", question: "Is one person the sole information conduit?", yes: "leafBackup", no: "leafDocument" },
    leafBackup: { id: "leafBackup", result: "Add a documented second point of contact." },
    leafDocument: { id: "leafDocument", result: "Start a shared decision log going forward." },
  },
  "Culture & Alignment": {
    start: { id: "start", question: "Do sub-groups report to different leaders with different goals?", yes: "leafSkip", no: "leafTeam" },
    leafSkip: { id: "leafSkip", result: "Escalate to skip-level to align shared metrics across leaders." },
    leafTeam: { id: "leafTeam", result: "Facilitate a team session to name the gap and agree a fix." },
  },
  "Succession & Continuity": {
    start: { id: "start", question: "Is there a named backup today?", yes: "leafDevelop", no: "leafUrgent" },
    leafDevelop: { id: "leafDevelop", result: "Continue developing the backup; document the knowledge." },
    leafUrgent: { id: "leafUrgent", result: "Treat as urgent single point of failure — name a backup now." },
  },
  "Compliance & Governance": {
    start: { id: "start", question: "Is the bypass a one-off under deadline pressure?", yes: "leafWarn", no: "leafFix" },
    leafWarn: { id: "leafWarn", result: "Flag it, document it, move on — watch for recurrence." },
    leafFix: { id: "leafFix", result: "Fix the process — repeated bypass means the control is broken, not the people." },
  },
};

export function traverse(category: Category, answers: boolean[]): string {
  const tree = TREES[category];
  let node = tree.start;
  let i = 0;
  while (!node.result) {
    const answer = answers[i] ?? false;
    const nextId = answer ? node.yes : node.no;
    if (!nextId || !tree[nextId]) break;
    node = tree[nextId];
    i += 1;
  }
  return node.result ?? "No recommendation reached — answer more questions.";
}
