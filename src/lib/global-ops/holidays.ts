// LEADOS — Part 37: holiday/locale-aware cadence helper.
//
// Scope limitation (documented honestly, see PHASE 5 #3): this is a small, fixed-date holiday
// table for a handful of regions, intended to demonstrate cadence-shifting for recurring rituals
// (Part 25) — it is NOT an exhaustive, legally-authoritative public-holiday calendar (it omits
// lunar/moveable holidays such as Easter, Lunar New Year exact dates in most years, Diwali,
// Eid, etc.). Treat this as a seam to swap in a real holiday data provider later.

export interface Holiday {
  date: string; // ISO date
  name: string;
}

const FIXED_HOLIDAYS: Record<string, (year: number) => Holiday[]> = {
  us: (y) => [
    { date: `${y}-01-01`, name: "New Year's Day" },
    { date: `${y}-07-04`, name: "Independence Day" },
    { date: `${y}-11-11`, name: "Veterans Day" },
    { date: `${y}-12-25`, name: "Christmas Day" },
  ],
  eu: (y) => [
    { date: `${y}-01-01`, name: "New Year's Day" },
    { date: `${y}-05-01`, name: "Labour Day" },
    { date: `${y}-12-25`, name: "Christmas Day" },
    { date: `${y}-12-26`, name: "St. Stephen's Day" },
  ],
  uk: (y) => [
    { date: `${y}-01-01`, name: "New Year's Day" },
    { date: `${y}-12-25`, name: "Christmas Day" },
    { date: `${y}-12-26`, name: "Boxing Day" },
  ],
  apac: (y) => [
    { date: `${y}-01-01`, name: "New Year's Day" },
    { date: `${y}-12-25`, name: "Christmas Day" },
  ],
};

export function holidaysForRegion(region: string, year: number): Holiday[] {
  const fn = FIXED_HOLIDAYS[region.toLowerCase()];
  return fn ? fn(year) : [{ date: `${year}-01-01`, name: "New Year's Day" }];
}

function isWeekendUTC(iso: string): boolean {
  const [y, m, d] = iso.split("-").map((x) => Number.parseInt(x, 10));
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 || day === 6;
}

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map((x) => Number.parseInt(x, 10));
  const dt = new Date(Date.UTC(y, m - 1, d) + days * 86_400_000);
  return dt.toISOString().slice(0, 10);
}

/** Shifts `dateIso` forward to the next date that is neither a weekend nor a listed holiday for
 * the region — used for cadence-shifting recurring rituals (Part 25) onto a valid business day
 * per region. */
export function nextBusinessDay(dateIso: string, region: string, year: number): string {
  const holidaySet = new Set(holidaysForRegion(region, year).map((h) => h.date));
  let cursor = dateIso;
  // Bounded loop: at most 10 shifts, which comfortably covers consecutive weekend+holiday runs.
  for (let i = 0; i < 10; i += 1) {
    if (!isWeekendUTC(cursor) && !holidaySet.has(cursor)) return cursor;
    cursor = addDaysISO(cursor, 1);
  }
  return cursor;
}
