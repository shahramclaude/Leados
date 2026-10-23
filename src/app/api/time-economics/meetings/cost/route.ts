// GET /api/time-economics/meetings/cost?eventId=...
//
// Returns the meeting-cost model output for one meeting. The aggregate
// total is always visible (needed for the Meeting Auditor to function),
// but the per-attendee breakdown lines (who specifically cost what) are
// gated by the privacy matrix: only the attendee themselves, or someone
// they've explicitly consented to share with, sees their line. Every
// denial is written to the audit log.
import {
  getActorFromRequest,
  getEvent,
  listAttendeesForEvent,
  getOrgConfigOrDefault,
  getUserRate,
  getConsent,
  logPrivacyDecision,
} from "@/lib/time-economics/repo";
import { computeMeetingCost } from "@/lib/time-economics/meetingCost";
import { evaluateTimeDataAccess } from "@/lib/time-economics/privacy";
import type { AttendeeInput } from "@/lib/time-economics/types";
import type { Chronotype } from "@/lib/time-economics/circadian";
import { localMinuteOfDay } from "@/lib/time-economics/temporal";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const actor = await getActorFromRequest(req);
  if (!actor) return Response.json({ error: "Missing or invalid x-user-id" }, { status: 401 });

  const url = new URL(req.url);
  const eventId = url.searchParams.get("eventId");
  if (!eventId) return Response.json({ error: "eventId is required" }, { status: 400 });

  const event = await getEvent(eventId);
  if (!event) return Response.json({ error: "Event not found" }, { status: 404 });

  const cfg = await getOrgConfigOrDefault(event.orgId);
  const attendeesRaw = await listAttendeesForEvent(eventId);

  const attendeeInputs: AttendeeInput[] = [];
  for (const a of attendeesRaw) {
    const rate = await getUserRate(a.userId, Number(cfg.defaultLoadedHourlyRate));
    const localStart = localMinuteOfDay(a.timezone, event.startTime);
    const localEnd = localStart + (event.endTime.getTime() - event.startTime.getTime()) / 60000;
    const interruptsDeepWork =
      localStart >= cfg.workDayStartMinute &&
      localEnd <= cfg.workDayEndMinute &&
      localEnd - localStart < 120; // a short meeting dropped into an otherwise-open block fragments it
    attendeeInputs.push({
      userId: a.userId,
      loadedHourlyRate: rate,
      required: a.required,
      interruptsDeepWork,
      chronotype: a.chronotype as Chronotype,
    });
  }

  const result = computeMeetingCost(
    {
      orgId: event.orgId,
      eventId: event.id,
      title: event.title,
      startTime: event.startTime,
      endTime: event.endTime,
      attendees: attendeeInputs,
      deepWorkPremiumMultiplier: Number(cfg.deepWorkPremiumMultiplier),
      recoveryMinutesPerInterruption: cfg.recoveryMinutesPerInterruption,
    },
    cfg.currency,
  );

  const visiblePerAttendee = [];
  let redactedCount = 0;
  for (const line of result.perAttendee) {
    const consent = await getConsent(line.userId);
    const decision = evaluateTimeDataAccess(actor, line.userId, "individual_meeting_cost_detail", consent);
    if (decision.allowed) {
      visiblePerAttendee.push(line);
    } else {
      redactedCount += 1;
    }
    if (actor.id !== line.userId) {
      await logPrivacyDecision(actor.id, line.userId, "individual_meeting_cost_detail", decision.allowed, decision.reason);
    }
  }

  return Response.json({
    eventId: result.eventId,
    title: event.title,
    durationHours: result.durationHours,
    directCost: result.directCost,
    opportunityCost: result.opportunityCost,
    totalCost: result.totalCost,
    currency: result.currency,
    method: result.method,
    perAttendee: visiblePerAttendee,
    redactedAttendeeCount: redactedCount,
    privacyNote:
      redactedCount > 0
        ? `${redactedCount} attendee cost line(s) hidden — individual time/cost data is self-owned (see MODEL-CARD.md).`
        : null,
  });
}
