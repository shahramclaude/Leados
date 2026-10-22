// =============================================================================
// Part 32 — presentation generation (Phase 1 "Presentation generation").
// =============================================================================
// One slide spec per BriefSection (one-message-per-slide discipline), plus a
// title slide and an appendix slide per section listing its cited facts with
// methods ("how was this computed" = the fact's confidence class + domain).
// Every footnote on a slide carries a `sourceView` the cockpit can route to
// (click a footnote -> jump to that domain's source view) — see
// `EvidenceDrawer.tsx`. Speaker notes are generated from the section's
// `why` drivers so a presenter never has to improvise the evidence trail.
import type { BriefingPack } from "./briefingCompiler";
import type { Fact } from "./citations";

import type { ConfidenceClass } from "./types";

export interface SlideFootnote {
  marker: string; // e.g. "[1]"
  factId: number;
  label: string;
  formatted: string;
  confidence: ConfidenceClass;
  sourceView: string;
}

export interface SlideSpec {
  index: number;
  kind: "title" | "content" | "appendix";
  title: string;
  oneMessage: string;
  bullets: string[];
  footnotes: SlideFootnote[];
  speakerNotes: string;
}

export interface SlideDeck {
  title: string;
  subtitle: string;
  slides: SlideSpec[];
}

function footnotesFor(factIds: number[], facts: Fact[]): SlideFootnote[] {
  const byId = new Map(facts.map((f) => [f.id, f]));
  const unique = Array.from(new Set(factIds));
  return unique
    .map((id, i) => {
      const f = byId.get(id);
      if (!f) return null;
      return { marker: `[${i + 1}]`, factId: f.id, label: f.label, formatted: f.formatted, confidence: f.confidence, sourceView: f.sourceView };
    })
    .filter((x): x is SlideFootnote => x !== null);
}

export function generateSlideDeck(pack: BriefingPack): SlideDeck {
  const facts = pack.ledger.all();
  const slides: SlideSpec[] = [];

  slides.push({
    index: 0,
    kind: "title",
    title: pack.title,
    oneMessage: `${pack.orgLabel} — as of ${pack.asOfDate}`,
    bullets: [],
    footnotes: [],
    speakerNotes: `This deck was generated from ${facts.length} cited facts across ${pack.sections.length} sections. Every number on every slide traces to a source view via its footnote.`,
  });

  pack.sections.forEach((section, i) => {
    const factIds = section.sentences.flatMap((s) => s.refs);
    const oneMessage = section.sentences[0]?.text ?? `${section.heading}: no data yet.`;
    slides.push({
      index: i + 1,
      kind: "content",
      title: section.heading,
      oneMessage,
      bullets: section.sentences.slice(1).map((s) => s.text),
      footnotes: footnotesFor(factIds, facts),
      speakerNotes: section.sentences.map((s) => s.text).join(" ") || "No sentences generated for this section — present as a deliberate zero, not a gap in the deck.",
    });
  });

  slides.push({
    index: slides.length,
    kind: "appendix",
    title: "Appendix — Methods & Evidence",
    oneMessage: `${facts.length} facts cited across this pack.`,
    bullets: facts.map((f) => `${f.label}: ${f.formatted} (${f.confidence}, source: ${f.sourceView})`),
    footnotes: [],
    speakerNotes: "This appendix lists every numeric fact used anywhere in the deck, with its confidence class and source view, so any claim can be traced back to data.",
  });

  return { title: pack.title, subtitle: `${pack.orgLabel} · ${pack.asOfDate}`, slides };
}
