/**
 * app/core/domain/vy.js — pure read model for the Vroom–Yetton–Jago
 * Decision-Participation Selector (ADR-0230, Schema v183, `RULE-VY-01`,
 * CSV scope #171, `#/vroom-yetton`).
 *
 * ONE READER stands behind every count, style, verdict and figure on the
 * `#/vroom-yetton` panel and its CSV. Nothing here computes a sum, a state or
 * a recommendation of its own: everything is derived from the stored
 * decisions, answers and style records through the normalizers, then printed.
 *
 * Pure module: no storage, no clock injection beyond `now`, no DOM. The
 * reader never mutates its input.
 */

import {
  VY_LIMITS as L,
  VY_QUESTION_KEYS,
  VY_PER_LINE_KEYS,
  VY_SOLO_DIAGNOSTICS,
  VY_OR_DIAGNOSTICS,
  VY_STYLE_KEYS,
  VY_TREE_KEYS,
  VY_STYLES,
  VY_VERDICTS,
  VY_STATES,
  VY_RIGHTS,
  VY_DECIDE_ALONE_STYLES,
  vyQuestion,
  vyStyle,
  vyVerdict,
  vyRecommendStyle,
  vyCombinePerLineAnswers,
  vyDecidesAlone,
} from './vyRegistry.js';

const EMPTY_ANSWERS = Object.freeze({});

/**
 * Look up a single diagnostic answer for a decision under a given line seat.
 * Solo diagnostics (q1, q3, q4) are stored without a lineId; per-line
 * diagnostics (q2, q5, q6, q7) are stored with a lineId.
 */
function findAnswer(answers, decisionId, lineId, key) {
  for (const ans of answers) {
    if (ans.decisionId !== decisionId) continue;
    if (vyIsPerLine(key)) {
      if (ans.lineId === lineId && ans.answers[key] !== undefined) return ans.answers[key];
    } else {
      if (!ans.lineId && ans.answers[key] !== undefined) return ans.answers[key];
    }
  }
  return undefined;
}

/**
 * All answers recorded for a decision, grouped by line (solo diagnostics live
 * under the null line key).
 */
function answersByLine(answers, decisionId) {
  const byLine = {};
  for (const ans of answers) {
    if (ans.decisionId !== decisionId) continue;
    const lineKey = ans.lineId || null;
    if (!byLine[lineKey]) byLine[lineKey] = {};
    for (const [key, value] of Object.entries(ans.answers)) {
      byLine[lineKey][key] = value;
    }
  }
  return byLine;
}

/**
 * The combined answer set for a decision: solo diagnostics require agreement
 * across lines (any no ⇒ no), per-line diagnostics are OR-combined (any yes ⇒
 * yes). Solo answers recorded without a line are the base; per-line answers
 * are merged on top. Returns null when no answers exist at all.
 */
function combinedAnswers(answers, decisionId, lineIds) {
  const byLine = answersByLine(answers, decisionId);
  if (!lineIds.length && Object.keys(byLine).length === 0) return null;

  // Solo answers recorded once per decision (no line).
  const soloLine = byLine[null] || {};

  // Per-line answers: only the lines this decision touches.
  const relevant = {};
  for (const lineId of lineIds) {
    if (byLine[lineId]) relevant[lineId] = byLine[lineId];
  }

  // No answers at all — not even a solo declaration.
  if (Object.keys(soloLine).length === 0 && Object.keys(relevant).length === 0) return null;

  const combined = { ...soloLine };

  // Solo diagnostics: require agreement — if any line answers no, combined is no.
  for (const key of VY_SOLO_DIAGNOSTICS) {
    if (Object.prototype.hasOwnProperty.call(soloLine, key)) continue; // solo answer already set
    let agreed = true;
    for (const lineId of Object.keys(relevant)) {
      const val = relevant[lineId][key];
      if (val === false) { agreed = false; break; }
    }
    // Only set if every line agrees yes (or there are no per-line answers at all).
    if (agreed && Object.keys(relevant).length > 0) {
      combined[key] = true;
    }
  }

  // Per-line diagnostics: OR-combined — any yes wins.
  for (const key of VY_PER_LINE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(soloLine, key)) continue; // solo answers shouldn't carry per-line keys
    let anyYes = false;
    for (const lineId of Object.keys(relevant)) {
      if (relevant[lineId][key] === true) { anyYes = true; break; }
    }
    combined[key] = anyYes;
  }

  return combined;
}

/**
 * Whether another line (not `seatId`) holds a decision right over any part of
 * this decision, decided by whether any line the decision touches has answers
 * recorded under a seat that is not this seat. The reader cannot see the
 * decision-rights registry here; it uses the proxy that any per-line answer
 * under another seat signals that line's interest and thus its right.
 */
function decideAloneUnavailableForSeat(decisions, answers, styleRecords, decisionId, seatId) {
  const decision = decisions.find((d) => d.id === decisionId);
  if (!decision) return false;
  const lineIds = decision.lineIds;
  if (!lineIds.length) return false;
  // Any line with an answer recorded under a seat other than `seatId` means
  // that line has a participant whose commitment matters — decide-alone is
  // not the seat's to claim unilaterally.
  for (const ans of answers) {
    if (ans.decisionId !== decisionId) continue;
    if (!ans.lineId) continue;
    if (ans.answeredById !== seatId) return true;
  }
  // Also: a style record by another seat means they have already selected.
  for (const sr of styleRecords) {
    if (sr.decisionId !== decisionId) continue;
    if (sr.actorId !== seatId) return true;
  }
  return false;
}

/**
 * Build the full Vroom–Yetton read model.
 *
 * @param state - the governed workspace state
 * @param {Object} opts - { now, settings, seat }
 *   - `now`: current date (ISO day string)
 *   - `settings`: workspace settings (vyAutoPropagate switch)
 *   - `seat`: the operating seat (null for aggregate-only reading)
 * @returns {Object} { ok, engine, rule, asOf, matrixError, warnings, withheldN,
 *   counts, byTreeVariant, rows, visibleRows, totalsReconcile, figuresComplete }
 */
export function buildVroomYetton(state, { now = null, settings = {}, seat = null } = {}) {
  const warnings = [];
  const asOf = now || (typeof state?.now === 'string' ? state.now : new Date().toISOString().slice(0, 10));

  const decisions = Array.isArray(state?.vyDecisions) ? state.vyDecisions : [];
  const answers = Array.isArray(state?.vyAnswers) ? state.vyAnswers : [];
  const styleRecords = Array.isArray(state?.vyStyleRecords) ? state.vyStyleRecords : [];

  const knownDecisionIds = new Set(decisions.map((d) => d.id));
  const byDecision = new Map();
  for (const d of decisions) byDecision.set(d.id, d);

  const answersByDecision = new Map();
  for (const ans of answers) {
    if (!knownDecisionIds.has(ans.decisionId)) continue;
    if (!answersByDecision.has(ans.decisionId)) answersByDecision.set(ans.decisionId, []);
    answersByDecision.get(ans.decisionId).push(ans);
  }

  const styleByDecision = new Map();
  for (const sr of styleRecords) {
    if (!knownDecisionIds.has(sr.decisionId)) continue;
    styleByDecision.set(sr.decisionId, sr);
  }

  /** Build one row per decision. */
  const rows = [];
  for (const decision of decisions) {
    const decisionId = decision.id;
    const decisionAnswers = answersByDecision.get(decisionId) || [];
    const lineIds = decision.lineIds;

    const combined = combinedAnswers(decisionAnswers, decisionId, lineIds);
    const hasAnswers = combined !== null;

    // Per-line answer count and line conflict detection.
    const lineAnswers = {};
    let lineConflict = false;
    for (const ans of decisionAnswers) {
      if (!ans.lineId) continue;
      lineAnswers[ans.lineId] = lineAnswers[ans.lineId] || 0;
      lineAnswers[ans.lineId] += 1;
    }
    const lineCount = Object.keys(lineAnswers).length;

    // Decide-alone unavailable for this seat when another line has answers.
    const aloneUnavailable = seat && decideAloneUnavailableForSeat(decisions, answers, styleRecords, decisionId, seat.id);

    // Recommended style per tree variant.
    const recommended = {};
    for (const variant of VY_TREE_KEYS) {
      recommended[variant] = combined ? vyRecommendStyle(variant, combined) : null;
    }

    // Selected style.
    const styleRecord = styleByDecision.get(decisionId);
    const chosenStyle = styleRecord ? styleRecord.chosenStyle : null;
    const override = styleRecord && styleRecord.overrideReason
      ? { reason: styleRecord.overrideReason, at: styleRecord.at, actor: styleRecord.actorId }
      : null;

    // Verdict precedence: withdrawn first, then owed, then selected.
    let verdictKey;
    if (decision.withdrawnOn) {
      verdictKey = 'withdrawn';
    } else if (!hasAnswers) {
      verdictKey = 'decision-owed';
    } else if (!chosenStyle) {
      verdictKey = 'decision-owed';
    } else if (override) {
      verdictKey = 'selected-override';
    } else {
      verdictKey = 'selected';
    }
    const verdict = vyVerdict(verdictKey);

    // Flags.
    const flags = [];
    if (override) flags.push('recommendation-overridden');
    if (lineConflict) flags.push('line-conflict');
    if (aloneUnavailable) flags.push('decide-alone-unavailable');

    rows.push({
      id: decisionId,
      title: decision.title,
      question: decision.question,
      declaredById: decision.declaredById,
      declaredOn: decision.declaredOn,
      treeVariant: decision.treeVariant,
      lineIds,
      lineCount,
      withdrawnOn: decision.withdrawnOn,
      state: decision.withdrawnOn ? 'withdrawn' : hasAnswers ? (chosenStyle ? 'selected' : 'answered') : 'declared',
      answers: decisionAnswers.length,
      answersByLine: lineAnswers,
      combined,
      recommended,
      chosenStyle,
      recommendedStyle: styleRecord ? styleRecord.recommendedStyle : null,
      override,
      verdict,
      flags,
      aloneUnavailable,
    });
  }

  // Counts.
  const byStyle = {};
  for (const key of VY_STYLE_KEYS) {
    byStyle[key] = rows.filter((r) => r.chosenStyle === key).length;
  }

  const counts = {
    total: rows.length,
    declared: rows.filter((r) => r.state === 'declared').length,
    answered: rows.filter((r) => r.state === 'answered').length,
    selected: rows.filter((r) => r.state === 'selected').length,
    decisionOwed: rows.filter((r) => r.state === 'declared' || r.state === 'answered').length,
    overridden: rows.filter((r) => Boolean(r.override)).length,
    withdrawn: rows.filter((r) => r.state === 'withdrawn').length,
    decideAloneUnavailable: rows.filter((r) => r.aloneUnavailable).length,
    byStyle,
  };

  // By tree variant.
  const byTreeVariant = {};
  for (const variant of VY_TREE_KEYS) {
    const variantRows = rows.filter((r) => r.treeVariant === variant);
    const selectedCounts = {};
    for (const key of VY_STYLE_KEYS) {
      selectedCounts[key] = variantRows.filter((r) => r.chosenStyle === key).length;
    }
    byTreeVariant[variant] = {
      decisions: variantRows.length,
      answered: variantRows.filter((r) => r.state === 'answered' || r.state === 'selected').length,
      selected: variantRows.filter((r) => r.state === 'selected').length,
      overrides: variantRows.filter((r) => Boolean(r.override)).length,
      byStyle: selectedCounts,
      decideAloneUnavailable: variantRows.filter((r) => r.aloneUnavailable).length,
    };
  }

  // Visibility: a seat sees decisions it declared, decisions whose lines it
  // holds, and decisions at or above its rank. Without a seat, everything is
  // aggregate-only (no person, no line).
  let visibleRows = rows;
  let withheldN = 0;
  if (seat) {
    const visible = [];
    for (const row of rows) {
      const declaresIt = row.declaredById === seat.id;
      const holdsLine = row.lineIds.some((lid) => (seat.lineIds || []).includes(lid));
      if (declaresIt || holdsLine || seat.rank >= 4) {
        visible.push(row);
      } else {
        withheldN += 1;
      }
    }
    visibleRows = visible;
  }

  const totalsReconcile = rows.length === counts.total;
  const figuresComplete = rows.every((r) => r.verdict.key !== 'unreadable');

  return {
    ok: true,
    engine: 'vroom-yetton',
    rule: 'RULE-VY-01',
    asOf,
    matrixError: null,
    warnings,
    withheldN,
    counts,
    byTreeVariant,
    rows,
    visibleRows,
    totalsReconcile,
    figuresComplete,
  };
}

/** Sourcing-style attention count: decisions owed a style selection. */
export function vyAttentionCount(state, { now = null, settings = {}, seat = null } = {}) {
  const report = buildVroomYetton(state, { now, settings, seat });
  return { count: report.counts.decisionOwed, reason: null };
}

/**
 * CSV scope #171 (ADR-0230, Schema v183). IDENTITY-FREE BY CONSTRUCTION.
 * The rows are built from the SAME reader the `#/vroom-yetton` panel renders,
 * with the seat cleared, so an exported figure is provably the figure that was
 * printed.
 *
 * What crosses this boundary: counts, states, verdicts, tree variant, per-style
 * counts, and the count of decisions where decide-alone is unavailable because
 * another line holds a right.
 * What never does: a decision title, a decision id, a person, a manager, a
 * line name, a rationale or a reason.
 *
 * A figure the reader cannot compute exports BLANK with its reason, never a
 * zero.
 */
export function vyCsvRows(report) {
  const rows = [];
  const blankReasonFor = (value, reason) => (value === null || value === undefined ? reason : '');

  rows.push({
    as_of: report.asOf,
    row_kind: 'summary',
    key: 'workspace',
    tree_variant: '',
    decisions_n: report.counts.total,
    answered_n: report.counts.answered,
    selected_n: report.counts.selected,
    override_n: report.counts.overridden,
    style_a1_n: report.counts.byStyle?.a1 || 0,
    style_a2_n: report.counts.byStyle?.a2 || 0,
    style_c1_n: report.counts.byStyle?.c1 || 0,
    style_c2_n: report.counts.byStyle?.c2 || 0,
    style_g2_n: report.counts.byStyle?.g2 || 0,
    decide_alone_unavailable_n: report.counts.decideAloneUnavailable || 0,
    verdict: '',
    blank_reason: report.matrixError ? 'the reporting graph could not be read' : '',
  });

  // One row per tree variant.
  for (const variant of Object.keys(report.byTreeVariant || {})) {
    const vt = report.byTreeVariant[variant];
    rows.push({
      as_of: report.asOf,
      row_kind: 'variant',
      key: variant,
      tree_variant: variant,
      decisions_n: vt.decisions,
      answered_n: vt.answered,
      selected_n: vt.selected,
      override_n: vt.overrides,
      style_a1_n: vt.byStyle?.a1 || 0,
      style_a2_n: vt.byStyle?.a2 || 0,
      style_c1_n: vt.byStyle?.c1 || 0,
      style_c2_n: vt.byStyle?.c2 || 0,
      style_g2_n: vt.byStyle?.g2 || 0,
      decide_alone_unavailable_n: vt.decideAloneUnavailable,
      verdict: '',
      blank_reason: '',
    });
  }

  // One row per selected style.
  for (const styleKey of Object.keys(report.counts.byStyle || {})) {
    rows.push({
      as_of: report.asOf,
      row_kind: 'style',
      key: styleKey,
      tree_variant: '',
      decisions_n: '',
      answered_n: '',
      selected_n: report.counts.byStyle[styleKey],
      override_n: '',
      style_a1_n: '',
      style_a2_n: '',
      style_c1_n: '',
      style_c2_n: '',
      style_g2_n: '',
      decide_alone_unavailable_n: '',
      verdict: '',
      blank_reason: '',
    });
  }

  // One row per verdict.
  for (const row of report.rows) {
    rows.push({
      as_of: report.asOf,
      row_kind: 'verdict',
      key: row.id,
      tree_variant: row.treeVariant,
      decisions_n: '',
      answered_n: '',
      selected_n: '',
      override_n: '',
      style_a1_n: '',
      style_a2_n: '',
      style_c1_n: '',
      style_c2_n: '',
      style_g2_n: '',
      decide_alone_unavailable_n: '',
      verdict: row.verdict.key,
      blank_reason: '',
    });
  }

  return rows;
}
