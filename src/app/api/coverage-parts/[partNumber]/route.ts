import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { coverageParts, verificationLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getLogsForPart, getPartByNumber } from "@/lib/coverage";

type RouteContext = { params: Promise<{ partNumber: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { partNumber } = await context.params;
  const num = Number(partNumber);
  if (!Number.isInteger(num)) {
    return NextResponse.json({ error: "Invalid part number" }, { status: 400 });
  }

  const part = await getPartByNumber(num);
  if (!part) {
    return NextResponse.json({ error: "Part not found" }, { status: 404 });
  }

  const logs = await getLogsForPart(part.id);
  return NextResponse.json({ part, logs });
}

const VALID_STATUSES = ["unverified", "present", "partial", "missing", "legacy_quarantined"] as const;

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { partNumber } = await context.params;
  const num = Number(partNumber);
  if (!Number.isInteger(num)) {
    return NextResponse.json({ error: "Invalid part number" }, { status: 400 });
  }

  const part = await getPartByNumber(num);
  if (!part) {
    return NextResponse.json({ error: "Part not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const {
    currentStatus,
    commandOutput,
    verifiedBy,
    ownerPart,
    note,
    resolved,
  }: {
    currentStatus?: string;
    commandOutput?: string;
    verifiedBy?: string;
    ownerPart?: string | null;
    note?: string | null;
    resolved?: boolean;
  } = body;

  if (currentStatus && !VALID_STATUSES.includes(currentStatus as (typeof VALID_STATUSES)[number])) {
    return NextResponse.json({ error: "Invalid currentStatus" }, { status: 400 });
  }

  const updates: Partial<typeof coverageParts.$inferInsert> = { updatedAt: new Date() };
  if (currentStatus) updates.currentStatus = currentStatus as (typeof VALID_STATUSES)[number];
  if (ownerPart !== undefined) updates.ownerPart = ownerPart;
  if (note !== undefined) updates.note = note;
  if (resolved !== undefined) updates.resolved = resolved;

  const [updated] = await db
    .update(coverageParts)
    .set(updates)
    .where(eq(coverageParts.id, part.id))
    .returning();

  if (currentStatus && currentStatus !== part.currentStatus) {
    await db.insert(verificationLogs).values({
      partId: part.id,
      previousStatus: part.currentStatus,
      newStatus: currentStatus as (typeof VALID_STATUSES)[number],
      commandOutput: commandOutput ?? null,
      verifiedBy: verifiedBy?.trim() || "operator",
    });
  }

  const logs = await getLogsForPart(part.id);
  return NextResponse.json({ part: updated, logs });
}
