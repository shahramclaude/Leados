// src/lib/platform/db/membershipsRepository.ts — role-per-org assignment.

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, organizations, type Membership, type NewMembership } from "@/db/schema";

export async function createMembership(input: NewMembership): Promise<Membership> {
  const [row] = await db.insert(memberships).values(input).returning();
  return row;
}

export async function getMembership(userId: string, orgId: string): Promise<Membership | undefined> {
  const [row] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.orgId, orgId)))
    .limit(1);
  return row;
}

export async function listMembershipsForUser(
  userId: string,
): Promise<Array<Membership & { orgName: string; orgSlug: string }>> {
  const rows = await db
    .select({
      id: memberships.id,
      userId: memberships.userId,
      orgId: memberships.orgId,
      role: memberships.role,
      createdAt: memberships.createdAt,
      orgName: organizations.name,
      orgSlug: organizations.slug,
    })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.orgId, organizations.id))
    .where(eq(memberships.userId, userId));
  return rows;
}

export async function listMembershipsForOrg(orgId: string): Promise<Membership[]> {
  return db.select().from(memberships).where(eq(memberships.orgId, orgId));
}
