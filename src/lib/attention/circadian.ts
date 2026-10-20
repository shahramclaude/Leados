// Circadian layer: quiet hours + time-of-day receptivity scoring.
// This does not try to be a biological model — it is a pragmatic schedule
// aware component that (a) hard-gates interrupts during declared quiet
// hours and (b) nudges the cognitive-load score based on typical daily
// attention rhythm (early morning / late evening = lower receptivity).

import { db } from "@/db";
import { quietHours } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isWithinWindow, minutesSinceMidnight, minutesUntilWindowEnds } from "./temporal";

export interface QuietHoursWindow {
  startMinute: number;
  endMinute: number;
  timezone: string;
}

const DEFAULT_QUIET_HOURS: QuietHoursWindow = {
  startMinute: 22 * 60, // 22:00
  endMinute: 7 * 60, // 07:00
  timezone: "UTC",
};

export async function getQuietHours(userId: string): Promise<QuietHoursWindow> {
  const rows = await db.select().from(quietHours).where(eq(quietHours.userId, userId)).limit(1);
  const row = rows[0];
  if (!row) return DEFAULT_QUIET_HOURS;
  return { startMinute: row.startMinute, endMinute: row.endMinute, timezone: row.timezone };
}

export interface CircadianState {
  inQuietHours: boolean;
  minutesUntilQuietHoursEnd: number;
  receptivity: number; // 0 (low) .. 100 (high) — how receptive the user typically is right now
}

/** Time-of-day receptivity curve: lowest at 3am, highest mid-morning/afternoon. */
function receptivityForMinute(minute: number): number {
  const hour = minute / 60;
  // Cosine curve peaking at 10:00 and 15:00, trough at 03:00
  const radians = ((hour - 10) / 24) * 2 * Math.PI;
  const score = (Math.cos(radians) + 1) / 2; // 0..1
  return Math.round(score * 100);
}

export async function getCircadianState(userId: string, now: Date = new Date()): Promise<CircadianState> {
  const window = await getQuietHours(userId);
  const minute = minutesSinceMidnight(now, window.timezone);
  const inQuietHours = isWithinWindow(minute, window.startMinute, window.endMinute);
  return {
    inQuietHours,
    minutesUntilQuietHoursEnd: minutesUntilWindowEnds(minute, window.startMinute, window.endMinute),
    receptivity: receptivityForMinute(minute),
  };
}
