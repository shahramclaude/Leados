/**
 * app/core/domain/budgetExposure.js — the span budget exposure roll-up
 * (ADR-0136). Schema v118 unchanged: this is a READER, not a new store.
 *
 * The duty it serves. A director allocating a fixed envelope across five teams,
 * or a VP forecasting quarterly exposure across divisions, does not ask "which
 * envelopes exist". The terminal already answered that: `#/finance` renders one
 * flat list of every envelope the seat can see. The questions the altitude is
 * actually paid for are:
 *
 *   - What is my span's position, IN EACH CURRENCY, right now (declared
 *     ceilings, recorded actuals, open encumbrances, planned pipeline, forecast
 *     at completion)?
 *   - WHICH of my branches is carrying the overrun, and which is sitting on
 *     declared headroom it will never spend?
 *   - Is the overrun in one branch cancelled by headroom in another? It is not:
 *     a budget envelope is an authority granted to a cost centre, so netting a
 *     breach against a sibling's slack is a silent transfer of authority that
 *     nobody approved. The roll-up prints that refusal instead of netting.
 *   - Where is the ledger UNSOUND — money spent with no recorded actual, open
 *     lines with no price, envelopes with no ceiling, envelopes with no owner?
 *
 * Named frameworks (the module prints them; it does not paraphrase them):
 *  - Encumbrance / commitment accounting: actuals, open commitments and planned
 *    pipeline are three different figures and are never added into one number
 *    that pretends to be known.
 *  - Anthony & Govindarajan (management control): an envelope is an authority
 *    grant to a responsibility centre, so a variance belongs to the centre that
 *    holds the authority — this is why attribution, not a grand total, is the
 *    unit of the reading.
 *  - Goldratt (Theory of Constraints): a bounded review queue dispatched by the
 *    constraint — the worst utilisation first — rather than an alphabetical
 *    list a director scans by eye.
 *  - Statistical disclosure control: above the declared detail ceiling the
 *    envelopes are disclosed as counts, shares and bands, never as named rows,
 *    and a currency total that would let one withheld row be recovered is not
 *    printed as a per-row figure.
 *
 * Honesty boundaries enforced in code, not prose:
 *  - Currencies are NEVER pooled. Every sum is computed inside one currency and
 *    one currency only; there is no FX assumption anywhere in this file.
 *  - An envelope with no ceiling is "tracking only" and is never headroom.
 *  - A ceiling total is a total of DECLARED ceilings and says how many envelopes
 *    it covers; headroom is refused (BLANK, never zero) when any active envelope
 *    in that currency has no ceiling.
 *  - Missing actuals or unpriced open lines make headroom unknowable. Known
 *    amounts remain subtotals; missing amounts are never treated as zero.
 *  - Every envelope is attributed to exactly one bucket or excluded with a
 *    printed reason. Nothing is guessed into a branch.
 *  - Closed and archived envelopes are counted, never summed: they are history.
 *
 * Pure module: no DOM, no storage, no clock beyond the injected `now`. It reuses
 * `evaluateBudget` — the SAME evaluation the finance terminal renders and the
 * SAME watch convention — so the panel and the roll-up cannot disagree.
 */

import { evaluateBudget, formatMoney, DEFAULT_BUDGET_WATCH_PCT } from './finance.js';
import { dayKey } from '../time.js';

export const BUDGET_EXPOSURE_ENGINE_VERSION = 'budget-exposure-2026.11-v3';

export const BUDGET_EXPOSURE_LIMITS = Object.freeze({
  /** Review-queue rows the reading carries. The remainder is counted, never dropped. */
  queue: 24,
  /** Branch rows carried before the rest are counted. */
  branches: 12,
});

export const BUDGET_EXPOSURE_FLOORS = Object.freeze({
  /** Portfolio material floor, shared with RECORD_CLASSES.portfolio.minRank. */
  portfolioRank: 3,
  /** Above this rank, envelope names, amounts and line detail are withheld. */
  detailRank: 4,
});

export const BUDGET_EXPOSURE_BANDS = Object.freeze({
  over: 'over-ceiling',
  watch: 'watch-zone',
  pipeline: 'pipeline-breach',
  within: 'within-ceiling',
  untracked: 'tracking-only',
});

/** Reason codes, worst first. The queue is dispatched in this order. */
export const BUDGET_EXPOSURE_REASONS = Object.freeze([
  { key: 'breach', label: 'Forecast breaches the declared ceiling' },
  { key: 'pipeline-breach', label: 'Planned pipeline would breach the ceiling' },
  { key: 'watch', label: 'In the declared watch zone' },
  { key: 'evidence-debt', label: 'Money spent with no recorded actual' },
  { key: 'unpriced', label: 'Open lines with no committed amount' },
  { key: 'overdue', label: 'Commitments past their expected spend date' },
  { key: 'untracked', label: 'No declared ceiling — tracked, not controlled' },
]);

export const BUDGET_EXPOSURE_METHOD = Object.freeze([
  {
    name: 'Encumbrance accounting (commitment basis)',
    why: 'Recorded actuals, open commitments and planned pipeline stay three separate figures, because each has a different evidentiary status. The forecast at completion is actuals + open commitments; the pipeline is shown beside it, never inside it.',
  },
  {
    name: 'Responsibility-centre variance (Anthony & Govindarajan)',
    why: 'An envelope is an authority grant to a cost centre, so a variance is attributed to the branch that holds the authority. That is why this reading is a table of branches and not one grand total.',
  },
  {
    name: 'No netting across branches or currencies',
    why: 'A breach in one branch is not offset by headroom in another, and one currency is never converted into another. Offsetting either one would be a silent transfer of authority nobody approved.',
  },
  {
    name: 'Constraint-first triage (Goldratt)',
    why: 'The review queue is bounded and dispatched worst-utilisation first, so the row that most needs a decision is the row at the top, not the row whose name sorts first.',
  },
  {
    name: 'Statistical disclosure control',
    why: 'Above the declared detail ceiling the envelopes are disclosed as counts, shares and bands. An envelope name, a line title and an exact per-row amount are item detail; a currency total is an aggregate.',
  },
  {
    name: 'Matrix overlapping accountability (Galbraith)',
    why: 'An additional reporting line makes the whole recorded envelope visible once in that seat’s reading. Capacity shares never divide money, and totals from overlapping seats are never added together: the home cost centre and the matrix manager are two accountabilities over the same envelope, not two envelopes.',
  },
]);

const REASON_RANK = new Map(BUDGET_EXPOSURE_REASONS.map((r, i) => [r.key, i]));

function round2(n) {
  return Math.round(n * 100) / 100;
}

function pctText(ratio) {
  return ratio === null || ratio === undefined ? '—' : `${Math.round(ratio * 1000) / 10}%`;
}

function bandOf(ev) {
  if (ev.breach) return BUDGET_EXPOSURE_BANDS.over;
  if (ev.pipelineBreach) return BUDGET_EXPOSURE_BANDS.pipeline;
  if (ev.watch) return BUDGET_EXPOSURE_BANDS.watch;
  if (!ev.hasLimit) return BUDGET_EXPOSURE_BANDS.untracked;
  return BUDGET_EXPOSURE_BANDS.within;
}

function refusalReport(reason, extra = {}) {
  return {
    ok: false,
    refused: true,
    engineVersion: BUDGET_EXPOSURE_ENGINE_VERSION,
    refusals: [reason],
    counts: {
      envelopes: 0, active: 0, inactive: 0, measured: 0, untracked: 0, breaches: 0,
      watches: 0, pipelineBreaches: 0, evidenceDebt: 0, unpricedEnvelopes: 0,
      overdueEnvelopes: 0, attributed: 0, viaLine: 0, unowned: 0, outOfSpan: 0, ambiguous: 0, branches: 0,
    },
    currencies: [],
    branches: [],
    excluded: [],
    queue: [],
    queueDeferred: 0,
    method: BUDGET_EXPOSURE_METHOD,
    ...extra,
  };
}

/**
 * Which bucket owns this envelope, exactly once.
 *
 *  - `unowned`    — no ownerId: the enterprise root's own envelope. Counted,
 *                   never added to a span total (the access gateway says the
 *                   same thing on the write path).
 *  - `out-of-span`— an owner outside the acting seat's scope. Counted, excluded.
 *  - `ambiguous`  — an owner in more than one direct child span (a corrupted
 *                   tree). Counted, excluded: a guess here would mis-assign
 *                   authority.
 *  - `branch`     — exactly one direct child seat holds the owner.
 *  - `desk`       — the acting seat's own envelope, or a direct report with no
 *                   leadership seat beneath them.
 *  - `matrix-line`— the owner reaches this seat only through an active declared
 *                   additional reporting line. The WHOLE envelope enters this
 *                   seat's reading exactly once; no capacity-share split is
 *                   invented, and the overlap with the home seat is printed.
 */
function attributeEnvelope(budget, seat, built) {
  const ownerId = typeof budget?.ownerId === 'string' && budget.ownerId.trim() ? budget.ownerId.trim() : null;
  if (!ownerId) return { bucket: 'unowned', child: null };
  if (ownerId === seat.id) return { bucket: 'desk', child: null };
  const inTree = seat.scope.has(ownerId);
  const viaLine = !inTree && seat.lineScope instanceof Set && seat.lineScope.has(ownerId);
  if (!inTree && !viaLine) return { bucket: 'out-of-span', child: null };
  // Tree first when both routes exist: two accountabilities over one person do
  // not make two envelopes, and a secondary line never creates another branch.
  if (viaLine) return { bucket: 'matrix-line', child: null };
  const holders = seat.childSeatIds
    .map((id) => built.byId.get(id))
    .filter((child) => child && (child.scope.has(ownerId) || child.id === ownerId));
  if (holders.length > 1) return { bucket: 'ambiguous', child: null };
  if (holders.length === 1) return { bucket: 'branch', child: holders[0] };
  return { bucket: 'desk', child: null };
}

function emptyCurrency(currency) {
  return {
    currency,
    envelopes: 0,
    measured: 0,
    untracked: 0,
    ceiling: 0,
    ceilingsCovered: 0,
    actuals: 0,
    committed: 0,
    planned: 0,
    forecast: 0,
    headroom: null,
    headroomReason: null,
    breaches: 0,
    watches: 0,
    pipelineBreaches: 0,
    evidenceDebt: 0,
    unpricedLines: 0,
    complete: true,
  };
}

function addToCurrency(row, ev) {
  row.envelopes += 1;
  row.actuals = round2(row.actuals + ev.spentKnown);
  row.committed = round2(row.committed + ev.committedOpen);
  row.planned = round2(row.planned + ev.plannedPipeline);
  row.forecast = round2(row.forecast + ev.forecastAtCompletion);
  if (ev.hasLimit) {
    row.measured += 1;
    row.ceilingsCovered += 1;
    row.ceiling = round2(row.ceiling + ev.limit);
  } else {
    row.untracked += 1;
    row.complete = false;
  }
  if (ev.breach) row.breaches += 1;
  if (ev.watch) row.watches += 1;
  if (ev.pipelineBreach) row.pipelineBreaches += 1;
  if (ev.missingActualLines.length) row.evidenceDebt += 1;
  row.unpricedLines += ev.unpricedOpenCount;
}

function settleCurrency(row) {
  // A partial forecast cannot establish a free balance. The shared evaluator's
  // unpriced count also includes planned lines; conservatively refuse headroom
  // until they are priced, rather than claim a reliable allocation position.
  const gaps = [];
  if (row.untracked) gaps.push(`${row.untracked} active envelope(s) carry no declared ceiling`);
  if (row.evidenceDebt) gaps.push(`${row.evidenceDebt} envelope(s) have spent lines without recorded actuals`);
  if (row.unpricedLines) gaps.push(`${row.unpricedLines} open line(s), including planned lines, have no price`);
  if (!row.envelopes) {
    row.headroom = null;
    row.headroomReason = `No active envelope in ${row.currency}.`;
  } else if (gaps.length) {
    row.headroom = null;
    row.headroomReason = `Headroom cannot be computed for ${row.currency}: ${gaps.join('; ')}. Recorded figures exclude missing amounts.`;
  } else {
    row.headroom = round2(row.ceiling - row.forecast);
  }
  return row;
}

function queueReasons(ev) {
  const reasons = [];
  if (ev.breach) reasons.push({ key: 'breach', text: `Forecast ${formatMoney(ev.currency, ev.forecastAtCompletion)} exceeds the declared ceiling ${formatMoney(ev.currency, ev.limit)}.` });
  if (ev.pipelineBreach) reasons.push({ key: 'pipeline-breach', text: `Planned pipeline ${formatMoney(ev.currency, ev.pipelineExposure)} would breach the ceiling ${formatMoney(ev.currency, ev.limit)}.` });
  if (ev.watch) reasons.push({ key: 'watch', text: `Forecast is at ${pctText(ev.forecastUtilisation)} of the ceiling, inside the declared watch zone.` });
  if (ev.missingActualLines.length) reasons.push({ key: 'evidence-debt', text: `${ev.missingActualLines.length} line(s) marked spent with no recorded actual amount.` });
  if (ev.unpricedOpenCount) reasons.push({ key: 'unpriced', text: `${ev.unpricedOpenCount} open line(s) carry no committed amount.` });
  if (ev.overdueLines.length) reasons.push({ key: 'overdue', text: `${ev.overdueLines.length} commitment(s) passed their expected spend date.` });
  if (!ev.hasLimit) reasons.push({ key: 'untracked', text: 'No declared ceiling: spend is tracked, not controlled.' });
  return reasons;
}

/**
 * The roll-up. `state` may be a seat-projected state or the raw workspace; the
 * seat's own scope decides what is attributable either way.
 */
export function buildBudgetExposure(state, { now = new Date(), seat = null, built = null, queueCap = BUDGET_EXPOSURE_LIMITS.queue } = {}) {
  const today = dayKey(now);
  const watchPct = state?.settings?.budgetWatchPct ?? DEFAULT_BUDGET_WATCH_PCT;
  const budgets = Array.isArray(state?.budgets) ? state.budgets : [];

  const enforced = Boolean(seat && !seat.fullAccess);
  if (enforced && seat.readOnly) {
    return refusalReport(`The declared seat “${seat.unresolvedSeatId || seat.id}” no longer exists in this roster. No money is read until a valid seat is declared on the Altitude Lens.`, { asOf: today, enforced, detail: 'refused' });
  }
  if (enforced && seat.rank < BUDGET_EXPOSURE_FLOORS.portfolioRank) {
    return refusalReport(`${seat.label} (rank ${seat.rank}) is not handed portfolio-level capital. Its floor is rank ${BUDGET_EXPOSURE_FLOORS.portfolioRank}; the frontline horizon is the week. Read your own team's envelope in Mission Control instead.`, { asOf: today, enforced, detail: 'refused' });
  }

  const detail = !enforced ? 'operator' : seat.rank > BUDGET_EXPOSURE_FLOORS.detailRank ? 'aggregate' : 'full';
  const childSeats = enforced
    ? seat.childSeatIds.map((id) => built?.byId?.get(id)).filter(Boolean)
      .sort((a, b) => a.rank - b.rank || a.depth - b.depth || String(a.name).localeCompare(String(b.name)))
    : [];
  const branchPosition = new Map(childSeats.map((child, index) => [child.id, index + 1]));

  const counts = {
    envelopes: budgets.length, active: 0, inactive: 0, measured: 0, untracked: 0,
    breaches: 0, watches: 0, pipelineBreaches: 0, evidenceDebt: 0, unpricedEnvelopes: 0,
    overdueEnvelopes: 0, attributed: 0, viaLine: 0, unowned: 0, outOfSpan: 0, ambiguous: 0,
    branches: childSeats.length,
  };
  const byCurrency = new Map();
  const byBranch = new Map();
  const excluded = { unowned: [], 'out-of-span': [], ambiguous: [] };
  const queueRows = [];

  const branchRow = (key, meta) => {
    if (!byBranch.has(key)) {
      byBranch.set(key, {
        key,
        position: meta.position ?? null,
        label: meta.label,
        rank: meta.rank ?? null,
        ownDesk: Boolean(meta.ownDesk),
        viaLine: Boolean(meta.viaLine),
        currencies: new Map(),
        envelopes: 0,
        breaches: 0,
      });
    }
    return byBranch.get(key);
  };

  for (const budget of budgets) {
    if (!budget || budget.status !== 'active') {
      counts.inactive += 1;
      continue;
    }
    counts.active += 1;
    const ev = evaluateBudget(budget, now, { watchPct });
    const currency = ev.currency;
    if (ev.hasLimit) counts.measured += 1;
    else counts.untracked += 1;
    if (ev.breach) counts.breaches += 1;
    if (ev.watch) counts.watches += 1;
    if (ev.pipelineBreach) counts.pipelineBreaches += 1;
    if (ev.missingActualLines.length) counts.evidenceDebt += 1;
    if (ev.unpricedOpenCount) counts.unpricedEnvelopes += 1;
    if (ev.overdueLines.length) counts.overdueEnvelopes += 1;

    const attribution = enforced ? attributeEnvelope(budget, seat, built) : { bucket: 'enterprise', child: null };
    if (attribution.bucket === 'unowned' || attribution.bucket === 'out-of-span' || attribution.bucket === 'ambiguous') {
      counts[attribution.bucket === 'out-of-span' ? 'outOfSpan' : attribution.bucket] += 1;
      excluded[attribution.bucket].push({
        reason: attribution.bucket === 'unowned'
          ? 'No owner recorded: this envelope belongs to the enterprise root, not to every executive. Assign an owner to attribute it to a branch.'
          : attribution.bucket === 'out-of-span'
            ? 'The owner sits outside this seat’s span. It is counted here and belongs to another seat’s register.'
            : 'The owner resolves to more than one direct branch, so attribution is withheld rather than guessed.',
        currency,
        hasCeiling: ev.hasLimit,
        breach: ev.breach,
      });
      continue;
    }

    if (attribution.bucket === 'matrix-line') counts.viaLine += 1;
    counts.attributed += 1;
    const cur = byCurrency.get(currency) || emptyCurrency(currency);
    addToCurrency(cur, ev);
    byCurrency.set(currency, cur);

    const branchKey = attribution.bucket === 'enterprise'
      ? 'enterprise'
      : attribution.bucket === 'desk'
        ? 'desk'
        : attribution.bucket === 'matrix-line'
          ? 'matrix-line'
          : attribution.child.id;
    const branch = branchRow(branchKey, attribution.bucket === 'enterprise'
      ? { label: 'Whole workspace', ownDesk: false }
      : attribution.bucket === 'desk'
        ? { label: enforced ? 'Own desk (no leadership seat beneath)' : 'Whole workspace', ownDesk: true }
        : attribution.bucket === 'matrix-line'
          ? { label: 'Declared matrix line', rank: null, ownDesk: false, viaLine: true }
          : {
            position: branchPosition.get(attribution.child.id) || null,
            label: attribution.child.name,
            rank: attribution.child.rank,
            ownDesk: false,
          });
    branch.envelopes += 1;
    if (ev.breach) branch.breaches += 1;
    const bCur = branch.currencies.get(currency) || emptyCurrency(currency);
    addToCurrency(bCur, ev);
    branch.currencies.set(currency, bCur);

    const reasons = queueReasons(ev);
    if (!reasons.length) continue;
    queueRows.push({
      budgetId: budget.id,
      branchKey,
      branchPosition: branch.position,
      branchLabel: detail === 'aggregate' ? (branch.position ? `Branch ${branch.position}` : branch.label) : branch.label,
      branchRank: branch.rank,
      viaLine: branch.viaLine,
      name: detail === 'aggregate' ? null : budget.name,
      currency,
      band: bandOf(ev),
      reasons,
      reasonKey: reasons[0].key,
      utilisation: ev.forecastUtilisation,
      ceiling: detail === 'aggregate' ? null : ev.hasLimit ? ev.limit : null,
      forecast: detail === 'aggregate' ? null : ev.forecastAtCompletion,
      pipelineExposure: detail === 'aggregate' ? null : ev.pipelineExposure,
      ageDays: null,
    });
  }

  // Bounded, deterministic, constraint-first: the worst band first, then the
  // reason family, then utilisation, then currency and id. `sort` is total and
  // order-independent of storage order.
  queueRows.sort((a, b) => (REASON_RANK.get(a.reasonKey) ?? 99) - (REASON_RANK.get(b.reasonKey) ?? 99)
    || (b.utilisation ?? -1) - (a.utilisation ?? -1)
    || a.currency.localeCompare(b.currency)
    || a.budgetId.localeCompare(b.budgetId));
  const cap = Math.max(0, Number(queueCap) || 0);
  const queue = queueRows.slice(0, cap);
  const queueDeferred = Math.max(0, queueRows.length - queue.length);

  const currencies = [...byCurrency.values()].map(settleCurrency)
    .sort((a, b) => a.currency.localeCompare(b.currency));
  const branches = [...byBranch.values()].map((row) => ({
    key: row.key,
    position: row.position,
    label: detail === 'aggregate' ? (row.position ? `Branch ${row.position}` : row.label) : row.label,
    rank: row.rank,
    ownDesk: row.ownDesk,
    viaLine: row.viaLine,
    envelopes: row.envelopes,
    breaches: row.breaches,
    currencies: [...row.currencies.values()].map(settleCurrency).sort((a, b) => a.currency.localeCompare(b.currency)),
  })).sort((a, b) => (a.ownDesk ? 1 : 0) - (b.ownDesk ? 1 : 0)
    || (a.position ?? 99) - (b.position ?? 99)
    || a.label.localeCompare(b.label));

  const refusals = [];
  if (!counts.active) {
    refusals.push('No active budget envelope is readable at this seat. A blank reading is not a zero position: nothing has been measured.');
  }
  if (counts.inactive) {
    refusals.push(`${counts.inactive} closed or archived envelope(s) are counted and NOT summed: they are history, not a current position.`);
  }
  if (counts.unowned) {
    refusals.push(`${counts.unowned} active envelope(s) record no owner and are excluded from every span total — an unowned envelope belongs to the enterprise root, not to every executive. Assign an owner to attribute it.`);
  }
  if (counts.outOfSpan) {
    refusals.push(`${counts.outOfSpan} active envelope(s) name an owner outside this seat’s span; they are excluded from the reading.`);
  }
  if (counts.viaLine) {
    refusals.push(`${counts.viaLine} active envelope(s) reach this seat only through a declared additional reporting line. Each whole envelope is counted once in THIS seat’s reading and labelled “Declared matrix line”; its capacity allocation is NOT applied to money. The home cost centre reads the same envelope, so totals from overlapping seats are not additive.`);
  }
  if (counts.ambiguous) {
    refusals.push(`${counts.ambiguous} active envelope(s) resolve to more than one direct branch and are excluded rather than guessed.`);
  }
  for (const row of currencies) if (row.headroomReason) refusals.push(row.headroomReason);
  if (counts.breaches) {
    refusals.push(`${counts.breaches} envelope(s) forecast a breach. The roll-up does not net them against declared headroom anywhere else: offsetting one cost centre with another's slack is a transfer of authority nobody approved, and it is a decision for the seat, not for the arithmetic.`);
  }
  if (!enforced) {
    refusals.push('No operating seat is enforced, so this reading is the WHOLE WORKSPACE, not a span. Declare a seat on the Altitude Lens to read it as a director, VP or chief.');
  }
  if (detail === 'aggregate') {
    refusals.push(`Above rank ${BUDGET_EXPOSURE_FLOORS.detailRank} the envelopes are disclosed as counts, currency totals and bands. Envelope names, line titles and per-envelope amounts are item detail and are withheld.`);
  }

  return {
    ok: true,
    refused: false,
    engineVersion: BUDGET_EXPOSURE_ENGINE_VERSION,
    asOf: today,
    enforced,
    detail,
    watchPct,
    seatScope: seat
      ? {
        seatId: enforced ? seat.id : null,
        label: seat.label,
        rank: seat.rank,
        altitudeKey: seat.altitudeKey || null,
        horizonDays: seat.horizonDays ?? null,
        scopeN: seat.scopeN ?? null,
        matrixScopeN: seat.matrixScopeN ?? seat.scopeN ?? null,
        lineScopeN: seat.lineScopeN ?? 0,
        viaLineEnvelopes: counts.viaLine,
        childBranches: childSeats.length,
      }
      : null,
    matrix: seat?.lineScope
      ? {
        declared: true,
        lineScopeN: seat.lineScopeN ?? 0,
        viaLineEnvelopes: counts.viaLine,
        allocationAppliedToMoney: false,
        additiveAcrossSeats: false,
      }
      : null,
    counts,
    currencies,
    branches,
    excluded: [
      ...excluded.unowned.map((row) => ({ bucket: 'unowned', ...row })),
      ...excluded['out-of-span'].map((row) => ({ bucket: 'out-of-span', ...row })),
      ...excluded.ambiguous.map((row) => ({ bucket: 'ambiguous', ...row })),
    ],
    queue,
    queueDeferred,
    refusals,
    method: BUDGET_EXPOSURE_METHOD,
    limits: BUDGET_EXPOSURE_LIMITS,
    nettingRefused: true,
  };
}

/**
 * The ledger as text: what a director attaches to the envelope conversation or
 * hands upward. Deterministic, ordered, and identity-free at aggregate detail.
 */
export function budgetExposureText(report) {
  const lines = ['SPAN BUDGET EXPOSURE (encumbrance basis, per currency)', `As of ${report.asOf || '—'} · engine ${report.engineVersion}`];
  if (report.seatScope) {
    lines.push(`Seat: ${report.seatScope.label} (rank ${report.seatScope.rank}) · detail: ${report.detail}${report.seatScope.childBranches ? ` · ${report.seatScope.childBranches} direct branch(es)` : ''}`);
  } else {
    lines.push('Seat: not declared (whole workspace)');
  }
  if (report.refused) {
    lines.push('', 'REFUSED:', ...report.refusals.map((r) => `- ${r}`));
    return lines.join('\n');
  }
  lines.push('');
  lines.push(`COUNTED: ${report.counts.active} active envelope(s), ${report.counts.measured} with a declared ceiling, ${report.counts.untracked} tracking-only. `
    + `${report.counts.breaches} breach(es), ${report.counts.watches} in the watch zone, ${report.counts.pipelineBreaches} pipeline breach(es), `
    + `${report.counts.evidenceDebt} with spend and no recorded actual, ${report.counts.unpricedEnvelopes} with unpriced open lines.`);
  if (report.counts.viaLine) {
    lines.push(`MATRIX OVERLAP: ${report.counts.viaLine} envelope(s) arrived only through a declared additional reporting line. Each is counted once here at its whole recorded amount; no capacity-share split was invented. The home seat reads the same envelope — never add overlapping seat totals.`);
  }
  lines.push('', 'PER CURRENCY — never pooled, never converted:');
  if (!report.currencies.length) lines.push('  (no attributable active envelope)');
  for (const row of report.currencies) {
    const headroom = row.headroom === null
      ? 'headroom BLANK (see refusal)'
      : row.headroom >= 0 ? `headroom ${formatMoney(row.currency, row.headroom)}` : `over ceiling by ${formatMoney(row.currency, Math.abs(row.headroom))}`;
    lines.push(`  ${row.currency}: ceilings ${formatMoney(row.currency, row.ceiling)} across ${row.ceilingsCovered} of ${row.envelopes} envelope(s) · actuals ${formatMoney(row.currency, row.actuals)} · open commitments ${formatMoney(row.currency, row.committed)} · planned ${formatMoney(row.currency, row.planned)} · recorded forecast ${formatMoney(row.currency, row.forecast)} · ${headroom}`);
    lines.push(`    ${row.breaches} breach(es), ${row.watches} watch, ${row.pipelineBreaches} pipeline breach(es), ${row.evidenceDebt} evidence-debt envelope(s).`);
  }
  lines.push('', 'BY BRANCH — the authority holder, not a grand total:');
  if (!report.branches.length) lines.push('  (no direct branch holds an attributable envelope)');
  for (const branch of report.branches) {
    const label = branch.position ? `Branch ${branch.position} · ${branch.label}` : branch.label;
    const cells = branch.currencies.map((row) => `${row.currency} recorded forecast ${formatMoney(row.currency, row.forecast)}${row.headroom === null ? ` (headroom BLANK: ${row.headroomReason})` : ` (${row.headroom >= 0 ? 'headroom' : 'over'} ${formatMoney(row.currency, Math.abs(row.headroom))})`}${row.breaches ? ` ${row.breaches} BREACH` : ''}`).join(' | ');
    lines.push(`  ${label} — ${branch.envelopes} envelope(s)${cells ? ` — ${cells}` : ''}`);
  }
  lines.push('', `REVIEW QUEUE — bounded at ${report.limits.queue}, worst first:`);
  if (!report.queue.length) lines.push('  (nothing to review)');
  for (const [index, row] of report.queue.entries()) {
    const where = row.branchPosition ? `B${row.branchPosition}` : 'desk';
    const who = row.name ? `${row.name} [${row.currency}]` : `[${row.currency}]`;
    const figure = row.ceiling === null ? '' : ` — forecast ${formatMoney(row.currency, row.forecast)} of ${formatMoney(row.currency, row.ceiling)}`;
    lines.push(`  ${index + 1}. ${where} ${who} · ${row.band}${figure} · ${row.reasons[0].text}`);
  }
  if (report.queueDeferred) lines.push(`  … ${report.queueDeferred} further row(s) beyond the queue cap; they remain in the envelopes table.`);
  const bucket = (key) => report.excluded.filter((row) => row.bucket === key);
  const unowned = bucket('unowned');
  if (unowned.length) lines.push('', `EXCLUDED: ${unowned.length} unowned envelope(s) belong to the enterprise root and are not in any span total.`);
  if (bucket('out-of-span').length) lines.push(`EXCLUDED: ${bucket('out-of-span').length} envelope(s) owned outside this span.`);
  if (bucket('ambiguous').length) lines.push(`EXCLUDED: ${bucket('ambiguous').length} envelope(s) with an ambiguous branch owner.`);
  lines.push('', 'REFUSALS AND LIMITS:');
  for (const reason of report.refusals) lines.push(`- ${reason}`);
  lines.push('', 'METHOD:');
  for (const m of report.method) lines.push(`- ${m.name}: ${m.why}`);
  return lines.join('\n');
}

/**
 * One identity-free sentence for the upward brief. Never built from an envelope
 * name, a line title or a person: counts, currency totals, bands and refusals.
 */
export function budgetExposureBrief(report) {
  if (!report || report.refused) return `Money: ${report?.refusals?.[0] || 'no span money reading is available.'}`;
  if (!report.counts.active) return 'Money: no active budget envelope is readable in this span; nothing has been measured.';
  const currencies = report.currencies.map((row) => `${row.currency} ${row.breaches}/${row.envelopes} envelope(s) in breach`
    + (row.headroom === null ? ', headroom blank' : `, ${row.headroom >= 0 ? 'headroom' : 'over'} ${formatMoney(row.currency, Math.abs(row.headroom))}`)).join('; ');
  const line = `Money: ${report.counts.active} active envelope(s) across ${report.currencies.length} currency(ies)${currencies ? ` — ${currencies}` : ''}. `
    + `${report.counts.evidenceDebt} envelope(s) carry spend with no recorded actual; ${report.counts.unpricedEnvelopes} have unpriced open lines (including planned); ${report.queue.length + report.queueDeferred} row(s) in the bounded review queue. No netting across currencies or branches.`
    + (report.counts.viaLine ? ` ${report.counts.viaLine} envelope(s) arrived via matrix line; overlapping seat totals are not additive and no allocation split was applied.` : '');
  return report.detail === 'aggregate' ? line.replace('active envelope(s) across', 'active envelope(s), counts only, across') : line;
}

export { pctText as exposurePctText };
