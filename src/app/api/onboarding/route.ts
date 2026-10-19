import { appendEvents, countEvents } from "@/lib/eventStore";
import { onboardingSeed } from "@/lib/onboardingSeed";
import type { OrgProfile } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const count = await countEvents();
  return Response.json({ needsOnboarding: count === 0 });
}

export async function POST(req: Request) {
  try {
    const profile = (await req.json()) as OrgProfile;
    const events = onboardingSeed(profile);
    const created = await appendEvents(events);
    return Response.json({ created: created.length });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
