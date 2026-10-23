// Deep-Work Architecture — no-meeting window policy tool.
// GET: list windows (org-level info, not individual time data — safe to show broadly).
// POST: create a window. Only manager/admin roles may set `enforced=true`
// (a hard, scheduling-blocking policy); anyone may propose an advisory
// (non-enforced) window for their own scope.
import { getActorFromRequest, getDemoOrg, listNoMeetingWindows, createNoMeetingWindow } from "@/lib/time-economics/repo";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const actor = await getActorFromRequest(req);
  if (!actor) return Response.json({ error: "Missing or invalid x-user-id" }, { status: 401 });
  const org = await getDemoOrg();
  if (!org) return Response.json({ windows: [] });
  const windows = await listNoMeetingWindows(org.id);
  return Response.json({ windows });
}

export async function POST(req: Request) {
  const actor = await getActorFromRequest(req);
  if (!actor) return Response.json({ error: "Missing or invalid x-user-id" }, { status: 401 });
  const org = await getDemoOrg();
  if (!org) return Response.json({ error: "No demo org seeded" }, { status: 404 });

  const body = await req.json();
  const { scope, scopeId, dayOfWeek, startMinute, endMinute, enforced, label } = body ?? {};

  if (!["org", "team", "user"].includes(scope)) {
    return Response.json({ error: "scope must be org | team | user" }, { status: 400 });
  }
  if (typeof dayOfWeek !== "number" || dayOfWeek < 0 || dayOfWeek > 6) {
    return Response.json({ error: "dayOfWeek must be 0..6" }, { status: 400 });
  }
  if (typeof startMinute !== "number" || typeof endMinute !== "number" || endMinute <= startMinute) {
    return Response.json({ error: "startMinute/endMinute invalid" }, { status: 400 });
  }
  if (enforced && actor.role !== "admin" && actor.role !== "manager") {
    return Response.json({ error: "Only admin/manager roles may create enforced (blocking) no-meeting windows." }, { status: 403 });
  }
  if (scope === "user" && !enforced && scopeId && scopeId !== actor.id) {
    return Response.json({ error: "Non-enforced personal windows may only be set for yourself." }, { status: 403 });
  }

  const window = await createNoMeetingWindow({
    orgId: org.id,
    scope,
    scopeId: scope === "org" ? null : scopeId ?? null,
    dayOfWeek,
    startMinute,
    endMinute,
    enforced: Boolean(enforced),
    label: label ?? "Deep work",
    createdBy: actor.id,
  });

  return Response.json({ window }, { status: 201 });
}
