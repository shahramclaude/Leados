import "server-only";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, orgs, users } from "@/db/schema";
import type { DomainScope, MembershipRole } from "@/db/schema";
import { normalizeLocale, type Locale } from "@/lib/i18n";

export const SESSION_USER_COOKIE = "leados_user_id";
export const SESSION_ORG_COOKIE = "leados_org_id";

export type OrgContext = {
  orgId: string;
  userId: string;
  userName: string;
  role: MembershipRole;
  scopes: DomainScope[];
  locale: Locale;
  org: {
    id: string;
    slug: string;
    name: string;
    locale: Locale;
    accentColor: string;
    logoEmoji: string;
    terminology: Record<string, string>;
    highContrastDefault: boolean;
    plainLanguageDefault: boolean;
    onboardingCompletedAt: Date | null;
  };
};

/**
 * Resolves the "logged in" org + user from simulated-session cookies.
 *
 * NOTE (honesty, see AI-SESSION-LOG.md): Parts 01-03 (real auth) are not
 * present in this sandbox checkout, so this stands in for `getSession()` /
 * `OrgContext` described in the standing order. Every call still goes through
 * this single chokepoint, so swapping in real auth later only means changing
 * this function's body — no call site changes.
 */
export async function getOrgContext(explicitOrgId?: string): Promise<OrgContext | null> {
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_USER_COOKIE)?.value;
  const orgId = explicitOrgId ?? cookieStore.get(SESSION_ORG_COOKIE)?.value;
  if (!userId || !orgId) return null;

  const [row] = await db
    .select({
      role: memberships.role,
      scopes: memberships.scopes,
      userName: users.name,
      orgId: orgs.id,
      slug: orgs.slug,
      name: orgs.name,
      locale: orgs.locale,
      accentColor: orgs.accentColor,
      logoEmoji: orgs.logoEmoji,
      terminology: orgs.terminology,
      highContrastDefault: orgs.highContrastDefault,
      plainLanguageDefault: orgs.plainLanguageDefault,
      onboardingCompletedAt: orgs.onboardingCompletedAt,
    })
    .from(memberships)
    .innerJoin(orgs, eq(orgs.id, memberships.orgId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.userId, userId), eq(memberships.orgId, orgId)))
    .limit(1);

  if (!row) return null;

  const locale = normalizeLocale(row.locale);

  return {
    orgId: row.orgId,
    userId,
    userName: row.userName,
    role: row.role as MembershipRole,
    scopes: (row.scopes ?? []) as DomainScope[],
    locale,
    org: {
      id: row.orgId,
      slug: row.slug,
      name: row.name,
      locale,
      accentColor: row.accentColor,
      logoEmoji: row.logoEmoji,
      terminology: (row.terminology ?? {}) as Record<string, string>,
      highContrastDefault: row.highContrastDefault,
      plainLanguageDefault: row.plainLanguageDefault,
      onboardingCompletedAt: row.onboardingCompletedAt,
    },
  };
}
