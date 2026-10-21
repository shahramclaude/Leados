import { z } from "zod";
import { deadLetterRows, requeueDeadLetter } from "@/lib/ops/workQueue";
import { withApiHandler } from "@/lib/obs/apiHandler";
import { requireAdmin } from "@/lib/ops/adminAuth";
import { appendAudit } from "@/lib/ops/auditChain";

export const dynamic = "force-dynamic";

export const GET = withApiHandler({ routeFamily: "scheduler_dead_letter" }, async () => {
  const rows = await deadLetterRows();
  return Response.json({ deadLetters: rows, count: rows.length });
});

const BodySchema = z.object({ id: z.string().uuid() });

export const POST = withApiHandler({ routeFamily: "scheduler_dead_letter" }, async (req) => {
  requireAdmin(req);
  const { id } = BodySchema.parse(await req.json());
  await requeueDeadLetter(id);
  await appendAudit("admin", "dead_letter.requeue", `work_queue:${id}`, {});
  return Response.json({ requeued: id });
});
