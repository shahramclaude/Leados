import { listLeaderStateEntries, createLeaderStateEntry } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userIdParam = searchParams.get("userId");
  const userId = userIdParam ? Number(userIdParam) : undefined;
  const entries = await listLeaderStateEntries(userId);
  return Response.json({ entries });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || !Number.isInteger(body.userId)) {
    return Response.json({ error: "userId is required" }, { status: 400 });
  }
  const entry = await createLeaderStateEntry({
    userId: body.userId,
    decisionLoadScore: body.decisionLoadScore ?? 0,
    stressIndex: body.stressIndex ?? 0,
    focusHours: String(body.focusHours ?? 0),
    notes: body.notes ?? "",
  });
  return Response.json({ entry }, { status: 201 });
}
