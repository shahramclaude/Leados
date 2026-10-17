// js/protocol.js (requested module) -> src/lib/protocol.ts.
// Maps a Finding's category + severity to a short response playbook.
// Original content; generic management practice, not sourced from a specific
// external playbook or vendor framework.

import type { Category, Severity } from "./types";

export interface ProtocolStep {
  order: number;
  action: string;
  owner: "Manager" | "Skip-level" | "HRBP" | "Team";
}

const BASE_STEPS: Record<Category, ProtocolStep[]> = {
  "Workload & Burnout": [
    { order: 1, action: "1:1 to confirm the signal and ask directly about workload/recovery.", owner: "Manager" },
    { order: 2, action: "Rebalance tasks or pause non-critical work for 1-2 weeks.", owner: "Manager" },
    { order: 3, action: "Loop in HRBP if signal persists past rebalancing.", owner: "HRBP" },
  ],
  "Velocity & Delivery": [
    { order: 1, action: "Review scope-vs-date tradeoffs with the team in retro.", owner: "Team" },
    { order: 2, action: "Renegotiate date or scope explicitly with stakeholders; avoid silent cuts.", owner: "Manager" },
  ],
  "Financial & Austerity": [
    { order: 1, action: "Re-baseline commitments against the new budget, in writing.", owner: "Manager" },
    { order: 2, action: "Escalate scope/budget mismatch to skip-level before it lands on the team.", owner: "Skip-level" },
  ],
  "Trust & Psychological Safety": [
    { order: 1, action: "Create a low-stakes forum for dissent (anonymous or small group).", owner: "Manager" },
    { order: 2, action: "Model fallibility publicly; name a mistake you made.", owner: "Manager" },
    { order: 3, action: "If withdrawal is confirmed across a cycle, involve HRBP.", owner: "HRBP" },
  ],
  "Communication & Information Flow": [
    { order: 1, action: "Document the decision record retroactively; identify the missing channel.", owner: "Manager" },
    { order: 2, action: "Add a second point of contact to remove single-point-of-failure routing.", owner: "Manager" },
  ],
  "Culture & Alignment": [
    { order: 1, action: "Name the values-vs-behavior gap explicitly with the group.", owner: "Manager" },
    { order: 2, action: "Align sub-group metrics to one shared outcome.", owner: "Skip-level" },
  ],
  "Succession & Continuity": [
    { order: 1, action: "Identify and start developing a named backup.", owner: "Manager" },
    { order: 2, action: "Document tribal knowledge into a shared runbook.", owner: "Team" },
    { order: 3, action: "Have a retention conversation if flight risk is suspected.", owner: "Skip-level" },
  ],
  "Compliance & Governance": [
    { order: 1, action: "Restore the approval step; do not let bypass become the default path.", owner: "Manager" },
    { order: 2, action: "Add an audit trail and an expiry date to any exception granted.", owner: "HRBP" },
  ],
};

export function getProtocol(category: Category, severity: Severity): ProtocolStep[] {
  const steps = BASE_STEPS[category] ?? [];
  if (severity === "low") return steps.slice(0, 1);
  if (severity === "medium") return steps.slice(0, Math.max(1, steps.length - 1));
  return steps;
}
