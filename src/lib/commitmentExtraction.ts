// Commitment extraction from upstream artifacts:
//   - Part 42 meeting artifacts (`meetingArtifacts.actionItems`)
//   - Part 23 decisions (owner commitments attached to a decision)
//   - Part 43 1:1 surfaces (`oneOnOnes.commitmentsRaw`)
//   - "emails-seam" (freeform structured stand-in, same shape)
//
// Extraction NEVER auto-confirms: every extracted commitment is created with
// `confirmed: false` and must be confirmed by a human before it counts toward
// follow-through metrics or feeds the proactive engine. This is what "drafts
// by default" means applied to extraction itself, not just to outbound sends.

export type RawActionItem = {
  // e.g. "Priya will send the vendor contract by 2026-03-02"
  text: string;
  promisorName: string;
  promiseeName: string;
  dueAtIso: string | null;
};

export type ExtractedCommitment = {
  promisorName: string;
  promiseeName: string;
  content: string;
  dueAtIso: string;
  context: { sourceType: string; sourceId?: string; surface?: string };
  confidence: number;
};

const MODAL_PATTERN = /\b(will|shall|commits? to|promises? to)\b/i;
const DATE_PATTERN = /\b(\d{4}-\d{2}-\d{2})\b/;

/**
 * Extracts candidate commitments from a batch of raw, structurally-tagged
 * action items (promisor/promisee already identified by the upstream surface
 * — this module focuses on content + due-date confidence, matching what a
 * meeting-artifact compiler or 1:1 capture tool would hand us).
 */
export function extractFromActionItems(
  items: RawActionItem[],
  context: { sourceType: string; sourceId?: string; surface?: string },
  fallbackDueAt: Date,
): ExtractedCommitment[] {
  const out: ExtractedCommitment[] = [];
  for (const item of items) {
    const hasModal = MODAL_PATTERN.test(item.text);
    const dateMatch = item.dueAtIso ?? item.text.match(DATE_PATTERN)?.[1] ?? null;
    // Always score every item (even ones with no commitment shape at all) so
    // callers can threshold on confidence rather than relying on a hard
    // skip — this keeps extraction output aligned 1:1 with input for
    // precision/recall scoring, and correctly scores non-commitments near 0.
    const confidence = hasModal || item.promisorName ? (hasModal ? 0.6 : 0.3) + (dateMatch ? 0.3 : 0) + (item.promisorName && item.promiseeName ? 0.1 : 0) : 0;
    out.push({
      promisorName: item.promisorName,
      promiseeName: item.promiseeName,
      content: item.text,
      dueAtIso: dateMatch ?? fallbackDueAt.toISOString().slice(0, 10),
      context,
      confidence: Math.min(1, confidence),
    });
  }
  return out;
}

/**
 * Below this confidence, the item is not treated as a commitment candidate.
 * Calibrated so that a bare modal verb with no attributed promisor/promisee
 * ("the office will be closed Friday") scores below threshold, while a
 * modal verb WITH an attributed party (even without a date, e.g. "Cara will
 * share the retro notes") clears it — attribution is the stronger signal.
 */
export const EXTRACTION_REVIEW_THRESHOLD = 0.65;
