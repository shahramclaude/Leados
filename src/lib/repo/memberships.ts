import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, users, type DomainScope, type MembershipRole } from "@/db/schema";

export type MembershipRow = typeof memberships.$inferSelect;

export async function getMembership(orgId: string, userId: string): Promise<MembershipRow | undefined> {
  const [row] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)))
    .limit(1);
  return row;
}

export async function listMembersForOrg(orgId: string) {
  return db
    .select({
      userId: memberships.userId,
      name: users.name,
      email: users.email,
      role: memberships.role,
      scopes: memberships.scopes,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.orgId, orgId));
}

export async function upsertUser(input: { email: string; name: string }) {
  const existing = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
  if (existing[0]) return existing[0];
  const [row] = await db.insert(users).values(input).returning();
  return row;
}

export async function addMembership(input: {
  orgId: string;
  userId: string;
  role: MembershipRole;
  scopes: DomainScope[];
}) {
  const [row] = await db
    .insert(memberships)
    .values(input)
    .onConflictDoUpdate({
      target: [memberships.orgId, memberships.userId],
      set: { role: input.role, scopes: input.scopes },
    })
    .returning();
  return row;
}
