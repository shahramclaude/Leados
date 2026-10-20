// Idempotency-Key support for unsafe writes (POST/PATCH). The same key +
// org replaying the same request body returns the original stored response
// instead of performing the write again; replaying with a different body is
// rejected as a conflict so clients can't silently corrupt state.
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { idempotencyRecords } from "@/db/schema";
import { ApiError } from "./envelope";

export function hashRequestBody(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body ?? null)).digest("hex");
}

export async function withIdempotency<T>(
  opts: { orgId: string; route: string; key: string | null; requestBody: unknown },
  handler: () => Promise<{ status: number; body: T }>,
): Promise<{ status: number; body: T; replayed: boolean }> {
  if (!opts.key) {
    const result = await handler();
    return { ...result, replayed: false };
  }

  const requestHash = hashRequestBody(opts.requestBody);
  const [existing] = await db
    .select()
    .from(idempotencyRecords)
    .where(and(eq(idempotencyRecords.orgId, opts.orgId), eq(idempotencyRecords.key, opts.key)))
    .limit(1);

  if (existing) {
    if (existing.requestHash !== requestHash || existing.route !== opts.route) {
      throw new ApiError(
        "IDEMPOTENCY_MISMATCH",
        "This Idempotency-Key was already used with a different request body/route",
      );
    }
    return { status: existing.statusCode, body: existing.responseBody as T, replayed: true };
  }

  const result = await handler();

  await db
    .insert(idempotencyRecords)
    .values({
      key: opts.key,
      orgId: opts.orgId,
      route: opts.route,
      requestHash,
      statusCode: result.status,
      responseBody: result.body as object,
    })
    .onConflictDoNothing();

  return { ...result, replayed: false };
}
