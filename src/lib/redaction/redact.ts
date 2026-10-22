// Redaction engine with consent enforcement.
//
// Applied twice, defense-in-depth style: once at ingestion time (segments
// from non-consenting speakers are flagged `redacted` and their raw text is
// never shown in generated-artifact source material), and again defensively
// at artifact-generation time (even if an ingestion bug let a segment through
// unflagged, generation re-checks current consent state before using it).
import type { ConsentStatus } from "@/lib/consent/consent";

export interface RedactableSegment {
  id: string;
  speakerParticipantId: string | null;
  speakerName: string;
  text: string;
  consentAtCapture: ConsentStatus;
}

export const REDACTED_PLACEHOLDER = "[redacted — speaker did not consent to recording]";

/** Decide, at capture time, whether a segment should be stored as redacted. */
export function shouldRedactAtCapture(consentAtCapture: ConsentStatus): boolean {
  // Only explicit opt-in counts as consenting. `pending` is NOT consent.
  return consentAtCapture !== "opted_in";
}

/**
 * Second gate used right before any generation step (summary / decision /
 * action drafting) — re-verifies against the *current* consent map, not just
 * the snapshot taken at capture time, so a later opt-out also scrubs past
 * segments from future artifact generation.
 */
export function filterConsentedSegments<T extends RedactableSegment>(
  segments: T[],
  currentConsent: Map<string, ConsentStatus>,
): { usable: T[]; redactedCount: number } {
  let redactedCount = 0;
  const usable = segments.filter((seg) => {
    const current = seg.speakerParticipantId ? currentConsent.get(seg.speakerParticipantId) : undefined;
    const consenting = current === "opted_in" || (current === undefined && seg.consentAtCapture === "opted_in");
    if (!consenting) redactedCount += 1;
    return consenting;
  });
  return { usable, redactedCount };
}

/** View-safe transcript rendering: never exposes raw text for redacted rows. */
export function renderSegmentForDisplay(seg: RedactableSegment, showRedactedPlaceholder = true): string {
  if (seg.consentAtCapture === "opted_in") return seg.text;
  return showRedactedPlaceholder ? REDACTED_PLACEHOLDER : "";
}
