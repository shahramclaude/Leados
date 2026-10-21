import { listWargameScenarios } from "@/lib/wargameEngine";

export const dynamic = "force-dynamic";

export async function GET() {
  const branches = await listWargameScenarios();
  return Response.json({ branches });
}
