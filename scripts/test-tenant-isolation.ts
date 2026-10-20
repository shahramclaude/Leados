// scripts/test-tenant-isolation.ts — `npm run test:isolation`
//
// Exercises the repository layer directly against Postgres (no HTTP, no
// mocking) to prove that a cross-organization read can never succeed no
// matter what id a caller supplies. Run with `tsx` so path aliases
// (`@/db`, `@/lib/...`) resolve exactly like they do inside Next.js.

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { createOrganization } from "@/lib/platform/db/orgsRepository";
import { createFinding, getFinding, listFindings } from "@/lib/platform/db/findingsRepository";
import { createUser } from "@/lib/platform/db/usersRepository";
import { createMembership, getMembership } from "@/lib/platform/db/membershipsRepository";
import { requirePermission } from "@/lib/platform/authz";
import { organizations, users } from "@/db/schema";
import { eq } from "drizzle-orm";

let failures = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ ${message}`);
  } else {
    failures += 1;
    console.error(`  ❌ ${message}`);
  }
}

async function main() {
  console.log("Tenant isolation test\n");

  const suffix = randomUUID().slice(0, 8);
  const orgA = await createOrganization({ slug: `tenant-a-${suffix}`, name: "Tenant A" });
  const orgB = await createOrganization({ slug: `tenant-b-${suffix}`, name: "Tenant B" });

  const { finding: findingA } = await createFinding(orgA.id, {
    title: "Org A confidential finding",
    domain: "general",
    team: "Team A",
    severity: 5,
    summary: "Must never be visible to org B.",
  });

  await createFinding(orgB.id, {
    title: "Org B finding",
    domain: "general",
    team: "Team B",
    severity: 1,
    summary: "Belongs to org B only.",
  });

  console.log("1. Repository-level isolation (direct repository calls):");
  const orgBFindings = await listFindings(orgB.id);
  assert(
    !orgBFindings.some((f) => f.id === findingA.id),
    "listFindings(orgB) does not contain org A's finding",
  );
  assert(orgBFindings.length === 1, "listFindings(orgB) returns exactly org B's own row");

  const crossRead = await getFinding(orgB.id, findingA.id);
  assert(crossRead === undefined, "getFinding(orgB, findingA.id) returns undefined — cannot fetch another tenant's row by id");

  const sameOrgRead = await getFinding(orgA.id, findingA.id);
  assert(!!sameOrgRead, "getFinding(orgA, findingA.id) succeeds for the owning tenant");

  console.log("\n2. RBAC enforcement (role lives on membership, not globally):");
  const user = await createUser({ email: `viewer-${suffix}@example.com`, name: "Viewer Example" });
  await createMembership({ userId: user.id, orgId: orgB.id, role: "viewer" });
  const membership = await getMembership(user.id, orgB.id);
  assert(!!membership && membership.role === "viewer", "membership role resolves to viewer for org B");

  let threw = false;
  try {
    requirePermission(
      { userId: user.id, orgId: orgB.id, role: "viewer", locale: "en-US" },
      "findings:create",
    );
  } catch {
    threw = true;
  }
  assert(threw, "requirePermission throws ForbiddenError for a viewer attempting findings:create");

  let allowed = true;
  try {
    requirePermission(
      { userId: user.id, orgId: orgB.id, role: "viewer", locale: "en-US" },
      "findings:view",
    );
  } catch {
    allowed = false;
  }
  assert(allowed, "requirePermission allows a viewer to read findings:view");

  // Cleanup so repeated runs don't accumulate rows.
  await db.delete(organizations).where(eq(organizations.id, orgA.id));
  await db.delete(organizations).where(eq(organizations.id, orgB.id));
  await db.delete(users).where(eq(users.id, user.id));

  console.log(`\n${failures === 0 ? "✅ All tenant isolation checks passed." : `❌ ${failures} check(s) failed.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Tenant isolation test crashed:", err);
  process.exit(1);
});
