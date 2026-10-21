#!/usr/bin/env tsx
// `npm run db:seed` — creates one demo organization with an owner, an admin,
// and a member so the security test suite and manual QA have a known
// starting fixture. Intentionally NOT exposed as a public HTTP endpoint
// (see src/lib/authz/registry.ts comment: no self-serve signup — LEADOS is
// invite-only B2B provisioning).
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { db } from "../src/db";
import { organizations, users } from "../src/db/schema";
import { hashPassword } from "../src/lib/crypto";
import { pool } from "../src/db";

async function main() {
  const [org] = await db
    .insert(organizations)
    .values({ name: "Acme Demo Org" })
    .returning();

  const [orgB] = await db
    .insert(organizations)
    .values({ name: "Beta Demo Org (tenant-isolation fixture)" })
    .returning();

  const demoPassword = process.env.SEED_DEMO_PASSWORD ?? "ChangeMe!2026-demo";
  const passwordHash = await hashPassword(demoPassword);

  await db.insert(users).values([
    { orgId: org.id, email: "owner@acme.test", role: "owner", passwordHash, securityStamp: randomUUID() },
    { orgId: org.id, email: "admin@acme.test", role: "admin", passwordHash, securityStamp: randomUUID() },
    { orgId: org.id, email: "member@acme.test", role: "member", passwordHash, securityStamp: randomUUID() },
    { orgId: orgB.id, email: "owner@beta.test", role: "owner", passwordHash, securityStamp: randomUUID() },
  ]);

  console.log("Seeded orgs:", { acme: org.id, beta: orgB.id });
  console.log(`Demo password for all seeded users: ${demoPassword} (NOT for production use)`);
  await pool.end();
}

main().catch(async (err) => {
  console.error("seed failed:", err);
  await pool.end().catch(() => {});
  process.exit(1);
});
