/**
 * app/core/domain/counterfactualPolicyRules.js — Generalized Post-Commit
 * Automation Spine for the Counterfactual Policy Terminal
 * (RULE-CFP-01..04, Schema v76, ADR-0068).
 *
 * Trigger discipline:
 *  - `policy.scan` runs the full pass: capture, resolve, govern, reconcile.
 *  - Outcome events (`premise.outcome`, `decision.reviewed`,
 *    `delegation.completed`, `case.resolved`) resolve the decision point that
 *    just settled, cheaply and marker-idempotently.
 *  - Creation events (`decision.created`, `delegation.created`, `case.created`)
 *    record the capture day while the outcome is still unknown. A premise is
 *    captured from its own `createdAt` on the next pass, because the schema
 *    already guarantees a premise outcome cannot predate its registration.
 *
 * Marker-idempotent: every generated decision, task and note carries a
 * deterministic `[CFP-0X:...]` token, so repeated scans and replays are strict
 * no-ops.
 *
 * What this spine will never do: rewrite a resolved decision point, re-arm a
 * unit, adopt a policy on the leader's behalf, or write a finding about a
 * person. Every artifact it creates is either a decision for the leader to make
 * or a blameless process task.
 */

import { addDays, dayKey, weekKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { resolveLinkedEntity } from './cases.js';
import { counterfactualReport, harvestPolicyUnits } from './counterfactualPolicy.js';
import {
  COUNTERFACTUAL_LIMITS,
  COUNTERFACTUAL_RULE_IDS,
  POLICY_FAMILY_META,
} from './counterfactualRegistry.js';

const SCAN_EVENT = 'policy.scan';
const EVALUATED_EVENT = 'policy.evaluated';

const CREATE_EVENTS = new Set([
  'decision.created',
  'delegation.created',
  'case.created',
  'premise.created',
]);

const OUTCOME_EVENTS = new Set([
  'premise.outcome',
  'decision.reviewed',
  'delegation.completed',
  'case.resolved',
]);

/**
 * Keyed by POLICY_FAMILY, not by record kind: the assumption family is fed by
 * `premises`. Getting this backwards silently reconciles every marker away.
 */
const SOURCE_COLLECTIONS = {
  assumption: 'premises',
  decision: 'decisions',
  delegation: 'delegations',
  case: 'cases',
};

function activePerson(draft, id) {
  if (!id) return null;
  return (draft.people || []).find((p) => p && p.id === id && p.status !== 'archived') || null;
}

function ensureMarkers(draft) {
  if (!Array.isArray(draft.policyMarkers)) draft.policyMarkers = [];
  return draft.policyMarkers;
}

function findMarker(markers, key) {
  return markers.find((m) => m && m.key === key) || null;
}

function upsertMarker(draft, { key, family, sourceId, capturedOn, resolvedOn, nowIso }) {
  const markers = ensureMarkers(draft);
  let marker = findMarker(markers, key);
  if (!marker) {
    marker = {
      key,
      family,
      sourceId,
      capturedOn,
      resolvedOn: null,
      late: false,
      note: '',
      createdAt: nowIso,
    };
    markers.push(marker);
    if (markers.length > 4000) draft.policyMarkers = markers.slice(-4000);
    return { marker, created: true };
  }
  return { marker, created: false };
}

export function counterfactualRule(draft, ctx = {}) {
  const event = ctx.event;
  if (!draft || !event || typeof event.type !== 'string') return [];
  const isScan = event.type === SCAN_EVENT;
  const isEvaluated = event.type === EVALUATED_EVENT;
  const isCreate = CREATE_EVENTS.has(event.type);
  const isOutcome = OUTCOME_EVENTS.has(event.type);
  if (!isScan && !isEvaluated && !isCreate && !isOutcome) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const todayStr = dayKey(now);
  const nowIso = now.toISOString();
  const idFactory = ctx.idFactory || ((prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`);
  const linkOpts = { idFactory, todayStr, nowIso };
  const autoEnabled = draft.settings?.counterfactualAutoPropagate !== false;
  const effects = [];

  const addEffect = (ruleId, action, targetType, targetId, summary) => {
    effects.push({ ruleId, action, targetType, targetId, summary });
    if (typeof ctx.log === 'function') ctx.log({ ruleId, action, targetType, targetId, summary });
  };

  const link = (sourceType, sourceId, targetType, targetId, relation, ruleId, summary) => {
    if (!resolveLinkedEntity(draft, sourceType, sourceId) || !resolveLinkedEntity(draft, targetType, targetId)) {
      return false;
    }
    const res = ensureEntityLink(draft, {
      sourceType,
      sourceId,
      targetType,
      targetId,
      relation,
      ruleId,
      summary,
    }, linkOpts);
    if (res.created) addEffect(ruleId, 'linked', targetType, targetId, summary);
    return res.created;
  };

  /* ---------------------------------------------------------------- *
   * RULE-CFP-01 — Prospective capture.
   * ---------------------------------------------------------------- */
  if (isCreate && autoEnabled && event.entityId) {
    const familyOf = {
      'decision.created': 'decision',
      'delegation.created': 'delegation',
      'case.created': 'case',
      'premise.created': 'assumption',
    }[event.type];
    if (familyOf) {
      const { created } = upsertMarker(draft, {
        key: `capture:${familyOf}:${event.entityId}`,
        family: familyOf,
        sourceId: event.entityId,
        capturedOn: todayStr,
        nowIso,
      });
      if (created) {
        addEffect(COUNTERFACTUAL_RULE_IDS.CAPTURE, 'created', 'policyMarker', event.entityId,
          `Captured a ${POLICY_FAMILY_META[familyOf].label.toLowerCase()} decision point before its outcome is known`);
      }
    }
  }

  /* ---------------------------------------------------------------- *
   * RULE-CFP-02 — Outcome resolution (and capture from record dates
   * for points that predate this terminal).
   * ---------------------------------------------------------------- */
  const shouldResolve = isScan || isOutcome;
  if (shouldResolve) {
    const units = harvestPolicyUnits(draft, now);
    for (const unit of units) {
      const key = `capture:${unit.family}:${unit.sourceId}`;
      const { marker, created } = upsertMarker(draft, {
        key,
        family: unit.family,
        sourceId: unit.sourceId,
        capturedOn: unit.decidedOn,
        nowIso,
      });
      if (created) {
        addEffect(COUNTERFACTUAL_RULE_IDS.CAPTURE, 'created', 'policyMarker', unit.sourceId,
          `Captured a ${unit.familyLabel} decision point from its own record dates`);
      }
      if (!marker.resolvedOn) {
        marker.resolvedOn = unit.settledOn;
        // A log captured on or after the outcome it describes cannot support a
        // prequential estimate. Marked late and counted, never trusted.
        marker.late = Boolean(marker.capturedOn && unit.settledOn && marker.capturedOn >= unit.settledOn);
        if (isScan || (isOutcome && event.entityId === unit.sourceId)) {
          addEffect(COUNTERFACTUAL_RULE_IDS.RESOLVE, 'updated', 'policyMarker', unit.sourceId,
            `Resolved a ${unit.familyLabel} decision point against its recorded outcome`);
        }
      }
    }
  }

  /* ---------------------------------------------------------------- *
   * RULE-CFP-03 — Governed policy ruling escalation.
   * ---------------------------------------------------------------- */
  if ((isScan || isEvaluated) && autoEnabled) {
    const report = counterfactualReport(draft, now);
    if (report.observable) {
      const week = weekKey(now) || todayStr;
      const robustBetter = report.race.filter((r) => r.policyId !== 'observed'
        && ['supported-better', 'bounded-better'].includes(r.verdict));
      const robustWorse = report.race.filter((r) => r.policyId !== 'observed'
        && ['supported-worse', 'bounded-worse'].includes(r.verdict));
      const winner = robustBetter[0] || null;
      const loser = !winner ? robustWorse[0] || null : null;

      if (winner) {
        draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
        const decToken = `[CFP-03-DEC:${week}]`;
        let ruling = draft.decisions.find((d) => (d?.context || d?.question || d?.rationale || '').includes(decToken));
        if (!ruling) {
          ruling = {
            id: idFactory('dec'),
            title: `Rule on the "${winner.policyMeta.label}" policy`.slice(0, 200),
            question: `The counterfactual policy terminal estimates "${winner.policyMeta.label}" at ${Math.round((winner.value ?? 0) * 100)}% against your recorded ${Math.round((winner.observed ?? 0) * 100)}% (${winner.deltaPp}pp), with ${winner.crossCheckSpreadPp}pp spread across four estimators. Adopt it as a standing rule, adopt it for one family only, or keep deciding case by case? ${decToken}`,
            context: `Opened by RULE-CFP-03 from an off-policy evaluation over ${report.counts.units} decision points (headline: self-normalised IPS, cross-checked against DM, IPS and doubly robust). ${winner.verdictReason}. The engine never adopts a policy — this call is yours, and it is priced downstream by Decision Tempo in the same transaction. ${decToken}`,
            date: todayStr,
            reviewOn: addDays(todayStr, 14),
            reversibility: 'reversible',
            driver: draft.settings?.leaderName || 'Workspace leader',
            approver: '',
            contributors: '',
            informed: '',
            options: [
              { id: idFactory('opt'), label: 'Adopt as a standing rule', pros: 'Removes the decision from every future case', cons: 'Averages away the cases your judgement reads better than the rule' },
              { id: idFactory('opt'), label: 'Adopt for one family only', pros: 'Bounds the change to where the evidence is strongest', cons: 'Two policies to remember' },
              { id: idFactory('opt'), label: 'Keep deciding case by case', pros: 'Preserves the discretion that beat the rule elsewhere', cons: 'The estimated gap persists and nothing changes' },
            ],
            chosen: '',
            rationale: '',
            outcome: 'pending',
            outcomeNotes: '',
            reviewedOn: null,
            createdAt: nowIso,
            updatedAt: nowIso,
          };
          draft.decisions.push(ruling);
          addEffect(COUNTERFACTUAL_RULE_IDS.GOVERN, 'created', 'decision', ruling.id,
            'Opened one governed policy-ruling DACI decision for a robust counterfactual winner');
        }

        const taskToken = `[CFP-03-TASK:${week}]`;
        draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
        if (!draft.delegations.some((d) => (d?.support || '').includes(taskToken))) {
          const owner = activePerson(draft, draft.settings?.leaderPersonId)
            || (draft.people || []).find((p) => p && p.status !== 'archived') || null;
          if (owner) {
            const task = {
              id: idFactory('del'),
              personId: owner.id,
              title: 'Blameless process check: where does the counterfactual winner come from?',
              expectedOutcome: 'Name the mechanism the estimate is picking up, or the confounder that would explain it away, in one paragraph.',
              authority: 'recommend',
              support: `A named policy beat the record by ${winner.deltaPp}pp across ${report.counts.units} decision points (Gamma ${report.sensitivity?.gamma ?? 'n/a'}). Read it as a question about the process, never about a person. ${taskToken}`,
              delegatedOn: todayStr,
              dueOn: addDays(todayStr, 7),
              status: 'active',
              checkins: [],
              completedOn: null,
              completionNote: '',
              returnedOn: null,
              returnReason: '',
              createdAt: nowIso,
              updatedAt: nowIso,
            };
            draft.delegations.push(task);
            link('decision', ruling.id, 'delegation', task.id, 'grounds-practice', COUNTERFACTUAL_RULE_IDS.GOVERN,
              'Policy ruling grounded by a blameless process check');
            addEffect(COUNTERFACTUAL_RULE_IDS.GOVERN, 'created', 'delegation', task.id,
              'Opened one blameless process task for the counterfactual winner');
          }
        }
      } else if (loser) {
        const holdToken = `[CFP-03-HOLD:${week}]`;
        draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
        if (!draft.delegations.some((d) => (d?.support || '').includes(holdToken))) {
          const owner = activePerson(draft, draft.settings?.leaderPersonId)
            || (draft.people || []).find((p) => p && p.status !== 'archived') || null;
          if (owner) {
            const task = {
              id: idFactory('del'),
              personId: owner.id,
              title: 'Blameless process check: the rule would have lost — why?',
              expectedOutcome: 'Record which cases your judgement read better than the mechanical rule, so the exception becomes legible.',
              authority: 'recommend',
              support: `"${loser.policyMeta.label}" scores ${Math.round((loser.value ?? 0) * 100)}% against your recorded ${Math.round((loser.observed ?? 0) * 100)}% (${loser.deltaPp}pp), with ${loser.crossCheckSpreadPp}pp spread across four estimators. Keep deciding; write down what the rule misses. ${holdToken}`,
              delegatedOn: todayStr,
              dueOn: addDays(todayStr, 7),
              status: 'active',
              checkins: [],
              completedOn: null,
              completionNote: '',
              returnedOn: null,
              returnReason: '',
              createdAt: nowIso,
              updatedAt: nowIso,
            };
            draft.delegations.push(task);
            addEffect(COUNTERFACTUAL_RULE_IDS.GOVERN, 'created', 'delegation', task.id,
              'Opened one blameless process task because the record beat the alternative policy');
          }
        }
      }
    }
  }

  /* ---------------------------------------------------------------- *
   * RULE-CFP-04 — Reconciliation & orphan repair.
   * ---------------------------------------------------------------- */
  if (isScan) {
    const markers = ensureMarkers(draft);
    const live = new Set();
    for (const family of Object.keys(SOURCE_COLLECTIONS)) {
      const collection = SOURCE_COLLECTIONS[family];
      for (const rec of draft[collection] || []) {
        if (rec && rec.id) live.add(`${family}:${rec.id}`);
      }
    }
    let dropped = 0;
    draft.policyMarkers = markers.filter((m) => {
      if (!m || !m.family || !m.sourceId) return false;
      const alive = live.has(`${m.family}:${m.sourceId}`);
      if (!alive) dropped += 1;
      return alive;
    });
    if (dropped) {
      addEffect(COUNTERFACTUAL_RULE_IDS.RECONCILE, 'reconciled', 'policyMarker', '',
        `Dropped ${dropped} captured decision point(s) whose source record no longer exists`);
    }

    const validIds = new Set((draft.policyEvaluations || []).map((e) => e && e.id).filter(Boolean));
    const beforeLen = (draft.links || []).length;
    draft.links = (draft.links || []).filter((lnk) => {
      if (lnk.sourceType === 'evaluation') {
        return validIds.has(lnk.sourceId) && Boolean(resolveLinkedEntity(draft, lnk.targetType, lnk.targetId));
      }
      if (lnk.targetType === 'evaluation') {
        return validIds.has(lnk.targetId) && Boolean(resolveLinkedEntity(draft, lnk.sourceType, lnk.sourceId));
      }
      return true;
    });
    if (draft.links.length !== beforeLen) {
      addEffect(COUNTERFACTUAL_RULE_IDS.RECONCILE, 'reconciled', 'link', '', 'Removed stale counterfactual evaluation edges');
    }

    // Frozen evaluation grading: a window that closed without enough new
    // evidence LAPSES rather than being credited.
    for (const ev of draft.policyEvaluations || []) {
      if (ev.status !== 'frozen') continue;
      const due = addDays(ev.frozenOn, ev.horizonDays);
      if (due > todayStr) continue;
      const after = counterfactualReport(draft, now, ev.scope === 'family' ? ev.family : null);
      const held = after.counts.units >= (ev.units || 0) + COUNTERFACTUAL_LIMITS.minUnits
        ? Boolean(after.best && after.best.policyId === ev.race?.[0]?.policyId)
        : null;
      ev.status = 'graded';
      ev.grade = {
        gradedAt: nowIso,
        predictedBestPolicy: ev.race?.[0]?.policyId || null,
        realisedBestPolicy: after.best?.policyId || null,
        unitsBefore: ev.units || 0,
        unitsAfter: after.counts.units,
        held,
        note: held === null
          ? 'Lapsed: fewer than the minimum new decision points arrived inside the window. A window that closes empty is never credited.'
          : '',
      };
      ev.updatedAt = nowIso;
      ev.history = [
        ...(Array.isArray(ev.history) ? ev.history : []),
        {
          at: nowIso,
          type: held === null ? 'lapsed' : 'graded',
          summary: held === null
            ? 'Lapsed on scan: too few new decision points to grade.'
            : `Graded on scan: predicted ${ev.grade.predictedBestPolicy || 'n/a'}, realised ${ev.grade.realisedBestPolicy || 'n/a'}.`,
        },
      ].slice(-COUNTERFACTUAL_LIMITS.maxHistory);
      addEffect(COUNTERFACTUAL_RULE_IDS.RECONCILE, 'updated', 'evaluation', ev.id,
        held === null ? 'Lapsed a frozen policy evaluation' : 'Graded a frozen policy evaluation');
    }
  }

  return effects;
}
