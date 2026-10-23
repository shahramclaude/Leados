import { db } from "@/db";
import { dependencies, circuitBreakerEvents } from "@/db/schema";
import { setDependencyStatus } from "@/lib/crisis/service";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const deps = await db.select().from(dependencies);
  const events = await db.select().from(circuitBreakerEvents).orderBy(desc(circuitBreakerEvents.occurredAt)).limit(50);
  return Response.json({ dependencies: deps, events });
}

export async function POST(req: Request) {
  const body = await req.json();
  try {
    const updated = await setDependencyStatus(body.key, body.status, body.note ?? "Manually toggled.");
    return Response.json({ dependency: updated });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
