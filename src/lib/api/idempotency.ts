import { createHash } from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { idempotencyKeys } from "@/db/schema";
import { ApiError } from "./errors";

export interface IdempotencyLookup {
  key: string;
  bodyHash: string;
}

/**
 * Resolves the `Idempotency-Key` header for a write request. If the same
 * (org, route, method, key) was seen before:
 *  - with the same request body -> returns the previously stored response so
 *    retries of a timed-out write are safe.
 *  - with a different request body -> raises IDEMPOTENCY_KEY_CONFLICT, since
 *    reusing a key for a different payload is a client bug.
 * If no key is supplied, writes are simply not deduplicated (allowed, but
 * discouraged for mutating endpoints — documented in docs/API.md).
 */
export async function withIdempotency<T>(
  req: Request,
  orgId: string,
  tokenId: string,
  route: string,
  requestBody: unknown,
  handler: () => Promise<{ status: number; body: T }>,
): Promise<{ status: number; body: T; replayed: boolean }> {
  const key = req.headers.get("idempotency-key");
  const method = req.method.toUpperCase();
  const bodyHash = createHash("sha256").update(JSON.stringify(requestBody ?? null)).digest("hex");

  if (!key) {
    const result = await handler();
    return { ...result, replayed: false };
  }

  const [existing] = await db
    .select()
    .from(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.orgId, orgId),
        eq(idempotencyKeys.route, route),
        eq(idempotencyKeys.method, method),
        eq(idempotencyKeys.key, key),
      ),
    )
    .limit(1);

  if (existing) {
    if (existing.requestHash !== bodyHash) {
      throw new ApiError(
        "IDEMPOTENCY_KEY_CONFLICT",
        "This Idempotency-Key was already used with a different request body.",
        { key },
      );
    }
    return { status: existing.status ?? 200, body: existing.responseBody as T, replayed: true };
  }

  const result = await handler();

  await db
    .insert(idempotencyKeys)
    .values({
      orgId,
      tokenId,
      key,
      route,
      method,
      requestHash: bodyHash,
      status: result.status,
      responseBody: result.body as object,
    })
    .onConflictDoNothing();

  return { ...result, replayed: false };
}
