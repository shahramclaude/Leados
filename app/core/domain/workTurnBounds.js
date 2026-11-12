/**
 * Partial identification of a pool's next share-weighted turn.
 *
 * A member has a lower count of classified, placed asks and an upper count
 * after every unresolved ask that could belong to this pool is included. For
 * THIS pool each unresolved ask may independently resolve inside or outside
 * the count. Bounds from different pools are not additive: the same unplaced
 * ask can be possible on either line, but cannot be charged to both.
 *
 * A member is possible when its lower ratio is <= every other upper ratio; it
 * is certain to be among the minima when its upper ratio is <= every other
 * lower ratio. The exact set of minima is stable iff those sets are equal.
 * No rounding, inference about effort, capacity, or consent is involved.
 */

// Counts originate in JS arrays, but reject values whose cross-products could
// exceed the exact integer range. Shares are the matrix engine's 1..100 units.
const MAX_COUNT = Math.floor(Number.MAX_SAFE_INTEGER / 100);
const compare = (aCount, aShare, bCount, bShare) => aCount * bShare - bCount * aShare;

function smallestTwo(rows, field) {
  let first = -1;
  let second = -1;
  for (let i = 0; i < rows.length; i += 1) {
    const before = (a, b) => compare(rows[a][field], rows[a].shareH, rows[b][field], rows[b].shareH) < 0;
    if (first < 0 || before(i, first)) { second = first; first = i; }
    else if (second < 0 || before(i, second)) second = i;
  }
  return { first, second };
}

/** O(n) time, O(n) result space; returns null on unreadable inputs. */
export function rankWorkTurnBounds(members) {
  if (!Array.isArray(members) || members.length < 2) return null;
  const ids = new Set();
  for (const row of members) {
    if (!row || typeof row.personId !== 'string' || !row.personId || ids.has(row.personId)
      || !Number.isSafeInteger(row.shareH) || row.shareH < 1 || row.shareH > 100
      || !Number.isSafeInteger(row.lowerN) || !Number.isSafeInteger(row.upperN)
      || row.lowerN < 0 || row.upperN < row.lowerN || row.upperN > MAX_COUNT) return null;
    ids.add(row.personId);
  }
  const lows = smallestTwo(members, 'lowerN');
  const highs = smallestTwo(members, 'upperN');
  const possible = [];
  const certain = [];
  members.forEach((row, i) => {
    const otherHigh = members[highs.first === i ? highs.second : highs.first];
    const otherLow = members[lows.first === i ? lows.second : lows.first];
    if (compare(row.lowerN, row.shareH, otherHigh.upperN, otherHigh.shareH) <= 0) possible.push(row.personId);
    if (compare(row.upperN, row.shareH, otherLow.lowerN, otherLow.shareH) <= 0) certain.push(row.personId);
  });
  // Certain is a subset of possible. Equality is required, rather than merely
  // one certain candidate: an additional tie might appear as facts resolve.
  return { possible, certain, stable: possible.length === certain.length };
}
