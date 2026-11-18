/**
 * app/core/domain/prvProvision.js — the ONE reader of the Provision &
 * Reimbursement Register (ADR-0250, Schema v204, `#/provisions`).
 *
 * Every state, best estimate, provision, reimbursement asset, net exposure and
 * reconciliation verdict this module prints is derived here, on read, from stored
 * declarations, the claim register, the insurance register and the injected
 * clock. Nothing derived is stored anywhere, so the same workspace read twice
 * gives the same answer and a hand-edited file cannot carry a provision the
 * classification beside it does not support.
 *
 * THE ONE QUESTION THIS READER ANSWERS PER OPEN MATTER: *what must the
 * organisation carry on the balance sheet for this obligation, what may it
 * recognize as a reimbursement asset against it, and what is the net exposure?*
 * The answer is one of six states, and each is a DIFFERENT fact:
 *
 *   unassessed            the matter carries a gross exposure and no assessment;
 *                         the register refuses to print a zero as a decision.
 *   provided              a probable obligation with a reliable best estimate.
 *   provided-with-asset   a provision plus a reimbursement asset recognized
 *                         against it (cash received, or a declared judgment).
 *   provided-asset-capped a provision plus an asset capped at the provision; the
 *                         excess is printed and is not recognized.
 *   disclosed-only        possible, or probable but not reliably estimable: a
 *                         contingent liability that is disclosed, not provided.
 *   remote                slight: no provision and no disclosure.
 *
 * WHY THE PROVISION IS DERIVED AND NOT STORED. A provision is the product of a
 * classification (probable / possible / remote) and a best estimate (most likely,
 * or a probability-weighted expected value). Storing the product would let it
 * disagree with its own inputs; the reader recomputes it on every read.
 *
 * WHY THE REIMBURSEMENT ASSET IS CAPPED AND THE EXCESS PRINTED. IAS 37 recognizes
 * a reimbursement only up to the amount of the provision. A recovery larger than
 * the obligation is not an asset beyond the obligation; recognizing it would
 * invent value. The reader caps the asset at the provision and prints the excess
 * as a figure, never as an asset.
 *
 * WHY A MATTER WITH NO ASSESSMENT IS `unassessed` AND NEVER ZERO. A zero reads as
 * "we decided no provision is owed". An absent assessment reads as "nobody has
 * decided". The register refuses to collapse the two, and the rule files an ask.
 *
 * WHY THE RECONCILIATION GAP IS PRINTED. The computed provision is compared with
 * the figure the finance seat declares it is carrying. Where they differ, the
 * exact gap is printed and an ask is filed; the register never silently adopts
 * either number.
 *
 * MATRIX CORRECTNESS (ADR-0140/0141). An assessment names one to four responsible
 * hands. The reader resolves every ACTIVE line that holds each of them through the
 * ONE matrix engine, prints each hand's line position, counts a person ONCE, and
 * exposes the joint apex over every manager of every holder. Where a hand is off
 * the graph the row is printed as an orphan rather than dropped, because deleting
 * it would erase a live provision from the record.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import { buildClaims } from './lfgClaims.js';
import { buildInsurance } from './insCoverage.js';
import {
  PROV_CLASSIFICATION_BY_KEY,
  PROV_ESTIMATE_METHOD_BY_KEY,
  PROV_STATE_BY_KEY,
  PROV_STATE_KEYS,
} from './prvRegistry.js';
import {
  normalizePrvAssessments,
  normalizePrvCarryings,
  normalizePrvMarkers,
  normalizePrvReimbursements,
  normalizePrvScenarios,
  normalizePrvSettings,
} from './prvSchema.js';
import {
  capAssetMinor,
  expectedValueMinor,
  instantMs,
  reconciliation,
  sumMinor,
  utcDayMs,
} from './prvMath.js';

const list = (value) => (Array.isArray(value) ? value : []);

/** A readable label for a hand. The raw id `leader` never reaches a screen. */
export function prvPersonLabel(matrix, personId) {
  if (personId === LEADER_ID) return 'Workspace leader';
  const node = matrix?.nodes?.get(personId);
  if (node?.name) return node.name;
  const person = matrix?.roster?.get(personId);
  return person?.name || personId;
}

/**
 * Every ACTIVE line that holds a person, as `{ managerId, kind, shareH, lineId }`.
 * Read from the ONE matrix engine, so this register cannot drift from every other
 * roll-up in the workspace.
 */
export function prvActiveLinesFor(matrix, personId) {
  const lines = matrix?.linesByPerson?.get(personId) || [];
  return lines
    .filter((line) => line && line.active !== false && line.managerId && line.managerId !== personId)
    .map((line) => ({
      lineId: line.id || null,
      managerId: line.managerId,
      kind: line.kind || null,
      shareH: Number.isInteger(line.shareH) ? line.shareH : null,
    }))
    .sort((a, b) => String(a.managerId).localeCompare(String(b.managerId)));
}

/** The claim states that close a matter and therefore carry no open obligation. */
const CLOSED_CLAIM_STATES = Object.freeze(['resolved', 'merged', 'settled-beyond-authority']);

/**
 * THE PROVISION KERNEL. Pure over (assessment, scenarios, classification,
 * estimateMethod, nowMs), exported so the suite can pin every branch without a
 * store and so the rule and the screen cannot disagree about a state.
 */
export function derivePrvProvision({ assessment = null, scenarios = [] } = {}) {
  if (!assessment) {
    return {
      classification: null,
      classificationDefinition: null,
      estimateMethod: null,
      estimateMethodDefinition: null,
      bestEstimateMinor: null,
      bestEstimateReason: 'No assessment is on the record, so no classification and no best estimate can be derived.',
      estimateUnprovable: true,
      provisionMinor: 0,
      provisionRecognized: false,
      state: { key: 'unassessed', ...PROV_STATE_BY_KEY.unassessed },
    };
  }

  const classificationDefinition = PROV_CLASSIFICATION_BY_KEY[assessment.classification] || null;
  const estimateMethodDefinition = PROV_ESTIMATE_METHOD_BY_KEY[assessment.estimateMethod] || null;

  let bestEstimateMinor = null;
  let bestEstimateReason = null;
  if (assessment.estimateMethod === 'most-likely') {
    bestEstimateMinor = Number.isInteger(assessment.mostLikelyMinor) ? assessment.mostLikelyMinor : null;
    if (bestEstimateMinor === null) bestEstimateReason = 'A most-likely assessment carries no readable amount.';
  } else if (assessment.estimateMethod === 'expected-value') {
    const computed = expectedValueMinor(scenarios);
    bestEstimateMinor = computed.minor;
    bestEstimateReason = computed.reason;
  } else {
    bestEstimateReason = 'The assessment carries no estimate method this register can read.';
  }

  const estimateUnprovable = bestEstimateMinor === null;
  const provisionRecognized = assessment.classification === 'probable' && !estimateUnprovable;
  const provisionMinor = provisionRecognized ? bestEstimateMinor : 0;

  let state;
  if (assessment.classification === 'remote') state = { key: 'remote', ...PROV_STATE_BY_KEY.remote };
  else if (assessment.classification === 'possible') state = { key: 'disclosed-only', ...PROV_STATE_BY_KEY['disclosed-only'] };
  else if (estimateUnprovable) state = { key: 'disclosed-only', ...PROV_STATE_BY_KEY['disclosed-only'] };
  else state = { key: 'provided', ...PROV_STATE_BY_KEY.provided };

  return {
    classification: assessment.classification,
    classificationDefinition,
    estimateMethod: assessment.estimateMethod,
    estimateMethodDefinition,
    bestEstimateMinor,
    bestEstimateReason,
    estimateUnprovable,
    provisionMinor,
    provisionRecognized,
    state,
  };
}

/**
 * THE READER. Builds the whole register from stored declarations, the claim
 * register, the insurance register and the injected clock. Every count it prints
 * is recomputed here; nothing is cached.
 */
export function buildProvisions(state, { now = new Date(), settings = null, seat = null } = {}) {
  const warnings = [];
  const at = now instanceof Date ? now : new Date(now);
  const nowMs = at.getTime();
  const asOf = dayKey(at) || at.toISOString().slice(0, 10);
  const cfg = { ...(state?.settings || {}), ...(settings || {}) };
  const conventions = normalizePrvSettings(cfg);

  const assessments = normalizePrvAssessments(state?.prvAssessments, state?.lfgMatters || [], warnings);
  const scenarios = normalizePrvScenarios(state?.prvScenarios, assessments, warnings);
  const reimbursements = normalizePrvReimbursements(state?.prvReimbursements, assessments, warnings);
  const carryings = normalizePrvCarryings(state?.prvCarryings, warnings);
  const markers = normalizePrvMarkers(state?.prvMarkers, warnings);

  const assessmentsByMatter = new Map(assessments.map((row) => [row.matterId, row]));
  const reimbursementsByMatter = new Map(reimbursements.map((row) => [row.matterId, row]));
  const scenariosByMatter = new Map();
  for (const row of scenarios) {
    const held = scenariosByMatter.get(row.matterId) || [];
    held.push(row);
    scenariosByMatter.set(row.matterId, held);
  }

  // The gross exposure and the open-matter universe come from the claim register.
  let claimReport = null;
  let claimError = null;
  try {
    claimReport = buildClaims(state, { now: at, settings: cfg, seat: null });
  } catch (error) {
    claimError = `The claim register could not be read, so no gross exposure and no open-matter universe can be derived: ${error?.message || 'unknown error'}.`;
  }
  const claimRows = claimReport?.ok ? claimReport.rows || [] : [];

  // The cash received and the amount claimed come from the insurance register.
  let insuranceReport = null;
  let insuranceError = null;
  try {
    insuranceReport = buildInsurance(state, { now: at, settings: cfg, seat: null });
  } catch (error) {
    insuranceError = `The insurance register could not be read, so no reimbursement cash or claimed amount can be derived: ${error?.message || 'unknown error'}.`;
  }
  const insuranceByMatter = new Map();
  if (insuranceReport?.ok) {
    for (const row of insuranceReport.rows || []) {
      const matterId = row?.coverage?.matterId;
      if (!matterId) continue;
      const held = insuranceByMatter.get(matterId) || { cashReceivedMinor: 0, claimedMinor: 0, coveragesN: 0 };
      held.cashReceivedMinor += Number.isInteger(row.recoveredMinor) ? row.recoveredMinor : 0;
      held.claimedMinor += Number.isInteger(row.claimedMinor) ? row.claimedMinor : 0;
      held.coveragesN += 1;
      insuranceByMatter.set(matterId, held);
    }
  }

  let matrix = null;
  let matrixError = null;
  try {
    matrix = buildMatrix(state, { now: at, settings: { ...cfg, activeSeatId: null } });
  } catch (error) {
    matrixError = `The reporting graph could not be read, so no line can be resolved and no joint seat can be asked: ${error?.message || 'unknown error'}.`;
  }
  const matrixNodeIds = new Set([...(matrix?.nodes?.keys?.() || []), ...(matrix?.roster?.keys?.() || []), LEADER_ID]);

  /* ---------------------------------------------------------------------- rows */

  const rows = [];
  let closedMattersN = 0;
  let orphanHolderN = 0;
  for (const claimRow of claimRows) {
    const matter = claimRow?.matter;
    if (!matter?.id) continue;
    // A closed matter carries no open obligation and is not part of the provision
    // schedule. It is counted, never silently dropped. A RESOLUTION of any kind
    // closes the obligation — settled, withdrawn, dismissed, judgment or merged —
    // and the claim register's `settled-beyond-authority` is a settlement plus a
    // governance gap, not an open obligation.
    if (claimRow.resolution || CLOSED_CLAIM_STATES.includes(claimRow.state?.key)) { closedMattersN += 1; continue; }

    const assessment = assessmentsByMatter.get(matter.id) || null;
    const responsibleIds = assessment?.responsibleIds?.length
      ? assessment.responsibleIds
      : (matter.responsibleIds || []);

    const holderRows = responsibleIds.map((personId) => {
      const onGraph = matrixNodeIds.has(personId);
      const lines = onGraph ? prvActiveLinesFor(matrix, personId) : [];
      return {
        personId,
        name: onGraph ? prvPersonLabel(matrix, personId) : null,
        onGraph,
        lines: lines.map((line) => ({ ...line, name: prvPersonLabel(matrix, line.managerId) })),
      };
    });
    const orphanHolders = holderRows.filter((row) => !row.onGraph);
    orphanHolderN += orphanHolders.length;

    const managerIds = [...new Set(holderRows.flatMap((row) => row.lines.map((line) => line.managerId)))].sort();
    const apex = managerIds.length ? matrixJointApex(matrix, managerIds) : null;
    const apexIds = list(apex?.apexIds).filter(Boolean);
    const apexId = apexIds.length === 1 ? apexIds[0] : null;
    const apexName = apexId ? prvPersonLabel(matrix, apexId) : null;

    const mineScenarios = scenariosByMatter.get(matter.id) || [];
    const derived = derivePrvProvision({ assessment, scenarios: mineScenarios });

    const insurance = insuranceByMatter.get(matter.id) || { cashReceivedMinor: 0, claimedMinor: 0, coveragesN: 0 };
    const reimbursement = reimbursementsByMatter.get(matter.id) || null;

    // THE EXPECTED REIMBURSEMENT. Cash the insurer has paid is the certain amount.
    // A pending claim is not virtually certain unless a seat declares it so in
    // writing; then the amount the organisation claimed is the expectation.
    let expectedMinor = null;
    let expectedReason = null;
    if (insurance.cashReceivedMinor > 0) expectedMinor = insurance.cashReceivedMinor;
    else if (reimbursement?.virtuallyCertain === true && insurance.claimedMinor > 0) expectedMinor = insurance.claimedMinor;
    else if (reimbursement?.virtuallyCertain === true) expectedReason = 'Virtual certainty is declared, but the insurance register carries no claimed amount, so there is no expected reimbursement to recognize.';
    else expectedReason = 'The insurer has paid nothing and no virtual certainty is declared on a claimed amount.';

    const asset = capAssetMinor({
      expectedMinor,
      provisionMinor: derived.provisionRecognized ? derived.provisionMinor : 0,
    });

    // THE HEADLINE STATE. The provision verdict comes first; the asset modifies a
    // provided state. A capped asset outranks an uncapped one because the excess is
    // the fact a reader must see.
    let state = derived.state;
    if (derived.provisionRecognized && asset.assetMinor !== null && asset.assetMinor > 0) {
      if (asset.capped) state = { key: 'provided-asset-capped', ...PROV_STATE_BY_KEY['provided-asset-capped'] };
      else state = { key: 'provided-with-asset', ...PROV_STATE_BY_KEY['provided-with-asset'] };
    }

    rows.push({
      matter,
      claimRow,
      assessment,
      reimbursement,
      scenarios: mineScenarios,
      holderRows,
      orphan: holderRows.length > 0 && holderRows.every((row) => !row.onGraph),
      orphanHolders: orphanHolders.map((row) => row.personId),
      managerIds,
      managerRows: managerIds.map((managerId) => ({ managerId, name: prvPersonLabel(matrix, managerId) })),
      apex,
      apexIds,
      apexId,
      apexName,
      apexAmbiguous: Boolean(apex?.ambiguous) || apexIds.length > 1,
      grossMinor: Number.isInteger(claimRow.exposureMinor) ? claimRow.exposureMinor : null,
      currency: assessment?.currency || matter.currency || null,
      ...derived,
      cashReceivedMinor: insurance.cashReceivedMinor,
      claimedMinor: insurance.claimedMinor,
      coveragesN: insurance.coveragesN,
      expectedMinor,
      expectedReason,
      assetMinor: asset.assetMinor,
      assetCapped: asset.capped,
      assetExcessMinor: asset.excessMinor,
      assetWithoutCash: asset.assetMinor !== null && asset.assetMinor > 0 && insurance.cashReceivedMinor === 0,
      assetNotRecognized: asset.assetMinor === null,
      assetReason: asset.reason || expectedReason,
      netExposureMinor: asset.assetMinor === null ? derived.provisionMinor : Math.max(0, derived.provisionMinor - asset.assetMinor),
      state,
    });
  }
  rows.sort((a, b) => {
    const urgency = [PROV_STATE_KEYS.indexOf(a.state.key), PROV_STATE_KEYS.indexOf(b.state.key)];
    if (urgency[0] !== urgency[1]) return urgency[0] - urgency[1];
    const provisionDiff = (b.provisionMinor || 0) - (a.provisionMinor || 0);
    if (provisionDiff !== 0) return provisionDiff;
    return String(a.matter.matterRef).localeCompare(String(b.matter.matterRef));
  });

  /* -------------------------------------------------------------------- totals */

  const states = Object.fromEntries(PROV_STATE_KEYS.map((key) => [key, 0]));
  for (const row of rows) states[row.state.key] = (states[row.state.key] || 0) + 1;

  const byCurrency = new Map();
  for (const row of rows) {
    const currency = row.currency;
    if (!currency) continue;
    const entry = byCurrency.get(currency) || { currency, provisionMinor: 0, assetMinor: 0, netExposureMinor: 0, rowsN: 0 };
    entry.provisionMinor += Number.isInteger(row.provisionMinor) ? row.provisionMinor : 0;
    entry.assetMinor += Number.isInteger(row.assetMinor) ? row.assetMinor : 0;
    entry.netExposureMinor += Number.isInteger(row.netExposureMinor) ? row.netExposureMinor : 0;
    entry.rowsN += 1;
    byCurrency.set(currency, entry);
  }
  const carryingByCurrency = new Map(carryings.map((row) => [row.currency, row]));
  const currencyRows = [...byCurrency.values()].map((entry) => {
    const carrying = carryingByCurrency.get(entry.currency) || null;
    const recon = reconciliation({ provisionMinor: entry.provisionMinor, carriedMinor: carrying ? carrying.carriedMinor : null });
    return {
      ...entry,
      carriedMinor: carrying ? carrying.carriedMinor : null,
      carriedRef: carrying ? carrying.carriedRef : null,
      reconciled: recon.reconciled,
      gapMinor: recon.gapMinor,
      reconReason: recon.reason,
    };
  }).sort((a, b) => String(a.currency).localeCompare(String(b.currency)));

  const totals = {
    matters: rows.length,
    closedMatters: closedMattersN,
    assessments: assessments.length,
    provided: states.provided || 0,
    providedWithAsset: states['provided-with-asset'] || 0,
    providedAssetCapped: states['provided-asset-capped'] || 0,
    disclosedOnly: states['disclosed-only'] || 0,
    remote: states.remote || 0,
    unassessed: states.unassessed || 0,
    scenarios: scenarios.length,
    reimbursements: reimbursements.length,
    assetRecognized: rows.filter((row) => Number.isInteger(row.assetMinor) && row.assetMinor > 0).length,
    assetCapped: rows.filter((row) => row.assetCapped).length,
    assetWithoutCash: rows.filter((row) => row.assetWithoutCash).length,
    holders: new Set(rows.flatMap((row) => row.holderRows.map((holder) => holder.personId))).size,
    linesN: new Set(rows.flatMap((row) => row.managerIds)).size,
    currencies: [...byCurrency.keys()].sort(),
    byCurrency: currencyRows,
  };

  /* ------------------------------------------------------------- reconciliation */

  const assessmentMatterIds = new Set(assessments.map((row) => row.matterId));
  const balances = {
    // The FIRST claim: the printed state counts re-add to the open matters they
    // summarise.
    statesReconcile: Object.values(states).reduce((sum, value) => sum + value, 0) === rows.length,
    // The SECOND claim, held apart: every child row ties to an assessment on the
    // record.
    scenariosReconcile: scenarios.every((row) => assessmentMatterIds.has(row.matterId)),
    reimbursementsReconcile: reimbursements.every((row) => assessmentMatterIds.has(row.matterId)),
    oneAssessmentPerMatter: assessments.length === new Set(assessments.map((row) => row.matterId)).size,
    oneReimbursementPerMatter: reimbursements.length === new Set(reimbursements.map((row) => row.matterId)).size,
    oneCarryingPerCurrency: carryings.length === new Set(carryings.map((row) => row.currency)).size,
  };

  const incompleteReasons = [];
  if (warnings.length) incompleteReasons.push(`${warnings.length} stored row(s) were unreadable and were refused with a count; no figure was repaired.`);
  if (orphanHolderN) incompleteReasons.push(`${orphanHolderN} responsible hand(s) are not on the reporting graph; their line position cannot be resolved and the joint seat above them cannot be asked.`);
  if (matrixError) incompleteReasons.push(matrixError);
  if (claimError) incompleteReasons.push(claimError);
  if (insuranceError) incompleteReasons.push(insuranceError);
  if (!balances.statesReconcile) incompleteReasons.push('The printed state counts do not re-add to the open matters they summarise.');
  if (!balances.scenariosReconcile || !balances.reimbursementsReconcile) {
    incompleteReasons.push('A child row does not tie to an assessment on the record.');
  }
  if (!balances.oneAssessmentPerMatter) incompleteReasons.push('A matter carries more than one assessment.');
  if (!balances.oneReimbursementPerMatter) incompleteReasons.push('A matter carries more than one reimbursement recognition.');
  if (!balances.oneCarryingPerCurrency) incompleteReasons.push('A currency carries more than one finance carrying.');
  const undeclaredCurrencies = currencyRows.filter((row) => row.carriedMinor === null);
  if (undeclaredCurrencies.length) {
    incompleteReasons.push(`${undeclaredCurrencies.length} currency(ies) carry a computed provision with no declared finance carrying (${undeclaredCurrencies.map((row) => row.currency).join(', ')}), so no reconciliation is printed for them.`);
  }

  /* ----------------------------------------------------------------- line roll-up */

  const byLine = new Map();
  for (const row of rows) {
    for (const managerId of row.managerIds) {
      const entry = byLine.get(managerId) || {
        managerId,
        managerName: prvPersonLabel(matrix, managerId),
        mattersN: 0,
        unassessedN: 0,
        providedN: 0,
        disclosedN: 0,
        provisionMinor: 0,
        assetMinor: 0,
        holders: new Set(),
        matterIds: new Set(),
      };
      if (!entry.matterIds.has(row.matter.id)) {
        entry.matterIds.add(row.matter.id);
        entry.mattersN += 1;
        if (row.state.key === 'unassessed') entry.unassessedN += 1;
        if (row.state.key === 'provided' || row.state.key === 'provided-with-asset' || row.state.key === 'provided-asset-capped') entry.providedN += 1;
        if (row.state.key === 'disclosed-only') entry.disclosedN += 1;
        entry.provisionMinor += Number.isInteger(row.provisionMinor) ? row.provisionMinor : 0;
        entry.assetMinor += Number.isInteger(row.assetMinor) ? row.assetMinor : 0;
      }
      for (const holder of row.holderRows) {
        if (holder.lines.some((line) => line.managerId === managerId)) entry.holders.add(holder.personId);
      }
      byLine.set(managerId, entry);
    }
  }
  const lineRows = [...byLine.values()]
    .map((entry) => ({ ...entry, holdersN: entry.holders.size, holders: [...entry.holders].sort() }))
    .sort((a, b) => String(a.managerName).localeCompare(String(b.managerName)) || String(a.managerId).localeCompare(String(b.managerId)));

  /* ------------------------------------------------------------------ disclosure */

  const detailed = !seat || seat.fullAccess || (Number.isInteger(seat.rank) ? seat.rank <= 3 : true);
  const disclosure = detailed
    ? { level: 'detail', reason: null, rank: seat?.rank ?? null }
    : {
      level: 'aggregate',
      reason: 'Responsible hands are withheld above rank 3; the provision, the reimbursement asset and the reconciliation are organisational facts and stay printed. Which named individual is answerable for a particular provision is individual material, not executive reading.',
      rank: seat?.rank ?? null,
    };

  const unreconciledN = currencyRows.filter((row) => row.reconciled === false).length;
  const attention = {
    unassessedN: states.unassessed || 0,
    disclosedOnlyN: states['disclosed-only'] || 0,
    assetCappedN: states['provided-asset-capped'] || 0,
    unreconciledN,
    total: (states.unassessed || 0) + (states['disclosed-only'] || 0) + (states['provided-asset-capped'] || 0) + unreconciledN,
  };

  return {
    ok: true,
    engineVersion: 'provision-reimbursement-2026.11-v1',
    matrix,
    asOf,
    nowIso: at.toISOString(),
    conventions,
    assessments,
    scenarios,
    reimbursements,
    carryings,
    markers,
    assessmentsByMatter,
    rows,
    detailed: Boolean(detailed),
    disclosure,
    warnings,
    matrixError,
    claimError,
    insuranceError,
    orphanHolderN,
    states,
    stateTotal: Object.values(states).reduce((sum, value) => sum + value, 0),
    balances,
    figuresComplete: incompleteReasons.length === 0,
    incompleteReasons,
    totals,
    lineRows,
    currencyRows,
    stateRows: PROV_STATE_KEYS.map((key) => ({ key, label: PROV_STATE_BY_KEY[key].label, count: states[key] || 0 })),
    attention,
    seat: seat
      ? { rank: seat.rank ?? null, fullAccess: Boolean(seat.fullAccess), label: seat.label || '' }
      : { rank: null, fullAccess: true, label: 'whole register (no seat)' },
  };
}

/**
 * The navigation badge count. Counts DECISION-SHAPED duty — an unassessed matter,
 * a contingent liability disclosed but not provided, a capped reimbursement asset
 * and an unreconciled currency — and never every matter on the register, so the
 * badge reads as "work owed now" rather than "how many matters we have".
 */
export function provisionAttentionCount(state, { now = new Date(), settings = null, seat = null } = {}) {
  try {
    const report = buildProvisions(state, { now, settings, seat });
    if (!report?.ok) return 0;
    return report.attention.total;
  } catch {
    return 0;
  }
}

/**
 * Insights signals. Five facts worth a leader's attention, each with the printed
 * evidence and a route — and none of them a score on a person or a line.
 */
export function provisionSignals(state, now = new Date(), settings = null) {
  let report;
  try {
    report = buildProvisions(state, { now, settings, seat: null });
  } catch {
    return [];
  }
  if (!report?.ok) return [];
  const signals = [];
  const add = (signal) => signals.push({ domain: 'Provisions & reimbursement', route: '#/provisions', ...signal });
  const t = report.totals;

  if (t.unassessed) {
    add({
      ruleId: 'PRV-01',
      severity: 5,
      confidence: 'high',
      title: `${t.unassessed} open matter(s) carry a gross exposure and no provision assessment`,
      detail: 'The register cannot say whether a provision is owed, and it refuses to print a zero as though a zero were a decision. A classification and a best estimate are owed on each.',
      action: { label: 'Open the provision register', route: '#/provisions' },
      evidence: [`${t.matters} open matter(s) on the schedule`, `${t.assessments} assessment(s) on the record`],
    });
  }

  if (t.disclosedOnly) {
    add({
      ruleId: 'PRV-02',
      severity: 4,
      confidence: 'high',
      title: `${t.disclosedOnly} matter(s) are contingent liabilities that are disclosed, not provided`,
      detail: 'The obligation is possible, or probable but not reliably estimable. IAS 37 forbids a provision without a reliable estimate; these are disclosed, and the register prints them apart from the provided matters.',
      action: { label: 'Open the provision register', route: '#/provisions?view=provisions' },
      evidence: [`${t.provided} provided matter(s)`, `${t.remote} remote matter(s)`],
    });
  }

  if (t.providedAssetCapped) {
    add({
      ruleId: 'PRV-03',
      severity: 4,
      confidence: 'high',
      title: `${t.providedAssetCapped} reimbursement asset(s) are capped at the provision`,
      detail: 'The amount expected exceeds the provision, so the asset is recognized only up to the provision and the excess is printed. Recognizing the excess would invent value the obligation does not support.',
      action: { label: 'Open the reimbursement assets', route: '#/provisions?view=reimbursements' },
      evidence: [`${t.assetCapped} capped asset(s) in total`],
    });
  }

  if (t.assetWithoutCash) {
    add({
      ruleId: 'PRV-04',
      severity: 3,
      confidence: 'high',
      title: `${t.assetWithoutCash} reimbursement asset(s) rest on a declared judgment with no cash received`,
      detail: 'Virtual certainty is declared in writing on a claimed amount, but the insurer has not paid. The asset is recognized at the claimed amount capped at the provision, and the register says plainly that no cash supports it yet.',
      action: { label: 'Open the reimbursement assets', route: '#/provisions?view=reimbursements' },
      evidence: [`${t.assetRecognized} asset(s) recognized in total`],
    });
  }

  const unreconciled = report.currencyRows.filter((row) => row.reconciled === false);
  if (unreconciled.length) {
    add({
      ruleId: 'PRV-05',
      severity: 5,
      confidence: 'high',
      title: `${unreconciled.length} currency(ies) carry a provision figure that disagrees with the computed provision`,
      detail: `The exact gap is printed per currency (${unreconciled.map((row) => `${row.currency} ${row.gapMinor} minor units`).join('; ')}). The register never silently adopts either number.`,
      action: { label: 'Open the reconciliation', route: '#/provisions?view=reconciliation' },
      evidence: [`${report.currencyRows.length} currency(ies) on the schedule`],
    });
  }

  return signals;
}
