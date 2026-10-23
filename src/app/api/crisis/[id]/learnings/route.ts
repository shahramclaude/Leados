import { addLearning } from "@/lib/crisis/service";
import type { RoleKey } from "@/lib/crisis/stateMachine";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const learning = await addLearning({
    crisisId: id,
    category: body.category,
    statement: body.statement,
    actionItem: body.actionItem ?? "",
    ownerRoleKey: body.ownerRoleKey as RoleKey | undefined,
    targetSystem: body.targetSystem ?? "unassigned",
  });
  return Response.json({ learning });
}
