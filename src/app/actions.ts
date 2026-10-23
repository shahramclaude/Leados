"use server";

import { revalidatePath } from "next/cache";
import {
  createDecision,
  updateDecisionStatus,
  addDecisionComment,
  createSignal,
  updateSignalStatus,
  createCadenceMeeting,
  updateCadenceMeeting,
  runAgentPlaybook,
  createLeaderStateEntry,
} from "@/lib/queries";

function str(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function num(formData: FormData, key: string, fallback = 0) {
  const v = Number(formData.get(key));
  return Number.isFinite(v) ? v : fallback;
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

export async function createDecisionAction(formData: FormData) {
  const ownerIdRaw = str(formData, "ownerId");
  await createDecision({
    title: str(formData, "title"),
    description: str(formData, "description"),
    impact: (str(formData, "impact") || "medium") as "low" | "medium" | "high" | "critical",
    confidence: num(formData, "confidence", 50),
    rationale: str(formData, "rationale"),
    ownerId: ownerIdRaw ? Number(ownerIdRaw) : null,
  });
  revalidatePath("/decisions");
  revalidatePath("/");
}

export async function updateDecisionStatusAction(formData: FormData) {
  const id = num(formData, "id");
  const status = str(formData, "status") as "proposed" | "under_review" | "committed" | "reversed";
  await updateDecisionStatus(id, status);
  revalidatePath(`/decisions/${id}`);
  revalidatePath("/decisions");
  revalidatePath("/");
}

export async function addDecisionCommentAction(formData: FormData) {
  const id = num(formData, "id");
  const comment = str(formData, "comment");
  if (comment) {
    await addDecisionComment(id, comment);
  }
  revalidatePath(`/decisions/${id}`);
}

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

export async function createSignalAction(formData: FormData) {
  await createSignal({
    title: str(formData, "title"),
    description: str(formData, "description"),
    severity: (str(formData, "severity") || "medium") as "low" | "medium" | "high" | "critical",
    source: str(formData, "source") || "manual",
  });
  revalidatePath("/signals");
  revalidatePath("/");
}

export async function updateSignalStatusAction(formData: FormData) {
  const id = num(formData, "id");
  const status = str(formData, "status") as "new" | "investigating" | "resolved" | "dismissed";
  await updateSignalStatus(id, status);
  revalidatePath("/signals");
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Cadence
// ---------------------------------------------------------------------------

export async function createCadenceMeetingAction(formData: FormData) {
  const ownerIdRaw = str(formData, "ownerId");
  const nextOccurrenceRaw = str(formData, "nextOccurrence");
  await createCadenceMeeting({
    title: str(formData, "title"),
    type: (str(formData, "type") || "weekly") as "standup" | "weekly" | "monthly" | "quarterly" | "adhoc",
    ownerId: ownerIdRaw ? Number(ownerIdRaw) : null,
    nextOccurrence: nextOccurrenceRaw ? new Date(nextOccurrenceRaw) : new Date(),
    notes: str(formData, "notes"),
  });
  revalidatePath("/cadence");
  revalidatePath("/");
}

export async function markCadenceCompleteAction(formData: FormData) {
  const id = num(formData, "id");
  const effectivenessScore = num(formData, "effectivenessScore", 0);
  await updateCadenceMeeting(id, { status: "completed", effectivenessScore });
  revalidatePath("/cadence");
  revalidatePath("/");
}

export async function skipCadenceAction(formData: FormData) {
  const id = num(formData, "id");
  await updateCadenceMeeting(id, { status: "skipped" });
  revalidatePath("/cadence");
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export async function runAgentAction(formData: FormData) {
  const name = str(formData, "name");
  await runAgentPlaybook(name, {});
  revalidatePath("/agents");
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Leader state
// ---------------------------------------------------------------------------

export async function createLeaderStateEntryAction(formData: FormData) {
  const userId = num(formData, "userId");
  await createLeaderStateEntry({
    userId,
    decisionLoadScore: num(formData, "decisionLoadScore", 0),
    stressIndex: num(formData, "stressIndex", 0),
    focusHours: String(num(formData, "focusHours", 0)),
    notes: str(formData, "notes"),
  });
  revalidatePath("/my-state");
  revalidatePath("/");
}
