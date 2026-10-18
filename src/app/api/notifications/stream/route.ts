import { db } from "@/db";
import { notifications } from "@/db/schema";
import { desc, gt } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Server-Sent Events stream: polls for notifications newer than the last
// seen id every 4 seconds and pushes them to the client, plus a heartbeat
// comment every 15 seconds to keep intermediaries from closing the socket.
export async function GET(request: Request): Promise<Response> {
  const encoder = new TextEncoder();
  let closed = false;
  let lastId = 0;

  const latest = await db.select().from(notifications).orderBy(desc(notifications.id)).limit(1);
  if (latest.length > 0) lastId = latest[0].id;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      send("connected", { lastId });

      const pollInterval = setInterval(async () => {
        if (closed) return;
        try {
          const rows = await db
            .select()
            .from(notifications)
            .where(gt(notifications.id, lastId))
            .orderBy(notifications.id);
          if (rows.length > 0) {
            lastId = rows[rows.length - 1].id;
            for (const row of rows) send("notification", row);
          }
        } catch {
          // transient DB error — keep connection alive, try again next tick
        }
      }, 4000);

      const heartbeat = setInterval(() => {
        if (closed) return;
        controller.enqueue(encoder.encode(`: heartbeat\n\n`));
      }, 15000);

      request.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(pollInterval);
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
