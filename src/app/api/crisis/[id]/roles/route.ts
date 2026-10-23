import { db } from "@/db";
import { roleAssignments, personas } from "@/db/schema";
import { getAuthorityMatrix } from "@/lib/crisis/service";
import { checkAuthority } from "@/lib/crisis/authority";
import type { RoleKey } from "@/lib/crisis/stateMachine";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await db.select().from(roleAssignments).where(eq(roleAssignments.crisisId, id));
  const people = await db.select().from(personas);
  return Response.json({ assignments: rows, personas: people });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const matrix = await getAuthorityMatrix();
  const authCheck = checkAuthority({
    action: "assign_role",
    actingRoleKeys: (body.actingRoleKeys ?? []) as RoleKey[],
    matrix,
  });
  if (!authCheck.allowed) {
    return Response.json({ error: authCheck.reason }, { status: 403 });
  }

  const [assignment] = await db
    .insert(roleAssignments)
    .values({ crisisId: id, roleKey: body.roleKey, personaId: body.personaId })
    .returning();

  return Response.json({ assignment });
}
