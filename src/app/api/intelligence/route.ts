import { computeIntelligence } from "@/lib/intelligence";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await computeIntelligence();
    return Response.json(data);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
