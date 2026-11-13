/**
 * app/core/domain/priorityRankingActions.js — the seat-checked commands of the
 * Cross-Line Priority Ballot register (ADR-0191, Schema v151).
 *
 * Three human acts and nothing else: DECLARE a round (freeze the person, the
 * items and the lines), CAST one first-person ballot as the frozen holder of one
 * frozen line, and WITHDRAW a round with a reason. Every act is narrowed to the
 * person it belongs to:
 *
 *  - a round is declared by the workspace leader, by the person it is about, or
 *    by a manager who holds an active line over that person;
 *  - a ballot is cast by the frozen holder of a frozen line and by nobody else:
 *    not by the person being ranked, not by a peer, not by the new manager of
 *    the same line, and not by the workspace leader on a line holder's behalf;
 *  - a ballot is a single act, never an edit: a second ballot for the same line
 *    is refused, and a ranking must cover every frozen item exactly once.
 *
 * The undeclared operator view acts as the workspace leader — the one seat a
 * single keyboard genuinely is — and as nobody else.
 */

import { addDays, dayKey } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { LEADER_ID } from './chain.js';
import { matrixLineScopeFor } from './matrix.js';
import { buildPriorityRanking, priorityBallotBriefText, priorityBallotCsvRows } from './priorityRanking.js';
import {
  PRIORITY_BALLOT_BOUNDS,
  PRIORITY_BALLOT_EVENTS,
  PRIORITY_BALLOT_LIMITS,
  PRIORITY_BALLOT_RIGHTS,
  PRIORITY_BALLOT_ROUTE,
  PRIORITY_BALLOT_RULE_ID,
  PRIORITY_BALLOT_SETTING_KEYS,
  PRIORITY_BALLOT_SETTING_LABELS,
} from './priorityRankingRegistry.js';
import { normalizePriorityBallotSettings, priorityBallotDay, priorityBallotRankingIsPermutation } from './priorityRankingSchema.js';

const L = PRIORITY_BALLOT_LIMITS;

export function createPriorityRankingActions(store, { now, idFactory }) {
  const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  const text = (value, max) => String(value ?? '').trim().slice(0, max);
  const saved = (extra = {}) => ({ ...extra, saved: !store.persistError, warning: store.persistError || null, propagations: store.lastPropagations || [], ok: true });
  const rows = (key) => (Array.isArray(store.state[key]) ? store.state[key] : []);

  function seatFor(right) {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    const seat = activeSeat(built);
    if (seat.readOnly) return fail('The declared seat is unresolved and read-only. Choose a valid seat before reading or casting a priority ballot.');
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    const actorId = seat.fullAccess ? LEADER_ID : (seat.nodeId || seat.id);
    return { ok: true, seat, at, cfg, actorId, today: dayKey(at) };
  }
  const read = (check) => buildPriorityRanking(store.state, { now: check.at, settings: check.cfg, seat: check.seat });
  /** The whole-workspace evaluation: what the gate checks an act against. */
  const whole = (check) => buildPriorityRanking(store.state, { now: check.at, settings: check.cfg, seat: null });

  /** A person's active lines, from the ONE matrix engine. */
  function linesOf(report, personId) {
    if (personId === LEADER_ID) return [];
    const { matrix, nameOf } = report.internal;
    return (matrix.linesByPerson.get(personId) || []).map((line) => ({
      lineKey: line.role === 'primary' ? 'home' : line.id,
      managerId: line.managerId,
      managerName: nameOf(line.managerId),
      kind: line.kind,
      role: line.role,
      shareH: line.shareH,
    }));
  }

  const openItemsFor = (personId) => rows('portfolio')
    .filter((item) => item && item.ownerId === personId && item.status === 'open')
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  return {
    /* ---------------------------------------------------------------- reads */

    matrixPriorityReport() {
      const check = seatFor(PRIORITY_BALLOT_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, report: read(check) };
    },

    matrixPriorityBriefText() {
      const check = seatFor(PRIORITY_BALLOT_RIGHTS.READ);
      if (!check.ok) return check;
      const report = read(check);
      return { ok: true, text: priorityBallotBriefText(report), report };
    },

    matrixPriorityCsvRows() {
      const check = seatFor(PRIORITY_BALLOT_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, rows: priorityBallotCsvRows(read(check)) };
    },

    matrixPriorityAttentionCount() {
      const check = seatFor(PRIORITY_BALLOT_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, count: read(check).board.attentionN };
    },

    /**
     * Who a round can be declared about, and which items are eligible. Only a
     * LIVE open portfolio item owned by the person can be frozen into a round:
     * a delivered item has no priority question left in it.
     */
    matrixPriorityCandidates() {
      const check = seatFor(PRIORITY_BALLOT_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const report = whole(check);
      const { matrix, nameOf } = report.internal;
      const operator = check.seat.fullAccess === true;
      const out = [];
      for (const node of matrix.nodes.values()) {
        if (node.id === LEADER_ID) continue;
        if (!matrix.roster.has(node.id)) continue;
        const items = openItemsFor(node.id).map((item) => ({ key: item.id, title: item.title }));
        if (!items.length) continue;
        const lines = linesOf(report, node.id);
        const holdsLine = lines.some((line) => line.managerId === check.actorId);
        if (!operator && node.id !== check.actorId && !holdsLine) continue;
        out.push({
          personId: node.id,
          personName: nameOf(node.id),
          altitude: node.altitude || null,
          lines,
          lineRequired: lines.length > 1,
          items,
          self: node.id === check.actorId,
        });
      }
      out.sort((a, b) => Number(b.self) - Number(a.self) || a.personName.localeCompare(b.personName));
      return { ok: true, candidates: out, actorId: check.actorId, itemLimits: { min: L.itemsMin, max: L.itemsMax } };
    },

    /* --------------------------------------------------------------- writes */

    matrixPriorityDeclareRound(input = {}) {
      const check = seatFor(PRIORITY_BALLOT_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const report = whole(check);
      const { matrix } = report.internal;
      const operator = check.seat.fullAccess === true;
      const personId = text(input.personId, 120);
      if (!personId) return fail('Name the person this round is about.', 'personId');
      if (personId === LEADER_ID) return fail('The workspace leader owns no portfolio work item, so there is nothing to rank for them.', 'personId');
      if (!matrix.roster.has(personId)) return fail('That person is not on the active roster.', 'personId');
      const lines = linesOf(report, personId);
      if (!lines.length) return fail(`${matrix.nodes.get(personId)?.name || 'That person'} holds no active reporting line in this workspace, so no line can be asked for a ballot.`, 'personId');
      const holdsLine = lines.some((line) => line.managerId === check.actorId);
      if (!operator && personId !== check.actorId && !holdsLine) {
        return fail('A round is declared by the person it is about or by a manager who holds an active line over them. You hold no line over that person.', 'personId');
      }

      const title = text(input.title, L.titleMax);
      if (title.length < L.titleMin) return fail(`Give the round a title of at least ${L.titleMin} characters — the question the lines are answering.`, 'title');
      const itemKeys = Array.isArray(input.itemKeys) ? input.itemKeys.map((key) => text(key, 120)) : [];
      if (itemKeys.length < L.itemsMin || itemKeys.length > L.itemsMax) {
        return fail(`A round freezes ${L.itemsMin} to ${L.itemsMax} work items. ${itemKeys.length} were supplied.`, 'itemKeys');
      }
      if (new Set(itemKeys).size !== itemKeys.length) return fail('The same work item was named twice. Every item is frozen once.', 'itemKeys');
      const live = new Map(openItemsFor(personId).map((item) => [item.id, item]));
      const itemSnapshot = [];
      for (const key of itemKeys) {
        const item = live.get(key);
        if (!item) return fail(`“${key}” is not a live open portfolio item owned by ${matrix.nodes.get(personId)?.name || 'that person'}. A delivered or released item has no priority question left in it.`, 'itemKeys');
        itemSnapshot.push({ key: item.id, title: String(item.title || '').trim().slice(0, 200), sourceType: 'portfolio', sourceId: item.id });
      }

      const conv = normalizePriorityBallotSettings(settings());
      let dueOn = input.dueOn ? priorityBallotDay(input.dueOn) : addDays(check.today, conv[PRIORITY_BALLOT_SETTING_KEYS.ballotDueDays]);
      if (input.dueOn && !dueOn) return fail('The ballot deadline is not a real calendar day.', 'dueOn');
      if (!dueOn || dueOn <= check.today) return fail('The ballot deadline must be after today: a round that opens already overdue is not a round.', 'dueOn');
      if (dueOn > addDays(check.today, L.dueAheadMax)) return fail(`A ballot deadline may be at most ${L.dueAheadMax} days ahead.`, 'dueOn');

      const keySet = [...itemSnapshot.map((item) => item.key)].sort().join('|');
      const duplicate = rows('priorityRounds').find((round) => round && !round.withdrawnOn && round.personId === personId
        && [...round.itemSnapshot.map((item) => item.key)].sort().join('|') === keySet);
      if (duplicate) return fail(`A live round on the same frozen item set already exists (${duplicate.id}, opened ${duplicate.openedOn}). Withdraw it first, or change the items.`, 'itemKeys');
      if (rows('priorityRounds').length >= L.rounds) return fail(`The round ledger reached its ${L.rounds}-row cap. Export the workspace before declaring another.`);

      const record = {
        id: idFactory('psr'),
        personId,
        title,
        itemSnapshot,
        lineSnapshot: lines.map((line) => ({ lineKey: line.lineKey, managerId: line.managerId, kind: line.kind, role: line.role, shareH: line.shareH })),
        openedOn: check.today,
        dueOn,
        withdrawnOn: null,
        withdrawnReason: '',
        declaredById: check.actorId,
        declaredOn: check.today,
        declaredAt: check.at.toISOString(),
      };
      store.update((draft) => {
        draft.priorityRounds = Array.isArray(draft.priorityRounds) ? draft.priorityRounds : [];
        draft.priorityRounds.push(record);
      }, {
        type: PRIORITY_BALLOT_EVENTS.ROUND_DECLARED,
        entity: 'priorityRound',
        entityId: record.id,
        summary: `Priority round opened for ${matrix.nodes.get(personId)?.name || personId}: ${itemSnapshot.length} item(s), ${lines.length} line(s) asked, ballots due ${dueOn}.`.slice(0, 300),
      });
      return saved({ roundId: record.id, personId, itemsN: itemSnapshot.length, linesN: lines.length, dueOn });
    },

    matrixPriorityCastBallot(input = {}) {
      const check = seatFor(PRIORITY_BALLOT_RIGHTS.CAST);
      if (!check.ok) return check;
      const roundId = text(input.roundId, 120);
      const round = rows('priorityRounds').find((row) => row && row.id === roundId) || null;
      if (!round) return fail('That round no longer exists.', 'roundId');
      if (round.withdrawnOn) return fail(`This round was withdrawn on ${round.withdrawnOn}: ${round.withdrawnReason}`, 'roundId');
      const report = whole(check);
      const { matrix } = report.internal;
      // The matrix engine refuses a second line to the same manager, so a holder
      // appears at most once in a frozen snapshot. One holder, one ballot.
      const frozen = round.lineSnapshot.find((line) => line.managerId === check.actorId) || null;
      if (!frozen) {
        return fail('Only the holder of a line frozen into this round can cast a ballot for it. You held no such line when the round opened — a later holder of the same line is not asked on the earlier holder’s behalf.', 'roundId');
      }
      const current = (matrix.linesByPerson.get(round.personId) || []).find((line) => (frozen.lineKey === 'home' ? line.role === 'primary' : line.id === frozen.lineKey)) || null;
      if (!current || current.managerId !== check.actorId) {
        return fail('The line this round asked you under has ended or been re-pointed since it opened. The ballot belongs to the holder the round froze; cast it under a new round instead.', 'roundId');
      }
      const existing = rows('priorityBallots').find((ballot) => ballot && ballot.roundId === roundId && ballot.lineKey === frozen.lineKey) || null;
      if (existing) return fail(`Your line's ballot was already cast on ${existing.castOn}. A ballot is one act, not an edit: declare a new round if the priorities have moved.`, 'roundId');

      const itemKeys = round.itemSnapshot.map((item) => item.key);
      const ranking = Array.isArray(input.ranking) ? input.ranking.map((key) => text(key, 120)) : [];
      if (ranking.length !== itemKeys.length) return fail(`Rank every frozen item exactly once: ${itemKeys.length} item(s), ${ranking.length} supplied.`, 'ranking');
      if (new Set(ranking).size !== ranking.length) return fail('The same item was ranked twice.', 'ranking');
      if (!priorityBallotRankingIsPermutation(ranking, itemKeys)) return fail('A ballot may only rank the items this round froze.', 'ranking');
      if (rows('priorityBallots').length >= L.ballots) return fail(`The ballot ledger reached its ${L.ballots}-row cap. Export the workspace before casting another.`);

      const record = {
        id: idFactory('psb'),
        roundId,
        lineKey: frozen.lineKey,
        holderId: check.actorId,
        ranking,
        castOn: check.today,
        castAt: check.at.toISOString(),
        note: '',
      };
      store.update((draft) => {
        draft.priorityBallots = Array.isArray(draft.priorityBallots) ? draft.priorityBallots : [];
        draft.priorityBallots.push(record);
      }, {
        type: PRIORITY_BALLOT_EVENTS.BALLOT_CAST,
        entity: 'priorityRound',
        entityId: roundId,
        summary: `A ${frozen.kind} line cast its ballot over ${ranking.length} frozen item(s).`.slice(0, 300),
      });
      return saved({ ballotId: record.id, roundId, lineKey: frozen.lineKey, votesN: rows('priorityBallots').filter((ballot) => ballot.roundId === roundId).length });
    },

    matrixPriorityWithdrawRound(input = {}) {
      const check = seatFor(PRIORITY_BALLOT_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const roundId = text(input.roundId, 120);
      const round = rows('priorityRounds').find((row) => row && row.id === roundId) || null;
      if (!round) return fail('That round no longer exists.', 'roundId');
      if (round.withdrawnOn) return fail(`This round was already withdrawn on ${round.withdrawnOn}.`, 'roundId');
      const operator = check.seat.fullAccess === true;
      if (!operator && round.declaredById !== check.actorId) {
        const holdsLine = round.lineSnapshot.some((line) => line.managerId === check.actorId);
        if (!holdsLine) return fail('A round is withdrawn by the seat that declared it or by a line holder it asked.', 'roundId');
      }
      const reason = text(input.reason, L.reasonMax);
      if (reason.length < L.reasonMin) return fail(`Say why the round is being withdrawn (at least ${L.reasonMin} characters). Ballots already cast are kept as history.`, 'reason');

      store.update((draft) => {
        const target = (draft.priorityRounds || []).find((row) => row && row.id === roundId);
        if (!target) return;
        target.withdrawnOn = check.today;
        target.withdrawnReason = reason;
      }, {
        type: PRIORITY_BALLOT_EVENTS.ROUND_WITHDRAWN,
        entity: 'priorityRound',
        entityId: roundId,
        summary: `Priority round withdrawn on ${check.today}: ${reason}`.slice(0, 300),
      });
      return saved({ roundId, withdrawnOn: check.today });
    },

    /** Re-run RULE-SOC-01 on the shared spine. A pause still governs: this retries the cap, it does not override the switch. */
    matrixPriorityScan() {
      const check = seatFor(PRIORITY_BALLOT_RIGHTS.GOVERN);
      if (!check.ok) return check;
      store.update(() => {}, { type: PRIORITY_BALLOT_EVENTS.SCAN, entity: 'workspace', entityId: PRIORITY_BALLOT_ROUTE, summary: `Cross-line priority ballot scan requested (${PRIORITY_BALLOT_RULE_ID}).` });
      return saved({ report: read(check), effects: (store.lastPropagations || []).filter((effect) => effect && effect.ruleId === PRIORITY_BALLOT_RULE_ID) });
    },

    /** Set the conventions. A value outside its declared bounds is REFUSED, never clamped. */
    matrixPrioritySetConventions(patch = {}) {
      const check = seatFor(PRIORITY_BALLOT_RIGHTS.GOVERN);
      if (!check.ok) return check;
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return fail('Priority-ballot conventions must be supplied as a plain object. Nothing was saved.', 'settings');
      const names = new Map(Object.entries(PRIORITY_BALLOT_SETTING_KEYS).map(([name, key]) => [key, name]));
      const keys = Object.keys(patch);
      if (!keys.length) return fail('State at least one priority-ballot convention to update. Nothing was saved.', 'settings');
      for (const key of keys) {
        const name = names.get(key);
        if (!name) return fail(`“${key}” is not a declared priority-ballot convention. Nothing was saved.`, key);
        if (name === 'autoPropagate') {
          if (typeof patch[key] !== 'boolean') return fail(`${PRIORITY_BALLOT_SETTING_LABELS.autoPropagate} must be true or false. Nothing was saved.`, key);
        } else {
          const [min, max] = PRIORITY_BALLOT_BOUNDS[name];
          if (!Number.isInteger(patch[key]) || patch[key] < min || patch[key] > max) {
            return fail(`${PRIORITY_BALLOT_SETTING_LABELS[name]} must be a whole number from ${min} to ${max}. Nothing was clamped and nothing was saved.`, key);
          }
        }
      }
      const next = normalizePriorityBallotSettings({ ...settings(), ...patch });
      store.update((draft) => { draft.settings = { ...(draft.settings || {}), ...next }; },
        {
          type: PRIORITY_BALLOT_EVENTS.CONVENTIONS,
          entity: 'settings',
          entityId: PRIORITY_BALLOT_ROUTE,
          summary: `Priority-ballot conventions set: deadline ${next.priorityBallotDueDays} d, ask window ${next.priorityAskDueDays} d, ballot floor ${next.priorityMinBallots}, automation ${next.priorityBallotAutoPropagate ? 'on' : 'off'}.`.slice(0, 300),
        });
      return saved({ conventions: next });
    },
  };
}

