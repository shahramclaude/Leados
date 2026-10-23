import { delegations } from "@/db/schema";
import { updateRow, badRequest, ok } from "@/lib/leados/crud";

// Revocation is instant: the revokedAt timestamp is set synchronously in the
// same request/response cycle, so any subsequent tool-call check (which reads
// this same row) observes the revocation well within the 60s SLA.
export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await context.params;
  const id = Number(idParam);
  if (!id) return badRequest("invalid id");
  const row = await updateRow(delegations, delegations.id, id, { revokedAt: new Date() });
  return ok({ ...row, revokedAtMs: Date.now() });
}
