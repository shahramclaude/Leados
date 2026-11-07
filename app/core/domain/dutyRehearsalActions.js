/**
 * app/core/domain/dutyRehearsalActions.js — Explicit rehearsal records'
 * commands (ADR-0128, Schema v117).
 *
 * Three writes and one read. Every write is a dated act by a seat that could
 * have been THERE — the duty holder, a leadership ancestor of the holder, or
 * the cover themselves; nothing here lets an unrelated seat attest to an
 * observation it was not positioned to make.
 *
 *   dutyRehearsalRecord   "This declared cover practised this duty on THAT day,
 *                          in this mode — and here is what it showed."
 *                          One atomic `store.update`: the rehearsal row, one
 *                          `attests-rehearsal-of` edge to the declared cover
 *                          row it is evidence for, one `rolls-up-to` edge per
 *                          leadership span from the holder upward, and the
 *                          audit event. Outcome `ready` opens NO decision: a
 *                          certification adds no risk to the record. Outcome
 *                          `gaps` opens a governed decision quoting the
 *                          recorder's words verbatim, because a drill that
 *                          found the exposure BEFORE the absence is the drill
 *                          working — and an unrecorded gap is the failure this
 *                          ledger exists to prevent.
 *
 *   dutyRehearsalRevoke   "That attestation no longer holds, because…"
 *                          Append-only: the row is marked revoked with its day
 *                          and reason and never deleted, so a certification
 *                          that quietly disappeared cannot masquerade as a
 *                          rehearsal that never happened.
 *
 *   dutyRehearsalScan     an explicit re-derivation, logged as an event.
 *
 * There is deliberately NO command that records a rehearsal for a cover that
 * is not declared, none that schedules or reminds anyone to rehearse, none
 * that certifies readiness from a calendar entry or a cc list, and none that
 * stores an exercise verdict: whether a rehearsal counts for a given absence
 * is re-derived from the preparation window on every read (ADR-0125's index).
 */

import { dayKey, addDays } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { LEADER_ID } from './chain.js';
import { parseDutyId } from './dutyCoverageSchema.js';
import { activeAbsenceFor } from './dutyAbsenceSchema.js';
import { normalizeDutyRehearsals, rosterAncestors } from './dutyRehearsalSchema.js';
import { buildDutyCoverageReport } from './dutyCoverage.js';
import {
  DUTY_REHEARSAL_ENGINE_VERSION,
  DUTY_REHEARSAL_EVENTS,
  DUTY_REHEARSAL_LIMITS,
  DUTY_REHEARSAL_MODES,
  DUTY_REHEARSAL_MODE_LABELS,
  DUTY_REHEARSAL_OUTCOMES,
  DUTY_REHEARSAL_REFUSALS,
  DUTY_REHEARSAL_RELATION,
} from './dutyRehearsalRegistry.js';

/** The derived attestation strength of one row, given the holder's ancestor set. */
export function attestationFor(row, ancestors) {
  if (!row) return 'third-party';
  if (row.recordedBySeatId === row.seatId) return 'holder';
  if (row.recordedBySeatId === row.coverSeatId) return 'self';
  if (ancestors?.has(row.recordedBySeatId)) return 'supervisor';
  return 'third-party';
}

export function createDutyRehearsalActions(store, { now, idFactory }) {
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
      return fail(DUTY_REHEARSAL_REFUSALS.unresolvedSeat);
    }
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, seat, built };
  };

  const rehearsals = () => (Array.isArray(store.state.dutyRehearsals) ? store.state.dutyRehearsals : []);
  const covers = () => (Array.isArray(store.state.dutyCovers) ? store.state.dutyCovers : []);

  /** The leadership ancestors of one seat, from the built chain (LEADER_ID included: the chief sits above every holder). */
  const ancestorsOf = (built, seatId) => {
    const out = new Set();
    let cursor = built.chain.nodes.get(seatId)?.parentId || null;
    let guard = 0;
    while (cursor && guard < 16) {
      out.add(cursor);
      if (cursor === LEADER_ID) break;
      cursor = built.chain.nodes.get(cursor)?.parentId || null;
      guard += 1;
    }
    return out;
  };

  /**
   * Resolve the cover row a rehearsal attests, and refuse anything that is not
   * an act by a seat that could have been there. The row must be active, it
   * must still point at a live duty line, and the recording seat must BE the
   * holder, the cover, or a leadership ancestor of the holder — the same fact
   * the schema re-checks against the roster on reload.
   */
  const resolveAttestation = (seat, built, coverRowId) => {
    const id = String(coverRowId || '').trim();
    if (!id) return { ok: false, error: 'Choose the declared cover whose rehearsal you are recording.', field: 'coverRowId' };
    const row = covers().find((r) => r && r.id === id);
    if (!row) return { ok: false, error: 'That declared cover no longer exists in this workspace.', field: 'coverRowId' };
    if (row.status !== 'active') {
      return { ok: false, error: 'That cover has been revoked, so there is no live ask for a rehearsal to attest to. Declare the cover again first.', field: 'coverRowId' };
    }
    const parsed = parseDutyId(row.dutyId);
    if (!parsed) return { ok: false, error: 'That cover points at a duty line that is no longer declared.' };
    const holder = built.byId.get(parsed.seatId);
    if (!holder) return { ok: false, error: 'The seat that holds this duty no longer exists in this roster.' };
    const duty = (holder.duties || []).find((d) => d.key === parsed.dutyKey);
    if (!duty) return { ok: false, error: 'That seat no longer declares this duty, so a rehearsal of it attests nothing.' };
    if (!built.byId.has(row.coverId)) return { ok: false, error: 'The person this cover names is no longer in the roster.' };

    const ancestors = ancestorsOf(built, parsed.seatId);
    const positioned = seat.id === parsed.seatId || seat.id === row.coverId || ancestors.has(seat.id);
    if (!positioned) {
      // The undeclared operator view gets its own printed refusal: it is not a
      // rank failure, it is the absence of anyone who could have observed.
      if (seat.fullAccess && !built.byId.has(seat.id)) {
        return { ok: false, error: DUTY_REHEARSAL_REFUSALS.operatorView, field: 'coverRowId' };
      }
      return {
        ok: false,
        error: 'A rehearsal is recorded by a seat that was there: the duty holder, a leader above the holder, or the cover themselves. This seat holds none of those positions, so it cannot attest to an observation it was not placed to make.',
        field: 'coverRowId',
      };
    }
    return { ok: true, row, parsed, holder, duty, ancestors };
  };

  /**
   * The rehearsal ledger as one seat can see it: rows for duty lines held
   * inside the seat's span, rows about the seat itself as the cover, and rows
   * the seat recorded. Above the manager altitude names and notes are withheld
   * at construction and labels, dates, modes, outcomes and counts survive —
   * the same identity wall the rest of the duty spine carries.
   */
  const buildList = (seat, built) => {
    const namesVisible = seat.fullAccess || (seat.rank ?? 1) <= 2;
    const people = Array.isArray(store.state.people) ? store.state.people : [];
    const rows = [];
    for (const row of rehearsals()) {
      if (!row) continue;
      const visible = seat.fullAccess
        || seat.scope.has(row.seatId)
        || row.coverSeatId === seat.id
        || row.recordedBySeatId === seat.id;
      if (!visible) continue;
      const holder = built.byId.get(row.seatId);
      const cover = built.byId.get(row.coverSeatId);
      const duty = (holder?.duties || []).find((d) => d.key === row.dutyKey);
      rows.push({
        id: row.id,
        coverRowId: row.coverRowId,
        dutyId: row.dutyId,
        dutyKey: row.dutyKey,
        dutyLabel: duty?.label || row.dutyKey,
        seatId: row.seatId,
        holderLabel: holder?.label || 'a seat no longer in this roster',
        holderName: namesVisible ? (holder?.name || null) : null,
        coverSeatId: row.coverSeatId,
        coverLabel: cover?.label || 'a person no longer in this roster',
        coverName: namesVisible ? (cover?.name || null) : null,
        recordedBySeatId: row.recordedBySeatId,
        recordedByLabel: built.byId.get(row.recordedBySeatId)?.label || 'a seat no longer in this roster',
        attestation: attestationFor(row, new Set(rosterAncestors(people, row.seatId))),
        rehearsedOn: row.rehearsedOn,
        recordedOn: row.recordedOn,
        mode: row.mode,
        modeLabel: DUTY_REHEARSAL_MODE_LABELS[row.mode] || row.mode,
        outcome: row.outcome,
        note: namesVisible ? row.note : null,
        decisionId: row.decisionId,
        status: row.status,
        revokedOn: row.revokedOn,
        revokeReason: namesVisible ? row.revokeReason : null,
        canRevoke: row.status === 'active' && (row.recordedBySeatId === seat.id || seat.fullAccess),
      });
    }
    rows.sort((a, b) => (a.rehearsedOn < b.rehearsedOn ? 1 : a.rehearsedOn > b.rehearsedOn ? -1 : 0));
    const active = rows.filter((r) => r.status === 'active');
    return {
      rows,
      namesVisible,
      summary: {
        rowsN: rows.length,
        activeN: active.length,
        readyN: active.filter((r) => r.outcome === 'ready').length,
        gapsN: active.filter((r) => r.outcome === 'gaps').length,
        attestedN: active.filter((r) => r.attestation === 'holder' || r.attestation === 'supervisor').length,
        selfReportedN: active.filter((r) => r.attestation === 'self').length,
      },
    };
  };

  return {
    /* ---------------------------------------------------------------- reads */

    /** Safe read at every altitude; identity is already scoped to the acting seat by construction. */
    dutyRehearsalList() {
      const check = seatFor('attest-duty-rehearsal');
      if (!check.ok) return check;
      const { seat, built } = check;
      return { ok: true, ...buildList(seat, built) };
    },

    /* --------------------------------------------------------------- writes */

    /**
     * Record one dated rehearsal of one declared cover. The rehearsal day must
     * be real (not after today, not more than the declared lag behind the
     * recording), the mode must be one of the four declared practices, and a
     * gaps outcome must name what the rehearsal found — a gaps attestation
     * without words leaves the governed decision with nothing to act on.
     */
    dutyRehearsalRecord(input = {}) {
      const check = seatFor('attest-duty-rehearsal');
      if (!check.ok) return check;
      const { seat, built } = check;
      const resolved = resolveAttestation(seat, built, input.coverRowId);
      if (!resolved.ok) return fail(resolved.error, resolved.field);
      const { row, parsed, holder, duty } = resolved;

      const at = clock();
      const today = dayKey(at);
      const rehearsedOn = typeof input.rehearsedOn === 'string' ? input.rehearsedOn.trim() : '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(rehearsedOn)) {
        return fail('Record the rehearsal as the ISO date it happened (rehearsedOn).', 'rehearsedOn');
      }
      if (rehearsedOn > today) {
        return fail('A rehearsal is a record of practice that happened. A future date is a plan, not an attestation — record it on the day it was run.', 'rehearsedOn');
      }
      if (rehearsedOn < addDays(today, -DUTY_REHEARSAL_LIMITS.maxRecordLagDays)) {
        return fail(`That rehearsal is more than ${DUTY_REHEARSAL_LIMITS.maxRecordLagDays} day(s) behind today. An attestation from memory that far back is not an observation anyone can weigh; record practice inside the lag window.`, 'rehearsedOn');
      }
      if (!DUTY_REHEARSAL_MODES.includes(input.mode)) {
        return fail(`Choose the practice that was run: ${DUTY_REHEARSAL_MODES.join(', ')}. "We did a rehearsal" without a mode is a claim no reader can weigh.`, 'mode');
      }
      if (!DUTY_REHEARSAL_OUTCOMES.includes(input.outcome)) {
        return fail('Record the outcome: ready (the cover can answer this duty) or gaps (the rehearsal found what must change first).', 'outcome');
      }
      const note = String(input.note || '').trim().slice(0, DUTY_REHEARSAL_LIMITS.noteChars);
      if (input.outcome === 'gaps' && note.length < 8) {
        return fail('Name what the rehearsal found. A gaps attestation without words opens a governed decision with nothing in it — the next reader needs the gap, not the grade.', 'note');
      }

      const rowId = idFactory('rehearsal');
      const decisionId = input.outcome === 'gaps' ? idFactory('dec') : null;
      const dutyLabel = duty.label;
      const coverPerson = built.byId.get(row.coverId);
      const coverName = coverPerson?.name || row.coverId;
      const modeLabel = DUTY_REHEARSAL_MODE_LABELS[input.mode] || input.mode;
      const absence = activeAbsenceFor(Array.isArray(store.state.absencePlans) ? store.state.absencePlans : [], parsed.seatId);
      const attestation = seat.id === parsed.seatId ? 'the duty holder'
        : seat.id === row.coverId ? 'the cover themselves (self-reported)'
          : 'a leader above the holder';

      store.update((draft) => {
        draft.dutyRehearsals = Array.isArray(draft.dutyRehearsals) ? draft.dutyRehearsals : [];
        draft.dutyRehearsals.unshift({
          id: rowId,
          coverRowId: row.id,
          dutyId: parsed.dutyId,
          dutyKey: parsed.dutyKey,
          seatId: parsed.seatId,
          coverSeatId: row.coverId,
          // The recorder is a seat that was there — the action refuses any
          // other seat, and the schema refuses it again on reload against the
          // roster, so a hand-edited file cannot invent an observer.
          recordedBySeatId: seat.id,
          rehearsedOn,
          recordedOn: today,
          recordedAt: at.toISOString(),
          mode: input.mode,
          outcome: input.outcome,
          note,
          decisionId,
          status: 'active',
          revokedOn: null,
          revokedAt: null,
          revokeReason: '',
          version: DUTY_REHEARSAL_ENGINE_VERSION,
        });
        // The graph, not a second table: this record ATTESTS THE REHEARSAL OF
        // the cover declaration it is evidence for, so the ask, the answer and
        // the practice stay one story.
        ensureEntityLink(draft, {
          sourceType: 'rehearsal',
          sourceId: rowId,
          targetType: 'dutycover',
          targetId: row.id,
          relation: DUTY_REHEARSAL_RELATION,
          ruleId: '',
          summary: `A dated rehearsal of “${dutyLabel}” was recorded for the declared cover on ${rehearsedOn} (${modeLabel}); outcome: ${input.outcome === 'ready' ? 'ready' : 'gaps found'}.`,
        }, { idFactory, todayStr: today, nowIso: at.toISOString() });

        // The rehearsal climbs every leadership span from the HOLDER upward in
        // the same transaction: the practice of a duty is a fact the spans
        // above the holder are accountable for reading — the mid-manager's
        // Monday is counting explicit rehearsals across leads, not opening
        // seats one by one.
        let cursor = parsed.seatId;
        let guard = 0;
        while (cursor && cursor !== LEADER_ID && guard < 16) {
          const target = cursor;
          ensureEntityLink(draft, {
            sourceType: 'rehearsal', sourceId: rowId, targetType: 'person', targetId: target,
            relation: 'rolls-up-to', ruleId: '',
            summary: 'The rehearsal record rolls up to this leadership span.',
          }, { idFactory, todayStr: today, nowIso: at.toISOString() });
          cursor = built.chain.nodes.get(cursor)?.parentId || null;
          guard += 1;
        }

        if (input.outcome === 'gaps') {
          const driver = String(draft.settings?.leaderName || '').slice(0, 120);
          const windowText = absence ? `${absence.from} → ${absence.to}` : 'the dates this cover would be relied on';
          const question = [
            `A rehearsal of the “${dutyLabel}” duty line (held by ${holder.name} (${holder.label}), cover declared as ${coverName}) was run on ${rehearsedOn} as a ${modeLabel} and FOUND GAPS.`,
            `The recorder — ${attestation} — wrote, in their own words: ${note}`,
            absence
              ? `The holder has a declared absence ${windowText}; the preparation window for it is already running.`
              : 'No dated absence is declared for the holder yet; the gap is recorded before any window forces it.',
            'A drill that finds the exposure before the absence is the drill working. What remains open is what changes before the cover is relied on — this decision records the gap so it is governed, not quietly re-covered by a green badge.',
          ].join(' ');
          draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
          draft.decisions.unshift({
            id: decisionId,
            title: `What changes before “${dutyLabel}” is relied on, now that its rehearsal found gaps?`,
            question,
            date: today,
            reversibility: 'reversible',
            driver,
            approver: driver,
            contributors: '',
            informed: '',
            options: [
              { id: idFactory('opt'), label: 'Re-rehearse the duty with the cover before the window and record the new outcome', pros: 'The gap closes on the same ledger: a ready rehearsal inside the preparation window grades the line covered again.', cons: 'Costs another dated session; the record only counts if it lands before the absence starts.' },
              { id: idFactory('opt'), label: 'Name a different eligible cover for this duty line', pros: 'The register then asks that person (ADR-0127) and their rehearsal can be run instead.', cons: 'A substitute nobody exercises still reads thin; the ask clock restarts.' },
              { id: idFactory('opt'), label: 'Cover the duty at the level above for those dates', pros: 'An ancestor cover needs no new access and rises to the span that owns the duty (subsidiarity).', cons: 'Moves the duty’s horizon up a rank; the level above must have the time on the day.' },
              { id: idFactory('opt'), label: 'Accept the gap and record what waits until the holder returns', pros: 'Honest when the duty can wait; the register keeps printing the exposure.', cons: 'The open work in the line carries the wait; nothing here re-grades the risk for you.' },
            ],
            chosen: '',
            rationale: `ADR-0128: a dated rehearsal (${rehearsedOn}, ${modeLabel}) of the “${dutyLabel}” duty line attested by ${attestation} found gaps. The attestation is the human act; this decision records the exposure it surfaced so the gap is governed before the window opens rather than discovered inside it.`,
            reviewOn: absence ? absence.from : addDays(today, 7),
            reviewedOn: null,
            outcome: 'pending',
            outcomeNotes: '',
            forecastProbability: null,
            decidedOn: null,
            createdAt: at.toISOString(),
          });
        }
      }, {
        type: input.outcome === 'gaps' ? DUTY_REHEARSAL_EVENTS.GAPS : DUTY_REHEARSAL_EVENTS.RECORD,
        entity: 'rehearsal',
        entityId: rowId,
        summary: input.outcome === 'gaps'
          ? `Rehearsal found gaps: ${seat.label} recorded a ${modeLabel} of “${dutyLabel}” (held by ${holder.label}) rehearsed ${rehearsedOn}; the gap is a governed decision. Note: ${note.slice(0, 120)}`.slice(0, 300)
          : `Cover rehearsal recorded: ${seat.label} attested a ${modeLabel} of “${dutyLabel}” (held by ${holder.label}) rehearsed ${rehearsedOn}; outcome ready.`.slice(0, 300),
      });
      return saved({
        id: rowId,
        decisionId,
        outcome: input.outcome,
        mode: input.mode,
        rehearsedOn,
        dutyId: parsed.dutyId,
        coverRowId: row.id,
        attestation: seat.id === parsed.seatId ? 'holder' : (seat.id === row.coverId ? 'self' : 'supervisor'),
      });
    },

    /** Withdraw an attestation, with the reason recorded. Append-only. */
    dutyRehearsalRevoke(input = {}) {
      const check = seatFor('attest-duty-rehearsal');
      if (!check.ok) return check;
      const { seat } = check;
      const id = String(input.id || '').trim();
      const row = rehearsals().find((r) => r && r.id === id);
      if (!row) return fail('That rehearsal record no longer exists.');
      if (row.recordedBySeatId !== seat.id && !seat.fullAccess) {
        return fail('Only the seat that recorded this attestation — or the full-access operator — may revoke it. A certification someone else quietly removed is not a revocation; it is a disappearance.');
      }
      if (row.status !== 'active') return fail('That rehearsal record is already revoked.');
      const reason = String(input.reason || '').trim().slice(0, DUTY_REHEARSAL_LIMITS.noteChars);
      if (reason.length < 6) return fail('Record why the attestation no longer holds — the plan panel is reading this evidence.', 'reason');
      const at = clock();
      const today = dayKey(at);
      store.update((draft) => {
        const live = (draft.dutyRehearsals || []).find((r) => r && r.id === id);
        if (!live) return;
        live.status = 'revoked';
        live.revokedOn = today;
        live.revokedAt = at.toISOString();
        live.revokeReason = reason;
      }, {
        type: DUTY_REHEARSAL_EVENTS.REVOKE,
        entity: 'rehearsal',
        entityId: id,
        summary: `Rehearsal attestation revoked (${row.outcome}, ${row.mode}, rehearsed ${row.rehearsedOn}) with a reason: ${reason.slice(0, 140)}`.slice(0, 300),
      });
      return saved({ id, revokedOn: today });
    },

    /** Explicit scan: re-derive the rehearsal reading and log what it sees. Certifies nothing. */
    dutyRehearsalScan() {
      const check = seatFor('attest-duty-rehearsal');
      if (!check.ok) return check;
      const { seat, built } = check;
      const list = buildList(seat, built);
      const report = buildDutyCoverageReport(store.state, { now: clock(), settings: settings() });
      const exercise = report.absences?.exercise || {};
      store.update(() => {}, {
        type: DUTY_REHEARSAL_EVENTS.SCAN,
        entity: 'workspace',
        entityId: '',
        summary: `Cover rehearsals re-derived at ${seat.label}: ${list.summary.activeN} active attestation(s) in scope (${list.summary.readyN} ready, ${list.summary.gapsN} gaps), ${list.summary.attestedN} holder/supervisor-attested, ${list.summary.selfReportedN} self-reported. Pre-window: ${exercise.rehearsedCoversN ?? 0} cover(s) graded rehearsed, ${exercise.gapsCoversN ?? 0} graded gaps. Nothing was certified or scheduled.`.slice(0, 300),
      });
      return saved({ summary: list.summary, exercise });
    },
  };
}
