// GET /api/time-economics/meetings/auditor
//
// Meeting Auditor: recurring meetings ranked by value/cost with specific
// redesign options (shorten / async-convert / split / kill). This is an
// aggregate, meeting-level view — it never exposes which specific
// individual attended what (that lives behind the privacy-gated
// per-meeting-cost endpoint), so it is safe to show broadly.
import {
  getActorFromRequest,
  getDemoOrg,
  listRecurrenceKeysForOrg,
  listInstancesForRecurrence,
  listOutcomesForEventIds,
  listAttendeesForEvent,
  getOrgConfigOrDefault,
  getUserRate,
} from "@/lib/time-economics/repo";
import { computeMeetingCost } from "@/lib/time-economics/meetingCost";
import { auditRecurringMeeting, computeValueScore } from "@/lib/time-economics/outcomeDensity";
import type { AttendeeInput } from "@/lib/time-economics/types";
import type { Chronotype } from "@/lib/time-economics/circadian";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const actor = await getActorFromRequest(req);
  if (!actor) return Response.json({ error: "Missing or invalid x-user-id" }, { status: 401 });

  const org = await getDemoOrg();
  if (!org) return Response.json({ recurringMeetings: [] });

  const cfg = await getOrgConfigOrDefault(org.id);
  const recurrenceKeys = await listRecurrenceKeysForOrg(org.id);

  const results = [];
  for (const key of recurrenceKeys) {
    const instances = await listInstancesForRecurrence(org.id, key);
    if (instances.length === 0) continue;
    const outcomes = await listOutcomesForEventIds(instances.map((i) => i.id));
    const outcomeByEvent = new Map(outcomes.map((o) => [o.eventId, o]));

    const history = [];
    let lastTotalCost = 0;
    for (const instance of instances) {
      const attendeesRaw = await listAttendeesForEvent(instance.id);
      const attendeeInputs: AttendeeInput[] = [];
      for (const a of attendeesRaw) {
        const rate = await getUserRate(a.userId, Number(cfg.defaultLoadedHourlyRate));
        attendeeInputs.push({
          userId: a.userId,
          loadedHourlyRate: rate,
          required: a.required,
          interruptsDeepWork: false,
          chronotype: a.chronotype as Chronotype,
        });
      }
      const cost = computeMeetingCost({
        orgId: org.id,
        eventId: instance.id,
        title: instance.title,
        startTime: instance.startTime,
        endTime: instance.endTime,
        attendees: attendeeInputs,
        deepWorkPremiumMultiplier: Number(cfg.deepWorkPremiumMultiplier),
        recoveryMinutesPerInterruption: cfg.recoveryMinutesPerInterruption,
      });
      lastTotalCost = cost.totalCost;
      const outcome = outcomeByEvent.get(instance.id);
      history.push({
        eventId: instance.id,
        occurredAt: instance.startTime,
        decisionsCount: outcome?.decisionsCount ?? 0,
        actionsCount: outcome?.actionsCount ?? 0,
        cost: cost.totalCost,
        durationMinutes: (instance.endTime.getTime() - instance.startTime.getTime()) / 60000,
      });
    }

    const audit = auditRecurringMeeting(key, history, cfg.zeroOutcomeWeeksThreshold);
    const latest = history[history.length - 1];
    const latestOutcome = outcomeByEvent.get(latest.eventId);
    const valueScore = computeValueScore({
      eventId: latest.eventId,
      recurrenceKey: key,
      durationHours: latest.durationMinutes / 60,
      totalCost: latest.cost,
      decisionsCount: latestOutcome?.decisionsCount ?? 0,
      actionsCount: latestOutcome?.actionsCount ?? 0,
    });

    results.push({
      recurrenceKey: key,
      title: instances[instances.length - 1].title,
      instanceCount: audit.instanceCount,
      zeroOutcomeStreakWeeks: audit.zeroOutcomeStreakWeeks,
      trendDirection: audit.trendDirection,
      avgOutcomeDensityPerHour: audit.avgOutcomeDensityPerHour,
      avgCostPerOccurrence: audit.avgCostPerOccurrence,
      latestTotalCost: lastTotalCost,
      cadenceSuggestion: audit.cadenceSuggestion,
      headlineFinding: audit.headlineFinding,
      currentValueScore: valueScore.valueScore,
    });
  }

  results.sort((a, b) => a.currentValueScore - b.currentValueScore); // worst value first

  return Response.json({
    orgId: org.id,
    currency: cfg.currency,
    method: [
      "Value score = outcomes (decisions+actions, Part 25 capture) per $1,000 of modeled meeting cost. Lower = worse value.",
      `Zero-outcome streak threshold: ${cfg.zeroOutcomeWeeksThreshold} consecutive occurrences.`,
      "This view is meeting-level aggregate only — no individual attendee is identified here.",
    ],
    recurringMeetings: results,
  });
}
