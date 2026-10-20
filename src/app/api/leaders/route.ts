import { registerLeader } from "@/lib/app/useCases/leaders/registerLeader";
import { listLeaders } from "@/lib/app/useCases/leaders/listLeaders";

export const dynamic = "force-dynamic";

interface RegisterLeaderBody {
  organizationId?: string;
  name?: string;
  role?: string;
  email?: string;
  decisionLatencyDays?: number;
  teamEngagementScore?: number;
  feedbackFrequencyPerMonth?: number;
}

export async function GET() {
  const leaders = await listLeaders();
  return Response.json({ leaders });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RegisterLeaderBody;
    const result = await registerLeader({
      organizationId: body.organizationId ?? "",
      name: body.name ?? "",
      role: body.role ?? "",
      email: body.email ?? "",
      readinessInputs: {
        decisionLatencyDays: body.decisionLatencyDays ?? 0,
        teamEngagementScore: body.teamEngagementScore ?? 0,
        feedbackFrequencyPerMonth: body.feedbackFrequencyPerMonth ?? 0,
      },
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 400 });
  }
}
