/**
 * app/core/domain/epistemicActions.js — commands and scoped adapters for the
 * Epistemic Ledger (ADR-0103).
 *
 * Reads are pure adapters and are safe under a declared seat. The writes are:
 *
 *   declare     write down a question the record cannot answer — the only kind
 *               of unknown whose content comes from a human rather than the record
 *   answer      close one unknown with an act: what was found, dated, by whom
 *   dismiss     close one unknown with a written reason (the reason is required,
 *               and the dismissal rate is printed beside the answer rate)
 *   observe     freeze what the leader BELIEVES about work whose outcome is not
 *               yet on the record, so the belief can be graded against the record
 *   scan        re-harvest, re-escalate, re-expire and re-grade now
 *   setConventions  the window, the escalation age, the expiry and the floors
 *
 * No write here edits another module's record, closes a human's decision, rates a
 * person or sends anything. An unknown is append-only evidence about the record
 * it came from.
 */
import { addDays, dayKey } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import {
  buildEpistemicReport,
  epistemicBriefText,
  epistemicCsvRows,
  epistemicAttentionCount,
  harvestSignals,
  outcomeOfSubject,
} from './epistemic.js';
import { epistemicConventions, normalizeEpistemicSettings } from './epistemicSchema.js';
import {
  EPISTEMIC_EVENTS,
  EPISTEMIC_LIMITS,
  epistemicMarkerId,
} from './epistemicRegistry.js';

const SUBJECT_COLLECTIONS = Object.freeze({
  decision: 'decisions',
  goal: 'goals',
  case: 'cases',
  premise: 'premises',
  delegation: 'delegations',
});

export function createEpistemicActions(store, { now, idFactory }) {
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
  const report = () => buildEpistemicReport(store.state, { now: clock(), settings: settings() });

  const seatFor = (right, { fullAccess = false } = {}) => {
    const built = buildSeats(store.state, { now: clock(), settings: settings() });
    const seat = activeSeat(built);
    if (seat.readOnly) {
      return { ok: false, error: 'The declared seat is unresolved and read-only. Choose a valid seat before changing the epistemic ledger.' };
    }
    const verdict = canAct(right, seat);
    if (!verdict.allow) return { ok: false, error: verdict.reason };
    if (fullAccess && !seat.fullAccess) {
      return { ok: false, error: 'Changing the epistemic conventions moves every unknown, every cell and every kappa in the workspace. Only a full-access seat may declare them.' };
    }
    return { ok: true, seat };
  };

  /** The seat an unknown is owned by: the active seat, or the workspace itself. */
  const ownerFor = (seat) => (seat && !seat.fullAccess && seat.id !== 'leader'
    ? { seatId: seat.id, altitudeKey: seat.altitudeKey, rank: seat.rank }
    : { seatId: null, altitudeKey: 'chief', rank: 5 });

  const findUnknown = (id) => (Array.isArray(store.state.epistemicUnknowns) ? store.state.epistemicUnknowns : [])
    .find((row) => row && row.id === id) || null;

  return {
    epistemicReport() {
      return report();
    },

    epistemicBriefText() {
      return epistemicBriefText(report());
    },

    epistemicCsvRows() {
      const current = report();
      if (!current.ok) return current;
      return {
        ok: true,
        rows: epistemicCsvRows(current),
        summary: {
          unknowns: current.summary.unknownN,
          unopened: current.summary.unopenedN,
          verdict: current.calibration.verdict.key,
        },
      };
    },

    epistemicAttentionCount() {
      return epistemicAttentionCount(store.state, { now: clock(), settings: settings() });
    },

    epistemicConventions() {
      return epistemicConventions(settings());
    },

    epistemicSettings() {
      return { ...normalizeEpistemicSettings(settings()) };
    },

    /**
     * Signals this workspace can see that have not been frozen into the ledger
     * yet — the preview a leader reads BEFORE deciding to harvest, so the spine
     * is never the first place they learn what the record already said.
     */
    epistemicPreview() {
      const current = report();
      if (!current.ok) return current;
      const stored = new Set((Array.isArray(store.state.epistemicUnknowns) ? store.state.epistemicUnknowns : [])
        .filter((row) => row && row.origin !== 'declared')
        .map((row) => `${row.sourceType}:${row.sourceId}|${row.signalKey || ''}`));
      const fresh = harvestSignals(store.state, { now: clock(), settings: settings() })
        .filter((signal) => !stored.has(`${signal.sourceType}:${signal.sourceId}|${signal.signalKey}`));
      return {
        ok: true,
        pendingN: fresh.length,
        byClass: fresh.reduce((acc, signal) => {
          acc[signal.className] = (acc[signal.className] || 0) + 1;
          return acc;
        }, {}),
        sample: fresh.slice(0, 12).map((signal) => ({
          className: signal.className,
          title: signal.title,
          evidencesOn: signal.evidencesOn,
          route: signal.route,
        })),
      };
    },

    /** A question a human wrote down. Content from a person, never from the record. */
    epistemicDeclare({ title, expiresOn, belief } = {}) {
      const right = seatFor('record-epistemic-unknown');
      if (!right.ok) return fail(right.error);
      const text = String(title || '').trim().slice(0, EPISTEMIC_LIMITS.titleChars);
      if (text.length < 12) {
        return fail('Write the question in at least a dozen characters. A one-word unknown cannot be answered, only remembered.', 'title');
      }
      const today = dayKey(clock());
      const expiry = String(expiresOn || '').trim();
      const expires = /^\d{4}-\d{2}-\d{2}$/.test(expiry) ? expiry : addDays(today, epistemicConventions(settings()).epistemicExpiryDays);
      if (expires <= today) {
        return fail('The declared expiry must be after today. An unknown that expires before you can look at it is a way of not looking.', 'expiresOn');
      }
      if ((store.state.epistemicUnknowns || []).length >= EPISTEMIC_LIMITS.unknowns) {
        return fail(`The unknown ledger is full at ${EPISTEMIC_LIMITS.unknowns}. Answer or dismiss a few before adding another.`);
      }
      const owner = ownerFor(right.seat);
      const id = idFactory('unknown');
      store.update((draft) => {
        draft.epistemicUnknowns = Array.isArray(draft.epistemicUnknowns) ? draft.epistemicUnknowns : [];
        draft.epistemicUnknowns.push({
          id,
          title: text,
          className: 'declared',
          origin: 'declared',
          signalKey: 'declared',
          discipline: 'people',
          sourceType: null,
          sourceId: null,
          sourceRoute: '#/epistemic?panel=unknowns',
          evidenceClass: 'people',
          severity: 2,
          ownerSeatId: owner.seatId,
          altitudeKey: owner.altitudeKey,
          rank: owner.rank,
          harvestedOn: today,
          evidencesOn: today,
          expiresOn: expires,
          state: 'unopened',
          openedOn: null,
          answeredOn: null,
          answer: '',
          dismissReason: '',
          belief: typeof belief === 'boolean' ? belief : null,
          refs: [],
          timeline: [{ at: clock().toISOString(), on: today, kind: 'declared', text: 'Declared by a human: a question the record cannot answer.', by: owner.seatId }],
          engineVersion: 'epistemic-ledger-2026.11-v1',
          createdAt: clock().toISOString(),
          updatedAt: clock().toISOString(),
        });
      }, {
        type: EPISTEMIC_EVENTS.DECLARED,
        entity: 'unknown',
        entityId: id,
        summary: `Declared one unknown, expiring ${expires}, owned at ${right.seat.label}`,
      });
      return saved({ id, report: report() });
    },

    /** Close one unknown with an act. The answer is required — silence is not one. */
    epistemicAnswer({ id, answer } = {}) {
      const right = seatFor('record-epistemic-unknown');
      if (!right.ok) return fail(right.error);
      const row = findUnknown(id);
      if (!row) return fail('That unknown is not in this workspace.', 'id');
      const text = String(answer || '').trim().slice(0, EPISTEMIC_LIMITS.noteChars);
      if (text.length < 8) {
        return fail('Record what you actually found. An unknown closed without a sentence is an unknown dismissed with extra steps.', 'answer');
      }
      if (['answered', 'dismissed'].includes(row.state)) {
        return fail('That unknown is already closed. Closing it twice would rewrite an answer the record already holds.', 'id');
      }
      const today = dayKey(clock());
      store.update((draft) => {
        const draft2 = (draft.epistemicUnknowns || []).find((item) => item && item.id === id);
        if (!draft2) return;
        draft2.state = 'answered';
        draft2.answeredOn = today;
        draft2.answer = text;
        draft2.updatedAt = clock().toISOString();
        draft2.timeline = Array.isArray(draft2.timeline) ? draft2.timeline : [];
        draft2.timeline.push({ at: clock().toISOString(), on: today, kind: 'answered', text, by: right.seat.id });
      }, {
        type: EPISTEMIC_EVENTS.ANSWERED,
        entity: 'unknown',
        entityId: id,
        summary: `Answered one ${row.className} unknown dated ${row.harvestedOn}`,
      });
      return saved({ id, report: report() });
    },

    /** Close one unknown with a written reason. A dismissal without one is refused. */
    epistemicDismiss({ id, reason } = {}) {
      const right = seatFor('record-epistemic-unknown');
      if (!right.ok) return fail(right.error);
      const row = findUnknown(id);
      if (!row) return fail('That unknown is not in this workspace.', 'id');
      const text = String(reason || '').trim().slice(0, 600);
      if (text.length < 10) {
        return fail('Write why this signal is not worth carrying. The dismissal rate is printed beside the answer rate, so a dismissal has to say something.', 'reason');
      }
      if (['answered', 'dismissed'].includes(row.state)) {
        return fail('That unknown is already closed.', 'id');
      }
      const today = dayKey(clock());
      store.update((draft) => {
        const draft2 = (draft.epistemicUnknowns || []).find((item) => item && item.id === id);
        if (!draft2) return;
        draft2.state = 'dismissed';
        draft2.dismissReason = text;
        draft2.updatedAt = clock().toISOString();
        draft2.timeline = Array.isArray(draft2.timeline) ? draft2.timeline : [];
        draft2.timeline.push({ at: clock().toISOString(), on: today, kind: 'dismissed', text, by: right.seat.id });
      }, {
        type: EPISTEMIC_EVENTS.DISMISSED,
        entity: 'unknown',
        entityId: id,
        summary: `Dismissed one ${row.className} unknown with a written reason`,
      });
      return saved({ id, report: report() });
    },

    /**
     * Freeze a belief. `pairs` is a list of `{ subjectType, subjectId, belief }`
     * chosen from the open work on record. A pair whose subject ALREADY has a
     * resolved outcome is refused: a belief about a known result is not a
     * prediction, and ADR-0102 refused the same move for decision locks.
     */
    epistemicObserve({ question, confidencePct, pairs } = {}) {
      const right = seatFor('record-epistemic-unknown');
      if (!right.ok) return fail(right.error);
      const list = Array.isArray(pairs) ? pairs : [];
      if (!list.length) {
        return fail('Choose at least one piece of open work to declare a belief about. A belief about nothing cannot be graded.', 'pairs');
      }
      if ((store.state.epistemicObservations || []).length >= EPISTEMIC_LIMITS.observations) {
        return fail(`The observation ledger is full at ${EPISTEMIC_LIMITS.observations}.`);
      }
      const today = dayKey(clock());
      const clean = [];
      const refused = [];
      for (const pair of list.slice(0, EPISTEMIC_LIMITS.pairsPerObservation)) {
        const subjectType = String(pair?.subjectType || '');
        const collection = SUBJECT_COLLECTIONS[subjectType];
        if (!collection) {
          refused.push('an unrecognised subject type');
          continue;
        }
        const record = (store.state[collection] || []).find((row) => row && row.id === pair.subjectId);
        if (!record) {
          refused.push(`a ${subjectType} that is not in this workspace`);
          continue;
        }
        const truth = outcomeOfSubject(store.state, { subjectType, subjectId: pair.subjectId });
        if (truth !== null) {
          refused.push(`a ${subjectType} whose outcome is already on the record`);
          continue;
        }
        clean.push({
          subjectType,
          subjectId: pair.subjectId,
          belief: pair.belief === true,
          declaredOn: today,
          note: String(pair.note || '').slice(0, 400),
        });
      }
      if (!clean.length) {
        return fail(`Nothing in this list can be predicted: ${refused.slice(0, 3).join(', ')}. A belief about work whose outcome is already known is a memory, not a forecast — and grading it as foresight is exactly what this workspace refuses to do.`, 'pairs');
      }
      const owner = ownerFor(right.seat);
      const id = idFactory('epiobs');
      store.update((draft) => {
        draft.epistemicObservations = Array.isArray(draft.epistemicObservations) ? draft.epistemicObservations : [];
        draft.epistemicObservations.push({
          id,
          declaredOn: today,
          declaredAt: clock().toISOString(),
          ownerSeatId: owner.seatId,
          altitudeKey: owner.altitudeKey,
          rank: owner.rank,
          question: String(question || '').trim().slice(0, 300),
          confidencePct: Math.min(99, Math.max(1, Math.round(Number(confidencePct) || 70))),
          pairs: clean,
          pairN: clean.length,
          gradedOn: null,
          cells: null,
          unpairedN: 0,
          engineVersion: 'epistemic-ledger-2026.11-v1',
          createdAt: clock().toISOString(),
        });
      }, {
        type: EPISTEMIC_OBSERVED,
        entity: 'epistemicobservation',
        entityId: id,
        summary: `Froze a belief about ${clean.length} piece(s) of open work at ${right.seat.label}`,
      });
      return saved({ id, refused, report: report() });
    },

    epistemicScan() {
      const right = seatFor('record-epistemic-unknown');
      if (!right.ok) return fail(right.error);
      store.update(() => {}, {
        type: EPISTEMIC_EVENTS.SCAN,
        entity: right.seat.fullAccess ? 'workspace' : 'epistemic',
        entityId: right.seat.fullAccess ? 'all' : right.seat.id,
        summary: 'Explicitly re-harvested the record, escalated ageing unknowns, expired the unanswered ones and re-graded every frozen belief',
      });
      return saved({ report: report() });
    },

    epistemicSetConventions(patch = {}) {
      const right = seatFor('govern-epistemic', { fullAccess: true });
      if (!right.ok) return fail(right.error);
      const before = normalizeEpistemicSettings(settings());
      const merged = normalizeEpistemicSettings({ ...before, ...(patch || {}) });
      const changed = Object.keys(merged).filter((key) => merged[key] !== before[key]);
      if (!changed.length) return saved({ changed: [], report: report() });
      store.update((draft) => {
        if (!draft.settings) draft.settings = {};
        Object.assign(draft.settings, merged);
      }, {
        type: EPISTEMIC_EVENTS.CONVENTIONS,
        entity: 'epistemic',
        entityId: 'conventions',
        summary: `Changed epistemic-ledger conventions: ${changed.map((key) => `${key}=${merged[key]}`).join(', ')}`,
      });
      return saved({ changed, report: report() });
    },
  };
}

/**
 * The observation event's type. Exported as a plain constant too, so the tests
 * and the ledger (which imports the registry, not the actions) agree on the one
 * string without either importing the other.
 */
export const EPISTEMIC_OBSERVED = EPISTEMIC_EVENTS.OBSERVED;
export { epistemicMarkerId };
