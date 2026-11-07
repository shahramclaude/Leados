/**
 * app/core/domain/dutyRehearsalSchema.js — fail-closed normalizers for
 * Explicit rehearsal records (ADR-0128, Schema v117).
 *
 * WHAT IS STORED, AND WHAT MUST NEVER BE
 * --------------------------------------
 * A `dutyRehearsals` row stores exactly the human act and its provenance:
 *   coverRowId        the declared cover row this rehearsal is evidence for
 *   dutyId/dutyKey    the duty line that was practised (`<seatId>|<key>`)
 *   seatId            the seat that HOLDS the duty (so a rehearsal can never
 *                     be attached to a re-declaration by a different seat)
 *   coverSeatId       the declared cover who rehearsed — must be the person
 *                     the cover row actually names
 *   recordedBySeatId  the seat that attests — the holder, a leadership
 *                     ancestor of the holder, or the cover themselves
 *   rehearsedOn       the ISO day the practice happened
 *   mode              walkthrough | shadow | supervised | handover
 *   outcome           ready | gaps — a rehearsal either certifies or names
 *                     what it found; `gaps` opens a governed decision
 *   note              the recorder's own words (clamped, never summarised)
 *   decisionId        the governed decision opened when gaps were found
 *   status            active | revoked, with the revocation day and reason
 *
 * What it never stores: a "rehearsed" verdict on the cover, an exercise
 * status, a readiness score, or a copy of another module's record. Whether a
 * rehearsal counts for a given absence is re-derived on read from the
 * preparation window, the outcome and today — a stored verdict would drift
 * the moment the absence window moved.
 *
 * A malformed row is DROPPED with a printed warning, never repaired into a
 * plausible-looking attestation: an invented rehearsal is an invented
 * observation, and a third party who could not have been there cannot attest
 * to one — the recorder is checked against the roster exactly as ADR-0127
 * checks the answerer against the cover row.
 */

import {
  DUTY_REHEARSAL_ENGINE_VERSION,
  DUTY_REHEARSAL_LIMITS,
  DUTY_REHEARSAL_MODES,
  DUTY_REHEARSAL_OUTCOMES,
} from './dutyRehearsalRegistry.js';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value, max = 300) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function id(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value.trim()) ? value.trim() : null;
}

function stamp(value) {
  const s = text(value, 40);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function day(value) {
  const s = text(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
}

/** `<seatId>|<dutyKey>` — kept local so this module never reaches into ADR-0121's parser. */
function parseDutyIdLocal(dutyId) {
  const raw = typeof dutyId === 'string' ? dutyId.trim() : '';
  const parts = raw.split('|');
  if (parts.length !== 2) return null;
  const seatId = id(parts[0]);
  const dutyKey = typeof parts[1] === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(parts[1]) ? parts[1] : null;
  if (!seatId || !dutyKey) return null;
  return { seatId, dutyKey, dutyId: `${seatId}|${dutyKey}` };
}

/**
 * The leadership ancestors of one person, from the roster's managerId chain.
 * Bounded walk with a cycle guard: a hand-edited roster must not be able to
 * hang the load. Returns a Set of person ids ABOVE the given id (never the id
 * itself — a seat is never its own ancestor).
 */
export function rosterAncestors(people, personId) {
  const byId = new Map();
  for (const p of Array.isArray(people) ? people : []) {
    if (p && typeof p.id === 'string') byId.set(p.id, typeof p.managerId === 'string' ? p.managerId : null);
  }
  const out = new Set();
  let cursor = byId.get(personId) ?? null;
  let guard = 0;
  while (cursor && guard < 64) {
    if (out.has(cursor)) break;
    out.add(cursor);
    cursor = byId.get(cursor) ?? null;
    guard += 1;
  }
  return out;
}

/**
 * The rehearsal ledger. Four structural corruptions are refused at load:
 *   - a malformed or incomplete row (dropped with a warning);
 *   - a row whose duty line, holder seat or rehearsing person disagree with
 *     the cover row it claims as evidence (dropped — an attestation that
 *     points somewhere else attests nothing);
 *   - a row recorded BEFORE the rehearsal it attests happened (dropped — a
 *     record cannot observe an act that has not occurred);
 *   - a row whose recorder is neither the holder, the cover, nor a leadership
 *     ancestor of the holder (dropped — a third party could not have been
 *     there, and a hand-edited file must not be able to invent an observer).
 *
 * The recorder check needs the roster, so it is applied here where both are
 * known (`normalizeDutyRehearsals(rehearsals, covers, people, warnings)`):
 * the schema is the one place that can see both, and a check that lived only
 * in the action would let an imported workspace fabricate an attestation.
 */
export function normalizeDutyRehearsals(value, covers = [], people = [], warnings = []) {
  if (!Array.isArray(value)) return [];
  const coverById = new Map(
    (Array.isArray(covers) ? covers : [])
      .filter((c) => c && typeof c.id === 'string')
      .map((c) => [c.id, c]),
  );
  const out = [];
  for (const raw of value) {
    if (!isPlainObject(raw)) {
      warnings.push('Cover rehearsal: dropped a malformed rehearsal row (not an object).');
      continue;
    }
    const rowId = id(raw.id);
    const coverRowId = id(raw.coverRowId);
    const parsed = parseDutyIdLocal(raw.dutyId);
    const dutyKey = typeof raw.dutyKey === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(raw.dutyKey.trim()) ? raw.dutyKey.trim() : null;
    const seatId = id(raw.seatId);
    const coverSeatId = id(raw.coverSeatId);
    const recordedBySeatId = id(raw.recordedBySeatId);
    const rehearsedOn = day(raw.rehearsedOn);
    const recordedOn = day(raw.recordedOn);
    const recordedAt = stamp(raw.recordedAt);
    const mode = DUTY_REHEARSAL_MODES.includes(raw.mode) ? raw.mode : null;
    const outcome = DUTY_REHEARSAL_OUTCOMES.includes(raw.outcome) ? raw.outcome : null;
    const status = raw.status === 'active' || raw.status === 'revoked' ? raw.status : null;
    if (!rowId || !coverRowId || !parsed || !dutyKey || !seatId || !coverSeatId
      || !recordedBySeatId || !rehearsedOn || !recordedOn || !recordedAt
      || !mode || !outcome || !status) {
      warnings.push('Cover rehearsal: dropped an incomplete rehearsal row; no attestation was inferred.');
      continue;
    }
    if (parsed.seatId !== seatId || parsed.dutyKey !== dutyKey) {
      warnings.push('Cover rehearsal: dropped a row whose duty line and holder seat disagree with its own dutyId.');
      continue;
    }
    if (rehearsedOn > recordedOn) {
      warnings.push('Cover rehearsal: dropped a row recorded before the rehearsal it attests happened. A record cannot observe a future act.');
      continue;
    }
    const cover = coverById.get(coverRowId);
    if (cover) {
      if (cover.dutyId !== parsed.dutyId || cover.seatId !== seatId || cover.coverId !== coverSeatId) {
        warnings.push('Cover rehearsal: dropped an attestation pointing at a different duty line or a different person than its cover row.');
        continue;
      }
    }
    // The recorder must be a seat that could have been there: the holder, the
    // cover themselves, or a leadership ancestor of the holder. Checked against
    // the roster so a hand-edited file cannot invent an observer.
    if (recordedBySeatId !== seatId && recordedBySeatId !== coverSeatId
      && !rosterAncestors(people, seatId).has(recordedBySeatId)) {
      warnings.push('Cover rehearsal: dropped an attestation recorded by a seat that holds neither the duty, nor the cover, nor a leadership span above the holder. An observation nobody was positioned to make is not evidence.');
      continue;
    }
    if (out.length >= DUTY_REHEARSAL_LIMITS.rehearsalCap) {
      warnings.push('Cover rehearsal: ledger cap reached; additional rows were not loaded.');
      break;
    }
    out.push({
      id: rowId,
      coverRowId,
      dutyId: parsed.dutyId,
      dutyKey,
      seatId,
      coverSeatId,
      recordedBySeatId,
      rehearsedOn,
      recordedOn,
      recordedAt,
      mode,
      outcome,
      note: text(raw.note, DUTY_REHEARSAL_LIMITS.noteChars),
      decisionId: id(raw.decisionId),
      status,
      revokedOn: day(raw.revokedOn),
      revokedAt: stamp(raw.revokedAt),
      revokeReason: text(raw.revokeReason, DUTY_REHEARSAL_LIMITS.noteChars),
      version: typeof raw.version === 'string' && raw.version.trim()
        ? raw.version.trim().slice(0, 60)
        : DUTY_REHEARSAL_ENGINE_VERSION,
    });
  }
  return out;
}

/** Every active rehearsal for one declared cover row, newest rehearsal day first. */
export function activeRehearsalsFor(rehearsals, coverRowId) {
  if (!Array.isArray(rehearsals)) return [];
  return rehearsals
    .filter((r) => r && r.coverRowId === coverRowId && r.status === 'active')
    .slice()
    .sort((a, b) => (a.rehearsedOn < b.rehearsedOn ? 1 : a.rehearsedOn > b.rehearsedOn ? -1 : (a.recordedAt < b.recordedAt ? 1 : a.recordedAt > b.recordedAt ? -1 : 0)));
}
