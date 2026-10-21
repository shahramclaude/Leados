import { MODEL_CARDS } from "@/lib/intelligence/modelCards";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return Response.json({ modelCards: MODEL_CARDS });
}
