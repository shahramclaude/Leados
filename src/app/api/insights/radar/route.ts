import { ensureSeedData, getRadarData } from "@/lib/sensing/db";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSeedData();
  const data = await getRadarData();
  return Response.json(data);
}
