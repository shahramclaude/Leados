// Per-user, timezone-aware quiet hours. This is the "circadian" input to the
// interrupt policy state machine: it answers one question — is right now a
// bad time to interrupt this specific human, in their own local time?

import { isWithinQuietHours, localHourFor } from "@/lib/temporal";

export interface QuietHoursConfig {
  timezone: string;
  quietHoursStart: number; // local hour 0-23
  quietHoursEnd: number; // local hour 0-23
}

export function isQuietNow(cfg: QuietHoursConfig, now: Date = new Date()): boolean {
  const hour = localHourFor(now, cfg.timezone);
  return isWithinQuietHours(hour, cfg.quietHoursStart, cfg.quietHoursEnd);
}

export function localHourNow(timezone: string, now: Date = new Date()): number {
  return localHourFor(now, timezone);
}

// Seam: meeting-aware suppression once a calendar integration exists. With
// no calendar wired up, this always degrades to "not in a meeting" so the
// rest of the pipeline behaves identically whether or not the seam is filled.
export interface CalendarSignal {
  inMeetingUntil?: Date | null;
}

export function isInMeeting(signal: CalendarSignal | null | undefined, now: Date = new Date()): boolean {
  if (!signal?.inMeetingUntil) return false;
  return now.getTime() < signal.inMeetingUntil.getTime();
}
