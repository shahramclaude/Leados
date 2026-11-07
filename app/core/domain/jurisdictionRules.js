/**
 * app/core/domain/jurisdictionRules.js — RULE-JUR-01..04 on the SHARED
 * post-commit spine (ADR-0109, Schema v111). Altitude is a dimension of the
 * SAME engine, not a second hierarchy service.
 *
 *  RULE-JUR-01 DETECT (cross-module AND cross-altitude in ONE transaction).
 *    A cross-branch objective — work records in different reporting branches
 *    that name the same goal — gets exactly ONE frozen governance finding per
 *    (objective, ISO week), id hashed from that pair so a rescan converges. The
 *    finding becomes a first-class graph node with:
 *      - one `spans-work` edge to EVERY member record (case / decision / funded
 *        work), so the finding is navigable from the work it read and back;
 *      - one `rolls-up-to` edge per distinct leadership ancestor of its spans.
 *    So the SAME atomic write that records a case also prices who can resolve
 *    the objective it belongs to AND makes that jurisdiction gap visible above
 *    every span that holds a piece of it. Zero manual re-entry, no second
 *    workflow engine.
 *
 *  RULE-JUR-02 GOVERN. On an explicit scan, one governed "who holds this?"
 *    decision per priced finding per ISO week, at the lowest common ancestor's
 *    rung, carrying the three priced routes. The decision NEVER moves a
 *    reporting line, never reassigns a case and never accepts itself. Silence
 *    is never consent. Marker-idempotent and bounded.
 *
 *  RULE-JUR-03 GRADE. A frozen finding is graded EXACTLY ONCE, out of sample,
 *    by Brier against a strictly-prior 0.5 base, when the governed decision a
 *    human actually made settles with a dated choice. A missing choice, a
 *    missing date or a postdated review is a STORED REFUSAL (`ungradable`),
 *    never a zero. Grading is derived state: it runs on every commit, is cheap,
 *    writes no event and opens no work.
 *
 *  RULE-JUR-04 ROLLUP. One identity-free span reading per (span, ISO week):
 *    counts only, small-cell suppressed below the declared floor, with one
 *    `reads-span-mandate` edge and one `rolls-up-to` edge per ancestor. Above
 *    rank 2 the reading carries NO objective key, NO member id and NO person.
 *
 *  RULE-JUR-05 DRIFT (ADR-0115). On the explicit `jur.drift` command only, a
 *    distribution-free conformal band grades the ISO-week series of cross-branch
 *    share and median coalition size over the readings RULE-JUR-04 froze. A
 *    published band crossing opens EXACTLY ONE governed decision per ISO week,
 *    with one `rolls-up-to` edge per executive ancestor seat in the same
 *    transaction. Refused below the declared week floor; never interpolates an
 *    unsampled week, never redraws a boundary, never accepts itself.
 *
 * All five are bounded, marker-idempotent and pausable by `jurAutoPropagate`;
 * an explicit `jur.scan` always runs every pass. The rule is ROOT-EVENT GATED:
 * engine-derived `decision.created` events (the ~88 other rules' audit output)
 * never wake detection, so a scan cannot price itself — the exact regression
 * the Epistemic Ledger's merge exposed (Session 143).
 */

import { addDays, dayKey, weekKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildChain, managerNodeId, LEADER_ID } from './chain.js';
import { altitudeRank } from './chainRegistry.js';
import { jurDriftEnterprise } from './jurisdictionDrift.js';
import { JUR_DRIFT_LIMITS, JUR_DRIFT_OPTIONS } from './jurisdictionDriftRegistry.js';
import {
  buildJurisdictionBook, jurConventions, jurGradeFinding, jurSpanRollUp,
  jurAttentionCount as jurAttentionRead, goalPointerStatus,
} from './jurisdiction.js';
import {
  JUR_ENGINE_VERSION, JUR_EVENTS, JUR_LIMITS, JUR_RULE_IDS, JUR_SETTLEMENT_EVENTS,
  JUR_TRIGGER_PREFIX, JUR_WORK_EVENTS, JUR_GOVERNANCE_OPTIONS, JUR_OPTION_KEYS,
  JUR_REFUSALS, findingKey, governedDecisionMarker, governanceDecisionMarker,
  governanceMarker, readingKey, driftMarker, driftDecisionMarker,
} from './jurisdictionRegistry.js';

const ancestorsOf = (chain, nodeId, cap = JUR_LIMITS.ancestorsCap) => {
  const out = [];
  let cursor = nodeId;
  let guard = 0;
  while (cursor && guard < cap) {
    const parent = managerNodeId(chain, cursor);
    if (!parent || parent === cursor) break;
    if (chain.nodes.has(parent)) out.push(parent);
    cursor = parent;
    guard += 1;
  }
  return out;
};

const markerHas = (draft, marker) => (Array.isArray(draft.jurMarkers) ? draft.jurMarkers.includes(marker) : false);
const addMarker = (draft, marker) => {
  draft.jurMarkers = Array.isArray(draft.jurMarkers) ? draft.jurMarkers : [];
  if (!draft.jurMarkers.includes(marker)) draft.jurMarkers.push(marker);
  if (draft.jurMarkers.length > JUR_LIMITS.markers) draft.jurMarkers.splice(0, draft.jurMarkers.length - JUR_LIMITS.markers);
};

function link(draft, ctx, sourceType, sourceId, targetType, targetId, relation, ruleId, summary) {
  if (!sourceId || !targetId) return false;
  return ensureEntityLink(draft, {
    sourceType, sourceId, targetType, targetId, relation, ruleId,
    summary: String(summary || '').slice(0, 240),
  }, ctx.idFactoryArgs).created;
}

function note(ctx, out, ruleId, action, entity, entityId, summary) {
  // The returned result IS the propagation receipt, and every fact this rule
  // writes is already a typed graph edge in the same atomic transaction. This
  // rule deliberately emits NO `automation.propagated` event: the shared spine
  // has a declared derived-event budget, and one extra derived event is re-delivered
  // to all 89 rules, which cascades into dozens of engine-authored decisions and
  // can roll the downstream epistemic rule back. Zero extra queue pressure, zero
  // lost provenance — the links and the result rows carry everything.
  out.push({ ruleId, action, entity, entityId, summary: String(summary).slice(0, 240) });
}

/** The governed decision ids this module authored, so no other module prices them. */
export function jurisdictionFindingIds(state) {
  const ids = new Set();
  for (const finding of (Array.isArray(state?.jurFindings) ? state.jurFindings : [])) {
    if (finding?.governedDecisionId) ids.add(finding.governedDecisionId);
  }
  return ids;
}

/* ------------------------------------------------------------------ */
/* 1. DETECT + FREEZE (cross-module propagation + vertical roll-up)     */
/* ------------------------------------------------------------------ */

function detectPass(draft, ctx, out, conventions, budget, { automatic, changedId, eventType }) {
  const chain = buildChain(draft, { now: ctx.now, settings: draft.settings });
  const book = buildJurisdictionBook(draft, { now: ctx.now, conventions, chain });
  draft.jurFindings = Array.isArray(draft.jurFindings) ? draft.jurFindings : [];
  if (Array.isArray(draft.goals)) {
    const goalMap = new Map(draft.goals.filter((g) => g?.id).map((g) => [String(g.id), g]));
    for (const finding of draft.jurFindings) {
      if (!finding || finding.status !== 'frozen') continue;
      if (!goalPointerStatus(finding.objectiveKey, goalMap, true).valid) {
        finding.status = 'superseded';
        finding.gradeNote = JUR_REFUSALS['dangling-objective'];
        note(ctx, out, JUR_RULE_IDS.DETECT, 'superseded', 'jurfinding', finding.id,
          'Superseded a frozen jurisdiction finding because its referenced goal was dropped or no longer exists');
      }
    }
  }
  const week = book.week;
  const changedGoalKey = eventType?.startsWith('goal.') && changedId ? `goal:${changedId}` : null;
  const filterByMember = automatic && changedId && !changedGoalKey && eventType !== 'link.created';
  for (const cluster of book.clusters) {
    if (budget.remaining <= 0) break;
    const id = findingKey(cluster.objectiveKey, week);
    if (draft.jurFindings.some((f) => f?.id === id)) continue;
    // On an AUTOMATIC root work write, freeze only the cluster(s) the changed
    // record or goal actually belongs to. This is the propagation seam:
    // registering or anchoring work in one module prices (or counts as refused)
    // the objective it joined, in the same atomic transaction.
    if (changedGoalKey && cluster.objectiveKey !== changedGoalKey) continue;
    if (filterByMember && !cluster.memberIds.includes(String(changedId))) continue;
    const earliest = cluster.members.map((m) => m.date).filter(Boolean).sort()[0] || null;
    draft.jurFindings.push({
      id,
      objectiveKey: cluster.objectiveKey,
      week,
      frozenAt: ctx.now.toISOString(),
      firstSeenOn: earliest || dayKey(ctx.now),
      reviewOn: addDays(dayKey(ctx.now), conventions.jurReviewDays),
      memberIds: cluster.memberIds.slice(0, JUR_LIMITS.membersPerCluster),
      memberCount: cluster.evidenceN,
      spanNodeIds: cluster.spanNodeIds.slice(0, JUR_LIMITS.branchesCap),
      branchSeatIds: cluster.branchSeatIds.slice(0, JUR_LIMITS.branchesCap),
      lcaNodeId: cluster.lcaNodeId || LEADER_ID,
      lcaRank: cluster.lcaRank || null,
      maxSpanRank: cluster.maxSpanRank || null,
      coalitionSize: cluster.coalitionSize,
      escalationRungs: cluster.escalationRungs,
      handoffPairs: cluster.handoffPairs,
      costCoalition: cluster.costCoalition,
      costEscalate: cluster.costEscalate,
      costRedraw: cluster.costRedraw,
      predictedOption: cluster.verdict === 'priced' ? cluster.predictedOption : null,
      predictedProbability: cluster.verdict === 'priced' ? cluster.predictedProbability : null,
      confidencePct: cluster.confidencePct,
      confidenceLoPct: cluster.confidenceLoPct,
      confidenceHiPct: cluster.confidenceHiPct,
      attributionPct: cluster.attributionPct,
      evidenceN: cluster.evidenceN,
      verdict: cluster.verdict,
      refusalKey: cluster.verdict === 'refused' ? cluster.refusalKey : '',
      refusalNote: cluster.verdict === 'refused' ? cluster.refusalNote : '',
      governedDecisionId: null,
      status: 'frozen',
      gradedOn: null, actualOption: null, brier: null, baseBrier: null, skill: null,
      gradeNote: '', engineVersion: JUR_ENGINE_VERSION,
    });
    // ONE spans-work edge per member record — cross-module typed provenance.
    for (const member of cluster.members.slice(0, JUR_LIMITS.membersPerCluster)) {
      link(draft, ctx, 'jurfinding', id, member.entityType, member.recordId,
        'spans-work', JUR_RULE_IDS.DETECT, 'Cross-branch objective spans this work record');
    }
    // ONE rolls-up-to edge per distinct leadership ancestor of every span —
    // vertical roll-up on the SAME generalized graph, same atomic transaction.
    const ancestors = new Set();
    for (const spanId of cluster.spanNodeIds) {
      for (const ancestor of ancestorsOf(chain, spanId)) ancestors.add(ancestor);
    }
    for (const ancestor of [...ancestors].slice(0, JUR_LIMITS.ancestorsCap)) {
      link(draft, ctx, 'jurfinding', id, 'person', ancestor,
        'rolls-up-to', JUR_RULE_IDS.DETECT, 'Cross-branch jurisdiction gap rolled up to this span');
    }
    budget.remaining -= 1;
    note(ctx, out, JUR_RULE_IDS.DETECT, 'frozen', 'jurfinding', id,
      `Froze a ${cluster.coalitionSize}-branch jurisdiction gap (${cluster.verdict === 'priced'
        ? `recommended ${cluster.predictedOption}` : cluster.refusalKey}) for one shared objective`);
  }
  if (draft.jurFindings.length > JUR_LIMITS.findings) {
    draft.jurFindings.sort((a, b) => a.frozenAt.localeCompare(b.frozenAt));
    draft.jurFindings = draft.jurFindings.slice(-JUR_LIMITS.findings);
  }
  return book;
}

/* ------------------------------------------------------------------ */
/* 2. GOVERN (one governed decision, never an automatic change)         */
/* ------------------------------------------------------------------ */

function governPass(draft, ctx, out, conventions, book) {
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  const week = book.week;
  let opened = 0;
  for (const finding of draft.jurFindings) {
    if (opened >= JUR_LIMITS.governedPerScan) break;
    if (!finding || finding.status !== 'frozen' || finding.verdict !== 'priced' || finding.governedDecisionId) continue;
    const ageDays = Math.max(0, Math.round((Date.parse(`${dayKey(ctx.now)}T00:00:00Z`)
      - Date.parse(`${finding.firstSeenOn || dayKey(ctx.now)}T00:00:00Z`)) / 86400000));
    if (ageDays < conventions.jurProposalAfterDays) continue;
    const marker = governanceMarker(finding.id, week);
    if (markerHas(draft, marker)) continue;
    const lcaName = book.chain.nodes.get(finding.lcaNodeId)?.name || 'the common ancestor';
    const decisionId = ctx.idFactory('dec');
    const costText = JUR_OPTION_KEYS.map((key) => {
      const cost = { coalition: finding.costCoalition, escalate: finding.costEscalate, redraw: finding.costRedraw }[key];
      return `${key} ${cost ?? '—'} coordination units`;
    }).join(' · ');
    const options = JUR_GOVERNANCE_OPTIONS.map((o) => ({
      id: ctx.idFactory('dopt'),
      label: `${o.key}: ${o.label}`,
      pros: o.question,
      cons: o.note,
    }));
    draft.decisions.push({
      id: decisionId,
      title: `Who holds this cross-branch objective? (${finding.coalitionSize} branches)`,
      question: `${governanceDecisionMarker(finding.id, week)} ${governedDecisionMarker(finding.id, week)} `
        + `One objective is worked across ${finding.coalitionSize} reporting branches under ${lcaName} `
        + `(rank ${finding.lcaRank ?? '—'}). Priced routes: ${costText}. The minimal covering coalition `
        + `(Riker 1962) needs ${finding.handoffPairs} handoff pair(s); escalating climbs `
        + `${finding.escalationRungs} rung(s); a boundary redraw is a declared one-off. `
        + `Predicted route: ${finding.predictedOption} at ${Math.round((finding.predictedProbability || 0) * 100)}% `
        + `(Luce 1959 choice rule), Wilson attribution lower bound ${finding.confidenceLoPct ?? '—'}%. `
        + `Choose one. This decision NEVER moves a reporting line on its own.`,
      date: dayKey(ctx.now),
      reversibility: 'reversible',
      driver: lcaName,
      approver: lcaName,
      contributors: '', informed: '',
      options,
      chosen: '', rationale: '', premiseIds: [],
      forecastProbability: finding.predictedProbability,
      decidedOn: null, reviewOn: addDays(dayKey(ctx.now), conventions.jurReviewDays),
      reviewedOn: null, outcome: 'pending', outcomeNotes: '', portfolioNotes: [],
      createdAt: ctx.now.toISOString(),
    });
    finding.governedDecisionId = decisionId;
    addMarker(draft, marker);
    link(draft, ctx, 'jurfinding', finding.id, 'decision', decisionId,
      'governs-mandate', JUR_RULE_IDS.GOVERN, 'Governed boundary decision a human must accept');
    for (const ancestor of ancestorsOf(book.chain, finding.lcaNodeId)) {
      link(draft, ctx, 'jurfinding', finding.id, 'person', ancestor,
        'rolls-up-to', JUR_RULE_IDS.GOVERN, 'Governed boundary decision rolled up');
    }
    opened += 1;
    note(ctx, out, JUR_RULE_IDS.GOVERN, 'governed', 'decision', decisionId,
      `Opened one governed who-holds-this decision for a ${finding.coalitionSize}-branch objective`);
  }
}

/* ------------------------------------------------------------------ */
/* 3. GRADE (derived, once-only, out of sample, stored refusals)        */
/* ------------------------------------------------------------------ */

function optionFromChoice(chosen) {
  const text = String(chosen || '').toLowerCase();
  for (const key of JUR_OPTION_KEYS) {
    if (text === key || text.startsWith(`${key}:`) || text.includes(`[${key}]`)) return key;
  }
  return null;
}

function gradePass(draft, ctx, out, conventions) {
  draft.jurFindings = Array.isArray(draft.jurFindings) ? draft.jurFindings : [];
  const decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  for (const finding of draft.jurFindings) {
    if (!finding || finding.status !== 'frozen' || !finding.governedDecisionId) continue;
    const decision = decisions.find((d) => d?.id === finding.governedDecisionId);
    if (!decision) continue;
    if (!decision.chosen || !decision.decidedOn) continue; // ungraded: no outcome yet
    const actualOption = optionFromChoice(decision.chosen);
    const grade = jurGradeFinding(finding, {
      actualOption, settledOn: decision.decidedOn, frozenAt: finding.frozenAt, now: ctx.now,
    });
    if (!grade.ok) {
      // A STORED REFUSAL, never a zero. A bad/unmatched choice, missing date or
      // postdated review is printed and the finding leaves the active grading
      // queue so a rescan cannot re-grade it into a miss.
      finding.status = 'ungradable';
      finding.gradeNote = grade.note || JUR_REFUSALS.ungraded;
      note(ctx, out, JUR_RULE_IDS.GRADE, 'refused', 'jurfinding', finding.id, finding.gradeNote);
      continue;
    }
    finding.status = 'graded';
    finding.gradedOn = grade.gradedOn;
    finding.actualOption = grade.actualOption;
    finding.brier = grade.brier;
    finding.baseBrier = grade.baseBrier;
    finding.skill = grade.skill;
    finding.gradeNote = `Predicted ${finding.predictedOption} at ${Math.round((finding.predictedProbability || 0) * 100)}%; `
      + `a human chose ${grade.actualOption}. Brier ${grade.brier} against the 0.5 base ${grade.baseBrier} (skill ${grade.skill}).`;
    note(ctx, out, JUR_RULE_IDS.GRADE, 'graded', 'jurfinding', finding.id, finding.gradeNote);
  }
}

/* ------------------------------------------------------------------ */
/* 4. ROLLUP (identity-free span readings, small-cell suppressed)       */
/* ------------------------------------------------------------------ */

function rollUpPass(draft, ctx, out, conventions, book) {
  draft.jurReadings = Array.isArray(draft.jurReadings) ? draft.jurReadings : [];
  const week = book.week;
  for (const node of book.chain.nodes.values()) {
    const rank = node.altitude ? ['frontline', 'manager', 'director', 'exec', 'chief'].indexOf(node.altitude) + 1 : 0;
    if (!rank) continue;
    const id = readingKey(node.id, week);
    if (draft.jurReadings.some((r) => r?.id === id)) continue;
    const roll = jurSpanRollUp(draft, { nodeId: node.id, now: ctx.now, conventions, chain: book.chain, book });
    if (!roll.ok) continue;
    draft.jurReadings.push({
      id, nodeId: node.id, nodeRank: rank, week,
      frozenAt: ctx.now.toISOString(),
      reviewOn: addDays(dayKey(ctx.now), conventions.jurReviewDays),
      clusters: roll.clusters,
      objectives: roll.objectives,
      crossBranch: roll.crossBranch,
      priced: roll.suppressed ? null : roll.priced,
      governed: roll.suppressed ? null : roll.governed,
      refusals: roll.suppressed ? null : roll.refusals,
      suppressed: roll.suppressed ? 1 : 0,
      medianCoalitionSize: roll.medianCoalitionSize,
      status: 'frozen', gradedOn: null, gradeNote: '',
      engineVersion: JUR_ENGINE_VERSION,
    });
    link(draft, ctx, 'jurreading', id, 'person', node.id,
      'reads-span-mandate', JUR_RULE_IDS.ROLLUP, 'Identity-free span jurisdiction reading');
    for (const ancestor of ancestorsOf(book.chain, node.id)) {
      link(draft, ctx, 'jurreading', id, 'person', ancestor,
        'rolls-up-to', JUR_RULE_IDS.ROLLUP, 'Span jurisdiction reading rolled up');
    }
    note(ctx, out, JUR_RULE_IDS.ROLLUP, 'frozen', 'jurreading', id,
      `Froze an identity-free jurisdiction reading for one span (${roll.suppressed ? 'suppressed' : `${roll.clusters} clusters`})`);
  }
  if (draft.jurReadings.length > JUR_LIMITS.readings) {
    draft.jurReadings.sort((a, b) => b.frozenAt.localeCompare(a.frozenAt));
    draft.jurReadings = draft.jurReadings.slice(0, JUR_LIMITS.readings);
  }
}

/* ------------------------------------------------------------------ */
/* 5. DRIFT (ADR-0115) — cross-week conformal GOVERNANCE               */
/* ------------------------------------------------------------------ */

/**
 * The readings RULE-JUR-04 just froze are the ONLY input. A published band
 * crossing opens exactly ONE governed, marker-idempotent decision per ISO week,
 * owned at the enterprise lead, with one `rolls-up-to` edge per executive
 * ancestor seat IN THE SAME ATOMIC TRANSACTION. It never moves a reporting
 * line, never edits a reading, never accepts itself and never prices its own
 * audit output back as work (`[RULE-JUR-05:...]` is excluded by the harvest).
 */
function driftPass(draft, ctx, out, conventions, book) {
  const report = jurDriftEnterprise(draft, { now: ctx.now, settings: ctx.settings || draft.settings || {} });
  const week = weekKey(ctx.now);
  if (report.verdict !== 'drift') {
    note(ctx, out, JUR_RULE_IDS.DRIFT, 'no-drift', 'jurisdiction', week,
      `Cross-week drift scan: ${report.verdict}${report.reason ? ` (${report.reason})` : ''}; ${report.windowN} frozen week(s). No governed decision opened.`);
    return;
  }
  const marker = driftMarker(week);
  if (markerHas(draft, marker)) {
    note(ctx, out, JUR_RULE_IDS.DRIFT, 'already-governed', 'jurisdiction', week,
      'One governed drift decision per ISO week; this week is already on the ledger.');
    return;
  }
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  const decisionId = ctx.idFactory('dec');
  const metrics = [...new Set(report.outside.map((o) => o.metric))].join(' + ');
  const share = report.bands.share;
  const coalition = report.bands.coalition;
  const leaderName = book.chain.nodes.get(LEADER_ID)?.name || 'the enterprise lead';
  const options = JUR_DRIFT_OPTIONS.map((o) => ({
    id: ctx.idFactory('dopt'),
    label: `${o.key}: ${o.label}`,
    pros: o.question,
    cons: o.note,
  }));
  draft.decisions.push({
    id: decisionId,
    title: `Cross-week jurisdiction drift: ${metrics} outside its conformal band`,
    question: `${driftDecisionMarker(week)} ${report.windowN} frozen ISO weeks in the look-back `
      + `(${report.gapWeeks} unsampled week(s)). The newest change in ${metrics} is ${report.direction}: `
      + `cross-branch share Δ ${share.currentDelta ?? '—'} pp against a declared bound ${share.bound ?? '—'} pp `
      + `(k=${share.k ?? '—'}, n=${share.m}, achieved coverage ${share.coverageBound ?? '—'}); `
      + `median coalition size Δ ${coalition.currentDelta ?? '—'} against bound ${coalition.bound ?? '—'}. `
      + `This week's pooled share is ${report.latest?.pooledPct ?? '—'}% and the mean of unit rates is `
      + `${report.latest?.meanUnitPct ?? '—'}% (composition gap ${report.latest?.compositionGapPct ?? '—'} pp). `
      + `A band crossing is an anomaly under DECLARED exchangeability, not a causal finding. `
      + `Choose one. The engine never redraws a boundary, never changes a reading and never accepts this decision.`,
    date: dayKey(ctx.now),
    reversibility: 'reversible',
    driver: leaderName,
    approver: leaderName,
    contributors: '', informed: '',
    options,
    chosen: '', rationale: '', premiseIds: [],
    forecastProbability: null,
    decidedOn: null, reviewOn: addDays(dayKey(ctx.now), conventions.jurReviewDays),
    reviewedOn: null, outcome: 'pending', outcomeNotes: '', portfolioNotes: [],
    createdAt: ctx.now.toISOString(),
  });
  addMarker(draft, marker);
  // Vertical roll-up: every executive/chief seat can see the enterprise drift
  // ask. Bounded, typed edges, same transaction as the decision.
  const peopleIds = new Set((Array.isArray(draft.people) ? draft.people : []).map((p) => p?.id).filter(Boolean));
  const execIds = [...book.chain.nodes.values()]
    .filter((n) => altitudeRank(n.altitude) >= 4 && peopleIds.has(n.id))
    .map((n) => n.id)
    .slice(0, JUR_DRIFT_LIMITS.rollUpEdges);
  for (const id of execIds) {
    link(draft, ctx, 'decision', decisionId, 'person', id,
      'rolls-up-to', JUR_RULE_IDS.DRIFT, 'Cross-week jurisdiction drift decision rolled up');
  }
  note(ctx, out, JUR_RULE_IDS.DRIFT, 'governed', 'decision', decisionId,
    `Opened one governed cross-week drift decision for ${metrics} outside its conformal band`);
}

/* ------------------------------------------------------------------ */
/* the rule                                                            */
/* ------------------------------------------------------------------ */

export function jurisdictionRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string') return [];
  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const idFactory = typeof ctx.idFactory === 'function' ? ctx.idFactory : ((prefix) => `${prefix}-${Date.now()}`);
  const runCtx = {
    ...ctx, draft, now, idFactory,
    idFactoryArgs: { idFactory, todayStr: dayKey(now), nowIso: now.toISOString() },
  };
  const rootEvent = ctx.derived !== true;
  const explicit = event.type === JUR_EVENTS.SCAN || event.type === JUR_EVENTS.CONVENTIONS
    || event.type === JUR_EVENTS.DRIFT;
  const own = event.type.startsWith(JUR_TRIGGER_PREFIX);
  const workEvent = rootEvent && JUR_WORK_EVENTS.includes(event.type);
  const settlementEvent = rootEvent && JUR_SETTLEMENT_EVENTS.includes(event.type);
  const conventions = jurConventions(ctx.settings || draft.settings || {});
  const out = [];

  // Grading is DERIVED state: cheap, no events, no governed decisions, and the
  // only pass allowed to run on an unrelated write.
  gradePass(draft, runCtx, out, conventions);
  if (!explicit && !own && !workEvent && !settlementEvent) return out;
  if (!explicit && !own && conventions.jurAutoPropagate === false) return [];

  const fullPass = explicit || settlementEvent;
  const budget = { remaining: fullPass ? JUR_LIMITS.clustersPerScan : JUR_LIMITS.clustersPerPass };
  const book = detectPass(draft, runCtx, out, conventions, budget, {
    automatic: !fullPass, changedId: event.entityId || null, eventType: event.type,
  });
  if (fullPass) {
    governPass(draft, runCtx, out, conventions, book);
    rollUpPass(draft, runCtx, out, conventions, book);
    // ADR-0115: only the named drift command grades the cross-week series and
    // may open its governed decision. An ordinary `jur.scan` is unchanged.
    if (event.type === JUR_EVENTS.DRIFT) driftPass(draft, runCtx, out, conventions, book);
  }
  return out;
}

export function jurAttentionCount(state, now = new Date(), settings = null) {
  return jurAttentionRead(state, now, settings);
}
