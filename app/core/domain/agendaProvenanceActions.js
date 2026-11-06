/**
 * app/core/domain/agendaProvenanceActions.js — commands and scoped adapters for
 * the 1:1 agenda provenance ledger (ADR-0113).
 *
 * Reads are pure, seat-scoped adapters (registered in SAFE_READS). The writes
 * are exactly two, both human commands, both span-checked:
 *
 *   filePrompt     "I will raise THIS exact prompt with THIS person." Copies the
 *                  prompt verbatim (so the commitment survives the waiting list
 *                  being truncated), stamps the filing seat and day, writes one
 *                  `prepares-for` lineage edge to the person, and logs the event
 *                  in the SAME atomic transaction. It never edits `talkingPoints`
 *                  and never marks anything as raised.
 *
 *   withdrawFiled  "I am no longer raising this." Append-only: the row is
 *                  marked withdrawn with its reason and day; it is never deleted,
 *                  because a promise that quietly disappeared is exactly the
 *                  failure this ledger exists to make impossible.
 *
 * NOTHING here writes a receipt. Whether a filed prompt was actually raised is
 * re-derived on read from the 1:1 record the human already logged
 * (`resolvedTopics`, or an agenda line marked discussed). A tick-box would be a
 * second, decaying record of the same conversation.
 */

import { dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import {
  agendaAttentionCount, agendaBrief, agendaCsvRows, agendaRollUp, agendaSpanReading,
  buildAgendaLedger, buildAgendaPlan, personQueue,
} from './agendaProvenance.js';
import { normalizeAgendaSettings } from './agendaProvenanceSchema.js';
import { AGENDA_EVENTS, AGENDA_LIMITS, AGENDA_RULE_IDS, classifyTopic } from './agendaProvenanceRegistry.js';

export function createAgendaActions(store, { now, idFactory }) {
  const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  // `store.update()` returns the new state (not a result object), so success is
  // reported from `store.persistError`. `ok` is set LAST and deliberately: a
  // payload field can never silently overwrite the success flag.
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
      return { ok: false, error: 'The declared seat is unresolved and read-only. Choose a valid seat before filing an agenda line.' };
    }
    const verdict = canAct(right, seat);
    if (!verdict.allow) return { ok: false, error: verdict.reason };
    return { ok: true, seat, built };
  };

  /** The people this seat may hold a 1:1 with — their own detail boundary. */
  const scopeIds = (seat) => {
    if (!seat || seat.fullAccess) return null;
    return [...(seat.scope || [])];
  };

  const inScope = (seat, personId) => {
    if (!seat || seat.fullAccess) return true;
    return Boolean(seat.scope?.has?.(personId));
  };

  return {
    /* ---------------------------------------------------------------- reads */

    agendaRead() {
      const built = buildSeats(store.state, { now: clock(), settings: settings() });
      const seat = activeSeat(built);
      const personIds = scopeIds(seat);
      const ledger = buildAgendaLedger(store.state, { personIds, now: clock(), settings: settings() });
      return {
        ok: true,
        rank: seat?.rank ?? 5,
        fullAccess: Boolean(seat?.fullAccess),
        row: ledger,
        people: (store.state.people || [])
          .filter((p) => p.status !== 'archived' && (!personIds || personIds.includes(p.id)))
          .map((p) => ({ id: p.id, name: p.name, role: p.role, team: p.team, queue: personQueue(p) })),
      };
    },

    agendaPlan(personId) {
      const built = buildSeats(store.state, { now: clock(), settings: settings() });
      const seat = activeSeat(built);
      if (!inScope(seat, personId)) return fail('That person is outside your detail boundary. File and read agenda lines only for people in your own span.');
      const plan = buildAgendaPlan(store.state, personId, { now: clock(), settings: settings() });
      if (plan.missing) return fail('That person record no longer exists.');
      return { ok: true, plan };
    },

    agendaRollUp(personIds = null) {
      const built = buildSeats(store.state, { now: clock(), settings: settings() });
      const seat = activeSeat(built);
      const scoped = personIds && Array.isArray(personIds) ? personIds : scopeIds(seat);
      const roll = agendaRollUp(store.state, { personIds: scoped, rank: seat?.rank ?? 5, now: clock(), settings: settings() });
      return { ok: true, roll, span: agendaSpanReading(store.state, { personIds: scoped, now: clock(), settings: settings() }) };
    },

    agendaBriefText() {
      const built = buildSeats(store.state, { now: clock(), settings: settings() });
      const seat = activeSeat(built);
      return { ok: true, text: agendaBrief(store.state, { personIds: scopeIds(seat), now: clock(), settings: settings() }) };
    },

    agendaCsvRows() {
      const built = buildSeats(store.state, { now: clock(), settings: settings() });
      const seat = activeSeat(built);
      return agendaCsvRows(store.state, { personIds: scopeIds(seat), rank: seat?.rank ?? 5, now: clock(), settings: settings() });
    },

    agendaAttentionCount() {
      const built = buildSeats(store.state, { now: clock(), settings: settings() });
      const seat = activeSeat(built);
      return agendaAttentionCount(store.state, { personIds: scopeIds(seat), now: clock() });
    },

    agendaSettings() {
      const conventions = normalizeAgendaSettings(settings());
      return {
        ok: true,
        conventions,
        bounds: {
          agendaReceiptFloor: [3, 40],
          agendaStaleAfterDays: [3, 120],
          agendaAutoPropagate: 'boolean',
        },
      };
    },

    /* --------------------------------------------------------------- writes */

    /**
     * File one exact prompt for one person's next 1:1.
     *
     * `sourceKind` records where the prompt came from (`their-topic`,
     * `engine-prompt`, `manual`) so the receipt and the roll-up can separate
     * "we raised their question" from "we raised the engine's question".
     */
    agendaFile(input = {}) {
      const seatCheck = seatFor('prepare-agenda');
      if (!seatCheck.ok) return seatCheck;
      const { seat } = seatCheck;
      const personId = String(input.personId || '').trim();
      const prompt = String(input.prompt || '').trim().replace(/\s+/g, ' ').slice(0, AGENDA_LIMITS.topicChars);
      const person = (store.state.people || []).find((p) => p.id === personId && p.status !== 'archived');
      if (!person) return fail('Choose an active person in your span.', 'personId');
      if (!inScope(seat, personId)) return fail('That person is outside your detail boundary. You can only file agenda lines for people in your own span.', 'personId');
      if (prompt.length < 4) return fail('Copy the exact prompt you intend to raise — at least four characters.', 'prompt');
      const filedOn = dayKey(clock());
      const existing = (store.state.agendaEntries || []).find((e) => e.personId === personId
        && e.prompt.toLowerCase() === prompt.toLowerCase() && e.status !== 'withdrawn');
      if (existing) return fail('That exact prompt is already filed for this person. Withdraw the earlier line first if you intend to re-file it.', 'prompt');

      const id = idFactory('agd');
      const queued = (person.talkingPoints || []).some((t) => String(t).toLowerCase() === prompt.toLowerCase());
      const classification = classifyTopic(prompt);
      const sourceKind = ['their-topic', 'engine-prompt', 'manual'].includes(input.sourceKind)
        ? input.sourceKind
        : (queued ? (classification.engine ? 'engine-prompt' : 'their-topic') : 'manual');

      store.update((draft) => {
        draft.agendaEntries = Array.isArray(draft.agendaEntries) ? draft.agendaEntries : [];
        draft.agendaEntries.push({
          id,
          personId,
          prompt,
          family: classification.family,
          owedTo: classification.owedTo,
          filedOn,
          filedAt: clock().toISOString(),
          filedBySeatId: seat.id || null,
          sourceKind,
          sourceId: input.sourceId ? String(input.sourceId).slice(0, 120) : null,
          note: String(input.note || '').trim().slice(0, 400),
          status: 'filed',
          withdrawnOn: null,
          withdrawnInMeetingId: null,
          version: 'agenda-provenance-2026.11-v1',
        });
        ensureEntityLink(draft, {
          sourceType: 'agendaentry',
          sourceId: id,
          targetType: 'person',
          targetId: personId,
          relation: 'prepares-for',
          ruleId: AGENDA_RULE_IDS.LEDGER,
          summary: 'A human filed this exact prompt for the next 1:1. It is a commitment, not a queue entry.',
        }, { idFactory, todayStr: filedOn, nowIso: clock().toISOString() });
      }, {
        type: AGENDA_EVENTS.FILED,
        entity: 'agendaEntry',
        entityId: id,
        summary: `Agenda line filed for ${person.name}: “${prompt.slice(0, 70)}” (${classification.label}).`,
      });
      return saved({ id, prompt, personId, owedTo: classification.owedTo, family: classification.family, filedOn });
    },

    /**
     * Withdraw a filed line, with the reason recorded. Append-only: the row is
     * never deleted, so the record of what was promised survives what happened.
     */
    agendaWithdraw(input = {}) {
      const seatCheck = seatFor('prepare-agenda');
      if (!seatCheck.ok) return seatCheck;
      const { seat } = seatCheck;
      const id = String(input.id || '').trim();
      const entry = (store.state.agendaEntries || []).find((e) => e.id === id);
      if (!entry) return fail('That filed agenda line no longer exists.');
      if (!inScope(seat, entry.personId)) return fail('That filed line belongs to a person outside your detail boundary.');
      if (entry.status === 'withdrawn') return fail('That line is already withdrawn.');
      const reason = String(input.reason || '').trim().slice(0, 300);
      if (reason.length < 4) return fail('Record why you are withdrawing it — the next leader to read this record needs to know.', 'reason');
      const withdrawnOn = dayKey(clock());
      store.update((draft) => {
        const live = (draft.agendaEntries || []).find((e) => e.id === id);
        if (!live) return;
        live.status = 'withdrawn';
        live.withdrawnOn = withdrawnOn;
        live.withdrawnInMeetingId = input.meetingId ? String(input.meetingId).slice(0, 80) : null;
        live.note = [live.note, `Withdrawn ${withdrawnOn}: ${reason}`].filter(Boolean).join(' · ').slice(0, 400);
      }, {
        type: AGENDA_EVENTS.WITHDRAWN,
        entity: 'agendaEntry',
        entityId: id,
        summary: `Agenda line withdrawn with a reason: ${reason.slice(0, 120)}`,
      });
      return saved({ id, withdrawnOn });
    },

    /** Explicit scan: re-derive the ledger and log what it sees. Writes nothing. */
    agendaScan() {
      const seatCheck = seatFor('prepare-agenda');
      if (!seatCheck.ok) return seatCheck;
      const { seat } = seatCheck;
      const span = agendaSpanReading(store.state, { personIds: scopeIds(seat), now: clock(), settings: settings() });
      store.update(() => {}, {
        type: AGENDA_EVENTS.SCAN,
        entity: 'workspace',
        entityId: '',
        summary: `Agenda ledger re-derived: ${span.reading.queueN} prompt(s), ${span.reading.filedOpenN} open and ${span.reading.filedStaleN} stale filed line(s), receipt ${span.reading.receiptRatePct === null ? 'refused' : `${span.reading.receiptRatePct}%`}. Nothing was written to any promise.`,
      });
      return saved({ span });
    },

    /** Re-declare the printed conventions (rank 4–5 and a full-access seat). */
    agendaSetConventions(input = {}) {
      const built = buildSeats(store.state, { now: clock(), settings: settings() });
      const seat = activeSeat(built);
      if (!seat || seat.readOnly) return fail('Choose a valid seat before re-declaring the agenda conventions.');
      if ((seat.rank ?? 0) < 4) return fail('Re-declaring the conventions re-prices every span’s receipt floor. Only a director-and-above seat may declare them.');
      if (!seat.fullAccess) return fail('Re-declaring the conventions requires a full-access seat.');
      const next = normalizeAgendaSettings({ ...settings(), ...input });
      store.update((draft) => {
        draft.settings = { ...draft.settings, ...next };
      }, {
        type: 'settings.updated',
        entity: 'settings',
        entityId: 'agenda',
        summary: `Agenda conventions re-declared: receipt floor ${next.agendaReceiptFloor}, stale after ${next.agendaStaleAfterDays} days.`,
      });
      return saved({ conventions: next });
    },
  };
}
