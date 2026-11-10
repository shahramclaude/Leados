/**
 * app/core/domain/lineReaffirmation.js — the Matrix Line Re-Affirmation Register
 * (ADR-0157, Schema v129, `RULE-LRF-01`, `#/matrix?panel=renewal`, CSV #118).
 *
 * THE DUTY, IN AN OPERATOR'S WORDS. "Priya has held 40% of Sam since September
 * 2023. Priya's project finished in 2024. The share is still charged to Sam
 * every single day, because a declaration stands until somebody ends it — and
 * nobody ever put the question back to either of them. I cannot tell my own
 * leadership team which of Sam's commitments anyone has actually agreed to
 * today."
 *
 * WHAT THIS MODULE BUILDS
 * -----------------------
 * One bounded read model over the answers the workspace stores, in the shape
 * ADR-0148 gave the first answer: a declared line has a TERM, both sides answer
 * inside it, and **the answer can end it**. Everything printed is derived on
 * read from dated acts plus the live matrix. Nothing derived is stored.
 *
 *   line side    the manager who holds the line RE-AFFIRMS it (at the current
 *                share, for a term they state) or RELEASES it with a reason.
 *   person side  the person whose hours it takes ACCEPTS it, or OBJECTS.
 *
 * THREE THINGS THIS MODULE WILL NEVER DO, AND WHY EACH IS LOAD-BEARING
 * -------------------------------------------------------------------
 * 1. It never renews by arithmetic. A lapsed term is not extended because the
 *    work continued; no engine writes an extension. `term-lapsed` stays printed
 *    beside the still-charged share until a human answers.
 * 2. It never reads an old answer as covering a new number. The share is stored
 *    WITH the answer, the live declaration is read on every render, and a line
 *    retuned since its re-affirmation reads `changed-share` with both numbers.
 * 3. It never ends a line. `release` records that the line decided its
 *    accountability ended, on a day, with a reason — and the ledger KEEPS
 *    CHARGING the share until a human dates the declaration out. Printing that
 *    difference is the point: an engine that ended lines would be silently
 *    removing accountability, and an engine that quietly subtracted a released
 *    share would be reporting a capacity that no declaration supports.
 *
 * The two totals on the board are the product, and they are exact integers:
 * `uncoveredShareH` (share still charged to people whose agreement does not
 * cover today) and `reaffirmedShareH` (share a line has re-affirmed inside a
 * live term). They are refused outright when any declared line has no
 * allocation, because a partial sum would understate the claim, and
 * `uncoveredH + reaffirmedH === declaredH` is printed as an identity rather than
 * a reassurance.
 *
 * Pure module: no DOM, no storage, no implicit clock.
 */

import { dayKey, daysBetween } from '../time.js';
import { activeSeat, buildSeats } from './seat.js';
import { buildMatrix, matrixLineScopeFor } from './matrix.js';
import { normalizeLineReaffirmationSettings } from './lineReaffirmationSchema.js';
import {
  LINE_REAFFIRMATION_ENGINE_VERSION,
  LINE_REAFFIRMATION_FULL_H,
  LINE_REAFFIRMATION_LIMITS,
  LINE_REAFFIRMATION_METHOD,
  LINE_REAFFIRMATION_STATES,
  LINE_REAFFIRMATION_STATE_LABELS,
  LINE_REAFFIRMATION_STATE_TONES,
  LINE_REAFFIRMATION_UNCOVERED_STATES,
  LINE_REAFFIRMATION_VERDICTS,
  lineReaffirmationVerdict,
} from './lineReaffirmationRegistry.js';

/* ------------------------------------------------------------ small helpers */

function dayOf(value) {
  const s = typeof value === 'string' ? value.trim().slice(0, 10) : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function nameOf(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

/** The later of two dated acts. Ties keep the stored order (array is dated). */
function latestAct(current, candidate) {
  if (!candidate) return current || null;
  if (!current) return candidate;
  if (candidate.decidedOn > current.decidedOn) return candidate;
  if (candidate.decidedOn < current.decidedOn) return current;
  return String(candidate.at || '') >= String(current.at || '') ? candidate : current;
}

/**
 * Every answer against one declaration, split by side, latest first. Answers
 * dated AFTER `today` are separated out: an answer that has not happened yet
 * must never be read as being in force, and it is counted rather than dropped.
 */
export function reaffirmationActsFor(acts, declarationId, today = null) {
  const out = { manager: null, person: null, history: [], futureN: 0 };
  for (const act of Array.isArray(acts) ? acts : []) {
    if (!act || act.declarationId !== declarationId) continue;
    out.history.push(act);
    if (today && act.decidedOn > today) { out.futureN += 1; continue; }
    if (act.side === 'manager') out.manager = latestAct(out.manager, act);
    else if (act.side === 'person') out.person = latestAct(out.person, act);
  }
  out.history.sort((a, b) => String(a.decidedOn).localeCompare(String(b.decidedOn)) || String(a.id).localeCompare(String(b.id)));
  return out;
}

/**
 * The derived state of ONE declared line. Never stored, so a line cannot print a
 * term the answers do not contain.
 *
 * THE ORDER OF THESE TESTS IS THE PRECEDENCE, and it is the same order the
 * registry lists its verdicts in, so the rule, the panel, the brief and the CSV
 * cannot disagree about which word a line gets.
 *
 * The one subtle rule, carried from ADR-0148 and load-bearing again here: a
 * re-affirmation stores the share it was given for. A line that has been retuned
 * since reads `changed-share` — consent to 40% is not consent to 90%, and the
 * register prints both numbers instead of inheriting the larger one.
 */
export function lineReaffirmationState({
  managerAct = null,
  personAct = null,
  today,
  currentSharePct = null,
  warnDays = 0,
  futureN = 0,
} = {}) {
  const declaredSharePct = Number.isInteger(currentSharePct) ? currentSharePct : null;

  // 1. THE LINE RELEASED THE COMMITMENT. Nothing below can override a stated
  //    decision; a later re-affirmation would be the latest manager act and would
  //    therefore not reach here.
  if (managerAct && managerAct.outcome === 'release') {
    return {
      state: LINE_REAFFIRMATION_STATES.released,
      reason: `The line released this commitment on ${managerAct.decidedOn} with a stated reason. The declared share is still charged because the declaration itself was never dated out.`,
      termEndsOn: null,
      termDaysRemaining: null,
      inWarnWindow: false,
      covered: false,
    };
  }

  // 2. NOBODY HAS EVER GIVEN THIS LINE A TERM.
  if (!managerAct) {
    return {
      state: LINE_REAFFIRMATION_STATES.noTerm,
      reason: futureN
        ? 'No re-affirmation is in force for this line; the answers recorded against it are dated in the future and are counted, not read.'
        : 'No re-affirmation has ever been recorded against this line, and the declaration carries no term of its own. The share is inherited every day nobody asks.',
      termEndsOn: null,
      termDaysRemaining: null,
      inWarnWindow: false,
      covered: false,
    };
  }

  // 3. THE TERM WAS SET FOR A SHARE THE LINE NO LONGER CARRIES.
  const answeredSharePct = Number.isInteger(managerAct.sharePct) ? managerAct.sharePct : null;
  if (answeredSharePct !== declaredSharePct) {
    return {
      state: LINE_REAFFIRMATION_STATES.changed,
      reason: `Re-affirmed at ${answeredSharePct === null ? 'an undeclared share' : `${answeredSharePct}%`} on ${managerAct.decidedOn}; the line now declares ${declaredSharePct === null ? 'no share' : `${declaredSharePct}%`}. Agreeing to one number is not agreeing to another.`,
      termEndsOn: managerAct.termEndsOn || null,
      termDaysRemaining: managerAct.termEndsOn ? daysBetween(today, managerAct.termEndsOn) : null,
      inWarnWindow: false,
      covered: false,
    };
  }

  // 4. THE TERM IS DATED OUT, OR HAS RUN OUT.
  const termDaysRemaining = managerAct.termEndsOn ? daysBetween(today, managerAct.termEndsOn) : null;
  if (termDaysRemaining === null || termDaysRemaining < 0) {
    return {
      state: LINE_REAFFIRMATION_STATES.lapsed,
      reason: `Re-affirmed on ${managerAct.decidedOn} for a term ending ${managerAct.termEndsOn || 'on an undeclared date'}; that term has closed. The share is still charged and nobody has renewed it.`,
      termEndsOn: managerAct.termEndsOn || null,
      termDaysRemaining,
      inWarnWindow: false,
      covered: false,
    };
  }

  // 5. THE PERSON SAID NO. Checked before the warning window: an objection is a
  //    louder fact than a date approaching.
  const personInThisTerm = personAct && personAct.decidedOn >= managerAct.decidedOn ? personAct : null;
  if (personInThisTerm && personInThisTerm.outcome === 'object') {
    return {
      state: LINE_REAFFIRMATION_STATES.objected,
      reason: `The person whose hours this share is taken from objected on ${personInThisTerm.decidedOn}, in their own words. The line re-affirmed on ${managerAct.decidedOn}. The share is still charged and the disagreement is on the record.`,
      termEndsOn: managerAct.termEndsOn,
      termDaysRemaining,
      inWarnWindow: termDaysRemaining <= warnDays,
      covered: false,
    };
  }

  // 6. INSIDE THE WARNING WINDOW: still in term, and the question is open.
  if (termDaysRemaining <= warnDays) {
    return {
      state: LINE_REAFFIRMATION_STATES.due,
      reason: `The re-affirmed term ends ${managerAct.termEndsOn} (${termDaysRemaining} day(s)). It still covers today, and the question of what happens next is open now rather than on the day the share stops being agreed.`,
      termEndsOn: managerAct.termEndsOn,
      termDaysRemaining,
      inWarnWindow: true,
      covered: true,
    };
  }

  // 7. IN TERM BUT THE PERSON HAS NOT ANSWERED THIS TERM.
  if (!personInThisTerm) {
    return {
      state: LINE_REAFFIRMATION_STATES.awaitingPerson,
      reason: `The line re-affirmed this commitment on ${managerAct.decidedOn} for a term ending ${managerAct.termEndsOn}; the person whose hours it takes has not answered since. One side is not both sides.`,
      termEndsOn: managerAct.termEndsOn,
      termDaysRemaining,
      inWarnWindow: false,
      covered: true,
    };
  }

  // 8. BOTH SIDES ANSWERED INSIDE THE SAME TERM.
  return {
    state: LINE_REAFFIRMATION_STATES.inTerm,
    reason: `Re-affirmed by the line on ${managerAct.decidedOn} for ${declaredSharePct === null ? 'an undeclared share' : `${declaredSharePct}%`} until ${managerAct.termEndsOn}, and accepted by the person on ${personInThisTerm.decidedOn}.`,
    termEndsOn: managerAct.termEndsOn,
    termDaysRemaining,
    inWarnWindow: false,
    covered: true,
  };
}

/* --------------------------------------------------------------- the report */

function personRows(matrix, personId, acts, { today, conv, declarationsById }) {
  const lines = (matrix.linesByPerson?.get?.(personId) || []).filter((l) => l && l.role !== 'primary');
  const home = (matrix.linesByPerson?.get?.(personId) || []).find((l) => l && l.role === 'primary') || null;
  const rows = lines.map((line) => {
    const declarationId = line.declarationId || line.id;
    const answer = reaffirmationActsFor(acts, declarationId, today);
    const sharePct = Number.isInteger(line.shareH) ? line.shareH : null;
    const derived = lineReaffirmationState({
      managerAct: answer.manager,
      personAct: answer.person,
      today,
      currentSharePct: sharePct,
      warnDays: conv.lineReaffirmWarnDays,
      futureN: answer.futureN,
    });
    const raw = declarationsById.get(declarationId) || null;
    const questionsFrom = dayOf(raw?.declaredAt) || dayOf(raw?.fromISO) || dayOf(line.fromISO) || null;
    const personInThisTerm = answer.person && answer.manager && answer.person.decidedOn >= answer.manager.decidedOn
      ? answer.person
      : null;
    return {
      declarationId,
      lineId: line.id,
      personId,
      personName: nameOf(matrix.nodes?.get?.(personId)?.name, personId),
      managerId: line.managerId,
      managerName: nameOf(matrix.nodes?.get?.(line.managerId)?.name, line.managerId),
      managerAltitude: matrix.nodes?.get?.(line.managerId)?.altitude || null,
      kind: line.kind,
      role: line.role,
      rights: Array.isArray(line.rights) ? [...line.rights] : [],
      fromISO: dayOf(line.fromISO),
      toISO: dayOf(line.toISO),
      sharePct,
      shareDeclared: sharePct !== null,
      shareDisplay: sharePct === null ? 'undeclared' : `${sharePct}%`,
      note: typeof line.note === 'string' ? line.note : '',
      state: derived.state,
      stateLabel: LINE_REAFFIRMATION_STATE_LABELS[derived.state] || derived.state,
      tone: LINE_REAFFIRMATION_STATE_TONES[derived.state] || 'neutral',
      reason: derived.reason,
      covered: derived.covered,
      termEndsOn: derived.termEndsOn,
      termDaysRemaining: derived.termDaysRemaining,
      inWarnWindow: derived.inWarnWindow,
      // The manager's own answer, printed with the day it was given.
      lastAnsweredOn: answer.manager?.decidedOn || null,
      answeredSharePct: answer.manager?.outcome === 'reaffirm' && Number.isInteger(answer.manager.sharePct) ? answer.manager.sharePct : null,
      reaffirmationBasis: answer.manager?.outcome === 'reaffirm' ? answer.manager.basis || '' : '',
      answeredBySeatId: answer.manager?.decidedBySeatId || null,
      answerVia: answer.manager ? (answer.manager.via || 'operator') : null,
      releasedOn: answer.manager?.outcome === 'release' ? answer.manager.decidedOn : null,
      releaseReason: answer.manager?.outcome === 'release' ? answer.manager.reason : '',
      // The person's own answer inside the manager's current term — not one from
      // a previous term, which answered a question that has since been replaced.
      personAnsweredOn: personInThisTerm?.decidedOn || null,
      personOutcome: personInThisTerm?.outcome || null,
      personReason: personInThisTerm?.outcome === 'object' ? personInThisTerm.reason : '',
      personAnsweredBySeatId: personInThisTerm?.decidedBySeatId || null,
      personAnswerVia: personInThisTerm ? (personInThisTerm.via || 'operator') : null,
      // An answer dated in the future is counted, never read as in force.
      futureAnswerN: answer.futureN,
      actCount: answer.history.length,
      askedToAnswerOn: questionsFrom,
      daysSinceDeclared: questionsFrom ? Math.max(0, daysBetween(questionsFrom, today) ?? 0) : null,
      // A release is a decision; the charge is a fact the register prints beside it.
      chargedDespiteRelease: derived.state === LINE_REAFFIRMATION_STATES.released && sharePct !== null && sharePct > 0,
    };
  });
  rows.sort((a, b) => String(a.managerName).localeCompare(String(b.managerName)) || String(a.declarationId).localeCompare(String(b.declarationId)));

  const countOf = (state) => rows.filter((r) => r.state === state).length;
  const counts = {
    lines: rows.length,
    noTerm: countOf(LINE_REAFFIRMATION_STATES.noTerm),
    due: countOf(LINE_REAFFIRMATION_STATES.due),
    lapsed: countOf(LINE_REAFFIRMATION_STATES.lapsed),
    awaitingPerson: countOf(LINE_REAFFIRMATION_STATES.awaitingPerson),
    objected: countOf(LINE_REAFFIRMATION_STATES.objected),
    released: countOf(LINE_REAFFIRMATION_STATES.released),
    changed: countOf(LINE_REAFFIRMATION_STATES.changed),
    inTerm: countOf(LINE_REAFFIRMATION_STATES.inTerm),
    undeclared: rows.filter((r) => !r.shareDeclared).length,
    chargedDespiteRelease: rows.filter((r) => r.chargedDespiteRelease).length,
    futureAnswers: rows.reduce((acc, r) => acc + (r.futureAnswerN || 0), 0),
  };

  // INTEGER ARITHMETIC, ALL OR NOTHING. A partial sum across a person whose other
  // line has no declared share would understate the claim while looking complete,
  // so both totals are refused together with the reason.
  const allDeclared = counts.undeclared === 0;
  const uncoveredRows = rows.filter((r) => LINE_REAFFIRMATION_UNCOVERED_STATES.includes(r.state));
  const coveredRows = rows.filter((r) => r.covered);
  const declaredShareH = allDeclared ? rows.reduce((acc, r) => acc + (r.sharePct || 0), 0) : null;
  const uncoveredShareH = allDeclared ? uncoveredRows.reduce((acc, r) => acc + (r.sharePct || 0), 0) : null;
  const reaffirmedShareH = allDeclared ? coveredRows.reduce((acc, r) => acc + (r.sharePct || 0), 0) : null;
  const shareRefusedReason = allDeclared
    ? null
    : `${counts.undeclared} of this person's ${counts.lines} declared line(s) carry no allocation. A total over the declared lines only would understate the claim, so the total is refused rather than printed.`;

  const totals = {
    declaredShareH,
    uncoveredShareH,
    reaffirmedShareH,
    shareRefused: !allDeclared,
    shareRefusedReason,
    // THE IDENTITY: the two halves must be the whole. Printed, not assumed.
    reconciles: allDeclared
      ? (uncoveredShareH || 0) + (reaffirmedShareH || 0) === (declaredShareH || 0)
        && uncoveredRows.length + coveredRows.length === rows.length
      : null,
    overReaffirmed: reaffirmedShareH !== null && reaffirmedShareH > LINE_REAFFIRMATION_FULL_H,
    overReaffirmedH: reaffirmedShareH !== null ? reaffirmedShareH - LINE_REAFFIRMATION_FULL_H : null,
  };

  // PRECEDENCE BY DECLARED SEVERITY, not by a second hand-written ladder: the
  // worst open verdict the rows produce is the person's verdict, so the registry
  // is the only place a precedence can be stated.
  const candidates = new Set();
  if (!rows.length) candidates.add('single-line');
  if (counts.released) candidates.add('released');
  if (counts.objected) candidates.add('objected');
  if (counts.changed) candidates.add('changed-share');
  if (totals.overReaffirmed) candidates.add('over-term');
  if (counts.lapsed) candidates.add('lapsed');
  if (counts.due) candidates.add('due');
  if (counts.awaitingPerson) candidates.add('awaiting-person');
  if (counts.noTerm) candidates.add('no-term');
  if (rows.length && counts.inTerm === rows.length) candidates.add('in-term');
  if (!candidates.size) candidates.add('in-term');
  const worst = [...candidates]
    .map((key) => lineReaffirmationVerdict(key))
    .filter(Boolean)
    .sort((a, b) => a.severity - b.severity)[0] || lineReaffirmationVerdict('in-term');

  return {
    personId,
    personName: nameOf(matrix.nodes?.get?.(personId)?.name, personId),
    homeManagerId: home?.managerId || null,
    homeManagerName: home ? nameOf(matrix.nodes?.get?.(home.managerId)?.name, home.managerId) : null,
    rank: matrix.nodes?.get?.(personId)?.rank ?? null,
    altitude: matrix.nodes?.get?.(personId)?.altitude || null,
    lines: rows,
    counts,
    totals,
    verdict: worst.key,
    verdictLabel: worst.label,
    verdictTone: worst.tone,
    verdictOpen: worst.open,
    verdictReason: worst.detail,
    conventions: conv,
  };
}

function scopeFilter(state, matrix, now, settings) {
  const built = buildSeats(state, {
    now,
    settings,
    lineScope: matrixLineScopeFor(state, { now, settings }),
  });
  const seat = activeSeat(built);
  if (seat.fullAccess) return { seat, visible: () => true, scopeLabel: 'the whole workspace' };
  const inTree = (personId) => Boolean(seat.scope?.has?.(personId));
  const inLines = (personId) => Boolean(seat.lineScope?.has?.(personId));
  return {
    seat,
    visible: (personId) => personId === seat.id || inTree(personId) || inLines(personId),
    scopeLabel: `${seat.label || seat.id}’s span and its declared lines`,
  };
}

/**
 * The whole register. Built under the acting seat: a scoped seat sees the people
 * it already reaches on the tree or a declared line, and the rest are COUNTED as
 * withheld — never silently dropped, and never widened sideways.
 */
export function buildLineReaffirmation(state = {}, { now = new Date(), settings = null } = {}) {
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const today = dayKey(at) || new Date().toISOString().slice(0, 10);
  const cfg = settings || state.settings || {};
  const conv = normalizeLineReaffirmationSettings(cfg);
  const matrix = buildMatrix(state, { now: at, settings: cfg });
  const acts = Array.isArray(state.lineReaffirmations) ? state.lineReaffirmations : [];
  const declarations = Array.isArray(state.reportingLines) ? state.reportingLines : [];
  const declarationsById = new Map(declarations.filter((d) => d && d.id).map((d) => [d.id, d]));
  const { seat, visible, scopeLabel } = scopeFilter(state, matrix, at, cfg);

  const multiLineIds = [...(matrix.linesByPerson?.keys?.() || [])]
    .filter((personId) => (matrix.linesByPerson.get(personId) || []).some((l) => l && l.role !== 'primary'));
  multiLineIds.sort((a, b) => String(a).localeCompare(String(b)));

  const persons = [];
  let withheldN = 0;
  for (const personId of multiLineIds) {
    if (!visible(personId)) { withheldN += 1; continue; }
    persons.push(personRows(matrix, personId, acts, { today, conv, declarationsById }));
  }
  persons.sort((a, b) => {
    const sa = lineReaffirmationVerdict(a.verdict)?.severity ?? 9;
    const sb = lineReaffirmationVerdict(b.verdict)?.severity ?? 9;
    if (sa !== sb) return sa - sb;
    return String(a.personName).localeCompare(String(b.personName));
  });

  const sumOrRefuse = (key) => {
    const refused = persons.filter((p) => p.totals.shareRefused);
    if (refused.length) {
      return {
        value: null,
        refused: true,
        reason: `${refused.length} person(s) in scope carry a declared line with no allocation. A workspace total over the rest would understate the claim, so it is refused.`,
      };
    }
    return { value: persons.reduce((acc, p) => acc + (p.totals[key] || 0), 0), refused: false, reason: null };
  };

  const declared = sumOrRefuse('declaredShareH');
  const uncovered = sumOrRefuse('uncoveredShareH');
  const reaffirmed = sumOrRefuse('reaffirmedShareH');

  const stateCount = (key) => persons.reduce((acc, p) => acc + (p.counts[key] || 0), 0);

  const board = {
    peopleN: persons.length,
    linesN: stateCount('lines'),
    noTermN: stateCount('noTerm'),
    dueN: stateCount('due'),
    lapsedN: stateCount('lapsed'),
    awaitingPersonN: stateCount('awaitingPerson'),
    objectedN: stateCount('objected'),
    releasedN: stateCount('released'),
    changedN: stateCount('changed'),
    inTermN: stateCount('inTerm'),
    chargedDespiteReleaseN: stateCount('chargedDespiteRelease'),
    futureAnswerN: stateCount('futureAnswers'),
    personsUncoveredN: persons.filter((p) => (p.totals.uncoveredShareH || 0) > 0).length,
    personsOverReaffirmedN: persons.filter((p) => p.totals.overReaffirmed).length,
    personsUndeclaredN: persons.filter((p) => p.totals.shareRefused).length,
    personsInTermN: persons.filter((p) => p.verdict === 'in-term').length,
    withheldN,
    declaredShareH: declared.value,
    uncoveredShareH: uncovered.value,
    reaffirmedShareH: reaffirmed.value,
    sharesRefused: declared.refused,
    sharesRefusedReason: declared.reason,
    // Every printed state count must add to the printed line count. Printed as a
    // claim so a reader does not have to trust it, and computed from the same
    // eight counters the row set produced.
    countsReconcile: ['noTerm', 'due', 'lapsed', 'awaitingPerson', 'objected', 'released', 'changed', 'inTerm']
      .reduce((acc, key) => acc + stateCount(key), 0) === stateCount('lines'),
  };

  return {
    engineVersion: LINE_REAFFIRMATION_ENGINE_VERSION,
    generatedOn: today,
    conventions: conv,
    isMatrix: persons.length > 0 || withheldN > 0,
    seat: { id: seat.id, label: seat.label || seat.id, rank: seat.rank ?? null, fullAccess: Boolean(seat.fullAccess) },
    scopeLabel,
    method: LINE_REAFFIRMATION_METHOD,
    verdicts: LINE_REAFFIRMATION_VERDICTS,
    persons,
    board,
    queue: persons.filter((p) => p.verdictOpen).slice(0, LINE_REAFFIRMATION_LIMITS.rows),
    singleChainNote: persons.length
      ? null
      : 'No person in scope reports to more than one manager, so there is no second share to call back. A single-chain workspace gains no row, no ask and no change.',
  };
}

/** The identity-free brief. Counts only: no person, no manager, no declaration. */
export function lineReaffirmationBriefText(report) {
  if (!report) return '';
  const b = report.board;
  const lines = [];
  lines.push(`Matrix line re-affirmation — read from ${report.scopeLabel} on ${report.generatedOn}.`);
  if (!report.isMatrix) {
    lines.push('No person in scope holds a second reporting line; nothing in this workspace has a term to re-affirm.');
    return lines.join(' ');
  }
  lines.push(`${b.peopleN} person(s) hold ${b.linesN} declared line(s): ${b.inTermN} in term with both sides answered, ${b.awaitingPersonN} re-affirmed but unanswered by the person, ${b.dueN} inside their warning window, ${b.lapsedN} with a term that ran out, ${b.noTermN} with no term ever declared, ${b.changedN} re-affirmed at a different share, ${b.objectedN} objected to by the person, and ${b.releasedN} released by the line.`);
  if (b.sharesRefused) {
    lines.push(`Share totals are refused: ${b.sharesRefusedReason}`);
  } else {
    lines.push(`${b.declaredShareH}% of a person is declared across these lines; ${b.reaffirmedShareH}% is covered by a live re-affirmed term and ${b.uncoveredShareH}% is charged to a commitment no live answer covers.`);
  }
  if (b.chargedDespiteReleaseN) lines.push(`${b.chargedDespiteReleaseN} released line(s) are still charged because the declaration was never dated out.`);
  if (b.personsOverReaffirmedN) lines.push(`${b.personsOverReaffirmedN} person(s) have had more than 100% of themselves re-affirmed.`);
  if (b.futureAnswerN) lines.push(`${b.futureAnswerN} answer(s) are dated in the future and are counted, not read as in force.`);
  if (b.withheldN) lines.push(`${b.withheldN} person(s) on a second line sit outside this seat and are counted, not shown.`);
  return lines.join(' ');
}

/**
 * CSV scope #118 — aggregate only. One summary row plus one row per declared
 * line kind. No person, no name, no declaration id, no free text. A refused
 * share is a BLANK cell with the reason in its own column, never a zero.
 */
export function lineReaffirmationCsvRows(report) {
  if (!report) return [];
  const b = report.board;
  const blank = (v) => (v === null || v === undefined ? '' : String(v));
  const rows = [{
    row_kind: 'workspace',
    line_kind: '',
    lines_n: blank(b.linesN),
    no_term_n: blank(b.noTermN),
    due_n: blank(b.dueN),
    lapsed_n: blank(b.lapsedN),
    awaiting_person_n: blank(b.awaitingPersonN),
    objected_n: blank(b.objectedN),
    released_n: blank(b.releasedN),
    changed_share_n: blank(b.changedN),
    in_term_n: blank(b.inTermN),
    uncovered_share_h: blank(b.uncoveredShareH),
    reaffirmed_share_h: blank(b.reaffirmedShareH),
    persons_n: blank(b.peopleN),
    persons_uncovered_n: blank(b.personsUncoveredN),
    share_refused: b.sharesRefused ? 'true' : 'false',
    share_refused_reason: b.sharesRefused ? b.sharesRefusedReason || '' : '',
  }];

  const kinds = new Map();
  for (const person of report.persons) {
    for (const line of person.lines) {
      const key = line.kind || 'undeclared';
      if (!kinds.has(key)) {
        kinds.set(key, {
          kind: key, lines: 0, noTerm: 0, due: 0, lapsed: 0, awaitingPerson: 0,
          objected: 0, released: 0, changed: 0, inTerm: 0, uncoveredH: 0, reaffirmedH: 0, undeclared: 0,
        });
      }
      const acc = kinds.get(key);
      acc.lines += 1;
      if (line.state === LINE_REAFFIRMATION_STATES.noTerm) acc.noTerm += 1;
      else if (line.state === LINE_REAFFIRMATION_STATES.due) acc.due += 1;
      else if (line.state === LINE_REAFFIRMATION_STATES.lapsed) acc.lapsed += 1;
      else if (line.state === LINE_REAFFIRMATION_STATES.awaitingPerson) acc.awaitingPerson += 1;
      else if (line.state === LINE_REAFFIRMATION_STATES.objected) acc.objected += 1;
      else if (line.state === LINE_REAFFIRMATION_STATES.released) acc.released += 1;
      else if (line.state === LINE_REAFFIRMATION_STATES.changed) acc.changed += 1;
      else if (line.state === LINE_REAFFIRMATION_STATES.inTerm) acc.inTerm += 1;
      if (line.sharePct === null) acc.undeclared += 1;
      else if (line.covered) acc.reaffirmedH += line.sharePct;
      else acc.uncoveredH += line.sharePct;
    }
  }

  for (const acc of [...kinds.values()].sort((a, b) => String(a.kind).localeCompare(String(b.kind)))) {
    const refused = acc.undeclared > 0;
    rows.push({
      row_kind: 'line-kind',
      line_kind: acc.kind,
      lines_n: blank(acc.lines),
      no_term_n: blank(acc.noTerm),
      due_n: blank(acc.due),
      lapsed_n: blank(acc.lapsed),
      awaiting_person_n: blank(acc.awaitingPerson),
      objected_n: blank(acc.objected),
      released_n: blank(acc.released),
      changed_share_n: blank(acc.changed),
      in_term_n: blank(acc.inTerm),
      uncovered_share_h: refused ? '' : blank(acc.uncoveredH),
      reaffirmed_share_h: refused ? '' : blank(acc.reaffirmedH),
      persons_n: '',
      persons_uncovered_n: '',
      share_refused: refused ? 'true' : 'false',
      share_refused_reason: refused
        ? `${acc.undeclared} line(s) of this kind carry no allocation, so the kind's share total is refused rather than printed over a part.`
        : '',
    });
  }
  return rows;
}

/** Rows that need a human next, worst first. Used by the panel's queue. */
export function lineReaffirmationAttentionCount(state, { now = new Date(), settings = null } = {}) {
  const report = buildLineReaffirmation(state, { now, settings });
  return report.persons.filter((p) => p.verdictOpen).length;
}
