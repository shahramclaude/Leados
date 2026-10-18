import { computeIntelligence } from "@/lib/leados/intelligence";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await computeIntelligence();
    return Response.json(data);
  } catch (err: any) {
    return Response.json({ error: err?.message ?? "intelligence_failed" }, { status: 500 });
  }
}
