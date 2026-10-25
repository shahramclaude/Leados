/**
 * app/core/domain/cases.js — Cross-domain Operational Case analysis.
 *
 * Unifies four peer-reviewed / industry-standard analytical lenses around a
 * single operational entity (incident, risk, strategic initiative, or
 * escalation) without touching DOM or storage:
 *
 *  1. Engineering & Production Quality — Failure Mode and Effects Analysis
 *     (AIAG & VDA FMEA Handbook, 2019; IEC 60812:2018) with both RPN
 *     (Severity × Probability × Detectability) and Action Priority (AP) so
 *     high-severity tail risks are never masked by low occurrence, paired
 *     with Toyota 5-Whys (Ohno, 1988) and Reason's Swiss-Cheese systemic
 *     barrier model (Reason, 1990; Dekker, 2014).
 *  2. Mathematics, Statistics, Finance & Economics — Three-point PERT Beta
 *     distributions (Malcolm, Roseboom, Clark & Fazar, 1959) for uncertain
 *     financial impact and diverted team capacity (person-days), expected-value
 *     risk reduction (Hubbard, 2020), risk-adjusted mitigation ROI, and
 *     explicit opportunity-cost capture (Buchanan, 1969).
 *  3. Political Science, Negotiation & Strategy — Mendelow's Power × Interest
 *     Stakeholder Matrix (Mendelow, 1981; Bryson, 2004) combined with coalition
 *     stance weighting (Lax & Sebenius, 2006) and dated communication cadences.
 *  4. Systems Connectedness — Typed cross-module relationship graph (`links`)
 *     with a hard privacy boundary excluding confidential conflicts and
 *     anonymous pulse responses.
 */

import { dayKey } from '../time.js';

export const CASE_KINDS = ['incident', 'risk', 'initiative', 'escalation'];

export const CASE_KIND_LABELS = {
  incident: 'Operational incident',
  risk: 'Delivery or vendor risk',
  initiative: 'Strategic initiative',
  escalation: 'Cross-team escalation',
};

export const CASE_STATUSES = ['open', 'mitigating', 'monitoring', 'resolved', 'closed'];
export const OPEN_CASE_STATUSES = ['open', 'mitigating', 'monitoring'];

export const CASE_STATUS_LABELS = {
  open: 'Open',
  mitigating: 'Mitigating',
  monitoring: 'Monitoring',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const STAKEHOLDER_STANCES = ['champion', 'supportive', 'neutral', 'skeptical', 'blocker'];

export const STAKEHOLDER_STANCE_LABELS = {
  champion: 'Champion',
  supportive: 'Supportive',
  neutral: 'Neutral',
  skeptical: 'Skeptical',
  blocker: 'Blocker',
};

export const STAKEHOLDER_CADENCES = ['immediate', 'weekly', 'milestone', 'digest'];

export const STAKEHOLDER_CADENCE_LABELS = {
  immediate: 'Immediate (24–48h)',
  weekly: 'Weekly brief',
  milestone: 'At milestones',
  digest: 'Periodic digest',
};

export const MENDELOW_QUADRANTS = {
  'manage-closely': {
    id: 'manage-closely',
    label: 'Manage closely',
    subtitle: 'High power · High interest',
    guidance: 'Key coalition player — align directly, surface tradeoffs early, and co-shape options.',
    defaultCadence: 'weekly',
  },
  'keep-satisfied': {
    id: 'keep-satisfied',
    label: 'Keep satisfied',
    subtitle: 'High power · Lower interest',
    guidance: 'Institutional gatekeeper — brief concisely on budget and risk guardrails; avoid surprises.',
    defaultCadence: 'milestone',
  },
  'keep-informed': {
    id: 'keep-informed',
    label: 'Keep informed',
    subtitle: 'Lower power · High interest',
    guidance: 'Affected ally — share transparent progress updates and invite operational feedback.',
    defaultCadence: 'weekly',
  },
  monitor: {
    id: 'monitor',
    label: 'Monitor',
    subtitle: 'Lower power · Lower interest',
    guidance: 'Low-touch stakeholder — include in milestone summaries without overloading.',
    defaultCadence: 'digest',
  },
};

/**
 * Allowed entity types in the cross-module relationship graph.
 * Confidential `conflicts` and anonymous `pulses` are strictly excluded so
 * private records can never enter general operational propagation or graphs.
 */
export const LINK_ENTITY_TYPES = [
  'case',
  'decision',
  'delegation',
  'goal',
  'growth',
  'person',
  'oneonone',
  'feedback',
  'onboarding',
  'review',
  'readiness',
  'recognition',
];

export const FORBIDDEN_LINK_TYPES = ['conflict', 'pulse'];

export const LINK_RELATIONS = [
  'mitigates',
  'decides',
  'impacts-goal',
  'coaches',
  'escalates-from',
  'tracks-followup',
  'develops',
];

export const LINK_RELATION_LABELS = {
  mitigates: 'Mitigation ownership',
  decides: 'Strategic decision',
  'impacts-goal': 'Impacts goal',
  coaches: '1:1 support & coaching',
  'escalates-from': 'Escalated from',
  'tracks-followup': 'Tracks follow-up',
  develops: 'Develops capability',
};

const Z_80_INTERVAL = 1.2815515655446004; // Standard normal 90th percentile (P10 / P90)

const BLAME_PATTERN = /\b(careless|lazy|incompetent|negligent|stupid|blamed?|fault of|human error|sloppy)\b/i;

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function nonNegativeNumber(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function calendarDiffDays(fromDay, toDay) {
  if (!fromDay || !toDay) return null;
  const a = Date.parse(`${fromDay}T00:00:00Z`);
  const b = Date.parse(`${toDay}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

export function isCaseOpen(caseRecord) {
  return Boolean(caseRecord && OPEN_CASE_STATUSES.includes(caseRecord.status));
}

/**
 * AIAG-VDA (2019) Action Priority classification alongside classical RPN.
 * High-severity failure modes (S >= 9) remain visible as High/Medium priority
 * even when occurrence and detection scores produce a modest RPN.
 */
export function classifyActionPriority(severity, probability, detectability) {
  const s = clampInt(severity, 1, 10, 5);
  const p = clampInt(probability, 1, 10, 5);
  const d = clampInt(detectability, 1, 10, 5);
  const rpn = s * p * d;

  if (
    (s >= 9 && (p >= 4 || d >= 4)) ||
    (s >= 7 && p >= 6) ||
    (s >= 7 && p >= 4 && d >= 5) ||
    rpn >= 200
  ) {
    return 'high';
  }
  if (
    s >= 9 ||
    (s >= 7 && (p >= 3 || d >= 4)) ||
    (s >= 5 && p >= 5 && d >= 4) ||
    rpn >= 100
  ) {
    return 'medium';
  }
  return 'low';
}

/**
 * Compute FMEA risk profile with full component transparency.
 */
export function computeFmea(fmea = {}) {
  const severity = clampInt(fmea?.severity, 1, 10, 5);
  const probability = clampInt(fmea?.probability, 1, 10, 5);
  const detectability = clampInt(fmea?.detectability, 1, 10, 5);
  const rpn = severity * probability * detectability;
  const actionPriority = classifyActionPriority(severity, probability, detectability);

  const drivers = [];
  if (severity >= 9) drivers.push(`Severity ${severity}/10 (critical safety, customer, or compliance harm — elevates priority regardless of RPN)`);
  else if (severity >= 7) drivers.push(`Severity ${severity}/10 (major service or delivery disruption)`);
  else drivers.push(`Severity ${severity}/10`);

  if (probability >= 7) drivers.push(`Probability ${probability}/10 (frequent or likely recurrence)`);
  else drivers.push(`Probability ${probability}/10`);

  if (detectability >= 7) drivers.push(`Detection gap ${detectability}/10 (weak automated warning before impact)`);
  else drivers.push(`Detection gap ${detectability}/10`);

  const hasResidual =
    fmea?.residualSeverity != null &&
    fmea?.residualProbability != null &&
    fmea?.residualDetectability != null &&
    Number.isFinite(Number(fmea.residualSeverity)) &&
    Number.isFinite(Number(fmea.residualProbability)) &&
    Number.isFinite(Number(fmea.residualDetectability));

  let residualSeverity = null;
  let residualProbability = null;
  let residualDetectability = null;
  let residualRpn = null;
  let residualActionPriority = null;
  let rpnReductionPct = null;

  if (hasResidual) {
    residualSeverity = clampInt(fmea.residualSeverity, 1, 10, severity);
    residualProbability = clampInt(fmea.residualProbability, 1, 10, probability);
    residualDetectability = clampInt(fmea.residualDetectability, 1, 10, detectability);
    residualRpn = residualSeverity * residualProbability * residualDetectability;
    residualActionPriority = classifyActionPriority(residualSeverity, residualProbability, residualDetectability);
    rpnReductionPct = rpn > 0 ? round2(((rpn - residualRpn) / rpn) * 100) : 0;
  }

  return {
    severity,
    probability,
    detectability,
    rpn,
    actionPriority,
    drivers,
    failureMode: fmea?.failureMode || '',
    effect: fmea?.effect || '',
    controls: fmea?.controls || '',
    hasResidual,
    residualSeverity,
    residualProbability,
    residualDetectability,
    residualRpn,
    residualActionPriority,
    rpnReductionPct,
  };
}

function pertStats(rawO, rawM, rawP) {
  const vals = [
    nonNegativeNumber(rawO, 0),
    nonNegativeNumber(rawM, 0),
    nonNegativeNumber(rawP, 0),
  ].sort((a, b) => a - b);
  const [optimistic, mostLikely, pessimistic] = vals;
  const measured = pessimistic > 0 || mostLikely > 0 || optimistic > 0;
  const expected = (optimistic + 4 * mostLikely + pessimistic) / 6;
  const stdDev = (pessimistic - optimistic) / 6;
  const variance = stdDev * stdDev;
  const p10 = Math.max(optimistic, expected - Z_80_INTERVAL * stdDev);
  const p50 = mostLikely;
  const p90 = Math.min(pessimistic, expected + Z_80_INTERVAL * stdDev);
  return {
    measured,
    optimistic: round2(optimistic),
    mostLikely: round2(mostLikely),
    pessimistic: round2(pessimistic),
    expected: round2(expected),
    stdDev: round2(stdDev),
    variance: round2(variance),
    p10: round2(p10),
    p50: round2(p50),
    p90: round2(p90),
    spread: round2(pessimistic - optimistic),
  };
}

/**
 * Three-point PERT distribution for financial cost and team-capacity days,
 * paired with risk-adjusted expected-value mitigation ROI.
 */
export function computePertImpact(financial = {}, fmeaInput = {}) {
  const fmea = fmeaInput && typeof fmeaInput.rpn === 'number' ? fmeaInput : computeFmea(fmeaInput);
  const currency = typeof financial?.currency === 'string' && financial.currency.trim()
    ? financial.currency.trim().toUpperCase().slice(0, 6)
    : 'USD';

  const cost = pertStats(financial?.optimistic, financial?.mostLikely, financial?.pessimistic);
  const capacity = pertStats(
    financial?.capacityDaysOptimistic,
    financial?.capacityDaysMostLikely,
    financial?.capacityDaysPessimistic,
  );

  const preProbability = round2(Math.min(1, Math.max(0.1, fmea.probability / 10)));
  const measuredResidual = Boolean(fmea.hasResidual);
  const postProbability = measuredResidual
    ? round2(Math.min(1, Math.max(0.05, fmea.residualProbability / 10)))
    : round2(Math.max(0.05, preProbability * 0.4));

  const expectedUnmitigatedLoss = round2(cost.expected * preProbability);
  const expectedResidualLoss = round2(cost.expected * postProbability);
  const expectedLossAvoided = round2(Math.max(0, expectedUnmitigatedLoss - expectedResidualLoss));
  const mitigationCost = round2(nonNegativeNumber(financial?.mitigationCost, 0));
  const netRiskAdjustedValue = round2(expectedLossAvoided - mitigationCost);
  const mitigationRoi = cost.measured && mitigationCost > 0
    ? round2(netRiskAdjustedValue / mitigationCost)
    : null;

  return {
    currency,
    hasFinancialEstimate: cost.measured,
    hasCapacityEstimate: capacity.measured,
    cost,
    capacity,
    preProbability,
    postProbability,
    measuredResidual,
    expectedUnmitigatedLoss,
    expectedResidualLoss,
    expectedLossAvoided,
    mitigationCost,
    netRiskAdjustedValue,
    mitigationRoi,
    opportunityCost: typeof financial?.opportunityCost === 'string' ? financial.opportunityCost.trim() : '',
  };
}

/**
 * Classify a single stakeholder into Mendelow's Power × Interest quadrants
 * and compute communication cadence health.
 */
export function classifyMendelowStakeholder(stakeholder = {}, todayStr = null) {
  const power = clampInt(stakeholder?.power, 1, 5, 3);
  const interest = clampInt(stakeholder?.interest, 1, 5, 3);
  const stance = STAKEHOLDER_STANCES.includes(stakeholder?.stance) ? stakeholder.stance : 'neutral';

  let quadrant = 'monitor';
  if (power >= 3 && interest >= 3) quadrant = 'manage-closely';
  else if (power >= 3 && interest < 3) quadrant = 'keep-satisfied';
  else if (power < 3 && interest >= 3) quadrant = 'keep-informed';

  const meta = MENDELOW_QUADRANTS[quadrant];
  const commsCadence = STAKEHOLDER_CADENCES.includes(stakeholder?.commsCadence)
    ? stakeholder.commsCadence
    : meta.defaultCadence;

  const nextCommsOn = stakeholder?.nextCommsOn || null;
  const lastCommsOn = stakeholder?.lastCommsOn || null;
  const daysUntilComms = todayStr && nextCommsOn ? calendarDiffDays(todayStr, nextCommsOn) : null;
  const commsOverdue = daysUntilComms !== null && daysUntilComms < 0;
  const commsDueToday = daysUntilComms === 0;
  const commsDueSoon = daysUntilComms !== null && daysUntilComms >= 0 && daysUntilComms <= 3;

  const isKeyPlayer = quadrant === 'manage-closely' || quadrant === 'keep-satisfied';
  const isOpposing = stance === 'blocker' || stance === 'skeptical';
  const needsImmediateAlignment = isKeyPlayer && isOpposing && (!lastCommsOn || commsOverdue);

  return {
    id: stakeholder?.id || '',
    name: stakeholder?.name || 'Unnamed stakeholder',
    role: stakeholder?.role || '',
    power,
    interest,
    stance,
    stanceLabel: STAKEHOLDER_STANCE_LABELS[stance],
    quadrant,
    quadrantLabel: meta.label,
    quadrantSubtitle: meta.subtitle,
    guidance: meta.guidance,
    commsCadence,
    commsCadenceLabel: STAKEHOLDER_CADENCE_LABELS[commsCadence],
    lastCommsOn,
    nextCommsOn,
    keyMessage: stakeholder?.keyMessage || '',
    daysUntilComms,
    commsOverdue,
    commsDueToday,
    commsDueSoon,
    needsImmediateAlignment,
  };
}

/**
 * Aggregate coalition power balance and communication checkpoints across a
 * case's stakeholder map.
 */
export function summarizeStakeholderCoalition(stakeholders = [], todayStr = null, { caseOpen = true } = {}) {
  const list = Array.isArray(stakeholders)
    ? stakeholders.map((s) => classifyMendelowStakeholder(s, todayStr))
    : [];

  const byQuadrant = {
    'manage-closely': [],
    'keep-satisfied': [],
    'keep-informed': [],
    monitor: [],
  };

  let supportivePower = 0;
  let opposingPower = 0;
  let neutralPower = 0;

  for (const item of list) {
    byQuadrant[item.quadrant].push(item);
    if (item.stance === 'champion' || item.stance === 'supportive') {
      supportivePower += item.power;
    } else if (item.stance === 'blocker' || item.stance === 'skeptical') {
      opposingPower += item.power;
    } else {
      neutralPower += item.power;
    }
  }

  const unalignedKeyPlayers = list.filter(
    (s) =>
      (s.quadrant === 'manage-closely' || s.quadrant === 'keep-satisfied') &&
      (s.stance === 'blocker' || s.stance === 'skeptical'),
  );

  const overdueComms = caseOpen ? list.filter((s) => s.commsOverdue) : [];
  const dueSoonComms = caseOpen ? list.filter((s) => s.commsDueToday || s.commsDueSoon) : [];

  return {
    total: list.length,
    stakeholders: list,
    byQuadrant,
    supportivePower,
    opposingPower,
    neutralPower,
    netPowerBalance: supportivePower - opposingPower,
    unalignedKeyPlayers,
    overdueComms,
    dueSoonComms,
  };
}

/**
 * Evaluate Toyota 5-Whys depth and Reason Swiss-Cheese systemic barrier quality.
 */
export function evaluateRca(rca = {}, kind = 'incident') {
  const whys = Array.isArray(rca?.whys)
    ? rca.whys.map((w) => (typeof w === 'string' ? w.trim() : '')).filter(Boolean)
    : [];
  const problemStatement = typeof rca?.problemStatement === 'string' ? rca.problemStatement.trim() : '';
  const rootCause = typeof rca?.rootCause === 'string' ? rca.rootCause.trim() : '';
  const systemicBarrier = typeof rca?.systemicBarrier === 'string' ? rca.systemicBarrier.trim() : '';
  const preventiveAction = typeof rca?.preventiveAction === 'string' ? rca.preventiveAction.trim() : '';

  const checks = [
    { key: 'problem', label: 'Observable problem statement recorded', met: problemStatement.length >= 8 },
    {
      key: 'whys',
      label: kind === 'incident' ? 'Causal chain explored (at least 3 Whys)' : 'Causal drivers explored',
      met: kind === 'incident' ? whys.length >= 3 : whys.length >= 1 || rootCause.length >= 8,
    },
    { key: 'rootCause', label: 'Underlying systemic root cause named', met: rootCause.length >= 8 },
    { key: 'barrier', label: 'Missing guardrail / Swiss-Cheese barrier identified', met: systemicBarrier.length >= 8 },
    { key: 'preventive', label: 'Concrete preventive action specified', met: preventiveAction.length >= 8 },
  ];

  const metCount = checks.filter((c) => c.met).length;
  const combinedText = [problemStatement, ...whys, rootCause, systemicBarrier, preventiveAction].join(' ');
  const hasBlameLanguage = BLAME_PATTERN.test(combinedText);

  return {
    problemStatement,
    whys,
    whyDepth: whys.length,
    rootCause,
    systemicBarrier,
    preventiveAction,
    checks,
    metCount,
    completenessPct: Math.round((metCount / checks.length) * 100),
    blameWarning: hasBlameLanguage
      ? 'Phrasing suggests individual blame. Reframe around the missing process guardrail, check, or capacity constraint (Reason, 1990).'
      : null,
  };
}

/**
 * Safely resolve an allowed entity inside `state` without ever reading
 * confidential `conflicts` or anonymous `pulses`.
 */
export function resolveLinkedEntity(state, entityType, entityId) {
  if (!state || !entityType || !entityId || FORBIDDEN_LINK_TYPES.includes(entityType)) return null;
  switch (entityType) {
    case 'case': {
      const rec = (state.cases || []).find((c) => c.id === entityId);
      return rec
        ? { type: 'case', id: rec.id, title: rec.title, status: CASE_STATUS_LABELS[rec.status] || rec.status, route: `#/cases/${rec.id}`, raw: rec }
        : null;
    }
    case 'decision': {
      const rec = (state.decisions || []).find((d) => d.id === entityId);
      if (!rec) return null;
      const status = !rec.chosen ? 'Open' : rec.reviewedOn ? `Reviewed (${rec.outcome})` : 'Decided';
      return { type: 'decision', id: rec.id, title: rec.title, status, route: '#/decisions', raw: rec };
    }
    case 'delegation': {
      const rec = (state.delegations || []).find((d) => d.id === entityId);
      return rec
        ? { type: 'delegation', id: rec.id, title: rec.title, status: rec.status, route: '#/delegations', raw: rec }
        : null;
    }
    case 'goal': {
      const rec = (state.goals || []).find((g) => g.id === entityId);
      return rec
        ? { type: 'goal', id: rec.id, title: rec.title, status: rec.status === 'done' ? 'Done' : rec.confidence, route: '#/goals', raw: rec }
        : null;
    }
    case 'growth': {
      const rec = (state.growthPlans || []).find((g) => g.id === entityId);
      return rec
        ? { type: 'growth', id: rec.id, title: rec.goal, status: rec.status, route: '#/growth', raw: rec }
        : null;
    }
    case 'person': {
      const rec = (state.people || []).find((p) => p.id === entityId);
      return rec
        ? { type: 'person', id: rec.id, title: rec.name, status: rec.status, route: `#/people/${rec.id}`, raw: rec }
        : null;
    }
    case 'oneonone': {
      const rec = (state.oneOnOnes || []).find((m) => m.id === entityId);
      return rec
        ? { type: 'oneonone', id: rec.id, title: `1:1 (${rec.date})`, status: rec.status, route: '#/oneonones', raw: rec }
        : null;
    }
    case 'feedback': {
      const rec = (state.feedback || []).find((f) => f.id === entityId);
      return rec
        ? { type: 'feedback', id: rec.id, title: rec.situation || 'Feedback note', status: rec.kind, route: '#/feedback', raw: rec }
        : null;
    }
    case 'onboarding': {
      const rec = (state.onboarding || []).find((o) => o.id === entityId);
      return rec
        ? { type: 'onboarding', id: rec.id, title: rec.label || `30-60-90 (${rec.kind || 'new-hire'})`, status: rec.status, route: '#/onboarding', raw: rec }
        : null;
    }
    case 'review': {
      const rec = (state.reviews || []).find((r) => r.id === entityId);
      return rec
        ? { type: 'review', id: rec.id, title: rec.cycleLabel || 'Performance review', status: rec.status, route: `#/reviews/${rec.id}`, raw: rec }
        : null;
    }
    case 'readiness': {
      const rec = (state.readiness || []).find((r) => r.id === entityId);
      return rec
        ? { type: 'readiness', id: rec.id, title: rec.seat || 'Readiness seat', status: rec.rating, route: '#/readiness', raw: rec }
        : null;
    }
    case 'recognition': {
      const rec = (state.recognition || []).find((r) => r.id === entityId);
      return rec
        ? { type: 'recognition', id: rec.id, title: rec.what || 'Recognition', status: rec.date, route: '#/recognition', raw: rec }
        : null;
    }
    default:
      return null;
  }
}

/**
 * Return resolved cross-module links touching `(entityType, entityId)`.
 */
export function linksForEntity(state, entityType, entityId) {
  if (!state || !Array.isArray(state.links) || FORBIDDEN_LINK_TYPES.includes(entityType)) return [];
  const results = [];
  for (const link of state.links) {
    if (!link || FORBIDDEN_LINK_TYPES.includes(link.sourceType) || FORBIDDEN_LINK_TYPES.includes(link.targetType)) {
      continue;
    }
    if (link.sourceType === entityType && link.sourceId === entityId) {
      const peer = resolveLinkedEntity(state, link.targetType, link.targetId);
      if (peer) {
        results.push({
          link,
          direction: 'outgoing',
          relation: link.relation,
          relationLabel: LINK_RELATION_LABELS[link.relation] || link.relation,
          peer,
        });
      }
    } else if (link.targetType === entityType && link.targetId === entityId) {
      const peer = resolveLinkedEntity(state, link.sourceType, link.sourceId);
      if (peer) {
        results.push({
          link,
          direction: 'incoming',
          relation: link.relation,
          relationLabel: LINK_RELATION_LABELS[link.relation] || link.relation,
          peer,
        });
      }
    }
  }
  return results;
}

export function linkedRecordsForCase(state, caseId) {
  return linksForEntity(state, 'case', caseId);
}

/**
 * Full analytical summary for a single Operational Case.
 */
export function summarizeCase(caseRecord, state, now = new Date()) {
  const todayStr = dayKey(now);
  const open = isCaseOpen(caseRecord);
  const fmea = computeFmea(caseRecord?.fmea);
  const pert = computePertImpact(caseRecord?.financial, fmea);
  const coalition = summarizeStakeholderCoalition(caseRecord?.stakeholders, todayStr, { caseOpen: open });
  const rca = evaluateRca(caseRecord?.rca, caseRecord?.kind);
  const links = state ? linkedRecordsForCase(state, caseRecord.id) : [];

  const owner = state && caseRecord?.ownerId
    ? (state.people || []).find((p) => p.id === caseRecord.ownerId) || null
    : null;
  const linkedGoal = state && caseRecord?.linkedGoalId
    ? (state.goals || []).find((g) => g.id === caseRecord.linkedGoalId) || null
    : null;

  const hasMitigationDelegation = links.some((item) => item.peer.type === 'delegation' && item.relation === 'mitigates');
  const hasDecisionRecord = links.some((item) => item.peer.type === 'decision' && (item.relation === 'decides' || item.relation === 'escalates-from'));
  const reviewOverdue = Boolean(open && caseRecord?.reviewOn && caseRecord.reviewOn < todayStr);
  const daysUntilReview = open && caseRecord?.reviewOn ? calendarDiffDays(todayStr, caseRecord.reviewOn) : null;

  const needsAttention = Boolean(
    open && (
      fmea.actionPriority === 'high' ||
      reviewOverdue ||
      coalition.overdueComms.length > 0 ||
      coalition.unalignedKeyPlayers.some((s) => s.needsImmediateAlignment)
    ),
  );

  return {
    caseRecord,
    open,
    owner,
    linkedGoal,
    fmea,
    pert,
    coalition,
    rca,
    links,
    hasMitigationDelegation,
    hasDecisionRecord,
    reviewOverdue,
    daysUntilReview,
    needsAttention,
  };
}

/**
 * Portfolio rollup across all Operational Cases in the workspace.
 */
export function casesRollup(state, now = new Date()) {
  const all = (state?.cases || []).map((c) => summarizeCase(c, state, now));
  const open = all.filter((s) => s.open);
  const resolved = all.filter((s) => !s.open);
  const highPriority = open.filter((s) => s.fmea.actionPriority === 'high');
  const unmitigatedHigh = highPriority.filter((s) => !s.hasMitigationDelegation && !s.rca.preventiveAction);
  const reviewDue = open.filter((s) => s.reviewOverdue);
  const commsOverdueCount = open.reduce((sum, s) => sum + s.coalition.overdueComms.length, 0);
  const unalignedKeyCount = open.reduce((sum, s) => sum + s.coalition.unalignedKeyPlayers.length, 0);
  const attention = open.filter((s) => s.needsAttention);

  const expectedExposure = round2(open.reduce((sum, s) => sum + s.pert.cost.expected, 0));
  const p90Exposure = round2(open.reduce((sum, s) => sum + s.pert.cost.p90, 0));
  const expectedUnmitigatedLoss = round2(open.reduce((sum, s) => sum + s.pert.expectedUnmitigatedLoss, 0));
  const expectedLossAvoided = round2(open.reduce((sum, s) => sum + s.pert.expectedLossAvoided, 0));
  const totalMitigationCost = round2(open.reduce((sum, s) => sum + s.pert.mitigationCost, 0));
  const netRiskAdjustedValue = round2(expectedLossAvoided - totalMitigationCost);
  const expectedDivertedDays = round2(open.reduce((sum, s) => sum + s.pert.capacity.expected, 0));
  const p90DivertedDays = round2(open.reduce((sum, s) => sum + s.pert.capacity.p90, 0));

  const primaryCurrency = open.find((s) => s.pert.hasFinancialEstimate)?.pert.currency
    || all[0]?.pert.currency
    || 'USD';

  return {
    all,
    open,
    resolved,
    highPriority,
    unmitigatedHigh,
    reviewDue,
    commsOverdueCount,
    unalignedKeyCount,
    attention,
    expectedExposure,
    p90Exposure,
    expectedUnmitigatedLoss,
    expectedLossAvoided,
    totalMitigationCost,
    netRiskAdjustedValue,
    expectedDivertedDays,
    p90DivertedDays,
    primaryCurrency,
  };
}

/**
 * Active Operational Cases owned by or involving a specific team member, for
 * blameless 1:1 prep and coaching context.
 */
export function openCasesForPerson(state, personId, now = new Date()) {
  if (!state || !personId) return [];
  return (state.cases || [])
    .filter(
      (c) =>
        isCaseOpen(c) &&
        (c.ownerId === personId || (Array.isArray(c.involvedPersonIds) && c.involvedPersonIds.includes(personId))),
    )
    .map((c) => summarizeCase(c, state, now))
    .sort((a, b) => {
      const rank = { high: 3, medium: 2, low: 1 };
      return (rank[b.fmea.actionPriority] - rank[a.fmea.actionPriority]) || (b.fmea.rpn - a.fmea.rpn);
    });
}
