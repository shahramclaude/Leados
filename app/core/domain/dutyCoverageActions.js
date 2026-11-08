/**
 * app/core/domain/dutyCoverageActions.js — the Duty Coverage Register's commands
 * (ADR-0121, Schema v114).
 *
 * Exactly three writes, all human, all dated, all span-checked:
 *
 *   dutyCoverageDesignate  "If I am not here, THIS person is answerable for
 *                           THIS duty." One atomic `store.update`: the cover row,
 *                           one `prepares-for` typed edge to the person, one
 *                           governed DACI decision naming the consequence if the
 *                           cover fails, and the audit event. Nothing else is
 *                           touched and no duty is re-assigned.
 *
 *   dutyCoverageRevoke     "This cover no longer holds, and here is why."
 *                           Append-only: the row is marked revoked with its day
 *                           and reason and never deleted, because a responsibility
 *                           that quietly disappeared is exactly the failure this
 *                           register exists to make impossible.
 *
 *   dutyCoverageSetConventions  re-declares the two printed conventions (rank
 *                           4–5 and a full-access seat, like every other module).
 *
 * There is deliberately NO command that assigns cover automatically, and none
 * that writes a "coverage verified" tick: exercise is derived from the dated
 * records other modules already keep. A tick-box would be a second, decaying
 * record of the same fact. The only non-writing command that leaves a trace is
 * the explicit scan, which logs what the register currently sees.
 */

import { dayKey, addDays } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { harvestWork, LEADER_ID } from './chain.js';
import {
  buildDutyCoverageReport, dutyCandidates, dutyReading, dutyCoverageCsvRows,
  dutyCoverageBriefText, dutyCoverageAttentionCount,
} from './dutyCoverage.js';
import { parseDutyId, normalizeDutyCoverageSettings } from './dutyCoverageSchema.js';
import {
  DUTY_COVERAGE_BOUNDS,
  DUTY_COVERAGE_EVENTS,
  DUTY_COVERAGE_LIMITS,
  DUTY_COVERAGE_RELATION,
  DUTY_COVERAGE_ENGINE_VERSION,
} from './dutyCoverageRegistry.js';

export function createDutyCoverageActions(store, { now, idFactory }) {
  const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  /** `store.update()` returns the new STATE, so success is read from persistError.
   *  `ok` is set LAST so a payload field can never overwrite the success flag. */
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
      return fail('The declared seat is unresolved and read-only. Choose a valid seat before declaring duty cover.');
    }
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, seat, built };
  };

  const covers = () => (Array.isArray(store.state.dutyCovers) ? store.state.dutyCovers : []);

  return {
    /* ---------------------------------------------------------------- reads */

    dutyCoverageReport() {
      const built = buildSeats(store.state, { now: clock(), settings: settings() });
      const seat = activeSeat(built);
      if (seat.readOnly) return fail('The declared seat is unresolved and read-only; the register refuses to read a boundary it cannot resolve.');
      return { ok: true, report: buildDutyCoverageReport(store.state, { now: clock(), settings: settings() }) };
    },

    /** The candidate pool for ONE duty, with every refusal printed. */
    dutyCoverageCandidates(dutyId) {
      const parsed = parseDutyId(dutyId);
      if (!parsed) return fail('That duty identifier is not a declared duty line.', 'dutyId');
      const check = seatFor('declare-duty-cover');
      if (!check.ok) return check;
      const { seat, built } = check;
      const owner = built.byId.get(parsed.seatId);
      if (!owner) return fail('That duty belongs to a seat that no longer exists in this roster.', 'dutyId');
      if (!seat.fullAccess && seat.id !== owner.id) {
        return fail('You may only declare cover for a duty line you hold. A duty rises to its own seat, never to a peer.', 'dutyId');
      }
      const duty = (owner.duties || []).find((d) => d.key === parsed.dutyKey);
      if (!duty) return fail('That seat does not declare this duty.', 'dutyId');
      const items = harvestWork(store.state, built.chain, { now: clock(), settings: settings() });
      const reading = dutyReading(store.state, built, owner, duty, { now: clock(), settings: settings(), items });
      return { ok: true, dutyId: reading.dutyId, duty: { key: reading.key, label: reading.label, question: reading.question }, candidates: reading.candidates, covers: reading.covers, band: reading.band, bandReason: reading.bandReason };
    },

    dutyCoverageBriefText() {
      const check = seatFor('declare-duty-cover');
      if (!check.ok) return check;
      const report = buildDutyCoverageReport(store.state, { now: clock(), settings: settings() });
      return { ok: true, text: dutyCoverageBriefText(report) };
    },

    dutyCoverageCsvRows() {
      const check = seatFor('declare-duty-cover');
      if (!check.ok) return check;
      const report = buildDutyCoverageReport(store.state, { now: clock(), settings: settings() });
      return { ok: true, rows: dutyCoverageCsvRows(report) };
    },

    dutyCoverageSettings() {
      return {
        ok: true,
        conventions: normalizeDutyCoverageSettings(settings()),
        bounds: DUTY_COVERAGE_BOUNDS,
      };
    },

    /* --------------------------------------------------------------- writes */

    /**
     * Declare a stand-in for ONE duty line. The candidate must be eligible
     * under the same rule the reading prints, the note is required (a bare name
     * with no reason is not a reviewed declaration), and the governed decision
     * names the consequence if the cover fails — so the risk is on the record in
     * the same transaction, not in someone's head.
     */
    dutyCoverageDesignate(input = {}) {
      const check = seatFor('declare-duty-cover');
      if (!check.ok) return check;
      const { seat, built } = check;
      const parsed = parseDutyId(input.dutyId);
      if (!parsed) return fail('Choose a declared duty line to cover.', 'dutyId');
      const owner = built.byId.get(parsed.seatId);
      if (!owner) return fail('That duty belongs to a seat that no longer exists; declare cover from the live seat.', 'dutyId');
      const holdsDuty = seat.fullAccess || seat.id === owner.id;
      const ancestorOfOwner = !seat.fullAccess && owner.scope?.has(seat.id);
      if (!holdsDuty && !ancestorOfOwner) {
        return fail('A duty’s cover is declared by the seat that holds it, or by the reporting-tree span above it. A peer cannot declare cover inside another span.', 'dutyId');
      }
      const duty = (owner.duties || []).find((d) => d.key === parsed.dutyKey);
      if (!duty) return fail('That seat does not declare this duty.', 'dutyId');
      const coverId = String(input.coverId || '').trim();
      if (!coverId) return fail('Name the person who is answerable when the seat is absent.', 'coverId');
      const items = harvestWork(store.state, built.chain, { now: clock(), settings: settings() });
      const reading = dutyReading(store.state, built, owner, duty, { now: clock(), settings: settings(), items });
      const candidate = reading.candidates.find((c) => c.personId === coverId);
      if (!candidate) {
        return fail('That person is outside the reporting tree this duty can rise through. A cover is reached through the tree, never sideways to a peer.', 'coverId');
      }
      if (!candidate.eligible) return fail(candidate.reason, 'coverId');
      const note = String(input.note || '').trim().slice(0, DUTY_COVERAGE_LIMITS.noteChars);
      if (note.length < 8) return fail('Write one line saying what this person would be answerable for. A bare name is not a reviewed declaration.', 'note');
      const existing = covers().filter((r) => r && r.dutyId === reading.dutyId && r.status === 'active' && r.coverId === coverId);
      if (existing.length) return fail('That person is already the declared cover for this duty line.', 'coverId');
      const activeForDuty = covers().filter((r) => r && r.dutyId === reading.dutyId && r.status === 'active');
      if (activeForDuty.length >= DUTY_COVERAGE_LIMITS.coversPerDuty) {
        return fail(`This duty already carries its declared maximum of ${DUTY_COVERAGE_LIMITS.coversPerDuty} covers. A duty is not a committee — revoke one first.`, 'coverId');
      }

      const at = clock();
      const today = dayKey(at);
      const rowId = idFactory('dutycover');
      const decisionId = idFactory('dec');
      const dutyLabel = reading.label;
      const failureLine = input.failureMode
        ? String(input.failureMode).trim().slice(0, DUTY_COVERAGE_LIMITS.noteChars)
        : `Nobody is answerable for "${dutyLabel}" and ${reading.openN} open item(s) in it stall until ${owner.name} returns.`;

      store.update((draft) => {
        draft.dutyCovers = Array.isArray(draft.dutyCovers) ? draft.dutyCovers : [];
        draft.dutyCovers.unshift({
          id: rowId,
          dutyId: reading.dutyId,
          seatId: parsed.seatId,
          dutyKey: parsed.dutyKey,
          coverId,
          note,
          decisionId,
          declaredBySeatId: seat.fullAccess ? null : seat.id,
          declaredOn: today,
          declaredAt: at.toISOString(),
          status: 'active',
          revokedOn: null,
          revokedAt: null,
          revokeReason: '',
          verifiedOn: null,
          version: DUTY_COVERAGE_ENGINE_VERSION,
        });
        // The graph, not a second table: the cover PREPARES FOR the person it
        // answers for. Same relation ADR-0113 already registers.
        ensureEntityLink(draft, {
          sourceType: 'dutycover',
          sourceId: rowId,
          targetType: 'person',
          targetId: coverId,
          relation: DUTY_COVERAGE_RELATION,
          ruleId: '',
          summary: `A human declared this person answerable for the “${dutyLabel}” duty when the seat is absent.`,
        }, { idFactory, todayStr: today, nowIso: at.toISOString() });

        const driver = String(draft.settings?.leaderName || '').slice(0, 120);
        const decision = {
          id: decisionId,
          title: `If ${owner.name} is absent, is ${candidate.name} able to answer “${dutyLabel}”?`,
          question: [
            `${candidate.name} (${candidate.label}) is now the declared stand-in for the “${dutyLabel}” duty line held by ${owner.name} (${owner.label}).`,
            candidate.reason,
            `The consequence of the cover failing: ${failureLine}`,
            'What remains open is whether that person’s access is real. The register derives "exercised" from dated work records, so this decision asks the seat holder to confirm the stand-in can actually reach the duty\'s records before the absence, not after it.',
          ].join(' '),
          date: today,
          reversibility: 'reversible',
          driver,
          approver: driver,
          contributors: '',
          informed: '',
          options: [
            { id: idFactory('opt'), label: 'Confirm the cover and have the stand-in open the duty’s records once before the absence', pros: 'Turns a declaration into evidence: the register will read the cover as exercised on the first recorded work inside the span.', cons: 'Costs the stand-in a short session now rather than a slow discovery on the day.' },
            { id: idFactory('opt'), label: 'Declare cover with an eligible person at the level above instead', pros: 'Ancestor cover needs no new access and rises to the span that owns the LCA (subsidiarity).', cons: 'Moves the duty’s horizon up a rank; the level above must have the time on the day.' },
            { id: idFactory('opt'), label: 'Let the duty lapse during the absence and record the delay', pros: 'Honest when the absence is short and the work can wait.', cons: `${reading.openN} open item(s) in this duty line carry the wait; the register keeps printing the gap.` },
          ],
          chosen: '',
          rationale: `ADR-0121: the seat holder declared a stand-in for one duty line (${reading.dutyId}). The register derives eligibility from the reporting tree and exercise from dated records; this decision records the consequence of the cover failing and asks the seat to confirm access before the absence.`,
          reviewOn: addDays(today, 14),
          reviewedOn: null,
          outcome: 'pending',
          outcomeNotes: '',
          forecastProbability: null,
          decidedOn: null,
          createdAt: at.toISOString(),
        };
        draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
        draft.decisions.unshift(decision);
        // The decision climbs every leadership ancestor of the covered seat in
        // the same transaction — the generalized graph, not a second system.
        let cursor = parsed.seatId;
        let guard = 0;
        while (cursor && cursor !== LEADER_ID && guard < 16) {
          const target = cursor;
          ensureEntityLink(draft, {
            sourceType: 'decision', sourceId: decisionId, targetType: 'person', targetId: target,
            relation: 'rolls-up-to', ruleId: '',
            summary: 'The duty-cover confirmation rolls up to this leadership span.',
          }, { idFactory, todayStr: today, nowIso: at.toISOString() });
          cursor = built.chain.nodes.get(cursor)?.parentId || null;
          guard += 1;
        }
      }, {
        type: DUTY_COVERAGE_EVENTS.DESIGNATE,
        entity: 'dutycover',
        entityId: rowId,
        summary: `Duty cover declared: “${dutyLabel}” (${owner.label}) → ${candidate.name}. ${reading.openN} open item(s) in the duty line.`.slice(0, 300),
      });
      return saved({ id: rowId, decisionId, dutyId: reading.dutyId, band: reading.band });
    },

    /** Withdraw a declared cover, with the reason recorded. Append-only. */
    dutyCoverageRevoke(input = {}) {
      const check = seatFor('declare-duty-cover');
      if (!check.ok) return check;
      const { seat } = check;
      const id = String(input.id || '').trim();
      const row = covers().find((r) => r && r.id === id);
      if (!row) return fail('That declared cover no longer exists.');
      if (!seat.fullAccess && row.declaredBySeatId !== seat.id && row.seatId !== seat.id) {
        return fail('Only the seat that declared this cover, or the seat that holds the duty, may revoke it.');
      }
      if (row.status !== 'active') return fail('That cover is already revoked.');
      const reason = String(input.reason || '').trim().slice(0, DUTY_COVERAGE_LIMITS.reasonChars);
      if (reason.length < 6) return fail('Record why the cover no longer holds — the next person to read this register needs to know.', 'reason');
      const at = clock();
      const today = dayKey(at);
      store.update((draft) => {
        const live = (draft.dutyCovers || []).find((r) => r && r.id === id);
        if (!live) return;
        live.status = 'revoked';
        live.revokedOn = today;
        live.revokedAt = at.toISOString();
        live.revokeReason = reason;
      }, {
        type: DUTY_COVERAGE_EVENTS.REVOKE,
        entity: 'dutycover',
        entityId: id,
        summary: `Duty cover revoked (${row.dutyId}) with a reason: ${reason.slice(0, 140)}`.slice(0, 300),
      });
      return saved({ id, revokedOn: today });
    },

    /** Explicit scan: re-derive the register and log what it sees. Writes no cover. */
    dutyCoverageScan() {
      const check = seatFor('declare-duty-cover');
      if (!check.ok) return check;
      const report = buildDutyCoverageReport(store.state, { now: clock(), settings: settings() });
      store.update(() => {}, {
        type: DUTY_COVERAGE_EVENTS.SCAN,
        entity: 'workspace',
        entityId: '',
        summary: `Duty coverage re-derived: ${report.summary.coveredN} covered, ${report.summary.thinN} thin, ${report.summary.ineligibleN} ineligible, ${report.summary.gapN} without cover across ${report.summary.dutiesN} declared duty line(s). Handover checks: ${report.absences?.handoverDigest?.summary?.checksN ?? 0} inference-only cover check(s). Span readings: ${report.spanReadings?.summary?.actsN ?? 0} in span, ${report.spanReadings?.summary?.attentionN ?? 0} need a human. Nothing was assigned.`.slice(0, 300),
      });
      return saved({ summary: report.summary });
    },

    dutyCoverageSetConventions(input = {}) {
      const built = buildSeats(store.state, { now: clock(), settings: settings() });
      const seat = activeSeat(built);
      if (!seat || seat.readOnly) return fail('Choose a valid seat before re-declaring the duty-coverage conventions.');
      if ((seat.rank ?? 0) < 4) return fail('Re-declaring these conventions re-prices every duty line’s exercise window. Only a rank-4 and above seat may declare them.');
      if (!seat.fullAccess) return fail('Re-declaring the conventions requires a full-access seat.');
      const patch = {};
      for (const key of Object.keys(DUTY_COVERAGE_BOUNDS)) if (input[key] !== undefined) patch[key] = input[key];
      if (!Object.keys(patch).length) return fail('Nothing to declare: name dutyCoverageExerciseDays, dutyCoverageConcentrationPct, dutyCoverageBranchFloorN, dutyCoverageBranchRateFloorN, dutyCoverageBranchCap, dutyCoverageReadingResponseDays or dutyCoverageReadingValidDays.', 'settings');
      const next = normalizeDutyCoverageSettings({ ...settings(), ...patch });
      store.update((draft) => {
        draft.settings = { ...draft.settings, ...next };
      }, {
        type: DUTY_COVERAGE_EVENTS.SETTINGS,
        entity: 'settings',
        entityId: 'duty-coverage',
        summary: `Duty-coverage conventions re-declared: exercise window ${next.dutyCoverageExerciseDays} day(s), concentration threshold ${next.dutyCoverageConcentrationPct}%, branch disclosure floor ${next.dutyCoverageBranchFloorN} duty line(s), branch rate floor ${next.dutyCoverageBranchRateFloorN}, ${next.dutyCoverageBranchCap} branch(es) compared, reading response window ${next.dutyCoverageReadingResponseDays} day(s), reading validity ${next.dutyCoverageReadingValidDays} day(s).`.slice(0, 300),
      });
      return saved({ conventions: next });
    },

    /** Badge count: the duties carrying open work with no usable cover. */
    dutyCoverageAttentionCount() {
      return dutyCoverageAttentionCount(store.state, { now: clock(), settings: settings() });
    },
  };
}
