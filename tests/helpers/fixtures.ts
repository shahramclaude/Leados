// Shared fixture builder for tests. Creates a throwaway org/user/membership
// per test so seam tests never depend on (or pollute) the demo seed data.
import { db } from "@/db";
import { orgs, users, memberships, apiKeys } from "@/db/schema";
import type { Role } from "@/lib/permissions";
import { hashApiKey } from "@/lib/tenancy";
import { randomUUID } from "node:crypto";

export async function createOrg(name = `Test Org ${randomUUID().slice(0, 8)}`) {
  const [org] = await db
    .insert(orgs)
    .values({ name, slug: `test-${randomUUID().slice(0, 12)}` })
    .returning();
  return org;
}

export async function createUser(email = `${randomUUID()}@test.dev`) {
  const [user] = await db.insert(users).values({ email, name: "Test User" }).returning();
  return user;
}

export async function createMember(orgId: string, role: Role) {
  const user = await createUser();
  await db.insert(memberships).values({ orgId, userId: user.id, role });
  return user;
}

export async function createApiKey(orgId: string, scopes: string[]) {
  const rawKey = `test_${randomUUID()}`;
  await db.insert(apiKeys).values({ orgId, name: "test key", keyHash: hashApiKey(rawKey), scopes });
  return rawKey;
}
