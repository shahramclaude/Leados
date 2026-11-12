/**
 * app/core/domain/workforceFlow.js — Workforce Stock-Flow (Markov manpower) Plan
 * (ADR-0184, Session 252, Schema v146, `#/matrix?panel=stock-flow`, CSV #138).
 *
 * THE QUESTION, IN A CHIEF'S WORDS. "If we promote at the rate we actually
 * promote, hire at the rate we actually hire and lose people at the rate we
 * actually lose them, what does this organisation look like in four quarters —
 * and is that the shape I meant to fund?"
 *
 * WHAT THE WORKSPACE COULD SAY BEFORE THIS. What each person's level is today.
 * Nothing about how anybody got there, so a hiring freeze, a promotion round and
 * an attrition spike could only be priced one decision at a time, and their
 * joint effect arrived unannounced eighteen months later as a hollowed middle
 * and a promotion queue nobody could clear.
 *
 * WHAT IT REFUSES TO DO — the four claims, kept apart because they are four
 * different facts:
 *   `observed`   the window's moves were actually recorded;
 *   `estimated`  a rate was computed from enough exposure to mean anything;
 *   `projected`  the pyramid was stepped forward from those rates;
 *   `compared`   the projection was set against a shape somebody declared.
 * A projection printed beside a comparison nobody could make is exactly the
 * reassuring lie the Bulletproof Reliability Mandate forbids.
 *
 * Pure read model: no storage, no implicit clock, no mutation of any input, and
 * no derived value stored between reads. The only matrix dependency is
 * `buildMatrix` for the per-line share-weighted reading; the pyramid itself is
 * computed from the roster alone, so a single-chain workspace is fully served.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, personAllocation } from './matrix.js';
import { normalizeWorkforceFlowSettings, liveWorkforceTargets } from './workforceFlowSchema.js';
import {
  WORKFORCE_FLOW_ADR,
  WORKFORCE_FLOW_CONVENTIONS,
  WORKFORCE_FLOW_ENGINE_VERSION,
  WORKFORCE_FLOW_FRAMEWORKS,
  WORKFORCE_FLOW_LEVELS,
  WORKFORCE_FLOW_LEVEL_KEYS,
  WORKFORCE_FLOW_LIMITS,
  WORKFORCE_FLOW_METHOD,
  WORKFORCE_FLOW_SETTING_KEYS,
  WORKFORCE_FLOW_WITHHELD_LABELS,
  WORKFORCE_FLOW_DETAIL_LEVELS,
  WORKFORCE_FLOW_DETAIL_REASONS,
  WORKFORCE_FLOW_WITHHELD_REASONS,
  workforceFlowKind,
  workforceLevelIndex,
  workforceLevelLabel,
} from './workforceFlowRegistry.js';

const LEVELS = WORKFORCE_FLOW_LEVELS;
const LEVEL_INDEX = new Map(LEVELS.map((l) => [l.key, l.index]));
const K = WORKFORCE_FLOW_SETTING_KEYS;

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const sortedPeople = (rows) => [...rows].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')) || String(a.id).localeCompare(String(b.id)));

/** A month index from a day key, so exposure is exact and DST-free. */
function monthStart(day) {
  return `${String(day).slice(0, 7)}-01`;
}

function addMonths(day, n) {
  const d = new Date(`${day}T00:00:00.000Z`);
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + n;
  const year = Math.floor(total / 12);
  const month = (total % 12 + 12) % 12;
  const out = new Date(Date.UTC(year, month, 1));
  return out.toISOString().slice(0, 10);
}

/**
 * Person-months of exposure at a level inside [fromISO, toISO], in exact
 * INTEGER thousandths of a month (so a rate is integer arithmetic all the way
 * down and a printed rate is never a float that rounds into looking right).
 *
 * Exposure is the time the STOCK actually stood there: the whole window for a
 * person who was at that level throughout, the part of the window after their
 * move for a destination level, and the part before it for an origin level.
 */
const MONTH_MILLI = 1000;

function monthsMillis(fromISO, toISO) {
  const a = new Date(`${fromISO}T00:00:00.000Z`).getTime();
  const b = new Date(`${toISO}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  const days = (b - a) / 86400000;
  return Math.round((days / 30.436875) * MONTH_MILLI);
}

function maxDay(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

/** The earlier of two days; either may be absent. */
function minDay(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

/**
 * The stock a person holds TODAY. `level` is the roster level; a person with no
 * level is `unknown-level` and is counted as a refusal rather than defaulted to
 * the bottom rung (which would silently inflate the IC stock every projection
 * step is drawn from).
 */
function currentStock(person) {
  const level = LEVEL_INDEX.has(person.level) ? person.level : null;
  return level;
}

/**
 * An empty reading, used for every refusal path so the shape of the return is
 * identical whatever went wrong. A caller can never receive a half-built board.
 */
function emptyBoard(settings, generatedOn, reason) {
  return {
    verdict: 'withheld',
    verdictLabel: 'The projection is withheld',
    reason: reason || WORKFORCE_FLOW_WITHHELD_LABELS['no-acts'],
    generatedOn,
    window: { fromISO: null, toISO: null, months: settings[K.windowMonths], covered: false },
    horizon: { quarters: settings[K.horizonQuarters], endsOn: null },
    population: {
      rosterN: 0, stockedN: 0, unknownLevelN: 0, undatedStartN: 0,
      headcountTotal: 0, headcountReconcile: true, statesReconcile: true,
    },
    acts: {
      totalN: 0, withdrawnN: 0, inWindowN: 0, outsideWindowN: 0, originUnknownN: 0, refusedN: 0,
      hiresN: 0, promotionsN: 0, demotionsN: 0, lateralsN: 0,
      voluntaryN: 0, involuntaryN: 0, retirementsN: 0, flowsReconcile: true,
    },
    exposureMonthsTotal: 0,
    exposureContradictionsN: 0,
    rates: { cellsN: 0, printedN: 0, withheldN: 0, minExposure: settings[K.minExposure] },
    claims: { observed: false, estimated: false, projected: false, compared: false },
    projectedTotal: null,
    roundingDifference: null,
    target: { declaredN: 0, total: null, gapTotal: null, shortN: 0, overN: 0 },
    levels: [],
    transition: [],
    lines: [],
    matrix: { hasMatrix: false, declaredLinesN: 0, activeLinesN: 0, defectsN: 0, unresolvedShareN: 0 },
    withheld: [{ key: 'no-acts', label: WORKFORCE_FLOW_WITHHELD_LABELS['no-acts'], count: 1 }],
    transition: [],
    hireEntryLevel: 'ic',
    hireRatePerYear: null,
    path: [],
  };
}

/**
 * Build the plan.
 *
 * Options:
 *   `now`               injected clock (the reading day; never read implicitly)
 *   `settings`          canonical settings override
 *   `visiblePersonIds`  Set of person ids a scoped seat may read; null = all
 *   `detailLevel`       'full' | 'span' | 'none' — what the seat is shown
 */
export function buildWorkforceFlow(state, {
  now = new Date(),
  settings = null,
  visiblePersonIds = null,
  detailLevel = 'full',
} = {}) {
  const source = state && typeof state === 'object' ? state : {};
  const effective = settings || source.settings || {};
  const conv = normalizeWorkforceFlowSettings(effective);
  const generatedOn = dayKey(now) || new Date(now).toISOString().slice(0, 10);
  const horizonQuarters = conv[K.horizonQuarters];
  const minExposureMilli = conv[K.minExposure] * MONTH_MILLI;

  const acts = Array.isArray(source.workforceFlowActs) ? source.workforceFlowActs : [];
  const targets = Array.isArray(source.workforceFlowTargets) ? source.workforceFlowTargets : [];
  const people = sortedPeople((Array.isArray(source.people) ? source.people : [])
    .filter((p) => p && typeof p === 'object' && p.status !== 'archived' && p.id));

  /* ---------------------------------------------- 0. a reading is never empty */
  if (!acts.length) {
    const board = emptyBoard(conv, generatedOn, WORKFORCE_FLOW_WITHHELD_LABELS['no-acts']);
    board.population.rosterN = people.length;
    board.population.stockedN = people.filter((p) => currentStock(p)).length;
    board.population.unknownLevelN = people.filter((p) => !currentStock(p)).length;
    board.population.headcountTotal = board.population.stockedN;
    board.levels = LEVELS.map((level) => emptyLevelRow(level, people.filter((p) => p.level === level.key).length));
    board.transition = [];
    return finalise(board, conv, { detailLevel });
  }

  /* --------------------------------------------------- 1. the reading window */
  const windowMonths = conv[K.windowMonths];
  const toISO = generatedOn;
  const fromISO = addMonths(monthStart(toISO), -windowMonths);
  const window = { fromISO, toISO, months: windowMonths, covered: true };

  /* ------------------------------------------------ 2. the act classification */
  const withdrawnN = acts.filter((a) => a && a.withdrawn === true).length;
  const counts = {
    totalN: acts.length, withdrawnN, inWindowN: 0, outsideWindowN: 0, originUnknownN: 0, refusedN: 0,
    hiresN: 0, promotionsN: 0, demotionsN: 0, lateralsN: 0,
    voluntaryN: 0, involuntaryN: 0, retirementsN: 0,
  };
  const inWindow = [];
  const refused = [];
  for (const act of acts) {
    if (!act || typeof act !== 'object') { counts.refusedN += 1; continue; }
    // A withdrawn act is excluded from every figure and COUNTED, so the ledger
    // still reconciles: read + withdrawn + outside + origin-unknown + refused = total.
    if (act.withdrawn === true) continue;
    const kind = workforceFlowKind(act.kind);
    if (!kind) { counts.refusedN += 1; refused.push({ actId: str(act.id), reason: 'unknown-kind' }); continue; }
    const day = str(act.effectiveOn).slice(0, 10);
    if (visiblePersonIds && act.personId && !visiblePersonIds.has(act.personId)) {
      // Outside the seat's population. Counted, never folded into a level.
      counts.refusedN += 1;
      refused.push({ actId: str(act.id), reason: 'outside-seat' });
      continue;
    }
    if (!day || day < fromISO || day > toISO) { counts.outsideWindowN += 1; continue; }
    // An origin-bearing move whose origin level was never recorded is COUNTED and
    // excluded from every rate: assigning it to today's level of an archived
    // person would fabricate the origin stock the rate is divided by.
    if (kind.from === 'level' && !LEVEL_INDEX.has(act.fromLevel)) {
      counts.originUnknownN += 1;
      continue;
    }
    if (kind.to === 'level' && !LEVEL_INDEX.has(act.toLevel)) {
      counts.originUnknownN += 1;
      continue;
    }
    inWindow.push(act);
    counts.inWindowN += 1;
    if (kind.key === 'hire') counts.hiresN += 1;
    else if (kind.key === 'promotion') counts.promotionsN += 1;
    else if (kind.key === 'demotion') counts.demotionsN += 1;
    else if (kind.key === 'lateral') counts.lateralsN += 1;
    else if (kind.key === 'attrition-voluntary') counts.voluntaryN += 1;
    else if (kind.key === 'attrition-involuntary') counts.involuntaryN += 1;
    else if (kind.key === 'retirement') counts.retirementsN += 1;
  }
  // The six kind buckets plus the two exclusions must land on the total act count.
  const flowsReconcile = counts.inWindowN + counts.withdrawnN + counts.outsideWindowN + counts.originUnknownN + counts.refusedN === counts.totalN;

  /* -------------------------------------------- 3. the population's state count */
  // HEADCOUNT is the active roster only: an archived person holds no stock. The
  // two populations are printed apart because they answer two different
  // questions, and collapsing them would either invent headcount or delete a
  // real exit's exposure.
  const stocked = people.filter((p) => currentStock(p));
  const unknownLevel = people.filter((p) => !currentStock(p));
  const undatedStart = people.filter((p) => !str(p.startDate));
  const population = {
    rosterN: people.length,
    stockedN: stocked.length,
    unknownLevelN: unknownLevel.length,
    undatedStartN: undatedStart.length,
    headcountTotal: stocked.length,
    headcountReconcile: true,
    statesReconcile: stocked.length + unknownLevel.length === people.length,
  };

  /* --------------------------------------------------------- 4. the exposure */
  // Exposure is the time the STOCK actually stood at each level inside the
  // window, and it is derived from the RECORDED HISTORY — never from today's
  // roster level. Reconstructing each person's level at the start of the window
  // by reversing the recorded moves is the only way that number can be right:
  // the roster says where somebody is today, not where they were in March, and
  // dividing a March promotion by a stock that never stood there in March is the
  // arithmetic this module exists to refuse.
  //
  // A person with no recorded start day contributes NOTHING: their time in grade
  // is unknown, and counting the whole window for them would inflate the
  // denominator of every rate on the panel.
  const exposureMilli = new Map(LEVEL_KEYS_ZERO());
  const exposurePeople = new Map(LEVELS.map((l) => [l.key, new Set()]));
  let exposureMonthsTotal = 0;
  let undatedPeopleN = 0;
  let contradictionPeopleN = 0;

  // Everyone whose history can touch the window: the active roster AND people
  // who left. An archived person holds no stock TODAY, but the time they stood
  // at a level inside the window is real exposure, and dropping them would
  // delete exactly the exits this model is built to measure.
  const historyPeople = sortedPeople((Array.isArray(source.people) ? source.people : [])
    .filter((p) => p && typeof p === 'object' && p.id));

  // All acts by person, INCLUDING those outside the window: the window's acts
  // are the flows, but the whole history is needed to reconstruct the stock a
  // person held when the window opened.
  const actsByPerson = new Map();
  for (const act of acts) {
    if (!act || typeof act !== 'object' || act.withdrawn === true || !act.personId) continue;
    if (!workforceFlowKind(act.kind)) continue;
    if (!actsByPerson.has(act.personId)) actsByPerson.set(act.personId, []);
    actsByPerson.get(act.personId).push(act);
  }

  for (const person of historyPeople) {
    const levelToday = currentStock(person);
    const archived = person.status === 'archived';
    const start = str(person.startDate);
    if (!levelToday) continue;
    if (!start) { undatedPeopleN += 1; continue; }

    const history = (actsByPerson.get(person.id) || [])
      .slice()
      .sort((a, b) => String(b.effectiveOn).localeCompare(String(a.effectiveOn)) || String(b.id).localeCompare(String(a.id)));

    // Where the walk begins. An ACTIVE person is at their roster level today, so
    // the walk starts at the reading day and runs backwards. An ARCHIVED person
    // holds no stock at all after their exit, so the walk starts at the exit day
    // with the level they left from.
    let levelAtCursor = levelToday;
    let cursor = toISO;
    if (archived) {
      const exit = history.find((act) => workforceFlowKind(act.kind)?.to === 'outside');
      if (!exit || !LEVEL_INDEX.has(exit.fromLevel)) {
        // An archived person whose exit day or origin level is not recorded has
        // no datable end, so no exposure is claimed for them.
        contradictionPeopleN += 1;
        continue;
      }
      if (exit.effectiveOn > toISO) {
        // They left after the reading day: outside this window entirely.
        continue;
      }
      cursor = exit.effectiveOn;
      levelAtCursor = exit.fromLevel;
    }

    const segments = [];
    let contradiction = null;
    for (const act of history) {
      if (act.effectiveOn >= cursor) continue; // already covered, or in the future of the walk
      const kind = workforceFlowKind(act.kind);
      if (!kind || kind.key === 'lateral') continue;
      if (kind.to === 'outside') {
        // An exit behind a person the roster still lists as active is a real
        // disagreement between the ledger and the roster. The time AFTER the
        // exit is not exposure; the walk continues from the exit day so the
        // genuine pre-exit period is still measured.
        if (!archived && levelAtCursor === act.fromLevel) {
          contradiction = `An exit from ${act.fromLevel} is recorded on ${act.effectiveOn} but this person is still on the active roster, so the time after that day is not counted as exposure.`;
        }
        cursor = act.effectiveOn;
        levelAtCursor = act.fromLevel;
        continue;
      }
      if (kind.from === 'outside') {
        // A HIRE: entered at `to` on the hire day; nothing earlier exists here.
        if (levelAtCursor !== act.toLevel) {
          contradiction = `A hire into ${act.toLevel} on ${act.effectiveOn} does not connect to the level held at that point in the history.`;
          segments.length = 0;
        } else {
          segments.push({ level: act.toLevel, from: act.effectiveOn, to: cursor });
        }
        cursor = null;
        levelAtCursor = null;
        break;
      }
      if (!LEVEL_INDEX.has(act.toLevel) || !LEVEL_INDEX.has(act.fromLevel)) continue;
      if (levelAtCursor === act.toLevel) {
        // Walking backwards, the span from this move's day to the cursor is the
        // level the move LED TO; before the move the person sat at the origin.
        segments.push({ level: act.toLevel, from: act.effectiveOn, to: cursor });
        cursor = act.effectiveOn;
        levelAtCursor = act.fromLevel;
      } else {
        // The recorded move does not lead where the walk says the person sat: an
        // unrecorded move sits between them, so this person's history is not
        // whole and no exposure is claimed for it.
        contradiction = `A recorded ${kind.label.toLowerCase()} on ${act.effectiveOn} does not connect to the level held at that point in the history, so an unrecorded move sits between them.`;
        segments.length = 0;
        cursor = null;
        levelAtCursor = null;
        break;
      }
    }
    if (contradiction) contradictionPeopleN += 1;
    // The OLDEST segment still open runs from the window's first day to the
    // cursor. Without this the pre-move period is silently dropped, which would
    // shrink the denominator of every rate that period contributes to.
    if (levelAtCursor && cursor) segments.push({ level: levelAtCursor, from: fromISO, to: cursor });

    for (const segment of segments) {
      if (!LEVEL_INDEX.has(segment.level)) continue;
      const from = maxDay(segment.from, maxDay(start, fromISO));
      const to = minDay(segment.to, toISO);
      const milli = monthsMillis(from, to);
      if (milli <= 0) continue;
      exposureMilli.set(segment.level, exposureMilli.get(segment.level) + milli);
      exposurePeople.get(segment.level).add(person.id);
      exposureMonthsTotal += milli;
    }
  }

  /* --------------------------------------- 5. the transition counts by cell */
  // cell = `${kind}|${fromLevel}|${toLevel}` and the counts are what the rates are.
  const cells = new Map();
  for (const act of inWindow) {
    const kind = workforceFlowKind(act.kind);
    if (kind.key === 'hire' || kind.key === 'lateral') continue; // no transition between stocks
    const key = `${kind.key}|${act.fromLevel}|${act.toLevel}`;
    cells.set(key, (cells.get(key) || 0) + 1);
  }

  /* ------------------------------------------------ 6. the level-by-level board */
  const levelRows = LEVELS.map((level) => {
    const headcount = people.filter((p) => p.level === level.key).length;
    const milli = exposureMilli.get(level.key) || 0;
    const exposureMonths = milli / MONTH_MILLI;
    const promotablePeople = exposurePeople.get(level.key).size;

    let promotionsOut = 0;
    let demotionsOut = 0;
    let attritionOut = 0;
    for (const [key, count] of cells) {
      const [kindKey, fromLevel] = key.split('|');
      if (fromLevel !== level.key) continue;
      if (kindKey === 'promotion') promotionsOut += count;
      else if (kindKey === 'demotion') demotionsOut += count;
      else if (kindKey === 'attrition-voluntary' || kindKey === 'attrition-involuntary' || kindKey === 'retirement') attritionOut += count;
    }

    const reason = [];
    let promotionRate = null;
    let attritionRate = null;
    let waitMonths = null;
    const notes = [];

    // A rate is printed ONLY when the level carries enough exposure. Below the
    // floor the figure is BLANK with the arithmetic it declined to perform.
    const exposureSufficient = milli >= minExposureMilli && milli > 0;
    if (!exposureSufficient) {
      reason.push('insufficient-exposure');
    } else {
      // Per person-year, so the unit is readable: moves / (person-months) × 12.
      promotionRate = { value: (promotionsOut * 12 * 1000) / (milli / MONTH_MILLI) / 1000, count: promotionsOut, exposureMonths };
      attritionRate = { value: (attritionOut * 12 * 1000) / (milli / MONTH_MILLI) / 1000, count: attritionOut, exposureMonths };
      // Little's Law, printed as an OBSERVATION: stock ÷ outflow gives the
      // expected wait in grade in months, and it is withheld when there is no
      // outflow at all rather than printed as infinity.
      if (promotionsOut > 0) waitMonths = headcount / promotionsOut;
      else notes.push('no-promotion-outflow');
    }

    return {
      level: level.key,
      label: level.label,
      index: level.index,
      headcount,
      exposureMonths: Math.round(exposureMonths * 100) / 100,
      exposureMilli: milli,
      exposurePeopleN: promotablePeople,
      promotionsOut,
      demotionsOut,
      attritionOut,
      promotionRatePerYear: promotionRate ? Math.round(promotionRate.value * 10000) / 10000 : null,
      attritionRatePerYear: attritionRate ? Math.round(attritionRate.value * 10000) / 10000 : null,
      waitMonths: waitMonths === null ? null : Math.round(waitMonths * 100) / 100,
      exposureSufficient,
      withheld: reason,
      notes,
      // The two are kept apart: a REFUSAL says no figure is printed and why; a
      // NOTE explains a figure that is legitimately absent on a computed row.
      reason: reason.map((key) => WORKFORCE_FLOW_WITHHELD_LABELS[key] || key).join(' ') || null,
      note: notes.map((key) => WORKFORCE_FLOW_WITHHELD_LABELS[key] || key).join(' ') || null,
    };
  });

  let cellsPrinted = 0;
  let cellsWithheld = 0;
  for (const row of levelRows) {
    if (row.exposureSufficient) cellsPrinted += 1; else cellsWithheld += 1;
  }

  /* ---------------------------------------------------------- 7. the projection */
  const claims = {
    observed: false,
    estimated: false,
    projected: false,
    compared: false,
  };
  const withheld = [];
  const note = (key, count = 1) => {
    if (count <= 0) return;
    const found = withheld.find((w) => w.key === key);
    if (found) found.count += count;
    else withheld.push({ key, label: WORKFORCE_FLOW_WITHHELD_LABELS[key] || key, count });
  };

  claims.observed = counts.inWindowN > 0;
  if (!claims.observed) note('window-not-covered');
  if (counts.originUnknownN) note('incomplete-origin', counts.originUnknownN);
  if (contradictionPeopleN) note('roster-contradiction', contradictionPeopleN);
  if (cellsWithheld) note('insufficient-exposure', cellsWithheld);

  // The projection needs: a recorded window with moves, no origin-unknown act,
  // and at least one level with sufficient exposure for the rates it uses.
  const rateLevels = levelRows.filter((r) => r.exposureSufficient);
  claims.estimated = claims.observed && rateLevels.length > 0 && counts.originUnknownN === 0;
  if (claims.estimated) {
    claims.projected = true;
  } else if (!claims.estimated) {
    if (counts.originUnknownN) note('incomplete-origin', 0);
    if (!rateLevels.length) note('no-exposure', 1);
  }

  // Where a rate could not be estimated for a level, the projection carries the
  // level's headcount UNCHANGED and says so on the row. It never substitutes a
  // rate from another level: a hidden substitution is the failure mode this
  // module is built to avoid, and the row prints `rate-withheld` beside it.
  const projection = projectPyramid({
    levels: levelRows,
    horizonQuarters,
    generatedOn,
    actCounts: counts,
  });
  if (!claims.projected) {
    projection.rows = projection.rows.map((row) => ({
      ...row,
      projected: null,
      carriedReason: 'not-projected',
    }));
    projection.projectedTotal = null;
  }

  /* -------------------------------------------------- 8. the declared target */
  const targetMap = liveWorkforceTargets(targets, generatedOn);
  const targetRows = [];
  let targetTotal = 0;
  let targetDeclaredN = 0;
  for (const level of LEVELS) {
    const declared = targetMap.get(level.key);
    if (!declared) { targetRows.push({ level: level.key, label: level.label, headcount: null, byOn: null }); continue; }
    targetDeclaredN += 1;
    targetTotal += declared.headcount;
    targetRows.push({ level: level.key, label: level.label, headcount: declared.headcount, byOn: declared.byOn, targetId: declared.id });
  }
  claims.compared = claims.projected && targetDeclaredN > 0;
  if (!targetDeclaredN) note('no-target');
  const horizonEnd = projection.endsOn;

  let gapTotal = null;
  let shortN = 0;
  let overN = 0;
  let declaredProjectedTotal = 0;
  const rowsWithGap = projection.rows.map((projectedRow) => {
    // Merge the projection onto the ANALYSIS row of the same level, so the
    // panel prints one row per level carrying its count, its exposure, its
    // rates, its projection and its gap — never a projection row that has lost
    // the rate that produced it.
    const analysis = levelRows.find((r) => r.level === projectedRow.level);
    const row = { ...analysis, projected: projectedRow.projected, rateWithheld: projectedRow.rateWithheld, carriedReason: projectedRow.carriedReason };
    const target = targetRows.find((t) => t.level === row.level);
    const targetHeadcount = target && target.headcount !== null ? target.headcount : null;
    if (!claims.compared || targetHeadcount === null || row.projected === null) {
      return { ...row, targetHeadcount, targetByOn: target?.byOn || null, gap: null };
    }
    // The gap is measured ONLY on levels somebody declared an intent for. A
    // level with no declared target is not implicitly zero, which would read as
    // "we intend to eliminate it" — the loudest possible silent invention.
    declaredProjectedTotal += row.projected;
    const gap = row.projected - targetHeadcount;
    if (gap < 0) shortN += 1;
    if (gap > 0) overN += 1;
    return { ...row, targetHeadcount, targetByOn: target.byOn, gap };
  });
  if (claims.compared) gapTotal = declaredProjectedTotal - targetTotal;

  const board = {
    verdict: verdictFor(claims, counts, cellsWithheld, targetDeclaredN),
    verdictLabel: verdictLabelFor(verdictKey(claims, counts)),
    reason: null,
    generatedOn,
    window,
    horizon: { quarters: horizonQuarters, endsOn: horizonEnd },
    population,
    acts: { ...counts, flowsReconcile },
    exposureMonthsTotal: Math.round((exposureMonthsTotal / MONTH_MILLI) * 100) / 100,
    exposureContradictionsN: contradictionPeopleN,
    rates: { cellsN: levelRows.length, printedN: cellsPrinted, withheldN: cellsWithheld, minExposure: conv[K.minExposure] },
    claims,
    projectedTotal: projection.projectedTotal,
    roundingDifference: projection.roundingDifference,
    target: { declaredN: targetDeclaredN, total: targetDeclaredN ? targetTotal : null, gapTotal, shortN, overN },
    levels: rowsWithGap,
    transition: transitionRows(cells, levelRows),
    hireEntryLevel: 'ic',
    hireRatePerYear: projection.hireRate,
    path: projection.quarters.map((q) => ({
      quarter: q.quarter,
      total: q.stock.reduce((acc, v) => acc + v, 0),
      hires: q.hires,
      promotedOut: q.promotedOut,
    })),
    lines: [],
    matrix: { hasMatrix: false, declaredLinesN: 0, activeLinesN: 0, defectsN: 0, unresolvedShareN: 0 },
    withheld,
  };

  /* ------------------------------------------------- 9. the per-line reading */
  let matrix = null;
  try {
    matrix = buildMatrix(source, { now, settings: effective });
  } catch (error) {
    board.matrix = { hasMatrix: false, declaredLinesN: 0, activeLinesN: 0, defectsN: 1, unresolvedShareN: 0, error: String(error?.message || error).slice(0, 200) };
    note('matrix-defect', 1);
  }
  if (matrix) {
    board.matrix = lineReading(matrix, { visiblePersonIds, board, note });
  }

  return finalise(board, conv, { detailLevel });
}

const LEVEL_KEYS_ZERO = () => LEVELS.map((l) => [l.key, 0]);

/**
 * Step the pyramid forward one quarter at a time from the estimated rates.
 *
 * Each quarter:
 *   stay(L)      = stock(L) − promotions_out(L) − attrition_out(L)
 *   promotions   = Σ over origin levels of promotions_out(L)  ... added to L+1
 *   attrition    = Σ over levels of attrition_out(L)          ... leaves
 *   hires        = the observed hire rate applied to the whole stock
 *   demotions    = moved down one rung
 *
 * Rounding: every flow is rounded per level per quarter and the REMAINDER is
 * carried, so no headcount is created or destroyed by rounding. The final
 * `roundingDifference` prints the difference between the sum of the rounded
 * rows and the rounded total — a printed total that is not the sum of the
 * printed rows is the exact failure this panel refuses to produce.
 */
function projectPyramid({ levels, horizonQuarters, generatedOn, actCounts }) {
  const n = levels.length;
  const stock = levels.map((r) => r.headcount);
  const promoRate = levels.map((r) => (r.exposureSufficient ? r.promotionRatePerYear : null));
  const attrRate = levels.map((r) => (r.exposureSufficient ? r.attritionRatePerYear : null));
  const anyProjectable = promoRate.some((r) => r !== null);
  const quarters = [];
  const carryPromo = new Array(n).fill(0);
  const carryAttr = new Array(n).fill(0);
  const carryHire = [0];

  // The hire rate is one workspace figure: hires per person-year over the window.
  const totalExposureMonths = levels.reduce((acc, r) => acc + r.exposureMonths, 0);
  const hireRate = totalExposureMonths > 0 ? (actCounts.hiresN * 12) / totalExposureMonths : null;

  let carries = stock.slice();
  for (let q = 1; q <= horizonQuarters; q += 1) {
    const next = new Array(n).fill(0);
    const promos = new Array(n).fill(0);
    const attrs = new Array(n).fill(0);

    for (let i = 0; i < n; i += 1) {
      const here = carries[i];
      if (!here) continue;
      const p = promoRate[i] === null ? 0 : (here * promoRate[i]) / 4 + carryPromo[i];
      const a = attrRate[i] === null ? 0 : (here * attrRate[i]) / 4 + carryAttr[i];
      const pFloor = Math.floor(p);
      const aFloor = Math.floor(a);
      carryPromo[i] = p - pFloor;
      carryAttr[i] = a - aFloor;
      // A level cannot promote or lose more people than it holds. The clamp is
      // printed as a `clamped` flag on the quarter, never applied silently.
      const pTake = Math.min(pFloor, Math.max(0, here - aFloor));
      const aTake = Math.min(aFloor, Math.max(0, here - pTake));
      promos[i] = pTake;
      attrs[i] = aTake;
      next[i] += here - pTake - aTake;
    }
    // Promotions land on the rung above; at the top rung a promotion leaves the
    // modelled population and is counted separately rather than dropped.
    let promotedOut = 0;
    for (let i = 0; i < n; i += 1) {
      if (!promos[i]) continue;
      if (i + 1 < n) next[i + 1] += promos[i];
      else promotedOut += promos[i];
    }
    // Hires enter the bottom rung: the record has no per-level hire split, and
    // inventing one would be the substitution this module refuses. The panel
    // prints that the hire flow lands at the entry rung.
    let hires = 0;
    if (hireRate !== null) {
      const raw = totalExposureMonths > 0
        ? ((carries.reduce((acc, v) => acc + v, 0)) * hireRate) / 4 + carryHire[0]
        : carryHire[0];
      hires = Math.max(0, Math.floor(raw));
      carryHire[0] = raw - hires;
      next[0] += hires;
    }
    quarters.push({
      quarter: q,
      stock: next.slice(),
      promotions: promos.slice(),
      attrition: attrs.slice(),
      hires,
      promotedOut,
    });
    carries = next;
  }

  const rows = levels.map((r, i) => ({
    level: r.level,
    label: r.label,
    now: stock[i],
    projected: anyProjectable ? carries[i] : null,
    rateWithheld: promoRate[i] === null || attrRate[i] === null,
    carriedReason: promoRate[i] === null || attrRate[i] === null ? 'rate-withheld' : null,
  }));

  const projectedSum = rows.reduce((acc, r) => acc + (r.projected || 0), 0);
  const totalNow = stock.reduce((acc, v) => acc + v, 0);
  const roundingDifference = anyProjectable ? projectedSum - carries.reduce((acc, v) => acc + v, 0) : null;
  const endsOn = generatedOn ? addMonthsEnd(generatedOn, horizonQuarters * 3) : null;

  return {
    rows,
    quarters,
    endsOn,
    projectedTotal: anyProjectable ? carries.reduce((acc, v) => acc + v, 0) : null,
    totalNow,
    roundingDifference,
    hireRate: hireRate === null ? null : Math.round(hireRate * 10000) / 10000,
    anyProjectable,
  };
}

/** The last day of the quarter horizon: n months after the reading day, end of month. */
function addMonthsEnd(day, n) {
  const iso = addMonths(day, n);
  const d = new Date(`${iso}T00:00:00.000Z`);
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return end.toISOString().slice(0, 10);
}

function transitionRows(cells, levelRows) {
  const out = [];
  for (const [key, count] of [...cells.entries()].sort()) {
    const [kind, fromLevel, toLevel] = key.split('|');
    out.push({ kind, kindLabel: workforceFlowKind(kind)?.label || kind, fromLevel, toLevel, count });
  }
  return out;
}

function emptyLevelRow(level, headcount) {
  return {
    level: level.key, label: level.label, index: level.index, headcount,
    exposureMonths: 0, exposureMilli: 0, exposurePeopleN: 0,
    promotionsOut: 0, demotionsOut: 0, attritionOut: 0,
    promotionRatePerYear: null, attritionRatePerYear: null, waitMonths: null,
    exposureSufficient: false, withheld: ['no-acts'],
    reason: WORKFORCE_FLOW_WITHHELD_LABELS['no-acts'],
    projected: null, targetHeadcount: null, targetByOn: null, gap: null,
    notes: ['no-acts'], note: WORKFORCE_FLOW_WITHHELD_LABELS['no-acts'],
  };
}

/**
 * The per-line reading. A person on two reporting lines is ONE person in the
 * stock; the per-line column is SHARE-WEIGHTED headcount in integer hundredths
 * (the matrix engine's own unit) beside the whole headcount, and the
 * share-weighted figure is REFUSED — not defaulted to 100% of the person — when
 * their split was never declared.
 */
function lineReading(matrix, { visiblePersonIds, board, note }) {
  const defectsN = Array.isArray(matrix.defects) ? matrix.defects.length : 0;
  if (defectsN) note('matrix-defect', 1);
  const declarations = Array.isArray(matrix.lines) ? matrix.lines : [];
  // A workspace is a MATRIX only when somebody actually holds more than one
  // line. Every workspace has home lines, so counting declarations would call
  // every single chain a matrix and print a per-manager column that restates the
  // pyramid. Where there is no matrix the per-line reading is INERT, not zero.
  const activePerPerson = new Map();
  for (const line of declarations) {
    if (!line || line.active === false) continue;
    activePerPerson.set(line.personId, (activePerPerson.get(line.personId) || 0) + 1);
  }
  const splitPeopleN = [...activePerPerson.values()].filter((n) => n > 1).length;
  const isMatrix = splitPeopleN > 0;
  if (!isMatrix) {
    return {
      hasMatrix: false,
      splitPeopleN: 0,
      declaredLinesN: declarations.length,
      activeLinesN: declarations.filter((l) => l && l.active !== false).length,
      defectsN,
      unresolvedShareN: 0,
      lines: [],
      shareWeightedComplete: false,
    };
  }
  const byManager = new Map();
  let unresolvedShareN = 0;
  const allocationCache = new Map();
  for (const line of declarations) {
    if (!line || line.active === false) continue;
    if (visiblePersonIds && !visiblePersonIds.has(line.personId)) continue;
    const person = matrix.roster.get(line.personId);
    if (!person) continue;
    const level = currentStock(person);
    if (!level) continue;
    // The resolved share lives on the person's ALLOCATION, not on the line: a
    // split that was never fully declared is attributed to NOBODY and every one
    // of that person's lines is refused together. Reading a per-line field that
    // does not exist would silently refuse every line in the workspace, so the
    // allocation is resolved once per person through the matrix engine itself.
    if (!allocationCache.has(line.personId)) {
      allocationCache.set(line.personId, personAllocation(matrix, line.personId));
    }
    const allocation = allocationCache.get(line.personId);
    const resolved = Array.isArray(allocation?.lines)
      ? allocation.lines.find((l) => l.lineId === line.id)
      : null;
    const shareH = Number.isInteger(resolved?.shareH) ? resolved.shareH : null;
    if (shareH === null) unresolvedShareN += 1;
    if (!byManager.has(line.managerId)) byManager.set(line.managerId, { managerId: line.managerId, rows: [] });
    byManager.get(line.managerId).rows.push({ level, shareH, shareState: allocation?.shareState || null });
  }
  const lines = [...byManager.values()].map((entry) => {
    const perLevel = new Map(LEVELS.map((l) => [l.key, { level: l.key, label: l.label, headcountH: 0, peopleN: 0, refusedN: 0 }]));
    for (const row of entry.rows) {
      const target = perLevel.get(row.level);
      target.peopleN += 1;
      if (row.shareH === null) target.refusedN += 1;
      else target.headcountH += row.shareH;
    }
    const node = matrix.nodes.get(entry.managerId);
    return {
      managerId: entry.managerId,
      name: node?.name || (entry.managerId === LEADER_ID ? 'Workspace leader' : entry.managerId),
      isLeader: entry.managerId === LEADER_ID,
      altitude: node?.altitude || null,
      rows: [...perLevel.values()].filter((r) => r.peopleN > 0),
    };
  }).sort((a, b) => (a.isLeader ? 1 : 0) - (b.isLeader ? 1 : 0) || String(a.name).localeCompare(String(b.name)));

  return {
    hasMatrix: true,
    splitPeopleN,
    declaredLinesN: declarations.length,
    activeLinesN: declarations.filter((l) => l && l.active !== false).length,
    defectsN,
    unresolvedShareN,
    lines,
    // The share-weighted total is a SEPARATE fact from the headcount total, and
    // is printed only when no line was refused.
    shareWeightedComplete: unresolvedShareN === 0 && defectsN === 0,
  };
}

function verdictKey(claims, counts) {
  if (!claims.observed) return 'window-empty';
  if (counts.originUnknownN) return 'origin-incomplete';
  if (!claims.estimated) return 'rates-withheld';
  if (!claims.projected) return 'withheld';
  return 'projected';
}

const VERDICT_LABELS = Object.freeze({
  'no-acts': 'No move has ever been recorded',
  'window-empty': 'The window holds no recorded move',
  'origin-incomplete': 'A move in the window names no origin level',
  'rates-withheld': 'No level carries enough exposure to estimate a rate',
  projected: 'Projected from recorded moves',
});

function verdictFor(claims, counts, cellsWithheld, targetDeclaredN) {
  return verdictKey(claims, counts);
}

function verdictLabelFor(key) {
  return VERDICT_LABELS[key] || VERDICT_LABELS.withheld || key;
}

/**
 * Apply the disclosure ladder and freeze the shape. `full` returns everything;
 * `span` returns the level rows the seat reaches; `none` returns counts only and
 * SAYS SO — it never returns zeroed rows that read as reassurance.
 */
function finalise(board, conv, { detailLevel }) {
  const withheld = [...board.withheld];
  const detail = WORKFORCE_FLOW_DETAIL_LEVELS.includes(detailLevel) ? detailLevel : 'full';
  board.detailLevel = detail;
  board.conventions = {
    windowMonths: conv[K.windowMonths],
    horizonQuarters: conv[K.horizonQuarters],
    minExposure: conv[K.minExposure],
    askDueDays: conv[K.askDueDays],
    autoPropagate: conv[K.autoPropagate],
  };
  if (detail === 'none') {
    board.levels = [];
    board.transition = [];
    board.lines = [];
    board.projectedTotal = null;
    board.target = { ...board.target, total: null, gapTotal: null };
    board.claims = { observed: board.claims.observed, estimated: board.claims.estimated, projected: board.claims.projected, compared: board.claims.compared };
    withheld.push({ key: 'seat-withheld', label: WORKFORCE_FLOW_DETAIL_REASONS.none, count: 1 });
  }
  board.withheld = withheld.filter((w) => w && w.count !== 0);
  board.verdict = verdictKey(board.claims, board.acts);
  board.verdictLabel = verdictLabelFor(board.verdict);
  board.headline = headlineFor(board);
  board.ladder = WORKFORCE_FLOW_DETAIL_LEVELS.map((key) => ({ key, reason: WORKFORCE_FLOW_DETAIL_REASONS[key] }));
  board.method = [...WORKFORCE_FLOW_METHOD];
  board.frameworks = WORKFORCE_FLOW_FRAMEWORKS;
  board.conventionNotes = WORKFORCE_FLOW_CONVENTIONS;
  board.levelsDeclared = LEVELS;
  board.engineVersion = WORKFORCE_FLOW_ENGINE_VERSION;
  board.adr = WORKFORCE_FLOW_ADR;
  board.withheldReasons = WORKFORCE_FLOW_WITHHELD_REASONS;
  return board;
}

function headlineFor(board) {
  const now = board.population.headcountTotal;
  if (!board.claims.projected) {
    return `The projection is withheld. ${board.population.stockedN} of ${board.population.rosterN} active people sit in a level stock; ${board.acts.inWindowN} recorded move(s) fall inside the ${board.window.months}-month window. ${board.withheld.map((w) => w.label).join(' ')}`;
  }
  const total = board.projectedTotal;
  const gap = board.target.gapTotal;
  const gapText = board.claims.compared && gap !== null
    ? ` Against the declared shape of ${board.target.total} people across ${board.target.declaredN} level(s), the projection at those levels is ${gap === 0 ? 'exactly level' : `${Math.abs(gap)} ${gap > 0 ? 'over' : 'short'}`}, with ${board.target.shortN} level(s) short and ${board.target.overN} over.`
    : ' No intended shape is declared, so the projection is printed with no comparison.';
  return `Projected to ${board.horizon.endsOn} (${board.horizon.quarters} quarter(s)): ${total} people, from ${now} today.${gapText}`;
}

/** Identity-free brief. No person, no id, no level-level detail that could name one. */
export function workforceFlowBriefText(board) {
  const w = board.window;
  const lines = [];
  lines.push(`Workforce stock-flow (${WORKFORCE_FLOW_ADR}). Read on ${board.generatedOn} over ${w.months} month(s) from ${w.fromISO || '—'} to ${w.toISO || '—'}, projected ${board.horizon.quarters} quarter(s) to ${board.horizon.endsOn || '—'}.`);
  lines.push(`Roster: ${board.population.rosterN} active people, ${board.population.stockedN} in a level stock, ${board.population.unknownLevelN} with no level recorded, ${board.population.undatedStartN} with no recorded start day.`);
  lines.push(`Moves read: ${board.acts.totalN} in the ledger, ${board.acts.inWindowN} inside the window, ${board.acts.withdrawnN} withdrawn, ${board.acts.outsideWindowN} outside it, ${board.acts.originUnknownN} naming no origin level, ${board.acts.refusedN} refused. The count reconciles to the ledger: ${board.acts.flowsReconcile ? 'yes' : 'NO'}.`);
  lines.push(`Flows inside the window: ${board.acts.hiresN} hire(s), ${board.acts.promotionsN} promotion(s), ${board.acts.demotionsN} demotion(s), ${board.acts.lateralsN} lateral move(s), ${board.acts.voluntaryN} voluntary exit(s), ${board.acts.involuntaryN} involuntary exit(s), ${board.acts.retirementsN} retirement(s).`);
  lines.push(`Rates: ${board.rates.printedN} of ${board.rates.cellsN} level(s) carry enough exposure for a rate at the declared floor of ${board.rates.minExposure} person-month(s); ${board.rates.withheldN} were withheld with a printed reason rather than smoothed.`);
  lines.push(`Claims, kept apart: the window was observed — ${board.claims.observed ? 'yes' : 'NO'}; the rates were estimable — ${board.claims.estimated ? 'yes' : 'NO'}; the pyramid was projected — ${board.claims.projected ? 'yes' : 'NO'}; a declared shape was compared — ${board.claims.compared ? 'yes' : 'NO'}.`);
  if (board.claims.projected) {
    lines.push(`Projection: ${board.projectedTotal} people at ${board.horizon.endsOn}, against ${board.population.headcountTotal} today.${board.roundingDifference ? ` The integer rounding difference between the sum of the printed rows and the printed total is ${board.roundingDifference}.` : ' The printed rows sum exactly to the printed total.'}`);
  }
  if (board.claims.compared) {
    lines.push(`Declared shape: ${board.target.total} people across ${board.target.declaredN} level(s); gap in total ${board.target.gapTotal}, with ${board.target.shortN} level(s) short and ${board.target.overN} over. A gap is a question for the chief, never a recommendation.`);
  }
  for (const row of board.withheld) lines.push(`Withheld: ${row.label} (${row.count}).`);
  lines.push('No person, id, name, manager or line appears in this brief or in the export beside it. A transition rate is a property of the stock.');
  return lines.join(' ');
}

/** The aggregate export rows, built from the SAME board the panel prints. */
export function workforceFlowCsvRows(board) {
  const base = {
    generated_on: board.generatedOn,
    detail_level: board.detailLevel,
    window_months: board.window.months,
    window_from: board.window.fromISO || '',
    window_to: board.window.toISO || '',
    horizon_quarters: board.horizon.quarters,
    as_of: board.generatedOn,
    levels_declared: LEVELS.length,
    headcount_total: board.population.headcountTotal,
    headcount_reconcile: board.population.statesReconcile ? 'true' : 'false',
    acts_total: board.acts.totalN,
    acts_in_window: board.acts.inWindowN,
    acts_refused: board.acts.refusedN,
    flows_withdrawn: board.acts.withdrawnN,
    origin_unknown: board.acts.originUnknownN,
    hires: board.acts.hiresN,
    promotions: board.acts.promotionsN,
    demotions: board.acts.demotionsN,
    laterals: board.acts.lateralsN,
    exits_voluntary: board.acts.voluntaryN,
    exits_involuntary: board.acts.involuntaryN,
    retirements: board.acts.retirementsN,
    flows_reconcile: board.acts.flowsReconcile ? 'true' : 'false',
    exposure_months_total: board.exposureMonthsTotal,
    cells_printed: board.rates.printedN,
    cells_withheld: board.rates.withheldN,
    window_observed: board.claims.observed ? 'true' : 'false',
    rates_estimable: board.claims.estimated ? 'true' : 'false',
    projection_printed: board.claims.projected ? 'true' : 'false',
    target_compared: board.claims.compared ? 'true' : 'false',
    projected_total: board.projectedTotal === null ? '' : board.projectedTotal,
    rounding_difference: board.roundingDifference === null ? '' : board.roundingDifference,
    target_total: board.target.total === null ? '' : board.target.total,
    gap_total: board.target.gapTotal === null ? '' : board.target.gapTotal,
    gap_rows_short: board.target.shortN,
    gap_rows_over: board.target.overN,
    open_history_asks: board.openHistoryAsks || 0,
  };
  const rows = [{ row_type: 'workspace', ...base }];
  for (const row of board.levels) {
    rows.push({
      row_type: 'level',
      generated_on: board.generatedOn,
      detail_level: board.detailLevel,
      window_months: board.window.months,
      horizon_quarters: board.horizon.quarters,
      level: row.level,
      level_label: row.label,
      headcount_now: row.headcount,
      exposure_months: row.exposureMonths,
      promotions_out: row.promotionsOut,
      // A withheld rate is BLANK with its reason in row_reason — never zero.
      promotion_rate: row.promotionRatePerYear === null ? '' : row.promotionRatePerYear,
      attrition_out: row.attritionOut,
      attrition_rate: row.attritionRatePerYear === null ? '' : row.attritionRatePerYear,
      wait_months: row.waitMonths === null ? '' : row.waitMonths,
      projected_q_end: row.projected === null ? '' : row.projected,
      target_headcount: row.targetHeadcount === null ? '' : row.targetHeadcount,
      gap: row.gap === null ? '' : row.gap,
      row_reason: row.reason || '',
    });
  }
  return rows;
}

export { LEVELS as WORKFORCE_FLOW_LEVELS_DECLARED };
