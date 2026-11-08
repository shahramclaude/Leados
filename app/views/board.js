/**
 * app/views/board.js — The Board Room (Schema v91, ADR-0085).
 *
 * Five panels, five different questions:
 *   Memo           "What would we tell the board today, and what must we mark unverified?"
 *   Claims         "What did we say would refute this — and did we say it before we looked?"
 *   Roll-up        "Which span produced which part of the figure, and do the parts add up?"
 *   Discrepancies  "Where do our own modules disagree with each other?"
 *   Method         "What are the conventions, and what may this document never claim?"
 *
 * The view is a reader. It computes nothing itself: every figure, verdict,
 * decomposition and refusal comes from `board.js`, so the screen and the export
 * cannot say different things.
 */
import { h, toast, openModal, closeAllModals } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import { dayKey, formatDate } from '../core/time.js';
import { BOARD_LIMITS, BOARD_PANELS, BOARD_TAGS } from '../core/domain/boardRegistry.js';

const panelFor = (q) => {
  const p = q?.get?.('panel');
  return BOARD_PANELS.includes(p) ? p : 'memo';
};
const go = (ctx, panel, extra = '') => ctx.navigate(`#/board?panel=${panel}${extra}`);
const pct = (v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : `${v}%`);

const VERDICT_TONE = Object.freeze({
  holding: 'good', failing: 'bad', inconclusive: 'warn', withheld: 'caution', refused: 'neutral',
});
const VERDICT_LABEL = Object.freeze({
  holding: 'HOLDS', failing: 'FAILS', inconclusive: 'INCONCLUSIVE', withheld: 'WITHHELD', refused: 'REFUSED',
});
const TAG_TONE = Object.freeze({
  recomputed: 'good', attested: 'warn', asserted: 'caution', withheld: 'caution', refused: 'neutral',
});

/**
 * `table()` takes column renderers, not keys. Declaring keys keeps these tables
 * readable and makes a missing field a visible blank rather than a crash.
 */
function tableWithKeys({ columns, rows, caption = '' }) {
  return table({ columns: columns.map((col) => ({ ...col, render: (row) => row[col.key] })), rows, caption });
}

function verdictBadge(row) {
  return h('span', { class: `board-verdict board-verdict-${row.verdict}` },
    badge(VERDICT_LABEL[row.verdict], VERDICT_TONE[row.verdict] || 'neutral',
      row.reason || ''));
}

function claimFigure(row) {
  if (row.unit === 'binary') {
    if (row.value === null) return 'No reading';
    return row.value >= 100 ? 'Verified' : 'Not verified';
  }
  if (row.value === null) return row.n ? `${row.n} observation(s) · rate withheld` : 'No reading';
  const interval = row.lower !== null && row.upper !== null ? ` (interval ${pct(row.lower)}–${pct(row.upper)})` : ' (no interval)';
  return `${pct(row.value)}${interval} against ${row.comparator === 'gte' ? 'a floor of' : 'a ceiling of'} ${pct(row.threshold)}`;
}

function claimCard(row, { canEdit, onDeclare, onLook, onRemove }) {
  const postHoc = row.revisedAfterLook;
  return h('div', { class: `board-claim board-claim-${row.verdict}` },
    h('div', { class: 'board-claim-head' },
      h('div', null,
        h('h3', { class: 'board-claim-title' }, row.label),
        h('p', { class: 'muted small' }, row.assertion)),
      h('div', { class: 'row-actions' }, verdictBadge(row), badge(row.tag, TAG_TONE[row.tag] || 'neutral', BOARD_TAGS[row.tag] || ''),
        postHoc ? badge('revised after looking', 'bad', 'The threshold moved after this memo was first evaluated. The mark is permanent.') : null)),
    h('p', { class: 'board-figure' }, claimFigure(row)),
    row.reason ? h('p', { class: 'board-reason' }, row.reason) : null,
    h('dl', { class: 'board-facts' },
      h('div', null, h('dt', null, 'Source'), h('dd', null, row.sourceLabel)),
      h('div', null, h('dt', null, 'Observations'), h('dd', null, row.denominatorLabel || String(row.n))),
      h('div', null, h('dt', null, 'Why it matters'), h('dd', null, row.cost)),
      row.declaredAt ? h('div', null, h('dt', null, 'Threshold declared'), h('dd', null, `${formatDate(row.declaredAt.slice(0, 10))}${row.lookedAt ? ' · before the recorded look' : ''}`)) : null),
    row.verdict === 'refused' ? h('p', { class: 'board-unverified' }, 'Marked UNVERIFIED in the pack. This is not a small number; it is a figure this workspace cannot produce.') : null,
    h('div', { class: 'row-actions' },
      h('a', { class: 'btn btn-ghost', href: row.route }, `Open ${row.module}`),
      canEdit ? h('label', { class: 'field board-threshold' },
        h('span', null, `Declared ${row.comparator === 'gte' ? 'floor' : 'ceiling'} (%)`),
        (() => {
          const input = h('input', { class: 'input', type: 'number', min: '0', max: '100', step: '1', value: String(row.threshold ?? ''), 'aria-label': `Declared threshold for ${row.label}` });
          return h('span', { class: 'board-threshold-row' }, input,
            h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => onDeclare(row.key, input.value) }, 'Declare'));
        })()) : null,
      canEdit && !row.lookedAt ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => onRemove(row.key) }, 'Remove claim') : null));
}

export function renderBoard(ctx) {
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const panel = panelFor(ctx.query);
  const memoId = ctx.query?.get?.('memo') || null;
  const report = ctx.api.boardRead(memoId);
  const conv = report.conventions;
  const memo = report.memo;
  const evaluation = report.evaluation;
  const seat = ctx.seatContext?.seat || report.seat || null;
  const rank = seat && !seat.fullAccess ? seat.rank : 5;
  const canCommit = report.canCommit && rank >= 5;
  const readOnlyReason = canCommit ? null : `The Board Room is readable at ${seat?.label || 'executive'} rank; committing and freezing a disclosed pack is a chief-altitude act. Declare the chief seat on the Altitude Lens, or hand the line upward.`;

  const refresh = (extra = '') => {
    ctx.refresh();
    go(ctx, panel, extra);
  };

  /* ------------------------------------------------------------- actions */

  const openMemo = () => {
    const title = h('input', { class: 'input', type: 'text', maxlength: String(BOARD_LIMITS.titleChars), value: 'Board disclosure memorandum', 'aria-label': 'Memo title' });
    const cycleInput = h('input', { class: 'input', type: 'text', maxlength: '24', value: `${now.getUTCFullYear()}-Q${Math.floor(now.getUTCMonth() / 3) + 1}`, 'aria-label': 'Cycle label' });
    openModal({
      title: 'Open a board memo',
      description: 'Seven claims are pre-registered at their declared thresholds. Nothing is measured until you look.',
      body: h('div', { class: 'stack' },
        h('label', { class: 'field' }, h('span', null, 'Title'), title),
        h('label', { class: 'field' }, h('span', null, 'Cycle'), cycleInput),
        h('p', { class: 'muted small' }, 'A memo is a draft until it is committed. Committing freezes the verdicts into the record and opens governed work for anything that fails. Freezing marks the pack the board actually saw.')),
      footer: [
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
        h('button', {
          class: 'btn btn-primary',
          type: 'button',
          onClick: () => {
            const res = ctx.api.boardOpenMemo({ title: title.value, cycle: cycleInput.value });
            toast(res.ok ? 'Memo opened. Every claim is pre-registered at its declared threshold.' : (res.error || 'Not opened.'), res.ok ? 'good' : 'bad');
            if (res.ok) { closeAllModals(); refresh(`&memo=${encodeURIComponent(res.memo.id)}`); }
          },
        }, 'Open memo'),
      ],
    });
  };

  const look = () => {
    const res = ctx.api.boardLook(memo.id);
    toast(res.ok
      ? `Evaluated: ${res.counts.holding} holding, ${res.counts.failing} failing, ${res.counts.inconclusive} inconclusive, ${res.counts.withheld + res.counts.refused} unverified.`
      : (res.error || 'Not evaluated.'), res.ok ? 'good' : 'bad');
    if (res.ok) ctx.refresh();
  };

  const commit = () => {
    const res = ctx.api.boardCommit(memo.id);
    toast(res.ok
      ? `Committed. ${res.counts.failing} failing claim(s) opened governed work; ${res.counts.discrepancies} cross-module discrepancy(ies) recorded.`
      : (res.error || 'Not committed.'), res.ok ? 'good' : 'bad');
    if (res.ok) ctx.refresh();
  };

  const freeze = () => {
    const res = ctx.api.boardFreeze(memo.id);
    toast(res.ok ? 'Frozen. This is the pack the board was shown.' : (res.error || 'Not frozen.'), res.ok ? 'good' : 'bad');
    if (res.ok) ctx.refresh();
  };

  const declare = (key, value) => {
    const res = ctx.api.boardDeclareClaim(memo.id, key, Number(value));
    toast(res.ok ? 'Threshold declared.' : (res.error || 'Not declared.'), res.ok ? 'good' : 'bad');
    if (res.ok) ctx.refresh();
  };

  const removeClaim = (key) => {
    const res = ctx.api.boardRemoveClaim(memo.id, key);
    toast(res.ok ? 'Claim removed before any evaluation.' : (res.error || 'Not removed.'), res.ok ? 'bad' : 'bad');
    if (res.ok) ctx.refresh();
  };

  const runScan = () => {
    const res = ctx.api.boardScan();
    toast(res.ok ? `Reconciled every committed memo. ${res.propagations?.length || 0} propagation(s).` : (res.error || 'Scan failed.'), res.ok ? 'good' : 'bad');
    if (res.ok) ctx.refresh();
  };

  const downloadMemo = () => {
    const res = ctx.api.boardMemoText(memo?.id || null);
    if (!res.ok) { toast(res.error || 'Memo unavailable', 'bad'); return; }
    const text = typeof res.text === 'string' ? res.text : String(res.text || '');
    const ok = downloadText({ filename: `leados-board-memo-${dayKey(now)}.md`, text, mime: 'text/markdown;charset=utf-8' });
    toast(ok ? 'Memo downloaded' : 'Download not available — copy the text from the panel', ok ? 'good' : 'warn');
  };

  const exportCsv = () => {
    const res = ctx.api.exportCSV('board-claims');
    if (res.ok && res.csv) {
      const ok = downloadText({ filename: res.filename, text: res.csv, mime: 'text/csv;charset=utf-8' });
      toast(ok ? 'Aggregate-only CSV downloaded' : 'Download not available', ok ? 'good' : 'bad');
    } else toast(res.error || 'Export failed', 'bad');
  };

  const saveConventions = (values) => {
    const res = ctx.api.boardSetConventions(values);
    toast(res.ok ? 'Conventions saved.' : (res.error || 'Not saved.'), res.ok ? 'good' : 'bad');
    if (res.ok) ctx.refresh();
  };

  /* -------------------------------------------------------------- header */

  const ledger = report.ledger;
  const header = pageHeader({
    eyebrow: 'Chief altitude · enterprise disclosure',
    title: 'Board Room',
    subtitle: 'The pack as a measurement problem: claims and thresholds pre-registered before the first look, verdicts decided by the conservative end of an interval, and every figure tagged with where it came from.',
    meta: h('div', { class: 'row-actions' },
      badge(`Schema v91`, 'neutral'),
      badge(`${ledger.total} memo(s)`, 'neutral'),
      memo ? badge(memo.status.toUpperCase(), memo.status === 'frozen' ? 'good' : memo.status === 'committed' ? 'warn' : 'neutral') : null,
      evaluation && evaluation.attestation.verified ? badge('chain verified', 'good', evaluation.attestation.note) : badge(evaluation?.attestation?.available ? 'chain NOT verified' : 'not sealed', evaluation?.attestation?.available ? 'bad' : 'neutral', evaluation?.attestation?.note || '')),
    actions: [
      memo && memo.status === 'draft' && canCommit ? h('button', { class: 'btn btn-primary', type: 'button', onClick: look }, 'Look (evaluate)') : null,
      memo && memo.status === 'draft' && canCommit ? h('button', { class: 'btn', type: 'button', onClick: commit, ...(evaluation?.committable ? {} : { disabled: true, title: evaluation?.commitRefusal || 'Not enough claims can be evaluated.' }) }, 'Commit') : null,
      memo && memo.status === 'committed' && canCommit ? h('button', { class: 'btn', type: 'button', onClick: freeze }, 'Freeze pack') : null,
      memo ? h('button', { class: 'btn btn-ghost', type: 'button', onClick: downloadMemo }, 'Download memo') : null,
      canCommit ? h('button', { class: 'btn btn-ghost', type: 'button', onClick: openMemo }, 'New memo') : null,
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: runScan }, 'Reconcile'),
    ].filter(Boolean),
  });

  const tabBar = tabs({
    items: [
      { key: 'memo', label: 'Memo' },
      { key: 'claims', label: 'Claims' },
      { key: 'rollup', label: 'Roll-up' },
      { key: 'cycle', label: 'Carry-forward' },
      { key: 'discrepancies', label: 'Cross-checks' },
      { key: 'method', label: 'Method' },
    ],
    active: panel,
    onSelect: (key) => go(ctx, key, memo ? `&memo=${encodeURIComponent(memo.id)}` : ''),
    ariaLabel: 'Board Room sections',
  });

  /* ---------------------------------------------------------- empty state */

  if (!memo) {
    return h('div', { class: 'page board-page' },
      header,
      tabBar,
      banner({
        tone: 'info',
        title: 'No memo is open. Nothing is claimed and nothing is disclosed.',
        body: 'A board memo starts as seven pre-registered claims, each with the threshold that would refute it — declared before the first measurement. Opening one takes a second; measuring it takes a look; committing it opens governed work for anything the record contradicts.',
        actions: canCommit ? [h('button', { class: 'btn btn-primary', type: 'button', onClick: openMemo }, 'Open a memo')] : [],
      }),
      card({
        title: 'The claim register',
        subtitle: 'What this workspace can actually measure, and what each claim would cost if it were wrong.',
        body: tableWithKeys({
          columns: [
            { key: 'label', label: 'Claim' },
            { key: 'module', label: 'Measured by' },
            { key: 'direction', label: 'Direction' },
            { key: 'cost', label: 'Cost of being wrong' },
          ],
          rows: report.claimCatalogue.map((c) => ({
            label: h('strong', null, c.label),
            module: c.module,
            direction: `${c.comparator === 'gte' ? 'at least' : 'at most'} the declared ${c.comparator === 'gte' ? 'floor' : 'ceiling'}`,
            cost: h('span', { class: 'muted small' }, c.cost),
          })),
        }),
      }),
      h('p', { class: 'muted small' }, 'LeadOS never writes this document for you. It adjudicates the one you declare, and it will not soften an inconclusive verdict into a direction.'),
    );
  }

  /* --------------------------------------------------------------- memo */

  function memoPanel() {
    const counts = evaluation.counts;
    const grid = h('div', { class: 'stat-grid' },
      stat({ label: 'Claims declared', value: String(counts.declared), hint: `${counts.postHoc} revised after looking` }),
      stat({ label: 'Holding', value: String(counts.holding), hint: 'conservative end of the interval clears the threshold', tone: counts.holding ? 'good' : '' }),
      stat({ label: 'Failing', value: String(counts.failing), hint: `${counts.materialFailing} material`, tone: counts.failing ? 'bad' : '' }),
      stat({ label: 'Inconclusive', value: String(counts.inconclusive), hint: 'the interval straddles the threshold', tone: counts.inconclusive ? 'warn' : '' }),
      stat({ label: 'Unverified', value: String(counts.withheld + counts.refused), hint: 'withheld or refused — marked, never guessed', tone: counts.withheld + counts.refused ? 'warn' : '' }),
      stat({ label: 'Cross-checks fired', value: String(counts.discrepancies), hint: 'where two modules disagree', tone: counts.discrepancies ? 'bad' : 'good' }),
      stat({ label: 'Evaluable', value: `${counts.evaluated}/${conv.evidenceFloor}`, hint: counts.evaluated >= conv.evidenceFloor ? 'above the commit floor' : 'below the commit floor' }),
      stat({ label: 'Looks recorded', value: String(memo.lookCount), hint: memo.lookCount ? `last ${memo.lastLookAt ? formatDate(memo.lastLookAt.slice(0, 10)) : '—'}` : 'never evaluated — every threshold is still ex ante' }),
    );

    const memoText = ctx.api.boardMemoText(memo.id);
    const text = memoText.ok ? memoText.text : 'Memo unavailable.';
    const verbatim = String(typeof text === 'string' ? text : '');

    const addendum = evaluation.rows.filter((row) => row.verdict === 'refused' || row.verdict === 'withheld').length
      ? banner({
        tone: 'warn',
        title: `${evaluation.rows.filter((row) => row.verdict === 'refused' || row.verdict === 'withheld').length} figure(s) in this pack could not be produced`,
        body: 'They are marked UNVERIFIED rather than estimated. A board pack with three unverified figures is more useful than one with three invented ones.',
      })
      : null;

    return h('div', { class: 'stack' },
      grid,
      readOnlyReason ? banner({ tone: 'info', title: 'Read-only at this altitude', body: readOnlyReason }) : null,
      evaluation.stale ? banner({ tone: 'warn', title: 'This pack is past its re-check window', body: `Committed ${evaluation.memo.committedAt ? formatDate(String(evaluation.memo.committedAt).slice(0, 10)) : '—'}, re-check interval ${conv.recheckDays} days. A disclosed figure decays; the badge counted it.` }) : null,
      addendum,
      card({
        title: 'The unasked question',
        subtitle: evaluation.unasked.title,
        actions: [badge(evaluation.unasked.kind, evaluation.unasked.kind === 'none' ? 'good' : 'warn')],
        body: h('div', { class: 'stack' },
          h('p', null, h('strong', null, evaluation.unasked.question)),
          h('p', { class: 'muted' }, evaluation.unasked.why),
          h('p', null, evaluation.unasked.action),
          evaluation.unasked.route ? h('a', { class: 'btn btn-ghost', href: evaluation.unasked.route }, 'Open the module behind it') : null),
      }),
      h('div', { class: 'board-memo-grid' },
        ...evaluation.rows.map((row) => claimCard(row, {
          canEdit: canCommit && memo.status === 'draft',
          onDeclare: declare,
          onLook: look,
          onRemove: removeClaim,
        }))),
      card({
        title: 'The memorandum',
        subtitle: 'Deterministic text. The same record produces the same document; a changed record produces a different fingerprint.',
        actions: [h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: downloadMemo }, 'Download')],
        body: h('pre', { class: 'board-memo', tabindex: '0', 'aria-label': 'Board disclosure memorandum text' }, verbatim),
      }),
      card({
        title: 'The ledger',
        subtitle: 'Every memo in this workspace. A committed pack stays readable forever; revising it means opening a new one.',
        body: report.memos.length
          ? tableWithKeys({
            columns: [
              { key: 'cycle', label: 'Cycle' },
              { key: 'state', label: 'Status' },
              { key: 'revision', label: 'Revision' },
              { key: 'opened', label: 'Opened' },
              { key: 'looks', label: 'Looks' },
              { key: 'open', label: '' },
            ],
            rows: report.memos.map((row) => ({
              cycle: h('strong', null, row.cycle || 'unlabelled'),
              state: badge(row.status, row.status === 'frozen' ? 'good' : row.status === 'committed' ? 'warn' : row.status === 'superseded' ? 'neutral' : 'neutral'),
              revision: `r${row.revision}`,
              opened: row.openedAt ? formatDate(String(row.openedAt).slice(0, 10)) : '—',
              looks: String(row.lookCount || 0),
              open: h('a', { class: 'btn btn-ghost btn-sm', href: `#/board?panel=memo&memo=${encodeURIComponent(row.id)}` }, 'Open'),
            })),
          })
          : emptyState({ title: 'No memos yet', body: 'Open one to see the register against this workspace.' }),
      }),
    );
  }

  /* ------------------------------------------------------------- claims */

  function claimsPanel() {
    const canEdit = canCommit && memo.status === 'draft';
    const declarationState = evaluation.rows.map((row) => ({
      label: h('strong', null, row.label),
      threshold: row.threshold === null ? badge('not declared', 'bad') : `${pct(row.threshold)} ${row.comparator === 'gte' ? 'floor' : 'ceiling'}`,
      declared: row.declaredAt ? formatDate(row.declaredAt.slice(0, 10)) : '—',
      looked: row.lookedAt ? formatDate(row.lookedAt.slice(0, 10)) : 'not yet',
      postHoc: row.revisedAfterLook ? badge('post-hoc', 'bad') : badge('ex ante', 'good'),
      changes: String(row.revisionCount || 0),
    }));

    return h('div', { class: 'stack' },
      banner({
        tone: 'info',
        title: 'Pre-registration is the whole point',
        body: 'A threshold declared before the first look is a test. The same threshold declared afterwards is a negotiation. The app records the look, so it can tell the difference — and once a threshold moves after a look, the mark is permanent and appears in the memo, the export and the board line.',
      }),
      card({
        title: 'Declarations',
        subtitle: `The commit floor is ${conv.evidenceFloor} evaluable claim(s). A memo committed below it is a press release with a timestamp.`,
        body: tableWithKeys({
          columns: [
            { key: 'label', label: 'Claim' },
            { key: 'threshold', label: 'Threshold' },
            { key: 'declared', label: 'Declared on' },
            { key: 'looked', label: 'First look' },
            { key: 'postHoc', label: 'Status' },
            { key: 'changes', label: 'Times moved' },
          ],
          rows: declarationState,
        }),
      }),
      card({
        title: canEdit ? 'Change a threshold' : 'Thresholds are frozen',
        subtitle: canEdit
          ? 'Editing after a recorded look is allowed but marked. Removing a claim is only possible before the first evaluation.'
          : 'This memo is committed (or this seat cannot commit). A disclosed pack is evidence: open a new memo to write a different one.',
        body: h('div', { class: 'stack' },
          ...evaluation.rows.map((row) => h('div', { class: 'board-claim-compact' },
            h('div', null, h('strong', null, row.label), h('span', { class: 'muted small' }, ` · ${row.sourceLabel}`)),
            canEdit
              ? (() => {
                const input = h('input', { class: 'input', type: 'number', min: '0', max: '100', step: '1', value: String(row.threshold ?? ''), 'aria-label': `Threshold for ${row.label}` });
                return h('span', { class: 'board-threshold-row' }, input,
                  h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => declare(row.key, input.value) }, 'Declare'));
              })()
              : h('span', { class: 'muted' }, row.threshold === null ? 'not declared' : `${row.threshold}%`))),
        ),
      }),
      h('p', { class: 'muted small' }, 'A claim with no threshold is refused, not measured. A sentence without a refutation condition is an opinion, and the memo prints it as one.'),
    );
  }

  /* ------------------------------------------------------------- rollup */

  function rollupPanel() {
    const claimKeys = evaluation.rows.map((row) => row.key);
    const requested = ctx.query?.get?.('claim');
    // Open on a claim that actually decomposes: landing on a refused claim would
    // make the panel look broken when the record is simply silent.
    const decomposable = evaluation.rows.find((r) => (r.partition?.rows || []).length > 0);
    const selectedKey = claimKeys.includes(requested) ? requested : (decomposable?.key || claimKeys[0]);
    const row = evaluation.rows.find((r) => r.key === selectedKey);
    const partition = row?.partition;
    const selects = h('div', { class: 'row-actions board-claim-picker' },
      ...evaluation.rows.map((r) => h('a', {
        class: `btn btn-sm ${r.key === selectedKey ? 'btn-primary' : 'btn-ghost'}`,
        href: `#/board?panel=rollup&memo=${encodeURIComponent(memo.id)}&claim=${encodeURIComponent(r.key)}`,
        'aria-current': r.key === selectedKey ? 'true' : null,
      }, r.label)));

    const table_ = !partition
      ? emptyState({ title: 'No decomposition', body: 'This claim has no span attribution.' })
      : partition.rows.length
        ? h('div', { class: 'stack' },
          tableWithKeys({
            columns: [
              { key: 'label', label: partition.dimension === 'span' ? 'Span' : 'Altitude' },
              { key: 'n', label: 'Observations' },
              { key: 'ok', label: 'Passing' },
              { key: 'value', label: 'Reading' },
              { key: 'interval', label: 'Interval' },
              { key: 'route', label: '' },
            ],
            rows: partition.rows.map((part) => ({
              label: h('strong', null, part.label),
              n: String(part.n),
              ok: String(part.successes),
              value: part.value === null ? '—' : pct(part.value),
              interval: part.interval?.lower === null ? '—' : `${pct(part.interval.lower)}–${pct(part.interval.upper)}`,
              route: h('a', { class: 'btn btn-ghost btn-sm', href: row.route }, 'Module'),
            })),
          }),
          h('div', { class: `board-reconcile ${partition.reconciles ? 'board-reconcile-ok' : 'board-reconcile-bad'}` },
            badge(partition.reconciles ? 'reconciled' : 'broken roll-up', partition.reconciles ? 'good' : 'bad'),
            h('p', null, partition.reason),
            h('p', { class: 'muted small' }, `Rows: ${partition.totals.n} observation(s), ${partition.totals.successes} passing${partition.totals.value === null ? '' : ` · ${pct(partition.totals.value)}`}. Claim denominator: ${row.n}.`)))
        : emptyState({ title: 'Nothing attributed', body: partition.reason });
    return h('div', { class: 'stack' },
      banner({
        tone: 'info',
        title: 'A roll-up that does not add up is reported, not drawn',
        body: 'Every claim that can be attributed to a span is partitioned over the reporting tree, and the parts are CHECKED against the claim’s own denominator. If they disagree, this panel says so instead of charting the difference.',
      }),
      selects,
      card({
        title: row ? `${row.label} — by ${partition?.dimension === 'span' ? 'span' : partition?.dimension === 'altitude' ? 'altitude' : 'workspace'}` : 'Roll-up',
        subtitle: row ? `${row.denominatorLabel} · ${row.verdict.toUpperCase()}` : '',
        body: table_,
      }),
      h('p', { class: 'muted small' }, 'The executive altitude reads span names; a lower declared seat reads counts. No row here identifies a person’s private record — the figures are unit-level by construction.'),
    );
  }

  /* ------------------------------------------------------- discrepancies */

  function discrepanciesPanel() {
    const checks = evaluation.discrepancies;
    return h('div', { class: 'stack' },
      banner({
        tone: checks.some((c) => c.triggered) ? 'warn' : 'good',
        title: checks.some((c) => c.triggered) ? `${checks.filter((c) => c.triggered).length} cross-module disagreement(s)` : 'No cross-module disagreement on this record',
        body: 'Each check compares two figures produced by different machinery. Agreement is evidence; disagreement is the finding. No composite score is computed here — a composite is how one green number hides two red ones.',
      }),
      ...checks.map((check) => card({
        title: check.label,
        subtitle: `${check.leftClaim} vs ${check.rightModule}`,
        actions: [badge(check.triggered ? 'disagrees' : 'agrees', check.triggered ? 'bad' : 'good')],
        body: h('div', { class: 'stack' },
          h('div', { class: 'board-crosscheck' },
            h('div', null, h('h4', null, 'Management claim'), h('p', null, check.left ? `${check.left.label}: ${check.left.value === null ? 'refused' : `${check.left.value}${check.left.unit === '%' ? '%' : ''}`}` : '—'), h('p', { class: 'muted small' }, check.left?.extra || '')),
            h('div', { class: 'board-crosscheck-sep', 'aria-hidden': 'true' }, '↔'),
            h('div', null, h('h4', null, check.rightModule), h('p', null, check.right ? `${check.right.label}: ${check.right.value === null ? 'refused' : `${check.right.value}${check.right.unit === '%' ? '%' : ''}`}` : '—'), h('p', { class: 'muted small' }, check.right?.extra || ''))),
          h('p', null, check.statement),
          check.finding ? h('p', { class: 'board-finding' }, check.finding) : h('p', { class: 'muted' }, 'The two readings are consistent on this record. That is evidence, not proof: both could be wrong the same way.'),
          h('a', { class: 'btn btn-ghost btn-sm', href: check.route }, `Open ${check.rightModule}`)),
      })),
      card({
        title: 'Why these three checks',
        body: h('div', { class: 'prose' },
          h('p', null, 'They exist because the pairs are produced by different machinery: a count and a flow, a rate and a list, a chain and an examination. Same-machinery agreement would be arithmetic, not evidence.'),
          h('p', { class: 'muted' }, 'A triggered check does not change any claim. It is written into the memo and, on commit, becomes part of the record a reader can walk.')),
      }),
    );
  }

  /* -------------------------------------------------------------- method */

  function methodPanel() {
    const field = (key, label, min, max, hint, value) => {
      const input = h('input', { class: 'input', type: 'number', min: String(min), max: String(max), value: String(value), 'aria-label': label });
      return h('label', { class: 'field' },
        h('span', null, label),
        input,
        h('span', { class: 'muted small' }, hint),
        h('button', {
          class: 'btn btn-ghost btn-sm',
          type: 'button',
          onClick: () => saveConventions({ [key]: Number(input.value) }),
        }, 'Save'));
    };
    return h('div', { class: 'stack' },
      readOnlyReason ? banner({ tone: 'info', title: 'Read-only at this altitude', body: readOnlyReason }) : null,
      card({
        title: 'Declared conventions',
        subtitle: 'Every number here is a convention, not a measurement. Changing one changes what the memo is willing to say.',
        body: canCommit
          ? h('div', { class: 'board-conventions' },
            field('boardCellFloor', 'Cell floor', 1, 50, 'Observations required before a proportion is quoted. Below it the counts print and the rate does not.', conv.cellFloor),
            field('boardEvidenceFloor', 'Evidence floor', 1, 20, 'Claims that must be evaluable before the memo can be committed.', conv.evidenceFloor),
            field('boardMaterialityPct', 'Materiality (pp)', 1, 90, 'How far below its floor a failing claim must sit to count as material rather than marginal.', conv.materialityPct),
            field('boardRecheckDays', 'Re-check window (days)', 7, 365, 'A committed pack is flagged stale after this many days.', conv.recheckDays),
            h('label', { class: 'field board-toggle' },
              h('span', null, 'Automatic propagation'),
              (() => {
                const input = h('input', { type: 'checkbox', checked: conv.autoPropagate, 'aria-label': 'Automatic propagation' });
                input.addEventListener('change', () => saveConventions({ boardAutoPropagate: input.checked }));
                return input;
              })(),
              h('span', { class: 'muted small' }, 'When paused, an explicit Reconcile still opens the governed work a committed memo implies.')))
          : h('ul', null, ...['Cell floor', 'Evidence floor', 'Materiality', 'Re-check window'].map((label, i) => h('li', null, `${label}: ${[conv.cellFloor, conv.evidenceFloor, `${conv.materialityPct}pp`, `${conv.recheckDays} days`][i]}`))),
      }),
      card({
        title: 'What this document may never claim',
        body: h('div', { class: 'prose' },
          h('p', null, 'It is not a summary of people. There is no person, 1:1, coaching note or individual rating in it, by construction — the enterprise altitude’s unit of analysis is the enterprise.'),
          h('p', null, 'It is not an average. No composite confidence score exists in this app, because a composite is how one green number hides two red ones.'),
          h('p', null, 'It is not proof of integrity. A verified seal proves the record was not altered after it was written. It says nothing about whether any claim in it was ever examined, or whether the actor is who they say.'),
          h('p', { class: 'muted' }, 'And a claim that is exactly on its threshold is not settled by more data: no sample size decides a coin that is exactly fair. The terminal says so rather than reporting a direction.')),
      }),
      card({
        title: 'Exports',
        subtitle: 'Aggregate-only. One row per claim; no memo id, no operator, no note, no span or person name.',
        actions: [h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: exportCsv }, 'Download CSV')],
        body: h('p', { class: 'muted' }, `CSV scope #80 · ${report.rows ? '' : ''}A refused or withheld figure is BLANK in the file, never zero. The attestation column reports whether the chain verified at the moment of export.`),
      }),
      card({
        title: 'Attestation',
        subtitle: evaluation.attestation.available ? `Mode ${evaluation.attestation.mode}${evaluation.attestation.keyed ? ' (keyed)' : ''} · ${evaluation.attestation.blocks} block(s)` : 'Sealing not enabled',
        body: h('div', { class: 'stack' },
          h('p', null, evaluation.attestation.note),
          h('p', { class: 'muted small' }, `Memo fingerprint ${evaluation.fingerprint}.`),
          h('a', { class: 'btn btn-ghost btn-sm', href: '#/seal' }, 'Open Integrity & seals')),
      }),
    );
  }

  /* --------------------------------------------------------------- cycle */

  function cyclePanel() {
    const continuity = report.continuity;
    const c = continuity.counts;
    const downloadLedger = () => {
      const res = ctx.api.boardContinuityText();
      const text = res.ok ? res.text : 'Ledger unavailable.';
      const ok = downloadText({ filename: `leados-board-carry-forward-${dayKey(now)}.md`, text, mime: 'text/markdown;charset=utf-8' });
      toast(ok ? 'Carry-forward ledger downloaded' : 'Download not available — the panel is the record', ok ? 'good' : 'warn');
    };

    const looksBanner = h('div', { class: 'row-actions' },
      badge(`${c.looks} pack(s) read`, c.looks > 1 ? 'neutral' : 'warn', c.looksDropped ? `${c.looksDropped} older look(s) outside the ${continuity.conventions.looksRead}-look window` : ''),
      badge(`carry floor ${continuity.floor}`, 'neutral', 'Two consecutive frozen packs is a declared convention, not a measured optimum.'),
      c.queueDeferred ? badge(`${c.queueDeferred} deferred`, 'warn', `The review queue is bounded at ${continuity.conventions.queueCap}; the remainder is counted, not dropped.`) : null);

    const grid = h('div', { class: 'stat-grid' },
      stat({ label: 'Packs read', value: String(c.looks), hint: c.looksDropped ? `${c.looksDropped} older outside the window` : 'every frozen pack on this record' }),
      stat({ label: 'Carried forward', value: String(c.carryForward), hint: `${continuity.floor}+ consecutive packs`, tone: c.carryForward ? 'bad' : 'good' }),
      stat({ label: 'Recurring failure', value: String(c.recurringFailure), hint: 'failing in consecutive packs', tone: c.recurringFailure ? 'bad' : '' }),
      stat({ label: 'Figure still not producible', value: String(c.repeatedUnverified), hint: 'REFUSED or WITHHELD in consecutive packs', tone: c.repeatedUnverified ? 'warn' : '' }),
      stat({ label: 'Moved beyond its interval', value: String(c.separated), hint: 'the only movement this ledger calls evidence' }),
      stat({ label: 'Moved inside noise', value: String(c.insideNoise), hint: 'the intervals overlap — not evidence of movement', tone: c.insideNoise ? 'warn' : '' }),
      stat({ label: 'Bar moved', value: String(c.rulerMoved), hint: 'threshold changed between looks', tone: c.rulerMoved ? 'warn' : '' }),
      stat({ label: 'Steady', value: String(c.steady), hint: `${c.firstLook} at a first look` }));

    const trail = (claim) => claim.readings.map((r) => `${VERDICT_LABEL[r.verdict] || r.verdict} ${r.day || '—'}`).join(' · ');
    const carryTable = tableWithKeys({
      columns: [
        { key: 'claim', label: 'Claim' },
        { key: 'why', label: 'Why it is carried' },
        { key: 'since', label: 'Carried since' },
        { key: 'trail', label: 'Verdict trail' },
        { key: 'figure', label: 'Latest figure' },
        { key: 'move', label: 'Movement' },
        {
          key: 'route',
          label: '',
          render: (row) => h('a', { class: 'btn btn-ghost btn-sm', href: row.href }, 'Open module'),
        },
      ],
      rows: continuity.slice.map((claim) => ({
        claim: h('strong', null, claim.label),
        why: claim.carryReason === 'both' ? 'Recurring failure and not producible'
          : claim.carryReason === 'repeated-unverified' ? `Figure not producible in ${claim.carryLength} packs`
            : `Failing in ${claim.carryLength} packs`,
        since: claim.carriedSince || '—',
        trail: h('span', { class: 'muted small' }, trail(claim)),
        figure: claimFigure({ ...claim.latest, unit: claim.unit, comparator: claim.comparator }),
        move: claim.movePp === null ? '—' : `${claim.movePp >= 0 ? '+' : ''}${claim.movePp}pp · ${claim.transition}`,
        href: claim.route,
      })),
      caption: 'Bounded review queue, oldest carry first. Each row is a claim the record has already put in front of a board more than once.',
    });

    const allTable = tableWithKeys({
      columns: [
        { key: 'claim', label: 'Claim' },
        { key: 'looks', label: 'Packs' },
        { key: 'latest', label: 'Latest verdict' },
        { key: 'transition', label: 'Change since the previous pack' },
        { key: 'move', label: 'Movement' },
        { key: 'carried', label: 'Carried' },
      ],
      rows: continuity.claims.map((claim) => ({
        claim: claim.label,
        looks: String(claim.looks),
        latest: verdictBadge(claim.latest),
        transition: h('span', null, h('strong', null, claim.transition), h('span', { class: 'muted small' }, ` — ${claim.transitionReason}`)),
        move: claim.movePp === null ? '—' : `${claim.movePp >= 0 ? '+' : ''}${claim.movePp}pp`,
        carried: claim.carryForward ? badge(`carried · ${claim.carryLength}`, 'bad') : badge('no', 'good'),
      })),
      caption: 'Every claim the record has a frozen reading for. A claim never looked at carries nothing and is not counted as healthy.',
    });

    return h('div', { class: 'stack' },
      banner({
        tone: c.carryForward ? 'warn' : 'info',
        title: c.looks > 1
          ? `${c.carryForward} claim(s) have carried for ${continuity.floor}+ frozen packs`
          : 'A single pack has no movement to read',
        body: c.looks > 1
          ? 'This is the read the chief needs at the second board meeting and every one after it: what moved since the last pack, what did not move despite being broken, and which numbers were never producible in the first place. Nothing here is stored — it is derived from the frozen snapshots the workspace already keeps.'
          : 'Open a memo, look at it and commit it. The ledger fills in at the second frozen pack, when the record can show a direction at all.',
        actions: [h('button', { class: 'btn btn-ghost', type: 'button', onClick: downloadLedger }, 'Download carry-forward ledger')],
      }),
      looksBanner,
      grid,
      card({
        title: 'Carry-forward queue',
        subtitle: `Ordered oldest carry first; bounded at ${continuity.conventions.queueCap} rows. A carry floor of ${continuity.floor} consecutive packs is a declared convention.`,
        actions: [badge(`${c.carryForward} carried`, c.carryForward ? 'bad' : 'good')],
        body: continuity.slice.length
          ? carryTable
          : emptyState({
            title: 'Nothing has carried',
            body: c.looks > 1
              ? 'No claim has held the same failure or the same unproducible figure for two consecutive packs. That is a statement about the packs, not about the organisation.'
              : 'A carry needs two frozen packs. This record has not looked twice yet.',
          }),
      }),
      card({
        title: 'Every claim across the packs',
        subtitle: 'Movement is classified, never summarised: separated intervals are evidence, overlapping intervals are not, and a moved bar belongs to the ruler.',
        body: continuity.claims.length ? allTable : emptyState({ title: 'No frozen reading', body: 'No claim has been looked at in a pack that was frozen.' }),
      }),
      card({
        title: 'What this ledger may never claim',
        body: h('div', { class: 'prose' },
          ...continuity.method.map((entry) => h('p', null, h('strong', null, `${entry.name}. `), entry.note)),
          h('p', { class: 'muted' }, 'It carries no person, name, note or span: a frozen board snapshot holds none, so none can reach this read.')),
      }),
      continuity.refusals.length
        ? card({
          title: 'Refusals',
          subtitle: 'Printed, not softened.',
          body: h('ul', null, ...continuity.refusals.map((reason) => h('li', null, reason))),
        })
        : null,
    );
  }

  const body = panel === 'claims' ? claimsPanel()
    : panel === 'rollup' ? rollupPanel()
      : panel === 'cycle' ? cyclePanel()
        : panel === 'discrepancies' ? discrepanciesPanel()
          : panel === 'method' ? methodPanel()
            : memoPanel();

  return h('div', { class: 'page board-page' }, header, tabBar, body);
}
