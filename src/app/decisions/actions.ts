"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  raiseDecision,
  frameDecision,
  markEvidenceGathered,
  addDissent,
  commitDecision,
  reviewDecision,
  addCorrection,
} from "@/lib/decision/decisionEngine";
import { recordDQScore } from "@/lib/decision/decisionQualityStore";
import { createPreMortem } from "@/lib/decision/premortem";
import { createJournalEntry } from "@/lib/decision/journal";
import { upsertDecisionRights } from "@/lib/decision/decisionRights";
import { ingestSignalReading, evaluateTriggersForOrg } from "@/lib/decision/triggers";
import type { TriggerCondition } from "@/lib/decision/types";

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

export async function createDecisionAction(formData: FormData) {
  const orgId = str(formData, "orgId");
  const decision = await raiseDecision({
    orgId,
    decisionClass: str(formData, "decisionClass"),
    question: str(formData, "question"),
    decisionType: str(formData, "decisionType") as "type1" | "type2",
    raisedBy: str(formData, "raisedBy") || null,
    impact: Number(formData.get("impact") ?? 3),
  });
  revalidatePath("/decisions");
  redirect(`/decisions/${decision.id}?org=${orgId}`);
}

function parseTriggerConditions(raw: string): TriggerCondition[] {
  // format: one per line "signal op value", e.g. "churn_rate gt 0.08"
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [signal, op, value] = line.split(/\s+/);
      return { signal, op: op as TriggerCondition["op"], value: Number(value) };
    })
    .filter((tc) => tc.signal && tc.op && Number.isFinite(tc.value));
}

export async function frameDecisionAction(formData: FormData) {
  const decisionId = str(formData, "decisionId");
  const orgId = str(formData, "orgId");
  const optionsConsidered = str(formData, "optionsConsidered")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const optionEvidence: Record<string, unknown> = {};
  for (const option of optionsConsidered) {
    const rationale = str(formData, `rationale__${option}`);
    const low = formData.get(`low__${option}`);
    const high = formData.get(`high__${option}`);
    const confidence = str(formData, `confidence__${option}`);
    if (rationale || low || high) {
      optionEvidence[option] = {
        value: option,
        rationale: rationale || "(no rationale provided)",
        confidence: confidence || undefined,
        interval:
          low && high
            ? { low: Number(low), high: Number(high) }
            : undefined,
      };
    }
  }

  const triggerConditions = parseTriggerConditions(str(formData, "triggerConditions"));

  await frameDecision(
    decisionId,
    {
      optionsConsidered,
      optionEvidence: optionEvidence as any,
      reversibilityPlan: str(formData, "reversibilityPlan") || undefined,
      triggerConditions,
    },
    str(formData, "actorId") || null,
  );

  const hasAnyEvidence = Object.keys(optionEvidence).length > 0;
  if (hasAnyEvidence) {
    await markEvidenceGathered(decisionId, optionEvidence as any, str(formData, "actorId") || null);
  }

  revalidatePath(`/decisions/${decisionId}`);
  redirect(`/decisions/${decisionId}?org=${orgId}`);
}

export async function addDissentAction(formData: FormData) {
  const decisionId = str(formData, "decisionId");
  const orgId = str(formData, "orgId");
  await addDissent(decisionId, {
    whoName: str(formData, "whoName"),
    theCase: str(formData, "theCase"),
    response: str(formData, "response") || null,
  });
  revalidatePath(`/decisions/${decisionId}`);
  redirect(`/decisions/${decisionId}?org=${orgId}`);
}

export async function commitDecisionAction(formData: FormData) {
  const decisionId = str(formData, "decisionId");
  const orgId = str(formData, "orgId");
  const low = formData.get("intervalLow");
  const high = formData.get("intervalHigh");

  const triggerConditions = parseTriggerConditions(str(formData, "triggerConditions"));

  await commitDecision(decisionId, {
    chosen: str(formData, "chosen"),
    choiceRationale: str(formData, "choiceRationale"),
    expectedOutcome: str(formData, "expectedOutcome"),
    expectedInterval: low && high ? { low: Number(low), high: Number(high) } : undefined,
    confidenceClass: str(formData, "confidenceClass") as "low" | "medium" | "high",
    reviewAt: str(formData, "reviewAt"),
    decidedBy: str(formData, "decidedBy"),
    triggerConditions: triggerConditions.length ? triggerConditions : undefined,
  });

  revalidatePath(`/decisions/${decisionId}`);
  revalidatePath("/decisions");
  redirect(`/decisions/${decisionId}?org=${orgId}`);
}

export async function reviewDecisionAction(formData: FormData) {
  const decisionId = str(formData, "decisionId");
  const orgId = str(formData, "orgId");
  await reviewDecision(decisionId, str(formData, "actorId") || null);
  revalidatePath(`/decisions/${decisionId}`);
  redirect(`/decisions/${decisionId}?org=${orgId}`);
}

export async function addCorrectionAction(formData: FormData) {
  const decisionId = str(formData, "decisionId");
  const orgId = str(formData, "orgId");
  await addCorrection(
    decisionId,
    str(formData, "correctionType") || "clarification",
    str(formData, "note"),
    {},
    str(formData, "actorId") || null,
  );
  revalidatePath(`/decisions/${decisionId}`);
  redirect(`/decisions/${decisionId}?org=${orgId}`);
}

export async function scoreDecisionAction(formData: FormData) {
  const decisionId = str(formData, "decisionId");
  const orgId = str(formData, "orgId");
  const dims = ["frame", "options", "evidence", "expectations", "reversibility", "review"] as const;
  const scores: Record<string, number> = {};
  for (const d of dims) {
    const v = formData.get(d);
    if (v !== null && v !== "") scores[d] = Number(v);
  }
  await recordDQScore(decisionId, {
    scores,
    scoredBy: str(formData, "scoredBy") || "anonymous rater",
    notes: str(formData, "notes"),
  });
  revalidatePath(`/decisions/${decisionId}`);
  revalidatePath("/decisions/quality");
  redirect(`/decisions/${decisionId}?org=${orgId}`);
}

export async function createPremortemAction(formData: FormData) {
  const decisionId = str(formData, "decisionId");
  const orgId = str(formData, "orgId");
  const reasons = str(formData, "reasons")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const mitigations = str(formData, "mitigations")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  await createPreMortem({ decisionId, reasons, mitigations, createdBy: str(formData, "actorId") || null });
  revalidatePath(`/decisions/${decisionId}`);
  redirect(`/decisions/${decisionId}?org=${orgId}`);
}

export async function createJournalAction(formData: FormData) {
  const orgId = str(formData, "orgId");
  await createJournalEntry({
    orgId,
    decisionId: str(formData, "decisionId") || null,
    userId: str(formData, "userId") || null,
    whatIDecided: str(formData, "whatIDecided"),
    whatIExpected: str(formData, "whatIExpected"),
    whatHappened: str(formData, "whatHappened") || null,
    whatILearned: str(formData, "whatILearned") || null,
  });
  revalidatePath("/decisions/journal");
  redirect(`/decisions/journal?org=${orgId}`);
}

export async function upsertRightsAction(formData: FormData) {
  const orgId = str(formData, "orgId");
  await upsertDecisionRights({
    orgId,
    decisionClass: str(formData, "decisionClass"),
    deciderRole: str(formData, "deciderRole") || null,
    consultedRoles: str(formData, "consultedRoles")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    informedRoles: str(formData, "informedRoles")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  });
  revalidatePath("/decisions/rights");
  redirect(`/decisions/rights?org=${orgId}`);
}

export async function ingestSignalAction(formData: FormData) {
  const orgId = str(formData, "orgId");
  await ingestSignalReading({
    orgId,
    signal: str(formData, "signal"),
    value: Number(formData.get("value")),
  });
  await evaluateTriggersForOrg(orgId);
  revalidatePath("/decisions/debt");
  redirect(`/decisions/debt?org=${orgId}`);
}

export async function evaluateTriggersAction(formData: FormData) {
  const orgId = str(formData, "orgId");
  await evaluateTriggersForOrg(orgId);
  revalidatePath("/decisions/debt");
  redirect(`/decisions/debt?org=${orgId}`);
}
