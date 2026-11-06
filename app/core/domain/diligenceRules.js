/**
 * app/core/domain/diligenceRules.js — RULE-DLG-01..04 on the SHARED post-commit
 * spine (ADR-0104, Schema v106). Altitude is a dimension of the SAME engine.
 *
 *  RULE-DLG-01 FREEZE (cross-module AND cross-altitude in ONE transaction).
 *    A decision with no frozen knowable set gets exactly ONE, id hashed from the
 *    decision so a rescan cannot duplicate it. The set harvests dated pointers
 *    from five evidence classes OTHER MODULES OWN (cases, premises, delegations,
 *    goals, settled decisions). The checklist becomes a graph node with:
 *      - one `diligence-for`   edge to the decision it freezes,
 *      - one `deliberates-on`  edge per knowable fact (a pointer, never a copy),
 *      - one `rolls-up-to`     edge per leadership ancestor of the owning span.
 *    So the SAME atomic write that records a decision also freezes what was
 *    knowable, links it across five modules, and makes the FRONTIER visible
 *    above the span that decided. No manual re-entry, no second workflow engine.
 *
 *  RULE-DLG-02 GAP. A settled decision whose consulted share is below the
 *    declared floor opens exactly ONE governed deliberation-gap decision per
 *    span per ISO week, owned at the span that decided and rolled up its
 *    ancestors. Never a rating of a person.
 *
 *  RULE-DLG-03 DARK. An evidence class whose Jeffreys 90% upper bound sits
 *    below the declared ceiling opens ONE governed redesign decision per class
 *    per ISO week. It asks about the INFORMATION SYSTEM, not the people.
 *
 *  RULE-DLG-04 GRADE. A pre-decision process forecast is graded EXACTLY ONCE,
 *    out of sample, by Brier skill against a strictly-prior base rate, after the
 *    decision has settled. The grade is a separate dated graph node.
 *
 * All four are bounded, marker-idempotent and pausable by
 * `diligenceAutoPropagate`; an explicit `diligence.scan` always runs every pass.
 * Governed findings are AUDIT OUTPUT, not operational work: this module exports
 * `diligenceFindingIds` so the Hindsight Lock refuses to lock them (the exact
 * second-order-decision regression the Epistemic Ledger's merge exposed).
 */

import { addDays, dayKey, weekKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { activeSeat, buildSeats, recordPeople } from './seat.js';
import { LEADER_ID, responsibleNodeId } from './chain.js';
import { epistemicFindingIds } from './epistemicRules.js';
import {
  buildDiligenceReport,
  classCells,
  coverageOf,
  gradeForecast,
  knowableFacts,
} from './diligence.js';
import { diligenceConventions } from './diligenceSchema.js';
import {
  DILIGENCE_DECISION_EVENTS,
  DILIGENCE_ENGINE_VERSION,
  DILIGENCE_EVENTS,
  DILIGENCE_LIMITS,
  DILIGENCE_RULE_IDS,
  DILIGENCE_SETTLEMENT_EVENTS,
  DILIGENCE_TRIGGER_PREFIX,
  checklistId,
  diligenceMarkerId,
} from './diligenceRegistry.js';

function markersOf(draft) {
  return Array.isArray(draft.diligenceMarkers) ? draft.diligenceMarkers : [];
}

function addMarker(draft, ctx, marker) {
  if (!Array.isArray(draft.diligenceMarkers)) draft.diligenceMarkers = [];
  if (draft.diligenceMarkers.some((row) => row && row.id === marker.id)) return false;
  draft.diligenceMarkers.push({ ...marker, recordedOn: dayKey(ctx.now) });
  if (draft.diligenceMarkers.length > DILIGENCE_LIMITS.markers) {
    draft.diligenceMarkers.splice(0, draft.diligenceMarkers.length - DILIGENCE_LIMITS.markers);
  }
  return true;
}

function addLink(draft, ctx, sourceType, sourceId, targetType, targetId, relation, ruleId, summary) {
  if (!sourceId || !targetId) return false;
  return ensureEntityLink(draft, {
    sourceType, sourceId, targetType, targetId, relation, ruleId,
    summary: String(summary || '').slice(0, 240),
  }, {
    idFactory: ctx.idFactory,
    todayStr: dayKey(ctx.now),
    nowIso: ctx.now.toISOString(),
  }).created;
}

function note(ctx, out, ruleId, action, targetType, targetId, summary) {
  out.push({ ruleId, action, targetType, targetId, summary: String(summary).slice(0, 240) });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: targetType,
      entityId: targetId,
      summary: `[${ruleId}] ${String(summary).slice(0, 260)}`,
    });
  }
}

function ancestorsAbove(draft, seatId, now) {
  if (!seatId) return [];
  const built = buildSeats(draft, { now, settings: draft.settings || {} });
  const found = [];
  let cursor = built.chain.nodes.get(seatId)?.parentId || null;
  let guard = 0;
  while (cursor && guard < DILIGENCE_LIMITS.ancestorsCap) {
    if (cursor !== LEADER_ID && built.byId.has(cursor)) found.push(cursor);
    cursor = built.chain.nodes.get(cursor)?.parentId || null;
    guard += 1;
  }
  return [...new Set(found)];
}

/** The owning span of a decision: the active seat, or the responsible node. */
function resolveOwner(draft, decision, built, seat) {
  if (!seat.fullAccess && seat.id !== LEADER_ID && seat.id !== 'leader') {
    return { seatId: seat.id, altitudeKey: seat.altitudeKey, rank: seat.rank };
  }
  const people = recordPeople(decision);
  const node = people.length ? responsibleNodeId(built.chain, people) : LEADER_ID;
  if (node && node !== LEADER_ID && built.byId.has(node)) {
    const s = built.byId.get(node);
    return { seatId: s.id, altitudeKey: s.altitudeKey, rank: s.rank };
  }
  return { seatId: null, altitudeKey: 'chief', rank: 5 };
}

function decisionRecord(ctx, { title, question, options, reviewOn, rationale }) {
  const today = dayKey(ctx.now);
  const driver = String(ctx.draft?.settings?.leaderName || '').slice(0, 120);
  return {
    id: ctx.idFactory('dec'),
    title: title.slice(0, 200),
    question: question.slice(0, 4000),
    date: today,
    reversibility: 'reversible',
    driver, approver: driver,
    contributors: '', informed: '',
    options: options.map(([label, pros, cons]) => ({ id: ctx.idFactory('opt'), label, pros, cons })),
    chosen: '', rationale: rationale.slice(0, 4000),
    reviewOn, reviewedOn: null, outcome: 'pending', outcomeNotes: '',
    forecastProbability: null, decidedOn: null, createdAt: ctx.now.toISOString(),
  };
}

function linkFindingDecision(draft, ctx, ruleId, decision, checklist, ownerSeatId, summary) {
  if (checklist) {
    addLink(draft, ctx, 'decision', decision.id, 'diligencechecklist', checklist.id, 'tracks-followup', ruleId, summary);
  }
  if (ownerSeatId) {
    addLink(draft, ctx, 'decision', decision.id, 'person', ownerSeatId, 'informs', ruleId,
      'The finding informs the span whose frontier it was read from.');
    for (const ancestor of ancestorsAbove(draft, ownerSeatId, ctx.now)) {
      addLink(draft, ctx, 'decision', decision.id, 'person', ancestor, 'rolls-up-to', ruleId,
        'The diligence finding rolls up to this leadership ancestor.');
    }
  }
}

/**
 * Decisions authored by ANY rule are audit output, not operational work. They
 * never receive a frozen knowable set of their own (which would spawn a cascade
 * of second-order findings) and are excluded from the diligence frontier. The
 * provenance is the marker written in the same transaction as the decision.
 */
function governedDecisionIds(draft) {
  const out = new Set();
  // Only the decisions THIS module OPENED are audit output. A `freeze` marker
  // points at an ordinary human decision (which must still get its own frontier
  // and must still be locked by the Hindsight Lock) — never confuse the two.
  for (const marker of markersOf(draft)) {
    if (marker && marker.decisionId && ['gap', 'dark'].includes(marker.kind)) out.add(marker.decisionId);
  }
  for (const id of epistemicFindingIds(draft)) out.add(id);
  for (const marker of Array.isArray(draft.decisionLockMarkers) ? draft.decisionLockMarkers : []) {
    if (marker && marker.decisionId) out.add(marker.decisionId);
  }
  return out;
}

/** Exported for the Hindsight Lock: our governed findings must never be locked. */
export function diligenceFindingIds(state = {}) {
  const out = new Set();
  for (const marker of Array.isArray(state.diligenceMarkers) ? state.diligenceMarkers : []) {
    if (marker && marker.decisionId && ['gap', 'dark'].includes(marker.kind)) out.add(marker.decisionId);
  }
  return out;
}

/* ------------------------------------------- settlement is derived, not stored
 * A frontier is frozen the day the decision is CREATED, when its outcome is
 * still `pending`. If the outcome is reviewed later, the frozen row must follow
 * the DECISION RECORD — otherwise RULE-DLG-04 could never grade a forecast that
 * was legitimately declared before settlement, and RULE-DLG-02 would never see
 * the gap. This is a derived state sync, not a new action: it writes no event,
 * opens no work and is idempotent on every commit.
 */
function settlePass(draft, nowIso) {
  const checklists = Array.isArray(draft.diligenceChecklists) ? draft.diligenceChecklists : [];
  const byId = new Map((Array.isArray(draft.decisions) ? draft.decisions : []).filter(Boolean).map((d) => [d.id, d]));
  for (const checklist of checklists) {
    if (!checklist || !checklist.decisionId) continue;
    const decision = byId.get(checklist.decisionId);
    if (!decision) continue;
    const settled = Boolean(decision.outcome && decision.outcome !== 'pending');
    const status = settled ? 'settled' : 'open';
    const outcome = ['good', 'mixed', 'bad'].includes(decision.outcome) ? decision.outcome : 'pending';
    if (checklist.status !== status || checklist.outcome !== outcome) {
      checklist.status = status;
      checklist.outcome = outcome;
      checklist.updatedAt = nowIso;
    }
  }
}

/* ------------------------------------------- RULE-DLG-01: freeze frontier */

function freezePass(draft, ctx, out, conventions, budget) {
  const decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  if (!decisions.length) return 0;
  if (!Array.isArray(draft.diligenceChecklists)) draft.diligenceChecklists = [];
  const existing = new Set(draft.diligenceChecklists.map((row) => row && row.id));
  const governed = governedDecisionIds(draft);
  const built = buildSeats(draft, { now: ctx.now, settings: draft.settings || {} });
  const seat = activeSeat(built);
  let createdN = 0;
  for (const decision of decisions) {
    if (budget.remaining <= 0) break;
    if (!decision || !decision.id || !decision.date) continue;
    if (governed.has(decision.id)) continue;
    const id = checklistId(decision.id);
    if (existing.has(id)) continue;
    if (draft.diligenceChecklists.length >= DILIGENCE_LIMITS.checklists) break;
    const facts = knowableFacts(draft, decision, { limit: DILIGENCE_LIMITS.factsPerChecklist });
    const owner = resolveOwner(draft, decision, built, seat);
    const settled = Boolean(decision.outcome && decision.outcome !== 'pending');
    const row = {
      id,
      decisionId: decision.id,
      decisionOn: dayKey(decision.date),
      frozenOn: dayKey(ctx.now),
      facts,
      factN: facts.length,
      status: settled ? 'settled' : 'open',
      outcome: ['good', 'mixed', 'bad'].includes(decision.outcome) ? decision.outcome : 'pending',
      forecast: null,
      gradedOn: null,
      ownerSeatId: owner.seatId,
      altitudeKey: owner.altitudeKey,
      rank: owner.rank,
      engineVersion: DILIGENCE_ENGINE_VERSION,
      createdAt: ctx.now.toISOString(),
      updatedAt: ctx.now.toISOString(),
    };
    draft.diligenceChecklists.push(row);
    existing.add(id);
    createdN += 1;
    budget.remaining -= 1;
    // Cross-module provenance: one edge to the decision, one per knowable fact.
    addLink(draft, ctx, 'diligencechecklist', id, 'decision', decision.id, 'diligence-for',
      DILIGENCE_RULE_IDS.FREEZE,
      'This frozen knowable set is the diligence frontier of this decision.');
    for (const fact of facts) {
      addLink(draft, ctx, 'diligencechecklist', id, fact.sourceType, fact.sourceId, 'deliberates-on',
        DILIGENCE_RULE_IDS.FREEZE,
        `A ${fact.evidenceClass} fact dated ${fact.evidencesOn} was knowable on the decision date; a pointer, never a copy.`);
    }
    // Cross-altitude roll-up: ONE edge per leadership ancestor, SAME transaction.
    if (owner.seatId) {
      for (const ancestor of ancestorsAbove(draft, owner.seatId, ctx.now)) {
        addLink(draft, ctx, 'diligencechecklist', id, 'person', ancestor, 'rolls-up-to',
          DILIGENCE_RULE_IDS.FREEZE,
          'The frozen diligence frontier of a decision below this span rolls up here.');
      }
    }
    addMarker(draft, ctx, {
      id: diligenceMarkerId('freeze', decision.id), kind: 'freeze', key: decision.id,
      checklistId: id, decisionId: decision.id,
      note: `Froze ${facts.length} knowable fact(s) across ${new Set(facts.map((f) => f.evidenceClass)).size} evidence class(es).`,
    });
    note(ctx, out, DILIGENCE_RULE_IDS.FREEZE, 'froze', 'diligencechecklist', id,
      `Froze the deliberation frontier for a ${decision.date} decision: ${facts.length} knowable fact(s) from five evidence classes, with one rolls-up-to edge per leadership ancestor.`);
  }
  void conventions;
  return createdN;
}

/* ----------------------------------------------- RULE-DLG-02: coverage gap */

function gapPass(draft, ctx, out, conventions, budget) {
  const checklists = Array.isArray(draft.diligenceChecklists) ? draft.diligenceChecklists : [];
  if (!checklists.length) return 0;
  const consults = Array.isArray(draft.diligenceConsults) ? draft.diligenceConsults : [];
  const byChecklist = new Map();
  for (const consult of consults) {
    if (!consult) continue;
    if (!byChecklist.has(consult.checklistId)) byChecklist.set(consult.checklistId, []);
    byChecklist.get(consult.checklistId).push(consult);
  }
  const week = weekKey(ctx.now) || dayKey(ctx.now);
  let openedN = 0;
  for (const checklist of checklists) {
    if (budget.remaining <= 0) break;
    if (!checklist || checklist.status !== 'settled') continue;
    const coverage = coverageOf(checklist, byChecklist.get(checklist.id) || [], conventions);
    if (coverage.refused || coverage.coveragePct >= conventions.diligenceCoverageFloorPct) continue;
    const seatKey = checklist.ownerSeatId || 'workspace';
    const marker = diligenceMarkerId('gap', `${seatKey}|${week}`);
    if (markersOf(draft).some((m) => m && m.id === marker)) continue;
    const decision = decisionRecord(ctx, {
      title: `Diligence gap: ${coverage.consultedN} of ${coverage.knowableN} knowable facts consulted on a settled decision`,
      question: [
        `On a decision that has now settled, the frozen knowable set held ${coverage.knowableN} dated facts and ${coverage.consultedN} were consulted (${coverage.coveragePct}%, Wilson 95% ${coverage.loPct}–${coverage.hiPct}%) — below the declared ${conventions.diligenceCoverageFloorPct}% diligence floor.`,
        `${coverage.ruledOut} were read and ruled out with a reason, ${coverage.deferred} were deferred, and ${coverage.unconsultedN} were never opened. Looking-and-dismissing is already counted as diligence; only the unconsulted facts are the gap.`,
        'This is a question about the span\'s reading of its OWN record, never about a person and never about whether the outcome was good.',
      ].join(' '),
      options: [
        ['Change what this span reads before it decides', 'The only fix with a mechanism behind it: the frontier is being formed from too little of the record.', 'Slower to decide, and honest about it.'],
        ['Re-declare the diligence floor', 'If the floor is wrong, the finding is wrong, and re-declaring it is the fixed way to say so.', 'Moves the standard for every span at once; rank 4-5 only.'],
      ],
      reviewOn: addDays(dayKey(ctx.now), conventions.diligenceReviewDays),
      rationale: `RULE-DLG-02: settled frontier coverage ${coverage.coveragePct}% below ${conventions.diligenceCoverageFloorPct}%. One bounded deliberation-gap decision per span per ISO week.`,
    });
    if (!Array.isArray(draft.decisions)) draft.decisions = [];
    draft.decisions.push(decision);
    linkFindingDecision(draft, ctx, DILIGENCE_RULE_IDS.GAP, decision, checklist,
      seatKey === 'workspace' ? null : seatKey,
      'The gap decision tracks the frozen frontier it was read from.');
    addMarker(draft, ctx, {
      id: marker, kind: 'gap', key: `${seatKey}|${week}`, checklistId: checklist.id,
      decisionId: decision.id, weekKey: week,
      note: `Coverage ${coverage.coveragePct}% below floor ${conventions.diligenceCoverageFloorPct}%.`,
    });
    openedN += 1;
    budget.remaining -= 1;
    note(ctx, out, DILIGENCE_RULE_IDS.GAP, 'created', 'decision', decision.id,
      'Opened one governed deliberation-gap decision for a settled decision that consulted too little of its own record.');
  }
  return openedN;
}

/* ------------------------------------------------ RULE-DLG-03: dark class */

function darkPass(draft, ctx, out, conventions, budget) {
  const checklists = Array.isArray(draft.diligenceChecklists) ? draft.diligenceChecklists : [];
  if (!checklists.length) return 0;
  const consults = Array.isArray(draft.diligenceConsults) ? draft.diligenceConsults : [];
  const cells = classCells(checklists, consults, conventions);
  const week = weekKey(ctx.now) || dayKey(ctx.now);
  let openedN = 0;
  for (const cell of cells) {
    if (budget.remaining <= 0) break;
    if (cell.refused || cell.dark !== true) continue;
    const marker = diligenceMarkerId('dark', `${cell.className}|${week}`);
    if (markersOf(draft).some((m) => m && m.id === marker)) continue;
    const decision = decisionRecord(ctx, {
      title: `Dark evidence class: ${cell.label} consulted on ${cell.consultedN} of ${cell.knowableN} frozen facts`,
      question: [
        `Across every frozen diligence frontier, the "${cell.label}" class (${cell.discipline}) was consulted ${cell.consultedN} times out of ${cell.knowableN} knowable facts (${cell.sharePct}%).`,
        `The Jeffreys Beta(½,½) 90% credible interval on the consulted share is ${cell.loPct}–${cell.hiPct}%, entirely below the declared ${conventions.diligenceDarkCeilingPct}% ceiling: this is a SYSTEMATIC pattern, not one busy week.`,
        'The unit of analysis is an evidence class and a span, never a person. Choose a mechanism that makes this class visible at decision time.',
      ].join(' '),
      options: [
        ['Put this class on the decision brief', 'A standing prompt on the decision form is the cheapest mechanism that changes what is read.', 'Adds a line to every decision; the interval says the friction is earned.'],
        ['Re-declare the dark ceiling', 'If the ceiling is set too high the reading is a tautology; re-declaring is the honest fix.', 'Director+ only, and it moves every class at once.'],
      ],
      reviewOn: addDays(dayKey(ctx.now), conventions.diligenceReviewDays),
      rationale: `RULE-DLG-03: Jeffreys 90% upper bound ${cell.hiPct}% below dark ceiling ${conventions.diligenceDarkCeilingPct}% for ${cell.className}. One governed redesign decision per class per ISO week.`,
    });
    if (!Array.isArray(draft.decisions)) draft.decisions = [];
    draft.decisions.push(decision);
    linkFindingDecision(draft, ctx, DILIGENCE_RULE_IDS.DARK, decision, null, null,
      'The redesign decision concerns an evidence class across the whole workspace.');
    addMarker(draft, ctx, {
      id: marker, kind: 'dark', key: `${cell.className}|${week}`, decisionId: decision.id, weekKey: week,
      note: `${cell.className}: Jeffreys hi ${cell.hiPct}% below ceiling ${conventions.diligenceDarkCeilingPct}%.`,
    });
    openedN += 1;
    budget.remaining -= 1;
    note(ctx, out, DILIGENCE_RULE_IDS.DARK, 'created', 'decision', decision.id,
      `Opened one governed redesign decision for the dark ${cell.className} evidence class.`);
  }
  return openedN;
}

/* --------------------------------------------------- RULE-DLG-04: grade */

function gradePass(draft, ctx, out, conventions, budget, report) {
  const checklists = Array.isArray(draft.diligenceChecklists) ? draft.diligenceChecklists : [];
  if (!checklists.length) return 0;
  if (!Array.isArray(draft.diligenceGrades)) draft.diligenceGrades = [];
  const graded = new Set(draft.diligenceGrades.filter((row) => row && row.checklistId).map((row) => row.checklistId));
  const consults = Array.isArray(draft.diligenceConsults) ? draft.diligenceConsults : [];
  const byChecklist = new Map();
  for (const consult of consults) {
    if (!consult) continue;
    if (!byChecklist.has(consult.checklistId)) byChecklist.set(consult.checklistId, []);
    byChecklist.get(consult.checklistId).push(consult);
  }
  let gradedN = 0;
  for (const checklist of checklists) {
    if (budget.remaining <= 0) break;
    if (!checklist || !checklist.forecast || graded.has(checklist.id)) continue;
    if (checklist.status !== 'settled') continue;
    const scored = gradeForecast(checklist, byChecklist.get(checklist.id) || [], conventions);
    // A refused grade stays LIVE: grading it now would freeze a row that calls
    // "too few facts" a result. It is graded on the pass where evidence clears.
    if (scored.refused) continue;
    const grade = {
      id: ctx.idFactory('dlggrade'),
      checklistId: checklist.id,
      gradedOn: dayKey(ctx.now),
      claimsN: scored.claimsN,
      hitsN: scored.hitsN,
      brier: scored.brier,
      baseBrier: scored.baseBrier,
      skill: scored.skill,
      coveragePct: scored.coveragePct,
      verdict: scored.verdict,
      ownerSeatId: checklist.ownerSeatId || null,
      altitudeKey: checklist.altitudeKey || null,
      rank: checklist.rank || 5,
      engineVersion: DILIGENCE_ENGINE_VERSION,
      createdAt: ctx.now.toISOString(),
    };
    draft.diligenceGrades.push(grade);
    graded.add(checklist.id);
    checklist.gradedOn = grade.gradedOn;
    checklist.updatedAt = ctx.now.toISOString();
    addLink(draft, ctx, 'diligencegrade', grade.id, 'diligencechecklist', checklist.id, 'grades-diligence',
      DILIGENCE_RULE_IDS.GRADE,
      'This once-only Brier grade scores the forecast frozen BEFORE the decision settled.');
    addMarker(draft, ctx, {
      id: diligenceMarkerId('grade', checklist.id), kind: 'grade', key: checklist.id,
      checklistId: checklist.id, gradeId: grade.id,
      note: `Brier ${scored.brier} vs base ${scored.baseBrier}; skill ${scored.skill}; verdict ${scored.verdict}.`,
    });
    gradedN += 1;
    budget.remaining -= 1;
    note(ctx, out, DILIGENCE_RULE_IDS.GRADE, 'graded', 'diligencegrade', grade.id,
      `Graded one pre-decision process forecast once, out of sample: ${scored.claimsN} claims, Brier skill ${scored.skill} (${scored.verdict}).`);
  }
  void report;
  return gradedN;
}

/* ------------------------------------------------------------------- rule */

export function diligenceRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string') return [];
  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const runCtx = {
    ...ctx,
    draft,
    now,
    idFactory: typeof ctx.idFactory === 'function' ? ctx.idFactory : ((prefix) => `${prefix}-${Date.now()}`),
  };
  // Derived `decision.created` events are OTHER rules' audit output, never a
  // new human commitment; the transaction that wrote them already had its own
  // chance to freeze. Restricting automatic work to ROOT decision events keeps
  // the generalized spine's bounded event queue available for real propagation.
  const rootEvent = ctx.derived !== true;
  const explicit = event.type === DILIGENCE_EVENTS.SCAN || event.type === DILIGENCE_EVENTS.CONSULTED
    || event.type === DILIGENCE_EVENTS.FORECAST || event.type === DILIGENCE_EVENTS.CONVENTIONS;
  const own = event.type.startsWith(DILIGENCE_TRIGGER_PREFIX);
  const decisionEvent = rootEvent && DILIGENCE_DECISION_EVENTS.includes(event.type);
  const settlementEvent = rootEvent && DILIGENCE_SETTLEMENT_EVENTS.includes(event.type);
  const conventions = diligenceConventions(ctx.settings || draft.settings || {});

  // Settlement is DERIVED state, so it follows every commit (cheap, no events,
  // no work). Everything else is inert on an unrelated write. This is the
  // invariant published in ADR-0104: a decision commit or an explicit scan,
  // never a second-order cascade from a premise or case write.
  settlePass(draft, runCtx.now.toISOString());
  if (!explicit && !own && !decisionEvent) return [];
  if (!explicit && !own && conventions.diligenceAutoPropagate === false) return [];

  const explicitScan = event.type === DILIGENCE_EVENTS.SCAN;
  // A settlement and an operator's scan are both WHOLE-LEDGER passes: opening
  // only three of five dark classes at settlement would make the very next scan
  // "find" the rest, which reads as non-idempotence even though every marker is
  // correct. Ordinary automatic decision writes stay bounded.
  const fullPass = explicitScan || settlementEvent;
  const full = fullPass ? DILIGENCE_LIMITS.checklists : DILIGENCE_LIMITS.findingsPerPass;
  const out = [];
  // FREEZE has its own (larger) automatic budget so a decision is never left
  // without a frontier for long, while work-producing passes stay cheap on every
  // unrelated write. An explicit scan is bounded by the ledger's own size.
  const freezeBudget = { remaining: fullPass ? DILIGENCE_LIMITS.checklists : DILIGENCE_LIMITS.freezePerPass };
  const findingBudget = { remaining: full };
  freezePass(draft, runCtx, out, conventions, freezeBudget);
  // Findings are opened when the operator asks, when this module's own evidence
  // changes, or when a decision SETTLES — never on a decision's creation, where
  // there is no outcome yet and the workspace is still forming the frontier.
  if (explicit || own || settlementEvent) {
    gapPass(draft, runCtx, out, conventions, findingBudget);
    darkPass(draft, runCtx, out, conventions, findingBudget);
    let report = null;
    try {
      report = buildDiligenceReport(draft, { now, settings: draft.settings || {} });
    } catch { report = null; }
    gradePass(draft, runCtx, out, conventions, findingBudget, report);
  }
  return out;
}
