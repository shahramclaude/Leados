import { NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { leadosWargames } from "@/db/schema";
import { generateCompetitorProfile, runWargame, type CompetitorProfile, type KnownCompetitorData } from "@/lib/wargameEngine";

export const dynamic = "force-dynamic";

// GET /api/wargames          -> list all war games
// GET /api/wargames?id=xxx   -> single war game detail
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");

  if (id) {
    const [row] = await db.select().from(leadosWargames).where(eq(leadosWargames.id, id)).limit(1);
    if (!row) return Response.json({ error: "War game not found" }, { status: 404 });
    return Response.json({ wargame: row });
  }

  const rows = await db.select().from(leadosWargames).orderBy(desc(leadosWargames.createdAt));
  return Response.json({ wargames: rows });
}

// POST /api/wargames
// body: { action: "create", title, description?, context, ourStrategy, competitorProfiles }
// body: { action: "run", id?, title, description?, context, ourStrategy, competitorProfiles, rounds? }
// body: { action: "generateProfile", name, knownData }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = body.action ?? "create";

  if (action === "generateProfile") {
    const { name, knownData } = body as { name: string; knownData?: KnownCompetitorData };
    if (!name) return Response.json({ error: "name is required" }, { status: 400 });
    const profile = generateCompetitorProfile(name, knownData ?? {});
    return Response.json({ profile });
  }

  if (action === "create") {
    const { title, description = "", context = "", ourStrategy = "", competitorProfiles = [] } = body as {
      title: string;
      description?: string;
      context?: string;
      ourStrategy?: string;
      competitorProfiles?: CompetitorProfile[];
    };
    if (!title) return Response.json({ error: "title is required" }, { status: 400 });

    const [row] = await db
      .insert(leadosWargames)
      .values({
        title,
        description,
        context,
        ourMoves: { strategyText: ourStrategy, moves: [] },
        competitorMoves: competitorProfiles,
        outcomes: {},
        lessons: "",
      })
      .returning();

    return Response.json({ wargame: row }, { status: 201 });
  }

  if (action === "run") {
    const {
      id,
      title,
      description = "",
      context,
      ourStrategy,
      competitorProfiles = [],
      rounds = 5,
    } = body as {
      id?: string;
      title: string;
      description?: string;
      context: string;
      ourStrategy: string;
      competitorProfiles: CompetitorProfile[];
      rounds?: number;
    };

    if (!title || !context || !ourStrategy || !Array.isArray(competitorProfiles) || competitorProfiles.length === 0) {
      return Response.json(
        { error: "title, context, ourStrategy, and at least one competitor profile are required" },
        { status: 400 },
      );
    }

    const result = runWargame(context, ourStrategy, competitorProfiles, rounds);

    const lessons = [
      "Key insights:",
      ...result.keyInsights.map((s) => `- ${s}`),
      "",
      "Blindspots:",
      ...(result.blindspots.length > 0
        ? result.blindspots.map((b) => `- [Round ${b.round}] ${b.competitor}: ${b.description}`)
        : ["- None identified in this run."]),
    ].join("\n");

    const values = {
      title,
      description,
      context,
      ourMoves: { strategyText: ourStrategy, moves: result.rounds.map((r) => r.ourMove) },
      competitorMoves: competitorProfiles,
      outcomes: result,
      lessons,
      ranAt: new Date(),
    };

    if (id) {
      const [row] = await db.update(leadosWargames).set(values).where(eq(leadosWargames.id, id)).returning();
      if (!row) return Response.json({ error: "War game not found" }, { status: 404 });
      return Response.json({ wargame: row, result });
    }

    const [row] = await db.insert(leadosWargames).values(values).returning();
    return Response.json({ wargame: row, result }, { status: 201 });
  }

  return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
}

// DELETE /api/wargames?id=xxx
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });
  await db.delete(leadosWargames).where(eq(leadosWargames.id, id));
  return Response.json({ ok: true });
}
