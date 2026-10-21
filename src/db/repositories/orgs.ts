import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  auditEvents,
  featureFlags,
  onboardingState,
  orgs,
  rolePermissionOverrides,
  teams,
  users,
} from "@/db/schema";

export async function getOrgById(orgId: string) {
  const rows = await db.select().from(orgs).where(eq(orgs.id, orgId)).limit(1);
  return rows[0];
}

export async function getOrgBySlug(slug: string) {
  const rows = await db.select().from(orgs).where(eq(orgs.slug, slug)).limit(1);
  return rows[0];
}

export async function listOrgs() {
  return db.select().from(orgs).orderBy(orgs.name);
}

export async function updateOrgProfile(
  orgId: string,
  patch: Partial<{
    name: string;
    logoUrl: string | null;
    accentColor: string;
    defaultLocale: string;
    teamTermKey: string;
    domains: string[];
  }>,
) {
  const [row] = await db.update(orgs).set(patch).where(eq(orgs.id, orgId)).returning();
  return row;
}

export async function listTeamsByOrg(orgId: string) {
  return db.select().from(teams).where(eq(teams.orgId, orgId)).orderBy(teams.name);
}

export async function createTeam(orgId: string, name: string) {
  const [row] = await db.insert(teams).values({ orgId, name }).returning();
  return row;
}

export async function listUsersByOrg(orgId: string) {
  return db.select().from(users).where(eq(users.orgId, orgId)).orderBy(users.name);
}

export async function getUserInOrg(orgId: string, userId: string) {
  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.orgId, orgId), eq(users.id, userId)))
    .limit(1);
  return rows[0];
}

export async function createUser(input: {
  orgId: string;
  email: string;
  name: string;
  role: string;
  managerOfTeamId?: string | null;
  financeRead?: boolean;
  locale?: string | null;
}) {
  const [row] = await db
    .insert(users)
    .values({
      orgId: input.orgId,
      email: input.email,
      name: input.name,
      role: input.role,
      managerOfTeamId: input.managerOfTeamId ?? null,
      financeRead: input.financeRead ?? false,
      locale: input.locale ?? null,
    })
    .returning();
  return row;
}

export async function listFeatureFlags(orgId: string) {
  return db.select().from(featureFlags).where(eq(featureFlags.orgId, orgId)).orderBy(featureFlags.key);
}

export async function upsertFeatureFlag(orgId: string, key: string, enabled: boolean, updatedBy: string) {
  const existing = await db
    .select()
    .from(featureFlags)
    .where(and(eq(featureFlags.orgId, orgId), eq(featureFlags.key, key)))
    .limit(1);
  if (existing[0]) {
    const [row] = await db
      .update(featureFlags)
      .set({ enabled, updatedAt: new Date(), updatedBy })
      .where(and(eq(featureFlags.orgId, orgId), eq(featureFlags.key, key)))
      .returning();
    return { row, before: existing[0] };
  }
  const [row] = await db
    .insert(featureFlags)
    .values({ orgId, key, enabled, updatedBy })
    .returning();
  return { row, before: null };
}

export async function listPermissionOverrides(orgId: string) {
  return db
    .select()
    .from(rolePermissionOverrides)
    .where(eq(rolePermissionOverrides.orgId, orgId));
}

export async function setPermissionOverride(
  orgId: string,
  role: string,
  permission: string,
  allowed: boolean,
  updatedBy: string,
) {
  const existing = await db
    .select()
    .from(rolePermissionOverrides)
    .where(
      and(
        eq(rolePermissionOverrides.orgId, orgId),
        eq(rolePermissionOverrides.role, role),
        eq(rolePermissionOverrides.permission, permission),
      ),
    )
    .limit(1);
  if (existing[0]) {
    const [row] = await db
      .update(rolePermissionOverrides)
      .set({ allowed, updatedAt: new Date(), updatedBy })
      .where(eq(rolePermissionOverrides.id, existing[0].id))
      .returning();
    return { row, before: existing[0] };
  }
  const [row] = await db
    .insert(rolePermissionOverrides)
    .values({ orgId, role, permission, allowed, updatedBy })
    .returning();
  return { row, before: null };
}

export async function recordAuditEvent(input: {
  orgId: string;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}) {
  const [row] = await db
    .insert(auditEvents)
    .values({
      orgId: input.orgId,
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      before: (input.before ?? null) as object | null,
      after: (input.after ?? null) as object | null,
    })
    .returning();
  return row;
}

export async function listAuditEvents(orgId: string) {
  return db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.orgId, orgId))
    .orderBy(auditEvents.createdAt);
}

export async function getOnboardingState(orgId: string) {
  const rows = await db
    .select()
    .from(onboardingState)
    .where(eq(onboardingState.orgId, orgId))
    .limit(1);
  return rows[0];
}

export async function upsertOnboardingState(
  orgId: string,
  patch: Partial<{ stepsCompleted: string[]; sampleDataSeeded: boolean; wizardCompleted: boolean }>,
) {
  const existing = await getOnboardingState(orgId);
  if (existing) {
    const [row] = await db
      .update(onboardingState)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(onboardingState.orgId, orgId))
      .returning();
    return row;
  }
  const [row] = await db
    .insert(onboardingState)
    .values({ orgId, ...patch })
    .returning();
  return row;
}
