/**
 * app/views/suggestions.js — `#/suggestions`, the Frontline
 * Improvement-Suggestion Ledger (ADR-0227, Schema v185).
 *
 * ONE reader (`buildSuggestionReport`, standing on the `buildSuggestionLedger`
 * kernel) behind every state, figure, count and rate this page prints. The
 * page formats what the reader returned; it computes no state, no overdue flag
 * and no rate of its own.
 *
 * THE THREE THINGS THIS SCREEN KEEPS APART:
 *   1. THE SUGGESTION — a named person's dated problem and proposal, with the
 *      route COMPUTED from the reporting graph at filing time;
 *   2. THE THREE KEYS — the route's triage decision, the owner's effect claim,
 *      the independent confirmation. Nothing closes by the passage of time;
 *   3. THE CLAIMS — "the rows add up" (`partitionReconciles`) and "no refused
 *      act, no dropped row" (`figuresComplete`), printed apart.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, table } from '../ui/components.js';
import {
  KZT_HREF,
  KZT_LIMITS,
  KZT_METHOD,
  KZT_STATES,
} from '../core/domain/suggestionRegistry.js';

const L = KZT_LIMITS;
const DIAGRAM_URL = './app/assets/improvement-suggestion-method.jpg';
const VIEWS = [
  { key: 'rows', label: 'Suggestions' },
  { key: 'counts', label: 'Rates per area' },
  { key: 'refusals', label: 'Refused acts' },
  { key: 'method', label: 'Method' },
];
const STATE_TONE = {
  'awaiting-triage': 'caution',
  'awaiting-joint-triage': 'caution',
  'triage-split': 'bad',
  'declined': 'neutral',
  'accepted-awaiting-claim': 'info',
  'claimed-awaiting-confirmation': 'info',
  'closed-confirmed': 'good',
};
const STATE_SHORT = {
  'awaiting-triage': 'Awaiting triage',
  'awaiting-joint-triage': 'Awaiting joint triage',
  'triage-split': 'Route split',
  'declined': 'Declined',
  'accepted-awaiting-claim': 'Accepted · claim owed',
  'claimed-awaiting-confirmation': 'Claimed · confirm owed',
  'closed-confirmed': 'Closed · confirmed',
};

function button(label, onClick, { primary = false, testid = null, danger = false } = {}) {
  return h('button', {
    type: 'button',
    class: `btn btn-small ${primary ? 'btn-primary' : danger ? 'btn-ghost text-warn' : 'btn-ghost'}`,
    ...(testid ? { 'data-testid': testid } : {}),
    onClick,
  }, label);
}

const options = (rows, { blank = null } = {}) => [
  ...(blank ? [{ value: '', label: blank }] : []),
  ...rows.map((row) => ({ value: row.value, label: row.label })),
];

const when = (iso) => (iso ? iso.slice(0, 16).replace('T', ' ') : '—');
const pct = (bp) => (bp === null || bp === undefined ? '—' : `${(bp / 100).toFixed(2)}%`);

/* ------------------------------------------------------------------ dialogs */

function declareDialog(ctx, candidates, onDone) {
  const routeLine = candidates?.computedRoute?.length
    ? `The route is COMPUTED from the reporting graph: ${candidates.computedRoute.map((r) => r.name).join(', ')}. It is not yours to choose — those are the seat(s) that will owe you an answer.`
    : `The reporting graph cannot name your decision route: ${candidates?.computedRouteReason || 'no active line resolves.'} Filing will be refused rather than routed by guess.`;
  const form = buildForm([
    { name: 'areaRef', label: 'Work area this concerns', type: 'text', required: true, help: `At least ${L.areaMin} characters — the board, line, station or process where the waste happens.` },
    { name: 'problemText', label: 'The problem you see', type: 'textarea', required: true, help: `At least ${L.textMin} characters: what happens today, and what it costs the work.` },
    { name: 'proposalText', label: 'Your proposed fix', type: 'textarea', required: true, help: `At least ${L.textMin} characters: what should change, and how it would work.` },
    {
      name: 'responseDays', label: 'Response owed within (days)', type: 'select', required: true,
      options: options([1, 2, 3, 5, 7, 10, 14, 21, 30].map((d) => ({ value: String(d), label: `${d} day${d === 1 ? '' : 's'}` })), { blank: 'Choose the window' }),
      help: `A commitment the record can break visibly — between ${L.responseMinDays} and ${L.responseMaxDays} days. An unanswered suggestion past it prints response-overdue.`,
    },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.suggestionDeclare({
      ...values,
      responseDays: values.responseDays ? Number(values.responseDays) : undefined,
    });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The suggestion was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Suggestion filed. The route owes you a dated answer — the register prints it if they miss it.', 'good');
    onDone?.();
  };
  openModal({
    title: 'File an improvement suggestion',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'Answered, not merely collected', body: 'This is your own first-person suggestion. The decision route is computed from the reporting graph — the seat(s) above every line you hold. An acceptance names an owner and a target day; a decline carries a reason. Neither is you.' }),
      h('p', { class: 'small' }, routeLine),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'File suggestion', onClick: submit }],
  });
}

function triageDialog(ctx, row, onDone) {
  const form = buildForm([
    {
      name: 'decision', label: 'Your decision', type: 'select', required: true,
      options: options([
        { value: 'accept', label: 'Accept — name an owner and a target day' },
        { value: 'decline', label: 'Decline — with the reason' },
      ], { blank: 'Choose' }),
    },
    { name: 'reason', label: 'Why', type: 'textarea', required: true, help: `At least ${L.textMin} characters. The reason is what makes the decision readable later.` },
    {
      name: 'ownerId', label: 'Owner (required for accept)', type: 'select',
      options: options((ctx.suggestionCandidates?.owners || []).map((p) => ({ value: p.id, label: `${p.name} · ${p.role || 'team'}` })), { blank: 'Choose the person who owns the change' }),
      help: 'Only a person this seat can reach. The owner claims the effect later — and confirms nothing.',
    },
    { name: 'targetDay', label: 'Target day (required for accept)', type: 'date', help: `Between today and ${L.targetMaxDays} days out.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.suggestionTriage({ suggestionId: row.id, ...values });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The decision was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Decision recorded. A shared route settles only when every member records the same decision.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Record your triage decision',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'One member, one decision', body: 'Your decision counts once and never overwrites an earlier one. If route members disagree, the register prints the split and nobody decides after it.' }),
      h('p', { class: 'small' }, `Suggestion on ${row.areaRef}: ${row.id}`),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record decision', onClick: submit }],
  });
}

function claimDialog(ctx, row, onDone) {
  const form = buildForm([
    { name: 'effectText', label: 'The effect you claim', type: 'textarea', required: true, help: `At least ${L.textMin} characters: what changed, and how the work shows it.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.suggestionClaim({ suggestionId: row.id, ...form.getValues() });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The claim was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Effect claimed. The record now owes an INDEPENDENT confirmation — never yours.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Claim the effect',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'Do, then check', body: 'You are the named owner. Your claim is the “do” of the loop. Someone else — the submitter or the route — confirms it. You never confirm your own effect.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Claim effect', onClick: submit }],
  });
}

function confirmDialog(ctx, row, onDone) {
  const form = buildForm([
    { name: 'note', label: 'What you confirmed', type: 'textarea', required: true, help: `At least ${L.textMin} characters: what you saw working.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.suggestionConfirm({ suggestionId: row.id, ...form.getValues() });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The confirmation was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Effect confirmed. The record closes — an independent key, as it opened.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Independently confirm the effect',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'The second key', body: 'Confirmation is a separate human act from the claim. If you own the change, this door is closed to you by design.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Confirm effect', onClick: submit }],
  });
}

/* -------------------------------------------------------------------- views */

function summaryCard(report) {
  const c = report.counts;
  return card({
    title: 'The ledger in five numbers',
    subtitle: 'States are re-derived on every read; nothing here is stored.',
    body: h('div', { class: 'stat-row' },
      stat({ label: 'Suggestions', value: String(c.total) }),
      stat({ label: 'Response overdue', value: String(c.overdue.response), tone: c.overdue.response ? 'warn' : undefined }),
      stat({ label: 'Target overdue', value: String(c.overdue.target), tone: c.overdue.target ? 'warn' : undefined }),
      stat({ label: 'Refused acts', value: String(c.refusedActs), tone: c.refusedActs ? 'warn' : undefined }),
      stat({ label: 'Dropped rows', value: String(c.droppedSuggestions + c.droppedActs), tone: (c.droppedSuggestions + c.droppedActs) ? 'warn' : undefined }),
    ),
  });
}

function claimsBanners(report) {
  return h('div', { class: 'stack' },
    report.partitionReconciles
      ? banner({ tone: 'good', title: 'The rows add up', body: 'Every printed state count sums to the ledger total (`partitionReconciles`).' })
      : banner({ tone: 'bad', title: 'The rows do NOT add up', body: 'The printed state counts do not sum to the ledger total. Do not read a figure from this page until the record is repaired.' }),
    report.figuresComplete
      ? banner({ tone: 'good', title: 'Nothing refused, nothing dropped', body: 'No refused act and no dropped row sit behind these figures (`figuresComplete`).' })
      : banner({ tone: 'caution', title: 'Figures carry refused or dropped rows behind them', body: `Refused acts: ${report.counts.refusedActs}; dropped suggestions: ${report.counts.droppedSuggestions}; dropped acts: ${report.counts.droppedActs}. The counts above are honest about what survived normalization; the refusals are listed on their own tab.` }),
  );
}

function rowsView(ctx, report, onDone) {
  const self = ctx.state?.settings?.activeSeatId || null;
  const columns = [
    { label: 'Area', render: (r) => h('strong', null, r.areaRef) },
    { label: 'Problem', render: (r) => h('span', { class: 'small' }, r.problemText.length > 140 ? `${r.problemText.slice(0, 140)}…` : r.problemText) },
    { label: 'Proposal', render: (r) => h('span', { class: 'small' }, r.proposalText.length > 140 ? `${r.proposalText.slice(0, 140)}…` : r.proposalText) },
    { label: 'Filed', render: (r) => when(r.submittedAt) },
    { label: 'Response owed', render: (r) => h('span', { class: r.overdue.includes('response-overdue') ? 'text-warn' : '' }, when(r.responseByAt), r.overdue.includes('response-overdue') ? ' · OVERDUE' : '') },
    { label: 'State', render: (r) => h('span', null, badge(STATE_SHORT[r.state] || r.state, STATE_TONE[r.state] || 'neutral'), r.overdue.includes('target-overdue') ? h('span', { class: 'small text-warn' }, ' · target OVERDUE') : null) },
    { label: 'Owner', render: (r) => (r.ownerId ? h('span', null, r.ownerId === self ? 'you' : r.ownerId, r.targetDay ? h('span', { class: 'small muted' }, ` · by ${r.targetDay}`) : null) : h('span', { class: 'small muted' }, r.decision === 'decline' ? 'declined, none named' : '—')) },
    {
      label: '', render: (r) => h('div', { class: 'row gap-s' },
        (r.state === 'awaiting-triage' || r.state === 'awaiting-joint-triage') && r.routeIds.includes(self)
          ? button('Decide', () => triageDialog(ctx, r, onDone), { primary: true, testid: `kzt-triage-${r.id}` })
          : null,
        r.state === 'accepted-awaiting-claim' && r.ownerId === self
          ? button('Claim effect', () => claimDialog(ctx, r, onDone), { primary: true, testid: `kzt-claim-${r.id}` })
          : null,
        r.state === 'claimed-awaiting-confirmation' && (r.submitterId === self || r.routeIds.includes(self)) && r.ownerId !== self
          ? button('Confirm', () => confirmDialog(ctx, r, onDone), { primary: true, testid: `kzt-confirm-${r.id}` })
          : null),
    },
  ];
  return h('div', { class: 'stack', 'data-testid': 'kzt-rows' },
    h('div', { class: 'row gap-s' },
      button('File a suggestion', () => declareDialog(ctx, ctx.suggestionCandidates, onDone), { primary: true, testid: 'kzt-declare' }),
      button('Scan the register', () => {
        const result = ctx.api.suggestionScan();
        if (!result?.ok) { toast(result?.error || 'The scan was refused.', 'bad'); return; }
        toast('Register scanned. Overdue responses and targets were re-read from the record.', 'good');
        onDone?.();
      }, { testid: 'kzt-scan' })),
    report.counts.hidden > 0
      ? banner({ tone: 'info', title: `${report.counts.hidden} suggestion(s) withheld from this seat`, body: 'A suggestion is readable by its parties and by the span that holds its people. Everything else is withheld and counted — never printed and never dropped.' })
      : null,
    table({
      caption: 'Suggestions — the problem, the proposal, who owes the answer, and what is overdue',
      columns,
      rows: report.rows.map((row) => ({
        ...row,
        attrs: {
          'data-testid': `kzt-row-${row.id}`,
          'data-state': row.state,
          'data-overdue': String(row.overdue.length > 0),
        },
      })),
      emptyMessage: 'No improvement suggestion is readable from this seat. Until one is filed, the small wastes stay with the people who see them.',
    }),
  );
}

function ratesView(report) {
  if (report.ratesWithheld) {
    return h('div', { class: 'stack', 'data-testid': 'kzt-rates' },
      banner({ tone: 'caution', title: 'The rates are withheld from this seat', body: report.ratesWithheldReason || 'A rate built from part of the population would read as the unit’s.' }));
  }
  const columns = [
    { label: 'Area', render: (r) => (r.suppressed ? h('span', { class: 'small muted' }, 'withheld') : h('strong', null, r.areaRef)) },
    { label: 'Suggestions', render: (r) => (r.suppressed ? '—' : String(r.total)) },
    { label: 'Answered in window', render: (r) => (r.suppressed ? '—' : String(r.answered)) },
    { label: 'Answered rate', render: (r) => (r.suppressed ? '—' : pct(r.answeredBp)) },
    { label: 'Implemented', render: (r) => (r.suppressed ? '—' : String(r.implemented)) },
    { label: 'Implemented rate', render: (r) => (r.suppressed ? '—' : pct(r.implementedBp)) },
    { label: '', render: (r) => (r.suppressed ? h('span', { class: 'small muted' }, r.suppressedReason) : null) },
  ];
  const t = report.rates.totals || {};
  return h('div', { class: 'stack', 'data-testid': 'kzt-rates' },
    banner({ tone: 'info', title: 'Two rates per declared area, and nothing about a person', body: `Answered-in-window: the route settled the suggestion at or before its declared response-by instant (a decline counts as an answer; a split does not). Implemented: the effect was claimed AND independently confirmed. Cells below the privacy floor of ${L.privacyFloor} are withheld with complementary suppression — this is statistical disclosure control, not differential privacy: successive snapshots and outside knowledge can still differencing against this table.` }),
    h('div', { class: 'stat-row' },
      stat({ label: 'Suggestions', value: t.suggestions === null ? 'withheld' : String(t.suggestions) }),
      stat({ label: 'Answered in window', value: t.answered === null ? 'withheld' : String(t.answered) }),
      stat({ label: 'Answered rate', value: pct(t.answeredBp) }),
      stat({ label: 'Implemented', value: t.implemented === null ? 'withheld' : String(t.implemented) }),
      stat({ label: 'Implemented rate', value: pct(t.implementedBp) }),
    ),
    t.withheldReason ? banner({ tone: 'caution', title: 'A total is withheld', body: t.withheldReason }) : null,
    report.rates.notes?.length
      ? card({ title: 'Suppression notes', body: h('ul', { class: 'list' }, ...report.rates.notes.map((n) => h('li', { class: 'small' }, n))) })
      : null,
    table({
      caption: 'Per-area rates — exact counts and exact floor basis points',
      columns,
      rows: report.rates.cells.map((cell) => ({ ...cell, attrs: { 'data-testid': `kzt-area-${cell.code}`, 'data-suppressed': String(cell.suppressed) } })),
      emptyMessage: 'No suggestion exists yet, so no rate can be computed. A rate over nothing is not zero — it is absent.',
    }),
  );
}

function refusalsView(report) {
  const columns = [
    { label: 'Act', render: (r) => h('code', null, r.actId) },
    { label: 'Suggestion', render: (r) => h('code', null, r.suggestionId) },
    { label: 'Kind', render: (r) => badge(r.kind, 'neutral') },
    { label: 'Refused because', render: (r) => h('span', null, r.reason) },
  ];
  return h('div', { class: 'stack', 'data-testid': 'kzt-refusals' },
    banner({ tone: 'info', title: 'Refused acts are never applied', body: 'Every act the replay refused is counted and printed here with its reason. A second triage, claim or confirmation never overwrites the first — the refusal is the control.' }),
    report.warnings?.length
      ? card({ title: 'Rows the loader refused at the door', subtitle: 'Malformed or duplicate rows are dropped and counted; nothing is repaired', body: h('ul', { class: 'list' }, ...report.warnings.map((w) => h('li', { class: 'small' }, w))) })
      : null,
    table({
      caption: 'Refused acts — append-only, counted, explained',
      columns,
      rows: report.refusals,
      emptyMessage: 'Nothing has been refused. Every act on the record replayed as valid.',
    }),
  );
}

function methodView() {
  return h('div', { class: 'stack', 'data-testid': 'kzt-method' },
    card({
      title: 'The three keys in one picture',
      subtitle: 'The route computes the answer, the owner claims the effect, somebody else confirms it. Nothing closes by the clock.',
      body: h('figure', { class: 'figure' },
        h('img', { src: DIAGRAM_URL, alt: 'Improvement suggestion flow: a worker files a suggestion with a problem and a proposal. The decision route is computed from the reporting graph as the joint-apex seat above every line of the submitter. The route accepts with a named owner and target day, or declines with a reason. The owner claims the effect; the submitter or a route member — never the owner — independently confirms it, and the record closes. Overdue responses and targets raise an owned ask.', class: 'figure-img', 'data-testid': 'kzt-diagram' }),
        h('figcaption', { class: 'small muted' }, 'A suggestion is answered, owned and confirmed — or visibly overdue. It is never merely collected.')),
    }),
    card({ title: 'Frameworks encoded', body: h('ul', { class: 'list' }, ...KZT_METHOD.frameworks.map((f) => h('li', null, f))) }),
    card({ title: 'Invariants', body: h('ul', { class: 'list' }, ...KZT_METHOD.invariants.map((f) => h('li', null, f))) }),
    card({ title: 'What it deliberately does not do', body: h('ul', { class: 'list' }, ...KZT_METHOD.deliberatelyAbsent.map((f) => h('li', null, f))) }),
    card({
      title: 'The unit of aggregation',
      body: h('p', null, 'The rates are per DECLARED AREA — the work area the suggestion itself names. No org-unit attribution of the author is invented: a person on two lines has one home line and one allocation, and assigning their suggestion to one unit would be an agreement nobody made. The CSV export carries the same areas under opaque codes, so no work-area name crosses that boundary either.'),
    }),
  );
}

export function renderSuggestions(ctx) {
  const report = ctx.api.suggestionReport ? ctx.api.suggestionReport() : null;
  if (!report || report.ok === false || !report.counts) {
    return h('div', { class: 'page' },
      pageHeader({ eyebrow: 'Frontline & mid-manager · matrix', title: 'Improvement suggestions', subtitle: 'Answered, owned and confirmed — never merely collected.' }),
      banner({ tone: 'bad', title: 'The register could not be read', body: report?.error || 'The seat refused the read.' }));
  }
  ctx.suggestionCandidates = ctx.api.suggestionCandidates ? ctx.api.suggestionCandidates() : null;
  const requested = ctx.query?.get?.('view');
  const view = VIEWS.some((row) => row.key === requested) ? requested : 'rows';
  const onDone = () => ctx.refresh?.();
  return h('div', { class: 'page', 'data-testid': 'suggestions-panel' },
    pageHeader({
      eyebrow: 'Frontline & mid-manager · single-chain and matrix',
      title: 'Who answers the small waste — and when?',
      subtitle: 'A person files the problem and the proposal. The decision route is computed from the reporting graph — the seat(s) above every line they hold, never chosen. The route accepts with an owner and a target or declines with a reason; the owner claims the effect; somebody other than the owner confirms it. An unanswered suggestion past its declared window is visible, and RULE-KZT-01 asks the seat that owes the answer.',
    }),
    ctx.persistError ? card({ body: h('p', { class: 'text-warn small' }, `Changes are not being saved: ${ctx.persistError}`) }) : null,
    ...(report.warnings || []).map((warning) => banner({ tone: 'caution', title: 'A stored row was refused', body: warning })),
    summaryCard(report),
    claimsBanners(report),
    tabs({
      items: VIEWS.map((row) => ({
        key: row.key,
        label: row.label,
        count: row.key === 'rows' ? report.rows.length : row.key === 'refusals' ? report.refusals.length : undefined,
      })),
      active: view,
      ariaLabel: 'Improvement-suggestion views',
      onSelect: (key) => ctx.navigate(`${KZT_HREF}?view=${key}`),
    }),
    view === 'rows' ? rowsView(ctx, report, onDone) : null,
    view === 'counts' ? ratesView(report) : null,
    view === 'refusals' ? refusalsView(report) : null,
    view === 'method' ? methodView() : null,
  );
}

export default renderSuggestions;
