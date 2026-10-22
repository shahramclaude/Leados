import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orgs } from "@/db/schema";
import type { Locale } from "@/lib/i18n";

export type OrgRow = typeof orgs.$inferSelect;

/** Scoped to a single org by primary key — never list-all from a tenant route. */
export async function getOrgById(orgId: string): Promise<OrgRow | undefined> {
  const [row] = await db.select().from(orgs).where(eq(orgs.id, orgId)).limit(1);
  return row;
}

export async function updateOrgSettings(
  orgId: string,
  patch: Partial<{
    name: string;
    locale: Locale;
    accentColor: string;
    logoEmoji: string;
    terminology: Record<string, string>;
    highContrastDefault: boolean;
    plainLanguageDefault: boolean;
  }>,
): Promise<OrgRow> {
  const [row] = await db
    .update(orgs)
    .set(patch)
    .where(eq(orgs.id, orgId))
    .returning();
  return row;
}

export async function markOnboardingComplete(orgId: string): Promise<void> {
  await db.update(orgs).set({ onboardingCompletedAt: new Date() }).where(eq(orgs.id, orgId));
}

export async function createOrg(input: {
  slug: string;
  name: string;
  locale: Locale;
}): Promise<OrgRow> {
  const [row] = await db
    .insert(orgs)
    .values({ slug: input.slug, name: input.name, locale: input.locale })
    .returning();
  return row;
}
