import { db } from "@/db";
import { leados_playbooks, leados_people } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { PLAYBOOK_STEPS } from "@/lib/intelligence";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select({
      id: leados_playbooks.id,
      triggeredBy: leados_playbooks.triggeredBy,
      personId: leados_playbooks.personId,
      findingKey: leados_playbooks.findingKey,
      status: leados_playbooks.status,
      steps: leados_playbooks.steps,
      completedSteps: leados_playbooks.completedSteps,
      notes: leados_playbooks.notes,
      createdAt: leados_playbooks.createdAt,
      completedAt: leados_playbooks.completedAt,
      personName: leados_people.name,
    })
    .from(leados_playbooks)
    .leftJoin(leados_people, eq(leados_playbooks.personId, leados_people.id))
    .orderBy(desc(leados_playbooks.createdAt));

  return Response.json(rows);
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body?.triggeredBy || !body?.findingKey) {
    return Response.json({ error: "triggeredBy and findingKey are required" }, { status: 400 });
  }

  const steps: string[] =
    Array.isArray(body.steps) && body.steps.length > 0
      ? body.steps
      : PLAYBOOK_STEPS[body.triggeredBy] ?? PLAYBOOK_STEPS.default;

  const [row] = await db
    .insert(leados_playbooks)
    .values({
      triggeredBy: body.triggeredBy,
      personId: body.personId ?? null,
      findingKey: body.findingKey,
      steps,
      completedSteps: [],
      status: "open",
    })
    .returning();

  return Response.json(row, { status: 201 });
}
