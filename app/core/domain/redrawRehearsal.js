/**
 * app/core/domain/redrawRehearsal.js — the Boundary-redraw rehearsal
 * (ADR-0112, Session 152). The Jurisdiction Compiler prices the *redraw*
 * route for a cross-branch objective (ADR-0109), and its decisions never
 * move a reporting line. This module answers the question a director,
 * executive or chief actually has BEFORE accepting such a decision:
 *
 *   "If I re-parent THIS branch head under THAT span, what would the
 *    workspace look like? Which cross-branch clusters would COLLAPSE
 *    (the gap closes), which would be CREATED (the redraw opens a new one),
 *    which would merely MOVE (different LCA rung, different coalition,
 *    different predicted route) — and above all, which persisted
 *    `rolls-up-to` edges and which unsettled governed decisions would go
 *    STALE?"
 *
 * THE GUARANTEE THAT DEFINES THE MODULE: it is a DRY RUN. It takes the live
 * in-memory state, derives a hypothetical roster by applying the requested
 * moves to a CLONE, re-runs the real harvest → price pipeline on that clone,
 * and diffs the two books. It never mutates `state`, never writes a record,
 * never emits an event and never calls the store. A director can rehearse a
 * reorganisation that must never half-happen.
 *
 * WHAT IT DOES NOT DO: it does not move a line, does not accept a governed
 * decision, does not grade a forecast, does not rate a person and does not
 * predict productivity. Moves are validated against the working tree
 * (unknown span, self-move, descendant cycle, no-op, more than three moves)
 * and every refusal is printed verbatim — a refused rehearsal is a named
 * reason, never a zero.
 *
 * Frameworks, implemented rather than name-dropped:
 *  - Coase (1937) / Williamson (1975) governance choice: before/after sums of
 *    declared coordination units across every priced cluster, plus the
 *    declared one-off `jurRedrawUnits` per move. Break-even is arithmetic on
 *    DECLARED units, printed as such — never as money, never as measured value.
 *  - Riker (1962) size principle: the rehearsal reports how each cluster's
 *    minimal covering antichain changes, not whether people "fit".
 *  - Ashby (1956) requisite variety: a route remains viable only while one
 *    seat reconciles as many branches as the cluster holds; rung deltas print
 *    exactly that pressure.
 *  - Jensen & Meckling (1976) principal–agent framing: a stale governed
 *    decision names an authority question at a rung the redraw has moved —
 *    exactly the drift an agent then exploits. Stale ≠ dishonest agent.
 *  - Klein (1998) premortem method: the whole point is imagining the failure
 *    BEFORE the structure exists. Nothing here grades the leader; the unit of
 *    analysis is the OBJECTIVE CLUSTER and the BRANCH, never a person.
 *
 * PURITY: no DOM, no storage, no network, no clock globals. `now` is injected.
 */

import { dayKey, weekKey } from '../time.js';
import {
  buildChain, managerNodeId, LEADER_ID,
} from './chain.js';
import {
  harvestObjectives, priceCluster, jurConventions,
} from './jurisdiction.js';
import { JUR_REFUSALS } from './jurisdictionRegistry.js';

export const REDRAW_ENGINE_VERSION = 'redraw-rehearsal-2026.11-v1';

/** A cap is a refusal to grow without bound, not a silent drop. */
export const REDRAW_LIMITS = Object.freeze({
  maxMoves: 3,          // a rehearsal, not a re-org programme
  ancestorsCap: 16,     // mirrors JUR_LIMITS.ancestorsCap
  exposureCap: 12,      // max named rows printed per exposure table
  labelChars: 120,
});

export const REDRAW_REFUSALS = Object.freeze({
  'no-moves': 'No reporting-line move was selected. Choose at least one person and a destination span to rehearse.',
  'too-many-moves': `A rehearsal is bounded to ${REDRAW_LIMITS.maxMoves} moves. A larger reorganisation is a programme of dependent changes, not one dry run — split it and rehearse each wave.`,
  'duplicate-move': 'The same person cannot be moved twice in one rehearsal. One line per person per pass.',
  'unknown-person': 'The selected person is not on the roster (or is archived). A redraw can only move a live line.',
  'unknown-manager': 'The destination is not the workspace leader or a live roster person. A line cannot point at nobody.',
  'self-move': 'A person cannot be moved under themselves.',
  'cycle-move': 'This move would put a person under their own descendant, closing a reporting loop. Refused — the tree must stay a tree.',
  'noop-move': 'That person already reports to the chosen destination in the working tree. The rehearsal would change nothing.',
  'leader-move': 'The workspace leader holds no roster record and cannot be moved.',
});

/** Why an unsettled governed decision would go stale, printed verbatim. */
export const REDRAW_DECISION_STALENESS = Object.freeze({
  'gap-closed': 'The objective would no longer span branches — the question this decision asks would no longer exist. Re-frame or withdraw it before accepting any boundary change.',
  'lca-moved': 'The lowest common ancestor of the objective’s spans moves rung. The decision was framed to a named ancestor; after the redraw it names the wrong seat. Re-frame it at the new rung.',
});

const round1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);
const unique = (xs) => [...new Set(xs.filter(Boolean))];
const clip = (v, n = REDRAW_LIMITS.labelChars) => String(v ?? '').trim().slice(0, n);
const objectiveLabel = (key) => {
  const raw = String(key || '');
  return raw.startsWith('goal:') ? `Objective ${raw.slice(5, 17)}` : `Objective ${raw.slice(0, 12)}`;
};

const peopleOf = (state) => (Array.isArray(state?.people) ? state.people : [])
  .filter((p) => p && p.id && p.status !== 'archived');

const nameOf = (map, id) => (id === LEADER_ID ? null : (map.get(String(id))?.name || null));

const liveManagerOf = (working, personId) => {
  const node = working.get(String(personId));
  const raw = node?.managerId;
  if (!raw || raw === personId) return LEADER_ID;
  return working.has(String(raw)) ? String(raw) : LEADER_ID;
};

/**
 * Validate the requested moves against the RAW roster, then apply the valid
 * ones IN SEQUENCE to a cloned working roster. Each move is checked against
 * the working tree it inherits, so sequential moves compose honestly.
 * Returns { ok, applied, refusals, working } where `working` is the full
 * post-move roster clone (and `state.people` is never touched).
 */
export function planRedrawMoves(state, moves) {
  const working = new Map(peopleOf(state).map((p) => [String(p.id), { ...p }]));
  const requested = Array.isArray(moves) ? moves.filter((m) => m && (m.personId || m.newManagerId !== undefined)) : [];
  const refusals = [];
  const applied = [];
  const refuse = (personId, to, reasonKey) => refusals.push({
    personId: clip(personId, 90), to: clip(to === LEADER_ID ? 'leader' : to, 90),
    personName: nameOf(working, personId), reasonKey, reasonNote: REDRAW_REFUSALS[reasonKey],
  });

  if (!requested.length) {
    return { ok: false, applied: [], refusals: [{ personId: '', to: '', personName: null, reasonKey: 'no-moves', reasonNote: REDRAW_REFUSALS['no-moves'] }], working: [...working.values()] };
  }
  if (requested.length > REDRAW_LIMITS.maxMoves) {
    return { ok: false, applied: [], refusals: [{ personId: '', to: '', personName: null, reasonKey: 'too-many-moves', reasonNote: REDRAW_REFUSALS['too-many-moves'] }], working: [...working.values()] };
  }

  const seen = new Set();
  for (const raw of requested) {
    const personId = String(raw?.personId || '').trim();
    const toId = raw?.newManagerId === LEADER_ID || raw?.newManagerId === 'leader'
      ? LEADER_ID
      : String(raw?.newManagerId || '').trim();
    if (personId === LEADER_ID) { refuse(personId, toId, 'leader-move'); continue; }
    if (!working.has(personId)) { refuse(personId, toId, 'unknown-person'); continue; }
    if (seen.has(personId)) { refuse(personId, toId, 'duplicate-move'); continue; }
    seen.add(personId);
    if (toId !== LEADER_ID && !working.has(toId)) { refuse(personId, toId, 'unknown-manager'); continue; }
    if (toId === personId) { refuse(personId, toId, 'self-move'); continue; }

    const fromId = liveManagerOf(working, personId);
    if (fromId === toId) { refuse(personId, toId, 'noop-move'); continue; }

    /* Cycle check in the WORKING tree: walk up from the destination; reaching
       the moved person means the move would close a loop. Bounded and
       loop-safe against pre-existing data defects. */
    let cursor = toId;
    const guard = new Set();
    let cycle = false;
    while (cursor && cursor !== LEADER_ID && guard.size < REDRAW_LIMITS.ancestorsCap * 4) {
      if (cursor === personId) { cycle = true; break; }
      if (guard.has(cursor)) break; // pre-existing loop: buildChain reports it; do not compound it here
      guard.add(cursor);
      cursor = liveManagerOf(working, cursor);
    }
    if (cycle) { refuse(personId, toId, 'cycle-move'); continue; }

    const personName = working.get(personId)?.name || null;
    working.get(personId).managerId = toId === LEADER_ID ? null : toId;
    applied.push({
      personId,
      personName: clip(personName),
      fromManagerId: fromId,
      fromManagerName: fromId === LEADER_ID ? null : nameOf(working, fromId),
      toManagerId: toId,
      toManagerName: toId === LEADER_ID ? null : nameOf(working, toId),
    });
  }

  return { ok: applied.length > 0, applied, refusals, working: [...working.values()] };
}

/* ------------------------------------------------------------------ */
/* the comparison                                                       */
/* ------------------------------------------------------------------ */

function ancestorsOf(chain, nodeId) {
  const out = [];
  let cursor = nodeId;
  let guard = 0;
  while (cursor && guard < REDRAW_LIMITS.ancestorsCap) {
    const parent = managerNodeId(chain, cursor);
    if (!parent || parent === cursor) break;
    if (chain.nodes.has(parent)) out.push(parent);
    cursor = parent;
    guard += 1;
  }
  return out;
}

function spanName(chain, id) {
  if (id === LEADER_ID) return chain.leader?.name || 'Workspace leader';
  return chain.nodes.get(id)?.name || 'Unknown span';
}

/** Harvest AND price every objective (including single-branch) so a diff can see both sides. */
function priceAllClusters(sourceState, chain, conventions) {
  const harvest = harvestObjectives(sourceState, { chain, conventions });
  return harvest.objectives
    .map((cluster) => priceCluster(cluster, { chain, conventions }))
    .sort((a, b) => String(a.objectiveKey).localeCompare(String(b.objectiveKey)));
}

const predictedCost = (cluster) => (cluster?.verdict === 'priced'
  ? (cluster.costs || []).find((c) => c.key === cluster.predictedOption)?.cost ?? null
  : null);

const sum = (xs) => xs.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);

function summarize(all) {
  const gaps = all.filter((c) => c.gap);
  return {
    objectives: all.length,
    crossBranch: gaps.length,
    priced: gaps.filter((c) => c.verdict === 'priced').length,
    refused: gaps.filter((c) => c.verdict !== 'priced').length,
    handoffPairs: sum(gaps.map((c) => c.handoffPairs)),
    escalationRungs: sum(gaps.map((c) => c.escalationRungs)),
    recommendedUnits: round1(sum(gaps.map((c) => predictedCost(c)).filter((v) => v !== null))),
  };
}

const emptySide = () => ({ objectives: 0, crossBranch: 0, priced: 0, refused: 0, handoffPairs: 0, escalationRungs: 0, recommendedUnits: 0 });

const refusedReport = (base, reasonKey) => ({
  ...base,
  ok: false,
  reason: reasonKey,
  reasonNote: REDRAW_REFUSALS[reasonKey],
  before: emptySide(),
  after: emptySide(),
  deltas: null,
  collapsed: [],
  created: [],
  changed: [],
  unchangedN: 0,
  rollups: { moved: [], withdrawnEdges: 0, addedEdges: 0, readingMoves: [], readingWithdrawn: 0, readingAdded: 0 },
  decisions: { stale: [], settledN: 0, stillValidN: 0, orphanN: 0 },
  oneOffUnits: 0,
  perPeriodSaving: null,
  breakEvenPeriods: null,
  breakEvenNote: '',
  totals: { gapRows: 0, exposureShown: 0 },
});

/**
 * Rehearse a proposed boundary redraw. PURE: returns a report; writes nothing.
 * `moves`: [{ personId, newManagerId }] — newManagerId may be 'leader' (or the
 * LEADER_ID sentinel) to attach the line to the workspace leader.
 */
export function rehearseBoundaryRedraw(state, { moves = [], now = new Date(), conventions = jurConventions(state?.settings || {}) } = {}) {
  const at = now instanceof Date ? now : new Date(now);
  const week = weekKey(at);
  const conv = conventions && typeof conventions === 'object' ? conventions : jurConventions(state?.settings || {});
  const plan = planRedrawMoves(state, moves);
  const base = {
    ok: plan.ok,
    engineVersion: REDRAW_ENGINE_VERSION,
    at: at.toISOString(),
    week,
    conventions: conv,
    moves: plan.applied,
    refusedMoves: plan.refusals,
    maxMoves: REDRAW_LIMITS.maxMoves,
    disclaimer: 'DRY RUN — nothing was written, no line was moved, no decision was accepted and no event was emitted. The only side effect of an accepted redraw is the governed decision a human still has to take.',
    refusals: REDRAW_REFUSALS,
  };
  if (!plan.ok) return refusedReport(base, plan.refusals[0]?.reasonKey || 'no-moves');

  /* ----------------------------------------------------------- BEFORE */
  const beforeChain = buildChain(state, { now: at, settings: state?.settings });
  const beforeAll = priceAllClusters(state, beforeChain, conv);
  const beforeBy = new Map(beforeAll.map((c) => [c.objectiveKey, c]));

  /* ------------------------------------------------------------ AFTER */
  const afterState = { ...state, people: plan.working };
  const afterChain = buildChain(afterState, { now: at, settings: state?.settings });
  const afterAll = priceAllClusters(afterState, afterChain, conv);
  const afterBy = new Map(afterAll.map((c) => [c.objectiveKey, c]));

  /* ------------------------------------------------- cluster diffing */
  const collapsed = [];
  const created = [];
  const changed = [];
  let unchangedN = 0;
  for (const key of unique([...beforeBy.keys(), ...afterBy.keys()])) {
    const b = beforeBy.get(key) || null;
    const a = afterBy.get(key) || null;
    const bGap = Boolean(b?.gap);
    const aGap = Boolean(a?.gap);
    const row = {
      objectiveKey: key,
      objective: objectiveLabel(key),
      members: a?.evidenceN ?? b?.evidenceN ?? 0,
      branchesBefore: b?.coalitionSize ?? 0,
      branchesAfter: a?.coalitionSize ?? 0,
      rungsBefore: b?.escalationRungs ?? 0,
      rungsAfter: a?.escalationRungs ?? 0,
      lcaBefore: b?.lcaNodeId ? spanName(beforeChain, b.lcaNodeId) : null,
      lcaBeforeId: b?.lcaNodeId || null,
      lcaBeforeRank: b?.lcaRank ?? null,
      lcaAfter: a?.lcaNodeId ? spanName(afterChain, a.lcaNodeId) : null,
      lcaAfterId: a?.lcaNodeId || null,
      lcaAfterRank: a?.lcaRank ?? null,
      costCoalitionBefore: b?.costCoalition ?? null,
      costCoalitionAfter: a?.costCoalition ?? null,
      costEscalateBefore: b?.costEscalate ?? null,
      costEscalateAfter: a?.costEscalate ?? null,
      predictedBefore: b?.predictedOption || null,
      predictedAfter: a?.predictedOption || null,
      unitsBefore: round1(predictedCost(b)),
      unitsAfter: round1(predictedCost(a)),
      verdictBefore: b?.verdict || null,
      verdictAfter: a?.verdict || null,
      refusalAfter: a?.refusalKey || '',
    };
    if (bGap && !aGap) { collapsed.push(row); continue; }
    if (!bGap && aGap) { created.push(row); continue; }
    if (!bGap && !aGap) { unchangedN += 1; continue; }
    const moved = (b.lcaNodeId !== a.lcaNodeId)
      || b.coalitionSize !== a.coalitionSize
      || b.escalationRungs !== a.escalationRungs
      || b.verdict !== a.verdict
      || b.predictedOption !== a.predictedOption
      || b.costCoalition !== a.costCoalition
      || b.costEscalate !== a.costEscalate
      || b.costRedraw !== a.costRedraw;
    if (moved) changed.push({ ...row, deltaUnits: round1((row.unitsAfter ?? 0) - (row.unitsBefore ?? 0)) });
    else unchangedN += 1;
  }
  collapsed.sort((x, y) => y.branchesBefore - x.branchesBefore);
  created.sort((x, y) => y.branchesAfter - x.branchesAfter);
  changed.sort((x, y) => Math.abs(y.deltaUnits || 0) - Math.abs(x.deltaUnits || 0));

  const before = summarize(beforeAll);
  const after = summarize(afterAll);
  const deltas = {
    crossBranch: after.crossBranch - before.crossBranch,
    priced: after.priced - before.priced,
    refused: after.refused - before.refused,
    handoffPairs: after.handoffPairs - before.handoffPairs,
    escalationRungs: after.escalationRungs - before.escalationRungs,
    recommendedUnits: round1((after.recommendedUnits ?? 0) - (before.recommendedUnits ?? 0)),
  };

  /* ------------- persisted rolls-up-to edges that would move --------- */
  const persistedLinks = (Array.isArray(state?.links) ? state.links : [])
    .filter((l) => l && l.relation === 'rolls-up-to' && l.sourceType === 'jurfinding' && l.sourceId && l.targetType === 'person');
  const targetsByFinding = new Map();
  for (const link of persistedLinks) {
    const key = String(link.sourceId);
    if (!targetsByFinding.has(key)) targetsByFinding.set(key, []);
    targetsByFinding.get(key).push(String(link.targetId));
  }
  const activeFindings = (Array.isArray(state?.jurFindings) ? state.jurFindings : [])
    .filter((f) => f && f.status === 'frozen');
  const rollupsMoved = [];
  let withdrawnEdges = 0;
  let addedEdges = 0;
  for (const finding of activeFindings) {
    const persisted = unique(targetsByFinding.get(String(finding.id)) || []);
    if (!persisted.length) continue;
    const afterCluster = afterBy.get(finding.objectiveKey);
    let hypoTargets = [];
    let reason = 'gap-closed';
    if (afterCluster?.gap) {
      reason = 'gap-moved';
      const acc = new Set();
      for (const span of afterCluster.spanNodeIds || []) for (const a of ancestorsOf(afterChain, span)) acc.add(a);
      for (const a of ancestorsOf(afterChain, afterCluster.lcaNodeId)) acc.add(a);
      hypoTargets = [...acc];
    }
    const hypo = new Set(hypoTargets);
    const withdrawn = persisted.filter((id) => !hypo.has(id));
    const added = hypoTargets.filter((id) => !persisted.includes(id));
    if (!withdrawn.length && !added.length) continue;
    withdrawnEdges += withdrawn.length;
    addedEdges += added.length;
    rollupsMoved.push({
      kind: 'finding',
      findingId: finding.id,
      objectiveKey: finding.objectiveKey,
      objective: objectiveLabel(finding.objectiveKey),
      reason,
      withdrawn: withdrawn.slice(0, REDRAW_LIMITS.exposureCap).map((id) => spanName(beforeChain, id)),
      added: added.slice(0, REDRAW_LIMITS.exposureCap).map((id) => spanName(afterChain, id)),
      withdrawnIds: withdrawn.slice(0, REDRAW_LIMITS.exposureCap),
      addedIds: added.slice(0, REDRAW_LIMITS.exposureCap),
      withdrawnN: withdrawn.length,
      addedN: added.length,
      governedDecisionId: finding.governedDecisionId || null,
    });
  }
  /* jurreading rolls-up-to edges: one reading per span re-derives who reads it. */
  const readingLinks = (Array.isArray(state?.links) ? state.links : [])
    .filter((l) => l && l.relation === 'rolls-up-to' && l.sourceType === 'jurreading' && l.sourceId && l.targetType === 'person');
  const targetsByReading = new Map();
  for (const link of readingLinks) {
    const key = String(link.sourceId);
    if (!targetsByReading.has(key)) targetsByReading.set(key, []);
    targetsByReading.get(key).push(String(link.targetId));
  }
  const readings = (Array.isArray(state?.jurReadings) ? state.jurReadings : [])
    .filter((r) => r && r.status === 'frozen' && r.nodeId);
  const readingMoves = [];
  let readingWithdrawn = 0;
  let readingAdded = 0;
  for (const reading of readings) {
    const persisted = unique(targetsByReading.get(String(reading.id)) || []);
    if (!persisted.length) continue;
    const beforeSet = new Set(ancestorsOf(beforeChain, reading.nodeId));
    const afterSet = new Set(ancestorsOf(afterChain, reading.nodeId));
    const withdrawn = persisted.filter((id) => !afterSet.has(id));
    const added = [...afterSet].filter((id) => !persisted.includes(id));
    if (!withdrawn.length && !added.length) continue;
    readingWithdrawn += withdrawn.length;
    readingAdded += added.length;
    readingMoves.push({
      kind: 'reading',
      readingId: reading.id,
      nodeId: reading.nodeId,
      spanName: spanName(beforeChain, reading.nodeId),
      withdrawn: withdrawn.slice(0, REDRAW_LIMITS.exposureCap).map((id) => spanName(beforeChain, id)),
      added: added.slice(0, REDRAW_LIMITS.exposureCap).map((id) => spanName(afterChain, id)),
      withdrawnIds: withdrawn.slice(0, REDRAW_LIMITS.exposureCap),
      addedIds: added.slice(0, REDRAW_LIMITS.exposureCap),
      withdrawnN: withdrawn.length,
      addedN: added.length,
    });
  }

  /* --------- governed decisions that would go stale (premortem) ------- */
  const findings = Array.isArray(state?.jurFindings) ? state.jurFindings : [];
  const findingByDecision = new Map();
  for (const f of findings) if (f?.governedDecisionId) findingByDecision.set(String(f.governedDecisionId), f);
  const decisions = Array.isArray(state?.decisions) ? state.decisions : [];
  const stale = [];
  let settledN = 0;
  let stillValidN = 0;
  let orphanN = 0;
  for (const decision of decisions) {
    if (!decision?.id) continue;
    const finding = findingByDecision.get(String(decision.id));
    if (!finding) continue;
    const settled = Boolean(decision.chosen) && Boolean(decision.decidedOn);
    if (settled) { settledN += 1; continue; }
    const afterCluster = afterBy.get(finding.objectiveKey);
    let reasonKey = null;
    if (!afterCluster?.gap) reasonKey = 'gap-closed';
    else if (afterCluster.lcaNodeId !== finding.lcaNodeId) reasonKey = 'lca-moved';
    if (!reasonKey) { stillValidN += 1; continue; }
    stale.push({
      decisionId: decision.id,
      title: clip(decision.title || 'Governed boundary decision', 140),
      objectiveKey: finding.objectiveKey,
      objective: objectiveLabel(finding.objectiveKey),
      reasonKey,
      reasonNote: REDRAW_DECISION_STALENESS[reasonKey],
      fromLca: finding.lcaNodeId ? spanName(beforeChain, finding.lcaNodeId) : null,
      fromLcaId: finding.lcaNodeId || null,
      fromRank: finding.lcaRank ?? null,
      toLca: afterCluster?.lcaNodeId ? spanName(afterChain, afterCluster.lcaNodeId) : null,
      toLcaId: afterCluster?.lcaNodeId || null,
      toRank: afterCluster?.lcaRank ?? null,
    });
  }

  /* ------------- break-even on declared coordination units ------------ */
  const oneOffUnits = plan.applied.length * (Number(conv.jurRedrawUnits) || 0);
  const perPeriodSaving = round1((before.recommendedUnits ?? 0) - (after.recommendedUnits ?? 0));
  const positive = typeof perPeriodSaving === 'number' && perPeriodSaving > 0;
  const breakEvenPeriods = positive ? Math.ceil(oneOffUnits / perPeriodSaving) : null;
  const breakEvenNote = positive
    ? `Every re-pricing period the redraw removes ${perPeriodSaving} declared unit(s); the one-off cost of ${oneOffUnits} unit(s) breaks even in ${breakEvenPeriods} period(s). Arithmetic on declared Coase units — not money, not measured value.`
    : 'The rehearsal does not lower modelled coordination load — on declared units the one-off redraw cost is never recovered. That is a finding, not a verdict on the people involved.';

  return {
    ...base,
    before,
    after,
    deltas,
    collapsed: collapsed.slice(0, REDRAW_LIMITS.exposureCap),
    created: created.slice(0, REDRAW_LIMITS.exposureCap),
    changed: changed.slice(0, REDRAW_LIMITS.exposureCap),
    collapsedN: collapsed.length,
    createdN: created.length,
    changedN: changed.length,
    unchangedN,
    rollups: { moved: rollupsMoved, withdrawnEdges, addedEdges, readingMoves, readingWithdrawn, readingAdded },
    decisions: { stale, settledN, stillValidN, orphanN },
    oneOffUnits,
    perPeriodSaving,
    breakEvenPeriods,
    breakEvenNote,
    totals: {
      gapRows: collapsed.length + created.length + changed.length,
      exposureShown: Math.min(collapsed.length, REDRAW_LIMITS.exposureCap)
        + Math.min(created.length, REDRAW_LIMITS.exposureCap)
        + Math.min(changed.length, REDRAW_LIMITS.exposureCap),
    },
  };
}

/** A plain-text pre-read for a board or an exec staff meeting. Declared units, named moves, every refusal. */
export function redrawBrief(report) {
  if (!report) return 'No rehearsal was run.';
  if (!report.ok) return `Boundary redraw rehearsal refused: ${report.reasonNote || report.reason}`;
  const lines = [];
  lines.push('BOUNDARY REDRAW REHEARSAL — DRY RUN (nothing was written)');
  lines.push(`Engine ${report.engineVersion} · ISO week ${report.week} · moves applied: ${report.moves.length}`);
  for (const m of report.moves) {
    lines.push(`  - ${m.personName || m.personId}: ${m.fromManagerName || 'Workspace leader'} → ${m.toManagerName || 'Workspace leader'}`);
  }
  if (report.refusedMoves.length) {
    lines.push('Refused moves (printed, never silently dropped):');
    for (const r of report.refusedMoves) lines.push(`  - ${r.personName || r.personId || 'move'}: ${r.reasonNote}`);
  }
  lines.push(`Cross-branch objectives: ${report.before.crossBranch} → ${report.after.crossBranch} (Δ ${report.deltas.crossBranch >= 0 ? '+' : ''}${report.deltas.crossBranch}) · priced ${report.before.priced} → ${report.after.priced} · refused ${report.before.refused} → ${report.after.refused}`);
  lines.push(`Declared coordination load (predicted routes): ${report.before.recommendedUnits ?? '—'} → ${report.after.recommendedUnits ?? '—'} per period (Δ ${report.deltas.recommendedUnits >= 0 ? '+' : ''}${report.deltas.recommendedUnits}) · one-off redraw cost ${report.oneOffUnits} units`);
  lines.push(report.breakEvenNote);
  const sec = (title, rows, fmt) => {
    if (!rows.length) return;
    lines.push('');
    lines.push(`${title} (${rows.length}):`);
    for (const r of rows) lines.push(`  - ${fmt(r)}`);
  };
  sec('COLLAPSES — the gap closes under the redraw', report.collapsed, (r) => `${r.objective}: ${r.branchesBefore} → ${r.branchesAfter} branch(es), predicted ${r.predictedBefore || 'n/a'} → ${r.predictedAfter || 'single-span'}`);
  sec('CREATED — the redraw opens a new cross-branch objective', report.created, (r) => `${r.objective}: ${r.branchesAfter} branch(es) meet under ${r.lcaAfter || 'an ancestor'} (rank ${r.lcaAfterRank ?? '—'})`);
  sec('MOVED — still cross-branch, but the geometry changes', report.changed, (r) => `${r.objective}: ancestor ${r.lcaBefore || '—'} (rank ${r.lcaBeforeRank ?? '—'}) → ${r.lcaAfter || '—'} (rank ${r.lcaAfterRank ?? '—'}), ${r.branchesBefore}→${r.branchesAfter} branch(es), route ${r.predictedBefore || 'n/a'} → ${r.predictedAfter || 'n/a'}`);
  sec('ROLLS-UP-TO EDGES THAT WOULD MOVE', report.rollups.moved, (r) => `${r.objective}: withdraw [${r.withdrawn.join(', ') || '—'}], add [${r.added.join(', ') || '—'}]`);
  sec('UNSETTLED GOVERNED DECISIONS THAT WOULD GO STALE', report.decisions.stale, (r) => `${r.title} — ${r.reasonNote}`);
  lines.push('');
  lines.push('Frameworks: Coase (1937)/Williamson (1975) governance choice · Riker (1962) size principle · Ashby (1956) requisite variety · Jensen & Meckling (1976) residual control rights · Klein (1998) premortem. Coordination units are declared conventions printed on the Method panel, never money. A redraw is never executed by this tool; it opens or re-frames a governed decision a human must accept.');
  return lines.join('\n');
}

/** Re-export so the view and tests share one vocabulary. */
export { JUR_REFUSALS };
