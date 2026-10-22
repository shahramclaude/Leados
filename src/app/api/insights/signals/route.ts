import { ensureSeedData, listThemes, mineAndStoreThemes } from "@/lib/sensing/db";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSeedData();
  const themes = await listThemes();
  return Response.json({
    themes,
    thresholds: {
      burstMinVelocity: 1.5,
      persistenceDaysForTrend: 7,
      note: "A theme is labeled 'trend' only after 7 consecutive active days at >=1.5x baseline velocity; before that it stays labeled 'signal' regardless of burst size.",
    },
  });
}

// Re-mines weak-signal themes from current signal_items (idempotent upsert).
export async function POST() {
  await ensureSeedData();
  const themes = await mineAndStoreThemes();
  return Response.json({ ok: true, themeCount: themes.length });
}
