// A tiny, dependency-free 5-field cron matcher (minute hour dom month dow).
// Supports exact numbers, "*", and comma lists — enough for the mission's
// "Monday briefing cadence" trigger without pulling in a cron-parser package.
export interface CronSpec {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
}

export function parseCron(expr: string): CronSpec {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`Invalid cron expression: "${expr}"`);
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  return { minute, hour, dayOfMonth, month, dayOfWeek };
}

function fieldMatches(field: string, value: number): boolean {
  if (field === "*") return true;
  return field.split(",").some((part) => Number(part) === value);
}

export function cronMatches(expr: string, date: Date): boolean {
  const spec = parseCron(expr);
  return (
    fieldMatches(spec.minute, date.getUTCMinutes()) &&
    fieldMatches(spec.hour, date.getUTCHours()) &&
    fieldMatches(spec.dayOfMonth, date.getUTCDate()) &&
    fieldMatches(spec.month, date.getUTCMonth() + 1) &&
    fieldMatches(spec.dayOfWeek, date.getUTCDay())
  );
}

/** Returns the next minute-aligned Date (after `from`) at which `expr` matches. */
export function nextCronRun(expr: string, from: Date = new Date()): Date {
  const candidate = new Date(from.getTime());
  candidate.setUTCSeconds(0, 0);
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  for (let i = 0; i < 60 * 24 * 366; i++) {
    if (cronMatches(expr, candidate)) return candidate;
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  }
  throw new Error(`No match found for cron expression "${expr}" within a year`);
}

// "Monday briefing cadence": 09:00 UTC every Monday.
export const MONDAY_BRIEFING_CRON = "0 9 * * 1";
