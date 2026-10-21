// Server-sent events stream. Registers with the stream hub so the
// `stream_connections_active` metric and `stream_hub` health check reflect
// reality, and so graceful shutdown can close it during a drain.
import { registerStreamConnection } from "@/lib/ops/streamHub";
import { registerStreamCloser } from "@/lib/ops/shutdown";
import { logger } from "@/lib/obs/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  const unregister = registerStreamConnection();
  const encoder = new TextEncoder();
  let unregisterShutdown: () => void = () => undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* controller already closed */
        }
      };
      send({ type: "connected", at: new Date().toISOString() });
      const heartbeat = setInterval(() => send({ type: "heartbeat", at: new Date().toISOString() }), 15000);

      const close = () => {
        clearInterval(heartbeat);
        unregister();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      unregisterShutdown = registerStreamCloser(close);
    },
    cancel() {
      logger.info("stream.client_disconnected", {});
      unregister();
      unregisterShutdown();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
