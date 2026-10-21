import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { people } from "@/db/schema";
import { jsonError, readJson, secureRoute } from "@/lib/apiUtils";
import { agentRunSchema } from "@/lib/validation/schemas";
import { recordAuditEvent } from "@/lib/audit";
import { getClientIp } from "@/lib/session";

// A deliberately simple, deterministic stand-in for an LLM-backed agent
// action. The point of this route for Part 17 is not the "intelligence" —
// it is proving that *every* agent action is (a) permission-gated
// (`agent:run`), (b) strictly org-scoped (the agent can only read/act on
// the caller's own org's data, never cross-tenant), and (c) captured in the
// tamper-evident audit log with the reason the caller gave for running it.
// Part 08's prompt-injection suite exercises this route with hostile
// `reason`/content fields to confirm they are treated as inert data, never
// as instructions to any downstream system.
export const POST = secureRoute({
  method: "POST",
  path: "/api/agent/run",
  handler: async ({ request, session }) => {
    if (!session) return jsonError(401, "Authentication required");
    const parsed = await readJson(request, agentRunSchema);
    if (!parsed.ok) return parsed.response;
    const { action, personId, reason } = parsed.data;

    const [person] = await db
      .select()
      .from(people)
      .where(and(eq(people.id, personId), eq(people.orgId, session.orgId)))
      .limit(1);
    if (!person) return jsonError(404, "Not found");

    const result = {
      summarize_person: `Summary for ${person.fullName}: no notes on file.`,
      draft_outreach: `Draft message to ${person.fullName}: (placeholder — no LLM egress wired in this environment).`,
      score_lead: `Lead score for ${person.fullName}: unscored (placeholder).`,
    }[action];

    await recordAuditEvent({
      orgId: session.orgId,
      actorUserId: session.userId,
      actorRole: session.role,
      action: "agent.run",
      resourceType: "person",
      resourceId: person.id,
      reason,
      ip: await getClientIp(),
      metadata: { agentAction: action },
    });

    return NextResponse.json({ result });
  },
});
