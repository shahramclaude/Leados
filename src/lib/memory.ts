// memory.ts — a small two-layer "memory" over the flat event log.
// ORIGINAL to this build; "multi-layer memory architecture" in the pasted
// pt-K brief was not something this session could verify existed anywhere
// in wbweve/Leados's actual tree (no js/memory_arch.js file was found —
// see AI-SESSION-LOG.md). This is a from-scratch, disclosed REINTERPRETATION:
//   - short-term: the current in-memory session's events only
//   - long-term: everything persisted in localStorage across sessions
// "_computeTemporalPatterns" derives the hour-of-day with the most logged
// activity — simple frequency counting, not a learned model.

import type { AppEvent } from "./types";

export interface TemporalPattern {
  peakHour: number; // 0..23
  countsByHour: number[]; // length 24
}

export function computeTemporalPatterns(events: AppEvent[]): TemporalPattern {
  const countsByHour = new Array(24).fill(0) as number[];
  for (const e of events) {
    const h = new Date(e.ts).getHours();
    if (h >= 0 && h < 24) countsByHour[h]++;
  }
  let peakHour = 0;
  for (let h = 1; h < 24; h++) if (countsByHour[h] > countsByHour[peakHour]) peakHour = h;
  return { peakHour, countsByHour };
}

export function splitLayers(allEvents: AppEvent[], sessionStartedAt: string) {
  const start = new Date(sessionStartedAt).getTime();
  const shortTerm = allEvents.filter((e) => new Date(e.ts).getTime() >= start);
  const longTerm = allEvents; // everything ever persisted
  return { shortTerm, longTerm };
}
