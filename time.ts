export const DAY = 86400000;

export function daysBetween(a: number, b: number): number {
  return Math.round((b - a) / DAY);
}

export function isWeekend(ms: number): boolean {
  const d = new Date(ms).getUTCDay();
  return d === 0 || d === 6;
}

export function fmt(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function weekdayName(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

export function addDays(ms: number, n: number): number {
  return ms + n * DAY;
}

export function startOfWeek(ms: number): number {
  const d = new Date(ms);
  const day = d.getUTCDay(); // 0 Sun..6 Sat
  const diff = (day === 0 ? -6 : 1) - day; // back to Monday
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff);
}

export function quarterOf(ms: number): string {
  const d = new Date(ms);
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${d.getUTCFullYear()}-Q${q}`;
}
