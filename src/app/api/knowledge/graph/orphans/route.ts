import { findOrphans } from "@/lib/knowledgeGraph";

export const dynamic = "force-dynamic";

export async function GET() {
  const orphans = await findOrphans();
  return Response.json({ ok: true, count: orphans.length, orphans });
}
