/**
 * app/core/domain/boardRules.js — post-commit rules for the Board Room
 * (Schema v90, ADR-0084).
 *
 * RULE-BRD-01 OBLIGATION. A committed memo whose frozen snapshot contains a
 * FAILING claim opens exactly one governed DACI decision for that claim (per
 * memo revision), and — where the failing reading is attributable to a span —
 * exactly one owned obligation delegated to that span's holder. The direction of
 * travel is DOWNWARD, which is what makes this different from every other
 * terminal in the app: the enterprise's finding becomes a director's named work
 * in the same atomic transaction in which the board line was committed, with no
 * re-entry by anyone.
 *
 * RULE-BRD-02 ROLL-UP. The same commit writes typed `summarizes-span` edges from
 * the memo to every person node whose span the memo actually reports on, and one
 * `escalates-from` edge per generated decision back to the memo. The provenance
 * is therefore walkable in both directions from the graph: "why did this land on
 * my desk?" and "what did the board line rest on?"
 *
 * RULE-BRD-03 ADVISORY. When the workspace freezes its FIRST board memo, one
 * audit marker records that a disclosed pack now exists — nothing is decided,
 * graded or reassigned by the marker.
 *
 * Marker-idempotent, pausable by `boardAutoPropagate`, and an explicit
 * `board.scan` always runs. The rules never edit a claim, never change a
 * threshold, and never write a verdict into the record: they take the frozen
 * snapshot as given.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { boardEvaluateMemo, boardConventions } from './board.js';
import { BOARD_EVENTS, BOARD_LIMITS, BOARD_RULES } from './boardRegistry.js';

const MARKER_CAP = BOARD_LIMITS.markers;

const DERIVED_EVENT_PREFIXES = Object.freeze([
  'automation.', 'seat.', 'propagation.', 'vault.', 'workspace.',
  'settings.', 'demo.', 'import.', 'export.', 'lock.', 'crypto.',
]);

function isOperationalCommit(event) {
  if (!event || typeof event !== 'object') return false;
  const type = String(event.type || '');
  if (!type) return false;
  if (type.startsWith('board.')) return true;
  return !DERIVED_EVENT_PREFIXES.some((prefix) => type.startsWith(prefix));
}

function markerStore(draft) {
  if (!Array.isArray(draft.boardMarkers)) draft.boardMarkers = [];
  return draft.boardMarkers;
}

function addMarker(draft, tag) {
  const markers = markerStore(draft);
  if (markers.includes(tag)) return false;
  markers.push(tag);
  if (markers.length > MARKER_CAP) markers.splice(0, markers.length - MARKER_CAP);
  return true;
}

const seen = (draft, tag) => markerStore(draft).includes(tag);

const effect = (ruleId, action, targetType, targetId, summary) => ({ ruleId, action, targetType, targetId, summary });

function link(draft, ctx, sourceType, sourceId, targetType, targetId, relation, ruleId, summary) {
  return ensureEntityLink(draft, {
    sourceType, sourceId, targetType, targetId, relation, ruleId, summary,
  }, {
    idFactory: ctx.idFactory,
    todayStr: dayKey(ctx.now),
    nowIso: ctx.now.toISOString(),
  }).created;
}

const quoted = (memo) => ['committed', 'frozen'].includes(memo?.status) && memo.snapshot && Array.isArray(memo.snapshot.claims);

/**
 * The span a failing reading is attributable to: for a span-partitioned claim a
 * real person node; for an altitude-partitioned claim a rank, which is not a
 * person and therefore opens a decision but no delegation.
 */
function worstOwner(row) {
  const partition = row.partition;
  if (!partition || !Array.isArray(partition.rows) || !partition.rows.length) return null;
  const usable = partition.rows.filter((r) => r.value !== null && r.n > 0);
  if (!usable.length) return null;
  const gte = row.comparator === 'gte';
  const worst = [...usable].sort((a, b) => (gte ? a.value - b.value : b.value - a.value))[0];
  if (partition.dimension === 'span') return { nodeId: worst.key, label: worst.label, value: worst.value, n: worst.n };
  return { nodeId: null, label: worst.label, value: worst.value, n: worst.n, altitudeKey: worst.key };
}

function obligationDecision(ctx, memo, row, owner, conv) {
  const figure = row.unit === 'binary'
    ? (row.value === null ? 'no reading' : row.value >= 100 ? 'verified' : 'not verified')
    : row.value === null
      ? `${row.n} observation(s) with the rate withheld`
      : `${row.value}% against a ${row.threshold}% ${row.comparator === 'gte' ? 'floor' : 'ceiling'} (interval ${row.lower}–${row.upper}%)`;
  return {
    id: ctx.idFactory('dec'),
    title: `Board line fails: “${row.label}” — ${figure}`.slice(0, 180),
    question: `${row.assertion} The frozen board snapshot for revision ${memo.revision} says this does not hold: ${row.reason} Which correction do we fund before the next pack, and what would prove it by the re-check date? No person is the subject of this decision.`,
    date: dayKey(ctx.now),
    reversibility: 'reversible',
    driver: 'Board Room',
    approver: 'Board Room',
    contributors: owner?.label && owner.nodeId ? owner.label : '',
    informed: '',
    options: [
      {
        id: ctx.idFactory('opt'),
        label: `Fix the record first: raise the ${row.module.toLowerCase()} sample until the figure can be quoted with an interval`,
        pros: 'The cheapest correction when the claim is refused or inconclusive rather than false, and it makes the next pack honest either way.',
        cons: 'Costs a cycle of real data collection and the board line stays unverified until it lands.',
      },
      {
        id: ctx.idFactory('opt'),
        label: owner?.nodeId ? `Fund the correction inside ${owner.label}, with the span accountable for the result` : 'Fund the correction at the altitude the reading points to',
        pros: 'Puts the work where the failing number lives and makes the ownership visible on that leader’s own mission control.',
        cons: 'Adds load to the span already showing the weakest reading — the classic remediation trap.',
      },
      {
        id: ctx.idFactory('opt'),
        label: 'Change the claim in the memo, with the post-hoc threshold mark kept on the record',
        pros: 'Honest when the sentence was wrong rather than the organisation.',
        cons: 'A second threshold change makes the whole memo read as negotiated; the mark is permanent and the board will see it.',
      },
    ],
    chosen: '',
    rationale: `Opened by ${BOARD_RULES.OBLIGATION}. The memo was ${memo.status} on ${String(memo.committedAt || '').slice(0, 10)}; the frozen snapshot recorded this claim as ${row.verdict.toUpperCase()} and the live record still does. The rule rates no person, edits no claim and changes no threshold.`,
    reviewOn: dayKey(addDays(ctx.now, Math.min(60, conv.recheckDays))),
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    decidedOn: null,
    createdAt: ctx.now.toISOString(),
  };
}

function obligationTask(ctx, memo, row, owner, conv) {
  const outcome = [
    `Bring “${row.label}” above the memo's declared ${row.threshold}% ${row.comparator === 'gte' ? 'floor' : 'ceiling'}, or return the evidence that the ceiling itself is wrong.`,
    `The frozen board snapshot (revision ${memo.revision}) recorded ${row.value === null ? 'a withheld rate' : `${row.value}%`}; the live reading is unchanged.`,
    `Report back by ${dayKey(addDays(ctx.now, Math.min(60, conv.recheckDays)))} with a figure that carries an interval. A refusal is an acceptable answer; a guess is not.`,
  ].join(' ');
  return {
    id: ctx.idFactory('delegation'),
    personId: owner.nodeId,
    title: `Board obligation: ${row.label} (memo r${memo.revision})`.slice(0, 200),
    expectedOutcome: outcome.slice(0, 2000),
    authority: 'act-inform',
    support: `Raised by ${BOARD_RULES.OBLIGATION} from a ${memo.status} board memo dated ${String(memo.committedAt || '').slice(0, 10)}. Source module: ${row.module}. This obligation carries no rating of any person.`.slice(0, 1800),
    delegatedOn: dayKey(ctx.now),
    dueOn: dayKey(addDays(ctx.now, Math.min(60, conv.recheckDays))),
    status: 'active',
    checkins: [],
    completedOn: null,
    completionNote: '',
    returnedOn: null,
    returnReason: '',
    createdAt: ctx.now.toISOString(),
    updatedAt: ctx.now.toISOString(),
  };
}

/** RULE-BRD-01: one decision (and, where attributable, one obligation) per failing claim. */
function obligationRule(draft, ctx, evaluation, conv) {
  const effects = [];
  const memo = evaluation.memo;
  for (const row of evaluation.rows) {
    if (row.verdict !== 'failing') continue;
    const tag = `${BOARD_RULES.OBLIGATION}:${memo.id}:${memo.revision}:${row.key}`;
    if (seen(draft, tag)) continue;
    addMarker(draft, tag);
    const owner = worstOwner(row);
    const decision = obligationDecision(ctx, memo, row, owner, conv);
    if (!Array.isArray(draft.decisions)) draft.decisions = [];
    draft.decisions.unshift(decision);
    effects.push(effect(BOARD_RULES.OBLIGATION, 'created', 'decision', decision.id,
      `Board line failing on “${row.label}” opened one governed decision.`));
    link(draft, ctx, 'decision', decision.id, 'boardmemo', memo.id, 'escalates-from',
      BOARD_RULES.OBLIGATION,
      'The decision exists because this board memo recorded the claim as failing.');
    if (owner?.nodeId) {
      const person = (draft.people || []).find((p) => p && p.id === owner.nodeId && p.status !== 'archived');
      if (person) {
        const task = obligationTask(ctx, memo, row, owner, conv);
        if (!Array.isArray(draft.delegations)) draft.delegations = [];
        draft.delegations.unshift(task);
        effects.push(effect(BOARD_RULES.OBLIGATION, 'created', 'delegation', task.id,
          `Delegated the correction of “${row.label}” to the span the failing reading points at.`));
      }
    } else if (owner?.altitudeKey) {
      effects.push(effect(BOARD_RULES.OBLIGATION, 'noted', 'boardmemo', memo.id,
        `“${row.label}” fails at the ${owner.label} altitude — a rank, not a person, so no obligation was delegated. The decision carries the ownership question.`));
    }
  }
  return effects;
}

/** RULE-BRD-02: typed provenance edges from the memo to every span it reports on. */
function rollupRule(draft, ctx, evaluation) {
  const effects = [];
  const memo = evaluation.memo;
  const tag = `${BOARD_RULES.ROLLUP}:${memo.id}:${memo.revision}`;
  if (seen(draft, tag)) return effects;
  addMarker(draft, tag);
  const nodes = new Set();
  for (const row of evaluation.rows) {
    for (const contribution of row.contributions || []) {
      if (contribution.nodeId) nodes.add(contribution.nodeId);
    }
    for (const part of row.partition?.rows || []) {
      if (row.partition?.dimension === 'span' && part.key) nodes.add(part.key);
    }
  }
  let linked = 0;
  for (const nodeId of nodes) {
    if (link(draft, ctx, 'boardmemo', memo.id, 'person', nodeId, 'summarizes-span',
      BOARD_RULES.ROLLUP,
      'This board memo reports on a figure produced from this span; the edge carries provenance, not a performance judgement.')) {
      linked += 1;
    }
  }
  effects.push(effect(BOARD_RULES.ROLLUP, linked ? 'linked' : 'noted', 'boardmemo', memo.id,
    linked
      ? `Linked the memo to ${linked} span(s) whose records produced its figures.`
      : 'The memo reports only workspace-level claims, so no span edge was written.'));
  return effects;
}

/** RULE-BRD-03: one advisory marker on the first frozen memo. */
function advisoryRule(draft, ctx) {
  const frozen = (draft.boardMemos || []).filter((m) => m && m.status === 'frozen');
  if (!frozen.length) return [];
  const tag = `${BOARD_RULES.ADVISORY}:first-freeze`;
  if (seen(draft, tag)) return [];
  addMarker(draft, tag);
  return [effect(BOARD_RULES.ADVISORY, 'audited', 'workspace', '',
    'The first board memo was frozen. A disclosed pack now exists; its figures are conventions on this record, not a certification of the organisation.')];
}

export function boardRule(draft, ctx = {}) {
  if (!draft || !ctx.event) return [];
  const settings = ctx.settings || draft.settings || {};
  const conv = boardConventions(settings);
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const scoped = { ...ctx, now };
  const type = String(ctx.event.type || '');
  const explicit = type === BOARD_EVENTS.SCAN || type === BOARD_EVENTS.TRIGGER;
  const automatic = !explicit && conv.autoPropagate && isOperationalCommit(ctx.event);
  if (!explicit && !automatic) return [];

  const memos = (Array.isArray(draft.boardMemos) ? draft.boardMemos : []).filter(quoted);
  if (!memos.length) return [];
  // Cheap pre-check: a memo whose obligation marker is already present cannot
  // produce new work on this transaction, so the expensive read is skipped.
  const pending = memos.filter((memo) => !seen(draft, `${BOARD_RULES.OBLIGATION}:${memo.id}:${memo.revision}`)
    || !seen(draft, `${BOARD_RULES.ROLLUP}:${memo.id}:${memo.revision}`));
  const effects = [...advisoryRule(draft, scoped)];
  for (const memo of pending.slice(0, 6)) {
    const evaluation = boardEvaluateMemo(draft, memo, { now, settings: draft.settings || settings });
    effects.push(...obligationRule(draft, scoped, evaluation, conv));
    effects.push(...rollupRule(draft, scoped, evaluation));
  }
  if (Array.isArray(ctx.out)) ctx.out.push(...effects);
  return effects;
}
