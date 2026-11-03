/** Decision Rights Exchange — one surface, altitude-specific duties and disclosure. */
import { h, toast, openModal, closeAllModals } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, kv } from '../ui/components.js';
import { formatDate } from '../core/time.js';
import { MANDATE_ACTIONS } from '../core/domain/mandateRegistry.js';

const PANELS = [{ key: 'inbox', label: 'My authority inbox' }, { key: 'route', label: 'Route a handoff' }, { key: 'rollup', label: 'Hierarchy roll-up' }, { key: 'method', label: 'Contract & method' }];
const panelFor = (q) => { const p = q?.get?.('panel'); return PANELS.some((x) => x.key === p) ? p : 'inbox'; };
const go = (ctx, panel) => ctx.navigate(`#/mandates?panel=${panel}`);
const notice = (result, ctx, message) => { if (!result.ok) return toast(result.error, 'bad'); toast(result.warning || message, result.warning ? 'warn' : 'good'); ctx.refresh(); };
const field = (label, input, hint) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input, hint ? h('span', { class: 'field-hint' }, hint) : null);
const input = (id, value = '', type = 'text', extra = {}) => h('input', { id, class: 'input', type, value: value ?? '', ...extra });
const area = (id, value = '', rows = 3) => h('textarea', { id, class: 'input', rows, maxlength: 2000 }, value);
const value = (root, id) => root.querySelector(`#${id}`)?.value || '';

function responseDialog(ctx, row, action) {
  const delivering = action === 'deliver';
  const verifying = action === 'verify';
  const accepting = action === 'accept';
  const title = { accept: 'Accept the exact boundary', deliver: 'Deliver evidence, not a status colour', verify: 'Verify against the original outcome', return: 'Return authority with a reason', revoke: 'Withdraw authority and recover the work' }[action];
  const note = area('mnd-note', '', 3);
  const capacity = area('mnd-capacity', '', 2);
  const refs = h('select', { id: 'mnd-ref', class: 'input' }, h('option', { value: '' }, 'Linked acceptance task (automatic)'), ...r.catalog.map((i) => h('option', { value: `${i.type}:${i.entityId}` }, `${i.typeLabel}: ${i.title}`)));
  const actual = input('mnd-actual', '', 'number', { min: '0', max: String(row.spendCeiling ?? ''), step: '0.01' });
  const reject = verifying ? h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => {
    const result = ctx.api.verifyMandate(row.id, { note: note.value, accepted: false });
    if (result.ok) closeAllModals(); notice(result, ctx, 'Evidence returned; recovery is now owned.');
  } }, 'Reject evidence · open recovery') : null;
  const body = h('div', { class: 'stack' },
    kv('Outcome', row.outcome), kv('Stop condition', row.stopCondition),
    kv('Rights', row.actions.map((a) => MANDATE_ACTIONS[a]).join('; ')),
    field(delivering ? 'What observably changed? Include the result and remaining uncertainty.' : verifying ? 'Does the evidence satisfy the original outcome? Why?' : 'Your acknowledgement or reason', note),
    accepting ? field('Capacity plan (required when headroom is unknown or insufficient)', capacity, row.capacity.reason) : null,
    delivering ? field('Additional evidence record', refs) : null,
    delivering && row.actions.includes('spend') ? field(`Actual spend (${row.currency}; ceiling ${row.spendCeiling})`, actual, 'Unknown is not zero. Actuals post only after sender verification.') : null,
    h('div', { class: 'form-actions' }, reject, h('button', { class: 'btn btn-primary', type: 'button', onClick: () => {
      const options = { note: note.value, capacityNote: capacity.value, evidence: note.value, actualSpend: actual.value,
        evidenceRefs: refs.value ? [{ type: refs.value.split(':')[0], id: refs.value.split(':').slice(1).join(':') }] : [] };
      const methods = { accept: 'acceptMandate', deliver: 'deliverMandate', verify: 'verifyMandate', return: 'returnMandate', revoke: 'revokeMandate' };
      const result = ctx.api[methods[action]](row.id, options);
      if (result.ok) closeAllModals(); notice(result, ctx, 'Contract updated; every linked module was reconciled in the same transaction.');
    } }, verifying ? 'Verify outcome' : delivering ? 'Submit for verification' : accepting ? 'Accept bounded authority' : 'Confirm and recover')));
  openModal({ title, body });
}

function offerDialog(ctx, source) {
  const r = ctx.api.mandateRead();
  const receiver = h('select', { id: 'mnd-receiver', class: 'input' }, h('option', { value: '' }, 'Choose a receiving span…'), ...r.seats.map((s) => h('option', { value: s.id }, `${s.label} · ${s.name}`)));
  const outcome = area('mnd-outcome', '', 3);
  const stop = area('mnd-stop', 'Return authority if the scope, budget ceiling, affected span or expiry would be exceeded.', 2);
  const effort = input('mnd-effort', '1', 'number', { min: '0.01', max: '365', step: '0.25', required: true });
  const expiry = input('mnd-expiry', '', 'date', { min: r.now });
  const ceiling = input('mnd-ceiling', '', 'number', { min: '0', step: '0.01' });
  const currency = input('mnd-currency', 'DKK', 'text', { maxlength: 3, pattern: '[A-Za-z]{3}' });
  const budget = h('select', { id: 'mnd-budget', class: 'input' }, h('option', { value: '' }, 'Select only for spending authority'), ...r.budgets.map((b) => h('option', { value: b.id }, `${b.name} · ${b.currency}${b.headroom === null ? '' : ` · headroom ${b.headroom}`}`)));
  const capacity = area('mnd-capacity-plan', '', 2);
  const checks = Object.entries(MANDATE_ACTIONS).map(([key, label]) => h('label', { class: 'check-row' }, h('input', { type: 'checkbox', name: 'mnd-right', value: key, ...(key === 'replan' ? { checked: true } : {}) }), h('span', null, label)));
  const preview = h('div', { class: 'stack-tight', 'aria-live': 'polite' });
  const payload = (root) => ({ sourceType: source.type, sourceId: source.entityId, toSeatId: receiver.value, outcome: outcome.value, stopCondition: stop.value,
    effortDays: effort.value, expiresOn: expiry.value, actions: [...root.querySelectorAll('input[name="mnd-right"]:checked')].map((x) => x.value),
    spendCeiling: ceiling.value, currency: currency.value, budgetId: budget.value, capacityNote: capacity.value });
  let body;
  const run = (commit) => {
    const data = payload(body);
    const result = commit ? ctx.api.proposeMandate(data) : ctx.api.previewMandate(data);
    if (!result.ok) { preview.replaceChildren(banner({ tone: 'warn', title: 'Not routable yet', body: result.error })); return; }
    if (commit) { closeAllModals(); notice(result, ctx, 'Offer created. Authority is not active until the receiver accepts.'); return; }
    preview.replaceChildren(banner({ tone: 'info', title: `${result.direction === 'up' ? 'Escalate up' : 'Delegate down'} → ${result.to}`, body: `${result.capacity.reason} Expiry ${data.expiresOn || 'uses this altitude’s horizon'}. No authority has been granted by this preview.` }));
  };
  body = h('div', { class: 'stack' },
    banner({ tone: 'info', title: source.title, body: `Source: ${source.typeLabel} · required rank ${source.requiredRank} · ${source.people.length} affected person(s). Private source notes are not copied.` }),
    field('Receiving leadership span', receiver, 'Peer-to-peer transfers are refused. Cross-span work routes up to the lowest common leader.'),
    field('Observable outcome', outcome), h('fieldset', { class: 'stack-tight' }, h('legend', { class: 'field-label' }, 'Explicit decision rights'), ...checks),
    h('div', { class: 'form-grid' }, field('Expected effort · person-days', effort), field('Authority expiry', expiry, 'Blank uses the shorter of this altitude’s horizon and 30 days.')),
    h('div', { class: 'form-grid' }, field('Spending ceiling · optional right', ceiling), field('Currency', currency)),
    field('Funding envelope · required for spending', budget), field('Stop / return trigger', stop),
    field('Capacity plan · required if headroom is unknown or insufficient', capacity), preview,
    h('div', { class: 'form-actions' }, h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => run(false) }, 'Check route & capacity'), h('button', { class: 'btn btn-primary', type: 'button', onClick: () => run(true) }, 'Offer contract · acceptance required')));
  openModal({ title: 'Move the authority, not the paperwork', body, size: 'lg' });
}

function inbox(ctx, r) {
  return h('div', { class: 'stack' },
    r.seat.fullAccess ? banner({ tone: 'info', title: 'Choose who is operating before moving authority', body: 'The operator view can inspect the ledger, but cannot offer or accept on someone else’s behalf. Declare a real seat to use the exchange.', actions: [h('a', { class: 'btn btn-small btn-primary', href: '#/seat' }, 'Declare operating seat')] }) : null,
    r.rows.length ? h('div', { class: 'stack' }, ...r.rows.map((m) => card({
      title: m.displayTitle, subtitle: `${m.fromLabel} → ${m.toLabel} · ${m.direction === 'up' ? 'Escalation' : 'Delegation'} · expires ${formatDate(m.expiresOn)}`,
      actions: [badge(m.stale ? 'Reconciliation due' : m.statusLabel, m.stale ? 'bad' : m.status === 'completed' ? 'good' : m.status === 'active' ? 'info' : 'neutral')],
      body: h('div', { class: 'stack-tight' },
        kv('Contracted outcome', m.outcome),
        kv('Authority limits', m.actions.map((a) => MANDATE_ACTIONS[a]).join('; ')),
        kv('Return trigger', m.stopCondition),
        kv('Capacity at last offer / acceptance', `${m.capacity.state} · ${m.capacity.reason}`),
        m.actions.includes('spend') ? kv('Spending boundary', `${m.currency} ${m.spendCeiling} · ${m.actualSpend === null ? 'actual not yet recorded' : `actual ${m.actualSpend}`}`) : null,
        m.evidence ? kv('Delivered evidence', m.evidence) : null,
        h('details', null, h('summary', null, `Contract history · ${m.history.length} transition(s)`), h('ol', { class: 'stack-tight' }, ...m.history.map((e) => h('li', null, `${e.at.slice(0, 10)} · ${e.status} · ${e.note}`)))),
        h('div', { class: 'card-actions' },
          m.canAccept ? h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => responseDialog(ctx, m, 'accept') }, 'Review & accept') : null,
          m.canDeliver ? h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => responseDialog(ctx, m, 'deliver') }, 'Deliver evidence') : null,
          m.canVerify ? h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => responseDialog(ctx, m, 'verify') }, 'Verify outcome') : null,
          m.canReturn ? h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => responseDialog(ctx, m, 'return') }, 'Return') : null,
          m.canRevoke ? h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => responseDialog(ctx, m, 'revoke') }, 'Revoke') : null,
          h('a', { class: 'btn btn-small btn-ghost', href: m.sourceRoute }, 'Open source record'),
        )),
    }))) : emptyState({ title: 'No authority contracts in this span', body: 'Route an existing case, decision or other registered work item. Nothing is fabricated to fill this inbox.', action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => go(ctx, 'route') }, 'Route a handoff') }));
}

function routing(ctx, r) {
  if (r.seat.fullAccess) return emptyState({ title: 'A contract needs a sending seat', body: 'Declare the operating seat first. Authority cannot be offered from an ambiguous identity.', action: h('a', { class: 'btn btn-primary', href: '#/seat' }, 'Choose operating seat') });
  return card({ title: 'Existing work, one new boundary', subtitle: `${r.catalog.length} open non-confidential source record(s) visible to this seat. Choose a record; the route is checked against the reporting tree before anything is written.`,
    body: r.catalog.length ? h('div', { class: 'stack-tight' }, ...r.catalog.slice(0, 60).map((i) => h('div', { class: 'list-row' }, h('div', null, h('strong', null, i.title), h('p', { class: 'muted small' }, `${i.typeLabel} · ${i.ageDays}d old · required rank ${i.requiredRank} · ${i.people.length} affected`)), h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => offerDialog(ctx, i) }, 'Define handoff')))) : emptyState({ title: 'No routable source records', body: 'Open a case or decision first. Confidential conflict, pulse and coaching content is deliberately excluded.' }) });
}

function rollupNode(node, depth = 0, ctx) {
  return h('div', { class: 'mandate-rollup-node', style: `margin-left:${Math.min(depth, 4) * 18}px` },
    h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => ctx.navigate(`#/mandates?panel=rollup&span=${encodeURIComponent(node.seatId)}`) }, `${node.label || 'Workspace leader'} · rank ${node.rank || 5} · inspect span`),
    h('span', { class: 'muted small' }, `${node.total} contract(s) · ${node.own} received here · ${node.counts.proposed || 0} awaiting · ${node.counts.active || 0} active · ${node.counts.delivered || 0} to verify · ${node.counts.completed || 0} verified · ${node.expiredOpen} past expiry`),
    ...node.children.map((child) => rollupNode(child, depth + 1, ctx)));
}

export function renderMandates(ctx) {
  const r = ctx.api.mandateRead({ seatId: ctx.query?.get?.('span') });
  const panel = panelFor(ctx.query);
  const content = panel === 'inbox' ? inbox(ctx, r) : panel === 'route' ? routing(ctx, r) : panel === 'rollup' ? h('div', { class: 'stack' },
    banner({ tone: 'info', title: 'Exact partition, not repeated ancestor counts', body: 'Each contract belongs to its receiving span once. A parent is the sum of its own receipts and disjoint child spans. Drilling down never changes the enterprise total.' }),
    card({ title: 'Receiver-partitioned hierarchy', actions: [h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => go(ctx, 'rollup') }, 'Back to my whole span')], body: rollupNode(r.rollup, 0, ctx) }),
    r.rollup.refusal ? banner({ tone: 'warn', title: 'No rate claimed', body: r.rollup.refusal }) : null,
  ) : h('div', { class: 'stack' },
    card({ title: 'Principal–agent, made operational', body: h('div', { class: 'stack-tight' }, h('p', null, r.premise), h('p', null, 'Jensen & Meckling (1976): authority and accountability must be aligned. DACI records the approver; commitment accounting encumbers the ceiling before spend; Little’s Law / the existing capacity model supplies measured headroom, never a fabricated availability score.'), h('p', null, 'The lifecycle is offer → explicit acceptance → evidence delivery → sender verification. Return, revocation, expiry or scope drift opens a recovery owner. An unverified completion never becomes a verified outcome.')) }),
    card({ title: 'Automatic reconciliation', body: h('label', { class: 'check-row' }, h('input', { type: 'checkbox', checked: r.autoPropagate, onChange: (event) => { const result = ctx.api.updateSettings({ mandateAutoPropagate: event.target.checked }); notice(result, ctx, result.ok ? 'Automatic authority reconciliation updated.' : ''); } }), h('span', null, 'Reconcile expiry, source drift, budget drift and recovery on every workspace write. Explicit “Reconcile now” always runs.')) }),
    card({ title: 'What this does not claim', body: h('p', null, 'No authentication, tenant isolation, cryptographic identity, external notification or autonomous spending. Seat selection is a local workflow declaration. Full workspace backups still contain the whole workspace. Keep this file to one trusted operator; do not use it as a multi-user security boundary.') }),
  );
  return h('div', { class: 'page-stack mandate-page' },
    pageHeader({ eyebrow: 'Decision Rights Exchange · authority with a return path', title: 'Move the decision. Keep the proof.', subtitle: r.question,
      actions: [h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => { const result = ctx.api.scanMandates(); notice(result, ctx, 'Expiry, source scope and recovery reconciled.'); } }, 'Reconcile now'), h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => {
        const saved = downloadText({ filename: `leados-authority-brief-${r.now}.txt`, text: ctx.api.mandateBriefText(), mime: 'text/plain' }); toast(saved ? 'Identity-free brief downloaded.' : 'Download blocked by this browser.', saved ? 'good' : 'warn');
      } }, 'Export aggregate brief'), h('button', { class: 'btn btn-primary', type: 'button', onClick: () => go(ctx, 'route') }, 'Route a handoff')],
      meta: [badge(`${r.counts.open} open`, 'neutral'), badge(`${r.counts.awaiting} awaiting acceptance`, 'info'), badge(`${r.counts.delivered} to verify`, 'warn'), r.counts.stale ? badge(`${r.counts.stale} reconciliation due`, 'bad') : null].filter(Boolean) }),
    h('div', { class: 'stat-grid' }, stat({ label: 'Awaiting consent', value: String(r.counts.awaiting), hint: 'Silence never grants authority' }), stat({ label: 'Evidence to verify', value: String(r.counts.delivered), hint: 'Completion is a two-sided receipt' }), stat({ label: 'Past expiry', value: String(r.counts.stale), hint: 'Recovery, not silent extension', tone: r.counts.stale ? 'bad' : '' })),
    tabs({ items: PANELS, active: panel, onSelect: (key) => go(ctx, key), ariaLabel: 'Decision rights panels' }), content);
}
