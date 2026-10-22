import { latestObservations } from "@/lib/appetite";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await latestObservations();
  return Response.json({ metrics: rows });
}
