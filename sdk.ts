// LEADOS Platform SDK (generated client).
//
// This file is thin by design: all request/response typing comes from
// `src/generated/api-types.ts`, which is generated straight from
// `api-spec.yaml` by `openapi-typescript` (see scripts/generate-openapi.ts
// and the "Regenerating the SDK" section of docs/API.md). Do not hand-edit
// the type shapes — only this wrapper (auth header injection, pagination
// helper, webhook signature verification, SSE resume client) is handwritten.
//
// Regenerate with:
//   npx tsx scripts/generate-openapi.ts
//   npx openapi-typescript api-spec.yaml -o src/generated/api-types.ts
import createClient from "openapi-fetch";
import type { paths } from "./src/generated/api-types";
import { verifyWebhookSignature } from "./src/lib/platform/webhookVerify";

export { verifyWebhookSignature };

export interface LeadosClientOptions {
  baseUrl: string;
  token: string;
  fetch?: typeof fetch;
}

export function createLeadosClient(opts: LeadosClientOptions) {
  const client = createClient<paths>({
    baseUrl: opts.baseUrl,
    fetch: opts.fetch,
    headers: { Authorization: `Bearer ${opts.token}` },
  });

  return client;
}

export type LeadosClient = ReturnType<typeof createLeadosClient>;

/** Iterate every page of a cursor-paginated list endpoint automatically. */
export async function* paginateAll<Item>(
  fetchPage: (cursor: string | null) => Promise<{ items: Item[]; page: { nextCursor: string | null } }>,
): AsyncGenerator<Item> {
  let cursor: string | null = null;
  do {
    const result: { items: Item[]; page: { nextCursor: string | null } } = await fetchPage(cursor);
    for (const item of result.items) yield item;
    cursor = result.page.nextCursor;
  } while (cursor);
}

export interface PlatformEventMessage {
  id: string;
  type: string;
  orgId: string;
  createdAt: string;
  data: unknown;
}

/**
 * Subscribe to the realtime SSE API with automatic resume via Last-Event-ID.
 * Works in Node (18+) and browsers. Pass `lastEventId` to resume a stream
 * you were previously consuming (e.g. after a reconnect).
 */
export async function streamEvents(
  opts: {
    baseUrl: string;
    token: string;
    lastEventId?: string;
    signal?: AbortSignal;
  },
  onEvent: (event: PlatformEventMessage) => void,
): Promise<void> {
  const url = new URL("/api/v1/events/stream", opts.baseUrl);
  if (opts.lastEventId) url.searchParams.set("after", opts.lastEventId);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${opts.token}`, Accept: "text/event-stream" },
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`Failed to open event stream: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const dataLine = chunk.split("\n").find((line) => line.startsWith("data: "));
      if (!dataLine) continue;
      try {
        onEvent(JSON.parse(dataLine.slice(6)) as PlatformEventMessage);
      } catch {
        // ignore malformed frames (e.g. heartbeat comments)
      }
    }
  }
}
