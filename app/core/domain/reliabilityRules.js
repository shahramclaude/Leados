/**
 * app/core/domain/reliabilityRules.js — Generalized Post-Commit Automation
 * Spine for the Measurement Reliability Terminal
 * (RULE-REL-01..05, Schema v77, ADR-0069).
 *
 * Trigger discipline:
 *  - `review.completed` is the only event that can change the observation set, so
 *    it is where the surprise guard runs (RULE-REL-03): the rating has just been
 *    written and the record it should be compared against is everything before
 *    it.
 *  - `reliability.scan` runs the full pass: observation capture, differentiation
 *    qualification, convergence watch, reconciliation and grading.
 *  - `review.reopened` deliberately does nothing here. A reopened review is not
 *    an observation; if it is completed again, `review.completed` fires and the
 *    marker for that review already exists, so nothing is double counted.
 *
 * Marker-idempotent: every generated decision, task and note carries a
 * deterministic `[REL-0X:...]` token, so repeated scans and replays are strict
 * no-ops.
 *
 * What this spine will never do: change a rating, change pay, open a finding
 * about a person, allocate work to someone because they scored low, or write a
 * person-level score into a frozen reading. Every artifact it creates is either
 * a decision for the leader to make or a blameless process task owned by the
 * leader.
 */

import { addDays, dayKey, weekKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { resolveLinkedEntity } from './cases.js';
import {
  harvestReviewObservations,
  reliabilityReport,
} from './reliability.js';
import {
  RELIABILITY_LIMITS,
  RELIABILITY_RELATIONS,
  RELIABILITY_RULE_IDS,
  reviewRatingValue,
} from './reliabilityRegistry.js';

const SCAN_EVENT = 'reliability.scan';
const REVIEW_EVENT = 'review.completed';

function activePerson(draft, id) {
  if (!id) return null;
  return (draft.people || []).find((p) => p && p.id === id && p.status !== 'archived') || null;
}

function leaderOwner(draft) {
  return activePerson(draft, draft.settings?.leaderPersonId)
    || (draft.people || []).find((p) => p && p.status !== 'archived') || null;
}

function ensureMarkers(draft) {
  if (!Array.isArray(draft.reliabilityMarkers)) draft.reliabilityMarkers = [];
  return draft.reliabilityMarkers;
}

function findMarker(markers, key) {
  return markers.find((m) => m && m.key === key) || null;
}

function addMarker(draft, { key, kind, reviewId = '', day, note = '', nowIso }) {
  const markers = ensureMarkers(draft);
  if (findMarker(markers, key)) return false;
  markers.push({ key, kind, reviewId, note: note.slice(0, 240), day, createdAt: nowIso });
  if (markers.length > RELIABILITY_LIMITS.maxMarkers) {
    draft.reliabilityMarkers = markers.slice(-RELIABILITY_LIMITS.maxMarkers);
  }
  return true;
}

function pointsText(value) {
  if (!Number.isFinite(value)) return '—';
  return `${(1 + value * 3).toFixed(2)} points`;
}

export function reliabilityRule(draft, ctx = {}) {
  const event = ctx.event;
  if (!draft || !event || typeof event.type !== 'string') return [];
  const isScan = event.type === SCAN_EVENT;
  const isReview = event.type === REVIEW_EVENT;
  if (!isScan && !isReview) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const todayStr = dayKey(now);
  const nowIso = now.toISOString();
  const idFactory = ctx.idFactory || ((prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`);
  const linkOpts = { idFactory, todayStr, nowIso };
  const autoEnabled = draft.settings?.reliabilityAutoPropagate !== false;
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
      sourceType, sourceId, targetType, targetId, relation, ruleId, summary,
    }, linkOpts);
    if (res.created) addEffect(ruleId, 'linked', targetType, targetId, summary);
    return res.created;
  };

  const harvest = harvestReviewObservations(draft);

  /* ---------------------------------------------------------------- *
   * RULE-REL-01 — Observation capture.
   * ---------------------------------------------------------------- */
  if (isScan || isReview) {
    let captured = 0;
    for (const obs of harvest.observations) {
      const key = `obs:${obs.reviewId}:${obs.occasion}`;
      if (addMarker(draft, {
        key,
        kind: 'observation',
        reviewId: obs.reviewId,
        day: obs.completedOn || obs.occasion,
        note: '',
        nowIso,
      })) captured += 1;
    }
    if (captured) {
      addEffect(RELIABILITY_RULE_IDS.CAPTURE, 'created', 'reliabilityMarker', '',
        `Recorded ${captured} completed rating(s) as observations of the measurement instrument`);
      // No workspace event per capture: the marker is the durable record and the
      // review's own completion event stays the terminal entry on the timeline.
      // Emitting here would rewrite the meaning of "review.completed" for every
      // downstream reader that treats the last event as the outcome.
    }
  }

  /* ---------------------------------------------------------------- *
   * RULE-REL-03 — Surprise guard (on the review that was just completed).
   * ---------------------------------------------------------------- */
  if (isReview && autoEnabled && event.entityId) {
    const review = (draft.reviews || []).find((r) => r && r.id === event.entityId);
    const value = review ? reviewRatingValue(review.manager?.rating) : null;
    if (review && value !== null && review.status === 'complete' && review.personId) {
      // Compare against the record as it was BEFORE this rating: drop this
      // review's own observation, then read the instrument.
      const priorHarvest = harvestReviewObservations({
        ...draft,
        reviews: (draft.reviews || []).filter((r) => r && r.id !== review.id),
      });
      const priorCells = priorHarvest.observations.map((o) => ({
        personId: o.personId, occasion: o.occasion, value: o.value,
      }));
      let priorReading = null;
      if (priorCells.some((c) => c.personId === review.personId)) {
        // A self-contained read model over the prior record. Building a whole
        // report would cache on the draft object and go stale mid-transaction;
        // the credibility arithmetic is cheap and is all this rule needs.
        const temp = { ...draft, reviews: (draft.reviews || []).filter((r) => r && r.id !== review.id) };
        const report = reliabilityReport(temp, now);
        priorReading = report.personRows.find((row) => row.personId === review.personId) || null;
      }
      if (priorReading && Number.isFinite(priorReading.estimate)) {
        const deviation = value - priorReading.estimate;
        const deviationPoints = deviation * 3;
        if (Math.abs(deviationPoints) >= RELIABILITY_LIMITS.surprisePoints) {
          const key = `temper:${review.id}`;
          if (addMarker(draft, {
            key, kind: 'temper', reviewId: review.id, day: todayStr,
            note: '', nowIso,
          })) {
            // The advisory note is appended, never substituted. A leader's
            // judgement stays exactly as they recorded it.
            review.manager = review.manager || {};
            const priorNotes = Array.isArray(review.instrumentNotes) ? review.instrumentNotes : [];
            const direction = deviation > 0 ? 'above' : 'below';
            review.instrumentNotes = [
              ...priorNotes,
              {
                at: nowIso,
                source: RELIABILITY_RULE_IDS.TEMPER,
                text: `This rating sits ${Math.abs(deviationPoints).toFixed(2)} point(s) ${direction} this person's credibility-weighted reading of ${pointsText(priorReading.estimate)} from ${priorReading.n} observation(s) (${Math.round(priorReading.credibility * 100)}% of that reading is their own record). The rating is unchanged. One more observation before this drives a pay, role or formal-plan decision is the cheapest check available.`.slice(0, 600),
              },
            ].slice(-6);
            review.updatedAt = nowIso;
            addEffect(RELIABILITY_RULE_IDS.TEMPER, 'updated', 'review', review.id,
              'Appended an instrument-reliability note to a rating that sits far outside the evidence band');

            const owner = leaderOwner(draft);
            if (owner) {
              draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
              const token = `[REL-03:${review.id}]`;
              if (!draft.delegations.some((d) => (d?.support || '').includes(token))) {
                const task = {
                  id: idFactory('del'),
                  personId: owner.id,
                  title: 'Verify one rating against one more observation before acting on it',
                  expectedOutcome: 'Record one further dated observation of the same behaviour, then decide whether the rating stands. Nothing about the person is decided in this step.',
                  authority: 'recommend',
                  support: `A completed rating sits ${Math.abs(deviationPoints).toFixed(2)} point(s) from this person's credibility-weighted reading. The rating was NOT changed and no finding was recorded about the person — this is a check on the instrument, and it is yours to run. ${token}`,
                  delegatedOn: todayStr,
                  dueOn: addDays(todayStr, 14),
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
                addEffect(RELIABILITY_RULE_IDS.TEMPER, 'created', 'delegation', task.id,
                  'Opened one owned verification task for a rating far outside the evidence band');
                // The frozen reading that is in force is the reason this note
                // exists, so the edge is written: a reader standing on either
                // record can see which certificate the warning came from. With
                // no frozen reading in force there is nothing to point at, and
                // no edge is invented.
                const readingInForce = (draft.reliabilityReadings || [])
                  .find((r) => r && r.id && r.status && r.status !== 'void');
                if (readingInForce) {
                  link('reliability', readingInForce.id, 'review', review.id, RELIABILITY_RELATIONS.TEMPERS,
                    RELIABILITY_RULE_IDS.TEMPER,
                    'Linked the frozen instrument reading that tempers this rating');
                }
              }
            }
          }
        }
      }
    }
  }

  /* ---------------------------------------------------------------- *
   * RULE-REL-02 — Differentiation qualification.
   * ---------------------------------------------------------------- */
  if (isScan && autoEnabled) {
    const report = reliabilityReport(draft, now);
    const differentiating = (draft.meritCycles || []).length > 0
      || (draft.decisions || []).some((d) => d && /differentiat|calibrat/i.test(`${d.title || ''} ${d.question || ''}`));
    if (report.observable && differentiating && report.verdict === 'noise-dominated') {
      const week = weekKey(now) || todayStr;
      const token = `[REL-02:${week}]`;
      draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
      let ruling = draft.decisions.find((d) => `${d?.context || ''}${d?.question || ''}`.includes(token));
      if (!ruling) {
        const c = report.components;
        ruling = {
          id: idFactory('dec'),
          title: 'Can this record support the differentiation it is being asked to make?',
          question: `Your rating instrument carries ${Math.round((c.icc ?? 0) * 100)}% signal against your own ${report.floors.iccFloorPct}% floor, and ${report.separation?.indistinguishablePairs ?? 0} adjacent pair(s) are inside the noise. The workspace is being asked to differentiate (a merit cycle or a calibration decision exists). Decide the standard: hold differentiation to the tiers the evidence supports, collect ${report.decision?.additionalObservations ?? 'more'} more observation(s) per person first, or record explicitly why you are overriding the arithmetic. ${token}`,
          context: `Opened by RULE-REL-02 from a variance decomposition over ${report.counts.observations} completed ratings across ${report.counts.persons} people (τ² = ${c.tau2}, occasion error = ${c.occasionError}, ICC = ${c.icc}). This is a decision about the instrument and the process, never about a person. Priced downstream by Decision Tempo in the same transaction. ${token}`,
          date: todayStr,
          reviewOn: addDays(todayStr, 14),
          reversibility: 'reversible',
          driver: draft.settings?.leaderName || 'Workspace leader',
          approver: '',
          contributors: '',
          informed: '',
          options: [
            { id: idFactory('opt'), label: 'Differentiate only inside the tiers the record supports', pros: 'No decision rests on a difference the record cannot see', cons: 'Some pay or promotion spreads will look flatter than the market expects' },
            { id: idFactory('opt'), label: 'Collect more observations before differentiating', pros: 'The arithmetic improves and the decision gets defensible', cons: 'The decision waits, and waiting has a price' },
            { id: idFactory('opt'), label: 'Override, and record why in writing', pros: 'Preserves judgement the model cannot see', cons: 'The reason becomes reviewable, which is the point' },
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
        addEffect(RELIABILITY_RULE_IDS.QUALIFY, 'created', 'decision', ruling.id,
          'Opened one governed differentiation-standard decision');

        const owner = leaderOwner(draft);
        if (owner) {
          draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
          const taskToken = `[REL-02-TASK:${week}]`;
          if (!draft.delegations.some((d) => (d?.support || '').includes(taskToken))) {
            const task = {
              id: idFactory('del'),
              personId: owner.id,
              title: 'Blameless process check: what would make this rating instrument carry more signal?',
              expectedOutcome: 'Name one concrete change — more observation points per cycle, a second rater, written evidence required before a rating — and the date you will try it.',
              authority: 'recommend',
              support: `The instrument's reliability is ${Math.round((c.icc ?? 0) * 100)}%. This is a question about the process that generates ratings, not about anyone being rated. ${taskToken}`,
              delegatedOn: todayStr,
              dueOn: addDays(todayStr, 10),
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
            addEffect(RELIABILITY_RULE_IDS.QUALIFY, 'created', 'delegation', task.id,
              'Opened one blameless process task to raise the instrument’s signal');
          }
        }

        // Typed edges: the decision qualifies every merit cycle it governs, and
        // any frozen reading is navigable from what it opened.
        for (const cycle of (draft.meritCycles || []).slice(0, 6)) {
          if (cycle && cycle.id) {
            link('decision', ruling.id, 'merit', cycle.id, RELIABILITY_RELATIONS.QUALIFIES,
              RELIABILITY_RULE_IDS.QUALIFY, 'Differentiation standard qualifies this merit cycle');
          }
        }
        for (const reading of (draft.reliabilityReadings || []).slice(-3)) {
          if (reading && reading.id) {
            link('reliability', reading.id, 'decision', ruling.id, RELIABILITY_RELATIONS.QUALIFIES,
              RELIABILITY_RULE_IDS.QUALIFY, 'Frozen instrument reading grounds the differentiation decision');
          }
        }
      }
    }
  }

  /* ---------------------------------------------------------------- *
   * RULE-REL-04 — Instrument convergence watch.
   * ---------------------------------------------------------------- */
  if (isScan && autoEnabled) {
    const report = reliabilityReport(draft, now);
    if (report.convergence && report.convergence.divergingPairs > 0) {
      const monthToken = `[REL-04:${todayStr.slice(0, 7)}]`;
      draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
      if (!draft.delegations.some((d) => (d?.support || '').includes(monthToken))) {
        const owner = leaderOwner(draft);
        if (owner) {
          const worst = report.convergence.pairs.find((p) => p.verdict === 'diverges') || report.convergence.pairs.find((p) => p.verdict === 'independent');
          const task = {
            id: idFactory('del'),
            personId: owner.id,
            title: 'Decide which instrument your next people decision will use',
            expectedOutcome: 'Name the instrument (rating, attainment, feedback, timeliness) that will carry the decision, and say why the others do not.',
            authority: 'recommend',
            support: `Two instruments order your people in opposite directions (${report.convergence.meta[worst?.a] || 'rating'} vs ${report.convergence.meta[worst?.b] || 'attainment'}). No composite is formed from instruments that disagree, so the choice is explicit or it is implicit. ${monthToken}`,
            delegatedOn: todayStr,
            dueOn: addDays(todayStr, 21),
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
          addEffect(RELIABILITY_RULE_IDS.CONVERGE, 'created', 'delegation', task.id,
            'Opened one blameless task because two instruments disagree about the same people');
        }
      }
    }
  }

  /* ---------------------------------------------------------------- *
   * RULE-REL-05 — Reconciliation & grading.
   * ---------------------------------------------------------------- */
  if (isScan) {
    const liveReviews = new Set((draft.reviews || []).map((r) => r && r.id).filter(Boolean));
    let dropped = 0;
    draft.reliabilityMarkers = (draft.reliabilityMarkers || []).filter((m) => {
      if (!m) return false;
      if (!m.reviewId) return true;
      const alive = liveReviews.has(m.reviewId);
      if (!alive) dropped += 1;
      return alive;
    });
    if (dropped) {
      addEffect(RELIABILITY_RULE_IDS.RECONCILE, 'reconciled', 'reliabilityMarker', '',
        `Dropped ${dropped} observation marker(s) whose review no longer exists`);
    }

    const validIds = new Set((draft.reliabilityReadings || []).map((r) => r && r.id).filter(Boolean));
    const beforeLen = (draft.links || []).length;
    draft.links = (draft.links || []).filter((lnk) => {
      if (lnk.sourceType === 'reliability') {
        return validIds.has(lnk.sourceId) && Boolean(resolveLinkedEntity(draft, lnk.targetType, lnk.targetId));
      }
      if (lnk.targetType === 'reliability') {
        return validIds.has(lnk.targetId) && Boolean(resolveLinkedEntity(draft, lnk.sourceType, lnk.sourceId));
      }
      return true;
    });
    if (draft.links.length !== beforeLen) {
      addEffect(RELIABILITY_RULE_IDS.RECONCILE, 'reconciled', 'link', '', 'Removed stale reliability edges');
    }

    const report = reliabilityReport(draft, now);
    for (const reading of draft.reliabilityReadings || []) {
      if (!reading || reading.status !== 'frozen') continue;
      const due = addDays(reading.frozenOn, reading.horizonDays);
      if (due > todayStr) continue;
      const baseline = reading.design?.observations ?? 0;
      const newObservations = Math.max(0, report.counts.observations - baseline);
      const threshold = (reading.thresholdPct ?? RELIABILITY_LIMITS.iccFloorPct) / 100;
      if (newObservations < RELIABILITY_LIMITS.minNewObservations || !report.observable) {
        reading.status = 'graded';
        reading.grade = {
          gradedAt: nowIso,
          icc: report.observable ? report.components.icc : null,
          tiers: report.separation?.tierCount ?? null,
          pairs: report.separation?.pairCount ?? null,
          indistinguishablePairs: report.separation?.indistinguishablePairs ?? null,
          newObservations,
          exceeded: null,
          brier: null,
          note: `Lapsed: only ${newObservations} new observation(s) arrived inside the window (floor ${RELIABILITY_LIMITS.minNewObservations}). A window that closes empty is never credited.`,
        };
      } else {
        const exceeded = report.components.icc >= threshold;
        const predicted = Number.isFinite(reading.predictedExceed) ? reading.predictedExceed : null;
        reading.status = 'graded';
        reading.grade = {
          gradedAt: nowIso,
          icc: report.components.icc,
          tiers: report.separation?.tierCount ?? null,
          pairs: report.separation?.pairCount ?? null,
          indistinguishablePairs: report.separation?.indistinguishablePairs ?? null,
          newObservations,
          exceeded,
          brier: predicted === null ? null : Math.round(((predicted - (exceeded ? 1 : 0)) ** 2) * 10000) / 10000,
          note: '',
        };
      }
      reading.updatedAt = nowIso;
      reading.history = [
        ...(Array.isArray(reading.history) ? reading.history : []),
        {
          at: nowIso,
          type: reading.grade.exceeded === null ? 'lapsed' : 'graded',
          summary: reading.grade.exceeded === null
            ? 'Lapsed on scan: too few new observations to grade.'
            : `Graded on scan: reliability ${Math.round((report.components.icc ?? 0) * 100)}% against a frozen ${reading.thresholdPct}% threshold; prediction ${reading.grade.exceeded ? 'held' : 'did not hold'}.`,
        },
      ].slice(-RELIABILITY_LIMITS.maxHistory);
      addEffect(RELIABILITY_RULE_IDS.RECONCILE, 'updated', 'reliability', reading.id,
        reading.grade.exceeded === null ? 'Lapsed a frozen instrument reading' : 'Graded a frozen instrument reading');
    }
  }

  return effects;
}
