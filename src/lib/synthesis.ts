// src/lib/synthesis.ts
//
// Weekly synthesis: composes findings (retrospectives), decisions/outcomes,
// resolved hypotheses, and invoked playbooks from a period into one
// coherent, citation-backed narrative using the stable template in
// narrativeIntel.ts — so two weeks are structurally diffable.
import { and, desc, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { hypotheses, hypothesisEvidence, metricValues, playbookRuns, playbooks, retrospectives, synthesisReports } from "@/db/schema";
import { computeGenome } from "@/lib/genome";
import { diffLines, makeCitation, renderNarrative, type Citation, type NarrativeSection } from "@/lib/narrativeIntel";

export interface GenerateSynthesisInput {
  periodStart: string; // ISO date
  periodEnd: string; // ISO date
}

export async function generateWeeklySynthesis(input: GenerateSynthesisInput) {
  const citations: Citation[] = [];
  const sections: NarrativeSection[] = [];

  const retroRows = await db
    .select()
    .from(retrospectives)
    .where(and(gte(retrospectives.occurredAt, input.periodStart), lte(retrospectives.occurredAt, input.periodEnd)))
    .orderBy(desc(retrospectives.occurredAt));

  const highlights = retroRows.slice(0, 5).map((r) => {
    const c = makeCitation("retrospective", r.id, r.title);
    citations.push(c);
    return `- ${r.title} ${c.marker}`;
  });
  sections.push({ heading: "Highlights", body: highlights.length ? highlights.join("\n") : "_No retrospectives recorded this period._" });

  const decisions = retroRows.map((r) => {
    const c = makeCitation("retrospective", r.id, `${r.title} — ${r.lesson}`);
    citations.push(c);
    return `- **Situation**: ${r.situation}\n  **Decision**: ${r.decision}\n  **Outcome**: ${r.outcome} ${c.marker}`;
  });
  sections.push({ heading: "Decisions & Outcomes", body: decisions.length ? decisions.join("\n") : "_No decisions logged this period._" });

  const resolvedHyps = await db
    .select()
    .from(hypotheses)
    .where(and(gte(hypotheses.resolvedAt, new Date(input.periodStart)), lte(hypotheses.resolvedAt, new Date(`${input.periodEnd}T23:59:59Z`))));
  const hypLines = resolvedHyps.map((h) => {
    const c = makeCitation("hypothesis", h.id, h.title);
    citations.push(c);
    return `- "${h.title}" resolved **${h.status === "resolved_true" ? "TRUE" : "FALSE"}** (owner: ${h.ownerName}, final p=${h.currentProbability.toFixed(2)}) ${c.marker}`;
  });
  sections.push({ heading: "Hypotheses Resolved", body: hypLines.length ? hypLines.join("\n") : "_No hypotheses resolved this period._" });

  const runs = await db
    .select()
    .from(playbookRuns)
    .where(and(gte(playbookRuns.startedAt, new Date(input.periodStart)), lte(playbookRuns.startedAt, new Date(`${input.periodEnd}T23:59:59Z`))));
  const runLines = await Promise.all(
    runs.map(async (run) => {
      const [pb] = await db.select().from(playbooks).where(and(gte(playbooks.id, run.playbookId), lte(playbooks.id, run.playbookId)));
      const c = makeCitation("playbook_run", run.id, pb ? pb.title : `playbook #${run.playbookId}`);
      citations.push(c);
      return `- Invoked "${pb?.title ?? run.playbookId}" by ${run.invokedBy} (${run.invokedVia}) — status: ${run.status} ${c.marker}`;
    })
  );
  sections.push({ heading: "Playbooks Invoked", body: runLines.length ? runLines.join("\n") : "_No playbooks invoked this period._" });

  const openHighRiskHyps = await db.select().from(hypotheses).where(gte(hypotheses.currentProbability, 0));
  const watchItems = openHighRiskHyps
    .filter((h) => h.status === "open" && (h.currentProbability >= 0.7 || h.currentProbability <= 0.3))
    .slice(0, 5)
    .map((h) => {
      const c = makeCitation("hypothesis", h.id, h.title);
      citations.push(c);
      return `- "${h.title}" sitting at p=${h.currentProbability.toFixed(2)} (owner: ${h.ownerName}) ${c.marker}`;
    });
  sections.push({ heading: "Risks & Watch Items", body: watchItems.length ? watchItems.join("\n") : "_No open hypotheses at a notable extreme this period._" });

  const genome = await computeGenome();
  const metricsBody = [
    `- Decision velocity (trailing 6mo): ${genome.decisionVelocityPerMonth.toFixed(2)} retrospectives/month`,
    `- Playbook adoption rate: ${(genome.playbookAdoptionRate * 100).toFixed(0)}%`,
    `- Active playbooks: ${genome.activePlaybookCount}`,
    `- Dominant relation types: ${genome.relationMix.slice(0, 3).map((m) => `${m.type} (${(m.share * 100).toFixed(0)}%)`).join(", ") || "n/a"}`,
  ].join("\n");
  sections.push({ heading: "Metrics Snapshot", body: metricsBody });

  const title = `Weekly Synthesis — ${input.periodStart} to ${input.periodEnd}`;
  const narrative = renderNarrative(title, sections, citations);

  const [row] = await db
    .insert(synthesisReports)
    .values({
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      title,
      narrative,
      citations,
      template: "weekly-v1",
    })
    .returning();
  return row;
}

export async function listSynthesisReports(limit = 20) {
  return db.select().from(synthesisReports).orderBy(desc(synthesisReports.periodStart)).limit(limit);
}

/** Diff this report's narrative against the immediately preceding report (week-over-week). */
export async function diffAgainstPrevious(reportId: number) {
  const rows = await db.select().from(synthesisReports).orderBy(desc(synthesisReports.periodStart));
  const idx = rows.findIndex((r) => r.id === reportId);
  if (idx === -1) throw new Error(`Synthesis report ${reportId} not found`);
  const current = rows[idx];
  const previous = rows[idx + 1];
  if (!previous) return { current, previous: null, diff: null };
  return { current, previous, diff: diffLines(previous.narrative, current.narrative) };
}
