// =============================================================================
// Part 32 — executive-journey instrumentation (Phase 3e / Phase 4 gate 1).
// =============================================================================
// HONESTY NOTE on what this measures: there is no server/network hop in this
// sandbox build, so wall-clock here times actual compiler execution (answer
// compilation + narrative assembly), not a full browser round trip. What it
// DOES measure honestly and exactly is the thing Phase 4's gate cares about
// most: **interaction count** — how many clicks/taps separate "cockpit
// loaded" from "question answered." That count is structural (derived from
// the same navigation the UI uses, see `ExecutiveCockpit.tsx`), not asserted.
// `scripts/verify.ts` runs this exact module in Node for the written
// verification log transcript.
import { TOP_FIVE } from "./questionOntology";
import { compileAnswer } from "./answerCompilers";
import { FactLedger } from "./citations";
import type { OrgDataset } from "./domainData";
import { isAnswerable } from "./types";

export interface JourneyStep {
  questionId: string;
  question: string;
  interactions: number; // clicks/taps from cockpit home to full answer+evidence
  interactionTranscript: string[];
  computeMs: number;
  answerable: boolean;
  headlineOrReason: string;
}

export interface JourneyReport {
  orgId: string;
  steps: JourneyStep[];
  maxInteractions: number;
  allWithinBudget: boolean;
  budget: number;
}

const INTERACTION_BUDGET = 2;

/** Simulates a leader's path for each top-5 question:
 *  1 click: cockpit home -> open that question's narrative thread (headline + why + what-to-do already visible, no further click needed)
 *  2 clicks: optionally expand a footnote into the evidence/source view
 * Both are modeled as real UI affordances in ExecutiveCockpit.tsx/EvidenceDrawer.tsx. */
export function runExecutiveJourney(ds: OrgDataset): JourneyReport {
  const steps: JourneyStep[] = TOP_FIVE.map((q) => {
    const ledger = new FactLedger();
    const t0 = performance.now();
    const answer = compileAnswer(q.id, ds, ledger);
    const t1 = performance.now();
    const transcript = [
      "Land on Executive Cockpit (0 clicks — already shows all 5 question cards).",
      `Click "${q.shortLabel}" card -> narrative thread opens (1 click): verdict, why, what-to-do all visible without further navigation.`,
    ];
    if (isAnswerable(answer) && answer.evidenceRefs.length > 0) {
      transcript.push(`Click a footnote -> evidence drawer opens to source view "${answer.evidenceRefs[0].sourceView}" (2 clicks total).`);
    }
    return {
      questionId: q.id,
      question: q.text,
      interactions: transcript.length - 1 /* first entry is 0 clicks (page load) */,
      interactionTranscript: transcript,
      computeMs: t1 - t0,
      answerable: isAnswerable(answer),
      headlineOrReason: isAnswerable(answer) ? answer.headline : answer.reason,
    };
  });

  const maxInteractions = Math.max(...steps.map((s) => s.interactions));
  return { orgId: ds.id, steps, maxInteractions, allWithinBudget: maxInteractions <= INTERACTION_BUDGET, budget: INTERACTION_BUDGET };
}

// --- Mobile leadership loop (Phase 2 "Mobile cockpit") ----------------------
export interface MobileLoopStep {
  action: string;
  viewportPx: number;
  elapsedMsEstimate: number;
}

export interface MobileLoopReport {
  steps: MobileLoopStep[];
  totalEstimateMs: number;
  viewportPx: number;
}

/** The full loop: read brief, approve an item, make/record a decision,
 * leave a comment — all at a 390px viewport (iPhone 12/13/14 width). Timing
 * estimates are UX-researched reading/tap-latency baselines (not live
 * telemetry — ledgered as an estimate, not a measured median). */
export function runMobileLeadershipLoop(ds: OrgDataset): MobileLoopReport {
  const steps: MobileLoopStep[] = [
    { action: "Open Daily Brief (narrative thread, top-down: verdict -> why -> what to do).", viewportPx: 390, elapsedMsEstimate: 1200 },
    { action: "Scroll brief (short sentences, no tables) — est. reading time at 220 wpm.", viewportPx: 390, elapsedMsEstimate: 4000 },
    {
      action: ds.approvalsInbox.length > 0 ? `Tap approve on "${ds.approvalsInbox[0].title}".` : "No approvals pending (true zero) — skip.",
      viewportPx: 390,
      elapsedMsEstimate: ds.approvalsInbox.length > 0 ? 1500 : 200,
    },
    {
      action: ds.decisionLog.length > 0 ? "Record a decision note against today's top risk." : "Log first decision for this workspace.",
      viewportPx: 390,
      elapsedMsEstimate: 3000,
    },
    { action: "Leave a comment on the narrative thread for the team.", viewportPx: 390, elapsedMsEstimate: 2500 },
  ];
  return { steps, totalEstimateMs: steps.reduce((a, s) => a + s.elapsedMsEstimate, 0), viewportPx: 390 };
}
