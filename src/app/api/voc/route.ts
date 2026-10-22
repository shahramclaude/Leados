import { db } from "@/db";
import { strategyItems, vocFeedback } from "@/db/schema";
import { rankVocThemes, suggestStrategyLink } from "@/lib/voc";

export const dynamic = "force-dynamic";

// Seam 5 proving endpoint: VoC links to strategy.
export async function GET() {
  const feedback = await db.select().from(vocFeedback);
  const themes = rankVocThemes(
    feedback.map((f) => ({ theme: f.theme, sentiment: f.sentiment as "positive" | "neutral" | "negative" })),
  );
  return Response.json({ feedback, themes });
}

const VALID_SENTIMENTS = ["positive", "neutral", "negative"];

export async function POST(request: Request) {
  const body = await request.json();
  if (!body?.source || !body?.sentiment || !body?.theme || !body?.text) {
    return Response.json({ error: "source, sentiment, theme, text are required" }, { status: 400 });
  }
  if (!VALID_SENTIMENTS.includes(body.sentiment)) {
    return Response.json({ error: `sentiment must be one of ${VALID_SENTIMENTS.join(", ")}` }, { status: 400 });
  }

  const strategies = await db.select().from(strategyItems);
  const { matched } = suggestStrategyLink(
    body.theme,
    strategies.map((s) => s.title),
  );
  const linkedStrategyId = matched ? strategies.find((s) => s.title === matched)?.id ?? null : null;

  const [row] = await db
    .insert(vocFeedback)
    .values({
      source: body.source,
      sentiment: body.sentiment,
      theme: body.theme,
      text: body.text,
      linkedStrategyId,
    })
    .returning();

  return Response.json({ feedback: row, linkedStrategyTitle: matched }, { status: 201 });
}
