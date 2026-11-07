/**
 * app/core/domain/dutyStandbyActions.js — Cover acknowledgement's commands
 * (ADR-0127, Schema v116).
 *
 * Three writes and two reads. Every write is the ANSWERER's own act, dated, and
 * span-checked; nothing here lets one person consent on another's behalf.
 *
 *   dutyStandbyAcknowledge  "I am the named cover, and I accept — for THESE dates."
 *                           One atomic `store.update`: the answer row, one
 *                           `accepts-standby-for` edge to the cover declaration
 *                           it answers, one `rolls-up-to` edge per leadership
 *                           ancestor (the answer is a fact the span above must
 *                           be able to read), and the audit event. It opens NO
 *                           decision: accepting adds no risk to the record.
 *
 *   dutyStandbyDecline      "I am the named cover, and I cannot — here because."
 *                           Same transaction, except the reason is required and
 *                           a governed decision is opened naming exactly what
 *                           stops, because a refusal is an exposure and an
 *                           unrecorded exposure is the failure this register
 *                           exists to prevent.
 *
 *   dutyStandbyRevoke       "That answer no longer holds, because…"
 *                           Append-only: the row is marked revoked with its day
 *                           and reason and never deleted, so a consent that
 *                           quietly disappeared cannot masquerade as a lapse.
 *
 * There is deliberately NO command that answers for someone else, none that
 * chases or reminds a cover, none that extends an acceptance to dates the cover
 * never saw, and none that marks a cover "acknowledged" on behalf of a seat the
 * operator happens to be holding for a minute. Confirming a stand-in is the
 * stand-in's act or it is not a confirmation.
 */

import { dayKey, addDays } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { harvestWork, LEADER_ID } from './chain.js';
import { parseDutyId } from './dutyCoverageSchema.js';
import {
  askWindowFor, standbyAsks, standbyForCover, standbyBriefLines, refusedOnlyDuties,
} from './dutyStandby.js';
import { activeAnswerFor, parseStandbyWindow, normalizeDutyStandbySettings } from './dutyStandbySchema.js';
import {
  DUTY_STANDBY_BOUNDS,
  DUTY_STANDBY_DEFAULTS,
  DUTY_STANDBY_ENGINE_VERSION,
  DUTY_STANDBY_EVENTS,
  DUTY_STANDBY_LIMITS,
  DUTY_STANDBY_RELATION,
} from './dutyStandbyRegistry.js';

export function createDutyStandbyActions(store, { now, idFactory }) {
  const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  /** `store.update()` returns the new STATE, so success is read from persistError. */
  const saved = (extra = {}) => ({
    ...extra,
    saved: !store.persistError,
    warning: store.persistError || null,
    propagations: store.lastPropagations || [],
    ok: true,
  });

  const seatFor = (right) => {
    const built = buildSeats(store.state, { now: clock(), settings: settings() });
    const seat = activeSeat(built);
    if (seat.readOnly) {
      return fail('The declared seat is unresolved and read-only. Choose a valid seat before answering a standby ask.');
    }
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, seat, built };
  };

  const answers = () => (Array.isArray(store.state.dutyStandbyAnswers) ? store.state.dutyStandbyAnswers : []);
  const covers = () => (Array.isArray(store.state.dutyCovers) ? store.state.dutyCovers : []);

  /**
   * Resolve the cover row an answer is about, and refuse anything that is not the
   * acting seat's own ask. This is the one gate that keeps the acknowledgement a
   * first-person act: the row must be active, it must still point at a live duty
   * line, and its `coverId` must BE the acting seat.
   */
  const resolveOwnAsk = (seat, built, coverRowId) => {
    const id = String(coverRowId || '').trim();
    if (!id) return { ok: false, error: 'Choose the standby ask you are answering.', field: 'coverRowId' };
    const row = covers().find((r) => r && r.id === id);
    if (!row) return { ok: false, error: 'That declared cover no longer exists in this workspace.' };
    if (row.status !== 'active') return { ok: false, error: 'That cover has been revoked by the seat that declared it, so there is no ask left to answer.' };
    if (row.coverId !== seat.id) {
      return {
        ok: false,
        error: 'Only the person named as the cover can answer for it. A declaration is answered by the stand-in themselves, never by the seat that named them.',
        field: 'coverRowId',
      };
    }
    const parsed = parseDutyId(row.dutyId);
    if (!parsed) return { ok: false, error: 'That cover points at a duty line that is no longer declared.' };
    const holder = built.byId.get(parsed.seatId);
    if (!holder) return { ok: false, error: 'The seat that holds this duty no longer exists in this roster.' };
    const duty = (holder.duties || []).find((d) => d.key === parsed.dutyKey);
    if (!duty) return { ok: false, error: 'That seat no longer declares this duty, so the ask has nothing behind it.' };
    const existing = activeAnswerFor(answers(), row.id);
    if (existing) {
      return {
        ok: false,
        error: `You already answered this ask on ${existing.answeredOn} (${existing.answer}). Revoke that answer first if it no longer holds — the register keeps the first one rather than stacking a second silently.`,
        field: 'coverRowId',
      };
    }
    return { ok: true, row, parsed, holder, duty, existing };
  };

  /**
   * The window an answer is given for. The DEFAULT is the exact ask window derived
   * from the holder's declared absence (or the bounded rolling window when there is
   * none), because that is the thing being asked about — but the answerer may
   * narrow it, and may never widen it past the declared maximum. A "yes" wider
   * than the ask is not consent to anything extra; it is a bigger claim than the
   * question, so it is refused rather than silently accepted.
   */
  const resolveWindow = (input, askWindow) => {
    if (input.from === undefined && input.to === undefined) {
      return { ok: true, window: { from: askWindow.from, to: askWindow.to } };
    }
    const window = parseStandbyWindow({ from: input.from, to: input.to });
    if (!window) {
      return {
        ok: false,
        error: `Give the standby window as two ISO dates (from, to), from not after to, at most ${DUTY_STANDBY_LIMITS.maxStandbyDays} days.`,
        field: 'window',
      };
    }
    if (window.from < askWindow.from || window.to > askWindow.to) {
      return {
        ok: false,
        error: `The ask runs ${askWindow.from} → ${askWindow.to}. Answer for dates inside it: accepting a wider window would be consent to something nobody asked you about.`,
        field: 'window',
      };
    }
    return { ok: true, window: { from: window.from, to: window.to } };
  };

  const writeAnswer = ({ seat, built, row, parsed, holder, duty, answer, window, note, at, today }) => {
    const rowId = idFactory('standby');
    const decisionId = answer === 'declined' ? idFactory('dec') : null;
    const dutyLabel = duty.label;
    const openN = (harvestWork(store.state, built.chain, { now: clock(), settings: settings() }) || [])
      .filter((item) => (duty.sources || []).includes(item.type)).length;
    const windowText = `${window.from} → ${window.to}`;
    const declineReason = note;

    store.update((draft) => {
      draft.dutyStandbyAnswers = Array.isArray(draft.dutyStandbyAnswers) ? draft.dutyStandbyAnswers : [];
      draft.dutyStandbyAnswers.unshift({
        id: rowId,
        coverId: row.id,
        dutyId: parsed.dutyId,
        seatId: parsed.seatId,
        // The answerer IS the cover — the action above refuses any other seat, and
        // the schema refuses it again on reload, so a hand-edited file cannot
        // record consent nobody gave.
        answeredBySeatId: seat.id,
        answer,
        windowFrom: window.from,
        windowTo: window.to,
        note,
        decisionId,
        answeredOn: today,
        answeredAt: at.toISOString(),
        status: 'active',
        revokedOn: null,
        revokedAt: null,
        revokeReason: '',
        version: DUTY_STANDBY_ENGINE_VERSION,
      });
      // The graph, not a second table: this answer ACCEPTS STANDBY FOR the
      // declaration it answers, so the declaration and the answer stay one story.
      ensureEntityLink(draft, {
        sourceType: 'standbyanswer',
        sourceId: rowId,
        targetType: 'dutycover',
        targetId: row.id,
        relation: DUTY_STANDBY_RELATION,
        ruleId: '',
        summary: `The named cover ${answer === 'accepted' ? 'accepted' : 'declined'} the standby ask for “${dutyLabel}” on ${windowText}.`,
      }, { idFactory, todayStr: today, nowIso: at.toISOString() });

      // The answer climbs every leadership ancestor of the cover in the same
      // transaction. A "yes" is not risk, but it IS information the spans above
      // are accountable for: a director must be able to read that their named
      // cover answered without opening a seat that does not belong to them.
      // The climb starts at the answering seat's MANAGER: the answer is the
      // cover's own act, so the cover is the source of the edge, not also its
      // target. Every span above that is accountable for it reads the same fact.
      let cursor = built.chain.nodes.get(seat.id)?.parentId || null;
      let guard = 0;
      while (cursor && cursor !== LEADER_ID && guard < 16) {
        const target = cursor;
        ensureEntityLink(draft, {
          sourceType: 'standbyanswer', sourceId: rowId, targetType: 'person', targetId: target,
          relation: 'rolls-up-to', ruleId: '',
          summary: 'The cover acknowledgement rolls up to this leadership span.',
        }, { idFactory, todayStr: today, nowIso: at.toISOString() });
        cursor = built.chain.nodes.get(cursor)?.parentId || null;
        guard += 1;
      }

      if (answer === 'declined') {
        const driver = String(draft.settings?.leaderName || '').slice(0, 120);
        const question = [
          `${seat.name} (${seat.label}) was named as the stand-in for the “${dutyLabel}” duty line held by ${holder.name} (${holder.label}), and declined it for ${windowText}.`,
          `Their reason, in their own words: ${declineReason}`,
          `${openN} open work item(s) currently sit in that duty line.`,
          'What remains open is who answers for this duty on those dates. The register prints a refusal as a refusal, not as a gap, because a named person considered the ask and said no — which is information a silent blank would have thrown away.',
        ].join(' ');
        draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
        draft.decisions.unshift({
          id: decisionId,
          title: `Who answers for “${dutyLabel}” during ${windowText}, now that ${seat.name} has declined?`,
          question,
          date: today,
          reversibility: 'reversible',
          driver,
          approver: driver,
          contributors: '',
          informed: '',
          options: [
            { id: idFactory('opt'), label: 'Name a different eligible stand-in for this duty line', pros: 'The register then asks that person, and the ask is answered (or printed overdue) on its own record.', cons: 'Costs another ask; a substitute nobody exercises still reads thin.' },
            { id: idFactory('opt'), label: 'Cover the duty at the level above for those dates', pros: 'An ancestor cover needs no new access and rises to the span that owns the duty (subsidiarity).', cons: 'Moves the duty’s horizon up a rank; the level above must have the time on the day.' },
            { id: idFactory('opt'), label: 'Shorten or shift the absence so the exposure lapses', pros: 'Fewer exposed dates; the register grades exactly the days that remain.', cons: 'The absence reason on the record must change with the dates, or the declaration and the plan disagree.' },
            { id: idFactory('opt'), label: 'Accept the refusal and record the delay each exposed item will take', pros: 'Honest when the absence is short and the work can wait.', cons: `${openN} open item(s) carry the wait; the register keeps printing the exposure.` },
          ],
          chosen: '',
          rationale: `ADR-0127: the named cover answered a first-person refusal for ${windowText} on the “${dutyLabel}” duty line. The answer is the human act; this decision records the exposure it creates so the refusal is a governed fact rather than a quiet one.`,
          reviewOn: addDays(window.to, 7),
          reviewedOn: null,
          outcome: 'pending',
          outcomeNotes: '',
          forecastProbability: null,
          decidedOn: null,
          createdAt: at.toISOString(),
        });
      }
    }, {
      type: answer === 'accepted' ? DUTY_STANDBY_EVENTS.ACCEPT : DUTY_STANDBY_EVENTS.DECLINE,
      entity: 'standbyanswer',
      entityId: rowId,
      summary: answer === 'accepted'
        ? `Standby accepted: ${seat.label} for “${dutyLabel}” (held by ${holder.label}) on ${windowText}.`.slice(0, 300)
        : `Standby declined: ${seat.label} for “${dutyLabel}” (held by ${holder.label}) on ${windowText}. Reason: ${declineReason.slice(0, 140)}`.slice(0, 300),
    });
    return saved({ id: rowId, answer, decisionId, window, dutyId: parsed.dutyId, coverId: row.id });
  };

  return {
    /* ---------------------------------------------------------------- reads */

    /**
     * The INCOMING chair: what this seat has been asked to stand behind. Safe read
     * at every altitude; identity is already scoped to the acting seat by
     * construction.
     */
    dutyStandbyForMe() {
      const check = seatFor('answer-duty-standby');
      if (!check.ok) return check;
      const { seat, built } = check;
      const board = standbyForCover(store.state, built, seat, { now: clock(), settings: settings() });
      return { ok: true, board };
    },

    /**
     * The OUTGOING chair: who has answered among the covers this seat has named in
     * its span. This is the director's Monday reading.
     */
    dutyStandbyBoard() {
      const check = seatFor('answer-duty-standby');
      if (!check.ok) return check;
      const { seat, built } = check;
      const board = standbyAsks(store.state, built, seat, { now: clock(), settings: settings() });
      return {
        ok: true,
        board: {
          ...board,
          refusedOnly: refusedOnlyDuties(board),
          brief: standbyBriefLines(board),
          askWindow: askWindowFor(store.state, seat, { now: clock(), settings: settings() }),
        },
      };
    },

    dutyStandbySettings() {
      return {
        ok: true,
        conventions: normalizeDutyStandbySettings(settings(), DUTY_STANDBY_BOUNDS, DUTY_STANDBY_DEFAULTS),
        bounds: DUTY_STANDBY_BOUNDS,
      };
    },

    /* --------------------------------------------------------------- writes */

    dutyStandbyAcknowledge(input = {}) {
      const check = seatFor('answer-duty-standby');
      if (!check.ok) return check;
      const { seat, built } = check;
      const resolved = resolveOwnAsk(seat, built, input.coverRowId);
      if (!resolved.ok) return fail(resolved.error, resolved.field);
      const { row, parsed, holder, duty } = resolved;
      const askWindow = askWindowFor(store.state, holder, { now: clock(), settings: settings() });
      const win = resolveWindow(input, askWindow);
      if (!win.ok) return fail(win.error, win.field);
      const note = String(input.note || '').trim().slice(0, DUTY_STANDBY_LIMITS.noteChars);
      const at = clock();
      return writeAnswer({
        seat, built, row, parsed, holder, duty, answer: 'accepted',
        window: win.window, note, at, today: dayKey(at),
      });
    },

    dutyStandbyDecline(input = {}) {
      const check = seatFor('answer-duty-standby');
      if (!check.ok) return check;
      const { seat, built } = check;
      const resolved = resolveOwnAsk(seat, built, input.coverRowId);
      if (!resolved.ok) return fail(resolved.error, resolved.field);
      const { row, parsed, holder, duty } = resolved;
      const askWindow = askWindowFor(store.state, holder, { now: clock(), settings: settings() });
      const win = resolveWindow(input, askWindow);
      if (!win.ok) return fail(win.error, win.field);
      // A refusal with no words is not a reviewed answer: the next reader needs to
      // know what the person could not take on, not merely that they said no.
      const note = String(input.note || '').trim().slice(0, DUTY_STANDBY_LIMITS.noteChars);
      if (note.length < 8) {
        return fail('Write one line saying why you cannot stand behind this duty for these dates. A refusal without a reason leaves the next reader with nothing to act on.', 'note');
      }
      const at = clock();
      return writeAnswer({
        seat, built, row, parsed, holder, duty, answer: 'declined',
        window: win.window, note, at, today: dayKey(at),
      });
    },

    /** Withdraw an answer, with the reason recorded. Append-only. */
    dutyStandbyRevoke(input = {}) {
      const check = seatFor('answer-duty-standby');
      if (!check.ok) return check;
      const { seat } = check;
      const id = String(input.id || '').trim();
      const row = answers().find((r) => r && r.id === id);
      if (!row) return fail('That answer no longer exists.');
      if (row.answeredBySeatId !== seat.id && !seat.fullAccess) {
        return fail('Only the person who gave this answer — or the full-access operator — may revoke it.');
      }
      if (row.status !== 'active') return fail('That answer is already revoked.');
      const reason = String(input.reason || '').trim().slice(0, DUTY_STANDBY_LIMITS.noteChars);
      if (reason.length < 6) return fail('Record why the answer no longer holds — the seat that named you is reading this too.', 'reason');
      const at = clock();
      const today = dayKey(at);
      store.update((draft) => {
        const live = (draft.dutyStandbyAnswers || []).find((r) => r && r.id === id);
        if (!live) return;
        live.status = 'revoked';
        live.revokedOn = today;
        live.revokedAt = at.toISOString();
        live.revokeReason = reason;
      }, {
        type: DUTY_STANDBY_EVENTS.SCAN,
        entity: 'standbyanswer',
        entityId: id,
        summary: `Cover answer revoked (${row.answer}, ${row.windowFrom} → ${row.windowTo}) with a reason: ${reason.slice(0, 140)}`.slice(0, 300),
      });
      return saved({ id, revokedOn: today });
    },

    /** Explicit scan: re-derive the standby board and log what it sees. Answers nothing. */
    dutyStandbyScan() {
      const check = seatFor('answer-duty-standby');
      if (!check.ok) return check;
      const { seat, built } = check;
      const board = standbyAsks(store.state, built, seat, { now: clock(), settings: settings() });
      store.update(() => {}, {
        type: DUTY_STANDBY_EVENTS.SCAN,
        entity: 'workspace',
        entityId: '',
        summary: `Cover acknowledgement re-derived: ${board.summary.coversN} declared cover(s), ${board.summary.acceptedN} accepted, ${board.summary.declinedN} declined, ${board.summary.lapsedN} lapsed, ${board.summary.overdueN} overdue, ${board.summary.awaitingN} awaiting. Nothing was answered or re-assigned.`.slice(0, 300),
      });
      return saved({ summary: board.summary });
    },

    dutyStandbySetConventions(input = {}) {
      const built = buildSeats(store.state, { now: clock(), settings: settings() });
      const seat = activeSeat(built);
      if (!seat || seat.readOnly) return fail('Choose a valid seat before re-declaring the cover-acknowledgement conventions.');
      if ((seat.rank ?? 0) < 4) return fail('These two conventions move every standby deadline at once. Only a rank-4 and above seat may declare them.');
      if (!seat.fullAccess) return fail('Re-declaring the conventions requires a full-access seat.');
      const patch = {};
      for (const key of Object.keys(DUTY_STANDBY_BOUNDS)) if (input[key] !== undefined) patch[key] = input[key];
      if (!Object.keys(patch).length) return fail('Nothing to declare: name dutyStandbyResponseDays or dutyStandbyWindowDays.', 'settings');
      const next = normalizeDutyStandbySettings({ ...settings(), ...patch }, DUTY_STANDBY_BOUNDS, DUTY_STANDBY_DEFAULTS);
      store.update((draft) => {
        draft.settings = { ...draft.settings, ...next };
      }, {
        type: 'dutyStandby.settings_updated',
        entity: 'settings',
        entityId: 'duty-standby',
        summary: `Cover-acknowledgement conventions re-declared: ${next.dutyStandbyResponseDays} day(s) to answer before an ask reads overdue, ${next.dutyStandbyWindowDays}-day forward standby window where no dated absence is declared.`.slice(0, 300),
      });
      return saved({ conventions: next });
    },
  };
}
