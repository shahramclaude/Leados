export { FixedClock, SystemClock, systemClock } from "@/lib/clock";
export type { Clock } from "@/lib/clock";

/** A clock frozen at a fixed, readable instant for deterministic tests. */
export const FROZEN_INSTANT = new Date("2026-01-15T09:00:00.000Z");
