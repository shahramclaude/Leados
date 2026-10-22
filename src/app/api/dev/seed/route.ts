// LEADOS Part 14 — POST /api/dev/seed
// Development/test-only helper: seeds demo findings + approvals so the Now
// surface and notification flows have real rows to compute over. Also
// supports `?fresh=true` to spin up a brand-new, empty org (for the "does Now
// work for a new org" attack-phase check) — returns its ids instead of
// touching the default demo org.
import { db } from "@/db";
import { approvals, findings, orgs, users } from "@/db/schema";
import { ensureDemoContext } from "@/lib/demoContext";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const url = new URL(req.url);

  if (url.searchParams.get("fresh") === "true") {
    const [org] = await db.insert(orgs).values({ name: `Fresh Org ${Date.now()}` }).returning();
    const [user] = await db
      .insert(users)
      .values({ orgId: org.id, name: "New Analyst", email: `new-${org.id}@leados.demo`, role: "analyst", timezone: "UTC" })
      .returning();
    return Response.json({ orgId: org.id, userId: user.id, role: user.role });
  }

  const demo = await ensureDemoContext();

  const [finding1] = await db
    .insert(findings)
    .values({
      orgId: demo.orgId,
      title: "Acme Corp renewal risk flagged",
      detail: "Usage dropped 42% over 14 days across 3 seats.",
      severity: 5,
      entityRef: "account:acme-corp",
      visibleToRole: "analyst",
    })
    .returning();

  const [finding2] = await db
    .insert(findings)
    .values({
      orgId: demo.orgId,
      title: "2 new leads matched ICP for North region",
      detail: "Score 87 and 81, both from inbound webinar signup.",
      severity: 3,
      entityRef: "segment:north-region",
      visibleToRole: "analyst",
    })
    .returning();

  const [approval1] = await db
    .insert(approvals)
    .values({
      orgId: demo.orgId,
      title: "Approve discount override for Beta LLC (18%)",
      description: "Rep requested 18% discount, 3% over policy threshold.",
      severity: 4,
      assigneeRole: "manager",
      entityRef: "deal:beta-llc",
      dueAt: new Date(Date.now() + 20 * 60 * 60 * 1000),
    })
    .returning();

  return Response.json({ orgId: demo.orgId, seeded: { findings: [finding1, finding2], approvals: [approval1] } });
}
