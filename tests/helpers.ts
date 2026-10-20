// Shared test helpers — direct DB access + route handler invocation without
// spinning up a real HTTP server (Next.js route handlers are plain
// functions over the standard `Request`/`Response` objects, so we can call
// them in-process).

import { db } from "@/db";
import {
  attentionBudget,
  attentionDecisions,
  events,
  notificationFeedback,
  notificationPreferences,
  notifications,
  quietHours,
  users,
} from "@/db/schema";
import { eq } from "drizzle-orm";

export async function createTestUser(namePrefix: string) {
  const email = `${namePrefix}-${crypto.randomUUID()}@test.leados.app`;
  const [row] = await db.insert(users).values({ name: namePrefix, email, timezone: "UTC" }).returning();
  return row;
}

export async function clearUserAttentionState(userId: string) {
  await db.delete(attentionDecisions).where(eq(attentionDecisions.userId, userId));
  await db.delete(notificationFeedback).where(eq(notificationFeedback.userId, userId));
  await db.delete(notifications).where(eq(notifications.userId, userId));
  await db.delete(events).where(eq(events.userId, userId));
  await db.delete(attentionBudget).where(eq(attentionBudget.userId, userId));
  await db.delete(notificationPreferences).where(eq(notificationPreferences.userId, userId));
  await db.delete(quietHours).where(eq(quietHours.userId, userId));
}

export async function deleteTestUser(userId: string) {
  await clearUserAttentionState(userId);
  await db.delete(users).where(eq(users.id, userId));
}

/** Force a user out of (default) quiet hours for deterministic tests. */
export async function setAwakeAllDay(userId: string) {
  await db.insert(quietHours).values({ userId, startMinute: 0, endMinute: 0, timezone: "UTC" }).onConflictDoUpdate({
    target: quietHours.userId,
    set: { startMinute: 0, endMinute: 0 },
  });
}

export function makeRequest(url: string, init?: RequestInit & { userId?: string; lastEventId?: number }) {
  const headers = new Headers(init?.headers);
  if (init?.userId) headers.set("x-user-id", init.userId);
  if (init?.lastEventId !== undefined) headers.set("last-event-id", String(init.lastEventId));
  return new Request(url, { ...init, headers });
}

export interface SseReaderState {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  decoder: TextDecoder;
}

/** Creates a single long-lived reader for an SSE response body. Only one
 * reader may ever be attached to a given stream, so tests that need to read
 * from the same connection multiple times (e.g. before and after a
 * broadcast) must reuse the same state rather than calling
 * `response.body.getReader()` again. */
export function openSseReader(response: Response): SseReaderState {
  if (!response.body) throw new Error("response has no body");
  return { reader: response.body.getReader(), decoder: new TextDecoder() };
}

/** Reads newly-arrived bytes from an already-open SSE reader until either
 * `minBytes` have accumulated or `timeoutMs` elapses. Avoids ever issuing a
 * second concurrent `read()` call on the same reader (which throws) by
 * cancelling the reader itself once the deadline passes instead of racing
 * the read promise directly. */
export async function waitUntil(predicate: () => boolean, timeoutMs = 2000, intervalMs = 20): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  if (!predicate()) throw new Error(`waitUntil: condition not met within ${timeoutMs}ms`);
}

export async function readFromSse(state: SseReaderState, minBytes: number, timeoutMs = 2000): Promise<string> {
  return readUntil(state, (out) => out.length >= minBytes, timeoutMs);
}

/** Reads chunks from an open SSE reader, accumulating into a buffer, until
 * `predicate(buffer)` is true or `timeoutMs` elapses. Each individual
 * `controller.enqueue()` on the server can arrive as its own chunk, so
 * checking only byte-length (rather than content) after a single read can
 * return before the frame a test actually cares about has arrived — this
 * keeps reading across multiple chunks until the real condition is met. */
export async function readUntil(state: SseReaderState, predicate: (buffer: string) => boolean, timeoutMs = 2000): Promise<string> {
  let out = "";
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    state.reader.cancel().catch(() => {});
  }, timeoutMs);

  try {
    while (!predicate(out) && !timedOut) {
      const { value, done } = await state.reader.read();
      if (done) break;
      if (value) out += state.decoder.decode(value, { stream: true });
    }
  } catch {
    // reader was cancelled (timeout or external abort) — return what we have
  } finally {
    clearTimeout(timer);
  }

  return out;
}
