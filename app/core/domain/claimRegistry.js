/**
 * app/core/domain/claimRegistry.js — Evidence Governance: the Claim &
 * Counterfactual Registry (Schema v41, RULE-MODEL-01..04).
 *
 * LeadOS already grades models (the capital trust ladder), scores promises
 * (Forecast Integrity), studies interventions (the Impact Ledger), senses
 * assumptions (the Premise Sentinel) and flags structural risk (Dynamics,
 * Resilience, Watch). What nothing could answer is the question a board asks
 * first: *every number you just showed me — which of them is graded, which of
 * them rests on a fragile assumption, which of them contradicts another one,
 * and what would change your mind?*
 *
 * This module is that answer. It is a pure read model: it derives one
 * **claim** per quantitative statement the product makes, from the same
 * records the modules already read, so a claim can never drift from the data
 * it describes. Each claim carries:
 *
 *   - a single **trust grade** on one shared ladder (`unvalidated → refuted →
 *     provisional → backtested → validated`) computed from the same primitives
 *     the capital module uses, so the two ladders cannot silently diverge;
 *   - **provenance** (measured / estimated / assumed) and an evidence count;
 *   - a **frozen baseline** and, where the source module froze one, a skill;
 *   - a **counterfactual** — the named alternative the recommendation gives
 *     up, so "we chose this" always has an alternative attached;
 *   - **lineage**: the records the claim consumed, as typed references.
 *
 * On top of the read model it adds three things that no surveyed product
 * combines:
 *
 *   1. **Cross-claim conflict detection** on declared, typed criteria — a
 *      load-bearing assumption that has slipped while a decision that depends
 *      on it is still open; an adopted commitment resting on a model the
 *      product itself has refuted; a detector raising alerts while its own
 *      out-of-sample skill is negative.
 *   2. **A challenge workflow**: the leader records a dated observation with
 *      an explicit likelihood ratio; the claim's posterior moves by Bayes'
 *      rule in log-odds, the observation is appended to an append-only ledger,
 *      and the generalized event spine fans the challenge out into one DACI
 *      decision, one owned verification delegation and one blameless 1:1.
 *   3. **A single board brief** that composes every claim, conflict and
 *      counterfactual into one confidence-annotated narrative.
 *
 * Named theory implemented explicitly (not adjectives):
 *
 *  - Good (1950) weight of evidence and Bayes in log-odds form: each
 *    challenge is a named likelihood ratio, multiplied into the odds.
 *  - Cromwell's rule: the neutral prior is 50% and is never presented as a
 *    measured belief; a leader cannot encode certainty in a challenge.
 *  - The trust ladder is the capital module's ladder (Bierman & Smidt 1966
 *    capital budgeting; Popperian falsification; MASE-style skill against a
 *    frozen naive baseline — Hyndman & Koehler 2006), re-derived here from the
 *    same primitives so the two cannot disagree.
 *  - Counterfactual reasoning (Rubin 1974; the CACM intervention discussion):
 *    the alternative is *named and attached*, never claimed as causation.
 *  - Assumption-Based Planning (Dewar et al., RAND 1993) for the
 *    load-bearing-assumption conflict criterion.
 *
 * Honest limits: the neutral 50% prior is a convention, not a measurement; a
 * challenge is a *declared* likelihood ratio, so the posterior measures the
 * leader's declared evidence, not the world; conflicts are declared criteria
 * over typed relations, not a general contradiction detector; and a claim
 * with no source records produces no claim at all rather than an invented one.
 */

import { dayKey, daysBetween } from '../time.js';
import {
  buildCapitalReport,
  CAP_ENGINE_VERSION,
  CAP_ASSUMED_WARN_PCT,
  CAP_OOS_SKILL_FLOOR,
  CAP_MIN_OOS_CHECKPOINTS,
} from './policyPortfolio.js';
import { buildDynamicsReport, DYN_ENGINE_VERSION } from './dynamics.js';
import { buildPremiseReport, evaluatePremiseCore, PREMISE_ENGINE_VERSION } from './premises.js';
import { buildWatchReport, EW_ENGINE_VERSION } from './earlyWarning.js';
import { buildImpactReport, IMPACT_ENGINE_VERSION } from './impact.js';
import {
  MODEL_CHALLENGE_DIRECTIONS,
  MODEL_MAX_LIKELIHOOD_RATIO,
  MODEL_MIN_LIKELIHOOD_RATIO,
} from '../schema.js';
import { assessAnomaly, extractModuleSeries, ANOMALY_ENGINE_VERSION } from './anomaly.js';

export const MODEL_ENGINE_VERSION = 'model-governance-2026.10-v1';

export const MODEL_RULE_IDS = Object.freeze({
  /** Claims and conflicts are derived from the same records the modules read. */
  SENSE: 'RULE-MODEL-01',
  /** A declared cross-claim contradiction is surfaced, never auto-resolved. */
  CONFLICT: 'RULE-MODEL-02',
  /** A recorded challenge fans out into one decision, delegation and 1:1. */
  CHALLENGE: 'RULE-MODEL-03',
  /** A refresh re-derives claims; nothing is rewritten, only re-read. */
  REFRESH: 'RULE-MODEL-04',
});

/** One ladder, shared with the capital module. Higher rank is stronger. */
export const MODEL_TRUST_GRADES = Object.freeze({
  unvalidated: {
    rank: 0, label: 'Unvalidated', tone: 'muted',
    meaning: 'No dated out-of-sample evidence exists for this model yet, so its numbers are directional only.',
    recommendation: 'Treat the number as a comparison, not a forecast, until it has been graded against a frozen baseline.',
  },
  refuted: {
    rank: 1, label: 'Refuted', tone: 'bad',
    meaning: 'The model has been graded against your own history and lost to “tomorrow equals today”.',
    recommendation: 'Do not act on this model’s magnitude until it is re-baselined or replaced.',
  },
  provisional: {
    rank: 2, label: 'Provisional', tone: 'warn',
    meaning: 'The model beats persistence, but a large share of its parameters are declared conventions rather than measurements.',
    recommendation: 'Act on direction, not precision; convert conventions into measured records where you can.',
  },
  backtested: {
    rank: 3, label: 'Backtested', tone: 'good',
    meaning: 'The model has out-of-sample evidence and its parameters are mostly measured.',
    recommendation: 'The comparison is defensible; still freeze a baseline before treating magnitude as a promise.',
  },
  validated: {
    rank: 4, label: 'Out-of-sample validated', tone: 'good',
    meaning: 'The model beats persistence out of sample with measured parameters.',
    recommendation: 'This is the only grade that supports an “actionable” label.',
  },
});

export const MODEL_CHALLENGE_STATUSES = ['open', 'resolved'];
export { MODEL_CHALLENGE_DIRECTIONS, MODEL_MIN_LIKELIHOOD_RATIO, MODEL_MAX_LIKELIHOOD_RATIO };

/* ------------------------------------------------------------------ math */

function num(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

function round(value, dp = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function clampText(value, max = 300) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function clampPct(value) {
  const n = num(value, 50);
  return clamp(n, 0.5, 99.5);
}

function logit(p) {
  const q = clampPct(p) / 100;
  return Math.log(q / (1 - q));
}

function invLogit(x) {
  const e = Math.exp(clamp(x, -20, 20));
  return e / (1 + e);
}

function safeId(prefix, value) {
  const raw = String(value == null ? '' : value).replace(/[^a-zA-Z0-9_.-]/g, '-').slice(0, 48);
  return `${prefix}-${raw || 'x'}`;
}

/**
 * The one trust ladder. Re-derives the capital module's verdict from the same
 * primitives so a claim and the module behind it can never disagree silently.
 */
export function unifiedTrust({ skill = null, assumedPct = null, oosN = 0, oosSkill = null } = {}) {
  let grade = 'unvalidated';
  if (skill === null || !Number.isFinite(skill)) {
    grade = 'unvalidated';
  } else if (skill <= CAP_OOS_SKILL_FLOOR) {
    grade = 'refuted';
  } else if (assumedPct != null && assumedPct >= CAP_ASSUMED_WARN_PCT) {
    grade = 'provisional';
  } else if (oosN < CAP_MIN_OOS_CHECKPOINTS || oosSkill === null || !Number.isFinite(oosSkill)) {
    grade = 'backtested';
  } else if (oosSkill > 0) {
    grade = 'validated';
  } else {
    grade = 'refuted';
  }
  const meta = MODEL_TRUST_GRADES[grade] || MODEL_TRUST_GRADES.unvalidated;
  const blockers = [];
  if (skill === null || !Number.isFinite(skill)) {
    blockers.push('No dated hindcast exists, so the model has never been graded against your own history.');
  } else if (skill <= 0) {
    blockers.push(`Hindcast skill ${round(skill, 2)} — the model did not beat “tomorrow equals today” on your records.`);
  }
  if (assumedPct != null && assumedPct >= CAP_ASSUMED_WARN_PCT) {
    blockers.push(`${assumedPct}% of the parameters are conventions rather than measurements.`);
  }
  if (oosN < CAP_MIN_OOS_CHECKPOINTS) {
    blockers.push(`Record ${CAP_MIN_OOS_CHECKPOINTS - oosN} more independently dated out-of-sample checkpoints.`);
  } else if (oosSkill !== null && Number.isFinite(oosSkill) && oosSkill <= 0) {
    blockers.push(`Pooled out-of-sample skill ${round(oosSkill, 2)} across ${oosN} checkpoints — the frozen predictions lost to persistence.`);
  }
  return {
    grade,
    rank: meta.rank,
    label: meta.label,
    tone: meta.tone,
    meaning: meta.meaning,
    recommendation: meta.recommendation,
    actionable: meta.rank >= MODEL_TRUST_GRADES.backtested.rank,
    blockers,
  };
}

function confidenceFromRank(rank) {
  if (rank >= 4) return 'high';
  if (rank === 3) return 'medium';
  if (rank === 2) return 'low';
  if (rank === 1) return 'low';
  return 'unknown';
}

/** Typed premise ids a subject is linked to through the shared graph. */
function assumptionsFor(state, subjectType, subjectId) {
  const out = [];
  for (const link of state.links || []) {
    if (!link || typeof link !== 'object') continue;
    const pairs = [
      [link.sourceType, link.sourceId, link.targetType, link.targetId],
      [link.targetType, link.targetId, link.sourceType, link.sourceId],
    ];
    for (const [fromType, fromId, toType, toId] of pairs) {
      if (fromType === subjectType && String(fromId) === String(subjectId) && toType === 'premise' && toId) {
        if (!out.includes(toId)) out.push(toId);
      }
    }
  }
  return out;
}

function makeClaim(spec) {
  return {
    id: spec.id,
    module: spec.module,
    engineVersion: spec.engineVersion,
    kind: spec.kind,
    subjectKind: spec.subjectKind,
    subjectId: spec.subjectId || '',
    subjectKey: spec.subjectKey,
    subjectLabel: spec.subjectLabel || '',
    statement: spec.statement,
    trustGrade: spec.trust.grade,
    trustLabel: spec.trust.label,
    trustRank: spec.trust.rank,
    actionable: spec.trust.actionable,
    /** Which machinery grades this claim: the shared model ladder, or the
     * module's own evidence machinery (sentinel, ledger, control chart). */
    gradedBy: spec.gradedBy || 'model-ladder',
    evidenceCount: spec.evidenceCount ?? 0,
    provenance: spec.provenance || null,
    skill: spec.skill ?? null,
    frozenBaseline: spec.frozenBaseline ?? null,
    counterfactual: spec.counterfactual || null,
    confidence: spec.confidence || 'unknown',
    /** Neutral prior for the challenge workflow; labelled as a convention. */
    priorPct: spec.priorPct ?? 50,
    priorIsConvention: spec.priorIsConvention !== false,
    assumptions: spec.assumptions || [],
    lineage: spec.lineage || [],
    challenges: 0,
    posteriorPct: null,
    logBayesFactor: 0,
    challengable: spec.challengable !== false,
    blockers: spec.trust.blockers,
    route: spec.route || null,
  };
}

/* -------------------------------------------------------------- extractors */

function capitalClaims(state, report) {
  const out = [];
  if (!report || report.adequate === false) return out;
  const trust = report.trust || unifiedTrust({});
  const checkpoints = Array.isArray(report.checkpoints) ? report.checkpoints : [];
  out.push(makeClaim({
    id: 'clm-capital-model',
    module: 'capital',
    engineVersion: CAP_ENGINE_VERSION,
    kind: 'trust-grade',
    subjectKind: 'model',
    subjectId: '',
    subjectKey: 'capital:model',
    subjectLabel: 'Structural capital allocation model',
    statement: `The structural model behind capital allocation is graded ${trust.label}`
      + (trust.hindcast?.skill != null ? ` (hindcast skill ${round(trust.hindcast.skill, 2)})` : '') + '.',
    trust,
    evidenceCount: (trust.outOfSample?.n ?? 0) + (trust.hindcast?.skill != null ? 1 : 0),
    provenance: trust.assumptions || null,
    skill: trust.hindcast?.skill ?? null,
    frozenBaseline: trust.hindcast ? 'Frozen do-nothing baseline beside each adopted prediction' : null,
    confidence: confidenceFromRank(trust.rank),
    lineage: checkpoints.map((c) => ({ sourceType: 'dynamicsCheckpoint', sourceId: c.id })),
    route: '#/capital',
  }));
  for (const policy of report.policies || []) {
    if (policy.status !== 'adopted') continue;
    const horizon = policy.horizonWeeks || report.horizonWeeks || null;
    const counterfactual = policy.predicted?.baseline
      ? {
        label: 'Do nothing (frozen baseline)',
        value: policy.predicted.baseline.endSaturationPct ?? null,
        unit: '% saturation at horizon',
        note: 'The do-nothing trajectory frozen beside this prediction at adoption.',
      }
      : {
        label: 'Do nothing',
        value: null,
        unit: '',
        note: 'No frozen baseline was captured at adoption, so the alternative is named but not priced.',
      };
    out.push(makeClaim({
      id: safeId('clm-capital-policy', policy.id),
      module: 'capital',
      engineVersion: CAP_ENGINE_VERSION,
      kind: 'recommendation',
      subjectKind: 'policy',
      subjectId: policy.id,
      subjectKey: `capital:policy:${policy.id}`,
      subjectLabel: policy.name || 'Adopted portfolio',
      statement: `Adopted portfolio “${policy.name || 'untitled'}” allocates ${round(policy.effort, 2)} of ${policy.budgetUnits} effort-weeks across structural levers; the model grading it is ${trust.label}.`,
      trust,
      evidenceCount: policy.checkpoints?.length ?? 0,
      provenance: trust.assumptions || null,
      skill: policy.scoring?.skill ?? null,
      frozenBaseline: policy.predicted?.baseline ? 'Frozen at adoption' : null,
      counterfactual,
      confidence: confidenceFromRank(trust.rank),
      assumptions: assumptionsFor(state, 'capitalPolicy', policy.id),
      lineage: [{ sourceType: 'capitalPolicy', sourceId: policy.id }],
      route: '#/capital',
    }));
  }
  return out;
}

function dynamicsClaims(state, report) {
  const out = [];
  if (!report || report.adequate === false) return out;
  const calibration = report.calibration || {};
  const skill = num(calibration.skill, null);
  const assumedPct = report.provenance?.assumedPct ?? null;
  const oos = (report.experiments || []).length;
  const trust = unifiedTrust({ skill, assumedPct, oosN: oos, oosSkill: null });
  const dominant = report.archetypes?.dominant || report.archetypes?.top || null;
  out.push(makeClaim({
    id: 'clm-dynamics-model',
    module: 'dynamics',
    engineVersion: DYN_ENGINE_VERSION,
    kind: 'risk-score',
    subjectKind: 'model',
    subjectId: '',
    subjectKey: 'dynamics:model',
    subjectLabel: 'Operating-system dynamics model',
    statement: `The team model reports ${round(report.structuralRiskPct ?? 0, 0)}% structural risk`
      + (dominant ? ` with a ${dominant} reading` : '') + ` and is graded ${trust.label}.`,
    trust,
    evidenceCount: oos,
    provenance: report.provenance || null,
    skill,
    frozenBaseline: 'Derived from dated portfolio lifecycles; reconstructed, not a stored forecast',
    confidence: confidenceFromRank(trust.rank),
    lineage: (report.experiments || []).map((e) => ({ sourceType: 'dynamicsExperiment', sourceId: e.id })),
    route: '#/dynamics',
  }));
  for (const experiment of report.experiments || []) {
    if (experiment.status !== 'adopted') continue;
    const predicted = experiment.predicted || {};
    const counterfactual = predicted.baseline
      ? {
        label: 'Do nothing (frozen baseline)',
        value: predicted.baseline.endSaturationPct ?? null,
        unit: '% saturation at horizon',
        note: 'The baseline trajectory frozen beside this prediction at adoption.',
      }
      : null;
    out.push(makeClaim({
      id: safeId('clm-dynamics-experiment', experiment.id),
      module: 'dynamics',
      engineVersion: DYN_ENGINE_VERSION,
      kind: 'prediction',
      subjectKind: 'experiment',
      subjectId: experiment.id,
      subjectKey: `dynamics:experiment:${experiment.id}`,
      subjectLabel: experiment.name || 'Adopted experiment',
      statement: `Adopted experiment “${experiment.name || 'untitled'}” predicts end saturation ${predicted.endSaturationPct ?? '—'}% against a frozen baseline of ${predicted.baseline?.endSaturationPct ?? '—'}%.`,
      trust,
      evidenceCount: experiment.checkpointOn ? 1 : 0,
      provenance: report.provenance || null,
      skill,
      frozenBaseline: predicted.baseline ? 'Frozen at adoption' : null,
      counterfactual,
      confidence: confidenceFromRank(trust.rank),
      assumptions: assumptionsFor(state, 'dynamicsExperiment', experiment.id),
      lineage: [{ sourceType: 'dynamicsExperiment', sourceId: experiment.id }],
      route: '#/dynamics',
    }));
  }
  return out;
}

function premiseClaims(state, report) {
  const out = [];
  for (const premise of report.premises || []) {
    const evaluation = premise.evaluation || {};
    const status = evaluation.status || 'unobserved';
    // Premises own their evidence machinery (sensors, half-life, SPRT). A
    // model challenge would double-count it, so belief claims are not
    // challengeable — the Premise Sentinel remains the only editor of belief.
    out.push(makeClaim({
      id: safeId('clm-premise', premise.id),
      module: 'premises',
      engineVersion: PREMISE_ENGINE_VERSION,
      kind: 'belief',
      subjectKind: 'premise',
      subjectId: premise.id,
      subjectKey: `premise:${premise.id}`,
      subjectLabel: premise.title || 'Premise',
      statement: `Premise “${premise.title || 'untitled'}” belief is ${round(evaluation.posteriorPct ?? premise.posteriorPct ?? 0, 1)}% (${status}).`,
      trust: unifiedTrust({ skill: null, assumedPct: null, oosN: 0, oosSkill: null }),
      evidenceCount: evaluation.evidenceCount ?? (premise.observations || []).length,
      provenance: {
        measured: evaluation.evidenceRows?.filter((r) => r.provenance === 'measured').length ?? 0,
        estimated: evaluation.evidenceRows?.filter((r) => r.provenance === 'estimated').length ?? 0,
        assumed: evaluation.evidenceRows?.filter((r) => r.provenance === 'assumed').length ?? 0,
        assumedPct: null,
      },
      skill: null,
      frozenBaseline: null,
      counterfactual: {
        label: 'Premise holds vs fails',
        value: round(evaluation.posteriorPct ?? premise.posteriorPct ?? 0, 1),
        unit: '% held',
        note: 'The declared posterior; failure probability is the complement.',
      },
      confidence: evaluation.confidence || 'unknown',
      priorPct: evaluation.priorPct ?? premise.priorPct ?? 50,
      priorIsConvention: false,
      challengable: false,
      gradedBy: 'premise-sentinel',
      assumptions: [],
      lineage: (premise.sourceRefs || []).map((r) => ({ sourceType: r.sourceType, sourceId: r.sourceId })),
      route: '#/premises',
    }));
  }
  return out;
}

function watchClaims(state, report) {
  const out = [];
  if (!report) return out;
  const precision = report.precision || {};
  const skill = report.skill || {};
  const alerts = (report.alerts || []).filter(Boolean);
  const forecasts = (report.forecasts || []).filter(Boolean);
  // A detector that has never run has not made a statement. Emitting a claim
  // for it would be a claim about nothing, so the register stays empty until
  // there is an alert or a frozen forecast to grade.
  if (!alerts.length && !forecasts.length) return out;
  const trust = unifiedTrust({
    skill: num(skill.skill, null),
    assumedPct: null,
    oosN: skill.n ?? 0,
    oosSkill: num(skill.skill, null),
  });
  out.push(makeClaim({
    id: 'clm-watch-model',
    module: 'watch',
    engineVersion: EW_ENGINE_VERSION,
    kind: 'detector-quality',
    subjectKind: 'model',
    subjectId: '',
    subjectKey: 'watch:model',
    subjectLabel: 'Early-warning detector',
    statement: `The early-warning detector reports precision ${round((precision.precision ?? 0) * 100, 0)}% over ${precision.judged ?? 0} judged alert(s)`
      + ((precision.judged ?? 0) === 0 ? ' (no verdicts recorded yet, so precision is unknown)' : '')
      + ` and is graded ${trust.label}.`,
    trust,
    evidenceCount: (precision.judged ?? 0) + (skill.n ?? 0),
    provenance: null,
    skill: num(skill.skill, null),
    frozenBaseline: 'Frozen whole-week targets; descriptive, not a proven detector',
    confidence: confidenceFromRank(trust.rank),
    lineage: (report.forecasts || []).slice(0, 20).map((f) => ({ sourceType: 'watchForecast', sourceId: f.id })),
    route: '#/watch',
  }));
  for (const alert of report.alerts || []) {
    if (alert.status !== 'open') continue;
    out.push(makeClaim({
      id: safeId('clm-watch-alert', alert.id),
      module: 'watch',
      engineVersion: EW_ENGINE_VERSION,
      kind: 'control-signal',
      subjectKind: 'alert',
      subjectId: alert.id,
      subjectKey: `watch:alert:${alert.id}`,
      subjectLabel: alert.seriesId || 'monitored series',
      statement: `An early-warning alert on “${alert.seriesId || 'a monitored series'}” is open for a human verdict (detected ${alert.detectedOn || '—'}).`,
      trust,
      evidenceCount: 1,
      provenance: null,
      skill: null,
      frozenBaseline: null,
      counterfactual: {
        label: 'No intervention',
        value: null,
        unit: '',
        note: 'A statistical signal alone does not open a case; the counterfactual is the un-acted branch.',
      },
      confidence: 'unknown',
      gradedBy: 'detector',
      assumptions: [],
      lineage: [{ sourceType: 'watchAlert', sourceId: alert.id }],
      route: '#/watch',
    }));
  }
  return out;
}

function impactClaims(state, report) {
  const out = [];
  if (!report) return out;
  for (const row of report.rows || []) {
    const evaluation = row.evaluation || {};
    if (row.status === 'abandoned') continue;
    const alpha = num(row.study?.alpha, null);
    const counterfactual = evaluation.verdict === 'supported'
      ? {
        label: 'No intervention (control branch)',
        value: null,
        unit: '',
        note: 'The pre-registered control branch of this study.',
      }
      : null;
    out.push(makeClaim({
      id: safeId('clm-impact-study', row.study?.id),
      module: 'impact',
      engineVersion: IMPACT_ENGINE_VERSION,
      kind: 'evaluation',
      subjectKind: 'study',
      subjectId: row.study?.id || '',
      subjectKey: `impact:study:${row.study?.id}`,
      subjectLabel: row.intervention?.label || row.study?.name || 'Intervention study',
      statement: `Intervention “${row.intervention?.label || row.study?.name || 'untitled'}” was scored ${evaluation.verdict || 'unmeasurable'}${alpha != null ? ` at α=${alpha}` : ''}.`,
      trust: unifiedTrust({ skill: null, assumedPct: null, oosN: 0, oosSkill: null }),
      evidenceCount: evaluation.n ?? 0,
      provenance: null,
      skill: null,
      frozenBaseline: evaluation.verdict ? 'Pre-registered before the window closed' : null,
      counterfactual,
      confidence: evaluation.grade === 'confirmatory' ? 'medium' : 'low',
      challengable: false,
      gradedBy: 'impact-ledger',
      assumptions: [],
      lineage: [{ sourceType: 'impactStudy', sourceId: row.study?.id }],
      route: '#/impact',
    }));
  }
  return out;
}

function anomalyClaims(state, now) {
  const out = [];
  const series = extractModuleSeries(state, 'openCases', { asOf: now });
  if (!series.length) return out;
  const assessment = assessAnomaly(series, { label: 'Open operational cases', unit: 'cases' });
  const signal = assessment.latestSignal;
  const adverse = signal?.polarity === 'adverse';
  out.push(makeClaim({
    id: 'clm-anomaly-open-cases',
    module: 'anomaly',
    engineVersion: ANOMALY_ENGINE_VERSION,
    kind: 'control-signal',
    subjectKind: 'series',
    subjectId: 'openCases',
    subjectKey: 'anomaly:openCases',
    subjectLabel: 'Weekly open operational cases',
    statement: `Weekly open-case WIP shows a ${signal ? signal.type : 'no-signal'} control signal (${adverse ? 'adverse' : signal ? 'non-adverse' : 'none'}).`,
    trust: unifiedTrust({ skill: null, assumedPct: null, oosN: 0, oosSkill: null }),
    evidenceCount: assessment.measuredPoints,
    provenance: null,
    skill: null,
    frozenBaseline: 'In-sample XmR limits; exploratory, not a forecast',
    counterfactual: null,
    confidence: adverse ? 'medium' : 'low',
    challengable: false,
    gradedBy: 'control-chart',
    assumptions: [],
    lineage: [{ sourceType: 'case', sourceId: '' }],
    route: '#/anomaly',
  }));
  return out;
}

function decisionClaims(state) {
  const out = [];
  const people = new Map((state.people || []).filter(Boolean).map((p) => [p.id, p.name]));
  for (const decision of state.decisions || []) {
    if (!decision || decision.status === 'closed') continue;
    const assumptions = assumptionsFor(state, 'decision', decision.id);
    // An open decision is a graded claim only when something is registered
    // against it — a pre-registered premise it tests, or a model challenge.
    // An unlinked decision belongs to the Decisions terminal, not here.
    if (!assumptions.length && decision.source !== 'model-governance') continue;
    const owner = decision.ownerId ? people.get(decision.ownerId) : null;
    out.push(makeClaim({
      id: safeId('clm-decision', decision.id),
      module: 'decisions',
      engineVersion: 'decision-log-2026.10-v1',
      kind: 'decision',
      subjectKind: 'decision',
      subjectId: decision.id,
      subjectKey: `decision:${decision.id}`,
      subjectLabel: decision.title || 'Open decision',
      statement: `Decision “${decision.title || 'untitled'}” is open${owner ? ` (owner ${owner})` : ''} and rests on ${assumptions.length} registered premise(s).`,
      trust: unifiedTrust({}),
      evidenceCount: assumptions.length,
      provenance: null,
      skill: null,
      frozenBaseline: null,
      counterfactual: null,
      confidence: 'unknown',
      gradedBy: 'decision-log',
      assumptions,
      lineage: [{ sourceType: 'decision', sourceId: decision.id }],
      route: '#/decisions',
    }));
  }
  return out;
}

/**
 * Derive every claim from the records the product already reads. Each source
 * is guarded: a module whose report shape changes yields no claims and a
 * warning rather than a crash or an invented number.
 */
export function extractModelClaims(state = {}, now = new Date()) {
  const claims = [];
  const sourceWarnings = [];
  const guard = (label, fn) => {
    try {
      const rows = fn();
      if (Array.isArray(rows)) claims.push(...rows);
    } catch (error) {
      sourceWarnings.push(`${label}: claim extraction skipped (${clampText(error?.message || error, 160)})`);
    }
  };
  guard('capital', () => capitalClaims(state, buildCapitalReport(state, now)));
  guard('dynamics', () => dynamicsClaims(state, buildDynamicsReport(state, now)));
  guard('premises', () => premiseClaims(state, buildPremiseReport(state, now)));
  guard('watch', () => watchClaims(state, buildWatchReport(state, now)));
  guard('impact', () => impactClaims(state, buildImpactReport(state, now)));
  guard('anomaly', () => anomalyClaims(state, now));
  guard('decisions', () => decisionClaims(state));
  return { claims, sourceWarnings };
}

/* ------------------------------------------------------------- challenges */

/**
 * Replay an append-only challenge ledger over a claim's neutral prior using
 * Good's weight of evidence in log-odds. The prior is a declared convention
 * (50%) for anything without its own evidence machinery, never a measurement.
 */
export function applyModelChallenges(claim, challenges = []) {
  const mine = (Array.isArray(challenges) ? challenges : [])
    .filter((c) => c && c.claimId === claim.id);
  let logOdds = logit(claim.priorPct ?? 50);
  let logBF = 0;
  for (const challenge of mine) {
    const lr = clamp(num(challenge.likelihoodRatio, 1), MODEL_MIN_LIKELIHOOD_RATIO, MODEL_MAX_LIKELIHOOD_RATIO);
    const multiplier = challenge.direction === 'supports' ? lr : 1 / lr;
    logOdds += Math.log(multiplier);
    logBF += Math.log(multiplier);
  }
  // Float arithmetic can produce -0 after a symmetric pair cancels; -0 and 0
  // are the same number, but "-0" on screen reads as a rounding artefact.
  const roundedBb = round(logBF, 3);
  return {
    posteriorPct: round(invLogit(logOdds) * 100, 1),
    logBayesFactor: roundedBb === 0 ? 0 : roundedBb,
    challengeCount: mine.length,
    lineage: mine.map((c) => ({ sourceType: 'modelChallenge', sourceId: c.id })),
  };
}

/** Validate and normalise a challenge payload without touching storage. */
export function normalizeModelChallengePayload(data = {}, { claim = null } = {}) {
  const observation = clampText(data.observation, 600);
  if (!observation) return { ok: false, error: 'Record what you observed. A challenge with no observation is a opinion, not evidence.', field: 'observation' };
  if (!claim) return { ok: false, error: 'Choose the claim this observation challenges.', field: 'claimId' };
  if (claim.challengable === false) {
    return { ok: false, error: 'This claim already owns its evidence machinery (the Premise Sentinel or the Impact Ledger); record the observation there instead.', field: 'claimId' };
  }
  const direction = MODEL_CHALLENGE_DIRECTIONS.includes(data.direction) ? data.direction : null;
  if (!direction) return { ok: false, error: 'Say whether the observation supports or challenges the claim.', field: 'direction' };
  const ratio = num(data.likelihoodRatio, NaN);
  if (!Number.isFinite(ratio) || ratio < MODEL_MIN_LIKELIHOOD_RATIO || ratio > MODEL_MAX_LIKELIHOOD_RATIO) {
    return { ok: false, error: `The likelihood ratio must be a number between ${MODEL_MIN_LIKELIHOOD_RATIO} and ${MODEL_MAX_LIKELIHOOD_RATIO}. It is the factor by which the observation changes the odds, not a confidence score.`, field: 'likelihoodRatio' };
  }
  const sourceType = clampText(data.sourceType, 40) || 'leader-observation';
  const sourceId = clampText(data.sourceId, 80) || null;
  return {
    ok: true,
    value: {
      observation,
      direction,
      likelihoodRatio: round(ratio, 3),
      sourceType,
      sourceId,
    },
  };
}

/* --------------------------------------------------------------- conflicts */

function premiseIsFragile(premise, evaluation) {
  if (premise.criticality !== 'load-bearing') return false;
  const status = evaluation.status || 'unobserved';
  if (status === 'breached' || status === 'watch') return true;
  const posterior = num(evaluation.posteriorPct, premise.posteriorPct ?? 100);
  const watch = num(evaluation.watchPct, premise.watchPct ?? 55);
  return posterior < watch;
}

/**
 * Declared cross-claim conflict criteria. These are typed relations and
 * measured verdicts, not fuzzy text matching: a conflict is only reported when
 * the records actually disagree under a rule stated in the criterion.
 */
export function detectModelConflicts(claims, state = {}, now = new Date()) {
  const out = [];
  const byId = new Map(claims.map((c) => [c.id, c]));
  const settings = state.settings || {};
  const today = dayKey(now);

  // C1 — a load-bearing assumption has slipped while the decision it tests is
  // still open. Assumption-Based Planning: a broken signpost is a reason to
  // re-decide, and an un-revisited open decision is the visible symptom.
  const premiseById = new Map((state.premises || []).filter(Boolean).map((p) => [p.id, p]));
  const decisionById = new Map((state.decisions || []).filter(Boolean).map((d) => [d.id, d]));
  for (const premise of state.premises || []) {
    if (!premise || premise.status === 'retired') continue;
    let evaluation = null;
    try {
      evaluation = evaluatePremiseCore(premise, { now, settings });
    } catch {
      continue;
    }
    if (!premiseIsFragile(premise, evaluation)) continue;
    const decision = premise.decisionId ? decisionById.get(premise.decisionId) : null;
    if (!decision || decision.status === 'closed') continue;
    const premiseClaim = byId.get(safeId('clm-premise', premise.id));
    const decisionClaim = byId.get(safeId('clm-decision', decision.id));
    if (!premiseClaim || !decisionClaim) continue;
    out.push({
      id: `cf-premise-${premise.id}-${decision.id}`,
      type: 'fragile-premise-under-open-decision',
      severity: 4,
      a: premiseClaim.id,
      b: decisionClaim.id,
      subjectKey: `premise:${premise.id}`,
      statement: `Load-bearing premise “${clampText(premise.title, 70)}” has slipped to ${round(evaluation.posteriorPct, 1)}% while the decision it tests stays open.`,
      criterion: 'Assumption-Based Planning (Dewar et al., RAND 1993): a fired signpost on a load-bearing assumption reopens the decision it tests.',
      evidence: { premiseId: premise.id, decisionId: decision.id, posteriorPct: evaluation.posteriorPct, status: evaluation.status },
      recordedOn: today,
    });
  }

  // C2 — an adopted commitment rests on a model the product itself has graded
  // as refuted. This is the "we funded it before the model lost" case.
  const adopted = claims.filter((c) => (c.kind === 'recommendation' || c.kind === 'prediction')
    && (c.subjectKind === 'policy' || c.subjectKind === 'experiment'));
  for (const model of claims.filter((c) => c.subjectKind === 'model')) {
    if (model.trustGrade !== 'refuted') continue;
    for (const commitment of adopted) {
      if (commitment.module === model.module) continue;
      out.push({
        id: `cf-refuted-${model.id}-${commitment.id}`,
        type: 'adopted-on-refuted-model',
        severity: 4,
        a: model.id,
        b: commitment.id,
        subjectKey: model.subjectKey,
        statement: `“${clampText(commitment.subjectLabel, 60)}” was adopted while the ${model.module} model behind it is graded ${model.trustLabel}.`,
        criterion: 'Popperian falsification + MASE-style skill against a frozen baseline: a model that loses to persistence cannot support an adopted commitment.',
        evidence: { model: model.module, skill: model.skill, commitment: commitment.id },
        recordedOn: today,
      });
    }
  }

  // C3 — a detector is raising alerts while its own out-of-sample skill is
  // negative. The signal and the model disagree about whether to trust it.
  const watchModel = claims.find((c) => c.subjectKey === 'watch:model');
  if (watchModel && watchModel.skill != null && watchModel.skill <= 0) {
    const openAlerts = claims.filter((c) => c.module === 'watch' && c.kind === 'control-signal');
    for (const alert of openAlerts.slice(0, 3)) {
      out.push({
        id: `cf-watch-${alert.id}`,
        type: 'signal-vs-refuted-detector',
        severity: 2,
        a: alert.id,
        b: watchModel.id,
        subjectKey: 'watch:model',
        statement: `An alert is open while the detector’s own out-of-sample skill is ${round(watchModel.skill, 2)}.`,
        criterion: 'Alert-precision measurement (Wilson interval) + skill against a frozen target: a detector that lost to persistence should not silently train the leader to act on its signals.',
        evidence: { alertId: alert.id, skill: watchModel.skill },
        recordedOn: today,
      });
    }
  }

  return out;
}

/* ------------------------------------------------------------------ report */

export function buildModelGovernanceReport(state = {}, now = new Date()) {
  const { claims, sourceWarnings } = extractModelClaims(state, now);
  const challenges = Array.isArray(state.modelChallenges) ? state.modelChallenges : [];
  for (const claim of claims) {
    const applied = applyModelChallenges(claim, challenges);
    claim.posteriorPct = applied.posteriorPct;
    claim.logBayesFactor = applied.logBayesFactor;
    claim.challenges = applied.challengeCount;
    if (applied.lineage.length) {
      claim.lineage = [...claim.lineage, ...applied.lineage].slice(-40);
    }
  }
  const conflicts = detectModelConflicts(claims, state, now);

  const byModule = {};
  const byTrustGrade = {};
  for (const claim of claims) {
    byModule[claim.module] = (byModule[claim.module] || 0) + 1;
    byTrustGrade[claim.trustGrade] = (byTrustGrade[claim.trustGrade] || 0) + 1;
  }
  const actionable = claims.filter((c) => c.actionable).length;
  const challengable = claims.filter((c) => c.challengable).length;
  const challenged = claims.filter((c) => c.challenges > 0).length;

  return {
    engineVersion: MODEL_ENGINE_VERSION,
    today: dayKey(now),
    claims,
    conflicts,
    challenges,
    sourceWarnings,
    aggregates: {
      claims: claims.length,
      byModule,
      byTrustGrade,
      actionable,
      challengable,
      challenged,
      conflicts: conflicts.length,
      severeConflicts: conflicts.filter((c) => c.severity >= 4).length,
      meanTrustRank: claims.length
        ? round(claims.reduce((sum, c) => sum + c.trustRank, 0) / claims.length, 2)
        : 0,
    },
    trustLadder: Object.values(MODEL_TRUST_GRADES),
  };
}

/** The single board brief: every claim, conflict and counterfactual. */
export function modelGovernanceBrief(report) {
  const lines = [
    '# LEADOS — EVIDENCE GOVERNANCE',
    `Generated ${report.today}. Every number LeadOS shows you is registered as a claim with a trust grade, provenance, a named counterfactual and its consumed records.`,
    '',
    `Claims: ${report.aggregates.claims} · actionable: ${report.aggregates.actionable} · conflicts: ${report.aggregates.conflicts} · challenges: ${report.aggregates.challenged}`,
    `Trust mix: ${report.aggregates.byTrustGrade ? Object.entries(report.aggregates.byTrustGrade).map(([k, v]) => `${k} ${v}`).join(', ') : 'none'}`,
    '',
  ];
  const gradeOrder = Object.keys(MODEL_TRUST_GRADES).reverse();
  for (const grade of gradeOrder) {
    const rows = report.claims.filter((c) => c.trustGrade === grade);
    if (!rows.length) continue;
    lines.push(`## ${MODEL_TRUST_GRADES[grade].label} (${rows.length})`, MODEL_TRUST_GRADES[grade].meaning, '');
    for (const claim of rows.slice(0, 12)) {
      lines.push(`- ${claim.statement}`);
      if (claim.counterfactual) lines.push(`  counterfactual: ${claim.counterfactual.label}${claim.counterfactual.value != null ? ` ${claim.counterfactual.value}${claim.counterfactual.unit || ''}` : ''}`);
      if (claim.posteriorPct != null && claim.challenges > 0) lines.push(`  posterior after ${claim.challenges} challenge(s): ${claim.posteriorPct}% (Bayes factor ${claim.logBayesFactor})`);
    }
    if (rows.length > 12) lines.push(`- …and ${rows.length - 12} more`);
    lines.push('');
  }
  if (report.conflicts.length) {
    lines.push('## Conflicts the records disagree on', '');
    for (const conflict of report.conflicts) {
      lines.push(`- [${conflict.severity}] ${conflict.statement}`);
      lines.push(`  criterion: ${conflict.criterion}`);
    }
    lines.push('');
  }
  lines.push('## What would change my mind', '');
  const withBlockers = report.claims.filter((c) => c.actionable || c.blockers?.length);
  if (!withBlockers.length) {
    lines.push('- Nothing outstanding: every claim is either validated or carries no declared blocker.');
  }
  const seen = new Set();
  for (const claim of withBlockers.slice(0, 10)) {
    for (const blocker of claim.blockers || []) {
      if (seen.has(blocker)) continue;
      seen.add(blocker);
      lines.push(`- ${claim.subjectLabel || claim.id}: ${blocker}`);
    }
  }
  lines.push('');
  lines.push('Honest limits: the neutral 50% prior behind a challenge is a convention, not a measurement; a likelihood ratio is declared by the leader, so a posterior measures declared evidence, not the world; conflicts are declared criteria over typed relations, not a general contradiction detector.');
  return lines.join('\n');
}

/* ----------------------------------------------------------------- signals */

export function modelGovernanceSignals(report) {
  const signals = [];
  const push = (ruleId, severity, evidence, title, detail, action = null) => {
    signals.push({
      ruleId,
      domain: 'Model governance',
      severity,
      title,
      detail,
      // The Insights contract requires evidence on every finding: a governance
      // warning with nothing concrete behind it is exactly the vague advice
      // this product is supposed to replace.
      evidence: (Array.isArray(evidence) ? evidence : [evidence]).filter(Boolean),
      action,
    });
  };
  const claimById = new Map(report.claims.map((c) => [c.id, c]));
  for (const conflict of report.conflicts) {
    if (conflict.severity < 4) continue;
    const a = claimById.get(conflict.a);
    const b = claimById.get(conflict.b);
    push(MODEL_RULE_IDS.CONFLICT, conflict.severity, [
      a ? `${a.module}: ${clampText(a.statement, 140)}` : null,
      b ? `${b.module}: ${clampText(b.statement, 140)}` : null,
      `Criterion: ${clampText(conflict.criterion, 160)}`,
      conflict.evidence?.posteriorPct != null
        ? `Posterior ${round(conflict.evidence.posteriorPct, 1)}% · status ${conflict.evidence.status || 'unknown'}`
        : null,
      conflict.evidence?.skill != null ? `Detector skill ${round(conflict.evidence.skill, 2)}` : null,
    ], `Evidence conflict: ${conflict.statement}`,
    `Declared criterion: ${conflict.criterion}`,
    { label: 'Open model governance', route: '#/models' });
  }
  for (const claim of report.claims) {
    if (claim.kind !== 'recommendation' && claim.kind !== 'prediction') continue;
    if (claim.trustGrade === 'refuted') {
      push(MODEL_RULE_IDS.SENSE, 3, [
        claim.statement,
        ...(claim.blockers || []).slice(0, 2),
      ], `A ${claim.module} recommendation is graded Refuted`,
      `“${clampText(claim.subjectLabel, 60)}” rests on a model that lost to persistence; do not act on its magnitude.`,
      { label: 'Open model governance', route: '#/models' });
    } else if (claim.trustGrade === 'provisional' && claim.actionable) {
      push(MODEL_RULE_IDS.SENSE, 2, [
        claim.statement,
        ...(claim.blockers || []).slice(0, 2),
      ], `A ${claim.module} recommendation is Provisional but actionable`,
      `“${clampText(claim.subjectLabel, 60)}” acts on direction, not precision; convert conventions into measured records.`,
      { label: 'Open model governance', route: '#/models' });
    }
  }
  if (report.aggregates.challenged === 0 && report.aggregates.challengable > 0) {
    const available = report.claims.filter((c) => c.challengable !== false).slice(0, 4);
    push(MODEL_RULE_IDS.CHALLENGE, 1,
      available.map((c) => `${c.module} · ${clampText(c.subjectLabel, 60)} is graded ${c.trustLabel}`),
      `${report.aggregates.challengable} claim(s) are waiting for your own evidence`,
      'A claim graded unvalidated becomes provisional only when you record a dated observation against it. Nothing is guessed on your behalf.',
      { label: 'Open model governance', route: '#/models' });
  }
  return signals;
}

/* ----------------------------------------------------------- post-commit */

function note(ctx, ruleId, action, targetType, targetId, summary, out) {
  const row = { ruleId, action, targetType, targetId, summary: clampText(summary, 300) };
  out.push(row);
  if (ctx.logEvent) {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: targetType,
      entityId: targetId,
      summary: `[${ruleId}] ${clampText(summary, 280)}`.slice(0, 300),
    });
  }
}

function pushLink(draft, spec, runCtx) {
  const { sourceType, sourceId, targetType, targetId, relation, ruleId, summary } = spec;
  if (!sourceType || !sourceId || !targetType || !targetId) return false;
  draft.links = Array.isArray(draft.links) ? draft.links : [];
  const exists = draft.links.some((l) => l && l.sourceType === sourceType && l.sourceId === sourceId
    && l.targetType === targetType && l.targetId === targetId && l.relation === relation);
  if (exists) return false;
  draft.links.push({
    id: runCtx.idFactory('lnk'),
    sourceType, sourceId, targetType, targetId, relation, ruleId,
    summary: clampText(summary, 300),
    createdOn: runCtx.todayStr,
    createdAt: runCtx.nowIso,
  });
  return true;
}

function declareDownstreamRule(event, ruleName) {
  if (!event || typeof event !== 'object') return;
  const declared = Array.isArray(event.rules) ? [...event.rules] : [];
  if (!declared.includes(ruleName)) declared.push(ruleName);
  event.rules = declared;
}

function decisionExists(draft, marker) {
  return (draft.decisions || []).some((d) => d && String(d.question || '').includes(marker));
}

function delegationExists(draft, marker) {
  return (draft.delegations || []).some((d) => d && String(d.support || '').includes(marker));
}

function talkingPointExists(draft, personId, marker) {
  const person = (draft.people || []).find((p) => p && p.id === personId);
  return Boolean(person && (person.talkingPoints || []).some((t) => String(t).includes(marker)));
}

function addTalkingPoint(draft, personId, text, marker) {
  const person = (draft.people || []).find((p) => p && p.id === personId && p.status !== 'archived');
  if (!person) return false;
  const maxText = 200 - marker.length - 1;
  person.talkingPoints = [
    ...(Array.isArray(person.talkingPoints) ? person.talkingPoints : []),
    `${clampText(text, Math.max(40, maxText))} ${marker}`,
  ].slice(-30);
  return true;
}

/**
 * RULE-MODEL-03: a recorded challenge fans out — in the same atomic
 * transaction — into exactly one DACI decision (adopt the updated belief,
 * reject the claim, or buy information), one owned verification delegation and
 * one blameless 1:1 talking point. The claim's posterior itself is derived at
 * read time from the append-only ledger, so the rule never rewrites a belief.
 * The decision is declared to the Decision Tempo rule so it is priced in the
 * same transaction.
 */
export function modelGovernanceRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || event.type !== 'model.challenge') return [];
  const governanceAllowed = draft.settings?.modelAutoPropagate !== false;
  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const runCtx = {
    todayStr: dayKey(now) || now.toISOString().slice(0, 10),
    nowIso: now.toISOString(),
    idFactory: ctx.idFactory || ((prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`),
  };
  const out = [];
  if (!governanceAllowed) return out;

  const challenge = (draft.modelChallenges || []).find((c) => c && c.id === event.entityId);
  if (!challenge) return out;

  let report;
  try {
    report = buildModelGovernanceReport(draft, now);
  } catch (error) {
    if (ctx.warnings) ctx.warnings.push(`Model governance could not re-derive claims: ${clampText(error?.message || error, 160)}`);
    return out;
  }
  const claim = report.claims.find((c) => c.id === challenge.claimId);
  if (!claim) {
    if (ctx.warnings) ctx.warnings.push(`Model challenge references a claim that no longer exists (${clampText(challenge.claimId, 40)}).`);
    return out;
  }

  const owner = (draft.people || []).find((p) => p && p.id === claim.lineage?.[0]?.sourceId
    && p.status !== 'archived')
    || (draft.people || []).find((p) => p && p.status !== 'archived')
    || null;
  const marker = `[${MODEL_RULE_IDS.CHALLENGE}:${claim.id}:c${challenge.cycle || 0}]`;
  if (decisionExists(draft, marker)) return out;

  const question = [
    `You challenged “${clampText(claim.subjectLabel, 80)}” with a dated observation (${challenge.direction}, likelihood ratio ${challenge.likelihoodRatio}).`,
    `The claim reads: ${clampText(claim.statement, 260)}.`,
    `Its neutral prior was ${claim.priorPct}% and the ledger moves it to ${claim.posteriorPct}% (Bayes factor ${claim.logBayesFactor}).`,
    'A challenged claim is a reason to re-decide, not a failure of the model. Choose the response',
    marker,
  ].join(' ');
  const options = [
    {
      id: runCtx.idFactory('dopt'),
      label: 'Adopt the updated belief and act on the new posterior',
      pros: 'The declared evidence is now part of the record; acting on it keeps the decision and the evidence in step',
      cons: 'The posterior measures your declared evidence, not the world — a single observation can move it a long way',
    },
    {
      id: runCtx.idFactory('dopt'),
      label: 'Reject the claim and stop relying on its number',
      pros: 'Honest while the evidence is negative; nothing irreversible is spent on a refuted number',
      cons: 'Throws away any part of the claim the evidence did not actually touch',
    },
    {
      id: runCtx.idFactory('dopt'),
      label: 'Buy information: record one more dated observation before deciding',
      pros: 'RAND hedging: a second independent observation sharply reduces the chance of acting on a noisy single datum',
      cons: 'Costs a cycle; the claim stays unvalidated until the observation lands',
    },
  ];
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  draft.decisions.push({
    id: runCtx.idFactory('dec'),
    title: `Re-decide after challenging “${clampText(claim.subjectLabel, 60)}”`,
    question,
    options,
    status: 'open',
    ownerId: owner?.id || null,
    reversibility: 'high',
    decisionDate: runCtx.todayStr,
    createdAt: runCtx.nowIso,
    source: 'model-governance',
    claimId: claim.id,
    claimModule: claim.module,
  });
  note(ctx, MODEL_RULE_IDS.CHALLENGE, 'created', 'decision', claim.id,
    `Opened one DACI re-decision after a challenge on “${clampText(claim.subjectLabel, 60)}”`, out);

  if (owner) {
    draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
    const delegationMarker = `[${MODEL_RULE_IDS.CHALLENGE}:verify:${claim.id}]`;
    if (!delegationExists(draft, delegationMarker)) {
      draft.delegations.push({
        id: runCtx.idFactory('del'),
        personId: owner.id,
        support: `Verify the evidence behind the challenge on “${clampText(claim.subjectLabel, 60)}” and report the dated observation. ${delegationMarker}`,
        status: 'active',
        createdOn: runCtx.todayStr,
        createdAt: runCtx.nowIso,
        source: 'model-governance',
        claimId: claim.id,
      });
      note(ctx, MODEL_RULE_IDS.CHALLENGE, 'created', 'delegation', owner.id,
        `Queued one verification delegation for the challenged claim`, out);
    }
    if (!talkingPointExists(draft, owner.id, marker)) {
      if (addTalkingPoint(draft, owner.id,
        `Blameless follow-up: a challenge on “${clampText(claim.subjectLabel, 45)}” moved its posterior to ${claim.posteriorPct}%. What would you want to know before re-deciding?`,
        marker)) {
        note(ctx, MODEL_RULE_IDS.CHALLENGE, 'updated', 'person', owner.id,
          `Queued a blameless 1:1 prompt for the challenged claim`, out);
      }
    }
  }

  // Typed lineage: the claim challenges its source subject and is tested by the
  // decision it opened. These are relationships, not causal claims.
  const subjectType = claim.subjectKind === 'policy' ? 'capitalPolicy'
    : claim.subjectKind === 'experiment' ? 'dynamicsExperiment'
      : claim.subjectKind === 'decision' ? 'decision'
        : claim.subjectKind === 'alert' ? 'watchAlert'
          : claim.subjectKind === 'study' ? 'impactStudy' : null;
  if (subjectType && claim.subjectId) {
    pushLink(draft, {
      sourceType: 'modelClaim', sourceId: claim.id, targetType: subjectType, targetId: claim.subjectId,
      relation: 'challenges', ruleId: MODEL_RULE_IDS.CHALLENGE,
      summary: `Claim challenges its source ${subjectType}`,
    }, runCtx);
  }
  for (const assumption of claim.assumptions || []) {
    pushLink(draft, {
      sourceType: 'modelClaim', sourceId: claim.id, targetType: 'premise', targetId: assumption,
      relation: 'depends-on', ruleId: MODEL_RULE_IDS.CHALLENGE,
      summary: `Claim rests on a pre-registered premise`,
    }, runCtx);
  }
  const openedDecision = (draft.decisions || []).find((d) => d && d.source === 'model-governance' && d.claimId === claim.id);
  if (openedDecision) {
    pushLink(draft, {
      sourceType: 'modelClaim', sourceId: claim.id, targetType: 'decision', targetId: openedDecision.id,
      relation: 'tests', ruleId: MODEL_RULE_IDS.CHALLENGE,
      summary: `Challenged claim is re-decided by this decision`,
    }, runCtx);
  }
  if (draft.settings?.tempoAutoPropagate !== false) {
    declareDownstreamRule(event, 'decisionTempo');
  }
  return out;
}
