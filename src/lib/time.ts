import type { Locale } from "@/lib/i18n";

// Week-start convention is a locale fact, not a UI preference: en-US weeks
// start Sunday, da-DK (and most of Europe) start Monday. Anything that lays
// out a week grid (e.g. the "Now" briefing calendar strip) must call this.
export function weekStartsOn(locale: Locale): 0 | 1 {
  return locale === "da-DK" ? 1 : 0;
}

export function startOfWeek(date: Date, locale: Locale): Date {
  const d = new Date(date);
  const day = d.getDay();
  const start = weekStartsOn(locale);
  const diff = (day - start + 7) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function weekdayLabels(locale: Locale): string[] {
  const start = weekStartsOn(locale);
  const base = new Date(Date.UTC(2023, 0, 1)); // a Sunday
  const labels: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() + ((start + i) % 7));
    labels.push(new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(d));
  }
  return labels;
}
