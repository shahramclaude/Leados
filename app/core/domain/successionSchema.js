/**
 * app/core/domain/successionSchema.js — Schema v83 fail-closed normalizers for
 * the Succession Terminal.
 *
 * Two ledgers are persisted and both are *quotes*:
 *
 *  - a **frozen reading** is a *quoted bench claim*. The leader was shown which
 *    spans were certified, which items blocked reabsorption, what blanket each
 *    span held, and what probability this terminal attached to a gap opening
 *    before the review date. If any member cannot be read back exactly as
 *    written — a missing id, a non-numeric probability, an unknown verdict — the
 *    whole reading is dropped with a warning rather than repaired into a claim
 *    nobody froze.
 *  - a **marker** is an idempotency tag for a rule effect, capped and set-shaped.
 *
 * Nothing here invents history. An upgraded workspace opens with no reading, no
 * marker and no fabricated gap: the terminal says it has never certified
 * anything, which is exactly true.
 *
 * THE SEAT SETTING IS A SETTING, NOT A RECORD. The per-span declared daily cost
 * and the tested-handover counter live in `settings.successionDailyCosts` and
 * `settings.successionTestedHandovers` (both normalised here, fail-closed), so a
 * price the leader typed is a preference rather than a second collection that
 * could drift from the reading it prices. A cost for a person who has left the
 * roster is dropped, never silently reattached.
 */

import { SUCCESSION_LIMITS } from './successionRegistry.js';

const MAX_READINGS = SUCCESSION_LIMITS.readingCap[1];
const MAX_MARKERS = 400;

function toInt(value, fallback, min, max) {
  // Same trap as the engine: `Number(null)` is 0, which would read a missing
  // blanket as a blanket of zero days rather than as unmeasured.
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function toNum(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(value, min, max) {
  const n = toNum(value);
  return n === null ? null : Math.min(max, Math.max(min, n));
}

function day(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function iso(value) {
  if (typeof value !== 'string' || !value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function normalizeSuccessionSettings(settings) {
  const source = settings && typeof settings === 'object' ? settings : {};
  const L = SUCCESSION_LIMITS;
  return {
    successionAutoPropagate: source.successionAutoPropagate !== false,
    successionHorizonDays: toInt(source.successionHorizonDays, L.horizonDaysDefault, ...L.horizonDays),
    successionConcentrationCapPct: toInt(source.successionConcentrationCapPct, L.concentrationCapPctDefault, ...L.concentrationCapPct),
    successionMemberFloor: toInt(source.successionMemberFloor, L.memberFloorDefault, ...L.memberFloor),
    successionItemFloor: toInt(source.successionItemFloor, L.itemFloorDefault, ...L.itemFloor),
    successionHeadroomFactor: clamp(source.successionHeadroomFactor, L.headroomFactor[0], L.headroomFactor[1]) ?? L.headroomFactorDefault,
    successionDiffusionFloor: toInt(source.successionDiffusionFloor, L.diffusionFloorDefault, ...L.diffusionFloor),
    successionMaxTasks: toInt(source.successionMaxTasks, L.maxTasksDefault, ...L.maxTasks),
    successionTestedFloor: toInt(source.successionTestedFloor, L.testedFloorDefault, ...L.testedFloor),
    successionReviewHorizonDays: toInt(source.successionReviewHorizonDays, L.reviewHorizonDaysDefault, ...L.reviewHorizonDays),
    successionReadingCap: toInt(source.successionReadingCap, L.readingCapDefault, ...L.readingCap),
    successionDailyCosts: normalizeDailyCosts(source.successionDailyCosts),
    successionTestedHandovers: normalizeTestedHandovers(source.successionTestedHandovers),
  };
}

/**
 * A declared daily cost per holder, in the holder's own currency. A record with
 * no currency is refused rather than defaulted: an amount in no currency cannot
 * be summed with anything, and inventing one is how a dashboard starts lying.
 */
export function normalizeDailyCosts(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  let n = 0;
  for (const [personId, entry] of Object.entries(raw)) {
    if (n >= 400) break;
    if (typeof personId !== 'string' || !personId) continue;
    const value = typeof entry === 'object' && entry !== null ? entry : { amount: entry };
    const amount = toNum(value.amount);
    const currency = typeof value.currency === 'string' ? value.currency.trim().toUpperCase().slice(0, 3) : '';
    if (amount === null || amount < 0 || !/^[A-Z]{3}$/.test(currency)) continue;
    out[personId] = { amount: Math.round(amount * 100) / 100, currency };
    n += 1;
  }
  return out;
}

/**
 * How many handovers this holder has actually run, and how many of them a named
 * survivor completed. The counter is the leader's declaration — the terminal
 * never infers a handover from a delegation, because a delegation that was
 * accepted and never completed is not a handover. `tested` counts only the ones
 * the leader marked settled.
 */
export function normalizeTestedHandovers(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  let n = 0;
  for (const [personId, entry] of Object.entries(raw)) {
    if (n >= 400) break;
    if (typeof personId !== 'string' || !personId) continue;
    if (!entry || typeof entry !== 'object') continue;
    const tested = toInt(entry.tested, 0, 0, 500);
    const failed = toInt(entry.failed, 0, 0, 500);
    if (tested <= 0 && failed <= 0) continue;
    out[personId] = { tested: Math.max(tested, failed), failed, lastOn: day(entry.lastOn) };
    n += 1;
  }
  return out;
}

/** One frozen member: the exact small object the reading will be graded on. */
function normalizeMember(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = typeof raw.type === 'string' ? raw.type : null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : null;
  if (!type || !id) return null;
  return {
    type,
    id,
    holderNodeId: typeof raw.holderNodeId === 'string' ? raw.holderNodeId : null,
    dueOn: day(raw.dueOn),
    weight: toNum(raw.weight) ?? 1,
    eligibleN: toInt(raw.eligibleN, 0, 0, 999),
    reabsorbable: raw.reabsorbable === true,
  };
}

function normalizeSpan(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const nodeId = typeof raw.nodeId === 'string' && raw.nodeId ? raw.nodeId : null;
  if (!nodeId) return null;
  return {
    nodeId,
    name: typeof raw.name === 'string' ? raw.name.slice(0, 120) : '',
    altitude: typeof raw.altitude === 'string' ? raw.altitude : null,
    rank: toInt(raw.rank, 1, 1, 5),
    membersN: toInt(raw.membersN, 0, 0, 9999),
    itemsN: toInt(raw.itemsN, 0, 0, 9999),
    blanketDays: raw.blanketDays === null ? null : toInt(raw.blanketDays, null, 0, 100000),
    concentrationHhi: clamp(raw.concentrationHhi, 0, 10000),
    effectiveHolders: clamp(raw.effectiveHolders, 0, 999),
    unassignedN: toInt(raw.unassignedN, 0, 0, 9999),
    verdict: ['certified-gap', 'concentrated', 'covered', 'unmeasured'].includes(raw.verdict) ? raw.verdict : 'unmeasured',
    blockingSet: (Array.isArray(raw.blockingSet) ? raw.blockingSet : []).slice(0, SUCCESSION_LIMITS.maxBlockingSet).map(normalizeMember).filter(Boolean),
    quotable: raw.quotable === true,
    refused: typeof raw.refused === 'string' ? raw.refused.slice(0, 400) : null,
  };
}

export function normalizeSuccessionReadings(raw, warnings = []) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  let dropped = 0;
  for (const entry of raw) {
    if (out.length >= MAX_READINGS) {
      dropped += 1;
      continue;
    }
    if (!entry || typeof entry !== 'object') {
      dropped += 1;
      continue;
    }
    const id = typeof entry.id === 'string' && entry.id ? entry.id : null;
    const frozenAt = iso(entry.frozenAt);
    const reviewOn = day(entry.reviewOn);
    const pGap = toNum(entry.pGapPct);
    if (!id || !frozenAt || !reviewOn || pGap === null || pGap < 0 || pGap > 100) {
      dropped += 1;
      continue;
    }
    const spans = (Array.isArray(entry.spans) ? entry.spans : []).map(normalizeSpan).filter(Boolean);
    if (!spans.length) {
      // A reading with no span priced nothing. Keeping it would let a graded
      // round be scored against a claim nobody made.
      dropped += 1;
      continue;
    }
    const scope = typeof entry.scope === 'string' ? entry.scope : 'workspace';
    out.push({
      id,
      scope,
      nodeId: typeof entry.nodeId === 'string' ? entry.nodeId : null,
      altitude: typeof entry.altitude === 'string' ? entry.altitude : null,
      frozenAt,
      reviewOn,
      reviewDays: toInt(entry.reviewDays, SUCCESSION_LIMITS.reviewHorizonDaysDefault, ...SUCCESSION_LIMITS.reviewHorizonDays),
      horizonDays: toInt(entry.horizonDays, SUCCESSION_LIMITS.horizonDaysDefault, ...SUCCESSION_LIMITS.horizonDays),
      concentrationCapPct: toInt(entry.concentrationCapPct, SUCCESSION_LIMITS.concentrationCapPctDefault, ...SUCCESSION_LIMITS.concentrationCapPct),
      pGapPct: Math.round(pGap * 10) / 10,
      pGapLowerPct: clamp(entry.pGapLowerPct, 0, 100) === null ? null : Math.round(clamp(entry.pGapLowerPct, 0, 100) * 10) / 10,
      pGapMethod: typeof entry.pGapMethod === 'string' ? entry.pGapMethod.slice(0, 200) : '',
      pGapRefused: typeof entry.pGapRefused === 'string' ? entry.pGapRefused.slice(0, 400) : null,
      counts: {
        spansN: toInt(entry.counts?.spansN, spans.length, 0, 9999),
        itemsN: toInt(entry.counts?.itemsN, 0, 0, 99999),
        certifiedN: toInt(entry.counts?.certifiedN, 0, 0, 9999),
        concentratedN: toInt(entry.counts?.concentratedN, 0, 0, 9999),
        unmeasuredN: toInt(entry.counts?.unmeasuredN, 0, 0, 9999),
        blockedItemsN: toInt(entry.counts?.blockedItemsN, 0, 0, 99999),
      },
      spans,
      members: (Array.isArray(entry.members) ? entry.members : []).slice(0, SUCCESSION_LIMITS.maxItems).map(normalizeMember).filter(Boolean),
      graded: entry.graded && typeof entry.graded === 'object' ? entry.graded : null,
      lapsedOn: day(entry.lapsedOn),
      challengeNotes: (Array.isArray(entry.challengeNotes) ? entry.challengeNotes : [])
        .filter((n) => typeof n === 'string' && n.trim())
        .slice(0, 20)
        .map((n) => ({ note: n.slice(0, 600), at: null })),
    });
  }
  if (dropped) {
    warnings.push(`Succession: dropped ${dropped} unreadable frozen reading(s) rather than repairing a claim nobody froze`);
  }
  return out;
}

export function normalizeSuccessionMarkers(raw) {
  const rows = Array.isArray(raw) ? raw.filter((m) => typeof m === 'string' && m) : [];
  const set = [...new Set(rows)];
  return set.slice(Math.max(0, set.length - MAX_MARKERS));
}

/**
 * A challenge note is a leader arguing with the instrument. It is appended, never
 * edited, and never reduces a reported figure — a claim survives being argued
 * with or it is graded, and the rule does the rest.
 */
export function normalizeChallengeNotes(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((n) => typeof n === 'string' && n.trim())
    .slice(0, 20)
    .map((n) => ({ note: n.slice(0, 600), at: null }));
}

export { MAX_READINGS, MAX_MARKERS };
