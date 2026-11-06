/**
 * app/core/domain/decisionFitActions.js — commands and scoped adapters for the
 * Decision-Fit Ledger (ADR-0108).
 *
 * Reads are pure adapters (SAFE_READS in the access gateway). The writes are
 * exactly three:
 *
 *   scan        explicitly re-freeze, re-propose, re-grade and re-read every span
 *               now. Never moves work.
 *   classify    declare (or correct) the authority class of ONE open call. The
 *               classification is the leader's own statement about who may hold
 *               the call, so it outranks the lexicon — and the previous snapshot
 *               is marked superseded rather than edited, because a price that
 *               silently changed after the fact is a hindsight nobody can audit.
 *   setConventions  re-declare the declared floors (rank 4-5 + full access).
 *
 * No write here moves a decision, accepts a proposal, rates a person, sends
 * anything or edits another module's record. Proposals, snapshots, readings and
 * grades are produced by RULE-FIT-01..04 on the shared spine in the SAME atomic
 * transaction — never by a second workflow engine.
 */

import { dayKey } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { buildFitBook, fitBrief, fitConventions } from './decisionFit.js';
import { normalizeFitSettings } from './decisionFitSchema.js';
import { AUTHORITY_CLASS_KEYS, CLASS_BY_KEY, FIT_EVENTS, FIT_LIMITS } from './decisionFitRegistry.js';

export function createFitActions(store, { now, idFactory }) {
  const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  const saved = (extra = {}) => ({
    ok: true,
    ...extra,
    saved: !store.persistError,
    warning: store.persistError || null,
    propagations: store.lastPropagations || [],
  });
  const report = () => buildFitBook(store.state, { now: clock(), conventions: fitConventions(settings()) });

  const seatFor = (right, { fullAccess = false } = {}) => {
    const built = buildSeats(store.state, { now: clock(), settings: settings() });
    const seat = activeSeat(built);
    if (seat.readOnly) {
      return { ok: false, error: 'The declared seat is unresolved and read-only. Choose a valid seat before changing the decision-fit ledger.' };
    }
    const verdict = canAct(right, seat);
    if (!verdict.allow) return { ok: false, error: verdict.reason };
    if (fullAccess && !seat.fullAccess) {
      return { ok: false, error: 'Changing the decision-fit conventions re-prices every delegation in the workspace. Only a full-access seat may declare them.' };
    }
    return { ok: true, seat };
  };

  return {
    /* -------------------------------------------------------------- scan */
    fitScan() {
      const right = seatFor('record-fit');
      if (!right.ok) return fail(right.error);
      store.update(() => {}, {
        type: FIT_EVENTS.SCAN,
        entity: right.seat.fullAccess ? 'workspace' : 'fit',
        entityId: right.seat.fullAccess ? 'all' : right.seat.id,
        summary: 'Explicitly re-froze the authority classifications, re-priced the open book and re-graded settled proposals',
      });
      return saved({ report: report() });
    },

    /* ---------------------------------------------------------- classify */
    /**
     * Declare the authority class of one open call. This is the human's
     * statement about WHO MAY HOLD the call, and it outranks the lexical
     * classifier — a leader who says "this is a structural call, not a
     * sequencing one" must be believed, and the correction must be visible.
     */
    fitClassify(decisionId, classKey) {
      const right = seatFor('record-fit');
      if (!right.ok) return fail(right.error);
      const id = String(decisionId || '').trim();
      if (!id) return fail('Choose a decision to classify.', 'decisionId');
      if (!AUTHORITY_CLASS_KEYS.includes(classKey)) return fail('That is not a declared authority class.', 'classKey');
      const state = store.state;
      const decision = (state.decisions || []).find((d) => d?.id === id);
      if (!decision) return fail('That decision is not in this workspace.', 'decisionId');
      if (decision.chosen) return fail('That call is already settled. Its class is a historical fact and is not re-declared.', 'decisionId');
      const cls = CLASS_BY_KEY[classKey];
      store.update((draft) => {
        // The previous snapshot is SUPERSEDED, never edited: a re-priced call
        // keeps both prices so the change is auditable.
        draft.fitSnapshots = Array.isArray(draft.fitSnapshots) ? draft.fitSnapshots : [];
        for (const snap of draft.fitSnapshots) {
          if (snap?.decisionId === id && snap.status === 'frozen') {
            snap.status = 'superseded';
            snap.supersededOn = dayKey(clock());
          }
        }
        draft.fitSnapshots = draft.fitSnapshots.filter((s) => s?.status !== 'superseded'
          || (Date.parse(s.supersededOn || '') || 0) > Date.now() - 90 * 86400000);
        if (draft.fitSnapshots.length > FIT_LIMITS.snapshots) draft.fitSnapshots = draft.fitSnapshots.slice(-FIT_LIMITS.snapshots);
        // A declared class is a property of the decision every other module can
        // read, so it is written to the decision itself and then frozen.
        const target = draft.decisions.find((d) => d?.id === id);
        if (target) target.authorityClass = classKey;
      }, {
        type: 'decision.reclassified',
        entity: 'decision',
        entityId: id,
        summary: `Declared the authority class of “${decision.title}” as ${cls.label} (floor rank ${cls.floorRank})`,
      });
      return saved({ decisionId: id, classKey, report: report() });
    },

    /* ------------------------------------------------------ conventions */
    fitSetConventions(patch = {}) {
      const right = seatFor('govern-fit', { fullAccess: true });
      if (!right.ok) return fail(right.error);
      const before = normalizeFitSettings(settings());
      const merged = normalizeFitSettings({ ...before, ...(patch || {}) });
      const changed = Object.keys(merged).filter((key) => merged[key] !== before[key]);
      if (!changed.length) return saved({ changed: [], report: report() });
      store.update((draft) => {
        if (!draft.settings) draft.settings = {};
        Object.assign(draft.settings, merged);
      }, {
        type: FIT_EVENTS.CONVENTIONS,
        entity: 'fit',
        entityId: 'conventions',
        summary: `Changed decision-fit conventions: ${changed.map((key) => `${key}=${merged[key]}`).join(', ')}`,
      });
      return saved({ changed, report: report() });
    },

    /* ----------------------------------------------------------- brief */
    fitBriefText() {
      const right = seatFor('record-fit');
      if (!right.ok) return fail(right.error);
      return saved({ brief: fitBrief(store.state, { now: clock(), conventions: fitConventions(settings()) }) });
    },
  };
}

export const FIT_SCAN = FIT_EVENTS.SCAN;
