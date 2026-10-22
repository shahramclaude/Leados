// Part 11 grounded pipeline (reconstructed minimal surface for Part 42).
//
// Cite-or-refuse contract: an answer is only ever emitted with >=1 citation
// into `evidenceDocuments`. If nothing clears the relevance threshold, the
// engine abstains explicitly rather than guessing.
import { db } from "@/db";
import { evidenceDocuments } from "@/db/schema";
import { composeDeterministicNarrative } from "./llmClient";

export interface Citation {
  evidenceId: string;
  title: string;
  snippet: string;
}

export interface GroundedAnswer {
  text: string;
  citations: Citation[];
  abstained: boolean;
  abstentionReason?: string;
}

const STOPWORDS = new Set([
  "the", "a", "an", "of", "for", "and", "or", "to", "in", "on", "is", "are",
  "was", "were", "what", "how", "why", "does", "did", "do", "it", "its",
  "that", "this", "with", "about", "please", "can", "you", "me", "our",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9%$.\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function snippetAround(body: string, terms: string[]): string {
  const lower = body.toLowerCase();
  let idx = -1;
  for (const t of terms) {
    idx = lower.indexOf(t);
    if (idx >= 0) break;
  }
  if (idx < 0) return body.slice(0, 160);
  const start = Math.max(0, idx - 60);
  const end = Math.min(body.length, idx + 100);
  return `${start > 0 ? "…" : ""}${body.slice(start, end).trim()}${end < body.length ? "…" : ""}`;
}

export interface ScopeFilter {
  timeframe?: string;
  metric?: string;
  scope?: string;
}

/** Score every evidence document against the query terms + active scope. */
export async function searchEvidence(queryText: string, scope: ScopeFilter = {}) {
  const docs = await db.select().from(evidenceDocuments);
  const terms = tokenize(queryText);
  const scopeTerms = tokenize([scope.timeframe, scope.metric, scope.scope].filter(Boolean).join(" "));

  const scored = docs.map((doc) => {
    const hay = tokenize(`${doc.title} ${doc.body} ${doc.tags.join(" ")} ${doc.metricTags.join(" ")}`);
    const haySet = new Set(hay);
    let score = 0;
    for (const t of terms) if (haySet.has(t)) score += 2;
    for (const t of scopeTerms) if (haySet.has(t)) score += 1;
    // Direct metric-tag hit is a strong signal for scope inheritance correctness.
    if (scope.metric && doc.metricTags.some((m) => m.toLowerCase() === scope.metric?.toLowerCase())) {
      score += 3;
    }
    if (scope.timeframe && doc.tags.some((t) => t.toLowerCase() === scope.timeframe?.toLowerCase())) {
      score += 3;
    }
    return { doc, score };
  });

  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
}

const RELEVANCE_THRESHOLD = 2;

/**
 * Cite-or-refuse: returns a grounded answer backed by real evidence rows, or
 * an explicit abstention. Never fabricates a citation.
 */
export async function groundAnswer(queryText: string, scope: ScopeFilter = {}): Promise<GroundedAnswer> {
  const ranked = await searchEvidence(queryText, scope);
  const strong = ranked.filter((r) => r.score >= RELEVANCE_THRESHOLD).slice(0, 4);

  if (strong.length === 0) {
    return {
      text: "I don't have grounded evidence to answer that. I'm not going to guess — try rephrasing, narrowing the timeframe, or pointing me at a document.",
      citations: [],
      abstained: true,
      abstentionReason: "no_evidence_above_threshold",
    };
  }

  const citations: Citation[] = strong.map((r) => ({
    evidenceId: r.doc.id,
    title: r.doc.title,
    snippet: snippetAround(r.doc.body, tokenize(queryText)),
  }));

  const narrative = composeDeterministicNarrative({
    question: queryText,
    evidenceSnippets: citations.map((c) => ({ title: c.title, snippet: c.snippet })),
  });

  return { text: narrative, citations, abstained: false };
}
