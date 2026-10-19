import { subscribe } from "@/lib/server/engine";
import type { RealtimeServerEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

function sseLine(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET() {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(sseLine("connected", { ok: true, at: new Date().toISOString() })));

      const onEvent = (event: RealtimeServerEvent) => {
        try {
          controller.enqueue(encoder.encode(sseLine(event.type, event)));
        } catch {
          // controller already closed
        }
      };
      unsubscribe = subscribe(onEvent);

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(sseLine("heartbeat", { at: new Date().toISOString() })));
        } catch {
          // controller already closed
        }
      }, 15000);
    },
    cancel() {
      if (unsubscribe) unsubscribe();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
