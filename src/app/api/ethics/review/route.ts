import { runEthicalReview } from "@/lib/ethics/lensEngine";
import { actorFromHeaders } from "@/lib/roles";
import { db } from "@/db";
import { ethicalReviews } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(ethicalReviews).orderBy(desc(ethicalReviews.createdAt));
  return Response.json({ reviews: rows });
}

export async function POST(req: Request) {
  const actor = actorFromHeaders(req.headers);
  const body = await req.json();
  if (!body.decisionId) return Response.json({ error: '"decisionId" is required' }, { status: 400 });

  try {
    const result = await runEthicalReview(Number(body.decisionId), actor.personId ?? 1);
    return Response.json({ review: result }, { status: 201 });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 404 });
  }
}
