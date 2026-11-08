/**
 * app/ui/recordFocus.js — exact-record focus for the coverage family
 * (ADR-0131, Session 177).
 *
 * Session 176 (ADR-0130) gave every registered link type a resolver case, and
 * deliberately refused to invent a focus the destination terminal could not
 * honour: the duty register, the absence plan, the acknowledgement board and
 * the branch-reading panel accepted a `panel` but no record id, so a director
 * following a governed decision's edge landed at the top of a table with
 * dozens of rows and had to find the record by eye.
 *
 * This module is the view half of closing that gap. It reads ONE declared
 * focus parameter, decides whether the record is actually present in the rows
 * the seat is allowed to see, and gives the caller three honest answers:
 *
 *   focused   the id is in the rendered set — mark that row, and only that row
 *   absent    an id was asked for and is NOT in the rendered set — print why
 *             (out of scope, revoked, or no longer in the ledger); never
 *             silently drop the request, and never widen scope to satisfy it
 *   none      no id was asked for — render exactly as before
 *
 * It holds no state, performs no read of its own and mutates nothing. The
 * rows it is given are already seat-scoped and already redacted by the engine,
 * so focus can never become a disclosure channel: a record the seat may not
 * see is `absent`, not `focused`.
 */

/** The declared focus parameter per record kind, matched by the resolver. */
export const RECORD_FOCUS_PARAMS = Object.freeze({
  dutycover: 'cover',
  absenceplan: 'plan',
  standbyanswer: 'answer',
  rehearsal: 'rehearsal',
  branchask: 'ask',
  branchreading: 'reading',
});

/**
 * Read one focus id from the route query. Returns `null` when the parameter is
 * absent or blank, so an empty `?cover=` is not a request.
 */
export function focusIdFor(query, param) {
  const raw = query?.get?.(param);
  if (typeof raw !== 'string') return null;
  const id = raw.trim();
  return id ? id : null;
}

/**
 * Resolve a focus request against the rows this seat can actually see.
 *
 * `rows` are the rendered, already-scoped rows; `identify` returns the record
 * id a row carries (a row may carry several — an absence-plan row is addressed
 * by the plan id, a duty row by any of its cover ids).
 */
export function recordFocus(query, param, rows, identify) {
  const id = focusIdFor(query, param);
  if (!id) return Object.freeze({ state: 'none', id: null, matched: false });
  const list = Array.isArray(rows) ? rows : [];
  const matched = list.some((row) => {
    const ids = identify(row);
    return Array.isArray(ids) ? ids.includes(id) : ids === id;
  });
  return Object.freeze({ state: matched ? 'focused' : 'absent', id, matched });
}

/** True when this row is the focused one. */
export function isFocused(focus, ...ids) {
  return Boolean(focus?.matched) && ids.some((id) => id && id === focus.id);
}

/**
 * Row props for the shared `table()` helper: the house selection class plus a
 * `data-*` attribute naming the record, so a deep link is assertable and an
 * assistive technology reads the same row a mouse user sees highlighted.
 */
export function focusRowProps(focus, id, attribute, extra = {}) {
  const selected = isFocused(focus, id);
  return {
    ...extra,
    className: [extra.className, selected ? 'lineage-selected' : ''].filter(Boolean).join(' '),
    attrs: {
      ...(extra.attrs || {}),
      ...(id ? { [attribute]: id } : {}),
      ...(selected ? { 'aria-current': 'true' } : {}),
    },
  };
}

/** The same selection contract for a card rather than a table row. */
export function focusCardClass(focus, id, base = '') {
  return [base, isFocused(focus, id) ? 'lineage-selected' : ''].filter(Boolean).join(' ');
}

/**
 * The printed refusal when a deep link names a record this seat cannot see.
 * A focus request is never silently dropped: the leader is told the link did
 * not resolve HERE, and that the scope was not widened to make it resolve.
 */
export function focusAbsentNote(focus, label) {
  if (focus?.state !== 'absent') return null;
  return `The link named ${label} “${focus.id}”, which is not in the rows this seat may read. It may sit outside your span, be revoked, or no longer be in the ledger. Nothing was widened to find it, and no other row is highlighted.`;
}
