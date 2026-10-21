import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { desc, gt } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Server-Sent Events stream of audit-log activity. Polls the DB on a fixed
// interval (demo-scale; a production build would LISTEN/NOTIFY) and pushes
// only new rows. The client batches arriving events with requestAnimationFrame
// (see src/hooks/useRealtimeIntelligence.ts) so N events arriving in one tick
// still produce at most one render.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();
  let closed = false;
  let interval: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      let cursor = new Date();

      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      send("hello", { serverTime: cursor.toISOString() });

      interval = setInterval(async () => {
        try {
          const rows = await db
            .select()
            .from(auditLog)
            .where(gt(auditLog.createdAt, cursor))
            .orderBy(desc(auditLog.createdAt))
            .limit(20);
          if (rows.length > 0) {
            cursor = rows[0].createdAt;
            for (const row of rows.reverse()) send("audit", row);
          } else {
            send("ping", { serverTime: new Date().toISOString() });
          }
        } catch {
          send("ping", { serverTime: new Date().toISOString() });
        }
      }, 1500);
    },
    cancel() {
      closed = true;
      if (interval) clearInterval(interval);
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
