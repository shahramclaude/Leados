/**
 * app/core/domain/riskConcentration.js — the shared-dependency concentration
 * reader for the Enterprise Risk Appetite register (ADR-0226, `#/risk-appetite`
 * view `shared`). Pure. No state is written, no probability is produced.
 *
 * THE QUESTION THIS ANSWERS. Every declared risk is inside its own retention,
 * and the register says so. But several of those risks can rely on one service,
 * vendor or system. When that dependency fails, they realise together. Each
 * retention was judged alone, so the enterprise can hold a correlated loss that
 * no single declaration ever stated: "every risk is within tolerance" and "one
 * outage realises all of them at once" are both true, and nothing printed the
 * second until now.
 *
 * WHAT IT JOINS, AND ONLY WHAT IT JOINS.
 *   - the LIVE declarations and open risk cases, read by the register's own
 *     `liveDeclarations` / `riskAppetiteOpenCases` (same asOf, same withdrawal
 *     rule, same one-risk-once rule — the two pages cannot disagree);
 *   - a risk's reliance is ONLY a recorded `depends-on` typed link from the case
 *     to a dependency, or the dependency's own `upstreamIds` chain. A shared
 *     owner, a shared vendor name or a shared line is NOT a dependency and is
 *     never inferred into one;
 *   - the live appetite statement per (domain, currency), read with the same
 *     key the register uses.
 *
 * THE FIGURES, AND THE CLAIMS KEPT APART.
 *   1. A SHARED ROW is one (dependency, domain, currency) that at least two
 *      live declared risks rely on. Its retention is the exact integer sum of
 *      those risks' declared cents in that currency. No probability is applied,
 *      no correlation is estimated and no retention is divided between risks.
 *   2. THE SHARE is that sum over the WHOLE declared population of the same
 *      domain and currency, in exact basis points (floor). A share over a
 *      population is printed beside its size, never as a bare percentage.
 *   3. THE CEILING is the live `retained-exposure` statement for that domain and
 *      currency. The comparison is `sum > ceiling` — the register's own breach
 *      rule. Where no ceiling is declared the verdict is `no-ceiling`, printed as
 *      NOT COMPARED. It is never rendered as within tolerance.
 *   4. TWO CLAIMS, REPORTED SEPARATELY. `partitionReconciles` (every declared
 *      risk is accounted for exactly once: linked, unlinked or linked only to
 *      retired dependencies) is one fact. `wholePopulationMeasured` (every open
 *      risk is declared and every declared risk names its dependencies) is
 *      another. A reading can honestly reconcile and still be incomplete.
 *   5. OVERLAP IS BY DESIGN. A risk reliant on two dependencies, or on one
 *      through an upstream chain, is counted under each. The dependency rows
 *      therefore do NOT add to the population total, and the reader says so.
 *
 * SEAT VISIBILITY. A declared risk the seat may not see is never summed into a
 * figure it could read. If any live declared risk is hidden from the seat the
 * whole reading is WITHHELD with a printed reason, because a total built from
 * part of the population would be read as the enterprise's.
 */

import { dayKey } from '../time.js';
import { RA_LIMITS as L, raStatementKey } from './riskAppetiteRegistry.js';
import { normalizeRiskAppetiteStatements, normalizeRiskDeclarations } from './riskAppetiteSchema.js';
import { RA_MAX_CENTS } from './riskAppetiteMath.js';
import {
  declarationGrant,
  liveDeclarations,
  liveStatements,
  riskAppetiteOpenCases,
} from './riskAppetite.js';

export const RC_ENGINE_VERSION = 'risk-concentration-2026.11-v1';
export const RC_ADR = 'ADR-0226';
export const RC_VIEW_KEY = 'shared';

/** How many upstream hops a reliance chain is followed before the rest is printed as unread. */
export const RC_MAX_HOPS = 6;
/** Printed row caps. The remainder is counted and named, never dropped. */
export const RC_DEPENDENCY_ROW_CAP = 60;
export const RC_SHARED_ROW_CAP = 80;
/** Basis points: a share is an exact integer over this scale. */
const RC_SHARE_SCALE = 10000n;

export const RC_VERDICTS = Object.freeze([
  Object.freeze({ key: 'would-exceed', label: 'Would exceed the domain ceiling on its own', tone: 'bad' }),
  Object.freeze({ key: 'within-ceiling', label: 'Within the domain ceiling on its own', tone: 'good' }),
  Object.freeze({ key: 'no-ceiling', label: 'Not compared — no exposure ceiling is declared here', tone: 'caution' }),
]);
const VERDICT_RANK = Object.freeze({ 'would-exceed': 0, 'no-ceiling': 1, 'within-ceiling': 2 });

export const RC_METHOD = Object.freeze({
  frameworks: Object.freeze([
    'Common-cause (common-mode) failure analysis, as used in reliability engineering and IEC 61508: redundancies that look independent can share one cause, so their combined loss is not the sum of their separate probabilities. This reader sums DECLARED retentions per shared cause and multiplies no probability. [citation details UNVERIFIED]',
    'Perrow (1984), Normal Accidents: in a tightly coupled system one failure reaches many parts at once, so the number of risks a single cause touches is the number a manager must see. [citation details from memory, UNVERIFIED]',
    'Tiered supply-chain concentration (Simchi-Levi, Schmidt & Wei, 2014/2015, also cited in ADR-0012): one upstream dependency behind several services is a single point of failure that tier-1 views hide.',
    'COSO ERM (2017) Principle 3 and ISO 31000:2018 risk criteria: a ceiling is a declared criterion. It is applied to the correlated sum that one cause would realise, and where no ceiling exists the reading says NOT COMPARED instead of certifying the risk as within tolerance.',
  ]),
  printed: Object.freeze([
    'Each shared row: the dependency, the domain and currency, the live risks that rely on it, their exact combined retention, the share of the domain and currency it represents, and the verdict against the domain ceiling.',
    'Two coverage claims, separately: whether every open risk is declared and linked, and whether the reading accounts for every declared risk exactly once.',
    'Every refusal and cap, counted with its reason: unlinked risks, risks reaching a dependency through a deep chain, retired dependencies, and upstream edges that point at retired dependencies.',
  ]),
  deliberatelyAbsent: Object.freeze([
    'No probability is multiplied, no correlation coefficient is estimated and no loss is modelled. The figure is the retention the declared risks would bring to bear together.',
    'No retention is divided between the risks that share a dependency; the sum is printed once per dependency and never allocated.',
    'No dependency is inferred from a shared owner, vendor name, line or label. Only a recorded depends-on link or a recorded upstream dependency counts.',
    'No external supplier, vendor or market data is fetched. The reading is as complete as the dependencies the workspace records.',
  ]),
});

/**
 * Every active dependency reached from the given direct dependencies, with the
 * MINIMUM number of upstream hops. Breadth-first, so the first discovery is the
 * minimum; a visited set makes a cycle in `upstreamIds` terminate. Retired
 * dependencies are not in `depsActive` and are never traversed.
 */
export function reachDependencies(directIds, depsActive, maxHops = RC_MAX_HOPS) {
  const reach = new Map();
  const queue = [];
  for (const id of directIds) {
    if (!depsActive.has(id) || reach.has(id)) continue;
    reach.set(id, 0);
    queue.push(id);
  }
  let truncated = false;
  for (let i = 0; i < queue.length; i += 1) {
    const id = queue[i];
    const hop = reach.get(id);
    const dep = depsActive.get(id);
    for (const upId of Array.isArray(dep.upstreamIds) ? dep.upstreamIds : []) {
      if (!depsActive.has(upId) || reach.has(upId)) continue;
      if (hop + 1 > maxHops) { truncated = true; continue; }
      reach.set(upId, hop + 1);
      queue.push(upId);
    }
  }
  return { reach, truncated };
}

const seatSummary = (seat) => (seat
  ? { label: seat.label || seat.id || 'operator', rank: seat.rank ?? null, fullAccess: Boolean(seat.fullAccess) }
  : null);

const cmpText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function withheld({ asOf, seat, hiddenN, warnings }) {
  return {
    engineVersion: RC_ENGINE_VERSION,
    adr: RC_ADR,
    asOf,
    seat: seatSummary(seat),
    withheld: true,
    withheldReason: `${hiddenN} live declared risk(s) are not visible from this seat. A shared-dependency total built from part of the population would be read as the enterprise’s, so no dependency, share, ceiling or verdict is printed. Ask a seat granted that portfolio detail.`,
    hiddenN,
    totals: null,
    dependencies: [],
    dependenciesShown: 0,
    dependenciesCapped: 0,
    sharedRows: [],
    sharedRowsShown: 0,
    sharedRowsCapped: 0,
    coverageReasons: [],
    warnings,
    method: RC_METHOD,
  };
}

/**
 * The whole concentration reading. Pure: every figure is re-derived on each call
 * from the stored declarations, statements, cases, links and dependencies.
 */
export function buildRiskConcentration(state, { now = new Date(), seat = null } = {}) {
  const warnings = [];
  const at = now instanceof Date ? now : new Date(now);
  const asOf = dayKey(at) || L.dayMin;

  const statements = normalizeRiskAppetiteStatements(state?.riskAppetiteStatements, warnings);
  const declarations = normalizeRiskDeclarations(state?.riskDeclarations, warnings);
  const cases = new Map((Array.isArray(state?.cases) ? state.cases : [])
    .filter((row) => row && typeof row.id === 'string')
    .map((row) => [row.id, row]));
  const openCases = riskAppetiteOpenCases(state);
  const openIds = new Set(openCases.map((row) => row.id));
  const statementState = liveStatements(statements, asOf);
  const declarationState = liveDeclarations(declarations, asOf);

  /* -------------------------------------------------------- the population */
  // The same population the register measures: a live declaration on an open
  // risk case. A declaration naming a missing case, or a settled case, is
  // counted and printed, never summed in silently.
  const population = [];
  let missingCaseN = 0;
  let settledN = 0;
  for (const [caseId, declaration] of declarationState.live.entries()) {
    const operationalCase = cases.get(caseId) || null;
    if (!operationalCase) { missingCaseN += 1; continue; }
    if (!openIds.has(caseId)) { settledN += 1; continue; }
    population.push({
      ...declaration,
      caseTitle: operationalCase.title || caseId,
      ownerId: operationalCase.ownerId || null,
    });
  }
  population.sort((a, b) => cmpText(a.caseId, b.caseId));
  const undeclaredN = openCases.filter((row) => !declarationState.live.has(row.id)).length;

  const hiddenN = population.filter((row) => declarationGrant(seat, row) !== 'full').length;
  if (hiddenN > 0) return withheld({ asOf, seat, hiddenN, warnings });

  /* ------------------------------------------------------- the dependencies */
  const allDeps = Array.isArray(state?.dependencies)
    ? state.dependencies.filter((row) => row && typeof row.id === 'string')
    : [];
  const depsAll = new Map(allDeps.map((row) => [row.id, row]));
  const depsActive = new Map(allDeps.filter((row) => row.status !== 'retired').map((row) => [row.id, row]));
  let retiredUpstreamEdgesN = 0;
  for (const dep of depsActive.values()) {
    for (const upId of Array.isArray(dep.upstreamIds) ? dep.upstreamIds : []) {
      if (!depsActive.has(upId) && depsAll.has(upId)) retiredUpstreamEdgesN += 1;
    }
  }

  // Declared reliance: a depends-on link FROM a case TO a dependency. A link
  // whose target is not on the record is counted, never guessed at.
  const directByCase = new Map();
  let unresolvedLinkN = 0;
  for (const link of Array.isArray(state?.links) ? state.links : []) {
    if (!link || link.relation !== 'depends-on' || link.sourceType !== 'case' || link.targetType !== 'dependency') continue;
    if (!depsAll.has(link.targetId)) { unresolvedLinkN += 1; continue; }
    if (!directByCase.has(link.sourceId)) directByCase.set(link.sourceId, new Set());
    directByCase.get(link.sourceId).add(link.targetId);
  }

  /* --------------------------------------------------- domain/currency totals */
  // The denominator of every share: the whole declared population in that
  // domain and currency, including risks that name no dependency.
  const domainTotals = new Map();
  for (const row of population) {
    const key = `${row.domain}|${row.currency}`;
    const prior = domainTotals.get(key) || { cents: 0n, n: 0 };
    domainTotals.set(key, { cents: prior.cents + BigInt(row.retainedCents), n: prior.n + 1 });
  }

  /* ------------------------------------------------------------ the reading */
  let linkedN = 0;
  let unlinkedN = 0;
  let onlyRetiredN = 0;
  let truncatedN = 0;
  const byDependency = new Map();
  for (const row of population) {
    const direct = directByCase.get(row.caseId) || new Set();
    if (direct.size === 0) { unlinkedN += 1; continue; }
    const activeDirect = [...direct].filter((id) => depsActive.has(id));
    if (activeDirect.length === 0) { onlyRetiredN += 1; continue; }
    const { reach, truncated } = reachDependencies(activeDirect, depsActive, RC_MAX_HOPS);
    if (truncated) truncatedN += 1;
    linkedN += 1;
    const cellKey = `${row.domain}|${row.currency}`;
    for (const [depId, hop] of reach.entries()) {
      if (!byDependency.has(depId)) {
        const dep = depsActive.get(depId);
        byDependency.set(depId, {
          id: depId,
          name: dep.name || depId,
          kind: dep.kind || null,
          criticality: dep.criticality || null,
          members: new Set(),
          directN: 0,
          viaUpstreamN: 0,
          cells: new Map(),
        });
      }
      const agg = byDependency.get(depId);
      agg.members.add(row.id);
      if (hop === 0) agg.directN += 1; else agg.viaUpstreamN += 1;
      if (!agg.cells.has(cellKey)) {
        agg.cells.set(cellKey, { domain: row.domain, currency: row.currency, riskIds: [], titles: [], cents: 0n });
      }
      const cell = agg.cells.get(cellKey);
      cell.riskIds.push(row.id);
      cell.titles.push(row.caseTitle);
      cell.cents += BigInt(row.retainedCents);
    }
  }
  const partitionReconciles = linkedN + unlinkedN + onlyRetiredN === population.length;

  /* ------------------------------------------------ shared rows and verdicts */
  const sharedRows = [];
  const dependencyRows = [];
  for (const agg of byDependency.values()) {
    const membersN = agg.members.size;
    dependencyRows.push({
      id: agg.id,
      name: agg.name,
      kind: agg.kind,
      criticality: agg.criticality,
      membersN,
      directN: agg.directN,
      viaUpstreamN: agg.viaUpstreamN,
      shared: membersN >= 2,
    });
    for (const cell of agg.cells.values()) {
      if (cell.riskIds.length < 2) continue;
      const total = domainTotals.get(`${cell.domain}|${cell.currency}`).cents;
      const shareBp = total > 0n ? Number((cell.cents * RC_SHARE_SCALE) / total) : null;
      const statement = statementState.live.get(raStatementKey({
        domain: cell.domain, measure: 'retained-exposure', currency: cell.currency,
      })) || null;
      const toleranceCents = statement && Number.isSafeInteger(statement.toleranceCents)
        ? BigInt(statement.toleranceCents) : null;
      let verdict;
      if (toleranceCents === null) verdict = 'no-ceiling';
      else verdict = cell.cents > toleranceCents ? 'would-exceed' : 'within-ceiling';
      const withheldCents = cell.cents > RA_MAX_CENTS;
      sharedRows.push({
        rowId: `${agg.id}|${cell.domain}|${cell.currency}`,
        dependencyId: agg.id,
        dependencyName: agg.name,
        criticality: agg.criticality,
        domain: cell.domain,
        currency: cell.currency,
        riskN: cell.riskIds.length,
        riskIds: [...cell.riskIds].sort(cmpText),
        titles: [...cell.titles].sort(cmpText),
        domainPopulationN: domainTotals.get(`${cell.domain}|${cell.currency}`).n,
        retainedCents: withheldCents ? null : Number(cell.cents),
        withheldCents,
        domainTotalCents: total > RA_MAX_CENTS ? null : Number(total),
        shareBp,
        toleranceCents: statement && toleranceCents !== null && toleranceCents <= RA_MAX_CENTS ? Number(toleranceCents) : null,
        statementId: statement ? statement.id : null,
        verdict,
        overCeilingBy: verdict === 'would-exceed' && toleranceCents !== null && cell.cents - toleranceCents <= RA_MAX_CENTS
          ? Number(cell.cents - toleranceCents) : null,
      });
    }
  }
  sharedRows.sort((a, b) => (VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict])
    || (b.riskN - a.riskN)
    || cmpText(a.dependencyName, b.dependencyName)
    || cmpText(a.domain, b.domain)
    || cmpText(a.currency, b.currency));
  dependencyRows.sort((a, b) => (b.membersN - a.membersN) || cmpText(a.name, b.name) || cmpText(a.id, b.id));

  /* ----------------------------------------------------------- coverage */
  const declarationCoverage = undeclaredN === 0 && missingCaseN === 0;
  const dependencyCoverage = unlinkedN === 0 && onlyRetiredN === 0 && unresolvedLinkN === 0;
  const coverageReasons = [
    undeclaredN ? `${undeclaredN} open risk case(s) carry no live declaration, so any dependency they rely on is missing its exposure.` : '',
    missingCaseN ? `${missingCaseN} declaration(s) name a case this workspace does not hold; they are counted, not summed into a row.` : '',
    unlinkedN ? `${unlinkedN} declared risk(s) name no dependency. They are counted in the population but in no dependency row — their reliance is UNKNOWN, not independent.` : '',
    onlyRetiredN ? `${onlyRetiredN} declared risk(s) rely only on retired dependencies and are not read through them.` : '',
    unresolvedLinkN ? `${unresolvedLinkN} depends-on link(s) point at a dependency not on the record; they are counted, never guessed at.` : '',
    truncatedN ? `${truncatedN} declared risk(s) reach a dependency through a chain deeper than ${RC_MAX_HOPS} upstream hops; the deeper links are not read.` : '',
    retiredUpstreamEdgesN ? `${retiredUpstreamEdgesN} upstream edge(s) point at a retired dependency and are not traversed.` : '',
    partitionReconciles ? '' : 'The reading does not account for every declared risk exactly once. Nothing is printed as complete.',
  ].filter(Boolean);

  const sharedDependenciesN = dependencyRows.filter((row) => row.shared).length;
  const depCapped = Math.max(0, dependencyRows.length - RC_DEPENDENCY_ROW_CAP);
  const shCapped = Math.max(0, sharedRows.length - RC_SHARED_ROW_CAP);

  return {
    engineVersion: RC_ENGINE_VERSION,
    adr: RC_ADR,
    asOf,
    seat: seatSummary(seat),
    withheld: false,
    withheldReason: '',
    hiddenN: 0,
    totals: {
      openRiskCasesN: openCases.length,
      declaredRisksN: population.length,
      undeclaredN,
      missingCaseN,
      settledN,
      activeDependenciesN: depsActive.size,
      retiredDependenciesN: depsAll.size - depsActive.size,
      linkedN,
      unlinkedN,
      onlyRetiredN,
      truncatedN,
      unresolvedLinkN,
      retiredUpstreamEdgesN,
      partitionReconciles,
      wholePopulationMeasured: declarationCoverage && dependencyCoverage,
      declarationCoverage,
      dependencyCoverage,
      sharedDependenciesN,
      sharedRowsN: sharedRows.length,
      wouldExceedN: sharedRows.filter((row) => row.verdict === 'would-exceed').length,
      withinCeilingN: sharedRows.filter((row) => row.verdict === 'within-ceiling').length,
      noCeilingN: sharedRows.filter((row) => row.verdict === 'no-ceiling').length,
      overlapNote: 'Dependency rows overlap by design: a risk that relies on two dependencies, or on one through an upstream chain, is counted under each. Their figures do not add to the population total, and are not meant to.',
    },
    dependencies: dependencyRows.slice(0, RC_DEPENDENCY_ROW_CAP),
    dependenciesShown: Math.min(dependencyRows.length, RC_DEPENDENCY_ROW_CAP),
    dependenciesCapped: depCapped,
    sharedRows: sharedRows.slice(0, RC_SHARED_ROW_CAP),
    sharedRowsShown: Math.min(sharedRows.length, RC_SHARED_ROW_CAP),
    sharedRowsCapped: shCapped,
    coverageReasons,
    warnings,
    method: RC_METHOD,
  };
}
