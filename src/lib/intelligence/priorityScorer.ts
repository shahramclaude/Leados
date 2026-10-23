// LEADOS intelligence engine — customer support ticket triage priority scorer.
export const SYSTEM_ID = "support-ticket-priority-scorer-v1";

export interface TicketPriorityInput {
  severityKeywordsHit: number;
  customerTierWeight: number; // 0..1
  slaMinutesRemaining: number;
  reopenedCount: number;
}

export interface TicketPriorityOutput {
  priorityScore: number; // 0..100, higher = handle sooner
  suggestedOrder: "urgent" | "soon" | "standard";
  factors: Array<{ factor: string; weight: number; direction: "increases" | "decreases" }>;
}

/** Scores a support ticket for triage ordering. decisionRole: recommend —
 * a human agent still picks the next ticket; this only suggests ordering. */
export function scoreTicketPriority(input: TicketPriorityInput): TicketPriorityOutput {
  const severityComponent = Math.min(input.severityKeywordsHit * 10, 30);
  const tierComponent = input.customerTierWeight * 20;
  const slaComponent = Math.max(0, 30 - input.slaMinutesRemaining / 10);
  const reopenComponent = Math.min(input.reopenedCount * 7, 20);

  const priorityScore = Math.max(
    0,
    Math.min(100, Math.round(severityComponent + tierComponent + slaComponent + reopenComponent)),
  );

  const suggestedOrder = priorityScore >= 66 ? "urgent" : priorityScore >= 33 ? "soon" : "standard";

  return {
    priorityScore,
    suggestedOrder,
    factors: [
      { factor: "Severity keywords", weight: Math.round(severityComponent), direction: "increases" },
      { factor: "Customer tier", weight: Math.round(tierComponent), direction: "increases" },
      { factor: "SLA time remaining", weight: Math.round(slaComponent), direction: "increases" },
      { factor: "Reopened count", weight: Math.round(reopenComponent), direction: "increases" },
    ],
  };
}
