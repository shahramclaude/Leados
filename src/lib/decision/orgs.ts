import { db } from "@/db";
import { orgs, users } from "@/db/schema";
import { asc, eq } from "drizzle-orm";

export async function listOrgs() {
  return db.select().from(orgs).orderBy(asc(orgs.name));
}

export async function listUsersForOrg(orgId: string) {
  return db.select().from(users).where(eq(users.orgId, orgId)).orderBy(asc(users.name));
}
