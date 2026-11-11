/**
 * app/core/domain/hiringLines.js — the Cross-Line Selection Corroboration read
 * model (ADR-0176, Schema v141).
 *
 * A PURE READ. It reads the dated line-plan acts (`hiringLinePlans`), the
 * requisitions, the candidates' recorded evidence, and the LIVE matrix graph
 * (`buildMatrix` — the same engine every matrix module reads). It stores
 * nothing and mutates nothing.
 *
 * TWO CLAIMS, PRINTED APART (Bulletproof Reliability Mandate)
 *   verdictsReconcile  the eight verdict counts sum to the candidates read;
 *   linesReconcile     the five line-state counts sum to the (candidate, line)
 *                      pairs read.
 * Neither is collapsed into one reassuring word, and a rate that cannot be
 * supported is `null` with a printed reason — never zero.
 *
 * MATRIX CORRECTNESS
 *   - A line is credited only with its own manager's evidence (`heard`).
 *   - Evidence from somebody in the manager's span (matrix DAG descendants,
 *     home AND declared additional lines) reads `represented`.
 *   - An interviewer who sits under MORE THAN ONE declared line credits no line
 *     by representation: the signal is counted `ambiguous`, never double-counted.
 *   - After the hire, the plan is compared with the lines the person actually
 *     holds in the live graph; drift is printed, never repaired.
 *
 * SEAT SCOPE. Under a declared seat only requisitions whose plan names the seat
 * or somebody in its span are read; an out-of-span manager's name and ratings
 * are withheld; a candidate's name is printed only to the operator view and to
 * the managers the plan itself names.
 */

import { dayKey } from '../time.js';
import { buildMatrix, matrixLineScope } from './matrix.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { normalizeHiringLineSettings } from './hiringLineSchema.js';
import {
  HIRING_LINE_ASKABLE_STAGES,
  HIRING_LINE_CSV_COLUMNS,
  HIRING_LINE_DECISION_STAGES,
  HIRING_LINE_DIVERGENCE_ANCHORS,
  HIRING_LINE_EXPOSED_VERDICTS,
  HIRING_LINE_IN_FLIGHT_STATUSES,
  HIRING_LINE_METHOD,
  HIRING_LINE_OFFER_STAGES,
  HIRING_LINE_RATE_FLOOR,
  HIRING_LINE_READ_STATUSES,
  HIRING_LINE_RIGHTS,
  HIRING_LINE_RULE_ID,
  HIRING_LINE_STATES,
  HIRING_LINE_STATE_LABELS,
  HIRING_LINE_STATE_REASONS,
  HIRING_LINE_TESTED_VERDICTS,
  HIRING_LINE_VERDICTS,
  HIRING_LINE_VERDICT_LABELS,
  HIRING_LINE_VERDICT_REASONS,
} from './hiringLineRegistry.js';

/** The effective plan per requisition: the LATEST act, or none when withdrawn. */
export function effectiveHiringLinePlans(state) {
  const acts = Array.isArray(state?.hiringLinePlans) ? state.hiringLinePlans : [];
  const latest = new Map();
  acts.forEach((act, index) => {
    if (!act || !act.reqId) return;
    const prev = latest.get(act.reqId);
    // Later timestamp wins; on an exact tie the later-appended act wins.
    if (!prev || String(act.at) > String(prev.act.at) || (String(act.at) === String(prev.act.at) && index > prev.index)) {
      latest.set(act.reqId, { act, index });
    }
  });
  const out = new Map();
  for (const [reqId, { act }] of latest) {
    if (act.kind === 'declared') out.set(reqId, act);
  }
  return out;
}

/** Lower median of integers; `null` for an empty list. */
export function lowerMedian(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

function resolveSeat(state, at, matrix) {
  const settings = state.settings || {};
  const scope = matrixLineScope(matrix);
  const built = buildSeats(state, { now: at, settings, lineScope: scope.byManager });
  return activeSeat(built);
}

function emptyCounts(keys) {
  return Object.fromEntries(keys.map((k) => [k, 0]));
}

/**
 * @returns the register. Shape is stable; every count is an integer and every
 *          refused figure is `null` with its reason beside it.
 */
export function buildHiringLines(state, { now = new Date(), settings = null, matrix = null } = {}) {
  const at = now instanceof Date ? now : new Date(now);
  const today = dayKey(at) || at.toISOString().slice(0, 10);
  const effectiveSettings = settings || state?.settings || {};
  const view = { ...state, settings: effectiveSettings };
  const graph = matrix || buildMatrix(view, { now: at, settings: effectiveSettings });
  const seat = resolveSeat(view, at, graph);
  const conv = normalizeHiringLineSettings(effectiveSettings);
  const full = Boolean(seat.fullAccess);
  const inSpan = (id) => full || id === seat.id || Boolean(seat.scope && seat.scope.has(id));
  const onRoster = (id) => graph.roster.has(id);
  const nameOf = (id) => graph.nodes.get(id)?.name || (state.people || []).find((p) => p.id === id)?.name || id;

  const plans = effectiveHiringLinePlans(state);
  const requisitions = Array.isArray(state?.requisitions) ? state.requisitions : [];
  const candidates = Array.isArray(state?.candidates) ? state.candidates : [];
  const delegations = Array.isArray(state?.delegations) ? state.delegations : [];
  const openAskTaskIds = new Map();
  for (const marker of Array.isArray(state?.hiringLineMarkers) ? state.hiringLineMarkers : []) {
    if (!marker || marker.kind !== 'ask' || !marker.taskId) continue;
    const task = delegations.find((d) => d && d.id === marker.taskId && d.status === 'active');
    if (task) openAskTaskIds.set(marker.pairKey, task.id);
  }

  const board = {
    requisitionsReadN: 0, declaredN: 0, undeclaredN: 0, cancelledN: 0,
    candidatesReadN: 0,
    verdicts: emptyCounts(HIRING_LINE_VERDICTS),
    linePairsN: 0,
    lines: emptyCounts(HIRING_LINE_STATES),
    homeOnlyLoopN: 0, ambiguousSignalN: 0, offersExposedN: 0,
    testedN: 0, everyLineHeardN: 0, everyLineHeardPermille: null, permilleRemainder: false, rateWithheldReason: '',
    hiresReadN: 0, realisedN: 0, driftedN: 0, hiresUnreadableN: 0,
    openAsksN: 0,
    verdictsReconcile: false, linesReconcile: false,
  };
  const rows = [];

  const ordered = [...requisitions].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  for (const req of ordered) {
    if (!req || !req.id) continue;
    const plan = plans.get(req.id) || null;
    const declaredManagers = plan ? [plan.homeManagerId, ...plan.lineManagerIds] : [];
    // Scope: an undeclared requisition names nobody, so only the operator view
    // reads it. A declared one is read by a seat the plan names or spans.
    const visible = full || declaredManagers.some((id) => inSpan(id));
    if (!visible) continue;
    if (!HIRING_LINE_READ_STATUSES.includes(req.status)) {
      if (req.status === 'cancelled') board.cancelledN += 1;
      continue;
    }
    board.requisitionsReadN += 1;
    if (plan) board.declaredN += 1; else board.undeclaredN += 1;

    const viewerIsDeclared = declaredManagers.includes(seat.id);
    const showCandidateNames = full || viewerIsDeclared;
    const showAllLines = full || viewerIsDeclared;
    const panel = new Set(Array.isArray(req.interviewers) ? req.interviewers : []);

    // Which declared line each roster person sits under (manager excluded: the
    // manager's own evidence is `heard`, not representation).
    const spanOf = new Map();
    for (const managerId of declaredManagers) {
      const node = graph.nodes.get(managerId);
      spanOf.set(managerId, node && onRoster(managerId) ? new Set(node.descendants || []) : new Set());
    }

    const planLines = declaredManagers.map((managerId, index) => {
      const lineVisible = showAllLines || inSpan(managerId);
      return {
        managerId: lineVisible ? managerId : null,
        managerName: lineVisible ? nameOf(managerId) : null,
        managerWithheld: !lineVisible,
        role: index === 0 ? 'home' : 'additional',
        onRoster: onRoster(managerId),
        onPanel: panel.has(managerId),
      };
    });

    const decisionCandidates = candidates
      .filter((c) => c && c.reqId === req.id && HIRING_LINE_DECISION_STAGES.includes(c.stage))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));

    const candidateRows = decisionCandidates.map((cand, ordinal) => {
      const signals = Array.isArray(cand.signals) ? cand.signals : [];
      let ambiguousN = 0;
      const representedBy = new Map(declaredManagers.map((id) => [id, 0]));
      for (const sig of signals) {
        const who = sig && sig.interviewerId;
        if (!who || declaredManagers.includes(who)) continue;
        const under = declaredManagers.filter((id) => spanOf.get(id).has(who));
        if (under.length === 1) representedBy.set(under[0], representedBy.get(under[0]) + 1);
        else if (under.length > 1) ambiguousN += 1;
      }

      const lines = declaredManagers.map((managerId, index) => {
        const own = signals.filter((sig) => sig && sig.interviewerId === managerId);
        const ratings = own.map((sig) => sig.rating).filter((r) => Number.isInteger(r));
        let lineState;
        if (!onRoster(managerId)) lineState = 'unreadable';
        else if (own.length) lineState = 'heard';
        else if (representedBy.get(managerId) > 0) lineState = 'represented';
        else if (panel.has(managerId)) lineState = 'silent';
        else lineState = 'unasked';
        const lineVisible = showAllLines || inSpan(managerId);
        const pairKey = `${req.id}|${cand.id}|${managerId}|${plan.id}`;
        return {
          pairKey: lineVisible ? pairKey : null,
          managerId: lineVisible ? managerId : null,
          managerName: lineVisible ? nameOf(managerId) : null,
          managerWithheld: !lineVisible,
          role: index === 0 ? 'home' : 'additional',
          state: lineState,
          stateLabel: HIRING_LINE_STATE_LABELS[lineState],
          reason: HIRING_LINE_STATE_REASONS[lineState],
          ownSignalN: lineVisible ? own.length : null,
          representedSignalN: lineVisible ? representedBy.get(managerId) : null,
          medianRating: lineVisible ? lowerMedian(ratings) : null,
          openAskTaskId: lineVisible ? (openAskTaskIds.get(pairKey) || null) : null,
          askable: lineState === 'silent' || lineState === 'unasked',
          // Unscoped copies for the verdict arithmetic only; stripped below.
          _median: lowerMedian(ratings),
          _managerId: managerId,
          _pairKey: pairKey,
          _hasOpenAsk: openAskTaskIds.has(pairKey),
        };
      });

      let verdict;
      let spread = null;
      if (!plan) verdict = 'undeclared';
      else if (lines.some((l) => l.state === 'unreadable')) verdict = 'unreadable';
      else if (lines.some((l) => l.state === 'unasked')) verdict = 'line-unasked';
      else if (lines.some((l) => l.state === 'silent')) verdict = 'line-silent';
      else if (lines.some((l) => l.state === 'represented')) verdict = 'line-represented';
      else if (lines.length < 2) verdict = 'single-line-heard';
      else {
        const medians = lines.map((l) => l._median);
        // Every line is `heard`, so every median exists (ratings are 1–5 integers).
        spread = Math.max(...medians) - Math.min(...medians);
        verdict = spread >= HIRING_LINE_DIVERGENCE_ANCHORS ? 'divergent' : 'corroborated';
      }
      const additional = lines.filter((l) => l.role === 'additional');
      const homeOnlyLoop = Boolean(plan) && additional.length > 0
        && lines[0].state === 'heard'
        && additional.every((l) => l.state === 'silent' || l.state === 'unasked');
      const atOffer = HIRING_LINE_OFFER_STAGES.includes(cand.stage);
      const offerExposed = atOffer && HIRING_LINE_EXPOSED_VERDICTS.includes(verdict);

      board.candidatesReadN += 1;
      board.verdicts[verdict] += 1;
      board.ambiguousSignalN += ambiguousN;
      if (homeOnlyLoop) board.homeOnlyLoopN += 1;
      if (offerExposed) board.offersExposedN += 1;
      for (const l of lines) {
        board.linePairsN += 1;
        board.lines[l.state] += 1;
        if (l._hasOpenAsk) board.openAsksN += 1;
      }
      if (plan && lines.length >= 2 && HIRING_LINE_TESTED_VERDICTS.includes(verdict)) {
        board.testedN += 1;
        if (verdict === 'divergent' || verdict === 'corroborated') board.everyLineHeardN += 1;
      }

      return {
        candidateId: showCandidateNames ? cand.id : null,
        candidateLabel: showCandidateNames ? cand.name : `Candidate ${ordinal + 1}`,
        nameWithheld: !showCandidateNames,
        stage: cand.stage,
        askableStage: HIRING_LINE_ASKABLE_STAGES.includes(cand.stage),
        verdict,
        verdictLabel: HIRING_LINE_VERDICT_LABELS[verdict],
        reason: HIRING_LINE_VERDICT_REASONS[verdict],
        spread: showAllLines ? spread : null,
        homeOnlyLoop,
        offerExposed,
        ambiguousSignalN: ambiguousN,
        lines,
      };
    });

    // After the hire: does the person hold the lines the plan declared?
    let realised = null;
    if (plan && req.status === 'filled' && req.filledPersonId) {
      board.hiresReadN += 1;
      const personId = req.filledPersonId;
      if (!onRoster(personId) || declaredManagers.some((id) => !onRoster(id))) {
        board.hiresUnreadableN += 1;
        realised = {
          state: 'unreadable',
          reason: 'The hired person or a declared manager is no longer on the active roster, so the plan cannot be compared with the reporting graph.',
          missing: [], undeclared: [],
        };
      } else {
        const live = new Set((graph.linesByPerson.get(personId) || []).map((l) => l.managerId));
        const declared = new Set(declaredManagers);
        const missing = [...declared].filter((id) => !live.has(id)).sort();
        const undeclared = [...live].filter((id) => !declared.has(id)).sort();
        const homeLive = (graph.linesByPerson.get(personId) || []).find((l) => l.role === 'primary')?.managerId || null;
        const homeMoved = homeLive !== plan.homeManagerId;
        const drifted = missing.length > 0 || undeclared.length > 0 || homeMoved;
        if (drifted) board.driftedN += 1; else board.realisedN += 1;
        const label = (id) => (showAllLines || inSpan(id) ? nameOf(id) : 'a manager outside this span');
        realised = {
          state: drifted ? 'drifted' : 'realised',
          reason: drifted
            ? 'The reporting lines this person holds today are not the lines the plan declared. Nothing was repaired: re-declare the plan or correct the lines.'
            : 'The person holds exactly the declared home line and additional lines in the live reporting graph.',
          missing: missing.map(label),
          undeclared: undeclared.map(label),
          homeMoved,
        };
      }
    }

    for (const row of candidateRows) {
      for (const l of row.lines) { delete l._median; delete l._managerId; delete l._pairKey; delete l._hasOpenAsk; }
    }

    rows.push({
      reqId: req.id,
      title: req.title,
      status: req.status,
      inFlight: HIRING_LINE_IN_FLIGHT_STATUSES.includes(req.status),
      declared: Boolean(plan),
      planActId: plan ? plan.id : null,
      planDeclaredOn: plan ? String(plan.at).slice(0, 10) : null,
      planNote: plan && showAllLines ? plan.note : '',
      planLines,
      matrixHire: Boolean(plan) && plan.lineManagerIds.length > 0,
      candidates: candidateRows,
      realised,
    });
  }

  // The two reconciliation claims, computed from the printed counts themselves.
  board.verdictsReconcile = HIRING_LINE_VERDICTS.reduce((sum, k) => sum + board.verdicts[k], 0) === board.candidatesReadN;
  board.linesReconcile = HIRING_LINE_STATES.reduce((sum, k) => sum + board.lines[k], 0) === board.linePairsN;

  if (board.testedN < HIRING_LINE_RATE_FLOOR) {
    board.rateWithheldReason = `Withheld: ${board.testedN} cross-line candidate(s) tested, below the declared floor of ${HIRING_LINE_RATE_FLOOR}. A rate over so few would be an anecdote.`;
  } else if (board.verdicts.unreadable > 0) {
    board.rateWithheldReason = `Withheld: ${board.verdicts.unreadable} candidate(s) sit under a declared line that cannot be read, so the tested set is incomplete.`;
  } else {
    const numerator = board.everyLineHeardN * 1000;
    board.everyLineHeardPermille = Math.trunc(numerator / board.testedN);
    board.permilleRemainder = numerator % board.testedN !== 0;
  }

  const govern = canAct(HIRING_LINE_RIGHTS.GOVERN, seat);
  return {
    generatedOn: today,
    ruleId: HIRING_LINE_RULE_ID,
    seat: { id: seat.id, name: seat.name, rank: seat.rank, fullAccess: full, readOnly: Boolean(seat.readOnly) },
    scopeLabel: full ? 'whole workspace (operator view)' : `requisitions whose line plan names ${seat.name} or their span`,
    scopeNote: full ? '' : 'Requisitions with no declared line plan name nobody and are read only in the operator view. Managers outside this span are withheld.',
    actor: {
      canDeclare: full && !seat.readOnly,
      canScan: !seat.readOnly && (full || Boolean(govern.allow)),
    },
    conventions: {
      askDueDays: conv.hiringLineAskDueDays,
      autoPropagate: conv.hiringLineAutoPropagate,
      divergenceAnchors: HIRING_LINE_DIVERGENCE_ANCHORS,
      rateFloor: HIRING_LINE_RATE_FLOOR,
    },
    isMatrixHiring: rows.some((r) => r.matrixHire),
    inertNote: rows.some((r) => r.declared)
      ? ''
      : 'No requisition in this scope declares a line plan. Nothing is asked of anybody and no figure below is a finding.',
    board,
    rows,
    method: HIRING_LINE_METHOD,
  };
}

/** How many things on this register need a human. Used for the panel badge. */
export function hiringLineAttentionCount(report) {
  if (!report || !report.board) return 0;
  const v = report.board.verdicts;
  return v['line-unasked'] + v['line-silent'] + v.unreadable + v.divergent + report.board.driftedN;
}

export function hiringLineBriefText(report) {
  const b = report.board;
  const rate = b.everyLineHeardPermille === null
    ? b.rateWithheldReason
    : `${b.everyLineHeardN} of ${b.testedN} tested candidate(s) had every declared line heard (${b.everyLineHeardPermille}‰${b.permilleRemainder ? ', truncated' : ''}).`;
  return [
    `Co-hiring line corroboration — ${report.generatedOn} — ${report.scopeLabel}.`,
    `${b.requisitionsReadN} requisition(s) read: ${b.declaredN} declare the reporting lines the hire will hold, ${b.undeclaredN} do not.`,
    `${b.candidatesReadN} decision-stage candidate(s): ${b.verdicts.corroborated} corroborated, ${b.verdicts.divergent} divergent, ${b.verdicts['line-represented']} represented only, ${b.verdicts['line-silent']} with a silent line, ${b.verdicts['line-unasked']} with a line never asked, ${b.verdicts.unreadable} unreadable, ${b.verdicts.undeclared} undeclared, ${b.verdicts['single-line-heard']} single-line heard. Verdicts ${b.verdictsReconcile ? 'reconcile' : 'DO NOT reconcile'} to the candidate total; line states ${b.linesReconcile ? 'reconcile' : 'DO NOT reconcile'} to ${b.linePairsN} (candidate, line) pair(s).`,
    `${b.homeOnlyLoopN} home-line-only loop(s); ${b.offersExposedN} offer(s) resting on fewer judgements than the plan declared; ${b.ambiguousSignalN} signal(s) from interviewers under more than one declared line, credited to none.`,
    rate,
    `${b.hiresReadN} completed hire(s) with a plan: ${b.realisedN} hold the declared lines, ${b.driftedN} drifted, ${b.hiresUnreadableN} cannot be read. ${b.openAsksN} open ask(s) from ${report.ruleId}.`,
  ].join('\n');
}

/** One identity-free summary row. A withheld figure is BLANK, never zero. */
export function hiringLineCsvRows(report) {
  const b = report.board;
  const row = {
    row_type: 'summary',
    generated_on: report.generatedOn,
    scope: report.seat.fullAccess ? 'workspace' : 'seat-span',
    requisitions_read: b.requisitionsReadN,
    requisitions_declared: b.declaredN,
    requisitions_undeclared: b.undeclaredN,
    requisitions_cancelled_not_read: b.cancelledN,
    candidates_read: b.candidatesReadN,
    verdict_undeclared: b.verdicts.undeclared,
    verdict_unreadable: b.verdicts.unreadable,
    verdict_line_unasked: b.verdicts['line-unasked'],
    verdict_line_silent: b.verdicts['line-silent'],
    verdict_line_represented: b.verdicts['line-represented'],
    verdict_divergent: b.verdicts.divergent,
    verdict_corroborated: b.verdicts.corroborated,
    verdict_single_line_heard: b.verdicts['single-line-heard'],
    verdicts_reconcile: b.verdictsReconcile ? 'yes' : 'no',
    line_pairs: b.linePairsN,
    lines_heard: b.lines.heard,
    lines_represented: b.lines.represented,
    lines_silent: b.lines.silent,
    lines_unasked: b.lines.unasked,
    lines_unreadable: b.lines.unreadable,
    lines_reconcile: b.linesReconcile ? 'yes' : 'no',
    home_line_only_loops: b.homeOnlyLoopN,
    ambiguous_signals: b.ambiguousSignalN,
    offers_exposed: b.offersExposedN,
    tested: b.testedN,
    every_line_heard: b.everyLineHeardN,
    every_line_heard_permille: b.everyLineHeardPermille === null ? '' : b.everyLineHeardPermille,
    permille_remainder_flag: b.everyLineHeardPermille === null ? '' : (b.permilleRemainder ? 'truncated' : 'exact'),
    rate_withheld_reason: b.rateWithheldReason,
    hires_read: b.hiresReadN,
    hires_realised: b.realisedN,
    hires_drifted: b.driftedN,
    hires_unreadable: b.hiresUnreadableN,
    open_asks: b.openAsksN,
    divergence_anchors: report.conventions.divergenceAnchors,
    rate_floor: report.conventions.rateFloor,
  };
  return [Object.fromEntries(HIRING_LINE_CSV_COLUMNS.map((key) => [key, row[key]]))];
}
