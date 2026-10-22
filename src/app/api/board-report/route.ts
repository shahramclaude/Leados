import { buildBoardRiskSection } from "@/lib/boardpack";

export const dynamic = "force-dynamic";

export async function GET() {
  const section = await buildBoardRiskSection();
  return Response.json({ boardRiskSection: section });
}
