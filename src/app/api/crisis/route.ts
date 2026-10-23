import { db } from "@/db";
import { crises, crisisClasses } from "@/db/schema";
import { declareCrisis, CrisisServiceError } from "@/lib/crisis/service";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select({ crisis: crises, klass: crisisClasses })
    .from(crises)
    .innerJoin(crisisClasses, eq(crises.classId, crisisClasses.id))
    .orderBy(desc(crises.createdAt));
  return Response.json({ crises: rows });
}

export async function POST(req: Request) {
  const body = await req.json();
  try {
    const crisis = await declareCrisis({
      classKey: body.classKey,
      title: body.title,
      severity: Number(body.severity ?? 3),
      declarerPersonaIds: body.declarerPersonaIds ?? [],
    });
    return Response.json({ crisis });
  } catch (err) {
    if (err instanceof CrisisServiceError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
