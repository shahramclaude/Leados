/**
 * app/core/domain/impactRules.js — RULE-IMP-01..04 on the shared post-commit spine.
 *
 * ADR-0008 says the store owns the transaction and pure domain rules own what a
 * committed event MEANS. This module is where an Impact Ledger record stops
 * being an isolated statistical note and starts doing work in the rest of the
 * workspace — inside the same atomic transaction as the score that produced it.
 *
 * The four rules, and why each one exists:
 *
 *  IMP-01  LINK + DERIVE. A study is a graph node (Schema v31), so "what did
 *          this intervention actually do?" is answerable from the intervention's
 *          own page, not only from the ledger. The derived snapshot refreshes on
 *          every scan; the *frozen* evaluation is never touched, because a
 *          locked result is evidence and re-computing it would make it an
 *          opinion again.
 *
 *  IMP-02  DECISIVE RESULT → OWNED DECISION. A supported or contradicted
 *          pre-registered study is a fact that should change what the leader
 *          spends next quarter on. It becomes exactly one DACI decision,
 *          idempotently. Underpowered and trend-broken studies deliberately do
 *          NOT create a decision: "we could not measure it" is not a mandate to
 *          stop or scale anything.
 *
 *  IMP-03  BLAMELESS COACHING PROMPT. When an intervention that touched people
 *          is contradicted by the record, the useful next step is a
 *          conversation about the process — never a conclusion about the
 *          people. One talking point per affected person, self-cleaning, and
 *          phrased so it cannot be read as a performance judgment.
 *
 *  IMP-04  REPLICATE YOUR OWN WIN. A single supported study is an anecdote with
 *          a p-value. When a confirmatory result comes back positive the
 *          ledger proposes exactly one replication with a fresh window. This is
 *          the least flattering, most useful automation in the module: the
 *          system asks the leader to try to disprove their own finding.
 */

import { ensureEntityLink } from './automation.js';
import { addDays, dayKey } from '../time.js';
import { IMPACT_INTERVENTION_TYPES, IMPACT_STATUSES } from '../schema.js';
import { VERDICTS, evaluateStudy, gradeOf, studyHorizonEnd } from './impact.js';

const IMPACT_INTERVENTION_BY_ID = Object.fromEntries(IMPACT_INTERVENTION_TYPES.map((t) => [t.id, t]));

/** Marker embedded in generated records so every rule is idempotent. */
function marker(ruleId, studyId) {
  return `[${ruleId}:${studyId}]`;
}

const MARKER_RE = /\[RULE-IMP-0\d:([A-Za-z0-9_-]+)\]/;

function shouldRun(event) {
  if (!event) return false;
  if (Array.isArray(event.rules) && event.rules.includes('impact')) return true;
  if (event.impactScan === true) return true;
  return typeof event.type === 'string' && event.type.startsWith('impact.');
}

function decisionExists(draft, token) {
  return (draft.decisions || []).some((d) => d && String(d.question || '').includes(token));
}

function talkingPointExists(person, token) {
  return Boolean(person && (person.talkingPoints || []).some((t) => String(t).includes(token)));
}

/** Which people did this intervention touch? Derived from the linked record. */
function affectedPeople(draft, study) {
  const ids = new Set();
  const type = IMPACT_INTERVENTION_BY_ID[study.interventionType];
  if (!type || !type.entityType || !study.interventionId) return [];
  const collection = {
    oneonone: 'oneOnOnes',
    feedback: 'feedback',
    delegation: 'delegations',
    goal: 'goals',
    case: 'cases',
    change: 'changes',
    decision: 'decisions',
    negotiation: 'negotiations',
    stakeholder: 'stakeholders',
    requisition: 'requisitions',
    power: 'powerGames',
  }[type.entityType];
  if (!collection) return [];
  const record = (draft[collection] || []).find((r) => r && r.id === study.interventionId);
  if (!record) return [];
  if (record.personId) ids.add(record.personId);
  if (record.ownerId) ids.add(record.ownerId);
  for (const pid of record.involvedPersonIds || []) ids.add(pid);
  for (const impact of record.impacts || []) if (impact && impact.personId) ids.add(impact.personId);
  for (const member of record.coalition || []) if (member && member.personId) ids.add(member.personId);
  for (const steward of record.stewards || []) if (steward && steward.personId) ids.add(steward.personId);
  const known = new Set((draft.people || []).map((p) => p.id));
  return [...ids].filter((pid) => known.has(pid));
}

export function impactRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event) return [];
  if (!shouldRun(event)) return [];
  // Pause semantics, matching the Influence Network module: `impactAutoPropagate:
  // false` suppresses automatic fan-out, but an explicit human scan
  // (`scanImpact()`) always runs. Locking a study is an ordinary domain event and
  // is therefore suppressed while paused — the leader can still fan out on
  // demand, and nothing is silently half-applied.
  const forced = event.impactScan === true || event.force === true;
  if (draft.settings?.impactAutoPropagate === false && !forced) return [];

  draft.impactStudies = Array.isArray(draft.impactStudies) ? draft.impactStudies : [];
  if (!draft.impactStudies.length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const context = {
    now,
    todayStr: dayKey(now),
    nowIso: now.toISOString(),
    idFactory: ctx.idFactory || ((prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`),
  };

  // A score event names exactly one study for the entity-creating rules; a
  // workspace-wide scan has no such id and covers all of them.
  const scoredId = typeof event.type === 'string' && event.type === 'impact.scored' && event.entityId
    ? event.entityId
    : null;

  const propagations = [];
  const pushProp = (ruleId, action, targetType, targetId, summary) => {
    propagations.push({ ruleId, action, targetType, targetId, summary });
    if (ctx.logEvent) {
      ctx.logEvent({
        type: 'automation.propagated',
        entity: targetType,
        entityId: targetId,
        summary: `[${ruleId}] ${summary}`.slice(0, 300),
      });
    }
  };

  for (const study of draft.impactStudies) {
    if (!study || study.status === 'abandoned') continue;
    if (!IMPACT_STATUSES.includes(study.status)) continue;

    /* ------------------------------------------------- RULE-IMP-01 links */
    const type = IMPACT_INTERVENTION_BY_ID[study.interventionType];
    if (type && type.entityType && study.interventionId) {
      const collection = {
        oneonone: 'oneOnOnes', feedback: 'feedback', delegation: 'delegations', goal: 'goals',
        case: 'cases', change: 'changes', decision: 'decisions', negotiation: 'negotiations',
        stakeholder: 'stakeholders', requisition: 'requisitions', power: 'powerGames',
      }[type.entityType];
      const target = collection && (draft[collection] || []).find((r) => r && r.id === study.interventionId);
      if (target) {
        const link = ensureEntityLink(draft, {
          sourceType: 'impact',
          sourceId: study.id,
          targetType: type.entityType,
          targetId: study.interventionId,
          relation: 'evaluates',
          ruleId: 'RULE-IMP-01',
          summary: `Measures the effect of ${type.label.toLowerCase()} “${String(target.title || target.name || study.title).slice(0, 80)}”`,
        }, context);
        if (link.created) pushProp('RULE-IMP-01', 'linked', type.entityType, study.interventionId, `Linked study to ${type.entityType} ${study.interventionId}`);
      }
    }
    for (const pid of affectedPeople(draft, study).slice(0, 6)) {
      const link = ensureEntityLink(draft, {
        sourceType: 'impact',
        sourceId: study.id,
        targetType: 'person',
        targetId: pid,
        relation: 'involves',
        ruleId: 'RULE-IMP-01',
        summary: `Affected by the intervention behind “${String(study.title).slice(0, 80)}”`,
      }, context);
      if (link.created) pushProp('RULE-IMP-01', 'linked', 'person', pid, `Linked study to an affected person`);
    }

    // Derived telemetry refresh. A locked study keeps its frozen evaluation and
    // is never re-derived: the point of a lock is that the number stops moving.
    if (study.status !== 'scored') {
      let derived = null;
      try {
        const live = evaluateStudy(study, draft, { now });
        derived = {
          verdict: live.verdict,
          verdictLabel: VERDICTS[live.verdict]?.label || live.verdict,
          estimate: live.ok ? live.estimate : null,
          mde: live.its?.mde ?? null,
          placeboP: live.placeboP ?? null,
          grade: gradeOf(study),
          evaluatedFor: context.todayStr,
          reason: live.ok ? null : live.reason,
        };
      } catch {
        derived = { verdict: 'unmeasurable', reason: 'The evaluator could not read the recorded dates.', evaluatedFor: context.todayStr };
      }
      const before = JSON.stringify(study.derived || null);
      if (before !== JSON.stringify(derived)) {
        study.derived = derived;
        study.updatedAt = context.nowIso;
        pushProp('RULE-IMP-01', 'refreshed', 'impact', study.id, `Refreshed derived evaluation for “${String(study.title).slice(0, 60)}”`);
      }
    }

    if (study.status !== 'scored') continue;
    if (scoredId && study.id !== scoredId) continue;

    const evaluation = study.evaluation || {};
    const verdict = study.verdict || evaluation.verdict;
    const grade = evaluation.grade || gradeOf(study);
    const decisive = verdict === 'supported' || verdict === 'not-supported';

    /* ------------------------------------- RULE-IMP-02 decisive → DACI */
    if (decisive && grade === 'confirmatory') {
      const token = marker('RULE-IMP-02', study.id);
      if (!decisionExists(draft, token)) {
        const supported = verdict === 'supported';
        draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
        const estimate = evaluation.estimate ?? null;
        const unit = evaluation.unit || '';
        draft.decisions.push({
          id: context.idFactory('dec'),
          title: `${supported ? 'Scale or protect' : 'Stop or redesign'}: ${String(study.title).slice(0, 120)}`.slice(0, 180),
          question: `Pre-registered study “${String(study.title).slice(0, 90)}” scored ${(VERDICTS[verdict]?.label || verdict).toLowerCase()}${estimate !== null ? ` (level shift ${estimate} ${unit}, MDE ${evaluation.its?.mde ?? '—'}, placebo p ${evaluation.placeboP ?? '—'})` : ''}. Decide whether to ${supported ? 'protect, extend and replicate this intervention' : 'stop spending on it, or redesign it and pre-register a new hypothesis'}. ${token}`.slice(0, 900),
          date: context.todayStr,
          reversibility: 'reversible',
          driver: String(draft.settings?.leaderName || '').slice(0, 120),
          approver: '', contributors: '', informed: '',
          options: supported
            ? [
              { id: context.idFactory('dopt'), label: 'Replicate before scaling', pros: 'One positive result is an anecdote with a p-value', cons: 'Delays the benefit by one window' },
              { id: context.idFactory('dopt'), label: 'Scale the intervention to the wider team', pros: 'Acts on the evidence now', cons: 'Assumes the effect transports to a different population' },
              { id: context.idFactory('dopt'), label: 'Protect it and hold scope steady', pros: 'Keeps what works without new risk', cons: 'Misses the compounding return' },
              { id: context.idFactory('dopt'), label: 'Extend the window to check durability', pros: 'Tests whether the level shift persists', cons: 'Costs another quarter of attention' },
            ]
            : [
              { id: context.idFactory('dopt'), label: 'Stop and redeploy the effort', pros: 'Frees capacity for something with evidence', cons: 'Loses any unmeasured benefit' },
              { id: context.idFactory('dopt'), label: 'Redesign and pre-register a new hypothesis', pros: 'Keeps the learning, fixes the mechanism', cons: 'Requires a new baseline period' },
              { id: context.idFactory('dopt'), label: 'Check whether the metric was the wrong target', pros: 'The intervention may have worked on something you did not measure', cons: 'Risks moving the goalposts' },
              { id: context.idFactory('dopt'), label: 'Continue unchanged and re-measure', pros: 'Sometimes the effect is just slow', cons: 'Repeating a failed action expecting a different result' },
            ],
          chosen: '', rationale: '', reviewOn: addDays(context.todayStr, 14), reviewedOn: null,
          outcome: 'pending', outcomeNotes: '', createdAt: context.nowIso,
        });
        const decision = draft.decisions[draft.decisions.length - 1];
        ensureEntityLink(draft, {
          sourceType: 'impact',
          sourceId: study.id,
          targetType: 'decision',
          targetId: decision.id,
          relation: 'decides',
          ruleId: 'RULE-IMP-02',
          summary: `Scale/stop decision opened from a scored study`,
        }, context);
        pushProp('RULE-IMP-02', 'created', 'decision', decision.id, `Opened a ${supported ? 'scale/protect' : 'stop/redesign'} DACI decision for “${String(study.title).slice(0, 60)}”`);
      }
    }

    /* ------------------------- RULE-IMP-03 contradicted → blameless prompt */
    if (verdict === 'not-supported') {
      for (const pid of affectedPeople(draft, study).slice(0, 2)) {
        const person = (draft.people || []).find((p) => p.id === pid);
        if (!person) continue;
        const token = marker('RULE-IMP-03', `${study.id}-${pid}`);
        if (talkingPointExists(person, token)) continue;
        person.talkingPoints = [
          ...(Array.isArray(person.talkingPoints) ? person.talkingPoints : []),
          `Blameless check-in on a process, not a person: the ${String(study.title).slice(0, 60)} intervention did not move ${evaluation.vitalLabel || 'the metric'} as expected. Ask what made it hard to use in practice — the failure is almost always in the mechanism, not in the people. ${token}`,
        ].slice(-30);
        pushProp('RULE-IMP-03', 'prompted', 'person', pid, `Added a blameless process check-in prompt after a contradicted study`);
      }
    }

    /* --------------------------------- RULE-IMP-04 supported → replicate */
    if (verdict === 'supported' && grade === 'confirmatory') {
      const already = (draft.impactStudies || []).some((s) => s && s.replicationOfId === study.id);
      if (!already) {
        const horizon = studyHorizonEnd(study) || context.todayStr;
        const fresh = {
          id: context.idFactory('impact'),
          title: `Replication: ${String(study.title).slice(0, 120)}`.slice(0, 160),
          hypothesis: `Replication of “${String(study.title).slice(0, 120)}”. The original result was consistent with the hypothesis; a single positive study is still an anecdote. Run the same intervention again over a fresh window and see whether the effect reproduces.`.slice(0, 2000),
          vitalId: study.vitalId,
          interventionType: study.interventionType,
          interventionId: study.interventionId,
          interventionLabel: study.interventionLabel,
          windowStart: context.todayStr,
          baselineWeeks: study.baselineWeeks,
          windowWeeks: study.windowWeeks,
          alpha: study.alpha,
          expectedEffect: study.expectedEffect,
          expectedConfidence: study.expectedConfidence,
          declaredOn: context.todayStr,
          status: 'running',
          lockedOn: null,
          verdict: null,
          evaluation: null,
          notes: `Proposed automatically by RULE-IMP-04 after the original window ended ${horizon}. Abandon it if you do not intend to rerun the intervention.`,
          outcomeNotes: '',
          autoPropagate: true,
          replicationOfId: study.id,
          history: [{ at: context.nowIso, type: 'declared', summary: 'Proposed replication of a supported confirmatory study (RULE-IMP-04).' }],
          createdAt: context.nowIso,
          updatedAt: context.nowIso,
        };
        draft.impactStudies.push(fresh);
        ensureEntityLink(draft, {
          sourceType: 'impact',
          sourceId: fresh.id,
          targetType: 'impact',
          targetId: study.id,
          relation: 'replicates',
          ruleId: 'RULE-IMP-04',
          summary: 'Replication of a supported study',
        }, context);
        pushProp('RULE-IMP-04', 'created', 'impact', fresh.id, `Proposed a replication of “${String(study.title).slice(0, 60)}”`);
      }
    }
  }

  return propagations;
}

export { MARKER_RE };
