/**
 * app/core/domain/seatSchema.js — fail-closed conventions for the Operating
 * Seat (ADR-0076).
 *
 * This session deliberately adds NO new stored collection and NO schema bump.
 * The seat is a declaration in `settings`; the handover and every refusal go
 * into the workspace's existing append-only event log; typed provenance uses
 * the graph's existing `rolls-up-to` relation and existing entity types; the
 * roll-up itself is derived live from the reporting tree and the dated records
 * other modules already keep. There is therefore nothing to migrate and no
 * copy of a number that can drift from the number it reports — which is the
 * whole point of §0.3's "without manual re-entry or re-formatting".
 *
 * Older blobs simply lack these settings keys and open on the undeclared
 * operator view. A corrupted key is dropped, never repaired into a guess: an
 * invented seat is an invented access grant.
 */

import { SEAT_LIMITS, UNDECLARED_SEAT } from './seatRegistry.js';

function toInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function toNum(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** A seat id is either the sentinel or an opaque, bounded record id. */
export function normalizeSeatId(value) {
  if (value === UNDECLARED_SEAT) return UNDECLARED_SEAT;
  if (typeof value !== 'string') return null;
  const id = value.trim();
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) return null;
  return id;
}

/**
 * Declared conventions. `activeSeatId === null` means the undeclared operator
 * view (no enforcement, exactly the pre-0076 behaviour); the string
 * `UNDECLARED_SEAT` is the same view made explicit; any other string must
 * resolve to a real node in the chain or `resolveSeat` refuses it.
 */
export function seatConventions(settings = {}) {
  const s = settings && typeof settings === 'object' ? settings : {};
  const raw = s.activeSeatId;
  // The operator view is the DEFAULT, not an error. A value that is present
  // but malformed is dropped to null with a warning at the call site, never
  // coerced into a plausible-looking seat. `leader` is a real node id in the
  // chain (the workspace leader) and `UNDECLARED_SEAT` is the explicit
  // operator view; both pass the id normalizer unchanged.
  const activeSeatId = normalizeSeatId(raw);
  return {
    activeSeatId,
    seatAutoPropagate: s.seatAutoPropagate !== false,
    seatFloorN: toInt(s.seatFloorN, SEAT_LIMITS.floorNDefault, ...SEAT_LIMITS.floorN),
    seatMaterialityPp: toNum(s.seatMaterialityPp, SEAT_LIMITS.materialityPpDefault, ...SEAT_LIMITS.materialityPp),
    seatWindowDays: toInt(s.seatWindowDays, SEAT_LIMITS.windowDaysDefault, ...SEAT_LIMITS.windowDays),
    seatMaxLinks: toInt(s.seatMaxLinks, SEAT_LIMITS.maxLinksDefault, ...SEAT_LIMITS.maxLinks),
    seatLedgerOpen: s.seatLedgerOpen !== false,
  };
}

/** Spread into `normalizeSettings(raw)` so a declared seat survives reload. */
export function normalizeSeatSettings(settings) {
  const c = seatConventions(settings);
  return {
    activeSeatId: c.activeSeatId,
    seatAutoPropagate: c.seatAutoPropagate,
    seatFloorN: c.seatFloorN,
    seatMaterialityPp: c.seatMaterialityPp,
    seatWindowDays: c.seatWindowDays,
    seatMaxLinks: c.seatMaxLinks,
    seatLedgerOpen: c.seatLedgerOpen,
  };
}

/** True when a stored seat id could not be honoured (for the printed warning). */
export function seatIdWasDropped(settings) {
  const s = settings && typeof settings === 'object' ? settings : {};
  const present = Object.prototype.hasOwnProperty.call(s, 'activeSeatId');
  if (!present) return false;
  return normalizeSeatId(s.activeSeatId) === null && s.activeSeatId !== null && s.activeSeatId !== '';
}
