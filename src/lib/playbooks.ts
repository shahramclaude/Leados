// src/lib/playbooks.ts
// Cost/load proxy per playbook type. ORIGINAL to this sandbox — a disclosed
// heuristic cost map, not a measured dataset. Values are illustrative only.

import type { PlaybookId } from "./types";

export interface PlaybookCost {
  timeHours: number;
  cogLoad: number; // 0..12 illustrative scale
}

export const PLAYBOOK_LABEL: Record<PlaybookId, string> = {
  "oneonone-bundle": "1:1 conversation bundle",
  "termination-prep": "Termination preparation",
  "pl-review": "P&L review",
  "sprint-plan": "Sprint re-plan",
  "board-narrative": "Board narrative update",
  "crisis-response": "Crisis response",
  "contract-review": "Contract / legal review",
  "roadmap-sync": "Roadmap ownership sync",
};

export const PLAYBOOK_COST: Record<PlaybookId, PlaybookCost> = {
  "oneonone-bundle": { timeHours: 2, cogLoad: 3 },
  "termination-prep": { timeHours: 4, cogLoad: 10 },
  "pl-review": { timeHours: 3, cogLoad: 8 },
  "sprint-plan": { timeHours: 2, cogLoad: 5 },
  "board-narrative": { timeHours: 4, cogLoad: 9 },
  "crisis-response": { timeHours: 6, cogLoad: 12 },
  "contract-review": { timeHours: 2, cogLoad: 4 },
  "roadmap-sync": { timeHours: 1.5, cogLoad: 4 },
};

export const DEFAULT_COST: PlaybookCost = { timeHours: 1.5, cogLoad: 4 };
