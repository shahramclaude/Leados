// =============================================================================
// LEADOS — Part 11: streaming helper (no spinner theater)
// =============================================================================
// Every language surface streams real phase events (retrieve → ground →
// compose → verify → done) as Server-Sent Events, followed by one `result`
// event with the final payload. The client can render actual progress
// ("Checking 4 metrics and 2 events...") instead of an indeterminate spinner,
// and can hydrate citation chips as soon as the result event arrives.
// =============================================================================

import type { PhaseEvent } from "./types";

export function createPhaseStream<T>(run: (onPhase: (e: PhaseEvent) => void) => Promise<T>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      try {
        const result = await run((e) => send("phase", e));
        send("result", result);
      } catch (err) {
        send("error", { message: (err as Error).message });
      } finally {
        controller.close();
      }
    },
  });
}

export function sseResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
