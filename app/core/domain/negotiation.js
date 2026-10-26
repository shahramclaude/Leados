/**
 * app/core/domain/negotiation.js — Negotiation Workbench domain engine.
 *
 * Pure module: no DOM, storage, clock globals or network. Every temporal
 * calculation receives `now`; every value returned is a plain object, so the
 * engine is deterministic and unit-testable in isolation (same layering rule
 * as cases.js / calibration.js).
 *
 * Frameworks applied explicitly (Section 0.1 cross-domain mandate):
 *  - Political science / negotiation theory: Fisher & Ury (1981) "Getting to
 *    Yes" — BATNA, separate people from the problem, interests over positions,
 *    objective criteria, options for mutual gain; Raiffa (1982) decision-
 *    analytic bargaining and the Zone of Possible Agreement (ZOPA); Lax &
 *    Sebenius (2006) value creation vs. value claiming; Shell (2006) preparation
 *    discipline; Tsebelis (2002) veto players (handled in the change module).
 *  - Economics: the reservation price is the opportunity cost of accepting;
 *    only a deal that beats the BATNA creates value. No cross-unit addition —
 *    money and person-days are never summed into a single fabricated score.
 *  - Mathematics/statistics: ZOPA interval, bargaining surplus and the Raiffa
 *    midpoint fairness anchor are computed from recorded reservation prices;
 *    counterparty estimates carry an explicit confidence label and are never
 *    treated as observed facts.
 */

import { dayKey } from '../time.js';
import { linksForEntity } from './cases.js';

export const NEGOTIATION_KINDS = [
  'vendor-contract',
  'salary-offer',
  'internal-resource',
  'scope-deadline',
  'partnership',
  'other',
];

export const NEGOTIATION_KIND_LABELS = {
  'vendor-contract': 'Vendor / supplier contract',
  'salary-offer': 'Offer & compensation',
  'internal-resource': 'Internal resource or headcount',
  'scope-deadline': 'Scope, deadline or SLA',
  partnership: 'Partnership / ecosystem',
  other: 'Other negotiation',
};

export const NEGOTIATION_STATUSES = ['preparing', 'scheduled', 'active', 'agreed', 'impasse', 'withdrawn'];
export const OPEN_NEGOTIATION_STATUSES = ['preparing', 'scheduled', 'active'];

export const NEGOTIATION_STATUS_LABELS = {
  preparing: 'Preparing',
  scheduled: 'Session scheduled',
  active: 'In negotiation',
  agreed: 'Agreement reached',
  impasse: 'Impasse',
  withdrawn: 'Withdrawn',
};

/**
 * Allowed lifecycle transitions. Impasse is deliberately NOT terminal: talks
 * can resume, and the escalation case raised by RULE-NEG-03 stays linked as
 * history when they do.
 */
export const NEGOTIATION_TRANSITIONS = {
  preparing: ['scheduled', 'active', 'withdrawn'],
  scheduled: ['active', 'preparing', 'withdrawn'],
  active: ['impasse', 'withdrawn'],
  impasse: ['active', 'withdrawn', 'agreed'],
  agreed: ['active'],
  withdrawn: ['preparing'],
};

export const NEGOTIATION_ISSUE_DIRECTIONS = ['minimize', 'maximize'];

export const NEGOTIATION_ISSUE_DIRECTION_LABELS = {
  minimize: 'We want this as low as possible (e.g. price we pay)',
  maximize: 'We want this as high as possible (e.g. headcount or discount we receive)',
};

export const ESTIMATE_CONFIDENCE = ['low', 'medium', 'high'];

export const ESTIMATE_CONFIDENCE_LABELS = {
  low: 'Low — informed guess',
  medium: 'Medium — some signal',
  high: 'High — directly evidenced',
};

/**
 * Governance threshold for the auto-created DACI mandate decision
 * (RULE-NEG-01). A product convention, not an empirical constant: below this
 * recorded deal value the leader can still mandate a decision manually, but
 * the engine does not create one unprompted.
 */
export const HIGH_STAKES_THRESHOLD = 25_000;

/** A negotiation session inside this window counts as "due soon" on Today. */
export const SESSION_DUE_SOON_DAYS = 3;

const ROUND = 2;

function round2(n) {
  return Math.round(n * 100) / 100;
}

function finiteNumber(value) {
  // Explicit null/undefined/empty means "not recorded" and must stay null:
  // Number(null) === 0 would otherwise turn a missing reservation into a
  // fabricated walk-away price of zero after schema normalization.
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function cleanText(value, max = 4000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function stringList(value, { maxItems = 12, maxLength = 500 } = {}) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const item of value) {
    const text = cleanText(item, maxLength);
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}

function calendarDiffDays(fromDay, toDay) {
  if (!fromDay || !toDay) return null;
  const a = Date.parse(`${fromDay}T00:00:00Z`);
  const b = Date.parse(`${toDay}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

export function isNegotiationOpen(record) {
  return Boolean(record && OPEN_NEGOTIATION_STATUSES.includes(record.status));
}

/**
 * Analyse one measurable issue.
 *
 * ZOPA semantics (Raiffa, 1982), always from OUR side:
 *  - minimize issue (a price we pay): we accept any value ≤ ourReservation;
 *    the counterparty accepts any value ≥ theirReservation. A zone exists when
 *    ourReservation ≥ theirReservation, spanning [theirReservation, ours].
 *  - maximize issue (value we receive): we accept ≥ ourReservation; the
 *    counterparty accepts ≤ theirReservation. A zone exists when
 *    theirReservation ≥ ourReservation, spanning [ours, theirs].
 * Missing reservation prices return `incomplete` rather than guessing a zone.
 */
export function analyzeNegotiationIssue(rawIssue = {}) {
  const issue = rawIssue && typeof rawIssue === 'object' ? rawIssue : {};
  const direction = NEGOTIATION_ISSUE_DIRECTIONS.includes(issue.direction) ? issue.direction : 'minimize';
  const ourReservation = finiteNumber(issue.ourReservation);
  const ourTarget = finiteNumber(issue.ourTarget);
  const theirReservation = finiteNumber(issue.theirReservation);
  const theirTarget = finiteNumber(issue.theirTarget);
  const weight = Math.min(5, Math.max(1, Math.round(Number(issue.weight) || 3)));
  const unit = cleanText(issue.unit, 12) || '';
  const estimateConfidence = ESTIMATE_CONFIDENCE.includes(issue.estimateConfidence) ? issue.estimateConfidence : null;

  let status = 'incomplete'; // incomplete | zopa | no-zopa
  let zopaLow = null;
  let zopaHigh = null;
  let zopaWidth = null;
  let zopaMidpoint = null;
  let gap = null;

  if (ourReservation !== null && theirReservation !== null) {
    if (direction === 'minimize') {
      if (ourReservation >= theirReservation) {
        status = 'zopa';
        zopaLow = theirReservation;
        zopaHigh = ourReservation;
      } else {
        status = 'no-zopa';
        gap = round2(theirReservation - ourReservation);
      }
    } else {
      if (theirReservation >= ourReservation) {
        status = 'zopa';
        zopaLow = ourReservation;
        zopaHigh = theirReservation;
      } else {
        status = 'no-zopa';
        gap = round2(ourReservation - theirReservation);
      }
    }
    if (status === 'zopa') {
      zopaWidth = round2(zopaHigh - zopaLow);
      zopaMidpoint = round2((zopaLow + zopaHigh) / 2);
    }
  }

  // Aspiration sanity: the target must be strictly better than the walk-away.
  let targetWarning = null;
  if (ourTarget !== null && ourReservation !== null) {
    if (direction === 'minimize' && ourTarget > ourReservation) {
      targetWarning = 'Our target is weaker than our walk-away (target price above reservation price).';
    } else if (direction === 'maximize' && ourTarget < ourReservation) {
      targetWarning = 'Our target is weaker than our walk-away (target below reservation).';
    }
  }

  return {
    id: cleanText(issue.id, 120),
    name: cleanText(issue.name, 160),
    unit,
    direction,
    weight,
    ourReservation,
    ourTarget,
    theirReservation,
    theirTarget,
    estimateConfidence,
    status,
    zopaLow,
    zopaHigh,
    zopaWidth,
    zopaMidpoint,
    gap,
    targetWarning,
  };
}

/**
 * Fisher & Ury preparation checklist, weighted so the two discipline anchors
 * (BATNA and a real walk-away price) count twice. Nothing is inferred: every
 * check is met only from fields actually recorded.
 */
export function evaluateNegotiationPrep(record = {}) {
  const issues = Array.isArray(record.issues) ? record.issues : [];
  const analyses = issues.map(analyzeNegotiationIssue);
  const ourInterests = stringList(record.ourInterests);
  const theirInterests = stringList(record.theirInterests);
  const objectiveCriteria = stringList(record.objectiveCriteria);
  const options = stringList(record.options);
  const batnaText = cleanText(record.ourBatnaDescription, 2000);

  const checks = [
    {
      key: 'batna',
      label: 'BATNA recorded — what we concretely do if there is no deal (Fisher & Ury)',
      met: batnaText.length >= 8,
      weight: 2,
    },
    {
      key: 'our-reservation',
      label: 'At least one issue carries our reservation (walk-away) price',
      met: analyses.some((a) => a.ourReservation !== null),
      weight: 2,
    },
    {
      key: 'our-interests',
      label: 'Our underlying interests documented, not just positions',
      met: ourInterests.length >= 1,
      weight: 1,
    },
    {
      key: 'their-interests',
      label: 'Counterparty interests estimated (empathy step of principled negotiation)',
      met: theirInterests.length >= 1,
      weight: 1,
    },
    {
      key: 'objective-criteria',
      label: 'At least two objective criteria (market rate, precedent, benchmark, regulation)',
      met: objectiveCriteria.length >= 2,
      weight: 1,
    },
    {
      key: 'options',
      label: 'At least two package options that could create mutual gain (Lax & Sebenius)',
      met: options.length >= 2,
      weight: 1,
    },
    {
      key: 'their-reservation',
      label: 'Counterparty reservation estimated on at least one issue, with a confidence label',
      met: analyses.some((a) => a.theirReservation !== null && a.estimateConfidence !== null),
      weight: 1,
    },
  ];

  const maxWeight = checks.reduce((sum, c) => sum + c.weight, 0);
  const metWeight = checks.reduce((sum, c) => sum + (c.met ? c.weight : 0), 0);
  const blockers = checks.filter((c) => !c.met).map((c) => c.label);

  return {
    checks,
    metCount: checks.filter((c) => c.met).length,
    totalCount: checks.length,
    metWeight,
    maxWeight,
    completenessPct: Math.round((metWeight / maxWeight) * 100),
    blockers,
  };
}

/**
 * BATNA cross-check, dimensionally honest: a reservation is only compared with
 * the BATNA value when both are expressed in the SAME recorded unit. Mixing
 * currencies or comparing money against days would manufacture a conclusion.
 */
export function batnaWarnings(record = {}, analyses = []) {
  const batnaValue = finiteNumber(record.ourBatnaValue);
  const batnaUnit = cleanText(record.ourBatnaUnit, 12);
  if (batnaValue === null || !batnaUnit) return [];
  const warnings = [];
  for (const analysis of analyses) {
    if (analysis.unit !== batnaUnit || analysis.ourReservation === null) continue;
    if (analysis.direction === 'minimize' && analysis.ourReservation > batnaValue) {
      warnings.push(
        `Issue “${analysis.name || 'unnamed'}”: accepting at our reservation (${analysis.ourReservation} ${batnaUnit}) is worse than executing the BATNA (${batnaValue} ${batnaUnit}). Walk away or improve the offer.`,
      );
    } else if (analysis.direction === 'maximize' && analysis.ourReservation < batnaValue) {
      warnings.push(
        `Issue “${analysis.name || 'unnamed'}”: accepting at our reservation (${analysis.ourReservation} ${batnaUnit}) is worse than executing the BATNA (${batnaValue} ${batnaUnit}). Walk away or improve the offer.`,
      );
    }
  }
  return warnings;
}

/** Full analytical summary for one negotiation record. */
export function summarizeNegotiation(record, state = null, now = new Date()) {
  const todayStr = dayKey(now);
  const open = isNegotiationOpen(record);
  const issues = Array.isArray(record.issues) ? record.issues : [];
  const analyses = issues.map(analyzeNegotiationIssue);
  const prep = evaluateNegotiationPrep(record);
  const batna = batnaWarnings(record, analyses);

  const totalWeight = analyses.reduce((sum, a) => sum + a.weight, 0);
  const zopaWeight = analyses.filter((a) => a.status === 'zopa').reduce((sum, a) => sum + a.weight, 0);
  const gapWeight = analyses.filter((a) => a.status === 'no-zopa').reduce((sum, a) => sum + a.weight, 0);
  const zopaCoveragePct = totalWeight ? Math.round((zopaWeight / totalWeight) * 100) : null;
  const blockingGaps = analyses.filter((a) => a.status === 'no-zopa').sort((a, b) => b.weight - a.weight);
  const incompleteIssues = analyses.filter((a) => a.status === 'incomplete');
  const targetWarnings = analyses.filter((a) => a.targetWarning).map((a) => a.targetWarning);

  const daysUntilSession = open && record.nextSessionOn ? calendarDiffDays(todayStr, record.nextSessionOn) : null;
  const sessionOverdue = daysUntilSession !== null && daysUntilSession < 0;
  const sessionDueSoon = daysUntilSession !== null && daysUntilSession >= 0 && daysUntilSession <= SESSION_DUE_SOON_DAYS;
  const reviewOverdue = Boolean(open && record.reviewOn && record.reviewOn < todayStr);

  const stakesValue = finiteNumber(record.stakesValue);
  const highStakes = Boolean(record.strategic) || (stakesValue !== null && stakesValue >= HIGH_STAKES_THRESHOLD);

  // The highest-weight reservation gap is the one a prep conversation must
  // solve first; deterministically tie-broken by issue name.
  const primaryGap = blockingGaps[0] || null;
  const weakPrepBeforeSession = Boolean(
    open && (sessionDueSoon || sessionOverdue) && prep.completenessPct < 50,
  );

  const needsAttention = Boolean(
    open && (sessionOverdue || reviewOverdue || record.status === 'impasse' || weakPrepBeforeSession ||
      (blockingGaps.length > 0 && (blockingGaps[0]?.weight || 0) >= 4)),
  );

  const links = state ? negotiationLinks(state, record.id) : [];
  const mandateDecision = links.find((l) => l.peer.type === 'decision' && l.relation === 'decides')?.peer || null;
  const escalationCase = links.find((l) => l.peer.type === 'case' && l.relation === 'escalates-from')?.peer || null;
  const commitmentDelegations = links.filter((l) => l.peer.type === 'delegation' && l.relation === 'tracks-followup');
  const delivery = negotiationDelivery(record, state || {});
  const settlementEvaluation = evaluateNegotiationSettlement(record);

  return {
    record,
    open,
    analyses,
    prep,
    batnaWarnings: batna,
    targetWarnings,
    totalWeight,
    zopaCoveragePct,
    blockingGaps,
    incompleteIssues,
    primaryGap,
    daysUntilSession,
    sessionOverdue,
    sessionDueSoon,
    reviewOverdue,
    stakesValue,
    highStakes,
    weakPrepBeforeSession,
    needsAttention,
    links,
    mandateDecision,
    escalationCase,
    commitmentDelegations,
    delivery,
    settlementEvaluation,
  };
}

/** Resolve typed graph links for a negotiation via the shared graph resolver. */
function negotiationLinks(state, negotiationId) {
  return linksForEntity(state, 'negotiation', negotiationId);
}

/** Workspace rollup for the list view, Today queue and insight signals. */
export function negotiationsRollup(state, now = new Date()) {
  const all = (state?.negotiations || []).map((r) => summarizeNegotiation(r, state, now));
  const open = all.filter((s) => s.open);
  const byStatus = {};
  for (const status of NEGOTIATION_STATUSES) byStatus[status] = all.filter((s) => s.record.status === status);

  const sessionsOverdue = open.filter((s) => s.sessionOverdue);
  const sessionsDueSoon = open.filter((s) => s.sessionDueSoon);
  const reviewsDue = open.filter((s) => s.reviewOverdue);
  const impasses = all.filter((s) => s.record.status === 'impasse');
  const weakPrep = open.filter((s) => s.weakPrepBeforeSession);
  const noZopa = open.filter((s) => s.blockingGaps.length > 0);
  // needsAttention is open-record scoped by design; impasses are closed but
  // still demand the leader's eye, so the attention queue unions both.
  const attention = all.filter((s) => s.needsAttention || s.record.status === 'impasse');

  const prepValues = open.map((s) => s.prep.completenessPct);
  const avgPrepPct = prepValues.length
    ? Math.round(prepValues.reduce((sum, v) => sum + v, 0) / prepValues.length)
    : null;

  const coverageValues = open.map((s) => s.zopaCoveragePct).filter((v) => v !== null);
  const avgZopaCoveragePct = coverageValues.length
    ? Math.round(coverageValues.reduce((sum, v) => sum + v, 0) / coverageValues.length)
    : null;

  const currency = open.find((s) => s.stakesValue !== null)?.record?.stakesCurrency
    || all[0]?.record?.stakesCurrency
    || 'USD';

  return {
    all,
    open,
    byStatus,
    sessionsOverdue,
    sessionsDueSoon,
    reviewsDue,
    impasses,
    weakPrep,
    noZopa,
    attention,
    avgPrepPct,
    avgZopaCoveragePct,
    currency,
  };
}

/** Normalise the editable issue list (used by the action layer before write). */
export function normalizeIssueInput(rawIssue = {}, index = 0) {
  const issue = rawIssue && typeof rawIssue === 'object' ? rawIssue : {};
  const num = (v) => {
    const n = finiteNumber(v);
    return n === null || n < 0 ? null : round2(n);
  };
  return {
    id: cleanText(issue.id, 120) || `negiss-${index + 1}`,
    name: cleanText(issue.name, 160),
    unit: cleanText(issue.unit, 12),
    direction: NEGOTIATION_ISSUE_DIRECTIONS.includes(issue.direction) ? issue.direction : 'minimize',
    weight: Math.min(5, Math.max(1, Math.round(Number(issue.weight) || 3))),
    ourReservation: num(issue.ourReservation),
    ourTarget: num(issue.ourTarget),
    theirReservation: num(issue.theirReservation),
    theirTarget: num(issue.theirTarget),
    estimateConfidence: ESTIMATE_CONFIDENCE.includes(issue.estimateConfidence) ? issue.estimateConfidence : null,
  };
}

export function normalizeStringLists(record = {}) {
  return {
    ourInterests: stringList(record.ourInterests),
    theirInterests: stringList(record.theirInterests),
    objectiveCriteria: stringList(record.objectiveCriteria),
    options: stringList(record.options),
  };
}

/**
 * Delivery is observed delegation state, never inferred savings or goal progress.
 * Resolves the cycle-safe recovery chain for each agreed term so a returned
 * commitment that was explicitly re-delegated reports its active/completed
 * successor while preserving prior owners and return reasons.
 */
export function negotiationDelivery(record, state = {}) {
  const allDelegations = Array.isArray(state?.delegations) ? state.delegations : [];
  const peopleById = new Map((state?.people || []).map((p) => [p.id, p]));

  const rows = (record?.agreedTerms || []).map((term) => {
    const termDelegations = allDelegations.filter(
      (d) => d.sourceNegotiationId === record.id && d.sourceTermId === term.id,
    );
    // Order by recovery lineage: root(s) -> successor(s). The active/head
    // delegation for the term is the one not superseded by a later delegation.
    const head = termDelegations.find((d) => !d.supersededByDelegationId && d.status !== 'returned')
      || termDelegations.find((d) => !d.supersededByDelegationId)
      || termDelegations[termDelegations.length - 1]
      || null;

    // Build prior-owner lineage combining explicit term.priorOwners and any
    // returned predecessor delegations for this term.
    const priorOwners = [];
    const seenKeys = new Set();
    for (const po of Array.isArray(term.priorOwners) ? term.priorOwners : []) {
      if (!po) continue;
      const key = po.delegationId || `${po.ownerId || ''}:${po.returnedOn || ''}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      priorOwners.push({
        ownerId: po.ownerId || null,
        ownerName: (po.ownerId && peopleById.get(po.ownerId)?.name) || 'Prior owner',
        delegationId: po.delegationId || null,
        returnedOn: po.returnedOn || null,
        returnReason: po.returnReason || '',
        recoveredOn: po.recoveredOn || null,
      });
    }
    for (const d of termDelegations) {
      if (head && d.id === head.id && d.status !== 'returned') continue;
      if (d.status === 'returned' && (d.supersededByDelegationId || (head && d.id !== head.id))) {
        const key = d.id;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        priorOwners.push({
          ownerId: d.personId || null,
          ownerName: (d.personId && peopleById.get(d.personId)?.name) || 'Prior owner',
          delegationId: d.id,
          returnedOn: d.returnedOn || null,
          returnReason: d.returnReason || '',
          recoveredOn: d.recoveredOn || head?.delegatedOn || null,
        });
      }
    }

    const delegation = head;
    const status = delegation?.status === 'done' ? 'delivered'
      : delegation?.status === 'returned' ? 'returned'
        : delegation?.status === 'active' ? 'in-progress' : 'untracked';
    const attemptCount = Math.max(1, termDelegations.length, priorOwners.length + (delegation || term.ownerId ? 1 : 0));
    const recovered = priorOwners.length > 0 && status !== 'returned';

    return {
      term,
      delegation: delegation || null,
      chain: termDelegations,
      priorOwners,
      attemptCount,
      recovered,
      status,
    };
  });

  return {
    rows,
    total: rows.length,
    delivered: rows.filter((r) => r.status === 'delivered').length,
    inProgress: rows.filter((r) => r.status === 'in-progress').length,
    returned: rows.filter((r) => r.status === 'returned').length,
    recovered: rows.filter((r) => r.recovered).length,
    untracked: rows.filter((r) => r.status === 'untracked').length,
    complete: rows.length > 0 && rows.every((r) => r.status === 'delivered'),
  };
}

/**
 * Ex-post agreement settlement & implementation-shortfall evaluation
 * (Williamson 1985 Transaction Cost Economics; Hart & Moore 1988 Incomplete
 * Contracts; Perold 1988 Implementation Shortfall; Raiffa 1982 BATNA Regret).
 *
 * Pure and dimensionally honest: compares realised deal value against signed
 * stakesValue in the same currency, compares against ourBatnaValue only when
 * units match, and evaluates quantitative term-by-term settlement variances in
 * each linked issue's optimization direction.
 */
export function evaluateNegotiationSettlement(record = {}) {
  const isAgreed = record?.status === 'agreed';
  const rawSettlement = isAgreed && record?.settlement && typeof record.settlement === 'object'
    ? record.settlement
    : null;
  const stakesValue = finiteNumber(record?.stakesValue);
  const stakesCurrency = cleanText(record?.stakesCurrency, 6) || 'USD';
  const batnaValue = finiteNumber(record?.ourBatnaValue);
  const batnaUnit = cleanText(record?.ourBatnaUnit, 12);
  const issues = Array.isArray(record?.issues) ? record.issues : [];
  const issueById = new Map(issues.map((iss) => [iss.id, iss]));

  // Determine whether the primary currency-denominated issue is cost-minimizing
  // or value-maximizing so variance polarity is economically coherent.
  const currencyIssues = issues
    .filter((iss) => cleanText(iss?.unit, 12).toUpperCase() === stakesCurrency.toUpperCase())
    .sort((a, b) => (Number(b.weight) || 3) - (Number(a.weight) || 3));
  const dealDirection = currencyIssues[0]?.direction === 'minimize' ? 'minimize' : 'maximize';

  const termRows = (record?.agreedTerms || []).map((term) => {
    const agreedValue = finiteNumber(term?.agreedValue);
    const settledValue = finiteNumber(term?.settledValue);
    const issue = term?.issueId ? issueById.get(term.issueId) || null : null;
    const direction = issue?.direction === 'minimize'
      ? 'minimize'
      : issue?.direction === 'maximize'
        ? 'maximize'
        : null;
    const unit = cleanText(term?.unit || issue?.unit, 12);
    const scored = agreedValue !== null && settledValue !== null;
    const rawVariance = scored ? round2(settledValue - agreedValue) : null;
    const favorableVariance = !scored
      ? null
      : direction === 'minimize'
        ? round2(agreedValue - settledValue)
        : round2(settledValue - agreedValue);
    const adverseSlippage = favorableVariance !== null && favorableVariance < 0;
    const adverseRatio = scored && agreedValue > 0 && adverseSlippage
      ? round2(Math.abs(favorableVariance) / agreedValue)
      : 0;
    const sameUnitAsBatna = Boolean(
      settledValue !== null && batnaValue !== null && batnaUnit && unit && unit.toUpperCase() === batnaUnit.toUpperCase() && direction,
    );
    const termBatnaBreached = sameUnitAsBatna
      ? (direction === 'minimize' ? settledValue > batnaValue : settledValue < batnaValue)
      : false;
    return {
      termId: term.id,
      text: term.text,
      unit,
      direction,
      agreedValue,
      settledValue,
      scored,
      rawVariance,
      favorableVariance,
      adverseSlippage,
      adverseRatio,
      termBatnaBreached,
    };
  });

  const scoredTermRows = termRows.filter((r) => r.scored);
  const settled = Boolean(rawSettlement) || scoredTermRows.length > 0;
  const settledOn = rawSettlement?.settledOn || null;
  const realisedValue = finiteNumber(rawSettlement?.realisedValue);
  const counterpartyDelivered = typeof rawSettlement?.counterpartyDelivered === 'boolean'
    ? rawSettlement.counterpartyDelivered
    : null;
  const note = cleanText(rawSettlement?.note, 2000);

  const hasDealValuePair = stakesValue !== null && realisedValue !== null;
  const rawValueVariance = hasDealValuePair ? round2(realisedValue - stakesValue) : null;
  const favorableValueVariance = !hasDealValuePair
    ? null
    : dealDirection === 'minimize'
      ? round2(stakesValue - realisedValue)
      : round2(realisedValue - stakesValue);
  const realisationRatio = hasDealValuePair && stakesValue > 0
    ? Math.round((realisedValue / stakesValue) * 10000) / 10000
    : null;
  // Implementation shortfall (Perold 1988): positive fraction when realised
  // outcome falls short of the signed paper agreement in the deal's direction.
  const shortfallRatio = hasDealValuePair && stakesValue > 0 && favorableValueVariance < 0
    ? Math.round((Math.abs(favorableValueVariance) / stakesValue) * 10000) / 10000
    : 0;

  const sameUnitDealBatna = Boolean(
    realisedValue !== null && batnaValue !== null && batnaUnit && stakesCurrency.toUpperCase() === batnaUnit.toUpperCase(),
  );
  const dealBatnaBreached = sameUnitDealBatna
    ? (dealDirection === 'minimize' ? realisedValue > batnaValue : realisedValue < batnaValue)
    : false;
  const batnaBreached = dealBatnaBreached || termRows.some((r) => r.termBatnaBreached);

  const highStakes = Boolean(record?.strategic) || (stakesValue !== null && stakesValue >= HIGH_STAKES_THRESHOLD);
  const materialShortfall = shortfallRatio >= 0.2 || termRows.some((r) => r.adverseRatio >= 0.25);
  const counterpartyBreach = counterpartyDelivered === false;
  const adverseGovernanceTrigger = Boolean(
    isAgreed && settled && (batnaBreached || counterpartyBreach || (materialShortfall && (highStakes || shortfallRatio >= 0.25))),
  );

  let status = 'unsettled';
  if (settled) {
    if (batnaBreached) status = 'batna-breach';
    else if (counterpartyBreach) status = 'counterparty-breach';
    else if (favorableValueVariance !== null && favorableValueVariance < 0) status = 'shortfall';
    else if (termRows.some((r) => r.adverseSlippage)) status = 'shortfall';
    else status = 'on-terms';
  }

  return {
    isAgreed,
    settled,
    status,
    settledOn,
    dealDirection,
    stakesValue,
    stakesCurrency,
    realisedValue,
    rawValueVariance,
    favorableValueVariance,
    realisationRatio,
    shortfallRatio,
    shortfallPct: Math.round(shortfallRatio * 100),
    counterpartyDelivered,
    batnaValue,
    batnaUnit,
    sameUnitDealBatna,
    dealBatnaBreached,
    batnaBreached,
    materialShortfall,
    counterpartyBreach,
    adverseGovernanceTrigger,
    note,
    termRows,
    scoredTermCount: scoredTermRows.length,
    adverseTermCount: termRows.filter((r) => r.adverseSlippage).length,
  };
}
