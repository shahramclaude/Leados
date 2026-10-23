// LEADOS — src/lib/cognitiveLoad.ts dependency stand-in (Part 14 contract)
//
// Honesty note: see temporal.ts header. This computes fragmentation
// metrics (context switches/day, meeting-burst distribution) from raw
// calendar + interaction events — it does not infer "focus" from
// unrelated signals (keystrokes, app usage, etc.), consistent with the
// Part 09 privacy posture: only calendar/meeting boundary events feed
// this model.
//
// Literature grounding:
//  - Gonzalez & Mark (2004), "Constant, Constant, Multi-tasking Craziness",
//    CHI '04 — knowledge workers switch tasks every ~3 minutes on average
//    in fragmented days; used only as a qualitative sanity bound.
//  - Mark, Gonzalez & Harris (2005), "No Task Left Behind?" — measured
//    task-switching frequency by instrumented observation.

import type { Chronotype } from "./circadian";
import { isHighEnergyWindow } from "./circadian";

export interface MeetingBlock {
  startMinute: number; // minutes from local midnight
  endMinute: number;
}

export interface FragmentationResult {
  meetingCount: number;
  totalMeetingMinutes: number;
  contextSwitches: number; // gaps between meetings small enough to not count as real recovery
  longestFocusBlockMinutes: number;
  deepWorkPreservedMinutes: number; // minutes of >=90min uninterrupted blocks inside work day
  burstScore: number; // 0..1, higher = more clustered/bursty meeting pattern
}

const MIN_FOCUS_BLOCK_MINUTES = 90;
const SWITCH_GAP_THRESHOLD_MINUTES = 20; // gaps shorter than this don't allow real recovery

export function analyzeFragmentation(
  meetings: MeetingBlock[],
  workDayStartMinute: number,
  workDayEndMinute: number,
): FragmentationResult {
  const sorted = [...meetings].sort((a, b) => a.startMinute - b.startMinute);
  const totalMeetingMinutes = sorted.reduce(
    (acc, m) => acc + Math.max(0, m.endMinute - m.startMinute),
    0,
  );

  let contextSwitches = Math.max(0, sorted.length - 0); // each meeting boundary is a potential switch
  // adjust: back-to-back or near-back-to-back meetings count as switches;
  // meetings separated by >= SWITCH_GAP_THRESHOLD_MINUTES still count once
  // for entering + once for leaving a focus state, so we keep it simple:
  // one switch per meeting start when preceded by any activity same day.
  if (sorted.length > 0) {
    contextSwitches = sorted.length; // entering each meeting is a switch out of whatever came before
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i].startMinute - sorted[i - 1].endMinute;
      if (gap < SWITCH_GAP_THRESHOLD_MINUTES) {
        contextSwitches += 1; // tight back-to-back adds an extra switching penalty
      }
    }
  }

  const freeBlocks = computeFreeBlocks(sorted, workDayStartMinute, workDayEndMinute);
  const longestFocusBlockMinutes = freeBlocks.reduce(
    (max, b) => Math.max(max, b.endMinute - b.startMinute),
    0,
  );
  const deepWorkPreservedMinutes = freeBlocks
    .filter((b) => b.endMinute - b.startMinute >= MIN_FOCUS_BLOCK_MINUTES)
    .reduce((acc, b) => acc + (b.endMinute - b.startMinute), 0);

  const burstScore = computeBurstScore(sorted);

  return {
    meetingCount: sorted.length,
    totalMeetingMinutes,
    contextSwitches,
    longestFocusBlockMinutes,
    deepWorkPreservedMinutes,
    burstScore,
  };
}

function computeFreeBlocks(
  sorted: MeetingBlock[],
  workDayStartMinute: number,
  workDayEndMinute: number,
): MeetingBlock[] {
  const blocks: MeetingBlock[] = [];
  let cursor = workDayStartMinute;
  for (const m of sorted) {
    const start = Math.max(m.startMinute, workDayStartMinute);
    const end = Math.min(m.endMinute, workDayEndMinute);
    if (start > cursor) blocks.push({ startMinute: cursor, endMinute: start });
    cursor = Math.max(cursor, end);
  }
  if (cursor < workDayEndMinute) blocks.push({ startMinute: cursor, endMinute: workDayEndMinute });
  return blocks;
}

/** Higher score = meetings cluster into dense bursts rather than spreading evenly. */
function computeBurstScore(sorted: MeetingBlock[]): number {
  if (sorted.length < 2) return 0;
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push(Math.max(0, sorted[i].startMinute - sorted[i - 1].endMinute));
  }
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  if (mean === 0) return 1;
  const variance = gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length;
  const coefficientOfVariation = Math.sqrt(variance) / mean;
  // Squash into 0..1 — higher CoV (uneven gaps => bursts separated by big
  // open stretches, OR everything jammed together) maps toward 1.
  return Math.min(1, coefficientOfVariation / 2);
}

/** Recommends keeping/breaking a candidate meeting slot based on chronotype energy. */
export function favorsDeepWork(
  startMinute: number,
  endMinute: number,
  chronotype: Chronotype,
): boolean {
  return isHighEnergyWindow(startMinute, endMinute, chronotype);
}
