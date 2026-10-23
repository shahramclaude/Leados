// LEADOS — Part 45: Meeting economics model.
//
// meetingCost = Σ_attendees (loadedHourlyRate × duration)
//             + opportunityCost (deep-work interruption premium)
//
// Every number this produces is an ESTIMATE. The `method` array returned
// alongside every result is intended to be rendered verbatim in the UI so
// nobody mistakes a modeled figure for a measured one. See MODEL-CARD.md
// for the full justification and literature citations.

import { durationHours as computeDurationHours } from "./temporal";
import { cumulativeRecoveryMinutes } from "./fatigue";
import type { MeetingCostInput, MeetingCostResult, MeetingCostBreakdownLine } from "./types";

export function computeMeetingCost(input: MeetingCostInput, currency = "USD"): MeetingCostResult {
  const hours = computeDurationHours(input.startTime, input.endTime);
  const method: string[] = [
    `Direct cost = Σ attendees (loaded hourly rate × ${hours.toFixed(2)}h duration).`,
    `Loaded hourly rate = fully-burdened estimate (salary + benefits + overhead), not take-home pay — org-config default unless an explicit banded estimate exists for that person.`,
  ];

  const perAttendee: MeetingCostBreakdownLine[] = input.attendees.map((a) => {
    const directCost = a.loadedHourlyRate * hours;
    let opportunityCost = 0;
    if (a.interruptsDeepWork) {
      const recoveryMinutes = cumulativeRecoveryMinutes(1, input.recoveryMinutesPerInterruption);
      const recoveryHours = recoveryMinutes / 60;
      opportunityCost = a.loadedHourlyRate * recoveryHours * input.deepWorkPremiumMultiplier;
    }
    return {
      userId: a.userId,
      hourlyRate: a.loadedHourlyRate,
      durationHours: hours,
      directCost: round2(directCost),
      interruptedDeepWork: a.interruptsDeepWork,
      opportunityCost: round2(opportunityCost),
    };
  });

  if (input.attendees.some((a) => a.interruptsDeepWork)) {
    method.push(
      `Opportunity cost = (recovery minutes per interruption × deep-work premium multiplier × hourly rate) for each attendee whose deep-work block this meeting fragments. Recovery-time default (23 min) is sourced from Mark, Gudith & Klocke (2008); the premium multiplier (org-configurable, default 1.5×) is a policy choice, not a measurement — see MODEL CARD §4.`,
    );
  }

  const directCost = round2(perAttendee.reduce((acc, p) => acc + p.directCost, 0));
  const opportunityCost = round2(perAttendee.reduce((acc, p) => acc + p.opportunityCost, 0));

  return {
    eventId: input.eventId,
    durationHours: round2(hours),
    directCost,
    opportunityCost,
    totalCost: round2(directCost + opportunityCost),
    currency,
    perAttendee,
    method,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
