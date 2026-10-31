/**
 * app/core/domain/parityRules.js — synchronous post-commit rules for the
 * Leadership Parity & Standard Consistency Terminal (Schema v65, ADR-0054).
 *
 * Registered on `DEFAULT_POST_COMMIT_RULES` BEFORE `decisionTempoRule` so every
 * standard-consistency or recovery DACI decision opened here receives timing
 * analysis in the same atomic savepoint transaction.
 */

import { addDays, dayKey, weekKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { parityConventionsFromSettings, parityReport } from './parity.js';
import { PARITY_MARKERS_CAP } from './paritySchema.js';

export const PARITY_RULE_VERSION = 1;

export const PARITY_RULE_IDS = Object.freeze({
  STANDARD: 'RULE-PAR-01',
  FRINGE: 'RULE-PAR-02',
  PROMISE: 'RULE-PAR-03',
  BENCH: 'RULE-PAR-04',
  STALE: 'RULE-PAR-05',
});

export const PARITY_EVENTS = Object.freeze({
  SCAN: 'parity.scan',
  FROZEN: 'parity.audit.frozen',
  GRADED: 'parity.audit.graded',
  DELETED: 'parity.audit.deleted',
});

const AUTO_TRIGGERS = new Set([
  'performance.plan.adopted',
  'readiness.set',
  'review.completed',
]);

const EXPLICIT_TRIGGERS = new Set([
  PARITY_EVENTS.SCAN,
  PARITY_EVENTS.FROZEN,
]);

const MAX_TOPICS = 40;

function makeIdFactory(ctx) {
  if (typeof ctx.idFactory === 'function') return ctx.idFactory;
  let seq = 0;
  return (prefix) => `${prefix}-par-${(seq += 1)}`;
}

function hasMarker(markers, tag) {
  return markers.some((m) => typeof m === 'string' && m === tag);
}

function addMarker(markers, tag) {
  if (!markers.includes(tag)) markers.push(tag);
  if (markers.length > PARITY_MARKERS_CAP) {
    markers.splice(0, markers.length - PARITY_MARKERS_CAP);
  }
}

function effect(ruleId, action, targetType, targetId, summary) {
  return { ruleId, action, targetType, targetId, summary };
}

function linkEdge(draft, spec, linkOpts) {
  return ensureEntityLink(draft, spec, linkOpts);
}

function appendTalkingPoint(draft, personId, text, tag) {
  const person = (draft.people || []).find((p) => p && p.id === personId && p.status !== 'archived');
  if (!person) return false;
  const token = `[${tag}]`;
  person.talkingPoints = Array.isArray(person.talkingPoints) ? person.talkingPoints : [];
  if (person.talkingPoints.some((row) => String(row).includes(token))) return false;
  const trimmed = String(text).slice(0, Math.max(20, 198 - token.length));
  person.talkingPoints = [...person.talkingPoints, `${trimmed} ${token}`].slice(-MAX_TOPICS);
  return true;
}

function resolveLeaderPersonId(draft) {
  const leaderName = String(draft.settings?.leaderName || '').trim().toLowerCase();
  if (!leaderName) return null;
  const match = (draft.people || []).find(
    (p) => p && p.status !== 'archived' && String(p.name || '').trim().toLowerCase() === leaderName,
  );
  return match ? match.id : null;
}

function buildDecision(nextId, draft, today, nowIso, { title, question, options, reviewOn, rationale }) {
  const leader = String(draft.settings?.leaderName || '').slice(0, 120);
  return {
    id: nextId('dec'),
    title: String(title).slice(0, 200),
    question: String(question).slice(0, 2000),
    date: today,
    reversibility: 'reversible',
    driver: leader,
    approver: leader,
    contributors: '',
    informed: '',
    options: options.map(([label, pros, cons]) => ({
      id: nextId('opt'),
      label,
      pros,
      cons,
    })),
    chosen: '',
    rationale: String(rationale).slice(0, 4000),
    reviewOn,
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    decidedOn: null,
    createdAt: nowIso,
  };
}

function buildLeaderDelegation(nextId, today, nowIso, { leaderPersonId, title, expectedOutcome, support, dueOn }) {
  return {
    id: nextId('del'),
    personId: leaderPersonId,
    title: String(title).slice(0, 200),
    expectedOutcome: String(expectedOutcome).slice(0, 2000),
    authority: 'own',
    support: String(support).slice(0, 2000),
    delegatedOn: today,
    dueOn,
    status: 'active',
    checkins: [],
    completedOn: null,
    completionNote: '',
    returnedOn: null,
    returnReason: '',
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function parityRule(draft, ctx = {}) {
  const event = ctx.event;
  if (!event || typeof event.type !== 'string') return [];

  const isExplicit = EXPLICIT_TRIGGERS.has(event.type);
  const isAuto = AUTO_TRIGGERS.has(event.type);
  if (!isExplicit && !isAuto) return [];

  const conventions = parityConventionsFromSettings(draft.settings || {});
  if (!isExplicit && !conventions.autoPropagate) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const nowIso = now.toISOString();
  const today = dayKey(now);
  const week = weekKey(now);
  const nextId = makeIdFactory(ctx);
  const linkOpts = { idFactory: nextId, todayStr: today, nowIso };

  draft.parityMarkers = Array.isArray(draft.parityMarkers) ? draft.parityMarkers : [];
  const markers = draft.parityMarkers;
  const effects = [];

  if (isExplicit && Array.isArray(draft.links)) {
    const activePersonIds = new Set(
      (draft.people || []).filter((p) => p && p.status !== 'archived').map((p) => p.id),
    );
    const beforeLen = draft.links.length;
    draft.links = draft.links.filter((link) => {
      if (!link) return false;
      if (link.relation !== 'rebalances-attention' && link.relation !== 'repairs-contract') return true;
      if (link.targetType === 'person' && !activePersonIds.has(link.targetId)) return false;
      if (link.sourceType === 'person' && !activePersonIds.has(link.sourceId)) return false;
      return true;
    });
    if (draft.links.length < beforeLen) {
      effects.push(effect(PARITY_RULE_IDS.STALE, 'reconciled-links', 'workspace', '', `Removed ${beforeLen - draft.links.length} stale parity edge(s) for archived roster entries`));
    }
  }

  const report = parityReport(draft, now, conventions);
  const activeAudit = (draft.parityAudits || []).find((a) => a && a.status === 'frozen') || null;
  const leaderPersonId = resolveLeaderPersonId(draft);

  // ---- RULE-PAR-01: Standard-consistency calibration decision (<=1 / week) ----
  const sc = report.standardConsistency;
  const standardTriggered = isExplicit
    ? sc.inversionsCount > 0
    : event.type === 'performance.plan.adopted'
      ? sc.concerns.inconsistent
      : event.type === 'review.completed'
        ? sc.reviews.discordantPairs.length > 0
        : event.type === 'readiness.set'
          ? sc.readiness.inversionCount > 0
          : false;
  if (standardTriggered) {
    const tag = `${PARITY_RULE_IDS.STANDARD}:${week}`;
    if (!hasMarker(markers, tag)) {
      addMarker(markers, tag);
      const parts = [];
      if (sc.concerns.inconsistent) {
        parts.push(`recovery plans adopted across ${sc.concerns.minObservations}–${sc.concerns.maxObservations} observations (${sc.concerns.overrideCount} override)`);
      }
      if (sc.readiness.inversionCount > 0) {
        parts.push(`${sc.readiness.haloNominations.length} halo nomination(s) vs ${sc.readiness.overlookedBench.length} overlooked bench`);
      }
      if (sc.reviews.discordantPairs.length > 0) {
        parts.push(`${sc.reviews.discordantPairs.length} discordant review pair(s)`);
      }
      const decision = buildDecision(nextId, draft, today, nowIso, {
        title: `Reconcile evaluative standard consistency (${week})`,
        question: `Are the same evidentiary bars being applied across the team (${parts.join('; ')}), or do thresholds need re-anchoring before next review/plan actions?`,
        options: [
          ['Re-anchor to one uniform evidence floor', 'Restores Leventhal procedural consistency across peers', 'May pause premature nominations or unsupported plans'],
          ['Document explicit structural scope differences', 'Preserves role-specific expectations transparently', 'Must be written on the record rather than assumed'],
        ],
        reviewOn: addDays(today, 14),
        rationale: `Auto-opened by ${PARITY_RULE_IDS.STANDARD}: ${parts.join('; ')}. Grades the consistency of the bar, never an employee. [${tag}]`,
      });
      draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
      draft.decisions.unshift(decision);

      if (activeAudit) {
        linkEdge(draft, {
          sourceType: 'parity',
          sourceId: activeAudit.id,
          targetType: 'decision',
          targetId: decision.id,
          relation: 'audits-consistency',
          ruleId: PARITY_RULE_IDS.STANDARD,
          summary: 'Standard-consistency calibration call',
        }, linkOpts);
      }
      for (const rec of sc.concerns.inconsistent ? sc.concerns.records.slice(0, 4) : []) {
        linkEdge(draft, {
          sourceType: 'decision',
          sourceId: decision.id,
          targetType: 'perfconcern',
          targetId: rec.concernId,
          relation: 'audits-consistency',
          ruleId: PARITY_RULE_IDS.STANDARD,
          summary: 'Compared recovery-plan adoption bar',
        }, linkOpts);
      }
      for (const pair of sc.reviews.discordantPairs.slice(0, 3)) {
        linkEdge(draft, {
          sourceType: 'decision',
          sourceId: decision.id,
          targetType: 'review',
          targetId: pair.higherRatedReviewId,
          relation: 'audits-consistency',
          ruleId: PARITY_RULE_IDS.STANDARD,
          summary: 'Discordant review evidence-to-rating pair',
        }, linkOpts);
      }
      effects.push(effect(PARITY_RULE_IDS.STANDARD, 'created-decision', 'decision', decision.id, `Opened standard-consistency decision (${sc.inversionsCount} inversion signal(s))`));
    }
  }

  // ---- RULE-PAR-04: Overlooked-bench sponsorship prompt ----
  if (isExplicit || event.type === 'readiness.set') {
    for (const bench of report.standardConsistency.readiness.overlookedBench.slice(0, Math.max(1, conventions.maxTasksPerScan))) {
      const tag = `${PARITY_RULE_IDS.BENCH}:${week}:${bench.personId}`;
      if (hasMarker(markers, tag)) continue;
      addMarker(markers, tag);
      const added = appendTalkingPoint(
        draft,
        bench.personId,
        `Career & sponsorship check-in: ${bench.evidenceCount}/5 readiness evidence signals are recorded — discuss growth scope and succession visibility`,
        tag,
      );
      if (activeAudit) {
        linkEdge(draft, {
          sourceType: 'parity',
          sourceId: activeAudit.id,
          targetType: 'person',
          targetId: bench.personId,
          relation: 'audits-consistency',
          ruleId: PARITY_RULE_IDS.BENCH,
          summary: `Overlooked bench (${bench.evidenceCount}/5 signals)`,
        }, linkOpts);
      }
      if (added) {
        effects.push(effect(PARITY_RULE_IDS.BENCH, 'queued-prompt', 'person', bench.personId, 'Queued blameless sponsorship check-in prompt for overlooked bench member'));
      }
    }
  }

  if (!isExplicit) return effects;

  // ---- RULE-PAR-02: Structural Fringe re-engagement ----
  for (const fringe of report.fringeRows.slice(0, conventions.maxTasksPerScan)) {
    const tag = `${PARITY_RULE_IDS.FRINGE}:${week}:${fringe.personId}`;
    if (hasMarker(markers, tag)) continue;
    addMarker(markers, tag);

    const prompted = appendTalkingPoint(
      draft,
      fringe.personId,
      'Leader parity check-in: listen on current priorities, blockers, and recent wins — restore steady 1:1 & specific SBI cadence',
      tag,
    );
    if (prompted) {
      effects.push(effect(PARITY_RULE_IDS.FRINGE, 'queued-prompt', 'person', fringe.personId, 'Queued blameless re-engagement 1:1 prompt'));
    }

    if (activeAudit) {
      linkEdge(draft, {
        sourceType: 'parity',
        sourceId: activeAudit.id,
        targetType: 'person',
        targetId: fringe.personId,
        relation: 'rebalances-attention',
        ruleId: PARITY_RULE_IDS.FRINGE,
        summary: 'Structural fringe coaching parity rebalance',
      }, linkOpts);
    }

    if (leaderPersonId && leaderPersonId !== fringe.personId) {
      const del = buildLeaderDelegation(nextId, today, nowIso, {
        leaderPersonId,
        title: `Restore 1:1 & SBI feedback cadence with ${fringe.name}`,
        expectedOutcome: 'Hold an uninterrupted 1:1 and record at least one specific SBI observation within 7 days.',
        support: `Opened on leader record (never on the report) to close structural invisibility gap. [${tag}]`,
        dueOn: addDays(today, 7),
      });
      draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
      draft.delegations.unshift(del);
      linkEdge(draft, {
        sourceType: 'delegation',
        sourceId: del.id,
        targetType: 'person',
        targetId: fringe.personId,
        relation: 'rebalances-attention',
        ruleId: PARITY_RULE_IDS.FRINGE,
        summary: 'Leader-owned coaching parity task',
      }, linkOpts);
      effects.push(effect(PARITY_RULE_IDS.FRINGE, 'created-delegation', 'delegation', del.id, 'Opened leader-owned coaching parity task'));
    }
  }

  // ---- RULE-PAR-03: Broken leader promise recovery ----
  const breachSlice = report.promises.breachRows.slice(0, conventions.maxTasksPerScan);
  let openedPromiseDecision = false;
  for (const row of breachSlice) {
    const tag = `${PARITY_RULE_IDS.PROMISE}:${week}:${row.personId}`;
    if (hasMarker(markers, tag)) continue;
    addMarker(markers, tag);

    appendTalkingPoint(
      draft,
      row.personId,
      `Accountability first: close or renegotiate ${row.overdueOpen} overdue leader commitment(s) owed to ${row.name} before adding new asks`,
      tag,
    );

    if (activeAudit) {
      linkEdge(draft, {
        sourceType: 'parity',
        sourceId: activeAudit.id,
        targetType: 'person',
        targetId: row.personId,
        relation: 'repairs-contract',
        ruleId: PARITY_RULE_IDS.PROMISE,
        summary: `${row.overdueOpen} overdue / ${row.carriedTwicePlus} carried leader commitment(s)`,
      }, linkOpts);
    }

    if (leaderPersonId && leaderPersonId !== row.personId) {
      const del = buildLeaderDelegation(nextId, today, nowIso, {
        leaderPersonId,
        title: `Close ${row.overdueOpen} overdue leader commitment(s) to ${row.name}`,
        expectedOutcome: 'Complete or explicitly re-date every overdue leader/shared commitment on the record.',
        support: `Psychological-contract repair (${row.carriedTwicePlus} carried 2+ times). [${tag}]`,
        dueOn: addDays(today, 5),
      });
      draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
      draft.delegations.unshift(del);
      linkEdge(draft, {
        sourceType: 'delegation',
        sourceId: del.id,
        targetType: 'person',
        targetId: row.personId,
        relation: 'repairs-contract',
        ruleId: PARITY_RULE_IDS.PROMISE,
        summary: 'Leader promise-recovery task',
      }, linkOpts);
      effects.push(effect(PARITY_RULE_IDS.PROMISE, 'created-delegation', 'delegation', del.id, 'Opened leader-promise recovery task'));
    } else if (!openedPromiseDecision) {
      const decTag = `${PARITY_RULE_IDS.PROMISE}-DEC:${week}`;
      if (!hasMarker(markers, decTag)) {
        addMarker(markers, decTag);
        openedPromiseDecision = true;
        const dec = buildDecision(nextId, draft, today, nowIso, {
          title: `Clear overdue leader commitments (${report.promises.totalOverdueOpen} open)`,
          question: 'Which overdue leader promises will be delivered this week, and which must be explicitly renegotiated in 1:1s?',
          options: [
            ['Block 2 hours to clear overdue leader actions first', 'Restores psychological-contract reliability directly', 'Displaces lower-urgency admin'],
            ['Renegotiate scope & dates explicitly in this week’s 1:1s', 'Replaces silent slip with honest dates', 'Requires transparent conversation'],
          ],
          reviewOn: addDays(today, 7),
          rationale: `${breachSlice.length} teammate(s) experience repeated overdue/carried leader commitments. [${decTag}]`,
        });
        draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
        draft.decisions.unshift(dec);
        linkEdge(draft, {
          sourceType: 'decision',
          sourceId: dec.id,
          targetType: 'person',
          targetId: row.personId,
          relation: 'repairs-contract',
          ruleId: PARITY_RULE_IDS.PROMISE,
          summary: 'Leader promise-recovery decision',
        }, linkOpts);
        effects.push(effect(PARITY_RULE_IDS.PROMISE, 'created-decision', 'decision', dec.id, 'Opened leader-promise recovery decision'));
      }
    }
  }

  // ---- RULE-PAR-05b: Stale frozen parity audits awaiting grading ----
  const staleAudits = (draft.parityAudits || []).filter(
    (a) => a && a.status === 'frozen' && a.reviewOn && a.reviewOn <= today,
  );
  for (const audit of staleAudits.slice(0, 3)) {
    const tag = `${PARITY_RULE_IDS.STALE}:${audit.id}`;
    if (hasMarker(markers, tag)) continue;
    addMarker(markers, tag);
    if (leaderPersonId) {
      const del = buildLeaderDelegation(nextId, today, nowIso, {
        leaderPersonId,
        title: `Grade due parity audit “${audit.label}”`,
        expectedOutcome: `Score frozen parity audit (review due ${audit.reviewOn}) against realized team records.`,
        support: `Falsifiable self-audit check. [${tag}]`,
        dueOn: addDays(today, 3),
      });
      draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
      draft.delegations.unshift(del);
      linkEdge(draft, {
        sourceType: 'delegation',
        sourceId: del.id,
        targetType: 'parity',
        targetId: audit.id,
        relation: 'scores',
        ruleId: PARITY_RULE_IDS.STALE,
        summary: `Grade due parity audit (${audit.reviewOn})`,
      }, linkOpts);
      effects.push(effect(PARITY_RULE_IDS.STALE, 'created-delegation', 'delegation', del.id, `Opened grading task for due parity audit ${audit.id}`));
    } else {
      const dec = buildDecision(nextId, draft, today, nowIso, {
        title: `Grade due parity audit “${audit.label}”`,
        question: `Did within-cohort LMX disparity, promise fulfillment and standard consistency improve since ${audit.frozenOn}?`,
        options: [
          ['Grade audit now and freeze next cycle', 'Closes calibration loop on schedule', 'Surfaces misses plainly'],
          ['Grade audit and adjust rebalancing levers', 'Updates coaching/delegation plan from realized miss', 'Requires follow-up time'],
        ],
        reviewOn: addDays(today, 5),
        rationale: `Parity audit ${audit.id} passed reviewOn ${audit.reviewOn} ungraded. [${tag}]`,
      });
      draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
      draft.decisions.unshift(dec);
      linkEdge(draft, {
        sourceType: 'decision',
        sourceId: dec.id,
        targetType: 'parity',
        targetId: audit.id,
        relation: 'scores',
        ruleId: PARITY_RULE_IDS.STALE,
        summary: `Grade due parity audit (${audit.reviewOn})`,
      }, linkOpts);
      effects.push(effect(PARITY_RULE_IDS.STALE, 'created-decision', 'decision', dec.id, `Opened grading decision for due parity audit ${audit.id}`));
    }
  }

  return effects;
}
