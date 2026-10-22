import { NextRequest } from "next/server";
import { shortestInfluencePath } from "@/lib/knowledgeGraph";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!from || !to) return Response.json({ ok: false, error: "from and to are required" }, { status: 400 });

  try {
    const path = await shortestInfluencePath(from, to);
    return Response.json({ ok: true, from, to, path });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
