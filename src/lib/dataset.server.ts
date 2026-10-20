// LEADOS Part 01 — dataset provenance label.
//
// Server-only (imports `@/db`). Honesty-rule support: every environment must
// be able to answer "is the data I'm looking at synthetic seed data or real
// production data?" at a glance. src/db/seed.ts writes the `dataset.label`
// setting; this module reads it. UI surfaces (and this part's API routes)
// should show the label prominently whenever it is not "real".

// Note: deliberately NOT importing the `server-only` package here. That
// package throws if imported outside Next's bundler (e.g. from a plain
// `tsx` script), and this module is imported by src/db/seed.ts and
// scripts/*.ts as well as by Next.js server components/route handlers. It
// already cannot run in the browser (it imports `@/db`, which needs
// `pg`/`DATABASE_URL`), so the guard would be redundant safety for API
// routes at the cost of breaking script usage — not a good trade here.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import type { DatasetLabelDTO } from "@/lib/events/clientTypes";

const SETTINGS_KEY = "dataset.label";

export async function getDatasetLabel(): Promise<DatasetLabelDTO> {
  const rows = await db.select().from(settings).where(eq(settings.key, SETTINGS_KEY)).limit(1);
  if (rows.length === 0) {
    return { label: "unknown", description: "No dataset label has been set. Run the seed script or mark this environment explicitly." };
  }
  return rows[0].value as DatasetLabelDTO;
}

export async function setDatasetLabel(value: DatasetLabelDTO): Promise<void> {
  await db
    .insert(settings)
    .values({ key: SETTINGS_KEY, value: value as object, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.key, set: { value: value as object, updatedAt: new Date() } });
}
