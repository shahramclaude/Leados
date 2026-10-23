import { db } from "@/db";
import { drills, drillInjects, crisisClasses } from "@/db/schema";
import { eq, asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [drill] = await db.select().from(drills).where(eq(drills.id, id));
  if (!drill) return Response.json({ error: "Not found" }, { status: 404 });
  const [klass] = await db.select().from(crisisClasses).where(eq(crisisClasses.id, drill.classId));
  const injects = await db.select().from(drillInjects).where(eq(drillInjects.drillId, id)).orderBy(asc(drillInjects.sequence));
  return Response.json({ drill, klass, injects });
}
