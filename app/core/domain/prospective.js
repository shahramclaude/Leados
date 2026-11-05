/**
 * app/core/domain/prospective.js — the Prospective Intervention Contract engine
 * (ADR-0094, Schema v97).
 *
 * Pure read/write-model code. Nothing here touches DOM, storage or the network.
 * The engine freezes a cohort before the intervention, resolves the outcome
 * from records other modules already own, scores it with the Brier proper
 * scoring rule, and builds five altitude-specific read models from ONE ledger.
 *
 * The subject of every figure is a CONTRACT, a COHORT or a CELL. No person is
 * rated, ranked or named in a published row, a brief or a CSV cell.
 */
import { addDays, dayKey, weekKey } from '../time.js';
import { buildSeats, activeSeat, recordPeople } from './seat.js';
import { prospectiveConventions } from './prospectiveSchema.js';
import {
  PROSPECTIVE_DISCLOSURE,
  PROSPECTIVE_ENGINE_VERSION,
  PROSPECTIVE_INSTRUMENTS,
  PROSPECTIVE_INSTRUMENT_BY_KEY,
  PROSPECTIVE_LIMITS,
  PROSPECTIVE_PLAYBOOK,
  PROSPECTIVE_PREMISE,
} from './prospectiveRegistry.js';

/* The case lifecycle's own vocabulary, restated here so the reader has no
 * import cycle with the case engine. A case in one of these states is OPEN. */
const OPEN_CASES = new Set(['open', 'mitigating', 'monitoring']);
const CLOSED_CASES = new Set(['resolved', 'closed']);

export function prospectiveHash(value) {
  let result = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    result ^= text.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

/** Deterministic, order-independent commitment to the frozen population. */
export function cohortFingerprint(ids) {
  return prospectiveHash([...ids].slice().sort().join('|')).slice(0, 12);
}

/** ISO-week (Monday) key used for once-per-week governed findings. */
export function prospectiveWeekKey(now) {
  return weekKey(now);
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function round4(value) {
  return Math.round(value * 10000) / 10000;
}

/** Wilson (1927) score interval, refused on an empty or invalid sample. */
export function wilsonInterval(k, n, z = 1.96) {
  if (!Number.isFinite(k) || !Number.isFinite(n) || n <= 0 || k < 0 || k > n) {
    return { pct: null, lowPct: null, highPct: null, refused: true, reason: 'No valid sample.' };
  }
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const margin = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return {
    pct: round1(p * 100),
    lowPct: round1(Math.max(0, centre - margin) * 100),
    highPct: round1(Math.min(1, centre + margin) * 100),
    refused: false,
    reason: '',
  };
}

/** A record is in a seat's span when it names no OUTSIDE person (unattributed
 * records belong to the declaring span, exactly as the seat boundary decides). */
function inScope(record, scope) {
  if (!scope) return true;
  const people = recordPeople(record);
  return people.length === 0 ? true : people.every((pid) => scope.has(pid));
}

function dayInWindow(day, declaredOn, horizonOn, { allowEqualStart = false } = {}) {
  if (!day || typeof day !== 'string') return false;
  return (allowEqualStart ? day >= declaredOn : day > declaredOn) && day <= horizonOn;
}

/**
 * Freeze the exact population BEFORE the intervention. The caller passes the
 * declaring seat's scope; the returned id list is what the grade will resolve.
 * A population that is empty, too small for the declared evidence floor, or
 * larger than the bounded cohort cap is REFUSED, never silently truncated —
 * truncation would let a different cohort be evaluated than the one declared.
 */
export function freezeCohort(state, instrumentKey, scope, { declaredOn, horizonOn, evidenceFloor = 3 }) {
  const instrument = PROSPECTIVE_INSTRUMENT_BY_KEY[instrumentKey];
  if (!instrument) return { ok: false, ids: [], n: 0, reason: 'Unknown observable instrument.' };
  const source = state || {};
  let ids = [];
  if (instrumentKey === 'case-resolution') {
    ids = (Array.isArray(source.cases) ? source.cases : [])
      .filter((c) => c && OPEN_CASES.has(c.status) && c.openedOn && c.openedOn <= declaredOn && inScope(c, scope))
      .map((c) => c.id);
  } else if (instrumentKey === 'delegation-closure') {
    ids = (Array.isArray(source.delegations) ? source.delegations : [])
      .filter((d) => d && d.status === 'active' && dayInWindow(d.dueOn, declaredOn, horizonOn) && inScope(d, scope))
      .map((d) => d.id);
  } else if (instrumentKey === 'decision-review') {
    ids = (Array.isArray(source.decisions) ? source.decisions : [])
      .filter((d) => d && d.outcome === 'pending' && dayInWindow(d.reviewOn, declaredOn, horizonOn) && inScope(d, scope))
      .map((d) => d.id);
  } else if (instrumentKey === 'oneonone-cadence') {
    ids = (Array.isArray(source.people) ? source.people : [])
      .filter((p) => p && p.status === 'active' && scope && scope.has(p.id))
      .map((p) => p.id);
  }
  ids = [...new Set(ids.filter((value) => typeof value === 'string' && value.trim()))].sort();
  const n = ids.length;
  if (n === 0) return { ok: false, ids: [], n: 0, reason: `No ${instrument.unit} in this span match the declared window. Declare a different instrument or horizon.` };
  if (n < evidenceFloor) return { ok: false, ids, n, reason: `Only ${n} ${instrument.unit} are observable; the declared evidence floor is ${evidenceFloor}. A rate over a smaller cohort is refused.` };
  if (n > PROSPECTIVE_LIMITS.cohortCap) return { ok: false, ids: [], n, reason: `${n} ${instrument.unit} exceed the bounded cohort cap of ${PROSPECTIVE_LIMITS.cohortCap}; narrow the operating seat instead of truncating the declared population.` };
  return { ok: true, ids, n, reason: '' };
}

/** Resolve one frozen cohort to a binary outcome. Never guesses a missing date. */
export function resolveOutcome(state, contract, { now, reviewDays = 14 } = {}) {
  const instrument = PROSPECTIVE_INSTRUMENT_BY_KEY[contract?.instrumentKey];
  if (!instrument) return { ok: false, reason: 'Unknown instrument on the frozen contract.' };
  const today = dayKey(now instanceof Date ? now : new Date(now || Date.now()));
  if (today < contract.horizonOn) {
    return { ok: false, reason: `The horizon is ${contract.horizonOn}; the outcome is not observable before that date.` };
  }
  const source = state || {};
  const rows = Array.isArray(source[instrument.collection]) ? source[instrument.collection] : [];
  const byId = new Map(rows.map((row) => [row && row.id, row]));
  const missing = (contract.cohortIds || []).filter((id) => !byId.has(id));
  if (missing.length) {
    return { ok: false, reason: `${missing.length} frozen cohort record(s) are missing; the grade is refused rather than scored as a miss.` };
  }
  let reachedN = 0;
  for (const id of contract.cohortIds) {
    const row = byId.get(id);
    if (instrument.key === 'case-resolution') {
      if (CLOSED_CASES.has(row.status) && row.resolvedOn && row.resolvedOn <= contract.horizonOn) reachedN += 1;
    } else if (instrument.key === 'delegation-closure') {
      if (row.status === 'done' && row.completedOn && row.completedOn <= contract.horizonOn) reachedN += 1;
    } else if (instrument.key === 'decision-review') {
      if (row.reviewedOn && row.reviewedOn <= contract.horizonOn) reachedN += 1;
    } else if (instrument.key === 'oneonone-cadence') {
      const covered = (Array.isArray(source.oneOnOnes) ? source.oneOnOnes : [])
        .some((m) => m && m.personId === id && m.status === 'held'
          && m.date && m.date > contract.declaredOn && m.date <= contract.horizonOn);
      if (covered) reachedN += 1;
    }
  }
  const observedN = contract.cohortIds.length;
  if (observedN === 0) return { ok: false, reason: 'The frozen cohort is empty.' };
  const observedPct = round1((reachedN / observedN) * 100);
  // Exact rational comparison: reached * 100 >= threshold * cohort. No float
  // rounding is allowed to decide whether a declared threshold was met.
  const outcome = reachedN * 100 >= contract.thresholdPct * observedN ? 1 : 0;
  const brier = round4(((contract.probabilityPct / 100) - outcome) ** 2);
  const late = today > addDays(contract.horizonOn, reviewDays);
  return { ok: true, observedN, reachedN, observedPct, outcome, brier, late, reason: '' };
}

/**
 * Sequential out-of-sample base rate for one contract: the realised outcome
 * frequency of STRICTLY PRIOR graded contracts in the same (altitude ×
 * instrument) cell. Below the declared prior floor the reference forecast is
 * refused (null), so no cell's skill is flattered by its own first few trials.
 */
export function prospectiveBaseRate(priorGrades, contract, { priorFloor = 3, outcome = null } = {}) {
  const cell = `${contract.altitudeKey || 'unknown'}|${contract.instrumentKey}`;
  const prior = (Array.isArray(priorGrades) ? priorGrades : [])
    .filter((g) => g && `${g.altitudeKey || 'unknown'}|${g.instrumentKey}` === cell)
    .sort((a, b) => String(a.gradedOn).localeCompare(String(b.gradedOn)) || String(a.createdAt).localeCompare(String(b.createdAt)));
  if (prior.length < priorFloor) return { baseRatePct: null, referenceBrier: null, priorN: prior.length };
  const successes = prior.reduce((sum, g) => sum + (g.outcome === 1 ? 1 : 0), 0);
  const baseRatePct = round1((successes / prior.length) * 100);
  const y = outcome === 0 || outcome === 1 ? outcome : null;
  if (y === null) return { baseRatePct, referenceBrier: null, priorN: prior.length };
  return { baseRatePct, referenceBrier: round4(((baseRatePct / 100) - y) ** 2), priorN: prior.length };
}

export function brierFor(probabilityPct, outcome) {
  return round4(((probabilityPct / 100) - (outcome === 1 ? 1 : 0)) ** 2);
}

/** One cell = altitude × instrument. Skill is refused, never printed, below the floor. */
export function buildProspectiveCells(contracts, grades, { conventions, rank }) {
  const byKey = new Map();
  for (const contract of contracts) {
    const key = `${contract.altitudeKey || 'unknown'}|${contract.instrumentKey}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        altitudeKey: contract.altitudeKey || 'unknown',
        instrumentKey: contract.instrumentKey,
        instrumentLabel: PROSPECTIVE_INSTRUMENT_BY_KEY[contract.instrumentKey]?.label || contract.instrumentKey,
        rank: contract.rank || 1,
        contractsN: 0,
        grades: [],
      });
    }
    byKey.get(key).contractsN += 1;
  }
  const gradeContractIds = new Set((grades || []).map((g) => g.contractId));
  for (const grade of grades || []) {
    const key = `${grade.altitudeKey || 'unknown'}|${grade.instrumentKey}`;
    if (!byKey.has(key)) {
      const contract = contracts.find((c) => c.id === grade.contractId);
      byKey.set(key, {
        key, altitudeKey: grade.altitudeKey || 'unknown', instrumentKey: grade.instrumentKey,
        instrumentLabel: PROSPECTIVE_INSTRUMENT_BY_KEY[grade.instrumentKey]?.label || grade.instrumentKey,
        rank: grade.rank || 1, contractsN: contract ? 1 : 0, grades: [],
      });
    }
    byKey.get(key).grades.push(grade);
  }
  const underRank = rank < 3;
  const cells = [];
  for (const entry of byKey.values()) {
    const gradedN = entry.grades.length;
    const reachedN = entry.grades.reduce((sum, g) => sum + (g.outcome === 1 ? 1 : 0), 0);
    const scored = entry.grades.filter((g) => g.referenceBrier !== null && g.referenceBrier !== undefined);
    const meanBrier = scored.length ? round4(scored.reduce((sum, g) => sum + (Number(g.brier) || 0), 0) / scored.length) : null;
    const meanReferenceBrier = scored.length ? round4(scored.reduce((sum, g) => sum + (Number(g.referenceBrier) || 0), 0) / scored.length) : null;
    let skillPct = null;
    if (meanReferenceBrier !== null && meanReferenceBrier > 0 && meanBrier !== null) {
      skillPct = round1((1 - meanBrier / meanReferenceBrier) * 100);
    }
    const wilson = wilsonInterval(reachedN, gradedN);
    let refused = false;
    let reason = '';
    if (underRank) {
      refused = true;
      reason = 'Calibration rates are withheld below director rank; only counts are published at this altitude.';
    } else if (gradedN < conventions.prospectiveCellFloor) {
      refused = true;
      reason = `${gradedN} graded contract(s) is below the ${conventions.prospectiveCellFloor}-contract cell floor.`;
    } else if (scored.length < conventions.prospectiveCellFloor) {
      refused = true;
      reason = `Only ${scored.length} contract(s) have a strictly-prior base-rate reference; skill is refused below the ${conventions.prospectiveCellFloor}-contract floor.`;
    } else if (meanReferenceBrier === 0) {
      refused = true;
      reason = 'The base-rate reference scored perfectly on this cell, so Brier skill has no denominator.';
    }
    cells.push({
      key: entry.key, altitudeKey: entry.altitudeKey, instrumentKey: entry.instrumentKey,
      instrumentLabel: entry.instrumentLabel, rank: entry.rank,
      contractsN: entry.contractsN, gradedN, reachedN,
      observedPct: gradedN ? round1((reachedN / gradedN) * 100) : null,
      lowPct: wilson.lowPct, highPct: wilson.highPct,
      meanBrier, meanReferenceBrier, skillPct,
      refused, reason, suppressed: false,
      gradeContractIds,
    });
  }
  // Complementary suppression: a sub-floor cell in one instrument blanks the
  // smallest surviving sibling cell too, so the published altitude rows cannot
  // be subtracted from their group total to recover a withheld figure.
  for (const instrument of PROSPECTIVE_INSTRUMENTS) {
    const group = cells.filter((c) => c.instrumentKey === instrument.key);
    const small = group.filter((c) => c.gradedN < conventions.prospectiveCellFloor);
    if (!small.length) continue;
    const survivor = group.filter((c) => c.gradedN >= conventions.prospectiveCellFloor && !c.suppressed)
      .sort((a, b) => a.gradedN - b.gradedN)[0];
    if (survivor) {
      survivor.suppressed = true;
      survivor.refused = true;
      survivor.reason = 'Complementary suppression: a sibling cell in this instrument is below the floor, so this cell is blanked beside it.';
    }
  }
  return cells.sort((a, b) => a.instrumentKey.localeCompare(b.instrumentKey) || a.rank - b.rank);
}

function scopedContracts(state, built, seat) {
  const all = Array.isArray(state.prospectiveContracts) ? state.prospectiveContracts : [];
  if (seat.fullAccess) return all.slice(0, PROSPECTIVE_LIMITS.contracts);
  return all.filter((c) => c && (c.scopeSeatId === seat.id || (c.scopeSeatId && seat.scope.has(c.scopeSeatId))));
}

function statusOf(contract, grade, today, reviewDays) {
  if (grade) return 'graded';
  if (today < contract.horizonOn) return 'open';
  return today > addDays(contract.horizonOn, reviewDays) ? 'overdue' : 'due';
}

/** The one read model. Every panel, the brief, the CSV and the badge read this. */
export function buildProspectiveReport(state, { now = new Date(), settings = null } = {}) {
  const source = state || {};
  const clock = now instanceof Date ? now : new Date(now || Date.now());
  const today = dayKey(clock);
  const conventions = prospectiveConventions(settings || source.settings || {});
  const built = buildSeats(source, { now: clock, settings: settings || source.settings || {} });
  const seat = activeSeat(built);
  const contracts = scopedContracts(source, built, seat);
  const contractIds = new Set(contracts.map((c) => c.id));
  const grades = (Array.isArray(source.prospectiveGrades) ? source.prospectiveGrades : [])
    .filter((g) => g && contractIds.has(g.contractId));
  const gradeByContract = new Map(grades.map((g) => [g.contractId, g]));
  const detailAllowed = seat.fullAccess || seat.rank <= 2;

  const rows = contracts.map((contract) => {
    const grade = gradeByContract.get(contract.id) || null;
    let live = null;
    if (!grade && today >= contract.horizonOn) {
      live = resolveOutcome(source, contract, { now: clock, reviewDays: conventions.prospectiveReviewDays });
    }
    return {
      id: contract.id,
      title: detailAllowed ? contract.title : '',
      declaredOn: contract.declaredOn,
      horizonOn: contract.horizonOn,
      scopeSeatId: contract.scopeSeatId,
      altitudeKey: contract.altitudeKey,
      rank: contract.rank,
      instrumentKey: contract.instrumentKey,
      instrumentLabel: PROSPECTIVE_INSTRUMENT_BY_KEY[contract.instrumentKey]?.label || contract.instrumentKey,
      probabilityPct: contract.probabilityPct,
      thresholdPct: contract.thresholdPct,
      cohortN: contract.cohortN,
      status: statusOf(contract, grade, today, conventions.prospectiveReviewDays),
      grade,
      observedPct: grade ? grade.observedPct : (live?.ok ? live.observedPct : null),
      outcome: grade ? grade.outcome : null,
      brier: grade ? grade.brier : null,
      reason: grade ? '' : (live && !live.ok ? live.reason : ''),
    };
  }).sort((a, b) => String(b.declaredOn).localeCompare(String(a.declaredOn)) || String(a.id).localeCompare(String(b.id)));

  const cells = buildProspectiveCells(contracts, grades, { conventions, rank: seat.rank });
  const gradedN = grades.length;
  const reachedN = grades.reduce((sum, g) => sum + (g.outcome === 1 ? 1 : 0), 0);
  const coverage = wilsonInterval(reachedN, gradedN);
  const coverageRefused = gradedN < conventions.prospectiveCellFloor || seat.rank < 3 || coverage.refused;
  const openDecisions = (Array.isArray(source.decisions) ? source.decisions : [])
    .filter((d) => d && d.outcome === 'pending' && /RULE-PIC-0[34]/.test(String(d.rationale || '')))
    .map((d) => ({ id: d.id, title: d.title, reviewOn: d.reviewOn || null, ruleId: /RULE-PIC-04/.test(d.rationale) ? 'RULE-PIC-04' : 'RULE-PIC-03' }));

  const byAltitude = ['frontline', 'manager', 'director', 'exec', 'chief'].map((key) => {
    const subset = grades.filter((g) => (g.altitudeKey || 'unknown') === key);
    const declared = contracts.filter((c) => (c.altitudeKey || 'unknown') === key);
    const k = subset.reduce((sum, g) => sum + (g.outcome === 1 ? 1 : 0), 0);
    const refused = seat.rank < 3 || subset.length < conventions.prospectiveCellFloor;
    return {
      altitudeKey: key,
      declared: declared.length,
      graded: subset.length,
      reached: k,
      ratePct: refused ? null : round1((k / Math.max(1, subset.length)) * 100),
      refused,
      reason: refused ? (seat.rank < 3 ? 'Withheld below director rank.' : `Below the ${conventions.prospectiveCellFloor}-contract floor.`) : '',
    };
  });

  const summary = {
    declared: contracts.length,
    graded: gradedN,
    due: rows.filter((r) => r.status === 'due').length,
    overdue: rows.filter((r) => r.status === 'overdue').length,
    ungradable: rows.filter((r) => !r.grade && r.status !== 'open' && r.reason).length,
    open: rows.filter((r) => r.status === 'open').length,
    openFindings: openDecisions.length,
    cellsPublished: cells.filter((c) => !c.refused && !c.suppressed).length,
    cellsRefused: cells.filter((c) => c.refused || c.suppressed).length,
  };

  return {
    ok: true,
    engineVersion: PROSPECTIVE_ENGINE_VERSION,
    today,
    seat: {
      id: seat.id, label: seat.label, shortLabel: seat.shortLabel,
      rank: seat.rank, altitudeKey: seat.altitudeKey || 'chief',
      fullAccess: Boolean(seat.fullAccess), readOnly: Boolean(seat.readOnly),
    },
    detailAllowed,
    playbook: PROSPECTIVE_PLAYBOOK[seat.altitudeKey] || PROSPECTIVE_PLAYBOOK.chief,
    premise: PROSPECTIVE_PREMISE,
    disclosure: PROSPECTIVE_DISCLOSURE,
    conventions,
    instruments: PROSPECTIVE_INSTRUMENTS,
    rows,
    grades,
    cells,
    byAltitude,
    coverage: {
      ...coverage,
      refused: coverageRefused,
      reason: coverageRefused
        ? (seat.rank < 3
          ? 'A pooled rate is withheld below director rank; counts only.'
          : `${gradedN} graded contract(s) is below the ${conventions.prospectiveCellFloor}-contract floor.`)
        : '',
      gradedN, reachedN, floor: conventions.prospectiveCellFloor,
    },
    openDecisions,
    summary,
    attention: Math.min(99, summary.due + summary.overdue + summary.openFindings),
    withheld: [
      ...(seat.rank < 3 ? [{ n: cells.length, reason: 'Calibration rates are withheld below director rank; only counts and your own contracts are shown.' }] : []),
      ...(summary.ungradable ? [{ n: summary.ungradable, reason: 'Contract(s) whose frozen cohort could not be resolved: the grade is refused, not scored as a miss.' }] : []),
    ],
  };
}

/** Identity-free upward brief. No id, cohort, title, name or amount can appear. */
export function prospectiveBriefText(report) {
  if (!report?.ok) return '';
  const { summary, coverage, conventions, seat, today, cells } = report;
  const published = cells.filter((c) => !c.refused && !c.suppressed);
  const lines = [
    '# Prospective intervention contracts — upward brief',
    '',
    `Measured ${today} at ${seat.label.toLowerCase()} (rank ${seat.rank}).`,
    '',
    `- ${summary.declared} frozen contract(s): ${summary.graded} graded, ${summary.due} due, ${summary.overdue} overdue, ${summary.open} still inside their horizon.`,
    `- Unobservable outcomes REFUSED: ${summary.ungradable}. Open governed findings: ${summary.openFindings}.`,
    coverage.refused
      ? `- Realised-threshold rate WITHHELD: ${coverage.reason}`
      : `- Realised-threshold rate ${coverage.pct}% (Wilson 95% ${coverage.lowPct}–${coverage.highPct}%) over ${coverage.gradedN} graded contract(s).`,
    `- Calibration cells published: ${summary.cellsPublished}; refused or complementarily suppressed: ${summary.cellsRefused}.`,
    '',
    '## Published cells (counts and rates only)',
    '',
    published.length
      ? published.map((c) => `- ${c.altitudeKey} / ${c.instrumentKey}: ${c.gradedN} graded, mean Brier ${c.meanBrier}, base-rate skill ${c.skillPct}%, 95% interval ${c.lowPct}–${c.highPct}%.`).join('\n')
      : '- No calibration cell reached the declared evidence floor.',
    '',
    '## Conventions and limits',
    '',
    `- Evidence floor ${conventions.prospectiveEvidenceFloor}; cell floor ${conventions.prospectiveCellFloor}; skill floor ${conventions.prospectiveSkillFloorPct}%; review window ${conventions.prospectiveReviewDays} day(s).`,
    `- ${report.disclosure.premise}`,
    `- ${report.disclosure.score}`,
    `- ${report.disclosure.rollup}`,
    `- ${report.disclosure.local}`,
    '',
    'No contract id, cohort id, title, person name or currency amount appears in this brief.',
  ];
  return lines.join('\n');
}

/** Aggregate-only CSV rows. A refused figure is BLANK (null), never zero. */
export function prospectiveCsvRows(report) {
  if (!report?.ok) return [];
  const blank = (row, condition) => (condition ? { ...row, observed_pct: null, mean_brier: null, mean_reference_brier: null, skill_pct: null, interval_low_pct: null, interval_high_pct: null } : row);
  const cellRows = report.cells.map((c) => blank({
    row_kind: 'cell', altitude: c.altitudeKey, rank: c.rank, instrument: c.instrumentKey,
    contracts_n: c.contractsN, graded_n: c.gradedN, reached_n: c.reachedN,
    observed_pct: c.observedPct, mean_brier: c.meanBrier, mean_reference_brier: c.meanReferenceBrier,
    skill_pct: c.skillPct, interval_low_pct: c.lowPct, interval_high_pct: c.highPct,
    refused: c.refused || c.suppressed ? 'yes' : 'no', reason: c.reason,
  }, c.refused || c.suppressed));
  const altitudeRows = report.byAltitude.map((a) => ({
    row_kind: 'altitude', altitude: a.altitudeKey, rank: null, instrument: 'all',
    contracts_n: a.declared, graded_n: a.graded, reached_n: a.reached,
    observed_pct: a.refused ? null : a.ratePct, mean_brier: null, mean_reference_brier: null,
    skill_pct: null, interval_low_pct: null, interval_high_pct: null,
    refused: a.refused ? 'yes' : 'no', reason: a.reason,
  }));
  const workspace = {
    row_kind: 'workspace', altitude: 'all', rank: null, instrument: 'all',
    contracts_n: report.summary.declared, graded_n: report.summary.graded, reached_n: report.coverage.reachedN,
    observed_pct: report.coverage.refused ? null : report.coverage.pct,
    mean_brier: null, mean_reference_brier: null, skill_pct: null,
    interval_low_pct: report.coverage.refused ? null : report.coverage.lowPct,
    interval_high_pct: report.coverage.refused ? null : report.coverage.highPct,
    refused: report.coverage.refused ? 'yes' : 'no', reason: report.coverage.reason,
  };
  return [...cellRows, ...altitudeRows, workspace];
}

/** Cheap badge counter: does not build the full report on every render. */
export function prospectiveAttentionCount(state, { now = new Date(), settings = null } = {}) {
  const source = state || {};
  const clock = now instanceof Date ? now : new Date(now || Date.now());
  const today = dayKey(clock);
  const conventions = prospectiveConventions(settings || source.settings || {});
  const graded = new Set((Array.isArray(source.prospectiveGrades) ? source.prospectiveGrades : []).map((g) => g && g.contractId));
  const due = (Array.isArray(source.prospectiveContracts) ? source.prospectiveContracts : [])
    .filter((c) => c && !graded.has(c.id) && today >= c.horizonOn).length;
  const findings = (Array.isArray(source.decisions) ? source.decisions : [])
    .filter((d) => d && d.outcome === 'pending' && /RULE-PIC-0[34]/.test(String(d.rationale || ''))).length;
  void conventions;
  return Math.min(99, due + findings);
}
