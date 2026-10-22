// Demo-tenant bootstrap.
//
// HONESTY NOTE (see docs/RED-TEAM-2026.md SEC-01): there is no real
// authentication system in this build (see FEATURES.md — "Auth" is a
// documented stub). This console app has no other way to get a working
// org/API key without one, so a demo org with a fixed API key is seeded by
// default so the preview is usable. This is NOT safe for a real multi-tenant
// production deployment — a real deployer MUST set LEADOS_DISABLE_DEMO=1
// (which this function honors) once real auth lands. Shipping this default
// as "on" is a deliberate, documented tradeoff, not an oversight.
import { db } from "@/db";
import { agents, apiKeys, organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashApiKey } from "@/lib/tenant";

export const DEMO_ORG_NAME = "Demo Org";
export const DEMO_API_KEY = "leados-demo-key-local-only";

export class DemoDisabledError extends Error {}

export async function ensureDemoOrg(): Promise<{ orgId: number; agentId: number; apiKey: string }> {
  if (process.env.LEADOS_DISABLE_DEMO === "1") {
    throw new DemoDisabledError("demo tenant seeding is disabled (LEADOS_DISABLE_DEMO=1)");
  }

  let [org] = await db.select().from(organizations).where(eq(organizations.name, DEMO_ORG_NAME));
  if (!org) {
    [org] = await db.insert(organizations).values({ name: DEMO_ORG_NAME }).returning();
  }

  let [agent] = await db.select().from(agents).where(eq(agents.orgId, org.id));
  if (!agent) {
    [agent] = await db.insert(agents).values({ orgId: org.id, name: "LeadOps Copilot", tier: 2 }).returning();
  }

  const keyHash = hashApiKey(DEMO_API_KEY);
  const [existingKey] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash));
  if (!existingKey) {
    await db.insert(apiKeys).values({ orgId: org.id, keyHash, label: "demo", scope: "public" });
  }

  return { orgId: org.id, agentId: agent.id, apiKey: DEMO_API_KEY };
}
