// src/lib/executive/ontology.ts
//
// Executive question ontology (Part 32 surface) reconstructed for Part 41.
// A fixed set of leadership questions across the four domains this adaptive
// layer serves. Part 41 reorders these per usage (attentionProfile.ts) but
// never adds or removes questions based on adaptation — the ontology itself
// is content, and content is never gated by presentation preference.

import type { Domain } from "@/lib/familiarity";

export interface ExecutiveQuestion {
  id: string;
  domain: Domain;
  text: string;
  /** Default relevance weight used only to seed the neutral default order. */
  defaultWeight: number;
}

export const QUESTION_ONTOLOGY: ExecutiveQuestion[] = [
  { id: "fin-runway", domain: "finance", text: "How many months of runway do we have?", defaultWeight: 0.95 },
  { id: "fin-burn", domain: "finance", text: "Is burn trending up or down vs plan?", defaultWeight: 0.85 },
  { id: "fin-margin", domain: "finance", text: "Where is margin compressing?", defaultWeight: 0.7 },
  { id: "people-attrition", domain: "people", text: "Where is regrettable attrition concentrated?", defaultWeight: 0.9 },
  { id: "people-engagement", domain: "people", text: "Which teams show declining engagement?", defaultWeight: 0.7 },
  { id: "people-succession", domain: "people", text: "Which key roles lack a successor?", defaultWeight: 0.65 },
  { id: "risk-exposure", domain: "risk", text: "What is our single largest unmitigated exposure?", defaultWeight: 0.95 },
  { id: "risk-compliance", domain: "risk", text: "Are there open compliance breaches?", defaultWeight: 0.9 },
  { id: "risk-vendor", domain: "risk", text: "Which vendor concentration risk is growing?", defaultWeight: 0.6 },
  { id: "tech-incidents", domain: "tech", text: "What is the trend in production incidents?", defaultWeight: 0.8 },
  { id: "tech-debt", domain: "tech", text: "Where is technical debt blocking delivery?", defaultWeight: 0.6 },
  { id: "tech-security", domain: "tech", text: "Are there unresolved critical security findings?", defaultWeight: 0.95 },
];

export function questionsForDomain(domain: Domain): ExecutiveQuestion[] {
  return QUESTION_ONTOLOGY.filter((q) => q.domain === domain);
}

export function defaultQuestionOrder(): string[] {
  return [...QUESTION_ONTOLOGY].sort((a, b) => b.defaultWeight - a.defaultWeight).map((q) => q.id);
}
