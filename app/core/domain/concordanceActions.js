/**
 * app/core/domain/concordanceActions.js — API mixin for the Concordance Terminal
 * (Schema v89, ADR-0083). Mounted via `Object.assign(api, ...)` exactly like
 * `createAltitudeRouterActions`; no second command bus.
 *
 * The write path is deliberately small: open one round per pair per cycle,
 * submit one side, close on the second, withdraw. Nothing here rates a person,
 * decides an expectation or writes a conclusion into anyone's 1:1 — the
 * post-commit rules do the cross-module work, and a human decides.
 */
import { dayKey } from '../time.js';
import { buildChain, LEADER_ID } from './chain.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import {
  concordanceRead, concordanceStats as statsOf, concordanceBriefText,
  concordanceCsvRows, concordanceAttentionCount, concordanceConventions, roundPathKey,
} from './concordance.js';
import { normalizeConcordanceSettings, normalizeConcordanceRounds } from './concordanceSchema.js';
import {
  CONCORDANCE_DIMENSION_KEYS,
  CONCORDANCE_EVENTS,
  CONCORDANCE_LIMITS,
  CONCORDANCE_SCALE,
  concordancePairKey,
} from './concordanceRegistry.js';
import { guardApiCall } from './accessGateway.js';

export function createConcordanceActions(store, { now, idFactory, createApi }) {
  const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date());
  const saved = (extra = {}) => ({
    ok: true,
    ...extra,
    saved: !store.persistError,
    warning: store.persistError || null,
    propagations: store.lastPropagations || [],
  });
  const settings = () => store.state.settings || {};
  const rounds = () => (Array.isArray(store.state.expectationRounds) ? store.state.expectationRounds : []);
  const findRound = (id) => rounds().find((r) => r && r.id === id) || null;

  function seatCheck(leaderId = null) {
    const built = buildSeats(store.state, { now: clock(), settings: settings() });
    const seat = activeSeat(built);
    if (seat.fullAccess) return null;
    const right = canAct('close-expectation-round', seat);
    if (!right.allow) return fail(right.reason, 'scope');
    if (leaderId && leaderId !== seat.id && !(seat.scope && seat.scope.has(leaderId))) {
      return fail('This pair’s leader sits outside your operating seat. Escalate through the common leader instead of reading across a peer boundary.', 'scope');
    }
    return null;
  }

  function subtitleForSide(round, side) {
    return side === 'leader' ? 'leader' : 'member';
  }

  return {
    /** Pure aggregate read; never persists. */
    concordanceRead(seatId = null) {
      return concordanceRead(store.state, { now: clock(), settings: settings(), seatId });
    },

    concordanceStats(roundId) {
      const round = findRound(roundId);
      if (!round) return fail('Choose a round in this workspace.', 'roundId');
      return { ok: true, roundId, sealed: round.status === 'open', stats: statsOf(round, concordanceConventions(settings())) };
    },

    /** Open one sealed two-sided round for a real leader → report pair. */
    concordanceOpenRound(input = {}) {
      const leaderId = String(input.leaderId || '');
      const memberId = String(input.memberId || '');
      const built = buildSeats(store.state, { now: clock(), settings: settings() });
      const chain = buildChain(store.state, { now: clock(), settings: settings() });
      const gate = seatCheck(leaderId); if (gate) return gate;
      if (!chain.nodes.has(leaderId) && leaderId !== LEADER_ID) return fail('Choose a leader who is on the roster or the workspace leader.', 'leaderId');
      if (!chain.nodes.has(memberId)) return fail('Choose a person on the roster.', 'memberId');
      if (leaderId === memberId) return fail('A pair needs two people.', 'memberId');
      const leaderNode = chain.nodes.get(leaderId === LEADER_ID ? LEADER_ID : leaderId);
      const inSpan = leaderId === LEADER_ID
        ? true
        : (leaderNode?.subtreeIds || []).includes(memberId);
      if (!inSpan) return fail('That person does not report inside the chosen leader’s span. Concordance is measured on a real reporting pair, not across a peer boundary.', 'memberId');
      if ((store.state.people || []).find((p) => p.id === memberId)?.status === 'archived') return fail('That person is archived.', 'memberId');
      const cycle = String(input.cycle || dayKey(clock()).slice(0, 7)).slice(0, CONCORDANCE_LIMITS.cycleChars);
      const pairKey = concordancePairKey(leaderId, memberId);
      const duplicate = rounds().find((r) => r && r.status === 'open' && concordancePairKey(r.leaderId, r.memberId) === pairKey);
      if (duplicate) return fail(`This pair already has an open round (${duplicate.cycle}). Two live rounds would measure the mood twice and the standard once.`, 'memberId');
      if (rounds().length >= CONCORDANCE_LIMITS.rounds) return fail('The round ledger is full. Export an archive before continuing; no round was silently deleted.', 'rounds');
      const stamp = clock();
      const record = {
        id: idFactory('ecr'),
        leaderId,
        memberId,
        cycle,
        openedOn: dayKey(stamp),
        openedAt: stamp.toISOString(),
        openedBy: (built && activeSeat(built)?.fullAccess === false ? activeSeat(built).id : null),
        status: 'open',
        items: CONCORDANCE_DIMENSION_KEYS.map((key) => ({ key, leader: null, member: null })),
        leaderSubmittedAt: null,
        memberSubmittedAt: null,
        leaderNote: '',
        memberNote: '',
        closedOn: null,
        closedAt: null,
        withdrawnReason: '',
        pathKey: roundPathKey(store.state, leaderId, { settings: settings(), now: stamp }),
        createdAt: stamp.toISOString(),
      };
      const warnings = [];
      const normalized = normalizeConcordanceRounds([record], warnings, { cap: CONCORDANCE_LIMITS.rounds });
      if (warnings.length || normalized.length !== 1) return fail(warnings[0] || 'The round could not be validated.');
      store.update((draft) => {
        draft.expectationRounds = Array.isArray(draft.expectationRounds) ? draft.expectationRounds : [];
        draft.expectationRounds.unshift(normalized[0]);
      }, {
        type: CONCORDANCE_EVENTS.ROUND_OPENED,
        entity: 'concordance',
        entityId: record.id,
        summary: `Concordance round opened for cycle ${cycle}: ${CONCORDANCE_DIMENSION_KEYS.length} dimensions, both sides sealed`,
      });
      return saved({ round: findRound(record.id) });
    },

    /**
     * Submit ONE side. Sealed until both sides are in: the other side's answers
     * are not returned by this call, by the read model, or by the view.
     */
    concordanceSubmit(roundId, side, ratings = {}, note = '') {
      const round = findRound(roundId);
      if (!round) return fail('Choose an open round.', 'roundId');
      if (round.status === 'withdrawn') return fail('This round was withdrawn. Open a new one instead of writing into a closed record.', 'roundId');
      if (round.status !== 'open') return fail('This round is already closed. A closed round is evidence; re-opening it would erase what was measured.', 'roundId');
      const which = side === 'leader' || side === 'member' ? side : null;
      if (!which) return fail('Submit as the leader or as the report.', 'side');
      const gate = seatCheck(which === 'leader' ? round.leaderId : round.memberId); if (gate) return gate;
      if (round[`${which}SubmittedAt`]) return fail(`The ${which === 'leader' ? 'leader’s' : 'report’s'} side is already sealed. A second submission would overwrite it.`, 'side');

      const clean = {};
      const missing = [];
      for (const key of CONCORDANCE_DIMENSION_KEYS) {
        const raw = ratings ? ratings[key] : null;
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 1 || n > CONCORDANCE_SCALE) missing.push(key);
        else clean[key] = n;
      }
      if (missing.length) {
        return fail(`Answer all ${CONCORDANCE_DIMENSION_KEYS.length} dimensions on the 1–${CONCORDANCE_SCALE} bar. Missing: ${missing.join(', ')}. A partial instrument cannot produce an agreement figure.`, 'ratings');
      }

      const stamp = clock();
      const bothAfter = which === 'leader' ? Boolean(round.memberSubmittedAt) : Boolean(round.leaderSubmittedAt);
      const closing = bothAfter;
      store.update((draft) => {
        const row = (draft.expectationRounds || []).find((r) => r.id === round.id);
        if (!row) return;
        row.items = CONCORDANCE_DIMENSION_KEYS.map((key) => {
          const existing = (row.items || []).find((i) => i.key === key) || { key, leader: null, member: null };
          return { key, leader: key in clean && which === 'leader' ? clean[key] : existing.leader, member: key in clean && which === 'member' ? clean[key] : existing.member };
        });
        row[`${which}SubmittedAt`] = stamp.toISOString();
        row[`${which}Note`] = String(note || '').slice(0, CONCORDANCE_LIMITS.noteChars);
        if (closing) {
          row.status = 'closed';
          row.closedOn = dayKey(stamp);
          row.closedAt = stamp.toISOString();
          // Both sides become visible to both sides at exactly the same moment.
          row.revealedOn = dayKey(stamp);
        }
      }, {
        type: closing ? CONCORDANCE_EVENTS.ROUND_CLOSED : CONCORDANCE_EVENTS.SIDE_SUBMITTED,
        entity: 'concordance',
        entityId: round.id,
        summary: closing
          ? `Concordance round closed: both sides in, ${CONCORDANCE_DIMENSION_KEYS.length} dimensions revealed to both`
          : `${subtitleForSide(round, which) === 'leader' ? 'Leader' : 'Report'} side submitted and sealed for round ${round.id}`,
      });
      const updated = findRound(round.id);
      const stats = updated ? statsOf(updated, concordanceConventions(settings())) : null;
      return saved({
        roundId: round.id,
        sealed: updated?.status === 'open',
        stats,
        // Never leak the other side: the returned payload is the submitted side's
        // own record plus the agreement reading, which is only produced when both
        // sides exist.
      });
    },

    concordanceWithdraw(roundId, reason = '') {
      const round = findRound(roundId);
      if (!round) return fail('Choose a round.', 'roundId');
      if (round.status !== 'open') return fail('Only an open round can be withdrawn. A closed round is evidence and stays.', 'roundId');
      const gate = seatCheck(round.leaderId); if (gate) return gate;
      const stamp = clock();
      store.update((draft) => {
        const row = (draft.expectationRounds || []).find((r) => r.id === round.id);
        if (!row) return;
        row.status = 'withdrawn';
        row.withdrawnReason = String(reason || '').slice(0, 300);
        row.closedAt = stamp.toISOString();
      }, {
        type: CONCORDANCE_EVENTS.ROUND_WITHDRAWN,
        entity: 'concordance',
        entityId: round.id,
        summary: `Concordance round withdrawn before both sides were in${reason ? `: ${String(reason).slice(0, 160)}` : ''}`,
      });
      return saved({ roundId: round.id });
    },

    /** Explicit scan always runs, even when automatic propagation is paused. */
    concordanceScan() {
      store.update(() => {}, {
        type: CONCORDANCE_EVENTS.SCAN,
        entity: 'workspace',
        entityId: '',
        summary: 'Concordance Terminal reconciled the roll-up ladder and the re-contracting loop',
      });
      return saved({ report: concordanceRead(store.state, { now: clock(), settings: settings() }) });
    },

    concordanceSetConventions(values = {}) {
      const gate = seatCheck(); if (gate) return gate;
      const merged = normalizeConcordanceSettings({ ...settings(), ...values });
      store.update((draft) => { Object.assign(draft.settings, merged); }, {
        type: CONCORDANCE_EVENTS.CONVENTIONS_SET,
        entity: 'workspace',
        entityId: '',
        summary: `Concordance conventions updated: agreement floor ${merged.concordanceAgreementFloorPct}%, cell floor ${merged.concordanceCellFloor}, re-test ${merged.concordanceRetestDays}d, auto ${merged.concordanceAutoPropagate}`,
      });
      return saved({ report: concordanceRead(store.state, { now: clock(), settings: settings() }) });
    },

    concordanceBriefText() {
      return { ok: true, text: concordanceBriefText(store.state, { now: clock(), settings: settings() }) };
    },
    concordanceCsvRows() {
      return { ok: true, rows: concordanceCsvRows(store.state, { now: clock(), settings: settings() }) };
    },
    concordanceAttentionCount() {
      return concordanceAttentionCount(store.state, clock(), settings());
    },
  };
}
