/**
 * app/core/domain/authorityReaffirmationActions.js — seat-checked commands and
 * safe reads for Frozen Authority Re-Affirmation & Drift Settlement
 * (ADR-0159, Schema v130).
 *
 * TWO human settlement commands on a DRIFTED frozen decision (`merit-cycle`,
 * `decision`, `board-memo`), plus one explicit reconciliation scan:
 *
 *   authorityReaffirmStandBehind
 *     "I hold (or govern) the live decision right over every subject of this
 *     frozen record today, and I stand behind the decision as made." Appends a
 *     dated settlement row carrying `underAuthorityIds` and the stated reason.
 *     NEVER mutates `meritCycles`, `decisions` or `boardMemos`, and NEVER
 *     overwrites `populationClaim`.
 *
 *   authorityReaffirmRefer
 *     "This drifted record cannot simply be stood behind under today's
 *     structure; re-open the question." Appends a `refer-reopen` settlement row
 *     and opens ONE governed, undecided `decision` record wired back to the
 *     drifted source and its subjects so the re-decision runs through DACI.
 *
 *   authorityContinuityScan
 *     Re-runs RULE-ACR-01 across the workspace, retrying any reconciliation
 *     delegation deferred by the per-commit cap.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { LEADER_ID } from './chain.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { matrixLineScopeFor } from './matrix.js';
import {
  authorityContinuityBriefLines,
  authorityContinuityCsvRows,
  buildAuthorityContinuity,
  canSettleAuthority,
  ownerNameOf,
} from './authorityContinuity.js';
import { normalizeAuthorityReaffirmationSettings } from './authorityReaffirmationSchema.js';
import {
  AUTHORITY_CONTINUITY_EVENTS,
  AUTHORITY_CONTINUITY_LINK_TYPES,
  AUTHORITY_CONTINUITY_RULE_ID,
  AUTHORITY_CONTINUITY_TYPE_KEYS,
  AUTHORITY_REAFFIRMATION_BOUNDS,
  AUTHORITY_REAFFIRMATION_LIMITS,
  AUTHORITY_REAFFIRMATION_OUTCOMES,
  AUTHORITY_REAFFIRMATION_RIGHTS,
} from './authorityContinuityRegistry.js';

const VALID_TYPES = new Set(AUTHORITY_CONTINUITY_TYPE_KEYS);

export function createAuthorityReaffirmationActions(store, { now, idFactory }) {
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
      return fail('The operating seat is unresolved and read-only. Declare a valid seat before settling a drifted frozen decision.');
    }
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, seat, built, at, cfg };
  };

  const resolveTargetRow = ({ recordType, recordId, reason, seat, at, cfg }) => {
    const type = typeof recordType === 'string' ? recordType.trim() : '';
    const id = typeof recordId === 'string' ? recordId.trim() : '';
    const cleanReason = typeof reason === 'string'
      ? reason.trim().slice(0, AUTHORITY_REAFFIRMATION_BOUNDS.maxReason)
      : '';
    if (!VALID_TYPES.has(type)) {
      return fail('Choose a valid frozen decision type (`merit-cycle`, `decision` or `board-memo`).', 'recordType');
    }
    if (!id) {
      return fail('Choose the frozen decision record you are settling.', 'recordId');
    }
    if (cleanReason.length < AUTHORITY_REAFFIRMATION_BOUNDS.minReason) {
      return fail(
        `State your reasoning in at least ${AUTHORITY_REAFFIRMATION_BOUNDS.minReason} characters. A silent sign-off on a drifted frozen decision is refused.`,
        'reason',
      );
    }

    const fullStateView = { ...store.state, settings: { ...cfg, activeSeatId: null } };
    const fullReport = buildAuthorityContinuity(fullStateView, { now: at, settings: fullStateView.settings });
    const fullRow = fullReport.allRows.find((r) => r.type === type && r.recordId === id) || null;
    if (!fullRow) {
      return fail('That frozen decision record does not exist in the continuity portfolio (drafts and undecided records are not frozen decisions).', 'recordId');
    }

    if (!seat.fullAccess) {
      const scopedReport = buildAuthorityContinuity(store.state, { now: at, settings: cfg, seat });
      const inSpan = scopedReport.allRows.some((r) => r.type === type && r.recordId === id);
      const standingOnFull = canSettleAuthority(seat, fullRow.currentAuthority, fullReport.liveMatrix);
      if (!inSpan && !standingOnFull.allow) {
        return fail('That frozen decision sits outside this seat’s operating span and authority.', 'scope');
      }
    }

    if (fullRow.verdict === 'unreadable') {
      return fail('An unreadable record cannot be settled: its authority could not be read, so standing behind or referring it as drifted would fabricate evidence that is not there.');
    }
    if (fullRow.verdict === 'unattributed') {
      return fail('An unattributed record named no authority when it was made. Re-affirming it would invent an original attribution that never existed; record a new governed decision instead.');
    }
    if (fullRow.verdict === 'attributable') {
      return fail('This record’s authority has not drifted — it still reproduces the authority in force on its own date, so there is no drift to settle.');
    }

    const standing = canSettleAuthority(seat, fullRow.currentAuthority, fullReport.liveMatrix);
    if (!standing.allow) {
      return fail(standing.reason, 'scope');
    }

    return {
      ok: true,
      type,
      id,
      cleanReason,
      fullRow,
      fullReport,
    };
  };

  const pushSettlement = (draft, row) => {
    draft.authorityReaffirmations = Array.isArray(draft.authorityReaffirmations)
      ? draft.authorityReaffirmations
      : [];
    if (draft.authorityReaffirmations.length >= AUTHORITY_REAFFIRMATION_LIMITS.acts) {
      draft.authorityReaffirmations.splice(
        0,
        draft.authorityReaffirmations.length - AUTHORITY_REAFFIRMATION_LIMITS.acts + 1,
      );
    }
    draft.authorityReaffirmations.push(row);
  };

  return {
    authorityContinuityReport(options = {}) {
      const at = options.now instanceof Date ? options.now : clock();
      const report = buildAuthorityContinuity(store.state, { now: at, settings: settings() });
      return { ok: true, report };
    },

    authorityContinuityBriefText(options = {}) {
      const at = options.now instanceof Date ? options.now : clock();
      const report = buildAuthorityContinuity(store.state, { now: at, settings: settings() });
      return { ok: true, text: authorityContinuityBriefLines(report).join('\n'), report };
    },

    authorityContinuityCsvRows(options = {}) {
      const at = options.now instanceof Date ? options.now : clock();
      const report = buildAuthorityContinuity(store.state, { now: at, settings: settings() });
      return { ok: true, rows: authorityContinuityCsvRows(report) };
    },

    authorityContinuityAttentionCount(options = {}) {
      const at = options.now instanceof Date ? options.now : clock();
      const report = buildAuthorityContinuity(store.state, { now: at, settings: settings() });
      return { ok: true, count: (report.unsettledDriftedN || 0) + (report.staleN || 0) };
    },

    authorityReaffirmStandBehind(input = {}) {
      const gate = seatFor(AUTHORITY_REAFFIRMATION_RIGHTS.REAFFIRM);
      if (!gate.ok) return gate;
      const target = resolveTargetRow({ ...input, ...gate });
      if (!target.ok) return target;

      if (target.fullRow.settlement === 'settled') {
        return fail('This drifted record has already been stood behind under today’s live authority set. No duplicate settlement was recorded.');
      }

      const today = dayKey(gate.at);
      const nowIso = gate.at.toISOString();
      const actingSeatId = gate.seat.fullAccess ? LEADER_ID : gate.seat.id;
      const act = {
        id: idFactory('acr'),
        recordType: target.type,
        recordId: target.id,
        outcome: AUTHORITY_REAFFIRMATION_OUTCOMES.STAND_BEHIND,
        decidedOn: today,
        decidedBySeatId: actingSeatId,
        via: gate.seat.fullAccess ? 'operator' : 'seat',
        underAuthorityIds: [...target.fullRow.currentAuthority.underAuthorityIds],
        reason: target.cleanReason,
        referralDecisionId: null,
        at: nowIso,
      };

      store.update((draft) => {
        pushSettlement(draft, act);
      }, {
        type: AUTHORITY_CONTINUITY_EVENTS.RESOLVE,
        entity: target.type,
        entityId: target.id,
        summary: `Stood behind drifted ${target.type} “${target.fullRow.label}” under current live authority.`,
      });

      return saved({ act });
    },

    authorityReaffirmRefer(input = {}) {
      const gate = seatFor(AUTHORITY_REAFFIRMATION_RIGHTS.REAFFIRM);
      if (!gate.ok) return gate;
      const target = resolveTargetRow({ ...input, ...gate });
      if (!target.ok) return target;

      if (target.fullRow.settlement === 'referred') {
        return fail('This drifted record has already been referred to a governed re-decision under today’s live authority set.');
      }

      const today = dayKey(gate.at);
      const nowIso = gate.at.toISOString();
      const conv = normalizeAuthorityReaffirmationSettings(gate.cfg);
      const reviewOn = addDays(today, conv.authorityReaffirmDueDays);
      const actingSeatId = gate.seat.fullAccess ? LEADER_ID : gate.seat.id;
      const approverName = ownerNameOf(store.state, actingSeatId);
      const driverId = target.fullRow.currentAuthority.targetId || actingSeatId;
      const driverName = ownerNameOf(store.state, driverId);
      const referralDecisionId = idFactory('dec');
      const actId = idFactory('acr');
      const linkSourceType = AUTHORITY_CONTINUITY_LINK_TYPES[target.type];

      const act = {
        id: actId,
        recordType: target.type,
        recordId: target.id,
        outcome: AUTHORITY_REAFFIRMATION_OUTCOMES.REFER_REOPEN,
        decidedOn: today,
        decidedBySeatId: actingSeatId,
        via: gate.seat.fullAccess ? 'operator' : 'seat',
        underAuthorityIds: [...target.fullRow.currentAuthority.underAuthorityIds],
        reason: target.cleanReason,
        referralDecisionId,
        at: nowIso,
      };

      store.update((draft) => {
        pushSettlement(draft, act);
        draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
        draft.decisions.unshift({
          id: referralDecisionId,
          title: `Re-open drifted ${target.type}: ${target.fullRow.label}`.slice(0, 200),
          question: `Frozen ${target.type} (${target.fullRow.asOf}) drifted from today’s live matrix authority (${target.fullRow.rightLabel}). Referral reason: ${target.cleanReason}`.slice(0, 2000),
          date: today,
          reversibility: 'reversible',
          driver: driverName.slice(0, 120),
          approver: approverName.slice(0, 120),
          contributors: '',
          informed: '',
          options: [
            {
              id: idFactory('dopt'),
              label: 'Confirm scope under current matrix charter',
              pros: 'Preserves continuity with explicit current-authority ownership.',
              cons: 'Leaves prior terms unchanged.',
            },
            {
              id: idFactory('dopt'),
              label: 'Supersede with revised decision under current authority',
              pros: 'Aligns commitments with the live reporting lines.',
              cons: 'Requires transition communication to affected lines.',
            },
          ],
          chosen: '',
          rationale: '',
          reviewOn,
          reviewedOn: null,
          outcome: 'pending',
          outcomeNotes: '',
          forecastProbability: null,
          decidedOn: null,
          createdAt: nowIso,
          portfolioNotes: [],
        });

        if (linkSourceType) {
          ensureEntityLink(draft, {
            sourceType: linkSourceType,
            sourceId: target.id,
            targetType: 'decision',
            targetId: referralDecisionId,
            relation: 'issues-obligation',
            ruleId: AUTHORITY_CONTINUITY_RULE_ID,
            summary: 'Referred drifted frozen decision into a governed re-decision.',
          }, { idFactory, todayStr: today, nowIso });
        }

        for (const subjectId of target.fullRow.subjectIds || []) {
          ensureEntityLink(draft, {
            sourceType: 'decision',
            sourceId: referralDecisionId,
            targetType: 'person',
            targetId: subjectId,
            relation: 'concerns',
            ruleId: AUTHORITY_CONTINUITY_RULE_ID,
            summary: 'Governed re-decision concerns this subject of the drifted frozen record.',
          }, { idFactory, todayStr: today, nowIso });
        }
      }, {
        type: AUTHORITY_CONTINUITY_EVENTS.RESOLVE,
        entity: 'decision',
        entityId: referralDecisionId,
        summary: `Referred drifted ${target.type} “${target.fullRow.label}” to governed re-decision.`,
      });

      return saved({ act, referralDecisionId });
    },

    authorityContinuityScan() {
      const gate = seatFor(AUTHORITY_REAFFIRMATION_RIGHTS.REAFFIRM);
      if (!gate.ok) return gate;
      store.update((draft) => {
        draft.authorityReaffirmations = Array.isArray(draft.authorityReaffirmations)
          ? draft.authorityReaffirmations
          : [];
        draft.authorityReaffirmationMarkers = Array.isArray(draft.authorityReaffirmationMarkers)
          ? draft.authorityReaffirmationMarkers
          : [];
      }, {
        type: AUTHORITY_CONTINUITY_EVENTS.SCAN,
        entity: 'workspace',
        entityId: 'authority-continuity',
        summary: 'Scanned frozen-decision portfolio for unsettled authority drift.',
      });
      return saved();
    },
  };
}
