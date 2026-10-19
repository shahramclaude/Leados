// =============================================================================
// LEADOS kernel — minimal 5-field cron matcher
// =============================================================================
// Supports the standard "minute hour day-of-month month day-of-week" syntax
// with `*`, exact numbers, `*/N` steps and comma lists — enough to express
// "every 30 minutes", "every 10 minutes", and "Monday at 08:00" without
// pulling in a dependency.

type FieldMatcher = (value: number) => boolean;

function parseField(field: string, max: number): FieldMatcher {
  if (field === "*") return () => true;

  const matchers: FieldMatcher[] = field.split(",").map((part) => {
    const stepMatch = part.match(/^\*\/(\d+)$/);
    if (stepMatch) {
      const step = Number(stepMatch[1]);
      return (value: number) => value % step === 0;
    }
    const rangeMatch = part.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const lo = Number(rangeMatch[1]);
      const hi = Number(rangeMatch[2]);
      return (value: number) => value >= lo && value <= hi;
    }
    const exact = Number(part);
    if (!Number.isFinite(exact) || exact < 0 || exact > max) {
      throw new Error(`Invalid cron field segment "${part}"`);
    }
    return (value: number) => value === exact;
  });

  return (value: number) => matchers.some((m) => m(value));
}

export interface CronFields {
  minute: FieldMatcher;
  hour: FieldMatcher;
  dayOfMonth: FieldMatcher;
  month: FieldMatcher;
  dayOfWeek: FieldMatcher;
}

export function parseCron(expr: string): CronFields {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Cron expression must have 5 fields, got "${expr}"`);
  }
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  return {
    minute: parseField(minute, 59),
    hour: parseField(hour, 23),
    dayOfMonth: parseField(dayOfMonth, 31),
    month: parseField(month, 12),
    dayOfWeek: parseField(dayOfWeek, 6),
  };
}

export function cronMatches(expr: string, at: Date): boolean {
  const fields = parseCron(expr);
  return (
    fields.minute(at.getUTCMinutes()) &&
    fields.hour(at.getUTCHours()) &&
    fields.dayOfMonth(at.getUTCDate()) &&
    fields.month(at.getUTCMonth() + 1) &&
    fields.dayOfWeek(at.getUTCDay())
  );
}

/** Scans forward minute-by-minute (capped) to find the next matching minute
 * at or after `after`. Fine for our cadences (minutes-to-week granularity). */
export function nextCronRun(expr: string, after: Date, maxMinutesAhead = 60 * 24 * 8): Date {
  const start = new Date(after.getTime());
  start.setUTCSeconds(0, 0);
  start.setUTCMinutes(start.getUTCMinutes() + 1);

  for (let i = 0; i < maxMinutesAhead; i++) {
    const candidate = new Date(start.getTime() + i * 60_000);
    if (cronMatches(expr, candidate)) return candidate;
  }
  throw new Error(`No match for cron "${expr}" within ${maxMinutesAhead} minutes`);
}
