"use server";

import { revalidatePath } from "next/cache";
import { seedDemoData } from "@/lib/db/seed";
import {
  confirmCommitment,
  createCommitmentDraft,
  markKept,
  renegotiateCommitment,
  runExtractionFromArtifacts,
} from "@/lib/db/commitmentRepo";
import { findPersonByName } from "@/lib/db/peopleRepo";
import {
  acceptDelegation,
  checkinDelegation,
  completeDelegation,
  overrideBlockedDelegation,
  proposeDelegation,
} from "@/lib/db/delegationRepo";
import { approveDraft, attemptAutoSend, dismissDraft, runDetectionCycle } from "@/lib/db/proactiveRepo";
import { closeLoop, parkLoop, setNextStep, syncLoopsFromSurfaces } from "@/lib/db/loopRepo";

export async function seedAction() {
  await seedDemoData();
  revalidatePath("/");
}

export async function runExtractionAction() {
  await runExtractionFromArtifacts(async (name) => {
    if (!name) return null;
    const p = await findPersonByName(name);
    return p?.id ?? null;
  });
  revalidatePath("/commitments");
}

export async function confirmCommitmentAction(formData: FormData) {
  const id = String(formData.get("id"));
  const actorId = String(formData.get("actorId"));
  await confirmCommitment(id, actorId);
  revalidatePath("/commitments");
}

export async function keepCommitmentAction(formData: FormData) {
  const id = String(formData.get("id"));
  const actorId = String(formData.get("actorId"));
  await markKept(id, actorId);
  revalidatePath("/commitments");
}

export async function renegotiateCommitmentAction(formData: FormData) {
  const id = String(formData.get("id"));
  const actorId = String(formData.get("actorId"));
  const newDueAt = String(formData.get("newDueAt"));
  const note = String(formData.get("note") ?? "");
  await renegotiateCommitment(id, newDueAt, actorId, note);
  revalidatePath("/commitments");
}

export async function createCommitmentAction(formData: FormData) {
  const promisorId = String(formData.get("promisorId"));
  const promiseeId = String(formData.get("promiseeId"));
  const content = String(formData.get("content"));
  const dueAt = String(formData.get("dueAt"));
  await createCommitmentDraft({
    promisorId,
    promiseeId,
    content,
    dueAt: new Date(dueAt),
    context: { sourceType: "manual", surface: "commitments_view" },
    confirmed: true,
  });
  revalidatePath("/commitments");
}

export async function proposeDelegationAction(formData: FormData) {
  const delegatorId = String(formData.get("delegatorId"));
  const delegateId = String(formData.get("delegateId"));
  const task = String(formData.get("task"));
  const actionClassKey = String(formData.get("actionClassKey"));
  const estimatedHours = Number(formData.get("estimatedHours"));
  const weekOf = String(formData.get("weekOf"));
  const skillTags = String(formData.get("skillTags") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  await proposeDelegation({ delegatorId, delegateId, task, actionClassKey, estimatedHours, weekOf, skillTags });
  revalidatePath("/delegation");
}

export async function overrideDelegationAction(formData: FormData) {
  const id = String(formData.get("id"));
  const actorId = String(formData.get("actorId"));
  const reason = String(formData.get("reason") ?? "");
  await overrideBlockedDelegation(id, actorId, reason);
  revalidatePath("/delegation");
}

export async function acceptDelegationAction(formData: FormData) {
  await acceptDelegation(String(formData.get("id")));
  revalidatePath("/delegation");
}

export async function checkinDelegationAction(formData: FormData) {
  await checkinDelegation(String(formData.get("id")));
  revalidatePath("/delegation");
}

export async function completeDelegationAction(formData: FormData) {
  await completeDelegation(String(formData.get("id")));
  revalidatePath("/delegation");
}

export async function runDetectionCycleAction() {
  await runDetectionCycle();
  revalidatePath("/proactive");
}

export async function approveDraftAction(formData: FormData) {
  const id = String(formData.get("id"));
  const actorId = String(formData.get("actorId"));
  await approveDraft(id, actorId);
  await attemptAutoSend(id); // no-op unless tier+grant both allow it; always audited
  revalidatePath("/proactive");
}

export async function dismissDraftAction(formData: FormData) {
  const id = String(formData.get("id"));
  const actorId = String(formData.get("actorId"));
  await dismissDraft(id, actorId);
  revalidatePath("/proactive");
}

export async function syncLoopsAction() {
  await syncLoopsFromSurfaces();
  revalidatePath("/loops");
}

export async function parkLoopAction(formData: FormData) {
  const id = String(formData.get("id"));
  const actorId = String(formData.get("actorId"));
  const reason = String(formData.get("reason") ?? "");
  const until = String(formData.get("until") ?? "");
  await parkLoop(id, reason, actorId, until || undefined);
  revalidatePath("/loops");
}

export async function closeLoopAction(formData: FormData) {
  const id = String(formData.get("id"));
  const actorId = String(formData.get("actorId"));
  await closeLoop(id, actorId);
  revalidatePath("/loops");
}

export async function setNextStepAction(formData: FormData) {
  const id = String(formData.get("id"));
  const actorId = String(formData.get("actorId"));
  const nextStep = String(formData.get("nextStep"));
  const ownerId = String(formData.get("ownerId"));
  await setNextStep(id, nextStep, ownerId, actorId);
  revalidatePath("/loops");
}
