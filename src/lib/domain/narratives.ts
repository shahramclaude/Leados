// src/lib/domain/narratives.ts — the "message-catalog pattern in the
// engines" the Part 9 brief asks for: engine-generated text (briefing /
// finding narrative) never concatenates hard-coded English strings. Instead
// it returns a catalog KEY + PARAMS, or — when a translator function `t` is
// supplied — the fully rendered string in the caller's locale. This keeps
// the function pure/testable (no I18n runtime required to unit-test the
// *logic* of what gets said) while still being real i18n in production.

import type { Finding } from "@/db/schema";
import { resolveTerm } from "./terminology";

export interface NarrativeMessage {
  key: string;
  params: Record<string, string | number>;
}

export type Translate = (key: string, params?: Record<string, string | number>) => string;

/** One finding → a one-line engine narrative, plain-language-aware. */
export function findingNarrative(
  finding: Pick<Finding, "title" | "team" | "severity" | "domain">,
  terminology: Record<string, string>,
  plainLanguage: boolean,
): NarrativeMessage {
  const team = resolveTerm("team", terminology);
  const key = plainLanguage ? "narrative.finding.plain" : "narrative.finding.standard";
  return {
    key,
    params: {
      title: finding.title,
      team: finding.team,
      teamLabel: team,
      severity: finding.severity,
      domain: finding.domain,
    },
  };
}

/** A whole-org executive briefing rollup, plain-language-aware. */
export function briefingNarrative(
  openCount: number,
  criticalCount: number,
  terminology: Record<string, string>,
  plainLanguage: boolean,
): NarrativeMessage {
  const findingLabel = resolveTerm("finding", terminology);
  const key = plainLanguage ? "narrative.briefing.plain" : "narrative.briefing.standard";
  return {
    key,
    params: { openCount, criticalCount, findingLabel },
  };
}

export function renderNarrative(message: NarrativeMessage, t: Translate): string {
  return t(message.key, message.params);
}
