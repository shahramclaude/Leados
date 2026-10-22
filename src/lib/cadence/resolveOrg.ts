// LEADOS Part 25 — tiny convenience helper. This sandbox has no auth/tenancy
// layer yet (the starter template has none), so API routes accept an
// optional `?orgId=` query param and otherwise fall back to the first org in
// the database, seeding the bundled demo org on first use so the surfaces
// are populated with real (if synthetic) data rather than an empty state.
import { db } from "@/db";
import { orgs } from "@/db/schema";
import { seedDemoOrg } from "./demoSeed";

export async function resolveOrgId(searchParams: URLSearchParams): Promise<string> {
  const explicit = searchParams.get("orgId");
  if (explicit) return explicit;
  const [org] = await db.select().from(orgs).limit(1);
  if (org) return org.id;
  const { orgId } = await seedDemoOrg();
  return orgId;
}
