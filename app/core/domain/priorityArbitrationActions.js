/**
 * app/core/domain/priorityArbitrationActions.js — the commands of the Cross-Line
 * Priority Arbitration (ADR-0143, Schema v120).
 *
 * SEVEN human writes, every one dated, span-checked and refused with a printed
 * reason. There is deliberately no eighth that decides for anybody.
 *
 *   priorityOpenCase        "These lines are putting incompatible demands on one
 *                            person. Freeze them now, as each line stated them,
 *                            with the two figures that line declared." Refuses to
 *                            freeze against a person you cannot see, refuses a
 *                            demand from a line that has no live reporting line to
 *                            that person, and refuses to invent a figure the
 *                            manager did not give.
 *
 *   priorityTreatDemand     "Here is what happened to THIS demand: sequenced,
 *                            deferred, reshaped or released — and why." Nothing
 *                            else can move a demand off `pending`.
 *
 *   priorityPropose         "Record the measured recommendation." The ORDER is
 *                            computed by the engine from the frozen integers; the
 *                            caller cannot pass one. Refused while any demand is
 *                            untouched or unscored, because a recommendation over
 *                            half a case is a guess wearing a table.
 *
 *   priorityAgreePrecedence "I am the arbiter. This is the order, this is the
 *                            window, this is when we revisit it, and this is why."
 *                            The ONLY act that makes anything binding, and the
 *                            only one RULE-ARB-01 will issue work from.
 *
 *   priorityRecordAnswer    "This is my answer, as one of the lines in this case:
 *                            I accept, I object, or I abstain — in my own words."
 *                            Enforced to the named lines and the person only.
 *
 *   priorityWithdraw        "This case no longer applies, because…" Append-only.
 *
 *   prioritySetConventions  Re-declare the three printed numbers (rank-4+ only).
 *
 * WHAT NO COMMAND IN THIS FILE WILL DO
 * ------------------------------------
 * It will not select an owner, priority or order on its own; it will not agree a
 * precedence on behalf of an arbiter who has not been identified; it will not
 * issue a task without an agreement; and it will not overwrite a recorded act.
 * Every refusal prints the reason a leader can act on.
 */

import { dayKey, addDays } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { LEADER_ID } from './chain.js';
import { matrixLineScopeFor, buildMatrix } from './matrix.js';
import { buildPriorityReport, priorityBriefText, priorityCsvRows, priorityRank } from './priorityArbitration.js';
import { normalizePrioritySettings } from './priorityArbitrationSchema.js';
import {
  PRIORITY_BOUNDS,
  PRIORITY_EVENTS,
  PRIORITY_LIMITS,
} from './priorityArbitrationRegistry.js';

export function createPriorityArbitrationActions(store, { now, idFactory }) {
  const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  const saved = (extra = {}) => ({
    ...extra,
    saved: !store.persistError,
    warning: store.persistError || null,
    propagations: store.lastPropagations || [],
    ok: true,
  });

  const seatFor = (right) => {
    const at = clock();
    const cfg = settings();
    const built = buildSeats(store.state, {
      now: at,
      settings: cfg,
      lineScope: matrixLineScopeFor(store.state, { now: at, settings: cfg }),
    });
    const seat = activeSeat(built);
    if (seat.readOnly) {
      return fail('The declared seat is unresolved and read-only. Choose a valid seat before opening or agreeing an arbitration.');
    }
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, seat, built };
  };

  const cases = () => (Array.isArray(store.state.priorityArbitrations) ? store.state.priorityArbitrations : []);
  const people = () => (Array.isArray(store.state.people) ? store.state.people : []);
  const activePerson = (id) => people().find((p) => p && p.id === id && p.status !== 'archived') || null;
  const findCase = (id) => cases().find((c) => c && c.id === id) || null;

  /** Can this seat see this person at all — tree OR declared line, as ADR-0141. */
  const seatReaches = (seat, personId) => {
    if (seat.fullAccess) return true;
    if (seat.id === personId) return true;
    if (seat.scope?.has?.(personId)) return true;
    if (seat.lineScope?.has?.(personId)) return true;
    return false;
  };

  const readInt = (input, field, { label, min = 0, max = PRIORITY_LIMITS.valueMax, required = false }) => {
    const raw = input?.[field];
    if (raw === null || raw === undefined || raw === '') {
      return required ? { ok: false, error: `State ${label} as a whole number. A comparison with a missing figure is not a comparison.`, field } : { ok: true, value: null };
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) return { ok: false, error: `${label} must be a whole number.`, field };
    const rounded = Math.round(n);
    if (rounded < min || rounded > max) return { ok: false, error: `${label} must be between ${min} and ${max}.`, field };
    return { ok: true, value: rounded };
  };

  return {
    /* ---------------------------------------------------------------- reads */

    priorityReport() {
      const check = seatFor('open-arbitration');
      if (!check.ok) return check;
      return {
        ok: true,
        report: buildPriorityReport(store.state, { now: clock(), settings: settings(), seat: check.seat }),
      };
    },

    priorityBriefText() {
      const check = seatFor('open-arbitration');
      if (!check.ok) return check;
      const report = buildPriorityReport(store.state, { now: clock(), settings: settings(), seat: check.seat });
      return { ok: true, text: priorityBriefText(report) };
    },

    priorityCsvRows() {
      const check = seatFor('open-arbitration');
      if (!check.ok) return check;
      const report = buildPriorityReport(store.state, { now: clock(), settings: settings(), seat: check.seat });
      return { ok: true, rows: priorityCsvRows(report) };
    },

    prioritySettings() {
      return { ok: true, conventions: normalizePrioritySettings(settings()), bounds: PRIORITY_BOUNDS };
    },

    /** The person/line pool a seat may open a case over, with refusals printed. */
    priorityCandidates() {
      const check = seatFor('open-arbitration');
      if (!check.ok) return check;
      const { seat, built } = check;
      const matrix = buildMatrix(store.state, { now: clock(), settings: settings() });
      const scope = seat.fullAccess
        ? new Set(built.chain.byId.keys())
        : new Set([...(seat.scope || []), ...(seat.lineScope || [])]);
      const rows = [];
      for (const personId of scope) {
        const node = built.chain.byId.get(personId);
        if (!node) continue;
        const lines = (matrix.linesByPerson.get(personId) || []).filter((l) => l.active !== false);
        rows.push({
          personId,
          name: node.name,
          role: node.role || '',
          lineN: lines.length,
          managers: [...new Set(lines.map((l) => l.managerId))].map((managerId) => ({
            managerId,
            name: matrix.nodes.get(managerId)?.name || managerId,
            kind: (lines.find((l) => l.managerId === managerId) || {}).kind || 'functional',
            shareH: (lines.find((l) => l.managerId === managerId) || {}).shareH ?? null,
            rights: (lines.find((l) => l.managerId === managerId) || {}).rights || [],
          })),
          // The one number that decides whether a case is even possible: a person
          // on a single line cannot have a cross-line contention.
          multiLine: lines.length > 1,
        });
      }
      rows.sort((a, b) => (b.multiLine ? 1 : 0) - (a.multiLine ? 1 : 0) || a.name.localeCompare(b.name));
      return {
        ok: true,
        people: rows,
        limits: { demandsPerCase: PRIORITY_LIMITS.demandsPerCase, titleChars: PRIORITY_LIMITS.titleChars },
      };
    },

    /* --------------------------------------------------------------- writes */

    priorityOpenCase(input = {}) {
      const check = seatFor('open-arbitration');
      if (!check.ok) return check;
      const { seat } = check;

      const personId = String(input.personId || '').trim();
      if (!personId) return fail('Name the person whose capacity is contested.', 'personId');
      if (!activePerson(personId)) return fail('That person is not on the active roster.', 'personId');
      if (!seatReaches(seat, personId)) {
        return fail('That person is outside this seat’s span, on the tree and on every declared line. A precedence decided about somebody you cannot see is not a decision you can make.', 'personId');
      }

      const matrix = buildMatrix(store.state, { now: clock(), settings: settings() });
      const lines = (matrix.linesByPerson.get(personId) || []).filter((l) => l.active !== false);
      if (lines.length < 2) {
        return fail(`That person carries ${lines.length} live reporting line${lines.length === 1 ? '' : 's'}. A cross-line contention needs at least two lines placing work on them — with one line there is nobody to arbitrate between, and the demand simply belongs to that manager. Declare the second line on the Matrix panel first.`, 'personId');
      }

      const rawDemands = Array.isArray(input.demands) ? input.demands : [];
      if (rawDemands.length < 2) return fail('Freeze at least two competing demands. One demand is a task, not a contention.', 'demands');
      if (rawDemands.length > PRIORITY_LIMITS.demandsPerCase) {
        return fail(`A case may freeze at most ${PRIORITY_LIMITS.demandsPerCase} demands. Split it, or release the demands that are not really in contention — an arbitration over fifteen items is a re-plan, not a decision.`, 'demands');
      }

      const lineManagerIds = new Set(lines.map((l) => l.managerId));
      const seenManagers = new Map();
      const demands = [];
      for (let index = 0; index < rawDemands.length; index += 1) {
        const raw = rawDemands[index] || {};
        const managerId = String(raw.managerId || '').trim();
        const title = String(raw.title || '').trim().slice(0, PRIORITY_LIMITS.titleChars);
        if (!managerId) return fail(`Demand ${index + 1} names no line. Every demand belongs to a manager who placed it.`, 'demands');
        if (!title) return fail(`Demand ${index + 1} has no title. Write the demand as the line stated it — the arbiter cannot weigh a blank.`, 'demands');
        if (!lineManagerIds.has(managerId)) {
          // The person may genuinely be pushed by a manager with no declared
          // line — that is a gap in the matrix ledger, not something to paper
          // over by freezing a demand from a phantom line.
          return fail(`Demand ${index + 1} names a manager who holds no live line to this person. Declare that line on the Matrix panel first: an arbitration over a line the register does not know is a precedence nobody can be held to.`, 'demands');
        }
        const cod = readInt(raw, 'cod', { label: `demand ${index + 1}’s cost of delay`, required: true });
        if (!cod.ok) return fail(cod.error, 'demands');
        const jobSize = readInt(raw, 'jobSize', { label: `demand ${index + 1}’s job size`, min: 1, required: true });
        if (!jobSize.ok) return fail(jobSize.error, 'demands');
        const chainDays = readInt(raw, 'chainDays', { label: `demand ${index + 1}’s remaining chain in days`, min: 0, max: PRIORITY_LIMITS.chainDaysMax });
        if (!chainDays.ok) return fail(chainDays.error, 'demands');
        if (!seenManagers.has(managerId)) seenManagers.set(managerId, 0);
        seenManagers.set(managerId, seenManagers.get(managerId) + 1);
        const line = lines.find((l) => l.managerId === managerId) || null;
        demands.push({
          id: idFactory('demand'),
          lineId: line?.id || null,
          managerId,
          managerName: matrix.nodes.get(managerId)?.name || managerId,
          kind: line?.kind || 'functional',
          kindLabel: line?.kind || 'functional',
          title,
          dueOn: /^\d{4}-\d{2}-\d{2}$/.test(String(raw.dueOn || '')) ? String(raw.dueOn) : null,
          cod: cod.value,
          jobSize: jobSize.value,
          chainDays: chainDays.value,
          frozenAt: clock().toISOString(),
          treatment: null,
        });
      }

      if (seenManagers.size < 2) {
        return fail('Every frozen demand came from the same manager. A contradiction inside one line is that manager’s own prioritisation, not a cross-line contention.', 'demands');
      }

      const note = String(input.note || '').trim().slice(0, PRIORITY_LIMITS.noteChars);
      const at = clock();
      const caseId = idFactory('arb');
      const personName = matrix.nodes.get(personId)?.name || personId;

      store.update((draft) => {
        draft.priorityArbitrations = Array.isArray(draft.priorityArbitrations) ? draft.priorityArbitrations : [];
        draft.priorityArbitrations.unshift({
          id: caseId,
          personId,
          personName,
          openedOn: dayKey(at),
          openedAt: at.toISOString(),
          openedBySeatId: seat.fullAccess ? null : seat.id,
          note,
          demands,
          proposal: null,
          agreement: null,
          dissents: [],
          withdrawnOn: null,
          withdrawnAt: null,
          withdrawReason: '',
          status: 'open',
        });
      }, {
        type: PRIORITY_EVENTS.OPEN,
        entity: 'arbitration',
        entityId: caseId,
        summary: `Cross-line priority case opened for ${personName}: ${demands.length} demand(s) across ${seenManagers.size} lines frozen.`.slice(0, 300),
      });
      return saved({ id: caseId, personId, demandN: demands.length });
    },

    /** Record what happened to ONE demand. The only way off `pending`. */
    priorityTreatDemand(input = {}) {
      const check = seatFor('open-arbitration');
      if (!check.ok) return check;
      const { seat } = check;
      const caseId = String(input.caseId || '').trim();
      const caseRow = findCase(caseId);
      if (!caseRow) return fail('That arbitration case no longer exists.', 'caseId');
      if (caseRow.status === 'withdrawn') return fail('That case was withdrawn. Record a new one instead of editing a closed record.', 'caseId');
      if (caseRow.agreement) return fail('This case already carries an agreed precedence. A disposition recorded after the agreement would rewrite the record the obligations were issued from — withdraw and re-open instead.', 'caseId');
      if (!seatReaches(seat, caseRow.personId)) return fail('That case is outside this seat’s span.', 'caseId');

      const demandId = String(input.demandId || '').trim();
      const demand = (caseRow.demands || []).find((d) => d.id === demandId);
      if (!demand) return fail('That demand is not part of this case.', 'demandId');

      const disposition = String(input.disposition || '').trim();
      if (!['sequenced', 'deferred', 'reshaped', 'released'].includes(disposition)) {
        return fail('Choose what happens to this demand: sequenced first, deferred, reshaped to fit, or released back to the line.', 'disposition');
      }
      const reason = String(input.reason || '').trim().slice(0, PRIORITY_LIMITS.treatReasonChars);
      if (reason.length < 8) {
        return fail('Write one line saying why this demand is treated this way. A disposition with no reason is a decision nobody can be asked about.', 'reason');
      }

      const at = clock();
      store.update((draft) => {
        const target = (draft.priorityArbitrations || []).find((c) => c && c.id === caseId);
        if (!target) return;
        const row = (target.demands || []).find((d) => d.id === demandId);
        if (!row) return;
        row.treatment = {
          disposition,
          reason,
          decidedOn: dayKey(at),
          decidedBySeatId: seat.fullAccess ? null : seat.id,
        };
      }, {
        type: PRIORITY_EVENTS.PROPOSE,
        entity: 'arbitration',
        entityId: caseId,
        summary: `Demand disposition recorded (${disposition}) on case ${caseId}: ${reason}`.slice(0, 300),
      });
      return saved({ id: caseId, demandId, disposition });
    },

    /** Record the MEASURED recommendation. Binds nobody. */
    priorityPropose(input = {}) {
      const check = seatFor('open-arbitration');
      if (!check.ok) return check;
      const { seat } = check;
      const caseId = String(input.caseId || '').trim();
      const caseRow = findCase(caseId);
      if (!caseRow) return fail('That arbitration case no longer exists.', 'caseId');
      if (caseRow.status === 'withdrawn') return fail('That case was withdrawn; there is nothing to propose.', 'caseId');
      if (caseRow.agreement) return fail('That case already carries an agreed precedence. A proposal recorded after the agreement would sit beside a binding order and invite confusion about which one applies.', 'caseId');
      if (!seatReaches(seat, caseRow.personId)) return fail('That case is outside this seat’s span.', 'caseId');

      const pending = (caseRow.demands || []).filter((d) => !d.treatment);
      if (pending.length) {
        return fail(`${pending.length} of ${caseRow.demands.length} frozen demand(s) carry no disposition yet. Record what happens to every demand before proposing an order: a recommendation that leaves one line's demand untouched is a proposal to ignore that line.`, 'demands');
      }

      const rank = priorityRank(caseRow);
      if (!rank.ranked) {
        return fail(`No order can be proposed: ${rank.reason}`, 'demands');
      }

      const at = clock();
      const rationale = String(input.rationale || '').trim().slice(0, PRIORITY_LIMITS.noteChars);
      store.update((draft) => {
        const target = (draft.priorityArbitrations || []).find((c) => c && c.id === caseId);
        if (!target) return;
        target.proposal = {
          at: at.toISOString(),
          bySeatId: seat.fullAccess ? null : seat.id,
          verdict: rank.verdict,
          rankedIds: rank.rankedIds,
          rationale,
        };
      }, {
        type: PRIORITY_EVENTS.PROPOSE,
        entity: 'arbitration',
        entityId: caseId,
        summary: `Precedence PROPOSED (not agreed) on case ${caseId}: ${rank.verdict}. It binds nobody and issues no work.`.slice(0, 300),
      });
      return saved({ id: caseId, verdict: rank.verdict, rankedIds: rank.rankedIds, binding: false });
    },

    /** The one binding act. Arbiter-only, complete-case-only, rationale-required. */
    priorityAgreePrecedence(input = {}) {
      const check = seatFor('agree-arbitration');
      if (!check.ok) return check;
      const { seat } = check;
      const caseId = String(input.caseId || '').trim();
      const caseRow = findCase(caseId);
      if (!caseRow) return fail('That arbitration case no longer exists.', 'caseId');
      if (caseRow.status === 'withdrawn') return fail('That case was withdrawn; nothing can be agreed on it.', 'caseId');
      if (caseRow.agreement) return fail('That case already carries an agreed precedence. Withdraw it and open a new case rather than stacking a second binding order on the first.', 'caseId');

      const conv = normalizePrioritySettings(settings());
      const rank = priorityRank(caseRow);
      if (!rank.ranked) return fail(`No precedence can be agreed on this case: ${rank.reason}`, 'demands');

      const pending = (caseRow.demands || []).filter((d) => !d.treatment);
      if (pending.length) {
        return fail(`${pending.length} demand(s) carry no disposition. Agreement requires every side to have been heard: record a disposition for each demand first.`, 'demands');
      }

      // The arbiter. An agreement recorded by a seat with no line above both
      // parties is a manager deciding across their peer — refused, not softened.
      const intendedArbiter = String(input.arbiterId || seat.id || '').trim();
      const managers = [...new Set((caseRow.demands || []).map((d) => d.managerId).filter(Boolean))];
      const isLeader = seat.fullAccess || seat.id === LEADER_ID;
      if (!isLeader && !seatReaches(seat, caseRow.personId)) {
        return fail('Only a seat above both lines, or the workspace leader, can record the binding precedence.', 'caseId');
      }
      if (intendedArbiter && !isLeader && intendedArbiter !== seat.id) {
        return fail('The arbiter on the record must be the seat recording it, or the workspace leader.', 'arbiterId');
      }

      const rationale = String(input.rationale || '').trim().slice(0, PRIORITY_LIMITS.noteChars);
      if (rationale.length < 12) {
        return fail('Write the reasoning in your own words (at least a sentence). A precedence with no stated reason is one the next escalation cannot argue with — and therefore cannot respect.', 'rationale');
      }

      // Order: the measured order unless the arbiter explicitly overrides it. An
      // override is legal — humans may know something the two integers do not —
      // but it must be declared and it is printed as human judgement, not as the
      // engine's finding.
      let rankedIds = rank.rankedIds;
      let overridden = false;
      if (Array.isArray(input.rankedIds) && input.rankedIds.length) {
        const wanted = input.rankedIds.map((v) => String(v));
        const valid = wanted.length === caseRow.demands.length
          && new Set(wanted).size === caseRow.demands.length
          && wanted.every((id) => caseRow.demands.some((d) => d.id === id));
        if (!valid) return fail('The agreed order must name every frozen demand exactly once.', 'rankedIds');
        overridden = wanted.some((id, i) => id !== rank.rankedIds[i]);
        rankedIds = wanted;
        if (overridden && String(input.overrideReason || '').trim().length < 8) {
          return fail('You have reordered the demands away from the measured order. Say why, in one line — an override with no stated reason is exactly the corridor decision this register exists to replace.', 'overrideReason');
        }
      }

      const at = clock();
      const today = dayKey(at);
      const precedenceDays = conv.priorityPrecedenceDays;
      const effectiveFrom = /^\d{4}-\d{2}-\d{2}$/.test(String(input.effectiveFrom || '')) ? String(input.effectiveFrom) : today;
      const effectiveTo = /^\d{4}-\d{2}-\d{2}$/.test(String(input.effectiveTo || '')) ? String(input.effectiveTo) : addDays(effectiveFrom, precedenceDays);
      if (effectiveTo < effectiveFrom) return fail('The precedence cannot end before it starts.', 'effectiveTo');
      const reviewOn = /^\d{4}-\d{2}-\d{2}$/.test(String(input.reviewOn || '')) ? String(input.reviewOn) : addDays(effectiveFrom, conv.priorityReviewDays);

      store.update((draft) => {
        const target = (draft.priorityArbitrations || []).find((c) => c && c.id === caseId);
        if (!target) return;
        target.agreement = {
          at: at.toISOString(),
          bySeatId: seat.fullAccess ? null : seat.id,
          rationale: overridden
            ? `${rationale}\n\n[Human override of the measured order] ${String(input.overrideReason || '').trim().slice(0, PRIORITY_LIMITS.treatReasonChars)}`
            : rationale,
          rankedIds,
          effectiveFrom,
          effectiveTo,
          reviewOn,
          issued: [],
          supersededBy: null,
        };
      }, {
        type: PRIORITY_EVENTS.AGREE,
        entity: 'arbitration',
        entityId: caseId,
        summary: `Cross-line precedence AGREED on case ${caseId}, in force ${effectiveFrom}–${effectiveTo}, review ${reviewOn}${overridden ? ' (human override of the measured order)' : ''}.`.slice(0, 300),
      });
      return saved({
        id: caseId,
        rankedIds,
        overridden,
        effectiveFrom,
        effectiveTo,
        reviewOn,
        binding: true,
        propagations: store.lastPropagations || [],
      });
    },

    /** One of the named lines, or the person, answers — accept / object / abstain. */
    priorityRecordAnswer(input = {}) {
      const check = seatFor('answer-arbitration');
      if (!check.ok) return check;
      const { seat } = check;
      const caseId = String(input.caseId || '').trim();
      const caseRow = findCase(caseId);
      if (!caseRow) return fail('That arbitration case no longer exists.', 'caseId');
      if (!caseRow.agreement && caseRow.status !== 'withdrawn') {
        return fail('There is nothing to answer yet: no precedence has been agreed on this case. An answer to a proposal nobody made would be recorded as consent to nothing.', 'caseId');
      }
      const parties = new Set([...(caseRow.demands || []).map((d) => d.managerId), caseRow.personId]);
      if (!seat.fullAccess && !parties.has(seat.id)) {
        return fail('Only the lines named in this case, or the person whose capacity it concerns, can answer it. Nobody consents on somebody else’s behalf.', 'caseId');
      }
      const stance = String(input.stance || '').trim();
      if (!['accept', 'object', 'abstain'].includes(stance)) {
        return fail('Answer accept, object, or abstain — in your own words.', 'stance');
      }
      const reason = String(input.reason || '').trim().slice(0, PRIORITY_LIMITS.treatReasonChars);
      if (stance !== 'accept' && reason.length < 8) {
        return fail('An objection or an abstention needs one line saying why. Silence and disagreement are not the same record.', 'reason');
      }
      const existing = (caseRow.dissents || []).find((d) => d.seatId === seat.id);
      if (existing) {
        return fail(`This seat already answered on ${existing.at.slice(0, 10)} (${existing.stance}). The register keeps the first answer: a second one would make the record of who said what unfalsifiable.`, 'caseId');
      }

      const at = clock();
      store.update((draft) => {
        const target = (draft.priorityArbitrations || []).find((c) => c && c.id === caseId);
        if (!target) return;
        target.dissents = Array.isArray(target.dissents) ? target.dissents : [];
        // The answer is recorded under the ACTING seat's identity — never
        // rewritten to the workspace leader. Recording the operator view's answer
        // as `leader` would fabricate a named executive's consent, which is the
        // one thing a first-person record must never do; and it collapsed every
        // operator answer into a single row, so a second party could never be
        // heard. `leader` is used only where the seat genuinely IS the leader.
        target.dissents.push({ at: at.toISOString(), seatId: seat.id || LEADER_ID, stance, reason });
      }, {
        type: PRIORITY_EVENTS.DISSENT,
        entity: 'arbitration',
        entityId: caseId,
        summary: `Party answer recorded on case ${caseId}: ${stance}${reason ? ` — ${reason}` : ''}`.slice(0, 300),
      });
      return saved({ id: caseId, stance });
    },

    /** Append-only: the case is closed and nothing became binding. */
    priorityWithdraw(input = {}) {
      const check = seatFor('agree-arbitration');
      if (!check.ok) return check;
      const { seat } = check;
      const caseId = String(input.caseId || '').trim();
      const caseRow = findCase(caseId);
      if (!caseRow) return fail('That arbitration case no longer exists.', 'caseId');
      if (caseRow.status === 'withdrawn') return fail('That case is already withdrawn.', 'caseId');
      if (!seat.fullAccess && !seatReaches(seat, caseRow.personId)) {
        return fail('Only a seat above the person, or the workspace leader, can withdraw the case.', 'caseId');
      }
      const reason = String(input.reason || '').trim().slice(0, PRIORITY_LIMITS.treatReasonChars);
      if (reason.length < 8) return fail('Write one line saying why this case no longer applies. A withdrawn case with no reason is a decision nobody can be asked about.', 'reason');

      const at = clock();
      store.update((draft) => {
        const target = (draft.priorityArbitrations || []).find((c) => c && c.id === caseId);
        if (!target) return;
        target.status = 'withdrawn';
        target.withdrawnOn = dayKey(at);
        target.withdrawnAt = at.toISOString();
        target.withdrawReason = reason;
      }, {
        type: PRIORITY_EVENTS.WITHDRAW,
        entity: 'arbitration',
        entityId: caseId,
        summary: `Cross-line priority case withdrawn: ${reason}`.slice(0, 300),
      });
      return saved({ id: caseId });
    },

    prioritySetConventions(input = {}) {
      const check = seatFor('open-arbitration');
      if (!check.ok) return check;
      const { seat } = check;
      if (!seat.fullAccess && Number(seat.rank) < 4) {
        return fail('Re-declaring the arbitration conventions is a rank-4+ full-access act. The numbers are printed on the Method panel precisely so they can be argued with before they are changed.');
      }
      const current = normalizePrioritySettings(settings());
      const next = normalizePrioritySettings({
        ...settings(),
        priorityPrecedenceDays: Object.prototype.hasOwnProperty.call(input, 'priorityPrecedenceDays') ? input.priorityPrecedenceDays : current.priorityPrecedenceDays,
        priorityReviewDays: Object.prototype.hasOwnProperty.call(input, 'priorityReviewDays') ? input.priorityReviewDays : current.priorityReviewDays,
        priorityCapacityShareH: Object.prototype.hasOwnProperty.call(input, 'priorityCapacityShareH') ? input.priorityCapacityShareH : current.priorityCapacityShareH,
      });
      const at = clock();
      store.update((draft) => {
        draft.settings = { ...(draft.settings || {}), ...next };
      }, {
        type: PRIORITY_EVENTS.CONVENTIONS,
        entity: 'settings',
        entityId: 'arbitration',
        summary: `Arbitration conventions re-declared: precedence window ${next.priorityPrecedenceDays} day(s), review ${next.priorityReviewDays} day(s), capacity ceiling ${next.priorityCapacityShareH} hundredths.`.slice(0, 300),
      });
      return saved({ conventions: next });
    },
  };
}
