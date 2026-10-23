"use server";

import { db } from "@/db";
import {
  decisions,
  signals,
  cadenceItems,
  boardItems,
  riskItems,
  initiatives,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalStr(formData: FormData, key: string): string | null {
  const value = str(formData, key);
  return value.length > 0 ? value : null;
}

function optionalDate(formData: FormData, key: string): Date | null {
  const value = str(formData, key);
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

export async function createDecision(formData: FormData) {
  await db.insert(decisions).values({
    title: str(formData, "title"),
    description: optionalStr(formData, "description"),
    owner: str(formData, "owner"),
    rationale: optionalStr(formData, "rationale"),
    impact: optionalStr(formData, "impact"),
    status: (str(formData, "status") || "proposed") as (typeof decisions.$inferInsert)["status"],
  });
  revalidatePath("/decisions");
  revalidatePath("/");
}

export async function updateDecisionStatus(formData: FormData) {
  const id = str(formData, "id");
  const status = str(formData, "status") as (typeof decisions.$inferInsert)["status"];
  const decidedAt = status === "committed" || status === "implemented" ? new Date() : undefined;
  await db
    .update(decisions)
    .set({ status, updatedAt: new Date(), ...(decidedAt ? { decidedAt } : {}) })
    .where(eq(decisions.id, id));
  revalidatePath("/decisions");
  revalidatePath("/");
}

export async function deleteDecision(formData: FormData) {
  const id = str(formData, "id");
  await db.delete(decisions).where(eq(decisions.id, id));
  revalidatePath("/decisions");
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

export async function createSignal(formData: FormData) {
  await db.insert(signals).values({
    title: str(formData, "title"),
    description: optionalStr(formData, "description"),
    source: str(formData, "source"),
    severity: (str(formData, "severity") || "medium") as (typeof signals.$inferInsert)["severity"],
    status: (str(formData, "status") || "new") as (typeof signals.$inferInsert)["status"],
  });
  revalidatePath("/signals");
  revalidatePath("/");
}

export async function updateSignalStatus(formData: FormData) {
  const id = str(formData, "id");
  const status = str(formData, "status") as (typeof signals.$inferInsert)["status"];
  await db
    .update(signals)
    .set({ status, updatedAt: new Date() })
    .where(eq(signals.id, id));
  revalidatePath("/signals");
  revalidatePath("/");
}

export async function deleteSignal(formData: FormData) {
  const id = str(formData, "id");
  await db.delete(signals).where(eq(signals.id, id));
  revalidatePath("/signals");
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Cadence
// ---------------------------------------------------------------------------

export async function createCadenceItem(formData: FormData) {
  await db.insert(cadenceItems).values({
    title: str(formData, "title"),
    type: (str(formData, "type") || "meeting") as (typeof cadenceItems.$inferInsert)["type"],
    frequency: (str(formData, "frequency") || "weekly") as (typeof cadenceItems.$inferInsert)["frequency"],
    owner: str(formData, "owner"),
    nextOccurrence: optionalDate(formData, "nextOccurrence"),
  });
  revalidatePath("/cadence");
  revalidatePath("/");
}

export async function updateCadenceStatus(formData: FormData) {
  const id = str(formData, "id");
  const status = str(formData, "status") as (typeof cadenceItems.$inferInsert)["status"];
  await db
    .update(cadenceItems)
    .set({ status, updatedAt: new Date() })
    .where(eq(cadenceItems.id, id));
  revalidatePath("/cadence");
  revalidatePath("/");
}

export async function deleteCadenceItem(formData: FormData) {
  const id = str(formData, "id");
  await db.delete(cadenceItems).where(eq(cadenceItems.id, id));
  revalidatePath("/cadence");
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

export async function createBoardItem(formData: FormData) {
  await db.insert(boardItems).values({
    title: str(formData, "title"),
    type: (str(formData, "type") || "pack") as (typeof boardItems.$inferInsert)["type"],
    owner: str(formData, "owner"),
    summary: optionalStr(formData, "summary"),
    meetingDate: optionalDate(formData, "meetingDate"),
  });
  revalidatePath("/board");
  revalidatePath("/");
}

export async function updateBoardItemStatus(formData: FormData) {
  const id = str(formData, "id");
  const status = str(formData, "status") as (typeof boardItems.$inferInsert)["status"];
  await db
    .update(boardItems)
    .set({ status, updatedAt: new Date() })
    .where(eq(boardItems.id, id));
  revalidatePath("/board");
  revalidatePath("/");
}

export async function deleteBoardItem(formData: FormData) {
  const id = str(formData, "id");
  await db.delete(boardItems).where(eq(boardItems.id, id));
  revalidatePath("/board");
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Risk
// ---------------------------------------------------------------------------

export async function createRiskItem(formData: FormData) {
  await db.insert(riskItems).values({
    title: str(formData, "title"),
    category: (str(formData, "category") || "operational") as (typeof riskItems.$inferInsert)["category"],
    likelihood: Number(str(formData, "likelihood") || "3"),
    impact: Number(str(formData, "impact") || "3"),
    owner: str(formData, "owner"),
    mitigation: optionalStr(formData, "mitigation"),
  });
  revalidatePath("/risk");
  revalidatePath("/");
}

export async function updateRiskStatus(formData: FormData) {
  const id = str(formData, "id");
  const status = str(formData, "status") as (typeof riskItems.$inferInsert)["status"];
  await db
    .update(riskItems)
    .set({ status, updatedAt: new Date() })
    .where(eq(riskItems.id, id));
  revalidatePath("/risk");
  revalidatePath("/");
}

export async function deleteRiskItem(formData: FormData) {
  const id = str(formData, "id");
  await db.delete(riskItems).where(eq(riskItems.id, id));
  revalidatePath("/risk");
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Strategy / Initiatives
// ---------------------------------------------------------------------------

export async function createInitiative(formData: FormData) {
  await db.insert(initiatives).values({
    title: str(formData, "title"),
    objective: optionalStr(formData, "objective"),
    owner: str(formData, "owner"),
    targetDate: optionalDate(formData, "targetDate"),
    progress: Number(str(formData, "progress") || "0"),
  });
  revalidatePath("/strategy");
  revalidatePath("/");
}

export async function updateInitiativeProgress(formData: FormData) {
  const id = str(formData, "id");
  const status = str(formData, "status") as (typeof initiatives.$inferInsert)["status"];
  const progress = Number(str(formData, "progress") || "0");
  await db
    .update(initiatives)
    .set({ status, progress, updatedAt: new Date() })
    .where(eq(initiatives.id, id));
  revalidatePath("/strategy");
  revalidatePath("/");
}

export async function deleteInitiative(formData: FormData) {
  const id = str(formData, "id");
  await db.delete(initiatives).where(eq(initiatives.id, id));
  revalidatePath("/strategy");
  revalidatePath("/");
}
