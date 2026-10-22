// Part 08 — number-citation contract.
//
// Every numeric fact that could end up in a narrative sentence is registered
// in a FactLedger and gets a stable integer id. `financialStory.ts` sentences
// carry `refs: number[]` pointing at ids in the ledger that produced them.
// `scripts/finance-citation-check.ts` (npm run finance:citation-check) then
// verifies, for every sentence of a generated board pack:
//   1. every ref id resolves to a real fact in the ledger snapshot, and
//   2. the fact's formatted value actually appears in the sentence text.
// Rule (2) is what stops a "technically cited" but misleading sentence: a
// sentence cannot cite fact #12 ($412,000) while printing a different number.

import { ConfidenceClass } from "./types";

export interface Fact {
  id: number;
  label: string;
  value: number;
  unit?: string;
  month?: string;
  confidence: ConfidenceClass;
  formatted: string;
}

export function formatFactValue(value: number, unit?: string): string {
  switch (unit) {
    case "usd":
      return value < 0
        ? `-$${Math.abs(Math.round(value)).toLocaleString("en-US")}`
        : `$${Math.round(value).toLocaleString("en-US")}`;
    case "usd1":
      return value < 0
        ? `-$${Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}`
        : `$${value.toLocaleString("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}`;
    case "pct":
      return `${(value * 100).toFixed(1)}%`;
    case "months":
      return `${value.toFixed(1)} months`;
    case "ratio":
      return `${value.toFixed(2)}x`;
    case "count":
      return `${Math.round(value).toLocaleString("en-US")}`;
    case "days":
      return `${value.toFixed(0)} days`;
    default:
      return `${Math.round(value * 100) / 100}`;
  }
}

export class FactLedger {
  private facts: Fact[] = [];

  cite(
    label: string,
    value: number,
    opts: { unit?: string; month?: string; confidence: ConfidenceClass },
  ): number {
    const id = this.facts.length + 1;
    this.facts.push({
      id,
      label,
      value,
      unit: opts.unit,
      month: opts.month,
      confidence: opts.confidence,
      formatted: formatFactValue(value, opts.unit),
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

/** Validates a list of sentences against the ledger that produced them.
 * Returns an empty array if everything checks out. */
export function checkCitations(sentences: Sentence[], ledger: FactLedger): CitationIssue[] {
  const issues: CitationIssue[] = [];
  for (const s of sentences) {
    if (s.refs.length === 0) {
      // Sentences with no numeric claims at all (e.g. pure risk headline)
      // are allowed only if they contain no digits.
      if (/\d/.test(s.text)) {
        issues.push({ section: s.section, text: s.text, reason: "contains a digit but cites no refs" });
      }
      continue;
    }
    for (const ref of s.refs) {
      const fact = ledger.get(ref);
      if (!fact) {
        issues.push({ section: s.section, text: s.text, reason: `ref ${ref} does not resolve in ledger` });
        continue;
      }
      if (!s.text.includes(fact.formatted)) {
        issues.push({
          section: s.section,
          text: s.text,
          reason: `ref ${ref} resolves to ${fact.formatted} but that value does not appear verbatim in the sentence`,
        });
      }
    }
  }
  return issues;
}
