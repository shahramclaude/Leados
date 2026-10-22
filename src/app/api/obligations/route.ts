import { db } from "@/db";
import { obligations, obligationInstances } from "@/db/schema";
import { eq, asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const obRows = await db.select().from(obligations);
  const out = [];
  for (const ob of obRows) {
    const instances = await db
      .select()
      .from(obligationInstances)
      .where(eq(obligationInstances.obligationId, ob.id))
      .orderBy(asc(obligationInstances.dueAt));
    out.push({ obligation: ob, instances });
  }
  return Response.json({ obligations: out });
}
