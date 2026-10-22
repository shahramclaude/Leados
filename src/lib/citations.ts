// =============================================================================
// Part 32 — number-citation contract, ported from Part 08's
// `src/lib/finance/citations.ts` and generalized across all six domains
// (strategy/finance/people/risk/operations/market) instead of finance-only.
//
// Rule, unchanged from Part 08: every numeric fact that could appear in a
// generated sentence is registered in a FactLedger and gets a stable integer
// id. Sentences carry `refs: number[]`. `checkCitations` verifies, for every
// sentence:
//   1. every ref id resolves to a real fact in the ledger snapshot, and
//   2. the fact's formatted value appears verbatim in the sentence text.
// This is the hard gate referenced throughout this part as "Part 08's lint".
// =============================================================================
import type { ConfidenceClass, Domain } from "./types";

export interface Fact {
  id: number;
  label: string;
  value: number;
  unit?: FactUnit;
  domain: Domain;
  sourceView: string;
  confidence: ConfidenceClass;
  formatted: string;
  interval?: { p10: number; p50: number; p90: number };
}

export type FactUnit = "usd" | "pct" | "ratio" | "count" | "months" | "days" | "score" | "bps";

export function formatFactValue(value: number, unit?: FactUnit): string {
  switch (unit) {
    case "usd":
      return value < 0
        ? `-$${Math.abs(Math.round(value)).toLocaleString("en-US")}`
        : `$${Math.round(value).toLocaleString("en-US")}`;
    case "pct":
      return `${value.toFixed(1)}%`;
    case "ratio":
      return `${value.toFixed(2)}x`;
    case "count":
      return `${Math.round(value).toLocaleString("en-US")}`;
    case "months":
      return `${value.toFixed(1)} months`;
    case "days":
      return `${value.toFixed(0)} days`;
    case "score":
      return `${value.toFixed(1)}/100`;
    case "bps":
      return `${Math.round(value)} bps`;
    default:
      return `${Math.round(value * 100) / 100}`;
  }
}

export class FactLedger {
  private facts: Fact[] = [];

  cite(
    label: string,
    value: number,
    opts: { unit?: FactUnit; domain: Domain; sourceView: string; confidence: ConfidenceClass; interval?: { p10: number; p50: number; p90: number } },
  ): number {
    const id = this.facts.length + 1;
    this.facts.push({
      id,
      label,
      value,
      unit: opts.unit,
      domain: opts.domain,
      sourceView: opts.sourceView,
      confidence: opts.confidence,
      formatted: formatFactValue(value, opts.unit),
      interval: opts.interval,
    });
    return id;
  }

  get(id: number): Fact | undefined {
    return this.facts.find((f) => f.id === id);
  }

  all(): Fact[] {
    return this.facts;
  }

  toJSON(): Fact[] {
    return this.facts;
  }

  /** Stable hash of the ledger's values — used by snapshot.ts to detect that
   * underlying numbers changed since a pack was frozen. */
  fingerprint(): string {
    const s = this.facts.map((f) => `${f.id}:${f.value}:${f.confidence}`).join("|");
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    }
    return `fp_${(h >>> 0).toString(16)}`;
  }

  static fromJSON(facts: Fact[]): FactLedger {
    const ledger = new FactLedger();
    ledger.facts = facts;
    return ledger;
  }
}

export interface Sentence {
  text: string;
  refs: number[];
  section: string;
}

export interface CitationIssue {
  section: string;
  text: string;
  reason: string;
}

/** Validates sentences against the ledger that produced them. Empty array = clean. */
export function checkCitations(sentences: Sentence[], ledger: FactLedger): CitationIssue[] {
  const issues: CitationIssue[] = [];
  for (const sent of sentences) {
    if (sent.refs.length === 0) {
      if (/\d/.test(sent.text)) {
        issues.push({ section: sent.section, text: sent.text, reason: "contains a digit but cites no refs" });
      }
      continue;
    }
    for (const ref of sent.refs) {
      const fact = ledger.get(ref);
      if (!fact) {
        issues.push({ section: sent.section, text: sent.text, reason: `ref ${ref} does not resolve in ledger` });
        continue;
      }
      if (!sent.text.includes(fact.formatted)) {
        issues.push({
          section: sent.section,
          text: sent.text,
          reason: `ref ${ref} resolves to ${fact.formatted} but that value does not appear verbatim in the sentence`,
        });
      }
    }
  }
  return issues;
}
