/**
 * app/core/domain/comparisonActions.js — commands and scoped reads for the
 * Portfolio Rehearsal Comparison (ADR-0118, Schema v113).
 *
 * The only write is `recordPortfolioComparison`: a VP or the chief records which
 * of two REHEARSED responses they are taking, with a written rationale, and the
 * receipt that justified it is stored beside the governed decision in ONE atomic
 * transaction. Nothing is adopted by recording the arbitration — the chosen
 * bundle is still adopted through its own reviewed `commitActionBundle` path, so
 * a comparison can never smuggle an unrehearsed write into the workspace.
 *
 * Strictness at the boundary (the same discipline as `saveActionBundlePreview`):
 *   • the receipt must have been produced from the CURRENT revision, today;
 *   • both sides' input and source fingerprints must still match the live
 *     bundles, so a receipt that outlived an edit is refused as stale;
 *   • a rehearsal with any rule failure is refused — an incomplete comparison is
 *     not a basis for an arbitration;
 *   • the choice must be one of the two sides or an explicit "hold both";
 *   • the rationale is required: a portfolio arbitration without reasoning is
 *     exactly the record this module exists to stop.
 */

import { dayKey, addDays } from '../time.js';
import { activeSeat, buildSeats, canAct, canSee } from './seat.js';
import { responsibleNodeId } from './chain.js';
import { bundleInputFingerprint, bundleSourceFingerprint, createStagedStore } from './actionBundles.js';
import {
  COMPARISON_CHOICES, COMPARISON_CHOICE_LABELS, COMPARISON_EVENTS, COMPARISON_LIMITS,
  comparisonBriefText, comparisonReport, comparisonReviewDate,
  declaredCommitments, normalizeComparisonReceipt,
} from './portfolioComparison.js';

const RIGHT = 'compare-responses';
const clean = (v, max = 400) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function createComparisonActions(store, { now, idFactory, createApi }) {
  const fail = (error, field = null, code = null) => ({
    ok: false, error, ...(field ? { field } : {}), ...(code ? { code } : {}),
  });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const built = () => buildSeats(store.state, { now: clock(), settings: store.state.settings });
  const saved = (extra = {}) => ({
    ...extra, saved: !store.persistError, warning: store.persistError || null,
    propagations: store.lastPropagations || [], ok: true,
  });

  /**
   * ADR-0116 / ADR-0118 subsidiarity rule: a seat may see and arbitrate a
   * response when it is the COMMON LEADER of the people that response would put
   * to work (the lowest common ancestor of its owners), or when the source case
   * sits inside its full-detail boundary. It never widens to a peer's branch and
   * it is computed per response, from the record, never declared.
   */
  function responseInSeatBoundary(seat, chain, bundle) {
    if (!seat || seat.fullAccess) return true;
    const source = (store.state.cases || []).find((c) => c.id === bundle.sourceId);
    if (!source) return false;
    if (canSee(source, 'cases', seat, chain).allow === 'full') return true;
    if (seat.rank < 3) return false;
    const owners = (bundle.commands || []).map((c) => c.ownerId).filter(Boolean);
    return owners.length > 0 && owners.every((id) => seat.scope && seat.scope.has(id));
  }

  /**
   * The arbitration itself is a PAIR rule: the seat may record a choice between
   * two responses when the people they put to work MEET AT THIS SEAT (the lowest
   * common ancestor of both owner sets is the seat). That is the subsidiarity
   * boundary — two branches that only meet at this rung can be arbitrated here
   * and nowhere below it — and it is derived from the record, never declared.
   */
  function pairInSeatBoundary(seat, chain, bundles) {
    if (!seat || seat.fullAccess) return true;
    const sourcesFull = bundles.every((bundle) => {
      const source = (store.state.cases || []).find((c) => c.id === bundle.sourceId);
      return Boolean(source) && canSee(source, 'cases', seat, chain).allow === 'full';
    });
    if (sourcesFull) return true;
    if (seat.rank < 3) return false;
    const owners = [...new Set(bundles.flatMap((bundle) => (bundle.commands || []).map((c) => c.ownerId)).filter(Boolean))];
    if (!owners.length) return false;
    return responsibleNodeId(chain.chain, owners) === seat.id;
  }

  /** Bundles a seat may compare: open, rehearsable, inside its arbitration boundary. */
  function eligibleBundles(seat, chain) {
    return (store.state.actionBundles || [])
      .filter((b) => b && ['draft', 'rehearsed'].includes(b.status))
      .filter((b) => responseInSeatBoundary(seat, chain, b))
      .map((b) => {
        const source = (store.state.cases || []).find((c) => c.id === b.sourceId);
        const commitments = declaredCommitments(store.state, b);
        // Above the director rung a unit's TASK titles stay withheld; the identity
        // of a governed intervention its common leader must arbitrate is not task
        // detail, and withholding it would make the arbitration blind. The source
        // case title follows the ordinary ceiling and is withheld with a reason.
        const unitDetail = Boolean(seat?.fullAccess) || canSee(source, 'cases', seat, chain).allow === 'full';
        return {
          id: b.id, name: b.name, status: b.status, reviewOn: b.reviewOn || null,
          caseId: b.sourceId || null, caseTitle: unitDetail ? (source?.title || '') : '',
          titleWithheld: !unitDetail,
          commands: (b.commands || []).map((c) => c.kind),
          declared: commitments.declared, spend: commitments.spend,
          rehearsed: b.status === 'rehearsed' && Boolean(b.preview),
          stale: b.baseRevision !== store.state.meta.revision || b.evaluatedAt?.slice(0, 10) !== dayKey(clock()),
        };
      });
  }

  /**
   * Vertical disclosure for the ledger: an executive reads their own
   * arbitrations and those of the spans beneath them. A peer division's
   * comparison is never handed sideways, and the rung above is not readable
   * from below — the receipt rolls UP, it does not leak DOWN.
   */
  function readableRecords(seat) {
    const all = store.state.portfolioComparisons || [];
    if (!seat || seat.fullAccess) return all;
    return all.filter((r) => r && r.provenance && (r.provenance.seatId === seat.id || (seat.scope && seat.scope.has(r.provenance.seatId))));
  }

  return {
    /* ---------------------------------------------------------------- reads */

    comparisonCandidates() {
      const chain = built();
      const seat = activeSeat(chain);
      return { ok: true, bundles: eligibleBundles(seat, chain), rank: seat?.rank ?? null, seatLabel: seat?.label || null };
    },

    comparisonRead() {
      const chain = built();
      const seat = activeSeat(chain);
      const visible = readableRecords(seat);
      const report = comparisonReport({ ...store.state, portfolioComparisons: visible }, clock());
      return {
        ok: true, records: report.records, stale: report.stale.length,
        decided: report.decided.length, held: report.held.length,
        rank: seat?.rank ?? null, seatLabel: seat?.label || null,
        canRecord: Boolean(seat && (seat.fullAccess || seat.rank >= 4)),
      };
    },

    comparisonBrief(recordId) {
      const seat = activeSeat(built());
      const record = readableRecords(seat).find((r) => r && r.id === recordId);
      return comparisonBriefText(record);
    },

    /* ---------------------------------------------------------------- write */

    recordPortfolioComparison(payload = {}) {
      let chain; let seat;
      try { chain = built(); seat = activeSeat(chain); } catch (error) {
        return fail(error?.message || 'The operating seat could not be resolved.');
      }
      if (!seat || seat.readOnly) return fail('Declare a valid operating seat before recording an arbitration.');
      const verdict = canAct(RIGHT, seat);
      if (!verdict.allow) return fail(verdict.reason);
      if (!seat.fullAccess && seat.rank < 4) {
        return fail('A portfolio arbitration is a VP or chief command. The comparison is readable below that only through the disclosure ledger, never as a decision.');
      }
      if (payload.assumptionsConfirmed !== true) {
        return fail('Confirm that you read the declared assumptions and the dominance refusal before recording the arbitration.', 'assumptionsConfirmed');
      }
      const choice = COMPARISON_CHOICES.includes(payload.choice) ? payload.choice : null;
      if (!choice) return fail('Choose response A, response B, or an explicit hold.', 'choice');
      const rationale = clean(payload.rationale, COMPARISON_LIMITS.rationale);
      if (rationale.length < COMPARISON_LIMITS.minRationale) {
        return fail(`Write the reasoning for this arbitration (at least ${COMPARISON_LIMITS.minRationale} characters). A portfolio choice without its reasoning is the record this module exists to stop.`, 'rationale');
      }
      const receipt = normalizeComparisonReceipt(payload.receipt);
      if (!receipt) return fail('The rehearsal receipt is malformed or incomplete. Rehearse both responses again.', 'receipt');

      const today = dayKey(clock());
      if (receipt.baseRevision !== store.state.meta.revision) {
        return fail('The workspace changed after this rehearsal. Rehearse both responses again; nothing was recorded.', 'receipt', 'stale-rehearsal');
      }
      if (receipt.evaluatedOn !== today) {
        return fail('The rehearsal is from another day. Rehearse both responses again; a comparison is only valid for the day it was run.', 'receipt', 'stale-rehearsal');
      }

      const bundles = new Map((store.state.actionBundles || []).map((b) => [b.id, b]));
      for (const side of receipt.sides) {
        const bundle = bundles.get(side.bundleId);
        if (!bundle) return fail('One of the rehearsed bundles no longer exists. Rehearse again.', 'receipt', 'stale-rehearsal');
        if (!['draft', 'rehearsed'].includes(bundle.status)) {
          return fail('One of these responses has already been adopted, withdrawn or archived. A comparison is between open responses.', 'receipt', 'stale-rehearsal');
        }
        if (side.inputFingerprint !== bundleInputFingerprint(bundle)
          || side.sourceFingerprint !== bundleSourceFingerprint(store.state, bundle)) {
          return fail('A reviewed response changed after it was rehearsed. Rehearse both responses again; nothing was recorded.', 'receipt', 'stale-rehearsal');
        }
        if (side.footprint.failureCount > 0) {
          return fail('One rehearsal reported rule failures, so the footprint is incomplete. Repair the plan and rehearse again.', 'receipt');
        }
      }
      if (!pairInSeatBoundary(seat, chain, receipt.sides.map((s) => bundles.get(s.bundleId)))) {
        return fail('These two responses meet above or beside this seat, not at it. A peer branch is never handed sideways — arbitrate responses whose owners meet at your own span, or ask the common leader.', 'receipt');
      }

      const sides = receipt.sides;
      const chosenLabel = choice === 'neither'
        ? COMPARISON_CHOICE_LABELS.neither
        : `${COMPARISON_CHOICE_LABELS[choice]}: ${sides[choice === 'a' ? 0 : 1].name}`.slice(0, 180);
      const title = `Arbitrate: ${sides[0].name} vs ${sides[1].name}`.slice(0, 180);
      const recordId = idFactory('cmp');
      const leaderName = clean(store.state.settings?.leaderName, 120) || 'Workspace leader';
      const record = {
        id: recordId,
        status: 'recorded',
        recordedOn: today,
        recordedAt: clock().toISOString(),
        choice,
        rationale,
        decisionId: '',
        receipt,
        provenance: { seatId: seat?.id || null, rank: seat?.rank ?? null, recordedBy: seat?.label || leaderName },
        scope: receipt.scope,
      };
      let createdDecisionId = null;
      const sourceEvents = [];
      try {
        store.update((draft, helpers) => {
          const staged = createStagedStore(draft, helpers, { now: clock(), store });
          const stagedApi = createApi(staged.staged, { now: clock, idFactory });
          const options = [
            ...sides.map((side, index) => ({
              label: `Take ${index === 0 ? 'A' : 'B'}: ${side.name}`.slice(0, 180),
              pros: `Footprint +${side.footprint.totals.created}/~${side.footprint.totals.updated}; owned work ${side.declared.ownedWork}; briefs ${side.declared.briefs}; declared spend ${side.spend.length ? side.spend.map((r) => `${r.currency} ${r.amount}`).join(' + ') : 'none'}.`.slice(0, 300),
              cons: `Leaves the other response uncommitted. Dominance is a resource relation, not evidence that this response works.`.slice(0, 300),
            })),
            { label: COMPARISON_CHOICE_LABELS.neither.slice(0, 180),
              pros: 'Neither commitment is made while the evidence is thin; both rehearsals stay on the record.'.slice(0, 300),
              cons: 'The operating constraint stays unaddressed this cycle. Holding is a decision with its own cost.'.slice(0, 300) },
          ];
          const decision = stagedApi.addDecision({
            title,
            question: `Which reviewed response should this portfolio commit to? Both were rehearsed from workspace revision ${receipt.baseRevision} on ${receipt.evaluatedOn}. ${receipt.dominance.note}`.slice(0, 900),
            date: today,
            reviewOn: comparisonReviewDate(clock()),
            reversibility: 'reversible',
            driver: leaderName,
            approver: leaderName,
            options,
            chosen: chosenLabel,
            rationale: `${rationale} — Receipt ${recordId}. ${receipt.scope}`.slice(0, 2000),
          });
          if (!decision.ok) throw new Error(decision.error || 'The arbitration decision could not be recorded.');
          createdDecisionId = decision.id;
          // The staged decision's own events join the shared post-commit chain in
          // this same transaction, exactly as an adopted action bundle's do.
          sourceEvents.push(...staged.sourceEvents);
          if (!Array.isArray(draft.portfolioComparisons)) draft.portfolioComparisons = [];
          draft.portfolioComparisons.push({ ...record, decisionId: decision.id });
          if (draft.portfolioComparisons.length > COMPARISON_LIMITS.records) {
            draft.portfolioComparisons.splice(0, draft.portfolioComparisons.length - COMPARISON_LIMITS.records);
          }
          // Provenance edges and the vertical roll-up are RULE-CMP-01's job on the
          // same transaction — one owner for graph writes, never a one-off copy.
        }, {
          type: COMPARISON_EVENTS.RECORDED, entity: 'comparison', entityId: recordId,
          summary: `Portfolio arbitration recorded: ${sides[0].name} vs ${sides[1].name} — ${COMPARISON_CHOICE_LABELS[choice]}`,
        }, { sourceEvents });
      } catch (error) {
        return fail(error?.message || 'The arbitration could not be recorded. No live records were changed.');
      }
      if (!createdDecisionId) return fail('The arbitration decision was not created. Nothing was recorded.');
      const stored = (store.state.portfolioComparisons || []).find((r) => r && r.id === recordId) || null;
      return saved({ id: recordId, decisionId: createdDecisionId, record: stored, reviewOn: addDays(today, 14) });
    },
  };
}
