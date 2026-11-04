/**
 * The render-time read boundary. Navigation alone never protected a record.
 * Unknown collections fail closed; the legacy operator view is unchanged.
 * This is a local disclosure contract, NOT protection from the browser owner.
 */
import { COLLECTIONS, LINK_ENTITY_COLLECTIONS } from '../schema.js';
import { activeSeat, buildSeats, canSee, projectForSeat } from './seat.js';
import { grantedRecords } from './disclosure.js';

const PUBLIC_PERSON_FIELDS = ['id', 'name', 'role', 'level', 'team', 'managerId', 'status'];
/**
 * ADR-0084: the projection now takes one more input — the release ledger. A live,
 * consented, span-bounded grant adds exactly those records (and nothing else) to
 * the seat's read model, marked with the grant that released them. Without a
 * grant this function is byte-for-byte the projection it was before.
 */
export function scopedViewState(state, seatContext = null, { now = new Date(), settings = null, granted = null } = {}) {
  if (!seatContext?.seat || seatContext.seat.fullAccess) return state;
  const { seat, built } = seatContext;
  const projection = seatContext.projection || projectForSeat(state, seat, built);
  const out = Object.fromEntries(COLLECTIONS.map((key) => [key, []]));
  out.schemaVersion = state.schemaVersion;
  out.appId = state.appId;
  out.meta = { ...state.meta };
  out.settings = { ...state.settings };
  for (const [key, rows] of Object.entries(projection.visible)) out[key] = rows;
  // ADR-0084: records a live release opens, marked with the release id so a view
  // (and the leak oracle) can tell granted detail from ordinary detail.
  const released = granted || grantedRecords(state, seat, built, { now, settings });
  for (const [key, rows] of released) {
    if (!COLLECTIONS.includes(key)) continue;
    const existing = new Set((out[key] || []).map((row) => row.id));
    out[key] = [...(out[key] || []), ...rows.filter((row) => !existing.has(row.id))];
  }
  if (seat.readOnly) {
    for (const key of COLLECTIONS) out[key] = [];
    return out;
  }
  // Names of subordinate leaders are organizational structure. Private person
  // fields (pay, talking points, development notes) never ride along with them.
  out.people = (state.people || []).filter((p) => seat.scope.has(p.id)).map((p) => {
    if (seat.rank <= 2) return p;
    if (!built.nodeIndex.has(p.id)) return null;
    return Object.fromEntries(PUBLIC_PERSON_FIELDS.map((key) => [key, p[key]]));
  }).filter(Boolean);
  // The raw audit log contains free-text titles and person names. Aggregate
  // work is available through Mission Control; raw history is not projected.
  out.events = [];
  out.pulses = [];
  const visibleIds = new Map(COLLECTIONS.map((key) => [key, new Set((out[key] || []).map((r) => r.id))]));
  const typeCollection = (type) => LINK_ENTITY_COLLECTIONS[type] || (COLLECTIONS.includes(type) ? type : null);
  out.links = (state.links || []).filter((l) => {
    const source = typeCollection(l.sourceType); const target = typeCollection(l.targetType);
    return source && target && visibleIds.get(source)?.has(l.sourceId) && visibleIds.get(target)?.has(l.targetId);
  });
  out.actionBundles = (state.actionBundles || []).filter((b) => {
    const source = (out.cases || []).find((c) => c.id === b.sourceId);
    return source && b.commands.every((c) => !c.ownerId || out.people.some((p) => p.id === c.ownerId));
  });
  return out;
}

/** Used by the shell if seat construction fails: never fail open on an enforced workspace. */
export function safeSeatContext(state, now) {
  try {
    const built = buildSeats(state, { now, settings: state.settings });
    const seat = activeSeat(built);
    return { built, seat, projection: projectForSeat(state, seat, built), error: null };
  } catch (error) {
    return { built: null, seat: null, projection: null, error: error?.message || 'Seat resolution failed.' };
  }
}
export function recordVisible(state, seatContext, collection, id) {
  if (!seatContext?.seat) return false;
  if (seatContext.seat.fullAccess) return true;
  const record = (state[collection] || []).find((r) => r.id === id);
  return Boolean(record && canSee(record, collection, seatContext.seat, seatContext.built).allow === 'full');
}
