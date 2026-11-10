/**
 * app/core/domain/lineActivity.js — the Matrix Line Activity Reconciliation
 * (ADR-0160, Schema v130 unchanged, `#/matrix?panel=activity`, CSV scope #120).
 *
 * THE DUTY. ADR-0158 answers what each declared line was CHARGED across a named
 * period. Nothing answers what each line DID. Two structures the matrix creates
 * are therefore invisible:
 *
 *   a SILENT line — declared at 40% of a person, charged share-days for a whole
 *   quarter, and it originated no dated act about her at all: nobody briefed
 *   her, no manager answered for the share, no term was re-affirmed, not one
 *   obligation the line left behind was settled. On paper she is 40% theirs.
 *   Nobody is doing anything with it.
 *
 *   an OVER-ACTIVE line — declared at 10%, and it originated a larger share of
 *   her line-addressed acts than every other line put together: its managerial
 *   demands are arriving far out of proportion with the capacity it holds.
 *
 * WHAT THE TWO SIDES ARE, SAID PLAINLY
 * ------------------------------------
 *   declared   exact integer share-days per priced line, from ADR-0158's own
 *              time-weighted ledger — this module re-prices nothing.
 *   observed   dated acts a LINE HOLDER originated about this person inside the
 *              SAME window: an onboarding brief (ADR-0150), a line consent
 *              answer (ADR-0148), a re-affirmation answer (ADR-0157) and a
 *              line-exit remedy (ADR-0152).
 *
 * WHY NOT WORK ITEMS. A completed item names the PERSON and not the line it
 * served: a person on three lines makes every item she touches reach all three.
 * Attributing one item to one line would be an allocation this workspace
 * invented — so the module attributes nothing that the record does not already
 * say. Each act carries its originating manager and its own day; that is exact.
 *
 * NOTHING IS STORED. Every figure is derived on read from the live matrix, the
 * dated declarations and the line-addressed acts. No collection is added, no
 * rule asks anybody anything yet, and no declaration is ever retuned here.
 */

import { dayKey } from '../time.js';
import { activeSeat, buildSeats } from './seat.js';
import { buildMatrix, matrixLineScope } from './matrix.js';
import { buildLinePeriodAllocation } from './linePeriodAllocation.js';
import {
  LINE_ACTIVITY_BOUNDS,
  LINE_ACTIVITY_CONVENTIONS,
  LINE_ACTIVITY_ENGINE_VERSION,
  LINE_ACTIVITY_METHOD,
  LINE_ACTIVITY_PLACEMENTS,
  LINE_ACTIVITY_SOURCES,
  LINE_ACTIVITY_VERDICTS,
  lineActivitySeverity,
  lineActivityVerdict,
} from './lineActivityRegistry.js';

const isInt = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Exact largest-remainder allocation of 1000 per-mille over integer weights.
 * Returns `null` when there is nothing to allocate (a zero denominator is an
 * absence, never a set of zeros). Every returned map sums to exactly 1000.
 */
export function permilleAllocate(entries) {
  const list = (entries || []).map((e) => ({
    key: e.key,
    weight: isInt(e.weight) && e.weight > 0 ? e.weight : 0,
  }));
  const total = list.reduce((acc, e) => acc + e.weight, 0);
  if (!(total > 0)) return null;
  const out = new Map();
  const remainders = [];
  let assigned = 0;
  for (const entry of list) {
    const scaled = entry.weight * 1000;
    const base = Math.floor(scaled / total);
    out.set(entry.key, base);
    assigned += base;
    remainders.push({ key: entry.key, rem: scaled - base * total });
  }
  let left = 1000 - assigned;
  remainders.sort((a, b) => b.rem - a.rem || String(a.key).localeCompare(String(b.key)));
  for (let i = 0; i < remainders.length && left > 0; i += 1) {
    out.set(remainders[i].key, (out.get(remainders[i].key) || 0) + 1);
    left -= 1;
  }
  return out;
}

/** The seat's visibility, stated once so the screen, the brief and the export agree. */
function seatScope(state, matrix, now, settings) {
  const lineScope = matrixLineScope(matrix);
  const built = buildSeats(state, { now, settings, lineScope: lineScope.byManager });
  const seat = activeSeat(built);
  if (!seat || seat.fullAccess) {
    return { seat, visible: () => true, scopeLabel: 'the whole workspace' };
  }
  const inTree = (personId) => Boolean(seat.scope?.has?.(personId));
  const inLines = (personId) => Boolean(seat.lineScope?.has?.(personId));
  return {
    seat,
    visible: (personId) => personId === seat.id || inTree(personId) || inLines(personId),
    scopeLabel: `${seat.label || seat.id}’s span and its declared lines`,
  };
}

function worstVerdict(keys) {
  const list = [...new Set((keys || []).filter(Boolean))];
  if (!list.length) return lineActivityVerdict('aligned');
  return list
    .map((key) => lineActivityVerdict(key) || { key, severity: 99, label: key, tone: 'neutral', open: false, detail: '' })
    .sort((a, b) => a.severity - b.severity)[0];
}

/**
 * Every dated act a line holder originated about a person, read from the four
 * scored collections. Purely a read: nothing is normalised, repaired or inferred
 * here — the load gate already dropped anything missing its line, person,
 * manager or date.
 */
export function collectLineActs(state = {}) {
  const acts = [];
  for (const source of LINE_ACTIVITY_SOURCES) {
    const rows = Array.isArray(state?.[source.collection]) ? state[source.collection] : [];
    for (const row of rows) {
      if (!row || !row.id) continue;
      const personId = row.personId || null;
      const managerId = row.managerId || null;
      if (!personId || !managerId) continue;
      const on = dayKey(row[source.datePath]);
      if (!on) continue;
      acts.push({
        key: `${source.key}:${row.id}`,
        source: source.key,
        sourceLabel: source.label,
        declarationId: row.declarationId || null,
        personId,
        managerId,
        on,
        outcome: row.outcome || '',
      });
    }
  }
  acts.sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : String(a.key).localeCompare(String(b.key))));
  return acts;
}

/** The whole reconciliation for one named period, under the acting seat. */
export function buildLineActivity(state = {}, { from = null, to = null, now = new Date(), settings = null } = {}) {
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const today = dayKey(at) || new Date().toISOString().slice(0, 10);
  const cfg = settings || state.settings || {};
  const declared = buildLinePeriodAllocation(state, { from, to, now: at, settings: cfg });
  const window = declared.window;
  const matrix = buildMatrix(state, { now: at, settings: cfg });
  const { seat, visible, scopeLabel } = seatScope(state, matrix, at, cfg);

  /* ------------------------------------------------------------- the acts */
  // Only acts whose OWN recorded day falls inside the window are read. An act
  // dated outside it belongs to another period, and stretching the window to
  // reach it would compare two different quarters.
  const actsAll = window.valid
    ? collectLineActs(state).filter((act) => act.on >= window.from && act.on <= window.to && visible(act.personId))
    : [];
  const actsRead = actsAll.slice(0, LINE_ACTIVITY_BOUNDS.acts);
  const actsOmittedN = Math.max(0, actsAll.length - actsRead.length);

  /* ----------------------------------------------------------- the ledger */
  const rows = [];
  const people = [];
  for (const person of declared.persons || []) {
    if (!visible(person.personId)) continue;
    const allLines = person.lines || [];
    const priced = allLines.filter((l) => l.inWindow && l.state === 'computed' && isInt(l.shareDaysH));
    const refusedInWindow = allLines.filter((l) => l.inWindow && l.refusesTotal);
    if (!priced.length && !refusedInWindow.length) continue;
    const personRefused = !window.valid || person.totals?.shareDaysH === null || refusedInWindow.length > 0;
    const homeManagerId = person.homeManagerId || null;

    const personActs = actsRead.filter((act) => act.personId === person.personId);
    const attributedByLine = new Map(priced.map((l) => [l.declarationId, 0]));
    const placements = { line: 0, home: 0, ambiguous: 0, unpriced: 0, other: 0 };
    const sourceCounts = new Map();
    for (const act of personActs) {
      if (homeManagerId && act.managerId === homeManagerId) { placements.home += 1; continue; }
      const candidates = priced.filter((l) => l.managerId === act.managerId);
      if (candidates.length === 1) {
        const id = candidates[0].declarationId;
        attributedByLine.set(id, (attributedByLine.get(id) || 0) + 1);
        placements.line += 1;
        sourceCounts.set(act.source, (sourceCounts.get(act.source) || 0) + 1);
        continue;
      }
      if (candidates.length > 1) { placements.ambiguous += 1; continue; }
      // No priced line for this manager. Either the manager holds a declared
      // line for the person that the period could not price — which refuses the
      // comparison rather than losing the act — or they hold none at all.
      const declaredToManager = allLines.some((l) => l.managerId === act.managerId && l.inWindow);
      if (declaredToManager) placements.unpriced += 1;
      else placements.other += 1;
    }

    const declaredPermille = permilleAllocate(priced.map((l) => ({ key: l.declarationId, weight: l.shareDaysH })));
    const observedPermille = permilleAllocate(priced.map((l) => ({
      key: l.declarationId,
      weight: attributedByLine.get(l.declarationId) || 0,
    })));
    const soleLine = priced.length === 1;
    const sharesReconcile = personRefused || soleLine || !priced.length || placements.line === 0
      ? null
      : Boolean(declaredPermille && observedPermille
        && [...declaredPermille.values()].reduce((a, b) => a + b, 0) === 1000
        && [...observedPermille.values()].reduce((a, b) => a + b, 0) === 1000);

    const lineRows = priced.map((line) => {
      const attributed = attributedByLine.get(line.declarationId) || 0;
      const declaredPm = declaredPermille ? declaredPermille.get(line.declarationId) : null;
      const observedPm = observedPermille ? observedPermille.get(line.declarationId) : null;
      const band = LINE_ACTIVITY_BOUNDS.shareBandPermille;
      let key = 'aligned';
      let reason = '';
      if (!window.valid) {
        key = 'refused';
        reason = `The period is refused, so nothing is compared: ${window.refuseReason}`;
      } else if (placements.unpriced > 0) {
        key = 'refused';
        reason = `${placements.unpriced} act(s) came from a manager whose declared line for this person the period could NOT price. The observed side is complete and the declared side is not, so no share is compared.`;
      } else if (soleLine) {
        key = 'sole-line';
        reason = 'This is the only priced line inside the window, so it necessarily receives every attributed act. There is no second share to compare and none is manufactured.';
      } else if (personRefused) {
        key = 'refused';
        reason = 'The declared side for this person is refused for the period, so there is nothing to compare the activity against. The refusal is printed on the period ledger, not paraphrased here.';
      } else if (placements.line < LINE_ACTIVITY_BOUNDS.minAttributedActs) {
        key = 'insufficient';
        reason = `${placements.line} attributed act(s) inside the window, below the declared floor of ${LINE_ACTIVITY_BOUNDS.minAttributedActs}. A count this small cannot carry a ${band / 10}-point band.`;
      } else if (placements.ambiguous > placements.line) {
        key = 'unattributable-dominant';
        reason = `${placements.ambiguous} act(s) came from a manager holding two of this person’s priced lines, against ${placements.line} assigned to exactly one. The comparable minority is flagged rather than published as the whole.`;
      } else if (attributed === 0) {
        key = 'silent-line';
        reason = 'Charged share-days across the period and originated no dated act about this person inside the window. A line on paper — or a manager working outside this record, which the same sentence names.';
      } else {
        const gap = (observedPm === null || declaredPm === null) ? null : observedPm - declaredPm;
        if (gap === null) {
          key = 'insufficient';
          reason = 'No share could be allocated on one side of this line, so no gap is printed.';
        } else if (Math.abs(gap) <= band) {
          key = 'aligned';
          reason = `Observed ${observedPm} per-mille against declared ${declaredPm} — inside the declared ±${band} band. Agreement inside a convention, not proof that the effort matches.`;
        } else if (gap > 0) {
          key = 'over-active';
          reason = `Observed ${observedPm} per-mille against declared ${declaredPm} — ${gap} per-mille above the declaration, beyond the ±${band} band. This line is originating a larger share of the person’s line-addressed acts than the capacity it holds.`;
        } else {
          key = 'under-active';
          reason = `Observed ${observedPm} per-mille against declared ${declaredPm} — ${Math.abs(gap)} per-mille below the declaration, beyond the ±${band} band. The line is charged a larger share than the activity arriving under it.`;
        }
      }
      return {
        declarationId: line.declarationId,
        managerId: line.managerId,
        managerName: line.managerName,
        kind: line.kind,
        shareDaysH: line.shareDaysH,
        inWindowDays: line.daysInWindow,
        declaredPermille: declaredPm,
        observedN: attributed,
        observedPermille: observedPm,
        gapPermille: ['aligned', 'over-active', 'under-active'].includes(key) && isInt(observedPm) && isInt(declaredPm)
          ? observedPm - declaredPm
          : null,
        verdict: key,
        verdictLabel: lineActivityVerdict(key)?.label || key,
        verdictTone: lineActivityVerdict(key)?.tone || 'neutral',
        verdictOpen: Boolean(lineActivityVerdict(key)?.open),
        reason,
      };
    });

    const refusedRows = refusedInWindow.map((l) => ({
      declarationId: l.declarationId,
      managerId: l.managerId,
      managerName: l.managerName,
      kind: l.kind,
      shareDaysH: null,
      declaredPermille: null,
      observedN: null,
      observedPermille: null,
      gapPermille: null,
      verdict: 'refused',
      verdictLabel: lineActivityVerdict('refused').label,
      verdictTone: 'bad',
      verdictOpen: true,
      reason: l.reason || 'The period ledger refused this line.',
    }));

    const allLineRows = [...lineRows, ...refusedRows];
    const worst = worstVerdict(allLineRows.map((r) => r.verdict));
    const sources = [...sourceCounts.entries()]
      .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
      .map(([source, n]) => ({
        source,
        n,
        label: LINE_ACTIVITY_SOURCES.find((s) => s.key === source)?.label || source,
      }));

    people.push({
      personId: person.personId,
      personName: person.personName,
      homeManagerId,
      homeManagerName: person.homeManagerName,
      altitude: person.altitude,
      declaredShareDaysH: person.totals?.shareDaysH ?? null,
      pricedLinesN: priced.length,
      refusedLinesN: refusedRows.length,
      actsN: personActs.length,
      attributedN: placements.line,
      homeN: placements.home,
      ambiguousN: placements.ambiguous,
      unpricedN: placements.unpriced,
      otherN: placements.other,
      sources,
      sharesReconcile,
      lines: allLineRows,
      verdict: worst.key,
      verdictLabel: worst.label,
      verdictTone: worst.tone,
      verdictOpen: Boolean(worst.open),
      verdictReason: worst.detail,
    });
    rows.push(...allLineRows.map((line) => ({ ...line, personId: person.personId, personName: person.personName })));
  }

  people.sort((a, b) => lineActivitySeverity(a.verdict) - lineActivitySeverity(b.verdict)
    || String(a.personName).localeCompare(String(b.personName)));

  /* -------------------------------------------------------- the roll-up */
  // The SAME line holders the matrix engine names, never a second roster. A
  // holder row counts LINES and PEOPLE; it never averages shares, because two
  // lines' per-mille shares have different denominators.
  const holderMap = new Map();
  for (const row of rows) {
    if (!row.managerId) continue;
    let holder = holderMap.get(row.managerId);
    if (!holder) {
      holder = {
        managerId: row.managerId,
        managerName: row.managerName,
        linesN: 0,
        comparedN: 0,
        driftedN: 0,
        alignedN: 0,
        refusedN: 0,
        insufficientN: 0,
        soleLineN: 0,
        shareDaysH: 0,
        shareDaysRefused: false,
        attributedN: 0,
        people: new Set(),
      };
      holderMap.set(row.managerId, holder);
    }
    holder.linesN += 1;
    holder.people.add(row.personId);
    if (['aligned', 'over-active', 'under-active', 'silent-line'].includes(row.verdict)) holder.comparedN += 1;
    if (row.verdict === 'aligned') holder.alignedN += 1;
    if (['over-active', 'under-active', 'silent-line'].includes(row.verdict)) holder.driftedN += 1;
    if (row.verdict === 'refused') { holder.refusedN += 1; holder.shareDaysRefused = true; }
    if (row.verdict === 'insufficient' || row.verdict === 'unattributable-dominant') holder.insufficientN += 1;
    if (row.verdict === 'sole-line') holder.soleLineN += 1;
    if (isInt(row.shareDaysH) && !holder.shareDaysRefused) holder.shareDaysH += row.shareDaysH;
    if (isInt(row.observedN)) holder.attributedN += row.observedN;
  }
  const holders = [...holderMap.values()]
    .map((h) => ({
      managerId: h.managerId,
      managerName: h.managerName,
      linesN: h.linesN,
      peopleN: h.people.size,
      comparedN: h.comparedN,
      driftedN: h.driftedN,
      alignedN: h.alignedN,
      refusedN: h.refusedN,
      insufficientN: h.insufficientN,
      soleLineN: h.soleLineN,
      attributedN: h.attributedN,
      shareDaysH: h.shareDaysRefused ? null : h.shareDaysH,
      shareDaysRefusedReason: h.shareDaysRefused
        ? 'At least one line this manager holds could not be priced for the period, so the share-day total for this holder is refused rather than printed over the rows that happen to carry a number.'
        : null,
      driftRatePermille: h.comparedN >= LINE_ACTIVITY_BOUNDS.minAttributedActs
        ? Math.round((h.driftedN * 1000) / h.comparedN)
        : null,
      driftRateRefusedReason: h.comparedN >= LINE_ACTIVITY_BOUNDS.minAttributedActs
        ? null
        : `Below the declared floor of ${LINE_ACTIVITY_BOUNDS.minAttributedActs} comparable lines, so no rate is printed — a proportion of two is arithmetic, not a reading.`,
    }))
    .sort((a, b) => b.driftedN - a.driftedN || String(a.managerName).localeCompare(String(b.managerName)));

  /* ------------------------------------------------------------- board */
  const countOf = (key) => rows.filter((r) => r.verdict === key).length;
  const outcomes = {
    alignedN: countOf('aligned'),
    overActiveN: countOf('over-active'),
    underActiveN: countOf('under-active'),
    silentLineN: countOf('silent-line'),
    unattributableN: countOf('unattributable-dominant'),
    insufficientN: countOf('insufficient'),
    refusedN: countOf('refused'),
    soleLineN: countOf('sole-line'),
  };
  const verdictSum = Object.values(outcomes).reduce((a, b) => a + b, 0);
  const board = {
    peopleN: people.length,
    linesN: rows.length,
    pricedLinesN: rows.filter((r) => isInt(r.shareDaysH)).length,
    ...outcomes,
    comparedN: outcomes.alignedN + outcomes.overActiveN + outcomes.underActiveN + outcomes.silentLineN,
    driftedN: outcomes.overActiveN + outcomes.underActiveN + outcomes.silentLineN,
    actsN: actsRead.length,
    actsOmittedN,
    attributedN: people.reduce((acc, p) => acc + p.attributedN, 0),
    homeN: people.reduce((acc, p) => acc + p.homeN, 0),
    ambiguousN: people.reduce((acc, p) => acc + p.ambiguousN, 0),
    unpricedN: people.reduce((acc, p) => acc + p.unpricedN, 0),
    otherN: people.reduce((acc, p) => acc + p.otherN, 0),
    peopleWithNoActN: people.filter((p) => p.actsN === 0).length,
    shareDaysH: declared.board?.shareDaysH ?? null,
    shareDaysRefused: Boolean(declared.board?.shareDaysRefused),
    shareDaysRefusedReason: declared.board?.shareDaysRefusedReason || null,
    bandPermille: LINE_ACTIVITY_BOUNDS.shareBandPermille,
    actFloor: LINE_ACTIVITY_BOUNDS.minAttributedActs,
    // TWO SEPARATE CLAIMS, never one reassurance:
    //   countsReconcile  every printed line carries exactly one verdict, and the
    //                    verdict counts add to the printed line count;
    //   sharesReconcile  every person whose share was compared had both sides
    //                    allocate to exactly 1000 per-mille.
    countsReconcile: verdictSum === rows.length,
    sharesReconcile: people.every((p) => p.sharesReconcile !== false),
    rowsOmittedN: Math.max(0, rows.length - LINE_ACTIVITY_BOUNDS.rows),
  };

  const seatView = seat
    ? { id: seat.id, label: seat.label || seat.id, rank: seat.rank ?? null, fullAccess: Boolean(seat.fullAccess) }
    : { id: null, label: 'No operating seat', rank: null, fullAccess: false };

  return {
    engineVersion: LINE_ACTIVITY_ENGINE_VERSION,
    generatedOn: today,
    window,
    isMatrix: people.length > 0,
    seat: seatView,
    scopeLabel,
    conventions: LINE_ACTIVITY_CONVENTIONS,
    method: LINE_ACTIVITY_METHOD,
    placements: LINE_ACTIVITY_PLACEMENTS,
    sources: LINE_ACTIVITY_SOURCES,
    verdicts: LINE_ACTIVITY_VERDICTS,
    people: people.slice(0, LINE_ACTIVITY_BOUNDS.rows),
    rows: rows.slice(0, LINE_ACTIVITY_BOUNDS.rows),
    holders,
    board,
    singleChainNote: people.length
      ? null
      : 'No person in scope holds a second reporting line, so no declaration has activity to be compared against. A single-chain workspace gains no row, no figure and no refusal.',
    declaredEngineVersion: declared.engineVersion,
  };
}

/* ------------------------------------------------------------------ brief */

/** The identity-free brief. Counts and claims only. */
export function lineActivityBriefText(report) {
  if (!report) return '';
  const b = report.board;
  const w = report.window;
  const lines = [];
  lines.push(`Matrix line activity — read from ${report.scopeLabel} on ${report.generatedOn} for the period ${w.from || '?'} to ${w.to || '?'}.`);
  if (!w.valid) {
    lines.push(`The period itself is refused: ${w.refuseReason}`);
    return lines.join(' ');
  }
  if (!report.isMatrix) {
    lines.push(report.singleChainNote);
    return lines.join(' ');
  }
  const band = `${b.bandPermille} per-mille`;
  lines.push(`${b.peopleN} person(s) on ${b.linesN} declared line(s) in scope; ${b.comparedN} line(s) carried enough attributed activity to be compared inside the ±${band} band, and ${b.driftedN} differed beyond it (${b.overActiveN} more active than declared, ${b.underActiveN} less active, ${b.silentLineN} declared with nothing originated at all).`);
  lines.push(`${b.refusedN} line(s) were refused rather than compared, ${b.insufficientN} sat below the declared act floor of ${b.actFloor}, ${b.unattributableN} were dominated by acts that could not be assigned to one declaration and ${b.soleLineN} were the person's only priced line.`);
  lines.push(`${b.attributedN} act(s) were attributed to exactly one line inside the window, ${b.homeN} came from the home manager and are out of scope, ${b.ambiguousN} came from a manager holding two of the person's priced lines, ${b.unpricedN} reached a line the period could not price and ${b.otherN} came from managers holding no declared line for the person.`);
  if (b.shareDaysRefused) {
    lines.push(`The declared share-day total is REFUSED: ${b.shareDaysRefusedReason}`);
  } else {
    lines.push(`Declared charge across the period: ${b.shareDaysH} share-days.`);
  }
  lines.push(`Counts reconcile: ${b.countsReconcile ? 'verified' : 'NOT verified — treat every figure as unverified and report it'}. Shares reconcile to 1000 per-mille wherever a comparison was made: ${b.sharesReconcile ? 'verified' : 'NOT verified'}.`);
  lines.push('The observed side counts dated acts a line holder originated about the person — a brief, a consent answer, a re-affirmation, a settled obligation — not hours and not work items: acts differ in weight, so this is a screening reading about which lines are actually being run, never a measure of managerial effort or quality. No declaration was changed, no manager was scored and no person was rated.');
  return lines.join(' ');
}

/* -------------------------------------------------------------------- CSV */

/** Aggregate-only export: one summary row plus one row per declared line kind. */
export function lineActivityCsvRows(report) {
  if (!report) return [];
  const b = report.board;
  const w = report.window;
  const base = {
    period_from: w.from || '',
    period_to: w.to || '',
    period_days: w.valid ? w.days : '',
    band_permille: b.bandPermille,
    act_floor: b.actFloor,
  };
  const kinds = [...new Set(report.rows.map((r) => (r.kind ? String(r.kind) : '')))].filter(Boolean).sort();
  const bucket = (kind) => {
    const rows = kind === null ? report.rows : report.rows.filter((r) => r.kind === kind);
    const countOf = (key) => rows.filter((r) => r.verdict === key).length;
    const refusedRows = rows.filter((r) => r.verdict === 'refused');
    const priced = rows.filter((r) => isInt(r.shareDaysH));
    const shareDaysH = refusedRows.length ? null : priced.reduce((acc, r) => acc + r.shareDaysH, 0);
    return {
      ...base,
      scope: kind === null ? 'workspace' : 'line-kind',
      line_kind: kind === null ? 'all' : kind,
      lines_n: rows.length,
      priced_lines_n: priced.length,
      compared_n: countOf('aligned') + countOf('over-active') + countOf('under-active') + countOf('silent-line'),
      aligned_n: countOf('aligned'),
      over_active_n: countOf('over-active'),
      under_active_n: countOf('under-active'),
      silent_line_n: countOf('silent-line'),
      unattributable_dominant_n: countOf('unattributable-dominant'),
      insufficient_n: countOf('insufficient'),
      refused_n: countOf('refused'),
      sole_line_n: countOf('sole-line'),
      share_days_h: shareDaysH === null ? '' : shareDaysH,
      attributed_acts_n: rows.reduce((acc, r) => acc + (isInt(r.observedN) ? r.observedN : 0), 0),
      home_acts_n: kind === null ? b.homeN : '',
      ambiguous_acts_n: kind === null ? b.ambiguousN : '',
      unpriced_acts_n: kind === null ? b.unpricedN : '',
      other_acts_n: kind === null ? b.otherN : '',
      counts_reconcile: kind === null ? b.countsReconcile : [
        'aligned', 'over-active', 'under-active', 'silent-line',
        'unattributable-dominant', 'insufficient', 'refused', 'sole-line',
      ].reduce((acc, key) => acc + countOf(key), 0) === rows.length,
      shares_reconcile: kind === null ? b.sharesReconcile : '',
      withheld_reason: shareDaysH === null
        ? 'At least one line of this kind could not be priced for the period, so the share-day total is BLANK rather than a partial sum.'
        : w.valid ? '' : w.refuseReason,
    };
  };
  return [bucket(null), ...kinds.map((kind) => bucket(kind))];
}
