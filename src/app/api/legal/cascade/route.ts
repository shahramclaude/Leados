import { db } from "@/db";
import { cascadeImpacts, cascadeTriggers } from "@/db/schema";
import { runChangeOfControlCascade } from "@/lib/legal/cascade";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const triggers = await db.select().from(cascadeTriggers);
  const withImpacts = await Promise.all(
    triggers.map(async (t) => ({
      trigger: t,
      impacts: await db.select().from(cascadeImpacts).where(eq(cascadeImpacts.cascadeTriggerId, t.id)),
    })),
  );
  return Response.json({ triggers: withImpacts });
}

// Creates a new cascade trigger (e.g. a planned M&A event surfaced via Part 54's seam) and immediately
// evaluates it against all CONFIRMED change-of-control clauses.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, triggerType, description, externalEventRef } = body as {
    name?: string;
    triggerType?: string;
    description?: string;
    externalEventRef?: string;
  };
  if (!name || !triggerType) {
    return Response.json({ error: "name and triggerType are required" }, { status: 400 });
  }

  const [trigger] = await db
    .insert(cascadeTriggers)
    .values({
      name,
      triggerType,
      description,
      sourceSeam: "part54_ma_planning",
      externalEventRef,
    })
    .returning();

  const impacts = await runChangeOfControlCascade(trigger.id);
  return Response.json({ trigger, impacts });
}
