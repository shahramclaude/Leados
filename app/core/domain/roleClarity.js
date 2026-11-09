/**
 * app/core/domain/roleClarity.js — Cross-Line Role Clarity Reconciliation
 * (ADR-0153, Schema v128, `#/onboarding?panel=clarity`, CSV #115).
 *
 * THE DUTY, IN THE OPERATOR'S WORDS. Sam sits on two lines. Dana's brief says
 * "owns the migration end-to-end" and puts `delivery`, `technical` and `risk` in
 * her scope with a `decides` right and a `written` bar. Priya's brief for the
 * same person says "support the migration when asked" and puts `delivery` alone
 * with an `informed` right and no criteria at all. Both briefs are dated, both
 * read as reasonable sentences, and nothing in the workspace ever put them side
 * by side. Two managers grading the same work against different definitions of
 * good is not a performance problem and it is not a calibration problem — it is a
 * ROLE problem, visible the moment the two definitions are read together, which
 * is BEFORE the assessment happens.
 *
 * WHAT THIS MODULE IS. One bounded read model over the briefs the workspace
 * already stores (`onboardingLineBriefs`, ADR-0150). It does not re-ask who was
 * entitled to brief — the onboarding lens already answers that — and it does not
 * grade the person. It answers ONE question per person per window: do the
 * definitions the lines hold for this person contradict one another, and can that
 * be seen while it is still a design problem?
 *
 * Pure module: no DOM, no storage, no implicit clock.
 */

import { addDays, dayKey, daysBetween } from '../time.js';
import { buildMatrix } from './matrix.js';
import { periodLinesFor } from './reviewStewardship.js';
import { briefsByLine } from './onboardingMatrix.js';
import { activePeople } from './people.js';
import {
  ROLE_CLARITY_ENGINE_VERSION,
  ROLE_CLARITY_LIMITS,
  ROLE_CLARITY_SPREAD_LIMIT,
  ROLE_CLARITY_WINDOW_DAYS,
  ROLE_CLARITY_FINDING_KINDS,
  roleClarityVerdict,
  roleClarityDomainLabel,
  roleClarityDecisionRightRank,
  roleClarityCriteriaRank,
} from './roleClarityRegistry.js';

const isBlank = (v) => v === null || v === undefined || v === '';

/** One line's DECLARED marks, or the shape of their absence. */
function marksOf(brief) {
  const domains = Array.isArray(brief?.domains) ? brief.domains.filter((d) => typeof d === 'string') : [];
  const decisionRight = brief?.decisionRight || '';
  const criteria = brief?.criteria || '';
  const declared = domains.length > 0 || !isBlank(decisionRight) || !isBlank(criteria);
  return { domains, decisionRight, criteria, declared };
}

/* ------------------------------------------------------------ the read model */

/**
 * Build the reconciliation for ONE onboarding plan.
 *
 * The comparison is computed ONLY across lines that (a) were in force during the
 * window and (b) hold an effective brief declaring at least one mark. A decline
 * is an ANSWER and is printed as one — it is never a definition and never a
 * zero. A brief with no marks is `unscoped-line` and is excluded from every
 * comparison, named as such. A line that never briefed is `absent-line`; a
 * SECONDARY absence fails the case to `unbriefed`, while the HOME line carries
 * no brief by design (the plan is its definition and the plan does not decompose
 * into domains) and is printed as the presumption it is, never counted as
 * evidence either way.
 */
export function buildRoleClarityCase(state, plan, { now = new Date(), settings = null } = {}) {
  const today = dayKey(now);
  const conv = {};
  const base = {
    engineVersion: ROLE_CLARITY_ENGINE_VERSION,
    planId: plan?.id || null,
    personId: plan?.personId || null,
    personName: null,
    startDate: null,
    windowEnd: null,
    isMatrix: false,
    hasPlan: Boolean(plan && plan.personId),
    verdict: 'single-chain',
    verdictLabel: roleClarityVerdict('single-chain')?.label || 'Single line',
    verdictTone: 'neutral',
    verdictDetail: roleClarityVerdict('single-chain')?.detail || '',
    verdictOpen: false,
    lines: [],
    findings: [],
    findingsN: 0,
    refusedFindingsN: 0,
    byDomain: [],
    totals: {
      lineN: 0, inWindowN: 0, scopedN: 0, unscopedN: 0, declinedN: 0, absentN: 0,
      homePresumedN: 0, overlapDomainN: 0, contestedAuthorityN: 0, divergentCriteriaN: 0,
      maxAuthorityGap: null, maxCriteriaGap: null,
    },
    refusals: [],
    today,
  };
  if (!plan || !plan.personId) return { ...base, refusals: [{ kind: 'no-plan', detail: 'No active plan was provided, so there is no window and no role definition to reconcile.' }] };

  const people = Array.isArray(state?.people) ? state.people : [];
  const person = people.find((p) => p && p.id === plan.personId) || null;
  const startDate = typeof plan.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(plan.startDate) ? plan.startDate : null;
  const windowEnd = startDate ? addDays(startDate, ROLE_CLARITY_WINDOW_DAYS) : null;

  const matrix = buildMatrix(state, { now, settings: settings || state?.settings || null });
  const all = startDate ? periodLinesFor(matrix, plan.personId, startDate, windowEnd, state) : [];

  const activePlans = (Array.isArray(state?.onboarding) ? state.onboarding : [])
    .filter((p) => p && p.personId === plan.personId && p.status === 'active');
  const planIds = new Set(activePlans.map((p) => p.id));
  const stored = (Array.isArray(state?.onboardingLineBriefs) ? state.onboardingLineBriefs : [])
    .filter((row) => row && row.personId === plan.personId && planIds.has(row.planId));
  const byLine = briefsByLine(stored);

  const rows = all.map((line) => {
    const key = String(line.key || '');
    const inWindow = Boolean(line.inPeriod);
    const history = byLine.get(`${plan.id}|${key}`) || [];
    const brief = history[0] || null;
    const supersededN = Math.max(0, history.length - 1);
    const marks = brief && brief.outcome === 'brief' ? marksOf(brief) : { domains: [], decisionRight: '', criteria: '', declared: false };
    let outcome = 'none';
    if (brief) outcome = brief.outcome;
    return {
      key,
      role: line.role,
      kind: line.kind,
      managerId: line.managerId,
      managerName: line.managerName,
      fromISO: line.fromISO || '',
      toISO: line.toISO || '',
      inWindow,
      reason: line.reason || '',
      outcome,
      scoped: Boolean(brief && brief.outcome === 'brief' && marks.declared),
      domains: marks.domains,
      domainLabels: marks.domains.map(roleClarityDomainLabel),
      decisionRight: marks.decisionRight,
      criteria: marks.criteria,
      supersededBriefN: supersededN,
      declaredOn: brief?.declaredOn || '',
      scope: brief?.outcome === 'brief' ? brief.scope : '',
      declineReason: brief?.outcome === 'declined' ? brief.reason : '',
    };
  });

  rows.sort((a, b) => {
    if (a.role === 'primary' && b.role !== 'primary') return -1;
    if (b.role === 'primary' && a.role !== 'primary') return 1;
    return String(a.managerName).localeCompare(String(b.managerName)) || String(a.key).localeCompare(String(b.key));
  });

  const windowRows = rows.filter((l) => l.inWindow);
  const outOfWindow = rows.filter((l) => !l.inWindow);
  const isMatrix = windowRows.length > 1 || rows.some((l) => l.role !== 'primary');

  const findings = [];
  const refusals = [];

  if (outOfWindow.length) {
    refusals.push({
      kind: 'line-outside-window',
      lineKeys: outOfWindow.map((l) => l.key),
      detail: `${outOfWindow.length} declared line(s) on this person do not overlap the window and were EXCLUDED rather than counted. A line that did not exist in these 90 days defines nothing about them.`,
    });
  }

  // Absent lines: never briefed. The home line is the printed presumption; a
  // SECONDARY absence is the gap this module names.
  const absent = windowRows.filter((l) => l.outcome === 'none');
  const absentSecondary = absent.filter((l) => l.role !== 'primary');
  const homeAbsent = absent.filter((l) => l.role === 'primary');
  for (const line of absentSecondary) {
    findings.push({
      kind: 'absent-line',
      lineKeys: [line.key],
      domain: null,
      detail: `${line.managerName}’s ${line.kind} line never wrote a brief in this window, so there is no definition of the job on that line to reconcile. None is imputed.`,
    });
  }
  if (homeAbsent.length) {
    refusals.push({
      kind: 'home-line-presumed',
      lineKeys: homeAbsent.map((l) => l.key),
      detail: 'The home line carries no line brief. Its obligations are PRESUMED to be the 30-60-90 plan — printed as one, never counted as a definition, and never decomposed into accountability domains, because the plan cannot be split into them without guessing.',
    });
  }

  // Briefed but declaring nothing: the comparison refuses to be drawn.
  const unscoped = windowRows.filter((l) => l.outcome === 'brief' && !l.scoped);
  if (unscoped.length) {
    findings.push({
      kind: 'unscoped-line',
      lineKeys: unscoped.map((l) => l.key),
      domain: null,
      detail: `${unscoped.length} briefed line(s) declared no accountability domain, decision right or criteria standing. Their words are printed, but no comparison is drawn against them — a mark nobody declared is not a mark that exists.`,
    });
  }
  const declined = windowRows.filter((l) => l.outcome === 'declined');
  if (declined.length) {
    refusals.push({
      kind: 'line-declined',
      lineKeys: declined.map((l) => l.key),
      detail: `${declined.length} line(s) answered in writing that this person carries no obligation there yet, with a reason. A decline is an answer, never a definition and never a zero — those lines are excluded from the comparison and printed as declines.`,
    });
  }

  // The comparable set: in-window, briefed, declaring at least one mark.
  const comparable = windowRows.filter((l) => l.scoped);

  // Domain claims across the comparable set.
  const domainClaims = new Map(); // domain -> rows claiming it
  for (const row of comparable) {
    for (const domain of row.domains) {
      if (!domainClaims.has(domain)) domainClaims.set(domain, []);
      domainClaims.get(domain).push(row);
    }
  }
  const byDomain = Array.from(domainClaims.entries())
    .map(([domain, claimants]) => ({
      domain,
      label: roleClarityDomainLabel(domain),
      n: claimants.length,
      lineKeys: claimants.map((r) => r.key),
      managers: claimants.map((r) => r.managerName),
      roles: claimants.map((r) => r.role),
      rights: claimants.map((r) => r.decisionRight || ''),
    }))
    .sort((a, b) => b.n - a.n || String(a.domain).localeCompare(String(b.domain)));
  for (const entry of byDomain) {
    if (entry.n >= 2) {
      findings.push({
        kind: 'overlapping-scope',
        lineKeys: entry.lineKeys,
        domain: entry.domain,
        domainLabel: entry.label,
        detail: `“${entry.label}” is claimed by ${entry.n} lines (${entry.managers.join(', ')}). That is the normal shape of a matrix — and it must be visible, because two managers can grade the same deliverable against different bars without either knowing.`,
      });
    }
  }

  // Decision-right spread across the comparable set (exact integer arithmetic).
  const rightRanks = comparable
    .map((row) => ({ row, rank: roleClarityDecisionRightRank(row.decisionRight) }))
    .filter((x) => x.rank !== null);
  let maxAuthorityGap = null;
  if (rightRanks.length >= 2) {
    const ranks = rightRanks.map((x) => x.rank);
    maxAuthorityGap = Math.max(...ranks) - Math.min(...ranks);
    if (maxAuthorityGap >= ROLE_CLARITY_SPREAD_LIMIT) {
      findings.push({
        kind: 'contested-authority',
        lineKeys: rightRanks.filter((x) => x.rank === Math.max(...ranks) || x.rank === Math.min(...ranks)).map((x) => x.row.key),
        domain: null,
        gap: maxAuthorityGap,
        detail: `One line briefed this person with a decision right ${maxAuthorityGap} step(s) above another line’s. A person cannot be a decision-maker on one line and a bystander on another without one of those briefs being wrong — before any work is graded.`,
      });
    }
  }

  // Criteria spread across the comparable set (exact integer arithmetic).
  const criteriaRanks = comparable
    .map((row) => ({ row, rank: roleClarityCriteriaRank(row.criteria) }))
    .filter((x) => x.rank !== null);
  let maxCriteriaGap = null;
  if (criteriaRanks.length >= 2) {
    const ranks = criteriaRanks.map((x) => x.rank);
    maxCriteriaGap = Math.max(...ranks) - Math.min(...ranks);
    if (maxCriteriaGap >= ROLE_CLARITY_SPREAD_LIMIT) {
      findings.push({
        kind: 'divergent-criteria',
        lineKeys: criteriaRanks.filter((x) => x.rank === Math.max(...ranks) || x.rank === Math.min(...ranks)).map((x) => x.row.key),
        domain: null,
        gap: maxCriteriaGap,
        detail: `One line wrote down how it will know success; another line never stated a bar at all (a spread of ${maxCriteriaGap} step(s) on the written/verbal/unstated scale). An unwritten bar is remembered differently by everyone holding it.`,
      });
    }
  }

  /* ---------------------------------------------------------- the verdict */
  let verdict;
  if (!isMatrix) verdict = 'single-chain';
  else if (absentSecondary.length) verdict = 'unbriefed';
  else if (findings.some((f) => f.kind === 'contested-authority' || f.kind === 'divergent-criteria')) verdict = 'contested';
  else if (comparable.length < 2) verdict = 'unscoped-pair';
  else if (byDomain.some((d) => d.n >= 2)) verdict = 'overlapping';
  else verdict = 'partitioned';

  const meta = roleClarityVerdict(verdict);
  const overflow = Math.max(0, findings.length - ROLE_CLARITY_LIMITS.findings);
  const findingsN = findings.length;
  const counts = {
    lineN: rows.length,
    inWindowN: windowRows.length,
    scopedN: comparable.length,
    unscopedN: unscoped.length,
    declinedN: declined.length,
    absentN: absent.length,
    homePresumedN: homeAbsent.length,
    overlapDomainN: byDomain.filter((d) => d.n >= 2).length,
    contestedAuthorityN: findings.filter((f) => f.kind === 'contested-authority').length,
    divergentCriteriaN: findings.filter((f) => f.kind === 'divergent-criteria').length,
    maxAuthorityGap,
    maxCriteriaGap,
  };

  return {
    engineVersion: ROLE_CLARITY_ENGINE_VERSION,
    planId: plan.id,
    personId: plan.personId,
    personName: person?.name || null,
    startDate,
    windowEnd,
    isMatrix,
    hasPlan: true,
    verdict,
    verdictLabel: meta?.label || verdict,
    verdictTone: meta?.tone || 'neutral',
    verdictDetail: meta?.detail || '',
    verdictOpen: Boolean(meta?.open),
    lines: rows,
    findings: findings.slice(0, ROLE_CLARITY_LIMITS.findings),
    findingsN,
    refusedFindingsN: overflow,
    byDomain,
    totals: counts,
    refusals,
    today,
    daysRemaining: windowEnd ? Math.max(0, daysBetween(today, windowEnd) ?? 0) : null,
  };
}

/* ------------------------------------------------------------- the board */

/**
 * Every role-clarity case in the workspace, worst first. ONE ROW PER PERSON: a
 * person with two plans is one case with the duplicate named on it.
 */
export function buildRoleClarity(state, { now = new Date(), settings = null, limit = ROLE_CLARITY_LIMITS.board } = {}) {
  const today = dayKey(now);
  const order = new Map([
    ['unbriefed', 0], ['contested', 1], ['unscoped-pair', 2], ['overlapping', 3], ['partitioned', 4], ['single-chain', 5],
  ]);
  const plans = Array.isArray(state?.onboarding) ? state.onboarding : [];
  const people = activePeople(state);
  const peopleById = new Map(people.map((p) => [p.id, p]));

  const cases = [];
  const seenPeople = new Set();
  const duplicatePlanRows = [];
  for (const plan of plans) {
    if (!plan || !plan.id || plan.status !== 'active') continue;
    if (!peopleById.has(plan.personId)) continue;
    const built = buildRoleClarityCase(state, plan, { now, settings });
    if (!built.isMatrix) continue;
    if (seenPeople.has(plan.personId)) {
      duplicatePlanRows.push({ personId: plan.personId, planId: plan.id });
      continue;
    }
    seenPeople.add(plan.personId);
    cases.push(built);
  }
  // A multi-line person with no active plan at all: counted, never given a row.
  const unplannedPeople = [];
  const hasActivePlan = new Set(plans.filter((p) => p && p.status === 'active').map((p) => p.personId));
  const matrix = buildMatrix(state, { now, settings: settings || state?.settings || null });
  for (const person of people) {
    if (seenPeople.has(person.id)) continue;
    if (hasActivePlan.has(person.id)) continue;
    const lines = periodLinesFor(matrix, person.id, today, today, state).filter((l) => l.role !== 'primary');
    if (!lines.length) continue;
    unplannedPeople.push(person.id);
  }

  cases.sort((a, b) => (order.get(a.verdict) ?? 9) - (order.get(b.verdict) ?? 9)
    || String(a.personName || '').localeCompare(String(b.personName || ''))
    || String(a.planId || '').localeCompare(String(b.planId || '')));

  const byVerdict = new Map([
    ['unbriefed', 0], ['contested', 0], ['unscoped-pair', 0], ['overlapping', 0], ['partitioned', 0], ['single-chain', 0],
  ]);
  for (const c of cases) byVerdict.set(c.verdict, (byVerdict.get(c.verdict) || 0) + 1);
  const sum = (pick) => cases.reduce((acc, c) => acc + pick(c), 0);
  const open = cases.filter((c) => c.verdictOpen);

  return {
    engineVersion: ROLE_CLARITY_ENGINE_VERSION,
    today,
    cases,
    shown: cases.slice(0, limit),
    truncatedN: Math.max(0, cases.length - limit),
    caseN: cases.length,
    peopleN: new Set(cases.map((c) => c.personId)).size,
    unplannedN: unplannedPeople.length,
    openN: open.length,
    unbriefedN: byVerdict.get('unbriefed') || 0,
    contestedN: byVerdict.get('contested') || 0,
    unscopedPairN: byVerdict.get('unscoped-pair') || 0,
    overlappingN: byVerdict.get('overlapping') || 0,
    partitionedN: byVerdict.get('partitioned') || 0,
    byVerdict: Array.from(byVerdict.entries()).map(([key, n]) => ({ key, label: roleClarityVerdict(key)?.label || key, n })),
    scopedLinesN: sum((c) => c.totals.scopedN),
    unscopedLinesN: sum((c) => c.totals.unscopedN),
    declinedLinesN: sum((c) => c.totals.declinedN),
    absentLinesN: sum((c) => c.totals.absentN),
    overlapDomainN: sum((c) => c.totals.overlapDomainN),
    contestedAuthorityN: sum((c) => c.totals.contestedAuthorityN),
    divergentCriteriaN: sum((c) => c.totals.divergentCriteriaN),
    findingsN: sum((c) => c.findingsN),
    duplicatePlanRowsN: duplicatePlanRows.length,
    duplicatePlanRows,
  };
}

/** Attention badge: cases where at least one line’s definition is missing or in conflict. */
export function roleClarityAttentionCount(state, { now = new Date(), settings = null } = {}) {
  return buildRoleClarity(state, { now, settings, limit: 0 }).openN;
}

/** The identity-free brief a VP can put in a pack. Every figure is a different fact. */
export function roleClarityBriefText(state, { now = new Date(), settings = null } = {}) {
  const board = buildRoleClarity(state, { now, settings, limit: 0 });
  if (!board.caseN && !board.unplannedN) {
    return `Cross-line role clarity — ${board.today}: no person in this workspace sits on more than one reporting line during an onboarding window. There is nothing to reconcile, which is a different claim than “every line agreed what the job is”.`;
  }
  const lines = [
    `Cross-line role clarity — ${board.today}.`,
    `${board.peopleN} person(s) are onboarding into a second line; ${board.contestedN} case(s) hold definitions the two lines cannot both satisfy, ${board.unbriefedN} case(s) hold no definition at all on a secondary line, ${board.unscopedPairN} case(s) declare too few marks to compare, ${board.overlappingN} case(s) claim the same ground on both lines without conflicting, and ${board.partitionedN} partition cleanly.`,
    `Lines across those cases: ${board.scopedLinesN} declared a comparable definition, ${board.unscopedLinesN} briefed with no declared marks, ${board.declinedLinesN} declined with a stated reason, ${board.absentLinesN} never briefed. ${board.overlapDomainN} domain overlap(s), ${board.contestedAuthorityN} decision-right conflict(s) and ${board.divergentCriteriaN} criteria conflict(s) are named in the cases — a conflict is named here, never settled here.`,
  ];
  if (board.unplannedN) lines.push(`${board.unplannedN} further multi-line person(s) hold no active plan at all, so there is no window and no definition to read — they are counted, never given an invented one.`);
  if (board.duplicatePlanRowsN) lines.push(`${board.duplicatePlanRowsN} duplicate concurrent plan(s) for the same person were counted once.`);
  lines.push('No person is scored and no per-line share of anybody is reported; every finding is on a line or a domain, and the brief text is never parsed.');
  return lines.join(' ');
}

/* ------------------------------------------------------------------- CSV */

export const ROLE_CLARITY_CSV_COLUMNS = Object.freeze([
  'case_ref', 'start_on', 'window_end_on', 'verdict', 'verdict_open',
  'line_role', 'line_kind', 'in_window', 'line_outcome',
  'domains_n', 'domain_keys', 'decision_right', 'criteria', 'superseded_brief_n',
]);

/**
 * Aggregate-only export. ONE row per case × line. NO person id, NO name, NO
 * manager id, NO manager name, NO brief text — a brief is a manager's words
 * about a person. `domain_keys` carries closed-lexicon keys only. A line with
 * no brief exports BLANK marks, never a zero.
 */
export function roleClarityCsvRows(state, { now = new Date(), settings = null } = {}) {
  const board = buildRoleClarity(state, { now, settings, limit: Number.MAX_SAFE_INTEGER });
  const rows = [];
  for (const c of board.cases) {
    for (const line of c.lines) {
      rows.push({
        case_ref: c.planId || '',
        start_on: c.startDate || '',
        window_end_on: c.windowEnd || '',
        verdict: c.verdict,
        verdict_open: c.verdictOpen ? 'yes' : 'no',
        line_role: line.role,
        line_kind: line.kind || '',
        in_window: line.inWindow ? 'yes' : 'no',
        line_outcome: line.outcome,
        domains_n: line.outcome === 'brief' ? String(line.domains.length) : '',
        domain_keys: line.outcome === 'brief' ? [...line.domains].sort().join(';') : '',
        decision_right: line.outcome === 'brief' ? line.decisionRight : '',
        criteria: line.outcome === 'brief' ? line.criteria : '',
        superseded_brief_n: String(line.supersededBriefN),
      });
    }
  }
  return rows;
}

export { ROLE_CLARITY_FINDING_KINDS };
