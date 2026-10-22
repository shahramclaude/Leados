// LEADOS Part 14 — demo/test context bootstrap.
// There is no auth system in this repo snapshot (that's Part 03's job). To
// keep Part 14 self-contained and testable, this module lazily creates one
// demo org with a manager + analyst user the first time anything asks for
// it, and every API route resolves "current user" from a `userId` query
// param / header, falling back to the demo analyst. Swap this out wholesale
// once real auth lands — nothing else in Part 14 depends on its internals,
// only on `{ orgId, userId, role, timezone }`.
import { db } from "@/db";
import { orgs, users } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface Actor {
  orgId: string;
  userId: string;
  role: string;
  timezone: string;
}

let bootstrapPromise: Promise<{ orgId: string; managerId: string; analystId: string }> | null = null;

async function bootstrap() {
  const existingOrg = await db.select().from(orgs).limit(1);
  if (existingOrg[0]) {
    const existingUsers = await db.select().from(users).where(eq(users.orgId, existingOrg[0].id));
    const manager = existingUsers.find((u) => u.role === "manager") ?? existingUsers[0];
    const analyst = existingUsers.find((u) => u.role === "analyst") ?? existingUsers[0];
    if (manager && analyst) {
      return { orgId: existingOrg[0].id, managerId: manager.id, analystId: analyst.id };
    }
  }

  const [org] = existingOrg[0] ? [existingOrg[0]] : await db.insert(orgs).values({ name: "Demo Org" }).returning();
  const [manager] = await db
    .insert(users)
    .values({ orgId: org.id, name: "Morgan Manager", email: `manager-${org.id}@leados.demo`, role: "manager", timezone: "America/New_York" })
    .returning();
  const [analyst] = await db
    .insert(users)
    .values({ orgId: org.id, name: "Alex Analyst", email: `analyst-${org.id}@leados.demo`, role: "analyst", timezone: "America/Los_Angeles" })
    .returning();

  return { orgId: org.id, managerId: manager.id, analystId: analyst.id };
}

export async function ensureDemoContext() {
  if (!bootstrapPromise) bootstrapPromise = bootstrap();
  return bootstrapPromise;
}

export async function resolveActor(req: Request): Promise<Actor> {
  const url = new URL(req.url);
  const requestedUserId = url.searchParams.get("userId") ?? req.headers.get("x-user-id");

  if (requestedUserId) {
    const [user] = await db.select().from(users).where(eq(users.id, requestedUserId)).limit(1);
    if (user) {
      return { orgId: user.orgId, userId: user.id, role: user.role, timezone: user.timezone };
    }
  }

  const demo = await ensureDemoContext();
  const asRole = url.searchParams.get("role");
  const userId = asRole === "manager" ? demo.managerId : demo.analystId;
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return { orgId: demo.orgId, userId, role: user?.role ?? "analyst", timezone: user?.timezone ?? "UTC" };
}
