// src/lib/findings.ts
//
// Findings: the single intake for anything the GRC engine surfaces as a
// problem (appetite breach, overdue control test, obligation breach). All
// findings can be linked to a Part 23 decision record (src/lib/decisions.ts)
// so governance follow-up is tracked end to end.

import { db } from "@/db";
import { findings, decisions } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { appendAuditEvent } from "./audit";

export type FindingSeverity = "low" | "medium" | "high" | "critical";
export type FindingSourceType = "appetite_breach" | "control_overdue" | "obligation_breach";

export interface CreateFindingInput {
  title: string;
  severity: FindingSeverity;
  sourceType: FindingSourceType;
  sourceRef: string;
  description: string;
}

function nextCode(prefix: string, n: number) {
  return `${prefix}-${String(n).padStart(4, "0")}`;
}

export async function createFinding(input: CreateFindingInput) {
  const existing = await db.select().from(findings);
  const code = nextCode("FND", existing.length + 1);
  const [row] = await db
    .insert(findings)
    .values({
      code,
      title: input.title,
      severity: input.severity,
      sourceType: input.sourceType,
      sourceRef: input.sourceRef,
      description: input.description,
    })
    .returning();

  await appendAuditEvent({
    category: "finding",
    entityType: "finding",
    entityId: String(row.id),
    action: "finding_raised",
    payload: { code, severity: input.severity, sourceType: input.sourceType, sourceRef: input.sourceRef },
    actor: "grc-engine",
  });

  return row;
}

export async function listFindings() {
  return db.select().from(findings).orderBy(desc(findings.createdAt));
}

/** Refer a finding into the Part 23 decision register (minimal stand-in — see decisions.ts). */
export async function referFindingToDecision(findingId: number, actor: string, title: string, rationale: string) {
  const existingDecisions = await db.select().from(decisions);
  const code = nextCode("DEC", existingDecisions.length + 1);
  const [decision] = await db
    .insert(decisions)
    .values({ code, title, rationale, linkedFindingIds: [findingId] })
    .returning();

  await db.update(findings).set({ status: "referred", linkedDecisionId: decision.id }).where(eq(findings.id, findingId));

  await appendAuditEvent({
    category: "finding",
    entityType: "finding",
    entityId: String(findingId),
    action: "finding_referred_to_decision",
    payload: { decisionCode: code },
    actor,
  });

  return decision;
}
