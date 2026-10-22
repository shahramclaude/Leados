import { listPrograms } from "@/lib/change/repository";

export const dynamic = "force-dynamic";

export async function GET() {
  const programs = await listPrograms();
  return Response.json({ ok: true, programs });
}
