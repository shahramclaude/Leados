// Cognitive-load awareness: never inject a non-critical interrupt into an
// active deep-work block IF a signal for one exists. This sandbox has no
// keystroke/calendar/IDE telemetry integration, so the only signal available
// is an explicit client-reported "focus mode" flag plus meeting state from
// circadian.ts. This is intentionally a thin, honest seam — see
// docs/REALTIME.md "What we did not build" for the list of signals a real
// deployment would add (calendar busy blocks, IDE/editor activity, do-not-
// disturb OS state).

import { isInMeeting, type CalendarSignal } from "@/lib/circadian";

export interface CognitiveLoadSignals {
  focusModeUntil?: Date | null; // user explicitly started a focus block
  calendar?: CalendarSignal | null;
}

export interface CognitiveLoadResult {
  inDeepWork: boolean;
  reason: string;
}

// Degrades gracefully: with no signals at all, always reports "not in deep
// work" rather than guessing, so the feature never silently blocks delivery
// when it has no evidence to act on.
export function assessCognitiveLoad(
  signals: CognitiveLoadSignals | null | undefined,
  now: Date = new Date(),
): CognitiveLoadResult {
  if (!signals) return { inDeepWork: false, reason: "no cognitive-load signal available" };

  if (signals.focusModeUntil && now.getTime() < signals.focusModeUntil.getTime()) {
    return { inDeepWork: true, reason: "user-declared focus block active" };
  }

  if (isInMeeting(signals.calendar, now)) {
    return { inDeepWork: true, reason: "calendar shows an active meeting" };
  }

  return { inDeepWork: false, reason: "no active focus block or meeting signal" };
}
