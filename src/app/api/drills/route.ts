import { db } from "@/db";
import { drills, crisisClasses } from "@/db/schema";
import { createDrill } from "@/lib/crisis/drillService";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select({ drill: drills, klass: crisisClasses })
    .from(drills)
    .innerJoin(crisisClasses, eq(drills.classId, crisisClasses.id))
    .orderBy(desc(drills.startedAt));
  return Response.json({ drills: rows });
}

export async function POST(req: Request) {
  const body = await req.json();
  try {
    const drill = await createDrill(body.name, body.classKey, body.injects ?? []);
    return Response.json({ drill });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
