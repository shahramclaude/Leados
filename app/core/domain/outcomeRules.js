/**
 * ADR-0107 — RULE-OLN-01..04 on the SHARED, GENERALIZED post-commit spine.
 *
 * Altitude is a dimension of THIS engine, not a second roll-up system. The
 * atomic transaction that adopts a cross-module response also freezes its
 * expectation, links it to every module the commands touched, and writes one
 * `rolls-up-to` edge per leadership ancestor. The atomic transaction that
 * records the terminal evidence grades the frozen claim exactly once and opens
 * governed recalibration work at the altitude that owns the gap.
 *
 *  RULE-OLN-01 FREEZE   one expectation per adopted bundle, id derived from the
 *                       bundle so a rescan cannot duplicate it; typed pointer
 *                       edges to case/decision/delegation/premise/budget/comms/
 *                       person, and one ancestor edge per rung.
 *  RULE-OLN-02 GRADE    once-only, out of sample, from CLOSED execution plus a
 *                       dated human decision outcome. Refusal is stored too,
 *                       so hindsight can never be re-scored as foresight.
 *  RULE-OLN-03 STALE    one governed review decision per span per ISO week for
 *                       open expectations past their declared stale window.
 *  RULE-OLN-04 BIAS     one governed recalibration decision per span per ISO
 *                       week when the pooled direction is material under the
 *                       declared floors. The decision is an ASK, never an
 *                       automatic change of anyone's forecast.
 *
 * All four are bounded, marker-idempotent and pausable by `outcomeAutoLearn`;
 * an explicit scan always runs. Only ROOT events are sensed (second-order
 * cascade is refused), and at most ONE summary timeline event is written per
 * pass so the append-only log is never flooded by a re-derivation.
 */
import { addDays, dayKey, daysBetween, weekKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { activeSeat, buildSeats } from './seat.js';
import { LEADER_ID } from './chain.js';
import { BUNDLE_EVENTS } from './actionBundleRegistry.js';
import { EXECUTION_SCAN_EVENT } from './executionRegistry.js';
import { outsideViewFromGrades, outcomeConventions } from './outcomePrior.js';
import {
  contractForBundle, gradeForContract, outcomeContractId, outcomeFingerprint,
} from './outcomeLearning.js';
import {
  OUTCOME_CHANGED_EVENT, OUTCOME_EVENTS, OUTCOME_FREEZE_EVENTS,
  OUTCOME_GOVERNANCE_EVENTS, OUTCOME_LIMITS, OUTCOME_RULE_IDS,
  OUTCOME_SCAN_EVENT,
} from './outcomeRegistry.js';

const effect = (ruleId, action, targetType, targetId, summary) => ({ ruleId, action, targetType, targetId, summary: String(summary).slice(0, 240) });
const markerId = (kind, week, span) => `olm-${kind}-${week}-${String(span || 'enterprise').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60)}`;

function collection(draft, key) {
  if (!Array.isArray(draft[key])) draft[key] = [];
  return draft[key];
}
function hasMarker(draft, id) { return collection(draft, 'outcomeMarkers').some((m) => m && m.id === id); }
function addMarker(draft, ctx, marker) {
  const rows = collection(draft, 'outcomeMarkers');
  if (rows.some((m) => m && m.id === marker.id)) return false;
  rows.push({ ...marker, recordedOn: dayKey(ctx.now) });
  if (rows.length > OUTCOME_LIMITS.markers) rows.splice(0, rows.length - OUTCOME_LIMITS.markers);
  return true;
}
function link(draft, ctx, sourceType, sourceId, targetType, targetId, relation, ruleId, summary) {
  if (!sourceId || !targetId) return false;
  return ensureEntityLink(draft, { sourceType, sourceId, targetType, targetId, relation, ruleId,
    summary: String(summary).slice(0, 240) }, {
    idFactory: ctx.idFactory, todayStr: dayKey(ctx.now), nowIso: ctx.now.toISOString(),
  }).created;
}
function ancestors(draft, ownerNodeId, now) {
  const built = buildSeats(draft, { now, settings: draft.settings || {} });
  const out = []; const seen = new Set();
  let cursor = ownerNodeId; let guard = 0;
  while (cursor && !seen.has(cursor) && guard < OUTCOME_LIMITS.ancestors) {
    seen.add(cursor);
    if (cursor === LEADER_ID || built.byId.has(cursor)) out.push(cursor);
    if (cursor === LEADER_ID) break;
    cursor = built.chain.nodes.get(cursor)?.parentId || LEADER_ID;
    guard += 1;
  }
  return out;
}
function governedDecision(ctx, { title, question, options, reviewOn, rationale }) {
  const today = dayKey(ctx.now);
  const driver = String(ctx.draft?.settings?.leaderName || '').slice(0, 120);
  return {
    id: ctx.idFactory('dec'), title: title.slice(0, 200), question: question.slice(0, 4000),
    date: today, reversibility: 'reversible', driver, approver: driver,
    contributors: '', informed: '',
    options: options.map(([label, pros, cons]) => ({ id: ctx.idFactory('opt'), label, pros, cons })),
    chosen: '', rationale: rationale.slice(0, 4000), reviewOn, reviewedOn: null,
    outcome: 'pending', outcomeNotes: '', forecastProbability: null, decidedOn: null,
    createdAt: ctx.now.toISOString(),
  };
}

export function outcomeRule(draft, ctx = {}) {
  const type = ctx.event?.type;
  if (ctx.derived === true) return []; // no second-order cascade from our own findings
  if (!OUTCOME_EVENTS.includes(type)) return [];
  const explicit = [OUTCOME_SCAN_EVENT, BUNDLE_EVENTS.SCAN, EXECUTION_SCAN_EVENT].includes(type);
  if (!explicit && draft.settings?.outcomeAutoLearn === false) return [];
  const effects = [];
  const settings = draft.settings || {};
  const conv = outcomeConventions(settings);
  const now = ctx.now;
  const contracts = collection(draft, 'outcomeContracts');
  const grades = collection(draft, 'outcomeGrades');
  const byBundle = new Map(contracts.map((c) => [c.bundleId, c]));

  /* ---------------------------------------------------- RULE-OLN-01 FREEZE */
  if (OUTCOME_FREEZE_EVENTS.includes(type)) {
    for (const bundle of draft.actionBundles || []) {
      if (!bundle || bundle.status !== 'committed' || byBundle.has(bundle.id)) continue;
      const frozen = contractForBundle(draft, bundle, now);
      if (!frozen) continue;
      if (contracts.length >= OUTCOME_LIMITS.contracts) break;
      contracts.push(frozen);
      byBundle.set(bundle.id, frozen);
      effects.push(effect(OUTCOME_RULE_IDS.FREEZE, 'froze', 'bundle', bundle.id,
        `Frozen expectation: ${frozen.forecastPct === null ? 'no reviewed probability (ungradable unless one is pre-registered)' : `${frozen.forecastPct}% (${frozen.forecastSource})`}; horizon ${frozen.horizonOn}; ${frozen.expectedActions} planned action(s).`));
      link(draft, ctx, 'outcomecontract', frozen.id, 'bundle', bundle.id, 'pre-registers', OUTCOME_RULE_IDS.FREEZE,
        'This frozen expectation pre-registers the adopted response bundle before any outcome exists.');
      link(draft, ctx, 'outcomecontract', frozen.id, 'case', frozen.sourceCaseId, 'rests-on', OUTCOME_RULE_IDS.FREEZE,
        'The adopted response rests on the human-resolved source case whose closure ends the loop.');
      for (const pointer of frozen.sourcePointers) {
        if (pointer.type === 'case') continue;
        link(draft, ctx, 'outcomecontract', frozen.id, pointer.type, pointer.id, 'rests-on', OUTCOME_RULE_IDS.FREEZE,
          `Typed, content-free provenance to the ${pointer.type} record this response adopted.`);
      }
      for (const seatId of ancestors(draft, frozen.ownerNodeId, now)) {
        link(draft, ctx, 'outcomecontract', frozen.id, 'person', seatId, 'rolls-up-to', OUTCOME_RULE_IDS.FREEZE,
          'Leadership span carrying this frozen expectation; aggregate readers receive counts and intervals, never proof pointers or notes.');
      }
    }
  }

  /* ----------------------------------------------------- RULE-OLN-02 GRADE */
  for (const contract of [...contracts]) {
    if (contract.status !== 'open' || grades.some((g) => g.contractId === contract.id)) continue;
    const graded = gradeForContract(draft, contract, now, settings);
    if (!graded.ok) continue;
    if (grades.length >= OUTCOME_LIMITS.grades) break;
    grades.push(graded.grade);
    contract.status = graded.refused ? 'ungradable' : 'graded';
    contract.closedOn = graded.grade.closedOn;
    contract.gradedOn = graded.grade.gradedOn;
    contract.fingerprint = outcomeFingerprint({ ...contract, gradeId: graded.grade.id });
    const bundle = (draft.actionBundles || []).find((b) => b.id === contract.bundleId);
    const decisionOutput = (bundle?.outputs || []).find((o) => o.kind === 'decision');
    if (decisionOutput) {
      link(draft, ctx, 'outcomecontract', contract.id, 'decision', decisionOutput.id, 'grades-outcome', OUTCOME_RULE_IDS.GRADE,
        `One-shot ${graded.refused ? 'refused' : 'Brier'} grade of the frozen expectation against the dated human outcome review.`);
    }
    // The grade itself rolls up through the SAME ancestor ladder as the freeze.
    for (const seatId of ancestors(draft, contract.ownerNodeId, now)) {
      link(draft, ctx, 'outcomecontract', contract.id, 'person', seatId, 'rolls-up-to', OUTCOME_RULE_IDS.GRADE,
        'Once-only outcome grade now reads at this leadership span as an aggregate, with small cells suppressed.');
    }
    effects.push(effect(OUTCOME_RULE_IDS.GRADE, graded.refused ? 'refused' : 'graded', 'bundle', contract.bundleId,
      graded.refused ? `Grade refused: ${graded.grade.reason}` : `Brier ${graded.grade.brier}, quadrant ${graded.grade.verdict}, ${graded.grade.delayDays ?? '—'} day(s) past horizon.`));
  }

  /* ------------------------------------------- RULE-OLN-03 / 04 GOVERNANCE */
  if (OUTCOME_GOVERNANCE_EVENTS.includes(type)) {
    const built = buildSeats(draft, { now, settings });
    const seat = activeSeat(built);
    const week = weekKey(now) || dayKey(now);
    const span = seat.fullAccess ? LEADER_ID : seat.id;
    const inSpan = (row) => seat.fullAccess || row.ownerNodeId === span || seat.scope.has(row.ownerNodeId);
    const stale = contracts.filter((c) => c.status === 'open' && inSpan(c) && c.horizonOn
      && (daysBetween(addDays(c.horizonOn, conv.staleDays), dayKey(now)) ?? -1) >= 0);
    const staleMarker = markerId('stale', week, span);
    if (stale.length && !hasMarker(draft, staleMarker)) {
      const decision = governedDecision(ctx, {
        title: `Review ${stale.length} frozen expectation(s) past their window`,
        question: 'Which declared horizon or stale window is wrong, and which loops need an explicit human outcome review before the next operating cycle?',
        options: [
          ['Re-declare the horizon', 'A dated promise the organisation can keep', 'Conventions are declared, never fitted to make a grade look better'],
          ['Close the evidence loop', 'Terminal proof and a human case resolution already exist', 'Nothing is invented or auto-closed'],
          ['Record a blameless process blocker', 'The missing proof is named without rating a person', 'Requires a written reason'],
        ],
        reviewOn: addDays(dayKey(now), 7),
        rationale: `${stale.length} expectation(s) adopted in this span are more than ${conv.staleDays} day(s) past their frozen horizon with no one-shot grade. This is a process review, not a person score.`,
      });
      collection(draft, 'decisions').push(decision);
      addMarker(draft, ctx, { id: staleMarker, kind: 'stale', week, seatId: span, decisionId: decision.id });
      link(draft, ctx, 'decision', decision.id, 'person', span, 'informs', OUTCOME_RULE_IDS.STALE, 'The governed stale-window review is owned at the span whose expectations are ungraded.');
      for (const seatId of ancestors(draft, span, now)) {
        if (seatId === span) continue;
        link(draft, ctx, 'decision', decision.id, 'person', seatId, 'rolls-up-to', OUTCOME_RULE_IDS.STALE, 'Stale-learning review rolls up to this leadership ancestor.');
      }
      effects.push(effect(OUTCOME_RULE_IDS.STALE, 'opened', 'decision', decision.id, `One governed stale-window review for ${stale.length} ungraded expectation(s), once per span per ISO week.`));
    }
    const localGrades = grades.filter((g) => g.status === 'graded' && inSpan(g));
    const outside = outsideViewFromGrades(localGrades, settings);
    const biasMarker = markerId('bias', week, span);
    if (outside.status === 'published' && outside.material && !hasMarker(draft, biasMarker)) {
      const decision = governedDecision(ctx, {
        title: `Re-declare the response-confidence convention (${outside.direction})`,
        question: 'Given the workspace’s own graded loops, should the declared confidence convention, the review horizon, or the evidence required before adoption change?',
        options: [
          ['Re-declare the convention', 'A bounded, printed change to the floor or horizon', 'Does not rewrite any frozen forecast or one-shot grade'],
          ['Keep the convention and record the reason', 'The gap is understood and accepted', 'Requires a written reason'],
          ['Commission a closer look at one evidence class', 'Names the process, never a person', 'Opens further human work'],
        ],
        reviewOn: addDays(dayKey(now), 14),
        rationale: `Pooled declared confidence ${outside.declaredPct}% vs realised ${outside.observedPct}% over ${outside.n} graded loop(s): ${outside.direction} by ${outside.gapPp} pp, above the declared ${conv.materialityPp} pp materiality floor. Outside view ${outside.pct}% (95% Wilson ${outside.loPct}–${outside.hiPct}%). Association, not causation; no leader’s forecast was changed automatically.`,
      });
      collection(draft, 'decisions').push(decision);
      addMarker(draft, ctx, { id: biasMarker, kind: 'bias', week, seatId: span, decisionId: decision.id });
      link(draft, ctx, 'decision', decision.id, 'person', span, 'informs', OUTCOME_RULE_IDS.BIAS, 'The governed recalibration review is owned at the span whose loops were pooled.');
      for (const seatId of ancestors(draft, span, now)) {
        if (seatId === span) continue;
        link(draft, ctx, 'decision', decision.id, 'person', seatId, 'rolls-up-to', OUTCOME_RULE_IDS.BIAS, 'Pooled calibration direction rolls up as an identity-free ask.');
      }
      effects.push(effect(OUTCOME_RULE_IDS.BIAS, 'opened', 'decision', decision.id, `One governed recalibration review: ${outside.direction} by ${outside.gapPp} pp over ${outside.n} graded loop(s).`));
    }
  }

  if (effects.length && typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: OUTCOME_CHANGED_EVENT, entity: 'workspace', entityId: '',
      summary: `[${OUTCOME_RULE_IDS.FREEZE}/02/03/04] ${effects.length} outcome-learning effect(s); one summary event, no second-order cascade.` });
  }
  return effects;
}
