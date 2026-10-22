// =============================================================================
// Part 32 — briefing compiler pipeline (Phase 1 "Briefing compiler" + Phase 3b).
// =============================================================================
// One artifact family, three grains, compiled from the SAME 20 answer
// compilers (no separate "board pack data path" that could drift from the
// cockpit's numbers). Shared narrative contract across all three:
//   - every sentence carries refs: number[] into a single FactLedger
//     (Part 08's contract, see citations.ts) — checked by `checkCitations`.
//   - every sentence that has an interval renders it inline in plain
//     language — simplification never drops the interval (Phase 5, Q2).
//   - confidenceClass is attached per-sentence and rendered as a plain-word
//     tag, never silently upgraded (e.g. a forecast cannot read as actual).
// A future LLM polish layer (Part 11's `briefingPolishPrompt` pattern) may
// rewrite `prose` for fluency, but — exactly like the real `briefing.ts` —
// it is structurally downstream of these deterministic, cited sentences and
// is re-validated by `checkCitations` before anything ships. We do not call
// an LLM in this build; the deterministic narrative IS the shipped prose,
// which is strictly more honest than an unverified polish pass.
import type { OrgDataset } from "./domainData";
import { FactLedger, type Sentence, checkCitations, type CitationIssue, type Fact } from "./citations";
import { compileAllAnswers, compileAnswer } from "./answerCompilers";
import { TOP_FIVE, QUESTION_ONTOLOGY, questionById } from "./questionOntology";
import { isAnswerable, type AnswerResult, type QuestionAnswer } from "./types";
import { formatCurrency } from "./format";
import { lintSpeechReady, lintZeroFiller, type LintResult } from "./speechLint";

export type BriefKind = "daily" | "weekly" | "board";

export interface BriefSection {
  heading: string;
  sentences: Sentence[];
  /** Sections render the same sentences joined into readable prose; kept
   * separate from `sentences` so citation-lint always runs on the structured
   * form, never on a hand-edited prose string that could drift from it. */
  prose: string;
}

export interface NarrativeThread {
  questionId: string;
  question: string;
  verdict: string;
  why: Sentence[];
  whatToDo: { label: string; kind: string }[];
  evidenceAppendix: { factId: number; label: string; sourceView: string }[];
  confidenceClass: string | null;
}

export interface BriefingPack {
  kind: BriefKind;
  orgId: string;
  orgLabel: string;
  asOfDate: string;
  title: string;
  sections: BriefSection[];
  threads: NarrativeThread[];
  ledger: FactLedger;
  wordCount: number;
  estReadMinutes: number;
  citationIssues: CitationIssue[];
  speechLint: LintResult;
  zeroFillerLint: LintResult;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function answerToSentences(a: QuestionAnswer): Sentence[] {
  const sentences: Sentence[] = [];
  const headlineRefs = a.evidenceRefs.map((r) => r.factId);
  let headline = a.headline;
  if (a.interval) {
    const hasRangeWords = /between|range/i.test(headline);
    if (!hasRangeWords) {
      headline += ` (range ${formatCurrency(a.interval.p10)}–${formatCurrency(a.interval.p90)}, confidence: ${a.confidenceClass}).`;
    }
  }
  sentences.push({ text: headline, refs: headlineRefs, section: questionById(a.questionId)?.shortLabel ?? a.questionId });
  for (const d of a.drivers.slice(0, 3)) {
    if (d.refs.length === 0 && /\d/.test(d.label)) continue;
    sentences.push({ text: `${d.label}.`, refs: d.refs, section: questionById(a.questionId)?.shortLabel ?? a.questionId });
  }
  return sentences;
}

function buildThread(answer: AnswerResult): NarrativeThread {
  const q = questionById(answer.questionId);
  if (!isAnswerable(answer)) {
    return {
      questionId: answer.questionId,
      question: q?.text ?? answer.questionId,
      verdict: `Not answerable yet: ${answer.reason}`,
      why: [],
      whatToDo: [{ label: answer.whatWouldUnlockIt, kind: "note" }],
      evidenceAppendix: [],
      confidenceClass: null,
    };
  }
  return {
    questionId: answer.questionId,
    question: q?.text ?? answer.questionId,
    verdict: answer.headline,
    why: answer.drivers.map((d) => ({ text: d.label, refs: d.refs, section: q?.shortLabel ?? answer.questionId })),
    whatToDo: answer.actions.map((a) => ({ label: a.label, kind: a.kind })),
    evidenceAppendix: answer.evidenceRefs.map((e) => ({ factId: e.factId, label: e.label, sourceView: e.sourceView })),
    confidenceClass: answer.confidenceClass,
  };
}

function sectionFromAnswers(heading: string, answers: AnswerResult[], _ledger: FactLedger): BriefSection {
  const sentences: Sentence[] = [];
  for (const a of answers) {
    if (isAnswerable(a)) {
      sentences.push(...answerToSentences(a));
    } else {
      sentences.push({ text: `${questionById(a.questionId)?.text ?? a.questionId}: not answerable yet — ${a.reason}`, refs: [], section: heading });
    }
  }
  const prose = sentences.map((s) => s.text).join(" ");
  return { heading, sentences, prose };
}

/** DailyBrief: the 5 first-10-minutes questions only, ≤5 min read, speech-ready. */
export function compileDailyBrief(ds: OrgDataset): BriefingPack {
  const ledger = new FactLedger();
  const answers = TOP_FIVE.map((q) => compileAllAnswersFind(ds, ledger, q.id));
  const threads = answers.map(buildThread);
  const sections: BriefSection[] = TOP_FIVE.map((q, i) => sectionFromAnswers(q.shortLabel, [answers[i]], ledger));
  const allSentences = sections.flatMap((s) => s.sentences);
  const fullProse = sections.map((s) => s.prose).join(" ");
  return finalize("daily", ds, "Daily Brief", sections, threads, ledger, allSentences, fullProse);
}

/** WeeklyPack: all 20 questions, grouped by domain, ≤15 min read. */
export function compileWeeklyPack(ds: OrgDataset): BriefingPack {
  const ledger = new FactLedger();
  const allAnswers = compileAllAnswers(ds, ledger);
  const domains = Array.from(new Set(QUESTION_ONTOLOGY.map((q) => q.domain)));
  const sections: BriefSection[] = domains.map((domain) => {
    const answers = allAnswers.filter((a) => a.domain === domain);
    return sectionFromAnswers(domain[0].toUpperCase() + domain.slice(1), answers, ledger);
  });
  const threads = allAnswers.map(buildThread);
  const allSentences = sections.flatMap((s) => s.sentences);
  const fullProse = sections.map((s) => s.prose).join(" ");
  return finalize("weekly", ds, "Weekly Pack", sections, threads, ledger, allSentences, fullProse);
}

/** BoardPack: monthly/quarterly, export-grade. Section order is configurable
 * by the studio (Phase 2); default order below matches a conventional board
 * deck narrative arc: verdict first, then plan, people, risk, market, forecast. */
export const BOARD_PACK_DEFAULT_ORDER = ["finance.onPlan", "strategy.objectivesOffTrack", "finance.runway", "people.attritionRisk", "risk.topRisk", "market.sentiment", "finance.forecastRange", "strategy.recentDecisions"];

export function compileBoardPack(ds: OrgDataset, sectionOrder: string[] = BOARD_PACK_DEFAULT_ORDER): BriefingPack {
  const ledger = new FactLedger();
  const orderedAnswers = sectionOrder.map((id) => compileAllAnswersFind(ds, ledger, id));
  const sections: BriefSection[] = sectionOrder.map((id, i) => sectionFromAnswers(questionById(id)?.shortLabel ?? id, [orderedAnswers[i]], ledger));
  const threads = orderedAnswers.map(buildThread);
  const allSentences = sections.flatMap((s) => s.sentences);
  const fullProse = sections.map((s) => s.prose).join(" ");
  return finalize("board", ds, `Board Pack — ${ds.strategy.quarterLabel}`, sections, threads, ledger, allSentences, fullProse);
}

function compileAllAnswersFind(ds: OrgDataset, ledger: FactLedger, questionId: string): AnswerResult {
  // Thin wrapper kept separate from compileAllAnswers so Daily/Board packs
  // only pay for the facts they actually cite (ledger ids stay compact and
  // meaningful in the appendix) rather than sharing WeeklyPack's full run.
  return compileAnswer(questionId, ds, ledger);
}

function finalize(
  kind: BriefKind,
  ds: OrgDataset,
  title: string,
  sections: BriefSection[],
  threads: NarrativeThread[],
  ledger: FactLedger,
  allSentences: Sentence[],
  fullProse: string,
): BriefingPack {
  const wc = wordCount(fullProse);
  return {
    kind,
    orgId: ds.id,
    orgLabel: ds.label,
    asOfDate: ds.asOf,
    title,
    sections,
    threads,
    ledger,
    wordCount: wc,
    estReadMinutes: Math.max(1, Math.round(wc / 180)),
    citationIssues: checkCitations(allSentences, ledger),
    speechLint: lintSpeechReady(fullProse),
    zeroFillerLint: lintZeroFiller(sections.map((s) => s.prose)),
  };
}

export function allFacts(pack: BriefingPack): Fact[] {
  return pack.ledger.all();
}
