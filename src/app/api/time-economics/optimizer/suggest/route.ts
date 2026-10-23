// POST /api/time-economics/optimizer/suggest
//
// Calendar optimization engine — returns ranked, constraint-satisfying
// candidate slots. This endpoint NEVER books a meeting; it persists a
// `proposed` suggestion row and returns candidates for a human to pick
// from. Booking only happens via the separate, explicit
// /api/time-economics/optimizer/confirm endpoint (T2 gate).
import {
  getActorFromRequest,
  getDemoOrg,
  getOrgConfigOrDefault,
  getUserById,
  listEventsForUser,
  listNoMeetingWindows,
  listTeamsWithMembers,
  createSchedulingSuggestion,
} from "@/lib/time-economics/repo";
import { generateSchedulingSuggestions } from "@/lib/time-economics/calendarOptimizer";
import type { AttendeeContext, NoMeetingWindowConstraint } from "@/lib/time-economics/calendarOptimizer";
import type { Chronotype } from "@/lib/time-economics/circadian";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const actor = await getActorFromRequest(req);
  if (!actor) return Response.json({ error: "Missing or invalid x-user-id" }, { status: 401 });

  const org = await getDemoOrg();
  if (!org) return Response.json({ error: "No demo org seeded" }, { status: 404 });

  const body = await req.json();
  const { title, durationMinutes, earliestStart, latestEnd, requiredUserIds, optionalUserIds } = body ?? {};

  if (!title || !durationMinutes || !earliestStart || !latestEnd || !Array.isArray(requiredUserIds)) {
    return Response.json(
      { error: "title, durationMinutes, earliestStart, latestEnd, requiredUserIds[] are required" },
      { status: 400 },
    );
  }

  const cfg = await getOrgConfigOrDefault(org.id);
  const allWindows = await listNoMeetingWindows(org.id);
  const teams = await listTeamsWithMembers(org.id);

  const allUserIds: string[] = [...requiredUserIds, ...(optionalUserIds ?? [])];
  const attendeeContexts: AttendeeContext[] = [];

  const windowStart = new Date(earliestStart);
  const windowEnd = new Date(latestEnd);

  for (const userId of allUserIds) {
    const user = await getUserById(userId);
    if (!user) continue;
    const eventRows = await listEventsForUser(userId, org.id);
    const busy = eventRows
      .map((r) => r.event)
      .filter((e) => e.endTime > windowStart && e.startTime < windowEnd)
      .map((e) => ({ start: e.startTime, end: e.endTime }));

    attendeeContexts.push({
      userId,
      required: requiredUserIds.includes(userId),
      timezone: user.timezone,
      chronotype: user.chronotype as Chronotype,
      busy,
      workDayStartMinute: cfg.workDayStartMinute,
      workDayEndMinute: cfg.workDayEndMinute,
    });
  }

  const noMeetingWindowConstraints: NoMeetingWindowConstraint[] = [];
  for (const w of allWindows) {
    if (w.scope === "org") {
      noMeetingWindowConstraints.push({ dayOfWeek: w.dayOfWeek, startMinute: w.startMinute, endMinute: w.endMinute, enforced: w.enforced, appliesToUserId: null });
    } else if (w.scope === "team") {
      const team = teams.find((t) => t.id === w.scopeId);
      for (const memberId of team?.memberIds ?? []) {
        noMeetingWindowConstraints.push({ dayOfWeek: w.dayOfWeek, startMinute: w.startMinute, endMinute: w.endMinute, enforced: w.enforced, appliesToUserId: memberId });
      }
    } else if (w.scope === "user" && w.scopeId) {
      noMeetingWindowConstraints.push({ dayOfWeek: w.dayOfWeek, startMinute: w.startMinute, endMinute: w.endMinute, enforced: w.enforced, appliesToUserId: w.scopeId });
    }
  }

  const result = generateSchedulingSuggestions({
    title,
    durationMinutes,
    earliestStart: windowStart,
    latestEnd: windowEnd,
    attendees: attendeeContexts,
    noMeetingWindows: noMeetingWindowConstraints,
  });

  const suggestion = await createSchedulingSuggestion(org.id, actor.id, {
    title,
    durationMinutes,
    requiredUserIds,
    optionalUserIds: optionalUserIds ?? [],
    candidates: result.feasibleCandidates,
  });

  return Response.json({
    suggestionId: suggestion.id,
    status: suggestion.status,
    candidates: result.feasibleCandidates,
    infeasibleReasonSummary: result.infeasibleReasonSummary,
    method: result.method,
    note: "This is a proposal only. Nothing is booked. Call /api/time-economics/optimizer/confirm with this suggestionId and a chosen candidate to record a decision.",
  });
}
