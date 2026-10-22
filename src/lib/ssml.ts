// =============================================================================
// Part 32 — voice/ambient layer seam (Phase 1: "briefs are speech-ready").
// =============================================================================
// SEAM, CLEARLY LEDGERED: there is no TTS engine wired up anywhere in this
// part. What exists is a deterministic, pure-function mapping from a
// `NarrativeSentence[]` (the same sentence shape `briefingCompiler.ts`
// already produces, post speech-ready lint) to an SSML document string. The
// contract: <s> per sentence, a short <break> between sections, and
// <say-as interpret-as="..."> around numeric facts so money/percent/ratio
// values are read correctly ("four hundred twelve thousand dollars", not
// "dollar sign four one two comma zero zero zero"). A future voice interface
// consumes this SSML directly; nothing else in the app needs to know it
// exists. If wired to a real engine, swap `renderSsml`'s caller for an
// actual `POST /v1/text-to-speech` call — the SSML shape does not change.
import type { Fact } from "./citations";
import type { FactUnit } from "./citations";

export interface NarrativeSentence {
  text: string;
  refs: number[];
  section: string;
}

function sayAsType(unit?: FactUnit): "currency" | "cardinal" | "unit" | null {
  if (unit === "usd") return "currency";
  if (unit === "count" || unit === "score") return "cardinal";
  return null;
}

/** Wraps the formatted value of each cited fact in <say-as> inside a
 * sentence, best-effort (string replace on the formatted value — the same
 * verbatim-match guarantee the citation lint already enforces makes this
 * safe: if `checkCitations` passed, the formatted value is guaranteed to be
 * present in the text). */
function markupSentence(sentence: NarrativeSentence, factsById: Map<number, Fact>): string {
  let text = sentence.text;
  for (const ref of sentence.refs) {
    const fact = factsById.get(ref);
    if (!fact) continue;
    const kind = sayAsType(fact.unit);
    if (!kind) continue;
    const ssmlValue = kind === "currency"
      ? `<say-as interpret-as="currency">USD${Math.round(fact.value)}</say-as>`
      : `<say-as interpret-as="cardinal">${fact.formatted.replace(/[^0-9.-]/g, "")}</say-as>`;
    text = text.split(fact.formatted).join(ssmlValue);
  }
  return `<s>${escapeXml(text, true)}</s>`;
}

function escapeXml(text: string, allowSayAs: boolean): string {
  // Escape everything except the <s>/<say-as> tags we just inserted.
  if (!allowSayAs) return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text.replace(/&(?!amp;)/g, "&amp;");
}

export interface SsmlDocument {
  ssml: string;
  sentenceCount: number;
  sayAsCount: number;
}

export function renderSsml(sentences: NarrativeSentence[], facts: Fact[], docTitle: string): SsmlDocument {
  const factsById = new Map(facts.map((f) => [f.id, f]));
  const bySection = new Map<string, NarrativeSentence[]>();
  for (const sent of sentences) {
    const list = bySection.get(sent.section) ?? [];
    list.push(sent);
    bySection.set(sent.section, list);
  }

  const body: string[] = [];
  let sayAsCount = 0;
  for (const [section, sents] of bySection) {
    body.push(`<p><s>${escapeXml(section, false)}.</s><break time="400ms"/>`);
    for (const sent of sents) {
      const marked = markupSentence(sent, factsById);
      sayAsCount += (marked.match(/<say-as/g) ?? []).length;
      body.push(marked);
    }
    body.push(`<break time="600ms"/></p>`);
  }

  const ssml = `<speak><p><s>${escapeXml(docTitle, false)}.</s></p>${body.join("")}</speak>`;
  return { ssml, sentenceCount: sentences.length, sayAsCount };
}
