// Idempotency-key seam for the mutation layer.
//
// Every non-GET API route that backs an optimistic client mutation accepts
// an `Idempotency-Key` header. If the same key is replayed (client retry
// with backoff after a timeout, double-click, etc.) the *first* recorded
// response is returned verbatim instead of re-running the write — this is
// what makes "retry with backoff for idempotent writes" safe.
//
// This part persists keys in Postgres (`idempotency_keys`) rather than
// in-memory, so it survives a dev-server restart; it does NOT implement
// cross-request locking for two concurrent requests racing on the same new
// key (see docs/FRONTEND.md "Residual risk" in the self-review) and does not
// implement TTL eviction — both are explicitly left for Part 13's durable
// offline/queue infrastructure.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { idempotencyKeys } from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";

export async function findIdempotentResponse(key: string | null): Promise<NextResponse | null> {
  if (!key) return null;
  const [row] = await db.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, key)).limit(1);
  if (!row) return null;
  return NextResponse.json(row.response as object, {
    status: row.status,
    headers: { "x-idempotent-replay": "true" },
  });
}

export async function recordIdempotentResponse(
  key: string | null,
  route: string,
  status: number,
  response: unknown,
): Promise<void> {
  if (!key) return;
  await db
    .insert(idempotencyKeys)
    .values({ key, route, status, response: response as object })
    .onConflictDoNothing({ target: idempotencyKeys.key });
}

export function getIdempotencyKey(req: NextRequest): string | null {
  return req.headers.get("idempotency-key");
}
