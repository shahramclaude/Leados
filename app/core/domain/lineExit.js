/**
 * app/core/domain/lineExit.js — the Matrix Line-Exit Obligation Register
 * (ADR-0152, Schema v127, `RULE-LEX-01`, `#/matrix?panel=exit`).
 *
 * THE DUTY, IN AN OPERATOR'S WORDS. "Priya's project line for Sam was dated out
 * on 31 March. The review input ask we sent her in February is still open, and
 * Sam never acknowledged the project onboarding brief. Nothing in the workspace
 * tells me whether those asks are still owed by anyone, or whether I am looking
 * at work that structurally cannot close."
 *
 * Every matrix module before this one reads the LIVE line set. A declaration is
 * dated out and all of that work keeps its addressee and its roll-up edge while
 * the line that justified it no longer exists: the person is chased about a job
 * they no longer hold, the manager carries an ask about a project that ended, and
 * a director reads an open-work figure that can never move.
 *
 * WHAT THIS MODULE BUILDS
 * -----------------------
 * One bounded read model over the open obligations the workspace ALREADY records
 * — the unacknowledged line onboarding brief (ADR-0150) and the unanswered review
 * input ask (ADR-0147) — matched against the declared lines that have actually
 * ended. Per ended line: the obligations it left behind, whose words they are,
 * whether the work each ask is about could have been owed on that line at all
 * (window arithmetic over two dated windows), how long each has been open, and
 * the ONE human act that settles it.
 *
 * WHAT IT REFUSES TO DO
 * ---------------------
 *  - Never re-point an obligation. A carry names a manager who holds a LIVE line
 *    for that person today; a retire records a reason. Neither edits the ask.
 *  - Never void by arithmetic. A work window entirely after the line ended is
 *    FLAGGED (`after`), not retired.
 *  - Never read silence as settlement, a missing end day as an end, or a deleted
 *    line as a settled one (`vanished`, counted, not dropped).
 *  - Never adjudicate the HOME line: `person.managerId` has a recorded history
 *    (ADR-0149) and home-keyed obligations are counted and handed there.
 *  - Never invent a line-consent obligation: the generated ask names a person and
 *    no line, so the join would be a guess. Printed, not guessed.
 *  - Never count a person twice: every total is a count of LINES or of
 *    OBLIGATIONS, and the distinct-person figure is printed separately.
 *
 * Pure module: no DOM, no storage, no implicit clock.
 */

import { addDays, dayKey, daysBetween } from '../time.js';
import { buildMatrix } from './matrix.js';
import { LEADER_ID } from './chain.js';
import { activePeople } from './people.js';
import { normalizeLineExitSettings } from './lineExitSchema.js';
import {
  LINE_EXIT_CSV_COLUMNS,
  LINE_EXIT_ENGINE_VERSION,
  LINE_EXIT_LIMITS,
  LINE_EXIT_LINE_VERDICT_KEYS,
  LINE_EXIT_METHOD,
  LINE_EXIT_SOURCES,
  LINE_EXIT_STATES,
  LINE_EXIT_STATE_KEYS,
  LINE_EXIT_STATE_LABELS,
  LINE_EXIT_STATE_TONES,
  LINE_EXIT_VERDICTS,
  LINE_EXIT_WINDOWS,
  LINE_EXIT_WINDOW_LABELS,
  lineExitLineVerdict,
  lineExitVerdict,
} from './lineExitRegistry.js';

/** The declared 30-60-90 horizon. A brief's work window is its plan's scope. */
const ONBOARDING_HORIZON_DAYS = 90;

const HOME_PREFIX = 'home:';

function dayOf(value) {
  const s = typeof value === 'string' ? value.trim().slice(0, 10) : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function nameOf(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function isHomeKey(lineKey) {
  return typeof lineKey === 'string' && lineKey.startsWith(HOME_PREFIX);
}

/* ------------------------------------------------------------ obligations */

/**
 * Every OPEN, line-keyed obligation the workspace already stores.
 *
 * Deliberately narrow: a source is read only when the stored record carries the
 * LINE KEY it was addressed to. A record that would have to be joined to a line
 * by inference is not read at all, and the panel prints which one and why.
 */
export function lineExitObligations(state = {}) {
  const out = [];

  /* 1. Unacknowledged line onboarding briefs (ADR-0150). A re-brief is a new row,
        so the CURRENT statement is the newest row per (plan, line); an older row
        that was acknowledged is history, not an obligation. */
  const plansById = new Map();
  for (const plan of Array.isArray(state.onboarding) ? state.onboarding : []) {
    if (plan && plan.id) plansById.set(plan.id, plan);
  }
  const briefs = Array.isArray(state.onboardingLineBriefs) ? state.onboardingLineBriefs : [];
  const newestByPlanLine = new Map();
  for (let i = 0; i < briefs.length; i += 1) {
    const row = briefs[i];
    if (!row || !row.lineKey || !row.planId) continue;
    const key = `${row.planId}|${row.lineKey}`;
    const prior = newestByPlanLine.get(key);
    if (!prior) { newestByPlanLine.set(key, { row, index: i }); continue; }
    const a = String(row.declaredOn || '');
    const b = String(prior.row.declaredOn || '');
    if (a > b || (a === b && i > prior.index)) newestByPlanLine.set(key, { row, index: i });
  }
  for (const { row } of newestByPlanLine.values()) {
    if (row.outcome !== 'brief') continue;      // an explicit decline is an answer
    if (row.acknowledgedOn) continue;            // the person has answered
    if (!row.lineKey || !row.personId || !row.managerId || !row.declaredOn) continue;
    const plan = plansById.get(row.planId) || null;
    const start = dayOf(plan?.startDate);
    out.push({
      key: `onboarding-brief:${row.id}`,
      source: 'onboarding-brief',
      recordId: row.id,
      lineKey: row.lineKey,
      personId: row.personId,
      managerId: row.managerId,
      askedOn: dayOf(row.declaredOn),
      dueOn: null,
      workStart: start,
      workEnd: start ? addDays(start, ONBOARDING_HORIZON_DAYS) : null,
      workWindowLabel: start
        ? `The plan’s ${ONBOARDING_HORIZON_DAYS}-day horizon from ${start}`
        : 'The plan carries no start date',
      statement: nameOf(row.scope),
    });
  }

  /* 2. Unanswered review input asks (ADR-0147). The ask and its answer live on
        the review row and freeze with the packet. An answer — including a
        reasoned decline — settles the line and is not an obligation. */
  for (const review of Array.isArray(state.reviews) ? state.reviews : []) {
    const st = review && review.stewardship;
    if (!st || typeof st !== 'object') continue;
    const answers = new Set();
    for (const answer of Array.isArray(st.answers) ? st.answers : []) {
      if (answer && answer.lineKey) answers.add(answer.lineKey);
    }
    const seen = new Set();
    for (const request of Array.isArray(st.requests) ? st.requests : []) {
      if (!request || !request.lineKey || !request.managerId || !request.askedOn) continue;
      if (answers.has(request.lineKey)) continue;
      // One ask per line: the newest is the standing one.
      if (seen.has(request.lineKey)) continue;
      seen.add(request.lineKey);
      out.push({
        key: `review-input:${review.id}:${request.lineKey}`,
        source: 'review-input',
        recordId: `${review.id}:${request.lineKey}`,
        lineKey: request.lineKey,
        personId: review.personId,
        managerId: request.managerId,
        askedOn: dayOf(request.askedOn),
        dueOn: dayOf(request.dueOn),
        workStart: dayOf(review.periodStart),
        workEnd: dayOf(review.periodEnd),
        workWindowLabel: review.periodStart && review.periodEnd
          ? `The review period ${review.periodStart} → ${review.periodEnd}`
          : 'The review carries no period',
        statement: nameOf(request.note),
      });
    }
  }

  return out.filter((ob) => ob.askedOn && ob.personId);
}

/* --------------------------------------------------------------- windows */

/**
 * Did the obligation's own work window meet the line's window at all?
 *
 * The two claims are computed from two dated windows and never from prose. When
 * either side is undated the answer is `unknown` — the register prints that it
 * cannot tell rather than assuming the reassuring answer.
 */
export function lineExitWindowVerdict(obligation, line) {
  if (!line || !line.verifiable || !line.endedOn) return LINE_EXIT_WINDOWS.unknown;
  const start = obligation.workStart || null;
  const end = obligation.workEnd || null;
  if (!start && !end) return LINE_EXIT_WINDOWS.unknown;
  if (start && start > line.endedOn) return LINE_EXIT_WINDOWS.after;
  if (end && line.fromISO && end < line.fromISO) return LINE_EXIT_WINDOWS.after;
  return LINE_EXIT_WINDOWS.overlaps;
}

/* ------------------------------------------------------------- the model */

function personName(index, id) {
  const person = index.get(id) || null;
  return nameOf(person?.name, nameOf(id, 'Unnamed'));
}

function latestRemedyFor(remedies, obligationKey) {
  let best = null;
  for (const row of remedies) {
    if (!row || row.obligationKey !== obligationKey) continue;
    if (!best) { best = row; continue; }
    const a = `${row.decidedOn}|${row.at}|${row.id}`;
    const b = `${best.decidedOn}|${best.at}|${best.id}`;
    if (a > b) best = row;
  }
  return best;
}

/**
 * Build the whole reading.
 *
 * Every figure below is derived here and printed; NOTHING in it is stored. That is
 * what makes "what the panel showed" and "what the record says" the same claim:
 * the panel has no second copy to drift from.
 */
export function buildLineExitReport(state = {}, {
  now = new Date(),
  settings = null,
  limit = LINE_EXIT_LIMITS.board,
} = {}) {
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const effective = settings || state?.settings || null;
  const conv = normalizeLineExitSettings(effective || {});
  const matrix = buildMatrix(state, { now: at, settings: effective });
  const today = dayKey(at);

  const index = new Map();
  for (const person of activePeople(state)) {
    if (person && person.id) index.set(person.id, person);
  }
  for (const [id, node] of matrix.nodes.entries()) {
    if (!index.has(id)) index.set(id, { id, name: node.name });
  }
  for (const person of Array.isArray(state.people) ? state.people : []) {
    if (person && person.id && !index.has(person.id)) index.set(person.id, person);
  }

  const homeManagerOf = (personId) => {
    const node = matrix.roster.get(personId) || index.get(personId) || null;
    return node?.rawManagerId || node?.managerId || LEADER_ID;
  };

  const remedies = Array.isArray(state.lineExitRemedies) ? state.lineExitRemedies : [];
  const allObligations = lineExitObligations(state);
  const rawLines = Array.isArray(state.reportingLines) ? state.reportingLines : [];

  /* 1. The lines that have ENDED. A row naming the same manager as the person's
        home line is the home line's allocation, not a second line, and is not an
        exit this register may adjudicate. A row marked ended with no recorded day
        is kept and marked unverifiable — dropping it is how a line disappears. */
  const endedLines = [];
  for (const raw of rawLines) {
    if (!raw || !raw.id || !raw.personId || !raw.managerId) continue;
    if (raw.managerId === homeManagerOf(raw.personId)) continue;
    const endedOn = dayOf(raw.toISO) || dayOf(raw.endedAt);
    if (!endedOn && raw.status !== 'ended') continue;   // live or future line
    if (endedOn && endedOn >= today) continue;           // in force today
    endedLines.push({
      lineKey: raw.id,
      personId: raw.personId,
      personName: personName(index, raw.personId),
      managerId: raw.managerId,
      managerName: personName(index, raw.managerId),
      kind: nameOf(raw.kind, 'reporting'),
      role: 'secondary',
      fromISO: dayOf(raw.fromISO),
      endedOn,
      endReason: nameOf(raw.endReason),
      verifiable: Boolean(endedOn && dayOf(raw.fromISO)),
      // Only a line that CANNOT be classified carries a reason. A verifiable line
      // prints no caveat at all — a caveat printed beside a sound reading teaches
      // the reader to ignore caveats.
      unverifiableReason: (endedOn && dayOf(raw.fromISO))
        ? ''
        : endedOn
          ? 'The line carries no start date, so the overlap with a work window cannot be computed.'
          : 'The line is marked ended but carries no end day.',
      obligations: [],
    });
  }

  const endedByKey = new Map(endedLines.map((line) => [line.lineKey, line]));
  const vanishedByKey = new Map();
  const homeScoped = [];
  const structureHistory = Array.isArray(state.structureHistory) ? state.structureHistory : [];
  let homeMovedN = 0;
  let orphanOfActiveLineN = 0;

  for (const ob of allObligations) {
    const ended = endedByKey.get(ob.lineKey);
    if (ended) { ended.obligations.push(ob); continue; }
    if (isHomeKey(ob.lineKey)) {
      homeScoped.push(ob);
      // A recorded home-line move AFTER the ask was made is the shape the
      // structure reconciliation (ADR-0149) exists to read. This register counts
      // it and hands it over; it does not adjudicate the home line itself.
      const moved = structureHistory.some((row) => row && row.personId === ob.personId
        && dayOf(row.fromISO) && dayOf(row.fromISO) > ob.askedOn);
      if (moved) homeMovedN += 1;
      continue;
    }
    const live = rawLines.find((row) => row && row.id === ob.lineKey);
    if (live) {
      // The declaration still exists and has not ended: not an exit, and the
      // register that owns that line's live obligations reads it.
      orphanOfActiveLineN += 1;
      continue;
    }
    if (!vanishedByKey.has(ob.lineKey)) {
      vanishedByKey.set(ob.lineKey, {
        lineKey: ob.lineKey,
        personId: ob.personId,
        personName: personName(index, ob.personId),
        managerId: ob.managerId,
        managerName: personName(index, ob.managerId),
        kind: '',
        role: 'secondary',
        fromISO: null,
        endedOn: null,
        endReason: '',
        verifiable: false,
        unverifiableReason: 'The line key this obligation names resolves to no declaration: the line was deleted rather than dated out, so the register cannot say when it ended or who held it.',
        obligations: [],
      });
    }
    vanishedByKey.get(ob.lineKey).obligations.push(ob);
  }

  /* 2. Render every obligation: state, remedy, window verdict and age. */
  const renderObligation = (ob, line) => {
    const remedy = latestRemedyFor(remedies, ob.key);
    const state = remedy
      ? (remedy.outcome === 'carry' ? LINE_EXIT_STATES.carried : LINE_EXIT_STATES.retired)
      : LINE_EXIT_STATES.open;
    const windowVerdict = lineExitWindowVerdict(ob, line);
    const daysOpen = daysBetween(ob.askedOn, today);
    const overdue = Boolean(ob.dueOn && ob.dueOn < today && state === LINE_EXIT_STATES.open);
    const carryTo = remedy?.carryToManagerId ? personName(index, remedy.carryToManagerId) : null;
    const source = LINE_EXIT_SOURCES.find((s) => s.key === ob.source) || null;
    return {
      key: ob.key,
      source: ob.source,
      sourceLabel: source?.label || ob.source,
      recordId: ob.recordId,
      personId: ob.personId,
      personName: line.personName,
      lineKey: line.lineKey,
      managerId: line.managerId,
      managerName: line.managerName,
      askedOn: ob.askedOn,
      dueOn: ob.dueOn,
      workStart: ob.workStart,
      workEnd: ob.workEnd,
      workWindowLabel: ob.workWindowLabel,
      windowVerdict,
      windowLabel: LINE_EXIT_WINDOW_LABELS[windowVerdict],
      state,
      stateLabel: LINE_EXIT_STATE_LABELS[state],
      stateTone: LINE_EXIT_STATE_TONES[state],
      open: state === LINE_EXIT_STATES.open,
      overdue,
      overdueDays: overdue ? Math.max(0, daysBetween(ob.dueOn, today) ?? 0) : null,
      daysOpen: daysOpen === null ? null : Math.max(0, daysOpen),
      remedy: remedy
        ? {
            id: remedy.id,
            outcome: remedy.outcome,
            reason: remedy.reason,
            decidedOn: remedy.decidedOn,
            decidedBySeatId: remedy.decidedBySeatId || null,
            decidedSource: remedy.decidedSource,
            carryToManagerId: remedy.carryToManagerId || null,
            carryToManagerName: carryTo,
            reviewOn: remedy.reviewOn || null,
          }
        : null,
    };
  };

  /**
   * The managers who could honestly take an obligation over TODAY: every manager
   * on a line still in force for this person, plus their home-line manager. A
   * carry naming anybody else is refused by the action, and the panel only offers
   * these. The list is derived here so the panel and the enforcement cannot
   * disagree about who was eligible.
   */
  const carryCandidatesFor = (personId) => {
    const out = [];
    const seen = new Set();
    for (const line of matrix.linesByPerson.get(personId) || []) {
      if (!line || !line.managerId || seen.has(line.managerId)) continue;
      seen.add(line.managerId);
      out.push({ id: line.managerId, name: personName(index, line.managerId), role: line.role });
    }
    const home = homeManagerOf(personId);
    if (home && !seen.has(home)) {
      out.push({ id: home, name: personName(index, home), role: 'primary' });
    }
    return out;
  };

  const finishLine = (line) => {
    const rows = line.obligations
      .map((ob) => renderObligation(ob, line))
      .sort((a, b) => String(a.askedOn).localeCompare(String(b.askedOn)) || a.key.localeCompare(b.key));
    const open = rows.filter((r) => r.state === LINE_EXIT_STATES.open);
    const retired = rows.filter((r) => r.state === LINE_EXIT_STATES.retired);
    const carried = rows.filter((r) => r.state === LINE_EXIT_STATES.carried);
    let verdict;
    if (!line.verifiable) verdict = 'vanished';
    else if (open.length) verdict = 'open-obligation';
    else if (carried.length) verdict = 'carried';
    else if (retired.length) verdict = 'remedied';
    else verdict = 'no-obligation';
    const meta = lineExitLineVerdict(verdict);
    const maxDaysOpen = open.reduce((max, r) => (r.daysOpen !== null && r.daysOpen > max ? r.daysOpen : max), 0);
    return {
      ...line,
      obligations: rows,
      carryCandidates: carryCandidatesFor(line.personId),
      counts: {
        obligationsN: rows.length,
        openN: open.length,
        retiredN: retired.length,
        carriedN: carried.length,
        overdueN: rows.filter((r) => r.overdue).length,
        afterWindowN: rows.filter((r) => r.windowVerdict === LINE_EXIT_WINDOWS.after).length,
        unknownWindowN: rows.filter((r) => r.windowVerdict === LINE_EXIT_WINDOWS.unknown).length,
        maxDaysOpen,
      },
      verdict,
      verdictLabel: meta?.label || verdict,
      verdictTone: meta?.tone || 'neutral',
      verdictOpen: Boolean(meta?.open),
      daysSinceEnd: line.endedOn ? Math.max(0, daysBetween(line.endedOn, today) ?? 0) : null,
    };
  };

  const lines = [...endedLines.map(finishLine), ...[...vanishedByKey.values()].map(finishLine)]
    .sort((a, b) => (a.personName || '').localeCompare(b.personName || '')
      || String(a.endedOn || '').localeCompare(String(b.endedOn || ''))
      || a.lineKey.localeCompare(b.lineKey));

  /* 3. Totals. Every one is a count of LINES or of OBLIGATIONS — never of
        line-people — and every state count is read from the MAPPED rows. */
  const obligations = [];
  for (const line of lines) {
    for (const row of line.obligations) obligations.push({ ...row, line });
  }
  const sum = (fn) => obligations.reduce((total, row) => total + (fn(row) ? 1 : 0), 0);
  const openRows = obligations.filter((r) => r.state === LINE_EXIT_STATES.open);
  const bySource = LINE_EXIT_SOURCES.map((source) => {
    const rows = obligations.filter((r) => r.source === source.key);
    return {
      key: source.key,
      label: source.label,
      n: rows.length,
      openN: rows.filter((r) => r.state === LINE_EXIT_STATES.open).length,
    };
  });
  const stateCounts = {};
  for (const key of LINE_EXIT_STATE_KEYS) stateCounts[key] = sum((r) => r.state === key);
  const stateSum = LINE_EXIT_STATE_KEYS.reduce((total, key) => total + stateCounts[key], 0);

  const boardCap = Number.isFinite(limit) ? Math.max(0, limit) : LINE_EXIT_LIMITS.board;
  const rendered = boardCap === 0 ? lines : lines.slice(0, boardCap);
  const persons = new Set(lines.map((l) => l.personId));

  const vanishedLineN = lines.filter((l) => l.verdict === 'vanished').length;
  const endedLineN = lines.length - vanishedLineN;
  const openN = openRows.length;

  let verdict;
  if (!lines.length && !homeScoped.length) verdict = 'single-chain';
  else if (vanishedLineN > 0) verdict = 'unverifiable';
  else if (openN > 0) verdict = 'orphaned';
  else if (stateCounts[LINE_EXIT_STATES.carried] > 0) verdict = 'carried';
  else if (obligations.length > 0) verdict = 'remedied';
  else verdict = 'clear';
  const verdictMeta = lineExitVerdict(verdict) || LINE_EXIT_VERDICTS[0];

  const refusals = [];
  if (vanishedLineN > 0) {
    refusals.push({
      key: 'vanished-lines',
      text: `${vanishedLineN} line key(s) named by an open obligation resolve to no declaration. They are printed as unverifiable and counted as unsettled; the register will not invent an end day for them.`,
    });
  }
  const unverifiableEndedN = endedLineN - lines.filter((l) => l.verifiable && l.verdict !== 'vanished').length;
  if (unverifiableEndedN > 0) {
    refusals.push({
      key: 'undated-lines',
      text: `${unverifiableEndedN} ended line(s) carry no recorded start or end day, so the overlap between the line and the work each ask is about cannot be computed. Their window verdict reads unknown.`,
    });
  }
  if (homeScoped.length > 0) {
    refusals.push({
      key: 'home-scoped',
      text: `${homeScoped.length} open obligation(s) are addressed to a HOME line and are not adjudicated here; ${homeMovedN} of them were asked before a recorded home-line move. Read them through the structure reconciliation (ADR-0149).`,
    });
  }
  if (orphanOfActiveLineN > 0) {
    refusals.push({
      key: 'live-lines',
      text: `${orphanOfActiveLineN} open obligation(s) name a line that is still in force. They are not exits and are read by the register that owns that line.`,
    });
  }
  if (lines.length > rendered.length) {
    refusals.push({
      key: 'board-cap',
      text: `${lines.length - rendered.length} line(s) beyond the declared board cap of ${boardCap} are counted in every total and not listed.`,
    });
  }
  if (stateSum !== obligations.length) {
    refusals.push({
      key: 'state-mismatch',
      text: 'THE STATE COUNTS DO NOT RECONCILE WITH THE PRINTED ROWS. Treat every figure on this panel as unverified.',
    });
  }

  return {
    engineVersion: LINE_EXIT_ENGINE_VERSION,
    generatedOn: today,
    today,
    now: at,
    conventions: conv,
    conventionsText: `An obligation a leader must settle is asked for within ${conv.lineExitDueDays} day(s) of the scan that finds it.`,
    method: LINE_EXIT_METHOD,
    sources: LINE_EXIT_SOURCES,
    states: LINE_EXIT_STATE_KEYS.map((key) => ({
      key, label: LINE_EXIT_STATE_LABELS[key], tone: LINE_EXIT_STATE_TONES[key], n: stateCounts[key],
    })),
    lines,
    renderedLines: rendered,
    obligations,
    homeScoped,
    refusals,
    verdict: verdictMeta.key,
    verdictLabel: verdictMeta.label,
    verdictTone: verdictMeta.tone,
    isMatrix: lines.length > 0 || homeScoped.length > 0 || rawLines.length > 0,
    singleChainNote: 'No declared reporting line has ended in this workspace, so no obligation has been left behind one. This register is inert here: no row, no ask, no remedy and no change to any existing reading.',
    board: {
      linesN: lines.length,
      endedLinesN: endedLineN,
      vanishedLinesN: vanishedLineN,
      personsN: persons.size,
      obligationsN: obligations.length,
      openN,
      retiredN: stateCounts[LINE_EXIT_STATES.retired],
      carriedN: stateCounts[LINE_EXIT_STATES.carried],
      overdueN: sum((r) => r.overdue),
      afterWindowN: sum((r) => r.windowVerdict === LINE_EXIT_WINDOWS.after),
      unknownWindowN: sum((r) => r.windowVerdict === LINE_EXIT_WINDOWS.unknown),
      maxDaysOpen: openRows.reduce((max, r) => (r.daysOpen !== null && r.daysOpen > max ? r.daysOpen : max), 0),
      linesWithOpenN: lines.filter((l) => l.counts.openN > 0).length,
      linesSettledN: lines.filter((l) => l.counts.openN === 0).length,
      homeScopedN: homeScoped.length,
      homeMovedN,
      liveLineObligationsN: orphanOfActiveLineN,
      renderedLines: rendered.length,
      withheldLines: Math.max(0, lines.length - rendered.length),
      stateCounts,
      stateSum,
      bySource,
      verdict: verdictMeta.key,
      verdictLabel: verdictMeta.label,
      verdictTone: verdictMeta.tone,
    },
  };
}

/* ------------------------------------------------------------------ brief */

/** An identity-free paragraph safe to paste into a leadership note. */
export function lineExitBriefText(state = {}, options = {}) {
  const report = buildLineExitReport(state, options);
  const b = report.board;
  const lines = [];
  lines.push(`MATRIX LINE-EXIT OBLIGATION REGISTER — ${report.generatedOn}`);
  lines.push('');
  lines.push(`Reading: ${report.verdictLabel}.`);
  lines.push(`${b.endedLinesN} ended reporting line(s) for ${b.personsN} person(s) left ${b.obligationsN} open obligation(s): ${b.openN} still open with no remedy, ${b.retiredN} retired with a reason, ${b.carriedN} carried to a named manager.`);
  if (b.vanishedLinesN) {
    lines.push(`${b.vanishedLinesN} line key(s) named by an open obligation resolve to no declaration. They are counted as unsettled and are not classified.`);
  }
  if (b.overdueN) lines.push(`${b.overdueN} open obligation(s) are past their due day; the oldest open obligation is ${b.maxDaysOpen} day(s) old.`);
  if (b.afterWindowN) {
    lines.push(`${b.afterWindowN} open obligation(s) are about a work window that falls entirely outside the line’s life. They are FLAGGED for retirement, never retired automatically.`);
  }
  if (b.unknownWindowN) lines.push(`${b.unknownWindowN} obligation(s) carry no dated window on one side, so their overlap with the line is unknown, not assumed.`);
  if (b.homeScopedN) {
    lines.push(`${b.homeScopedN} open obligation(s) are addressed to a HOME line and are handed to the structure reconciliation (ADR-0149) rather than adjudicated here; ${b.homeMovedN} of them predate a recorded home-line move.`);
  }
  if (report.refusals.length) {
    lines.push('');
    lines.push('Refusals and limits:');
    for (const refusal of report.refusals) lines.push(`- ${refusal.text}`);
  }
  lines.push('');
  lines.push('Nothing above is stored. Every figure is recomputed from the dated declarations, the stored asks and the remedy rows on each read.');
  return lines.join('\n');
}

/* -------------------------------------------------------------------- csv */

/**
 * Aggregate rows only: no person, no name, no manager id, no line id, no free
 * text. One workspace row plus one row per ended line, identified by its KIND and
 * a stable position — enough to reconcile the export against the panel and
 * nothing more.
 */
export function lineExitCsvRows(state = {}, options = {}) {
  const report = buildLineExitReport(state, { ...options, limit: Number.MAX_SAFE_INTEGER });
  const blanks = Object.fromEntries(LINE_EXIT_CSV_COLUMNS.map((key) => [key, '']));
  const rows = [];
  const b = report.board;
  rows.push({
    ...blanks,
    row_kind: 'workspace',
    obligations: b.obligationsN,
    open: b.openN,
    retired: b.retiredN,
    carried: b.carriedN,
    overdue: b.overdueN,
    after_window: b.afterWindowN,
    unknown_window: b.unknownWindowN,
    max_days_open: b.maxDaysOpen,
    verdict: b.verdict,
    verdict_open: report.refusals.some((r) => r.key === 'state-mismatch') ? 'true' : (b.openN > 0 ? 'true' : 'false'),
  });
  report.lines.forEach((line, position) => {
    rows.push({
      ...blanks,
      row_kind: 'line',
      line_position: position + 1,
      line_role: line.role,
      line_kind: line.kind || 'unknown',
      line_ended_on: line.endedOn || '',
      line_window_verifiable: line.verifiable ? 'true' : 'false',
      obligations: line.counts.obligationsN,
      open: line.counts.openN,
      retired: line.counts.retiredN,
      carried: line.counts.carriedN,
      overdue: line.counts.overdueN,
      after_window: line.counts.afterWindowN,
      unknown_window: line.counts.unknownWindowN,
      max_days_open: line.counts.maxDaysOpen,
      verdict: line.verdict,
      verdict_open: line.verdictOpen ? 'true' : 'false',
    });
  });
  return rows;
}

/** Badge count: open obligations on ended lines. Zero in a single-chain workspace. */
export function lineExitAttentionCount(state = {}, { now = new Date(), settings = null } = {}) {
  const report = buildLineExitReport(state, { now, settings, limit: 0 });
  return report.board.openN;
}

export { LINE_EXIT_LINE_VERDICT_KEYS, LINE_EXIT_CSV_COLUMNS };
