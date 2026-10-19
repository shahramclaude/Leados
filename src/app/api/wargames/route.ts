import { db } from "@/db";
import { wargames } from "@/db/schema";
import { desc } from "drizzle-orm";
import { jsonError, isRecord, parseNumber, parseString, readJsonBody } from "@/lib/api";
import { runWargame, generateCompetitorProfile, type CompetitorProfile, type KnownCompetitorData } from "@/lib/wargameEngine";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(wargames).orderBy(desc(wargames.createdAt));
  return Response.json(rows);
}

// body: { action: "generateProfile", name, knownData } -> returns a profile, doesn't persist
// body: { title, description?, ourMoveIds, competitorProfiles, rounds?, seed? } -> runs + persists a wargame
export async function POST(request: Request) {
  const body = await readJsonBody(request);

  if (body.action === "generateProfile") {
    const name = parseString(body.name, "Competitor");
    const knownData = isRecord(body.knownData) ? (body.knownData as KnownCompetitorData) : {};
    return Response.json(generateCompetitorProfile(name, knownData));
  }

  try {
    const title = parseString(body.title, "Untitled wargame");
    const ourMoveIds: string[] = Array.isArray(body.ourMoveIds) && body.ourMoveIds.length ? body.ourMoveIds.map(String) : ["feature_sprint", "key_partnership"];
    const competitorProfiles: CompetitorProfile[] = Array.isArray(body.competitorProfiles) && body.competitorProfiles.length
      ? body.competitorProfiles
      : [generateCompetitorProfile("Rival Co", { recentFunding: true, priceAggressive: true })];
    const rounds = parseNumber(body.rounds, 4);
    const seed = parseNumber(body.seed, 2025);

    const outcome = runWargame(ourMoveIds, competitorProfiles, rounds, seed);

    const [created] = await db
      .insert(wargames)
      .values({
        title,
        description: typeof body.description === "string" ? body.description : null,
        context: isRecord(body.context) ? body.context : {},
        ourStrategy: ourMoveIds.join(" -> "),
        competitorProfiles,
        rounds: outcome.rounds,
        outcome,
        version: 1,
      })
      .returning();
    return Response.json(created, { status: 201 });
  } catch (err) {
    return jsonError((err as Error).message, 500);
  }
}
