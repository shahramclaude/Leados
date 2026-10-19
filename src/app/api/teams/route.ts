import { resolveViewer } from "@/lib/platform/auth";
import { teamsRepository } from "@/lib/platform/db/peopleRepository";

export const dynamic = "force-dynamic";

export async function GET() {
  const teams = await teamsRepository.list();
  return Response.json({ teams });
}

export async function POST(request: Request) {
  const viewer = resolveViewer(request);
  if (viewer.role !== "hr" && viewer.role !== "exec") {
    return Response.json({ error: "Only HR or exec may create a team." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.name || !body?.department) {
    return Response.json({ error: "name and department are required." }, { status: 400 });
  }

  const team = await teamsRepository.create({ name: body.name, department: body.department, leadId: body.leadId ?? null });
  return Response.json({ team }, { status: 201 });
}
