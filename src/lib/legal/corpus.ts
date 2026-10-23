// Synthetic labeled contract corpus for `eval:legal` (Phase 3b / 4).
//
// We generate the corpus programmatically (seeded, deterministic RNG) rather than hand-pasting
// real contract text, for three reasons that matter for an honest eval:
//   1. Ground-truth spans are computed from the same assembly step that writes the text, so
//      annotation error (a notorious eval:legal failure mode) is structurally impossible here.
//   2. It is reproducible without redistributing real counterparties' confidential contract text.
//   3. We can deliberately include "paraphrase" variants (same legal effect, different wording)
//      and "near-miss distractors" (surface similarity, no real obligation) to measure the
//      extractor's honest degradation boundary, per Phase 5 of this part's spec.
//
// This is a *baseline* corpus, not a claim that real-world contracts look like this. See
// AI-SESSION-LOG.md Phase 5 answer #1 for where this under-represents reality.

import { PARAGRAPH_SEPARATOR } from "./extraction";
import type { ClauseType } from "./clauseTypes";
import { CLAUSE_TYPES } from "./clauseTypes";

export interface CorpusAnnotation {
  clauseType: ClauseType;
  spanStart: number;
  spanEnd: number;
  excerptText: string;
  /** Whether this instance uses matcher-recognizable phrasing or a harder paraphrase. */
  variant: "template" | "paraphrase";
}

export interface CorpusDocument {
  docKey: string;
  splitSet: "train" | "holdout";
  rawText: string;
  annotations: CorpusAnnotation[];
}

// --- deterministic PRNG (mulberry32) so the corpus is stable across runs/CI -------------------
function mulberry32(seed: number) {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

function shuffle<T>(rng: () => number, arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const COUNTERPARTIES = [
  "Northwind Supply Co.",
  "Caldera Data Systems",
  "Brightline Logistics",
  "Vertex Cloud Partners",
  "Harrow & Finch LLP",
  "Solace Payments Inc.",
  "Meridian Health Analytics",
  "Pinecrest Manufacturing",
];

const DURATIONS_MONTHS = [12, 24, 36];
const NOTICE_DAYS = [30, 45, 60, 90];
const UPTIME = ["99.5", "99.9", "99.95"];

type Template = {
  type: ClauseType;
  template: (rng: () => number) => string;
  paraphrase: (rng: () => number) => string;
};

const TEMPLATES: Template[] = [
  {
    type: "term",
    template: (rng) =>
      `The initial term of this Agreement shall commence on the Effective Date and continue for ${pick(
        rng,
        DURATIONS_MONTHS,
      )} months (the "Initial Term"), unless earlier terminated as provided herein.`,
    paraphrase: (rng) =>
      `This Agreement starts on the Effective Date and runs for ${pick(
        rng,
        DURATIONS_MONTHS,
      )} months unless it ends sooner under another provision.`,
  },
  {
    type: "renewal",
    template: (rng) =>
      `This Agreement shall automatically renew for successive twelve (12) month periods unless either party provides written notice of non-renewal at least ${pick(
        rng,
        NOTICE_DAYS,
      )} days prior to the end of the then-current term.`,
    paraphrase: (rng) =>
      `Unless cancelled in writing at least ${pick(
        rng,
        NOTICE_DAYS,
      )} days beforehand, this Agreement will keep renewing on a yearly basis.`,
  },
  {
    type: "termination",
    template: (rng) =>
      `Either party may terminate this Agreement for convenience upon ${pick(
        rng,
        NOTICE_DAYS,
      )} days' prior written notice to the other party.`,
    paraphrase: (rng) =>
      `Each party retains a unilateral right to end this arrangement with ${pick(
        rng,
        NOTICE_DAYS,
      )} days advance notice to the other.`,
  },
  {
    type: "sla",
    template: (rng) =>
      `Vendor shall maintain a Service Level of ${pick(
        rng,
        UPTIME,
      )}% monthly uptime for the Service, measured in accordance with Exhibit B, and shall issue Service Credits for any shortfall.`,
    paraphrase: () =>
      `The hosting partner commits to keeping the platform online nearly all the time and will issue credits for excessive downtime.`,
  },
  {
    type: "indemnity",
    template: () =>
      `Each party shall indemnify, defend, and hold harmless the other party from and against any third-party claims arising out of its gross negligence or willful misconduct.`,
    paraphrase: () =>
      `The parties agree to cover each other against outside lawsuits stemming from serious misconduct by either side.`,
  },
  {
    type: "liability_cap",
    template: (rng) =>
      `In no event shall either party's total liability under this Agreement exceed the total fees paid in the ${pick(
        rng,
        [6, 12],
      )} months preceding the claim.`,
    paraphrase: (rng) =>
      `Damages recoverable under this Agreement are capped at the fees paid in the prior ${pick(rng, [6, 12])} months.`,
  },
  {
    type: "change_of_control",
    template: (rng) =>
      `In the event of a Change of Control of either party, the other party may terminate this Agreement upon ${pick(
        rng,
        NOTICE_DAYS,
      )} days' written notice.`,
    paraphrase: (rng) =>
      `Should ownership of a party change hands, the counterparty may exit this arrangement with ${pick(
        rng,
        NOTICE_DAYS,
      )} days notice.`,
  },
  {
    type: "data_protection",
    template: () =>
      `Each party shall implement appropriate technical and organizational measures to protect Personal Data in accordance with applicable data protection law, including the GDPR where applicable.`,
    paraphrase: () =>
      `Both sides will keep personal information safe using reasonable safeguards consistent with applicable privacy law.`,
  },
];

const PURE_DISTRACTORS = [
  "This Section intentionally left blank pending negotiation of Exhibit C.",
  "The parties acknowledge receipt of good and valuable consideration, the sufficiency of which is hereby acknowledged.",
  "Headings used in this Agreement are for convenience only and shall not affect interpretation.",
  "This Agreement references indemnity frameworks discussed in Schedule 3 but creates no standalone obligations in this Section.",
  "Notices under this Agreement shall be delivered by email with confirmation of receipt.",
];

// Designed to look like a change-of-control operative clause (contains both trigger keywords) while
// actually being background narrative — an intentional false-positive bait so the eval scorecard
// reports an honest, non-zero false-positive rate rather than a suspiciously perfect one.
const FALSE_POSITIVE_BAIT =
  "The parties acknowledge past change of control events at each organization and agree to terminate " +
  "any prior conflicting arrangements as a matter of historical record only.";

function buildParagraph(type: ClauseType, rng: () => number, forceParaphrase: boolean) {
  const def = TEMPLATES.find((t) => t.type === type)!;
  const useParaphrase = forceParaphrase || rng() < 0.15;
  const text = useParaphrase ? def.paraphrase(rng) : def.template(rng);
  return { text, variant: (useParaphrase ? "paraphrase" : "template") as "template" | "paraphrase" };
}

export function generateCorpus(totalDocs = 72, seed = 1337): CorpusDocument[] {
  const rng = mulberry32(seed);
  const docs: CorpusDocument[] = [];

  for (let i = 0; i < totalDocs; i += 1) {
    const counterparty = pick(rng, COUNTERPARTIES);
    const docKey = `eval-contract-${String(i + 1).padStart(3, "0")}`;
    const numClauseTypes = 3 + Math.floor(rng() * 4); // 3..6
    const chosenTypes = shuffle(rng, [...CLAUSE_TYPES]).slice(0, numClauseTypes);

    const paragraphs: string[] = [
      `MASTER SERVICES AGREEMENT between LEADOS Example Holdings Inc. and ${counterparty}.`,
    ];
    const annotations: CorpusAnnotation[] = [];

    for (const type of chosenTypes) {
      const { text, variant } = buildParagraph(type, rng, false);
      paragraphs.push(text);
      annotations.push({ clauseType: type, spanStart: -1, spanEnd: -1, excerptText: text, variant });
    }

    // Pure distractors — must never be extracted.
    const numDistractors = 1 + Math.floor(rng() * 2);
    for (let d = 0; d < numDistractors; d += 1) {
      paragraphs.push(pick(rng, PURE_DISTRACTORS));
    }

    // Occasionally include the false-positive-bait recital, unlabeled (not a real clause).
    if (rng() < 0.3) {
      paragraphs.push(FALSE_POSITIVE_BAIT);
    }

    paragraphs.push("This Agreement constitutes the entire understanding between the parties as to its subject matter.");

    // Assemble, recording exact offsets as we go (mirrors extraction.ts segmentation exactly).
    let cursor = 0;
    const rawParts: string[] = [];
    for (const para of paragraphs) {
      const start = cursor;
      const end = cursor + para.length;
      rawParts.push(para);
      const matchingAnnotation = annotations.find(
        (a) => a.excerptText === para && a.spanStart === -1,
      );
      if (matchingAnnotation) {
        matchingAnnotation.spanStart = start;
        matchingAnnotation.spanEnd = end;
      }
      cursor = end + PARAGRAPH_SEPARATOR.length;
    }
    const rawText = rawParts.join(PARAGRAPH_SEPARATOR);

    docs.push({
      docKey,
      splitSet: i % 10 < 3 ? "holdout" : "train",
      rawText,
      annotations,
    });
  }

  return docs;
}
