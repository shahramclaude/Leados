// GET /api/audit — read-only, immutable audit log. No update/delete route exists.
import { listAuditLog } from "@/lib/kernel/audit";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") ?? 100);
  const entries = await listAuditLog(limit);
  return Response.json({ ok: true, entries });
}
