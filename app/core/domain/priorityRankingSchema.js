/**
 * app/core/domain/priorityRankingSchema.js — fail-closed storage contract and
 * condition signatures for the Cross-Line Priority Ballot register
 * (ADR-0191, Schema v151).
 *
 * Two append-only ledgers — the frozen rounds and the ballots cast into them.
 * NOTHING derived is stored: no pairwise count, winner, cycle, beatpath,
 * Kemeny score or coverage state. A row that cannot be read exactly is dropped
 * with a warning rather than clamped into plausibility, because a repaired
 * ballot would then be printed as a ranking a line holder never gave.
 */

import {
  PRIORITY_BALLOT_ASK_PREFIX,
  PRIORITY_BALLOT_BOUNDS,
  PRIORITY_BALLOT_DEFAULTS,
  PRIORITY_BALLOT_LIMITS,
  PRIORITY_BALLOT_SETTING_KEYS,
} from './priorityRankingRegistry.js';

const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value, max = 400) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const id = (value) => { const c = text(value, 120); return ID_RE.test(c) ? c : null; };
const round2 = (n) => Math.round(n * 100) / 100;

/** A real calendar day as `YYYY-MM-DD`, or null. `2026-02-30` is null, not March. */
export function priorityBallotDay(value) {
  const candidate = text(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return null;
  const date = new Date(`${candidate}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === candidate ? candidate : null;
}

function stamp(value) {
  const raw = text(value, 40);
  if (!raw) return null;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function boundedInt(value, [min, max], fallback) {
  const n = Math.round(Number(value));
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/* ----------------------------------------------------------------- settings */

/** The loader clamps into the declared bounds; the setter (in the actions) refuses. */
export function normalizePriorityBallotSettings(raw = {}) {
  const src = isPlainObject(raw) ? raw : {};
  const K = PRIORITY_BALLOT_SETTING_KEYS;
  const B = PRIORITY_BALLOT_BOUNDS;
  const D = PRIORITY_BALLOT_DEFAULTS;
  return {
    [K.ballotDueDays]: boundedInt(src[K.ballotDueDays], B.ballotDueDays, D.ballotDueDays),
    [K.askDueDays]: boundedInt(src[K.askDueDays], B.askDueDays, D.askDueDays),
    [K.minBallots]: boundedInt(src[K.minBallots], B.minBallots, D.minBallots),
    // Only an explicit `false` pauses the rule: an unreadable value must never
    // read as "somebody switched governance off".
    [K.autoPropagate]: src[K.autoPropagate] !== false,
  };
}

/* ------------------------------------------------------------------- rounds */

function normalizeItemSnapshot(value) {
  if (!Array.isArray(value)) return null;
  if (value.length < PRIORITY_BALLOT_LIMITS.itemsMin || value.length > PRIORITY_BALLOT_LIMITS.itemsMax) return null;
  const out = [];
  const seen = new Set();
  for (const raw of value) {
    const row = isPlainObject(raw) ? raw : null;
    const key = row && id(row.key);
    const title = row ? text(row.title, 200) : '';
    if (!key || seen.has(key) || title.length < 2) return null;
    seen.add(key);
    out.push({
      key,
      title,
      sourceType: row.sourceType === 'portfolio' ? 'portfolio' : 'portfolio',
      sourceId: id(row.sourceId) || key,
    });
  }
  return out;
}

function normalizeLineSnapshot(value) {
  if (!Array.isArray(value)) return null;
  if (!value.length || value.length > PRIORITY_BALLOT_LIMITS.linesPerRound) return null;
  const out = [];
  const seen = new Set();
  for (const raw of value) {
    const row = isPlainObject(raw) ? raw : null;
    const lineKey = row ? (row.lineKey === 'home' ? 'home' : id(row.lineKey)) : null;
    const managerId = row && id(row.managerId);
    if (!lineKey || !managerId || seen.has(lineKey)) return null;
    seen.add(lineKey);
    const shareH = row.shareH === null || row.shareH === undefined ? null : Math.round(Number(row.shareH));
    out.push({
      lineKey,
      managerId,
      kind: text(row.kind, 40) || 'unknown',
      role: row.role === 'primary' ? 'primary' : 'secondary',
      shareH: Number.isFinite(shareH) && shareH >= 0 && shareH <= 10000 ? shareH : null,
    });
  }
  return out;
}

export function normalizePriorityRoundLedger(value, warnings = []) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const raw of value) {
    if (out.length >= PRIORITY_BALLOT_LIMITS.rounds) { dropped += 1; continue; }
    const row = isPlainObject(raw) ? raw : null;
    const roundId = row && id(row.id);
    const personId = row && id(row.personId);
    const title = row ? text(row.title, PRIORITY_BALLOT_LIMITS.titleMax) : '';
    const items = row ? normalizeItemSnapshot(row.itemSnapshot) : null;
    const lines = row ? normalizeLineSnapshot(row.lineSnapshot) : null;
    const openedOn = row && priorityBallotDay(row.openedOn);
    const dueOn = row && priorityBallotDay(row.dueOn);
    const withdrawnOn = row && row.withdrawnOn ? priorityBallotDay(row.withdrawnOn) : null;
    const withdrawnReason = row ? text(row.withdrawnReason, PRIORITY_BALLOT_LIMITS.reasonMax) : '';
    if (!roundId || seen.has(roundId) || !personId || title.length < PRIORITY_BALLOT_LIMITS.titleMin
      || !items || !lines || !openedOn || !openedOn || !dueOn || dueOn < openedOn
      || (row.withdrawnOn && !withdrawnOn) || (withdrawnOn && withdrawnOn < openedOn)
      || (withdrawnOn && withdrawnReason.length < PRIORITY_BALLOT_LIMITS.reasonMin)) {
      dropped += 1;
      continue;
    }
    seen.add(roundId);
    out.push({
      id: roundId,
      personId,
      title,
      itemSnapshot: items,
      lineSnapshot: lines,
      openedOn,
      dueOn,
      withdrawnOn,
      withdrawnReason: withdrawnOn ? withdrawnReason : '',
      declaredById: id(row.declaredById),
      declaredOn: priorityBallotDay(row.declaredOn) || openedOn,
      declaredAt: stamp(row.declaredAt),
    });
  }
  if (dropped) warnings.push(`${dropped} priority-ballot round row(s) could not be read exactly and were dropped rather than repaired.`);
  return out;
}

/* ------------------------------------------------------------------ ballots */

/** A ranking is a permutation of the frozen item keys: every item once, strictly. */
export function priorityBallotRankingIsPermutation(ranking, itemKeys) {
  if (!Array.isArray(ranking) || !Array.isArray(itemKeys)) return false;
  if (ranking.length !== itemKeys.length) return false;
  const pool = new Set(itemKeys);
  const seen = new Set();
  for (const key of ranking) {
    if (typeof key !== 'string' || !pool.has(key) || seen.has(key)) return false;
    seen.add(key);
  }
  return seen.size === itemKeys.length;
}

export function normalizePriorityVotes(value, rounds = [], warnings = []) {
  if (!Array.isArray(value)) return [];
  const byRound = new Map(rounds.map((round) => [round.id, round]));
  const rows = [];
  const seenId = new Set();
  let dropped = 0;
  for (const raw of value) {
    const row = isPlainObject(raw) ? raw : null;
    const ballotId = row && id(row.id);
    const round = row ? byRound.get(id(row.roundId)) : null;
    const lineKey = row ? (row.lineKey === 'home' ? 'home' : id(row.lineKey)) : null;
    const holderId = row && id(row.holderId);
    const castOn = row && priorityBallotDay(row.castOn);
    if (!ballotId || seenId.has(ballotId) || !round || !lineKey || !holderId || !castOn) { dropped += 1; continue; }
    const frozen = round.lineSnapshot.find((line) => line.lineKey === lineKey) || null;
    const itemKeys = round.itemSnapshot.map((item) => item.key);
    // First-person against the SEAT THE ROUND ASKED: only the frozen holder of a
    // frozen line may cast for it, the ranking must cover the frozen set exactly,
    // and the ballot cannot predate the round it answers.
    if (!frozen || frozen.managerId !== holderId || castOn < round.openedOn
      || !priorityBallotRankingIsPermutation(row.ranking, itemKeys)) {
      dropped += 1;
      continue;
    }
    seenId.add(ballotId);
    rows.push({
      id: ballotId,
      roundId: round.id,
      lineKey,
      holderId,
      ranking: [...row.ranking],
      castOn,
      castAt: stamp(row.castAt),
      note: text(row.note, 400),
    });
  }
  rows.sort((a, b) => a.roundId.localeCompare(b.roundId) || a.lineKey.localeCompare(b.lineKey)
    || a.castOn.localeCompare(b.castOn) || String(a.castAt || '').localeCompare(String(b.castAt || '')) || a.id.localeCompare(b.id));
  const out = [];
  const seenLine = new Set();
  for (const row of rows) {
    if (out.length >= PRIORITY_BALLOT_LIMITS.ballots) { dropped += 1; continue; }
    const key = `${row.roundId}|${row.lineKey}`;
    // A second ballot for the same line is a second act, not an edit. The first
    // one cast stands and the later one is dropped and counted, never merged.
    if (seenLine.has(key)) { dropped += 1; continue; }
    seenLine.add(key);
    out.push(row);
  }
  if (dropped) warnings.push(`${dropped} priority-ballot ballot row(s) were unreadable, out of sequence or a duplicate for their line and were dropped rather than repaired.`);
  return out;
}

/* -------------------------------------------------------------- signatures */

/**
 * Deterministic, identity-free 64-bit FNV-1a fingerprint of one condition
 * (`soc1:<kind>:<16-hex>`). Fixed length, so a round id or a line key never
 * appears in a link summary, a marker key or a delegation title.
 */
export function priorityBallotSignature(kind, key) {
  const joined = `${String(kind || '').trim()}\n${String(key || '').trim()}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x050c5d1f;
  for (let i = 0; i < joined.length; i += 1) {
    const code = joined.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= (code ^ (i & 0xff));
    h2 = Math.imul(h2, 0x01000193) >>> 0;
  }
  return `soc1:${kind}:${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

export function priorityBallotAskSummary(signature) {
  return `${PRIORITY_BALLOT_ASK_PREFIX}${String(signature || '').trim()}`;
}

export function parsePriorityBallotAskSummary(summary) {
  if (typeof summary !== 'string') return null;
  const trimmed = summary.trim();
  if (!trimmed.startsWith(PRIORITY_BALLOT_ASK_PREFIX)) return null;
  const signature = trimmed.slice(PRIORITY_BALLOT_ASK_PREFIX.length).trim();
  return /^soc1:[a-z-]+:[0-9a-f]{16}$/.test(signature) ? { signature } : null;
}

export { round2, text as priorityText, id as priorityId };
