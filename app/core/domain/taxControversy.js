/**
 * app/core/domain/taxControversy.js — the ONE reader of the Tax Controversy &
 * Appeal-Control Register (ADR-0257, Schema v209, `#/tax`).
 *
 * Every state, timeliness verdict, days-remaining figure, swing and attention
 * count this module prints is derived here, on read, from stored declarations
 * and the injected clock. Nothing derived is stored anywhere, so the same
 * workspace read twice gives the same answer and a hand-edited file cannot
 * carry a state the notice, the deadline and the filings beside it do not
 * support.
 *
 * THE ONE QUESTION THIS READER ANSWERS PER NOTICE: *is the objection window
 * protected, was the challenge actually filed inside it, is the evidence behind
 * it on the record, and what did the controversy finally move?* The answer is
 * one of six states, and each is a DIFFERENT fact:
 *
 *   deadline-undeclared  the notice is on the record and no deadline is
 *                        declared. The register holds no jurisdiction calendar
 *                        and will not invent one.
 *   awaiting-filing      a deadline is declared and has not passed, and no
 *                        filing is on the record yet.
 *   overdue-unfiled      the declared deadline has passed and no filing is on
 *                        the record. The assessment is becoming final by
 *                        default.
 *   filed-on-time        the first filing was made on or before the declared
 *                        deadline.
 *   filed-late           the first filing was made after the declared deadline.
 *   resolved             a resolution is on the record with a closed-vocabulary
 *                        outcome and the amount finally payable.
 *
 * WHY THE STATE IS DERIVED AND NOT STORED. A state is the product of a notice,
 * a deadline, the filings and a resolution. Storing the product would let it
 * disagree with its own inputs; the reader recomputes it on every read.
 *
 * WHY TIMELINESS IS A COMPARISON OF TWO DECLARED DAYS. The deadline day and
 * the first filing day are both declared facts. The reader compares them and
 * prints the verdict; it never takes a seat's word for either, and it never
 * re-dates a late filing to make it on time.
 *
 * WHY THE SWING IS PRINTED APART. What was disputed and what was finally
 * payable are two figures. The difference is derived and printed beside both,
 * never folded into either, and never substituted for the disputed amount.
 *
 * WHY A NOTICE WITH NO DEADLINE IS `deadline-undeclared` AND NEVER "NO
 * DEADLINE". The absence of a deadline is the most dangerous state in the
 * register. The register refuses to collapse "nobody has declared the window"
 * into "there is no window", and the rule files an ask.
 *
 * MATRIX CORRECTNESS (ADR-0140/0141). A notice names one to four responsible
 * hands. The reader resolves every ACTIVE line that holds each of them through
 * the ONE matrix engine, prints each hand's line position, counts a person
 * ONCE, and exposes the joint apex over every manager of every holder. Where a
 * hand is off the graph the row is printed as an orphan rather than dropped,
 * because deleting it would erase a live controversy from the record.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import {
  TAX_STATE_BY_KEY,
  TAX_STATE_KEYS,
  TAX_TYPE_BY_KEY,
} from './taxRegistry.js';
import {
  normalizeTaxDeadlines,
  normalizeTaxEvidence,
  normalizeTaxFilings,
  normalizeTaxMarkers,
  normalizeTaxNotices,
  normalizeTaxResolutions,
  normalizeTaxSettings,
} from './taxSchema.js';
import {
  swingMinor,
  wholeDaysBetween,
} from './taxMath.js';

const list = (value) => (Array.isArray(value) ? value : []);

/** A readable label for a hand. The raw id `leader` never reaches a screen. */
export function taxPersonLabel(matrix, personId) {
  if (personId === LEADER_ID) return 'Workspace leader';
  const node = matrix?.nodes?.get(personId);
  if (node?.name) return node.name;
  const person = matrix?.roster?.get(personId);
  return person?.name || personId;
}

/**
 * Every ACTIVE line that holds a person, as `{ managerId, kind, shareH, lineId }`.
 * Read from the ONE matrix engine, so this register cannot drift from every
 * other roll-up in the workspace.
 */
export function taxActiveLinesFor(matrix, personId) {
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

/**
 * THE CONTROVERSY KERNEL. Pure over (notice, deadline, filings, resolution,
 * todayDay, horizonDays), exported so the suite can pin every branch without a
 * store and so the rule and the screen cannot disagree about a state.
 */
export function deriveTaxControversy({ notice = null, deadline = null, filings = [], evidence = [], resolution = null, todayDay = null, horizonDays = 365 } = {}) {
  const todayMs = todayDay ? Date.parse(`${todayDay}T00:00:00.000Z`) : null;
  const sortedFilings = [...list(filings)].sort((a, b) => String(a.filedDay).localeCompare(String(b.filedDay)) || String(a.id).localeCompare(String(b.id)));
  const firstFiling = sortedFilings[0] || null;

  let state;
  let daysToDeadline = null;
  let daysOverdue = null;
  let timeliness = null;
  let timelinessReason = null;

  if (resolution) {
    state = { key: 'resolved', ...TAX_STATE_BY_KEY.resolved };
  } else if (!deadline) {
    state = { key: 'deadline-undeclared', ...TAX_STATE_BY_KEY['deadline-undeclared'] };
  } else if (!firstFiling) {
    const remaining = wholeDaysBetween(todayDay, deadline.deadlineDay);
    daysToDeadline = remaining;
    if (remaining !== null && remaining < 0) {
      state = { key: 'overdue-unfiled', ...TAX_STATE_BY_KEY['overdue-unfiled'] };
      daysOverdue = -remaining;
    } else {
      state = { key: 'awaiting-filing', ...TAX_STATE_BY_KEY['awaiting-filing'] };
    }
  } else {
    const delta = wholeDaysBetween(deadline.deadlineDay, firstFiling.filedDay);
    if (delta === null) {
      timelinessReason = 'The deadline day or the first filing day is unreadable, so no timeliness verdict can be derived.';
      state = { key: 'filed-on-time', ...TAX_STATE_BY_KEY['filed-on-time'] };
    } else if (delta <= 0) {
      timeliness = 'on-time';
      state = { key: 'filed-on-time', ...TAX_STATE_BY_KEY['filed-on-time'] };
    } else {
      timeliness = 'late';
      daysOverdue = delta;
      state = { key: 'filed-late', ...TAX_STATE_BY_KEY['filed-late'] };
    }
  }

  const swing = resolution
    ? swingMinor({ disputedMinor: notice?.disputedMinor, resolvedMinor: resolution.resolvedMinor })
    : { swingMinor: null, reason: null };

  const filedDaysAgo = firstFiling && todayDay ? wholeDaysBetween(firstFiling.filedDay, todayDay) : null;
  const agingUnresolved = Boolean(firstFiling && !resolution && filedDaysAgo !== null && Number.isInteger(horizonDays) && filedDaysAgo > horizonDays);

  return {
    state,
    deadline,
    filings: sortedFilings,
    firstFiling,
    evidence: [...list(evidence)].sort((a, b) => String(a.suppliedDay).localeCompare(String(b.suppliedDay)) || String(a.id).localeCompare(String(b.id))),
    resolution,
    daysToDeadline,
    daysOverdue,
    timeliness,
    timelinessReason,
    swingMinor: swing.swingMinor,
    swingReason: swing.reason,
    filedDaysAgo,
    agingUnresolved,
    evidenceEmpty: Boolean(firstFiling && !list(evidence).length),
  };
}

/**
 * THE READER. Builds the whole register from stored declarations and the
 * injected clock. Every count it prints is recomputed here; nothing is cached.
 */
export function buildTaxControversy(state, { now = new Date(), settings = null, seat = null } = {}) {
  const warnings = [];
  const at = now instanceof Date ? now : new Date(now);
  const asOf = dayKey(at) || at.toISOString().slice(0, 10);
  const cfg = { ...(state?.settings || {}), ...(settings || {}) };
  const conventions = normalizeTaxSettings(cfg);

  const notices = normalizeTaxNotices(state?.taxNotices, warnings);
  const deadlines = normalizeTaxDeadlines(state?.taxDeadlines, notices, warnings);
  const filings = normalizeTaxFilings(state?.taxFilings, notices, warnings);
  const evidence = normalizeTaxEvidence(state?.taxEvidence, notices, warnings);
  const resolutions = normalizeTaxResolutions(state?.taxResolutions, notices, warnings);
  const markers = normalizeTaxMarkers(state?.taxMarkers, warnings);

  const deadlineByNotice = new Map(deadlines.map((row) => [row.noticeId, row]));
  const resolutionByNotice = new Map(resolutions.map((row) => [row.noticeId, row]));
  const filingsByNotice = new Map();
  for (const row of filings) {
    const held = filingsByNotice.get(row.noticeId) || [];
    held.push(row);
    filingsByNotice.set(row.noticeId, held);
  }
  const evidenceByNotice = new Map();
  for (const row of evidence) {
    const held = evidenceByNotice.get(row.noticeId) || [];
    held.push(row);
    evidenceByNotice.set(row.noticeId, held);
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
  let orphanHolderN = 0;
  for (const notice of notices) {
    const responsibleIds = notice.responsibleIds || [];

    const holderRows = responsibleIds.map((personId) => {
      const onGraph = matrixNodeIds.has(personId);
      const lines = onGraph ? taxActiveLinesFor(matrix, personId) : [];
      return {
        personId,
        name: onGraph ? taxPersonLabel(matrix, personId) : null,
        onGraph,
        lines: lines.map((line) => ({ ...line, name: taxPersonLabel(matrix, line.managerId) })),
      };
    });
    const orphanHolders = holderRows.filter((row) => !row.onGraph);
    orphanHolderN += orphanHolders.length;

    const managerIds = [...new Set(holderRows.flatMap((row) => row.lines.map((line) => line.managerId)))].sort();
    const apex = managerIds.length ? matrixJointApex(matrix, managerIds) : null;
    const apexIds = list(apex?.apexIds).filter(Boolean);
    const apexId = apexIds.length === 1 ? apexIds[0] : null;
    const apexName = apexId ? taxPersonLabel(matrix, apexId) : null;

    const derived = deriveTaxControversy({
      notice,
      deadline: deadlineByNotice.get(notice.id) || null,
      filings: filingsByNotice.get(notice.id) || [],
      evidence: evidenceByNotice.get(notice.id) || [],
      resolution: resolutionByNotice.get(notice.id) || null,
      todayDay: asOf,
      horizonDays: conventions.taxResolutionHorizonDays,
    });

    rows.push({
      notice,
      typeDefinition: TAX_TYPE_BY_KEY[notice.taxType] || null,
      holderRows,
      orphan: holderRows.length > 0 && holderRows.every((row) => !row.onGraph),
      orphanHolders: orphanHolders.map((row) => row.personId),
      managerIds,
      managerRows: managerIds.map((managerId) => ({ managerId, name: taxPersonLabel(matrix, managerId) })),
      apex,
      apexIds,
      apexId,
      apexName,
      apexAmbiguous: Boolean(apex?.ambiguous) || apexIds.length > 1,
      currency: notice.currency,
      disputedMinor: notice.disputedMinor,
      resolvedMinor: derived.resolution ? derived.resolution.resolvedMinor : null,
      ...derived,
    });
  }
  rows.sort((a, b) => {
    const urgency = [TAX_STATE_KEYS.indexOf(a.state.key), TAX_STATE_KEYS.indexOf(b.state.key)];
    if (urgency[0] !== urgency[1]) return urgency[0] - urgency[1];
    const disputedDiff = (b.disputedMinor || 0) - (a.disputedMinor || 0);
    if (disputedDiff !== 0) return disputedDiff;
    return String(a.notice.noticeRef).localeCompare(String(b.notice.noticeRef));
  });

  /* -------------------------------------------------------------------- totals */

  const states = Object.fromEntries(TAX_STATE_KEYS.map((key) => [key, 0]));
  for (const row of rows) states[row.state.key] = (states[row.state.key] || 0) + 1;

  const byCurrency = new Map();
  for (const row of rows) {
    const currency = row.currency;
    if (!currency) continue;
    const entry = byCurrency.get(currency) || { currency, disputedMinor: 0, resolvedMinor: 0, swingMinor: 0, rowsN: 0, resolvedN: 0 };
    entry.disputedMinor += Number.isInteger(row.disputedMinor) ? row.disputedMinor : 0;
    if (Number.isInteger(row.resolvedMinor)) {
      entry.resolvedMinor += row.resolvedMinor;
      entry.resolvedN += 1;
      entry.swingMinor += Number.isInteger(row.swingMinor) ? row.swingMinor : 0;
    }
    entry.rowsN += 1;
    byCurrency.set(currency, entry);
  }
  const currencyRows = [...byCurrency.values()].sort((a, b) => String(a.currency).localeCompare(String(b.currency)));

  const totals = {
    notices: rows.length,
    deadlineUndeclared: states['deadline-undeclared'] || 0,
    overdueUnfiled: states['overdue-unfiled'] || 0,
    filedLate: states['filed-late'] || 0,
    awaitingFiling: states['awaiting-filing'] || 0,
    filedOnTime: states['filed-on-time'] || 0,
    resolved: states.resolved || 0,
    filings: filings.length,
    evidence: evidence.length,
    evidenceEmpty: rows.filter((row) => row.evidenceEmpty).length,
    agingUnresolved: rows.filter((row) => row.agingUnresolved).length,
    holders: new Set(rows.flatMap((row) => row.holderRows.map((holder) => holder.personId))).size,
    linesN: new Set(rows.flatMap((row) => row.managerIds)).size,
    currencies: [...byCurrency.keys()].sort(),
    byCurrency: currencyRows,
  };

  /* ------------------------------------------------------------- reconciliation */

  const noticeIds = new Set(notices.map((row) => row.id));
  const balances = {
    // The FIRST claim: the printed state counts re-add to the notices they
    // summarise.
    statesReconcile: Object.values(states).reduce((sum, value) => sum + value, 0) === rows.length,
    // The SECOND claim, held apart: every child row ties to a notice on the
    // record.
    filingsReconcile: filings.every((row) => noticeIds.has(row.noticeId)),
    evidenceReconcile: evidence.every((row) => noticeIds.has(row.noticeId)),
    deadlinesReconcile: deadlines.every((row) => noticeIds.has(row.noticeId)),
    resolutionsReconcile: resolutions.every((row) => noticeIds.has(row.noticeId)),
    oneDeadlinePerNotice: deadlines.length === new Set(deadlines.map((row) => row.noticeId)).size,
    oneResolutionPerNotice: resolutions.length === new Set(resolutions.map((row) => row.noticeId)).size,
    oneNoticePerRef: notices.length === new Set(notices.map((row) => row.noticeRef)).size,
  };

  const incompleteReasons = [];
  if (warnings.length) incompleteReasons.push(`${warnings.length} stored row(s) were unreadable and were refused with a count; no figure was repaired.`);
  if (orphanHolderN) incompleteReasons.push(`${orphanHolderN} responsible hand(s) are not on the reporting graph; their line position cannot be resolved and the joint seat above them cannot be asked.`);
  if (matrixError) incompleteReasons.push(matrixError);
  if (!balances.statesReconcile) incompleteReasons.push('The printed state counts do not re-add to the notices they summarise.');
  if (!balances.filingsReconcile || !balances.evidenceReconcile || !balances.deadlinesReconcile || !balances.resolutionsReconcile) {
    incompleteReasons.push('A child row does not tie to a notice on the record.');
  }
  if (!balances.oneDeadlinePerNotice) incompleteReasons.push('A notice carries more than one deadline.');
  if (!balances.oneResolutionPerNotice) incompleteReasons.push('A notice carries more than one resolution.');
  if (!balances.oneNoticePerRef) incompleteReasons.push('An authority reference carries more than one notice.');

  /* ----------------------------------------------------------------- line roll-up */

  const byLine = new Map();
  for (const row of rows) {
    for (const managerId of row.managerIds) {
      const entry = byLine.get(managerId) || {
        managerId,
        managerName: taxPersonLabel(matrix, managerId),
        noticesN: 0,
        undeclaredN: 0,
        overdueN: 0,
        filedN: 0,
        resolvedN: 0,
        disputedMinor: 0,
        holders: new Set(),
        noticeIds: new Set(),
      };
      if (!entry.noticeIds.has(row.notice.id)) {
        entry.noticeIds.add(row.notice.id);
        entry.noticesN += 1;
        if (row.state.key === 'deadline-undeclared') entry.undeclaredN += 1;
        if (row.state.key === 'overdue-unfiled') entry.overdueN += 1;
        if (row.state.key === 'filed-on-time' || row.state.key === 'filed-late') entry.filedN += 1;
        if (row.state.key === 'resolved') entry.resolvedN += 1;
        entry.disputedMinor += Number.isInteger(row.disputedMinor) ? row.disputedMinor : 0;
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
      reason: 'Responsible hands are withheld above rank 3; the disputed amounts, the deadlines and the resolutions are organisational facts and stay printed. Which named individual is answerable for a particular controversy is individual material, not executive reading.',
      rank: seat?.rank ?? null,
    };

  const attention = {
    deadlineUndeclaredN: states['deadline-undeclared'] || 0,
    overdueUnfiledN: states['overdue-unfiled'] || 0,
    filedLateN: states['filed-late'] || 0,
    evidenceEmptyN: totals.evidenceEmpty,
    agingUnresolvedN: totals.agingUnresolved,
    total: (states['deadline-undeclared'] || 0) + (states['overdue-unfiled'] || 0) + (states['filed-late'] || 0) + totals.evidenceEmpty + totals.agingUnresolved,
  };

  return {
    ok: true,
    engineVersion: 'tax-controversy-2026.11-v1',
    matrix,
    asOf,
    nowIso: at.toISOString(),
    conventions,
    notices,
    deadlines,
    filings,
    evidence,
    resolutions,
    markers,
    deadlineByNotice,
    resolutionByNotice,
    rows,
    detailed: Boolean(detailed),
    disclosure,
    warnings,
    matrixError,
    orphanHolderN,
    states,
    stateTotal: Object.values(states).reduce((sum, value) => sum + value, 0),
    balances,
    figuresComplete: incompleteReasons.length === 0,
    incompleteReasons,
    totals,
    lineRows,
    currencyRows,
    stateRows: TAX_STATE_KEYS.map((key) => ({ key, label: TAX_STATE_BY_KEY[key].label, count: states[key] || 0 })),
    attention,
    seat: seat
      ? { rank: seat.rank ?? null, fullAccess: Boolean(seat.fullAccess), label: seat.label || '' }
      : { rank: null, fullAccess: true, label: 'whole register (no seat)' },
  };
}

/**
 * The navigation badge count. Counts DECISION-SHAPED duty — a notice with no
 * declared deadline, an overdue-unfiled notice, a late filing, a filed
 * objection with no evidence packet and a filed-but-unresolved controversy past
 * its declared horizon — and never every notice on the register, so the badge
 * reads as "work owed now" rather than "how many disputes we have".
 */
export function taxAttentionCount(state, { now = new Date(), settings = null, seat = null } = {}) {
  try {
    const report = buildTaxControversy(state, { now, settings, seat });
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
export function taxSignals(state, now = new Date(), settings = null) {
  let report;
  try {
    report = buildTaxControversy(state, { now, settings, seat: null });
  } catch {
    return [];
  }
  if (!report?.ok) return [];
  const signals = [];
  const add = (signal) => signals.push({ domain: 'Tax controversy', route: '#/tax', ...signal });
  const t = report.totals;

  if (t.deadlineUndeclared) {
    add({
      ruleId: 'TAX-01',
      severity: 5,
      confidence: 'high',
      title: `${t.deadlineUndeclared} authority notice(s) carry no declared objection deadline`,
      detail: 'The register holds no jurisdiction calendar and will not invent one. The clock that protects these positions is not on the record, and a written jurisdictional basis is owed on each.',
      action: { label: 'Open the tax controversy register', route: '#/tax' },
      evidence: [`${t.notices} notice(s) on the register`, `${report.deadlines.length} deadline(s) declared`],
    });
  }

  if (t.overdueUnfiled) {
    add({
      ruleId: 'TAX-02',
      severity: 5,
      confidence: 'high',
      title: `${t.overdueUnfiled} notice(s) are past their declared deadline with no filing on the record`,
      detail: 'The assessment is becoming final by default. A filing, or a recorded resolution conceding the assessment, is owed on each.',
      action: { label: 'Open the tax controversy register', route: '#/tax' },
      evidence: [`${t.filings} filing(s) on the record`],
    });
  }

  if (t.filedLate) {
    add({
      ruleId: 'TAX-03',
      severity: 4,
      confidence: 'high',
      title: `${t.filedLate} notice(s) were filed after their declared deadline`,
      detail: 'The register records the lateness plainly rather than refusing the filing or re-dating it. The consequence is for the seat to record.',
      action: { label: 'Open the filings', route: '#/tax?view=filings' },
      evidence: [`${t.filedOnTime} on-time filing(s)`],
    });
  }

  if (t.evidenceEmpty) {
    add({
      ruleId: 'TAX-04',
      severity: 4,
      confidence: 'high',
      title: `${t.evidenceEmpty} filed notice(s) carry no evidence packet`,
      detail: 'A filing without a packet is a claim the record cannot yet support. The evidence behind each disputed position is owed.',
      action: { label: 'Open the evidence packets', route: '#/tax?view=evidence' },
      evidence: [`${t.evidence} evidence item(s) on the record`],
    });
  }

  if (t.agingUnresolved) {
    add({
      ruleId: 'TAX-05',
      severity: 3,
      confidence: 'high',
      title: `${t.agingUnresolved} filed notice(s) remain unresolved past the declared horizon`,
      detail: `A status review is owed on each: the authority's position, the next procedural step, or the resolution. The horizon is a declared convention (${report.conventions.taxResolutionHorizonDays} days), never a jurisdiction calendar.`,
      action: { label: 'Open the resolutions', route: '#/tax?view=resolutions' },
      evidence: [`${t.resolved} resolution(s) on the record`],
    });
  }

  return signals;
}
