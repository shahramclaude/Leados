// LEADOS Part 14 — timezone-aware quiet hours ("circadian" guard).
import { db } from "@/db";
import { quietHours } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isWithinWindow, minuteOfDayInTz, minutesUntil } from "./temporal";

export interface QuietHoursConfig {
  timezone: string;
  startMinute: number;
  endMinute: number;
  enabled: boolean;
}

const DEFAULT_QUIET: QuietHoursConfig = {
  timezone: "UTC",
  startMinute: 22 * 60,
  endMinute: 7 * 60,
  enabled: true,
};

export async function getQuietHours(userId: string): Promise<QuietHoursConfig> {
  const [row] = await db.select().from(quietHours).where(eq(quietHours.userId, userId)).limit(1);
  if (!row) return DEFAULT_QUIET;
  return {
    timezone: row.timezone,
    startMinute: row.startMinute,
    endMinute: row.endMinute,
    enabled: row.enabled,
  };
}

export interface QuietHoursCheck {
  inQuietHours: boolean;
  minutesUntilEnd: number;
  minutesUntilStart: number;
  config: QuietHoursConfig;
}

export function evaluateQuietHours(at: Date, config: QuietHoursConfig): QuietHoursCheck {
  if (!config.enabled) {
    return { inQuietHours: false, minutesUntilEnd: 0, minutesUntilStart: Infinity, config };
  }
  const minute = minuteOfDayInTz(at, config.timezone);
  const inQuietHours = isWithinWindow(minute, config.startMinute, config.endMinute);
  return {
    inQuietHours,
    minutesUntilEnd: inQuietHours ? minutesUntil(minute, config.endMinute) : 0,
    minutesUntilStart: inQuietHours ? 0 : minutesUntil(minute, config.startMinute),
    config,
  };
}

export async function checkQuietHours(userId: string, at: Date = new Date()): Promise<QuietHoursCheck> {
  const config = await getQuietHours(userId);
  return evaluateQuietHours(at, config);
}
