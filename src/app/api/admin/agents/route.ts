import { db } from "@/db";
import { agents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireInternalOrgId } from "@/lib/tenant";
import { handleRouteError, jsonError } from "@/lib/api-response";
import { writeWithEnvelope } from "@/lib/envelope";
import { AGENT_TIERS, TOOL_CATALOG } from "@/lib/tiers";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const orgId = requireInternalOrgId(req);
    const rows = await db.select().from(agents).where(eq(agents.orgId, orgId));
    return Response.json({ ok: true, agents: rows, tiers: AGENT_TIERS, tools: TOOL_CATALOG });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: Request) {
  try {
    const orgId = requireInternalOrgId(req);
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const tier = Number(body.tier);
    if (!name || ![0, 1, 2, 3].includes(tier)) {
      return jsonError('"name" and "tier" (0-3) are required', 400);
    }
    const agent = await writeWithEnvelope({
      orgId,
      actorType: "human",
      actorId: req.headers.get("x-actor-id") ?? "unknown-human",
      entityType: "agent",
      entityId: (r) => String((r as { id: number }).id),
      action: "agent.create",
      reason: `agent provisioned at tier ${tier}`,
      mutate: async () => {
        const [row] = await db.insert(agents).values({ orgId, name, tier }).returning();
        return row;
      },
      after: (row) => row,
    });
    return Response.json({ ok: true, agent }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
