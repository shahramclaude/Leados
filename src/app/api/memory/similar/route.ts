import { NextRequest } from "next/server";
import { findSimilarPast } from "@/lib/familiarity";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.text || typeof body.text !== "string") {
      return Response.json({ ok: false, error: "text is required" }, { status: 400 });
    }
    const matches = await findSimilarPast(body.text, body.limit ?? 5);
    return Response.json({ ok: true, matches });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
