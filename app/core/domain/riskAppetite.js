/**
 * app/core/domain/riskAppetite.js — the pure reader of the Enterprise Risk
 * Appetite & Tolerance Breach Register (ADR-0219, Schema v173, `#/risk-appetite`).
 *
 * ONE READER. Every verdict, figure, count, coverage gap, escalation and
 * attention number the screen prints is computed here from the stored
 * statements, the stored declarations, the operational cases and the live
 * matrix. Nothing derived is stored; a hand-edited file cannot carry a
 * tolerance verdict its own rows do not imply.
 *
 * WHAT IS KEPT APART, ALWAYS:
 *
 *   1. A STANCE AND A CEILING. `appetite` is a declared posture on five steps.
 *      `tolerance` is an exact integer. The reader prints both and never turns
 *      the first into the second.
 *   2. THE MEASURED FIGURE AND ITS POPULATION. Every figure carries the number
 *      of live risks it was measured over.
 *   3. “INSIDE THE CEILING” AND “THE WHOLE POPULATION WAS MEASURED”. The verdict
 *      is a fact about the declared population. `figuresComplete` is a separate
 *      fact about coverage, and a register can honestly print
 *      `within-tolerance` beside `NOT CERTIFIED — 3 open risks undeclared`.
 *   4. ONE RISK, ONCE. A case is counted once at the enterprise, in the domain
 *      of its LATEST live declaration. A retention is never split across the
 *      lines that hold its owner, because no human agreed a split.
 *   5. A WITHDRAWAL NEVER RESURRECTS AN OLDER ROW. Withdrawing the newest
 *      declaration leaves the risk undeclared; the previous declaration is
 *      history, not a fallback. The same is true of a retired statement.
 *
 * MONEY. Per currency, exact integer cents, `BigInt` sums, no conversion, no
 * pooling. Money in a currency the statement does not declare is printed as
 * EXCLUDED with its own total — it is neither converted nor silently dropped.
 */

import { dayKey } from '../time.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import { LEADER_ID } from './chain.js';
import { canSee } from './seat.js';
import {
  normalizeRaMarkers,
  normalizeRiskAppetiteStatements,
  normalizeRiskDeclarations,
} from './riskAppetiteSchema.js';
import {
  RA_ADR,
  RA_CSV_COLUMNS,
  RA_DOMAIN_KEYS,
  RA_ENGINE_VERSION,
  RA_LIMITS as L,
  RA_METHOD,
  RA_OPEN_CASE_STATUSES,
  RA_RISK_CASE_KINDS,
  raAppetiteLevel,
  raDomain,
  raStatementKey,
} from './riskAppetiteRegistry.js';
import {
  RA_MAX_CENTS,
  measureStatement,
  raClaims,
  raDaysBetween,
} from './riskAppetiteMath.js';

export const RA_STATEMENT_COLLECTION = 'riskAppetiteStatements';
export const RA_DECLARATION_COLLECTION = 'riskDeclarations';

/** The actor a seat acts as: the operator is the leader, a declared seat is its node. */
export function riskAppetiteActorId(seat) {
  if (!seat) return null;
  return seat.fullAccess ? LEADER_ID : (seat.nodeId || seat.id || null);
}

/** The matrix, built with no active seat so the reader never depends on who is looking. */
export function riskAppetiteMatrix(state, now, settings) {
  return buildMatrix(state, { now, settings: { ...(settings || {}), activeSeatId: null } });
}

const nameOf = (matrix, id) => {
  if (!id) return null;
  const node = matrix?.nodes?.get(id);
  return (node && node.name) || id;
};

/** The open cases this register measures: operational risks and realised incidents. */
export function riskAppetiteOpenCases(state) {
  const cases = Array.isArray(state?.cases) ? state.cases : [];
  return cases.filter((row) => row
    && typeof row.id === 'string'
    && RA_RISK_CASE_KINDS.includes(row.kind)
    && RA_OPEN_CASE_STATUSES.includes(row.status));
}

/**
 * The live statement per key. A later declaration on the same key governs; a
 * retired row means the key has NO live statement — the register does not
 * resurrect an older tolerance, because nobody re-declared it.
 *
 * Returns `{ live: Map<key, statement>, retiredKeys: Set<key>, future: [...] }`.
 */
export function liveStatements(statements, asOf) {
  const byKey = new Map();
  const future = [];
  for (const row of statements) {
    if (row.declaredOn > asOf) { future.push(row); continue; }
    if (!byKey.has(raStatementKey(row))) byKey.set(raStatementKey(row), []);
    byKey.get(raStatementKey(row)).push(row);
  }
  const live = new Map();
  const retiredKeys = new Set();
  for (const [key, rows] of byKey.entries()) {
    // The loader has already refused two rows sharing key AND day, so the
    // latest declaredOn is unique.
    const latest = rows.slice().sort((a, b) => (a.declaredOn < b.declaredOn ? -1 : a.declaredOn > b.declaredOn ? 1 : 0)).at(-1);
    if (!latest) continue;
    if (latest.retiredOn) retiredKeys.add(key);
    else live.set(key, latest);
  }
  return { live, retiredKeys, future };
}

/**
 * The live declaration per case: the latest declared on or before `asOf`,
 * ACROSS domains. If that latest row is withdrawn the case has no live
 * declaration — no older row is resurrected.
 *
 * Returns `{ live: Map<caseId, declaration>, withdrawn: Set<caseId>, future: [...] }`.
 */
export function liveDeclarations(declarations, asOf) {
  const byCase = new Map();
  const future = [];
  for (const row of declarations) {
    if (row.declaredOn > asOf) { future.push(row); continue; }
    if (!byCase.has(row.caseId)) byCase.set(row.caseId, []);
    byCase.get(row.caseId).push(row);
  }
  const live = new Map();
  const withdrawn = new Set();
  for (const [caseId, rows] of byCase.entries()) {
    const latest = rows.slice().sort((a, b) => (a.declaredOn < b.declaredOn ? -1 : a.declaredOn > b.declaredOn ? 1 : 0)).at(-1);
    if (!latest) continue;
    if (latest.withdrawnOn) withdrawn.add(caseId);
    else live.set(caseId, latest);
  }
  return { live, withdrawn, future };
}

/** The seat's grant for one declaration row. Only `full` prints a row. */
export function declarationGrant(seat, declaration) {
  if (!seat) return 'denied';
  if (seat.fullAccess) return 'full';
  return canSee({ id: declaration.id, personId: declaration.ownerId || null }, RA_DECLARATION_COLLECTION, seat, null).allow;
}

/**
 * The whole register. Pure: every figure is re-derived on each call.
 */
export function buildRiskAppetite(state, { now = new Date(), settings = null, seat = null } = {}) {
  const warnings = [];
  const at = now instanceof Date ? now : new Date(now);
  const asOf = dayKey(at) || L.dayMin;
  const statements = normalizeRiskAppetiteStatements(state?.riskAppetiteStatements, warnings);
  const declarations = normalizeRiskDeclarations(state?.riskDeclarations, warnings);
  const markers = normalizeRaMarkers(state?.riskAppetiteMarkers, warnings);
  const cases = new Map((Array.isArray(state?.cases) ? state.cases : [])
    .filter((row) => row && typeof row.id === 'string')
    .map((row) => [row.id, row]));
  const people = new Map((Array.isArray(state?.people) ? state.people : [])
    .filter((row) => row && typeof row.id === 'string')
    .map((row) => [row.id, row]));

  let matrix = null;
  let matrixError = null;
  try {
    matrix = riskAppetiteMatrix(state, at, settings || state?.settings || null);
  } catch (error) {
    matrixError = `The reporting graph could not be read, so ownership, de-duplication and escalation cannot be computed: ${error?.message || 'unknown error'}.`;
  }

  const openRiskCases = riskAppetiteOpenCases(state);
  const openRiskCaseIds = new Set(openRiskCases.map((row) => row.id));
  const statementState = liveStatements(statements, asOf);
  const declarationState = liveDeclarations(declarations, asOf);

  /* ---------------------------------------------------------- population */
  const missingCaseIds = [];
  const settledCaseIds = [];
  const population = [];
  for (const [caseId, declaration] of declarationState.live.entries()) {
    const operationalCase = cases.get(caseId) || null;
    if (!operationalCase) { missingCaseIds.push(caseId); continue; }
    if (!openRiskCaseIds.has(caseId)) { settledCaseIds.push(caseId); continue; }
    const ownerId = operationalCase.ownerId || null;
    const lines = matrix ? (matrix.linesByPerson.get(ownerId) || []).filter((line) => line.active !== false) : [];
    const managerIds = [...new Set(lines.map((line) => line.managerId).filter(Boolean))];
    population.push({
      ...declaration,
      caseTitle: operationalCase.title,
      caseKind: operationalCase.kind,
      caseStatus: operationalCase.status,
      ownerId,
      ownerName: nameOf(matrix, ownerId),
      ownerOnRoster: people.has(ownerId) && people.get(ownerId).status !== 'archived',
      managerIds,
      homeManagerId: people.get(ownerId)?.managerId || managerIds[0] || null,
      sharedAcrossLines: managerIds.length > 1,
    });
  }
  population.sort((a, b) => (a.domain < b.domain ? -1 : a.domain > b.domain ? 1 : a.declaredOn < b.declaredOn ? -1 : a.declaredOn > b.declaredOn ? 1 : 0));

  const byDomain = new Map(RA_DOMAIN_KEYS.map((key) => [key, []]));
  for (const row of population) byDomain.get(row.domain).push(row);
  const byDomainCounts = Object.fromEntries(RA_DOMAIN_KEYS.map((key) => [key, byDomain.get(key).length]));

  /* ---------------------------------------------------------- statements */
  const statementRows = [];
  const domainsWithStatement = new Set();
  const currencyKeysWithStatement = new Set();
  for (const statement of statementState.live.values()) {
    domainsWithStatement.add(statement.domain);
    if (statement.measure === 'retained-exposure') {
      currencyKeysWithStatement.add(`${statement.domain}|${statement.currency}`);
    }
    const domainPopulation = byDomain.get(statement.domain) || [];
    const measurement = measureStatement(statement, domainPopulation);
    const reviewDays = raDaysBetween(statement.reviewOn, asOf);
    const reviewOverdue = reviewDays !== null && reviewDays > 0;
    // The seat above EVERY line carrying the risk: the joint apex of the
    // CARRIER'S MANAGERS, not of the owners themselves. Asking the owner to
    // clear the ceiling they are carrying would be the substitution this
    // register refuses, so the owner is never the addressee.
    const carrierIds = [...new Set(domainPopulation.flatMap((row) => row.managerIds).filter((id) => id && matrix?.nodes?.has?.(id)))];
    const apex = matrix ? matrixJointApex(matrix, carrierIds) : null;
    statementRows.push({
      ...statement,
      key: raStatementKey(statement),
      domainLabel: raDomain(statement.domain)?.label || statement.domain,
      appetiteLabel: raAppetiteLevel(statement.appetite)?.label || statement.appetite,
      declarerName: nameOf(matrix, statement.declaredById),
      declarerOnRoster: people.has(statement.declaredById) && people.get(statement.declaredById).status !== 'archived',
      tolerance: statement.measure === 'retained-exposure' ? statement.toleranceCents : statement.toleranceCount,
      measurement,
      verdict: measurement.verdict,
      breached: measurement.breached === true,
      reviewOn: statement.reviewOn,
      reviewOverdue,
      reviewOverdueDays: reviewOverdue ? reviewDays : 0,
      escalation: apex ? {
        apexIds: apex.apexIds,
        apexId: apex.apexId,
        apexName: nameOf(matrix, apex.apexId),
        unique: apex.unique,
        ambiguous: apex.ambiguous,
        disconnected: apex.disconnected,
        carrierLineN: carrierIds.length,
        /** The owner is the arm's-length line, not the declarer: the ask goes above the risk. */
      } : {
        apexIds: [], apexId: null, apexName: null, unique: false, ambiguous: false, disconnected: false, carrierLineN: carrierIds.length,
      },
      emptyDomain: domainPopulation.length === 0,
    });
  }
  statementRows.sort((a, b) => (a.domain < b.domain ? -1 : a.domain > b.domain ? 1 : a.measure < b.measure ? -1 : a.measure > b.measure ? 1 : (a.currency || '') < (b.currency || '') ? -1 : 1));

  /* ------------------------------------------------------------- coverage */
  const domainsWithoutAppetite = RA_DOMAIN_KEYS.filter((key) => byDomain.get(key).length > 0 && !domainsWithStatement.has(key));
  const currenciesWithoutStatement = [];
  for (const domain of RA_DOMAIN_KEYS) {
    const currencies = [...new Set(byDomain.get(domain).map((row) => row.currency))].sort();
    for (const currency of currencies) {
      if (!currencyKeysWithStatement.has(`${domain}|${currency}`)) currenciesWithoutStatement.push({ domain, currency });
    }
  }
  const declaredCaseIds = new Set(population.map((row) => row.caseId));
  const claims = raClaims({
    declaredTotal: population.length,
    byDomainCounts,
    openRiskCases,
    declaredCaseIds,
    missingCaseIds,
    domainsWithoutAppetite,
    currenciesWithoutStatement,
  });

  /* ------------------------------------------------------- per-domain view */
  const domains = RA_DOMAIN_KEYS.map((key) => {
    const rows = byDomain.get(key) || [];
    const centsTotals = new Map();
    for (const row of rows) {
      const cents = row.retainedCents;
      const prior = centsTotals.get(row.currency) ?? 0n;
      const next = prior + BigInt(cents);
      centsTotals.set(row.currency, next);
    }
    const centsByCurrency = {};
    for (const [currency, total] of centsTotals.entries()) {
      // A total beyond the safe range is withheld, never rounded.
      centsByCurrency[currency] = total > RA_MAX_CENTS ? null : Number(total);
    }
    const statementsForKey = statementRows.filter((row) => row.domain === key);
    return {
      domain: key,
      label: raDomain(key)?.label || key,
      question: raDomain(key)?.question || '',
      declaredN: rows.length,
      centsByCurrency,
      statementKeys: statementsForKey.map((row) => row.key),
      verdicts: statementsForKey.map((row) => row.verdict),
      uncovered: rows.length > 0 && statementsForKey.length === 0,
      crossLineN: rows.filter((row) => row.sharedAcrossLines).length,
      unownedN: rows.filter((row) => !row.ownerOnRoster).length,
    };
  });

  /* -------------------------------------------------------------- per line */
  // A line's count is over the risks whose owner's HOME line it is. The
  // exposure is NEVER attributed per line: a retention is carried once for the
  // enterprise, and a division between managers would be an allocation no human
  // declared. Cross-line owners are counted once, at their home line, and
  // flagged, so the line figure does not pretend to be the whole picture.
  const lineMap = new Map();
  for (const row of population) {
    const lineId = row.homeManagerId || 'unassigned';
    if (!lineMap.has(lineId)) lineMap.set(lineId, []);
    lineMap.get(lineId).push(row);
  }
  const lines = [...lineMap.entries()].map(([managerId, rows]) => ({
    managerId,
    managerName: managerId === 'unassigned' ? 'No home line on the record' : nameOf(matrix, managerId),
    declaredN: rows.length,
    crossLineN: rows.filter((row) => row.sharedAcrossLines).length,
    unownedN: rows.filter((row) => !row.ownerOnRoster).length,
    /** Printed beside every line row: the money is not attributed here. */
    exposureAttribution: 'not-attributed',
  })).sort((a, b) => b.declaredN - a.declaredN || String(a.managerName).localeCompare(String(b.managerName)));

  /* ---------------------------------------------------------- declarations */
  const visibleDeclarations = population.filter((row) => declarationGrant(seat, row) === 'full');
  const hiddenDeclarationsN = population.length - visibleDeclarations.length;
  const declarationsShown = visibleDeclarations.slice(0, L.declarationsShown).map((row) => ({
    ...row,
    domainLabel: raDomain(row.domain)?.label || row.domain,
    declarerName: nameOf(matrix, row.declaredById),
    lineNames: row.managerIds.map((id) => nameOf(matrix, id)),
  }));

  /* -------------------------------------------------------------- attention */
  const actorId = riskAppetiteActorId(seat);
  const isApexForMe = (row) => Boolean(actorId) && (
    (row.escalation.unique && row.escalation.apexId === actorId)
    || (row.escalation.ambiguous && row.escalation.apexIds.includes(actorId))
  );
  const ladderKnown = seat ? Boolean(seat.fullAccess || (seat.rank ?? 99) >= 4) : false;
  const attentionRows = statementRows.filter((row) => (ladderKnown || seat?.fullAccess)
      && ((row.breached && isApexForMe(row)) || (row.reviewOverdue && row.declaredById === actorId)));
  const missingAttention = ladderKnown
    ? domainsWithoutAppetite.length
    : 0;
  const attention = attentionRows.length + missingAttention;
  const attentionReason = attention
    ? 'Appetite statements this seat owes a decision on: a breached ceiling it holds the joint seat above, a review date it passed, or a domain carrying declared risk with no appetite at all.'
    : '';

  const breachedN = statementRows.filter((row) => row.verdict === 'breached').length;
  const unmeasurableN = statementRows.filter((row) => row.verdict === 'unmeasurable').length;
  const reviewOverdueN = statementRows.filter((row) => row.reviewOverdue).length;
  const withdrawnLiveCases = [...declarationState.withdrawn].filter((caseId) => openRiskCaseIds.has(caseId));

  return {
    engineVersion: RA_ENGINE_VERSION,
    adr: RA_ADR,
    asOf,
    seat: seat ? { label: seat.label || seat.id || 'operator', rank: seat.rank ?? null, fullAccess: Boolean(seat.fullAccess) } : null,
    matrixError,
    warnings,
    totals: {
      statementsDeclared: statements.length,
      statementsLive: statementRows.length,
      statementsRetired: statementState.retiredKeys.size,
      statementsFuture: statementState.future.length,
      declarationsDeclared: declarations.length,
      declarationsLive: declarationState.live.size,
      declaredRisksN: population.length,
      openRiskCasesN: openRiskCases.length,
      withdrawnCasesN: withdrawnLiveCases.length,
      settledDeclarationsN: settledCaseIds.length,
      missingCaseN: missingCaseIds.length,
      byDomain: byDomainCounts,
      countsReconcile: claims.countsReconcile,
      perDomainSum: claims.perDomainSum,
      undeclaredN: claims.undeclaredN,
      figuresComplete: claims.figuresComplete,
      /** A separate, printed reason for every coverage gap. */
      coverageReasons: [
        claims.undeclaredN ? `${claims.undeclaredN} open risk case(s) carry no live declaration; their exposure is unknown and no statement is certified.` : '',
        claims.missingCaseN ? `${claims.missingCaseN} declaration(s) name a case this workspace does not hold; they are kept and counted, never dropped.` : '',
        claims.domainsWithoutAppetiteN ? `${claims.domainsWithoutAppetiteN} domain(s) carry declared risk with no live appetite statement.` : '',
        claims.currenciesWithoutStatementN ? `${claims.currenciesWithoutStatementN} (domain, currency) pair(s) carry money with no exposure statement in that currency.` : '',
        matrixError ? 'The reporting graph is unreadable, so coverage cannot be certified.' : '',
      ].filter(Boolean),
      breachedN,
      withinN: statementRows.filter((row) => row.verdict === 'within-tolerance').length,
      unmeasurableN,
      reviewOverdueN,
      markersN: markers.length,
      ladderKnown,
      hiddenDeclarationsN,
      hiddenDeclarationsReason: hiddenDeclarationsN
        ? `${hiddenDeclarationsN} declared risk(s) are counted but not shown: this seat is not granted the portfolio detail for them.`
        : '',
    },
    statements: statementRows,
    statementsShown: statementRows.length,
    domains,
    domainsWithoutAppetite,
    currenciesWithoutStatement,
    lines,
    declarations: declarationsShown,
    declarationsShown: declarationsShown.length,
    declarationsCapped: visibleDeclarations.length - declarationsShown.length,
    markers,
    attention,
    attentionReason,
    openRiskCases: openRiskCases.map((row) => ({
      id: row.id,
      title: row.title,
      kind: row.kind,
      status: row.status,
      ownerId: row.ownerId || null,
      ownerName: nameOf(matrix, row.ownerId),
      declared: declarationState.live.has(row.id),
      domain: declarationState.live.get(row.id)?.domain || null,
    })),
    method: RA_METHOD,
  };
}

/** The attention figure on the navigation badge — the same number the panel prints. */
export function riskAppetiteAttentionCount(state, { now = new Date(), settings = null, seat = null } = {}) {
  return buildRiskAppetite(state, { now, settings, seat }).attention;
}

/**
 * The cases a seat may declare exposure for: the open risk-bearing cases it can
 * reach through the span or a declared line. A seat that reaches none is told
 * why, rather than shown an empty list.
 */
export function riskAppetiteCandidates(state, { now = new Date(), settings = null, seat = null } = {}) {
  if (!seat) return { candidates: [], reason: 'No seat resolved.' };
  const at = now instanceof Date ? now : new Date(now);
  let matrix;
  try {
    matrix = riskAppetiteMatrix(state, at, settings || state?.settings || null);
  } catch (error) {
    return { candidates: [], reason: `The reporting graph could not be read: ${error?.message || 'unknown error'}.` };
  }
  const asOf = dayKey(at) || L.dayMin;
  const declarationState = liveDeclarations(normalizeRiskDeclarations(state?.riskDeclarations, []), asOf);
  const candidates = [];
  for (const row of riskAppetiteOpenCases(state)) {
    const grant = canSee({ id: row.id, personId: row.ownerId || null }, 'cases', seat, null);
    if (!seat.fullAccess && grant.allow !== 'full') continue;
    const lines = (matrix.linesByPerson.get(row.ownerId) || []).filter((line) => line.active !== false);
    const live = declarationState.live.get(row.id) || null;
    candidates.push({
      caseId: row.id,
      title: row.title,
      kind: row.kind,
      status: row.status,
      ownerId: row.ownerId || null,
      ownerName: nameOf(matrix, row.ownerId),
      lines: lines.map((line) => ({ managerId: line.managerId, managerName: nameOf(matrix, line.managerId), kind: line.kind || 'home' })),
      declared: Boolean(live),
      current: live ? { id: live.id, domain: live.domain, currency: live.currency, retainedCents: live.retainedCents, declaredOn: live.declaredOn } : null,
    });
  }
  candidates.sort((a, b) => String(a.title).localeCompare(String(b.title)));
  return {
    candidates,
    reason: candidates.length ? '' : 'No open risk-bearing case is reachable from this seat. Exposure is declared by a seat that holds the case owner, on the home chain or a declared line.',
  };
}

/**
 * CSV scope #161. Built from the SAME reader the panel renders, with no seat.
 * Every figure is aggregate. No declarer, no case, no owner and no basis note
 * is reachable from here. A figure the reader could not compute exports BLANK
 * with its reason, never a zero.
 */
export function riskAppetiteCsvRows(report) {
  if (!report || !report.totals) return [];
  const asOf = report.asOf;
  const t = report.totals;
  const rows = [];
  rows.push({
    as_of: asOf, row_kind: 'summary', key: 'declared_risks',
    domain: '', measure: '', currency: '', tolerance: '', measured: '',
    verdict: '', breached: '', review_overdue: '',
    declared_risks: String(t.declaredRisksN),
    excluded_other_currency: '', coverage_gap: String(t.undeclaredN),
    blank_reason: '',
  });
  rows.push({
    as_of: asOf, row_kind: 'summary', key: 'coverage',
    domain: '', measure: '', currency: '', tolerance: '', measured: '',
    verdict: '', breached: '', review_overdue: '',
    declared_risks: String(t.declaredRisksN),
    excluded_other_currency: '',
    coverage_gap: String(t.figuresComplete ? 0 : t.undeclaredN + t.missingCaseN + report.domainsWithoutAppetite.length),
    blank_reason: t.figuresComplete ? '' : 'coverage_incomplete',
  });
  for (const row of report.statements) {
    const measurable = row.verdict !== 'unmeasurable';
    const money = row.measure === 'retained-exposure';
    rows.push({
      as_of: asOf,
      row_kind: 'statement',
      key: row.key,
      domain: row.domain,
      measure: row.measure,
      currency: money ? row.currency : '',
      tolerance: measurable ? String(row.tolerance) : '',
      measured: measurable ? String(row.measurement.measured) : '',
      verdict: row.verdict,
      breached: measurable ? (row.breached ? '1' : '0') : '',
      review_overdue: row.reviewOverdue ? '1' : '0',
      declared_risks: String(row.measurement.populationN),
      excluded_other_currency: String(row.measurement.excludedOtherCurrencyN),
      coverage_gap: String(t.figuresComplete ? 0 : t.undeclaredN),
      blank_reason: measurable ? '' : 'unmeasurable',
    });
  }
  for (const row of report.domains) {
    rows.push({
      as_of: asOf,
      row_kind: 'domain',
      key: row.domain,
      domain: row.domain,
      measure: '',
      currency: '',
      tolerance: '',
      measured: '',
      verdict: '',
      breached: '',
      review_overdue: '',
      declared_risks: String(row.declaredN),
      excluded_other_currency: '',
      coverage_gap: String(row.uncovered ? row.declaredN : 0),
      blank_reason: '',
    });
  }
  return rows.map((row) => Object.fromEntries(RA_CSV_COLUMNS.map((key) => [key, row[key] ?? ''])));
}
