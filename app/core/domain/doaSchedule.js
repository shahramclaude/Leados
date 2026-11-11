/**
 * app/core/domain/doaSchedule.js — pure derived read model for the Standing
 * Delegation-of-Authority (DoA) Schedule & Cross-Line Limit Conformance engine
 * (ADR-0174, Schema v138, `RULE-DOA-01`, CSV scope #128, `#/matrix?panel=authority`).
 *
 * Evaluates three commitment classes against standing authority limits as of
 * the commitment's own calendar day:
 *   1. Spending `mandates` (ADR-0078): Nemo dat quod non habet — tests the
 *      issuer (`fromSeatId`) against `spendCeiling` on `createdOn`.
 *   2. Committed/spent `budgets` lines (ADR-0024/0136): tests the line/envelope
 *      owner against the typed commitment/actual amount on `committedOn`/`spentOn`.
 *   3. Decided `decisions`: tests the Approver (`readHand`) against typed
 *      monetary commitments linked via `budget` lines (`sourceType: 'decision'`),
 *      `mandates` (`sourceType: 'decision'`), or explicit `price-decision` acts.
 *      Free-text prose is never parsed as money; unpriced decisions are counted
 *      separately and broken financial links are refused with printed reasons.
 *
 * Matrix & Single-Chain Native:
 *  - Reuses canonical `buildMatrix`, `matrixLineScope`, `matrixJointApex`,
 *    `buildSeats`, and `buildStructureLedger` / `homeLineOn` / `rosterStatusOn`.
 *  - Evaluates cross-line limits across multi-line subjects with strict
 *    anti-splitting (two $50k managers never combine to cover an $80k item).
 *  - Resolves one-over-one covering escalation seats in the as-of DAG (`unique`,
 *    `matrix-tie` + `matrixJointApex`, `above-apex`, or `unreadable`).
 *  - Separates `countsReconcile` (partition identities hold) from
 *    `figuresComplete` (no refused, unscheduled, currency-mismatched or
 *    structure-unreadable item in scope, and `testedN >= rateFloor`).
 *
 * Pure module: zero DOM, zero storage writes, zero network, injected `now`.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { linksForEntity } from './cases.js';
import { MANDATE_OPEN_STATUSES } from './mandateRegistry.js';
import { buildMatrix, matrixJointApex, matrixLineScope } from './matrix.js';
import { activeSeat, buildSeats } from './seat.js';
import { buildNameIndex } from './rightsConcordance.js';
import { readHand } from './sodRegister.js';
import { buildStructureLedger, homeLineOn, rosterStatusOn } from './structureHistory.js';
import { STRUCTURE_OBSERVATION_STATES } from './structureHistoryRegistry.js';
import {
  DOA_BOUNDS,
  DOA_BREACH_CLASSES,
  DOA_COVER_STATES,
  DOA_CROSS_LINE_STATES,
  DOA_ENGINE_VERSION,
  DOA_LINE_SCOPES,
  DOA_METHOD,
  DOA_OBJECT_KINDS,
  DOA_OBJECT_KIND_KEYS,
  DOA_RECORD_REFUSALS,
  DOA_RECORD_REFUSAL_KEYS,
  DOA_SCOPE_CLASSES,
  DOA_VERDICTS,
  DOA_VERDICT_KEYS,
  budgetCategoryToDoaScope,
  doaBreachClass,
  doaCoverState,
  doaCrossLineState,
  doaLineScope,
  doaObjectKind,
  doaRecordRefusal,
  doaRoute,
  doaScopeClass,
  doaVerdict,
} from './doaScheduleRegistry.js';
import {
  amountToCents,
  centsToFixed,
  normalizeDoaSchedule,
  normalizeDoaSettings,
  validCalendarDay,
} from './doaScheduleSchema.js';

const CURRENCY_RE = /^[A-Z]{3}$/;
const ENGINE_DECISION_RE = /^\[RULE-[A-Z0-9-]+\]/;

export function doaPermille(part, whole) {
  if (!Number.isInteger(part) || !Number.isInteger(whole) || whole <= 0) return null;
  return Math.round((part * 1000) / whole);
}

/* ----------------------------------------------------- schedule index & match */

export function compileDoaSchedule(rawActs) {
  const acts = normalizeDoaSchedule(rawActs, []);
  const declarations = [];
  const retireByTarget = new Map();
  const decisionPrices = new Map();

  for (const act of acts) {
    if (act.kind === 'retire') {
      const prev = retireByTarget.get(act.targetLimitId);
      if (!prev || act.retiredOn < prev.retiredOn) {
        retireByTarget.set(act.targetLimitId, act);
      }
    } else if (act.kind === 'price-decision') {
      decisionPrices.set(act.decisionId, act);
    }
  }

  for (const act of acts) {
    if (act.kind !== 'declare') continue;
    const ret = retireByTarget.get(act.id) || null;
    declarations.push({
      ...act,
      retiredOn: ret ? ret.retiredOn : null,
      retiredBySeatId: ret ? ret.decidedBySeatId : null,
      retiredReason: ret ? ret.reason : null,
    });
  }

  return { acts, declarations, decisionPrices };
}

export function isLimitInForceOn(entry, day) {
  if (!entry || !day) return false;
  if (entry.effectiveFrom > day) return false;
  if (entry.effectiveTo && day > entry.effectiveTo) return false;
  if (entry.retiredOn && day >= entry.retiredOn) return false;
  return true;
}

function specificityTier(entry, lineKind, scopeClass) {
  const exactLine = entry.lineKind === lineKind;
  const anyLine = entry.lineKind === 'any-line';
  if (!exactLine && !anyLine) return -1;
  const exactScope = entry.scopeClass === scopeClass;
  const generalScope = entry.scopeClass === 'general';
  if (!exactScope && !generalScope) return -1;
  return (exactLine ? 2 : 0) + (exactScope ? 1 : 0);
}

/**
 * Evaluate a seat's active standing limit on `day` for `(lineKind, scopeClass, currency)`.
 *
 * Returns one of:
 *   - `{ state: 'scheduled', limitCents, entry, otherCurrencies: [] }`
 *   - `{ state: 'contradictory', limitCents: null, entry: null, otherCurrencies: [] }`
 *   - `{ state: 'currency-mismatch', limitCents: null, entry: null, otherCurrencies }`
 *   - `{ state: 'unscheduled', limitCents: null, entry: null, otherCurrencies: [] }`
 */
export function resolveSeatLimitOn(declarations, seatId, lineKind, scopeClass, currency, day) {
  const matchingSeatAndWindow = [];
  for (const entry of declarations) {
    if (entry.seatId !== seatId) continue;
    if (!isLimitInForceOn(entry, day)) continue;
    const tier = specificityTier(entry, lineKind, scopeClass);
    if (tier < 0) continue;
    matchingSeatAndWindow.push({ entry, tier });
  }

  const sameCurrency = matchingSeatAndWindow.filter((m) => m.entry.currency === currency);
  if (sameCurrency.length > 0) {
    let bestTier = -1;
    for (const m of sameCurrency) {
      if (m.tier > bestTier) bestTier = m.tier;
    }
    const top = sameCurrency.filter((m) => m.tier === bestTier).map((m) => m.entry);
    const distinctAmounts = new Set(top.map((e) => e.limitCents));
    if (distinctAmounts.size > 1) {
      return { state: 'contradictory', limitCents: null, entry: null, otherCurrencies: [] };
    }
    return { state: 'scheduled', limitCents: top[0].limitCents, entry: top[0], otherCurrencies: [] };
  }

  if (matchingSeatAndWindow.length > 0) {
    const others = [...new Set(matchingSeatAndWindow.map((m) => m.entry.currency))].sort();
    return { state: 'currency-mismatch', limitCents: null, entry: null, otherCurrencies: others };
  }

  return { state: 'unscheduled', limitCents: null, entry: null, otherCurrencies: [] };
}

/* ------------------------------------------------ as-of reporting structure */

function createAsOfStructureReader(state, settings) {
  const ledger = buildStructureLedger(state);
  const people = (Array.isArray(state?.people) ? state.people : []).filter((p) => p && p.id);
  const cache = new Map();

  const structureOn = (day) => {
    if (cache.has(day)) return cache.get(day);
    const homeState = new Map();
    const substitutions = new Map();
    for (const person of people) {
      if (person.status === 'archived') continue;
      if (rosterStatusOn(person, day)) {
        homeState.set(person.id, 'not-placed');
        continue;
      }
      const line = homeLineOn(ledger, person.id, day);
      if (line.state === STRUCTURE_OBSERVATION_STATES.observed) {
        homeState.set(person.id, 'recorded');
        const recorded = line.managerId === LEADER_ID ? null : line.managerId;
        if (recorded !== (person.managerId || null)) substitutions.set(person.id, recorded);
      } else {
        homeState.set(person.id, ledger.byPerson.has(person.id) ? 'unrecorded' : 'presumed');
      }
    }
    const asOfState = substitutions.size
      ? {
        ...state,
        people: state.people.map((p) => (p && substitutions.has(p.id)
          ? { ...p, managerId: substitutions.get(p.id) }
          : p)),
      }
      : state;
    const matrix = buildMatrix(asOfState, { now: new Date(`${day}T12:00:00.000Z`), settings });
    for (const [personId, basis] of homeState) {
      if (basis !== 'recorded' && basis !== 'presumed') continue;
      const hasHome = (matrix.linesByPerson.get(personId) || []).some((l) => l.role === 'primary');
      if (!hasHome) homeState.set(personId, 'not-placed');
    }
    const structure = { day, matrix, homeState };
    cache.set(day, structure);
    return structure;
  };

  return { structureOn, daysRead: () => cache.size };
}

const isReadableBasis = (basis) => basis === 'recorded' || basis === 'presumed';

function isSeatPlacedOn(structure, seatId) {
  if (seatId === LEADER_ID) return true;
  return isReadableBasis(structure.homeState.get(seatId));
}

function walkableLinesFrom(structure, personId, { primaryOnly = false } = {}) {
  if (personId === LEADER_ID) return { lines: [], gap: false };
  const basis = structure.homeState.get(personId) || 'not-placed';
  const gap = !isReadableBasis(basis);
  const all = structure.matrix.linesByPerson.get(personId) || [];
  const lines = all.filter((l) => {
    if (l.role === 'primary') return isReadableBasis(basis);
    return !primaryOnly;
  });
  return { lines, gap };
}

function findShortestClimb(structure, fromId, targetId, { primaryOnly = false } = {}) {
  const parent = new Map();
  const seen = new Set([fromId]);
  let openGap = false;
  let frontier = [fromId];
  while (frontier.length > 0) {
    const next = [];
    for (const cur of frontier) {
      if (cur === LEADER_ID) continue;
      const { lines, gap } = walkableLinesFrom(structure, cur, { primaryOnly });
      if (gap) openGap = true;
      for (const line of lines) {
        const mgr = line.managerId;
        if (seen.has(mgr)) continue;
        seen.add(mgr);
        parent.set(mgr, { from: cur, line });
        if (mgr === targetId) {
          const steps = [];
          let c = targetId;
          while (c !== fromId) {
            const st = parent.get(c);
            steps.unshift(st);
            c = st.from;
          }
          return { found: true, steps, openGap };
        }
        next.push(mgr);
      }
    }
    frontier = next;
  }
  return { found: false, steps: [], openGap };
}

function soleSecondaryKindIfNoPrimaryReports(structure, seatId) {
  if (seatId === LEADER_ID) return null;
  let primaryReportsN = 0;
  const secKinds = new Set();
  for (const [, lines] of structure.matrix.linesByPerson.entries()) {
    for (const l of lines) {
      if (l.managerId !== seatId) continue;
      if (l.role === 'primary') primaryReportsN += 1;
      else if (l.kind) secKinds.add(l.kind);
    }
  }
  if (primaryReportsN === 0 && secKinds.size === 1) {
    return [...secKinds][0];
  }
  return null;
}

function resolveRouteOnDay(structure, authorizerId, subjectIds) {
  if (!isSeatPlacedOn(structure, authorizerId)) {
    return { readable: false, reason: 'authorizer-unplaced' };
  }
  const distinctSubjects = [...new Set((subjectIds || []).filter((id) => id && id !== authorizerId))];
  if (distinctSubjects.length === 0) {
    const soleKind = soleSecondaryKindIfNoPrimaryReports(structure, authorizerId);
    if (soleKind) return { readable: true, route: 'second-line', lineKind: soleKind };
    return { readable: true, route: 'self', lineKind: 'functional' };
  }

  let sawSecondLine = null;
  let sawHome = false;
  let sawGap = false;

  for (const subId of distinctSubjects) {
    if (!isSeatPlacedOn(structure, subId)) {
      return { readable: false, reason: 'subject-unplaced' };
    }
    const homeClimb = findShortestClimb(structure, subId, authorizerId, { primaryOnly: true });
    if (homeClimb.found) {
      sawHome = true;
      continue;
    }
    const anyClimb = findShortestClimb(structure, subId, authorizerId, { primaryOnly: false });
    if (anyClimb.found) {
      const topStep = anyClimb.steps[anyClimb.steps.length - 1];
      const secondaryStep = [...anyClimb.steps].reverse().find((s) => s.line.role === 'secondary') || topStep;
      sawSecondLine = secondaryStep.line.kind || 'project';
      continue;
    }
    if (homeClimb.openGap || anyClimb.openGap) {
      sawGap = true;
    }
  }

  if (sawSecondLine && !sawHome) {
    return { readable: true, route: 'second-line', lineKind: sawSecondLine };
  }
  if (sawHome) {
    return { readable: true, route: 'home-chain', lineKind: 'functional' };
  }
  if (sawGap) {
    return { readable: false, reason: 'subject-chain-unrecorded' };
  }
  const fallbackKind = soleSecondaryKindIfNoPrimaryReports(structure, authorizerId) || 'functional';
  return { readable: true, route: 'lateral', lineKind: fallbackKind };
}

function walkableStrictAncestors(structure, startId) {
  const visited = new Map();
  let openGap = false;
  let frontier = [{ id: startId, viaKind: null, depth: 0 }];
  const seen = new Set([startId]);

  while (frontier.length > 0) {
    const next = [];
    for (const item of frontier) {
      if (item.id === LEADER_ID) continue;
      const { lines, gap } = walkableLinesFrom(structure, item.id, { primaryOnly: false });
      if (gap) openGap = true;
      for (const line of lines) {
        const mgr = line.managerId;
        const stepKind = line.role === 'primary' ? 'functional' : line.kind;
        const existing = visited.get(mgr);
        if (!existing) {
          visited.set(mgr, {
            seatId: mgr,
            lineKind: stepKind,
            depth: item.depth + 1,
          });
        } else if (existing.lineKind !== 'functional' && stepKind === 'functional') {
          existing.lineKind = 'functional';
        }
        if (!seen.has(mgr)) {
          seen.add(mgr);
          next.push({ id: mgr, viaKind: stepKind, depth: item.depth + 1 });
        }
      }
    }
    frontier = next;
  }
  return { ancestors: visited, openGap };
}

/**
 * Resolve the minimal senior seat(s) in the as-of DAG above `authorizerId`
 * whose active standing limit covers `amountCents` in `currency` on `day`.
 */
export function resolveCoveringSeatOnDay(declarations, structure, authorizerId, scopeClass, currency, amountCents, day) {
  const { ancestors, openGap } = walkableStrictAncestors(structure, authorizerId);
  const covering = [];

  for (const [ancId, info] of ancestors.entries()) {
    const check = resolveSeatLimitOn(declarations, ancId, info.lineKind, scopeClass, currency, day);
    if (check.state === 'contradictory') {
      return { state: 'unreadable', seatIds: [], limitCentsBySeat: {}, jointApexId: null, jointApexTieIds: [] };
    }
    if (check.state === 'scheduled' && check.limitCents >= amountCents) {
      covering.push({ seatId: ancId, limitCents: check.limitCents, lineKind: info.lineKind });
    }
  }

  if (covering.length === 0) {
    return {
      state: openGap ? 'unreadable' : 'above-apex',
      seatIds: [],
      limitCentsBySeat: {},
      jointApexId: null,
      jointApexTieIds: [],
    };
  }

  const ancSetOf = new Map();
  for (const c of covering) {
    ancSetOf.set(c.seatId, new Set(walkableStrictAncestors(structure, c.seatId).ancestors.keys()));
  }

  const minimal = covering.filter(
    (cand) => !covering.some((other) => other.seatId !== cand.seatId && ancSetOf.get(other.seatId).has(cand.seatId)),
  );
  minimal.sort((a, b) => a.seatId.localeCompare(b.seatId));

  const limitCentsBySeat = {};
  for (const m of minimal) limitCentsBySeat[m.seatId] = m.limitCents;

  if (minimal.length === 1) {
    return {
      state: 'unique',
      seatIds: [minimal[0].seatId],
      limitCentsBySeat,
      jointApexId: minimal[0].seatId,
      jointApexTieIds: [],
    };
  }

  const tiedIds = minimal.map((m) => m.seatId);
  const apex = matrixJointApex(structure.matrix, tiedIds);
  let jointApexId = null;
  if (apex?.unique && apex.apexId) {
    const apexCheck = resolveSeatLimitOn(declarations, apex.apexId, 'functional', scopeClass, currency, day);
    if (apexCheck.state === 'scheduled' && apexCheck.limitCents >= amountCents) {
      jointApexId = apex.apexId;
      limitCentsBySeat[apex.apexId] = apexCheck.limitCents;
    } else {
      // Even if the joint apex's own schedule wasn't matched on 'functional', it is
      // the unique organizational principal above the tied covering seats.
      jointApexId = apex.apexId;
    }
  }

  return {
    state: 'matrix-tie',
    seatIds: tiedIds,
    limitCentsBySeat,
    jointApexId,
    jointApexTieIds: apex && !apex.unique ? (apex.candidates || []) : [],
  };
}

function evaluateCrossLineSubject(declarations, structure, candidateIds, scopeClass, currency, amountCents, day) {
  const multiLineHolders = new Map();
  for (const pid of candidateIds) {
    if (!pid || pid === LEADER_ID) continue;
    const lines = structure.matrix.linesByPerson.get(pid) || [];
    if (lines.length < 2) continue;
    for (const l of lines) {
      const lKind = l.role === 'primary' ? 'functional' : l.kind;
      const key = `${l.managerId}|${lKind}`;
      if (!multiLineHolders.has(key)) {
        multiLineHolders.set(key, { managerId: l.managerId, lineKind: lKind });
      }
    }
  }

  if (multiLineHolders.size < 2) {
    return {
      state: 'single-line',
      lineCount: 1,
      coveringLinesN: 0,
      nonCoveringLinesN: 0,
      unscheduledLinesN: 0,
    };
  }

  let coveringLinesN = 0;
  let nonCoveringLinesN = 0;
  let unscheduledLinesN = 0;

  for (const holder of multiLineHolders.values()) {
    const check = resolveSeatLimitOn(declarations, holder.managerId, holder.lineKind, scopeClass, currency, day);
    if (check.state !== 'scheduled') {
      unscheduledLinesN += 1;
    } else if (check.limitCents >= amountCents) {
      coveringLinesN += 1;
    } else {
      nonCoveringLinesN += 1;
    }
  }

  let state = 'neither-line-covers';
  if (unscheduledLinesN > 0) state = 'unscheduled-line';
  else if (coveringLinesN > 0 && nonCoveringLinesN === 0) state = 'aligned-both-cover';
  else if (coveringLinesN > 0 && nonCoveringLinesN > 0) state = 'asymmetric-line-limits';

  return {
    state,
    lineCount: multiLineHolders.size,
    coveringLinesN,
    nonCoveringLinesN,
    unscheduledLinesN,
  };
}

/* -------------------------------------------------- harvesting commitments */

function subjectPeopleForEntity(state, sourceType, sourceId, rosterSet) {
  if (!sourceType || !sourceId) return [];
  if (sourceType === 'person') return rosterSet.has(sourceId) ? [sourceId] : [];
  if (sourceType === 'case') {
    const rec = (state.cases || []).find((c) => c && c.id === sourceId);
    return rec?.ownerId && rosterSet.has(rec.ownerId) ? [rec.ownerId] : [];
  }
  if (sourceType === 'goal') {
    const rec = (state.goals || []).find((g) => g && g.id === sourceId);
    return rec?.ownerId && rosterSet.has(rec.ownerId) ? [rec.ownerId] : [];
  }
  if (sourceType === 'requisition') {
    const rec = (state.requisitions || []).find((r) => r && r.id === sourceId);
    return rec?.ownerId && rosterSet.has(rec.ownerId) ? [rec.ownerId] : [];
  }
  return [];
}

function collectRawObjects(state, decisionPrices, nameIndex, rosterSet) {
  const items = [];
  let untypedDecisionsN = 0;

  const validSeat = (id) => id === LEADER_ID || rosterSet.has(id);

  // 1. Spending mandates (ADR-0078)
  for (const m of Array.isArray(state?.mandates) ? state.mandates : []) {
    if (!m || !m.id || !Array.isArray(m.actions) || !m.actions.includes('spend')) continue;
    const asOf = validCalendarDay(m.createdOn) || (typeof m.createdAt === 'string' ? validCalendarDay(m.createdAt.slice(0, 10)) : null);
    const currency = typeof m.currency === 'string' ? m.currency.trim().toUpperCase() : '';
    const amountCents = amountToCents(m.spendCeiling);
    const authorizerId = m.fromSeatId || null;
    const delegateId = m.toSeatId || null;
    const subjectIds = [...new Set([
      ...(delegateId ? [delegateId] : []),
      ...(Array.isArray(m.peopleIds) ? m.peopleIds.filter((id) => validSeat(id)) : []),
      ...subjectPeopleForEntity(state, m.sourceType, m.sourceId, rosterSet),
    ])];
    const involvedIds = [...new Set([authorizerId, delegateId, ...subjectIds].filter(Boolean))];

    let refusal = null;
    if (!authorizerId) refusal = 'unattributed';
    else if (!validSeat(authorizerId) || (delegateId && !validSeat(delegateId))) refusal = 'inactive-subject';
    else if (!asOf) refusal = 'undated';
    else if (!CURRENCY_RE.test(currency) || amountCents === null) refusal = 'untyped-amount';

    items.push({
      objectKey: `mandate:${m.id}`,
      kind: 'mandate',
      recordId: m.id,
      linkType: 'mandate',
      linkEntityId: m.id,
      title: String(m.title || m.outcome || m.id).slice(0, DOA_BOUNDS.titleChars),
      asOf,
      currency: CURRENCY_RE.test(currency) ? currency : '',
      amountCents,
      scopeClass: 'opex',
      authorizerId,
      delegateId,
      subjectIds,
      involvedIds,
      isOpenCommitment: MANDATE_OPEN_STATUSES.includes(m.status),
      recordRefusal: refusal,
    });
  }

  // Index budget lines by decision sourceId for decision resolution too
  const budgetLinesByDecision = new Map();
  for (const b of Array.isArray(state?.budgets) ? state.budgets : []) {
    if (!b || !b.id) continue;
    const bCurrency = typeof b.currency === 'string' ? b.currency.trim().toUpperCase() : '';
    for (const line of Array.isArray(b.lines) ? b.lines : []) {
      if (!line || !line.id) continue;
      if (line.sourceType === 'decision' && line.sourceId) {
        if (!budgetLinesByDecision.has(line.sourceId)) budgetLinesByDecision.set(line.sourceId, []);
        budgetLinesByDecision.get(line.sourceId).push({ budget: b, line, currency: bCurrency });
      }
      if (line.status !== 'committed' && line.status !== 'spent') continue;

      const asOf = line.status === 'spent'
        ? (validCalendarDay(line.committedOn) || validCalendarDay(line.spentOn))
        : validCalendarDay(line.committedOn);
      const rawAmount = line.status === 'spent'
        ? (line.actualAmount !== null && line.actualAmount !== undefined
          ? Math.max(Number(line.actualAmount), Number(line.committedAmount || 0))
          : null)
        : line.committedAmount;
      const amountCents = amountToCents(rawAmount);
      const authorizerId = line.ownerId || b.ownerId || null;
      const scopeClass = budgetCategoryToDoaScope(line.category);
      const subjectIds = [...new Set([
        ...(line.ownerId && rosterSet.has(line.ownerId) ? [line.ownerId] : []),
        ...(b.ownerId && rosterSet.has(b.ownerId) ? [b.ownerId] : []),
        ...subjectPeopleForEntity(state, line.sourceType, line.sourceId, rosterSet),
      ])];
      const involvedIds = [...new Set([authorizerId, b.ownerId, ...subjectIds].filter(Boolean))];

      let refusal = null;
      if (!authorizerId) refusal = 'unattributed';
      else if (!validSeat(authorizerId)) refusal = 'inactive-subject';
      else if (!asOf) refusal = 'undated';
      else if (!CURRENCY_RE.test(bCurrency) || amountCents === null) refusal = 'untyped-amount';

      items.push({
        objectKey: `budget-line:${b.id}:${line.id}`,
        kind: 'budget-line',
        recordId: `${b.id}:${line.id}`,
        linkType: 'budget',
        linkEntityId: b.id,
        title: `${b.name} — ${line.title}`.slice(0, DOA_BOUNDS.titleChars),
        asOf,
        currency: CURRENCY_RE.test(bCurrency) ? bCurrency : '',
        amountCents,
        scopeClass,
        authorizerId,
        delegateId: null,
        subjectIds,
        involvedIds,
        isOpenCommitment: true,
        recordRefusal: refusal,
      });
    }
  }

  // Index spending mandates by decision sourceId
  const mandatesByDecision = new Map();
  for (const m of Array.isArray(state?.mandates) ? state.mandates : []) {
    if (!m || !m.id || m.sourceType !== 'decision' || !m.sourceId) continue;
    if (!Array.isArray(m.actions) || !m.actions.includes('spend')) continue;
    if (!mandatesByDecision.has(m.sourceId)) mandatesByDecision.set(m.sourceId, []);
    mandatesByDecision.get(m.sourceId).push(m);
  }

  // 3. Decided decisions
  for (const d of Array.isArray(state?.decisions) ? state.decisions : []) {
    if (!d || !d.id || !String(d.chosen || '').trim()) continue;
    if (ENGINE_DECISION_RE.test(String(d.title || '').trim())) continue;

    const explicitPrice = decisionPrices.get(d.id) || null;
    const linkedBudgetLines = budgetLinesByDecision.get(d.id) || [];
    const linkedMandates = mandatesByDecision.get(d.id) || [];

    if (!explicitPrice && linkedBudgetLines.length === 0 && linkedMandates.length === 0) {
      untypedDecisionsN += 1;
      continue;
    }

    const hand = readHand(nameIndex, d.approver);
    const authorizerId = hand.state === 'resolved' ? hand.personId : null;
    const asOf = validCalendarDay(d.decidedOn) || validCalendarDay(d.date);

    // Gather linked subjects from typed graph edges as well
    const linkedSubjects = [];
    for (const edge of linksForEntity(state, 'decision', d.id)) {
      const peer = edge.peer;
      if (!peer) continue;
      if (peer.type === 'person' && rosterSet.has(peer.id)) linkedSubjects.push(peer.id);
      else if (peer.type === 'case' && peer.raw?.ownerId && rosterSet.has(peer.raw.ownerId)) {
        linkedSubjects.push(peer.raw.ownerId);
      }
    }
    const driverHand = readHand(nameIndex, d.driver);
    if (driverHand.state === 'resolved' && driverHand.personId !== authorizerId) {
      linkedSubjects.push(driverHand.personId);
    }

    let currency = '';
    let amountCents = null;
    let scopeClass = 'general';
    let refusal = null;

    if (explicitPrice) {
      currency = explicitPrice.currency;
      amountCents = explicitPrice.amountCents;
      scopeClass = explicitPrice.scopeClass;
    } else {
      const currencies = new Set();
      let sumCents = 0;
      let missingPrice = false;
      const scopes = new Set();

      for (const entry of linkedBudgetLines) {
        if (CURRENCY_RE.test(entry.currency)) currencies.add(entry.currency);
        else missingPrice = true;
        const c = amountToCents(entry.line.committedAmount ?? entry.line.actualAmount);
        if (c === null) missingPrice = true;
        else sumCents += c;
        scopes.add(budgetCategoryToDoaScope(entry.line.category));
      }
      for (const m of linkedMandates) {
        const mc = typeof m.currency === 'string' ? m.currency.trim().toUpperCase() : '';
        if (CURRENCY_RE.test(mc)) currencies.add(mc);
        else missingPrice = true;
        const c = amountToCents(m.spendCeiling);
        if (c === null) missingPrice = true;
        else sumCents += c;
        scopes.add('opex');
      }

      if (currencies.size > 1) {
        refusal = 'mixed-currency';
      } else if (missingPrice || currencies.size === 0) {
        refusal = 'untyped-amount';
      } else {
        currency = [...currencies][0];
        amountCents = sumCents;
        scopeClass = scopes.size === 1 ? [...scopes][0] : 'general';
      }
    }

    if (!refusal) {
      if (!authorizerId) refusal = 'unattributed';
      else if (!validSeat(authorizerId)) refusal = 'inactive-subject';
      else if (!asOf) refusal = 'undated';
      else if (!CURRENCY_RE.test(currency) || amountCents === null) refusal = 'untyped-amount';
    }

    const subjectIds = [...new Set(linkedSubjects)];
    const involvedIds = [...new Set([authorizerId, ...subjectIds].filter(Boolean))];

    items.push({
      objectKey: `decision:${d.id}`,
      kind: 'decision',
      recordId: d.id,
      linkType: 'decision',
      linkEntityId: d.id,
      title: String(d.title || d.id).slice(0, DOA_BOUNDS.titleChars),
      asOf,
      currency,
      amountCents,
      scopeClass,
      authorizerId,
      delegateId: null,
      subjectIds,
      involvedIds,
      isOpenCommitment: d.outcome !== 'reversed',
      recordRefusal: refusal,
    });
  }

  return { items, untypedDecisionsN };
}

/* ----------------------------------------------------------- main builder */

function makeEmptyCounters() {
  return {
    readN: 0,
    inSeatN: 0,
    outsideSeatN: 0,
    testedN: 0,
    recordRefusedN: 0,
    conformantN: 0,
    breachN: 0,
    nemoDatN: 0,
    secondLineLimitN: 0,
    overLimitN: 0,
    currencyMismatchN: 0,
    unscheduledN: 0,
    structureUnreadableN: 0,
    asymmetricCrossLineN: 0,
    neitherLineCoversN: 0,
    coverUniqueN: 0,
    coverMatrixTieN: 0,
    coverAboveApexN: 0,
    coverUnreadableN: 0,
  };
}

export function buildDoaReport(state = {}, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date(opts.now || Date.now());
  const today = dayKey(now);
  const settings = opts.settings || state?.settings || {};
  const conventions = normalizeDoaSettings(settings);

  const matrixToday = opts.matrix || buildMatrix(state, { now, settings });
  const lineScope = opts.lineScope || matrixLineScope(matrixToday);
  const seats = opts.seats || buildSeats(state, { now, settings, lineScope: lineScope.byManager });
  const seat = opts.seat || activeSeat(seats, settings);

  const peopleList = (Array.isArray(state?.people) ? state.people : []).filter((p) => p && p.id && p.status !== 'archived');
  const rosterSet = new Set(peopleList.map((p) => p.id));
  const nameById = new Map(peopleList.map((p) => [p.id, p.name || p.id]));
  nameById.set(LEADER_ID, matrixToday.nodes.get(LEADER_ID)?.name || settings.leaderName || 'Workspace Leader');

  const seatVisibleSet = seat.fullAccess
    ? null
    : new Set([seat.id, ...(seat.scopeIds || []), ...(seat.lineScopeIds || [])].filter(Boolean));
  const redactNames = !seat.fullAccess && (seat.rank ?? 0) >= DOA_BOUNDS.detailRank;

  const isSeatVisible = (id) => {
    if (!id) return false;
    if (seat.fullAccess) return true;
    return seatVisibleSet.has(id);
  };

  const displaySeatName = (id) => {
    if (!id) return '—';
    if (!isSeatVisible(id)) return 'Outside your span';
    if (redactNames && id !== seat.id) return 'Scoped seat';
    return nameById.get(id) || id;
  };

  const displaySeatId = (id) => (id && isSeatVisible(id) && (!redactNames || id === seat.id) ? id : null);

  const { declarations, decisionPrices } = compileDoaSchedule(state?.doaSchedule);
  const nameIndex = buildNameIndex(state);
  const reader = createAsOfStructureReader(state, settings);

  // Classify active vs retired schedule entries as of `today`
  const inScopeDeclarations = declarations.filter((d) => seat.fullAccess || isSeatVisible(d.seatId));
  let activeLimitsN = 0;
  let retiredLimitsN = 0;
  const scheduleAllRows = [];

  for (const d of inScopeDeclarations) {
    const activeToday = isLimitInForceOn(d, today);
    if (activeToday) activeLimitsN += 1;
    else if (d.retiredOn || (d.effectiveTo && d.effectiveTo < today)) retiredLimitsN += 1;

    scheduleAllRows.push({
      id: d.id,
      seatId: displaySeatId(d.seatId),
      rawSeatId: seat.fullAccess ? d.seatId : null,
      seatName: displaySeatName(d.seatId),
      lineKind: d.lineKind,
      lineKindLabel: doaLineScope(d.lineKind)?.label || d.lineKind,
      scopeClass: d.scopeClass,
      scopeClassLabel: doaScopeClass(d.scopeClass)?.label || d.scopeClass,
      currency: d.currency,
      limitCents: d.limitCents,
      limitFixed: centsToFixed(d.limitCents),
      effectiveFrom: d.effectiveFrom,
      effectiveTo: d.effectiveTo,
      retiredOn: d.retiredOn,
      activeToday,
      decidedByName: displaySeatName(d.decidedBySeatId),
      decidedOn: d.decidedOn,
      reason: redactNames ? '' : d.reason,
      canRetire: !d.retiredOn && (
        seat.fullAccess
        || Boolean(matrixToday.nodes.get(d.seatId)?.ancestors?.has(seat.id))
      ),
    });
  }

  scheduleAllRows.sort((a, b) => (Number(b.activeToday) - Number(a.activeToday))
    || String(a.seatName).localeCompare(String(b.seatName))
    || a.currency.localeCompare(b.currency)
    || b.limitCents - a.limitCents);

  const scheduleRows = scheduleAllRows.slice(0, DOA_BOUNDS.scheduleRowsCap);
  const scheduleOmittedN = scheduleAllRows.length - scheduleRows.length;

  const { items: harvested, untypedDecisionsN } = collectRawObjects(state, decisionPrices, nameIndex, rosterSet);

  const totals = makeEmptyCounters();
  const byKind = new Map(DOA_OBJECT_KIND_KEYS.map((k) => [k, makeEmptyCounters()]));
  const refusalCounts = new Map(DOA_RECORD_REFUSAL_KEYS.map((k) => [k, 0]));
  const verdictCounts = new Map(DOA_VERDICT_KEYS.map((k) => [k, 0]));

  const allEvaluatedRows = [];
  const refusedRows = [];

  for (const item of harvested) {
    const kindBucket = byKind.get(item.kind);
    totals.readN += 1;
    kindBucket.readN += 1;

    const inSeat = seat.fullAccess || item.involvedIds.some((id) => seatVisibleSet.has(id));
    if (!inSeat) {
      totals.outsideSeatN += 1;
      kindBucket.outsideSeatN += 1;
      continue;
    }

    totals.inSeatN += 1;
    kindBucket.inSeatN += 1;

    if (item.recordRefusal) {
      totals.recordRefusedN += 1;
      kindBucket.recordRefusedN += 1;
      refusalCounts.set(item.recordRefusal, (refusalCounts.get(item.recordRefusal) || 0) + 1);
      const refMeta = doaRecordRefusal(item.recordRefusal);
      refusedRows.push({
        objectKey: item.objectKey,
        kind: item.kind,
        kindLabel: doaObjectKind(item.kind)?.label || item.kind,
        recordId: item.recordId,
        title: redactNames ? `${doaObjectKind(item.kind)?.label || item.kind}` : item.title,
        asOf: item.asOf,
        refusal: item.recordRefusal,
        refusalLabel: refMeta?.label || item.recordRefusal,
        refusalDetail: refMeta?.detail || '',
      });
      continue;
    }

    totals.testedN += 1;
    kindBucket.testedN += 1;

    const structure = reader.structureOn(item.asOf);
    const routeInfo = resolveRouteOnDay(structure, item.authorizerId, item.subjectIds);

    let verdictKey = 'conformant';
    let breachClassKey = null;
    let limitCents = null;
    let limitEntryId = null;
    let otherCurrencies = [];
    let verdictReason = '';

    if (!routeInfo.readable) {
      verdictKey = 'structure-unreadable';
      verdictReason = `Reporting graph unreadable on ${item.asOf} (${routeInfo.reason}).`;
    } else {
      const check = resolveSeatLimitOn(
        declarations,
        item.authorizerId,
        routeInfo.lineKind,
        item.scopeClass,
        item.currency,
        item.asOf,
      );
      if (check.state === 'contradictory') {
        verdictKey = 'structure-unreadable';
        verdictReason = `Contradictory overlapping standing limits exist for this seat on ${item.asOf}; authority refused.`;
      } else if (check.state === 'currency-mismatch') {
        verdictKey = 'currency-mismatch';
        otherCurrencies = check.otherCurrencies;
        verdictReason = `Seat holds standing limit(s) in ${otherCurrencies.join(', ')} on ${item.asOf}, not ${item.currency}; FX is never assumed.`;
      } else if (check.state === 'unscheduled') {
        verdictKey = 'unscheduled';
        verdictReason = `No standing limit covers (${routeInfo.lineKind}, ${item.scopeClass}, ${item.currency}) on ${item.asOf}.`;
      } else {
        limitCents = check.limitCents;
        limitEntryId = check.entry.id;
        if (item.amountCents > check.limitCents) {
          verdictKey = 'breach';
          breachClassKey = item.kind === 'mandate'
            ? 'nemo-dat'
            : routeInfo.route === 'second-line'
              ? 'second-line-limit'
              : 'over-limit';
          verdictReason = `${item.currency} ${centsToFixed(item.amountCents)} exceeds standing limit ${item.currency} ${centsToFixed(check.limitCents)} (${routeInfo.lineKind} · ${item.scopeClass}) on ${item.asOf}.`;
        } else {
          verdictKey = 'conformant';
          verdictReason = `${item.currency} ${centsToFixed(item.amountCents)} is within standing limit ${item.currency} ${centsToFixed(check.limitCents)} on ${item.asOf}.`;
        }
      }
    }

    const crossLine = routeInfo.readable
      ? evaluateCrossLineSubject(
          declarations,
          structure,
          item.subjectIds.length ? item.subjectIds : [item.authorizerId],
          item.scopeClass,
          item.currency,
          item.amountCents,
          item.asOf,
        )
      : { state: 'single-line', lineCount: 1, coveringLinesN: 0, nonCoveringLinesN: 0, unscheduledLinesN: 0 };

    if (crossLine.state === 'asymmetric-line-limits') {
      totals.asymmetricCrossLineN += 1;
      kindBucket.asymmetricCrossLineN += 1;
    } else if (crossLine.state === 'neither-line-covers') {
      totals.neitherLineCoversN += 1;
      kindBucket.neitherLineCoversN += 1;
    }

    let cover = null;
    if (verdictKey !== 'conformant') {
      cover = routeInfo.readable
        ? resolveCoveringSeatOnDay(
            declarations,
            structure,
            item.authorizerId,
            item.scopeClass,
            item.currency,
            item.amountCents,
            item.asOf,
          )
        : { state: 'unreadable', seatIds: [], limitCentsBySeat: {}, jointApexId: null, jointApexTieIds: [] };
    }

    verdictCounts.set(verdictKey, (verdictCounts.get(verdictKey) || 0) + 1);
    if (verdictKey === 'conformant') {
      totals.conformantN += 1;
      kindBucket.conformantN += 1;
    } else if (verdictKey === 'breach') {
      totals.breachN += 1;
      kindBucket.breachN += 1;
      if (breachClassKey === 'nemo-dat') {
        totals.nemoDatN += 1;
        kindBucket.nemoDatN += 1;
      } else if (breachClassKey === 'second-line-limit') {
        totals.secondLineLimitN += 1;
        kindBucket.secondLineLimitN += 1;
      } else {
        totals.overLimitN += 1;
        kindBucket.overLimitN += 1;
      }

      if (cover.state === 'unique') {
        totals.coverUniqueN += 1;
        kindBucket.coverUniqueN += 1;
      } else if (cover.state === 'matrix-tie') {
        totals.coverMatrixTieN += 1;
        kindBucket.coverMatrixTieN += 1;
      } else if (cover.state === 'above-apex') {
        totals.coverAboveApexN += 1;
        kindBucket.coverAboveApexN += 1;
      } else {
        totals.coverUnreadableN += 1;
        kindBucket.coverUnreadableN += 1;
      }
    } else if (verdictKey === 'currency-mismatch') {
      totals.currencyMismatchN += 1;
      kindBucket.currencyMismatchN += 1;
    } else if (verdictKey === 'unscheduled') {
      totals.unscheduledN += 1;
      kindBucket.unscheduledN += 1;
    } else {
      totals.structureUnreadableN += 1;
      kindBucket.structureUnreadableN += 1;
    }

    const vMeta = doaVerdict(verdictKey);
    const bMeta = breachClassKey ? doaBreachClass(breachClassKey) : null;
    const clMeta = doaCrossLineState(crossLine.state);
    const covMeta = cover ? doaCoverState(cover.state) : null;

    allEvaluatedRows.push({
      objectKey: item.objectKey,
      kind: item.kind,
      kindLabel: doaObjectKind(item.kind)?.label || item.kind,
      recordId: item.recordId,
      linkType: item.linkType,
      linkEntityId: item.linkEntityId,
      title: redactNames ? `${doaObjectKind(item.kind)?.label || item.kind}` : item.title,
      asOf: item.asOf,
      currency: item.currency,
      amountCents: item.amountCents,
      amountFixed: centsToFixed(item.amountCents),
      scopeClass: item.scopeClass,
      scopeClassLabel: doaScopeClass(item.scopeClass)?.label || item.scopeClass,
      route: routeInfo.readable ? routeInfo.route : null,
      routeLabel: routeInfo.readable ? (doaRoute(routeInfo.route)?.label || routeInfo.route) : 'Unreadable',
      lineKind: routeInfo.readable ? routeInfo.lineKind : null,
      lineKindLabel: routeInfo.readable ? (doaLineScope(routeInfo.lineKind)?.label || routeInfo.lineKind) : '—',
      // Internal IDs retained ONLY on operator fullAccess; stripped below for scoped seats.
      rawAuthorizerId: item.authorizerId,
      authorizerId: displaySeatId(item.authorizerId),
      authorizerName: displaySeatName(item.authorizerId),
      delegateId: displaySeatId(item.delegateId),
      delegateName: item.delegateId ? displaySeatName(item.delegateId) : null,
      limitCents,
      limitFixed: limitCents !== null ? centsToFixed(limitCents) : null,
      limitEntryId,
      excessCents: verdictKey === 'breach' && limitCents !== null ? item.amountCents - limitCents : null,
      excessFixed: verdictKey === 'breach' && limitCents !== null ? centsToFixed(item.amountCents - limitCents) : null,
      otherCurrencies,
      verdict: verdictKey,
      verdictRank: vMeta.rank,
      verdictTone: vMeta.tone,
      verdictLabel: vMeta.label,
      verdictReason,
      breachClass: breachClassKey,
      breachClassLabel: bMeta ? bMeta.label : null,
      breachClassShort: bMeta ? bMeta.short : null,
      crossLine: {
        ...crossLine,
        label: clMeta.label,
        tone: clMeta.tone,
      },
      cover: cover
        ? {
            state: cover.state,
            label: covMeta.label,
            tone: covMeta.tone,
            seatN: cover.seatIds.length,
            rawSeatIds: cover.seatIds,
            seatIds: cover.seatIds.map((id) => displaySeatId(id)).filter(Boolean),
            seatNames: cover.seatIds.map((id) => displaySeatName(id)),
            rawJointApexId: cover.jointApexId,
            jointApexId: displaySeatId(cover.jointApexId),
            jointApexName: cover.jointApexId ? displaySeatName(cover.jointApexId) : null,
            jointApexTieN: cover.jointApexTieIds.length,
          }
        : null,
      isOpenCommitment: item.isOpenCommitment,
    });
  }

  // Span roll-up across live DAG (explicitly non-additive across matrix reporting lines)
  const spanMap = new Map();
  const ensureSpan = (spanId) => {
    if (!spanMap.has(spanId)) {
      spanMap.set(spanId, { spanId, ownBreachN: 0, belowBreachN: 0, unscheduledN: 0, conformantN: 0 });
    }
    return spanMap.get(spanId);
  };

  for (const row of allEvaluatedRows) {
    const node = matrixToday.nodes.get(row.rawAuthorizerId) || null;
    if (!node) continue;
    const touch = (spanId, own) => {
      const s = ensureSpan(spanId);
      if (row.verdict === 'breach') {
        if (own) s.ownBreachN += 1;
        else s.belowBreachN += 1;
      } else if (row.verdict === 'conformant') {
        s.conformantN += 1;
      } else {
        s.unscheduledN += 1;
      }
    };
    if (row.rawAuthorizerId === LEADER_ID || node.descendants.size > 0) touch(row.rawAuthorizerId, true);
    for (const ancId of node.ancestors) touch(ancId, false);
  }

  const allSpanRows = [...spanMap.values()]
    .filter((s) => isSeatVisible(s.spanId))
    .map((s) => {
      const node = matrixToday.nodes.get(s.spanId) || null;
      return {
        spanId: displaySeatId(s.spanId),
        spanName: displaySeatName(s.spanId),
        depth: node?.depth ?? 99,
        ownBreachN: s.ownBreachN,
        belowBreachN: s.belowBreachN,
        totalBreachN: s.ownBreachN + s.belowBreachN,
        unscheduledN: s.unscheduledN,
        conformantN: s.conformantN,
      };
    })
    .sort((a, b) => a.depth - b.depth || b.totalBreachN - a.totalBreachN || String(a.spanName).localeCompare(String(b.spanName)));

  const spans = allSpanRows.slice(0, DOA_BOUNDS.spansCap);
  const spansOmittedN = allSpanRows.length - spans.length;

  // Sort commitment rows worst-first (breaches -> currency/unscheduled/unreadable -> conformant)
  allEvaluatedRows.sort((a, b) => a.verdictRank - b.verdictRank
    || (b.amountCents - a.amountCents)
    || String(b.asOf).localeCompare(String(a.asOf))
    || a.objectKey.localeCompare(b.objectKey));

  // Strip raw internal IDs on non-operator views so no outside-span ID leaks
  const sanitizedAllRows = seat.fullAccess
    ? allEvaluatedRows
    : allEvaluatedRows.map((row) => {
        const nextCover = row.cover
          ? { ...row.cover, rawSeatIds: undefined, rawJointApexId: undefined }
          : null;
        return { ...row, rawAuthorizerId: undefined, cover: nextCover };
      });

  const rows = sanitizedAllRows.slice(0, DOA_BOUNDS.rowsCap);
  const rowsOmittedN = sanitizedAllRows.length - rows.length;

  // Completeness & Conformance Rate Refusal Logic
  let conformancePermille = null;
  let conformanceRefusedReason = null;
  if (totals.testedN < DOA_BOUNDS.rateFloor) {
    conformanceRefusedReason = `Only ${totals.testedN} tested commitment(s); the declared floor for a conformance rate is ${DOA_BOUNDS.rateFloor}.`;
  } else if (totals.recordRefusedN > 0) {
    conformanceRefusedReason = `${totals.recordRefusedN} commitment(s) in scope were refused at record level (missing/untyped amount, mixed currency, missing date or unresolved authorizer); rate withheld rather than omitting incomplete records.`;
  } else if (totals.unscheduledN > 0 || totals.currencyMismatchN > 0 || totals.structureUnreadableN > 0) {
    const gaps = totals.unscheduledN + totals.currencyMismatchN + totals.structureUnreadableN;
    conformanceRefusedReason = `${gaps} tested commitment(s) lack a comparable schedule or readable graph on their commitment date (${totals.unscheduledN} unscheduled, ${totals.currencyMismatchN} currency mismatch, ${totals.structureUnreadableN} unreadable); rate withheld.`;
  } else {
    conformancePermille = doaPermille(totals.conformantN, totals.testedN);
  }

  const figuresComplete = conformancePermille !== null;

  // Exact term-by-term reconciliation identities (Bulletproof Reliability Mandate)
  const sumKind = (field) => DOA_OBJECT_KIND_KEYS.reduce((acc, k) => acc + byKind.get(k)[field], 0);
  const identities = {
    seatPartition: totals.readN === totals.inSeatN + totals.outsideSeatN,
    inSeatPartition: totals.inSeatN === totals.testedN + totals.recordRefusedN,
    refusalBuckets: totals.recordRefusedN === [...refusalCounts.values()].reduce((a, b) => a + b, 0),
    testedPartition: totals.testedN === (
      totals.conformantN
      + totals.breachN
      + totals.currencyMismatchN
      + totals.unscheduledN
      + totals.structureUnreadableN
    ),
    breachClasses: totals.breachN === totals.nemoDatN + totals.secondLineLimitN + totals.overLimitN,
    coverStates: totals.breachN === (
      totals.coverUniqueN
      + totals.coverMatrixTieN
      + totals.coverAboveApexN
      + totals.coverUnreadableN
    ),
    kindSumsMatch: (
      totals.readN === sumKind('readN')
      && totals.inSeatN === sumKind('inSeatN')
      && totals.testedN === sumKind('testedN')
      && totals.recordRefusedN === sumKind('recordRefusedN')
      && totals.conformantN === sumKind('conformantN')
      && totals.breachN === sumKind('breachN')
    ),
    rowCapsAccounted: (
      rows.length + rowsOmittedN === totals.testedN
      && scheduleRows.length + scheduleOmittedN === inScopeDeclarations.length
      && spans.length + spansOmittedN === allSpanRows.length
    ),
  };

  const countsReconcile = Object.values(identities).every(Boolean);

  const byKindSummary = {};
  for (const k of DOA_OBJECT_KIND_KEYS) {
    byKindSummary[k] = { ...byKind.get(k) };
  }

  return {
    engineVersion: DOA_ENGINE_VERSION,
    today,
    isMatrix: matrixToday.hasMatrix,
    seat: {
      id: seat.id,
      name: seat.name,
      label: seat.label,
      rank: seat.rank,
      fullAccess: Boolean(seat.fullAccess),
    },
    conventions,
    board: {
      activeLimitsN,
      retiredLimitsN,
      totalScheduleActsN: inScopeDeclarations.length,
      untypedDecisionsN,
      structureDaysReadN: reader.daysRead(),
      ...totals,
      conformancePermille,
      conformanceRefusedReason,
      rateFloor: DOA_BOUNDS.rateFloor,
      rowsOmittedN,
      scheduleOmittedN,
      spansOmittedN,
      countsReconcile,
      figuresComplete,
      identities,
    },
    byKind: byKindSummary,
    refusals: DOA_RECORD_REFUSALS.map((r) => ({
      ...r,
      count: refusalCounts.get(r.key) || 0,
    })),
    verdicts: DOA_VERDICTS.map((v) => ({
      ...v,
      count: verdictCounts.get(v.key) || 0,
    })),
    breachClasses: DOA_BREACH_CLASSES.map((b) => ({
      ...b,
      count: b.key === 'nemo-dat'
        ? totals.nemoDatN
        : b.key === 'second-line-limit'
          ? totals.secondLineLimitN
          : totals.overLimitN,
    })),
    crossLineStates: DOA_CROSS_LINE_STATES.map((c) => ({ ...c })),
    coverStates: DOA_COVER_STATES.map((c) => ({ ...c })),
    scheduleRows,
    rows,
    allRows: seat.fullAccess ? allEvaluatedRows : rows,
    refusedRows: refusedRows.slice(0, DOA_BOUNDS.rowsCap),
    spans,
    method: DOA_METHOD,
  };
}

export function doaCandidates(state = {}, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date(opts.now || Date.now());
  const settings = opts.settings || state?.settings || {};
  const matrix = buildMatrix(state, { now, settings });
  const lineScope = matrixLineScope(matrix);
  const seats = buildSeats(state, { now, settings, lineScope: lineScope.byManager });
  const acting = activeSeat(seats, settings);

  const eligibleSeats = [];
  for (const [nodeId, node] of matrix.nodes.entries()) {
    const canGrant = acting.fullAccess || Boolean(node.ancestors?.has(acting.id));
    if (!canGrant) continue;
    eligibleSeats.push({
      seatId: nodeId,
      label: `${node.name} (${nodeId === LEADER_ID ? 'Workspace Leader' : node.role || 'Roster seat'})`,
      isLeader: nodeId === LEADER_ID,
    });
  }
  eligibleSeats.sort((a, b) => Number(b.isLeader) - Number(a.isLeader) || a.label.localeCompare(b.label));

  return {
    seats: eligibleSeats,
    lineScopes: DOA_LINE_SCOPES,
    scopeClasses: DOA_SCOPE_CLASSES,
    objectKinds: DOA_OBJECT_KINDS,
  };
}

export function doaAttentionCount(state = {}, opts = {}) {
  const report = buildDoaReport(state, opts);
  return report.board.breachN;
}

/**
 * Identity-free executive & audit-committee brief. Contains zero person IDs,
 * seat IDs, names, commitment titles, or raw currency amounts.
 */
export function doaBriefText(report) {
  const b = report.board;
  const rateLine = b.conformancePermille !== null
    ? `${b.conformancePermille}‰ (${b.conformantN} of ${b.testedN} tested)`
    : `WITHHELD — ${b.conformanceRefusedReason}`;

  return [
    `Standing Delegation-of-Authority & Limit Conformance (${report.engineVersion})`,
    `As-of date: ${report.today} · Structure: ${report.isMatrix ? 'Matrix DAG' : 'Single-chain'}`,
    `Standing limits in scope: ${b.activeLimitsN} active, ${b.retiredLimitsN} retired/ended`,
    `Commitments read: ${b.readN} (${b.inSeatN} in span, ${b.outsideSeatN} outside span; ${b.untypedDecisionsN} non-monetary decided calls skipped without prose parsing)`,
    `In-span partition: ${b.testedN} tested + ${b.recordRefusedN} refused at record level`,
    `Tested verdicts: ${b.conformantN} conformant, ${b.breachN} exceeding limit (${b.nemoDatN} nemo-dat mandate, ${b.secondLineLimitN} matrix line-kind, ${b.overLimitN} seat over-limit), ${b.currencyMismatchN} currency mismatch, ${b.unscheduledN} unscheduled, ${b.structureUnreadableN} structure unreadable`,
    `Cross-line limit telemetry: ${b.asymmetricCrossLineN} asymmetric cross-line limit(s), ${b.neitherLineCoversN} shared item(s) where no single line covers (anti-splitting enforced)`,
    `One-over-one covering resolution (over ${b.breachN} breach(es)): ${b.coverUniqueN} unique senior seat, ${b.coverMatrixTieN} matrix tie, ${b.coverAboveApexN} above enterprise apex, ${b.coverUnreadableN} unreadable`,
    `Conformance rate: ${rateLine}`,
    `Claims (reported separately): countsReconcile=${b.countsReconcile} · figuresComplete=${b.figuresComplete}`,
    'Zero person IDs, seat IDs, names, titles or raw monetary figures are included in this brief.',
  ].join('\n');
}

/**
 * Aggregate-only CSV rows (#128 `matrix-doa`): 1 workspace summary row + 3
 * per-object-kind rows (`mandate`, `budget-line`, `decision`) whose integer
 * counts sum exactly to the workspace summary row. Refused rates export as `''`
 * (BLANK, never `0`).
 */
export function doaCsvRows(report) {
  const b = report.board;
  const makeRow = (scopeKey, counters, isSummary) => ({
    engine_version: report.engineVersion,
    as_of_date: report.today,
    row_scope: scopeKey,
    is_matrix: report.isMatrix,
    active_limits_n: isSummary ? b.activeLimitsN : '',
    retired_limits_n: isSummary ? b.retiredLimitsN : '',
    read_n: counters.readN,
    in_seat_n: counters.inSeatN,
    outside_seat_n: counters.outsideSeatN,
    tested_n: counters.testedN,
    record_refused_n: counters.recordRefusedN,
    conformant_n: counters.conformantN,
    breach_n: counters.breachN,
    nemo_dat_n: counters.nemoDatN,
    second_line_limit_n: counters.secondLineLimitN,
    over_limit_n: counters.overLimitN,
    currency_mismatch_n: counters.currencyMismatchN,
    unscheduled_n: counters.unscheduledN,
    structure_unreadable_n: counters.structureUnreadableN,
    asymmetric_cross_line_n: counters.asymmetricCrossLineN,
    neither_line_covers_n: counters.neitherLineCoversN,
    cover_unique_n: counters.coverUniqueN,
    cover_matrix_tie_n: counters.coverMatrixTieN,
    cover_above_apex_n: counters.coverAboveApexN,
    cover_unreadable_n: counters.coverUnreadableN,
    conformance_permille: isSummary && b.conformancePermille !== null ? b.conformancePermille : '',
    conformance_withheld_reason: isSummary && b.conformanceRefusedReason ? b.conformanceRefusedReason : '',
    counts_reconcile: isSummary ? b.countsReconcile : '',
    figures_complete: isSummary ? b.figuresComplete : '',
  });

  const out = [makeRow('workspace', b, true)];
  for (const kindKey of DOA_OBJECT_KIND_KEYS) {
    out.push(makeRow(kindKey, report.byKind[kindKey], false));
  }
  return out;
}
