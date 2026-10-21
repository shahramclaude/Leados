import { criticalPathToday } from "@/lib/delivery";
import { projectProgress } from "@/lib/executionEngine";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = Number(searchParams.get("projectId"));
  if (!projectId) return Response.json({ error: "projectId query param required" }, { status: 400 });
  const [cpm, progress] = await Promise.all([criticalPathToday(projectId), projectProgress(projectId)]);
  return Response.json({ cpm, progress });
}
