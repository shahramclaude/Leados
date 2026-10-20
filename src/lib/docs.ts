// src/lib/docs.ts
//
// The README/whitepaper-style narrative surface renders FROM the living
// documents system (livingDocs.ts) instead of hard-coded marketing copy.
// This module just owns the one well-known slug ("whitepaper") and makes
// sure it exists with sensible default blocks the first time it's asked
// for, so the About page always has something live to render.
import { createLivingDoc, addVersion, getDoc, renderLive, type DocBlock } from "@/lib/livingDocs";

export const WHITEPAPER_SLUG = "whitepaper";

const DEFAULT_BLOCKS: DocBlock[] = [
  {
    type: "text",
    content:
      "LEADOS is the organization's durable brain: a knowledge graph of who did what and why, " +
      "an institutional memory that never forgets a lesson, hypotheses tracked and scored like a " +
      "forecaster's bet, and playbooks that get better every time they're used.",
  },
  { type: "text", content: "## Live signal" },
  { type: "metric", metricKey: "decision_velocity_per_month", label: "Decisions recorded per month" },
  { type: "metric", metricKey: "playbook_adoption_rate", label: "Playbook adoption rate" },
  { type: "text", content: "## What we learned most recently" },
];

/** Ensure the whitepaper living doc exists (idempotent) and has at least one version. */
export async function ensureWhitepaper(latestFindingId?: number) {
  await createLivingDoc({ slug: WHITEPAPER_SLUG, title: "LEADOS — How the organization remembers", docType: "whitepaper" });
  const existing = await getDoc(WHITEPAPER_SLUG);
  if (existing && existing.versions.length > 0) return existing;
  const blocks: DocBlock[] = latestFindingId
    ? [...DEFAULT_BLOCKS, { type: "finding", retrospectiveId: latestFindingId }]
    : DEFAULT_BLOCKS;
  await addVersion({ slug: WHITEPAPER_SLUG, blocks, authorName: "system", changeNote: "Seed whitepaper" });
  return getDoc(WHITEPAPER_SLUG);
}

export async function getWhitepaperMarkdown(): Promise<string> {
  await ensureWhitepaper();
  const content = await renderLive(WHITEPAPER_SLUG);
  return content ?? "_Whitepaper not yet generated._";
}
