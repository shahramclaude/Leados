import { createHash } from "crypto";
import { db } from "@/db";
import { idempotencyKeys } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { ApiError } from "./errors";

export function hashRequest(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body ?? null)).digest("hex");
}

export type IdempotencyLookup =
  | { replayed: true; status: number; body: unknown }
  | { replayed: false };

/**
 * Looks up a prior response for (idempotencyKey, route). If the same key was used
 * with a *different* request body, throws IDEMPOTENCY_CONFLICT (422).
 */
export async function checkIdempotency(
  idempotencyKey: string,
  route: string,
  requestBody: unknown,
): Promise<IdempotencyLookup> {
  const requestHash = hashRequest(requestBody);
  const [existing] = await db
    .select()
    .from(idempotencyKeys)
    .where(and(eq(idempotencyKeys.idempotencyKey, idempotencyKey), eq(idempotencyKeys.route, route)))
    .limit(1);

  if (!existing) return { replayed: false };

  if (existing.requestHash !== requestHash) {
    throw new ApiError("IDEMPOTENCY_CONFLICT");
  }
  return { replayed: true, status: existing.responseStatus, body: existing.responseBody };
}

export async function storeIdempotentResponse(
  idempotencyKey: string,
  route: string,
  requestBody: unknown,
  responseStatus: number,
  responseBody: unknown,
) {
  await db
    .insert(idempotencyKeys)
    .values({
      idempotencyKey,
      route,
      requestHash: hashRequest(requestBody),
      responseStatus,
      responseBody: responseBody as object,
    })
    .onConflictDoNothing();
}
