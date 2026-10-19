import { patchTask } from "@/lib/server/engine";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await req.json()) as { kind: "decision" | "hypothesis" | "playbook"; status: string };
  await patchTask(body.kind, id, body.status);
  return Response.json({ ok: true });
}
