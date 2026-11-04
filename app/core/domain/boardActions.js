/**
 * app/core/domain/boardActions.js — API mixin for the Board Room (Schema v91,
 * ADR-0086). Mounted via `Object.assign(api, ...)` exactly like the Altitude
 * Router and Concordance mixes; no second command bus.
 *
 * The write path is deliberately tiny and the ORDER is the feature:
 *   open → declare thresholds → LOOK → commit → freeze.
 * Looking is an explicit, recorded act. Until it happens the memo is a set of
 * pre-registrations; once it happens, any later threshold edit is marked
 * `revised-after-looking` for the life of the record, and there is no action
 * anywhere in this API that can clear that mark.
 *
 * A committed memo is immutable. Re-opening is a new memo, so the pack a board
 * was actually shown is still readable in the ledger forever.
 */
import { dayKey } from '../time.js';
import { buildSeats, activeSeat, canAct } from './seat.js';
import {
  boardRead, boardEvaluateMemo, boardSnapshot, boardBriefText, boardMemoText, boardCsvRows,
  boardAttentionCount, boardConventions, boardSources,
} from './board.js';
import { normalizeBoardMemos, normalizeBoardSettings } from './boardSchema.js';
import {
  BOARD_CLAIMS, BOARD_CLAIM_KEYS, BOARD_EVENTS, BOARD_LIMITS, BOARD_STATUSES,
  boardClaim,
} from './boardRegistry.js';

export function createBoardActions(store, { now, idFactory }) {
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
  const memos = () => (Array.isArray(store.state.boardMemos) ? store.state.boardMemos : []);
  const findMemo = (id) => memos().find((m) => m && m.id === id) || null;

  function gate(right = 'declare-board-line') {
    const built = buildSeats(store.state, { now: clock(), settings: settings() });
    const seat = activeSeat(built);
    if (seat.fullAccess) return { seat, refusal: null };
    const verdict = canAct(right, seat);
    if (!verdict.allow) {
      return {
        seat,
        refusal: fail(`${verdict.reason} The Board Room is readable at executive rank and above; committing and freezing a disclosed pack is a chief-altitude act.`, 'scope'),
      };
    }
    return { seat, refusal: null };
  }

  function defaultClaims(stamp) {
    return BOARD_CLAIMS.map((claim) => ({
      key: claim.key,
      comparator: claim.comparator,
      unit: claim.unit,
      threshold: claim.defaultThreshold,
      declaredAt: stamp.toISOString(),
      declaredBy: null,
      lookedAt: null,
      lastLookAt: null,
      revisedAfterLook: false,
      revisionCount: 0,
      note: '',
    }));
  }

  function replaceMemo(draft, record, warnings = []) {
    const normalized = normalizeBoardMemos([record], warnings, { cap: BOARD_LIMITS.memos });
    if (warnings.length || !normalized.length) return normalized[0] || null;
    if (!Array.isArray(draft.boardMemos)) draft.boardMemos = [];
    const index = draft.boardMemos.findIndex((m) => m && m.id === record.id);
    if (index >= 0) draft.boardMemos[index] = normalized[0];
    else draft.boardMemos.unshift(normalized[0]);
    return normalized[0];
  }

  return {
    /** Pure read. Never persists, never records a look. */
    boardRead(memoId = null) {
      return boardRead(store.state, { now: clock(), settings: settings(), memoId });
    },

    boardBriefText(memoId = null) {
      return { ok: true, text: boardBriefText(store.state, { now: clock(), settings: settings(), memoId }) };
    },

    /** The full disclosure memorandum, as text. What the operator downloads. */
    boardMemoText(memoId = null) {
      return { ok: true, text: boardMemoText(store.state, { now: clock(), settings: settings(), memoId }) };
    },

    boardCsvRows(memoId = null) {
      return { ok: true, rows: boardCsvRows(store.state, { now: clock(), settings: settings(), memoId }) };
    },

    boardAttentionCount() {
      return boardAttentionCount(store.state, clock(), settings());
    },

    /** The live evaluation of one memo, computed without recording a look. */
    boardPreview(memoId) {
      const memo = findMemo(memoId);
      if (!memo) return fail('Choose a memo in this workspace.', 'memoId');
      const evaluation = boardEvaluateMemo(store.state, memo, { now: clock(), settings: settings(), sources: boardSources(store.state, { now: clock(), settings: settings() }) });
      return {
        ok: true,
        memoId,
        fingerprint: evaluation.fingerprint,
        counts: evaluation.counts,
        unasked: evaluation.unasked,
        rows: evaluation.rows.map((row) => ({ key: row.key, verdict: row.verdict, value: row.value, n: row.n })),
      };
    },

    /** Open a memo whose claims are pre-registered at their declared defaults. */
    boardOpenMemo(input = {}) {
      const { refusal } = gate();
      if (refusal) return refusal;
      if (memos().length >= BOARD_LIMITS.memos) return fail('The memo ledger is full. Freeze and export the archive before opening another; no memo was silently deleted.', 'memos');
      const stamp = clock();
      const record = {
        id: idFactory('brm'),
        revision: 1,
        title: String(input.title || 'Board disclosure memorandum').slice(0, BOARD_LIMITS.titleChars),
        cycle: String(input.cycle || `${stamp.getUTCFullYear()}-Q${Math.floor(stamp.getUTCMonth() / 3) + 1}`).slice(0, 24),
        status: 'draft',
        ownerNodeId: input.ownerNodeId || null,
        ownerSeatId: null,
        claims: defaultClaims(stamp),
        snapshot: null,
        lookCount: 0,
        lastLookAt: null,
        openedAt: stamp.toISOString(),
        openedBy: null,
        committedAt: null,
        frozenAt: null,
        supersededAt: null,
        createdAt: stamp.toISOString(),
        updatedAt: stamp.toISOString(),
      };
      const warnings = [];
      const normalized = normalizeBoardMemos([record], warnings, { cap: BOARD_LIMITS.memos });
      if (warnings.length || normalized.length !== 1) return fail(warnings[0] || 'The memo could not be validated.');
      store.update((draft) => {
        draft.boardMemos = Array.isArray(draft.boardMemos) ? draft.boardMemos : [];
        draft.boardMemos.unshift(normalized[0]);
      }, {
        type: BOARD_EVENTS.MEMO_OPENED,
        entity: 'boardmemo',
        entityId: record.id,
        summary: `Board memo opened for ${record.cycle}: ${BOARD_CLAIM_KEYS.length} claims pre-registered at their declared thresholds`,
      });
      return saved({ memo: findMemo(record.id) });
    },

    /**
     * Declare (or move) a threshold. Moving it after a recorded look is allowed —
     * a threshold may genuinely be wrong — but the mark is permanent.
     */
    boardDeclareClaim(memoId, key, threshold, note = '') {
      const { refusal } = gate();
      if (refusal) return refusal;
      const memo = findMemo(memoId);
      if (!memo) return fail('Choose a draft memo.', 'memoId');
      if (memo.status !== 'draft') return fail('A committed memo is evidence. Open a new memo instead of editing the pack a board has already seen.', 'status');
      const declared = boardClaim(key);
      if (!declared) return fail('That claim is not in the register. A sentence no module can measure is not a board line.', 'key');
      const value = Math.round(Number(threshold));
      if (!Number.isFinite(value) || value < BOARD_LIMITS.thresholdMin || value > BOARD_LIMITS.thresholdMax) {
        return fail(`A threshold is a whole number between ${BOARD_LIMITS.thresholdMin} and ${BOARD_LIMITS.thresholdMax}.`, 'threshold');
      }
      const stamp = clock();
      store.update((draft) => {
        const row = (draft.boardMemos || []).find((m) => m.id === memoId);
        if (!row) return;
        const claim = (row.claims || []).find((c) => c.key === key);
        if (!claim) return;
        const moved = claim.threshold !== value;
        claim.threshold = value;
        claim.note = String(note || '').slice(0, BOARD_LIMITS.noteChars);
        if (moved) {
          claim.revisionCount = (claim.revisionCount || 0) + 1;
          claim.declaredAt = stamp.toISOString();
          if (claim.lookedAt) claim.revisedAfterLook = true;
        }
        if (claim.lookedAt) claim.lastLookAt = stamp.toISOString();
        row.updatedAt = stamp.toISOString();
      }, {
        type: BOARD_EVENTS.CLAIM_DECLARED,
        entity: 'boardmemo',
        entityId: memoId,
        summary: `Board claim “${declared.label}” threshold declared ${value}%${memo.lastLookAt ? ' (after a recorded look — marked post-hoc)' : ' before any look'}`,
      });
      return saved({ memo: findMemo(memoId) });
    },

    boardRemoveClaim(memoId, key) {
      const { refusal } = gate();
      if (refusal) return refusal;
      const memo = findMemo(memoId);
      if (!memo) return fail('Choose a draft memo.', 'memoId');
      if (memo.status !== 'draft') return fail('A committed memo is evidence; its claims cannot be removed.', 'status');
      if (memo.lastLookAt) {
        return fail('This memo has already been evaluated once. Removing a claim now would make the pack look better after seeing it; the register keeps it, and you can report it as refused.', 'claims');
      }
      store.update((draft) => {
        const row = (draft.boardMemos || []).find((m) => m.id === memoId);
        if (!row) return;
        row.claims = (row.claims || []).filter((c) => c.key !== key);
        row.updatedAt = clock().toISOString();
      }, {
        type: BOARD_EVENTS.CLAIM_DECLARED,
        entity: 'boardmemo',
        entityId: memoId,
        summary: `Board claim “${key}” removed before any evaluation`,
      });
      return saved({ memo: findMemo(memoId) });
    },

    /**
     * LOOK. The act that starts the clock on pre-registration. Idempotent in
     * effect but counted, so the record shows how often the pack was inspected
     * before it was committed.
     */
    boardLook(memoId) {
      const { refusal } = gate();
      if (refusal) return refusal;
      const memo = findMemo(memoId);
      if (!memo) return fail('Choose a memo.', 'memoId');
      if (memo.status !== 'draft') return fail('Committed memos are read as they were committed. A look does not re-open them.', 'status');
      const stamp = clock();
      store.update((draft) => {
        const row = (draft.boardMemos || []).find((m) => m.id === memoId);
        if (!row) return;
        row.lookCount = (row.lookCount || 0) + 1;
        row.lastLookAt = stamp.toISOString();
        for (const claim of row.claims || []) {
          if (!claim.lookedAt) claim.lookedAt = stamp.toISOString();
          claim.lastLookAt = stamp.toISOString();
        }
        row.updatedAt = stamp.toISOString();
      }, {
        type: BOARD_EVENTS.LOOKED,
        entity: 'boardmemo',
        entityId: memoId,
        summary: `Board memo evaluated against the record (look ${memo.lookCount + 1}); later threshold edits are marked post-hoc`,
      });
      const updated = findMemo(memoId);
      const evaluation = boardEvaluateMemo(store.state, updated, { now: clock(), settings: settings() });
      return saved({
        memoId,
        counts: evaluation.counts,
        unasked: evaluation.unasked,
        committable: evaluation.committable,
        commitRefusal: evaluation.commitRefusal,
      });
    },

    /** Commit: freeze the live evaluation into the record and let the spine fan it out. */
    boardCommit(memoId) {
      const { refusal } = gate();
      if (refusal) return refusal;
      const memo = findMemo(memoId);
      if (!memo) return fail('Choose a draft memo.', 'memoId');
      if (memo.status !== 'draft') return fail('Only a draft can be committed.', 'status');
      const nowInstant = clock();
      const evaluation = boardEvaluateMemo(store.state, memo, { now: nowInstant, settings: settings() });
      if (!evaluation.evaluable) return fail(evaluation.commitRefusal || 'Too few claims could be evaluated.', 'claims');
      const declared = boardSnapshot(evaluation, memo, nowInstant);
      const warnings = [];
      store.update((draft) => {
        replaceMemo(draft, declared, warnings);
      }, {
        type: BOARD_EVENTS.COMMITTED,
        entity: 'boardmemo',
        entityId: memoId,
        summary: `Board memo committed: ${evaluation.counts.holding} holding, ${evaluation.counts.failing} failing, ${evaluation.counts.inconclusive} inconclusive, ${evaluation.counts.withheld + evaluation.counts.refused} unverified`,
      });
      return saved({
        memo: findMemo(memoId),
        counts: evaluation.counts,
        discrepancyCount: evaluation.counts.discrepancies,
        warning: store.persistError || (warnings[0] || null),
        propagations: store.lastPropagations || [],
      });
    },

    /** Freeze: the disclosed pack a board actually saw. Rank 5 only. */
    boardFreeze(memoId) {
      const { refusal } = gate('freeze-board-summary');
      if (refusal) return refusal;
      const memo = findMemo(memoId);
      if (!memo) return fail('Choose a committed memo.', 'memoId');
      if (memo.status !== 'committed') return fail('Only a committed memo can be frozen. A draft is not a disclosure.', 'status');
      const stamp = clock();
      store.update((draft) => {
        const row = (draft.boardMemos || []).find((m) => m.id === memoId);
        if (!row) return;
        row.status = 'frozen';
        row.frozenAt = stamp.toISOString();
        row.updatedAt = stamp.toISOString();
      }, {
        type: BOARD_EVENTS.FROZEN,
        entity: 'boardmemo',
        entityId: memoId,
        summary: 'Board memo frozen: this is the pack the board was shown',
      });
      return saved({ memo: findMemo(memoId) });
    },

    boardSupersede(memoId, byId = null) {
      const { refusal } = gate();
      if (refusal) return refusal;
      const memo = findMemo(memoId);
      if (!memo) return fail('Choose a memo.', 'memoId');
      if (memo.status === 'superseded') return fail('That memo is already superseded.', 'status');
      const replacement = byId ? findMemo(byId) : null;
      if (byId && !replacement) return fail('The replacement memo does not exist.', 'byId');
      const stamp = clock();
      store.update((draft) => {
        const row = (draft.boardMemos || []).find((m) => m.id === memoId);
        if (!row) return;
        row.status = 'superseded';
        row.supersededAt = stamp.toISOString();
        row.supersededBy = replacement?.id || null;
        row.updatedAt = stamp.toISOString();
      }, {
        type: BOARD_EVENTS.SUPERSEDED,
        entity: 'boardmemo',
        entityId: memoId,
        summary: `Board memo superseded${replacement ? ` by revision of ${replacement.cycle}` : ''}; the original stays readable`,
      });
      return saved({ memo: findMemo(memoId) });
    },

    /** Explicit scan always runs, even when automatic propagation is paused. */
    boardScan() {
      store.update(() => {}, {
        type: BOARD_EVENTS.SCAN,
        entity: 'workspace',
        entityId: '',
        summary: 'Board Room reconciled obligations and span provenance against every committed memo',
      });
      return saved({ report: boardRead(store.state, { now: clock(), settings: settings() }) });
    },

    boardSetConventions(values = {}) {
      const { refusal } = gate();
      if (refusal) return refusal;
      const merged = normalizeBoardSettings({ ...settings(), ...values });
      store.update((draft) => { Object.assign(draft.settings, merged); }, {
        type: BOARD_EVENTS.CONVENTIONS_SET,
        entity: 'workspace',
        entityId: '',
        summary: `Board conventions updated: cell floor ${merged.boardCellFloor}, evidence floor ${merged.boardEvidenceFloor}, materiality ${merged.boardMaterialityPct}pp, re-check ${merged.boardRecheckDays}d, auto ${merged.boardAutoPropagate}`,
      });
      return saved({ report: boardRead(store.state, { now: clock(), settings: settings() }) });
    },
  };
}

export { BOARD_STATUSES, boardConventions };
