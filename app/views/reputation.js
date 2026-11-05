/**
 * app/views/reputation.js — `#/reputation`, the Reputational Capital Ledger
 * (ADR-0101).
 *
 * Five panels, five different questions at five different altitudes:
 *   Desk        "What does this altitude need to do, and what is withheld?"
 *   Classes     "Which act classes carry this organisation, and which cannot be read?"
 *   Guarantees  "What does a promise cost to guarantee here — priced per tier?"
 *   Repairs     "What would make one cell carry the ask, in acts?"
 *   Method      "What exactly is being computed, and what is refused?"
 *
 * Nothing on this screen ranks a person, scores a person, or orders people. The
 * unit is what an ACT will cost to guarantee; the tables are keyed by class and
 * tier, and the only person-level rows are the ones the active seat is allowed to
 * read at all.
 */
import { h, toast } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import {
  ACT_CLASSES,
  ENGAGEMENT_TIERS,
  REPUTATION_VERDICT_META,
  REPUTATION_PLAYBOOK,
} from '../core/domain/reputationalCapitalRegistry.js';

const PANELS = [
  { key: 'desk', label: 'Desk' },
  { key: 'classes', label: 'Act classes' },
  { key: 'guarantees', label: 'Guarantees' },
  { key: 'repair', label: 'Repairs' },
  { key: 'method', label: 'Method' },
];

const CSV_COLUMNS = ['row_kind', 'act_class', 'verdict_band', 'spans_n', 'kept', 'breached', 'exposure',
  'pooled_kept_pct', 'interval_low_pct', 'interval_high_pct', 'hazard_pct', 'suppressed',
  'solvent_n', 'encumbered_n', 'drawn_down_n', 'contested_n', 'expired_n', 'refused_n', 'insolvent_n'];

const panelFor = (q) => {
  const p = q?.get?.('panel');
  return PANELS.some((item) => item.key === p) ? p : 'desk';
};
const pct = (value) => (value === null || value === undefined ? 'refused' : `${value}%`);
const verdictBadge = (verdict) => {
  const meta = REPUTATION_VERDICT_META[verdict] || { label: verdict || 'unmeasured', tone: 'neutral' };
  return badge(meta.label, meta.tone, meta.meaning || '');
};
const num = (value, dp = 1) => (value === null || value === undefined ? '—' : Number(value).toFixed(dp));
/** A counter-party's display name, resolved by id. Unknown ids stay anonymous. */
const nameOf = (ctx, personId) => {
  const people = Array.isArray(ctx?.state?.people) ? ctx.state.people : [];
  const found = people.find((p) => p && p.id === personId);
  return found?.name || 'a span';
};

function notify(result, message) {
  if (!result?.ok) {
    toast(result?.error || 'The reputational-capital action was refused.', 'bad');
    return false;
  }
  toast(result.warning || message, result.warning ? 'bad' : 'good');
  return true;
}

function exportCsv() {
  const result = window.leadosApi?.reputationCsvRows?.();
  if (!result?.ok) {
    toast(result?.error || 'The reputational export was refused.', 'bad');
    return;
  }
  const columns = CSV_COLUMNS.map((key) => ({ key, header: key }));
  downloadText({
    filename: `leados-reputational-capital-${new Date().toISOString().slice(0, 10)}.csv`,
    text: serializeCsv({ columns, rows: result.rows }),
    mime: 'text/csv',
  });
}

function copyBrief(ctx) {
  const result = ctx.api.reputationBriefText();
  if (!result?.ok) {
    toast(result?.error || 'No brief available.', 'bad');
    return;
  }
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(result.text).then(
      () => toast('Identity-free brief copied to the clipboard.', 'good'),
      () => toast('The clipboard is unavailable in this browser; the brief is shown in the Method panel.', 'neutral'),
    );
  } else {
    toast('The clipboard is unavailable in this browser; the brief is shown in the Method panel.', 'neutral');
  }
}

/* ------------------------------------------------------------------- Desk */

function deskPanel(ctx, report) {
  const pb = report.playbook || REPUTATION_PLAYBOOK.chief;
  const payable = report.positions.filter((row) => row.kind === 'guarantee');
  const atRisk = payable.filter((row) => row.reading.verdict !== 'solvent');
  return h('div', { class: 'stack' },
    banner({ tone: 'info', title: pb.title, body: `${pb.question} Horizon: ${pb.horizon}.` }),
    card({
      title: 'What you can see at this altitude',
      body: h('div', { class: 'stack' },
        h('p', null, pb.see),
        h('p', null, h('strong', null, 'Act: '), pb.act),
        h('p', null, h('strong', null, 'Hand up: '), pb.hand)),
    }),
    card({
      title: 'Position',
      body: h('div', { class: 'stat-row' },
        stat({ label: 'Acts on record', value: String(report.totals.actsN), hint: `${report.totals.excusedN} excused, ${report.totals.lapsedN} lapsed` }),
        stat({ label: 'Cells read', value: String(report.totals.cellsN), hint: `Solvent ${report.totals.solventN} · encumbered ${report.totals.encumberedN} · drawn down ${report.totals.drawnDownN}` }),
        stat({ label: 'Refused cells', value: String(report.totals.refusedN), tone: report.totals.refusedN ? 'warn' : 'good', hint: 'Refusal is an outcome, never a zero' }),
        stat({ label: 'Guarantees at risk', value: String(atRisk.length), tone: atRisk.length ? 'bad' : 'good', hint: `${payable.length} open guarantee(s) in your span` })),
    }),
    card({
      title: 'Direction of reputational capital',
      body: h('div', { class: 'stack' },
        h('p', null, h('strong', null, `${report.growth.verdict}: `), report.growth.reason),
        report.growth.recentPct === undefined ? null : h('p', { class: 'muted' },
          `Recent half-window ${pct(report.growth.recentPct)} over ${report.growth.recentExposure} act(s); prior half-window ${pct(report.growth.priorPct)} over ${report.growth.priorExposure} act(s).`)),
    }),
    report.shocks.length ? card({
      title: 'Withdrawal shock — a declared scenario, not a forecast',
      subtitle: 'If every cell of a class were drawn to zero today, these are the open positions that would no longer clear their obstacle. No probability is assigned.',
      body: table({
        caption: 'Open positions by act class under a zeroed-class scenario',
        columns: [
          { label: 'Class', render: (row) => h('strong', null, row.label) },
          { label: 'Open', render: (row) => String(row.openPositionsN) },
          { label: 'At risk', render: (row) => String(row.atRiskN) },
          { label: 'Share', render: (row) => (row.atRiskPct === null ? '—' : `${row.atRiskPct}%`) },
        ],
        rows: report.shocks,
      }),
    }) : null,
    report.openDecisions.length ? card({
      title: 'Governed findings awaiting a human',
      subtitle: 'RULE-RCL-02..04 open decisions; they never close one. Nothing in this list changes a record until a person chooses.',
      body: table({
        caption: 'Open reputational-capital decisions',
        columns: [
          { label: 'Opened', render: (row) => row.date },
          { label: 'Decision', render: (row) => h('a', { href: '#/decisions' }, row.title) },
          { label: 'Review', render: (row) => row.reviewOn || '—' },
        ],
        rows: report.openDecisions.slice(0, 8),
      }),
    }) : null);
}

/* ---------------------------------------------------------------- Classes */

function classesPanel(ctx, report) {
  return h('div', { class: 'stack' },
    card({
      title: 'Eight act classes, pooled across the spans you can read',
      subtitle: 'Pooled counts, never an average of rates. A cell below the publishing floor is BLANK with a reason, never zero.',
      body: report.classRows.some((row) => row.exposure > 0)
        ? table({
          caption: 'Act classes: pooled kept share with Wilson intervals and the declared hazard anchor',
          columns: [
            { label: 'Class', render: (row) => h('div', null, h('strong', null, row.label), h('div', { class: 'muted' }, row.question)) },
            { label: 'Kept / breached', render: (row) => `${num(row.kept)} / ${num(row.breached)}` },
            { label: 'Spans', render: (row) => String(row.personsN) },
            {
              label: 'Pooled kept',
              render: (row) => (row.suppressed
                ? h('span', { class: 'muted', title: row.suppressedReason || '' }, 'suppressed')
                : h('span', null, `${row.pooledPct}% `, h('span', { class: 'muted' }, `[${row.intervalLowPct}–${row.intervalHighPct}%]`))),
            },
            { label: 'Hazard', render: (row) => `${row.hazardPct}%` },
            {
              label: 'Verdicts',
              render: (row) => h('span', null, [
                row.solventN ? `solvent ${row.solventN} · ` : '',
                row.encumberedN ? `encumbered ${row.encumberedN} · ` : '',
                row.drawnDownN ? `drawn down ${row.drawnDownN} · ` : '',
                row.contestedN ? `contested ${row.contestedN} · ` : '',
                row.expiredN ? `lapsed ${row.expiredN} · ` : '',
                row.refusedN ? `refused ${row.refusedN}` : '',
              ].join('').replace(/ · $/, '') || '—'),
            },
          ],
          rows: report.classRows,
        })
        : emptyState({
          title: 'No act of any class is on record yet',
          body: 'The ledger reads dated work this workspace already holds — a delegation that came back, an authority contract verified, a bet graded. There is nothing to price until one of those exists.',
        }),
    }),
    card({
      title: 'Cells your seat can read',
      subtitle: 'The unit is a counter-party and an act class. There is no composite score and no ordering anywhere on this page.',
      body: report.readings.length
        ? table({
          caption: 'Reputational cells readable at this seat, one row per counter-party and act class',
          columns: [
            { label: 'Counter-party', render: (row) => h('strong', null, ctx.seatContext?.nameOf?.(row.personId) || nameOf(ctx, row.personId)) },
            { label: 'Class', render: (row) => row.actClass },
            { label: 'Acts', render: (row) => String(row.actsN) },
            { label: 'Interval', render: (row) => (row.intervalLowPct === null ? '—' : `${row.intervalLowPct}–${row.intervalHighPct}%`) },
            { label: 'Obstacle', render: (row) => `${row.obstaclePct}%` },
            { label: 'Verdict', render: (row) => verdictBadge(row.verdict) },
            { label: 'Why', render: (row) => h('span', { class: 'muted' }, row.reason || '') },
          ],
          rows: report.readings.slice(0, 40),
        })
        : emptyState({
          title: 'Nothing readable at this seat',
          body: 'No dated act of any class falls inside your span and the declared window. The ledger prints a refusal rather than a prior dressed as a finding.',
        }),
    }));
}

/* ------------------------------------------------------------- Guarantees */

function priceForm(ctx, report) {
  const people = Array.isArray(ctx.state?.people) ? ctx.state.people : [];
  const personSelect = h('select', { class: 'input', id: 'reputation-person' },
    ...people.slice(0, 200).map((p) => h('option', { value: p.id }, p.name || p.id)));
  const classSelect = h('select', { class: 'input', id: 'reputation-class' },
    ...ACT_CLASSES.map((c) => h('option', { value: c.key }, c.label)));
  const tierSelect = h('select', { class: 'input', id: 'reputation-tier' },
    ...ENGAGEMENT_TIERS.map((t) => h('option', { value: t.key }, `${t.label} — ${t.obstaclePct}% obstacle`)));
  const askInput = h('input', { class: 'input', id: 'reputation-ask', type: 'number', min: '0', max: '20', value: String(report.conventions.reputationAskActs) });
  const dueInput = h('input', { class: 'input', id: 'reputation-due', type: 'date' });
  const output = h('div', { class: 'stack', 'aria-live': 'polite' });

  const price = () => {
    const result = ctx.api.reputationPriceAsk({
      personId: personSelect.value,
      actClass: classSelect.value,
      tier: tierSelect.value,
      askActs: Number(askInput.value),
    });
    while (output.firstChild) output.removeChild(output.firstChild);
    if (!result.ok) {
      output.appendChild(h('p', { class: 'muted' }, result.error));
      return;
    }
    const reading = result.reading;
    const cf = result.counterfactual;
    output.appendChild(h('div', { class: 'stat-row' },
      stat({ label: 'Verdict today', value: (REPUTATION_VERDICT_META[reading.verdict] || {}).label || reading.verdict, tone: reading.verdict === 'solvent' ? 'good' : reading.verdict === 'encumbered' ? 'warn' : 'bad' }),
      stat({ label: 'Obstacle', value: `${reading.obstaclePct}%`, hint: `${reading.price.tierLabel} · premium ×${reading.price.multiplier}` }),
      stat({ label: 'Interval', value: reading.intervalLowPct === null ? 'refused' : `${reading.intervalLowPct}–${reading.intervalHighPct}%`, hint: `Declared hazard ${reading.hazardPct}%` }),
      stat({ label: 'Frozen claim', value: result.claimP === null ? 'refused' : `${Math.round(result.claimP * 100)}%`, hint: 'The number RULE-RCL-05 will grade later' })));
    output.appendChild(h('p', null, reading.reason));
    if (cf) {
      output.appendChild(h('p', null, h('strong', null, 'Cheapest honest route: '), cf.verdict));
      output.appendChild(table({
        caption: 'Kept acts needed to carry this ask, by engagement tier',
        columns: [
          { label: 'Tier', render: (row) => row.label },
          { label: 'Obstacle', render: (row) => `${row.obstaclePct}%` },
          { label: 'Acts needed', render: (row) => (row.acts === null ? 'none — the shape of the ask is wrong' : row.clearsNow ? 'already clears' : String(row.acts)) },
        ],
        rows: cf.tiers,
      }));
    }
    if (reading.verdict !== 'solvent') {
      output.appendChild(h('button', {
        class: 'btn',
        type: 'button',
        onClick: () => notify(ctx.api.reputationOpenPosition({
          personId: personSelect.value,
          actClass: classSelect.value,
          kind: 'repair',
          tier: tierSelect.value,
          askActs: Math.max(1, cf?.cheapestRoute?.acts || 1),
          dueOn: dueInput.value || null,
        }), 'Repair opened. The engine will read the acts the record actually banks.'),
      }, 'Open a repair at this price'));
    }
    if (dueInput.value) {
      output.appendChild(h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => notify(ctx.api.reputationOpenPosition({
          personId: personSelect.value,
          actClass: classSelect.value,
          kind: 'guarantee',
          tier: tierSelect.value,
          askActs: Number(askInput.value),
          dueOn: dueInput.value,
        }), 'Guarantee opened with its claim frozen.'),
      }, `Offer the guarantee, due ${dueInput.value}`));
    }
  };
  [personSelect, classSelect, tierSelect, askInput, dueInput].forEach((el) => el.addEventListener('change', price));
  return card({
    title: 'Price an ask before you make it',
    subtitle: 'Nothing is written until you open the position. The claim you see here is the exact number the ledger will grade itself against after the outcome is known.',
    body: h('div', { class: 'stack' },
      h('div', { class: 'field-row' },
        h('label', { for: 'reputation-person' }, 'Counter-party'), personSelect,
        h('label', { for: 'reputation-class' }, 'Act class'), classSelect,
        h('label', { for: 'reputation-tier' }, 'Tier'), tierSelect,
        h('label', { for: 'reputation-ask' }, 'Ask (acts)'), askInput,
        h('label', { for: 'reputation-due' }, 'Due'), dueInput),
      h('button', { class: 'btn', type: 'button', onClick: price }, 'Price it'),
      output),
  });
}

function guaranteesPanel(ctx, report) {
  return h('div', { class: 'stack' },
    priceForm(ctx, report),
    card({
      title: 'Open guarantees',
      subtitle: 'A guarantee is a promise about someone else. When its cell is not solvent the engine opens a decision — it never withdraws authority a human offered.',
      body: report.positions.filter((p) => p.kind === 'guarantee').length
        ? table({
          caption: 'Open guarantees priced against today\'s record',
          columns: [
            { label: 'Counter-party', render: (row) => ctx.seatContext?.nameOf?.(row.personId) || nameOf(ctx, row.personId) },
            { label: 'Class', render: (row) => row.actClass },
            { label: 'Tier', render: (row) => row.tier },
            { label: 'Due', render: (row) => row.dueOn || '—' },
            { label: 'Claim froze', render: (row) => (row.claimP === null || row.claimP === undefined ? 'refused' : `${Math.round(row.claimP * 100)}%`) },
            { label: 'Today', render: (row) => verdictBadge(row.reading.verdict) },
            {
              label: 'Close',
              render: (row) => h('div', { class: 'row-actions' },
                h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => notify(ctx.api.reputationClosePosition({ positionId: row.id, outcome: 'kept' }), 'Guarantee closed as kept.') }, 'Kept'),
                h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => notify(ctx.api.reputationClosePosition({ positionId: row.id, outcome: 'breached' }), 'Guarantee closed as breached.') }, 'Breached'),
                h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => notify(ctx.api.reputationWithdrawPosition({ positionId: row.id }), 'Guarantee withdrawn.') }, 'Withdraw')),
            },
          ],
          rows: report.positions.filter((p) => p.kind === 'guarantee'),
        })
        : emptyState({
          title: 'No guarantee is open',
          body: 'Price an ask above. A guarantee with a frozen claim is the only way this ledger can grade its own accuracy later.',
        }),
    }),
    card({
      title: 'The tier ladder — why a structural answer usually wins',
      subtitle: 'Obstacle is the kept rate the record has to clear. Moving down the ladder takes the ask off the person and onto a mechanism (Grossman–Hart residual control).',
      body: table({
        caption: 'Four engagement tiers and the obstacle each imposes',
        columns: [
          { label: 'Tier', render: (row) => h('strong', null, row.label) },
          { label: 'Obstacle', render: (row) => `${row.obstaclePct}%` },
          { label: 'What it means', render: (row) => h('span', { class: 'muted' }, row.meaning) },
        ],
        rows: ENGAGEMENT_TIERS,
      }),
    }));
}

/* ----------------------------------------------------------------- Repair */

function repairPanel(ctx, report) {
  const repairable = report.readings
    .filter((row) => row.verdict !== 'solvent' && !row.refused)
    .slice(0, 20)
    .map((row) => {
      const priced = ctx.api.reputationCounterfactual({ personId: row.personId, actClass: row.actClass });
      return { row, cf: priced.ok ? priced.counterfactual : null };
    });
  return h('div', { class: 'stack' },
    card({
      title: 'What would make this cell carry the ask',
      subtitle: 'The answer is an integer count of kept acts per tier — never a probability a person could not afford.',
      body: repairable.length
        ? table({
          caption: 'Cheapest honest route to solvency, priced per counter-party and class',
          columns: [
            { label: 'Counter-party', render: (row) => ctx.seatContext?.nameOf?.(row.row.personId) || nameOf(ctx, row.row.personId) },
            { label: 'Class', render: (row) => row.row.actClass },
            { label: 'Verdict', render: (row) => verdictBadge(row.row.verdict) },
            { label: 'Route', render: (row) => (row.cf ? row.cf.verdict : 'not priceable at this seat') },
            { label: 'At the vouching tier', render: (row) => (row.cf ? (row.cf.actsToSolvency === null ? 'no count clears it' : `${row.cf.actsToSolvency} kept act(s)`) : '—') },
          ],
          rows: repairable,
        })
        : emptyState({
          title: 'Nothing needs a repair right now',
          body: 'Every readable cell either clears its obstacle or cannot be priced at all. An empty list here is a good outcome, not a missing feature.',
        }),
    }),
    card({
      title: 'Open repairs',
      subtitle: 'A repair is a costly, observable signal a person makes about themselves. Its target was frozen when it opened; the engine reads only acts dated after that day.',
      body: report.positions.filter((p) => p.kind === 'repair').length
        ? table({
          caption: 'Open repairs and the acts they have banked',
          columns: [
            { label: 'Counter-party', render: (row) => ctx.seatContext?.nameOf?.(row.personId) || nameOf(ctx, row.personId) },
            { label: 'Class', render: (row) => row.actClass },
            { label: 'Target', render: (row) => `${row.askActs} act(s)` },
            { label: 'Opened', render: (row) => row.openedOn },
            { label: 'Due', render: (row) => row.dueOn || '—' },
            { label: 'Status', render: (row) => (row.overdue ? badge('Overdue', 'bad') : badge('Open', 'neutral')) },
            { label: 'Close', render: (row) => h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => notify(ctx.api.reputationClosePosition({ positionId: row.id, outcome: 'withdrawn' }), 'Repair withdrawn.') }, 'Withdraw') },
          ],
          rows: report.positions.filter((p) => p.kind === 'repair'),
        })
        : emptyState({ title: 'No repair is open', body: 'Open one from the Guarantees panel once you have priced the ask.' }),
    }));
}

/* ----------------------------------------------------------------- Method */

function methodPanel(ctx, report) {
  const conv = report.conventions;
  const brief = ctx.api.reputationBriefText();
  return h('div', { class: 'stack' },
    card({
      title: 'The model, stated rather than implied',
      body: h('div', { class: 'stack' },
        h('p', { class: 'muted' }, report.premise),
        h('ul', { class: 'list' }, ...Object.values(report.disclosure).map((line) => h('li', null, line)))),
    }),
    card({
      title: 'Declared conventions in force',
      subtitle: 'Conventions, not estimates. Director+ re-declares them; every cell re-reads them on the next render.',
      body: h('div', { class: 'stat-row' },
        stat({ label: 'Window', value: `${conv.reputationWindowDays} d` }),
        stat({ label: 'Half-life', value: `${conv.reputationHalfLifeDays} d` }),
        stat({ label: 'Act floor', value: String(conv.reputationActFloor) }),
        stat({ label: 'Exposure floor', value: String(conv.reputationExposureFloor) }),
        stat({ label: 'Premium γ', value: String(conv.reputationObstacleGamma) }),
        stat({ label: 'Publishing floor', value: `${conv.reputationPublishedCellFloor} spans` })),
    }),
    card({
      title: 'Declared class hazard rates — the anchor every cell starts from',
      subtitle: 'A prior the record must move. WILSON-FIRST refuses any cell where one hypothetical act would clear the obstacle on the anchor alone.',
      body: table({
        caption: 'Per-class hazard anchors, printed so the prior can be seen beside the record',
        columns: [
          { label: 'Class', render: (row) => row.label },
          { label: 'Anchor', render: (row) => `${row.hazardPct}%` },
          { label: 'Frontier', render: (row) => h('span', { class: 'muted' }, row.frontier) },
        ],
        rows: ACT_CLASSES.map((meta) => ({ ...meta, hazardPct: conv.reputationClassHazard[meta.key] })),
      }),
    }),
    card({
      title: 'Identity-free upward brief',
      actions: [h('button', { class: 'btn', type: 'button', onClick: () => copyBrief(ctx) }, 'Copy brief')],
      body: h('pre', { class: 'brief' }, brief.ok ? brief.text : 'The brief is unavailable.'),
    }),
    report.excluded.length ? card({
      title: 'What was not measured, and why',
      body: h('ul', { class: 'list' }, ...report.excluded.map((row) => h('li', null, h('strong', null, `${row.source}: `), row.reason))),
    }) : null);
}

/* ------------------------------------------------------------------- page */

export function renderReputation(ctx) {
  const report = ctx.api.reputationReport();
  if (!report?.ok) {
    return h('div', { class: 'stack' },
      pageHeader({ title: 'Reputational capital' }),
      banner({ tone: 'bad', title: 'The ledger could not be read', body: report?.error || 'An unexpected error stopped the reading. No figure is shown rather than a wrong one.' }));
  }
  const panel = panelFor(ctx.query);
  const go = (key) => ctx.navigate(`#/reputation?panel=${key}`);
  const body = panel === 'classes' ? classesPanel(ctx, report)
    : panel === 'guarantees' ? guaranteesPanel(ctx, report)
      : panel === 'repair' ? repairPanel(ctx, report)
        : panel === 'method' ? methodPanel(ctx, report)
          : deskPanel(ctx, report);

  return h('div', { class: 'stack' },
    pageHeader({
      title: 'Reputational capital',
      subtitle: 'What it costs to be believed here — priced from acts this workspace already dated, refused where the record cannot support a number.',
      actions: [h('button', { class: 'btn', type: 'button', onClick: () => notify(ctx.api.reputationScan(), 'Scan complete.') }, 'Scan'),
        h('button', { class: 'btn', type: 'button', onClick: () => copyBrief(ctx) }, 'Copy brief'),
        h('button', { class: 'btn', type: 'button', onClick: () => exportCsv() }, 'Export CSV')],
    }),
    tabs({ items: PANELS, current: panel, onSelect: go }),
    body);
}
