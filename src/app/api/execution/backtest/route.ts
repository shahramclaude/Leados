import { backtestProject } from "@/lib/delivery";
import { allProjectStatuses } from "@/lib/executionEngine";

export const dynamic = "force-dynamic";

export async function GET() {
  const statuses = await allProjectStatuses();
  const results = await Promise.all(statuses.map(async (s) => ({ project: s.project.title, result: await backtestProject(s.project.id) })));
  return Response.json({ results });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const projectId = Number(body.projectId);
  if (!projectId) return Response.json({ error: "projectId required in body" }, { status: 400 });
  const result = await backtestProject(projectId);
  return Response.json({ result });
}
