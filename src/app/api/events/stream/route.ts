import { db } from "@/db";
import { leados_events } from "@/db/schema";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function getEventCount() {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leados_events);
  return count;
}

export async function GET() {
  const encoder = new TextEncoder();
  let poll: ReturnType<typeof setInterval> | undefined;
  let ping: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (d: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(d)}\n\n`));
        } catch {
          // controller already closed
        }
      };

      emit({ type: "connected", ts: new Date().toISOString() });

      let lastCount = await getEventCount();

      poll = setInterval(async () => {
        try {
          const count = await getEventCount();
          if (count !== lastCount) {
            lastCount = count;
            emit({ type: "refresh", count });
          }
        } catch {
          // ignore transient db errors between polls
        }
      }, 5000);

      ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          // controller already closed
        }
      }, 15000);
    },
    cancel() {
      if (poll) clearInterval(poll);
      if (ping) clearInterval(ping);
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
