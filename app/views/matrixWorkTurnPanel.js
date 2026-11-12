/**
 * app/views/matrixWorkTurnPanel.js — `#/matrix?panel=turns`, the Non-Promotable
 * Work Turn Ledger (ADR-0181, Schema v144).
 *
 * The frontline question this screen answers: "who do I keep handing the work
 * that gets nobody promoted, and whose turn is it?" — and the question only a
 * matrix has: "is somebody carrying a fair turn from each of us and two teams'
 * worth in sum?"
 *
 * Every figure printed here is a field of the report `workTurnReport` returned.
 * The screen computes nothing: no total, no share, no verdict. A rendering
 * stores nothing.
 *
 * WHAT THIS SCREEN REFUSES TO PRINT
 *  - A kind for an ask nobody classified.
 *  - A fair turn for a pool with a share missing, or a pool partly outside the
 *    reading seat. The state says why.
 *  - One name as "next" when two people are tied. The tie is printed.
 *  - A person, an ask or a pool member to a seat whose altitude reads counts.
 */

import { h, toast } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { badge, banner, card, emptyState, stat, table } from '../ui/components.js';
import { exportWorkspaceCsv } from '../core/csv.js';
import { workTurnBriefText } from '../core/domain/workTurns.js';
import {
  WORK_TURN_ADR,
  WORK_TURN_BOUNDS,
  WORK_TURN_CLASS_LABELS,
  WORK_TURN_CLASS_REASONS,
  WORK_TURN_FINDING_LABELS,
  WORK_TURN_KINDS,
  WORK_TURN_KIND_LABELS,
  WORK_TURN_OWNER_LABELS,
  WORK_TURN_PLACEMENT_LABELS,
  WORK_TURN_PLACEMENT_REASONS,
  WORK_TURN_POOL_STATE_LABELS,
  WORK_TURN_POOL_STATE_REASONS,
  WORK_TURN_RULE_ID,
  WORK_TURN_SETTING_KEYS,
  WORK_TURN_SETTING_LABELS,
  WORK_TURN_VERDICT_LABELS,
  WORK_TURN_VERDICT_REASONS,
} from '../core/domain/workTurnRegistry.js';

const BAD = new Set(['over-turn', 'stacked', 'concentrated', 'unplaced', 'stale']);
const WARN = new Set(['unread', 'partial', 'share-undeclared', 'share-zero', 'unclassified', 'leader-held', 'ambiguous', 'off-roster']);
const GOOD = new Set(['within', 'even', 'promotable', 'attributed', 'sole-line', 'unique']);
const tone = (key) => (BAD.has(key) ? 'bad' : WARN.has(key) ? 'warn' : GOOD.has(key) ? 'good' : 'neutral');
const shareText = (shareH) => (shareH === null || shareH === undefined ? 'not declared' : `${shareH}%`);

function refresh(ctx) {
  if (typeof ctx?.refresh === 'function') ctx.refresh();
  else if (typeof ctx?.rerender === 'function') ctx.rerender();
  else if (typeof ctx?.render === 'function') ctx.render();
}

function act(ctx, result, ok) {
  if (!result?.ok) { toast(result?.error || 'The action was refused.', 'bad'); return; }
  toast(ok, 'good');
  refresh(ctx);
}

/* ------------------------------------------------------------------- board */

function boardCard(ctx, report, now) {
  const b = report.board;
  const reconciles = b.populationReconciles && b.classesReconcile && b.placementsReconcile
    && b.verdictsReconcile && b.poolsReconcile && b.ownersReconcile && b.turnRanksReconcile;
  const alarming = b.findingsN > 0 || b.verdicts.unplaced > 0;
  const actions = [
    report.actor.canGovern ? h('button', {
      class: 'btn btn-small btn-primary', type: 'button', 'data-testid': 'npw-scan',
      onClick: () => act(ctx, ctx.api.workTurnScan(), `Scanned (${WORK_TURN_RULE_ID}).`),
    }, 'Scan turns') : null,
    h('button', {
      class: 'btn btn-small', type: 'button',
      onClick: () => downloadText({ filename: `leados-work-turns-${report.generatedOn}.txt`, text: workTurnBriefText(report), mime: 'text/plain' }),
    }, 'Download brief'),
    h('button', {
      class: 'btn btn-small', type: 'button',
      onClick: () => {
        const result = exportWorkspaceCsv(ctx.state || {}, 'work-turns', { now });
        if (!result?.ok) { toast(result?.error || 'Export refused.', 'bad'); return; }
        downloadText({ filename: result.filename, text: result.csv, mime: 'text/csv' });
      },
    }, 'Export CSV (#135)'),
  ].filter(Boolean);

  return card({
    title: 'Non-Promotable Work Turns',
    subtitle: `Work that has to be done and advances nobody, read by who was handed it — ${report.window.from} to ${report.window.to} (${report.window.days} days).`,
    actions,
    body: h('div', { class: 'stack' },
      reconciles
        ? banner({
          tone: alarming ? 'warn' : 'good',
          title: 'All seven count identities reconcile',
          body: h('pre', { class: 'small', 'data-testid': 'npw-brief' }, workTurnBriefText(report)),
        })
        : banner({
          tone: 'bad',
          title: 'Reconciliation failure — do not rely on these figures',
          body: 'At least one printed partition does not add up to its computed population.',
        }),
      h('div', { class: 'stat-grid' },
        stat({ label: 'Asks read', value: String(b.asksReadN), hint: `${b.asksNotReadN} outside this seat · ${b.asksReturnedN} handed back · ${b.asksRuleIssuedN} from automation` }),
        stat({ label: 'Non-promotable', value: String(b.classes['non-promotable']), hint: `${b.classes.promotable} promotable` }),
        stat({ label: 'Not classified', value: String(b.classes.unclassified), tone: b.classes.unclassified ? 'warn' : 'good' }),
        stat({ label: 'Over a fair turn', value: String(b.verdicts['over-turn']), tone: b.verdicts['over-turn'] ? 'bad' : 'good', hint: `${b.pools.concentrated} pool(s) concentrated` }),
        stat({ label: 'Stacked across lines', value: String(b.verdicts.stacked), tone: b.verdicts.stacked ? 'bad' : 'good', hint: `${report.sharedPeopleN} on more than one line` }),
        stat({ label: 'Stable next-turn sets', value: String(b.turnRanks.stable), hint: `${b.turnRanks.uncertain} uncertain · refusals itemised below` }),
        stat({ label: 'Open rotation asks', value: String(b.openRotationAsksN), hint: WORK_TURN_RULE_ID })),
      report.detail.withheld
        ? banner({ tone: 'info', title: 'Detail is withheld at this altitude', body: report.detail.reason })
        : null),
  });
}

/* ------------------------------------------------------------------- pools */

function poolsCard(report) {
  if (!report.pools.length) return null;
  const memberRows = report.pools.flatMap((pool) => pool.members.map((member) => ({ ...member, pool })));
  return card({
    title: 'Pools',
    subtitle: 'Turns use classified and placed ask counts, weighted by line share. Unresolved asks can change the result. A count is not effort, capacity or consent; consult the receiving lines before moving work.',
    body: h('div', { class: 'stack' },
      table({
        caption: 'Manager pools and whose turn is next',
        columns: [
          { label: 'Manager', render: (p) => p.managerName },
          { label: 'State', render: (p) => badge(WORK_TURN_POOL_STATE_LABELS[p.stateKey], tone(p.stateKey), WORK_TURN_POOL_STATE_REASONS[p.stateKey]) },
          { label: 'People', render: (p) => (p.hiddenN ? `${p.memberN} (${p.hiddenN} outside this seat)` : String(p.memberN)) },
          { label: 'Classified and placed asks', render: (p) => String(p.totalN) },
          { label: 'Unresolved asks possible here', render: (p) => (p.turnRank.unresolvedN === null ? 'refused' : String(p.turnRank.unresolvedN)) },
          { label: 'Next turn, under recorded bounds', render: (p) => p.turnRank.text },
        ],
        rows: report.pools,
      }),
      memberRows.length ? table({
        caption: 'Pool members and fair turns',
        columns: [
          { label: 'Manager', render: (m) => m.pool.managerName },
          { label: 'Person', render: (m) => m.name },
          { label: 'Line', render: (m) => m.kind },
          { label: 'Share of the person', render: (m) => shareText(m.shareH) },
          { label: 'Classified and placed', render: (m) => String(m.carriedN) },
          { label: 'Unresolved possible here', render: (m) => String(m.unresolvedN) },
          { label: 'Count bounds', render: (m) => `${m.carriedN}–${m.upperN}` },
          { label: 'Turn from placed asks', render: (m) => (m.turnText ? `${m.turnText}${m.turnApprox === null ? '' : ` ≈ ${m.turnApprox}`}` : 'refused') },
          { label: 'Reading', render: (m) => (m.over ? badge('Over a fair turn', 'bad') : '—') },
        ],
        rows: memberRows,
      }) : null),
  });
}

/* ------------------------------------------------------------------ people */

function peopleCard(report) {
  if (report.detail.level === 'none') return null;
  if (!report.people.length) {
    if (report.detail.level !== 'visible') return null;
    return emptyState({ title: 'Nobody is carrying classified non-promotable work', body: report.inertNote || 'Every person read is within a fair turn.' });
  }
  return card({
    title: 'Who is carrying it',
    subtitle: 'One row per person with at least one non-promotable ask in the window, across every line they hold.',
    body: table({
      caption: 'People carrying non-promotable work',
      columns: [
        { label: 'Person', render: (p) => p.name },
        { label: 'Lines held', render: (p) => String(p.lineN) },
        { label: 'Non-promotable asks', render: (p) => String(p.nptN) },
        { label: 'By line', render: (p) => `${p.lines.map((l) => `${l.managerName} ${l.carriedN}`).join(' · ') || '—'}${p.unreadableN ? ` · no line ${p.unreadableN}` : ''}` },
        { label: 'Verdict', render: (p) => badge(WORK_TURN_VERDICT_LABELS[p.verdict], tone(p.verdict), WORK_TURN_VERDICT_REASONS[p.verdict]) },
      ],
      rows: report.people,
    }),
  });
}

/* ---------------------------------------------------------------- findings */

function findingsCard(report) {
  if (!report.findings.length) return null;
  return card({
    title: 'Findings and the seat that owns each',
    subtitle: `${WORK_TURN_RULE_ID} asks the one owning seat, once. Where there is no single owning seat it records that and substitutes nobody.`,
    body: table({
      caption: 'Work-turn findings and owning seats',
      columns: [
        { label: 'Finding', render: (f) => WORK_TURN_FINDING_LABELS[f.kind] },
        { label: 'Who', render: (f) => (f.personNames.length ? f.personNames.join(', ') : `${f.peopleN} (withheld at this altitude)`) },
        { label: 'Carried of total', render: (f) => `${f.carriedN} of ${f.totalN}` },
        { label: 'Owning seat', render: (f) => badge(f.ownerName ? `${WORK_TURN_OWNER_LABELS[f.ownerState]}: ${f.ownerName}` : WORK_TURN_OWNER_LABELS[f.ownerState], tone(f.ownerState)) },
      ],
      rows: report.findings,
    }),
  });
}

/* -------------------------------------------------------------------- asks */

function asksCard(ctx, report) {
  if (report.detail.level === 'none') return null;
  if (!report.asks.length) {
    if (report.detail.level !== 'visible') return null;
    return emptyState({ title: 'No ask was handed over inside the window', body: 'Hand over a dated ask on the Delegations page; it will appear here to be classified.' });
  }
  return card({
    title: 'Asks in the window',
    subtitle: `Classifying appends a dated act; nothing is overwritten.${report.asksUnlistedN ? ` Listing ${report.asksListedN}; ${report.asksUnlistedN} more ask(s) are counted above and not listed here.` : ''}`,
    body: table({
      caption: 'Asks handed over inside the look-back window',
      columns: [
        { label: 'Handed over', render: (a) => a.delegatedOn },
        { label: 'Person', render: (a) => a.personName },
        { label: 'Ask', render: (a) => a.title },
        // The badge's title is the registry's reason for that state — the same
        // sentence the engine was written against, never a paraphrase.
        { label: 'Kind', render: (a) => badge(WORK_TURN_CLASS_LABELS[a.classKey], tone(a.classKey), WORK_TURN_CLASS_REASONS[a.classKey]) },
        {
          label: 'Line',
          render: (a) => (a.placement
            ? h('span', {}, badge(WORK_TURN_PLACEMENT_LABELS[a.placement], tone(a.placement), WORK_TURN_PLACEMENT_REASONS[a.placement]), a.managerName ? ` · ${a.managerName}` : '')
            : '—'),
        },
        {
          label: 'Classify',
          render: (a) => {
            if (!a.canClassify) return '—';
            const select = h('select', { class: 'input', 'aria-label': `Kind of work for ${a.title}` },
              h('option', { value: '' }, 'Choose kind'),
              ...WORK_TURN_KINDS.map((kind) => h('option', { value: kind, ...(kind === a.classKey ? { selected: 'selected' } : {}) }, WORK_TURN_KIND_LABELS[kind])));
            return h('div', { class: 'row gap' }, select, h('button', {
              class: 'btn btn-small', type: 'button', 'data-testid': `npw-classify-${a.delegationId}`,
              onClick: () => act(ctx, ctx.api.workTurnClassify(a.delegationId, select.value), 'Recorded. The earlier act, if any, stays in history.'),
            }, 'Record'));
          },
        },
      ],
      rows: report.asks,
    }),
  });
}

/* ------------------------------------------------------------- conventions */

function conventionsCard(ctx, report) {
  if (!report.actor.canGovern) return null;
  const K = WORK_TURN_SETTING_KEYS;
  const numeric = ['windowDays', 'minAsks', 'factorPct', 'askDueDays'];
  const inputs = Object.fromEntries(numeric.map((name) => [name, h('input', {
    class: 'input', type: 'number', step: '1', style: 'width: 7rem;',
    min: String(WORK_TURN_BOUNDS[name][0]), max: String(WORK_TURN_BOUNDS[name][1]),
    value: String(report.conventions[K[name]]),
    'aria-label': WORK_TURN_SETTING_LABELS[name],
  })]));
  const auto = h('input', { type: 'checkbox', checked: report.conventions[K.autoPropagate], 'aria-label': WORK_TURN_SETTING_LABELS.autoPropagate });
  return card({
    title: 'Conventions in force',
    subtitle: 'Declared, bounded and stored. A value outside its bounds is refused with the bound printed — it is never clamped.',
    body: h('div', { class: 'stack-sm' },
      ...numeric.map((name) => h('label', { class: 'row gap' },
        inputs[name],
        h('span', { class: 'small' }, `${WORK_TURN_SETTING_LABELS[name]} (${WORK_TURN_BOUNDS[name][0]}–${WORK_TURN_BOUNDS[name][1]})`))),
      h('label', { class: 'row gap' }, auto, h('span', { class: 'small' }, WORK_TURN_SETTING_LABELS.autoPropagate)),
      h('div', { class: 'row gap' }, h('button', {
        class: 'btn btn-small', type: 'button', 'data-testid': 'npw-save-conventions',
        onClick: () => {
          const patch = { [K.autoPropagate]: Boolean(auto.checked) };
          for (const name of numeric) {
            const raw = String(inputs[name].value || '').trim();
            // A blank or fractional entry is passed through as-is so the action
            // refuses it with the bound printed; the screen does not repair it.
            patch[K[name]] = /^-?\d+$/.test(raw) ? Number(raw) : raw;
          }
          const changed = Object.fromEntries(Object.entries(patch).filter(([key, value]) => report.conventions[key] !== value));
          act(ctx, ctx.api.workTurnSetConventions(changed), 'Conventions saved.');
        },
      }, 'Save conventions'))),
  });
}

/* ------------------------------------------------------------------ render */

export function renderMatrixWorkTurnPanel(ctx, { now = new Date() } = {}) {
  const result = ctx.api?.workTurnReport?.();
  if (!result?.ok) {
    return card({
      title: 'Non-Promotable Work Turns',
      body: banner({ tone: 'bad', title: 'Ledger refused', body: result?.error || 'The reader could not run.' }),
    });
  }
  const report = result.report;
  return h('div', { class: 'stack', 'data-testid': 'work-turn-panel' },
    boardCard(ctx, report, now),
    poolsCard(report),
    peopleCard(report),
    findingsCard(report),
    asksCard(ctx, report),
    conventionsCard(ctx, report),
    card({
      title: `Method and refusal contract (${WORK_TURN_ADR})`,
      body: h('div', { class: 'stack' },
        h('figure', { style: { margin: '0' } },
          h('img', {
            src: './app/assets/work-turn-evidence.jpg',
            alt: 'Classified, unclassified and unplaced asks inform bounds. The result can be stable, uncertain or refused.',
            loading: 'lazy', width: '896', height: '296', 'data-testid': 'npw-evidence-diagram',
            style: { width: '100%', 'max-width': '896px', height: 'auto' },
          }),
          h('figcaption', { class: 'small' }, 'Conceptual diagram, not workspace data. Missing shares or refused lines can also prevent a ranking.')),
        h('ol', { class: 'stack small' }, ...report.method.map((line) => h('li', {}, line))),
      ),
    }));
}

export default renderMatrixWorkTurnPanel;
