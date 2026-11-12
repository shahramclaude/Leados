/**
 * app/views/matrixWorkforceFlowPanel.js — `#/matrix?panel=stock-flow`, the
 * Workforce Stock-Flow (Markov manpower) Plan (ADR-0184, Schema v146, CSV #138).
 *
 * The chief's question this screen answers: "if we promote, hire and lose
 * people at the rates we actually do, what shape is this organisation in four
 * quarters — and how far is that from the shape I declared?"
 *
 * Every figure printed here is a field of the report `workforceFlowReport`
 * returned. The screen computes nothing: no rate, no exposure, no total, no gap.
 * A rendering stores nothing.
 *
 * WHAT THIS SCREEN REFUSES TO PRINT
 *  - A rate for a level below the declared exposure floor. The row prints the
 *    count it read, the exposure it had and the floor it failed.
 *  - A projection beside a comparison that could not be made.
 *  - A gap on a level nobody declared an intent for (it would read as "we plan
 *    to eliminate it").
 *  - A zero where a figure was withheld. A withheld figure is a dash and a
 *    printed reason.
 *  - Any person, name or id. A rate is a property of the stock.
 */

import { h, toast } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { badge, banner, card, emptyState, stat, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import { workforceFlowBriefText, workforceFlowCsvRows } from '../core/domain/workforceFlow.js';
import {
  WORKFORCE_FLOW_ADR,
  WORKFORCE_FLOW_CSV_COLUMNS,
  WORKFORCE_FLOW_CSV_SCOPE,
  WORKFORCE_FLOW_LEVELS,
  WORKFORCE_FLOW_LIMITS,
  WORKFORCE_FLOW_METHOD,
  WORKFORCE_FLOW_RULE_ID,
  WORKFORCE_FLOW_SETTING_LABELS,
  WORKFORCE_FLOW_BOUNDS,
  WORKFORCE_FLOW_SETTING_KEYS,
  WORKFORCE_FLOW_FRAMEWORKS,
  WORKFORCE_FLOW_CONVENTIONS,
  WORKFORCE_FLOW_KINDS,
} from '../core/domain/workforceFlowRegistry.js';

const DIAGRAM_URL = './app/assets/workforce-stock-flow.jpg';
const num = (value) => (value === null || value === undefined || value === '' ? '—' : String(value));
const claim = (value) => (value ? 'yes' : 'NO');
const pct = (rate) => (rate === null || rate === undefined ? '—' : `${(rate * 100).toFixed(1)}% / yr`);
const months = (v) => (v === null || v === undefined ? '—' : `${v.toFixed(1)} mo`);

function headerCard(ctx, report) {
  return card({
    title: 'The stock, the flows and the four claims',
    subtitle: `${WORKFORCE_FLOW_ADR} · ${report.engineVersion} · read from ${ctx?.state?.settings?.activeSeatId ? 'the declared seat' : 'the operator view'}`,
    body: h('div', { class: 'stack' },
      h('div', { class: 'grid grid-3' },
        stat({ label: 'Active headcount', value: num(report.population.stockedN), hint: `${report.population.rosterN} on the roster` }),
        stat({ label: 'Levels with a printed rate', value: `${report.rates.printedN} / ${report.rates.cellsN}`, hint: `floor ${report.rates.minExposure} person-month(s)`, tone: report.rates.withheldN ? 'warn' : '' }),
        stat({ label: 'Moves in the window', value: num(report.acts.inWindowN), hint: `${report.window.fromISO || '—'} → ${report.window.toISO || '—'}` }),
        stat({ label: 'Projected at the horizon', value: report.projectedTotal === null ? '—' : num(report.projectedTotal), hint: report.horizon.endsOn ? `by ${report.horizon.endsOn} (${report.horizon.quarters}Q)` : `${report.horizon.quarters} quarter(s)`, tone: report.claims.projected ? 'good' : 'bad' }),
        stat({ label: 'Declared shape', value: report.target.total === null ? '—' : num(report.target.total), hint: report.target.declaredN ? `${report.target.declaredN} level(s) declared` : 'nothing declared' }),
        stat({ label: 'Gap against the declared shape', value: report.target.gapTotal === null ? '—' : (report.target.gapTotal > 0 ? `+${report.target.gapTotal}` : num(report.target.gapTotal)), hint: `${report.target.shortN} short · ${report.target.overN} over`, tone: report.target.gapTotal ? 'warn' : '' }),
      ),
      h('p', { class: 'lede' }, report.headline),
      h('p', { class: 'muted small' }, `Four claims, printed apart because they are four different facts. The window was observed — ${claim(report.claims.observed)}. The rates were estimable from enough exposure — ${claim(report.claims.estimated)}. The pyramid was projected — ${claim(report.claims.projected)}. A declared shape was compared — ${claim(report.claims.compared)}.`),
      report.claims.observed ? null : banner({ tone: 'warn', title: 'The window holds no recorded move', body: 'No rate can be estimated over an empty window. The roster holds today’s levels, which is a snapshot, not a history — a rate derived from it would be whatever today’s pyramid happens to look like.' }),
      report.acts.originUnknownN ? banner({ tone: 'warn', title: `${report.acts.originUnknownN} move(s) name no origin level`, body: 'They are counted and excluded from every rate. They are never assigned to the level the person carries today, because an archived person’s level today is not the level they left from.' }) : null,
      report.rates.withheldN ? banner({ tone: 'warn', title: `${report.rates.withheldN} level(s) carry too little exposure for a rate`, body: `Below the declared floor of ${report.rates.minExposure} person-month(s) the rate is blank with its reason. Nothing is smoothed toward a prior and nothing is borrowed from a neighbouring level. Where a rate is missing the projection carries that level’s headcount unchanged and says so on the row.` }) : null,
      report.claims.projected && !report.claims.compared ? banner({ tone: 'info', title: 'The projection is printed with no comparison', body: 'No intended shape has been declared, so the comparison claim is refused rather than made against the projection itself. Declare the headcount you intend to hold at each level to turn this into a gap.' }) : null,
    ),
  });
}

function levelsCard(report) {
  const rows = report.levels.map((row) => ({
    level: h('div', {}, h('strong', {}, row.label), h('span', { class: 'muted small' }, ` · ${row.level}`)),
    headcount: num(row.headcount),
    exposure: row.exposureSufficient ? num(row.exposureMonths) : h('span', {}, h('span', { class: 'muted small' }, 'not printed (')),
    promotions: num(row.promotionsOut),
    promotionRate: row.promotionRatePerYear === null ? h('span', { class: 'muted small' }, 'withheld') : pct(row.promotionRatePerYear),
    attrition: num(row.attritionOut),
    attritionRate: row.attritionRatePerYear === null ? h('span', { class: 'muted small' }, 'withheld') : pct(row.attritionRatePerYear),
    wait: row.waitMonths === null ? h('span', { class: 'muted small' }, '—') : months(row.waitMonths),
    projected: row.projected === null ? h('span', { class: 'muted small' }, 'not projected') : num(row.projected),
    target: row.targetHeadcount === null ? h('span', { class: 'muted small' }, 'not declared') : num(row.targetHeadcount),
    gap: row.gap === null ? h('span', { class: 'muted small' }, '—') : h('span', {}, badge(row.gap === 0 ? 'level' : (row.gap > 0 ? `+${row.gap} over` : `${row.gap} short`), row.gap === 0 ? 'good' : 'warn')),
    reason: h('span', { class: 'muted small' }, row.reason || row.note || '—'),
  }));
  return card({
    title: 'The pyramid, level by level',
    subtitle: `One row per roster level. Exposure is the person-months the stock actually stood there inside the ${report.window.months}-month window; a rate is moves ÷ exposure × 12, printed per person-year.`,
    body: table({
      columns: [
        { key: 'level', label: 'Level' },
        { key: 'headcount', label: 'Now' },
        { key: 'exposure', label: 'Exposure (person-months)' },
        { key: 'promotions', label: 'Promoted out' },
        { key: 'promotionRate', label: 'Promotion rate' },
        { key: 'attrition', label: 'Left' },
        { key: 'attritionRate', label: 'Attrition rate' },
        { key: 'wait', label: 'Wait in grade (Little’s Law)' },
        { key: 'projected', label: `Projected ${report.horizon.endsOn || ''}` },
        { key: 'target', label: 'Declared shape' },
        { key: 'gap', label: 'Gap' },
        { key: 'reason', label: 'Refusal / note' },
      ],
      rows,
      caption: 'The workforce pyramid: stock, exposure, flows and projection per level',
      emptyMessage: 'No level row is available for this seat. The disclosure ladder withheld them with a printed reason rather than showing zeroed rows.',
    }),
  });
}

function transitionCard(report) {
  const rows = report.transition.map((row) => ({
    kind: row.kindLabel,
    from: row.fromLevel,
    to: row.toLevel,
    count: row.count,
  }));
  return card({
    title: 'The estimated transition matrix',
    subtitle: 'Counts only — the denominator behind every one is the exposure on the row above. Hires and lateral moves are deliberately excluded: a hire has no origin stock and a lateral move changes no rung.',
    body: table({
      columns: [
        { key: 'kind', label: 'Flow' },
        { key: 'from', label: 'From level' },
        { key: 'to', label: 'To level' },
        { key: 'count', label: 'Count in window' },
      ],
      rows,
      caption: 'Observed transitions between level stocks',
      emptyMessage: 'No transition between levels was recorded inside the window.',
    }),
  });
}

function pathCard(report) {
  if (!report.path || !report.path.length) return null;
  const rows = report.path.map((q) => ({
    quarter: `Q${q.quarter}`,
    total: q.total,
    hires: q.hires,
    out: q.promotedOut,
  }));
  return card({
    title: 'The projection path, quarter by quarter',
    subtitle: 'Expected headcount at the end of each quarter. Integer rounding is carried into the next quarter rather than dropped, so no headcount is created or destroyed by rounding.',
    body: h('div', { class: 'stack' },
      table({
        columns: [
          { key: 'quarter', label: 'Quarter' },
          { key: 'total', label: 'Headcount at quarter end' },
          { key: 'hires', label: 'Hires in the quarter' },
          { key: 'out', label: 'Promoted out of the top rung' },
        ],
        rows,
        caption: 'Quarterly projection path',
      }),
      report.roundingDifference
        ? h('p', { class: 'muted small' }, `The integer rounding difference between the sum of the printed level rows and the printed total is ${report.roundingDifference}. It is printed rather than absorbed, because a total that is not the sum of its rows is exactly the reassuring figure this panel refuses to produce.`)
        : h('p', { class: 'muted small' }, 'The printed level rows sum exactly to the printed total.'),
      h('p', { class: 'muted small' }, `Hires enter the entry rung (${report.hireEntryLevel}) at ${report.hireRatePerYear === null ? 'no estimable rate' : `${(report.hireRatePerYear * 100).toFixed(1)}% per person-year`}: the record carries no per-level hire split, and inventing one would be the substitution this module refuses.`),
    ),
  });
}

function withheldCard(report) {
  if (!report.withheld.length) return null;
  return card({
    title: 'What is withheld, and why',
    subtitle: 'Every refusal is counted and named. A withheld figure is never a zero, a blank that reads as reassurance, or a plausible default.',
    body: table({
      columns: [
        { key: 'key', label: 'Refusal' },
        { key: 'label', label: 'Reason' },
        { key: 'count', label: 'Count' },
      ],
      rows: report.withheld.map((w) => ({ key: w.key, label: w.label, count: w.count })),
      caption: 'Withheld figures and their reasons',
    }),
  });
}

function matrixCard(report) {
  const m = report.matrix || {};
  if (!m.lines || !m.lines.length) {
    return card({
      title: 'The per-line reading',
      subtitle: 'A person on several reporting lines is ONE person in this stock.',
      body: h('p', { class: 'muted small' }, m.hasMatrix
        ? 'Declared reporting lines exist but none is in reach of this seat. No share-weighted figure is printed rather than printing zero.'
        : 'This workspace declares no additional reporting line, so the per-line reading is inert and the pyramid above is unaffected. A single-chain workspace is fully served by this panel.'),
    });
  }
  const rows = m.lines.map((line) => ({
    manager: h('div', {}, h('strong', {}, line.name), h('span', { class: 'muted small' }, line.isLeader ? ' · workspace leader' : (line.altitude ? ` · ${line.altitude}` : ''))),
    perLevel: line.rows.map((r) => `${r.label}: ${r.peopleN} person(s)${r.refusedN ? ` (${r.refusedN} share undeclared)` : ''}`).join(' · '),
    weighted: line.rows.map((r) => `${r.label}: ${(r.headcountH / 100).toFixed(2)}`).join(' · '),
  }));
  return card({
    title: 'The per-line reading (share-weighted, exact hundredths)',
    subtitle: m.shareWeightedComplete
      ? 'A person shared 60/40 across two lines contributes 0.60 and 0.40 of a person to those lines — and exactly ONE person to the pyramid above. The share-weighted total is a separate fact and is printed as one.'
      : `The share-weighted reading is PARTIAL: ${m.unresolvedShareN} line(s) carry no declared share${m.defectsN ? ` and the declared graph holds ${m.defectsN} defect(s)` : ''}. Those shares are refused rather than assumed to be 100%, so no share-weighted total is claimed.`,
    body: table({
      columns: [
        { key: 'manager', label: 'Line holder' },
        { key: 'perLevel', label: 'People on this line, by level' },
        { key: 'weighted', label: 'Share-weighted (of a person)' },
      ],
      rows,
      caption: 'Per-line share-weighted headcount',
    }),
  });
}

function conventionsCard(ctx, report) {
  const c = report.conventions;
  const rows = Object.entries(WORKFORCE_FLOW_SETTING_KEYS).map(([name, key]) => ({
    name: WORKFORCE_FLOW_SETTING_LABELS[name],
    value: typeof c[name] === 'boolean' ? (c[name] ? 'on' : 'off') : (name === 'askDueDays' ? `${c[name]} day(s)` : c[name]),
    bound: WORKFORCE_FLOW_BOUNDS[name] ? `${WORKFORCE_FLOW_BOUNDS[name][0]}–${WORKFORCE_FLOW_BOUNDS[name][1]}` : 'switch',
    key,
  }));
  return card({
    title: 'Conventions in force',
    subtitle: 'Declared once, printed from the settings in memory. The setter refuses a value outside its bound rather than clamping it.',
    body: table({
      columns: [
        { key: 'name', label: 'Convention' },
        { key: 'value', label: 'In force' },
        { key: 'bound', label: 'Bound' },
        { key: 'key', label: 'Settings key' },
      ],
      rows,
      caption: 'Workforce stock-flow conventions',
    }),
  });
}

function briefCard(report) {
  const rows = workforceFlowCsvRows(report);
  const downloadCsv = () => {
    const ok = downloadText({
      filename: `${WORKFORCE_FLOW_CSV_SCOPE}-${report.generatedOn}.csv`,
      text: serializeCsv(WORKFORCE_FLOW_CSV_COLUMNS.map((key) => ({ key, header: key })), rows),
      mime: 'text/csv',
    });
    if (!ok) toast('The download was blocked by the browser.', 'bad');
    return ok;
  };
  return card({
    title: 'The brief (identity-free)',
    subtitle: 'The paragraph that goes upward. It names no person, no line and no record.',
    actions: [h('button', { class: 'btn btn-small', type: 'button', onclick: downloadCsv }, 'Download CSV (aggregate-only)')],
    body: h('div', { class: 'stack-sm' },
      h('p', {}, workforceFlowBriefText(report)),
      h('p', { class: 'muted small' }, `The export carries counts, exposure, rates and gaps only: no person, no name, no id, no manager, no line and no free text. A withheld rate is BLANK with its reason in \`row_reason\` rather than a zero. ${rows.length} row(s) are exported from the same reader this panel renders.`),
    ),
  });
}

function methodCard(report) {
  return card({
    title: `Method, frameworks and the refusal contract (${WORKFORCE_FLOW_ADR})`,
    body: h('div', { class: 'stack' },
      h('figure', { style: { margin: '0' } },
        h('img', {
          src: DIAGRAM_URL,
          alt: 'Five level stocks stacked vertically with promotion arrows between them, a demotion arrow downward, a hire arrow entering the bottom rung, exit arrows leaving each rung, and a transition matrix inset beside them.',
          loading: 'lazy', width: '1000', height: '330', 'data-testid': 'workforce-flow-diagram',
          style: { width: '100%', 'max-width': '1000px', height: 'auto' },
        }),
        h('figcaption', { class: 'small' }, 'Conceptual method diagram, not workspace data. Generated for this register; provenance recorded in the ADR.')),
      h('h4', {}, 'The method, step by step'),
      h('ol', { class: 'stack small' }, ...WORKFORCE_FLOW_METHOD.map((line) => h('li', {}, line))),
      h('h4', {}, 'The flows this model reads'),
      table({
        columns: [
          { key: 'kind', label: 'Flow' },
          { key: 'from', label: 'Origin' },
          { key: 'to', label: 'Destination' },
          { key: 'why', label: 'Why it is modelled this way' },
        ],
        rows: WORKFORCE_FLOW_KINDS.map((k) => ({ kind: k.label, from: k.from, to: k.to, why: k.why })),
        caption: 'Declared move kinds',
      }),
      h('h4', {}, 'Frameworks'),
      WORKFORCE_FLOW_FRAMEWORKS.map((row) => h('div', { class: 'stack-sm' },
        h('strong', {}, row.name), h('p', { class: 'muted small' }, row.why))),
      h('h4', {}, 'Conventions the reader will not relax'),
      WORKFORCE_FLOW_CONVENTIONS.map((row) => h('div', { class: 'stack-sm' },
        h('strong', {}, row.label), h('p', { class: 'muted small' }, row.detail))),
      h('h4', {}, 'The disclosure ladder'),
      report.ladder.map((row) => h('div', { class: 'stack-sm' },
        h('strong', {}, row.key), h('p', { class: 'muted small' }, row.reason))),
      h('p', { class: 'muted small' }, `Processing bounds: ${WORKFORCE_FLOW_LIMITS.acts} move acts, ${WORKFORCE_FLOW_LIMITS.targets} shape declarations, ${WORKFORCE_FLOW_LIMITS.asksPerCommit} asks per commit. Overrunning a bound refuses the claim rather than printing a partial one. ${WORKFORCE_FLOW_RULE_ID} asks about the record and the declared shape, never about a person.`),
      h('p', { class: 'muted small' }, 'NOT shipped in this slice: per-level hire routing, cost per flow, promotion-queue capacity back-pressure and a within-level seniority split. They remain In Progress in ROADMAP.md.'),
    ),
  });
}

export function renderMatrixWorkforceFlowPanel(ctx, opts = {}) {
  const state = ctx?.state || {};
  const now = opts.now || new Date();
  const api = ctx?.api || null;
  const result = api?.workforceFlowReport
    ? api.workforceFlowReport()
    : { ok: false, error: 'The workforce stock-flow read is unavailable through the API gateway.' };
  if (!result?.ok) {
    return card({
      title: 'Workforce stock-flow',
      body: banner({ tone: 'bad', title: 'The plan could not be read', body: result?.error || 'The reader could not run.' }),
    });
  }
  const report = result.report;
  if (!report.levels.length && report.detailLevel === 'none') {
    return h('div', { class: 'stack', 'data-testid': 'workforce-flow-panel' },
      emptyState({
        title: 'Counts only for this seat',
        body: 'The disclosure ladder withholds the level rows, the rates and the projection from this seat. Every count that remains is computed over the whole of this seat’s span.',
      }),
      headerCard(ctx, report),
      withheldCard(report),
    );
  }
  return h('div', { class: 'stack', 'data-testid': 'workforce-flow-panel' },
    h('p', { class: 'lede' }, 'A promotion round, a hiring freeze and an attrition spike are three decisions. Their joint effect on the shape of this organisation is one system — and until now it arrived eighteen months later, unannounced. This panel estimates the level-by-level transition matrix from the moves the record actually holds, prints every rate with the exposure behind it, steps the pyramid forward, and sets it against the shape somebody declared. Nothing here names a person.'),
    headerCard(ctx, report),
    levelsCard(report),
    pathCard(report),
    transitionCard(report),
    matrixCard(report),
    withheldCard(report),
    conventionsCard(ctx, report),
    briefCard(report),
    methodCard(report),
  );
}

export default renderMatrixWorkforceFlowPanel;
