import { listFlags, restoreFlag } from "@/lib/featureFlags";

export const dynamic = "force-dynamic";

export async function GET() {
  const flags = await listFlags();
  return Response.json({ flags });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!body.key) {
    return Response.json({ error: "key is required" }, { status: 400 });
  }
  const flag = await restoreFlag(body.key, body.actor ?? "ops-user");
  return Response.json({ flag });
}
