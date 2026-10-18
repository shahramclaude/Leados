import { computeIntelligence } from "@/lib/intelligence";
import { seedIfEmpty } from "@/db/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await seedIfEmpty();
    const report = await computeIntelligence();
    return Response.json(report);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
