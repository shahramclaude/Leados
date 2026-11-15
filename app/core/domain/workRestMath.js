/**
 * app/core/domain/workRestMath.js — the exact interval kernel of the Work/Rest
 * Recovery Ledger (ADR-0209). Pure: whole minutes since the Unix epoch in,
 * whole minutes out. No clock, no zone, no person, no state.
 *
 * WHAT IT DECIDES. Given one person's recorded work intervals across every
 * reporting line, the declared thresholds, the stretches every line attested,
 * and a horizon:
 *
 *   - the SPELLS of work (intervals that touch or overlap are one spell);
 *   - the RESTS between them, each marked proven or not by the attestations;
 *   - every provable CONFLICT, with the exact minute it becomes one;
 *   - why a clearance is withheld when nothing is breached.
 *
 * MONOTONICITY is the property the whole design leans on. Adding an interval
 * to a record can only shorten a rest, lengthen a spell, raise a windowed total
 * or split a long rest. So every conflict found on a partial record holds on
 * the complete one — and is asserted without waiting for coverage — while a
 * clearance needs the record to be attested complete.
 */

const byStart = (a, b) => a.s - b.s || a.e - b.e || String(a.id).localeCompare(String(b.id));

/** Keep only well-formed intervals `{ id, s, e, line }` with `e > s`, sorted. */
export function cleanIntervals(intervals) {
  return (Array.isArray(intervals) ? intervals : [])
    .filter((row) => row && Number.isInteger(row.s) && Number.isInteger(row.e) && row.e > row.s)
    .map((row) => ({ id: String(row.id), s: row.s, e: row.e, line: row.line ?? null }))
    .sort(byStart);
}

/**
 * Merge sorted intervals into spells. Intervals that TOUCH (one ends on the
 * minute the next begins) are one spell: zero minutes off is not a rest.
 */
export function mergeSpells(sorted) {
  const spells = [];
  for (const row of sorted) {
    const last = spells[spells.length - 1];
    if (last && row.s <= last.e) {
      if (row.e > last.e) last.e = row.e;
      last.ids.push(row.id);
      if (!last.lines.includes(row.line)) last.lines.push(row.line);
    } else {
      spells.push({ s: row.s, e: row.e, ids: [row.id], lines: [row.line] });
    }
  }
  return spells;
}

/** Every pair of intervals that share at least one minute. Bounded by `limit`. */
export function findOverlaps(sorted, limit = 200) {
  const out = [];
  for (let i = 0; i < sorted.length && out.length < limit; i += 1) {
    for (let j = i + 1; j < sorted.length && sorted[j].s < sorted[i].e && out.length < limit; j += 1) {
      const s = Math.max(sorted[i].s, sorted[j].s);
      const e = Math.min(sorted[i].e, sorted[j].e);
      if (e > s) out.push({ a: sorted[i], b: sorted[j], s, e, minutes: e - s });
    }
  }
  return out;
}

/** Merge `[from, to)` ranges into disjoint sorted ranges. */
export function mergeRanges(ranges) {
  const sorted = (Array.isArray(ranges) ? ranges : [])
    .filter((r) => r && Number.isFinite(r.from) && Number.isFinite(r.to) && r.to > r.from)
    .map((r) => ({ from: r.from, to: r.to }))
    .sort((a, b) => a.from - b.from || a.to - b.to);
  const out = [];
  for (const range of sorted) {
    const last = out[out.length - 1];
    if (last && range.from <= last.to) { if (range.to > last.to) last.to = range.to; } else out.push(range);
  }
  return out;
}

/** The stretches present in EVERY one of several disjoint sorted range lists. */
export function intersectRangeLists(lists) {
  if (!Array.isArray(lists) || !lists.length) return [];
  let current = mergeRanges(lists[0]);
  for (let k = 1; k < lists.length; k += 1) {
    const other = mergeRanges(lists[k]);
    const next = [];
    let i = 0;
    let j = 0;
    while (i < current.length && j < other.length) {
      const from = Math.max(current[i].from, other[j].from);
      const to = Math.min(current[i].to, other[j].to);
      if (to > from) next.push({ from, to });
      if (current[i].to < other[j].to) i += 1; else j += 1;
    }
    current = next;
  }
  return current;
}

/** Whether `[from, to]` lies wholly inside one of the disjoint sorted ranges. */
export function rangeCovered(ranges, from, to) {
  for (const range of ranges || []) {
    if (range.from <= from && range.to >= to) return true;
    if (range.from > from) return false;
  }
  return false;
}

/** Prefix sums over disjoint sorted spells, for exact windowed totals. */
function workIndex(spells) {
  const cumulative = [0];
  for (const spell of spells) cumulative.push(cumulative[cumulative.length - 1] + (spell.e - spell.s));
  /** Union work inside (−∞, t]. */
  const before = (t) => {
    let lo = 0;
    let hi = spells.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (spells[mid].s < t) lo = mid + 1; else hi = mid;
    }
    // `lo` spells start strictly before t; all but possibly the last are wholly before it.
    if (!lo) return 0;
    const last = spells[lo - 1];
    return cumulative[lo - 1] + Math.min(last.e, t) - last.s;
  };
  return { before, within: (from, to) => (to > from ? before(to) - before(from) : 0) };
}

/** Union work inside `[from, to]` for a list of sorted intervals (overlaps counted once). */
export function workWithin(sorted, from, to) {
  return workIndex(mergeSpells(sorted)).within(from, to);
}

/**
 * The whole evaluation for one person.
 *
 *   intervals  [{ id, s, e, line }]   recorded work, any order, any line
 *   policy     { minRestMin, maxSpellMin, longRestMin, longRestWithinMin,
 *                workCapMin, workCapWindowMin } — each null when undeclared;
 *              `null` for the whole policy when none governs
 *   coverage   disjoint sorted `[from, to)` stretches EVERY line attested
 *   horizon    { from, to } — findings are reported where their decisive
 *              minute falls inside it; a clearance is about exactly this stretch
 */
export function evaluateWorkRest({ intervals, policy = null, coverage = [], horizon }) {
  const sorted = cleanIntervals(intervals);
  const spells = mergeSpells(sorted);
  const index = workIndex(spells);
  const from = horizon.from;
  const to = horizon.to;
  const inHorizon = (at) => at >= from && at <= to;
  const byId = new Map(sorted.map((row) => [row.id, row]));
  const linesOf = (ids) => [...new Set(ids.map((id) => byId.get(id)?.line ?? null))];
  const findings = [];

  /* Rests: the stretches between consecutive spells. */
  const rests = [];
  for (let k = 0; k + 1 < spells.length; k += 1) {
    const rest = { from: spells[k].e, to: spells[k + 1].s, minutes: spells[k + 1].s - spells[k].e, afterSpell: k };
    rest.proven = rangeCovered(coverage, rest.from, rest.to);
    rests.push(rest);
  }

  /* 1. Double-booked — needs no threshold. Decisive minute: the overlap begins. */
  for (const overlap of findOverlaps(sorted)) {
    if (!inHorizon(overlap.s)) continue;
    findings.push({
      kind: 'double-booked', at: overlap.s, measure: overlap.minutes, limit: 0, excess: overlap.minutes,
      ids: [overlap.a.id, overlap.b.id], lines: linesOf([overlap.a.id, overlap.b.id]), from: overlap.s, to: overlap.e,
    });
  }

  const tested = { minRest: false, maxSpell: false, longRest: false, workCap: false };
  const unproven = [];
  const p = policy || {};

  /* 2. Rest too short. Decisive minute: the next spell begins. */
  if (Number.isInteger(p.minRestMin)) {
    tested.minRest = true;
    for (const rest of rests) {
      if (rest.minutes >= p.minRestMin || !inHorizon(rest.to)) continue;
      const earlier = spells[rest.afterSpell];
      const later = spells[rest.afterSpell + 1];
      // The two shifts that make the gap: the one that ends last, the one that starts first.
      const endsLast = earlier.ids.map((id) => byId.get(id)).reduce((best, row) => (!best || row.e > best.e ? row : best), null);
      const startsFirst = later.ids.map((id) => byId.get(id)).reduce((best, row) => (!best || row.s < best.s ? row : best), null);
      findings.push({
        kind: 'short-rest', at: rest.to, measure: rest.minutes, limit: p.minRestMin, excess: p.minRestMin - rest.minutes,
        ids: [endsLast.id, startsFirst.id], lines: linesOf([endsLast.id, startsFirst.id]), from: rest.from, to: rest.to,
        earliestStart: rest.from + p.minRestMin, latestEnd: rest.to - p.minRestMin,
      });
    }
  }

  /* 3. Spell too long. Decisive minute: the spell passes the maximum. */
  if (Number.isInteger(p.maxSpellMin)) {
    tested.maxSpell = true;
    for (const spell of spells) {
      const length = spell.e - spell.s;
      const at = spell.s + p.maxSpellMin;
      if (length <= p.maxSpellMin || !inHorizon(at)) continue;
      findings.push({
        kind: 'long-spell', at, measure: length, limit: p.maxSpellMin, excess: length - p.maxSpellMin,
        ids: [...spell.ids], lines: [...spell.lines], from: spell.s, to: spell.e,
      });
    }
  }

  /* 4. Long rest overdue. Decisive minute: the deadline for it to begin passes. */
  if (Number.isInteger(p.longRestMin) && Number.isInteger(p.longRestWithinMin)) {
    tested.longRest = true;
    if (spells.length) {
      // The most favourable anchor: a qualifying rest ended exactly as the first recorded spell began.
      let previousEnd = spells[0].s;
      let observed = 0;
      const check = (nextStart) => {
        const deadline = previousEnd + p.longRestWithinMin;
        if (nextStart > deadline && inHorizon(deadline)) {
          const ids = sorted.filter((row) => row.s >= previousEnd && row.s < nextStart).map((row) => row.id);
          findings.push({
            kind: 'long-rest-overdue', at: deadline, measure: nextStart - previousEnd, limit: p.longRestWithinMin,
            excess: nextStart - deadline, ids, lines: linesOf(ids), from: previousEnd, to: nextStart, anchor: observed ? 'observed' : 'assumed',
          });
        }
      };
      for (const rest of rests) {
        if (rest.minutes < p.longRestMin) continue;
        check(rest.from);
        previousEnd = rest.to;
        observed += 1;
      }
      // After the last spell the record is open: the next long rest can begin when that spell ends.
      check(spells[spells.length - 1].e);
      if (!observed) unproven.push('no-long-rest-on-record');
    }
  }

  /* 5. Over the rolling cap. The trailing total only rises inside a spell, so
        its maximum over every window is reached at some spell's end. */
  if (Number.isInteger(p.workCapMin) && Number.isInteger(p.workCapWindowMin)) {
    tested.workCap = true;
    const W = p.workCapWindowMin;
    const trailing = (t) => index.within(t - W, t);
    for (const spell of spells) {
      const peak = trailing(spell.e);
      if (peak <= p.workCapMin) continue;
      let at = spell.s;
      if (trailing(spell.s) <= p.workCapMin) {
        let lo = spell.s;      // trailing(lo) ≤ cap
        let hi = spell.e;      // trailing(hi) > cap
        while (hi - lo > 1) {
          const mid = lo + Math.floor((hi - lo) / 2);
          if (trailing(mid) > p.workCapMin) hi = mid; else lo = mid;
        }
        at = hi;
      }
      if (!inHorizon(at)) continue;
      const ids = sorted.filter((row) => row.e > spell.e - W && row.s < spell.e).map((row) => row.id);
      findings.push({
        kind: 'work-cap', at, measure: peak, limit: p.workCapMin, excess: peak - p.workCapMin,
        ids, lines: linesOf(ids), from: spell.e - W, to: spell.e,
      });
    }
    if (to - from < W) unproven.push('window-exceeds-horizon');
  }

  const coverageComplete = rangeCovered(coverage, from, to);
  if (!coverageComplete) unproven.unshift('coverage-gap');
  if (policy && !Object.values(tested).some(Boolean)) unproven.push('no-threshold-tested');

  findings.sort((a, b) => a.at - b.at || a.kind.localeCompare(b.kind) || String(a.ids[0]).localeCompare(String(b.ids[0])));

  /* Figures inside the horizon, for the row. */
  const touching = spells.filter((spell) => spell.e > from && spell.s < to);
  const restsInside = rests.filter((rest) => rest.to > from && rest.from < to);
  return {
    spells,
    rests,
    findings,
    tested,
    unproven: [...new Set(unproven)],
    coverageComplete,
    workMinutes: index.within(from, to),
    longestSpellMinutes: touching.length ? Math.max(...touching.map((spell) => spell.e - spell.s)) : null,
    shortestRestMinutes: restsInside.length ? Math.min(...restsInside.map((rest) => rest.minutes)) : null,
    spellsInHorizon: touching.length,
  };
}
