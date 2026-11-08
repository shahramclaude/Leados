/**
 * app/core/domain/budgetExposureActions.js — seat-scoped safe reads for the
 * span budget exposure roll-up (ADR-0136).
 *
 * Three reads, no writes. The exposure is derived, never stored: there is no
 * collection, no marker, no convention of its own and no second command bus.
 *
 * The scoping is done HERE, on the raw store, by the same `canSee` policy the
 * render-time projection uses — so an API caller under a declared seat cannot
 * see a budget the seat would not be shown, and the reading the view renders and
 * the reading the API returns are produced from the same filtered set.
 */

import { activeSeat, buildSeats, canSee } from './seat.js';
import { buildBudgetExposure, budgetExposureText, budgetExposureBrief } from './budgetExposure.js';

export function createBudgetExposureActions(store, { now }) {
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};

  /** The state, reduced to the budgets this seat may read in full. */
  const scopedState = () => {
    const built = buildSeats(store.state, { now: clock(), settings: settings() });
    const seat = activeSeat(built);
    if (!seat || seat.fullAccess) return { state: store.state, seat, built };
    const readable = (store.state.budgets || []).filter((b) => canSee(b, 'budgets', seat, built).allow === 'full');
    return { state: { ...store.state, budgets: readable }, seat, built };
  };

  const read = () => {
    const { state, seat, built } = scopedState();
    return buildBudgetExposure(state, { now: clock(), seat, built });
  };

  return {
    /** The full roll-up: currency position, branch attribution, review queue. */
    budgetExposureRead() {
      return read();
    },

    /** The ledger as text, for the envelope conversation or the upward hand-off. */
    budgetExposureText() {
      return { ok: true, text: budgetExposureText(read()) };
    },

    /** One identity-free sentence for an upward brief. */
    budgetExposureBriefText() {
      return { ok: true, text: budgetExposureBrief(read()) };
    },
  };
}
