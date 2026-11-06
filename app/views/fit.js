/**
 * app/views/fit.js — `#/fit`, the Decision-Fit Ledger (ADR-0108).
 *
 * Four panels, four questions, and a different answer at every altitude:
 *   Book      "What am I holding that a rung below could have finished — and
 *              what would moving it be worth, net of the risk?"
 *   Ladder    "Where is authority accumulating, and is my own contested share a
 *              measurement or a description?"
 *   Grades    "Was the price this ledger quoted before the move right?"
 *   Method    "What is declared, what is clamped, and what is refused?"
 *
 * THE READING CHANGES WITH ALTITUDE, not just its size:
 *   frontline  — own calls, named, with the candidate rung and the days saved.
 *   manager    — own span's calls, the span's contested share with its interval.
 *   director   — child spans as counts and pooled saving; NO call titles.
 *   exec/chief — class mix, the rights floor that binds hardest, and the
 *                identity-free brief. No call titles, no person detail.
 *
 * Nothing on this screen rates a person. A refused figure is BLANK with its
 * reason, never a zero. Above its disclosure ceiling the shell serves the
 * compiled span aggregate instead (ADR-0086), so the page never has to withhold
 * quietly.
 */
import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table, kv } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import { formatDate } from '../core/time.js';
import { buildSeats, activeSeat } from '../core/domain/seat.js';
import {
  AUTHORITY_CLASSES, CLASS_BY_KEY, FIT_CONVENTION_BOUNDS, FIT_CONVENTION_DEFAULTS,
  FIT_PANELS, FIT_REFUSALS,
} from '../core/domain/decisionFitRegistry.js';
import {
  buildFitBook, buildContestedShare, fitBrief, fitConventions, fitCsvRows, fitRollUp,
  scoreAllocationRules,
} from '../core/domain/decisionFit.js';

const PANELS = FIT_PANELS;
const CSV_COLUMNS = ['scope', 'altitude', 'class_key', 'floor_rank', 'open', 'priced', 'recommendations',
  'held_past_horizon', 'saving_currency', 'saving_total', 'share_pct', 'share_lo_pct', 'share_hi_pct',
  'eligible_n', 'verdict'];

const coin = (currency, value) => (value === null || value === undefined
  ? '—'
  : `${currency || ''} ${Math.round(value).toLocaleString('en-US')}`.trim());
const pct = (v) => (v === null || v === undefined ? '—' : `${v}%`);

function report(ctx) {
  const conventions = fitConventions(ctx.state.settings || {});
  return buildFitBook(ctx.state, { now: ctx.now, conventions });
}

function seatOf(ctx) {
  const built = buildSeats(ctx.state, { now: ctx.now, settings: ctx.state.settings || {} });
  return { built, seat: activeSeat(built) };
}

function act(ctx, fn, okMessage) {
  const result = fn();
  if (!result || result.ok === false) { toast(result?.error || 'That did not work.', 'bad'); return false; }
  if (result.warning) toast(result.warning, 'bad');
  else toast(okMessage, 'good');
  ctx.render?.();
  return true;
}

/* --------------------------------------------------------------- panels */

function bookPanel(ctx, book) {
  const { seat } = seatOf(ctx);
  const withheld = seat && !seat.fullAccess && seat.rank > 2;
  const rows = book.rows;
  if (!rows.length) {
    return emptyState({
      title: 'No open calls to price',
      body: 'Every decision in this workspace is settled. The ledger prices authority on OPEN calls; a settled call is graded in the Ladder and Grades panels instead.',
    });
  }
  if (withheld) {
    return h('div', { class: 'stack' },
      banner({ tone: 'info', title: `${seat.label} reads this book as counts, not as calls`,
        body: `Item titles and call ids are withheld above the director detail ceiling (ADR-0086). You are reading ${rows.length} open call(s) as a priced span aggregate — the same records, without the workflow minutiae. Change altitude on #/seat to read the calls themselves.` }),
      classTable(book));
  }
  const cols = [
    { label: 'Call', render: (r) => h('div', null,
      h('a', { href: `#/decisions?decision=${r.id}` }, r.title),
      h('p', { class: 'tiny muted' }, `${r.classLabel} · floor rank ${CLASS_BY_KEY[r.classKey]?.floorRank ?? '—'} · held ${r.openDays}d at ${r.owner?.name || 'no resolvable owner'} (${r.owner?.source || '—'})`)) },
    { label: 'At stake', render: (r) => (r.priced
      ? h('div', null, h('strong', null, coin(r.currency, r.valuePerWeek)), h('p', { class: 'tiny muted' }, 'per week'))
      : h('span', { class: 'muted tiny' }, 'unpriced — wait counted in days, never as zero')) },
    { label: 'Best move', render: (r) => (r.best
      ? h('div', null,
        h('strong', null, `→ ${r.best.label}`),
        h('p', { class: 'tiny' }, `${r.best.daysSaved}d saved · net ${coin(r.best.currency, r.best.netSaving)}`),
        h('p', { class: 'tiny muted' }, `${r.best.errorPct}% error price · deficit ${r.best.deficitPoints} pts${r.best.provisional ? ' · provisional' : ''}`))
      : h('span', { class: 'muted tiny' }, r.alternatives.find((a) => a.refusal === 'rights-floor') ? 'rights floor — no lower rung may hold it' : 'no alternative rung to price')) },
    { label: 'Status', render: (r) => (r.materialBest
      ? badge('material', 'good')
      : r.best ? badge('below materiality', 'neutral') : badge('—', 'neutral')) },
    { label: '', render: (r) => (r.alternatives.length
      ? h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', onClick: () => openLadderModal(ctx, r) }, 'Price the ladder')
      : null) },
  ];
  return h('div', { class: 'stack' },
    card({ title: 'The open book', subtitle: 'Every open call priced as a delegation option. A saving is net of the error price of a rung that does not hold the evidence.',
      body: table({ columns: cols, rows, caption: 'Open calls priced as delegation options' }) }),
    bookSummary(book));
}

function bookSummary(book) {
  const best = book.rows.filter((r) => r.materialBest);
  const currency = best[0]?.materialBest?.currency || null;
  const total = best.reduce((s, r) => s + (r.materialBest.netSaving || 0), 0);
  const stats = h('div', { class: 'stat-row' },
    stat({ label: 'Material moves available', value: String(best.length), hint: 'net of the error price and above the materiality bar' }),
    stat({ label: 'Saving available (stock)', value: coin(currency, total), hint: 'over the remaining holding period — not per week' }),
    stat({ label: 'Held past the owner’s horizon', value: String(book.totals.heldPastHorizon), hint: 'a Jaques time-span overrun, measured from dated records' }),
    stat({ label: 'Unpriced calls', value: String(book.totals.unpriced), hint: 'their wait is counted in days; their cost is unknown' }));
  const note = banner({
    tone: 'info',
    title: 'How to read a saving',
    body: 'A saving is a STOCK: the value at stake per week × the remaining weeks a lower rung would not have spent, minus the declared error price of a rung that holds less of the evidence, minus the monitoring cost of authority distance. It is not a per-week rate, and it is not a forecast of the outcome.',
  });
  return card({ title: 'What the book says', body: h('div', { class: 'stack' }, stats, note) });
}

function classTable(roll) {
  return table({
    caption: 'Open calls by authority class',
    columns: [
      { label: 'Authority class', render: (c) => h('div', null, h('strong', null, c.label), h('p', { class: 'tiny muted' }, `floor rank ${c.floorRank}`)) },
      { label: 'Open', render: (c) => String(c.open) },
      { label: 'Priced', render: (c) => String(c.priced) },
      { label: 'Material moves', render: (c) => String(c.recommendations) },
    ],
    rows: roll.classes,
  });
}

function ladderPanel(ctx, roll, share, rules) {
  const { seat } = seatOf(ctx);
  const withheld = seat && !seat.fullAccess && seat.rank > 2;
  return h('div', { class: 'stack' },
    card({
      title: 'Authority by rung',
      subtitle: 'Where the work sits, what it is worth to move it, and whether anyone above can see it without asking.',
      body: h('div', { class: 'stack' },
        h('div', { class: 'stat-row' },
          stat({ label: 'This span’s open calls', value: String(roll.open), hint: `${roll.priced} priced · ${roll.unpriced} unpriced` }),
          stat({ label: 'Material delegation moves', value: String(roll.recommendationN), hint: 'net saving above the materiality bar' }),
          stat({ label: 'Rights refusals', value: String(roll.rightsRefused), hint: 'a rung that may not hold the class — printed, never priced as expensive' }),
          stat({ label: 'Past the owner’s horizon', value: String(roll.heldPastHorizon), hint: 'older than the altitude that holds it may keep it' })),
        roll.compositionWarning ? banner({ tone: 'warn', title: 'The two roll-ups disagree', body: roll.compositionWarning }) : null,
        classTable(roll)) }),
    card({
      title: 'The contested share',
      subtitle: 'The one figure on this page about a leader rather than a call — and it is a share of work, not a score of a person.',
      body: h('div', { class: 'stack' },
        share.refused
          ? banner({ tone: 'info', title: 'Refused', body: share.reason })
          : h('div', { class: 'stat-row' },
            stat({ label: 'Contested share', value: pct(share.sharePct), hint: `Wilson interval ${share.interval.lo}–${share.interval.hi}% over ${share.eligibleN} measurable calls` }),
            stat({ label: 'Held past the lower rung', value: String(share.contestedN), hint: 'calls that outlived the hold a lower rung would have achieved' }),
            stat({ label: 'Same-day calls excluded', value: String(share.sameDayExcluded), hint: 'logged and decided the same day: they never queued, so they cannot be contested' }),
            stat({ label: 'Not delegable', value: String(share.notDelegable), hint: 'settled calls whose class floor is at or above this rung' })),
        h('p', { class: 'tiny muted' }, share.definition),
        h('p', { class: 'tiny muted' }, 'This is a statement about how work was held. It is not a rating, it has no field for one, and above the manager altitude it carries no call id at all.')) }),
    rules.refused
      ? card({ title: 'Naive-rule comparison', body: banner({ tone: 'info', title: 'Refused', body: rules.reason }) })
      : card({
        title: 'Your allocation against two rules with no judgement in them',
        subtitle: 'All three act on the same priced, measurable calls, so the comparison is paired.',
        body: h('div', { class: 'stack' },
          table({
            caption: 'Actual allocation against naive rules',
            columns: [
              { label: 'Rule', render: (r) => r.label },
              { label: 'Cost of waiting', render: (r) => coin(rules.currency, r.costOfWaiting) },
              { label: 'Error price', render: (r) => (r.errorCost !== undefined ? coin(rules.currency, r.errorCost) : '—') },
            ],
            rows: [rules.actual, rules.holdAll, rules.delegateAll],
          }),
          banner({
            tone: rules.actualMinusDelegate > 0 ? 'warn' : 'info',
            title: rules.actualMinusDelegate > 0
              ? `Delegating everything would have been ${coin(rules.currency, Math.abs(rules.actualMinusDelegate))} cheaper`
              : `Holding was ${coin(rules.currency, Math.abs(rules.actualMinusDelegate))} cheaper after the error price`,
            body: rules.note,
          })) }),
    withheld ? banner({ tone: 'info', title: 'Call detail withheld at this altitude', body: `Above the director detail ceiling this page reads counts and pooled figures only (ADR-0086). ${roll.detailWithheld ? 'The row-level detail exists and is withheld, not missing.' : ''}` }) : null);
}

function gradesPanel(ctx, book) {
  const proposals = (ctx.state.fitProposals || []).slice().sort((a, b) => b.proposedOn.localeCompare(a.proposedOn));
  const pending = proposals.filter((p) => p.status === 'proposed');
  const graded = proposals.filter((p) => p.status === 'graded');
  if (!proposals.length) {
    return emptyState({
      title: 'No delegation has been priced yet',
      body: 'The spine opens one governed proposal when a call has outlived its rung’s expected hold and a material saving exists. A proposal never moves work — it opens a decision a human must make.',
    });
  }
  const currency = graded.find((p) => p.currency)?.currency || null;
  const predicted = graded.reduce((s, p) => s + (p.predictedDaysSaved || 0), 0);
  const actual = graded.reduce((s, p) => s + (p.actualDays || 0), 0);
  return h('div', { class: 'stack' },
    h('div', { class: 'stat-row' },
      stat({ label: 'Proposals open', value: String(pending.length), hint: 'governed decisions awaiting a human' }),
      stat({ label: 'Graded once', value: String(graded.length), hint: 'a proposal is graded exactly once, ever' }),
      stat({ label: 'Predicted days saved', value: predicted ? `${Math.round(predicted)}d` : '—', hint: 'summed over graded proposals' }),
      stat({ label: 'Actual days to settle', value: actual ? `${Math.round(actual)}d` : '—', hint: 'from the dated record, not from a claim' })),
    card({
      title: 'Every proposal and its grade',
      body: table({
        caption: 'Delegation proposals and their once-only grades',
        columns: [
          { label: 'Proposed', render: (p) => p.proposedOn },
          { label: 'To', render: (p) => `rank ${p.toRank}` },
          { label: 'Predicted', render: (p) => `${coin(p.currency, p.predictedSaving)} · ${p.predictedDaysSaved ?? '—'}d · ${p.predictedErrorPct ?? '—'}% error` },
          { label: 'Status', render: (p) => badge(p.status, p.status === 'graded' ? 'good' : 'warn') },
          { label: 'Grade', render: (p) => (p.gradeNote ? h('span', { class: 'tiny' }, p.gradeNote) : h('span', { class: 'muted tiny' }, 'open — graded only when the contract settles')) },
        ],
        rows: proposals,
      }),
    }));
}

function methodPanel(ctx, book) {
  const conventions = fitConventions(ctx.state.settings || {});
  const { seat } = seatOf(ctx);
  const canGovern = !seat || seat.fullAccess || seat.rank >= 4;
  return h('div', { class: 'stack' },
    card({
      title: 'The five authority classes',
      subtitle: 'A class is a statement about who MAY hold a call. The floor is a floor, not a ceiling: above it, any rung may hold the call, which is what makes delegation an option.',
      body: table({
        caption: 'Authority classes and their floors',
        columns: [
          { label: 'Class', render: (c) => h('div', null, h('strong', null, c.label), h('p', { class: 'tiny muted' }, c.discipline)) },
          { label: 'Floor', render: (c) => `rank ${c.floorRank}` },
          { label: 'Question', render: (c) => h('span', { class: 'tiny' }, c.question) },
        ],
        rows: AUTHORITY_CLASSES,
      }),
    }),
    card({
      title: 'Declared conventions',
      subtitle: 'Every one is printed with its bound. None is fitted from the record.',
      body: h('div', { class: 'stack' },
        table({
          caption: 'Conventions and their bounds',
          columns: [
            { label: 'Convention', render: (c) => c.key },
            { label: 'Value', render: (c) => String(c.value) },
            { label: 'Bound', render: (c) => (FIT_CONVENTION_BOUNDS[c.key] ? `${FIT_CONVENTION_BOUNDS[c.key][0]}–${FIT_CONVENTION_BOUNDS[c.key][1]}` : 'boolean') },
          ],
          rows: Object.keys(FIT_CONVENTION_DEFAULTS).map((key) => ({ key, value: conventions[key] })),
        }),
        canGovern
          ? h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openConventions(ctx) }, 'Re-declare the conventions')
          : h('p', { class: 'tiny muted' }, 'Re-declaring these re-prices every delegation in the workspace, so it is director+ and requires a full-access seat.')) }),
    card({
      title: 'What this page refuses',
      subtitle: 'A refusal is a printed answer. A blank is never a zero.',
      body: table({
        caption: 'Every refusal this ledger can print',
        columns: [
          { label: 'Code', render: (r) => h('code', null, r.code) },
          { label: 'Meaning', render: (r) => h('span', { class: 'tiny' }, r.text) },
        ],
        rows: Object.entries(FIT_REFUSALS).map(([code, text]) => ({ code, text })),
      }),
    }),
    card({
      title: 'Latency this estimate actually used',
      subtitle: 'Measured from this workspace’s own settled calls. Same-day calls never queued, so they are counted and excluded.',
      body: h('div', { class: 'stack' },
        h('p', null, book.latency.pooled.note || `Pooled median ${book.latency.pooled.medianDays ?? '—'}d over ${book.latency.pooled.n} settled calls.`),
        table({
          caption: 'Class latency and refusals',
          columns: [
            { label: 'Class', render: (r) => r.label },
            { label: 'Settled > 1 day', render: (r) => String(r.own.n) },
            { label: 'Class median', render: (r) => (r.refusedClass ? h('span', { class: 'muted' }, 'refused') : `${r.own.medianDays}d`) },
            { label: 'Used', render: (r) => `${r.used.medianDays ?? '—'}d${r.used.pooled ? ' (pooled)' : ''}` },
            { label: 'Why', render: (r) => h('span', { class: 'tiny muted' }, r.reason || 'class floor met') },
          ],
          rows: book.latency.rows,
        })) }),
    card({
      title: 'Identity-free brief',
      subtitle: 'What the level above receives. No person is named and no call title is carried.',
      body: h('div', { class: 'stack' },
        h('pre', { class: 'brief-pre' }, fitBrief(ctx.state, { now: ctx.now, conventions }).text),
        h('button', {
          class: 'btn btn-ghost', type: 'button',
          onClick: () => { navigator.clipboard?.writeText(fitBrief(ctx.state, { now: ctx.now, conventions }).text).then(() => toast('Brief copied', 'good'), () => toast('Could not copy', 'bad')); },
        }, 'Copy brief')) }),
  );
}

/* --------------------------------------------------------------- modals */

function openLadderModal(ctx, row) {
  const conventions = fitConventions(ctx.state.settings || {});
  const body = h('div', { class: 'stack' },
    h('p', null, `${row.title} — ${row.classLabel}, floor rank ${CLASS_BY_KEY[row.classKey]?.floorRank ?? '—'}, held ${row.openDays} days at ${row.owner?.name || 'no resolvable owner'}.`),
    table({
      caption: 'Every alternative rung, priced',
      columns: [
        { label: 'Rung', render: (a) => a.label },
        { label: 'Hold', render: (a) => (a.available ? `${a.candidateHoldDays}d` : '—') },
        { label: 'Days saved', render: (a) => (a.available ? `${a.daysSaved}d` : '—') },
        { label: 'Deficit', render: (a) => (a.available ? `${a.deficitPoints} pts${a.deficitUnknown ? ' (unknown)' : ''}` : '—') },
        { label: 'Error price', render: (a) => (a.available ? `${a.errorPct}%` : '—') },
        { label: 'Net (stock)', render: (a) => (a.available && a.priced ? coin(a.currency, a.netSaving) : a.available ? 'unpriced' : h('span', { class: 'muted tiny' }, a.refusal === 'rights-floor' ? 'rights floor' : a.refusal || '—')) },
      ],
      rows: row.alternatives,
    }),
    h('p', { class: 'tiny muted' }, 'A rights refusal is not an expensive option: the receiving rung may not hold this class of call at all, so there is nothing to price.'),
    row.best ? h('p', { class: 'tiny' }, row.best.deficitNote) : null,
    h('p', { class: 'tiny muted' }, `Conventions used: ${conventions.fitHorizonUtilisationPct}% horizon utilisation, ${conventions.fitBaseErrorPct}% base error + ${conventions.fitErrorPerDeficitPointPct} per deficit point, ${conventions.fitReworkCostPct}% rework cost, ${conventions.fitMonitoringCostPctPerRung}% monitoring per extra rung. It is not a forecast of the outcome.`));
  openModal({
    title: `Price the ladder — ${row.classLabel}`,
    body,
    footer: [h('button', { class: 'btn btn-primary', type: 'button', onClick: () => closeAllModals() }, 'Close')],
  });
}

function openClassify(ctx, book) {
  const open = book.rows.filter((r) => r.decision && !r.decision.chosen);
  if (!open.length) { toast('There is no open call to classify.', 'bad'); return; }
  const form = buildForm([
    {
      name: 'decisionId', label: 'Open call', type: 'select', value: open[0].id,
      options: open.map((r) => ({ value: r.id, label: `${r.title.slice(0, 70)}${r.classification.declared ? ' (declared)' : ` (auto: ${r.classLabel})`}` })),
    },
    {
      name: 'classKey', label: 'Authority class', type: 'select', value: open[0].classKey,
      options: AUTHORITY_CLASSES.map((c) => ({ value: c.key, label: `${c.label} — floor rank ${c.floorRank}` })),
      help: 'Your declaration outranks the lexicon. The previous price is kept and marked superseded.',
    },
  ]);
  openModal({
    title: 'Declare the authority class of a call',
    description: 'This is a statement about who may hold the call, not about how important it is. Importance is priced separately, in the call’s own currency.',
    body: h('div', { class: 'stack' }, form.node),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const values = form.getValues();
          const result = ctx.api.fitClassify(values.decisionId, values.classKey);
          if (!result || result.ok === false) { form.setFieldError('classKey', result?.error || 'Could not declare the class.'); return; }
          closeAllModals();
          toast(result.warning || 'Class declared. The price was re-frozen and the old one kept.', result.warning ? 'bad' : 'good');
          ctx.render?.();
        },
      }, 'Declare the class'),
    ],
  });
}

function openConventions(ctx) {
  const conventions = fitConventions(ctx.state.settings || {});
  const specs = Object.keys(FIT_CONVENTION_DEFAULTS).map((key) => {
    const bound = FIT_CONVENTION_BOUNDS[key];
    if (!bound) return { name: key, label: key, type: 'select', value: conventions[key] ? 'on' : 'off', options: [{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }], help: 'Pauses every automatic pass. An explicit scan still runs.' };
    return { name: key, label: key, type: 'number', value: conventions[key], min: bound[0], max: bound[1], step: 1, help: `Declared bound ${bound[0]}–${bound[1]}.` };
  });
  const form = buildForm(specs);
  openModal({
    title: 'Decision-fit conventions',
    description: 'Every one is declared and clamped. None is fitted from your record, and re-declaring re-prices every delegation in this workspace.',
    body: h('div', { class: 'stack' }, form.node),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const values = form.getValues();
          const patch = {};
          for (const key of Object.keys(FIT_CONVENTION_DEFAULTS)) {
            patch[key] = typeof FIT_CONVENTION_DEFAULTS[key] === 'boolean' ? values[key] === 'on' : Number(values[key]);
          }
          const result = ctx.api.fitSetConventions(patch);
          if (!result || result.ok === false) { toast(result?.error || 'Could not re-declare.', 'bad'); return; }
          closeAllModals();
          toast(result.changed?.length ? `Re-declared: ${result.changed.join(', ')}` : 'Nothing changed.', 'good');
          ctx.render?.();
        },
      }, 'Re-declare'),
    ],
  });
}

/* ---------------------------------------------------------------- view */

export function renderFit(ctx) {
  const query = ctx.query instanceof Map ? ctx.query : new URLSearchParams(String(ctx.query || ''));
  const requested = query.get('panel') || 'book';
  const panel = PANELS.some((p) => p.key === requested) ? requested : 'book';
  const book = report(ctx);
  const { built, seat } = seatOf(ctx);
  const nodeId = seat?.nodeId && built.chain.nodes.has(seat.nodeId) ? seat.nodeId : 'leader';
  const conventions = fitConventions(ctx.state.settings || {});
  const roll = fitRollUp(ctx.state, { now: ctx.now, chain: built.chain, conventions, nodeId });
  const share = buildContestedShare(ctx.state, { now: ctx.now, chain: built.chain, nodeId, conventions });
  const rules = scoreAllocationRules(share, { book, conventions });
  const question = roll.ok ? roll.question : '';

  const panels = {
    book: () => bookPanel(ctx, book),
    ladder: () => (roll.ok ? ladderPanel(ctx, roll, share, rules) : emptyState({ title: 'No span to read', body: roll.error })),
    grade: () => gradesPanel(ctx, book),
    method: () => methodPanel(ctx, book),
  };

  const header = pageHeader({
    eyebrow: `LeadOS · Decision-Fit Ledger · ${roll.ok ? roll.altitudeLabel : 'No seat'}`,
    title: 'What is your authority costing you?',
    subtitle: question || 'Every open call priced as a delegation option, and the leader’s own allocation measured against two rules with no judgement in them.',
    actions: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openClassify(ctx, book) }, 'Declare a class'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => act(ctx, () => ctx.api.fitScan(), 'Re-priced the book and re-graded settled proposals'),
      }, 'Price the book now'),
      h('button', {
        class: 'btn btn-ghost', type: 'button',
        onClick: () => {
          const rows = fitCsvRows(ctx.state, { now: ctx.now, chain: built.chain, conventions });
          downloadText(`leados-decision-fit-${ctx.now.toISOString().slice(0, 10)}.csv`,
            serializeCsv({ columns: CSV_COLUMNS, rows }), 'text/csv');
        },
      }, 'Export aggregate CSV'),
    ],
    meta: h('div', null, kv('Generated', formatDate(ctx.now)), kv('Engine', book.engineVersion), kv('Conventions', 'declared, not fitted')),
  });

  return h('div', { class: 'page view-stack', 'data-altitude': roll.altitudeKey || 'none' },
    header,
    tabs({ items: PANELS.map((p) => ({ key: p.key, label: p.label })), active: panel, ariaLabel: 'Decision-fit sections',
      onSelect: (key) => ctx.navigate(key === 'book' ? '#/fit' : `#/fit?panel=${key}`) }),
    h('p', { class: 'tiny muted' }, PANELS.find((p) => p.key === panel)?.note || ''),
    panels[panel](),
    h('p', { class: 'tiny muted' },
      'This ledger never moves work, never rates a person and never edits another module’s record. A proposal is a governed decision a human must make; silence is never consent. The local seat is a workflow declaration, not authentication.'));
}
