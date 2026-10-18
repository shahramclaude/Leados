import { db } from "@/db";
import { leados_events } from "@/db/schema";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (data: unknown) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // controller already closed
        }
      };

      send({ type: "connected" });

      let lastCount = 0;
      let closed = false;

      const interval = setInterval(async () => {
        if (closed) return;
        try {
          const [{ count }] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(leados_events);
          if (count !== lastCount) {
            lastCount = count;
            send({ type: "new_events", count });
          }
        } catch {
          // ignore transient DB errors
        }
      }, 5000);

      const ping = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`: ping\n\n`));
        } catch {
          // controller already closed
        }
      }, 15000);

      const cleanup = () => {
        closed = true;
        clearInterval(interval);
        clearInterval(ping);
      };

      // @ts-expect-error - non-standard but supported by the Next.js runtime
      controller._cleanup = cleanup;
    },
    cancel() {
      // no-op: intervals are cleared via closed flag on next tick
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
