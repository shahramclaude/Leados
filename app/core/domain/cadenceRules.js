/**
 * app/core/domain/cadenceRules.js — post-commit propagation & cross-altitude
 * roll-up rules for the Operating Cadence Clock (`#/cadence`, Schema v93,
 * ADR-0087).
 *
 * Registered on `DEFAULT_POST_COMMIT_RULES` immediately after `catchballRule`
 * and BEFORE `concordanceRule`, `attentionMarketRule`, `successionRule`,
 * `seatRule` and `sealRule`, so:
 *
 *   1. A governed decision opened here (RULE-CAD-02/04) is priced by
 *      `decisionTempoRule` and can be rebalanced by `attentionMarketRule` in the
 *      SAME atomic commit;
 *   2. Typed `rolls-up-to` edges written by RULE-CAD-01/03 reach every leadership
 *      ancestor inside the same transaction, so the CEO's roll-up is never a
 *      separate nightly job; and
 *   3. `sealRule` hashes and attests the whole transaction, including these
 *      edges, in one seal.
 *
 * THE FOUR RULES
 * --------------
 *  RULE-CAD-01  Queue provenance. Every reviewable open item attributed to a
 *               competent forum gets exactly one idempotent `queued-for` edge to
 *               that forum, and one `rolls-up-to` edge per leadership ancestor of
 *               the item's owning span. Sensitive sources (a performance concern)
 *               contribute NO edge — only a count — because routing a confidential
 *               people record into a governance graph is a disclosure failure.
 *
 *  RULE-CAD-02  Constraint escalation. When the named binding constraint is a
 *               capacity, competence or service-time constraint, open exactly one
 *               governed DACI decision per ISO week, owned at the altitude that
 *               can actually relieve it, and fan it up every ancestor.
 *
 *  RULE-CAD-03  Agenda fit. When a forum is `disjoint` or `narrower-than-work`,
 *               write one `fit-gap` edge to each owning seat the forum is missing
 *               (capped), so the "add this seat to this forum" fix is navigable
 *               from both ends rather than living in someone's head.
 *
 *  RULE-CAD-04  Grading & maturity. Grade any due frozen reading exactly once
 *               (never rewrite a grade), and record a maturity marker the first
 *               time a forum accumulates enough settled sittings for its
 *               closures-per-sitting figure to mean anything.
 *
 * Never: rates a person, names an individual record above the manager altitude,
 * invents a waiting time below the floor, or auto-declares a forum.
 */

import { addDays, dayKey, weekKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { LEADER_ID } from './chain.js';
import { altitudeByKey } from './chainRegistry.js';
import { ancestorPersonSeatIds } from './catchball.js';
import { matrixJointApex } from './matrix.js';
import {
  buildCadenceReport,
  gradeCadenceReading,
  cadenceConventions,
} from './cadence.js';
import { normalizeCadenceSettings } from './cadenceSchema.js';
import {
  CADENCE_EVENTS,
  CADENCE_LIMITS,
  CADENCE_RULE_IDS,
} from './cadenceRegistry.js';

const CADENCE_TRIGGER_SET = new Set(Object.values(CADENCE_EVENTS));
const MATRIX_CADENCE_TRIGGER_SET = new Set([
  'matrix.line.declared',
  'matrix.line.retuned',
  'matrix.line.ended',
]);

function clampStr(v, max = 280) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function noteEffect(ctx, out, ruleId, action, targetType, targetId, summary) {
  const clean = clampStr(summary, 280);
  out.push({ ruleId, action, targetType, targetId, summary: clean });
  if (ctx && typeof ctx.logEvent === 'function') {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: targetType,
      entityId: targetId,
      summary: `[${ruleId}] ${clean}`.slice(0, 300),
    });
  }
}

function linkOnce(draft, ctx, sourceType, sourceId, targetType, targetId, relation, ruleId, summary) {
  const result = ensureEntityLink(
    draft,
    {
      sourceType,
      sourceId,
      targetType,
      targetId,
      relation,
      ruleId,
      summary: clampStr(summary, 280),
    },
    {
      idFactory: ctx.idFactory,
      todayStr: dayKey(ctx.now),
      nowIso: ctx.now.toISOString(),
    },
  );
  return result.created;
}

function hasMarker(draft, key) {
  const list = Array.isArray(draft.cadenceMarkers) ? draft.cadenceMarkers : [];
  return list.some((m) => m && m.key === key);
}

function recordMarker(draft, ctx, key, kind, summary) {
  if (!Array.isArray(draft.cadenceMarkers)) draft.cadenceMarkers = [];
  if (draft.cadenceMarkers.some((m) => m && m.key === key)) return false;
  draft.cadenceMarkers.push({
    id: ctx.idFactory('cdm'),
    key,
    kind,
    recordedOn: dayKey(ctx.now),
    summary: clampStr(summary, 240),
  });
  if (draft.cadenceMarkers.length > CADENCE_LIMITS.markers) {
    draft.cadenceMarkers.splice(0, draft.cadenceMarkers.length - CADENCE_LIMITS.markers);
  }
  return true;
}

function decisionHasTag(draft, tag) {
  return (draft.decisions || []).some(
    (d) => d && (String(d.question || '').includes(tag) || String(d.rationale || '').includes(tag)),
  );
}

function workspaceLeaderName(draft) {
  const people = Array.isArray(draft.people) ? draft.people : [];
  const ids = new Set(people.map((p) => p && p.id).filter(Boolean));
  const root = people.find((p) => p && p.status !== 'archived' && (!p.managerId || !ids.has(p.managerId)));
  return (root && root.name) || draft?.settings?.leaderName || 'Workspace leader';
}

function buildGovernedDecision(ctx, draft, { title, question, rationale, options, reviewDays = 14, ownerName = null }) {
  const leader = ownerName || workspaceLeaderName(draft);
  const today = dayKey(ctx.now);
  return {
    id: ctx.idFactory('dec'),
    title: clampStr(title, 180),
    question: clampStr(question, 900),
    date: today,
    reversibility: 'reversible',
    driver: leader,
    approver: leader,
    contributors: '',
    informed: '',
    options: options.map((opt) => ({
      id: ctx.idFactory('opt'),
      label: clampStr(opt.label, 180),
      pros: clampStr(opt.pros, 240),
      cons: clampStr(opt.cons, 240),
    })),
    chosen: '',
    rationale: clampStr(rationale, 500),
    reviewOn: addDays(today, reviewDays),
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    decidedOn: null,
    createdAt: ctx.now.toISOString(),
  };
}

/** The seat(s) a constraint should be escalated to: for ambiguous matrix
 * authority, the joint apex in the reporting DAG; for a forum constraint, its
 * chair; otherwise the chair of the longest-horizon active forum. */
function escalationTargets(draft, report, built) {
  if (report.constraint.type === 'ambiguous-matrix-authority') {
    const competingIds = [...new Set(
      (report.picture.ambiguous || []).flatMap((item) => (
        item.competingChairIds?.length
          ? item.competingChairIds
          : (item.accountableSites || [])
      )),
    )].filter((id) => id && built.byId.has(id));
    if (report.picture.matrix && competingIds.length > 1) {
      const apex = matrixJointApex(report.picture.matrix, competingIds);
      if (apex?.unique && apex.apexId && built.byId.has(apex.apexId)) {
        return { seatId: apex.apexId, rollupRoots: [apex.apexId] };
      }
      if (apex?.ambiguous && Array.isArray(apex.apexIds) && apex.apexIds.length) {
        const valid = apex.apexIds.filter((id) => built.byId.has(id));
        if (valid.length) return { seatId: valid[0], rollupRoots: valid };
      }
    }
    return { seatId: LEADER_ID, rollupRoots: competingIds };
  }
  if (report.constraint.forumId) {
    const row = report.picture.forums.find((f) => f.id === report.constraint.forumId);
    if (row?.chairSeatId && built.byId.has(row.chairSeatId)) {
      return { seatId: row.chairSeatId, rollupRoots: [row.chairSeatId] };
    }
  }
  const candidates = report.picture.forums.filter((f) => f.status === 'active');
  if (!candidates.length) return { seatId: LEADER_ID, rollupRoots: [] };
  const longest = candidates.reduce((best, row) => ((row.forum.horizonDays || 0) > (best.forum.horizonDays || 0) ? row : best), candidates[0]);
  const id = built.byId.has(longest.chairSeatId) ? longest.chairSeatId : LEADER_ID;
  return { seatId: id, rollupRoots: id === LEADER_ID ? [] : [id] };
}

/**
 * Post-commit hook (`RULE-CAD-01..04`).
 */
export function cadenceRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string') return [];

  const forums = Array.isArray(draft.cadenceForums) ? draft.cadenceForums : [];
  const hasExistingCadenceLinks = Array.isArray(draft.links) && draft.links.some(
    (e) => e && (e.ruleId === CADENCE_RULE_IDS.QUEUE || e.ruleId === CADENCE_RULE_IDS.FIT),
  );
  const isMatrixTrigger = MATRIX_CADENCE_TRIGGER_SET.has(event.type);
  if (!CADENCE_TRIGGER_SET.has(event.type) && !(isMatrixTrigger && (forums.length > 0 || hasExistingCadenceLinks))) {
    return [];
  }

  const conv = normalizeCadenceSettings(draft.settings || {});
  const isExplicitScan = event.type === CADENCE_EVENTS.SCAN;
  if (!conv.cadenceAutoPropagate && !isExplicitScan) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const hookCtx = {
    ...ctx,
    now,
    idFactory: typeof ctx.idFactory === 'function' ? ctx.idFactory : ((p) => `${p}-${Date.now()}`),
  };
  const out = [];

  // Nothing declared, nothing to say unless stale cadence links need pruning.
  if (!forums.length && !isExplicitScan && !hasExistingCadenceLinks) return [];

  // Build against the full workspace, not a scoped view, so the constraint is the
  // organisation's and not the acting seat's. The view layer scopes its own reads.
  const fullStateView = { ...draft, settings: { ...(draft.settings || {}), activeSeatId: null } };
  const report = buildCadenceReport(fullStateView, { now, settings: conv });
  const built = report.picture.built;

  /* ---------------- Reconcile stale RULE-CAD-01 & RULE-CAD-03 provenance */
  const edgeKey = (sourceType, sourceId, targetType, targetId, relation) => JSON.stringify([
    sourceType, sourceId, targetType, targetId, relation,
  ]);
  const forumIdSet = new Set(forums.map((f) => f && f.id).filter(Boolean));
  const forumRowById = new Map(report.picture.forums.map((row) => [row.id, row]));
  const validQueueKeys = new Set();
  const queueItems = [];

  for (const item of report.picture.perItem) {
    if (!item.reviewable || !item.forumId || !forumIdSet.has(item.forumId)) continue;
    // A sensitive source contributes to the count and never to the graph.
    if (item.sensitive) continue;
    const sourceType = item.type === 'case' ? 'case' : item.type;
    validQueueKeys.add(edgeKey(sourceType, item.entityId, 'cadenceforum', item.forumId, 'queued-for'));

    const sites = Array.isArray(item.accountableSites) && item.accountableSites.length
      ? item.accountableSites
      : (item.ownerNodeId ? [item.ownerNodeId] : []);
    const row = forumRowById.get(item.forumId);
    const roots = [...sites];
    if (row?.chairSeatId && !roots.includes(row.chairSeatId)) roots.push(row.chairSeatId);
    const chainSeats = [];
    const seenSeats = new Set();
    for (const rootId of roots) {
      if (!rootId || !built.byId.has(rootId)) continue;
      for (const seatId of [rootId, ...ancestorPersonSeatIds(built, rootId)]) {
        if (!seatId || !built.byId.has(seatId) || seenSeats.has(seatId)) continue;
        seenSeats.add(seatId);
        chainSeats.push(seatId);
        validQueueKeys.add(edgeKey('cadenceforum', item.forumId, 'person', seatId, 'rolls-up-to'));
      }
    }
    queueItems.push({ item, sourceType, chainSeats });
  }

  const validFitKeys = new Set();
  const fitItems = [];
  for (const row of report.picture.forums) {
    if (!['disjoint', 'narrower-than-work'].includes(row.fit?.topology)) continue;
    const missing = (Array.isArray(row.fit?.missingSeatIds) ? row.fit.missingSeatIds : [])
      .filter((seatId) => seatId && built.byId.has(seatId));
    if (!missing.length) continue;
    for (const seatId of missing) {
      validFitKeys.add(edgeKey('cadenceforum', row.id, 'person', seatId, 'fit-gap'));
    }
    fitItems.push({ row, missing });
  }

  let removed = 0;
  if (Array.isArray(draft.links)) {
    draft.links = draft.links.filter((edge) => {
      if (edge?.ruleId === CADENCE_RULE_IDS.QUEUE && (edge.relation === 'queued-for' || edge.relation === 'rolls-up-to')) {
        const k = edgeKey(edge.sourceType, edge.sourceId, edge.targetType, edge.targetId, edge.relation);
        if (validQueueKeys.has(k)) return true;
        removed += 1;
        return false;
      }
      if (edge?.ruleId === CADENCE_RULE_IDS.FIT && edge.relation === 'fit-gap') {
        const k = edgeKey(edge.sourceType, edge.sourceId, edge.targetType, edge.targetId, edge.relation);
        if (validFitKeys.has(k)) return true;
        removed += 1;
        return false;
      }
      return true;
    });
  }
  if (removed) {
    noteEffect(hookCtx, out, CADENCE_RULE_IDS.QUEUE, 'reconciled', 'cadenceforum', 'workspace',
      `Removed ${removed} obsolete cadence provenance/fit edge(s) after route, attendance, or line change.`);
  }

  /* ------------------------------------- RULE-CAD-01: queue provenance & roll-up */
  let linksWritten = 0;
  for (const { item, sourceType, chainSeats } of queueItems) {
    if (linksWritten >= 60) break;
    const classLabel = item.classLabel || item.classKey;
    if (linkOnce(
      draft, hookCtx,
      sourceType,
      item.entityId,
      'cadenceforum', item.forumId,
      'queued-for',
      CADENCE_RULE_IDS.QUEUE,
      `${classLabel} queued for the competent forum (horizon ${item.requiredHorizonDays ?? '—'}d, age ${item.ageDays}d).`,
    )) {
      linksWritten += 1;
      noteEffect(hookCtx, out, CADENCE_RULE_IDS.QUEUE, 'linked', 'cadenceforum', item.forumId,
        `Queued ${classLabel.toLowerCase()} in the competent forum.`);
    }
    for (const seatId of chainSeats) {
      if (linksWritten >= 60) break;
      const seatNode = built.byId.get(seatId);
      const rank = seatNode ? seatNode.rank : 2;
      const disc = rank <= 2 ? 'names' : rank === 3 ? 'unit' : 'aggregate';
      if (linkOnce(
        draft, hookCtx,
        'cadenceforum', item.forumId,
        'person', seatId,
        'rolls-up-to',
        CADENCE_RULE_IDS.QUEUE,
        `Forum queue rolled up to ${seatNode?.shortLabel || 'leadership'} (rank ${rank}, ${disc} disclosure).`,
      )) {
        linksWritten += 1;
        noteEffect(hookCtx, out, CADENCE_RULE_IDS.QUEUE, 'rolled-up', 'person', seatId,
          `Rolled the forum queue up to leadership span ${seatId} (rank ${rank}).`);
      }
    }
  }

  /* ---------------------------------------- RULE-CAD-02: constraint escalation */
  const constraint = report.constraint;
  const escalatable = ['forum-capacity', 'competence-gap', 'ambiguous-matrix-authority', 'service-time'].includes(constraint.type);
  if (escalatable) {
    const isoWk = weekKey(now);
    const tag = `[CAD-SIG:${constraint.type}:${constraint.forumId || 'workspace'}:${isoWk}]`;
    if (!decisionHasTag(draft, tag) && !hasMarker(draft, tag)) {
      const { seatId, rollupRoots } = escalationTargets(draft, report, built);
      const seatNode = built.byId.get(seatId);
      const rank = seatNode ? seatNode.rank : 5;
      const alt = altitudeByKey(seatNode?.altitudeKey) || null;
      const options = constraint.type === 'forum-capacity'
        ? [
          {
            label: 'Raise decision capacity per sitting for the binding forum',
            pros: 'Directly relieves ρ without changing the calendar or the escalation routes.',
            cons: 'Risks shallow decisions if the sitting cannot actually absorb more.',
          },
          {
            label: 'Shorten the forum interval so demand is served more often',
            pros: 'Reduces waiting time and the number of items that escape the ladder.',
            cons: 'Costs calendar time from every attendee; the queue moves to preparation.',
          },
          {
            label: 'Move one input class to a different competent forum',
            pros: 'Splits the load along the competence boundary instead of overloading one server.',
            cons: 'Adds a handoff and a second service time for the moved class.',
          },
        ]
        : constraint.type === 'competence-gap'
          ? [
            {
              label: 'Declare a forum of the competent kind at the required horizon',
              pros: 'Gives the unmatched work a place it can actually be closed.',
              cons: 'Adds a standing calendar cost that must be paid every cycle.',
            },
            {
              label: 'Widen an existing forum’s time-span of discretion to cover the class',
              pros: 'No new calendar; uses the authority the forum already has.',
              cons: 'Longer-horizon work competes with the forum’s current agenda.',
            },
            {
              label: 'Formally retire the class and record why it needs no forum',
              pros: 'Honest: stops counting work as governable that the organisation will not govern.',
              cons: 'Must be recorded, not implied; the items stay open and visible.',
            },
          ]
          : constraint.type === 'ambiguous-matrix-authority'
            ? [
              {
                label: 'Assign standing forum authority for this work class to one line',
                pros: 'Removes duplicate queue claims without dissolving the matrix.',
                cons: 'The non-deciding line relies on updates rather than holding veto.',
              },
              {
                label: 'Convene a joint review at the common apex covering both lines',
                pros: 'Both accountable managers sit at one table with clear decision authority.',
                cons: 'Uses joint calendar bandwidth across two reporting lines.',
              },
              {
                label: 'Clarify or end the overlapping reporting line authority',
                pros: 'Restores single-point accountability when dual lines are accidental.',
                cons: 'Requires revisiting the cross-line staffing arrangement.',
              },
            ]
            : [
              {
                label: 'Add an ad-hoc decision route for the escaping class',
                pros: 'Closes the specific items the calendar cannot reach in time.',
                cons: 'Ad-hoc routes erode the cadence they bypass if used habitually.',
              },
              {
                label: 'Shorten the interval of the competent forum',
                pros: 'Buys slack for every item in the class, not just this week.',
                cons: 'Consumes calendar time; the constraint may simply move upstream.',
              },
              {
                label: 'Extend the class horizon and record the decision that extends it',
                pros: 'Makes the current service time defensible instead of invisible.',
                cons: 'An item that genuinely needed the shorter horizon now lands late by policy.',
              },
            ];

      const seatName = seatNode?.name || built.chain?.byId?.get(seatId)?.name || null;
      const dec = buildGovernedDecision(hookCtx, draft, {
        title: `Cadence constraint: ${constraint.title}`.slice(0, 180),
        question: `${constraint.detail} ${report.clock.counts.escape > 0 ? `${report.clock.counts.escape} item(s) currently escape their own horizon through every competent forum.` : ''} Which change to the governance calendar relieves the binding constraint? ${tag}`,
        rationale: `Opened by ${CADENCE_RULE_IDS.CONSTRAINT} (${constraint.type}; Theory of Constraints, Goldratt 1984/1997): the constraint on closing decisions is the standing forum, not the people in it. Escalated to the ${alt?.label || 'leadership'} seat that can relieve it.`,
        options,
        reviewDays: Math.max(7, Math.min(45, Number(constraint.rho && constraint.rho >= 1 ? 7 : 21))),
        ownerName: seatName,
      });
      draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
      draft.decisions.unshift(dec);
      recordMarker(draft, hookCtx, tag, 'constraint-decision', `Cadence constraint decision ${dec.id} opened for ${constraint.type}.`);
      if (constraint.forumId && forumIdSet.has(constraint.forumId)) {
        linkOnce(draft, hookCtx, 'cadenceforum', constraint.forumId, 'decision', dec.id, 'escalates-to',
          CADENCE_RULE_IDS.CONSTRAINT, `Binding cadence constraint escalated to a governed decision.`);
      }
      noteEffect(hookCtx, out, CADENCE_RULE_IDS.CONSTRAINT, 'created', 'decision', dec.id,
        `Opened the governed cadence-constraint decision (${constraint.type}).`);
      // Fan the decision up every leadership ancestor of the escalating seat(s) so
      // the level above sees the constraint in the SAME transaction.
      const roots = rollupRoots.length ? rollupRoots : (seatId && seatId !== LEADER_ID ? [seatId] : []);
      const ancestors = [];
      const seenAnc = new Set();
      for (const rId of roots) {
        for (const id of [rId, ...ancestorPersonSeatIds(built, rId)]) {
          if (!id || id === LEADER_ID || seenAnc.has(id)) continue;
          seenAnc.add(id);
          ancestors.push(id);
        }
      }
      for (const ancestorId of ancestors) {
        if (!built.byId.has(ancestorId)) continue;
        if (linkOnce(draft, hookCtx, 'decision', dec.id, 'person', ancestorId, 'rolls-up-to',
          CADENCE_RULE_IDS.CONSTRAINT, 'Cadence constraint escalated through the reporting line.')) {
          noteEffect(hookCtx, out, CADENCE_RULE_IDS.CONSTRAINT, 'rolled-up', 'person', ancestorId,
            `Cadence constraint decision rolled up to span ${ancestorId}.`);
        }
      }
      if (rank >= 4 && constraint.rho !== null) {
        noteEffect(hookCtx, out, CADENCE_RULE_IDS.CONSTRAINT, 'governed', 'cadenceforum', constraint.forumId || 'workspace',
          `Executive-level constraint (ρ ${constraint.rho}) now carries a board-reportable decision.`);
      }
    }
  }

  /* ------------------------------------------------------- RULE-CAD-03: agenda fit */
  for (const { row, missing } of fitItems) {
    let written = 0;
    for (const seatId of missing) {
      if (written >= 8) break;
      if (linkOnce(draft, hookCtx, 'cadenceforum', row.id, 'person', seatId, 'fit-gap',
        CADENCE_RULE_IDS.FIT,
        `Forum membership does not include the seat that owns arriving work (${row.fit.topology}).`)) {
        written += 1;
        noteEffect(hookCtx, out, CADENCE_RULE_IDS.FIT, 'linked', 'person', seatId,
          `Recorded an agenda-fit gap: ${row.title} cannot close this span's work directly.`);
      }
    }
  }

  /* ------------------------------------------- RULE-CAD-04: grading & maturity */
  draft.cadenceReadings = Array.isArray(draft.cadenceReadings) ? draft.cadenceReadings : [];
  for (let i = 0; i < draft.cadenceReadings.length; i += 1) {
    const reading = draft.cadenceReadings[i];
    if (!reading || reading.grade) continue;
    const graded = gradeCadenceReading(reading, draft, { now });
    if (graded.changed) {
      draft.cadenceReadings[i] = graded.reading;
      noteEffect(hookCtx, out, CADENCE_RULE_IDS.GRADING, 'graded', 'cadencereading', reading.id,
        `Graded the frozen cadence reading: ${graded.reading.grade.outcome}.`);
    }
  }

  const floor = conv.cadenceFloorN;
  for (const row of report.picture.forums) {
    if (row.sittingsN < floor) continue;
    const matKey = `CAD-MAT:${row.id}:n-${floor}`;
    if (recordMarker(draft, hookCtx, matKey, 'cadence-maturity',
      `Forum "${row.title}" reached ${row.sittingsN} recorded sittings; closures-per-sitting is now a measurement.`)) {
      noteEffect(hookCtx, out, CADENCE_RULE_IDS.GRADING, 'recorded', 'cadenceforum', row.id,
        `Forum sitting history reached the evidence floor (${row.sittingsN} ≥ ${floor}).`);
    }
  }

  // Keep the read-only conventions honest in the audit trail on an explicit scan.
  if (isExplicitScan) {
    noteEffect(hookCtx, out, CADENCE_RULE_IDS.QUEUE, 'scanned', 'cadenceforum', 'workspace',
      `Scanned ${report.counts.items} open item(s) against ${report.counts.activeForums} active forum(s); constraint is ${constraint.type}.`);
  }

  return out;
}

/** Re-exported so the API layer and tests share one convention reader. */
export { cadenceConventions };
