import { ApiError } from "./errors";
import { checkIdempotency, storeIdempotentResponse } from "./idempotency";

/**
 * Wraps a write (POST) handler with the Idempotency-Key contract:
 * - missing key -> 400 IDEMPOTENCY_KEY_REQUIRED
 * - same key + same body -> replays the stored response (no side effects re-run)
 * - same key + different body -> 422 IDEMPOTENCY_CONFLICT
 */
export async function handleIdempotentCreate(
  req: Request,
  route: string,
  body: unknown,
  create: () => Promise<{ status: number; body: unknown }>,
): Promise<{ status: number; body: unknown; replayed: boolean }> {
  const idempotencyKey = req.headers.get("idempotency-key");
  if (!idempotencyKey) {
    throw new ApiError("IDEMPOTENCY_KEY_REQUIRED");
  }
  const lookup = await checkIdempotency(idempotencyKey, route, body);
  if (lookup.replayed) {
    return { status: lookup.status, body: lookup.body, replayed: true };
  }
  const result = await create();
  await storeIdempotentResponse(idempotencyKey, route, body, result.status, result.body);
  return { ...result, replayed: false };
}
