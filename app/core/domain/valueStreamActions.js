/**
 * Reviewed commands for lateral SLA negotiation and atomic stop-rule capital
 * carryover. Mounted before guardApi; declared seats remain local disclosure
 * boundaries, not authentication.
 */
import { dayKey, daysBetween } from '../time.js';
import { lowestCommonAncestor } from './chain.js';
import { activeSeat, buildSeats, canAct, canSee } from './seat.js';
import { altitudeByKey } from './chainRegistry.js';
import { evaluateBudget } from './finance.js';
import { priceSpanFeasibility } from './catchball.js';
import { normalizeCatchballPact, normalizeCatchballRound } from './catchballSchema.js';
import {
  normalizeValueStreamContract,
  normalizeValueStreamReallocation,
  normalizeValueStreamRound,
  normalizeValueStreamSettings,
} from './valueStreamSchema.js';
import {
  VALUE_STREAM_DIRECTIONS,
  VALUE_STREAM_EVENTS,
  VALUE_STREAM_LIMITS,
  VALUE_STREAM_SETTLEMENTS,
} from './valueStreamRegistry.js';
import { buildValueStreamReport, valueStreamBriefText, valueStreamCsvRows, valueStreamTargetMet } from './valueStream.js';

function validDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
function finite(v, { min = 0, max = 1e9 } = {}) {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 100) / 100 : null;
}
function digest64(value) {
  // FNV-1a 64: a staleness detector, not a security/authenticity primitive.
  let hash = 0xcbf29ce484222325n;
  for (const ch of String(value)) {
    hash ^= BigInt(ch.codePointAt(0));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}
const clean = (v, max = 400) => typeof v === 'string' ? v.trim().slice(0, max) : '';

export function createValueStreamActions(store, { now, idFactory }) {
  const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date());
  const saved = (extra = {}) => ({ ok: true, ...extra, saved: !store.persistError,
    warning: store.persistError || null, propagations: store.lastPropagations || [] });
  const settings = () => store.state.settings || {};
  const contracts = () => Array.isArray(store.state.valueStreamContracts) ? store.state.valueStreamContracts : [];
  const rounds = () => Array.isArray(store.state.valueStreamRounds) ? store.state.valueStreamRounds : [];
  const findContract = (id) => contracts().find((c) => c && c.id === id) || null;
  const resolveSeat = () => {
    const built = buildSeats(store.state, { now: clock(), settings: settings() });
    return { built, seat: activeSeat(built) };
  };
  const right = (name, seat) => {
    const verdict = canAct(name, seat);
    return verdict.allow ? null : fail(verdict.reason, 'scope');
  };
  function verifyParty(contractOrIds, allowed = null) {
    const { built, seat } = resolveSeat();
    const denied = right('negotiate-catchball', seat);
    if (denied) return { error: denied, seat, built };
    if (seat.fullAccess) return { error: null, seat, built };
    const ids = Array.isArray(contractOrIds) ? contractOrIds : [contractOrIds.supplierSeatId, contractOrIds.consumerSeatId];
    if (!ids.includes(seat.id) || (allowed && !allowed.includes(seat.id))) {
      return { error: fail('Only an actual supplier/consumer party may change this contract. The LCA mediator governs disputes but cannot consent or report actuals for either party.', 'scope'), seat, built };
    }
    return { error: null, seat, built, actorSeatId: seat.id };
  }
  function activePerson(id) {
    return (store.state.people || []).find((p) => p && p.id === id && p.status !== 'archived') || null;
  }
  function validateTerms(input, current = null) {
    const value = (key) => input[key] !== undefined ? input[key] : current?.[key];
    const title = clean(value('title'), 180);
    const metric = clean(value('metric'), 140); const unit = clean(value('unit'), 40);
    const direction = value('direction');
    const target = finite(value('target'), { min: 0.000001 });
    const actual = value('actual') === null || value('actual') === '' || value('actual') === undefined ? null : finite(value('actual'));
    const effortDays = finite(value('effortDays'), { max: 365 });
    const leadTimeDays = finite(value('leadTimeDays'), { min: 0.01, max: 365 });
    const startsOn = value('startsOn') || null; const dueOn = value('dueOn') || null;
    if (!current && title.length < 4) return { error: fail('Give the hand-off a clear title (at least 4 characters).', 'title') };
    if (!metric || !unit) return { error: fail('Name the SLA metric and its unit; a hand-off without a measure is not a contract.', 'metric') };
    if (!VALUE_STREAM_DIRECTIONS.includes(direction)) return { error: fail('Choose whether the SLA is at-least or at-most.', 'direction') };
    if (target === null) return { error: fail('Enter a positive numeric SLA target.', 'target') };
    if (value('actual') !== null && value('actual') !== '' && value('actual') !== undefined && actual === null) return { error: fail('Actual must be a non-negative number or blank for unknown.', 'actual') };
    if (effortDays === null) return { error: fail('Enter supplier effort between 0 and 365 person-days.', 'effortDays') };
    if (leadTimeDays === null) return { error: fail('Enter a positive hand-off lead time (maximum 365 days).', 'leadTimeDays') };
    if ((startsOn && !validDay(startsOn)) || (dueOn && !validDay(dueOn)) || (startsOn && dueOn && dueOn < startsOn)) {
      return { error: fail('Enter valid dates; the SLA due date cannot precede its start.', 'dueOn') };
    }
    return { value: { title, metric, unit, direction, target, actual, effortDays, leadTimeDays, startsOn, dueOn } };
  }
  function roundSnapshot(contract, kind, actorSeatId, input, at, id, roundNumber) {
    return normalizeValueStreamRound({
      id, contractId: contract.id, actorSeatId, kind, roundNumber,
      metric: contract.metric, unit: contract.unit, direction: contract.direction,
      target: contract.target, actual: contract.actual, effortDays: contract.effortDays,
      leadTimeDays: contract.leadTimeDays, dueOn: contract.dueOn,
      recordedOn: input.recordedOn || dayKey(at), note: clean(input.note), createdAt: at.toISOString(),
    });
  }

  function carryoverPreview(input = {}) {
    const { built, seat } = resolveSeat();
    const denied = right('approve-capital', seat);
    if (denied) return denied;
    const sourcePactIds = Array.isArray(input.sourcePactIds) ? [...new Set(input.sourcePactIds.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim()))] : [];
    if (!sourcePactIds.length || sourcePactIds.length > 20) return fail('Select between 1 and 20 settled thesis-invalidated source pacts.', 'sourcePactIds');
    const title = clean(input.title, 180); const toSeatId = clean(input.toSeatId, 80); const strategyBetId = clean(input.strategyBetId, 80);
    if (title.length < 4) return fail('Name the receiving next-cycle pact.', 'title');
    if (!activePerson(toSeatId)) return fail('Choose an active receiving span.', 'toSeatId');
    if (!seat.fullAccess && toSeatId !== seat.id && !seat.scope.has(toSeatId)) return fail('The receiving span is outside your capital-allocation boundary.', 'toSeatId');
    const targetBet = (store.state.strategyBets || []).find((b) => b.id === strategyBetId && b.status !== 'retired');
    if (!targetBet) return fail('Choose an active receiving Breakthrough Bet.', 'strategyBetId');
    const targetEffort = finite(input.effortDays, { max: 365 });
    const targetAmount = input.resourceAskAmount === null || input.resourceAskAmount === '' || input.resourceAskAmount === undefined
      ? 0 : finite(input.resourceAskAmount);
    if (targetEffort === null || targetAmount === null) return fail('Receiving effort and budget must be finite non-negative amounts.', 'effortDays');
    if (!validDay(input.startsOn) || !validDay(input.dueOn) || input.dueOn < input.startsOn || input.dueOn < dayKey(clock())) {
      return fail('The receiving pact needs a valid current/future next-cycle window.', 'dueOn');
    }
    const rationale = clean(input.rationale, 500);
    if (rationale.length < 12) return fail('Record the reviewed stop-rule rationale (at least 12 characters).', 'rationale');
    const consumed = new Set((store.state.valueStreamReallocations || []).flatMap((r) => r.sourceLines.map((line) => line.sourcePactId)));
    const sourceLines = []; const warnings = []; const currencies = new Set(); let releasedEffortDays = 0; let releasedBudgetAmount = 0;
    let effortActualsComplete = true;
    for (const pactId of sourcePactIds) {
      const pact = (store.state.catchballPacts || []).find((p) => p.id === pactId);
      if (!pact) return fail(`Source pact ${pactId} no longer exists.`, 'sourcePactIds');
      if (pact.status !== 'settled' || pact.gradedOutcome !== 'thesis-invalidated') return fail(`Source “${pact.title}” is not settled as thesis-invalidated; missed execution is not a stop-rule carryover source.`, 'sourcePactIds');
      if (consumed.has(pact.id)) return fail(`Source “${pact.title}” already has an append-only carryover receipt. Reusing it would double-spend the authority.`, 'sourcePactIds');
      if (pact.strategyBetId === strategyBetId) return fail('Carryover must move authority to a different surviving bet, not reopen the falsified allocation.', 'strategyBetId');
      if (!seat.fullAccess && pact.toSeatId !== seat.id && !seat.scope.has(pact.toSeatId)) return fail('A source pact is outside your capital-allocation boundary.', 'sourcePactIds');
      const budget = (store.state.budgets || []).find((b) => b.id === pact.budgetId);
      const line = (budget?.lines || []).find((l) => l.id === pact.encumberedLineId);
      if (!budget || !line) return fail(`Source “${pact.title}” has no resolvable budget encumbrance; no authority is inferred.`, 'sourcePactIds');
      if (line.status !== 'committed') return fail(`Source line “${line.title}” is ${line.status}, not an open committed encumbrance. Spent actuals and released lines cannot be carried over.`, 'sourcePactIds');
      const amount = finite(line.committedAmount);
      if (amount === null) return fail('An unpriced source line cannot be carried over as a numeric amount.', 'sourcePactIds');
      const currency = String(budget.currency || '').toUpperCase();
      currencies.add(currency);
      const actualEffortDays = pact.effortActualDays === null || pact.effortActualDays === undefined ? null : finite(pact.effortActualDays, { max: 365 });
      if (actualEffortDays === null) {
        effortActualsComplete = false;
        warnings.push(`“${pact.title}” has no actual effort record; its person-day carryover is 0, not an invented saving.`);
      }
      const releasedEffort = actualEffortDays === null ? 0 : Math.max(0, Math.round(((pact.effortDays || 0) - actualEffortDays) * 100) / 100);
      releasedEffortDays += releasedEffort; releasedBudgetAmount += amount;
      sourceLines.push({
        sourcePactId: pact.id, sourceBudgetId: budget.id, sourceLineId: line.id, strategyBetId: pact.strategyBetId,
        plannedEffortDays: pact.effortDays || 0, actualEffortDays, releasedEffortDays: releasedEffort,
        releasedBudgetAmount: amount, currency,
        _sourceUpdatedAt: pact.updatedAt, _lineStatus: line.status, _lineAmount: line.committedAmount,
      });
    }
    if (currencies.size !== 1) return fail('Cross-currency carryover is refused. Select sources in one currency; no exchange rate is invented.', 'currency');
    const currency = [...currencies][0];
    if (input.currency && String(input.currency).toUpperCase() !== currency) return fail(`Currency mismatch: released authority is ${currency}.`, 'currency');
    if (targetAmount > releasedBudgetAmount) return fail(`Receiving ask ${targetAmount} ${currency} exceeds released authority ${releasedBudgetAmount} ${currency}.`, 'resourceAskAmount');
    if (targetEffort > releasedEffortDays) return fail(`Receiving effort ${targetEffort}d exceeds measured released capacity ${releasedEffortDays}d. Unknown or already-used effort is not capacity.`, 'effortDays');
    let targetBudget = null;
    if (targetAmount > 0) {
      targetBudget = (store.state.budgets || []).find((b) => b.id === input.budgetId);
      if (!targetBudget || targetBudget.status !== 'active') return fail('Choose an active receiving budget envelope.', 'budgetId');
      if (!seat.fullAccess && (canSee(targetBudget, 'budgets', seat, built).allow !== 'full' || (!targetBudget.ownerId && !seat.isLeader))) return fail('The receiving budget is outside your authority.', 'budgetId');
      if (String(targetBudget.currency).toUpperCase() !== currency) return fail('Source and receiving budget currencies must match.', 'currency');
      if ((targetBudget.lines || []).length >= 120) return fail('The receiving budget has reached its 120-line limit.', 'budgetId');
      const evaluation = evaluateBudget(targetBudget, clock(), { watchPct: settings().budgetWatchPct });
      const releasedHere = sourceLines.filter((l) => l.sourceBudgetId === targetBudget.id).reduce((s, l) => s + l.releasedBudgetAmount, 0);
      const projectedPipeline = Math.round((evaluation.pipelineExposure - releasedHere + targetAmount) * 100) / 100;
      if (evaluation.hasLimit && projectedPipeline > evaluation.limit) return fail(`The receiving envelope would breach its ceiling after carryover (${projectedPipeline} > ${evaluation.limit} ${currency}).`, 'resourceAskAmount');
    } else if (input.budgetId) {
      targetBudget = (store.state.budgets || []).find((b) => b.id === input.budgetId) || null;
    }
    const owners = sourcePactIds.map((id) => store.state.catchballPacts.find((p) => p.id === id)?.toSeatId).filter(Boolean);
    const mediatorSeatId = lowestCommonAncestor(built.chain, [...owners, toSeatId]);
    if (!mediatorSeatId) return fail('No common governing span could be resolved for this carryover.', 'scope');
    if (!seat.fullAccess && mediatorSeatId !== seat.id && !seat.scope.has(mediatorSeatId)) return fail('The common carryover mediator is outside your operating boundary.', 'scope');
    const targetEvaluation = targetBudget ? evaluateBudget(targetBudget, clock(), { watchPct: settings().budgetWatchPct }) : null;
    const canonical = {
      sources: sourceLines.map((l) => ({ ...l, _lineStatus: l._lineStatus, _lineAmount: l._lineAmount })),
      target: { title, summary: clean(input.summary, 400), toSeatId, strategyBetId, budgetId: targetBudget?.id || null,
        currency, resourceAskAmount: targetAmount, effortDays: targetEffort, startsOn: input.startsOn, dueOn: input.dueOn, rationale },
      targetBudget: targetEvaluation ? { id: targetBudget.id, pipelineExposure: targetEvaluation.pipelineExposure,
        forecastAtCompletion: targetEvaluation.forecastAtCompletion, lineCount: targetBudget.lines.length } : null,
      mediatorSeatId,
    };
    const digest = digest64(JSON.stringify(canonical));
    releasedEffortDays = Math.round(releasedEffortDays * 100) / 100; releasedBudgetAmount = Math.round(releasedBudgetAmount * 100) / 100;
    const preview = {
      digest, sourceLines: sourceLines.map(({ _sourceUpdatedAt, _lineStatus, _lineAmount, ...line }) => line),
      target: canonical.target, mediatorSeatId, currency,
      releasedEffortDays, allocatedEffortDays: targetEffort, unallocatedEffortDays: Math.round((releasedEffortDays - targetEffort) * 100) / 100,
      releasedBudgetAmount, allocatedBudgetAmount: targetAmount, unallocatedBudgetAmount: Math.round((releasedBudgetAmount - targetAmount) * 100) / 100,
      effortActualsComplete, warnings,
      receivingFeasibility: priceSpanFeasibility(store.state, toSeatId, { effortDays: targetEffort,
        budgetId: targetBudget?.id || null, resourceAskAmount: targetAmount, currency, now: clock() }),
      boundary: 'Commit releases only open committed source authority, preserves actual spend and settled grades, and creates a PROPOSED receiving pact. Receiver consent is still required.',
    };
    return { ok: true, preview, digest, seat, built };
  }

  return {
    valueStreamRead() { return buildValueStreamReport(store.state, { now: clock(), settings: settings() }); },
    valueStreamBriefText() { return valueStreamBriefText(store.state, { now: clock(), settings: settings() }); },
    valueStreamCsvRows() { return valueStreamCsvRows(store.state, { now: clock(), settings: settings() }); },

    valueStreamContractPropose(input = {}) {
      const supplierSeatId = clean(input.supplierSeatId, 80); const consumerSeatId = clean(input.consumerSeatId, 80);
      if (!activePerson(supplierSeatId) || !activePerson(consumerSeatId) || supplierSeatId === consumerSeatId) return fail('Choose two different active supplier and consumer spans.', 'consumerSeatId');
      const verified = verifyParty([supplierSeatId, consumerSeatId]);
      if (verified.error) return verified.error;
      const { built, seat } = verified;
      const mediatorSeatId = lowestCommonAncestor(built.chain, [supplierSeatId, consumerSeatId]);
      if (!mediatorSeatId) return fail('No lowest common ancestor can mediate this peer contract.', 'scope');
      if ([supplierSeatId, consumerSeatId].includes(mediatorSeatId)) return fail('This is a vertical commitment, not a peer value-stream contract. Use Catchball for ancestor→descendant deployment.', 'consumerSeatId');
      const terms = validateTerms(input); if (terms.error) return terms.error;
      if (contracts().length >= VALUE_STREAM_LIMITS.contracts || rounds().length >= VALUE_STREAM_LIMITS.rounds) return fail('The Value Stream ledger is at its declared cap; export history before adding more.', 'valueStreamContracts');
      if (input.strategyBetId && !(store.state.strategyBets || []).some((b) => b.id === input.strategyBetId && b.status !== 'retired')) return fail('Choose an active strategy bet.', 'strategyBetId');
      const duplicate = contracts().find((c) => ['proposed', 'countered', 'agreed'].includes(c.status)
        && c.supplierSeatId === supplierSeatId && c.consumerSeatId === consumerSeatId && c.metric === terms.value.metric);
      if (duplicate) return fail('An open contract already covers this supplier, consumer and metric. Counter or check in on that record instead.', 'metric');
      const at = clock(); const id = idFactory('vsc'); const roundId = idFactory('vsr');
      const proposerSeatId = seat.fullAccess ? (input.proposerSeatId === consumerSeatId ? consumerSeatId : supplierSeatId) : seat.id;
      const awaitingConsentSeatId = proposerSeatId === supplierSeatId ? consumerSeatId : supplierSeatId;
      const raw = normalizeValueStreamContract({
        id, ...terms.value, summary: clean(input.summary, 500), supplierSeatId, consumerSeatId, mediatorSeatId,
        strategyBetId: input.strategyBetId || null, supplierPactId: input.supplierPactId || null, consumerPactId: input.consumerPactId || null,
        status: 'proposed', proposerSeatId, awaitingConsentSeatId, lastActorSeatId: proposerSeatId,
        roundCount: 1, createdAt: at.toISOString(), updatedAt: at.toISOString(),
      });
      if (!raw) return fail('The value-stream contract failed validation.');
      const round = roundSnapshot(raw, 'propose', proposerSeatId, input, at, roundId, 1);
      if (!round) return fail('The opening negotiation round failed validation.');
      store.update((draft) => {
        draft.valueStreamContracts = Array.isArray(draft.valueStreamContracts) ? draft.valueStreamContracts : [];
        draft.valueStreamRounds = Array.isArray(draft.valueStreamRounds) ? draft.valueStreamRounds : [];
        draft.valueStreamContracts.unshift(raw); draft.valueStreamRounds.push(round);
      }, { type: VALUE_STREAM_EVENTS.PROPOSED, entity: 'valuestreamcontract', entityId: id,
        summary: `Proposed peer SLA “${raw.title}” (${raw.supplierSeatId} → ${raw.consumerSeatId}); LCA mediator ${raw.mediatorSeatId}.` });
      return saved({ contract: findContract(id), roundId });
    },

    valueStreamContractCounter(contractId, input = {}) {
      const current = findContract(contractId); if (!current) return fail('Value-stream contract not found.', 'contractId');
      if (!['proposed', 'countered'].includes(current.status)) return fail('Only an open negotiation can be countered.', 'status');
      const verified = verifyParty(current, [current.awaitingConsentSeatId]); if (verified.error) return verified.error;
      const terms = validateTerms(input, current); if (terms.error) return terms.error;
      if (rounds().length >= VALUE_STREAM_LIMITS.rounds) return fail('The negotiation round log is full.', 'valueStreamRounds');
      const at = clock(); const actorSeatId = verified.seat.fullAccess ? current.awaitingConsentSeatId : verified.seat.id;
      const next = { ...current, ...terms.value, id: current.id, supplierSeatId: current.supplierSeatId,
        consumerSeatId: current.consumerSeatId, mediatorSeatId: current.mediatorSeatId,
        status: 'countered', lastActorSeatId: actorSeatId,
        awaitingConsentSeatId: actorSeatId === current.supplierSeatId ? current.consumerSeatId : current.supplierSeatId,
        roundCount: current.roundCount + 1, updatedAt: at.toISOString(), createdAt: current.createdAt };
      const raw = normalizeValueStreamContract(next); const round = roundSnapshot(raw, 'counter', actorSeatId, input, at, idFactory('vsr'), raw.roundCount);
      if (!raw || !round) return fail('The counter-offer failed validation.');
      store.update((draft) => {
        const target = draft.valueStreamContracts.find((c) => c.id === contractId); Object.assign(target, raw);
        draft.valueStreamRounds.push(round);
      }, { type: VALUE_STREAM_EVENTS.COUNTERED, entity: 'valuestreamcontract', entityId: contractId,
        summary: `Countered peer SLA “${current.title}”: ${raw.target} ${raw.unit}, ${raw.leadTimeDays}d lead, ${raw.effortDays}d effort.` });
      return saved({ contract: findContract(contractId), roundId: round.id });
    },

    valueStreamContractAccept(contractId, input = {}) {
      const current = findContract(contractId); if (!current) return fail('Value-stream contract not found.', 'contractId');
      if (!['proposed', 'countered'].includes(current.status)) return fail('This contract is not awaiting consent.', 'status');
      const verified = verifyParty(current, [current.awaitingConsentSeatId]); if (verified.error) return verified.error;
      if (rounds().length >= VALUE_STREAM_LIMITS.rounds) return fail('The negotiation round log is full.', 'valueStreamRounds');
      const at = clock(); const actorSeatId = verified.seat.fullAccess ? current.awaitingConsentSeatId : verified.seat.id;
      const round = roundSnapshot(current, 'accept', actorSeatId, input, at, idFactory('vsr'), current.roundCount + 1);
      if (!round) return fail('The consent round failed validation.');
      store.update((draft) => {
        const target = draft.valueStreamContracts.find((c) => c.id === contractId);
        target.status = 'agreed'; target.agreedOn = dayKey(at); target.awaitingConsentSeatId = null;
        target.lastActorSeatId = actorSeatId; target.roundCount = current.roundCount + 1; target.updatedAt = at.toISOString();
        draft.valueStreamRounds.push(round);
      }, { type: VALUE_STREAM_EVENTS.AGREED, entity: 'valuestreamcontract', entityId: contractId,
        summary: `Both peer parties consented to “${current.title}”; mediator did not consent on their behalf.` });
      return saved({ contract: findContract(contractId), roundId: round.id });
    },

    valueStreamContractCheckin(contractId, input = {}) {
      const current = findContract(contractId); if (!current) return fail('Value-stream contract not found.', 'contractId');
      if (current.status !== 'agreed') return fail('Only an agreed contract can receive SLA actuals.', 'status');
      const verified = verifyParty(current, [current.supplierSeatId]); if (verified.error) return verified.error;
      const actual = finite(input.actual); if (actual === null) return fail('Record a non-negative SLA actual; blank is not evidence.', 'actual');
      const recordedOn = input.recordedOn || dayKey(clock());
      if (!validDay(recordedOn) || recordedOn > dayKey(clock()) || (current.startsOn && recordedOn < current.startsOn)) return fail('The actual date must be inside the contract window and not in the future.', 'recordedOn');
      if (clean(input.note).length < 4) return fail('Add a short evidence note for this SLA actual.', 'note');
      if (rounds().length >= VALUE_STREAM_LIMITS.rounds) return fail('The negotiation round log is full.', 'valueStreamRounds');
      const at = clock(); const actorSeatId = verified.seat.fullAccess ? current.supplierSeatId : verified.seat.id;
      const next = { ...current, actual, updatedAt: at.toISOString() };
      const round = roundSnapshot(next, 'checkin', actorSeatId, { ...input, recordedOn }, at, idFactory('vsr'), current.roundCount + 1);
      store.update((draft) => {
        const target = draft.valueStreamContracts.find((c) => c.id === contractId);
        target.actual = actual; target.lastActorSeatId = actorSeatId; target.roundCount = current.roundCount + 1; target.updatedAt = at.toISOString();
        draft.valueStreamRounds.push(round);
      }, { type: VALUE_STREAM_EVENTS.CHECKIN, entity: 'valuestreamcontract', entityId: contractId,
        summary: `Supplier actual for “${current.title}”: ${actual} ${current.unit} against ${current.direction} ${current.target}.` });
      return saved({ contract: findContract(contractId), roundId: round.id });
    },

    valueStreamContractSettle(contractId, input = {}) {
      const current = findContract(contractId); if (!current) return fail('Value-stream contract not found.', 'contractId');
      if (current.status !== 'agreed') return fail('Only an agreed contract can be settled.', 'status');
      const verified = verifyParty(current, [current.consumerSeatId]); if (verified.error) return verified.error;
      if (!VALUE_STREAM_SETTLEMENTS.includes(input.outcome)) return fail('Choose fulfilled or missed.', 'outcome');
      const met = valueStreamTargetMet(current); if (met === null) return fail('A supplier actual is required before settlement.', 'actual');
      if ((input.outcome === 'fulfilled') !== met) return fail(`The evidence says this SLA ${met ? 'met' : 'missed'} its directional target; settlement cannot repaint that outcome.`, 'outcome');
      if (clean(input.note).length < 4) return fail('Record consumer verification evidence.', 'note');
      const at = clock(); const actorSeatId = verified.seat.fullAccess ? current.consumerSeatId : verified.seat.id;
      const round = roundSnapshot(current, 'settle', actorSeatId, input, at, idFactory('vsr'), current.roundCount + 1);
      store.update((draft) => {
        const target = draft.valueStreamContracts.find((c) => c.id === contractId);
        target.status = 'settled'; target.settlementOutcome = input.outcome; target.settledOn = dayKey(at);
        target.settlementNote = clean(input.note); target.lastActorSeatId = actorSeatId;
        target.roundCount = current.roundCount + 1; target.updatedAt = at.toISOString(); draft.valueStreamRounds.push(round);
      }, { type: VALUE_STREAM_EVENTS.SETTLED, entity: 'valuestreamcontract', entityId: contractId,
        summary: `Consumer verified “${current.title}” as ${input.outcome}; SLA history remains append-only.` });
      return saved({ contract: findContract(contractId), roundId: round.id });
    },

    valueStreamContractWithdraw(contractId, input = {}) {
      const current = findContract(contractId); if (!current) return fail('Value-stream contract not found.', 'contractId');
      if (['settled', 'withdrawn'].includes(current.status)) return fail('A terminal contract is retained as history.', 'status');
      const verified = verifyParty(current); if (verified.error) return verified.error;
      const at = clock(); const actorSeatId = verified.seat.fullAccess ? current.lastActorSeatId || current.supplierSeatId : verified.seat.id;
      const round = roundSnapshot(current, 'withdraw', actorSeatId, input, at, idFactory('vsr'), current.roundCount + 1);
      store.update((draft) => {
        const target = draft.valueStreamContracts.find((c) => c.id === contractId);
        target.status = 'withdrawn'; target.withdrawnOn = dayKey(at); target.awaitingConsentSeatId = null;
        target.lastActorSeatId = actorSeatId; target.roundCount = current.roundCount + 1; target.updatedAt = at.toISOString(); draft.valueStreamRounds.push(round);
      }, { type: VALUE_STREAM_EVENTS.WITHDRAWN, entity: 'valuestreamcontract', entityId: contractId,
        summary: `Withdrew peer SLA “${current.title}”; negotiation rounds remain in history.` });
      return saved({ contract: findContract(contractId), roundId: round.id });
    },

    valueStreamReallocationPreview(input = {}) {
      const result = carryoverPreview(input);
      return result.ok ? { ok: true, preview: result.preview, digest: result.digest } : result;
    },

    valueStreamReallocate(input = {}) {
      const checked = carryoverPreview(input); if (!checked.ok) return checked;
      if (input.expectedDigest !== checked.digest) return fail('The carryover preview is stale or missing. Re-preview changed sources, actuals, target terms and budget exposure before commit; nothing was changed.', 'expectedDigest');
      if ((store.state.valueStreamReallocations || []).length >= VALUE_STREAM_LIMITS.reallocations) return fail('The carryover receipt ledger is at its declared cap.', 'valueStreamReallocations');
      const at = clock(); const today = dayKey(at); const reallocationId = idFactory('vsrll');
      const targetPactId = idFactory('cbp'); const targetRoundId = idFactory('cbr');
      const target = checked.preview.target; const targetLineId = target.resourceAskAmount > 0 ? idFactory('bline') : null;
      const targetNode = checked.built.chain.nodes.get(target.toSeatId);
      const altitudeKey = targetNode?.altitude || 'manager'; const alt = altitudeByKey(altitudeKey);
      const fromSeatId = checked.seat.fullAccess ? checked.preview.mediatorSeatId : checked.seat.id;
      const rawPact = normalizeCatchballPact({
        id: targetPactId, title: target.title, summary: target.summary, strategyBetId: target.strategyBetId,
        fromSeatId, toSeatId: target.toSeatId, ownerId: target.toSeatId, altitudeKey,
        horizonDays: Math.max(1, daysBetween(target.startsOn, target.dueOn) || alt?.horizonDays || 30),
        correlation: 'strong', status: 'proposed', leadingMetric: 'Next-cycle leading cadence',
        laggingMetric: 'Receiving bet outcome', laggingTarget: 100, effortDays: target.effortDays,
        effortActualDays: null, budgetId: target.budgetId, currency: target.currency,
        resourceAskAmount: target.resourceAskAmount, encumberedLineId: targetLineId,
        roundCount: 1, startsOn: target.startsOn, dueOn: target.dueOn,
        createdAt: at.toISOString(), updatedAt: at.toISOString(),
      });
      const rawRound = normalizeCatchballRound({
        id: targetRoundId, pactId: targetPactId, roundNumber: 1, kind: 'propose', actorSeatId: fromSeatId,
        ownerId: target.toSeatId, mechanism: 'resource-ask', proposedEffortDays: target.effortDays,
        proposedLaggingTarget: 100, proposedDueOn: target.dueOn, resourceAskAmount: target.resourceAskAmount,
        currency: target.currency, note: `Stop-rule carryover ${reallocationId}; receiving consent still required.`,
        recordedOn: today, createdAt: at.toISOString(),
      });
      const rawReceipt = normalizeValueStreamReallocation({
        id: reallocationId, title: target.title, status: 'committed', previewDigest: checked.digest,
        sourceLines: checked.preview.sourceLines, targetPactId, targetSeatId: target.toSeatId,
        targetStrategyBetId: target.strategyBetId, targetBudgetId: target.budgetId, targetBudgetLineId: targetLineId,
        createdBySeatId: checked.seat.fullAccess ? checked.preview.mediatorSeatId : checked.seat.id,
        mediatorSeatId: checked.preview.mediatorSeatId,
        releasedEffortDays: checked.preview.releasedEffortDays, allocatedEffortDays: target.effortDays,
        unallocatedEffortDays: checked.preview.unallocatedEffortDays,
        releasedBudgetAmount: checked.preview.releasedBudgetAmount, allocatedBudgetAmount: target.resourceAskAmount,
        unallocatedBudgetAmount: checked.preview.unallocatedBudgetAmount, currency: target.currency,
        effortActualsComplete: checked.preview.effortActualsComplete, rationale: target.rationale,
        createdOn: today, createdAt: at.toISOString(),
      });
      if (!rawPact || !rawRound || !rawReceipt) return fail('The atomic carryover records failed validation; nothing was changed.');
      store.update((draft) => {
        for (const source of rawReceipt.sourceLines) {
          const budget = draft.budgets.find((b) => b.id === source.sourceBudgetId);
          const line = budget.lines.find((l) => l.id === source.sourceLineId);
          // The preview digest covers this status/amount; this guard is a final
          // fail-closed assertion inside the same transaction, not a silent skip.
          if (line.status !== 'committed') throw new Error('Carryover source changed during commit; transaction refused.');
          line.status = 'released'; line.releasedOn = today; line.actualsDueOn = null;
          line.releasedReason = `valueStreamReallocation ${reallocationId}: thesis-invalidated stop rule; see append-only receipt.`;
          budget.updatedAt = at.toISOString();
        }
        if (targetLineId) {
          const budget = draft.budgets.find((b) => b.id === target.budgetId);
          budget.lines.push({ id: targetLineId, title: `Proposed carryover: ${target.title}`.slice(0, 180),
            category: 'other', status: 'planned', committedAmount: target.resourceAskAmount, actualAmount: null,
            ownerId: target.toSeatId, sourceType: null, sourceId: null, committedOn: null, expectedOn: target.dueOn,
            spentOn: null, releasedOn: null, releasedReason: '', actualsDueOn: null,
            note: `Planned pipeline from valueStreamReallocation ${reallocationId}; not committed until receiving-span Catchball acceptance.` });
          budget.updatedAt = at.toISOString();
        }
        draft.catchballPacts.unshift(rawPact); draft.catchballRounds.push(rawRound);
        draft.valueStreamReallocations.push(rawReceipt);
      }, { type: VALUE_STREAM_EVENTS.REALLOCATED, entity: 'valuestreamreallocation', entityId: reallocationId,
        summary: `Stop-rule carryover: ${rawReceipt.releasedBudgetAmount} ${rawReceipt.currency} and ${rawReceipt.releasedEffortDays}d released; ${target.resourceAskAmount} ${target.currency}/${target.effortDays}d proposed to ${target.toSeatId}.` });
      return saved({ reallocation: store.state.valueStreamReallocations.find((r) => r.id === reallocationId),
        targetPact: store.state.catchballPacts.find((p) => p.id === targetPactId), targetPactId, reallocationId });
    },

    valueStreamUpdateSettings(patch = {}) {
      const { seat } = resolveSeat(); const denied = right('negotiate-catchball', seat); if (denied) return denied;
      if (!seat.fullAccess && !seat.isLeader) return fail('Workspace-wide Value Stream conventions require the enterprise root or operator view.', 'scope');
      const merged = normalizeValueStreamSettings({ ...settings(), ...(patch || {}) });
      store.update((draft) => { draft.settings = { ...(draft.settings || {}), ...merged }; },
        { type: 'settings.updated', entity: 'settings', entityId: 'valuestream', summary: `Updated Value Stream conventions (cell floor ${merged.valueStreamCellFloor}).` });
      return saved({ conventions: merged });
    },
    valueStreamScan() {
      const { seat } = resolveSeat(); const denied = right('negotiate-catchball', seat); if (denied) return denied;
      if (!seat.fullAccess && !seat.isLeader) return fail('A workspace-wide scan requires the enterprise root or operator view.', 'scope');
      store.update(() => {}, { type: VALUE_STREAM_EVENTS.SCAN, entity: 'valuestreamcontract', entityId: 'workspace',
        summary: 'Ran explicit Value Stream network, SLA governance and carryover-lineage scan.' });
      return saved({ report: buildValueStreamReport(store.state, { now: clock(), settings: settings() }) });
    },
  };
}
