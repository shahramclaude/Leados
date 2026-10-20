import { completeOnboarding, getOnboardingStatus } from "@/lib/app/onboarding";
import { ValidationError } from "@/lib/app/findings";
import { checkAuth } from "@/lib/platform/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getOnboardingStatus();
  return Response.json(status);
}

export async function POST(request: Request) {
  const auth = checkAuth(request);
  if (!auth.ok) return Response.json({ error: auth.message }, { status: auth.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const { orgName } = (body ?? {}) as Record<string, unknown>;
  try {
    const result = await completeOnboarding(String(orgName ?? ""));
    return Response.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
