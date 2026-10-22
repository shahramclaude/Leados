import { seedDatabase } from "@/lib/change/repository";

export const dynamic = "force-dynamic";

/**
 * Resets and repopulates the change/transformation demo dataset. Idempotent
 * and deterministic (see `src/lib/change/seed.ts`). Intended for demo /
 * test bootstrapping only.
 */
export async function POST() {
  try {
    const summary = await seedDatabase(new Date());
    return Response.json({ ok: true, summary });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "seed failed" }, { status: 500 });
  }
}
