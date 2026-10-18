import { getWeeklyBriefing } from "@/lib/engine";
import { cachedJson } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const briefing = await getWeeklyBriefing();
  return cachedJson(briefing);
}
