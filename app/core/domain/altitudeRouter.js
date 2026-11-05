/**
 * app/core/domain/altitudeRouter.js — The Altitude Router (Schema v88, ADR-0081).
 *
 * WHAT GAP THIS CLOSES
 * --------------------
 * ADR-0075/0076/0080 built a real reporting tree, enforced ABAC and
 * role-tiered operating loops. `intake.js` built a deterministic natural-
 * language classifier that routes a situation note to MODULES with explained
 * evidence — but it names only a flat `ownerId`. It never asks which
 * organizational altitude should own the work, never resolves a seat in the
 * reporting tree, and never prints what each level above will see. In the
 * searched 2026 category (ServiceNow Now Assist / Predictive Intelligence,
 * Moveworks Intelligent Triage, Zendesk Intelligent Triage, Salesforce
 * Agentforce Service, Forethought, Aisera, Jira Service Management), AI triage
 * routes to an *assignment group* — a flat queue. Viva Glint / Viva Insights,
 * Visier, Culture Amp and Lattice apply confidentiality thresholds and
 * hierarchy roll-ups to SURVEY REPORTING, not to routing a decision. Neither
 * side joins the two dimensions. This engine does, on-device, with no network
 * and no generative model.
 *
 * NAMED TECHNIQUES (Section 0.2)
 * ------------------------------
 *  - Jaques' time-span of discretion (1956): altitude is a HORIZON (7/30/90/
 *    180/365 days), inferred from the time-span language in the note, not from
 *    a job title badge. A "board / annual" note cannot be owned by a seven-day
 *    horizon.
 *  - Weighted-evidence lexicon classification + NegEx-style negation windowing
 *    (Chapman et al. 2001): "this is not a board decision" cannot create a CEO
 *    route.
 *  - Softmax temperature scaling with uniform-prior shrinkage (Laplace-style):
 *    probability-like scores with honest thin-evidence behaviour.
 *  - Human-in-the-loop uncertainty gates (rule / completeness / agreement /
 *    stakes checks, 2026 ITSM practice): confidence band, top-1/top-2 margin,
 *    stakes floor and privacy wall each refuse to auto-decide.
 *  - Tarjan-offline-style lowest common ancestor (reused from `chain.js`) for
 *    cross-span ownership: work naming two units belongs to their common
 *    leader exactly once, never to a peer span.
 *  - Wilson score interval (1927), Brier skill score vs a base-rate reference
 *    (1950), and an ordinal rank-distance misroute cost: the router grades
 *    itself OUT OF SAMPLE, and "frontline instead of chief" is priced worse
 *    than "VP instead of chief".
 *  - ADR-0076 disclosure ladder: names (rank 1–2), unit counts (rank 3),
 *    aggregates (rank 4–5). The ladder is printed per ancestor BEFORE commit.
 *
 * Purity: no DOM, no storage, no clock globals, no network. Every figure is
 * re-derived on read; the raw situation note never leaves the device and is
 * never included in the brief or CSV.
 */

import { analyzeIntakeText, splitSentences, stem, toCaseInput } from './intake.js';
import { buildChain, escalationTarget, responsibleNodeId, LEADER_ID } from './chain.js';
import { buildSeats, activeSeat } from './seat.js';
import { ALTITUDES, altitudeByKey, altitudeRank } from './chainRegistry.js';
import { dayKey, addDays, weekKey, round } from '../time.js';
import {
  ROUTER_VERSION, ROUTER_EVENTS, ROUTER_LIMITS, ROUTER_RULES,
  ROUTER_CONVENTION_DEFAULTS, ROUTER_DISCLOSURE, routerFingerprint,
} from './altitudeRouterRegistry.js';

/* ------------------------------------------------------------- conventions */

export function routingConventions(settings = {}) {
  const d = ROUTER_CONVENTION_DEFAULTS;
  const ef = Number(settings?.routingEvidenceFloor);
  const int = (v, min, max, fallback) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  return {
    evidenceFloor: Number.isFinite(ef) && ef >= 1 && ef <= 10 ? ef : d.routingEvidenceFloor,
    ambiguityMargin: 0.10,
    reliabilityFloorPct: int(settings?.routingReliabilityFloorPct, 50, 95, d.routingReliabilityFloorPct),
    calibrationFloorN: int(settings?.routingCalibrationFloorN, 3, 20, d.routingCalibrationFloorN),
    reviewDays: int(settings?.routingReviewDays, 3, 90, d.routingReviewDays),
    autoPropagate: settings?.routingAutoPropagate !== false,
  };
}

/* -------------------------------------------------------------- 1. cues */

/**
 * Five horizon lexicons. Weights are declared conventions, not fitted
 * coefficients; each match carries its sentence, offsets and exact term so the
 * UI can show WHY. Phrases are matched as consecutive stemmed token runs.
 */
export const ROUTING_ALTITUDES = Object.freeze(ALTITUDES.map((a) => {
  const cues = {
    frontline: {
      'shift': 3, 'today': 2, 'tomorrow': 2, 'this week': 3, 'roster': 3,
      'handover': 2, 'handoff': 2, 'station': 3, 'line': 1, 'operator': 3,
      'absent': 2, 'call-in': 2, 'cover': 2, 'standup': 3, 'daily': 2,
      'task': 1, 'checklist': 2, 'shift lead': 3, 'machine': 2, 'counter': 1,
      'on the floor': 3, 'clock in': 2, 'break': 1,
    },
    manager: {
      'sprint': 3, 'this month': 3, 'monthly': 2, 'cycle': 2, 'throughput': 3,
      'backlog': 2, 'cross-team': 3, 'capacity': 2, 'review cycle': 3,
      'performance review': 3, 'sequencing': 2, 'resource': 2, 'team': 1,
      'workload': 2, 'queue': 2, 'handoff between': 3, 'two teams': 3,
      'coordinate': 2, 'prioritise': 2, 'prioritize': 2, 'staffing': 2,
    },
    director: {
      'this quarter': 3, 'quarter': 2, 'multi-team': 3, 'cross-functional': 3,
      'org design': 3, 'pipeline': 2, 'talent pipeline': 3, 'process': 2,
      'standard': 2, 'alignment': 2, 'structural': 3, 'systemic': 2,
      'three teams': 3, 'function': 1, 'talent review': 3, 'org-wide': 2,
      'half-year': 2, 'roadmap': 2, 'policy': 2,
    },
    executive: {
      'portfolio': 3, 'investment': 3, 'roi': 3, 'capital': 3, 'budget envelope': 3,
      'half-year': 2, 'board input': 3, 'org-wide risk': 3, 'strategic bet': 3,
      'funding': 2, 'reallocation': 3, 'enterprise risk': 3, 'p&l': 3,
      'trade-off': 2, 'tradeoff': 2, 'resource allocation': 3, 'headcount': 2,
      'division': 2, 'margin': 2,
    },
    chief: {
      'company-wide': 4, 'enterprise': 3, 'investor': 4, 'board': 3, 'ceo': 3,
      'annual': 3, 'this year': 3, 'company': 2, 'shareholder': 4,
      'strategy': 2, 'culture across': 3, 'merger': 4, 'acquisition': 4,
      'enterprise risk': 3, 'five-year': 4, 'whole organisation': 4,
      'whole organization': 4, 'group-wide': 3, 'chair': 3,
    },
  }[a.key] || {};
  return Object.freeze({
    key: a.key, rank: a.rank, label: a.label, shortLabel: a.shortLabel,
    horizonDays: a.horizonDays, unitLabel: a.unitLabel,
    decisionForm: a.decisionForm, decisionQuestion: a.decisionQuestion,
    cues: Object.freeze(cues),
  });
}));

const NEGATION = new Set([
  'not', 'no', 'never', 'without', 'isnt', 'wasnt', 'arent', 'werent',
  'dont', 'doesnt', 'didnt', 'cannot', 'cant', 'neither', 'nor', 'hardly',
  "isn't", "wasn't", "don't", "doesn't", "didn't", "can't", 'non',
]);
const TOKEN_RE = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)?/g;

function tokensOf(sentence) {
  const out = [];
  const text = sentence.text;
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    out.push({ literal: m[0], lower: m[0].toLowerCase().replace(/[’']/g, ''), stem: stem(m[0]), start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/** NegEx-style: a negation cue inside the preceding three tokens flips one hit. */
function isNegated(tokens, index) {
  for (let j = Math.max(0, index - 3); j < index; j += 1) {
    if (NEGATION.has(tokens[j].lower)) return true;
  }
  return false;
}

function cueHits(sentences, cues) {
  const entries = Object.entries(cues).map(([phrase, weight]) => ({ phrase, weight, parts: phrase.split(/\s+/).map(stem) }));
  const hits = [];
  for (const sentence of sentences) {
    const tokens = tokensOf(sentence);
    if (!tokens.length) continue;
    for (const cue of entries) {
      const n = cue.parts.length;
      for (let i = 0; i + n <= tokens.length; i += 1) {
        let match = true;
        for (let j = 0; j < n; j += 1) {
          if (tokens[i + j].stem !== cue.parts[j]) { match = false; break; }
        }
        if (!match) continue;
        hits.push({
          term: cue.phrase, weight: cue.weight, sentenceIndex: sentence.index,
          start: sentence.start + tokens[i].start, end: sentence.start + tokens[i + n - 1].end,
          sentence: sentence.text.slice(0, 240), negated: isNegated(tokens, i),
        });
        i += n - 1;
      }
    }
  }
  return hits;
}

function softmaxWithShrinkage(raw, temperature = 2.2, shrinkage = 0.08) {
  const k = raw.length || 1;
  const exps = raw.map((r) => Math.exp(Math.max(0, r) / temperature));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((e) => (e / sum) * (1 - shrinkage) + shrinkage / k);
}

/**
 * Infer the altitude from the note's time-span language. Returns the FULL
 * distribution and evidence, not just a winner: the view prints what lost.
 */
export function inferAltitude(text, { conventions = routingConventions() } = {}) {
  const sentences = splitSentences(String(text ?? '').slice(0, ROUTER_LIMITS.noteChars));
  const scored = ROUTING_ALTITUDES.map((alt) => {
    const hits = cueHits(sentences, alt.cues);
    const positive = hits.filter((h) => !h.negated);
    const negated = hits.filter((h) => h.negated);
    const rawScore = Math.max(0, positive.reduce((s, h) => s + h.weight, 0) - negated.reduce((s, h) => s + h.weight * 0.5, 0));
    return { key: alt.key, rank: alt.rank, label: alt.label, horizonDays: alt.horizonDays,
      rawScore, hits: positive.length, negatedHits: negated.length,
      evidence: hits.slice(0, ROUTER_LIMITS.evidenceSpans) };
  });
  const probabilities = softmaxWithShrinkage(scored.map((s) => s.rawScore));
  const distribution = scored.map((s, i) => ({ ...s, probability: Math.round(probabilities[i] * 1000) / 1000 }))
    .sort((a, b) => b.probability - a.probability);
  const primary = distribution[0];
  const runnerUp = distribution[1];
  const margin = Math.round((primary.probability - runnerUp.probability) * 1000) / 1000;
  const totalEvidenceWeight = scored.reduce((s, x) => s + x.rawScore, 0);
  const insufficient = totalEvidenceWeight < conventions.evidenceFloor || primary.hits === 0;
  let band = 'none';
  if (!insufficient) {
    if (primary.probability >= 0.55 && margin >= 0.10) band = 'high';
    else if (primary.probability >= 0.34) band = 'medium';
    else band = 'low';
  }
  const ambiguous = !insufficient && margin < conventions.ambiguityMargin;
  return {
    detectedAltitudeKey: insufficient ? null : primary.key,
    detectedRank: insufficient ? null : primary.rank,
    altitudeConfidence: Math.round(primary.probability * 1000) / 1000,
    altitudeBand: band, altitudeMargin: margin,
    evidenceWeight: totalEvidenceWeight,
    distribution: distribution.map((d) => ({ key: d.key, rank: d.rank, label: d.label, horizonDays: d.horizonDays,
      probability: d.probability, rawScore: d.rawScore, hits: d.hits, negatedHits: d.negatedHits,
      evidence: d.evidence.filter((e) => !e.negated).slice(0, 4).map((e) => ({ term: e.term, weight: e.weight, sentenceIndex: e.sentenceIndex, start: e.start, end: e.end })) })),
    primaryEvidence: primary.evidence.filter((e) => !e.negated).slice(0, ROUTER_LIMITS.evidenceSpans),
    negatedEvidence: primary.evidence.filter((e) => e.negated).slice(0, 4),
    insufficient, ambiguous,
    refusalReasons: [
      insufficient ? `Altitude evidence weight ${round(totalEvidenceWeight, 1)} is below the ${conventions.evidenceFloor} floor; choose the altitude yourself` : null,
      ambiguous ? `The top two altitudes are within ${round(margin * 100, 1)} points; a human should choose` : null,
    ].filter(Boolean),
  };
}

/* ------------------------------------------------- 2. stakes + LCA floors */

/** A consequence that outlives a 30-day cycle cannot be owned below rank 3. */
const CATEGORY_ALTITUDE_FLOOR = Object.freeze({
  finance: 4, change: 3, stakeholder: 3, attrition: 3, vendor: 2, hiring: 2,
});

function stakesFloor(analysis) {
  const reasons = [];
  let floor = 0;
  if (analysis.stakesReviewRequired) { floor = Math.max(floor, 3); reasons.push('Safety or legal stakes cannot be owned below the director horizon (90 days).'); }
  const categoryFloor = CATEGORY_ALTITUDE_FLOOR[analysis.primaryCategoryId] || 0;
  if (categoryFloor > floor) {
    floor = categoryFloor;
    reasons.push(`“${analysis.primaryCategoryId}” consequences outlive a 30-day cycle; the Jaques horizon floor is rank ${floor}.`);
  }
  return { floor, reasons };
}

/**
 * Resolve a REAL seat path in the reporting tree. Cross-span work is owned by
 * the LCA exactly once. The path runs from the owning seat up to the enterprise
 * root, so RULE-AR-01 can write one typed edge per ancestor in one transaction.
 */
export function resolveSeatPath(state, { analysis, altitude, now = new Date(), settings = null } = {}) {
  const built = buildSeats(state, { now, settings });
  const chain = built.chain;
  const people = (analysis?.entities?.people || []).map((p) => p.personId).filter(Boolean);
  const operating = activeSeat(built);
  const ownerNodeId = people.length ? responsibleNodeId(chain, people)
    : (operating && !operating.fullAccess ? operating.id : LEADER_ID);
  const lcaRank = altitudeRank(chain.nodes.get(ownerNodeId)?.altitude) || 0;
  const stake = stakesFloor(analysis || {});
  const inferredRank = altitude.detectedRank || Math.min(5, Math.max(1, lcaRank || 1));
  const effectiveRank = Math.max(inferredRank, lcaRank, stake.floor);
  const escalated = escalationTarget(chain, ownerNodeId, effectiveRank);
  // Start at the declared seat for an unnamed situation, then apply the same
  // horizon and stakes floors. Never manufacture a seat the roster lacks.
  const ownerSeatId = escalated.nodeId;
  const resolved = built.byId.get(ownerSeatId) || built.byId.get(LEADER_ID) || operating;

  const path = [];
  const seen = new Set();
  let cursor = resolved?.id || LEADER_ID;
  let guard = 0;
  while (cursor && !seen.has(cursor) && guard < ROUTER_LIMITS.ladder + 4) {
    seen.add(cursor); guard += 1;
    const seat = built.byId.get(cursor);
    const node = chain.nodes.get(cursor);
    if (seat) {
      const rank = seat.rank || altitudeRank(node?.altitude) || 1;
      const disclosure = rank <= 2 ? 'names' : rank === 3 ? 'unit' : 'aggregate';
      path.push({ seatId: seat.id, rank, altitudeKey: seat.altitudeKey || altitudeByKey('chief')?.key || 'chief',
        label: seat.label || seat.name || 'Workspace leader', disclosure,
        horizonDays: seat.horizonDays || null, name: seat.name || '' });
    }
    const parent = node?.parentId || null;
    if (!parent || parent === cursor) break;
    cursor = parent;
  }
  if (!path.length) {
    path.push({ seatId: LEADER_ID, rank: 5, altitudeKey: 'chief', label: 'Workspace leader', disclosure: 'aggregate', horizonDays: 365, name: '' });
  }
  return {
    built, ownerNodeId, ownerSeatId, ownerSeatLabel: resolved?.label || 'Workspace leader',
    effectiveRank, inferredRank, lcaRank, stakesFloorRank: stake.floor,
    stakesReasons: stake.reasons, peopleMatched: people,
    seatPath: path.slice(0, ROUTER_LIMITS.ladder),
    ladderTruncated: path.length > ROUTER_LIMITS.ladder,
    disclosureText: ROUTER_DISCLOSURE,
  };
}

/* ------------------------------------------------------------ 3. analysis */

/**
 * The joint report: module classification (reused, not re-implemented) ×
 * altitude inference × resolved seat ladder. Pure; safe to call on every
 * keystroke preview in the browser and inside node tests.
 */
export function analyzeRouting(text, state = {}, { now = new Date(), settings = null, seatId = null } = {}) {
  const sourceText = String(text ?? '').slice(0, ROUTER_LIMITS.noteChars);
  const conventions = routingConventions(settings || state?.settings || {});
  const analysis = analyzeIntakeText(sourceText, state, { now });
  const altitude = inferAltitude(sourceText, { conventions });
  const resolved = resolveSeatPath(state, { analysis, altitude, now, settings: settings || state?.settings || {} });
  const moduleRoutes = (analysis.routingPlan || [])
    .filter((r) => !r.privacyNotice)
    .slice(0, ROUTER_LIMITS.moduleRoutes)
    .map((r) => ({ categoryId: r.categoryId, module: r.module, route: r.route, probability: r.probability }));
  const sourceHash = routerFingerprint(sourceText);
  // The fingerprint deliberately excludes the calendar day: a plan saved
  // yesterday must still be confirmable today. What MUST NOT drift is the
  // source note, the module classification, the inferred altitude or the
  // reporting tree — a reorganisation changes the seat path and therefore
  // refuses stale confirmation instead of silently routing into a new org.
  const ladderInput = JSON.stringify([
    sourceHash, analysis.primaryCategoryId, altitude.detectedAltitudeKey,
    resolved.ownerSeatId, resolved.seatPath.map((p) => p.seatId), ROUTER_VERSION,
  ]);
  const fingerprint = routerFingerprint(ladderInput);
  const privacyBlocked = Boolean(analysis.privacyBlocked || analysis.conflictPrivacyWall);
  const needsReview = altitude.insufficient || altitude.ambiguous || altitude.altitudeBand === 'low'
    || analysis.stakesReviewRequired || privacyBlocked || resolved.stakesReasons.length > 0;
  const canConfirm = !privacyBlocked && sourceText.trim().length >= 4;
  const refusalReasons = [
    ...altitude.refusalReasons,
    ...resolved.stakesReasons,
    privacyBlocked ? 'Confidential conflict language: LeadOS never auto-creates a conflict record. Open the confidential conflict workspace yourself.' : null,
  ].filter(Boolean).slice(0, ROUTER_LIMITS.refusalReasons);

  return {
    ok: true, engineVersion: ROUTER_VERSION, analyzedAt: now.toISOString(),
    sourceText, sourceLength: sourceText.length, sourceHash, fingerprint,
    analysis, altitude, resolved, moduleRoutes, conventions,
    primaryCategoryId: analysis.primaryCategoryId,
    primaryModule: analysis.categories?.[0]?.module || '',
    primaryRoute: analysis.categories?.[0]?.route || '',
    verdict: altitude.altitudeBand, needsReview, canConfirm, privacyBlocked,
    refusalReasons,
    seatId: seatId || resolved.ownerSeatId,
    disclosure: ROUTER_DISCLOSURE,
  };
}

/** Build the persisted plan/ledger row from a report. No id/timestamps here. */
export function routerPlanRecord(report) {
  const { analysis, altitude, resolved } = report;
  return {
    status: 'analyzed', engineVersion: ROUTER_VERSION,
    sourceHash: report.sourceHash, fingerprint: report.fingerprint,
    sourceText: report.sourceText, sourceLength: report.sourceLength,
    primaryCategoryId: report.primaryCategoryId, primaryModule: report.primaryModule, primaryRoute: report.primaryRoute,
    moduleRoutes: report.moduleRoutes,
    detectedAltitudeKey: altitude.detectedAltitudeKey, confirmedAltitudeKey: null, gradedAltitudeKey: null,
    altitudeConfidence: altitude.altitudeConfidence, altitudeBand: altitude.altitudeBand,
    altitudeMargin: altitude.altitudeMargin, evidenceWeight: altitude.evidenceWeight,
    altitudeEvidence: altitude.primaryEvidence.map((e) => ({ term: e.term, weight: e.weight, sentenceIndex: e.sentenceIndex, negated: false })),
    refusalReasons: report.refusalReasons, refused: altitude.insufficient, needsReview: report.needsReview,
    stakesReviewRequired: Boolean(analysis.stakesReviewRequired), privacyBlocked: report.privacyBlocked,
    stakesFloorRank: resolved.stakesFloorRank,
    ownerSeatId: resolved.ownerSeatId, ownerSeatLabel: resolved.ownerSeatLabel,
    effectiveRank: resolved.effectiveRank,
    seatPath: resolved.seatPath.map((p) => ({ seatId: p.seatId, rank: p.rank, altitudeKey: p.altitudeKey,
      label: p.label, disclosure: p.disclosure, horizonDays: p.horizonDays })),
    confirmedCaseId: null, confirmedOn: null, gradedOn: null, gradeNote: '', correct: null, overrideCorrect: null,
  };
}

/** A minimal, safe case input even when the text was too thin for a suggestion. */
export function routingCaseInput(report, overrides = {}) {
  const base = toCaseInput(report.analysis, overrides);
  if (base) return base;
  const title = (overrides.title || String(report.sourceText).trim().slice(0, 90) || 'Manually routed situation').slice(0, 200);
  return {
    kind: overrides.kind || 'risk', title,
    summary: overrides.summary !== undefined ? overrides.summary : String(report.sourceText).slice(0, 4000),
    ownerId: overrides.ownerId || null, involvedPersonIds: overrides.involvedPersonIds || [],
    linkedGoalId: null, openedOn: overrides.openedOn || dayKey(new Date(report.analyzedAt)),
    reviewOn: overrides.reviewOn || addDays(dayKey(new Date(report.analyzedAt)), 14),
    fmea: { severity: Number(overrides.fmeaSeverity) || 5, probability: 5, detectability: 5 },
    autoPropagate: overrides.autoPropagate !== false,
  };
}

/* -------------------------------------------------- 4. out-of-sample grade */

function wilson(correctN, n, z = 1.96) {
  if (!n) return { lo: null, hi: null };
  const p = correctN / n;
  const den = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / den;
  const spread = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den;
  return { lo: round(Math.max(0, centre - spread) * 100, 1), hi: round(Math.min(1, centre + spread) * 100, 1) };
}

/**
 * The routing ledger grades the ROUTER, not a person. Each confirmed plan that
 * is later given a "correct altitude" is one Bernoulli trial of the engine's
 * inference, plus an ordinal rank-distance cost and a human-override lift.
 * Wilson interval + Brier skill vs the pooled base rate; refused below n=5.
 */
export function routingCalibration(state = {}, { now = new Date(), settings = null } = {}) {
  const conv = routingConventions(settings || state?.settings || {});
  const plans = Array.isArray(state.altitudeRoutingPlans) ? state.altitudeRoutingPlans : [];
  const graded = plans.filter((p) => p && p.status === 'confirmed' && p.gradedOn && p.gradedAltitudeKey)
    .sort((a, b) => String(a.gradedOn).localeCompare(String(b.gradedOn)) || String(a.id).localeCompare(String(b.id)));
  const totalCorrect = graded.filter((p) => p.correct === true).length;
  const baseRate = graded.length ? totalCorrect / graded.length : null;

  // Out-of-sample Brier: each row is forecast by the STRICTLY-PRIOR correct
  // rate of its own detected-altitude cell and the pooled baseline. Grades
  // on the same day are simultaneous: none may forecast another.
  const running = new Map();
  let brierModel = 0; let brierBase = 0; let forecastN = 0;
  let priorTotal = 0; let priorCorrect = 0;
  let pendingDay = null; let dayRows = [];
  const flushDay = () => {
    for (const row of dayRows) {
      const prior = running.get(row.key) || { n: 0, correct: 0 };
      running.set(row.key, { n: prior.n + 1, correct: prior.correct + row.outcome });
      priorTotal += 1; priorCorrect += row.outcome;
    }
    dayRows = [];
  };
  let rankErrorSum = 0; let underRouted = 0; let overRouted = 0; let overrideHelped = 0; let overrides = 0;
  const confusion = [];
  for (const p of graded) {
    const day = String(p.gradedOn).slice(0, 10);
    if (pendingDay !== null && pendingDay !== day) flushDay();
    pendingDay = day;
    const key = p.detectedAltitudeKey || 'refused';
    const prior = running.get(key) || { n: 0, correct: 0 };
    const pModel = prior.n ? (prior.correct + 1) / (prior.n + 2) : 0.5; // Laplace-smoothed prior
    const outcome = p.correct === true ? 1 : 0;
    if (prior.n > 0) {
      brierModel += (pModel - outcome) ** 2;
      brierBase += ((priorCorrect / priorTotal) - outcome) ** 2;
      forecastN += 1;
    }
    dayRows.push({ key, outcome });
    const detectedRank = altitudeRank(p.detectedAltitudeKey) || 0;
    const gradedRank = altitudeRank(p.gradedAltitudeKey) || 0;
    if (detectedRank && gradedRank) {
      const err = Math.abs(detectedRank - gradedRank);
      rankErrorSum += err;
      if (detectedRank < gradedRank) underRouted += 1;
      if (detectedRank > gradedRank) overRouted += 1;
    }
    if (p.confirmedAltitudeKey && p.confirmedAltitudeKey !== p.detectedAltitudeKey) {
      overrides += 1;
      if (p.overrideCorrect === true && p.correct !== true) overrideHelped += 1;
    }
    confusion.push({ detected: p.detectedAltitudeKey || 'refused', graded: p.gradedAltitudeKey, correct: p.correct === true });
  }

  const cells = ALTITUDES.map((a) => {
    const rows = graded.filter((p) => (p.detectedAltitudeKey || 'refused') === a.key);
    const n = rows.length;
    const correctN = rows.filter((p) => p.correct === true).length;
    const refused = n < conv.calibrationFloorN;
    const interval = wilson(correctN, n);
    const ratePct = refused ? null : round((correctN / n) * 100, 1);
    const meanConfidence = rows.length ? round(rows.reduce((s, p) => s + (Number(p.altitudeConfidence) || 0), 0) / rows.length * 100, 1) : null;
    return {
      key: a.key, rank: a.rank, label: a.label, horizonDays: a.horizonDays,
      n, correctN, refused, ratePct, wilsonLo: interval.lo, wilsonHi: interval.hi,
      meanConfidencePct: meanConfidence, floorN: conv.calibrationFloorN,
      belowFloor: !refused && ratePct < conv.reliabilityFloorPct,
      reliabilityFloorPct: conv.reliabilityFloorPct,
      members: rows.map((p) => ({ id: p.id.slice(-6), gradedOn: p.gradedOn, graded: p.gradedAltitudeKey,
        correct: p.correct === true, confidencePct: round((Number(p.altitudeConfidence) || 0) * 100, 1) })),
    };
  });

  const skill = forecastN && brierBase > 0 ? round((1 - brierModel / brierBase) * 100, 1) : null;
  const signals = [];
  for (const cell of cells) {
    if (cell.belowFloor) signals.push({
      id: `AR-${cell.key}`, level: 'high',
      title: `“${cell.label}” routing holds ${cell.ratePct}% of ${cell.n} graded plans`,
      body: `Below the ${conv.reliabilityFloorPct}% reliability floor. Wilson 95% interval ${cell.wilsonLo}–${cell.wilsonHi}%. RULE-AR-02 opens one governed re-routing decision per cell per ISO week; nothing is auto-corrected.`,
      ruleId: ROUTER_RULES.FLOOR, route: '#/routing?panel=calibration',
    });
    else if (cell.refused && cell.n > 0) signals.push({
      id: `AR-FLOOR-${cell.key}`, level: 'info',
      title: `“${cell.label}” has ${cell.n}/${cell.floorN} graded plans`,
      body: 'The agreement rate stays refused below five graded plans. A rate printed at this sample size would be decoration, not evidence.',
      ruleId: ROUTER_RULES.MATURITY, route: '#/routing?panel=calibration',
    });
  }

  return {
    ok: true, engineVersion: ROUTER_VERSION, analyzedAt: now.toISOString(),
    conventions: conv, gradedN: graded.length, confirmedN: plans.filter((p) => p.status === 'confirmed').length,
    analyzedN: plans.filter((p) => p.status === 'analyzed').length,
    overallCorrectN: totalCorrect, overallRatePct: graded.length >= conv.calibrationFloorN ? round((totalCorrect / graded.length) * 100, 1) : null,
    brierSkillPct: skill, forecastN, baseRatePct: baseRate === null ? null : round(baseRate * 100, 1),
    meanRankError: graded.length ? round(rankErrorSum / graded.length, 2) : null,
    underRouted, overRouted, overrides, overrideHelped,
    overrideLiftPct: overrides ? round((overrideHelped / overrides) * 100, 1) : null,
    cells, confusion, signals,
    disclosure: ROUTER_DISCLOSURE,
  };
}

/* --------------------------------------------- 5. read model + brief + CSV */

/** Altitude-filtered read model. A declared seat only sees its own subtree. */
export function routingRead(state = {}, { now = new Date(), settings = null, seatId = null } = {}) {
  const conv = routingConventions(settings || state?.settings || {});
  const built = buildSeats(state, { now, settings });
  const seat = seatId ? (built.byId.get(seatId) || activeSeat(built)) : activeSeat(built);
  const scoped = Boolean(seat && !seat.fullAccess);
  const visible = (plan) => !scoped || plan.ownerSeatId === seat.id || seat.scope?.has(plan.ownerSeatId);
  const all = Array.isArray(state.altitudeRoutingPlans) ? state.altitudeRoutingPlans : [];
  // Unknown seats must never inherit the operator's scope. Senior roll-up
  // figures are withheld until this module is integrated with release-history
  // disclosure control; merely stripping names does not prevent differencing.
  const detailWithheld = scoped && (seat.rank >= 3 || seat.readOnly);
  const visiblePlans = seat?.readOnly ? [] : all.filter(visible);
  const plans = detailWithheld ? [] : visiblePlans;
  const calibration = detailWithheld ? null : routingCalibration(
    { ...state, altitudeRoutingPlans: visiblePlans }, { now, settings });

  return {
    ok: true, engineVersion: ROUTER_VERSION, now: now.toISOString(),
    conventions: conv, calibration, seat: seat ? { id: seat.id, rank: seat.rank, label: seat.label, fullAccess: Boolean(seat.fullAccess) } : null,
    scoped, detailWithheld, altitudes: ROUTING_ALTITUDES, plans,
    pending: plans.filter((p) => p.status === 'analyzed'),
    confirmed: plans.filter((p) => p.status === 'confirmed'),
    graded: plans.filter((p) => p.status === 'confirmed' && p.gradedOn),
    attentionN: detailWithheld ? 0 : plans.filter((p) => p.status === 'analyzed').length + calibration.signals.filter((s) => s.level === 'high').length,
    disclosure: ROUTER_DISCLOSURE,
  };
}

export function routingAttentionCount(state = {}, now = new Date(), settings = null) {
  return routingRead(state, { now, settings }).attentionN;
}

/** Identity-free, aggregate-only Markdown. No note text, ids, names or titles. */
export function routingBriefText(state = {}, { now = new Date(), settings = null } = {}) {
  const r = routingRead(state, { now, settings });
  if (r.detailWithheld) return "# Altitude Router — disclosure withheld\n\nAggregate publication is withheld at this seat until release-history disclosure checks are integrated. Seats are not authentication.";
  const c = r.calibration;
  const lines = [
    '# Altitude Router — routing integrity brief',
    '',
    `Frozen: ${dayKey(now)} · Engine ${ROUTER_VERSION} · Schema v88 / ADR-0081`,
    '',
    'This brief contains counts and rates only. No situation note, person name,',
    'case title, id, evidence term or module route label is included. It is a',
    'reading of how well the router sent work to the right organizational',
    'altitude — not an audit opinion and not a prediction of outcomes.',
    '',
    `Plans: ${r.plans.length} total · ${r.pending.length} awaiting a human · ${r.confirmed.length} confirmed · ${r.graded.length} graded.`,
    `Graded trials: ${c.gradedN}. Overall agreement: ${c.overallRatePct === null ? 'refused (below evidence floor)' : `${c.overallRatePct}%`}.`,
    `Out-of-sample Brier skill vs strictly-prior pooled base rate: ${c.brierSkillPct === null ? 'refused' : `${c.brierSkillPct}%`} over ${c.forecastN} strictly-prior forecasts.`,
    `Mean absolute altitude error: ${c.meanRankError === null ? 'refused' : `${c.meanRankError} ranks`} · under-routed ${c.underRouted} · over-routed ${c.overRouted}.`,
    `Human overrides: ${c.overrides} · overrides that corrected a wrong inference: ${c.overrideHelped}${c.overrideLiftPct === null ? '' : ` (${c.overrideLiftPct}%)`}.`,
    '',
    '## Agreement by detected altitude',
    '',
    '| Altitude | Horizon (days) | Graded | Correct | Rate | Wilson 95% | Verdict |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...c.cells.map((cell) => `| ${cell.label} | ${cell.horizonDays} | ${cell.n} | ${cell.correctN} | ${cell.ratePct === null ? 'refused' : `${cell.ratePct}%`} | ${cell.wilsonLo === null ? 'refused' : `${cell.wilsonLo}–${cell.wilsonHi}%`} | ${cell.refused ? `below evidence floor (${cell.n}/${cell.floorN})` : cell.belowFloor ? 'below reliability floor' : 'holding'} |`),
    '',
    '## Limitations',
    '',
    `- Confidence bands are heuristic until at least ${c.conventions.calibrationFloorN} graded plans exist in a cell.`,
    '- The situation note and its evidence terms are excluded; only the recorded altitude decisions are graded.',
    '- A graded "correct altitude" is a human retrospective judgement, not a measured business outcome.',
    `- ${ROUTER_DISCLOSURE.local}`,
    `- ${ROUTER_DISCLOSURE.simulation}`,
    `- Small cells are refused, not painted: floor ${c.conventions.calibrationFloorN}; reliability floor ${c.conventions.reliabilityFloorPct}%.`,
    '',
    `Week: ${weekKey(now) || dayKey(now)}.`,
  ];
  return lines.join('\n');
}

/** Aggregate-only CSV rows. No ids, names, titles, note text or evidence. */
export function routingCsvRows(state = {}, { now = new Date(), settings = null } = {}) {
  const r = routingRead(state, { now, settings });
  if (r.detailWithheld) return [{ scope: 'withheld', verdict: 'Router aggregate withheld pending release-history disclosure checks' }];
  const c = r.calibration;
  const rows = [];
  for (const cell of c.cells) {
    rows.push({
      scope: 'altitude-cell', rank: cell.rank, horizon_days: cell.horizonDays,
      graded_n: cell.n, correct_n: cell.correctN,
      agreement_pct: cell.ratePct === null ? '' : cell.ratePct,
      wilson_lo_pct: cell.wilsonLo === null ? '' : cell.wilsonLo,
      wilson_hi_pct: cell.wilsonHi === null ? '' : cell.wilsonHi,
      mean_confidence_pct: cell.meanConfidencePct === null ? '' : cell.meanConfidencePct,
      evidence_floor: cell.floorN, reliability_floor_pct: cell.reliabilityFloorPct,
      verdict: cell.refused ? 'refused' : cell.belowFloor ? 'below-floor' : 'holding',
    });
  }
  rows.push({
    scope: 'workspace', rank: '', horizon_days: '', graded_n: c.gradedN, correct_n: c.overallCorrectN,
    agreement_pct: c.overallRatePct === null ? '' : c.overallRatePct,
    wilson_lo_pct: '', wilson_hi_pct: '', mean_confidence_pct: '',
    evidence_floor: c.conventions.calibrationFloorN, reliability_floor_pct: c.conventions.reliabilityFloorPct,
    verdict: 'aggregate — plans ' + r.plans.length + ', pending ' + r.pending.length
      + ', brier_skill_pct ' + (c.brierSkillPct === null ? 'refused' : c.brierSkillPct)
      + ', mean_rank_error ' + (c.meanRankError === null ? 'refused' : c.meanRankError)
      + ', under_routed ' + c.underRouted + ', over_routed ' + c.overRouted
      + ', overrides ' + c.overrides,
  });
  return rows;
}
