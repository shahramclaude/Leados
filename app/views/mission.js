/** Mission Control: a role-tiered operating surface, not a generic dashboard. */
import { h, toast, openModal } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table, kv } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { dayKey, addDays } from '../core/time.js';
import { MISSION_PANELS, MISSION_DISCLOSURE } from '../core/domain/missionRegistry.js';
import { displayBound } from '../core/domain/mission.js';
import { BUNDLE_LABELS } from '../core/domain/actionBundleRegistry.js';
import { renderCommandFlow } from '../ui/command-flow.js';
import { renderExecutionPanel } from '../ui/execution-panel.js';

const ui = { busy: false, error: '', reviewed: false, bundleId: '', caseId: '' };
const labels = { now: 'Your next moves', capture: 'Command Flow', execution: 'Execution evidence', hierarchy: 'Hierarchy & roll-up', interventions: 'Coordinated interventions', brief: 'Brief & handoff' };
const commandHelp = { decision: 'A DACI choice; adoption never chooses for you.', delegation: 'An owned outcome and a dated checkpoint.', premise: 'A testable assumption, not a claimed fact.', budget: 'An encumbrance against an existing envelope; not spend.', comms: 'Drafts for qualified stakeholders; nothing is sent.', coaching: 'A support prompt for the next 1:1; never a person score.' };
function go(ctx, panel, extra = '') { ctx.navigate(`#/mission?panel=${panel}${extra}`); }
function notify(result, success) { if (!result.ok) { toast(result.error, 'bad'); return false; } toast(result.warning || success, result.warning ? 'bad' : 'good'); return true; }
function field(label, control, hint = '') { return h('div', { class: 'field' }, h('label', { for: control.id }, label), control, hint ? h('p', { class: 'field-hint' }, hint) : null); }
function input(name, value = '', type = 'text', extra = {}) { return h('input', { id: `mission-${name}`, name, type, value, ...extra }); }
function select(name, options, value = '') { return h('select', { id: `mission-${name}`, name }, ...options.map((o) => h('option', { value: o.value, selected: o.value === value }, o.label))); }

function registerSituation(ctx, report) {
  const title = input('situation-title', '', 'text', { required: true, minlength: 3, maxlength: 180 });
  const description = h('textarea', { id: 'mission-description', name: 'description', rows: 4, maxlength: 4000 });
  const owner = select('situation-owner', [{ value: '', label: 'Owned at this altitude / unassigned' }, ...report.owners.map((p) => ({ value: p.id, label: `${p.name} · ${p.role || 'Leader'}` }))]);
  const severity = select('situation-severity', [{ value: '', label: 'Not yet assessed' }, ...Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}${i + 1 >= 8 ? ' · high consequence' : '' }` }))], '5');
  const review = input('situation-review', addDays(dayKey(ctx.now), report.profile.reviewDays), 'date', { required: true, min: dayKey(ctx.now) });
  const error = h('p', { class: 'form-error', role: 'alert' });
  const form = h('form', { class: 'stack-sm', onSubmit: (e) => {
    e.preventDefault();
    const result = ctx.api.missionOpenCase({ title: title.value, description: description.value, ownerId: owner.value, severity: severity.value, reviewOn: review.value });
    if (!result.ok) { error.textContent = result.error; return; }
    ui.caseId = result.id; modal.close(); notify(result, 'Situation registered. Its standard propagation is recorded; now review an intervention.'); go(ctx, 'interventions'); ctx.refresh();
  } }, field('What is happening?', title), field('Evidence and context', description, 'Record observable facts. Do not include confidential mediation or health details.'), h('div', { class: 'form-grid' }, field('Accountable owner', owner), field('Severity (FMEA)', severity)), field('Review by', review), error,
    h('p', { class: 'muted tiny' }, 'Registering a case runs the existing case rules immediately. The optional intervention below is separately rehearsed before adoption.'),
    h('div', { class: 'form-actions' }, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Register situation')));
  const modal = openModal({ title: 'Start with the situation', body: form });
}

function nowPanel(ctx, r) {
  return h('div', { class: 'stack-sm' }, renderCommandFlow(ctx, r, { compact: true }), h('div', { class: 'mission-layout' },
    card({ title: 'Evidence-first triage', subtitle: 'Recorded dates, severity and decision horizon—not a probability or a person score.', body: r.queue.length ? h('div', { class: 'mission-queue' }, ...r.queue.slice(0, 12).map((item, i) => h('article', { class: 'mission-queue-item' },
      h('span', { class: 'mission-rank', 'aria-hidden': 'true' }, String(i + 1).padStart(2, '0')),
      h('div', { class: 'mission-queue-copy' }, h('div', { class: 'mission-row-top' }, h('h3', null, item.title), badge(item.overdueDays ? 'Overdue' : item.requiredRank > r.seat.rank ? 'Escalated' : 'On record', item.overdueDays ? 'bad' : 'neutral')),
        h('p', { class: 'muted small' }, item.reasons.length ? item.reasons.join(' · ') : `${item.label} · ${item.ageDays} days on record`),
        h('div', { class: 'mission-queue-foot' }, h('span', { class: 'tiny muted' }, `Triage priority ${item.triageScore}/100 · deterministic convention`), item.detail ? h('a', { class: 'text-link', href: item.route }, 'Open record →') : h('button', { class: 'text-link', type: 'button', onClick: () => go(ctx, 'hierarchy') }, 'Read span aggregate →')))))) : emptyState({ title: 'No open work in this span', body: 'Register a real situation, or choose another seat. Nothing is invented to fill this screen.', action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => registerSituation(ctx, r) }, 'Register situation') }) }),
    h('div', { class: 'stack-sm' }, card({ title: 'Your operating contract', subtitle: `${r.seat.label} · ${r.profile.horizon}`, className: 'mission-contract', body: h('div', { class: 'stack-sm' }, h('p', { class: 'mission-question' }, r.profile.question), kv('Focus', r.profile.focus), kv('Decision horizon', `${r.seat.horizonDays || r.profile.reviewDays} days`), kv('People in span', String(r.observedPeople)), h('a', { class: 'btn btn-ghost', href: '#/seat' }, 'Review duties & access')) }),
      card({ title: 'One situation. A coordinated response.', body: h('div', { class: 'stack-sm' }, h('p', { class: 'muted' }, 'Turn a case into a bounded PDCA loop: choose, assign, test the assumption, and review the result together.'), h('button', { class: 'btn btn-primary', type: 'button', onClick: () => go(ctx, 'interventions') }, 'Build an intervention')) }))) );
}

function hierarchyPanel(ctx, r) {
  const floor = input('cell-floor', r.hierarchy.floor, 'number', { min: 3, max: 25, step: 1 });
  // The read model enforces upward bounds; the UI only offers a parent inside
  // the acting subtree (or the acting seat itself).
  const acting = ctx.api.missionRead();
  const parentAllowed = r.seat.parentId && r.seat.id !== acting.seat.id;
  return h('div', { class: 'stack-sm' },
    h('div', { class: 'mission-breadcrumb' }, h('a', { href: '#/mission?panel=hierarchy' }, 'Operating span'), r.seat.id !== r.actingSeatId ? h('span', null, ` / ${r.seat.label}`) : null,
      parentAllowed && parentAllowed !== false ? h('a', { class: 'btn btn-tiny btn-ghost', href: `#/mission?panel=hierarchy&span=${encodeURIComponent(r.seat.parentId)}` }, '↑ One altitude up') : null),
    banner({ tone: 'info', title: 'A roll-up that cannot be subtracted back into a small team', body: r.hierarchy.method }),
    card({ title: 'Direct-span composition', subtitle: 'Each item belongs to exactly one owner node. Cross-team work stays at its lowest common leader.', body: table({ caption: 'Scoped work by child span', rows: r.hierarchy.cells, columns: [
      { label: 'Span', render: (c) => h('div', null, h('strong', null, c.label), c.suppressed ? h('p', { class: 'tiny muted' }, c.reason) : null) },
      { label: 'Open work', render: (c) => displayBound(c.open) }, { label: 'Overdue', render: (c) => displayBound(c.overdue) }, { label: 'Horizon debt', render: (c) => displayBound(c.horizonDebt) },
      { label: 'Drill', render: (c) => c.seatId ? h('a', { class: 'btn btn-tiny btn-ghost', href: `#/mission?panel=hierarchy&span=${encodeURIComponent(c.seatId)}` }, 'Open span →') : h('span', { class: 'muted' }, 'This altitude') },
    ] }) }),
    h('div', { class: 'grid-2' }, card({ title: 'Where the work comes from', subtitle: 'The same source registry powers vertical fan-out. No manual re-entry.', body: r.hierarchy.sources.length ? table({ caption: 'Work sources', rows: r.hierarchy.sources, columns: [{ label: 'Module source', render: (s) => s.label }, { label: 'Open count', render: (s) => displayBound(s.count) }, { label: 'Disclosure', render: (s) => badge(s.suppressed ? 'Small cell withheld' : 'Recorded', s.suppressed ? 'caution' : 'neutral') }] }) : emptyState({ title: 'No source records yet', body: 'Counts appear when real work is registered.' }) }),
      card({ title: 'Disclosure convention', body: h('div', { class: 'stack-sm' }, kv('Small-cell floor', `${r.hierarchy.floor} observations`), h('p', { class: 'muted small' }, 'Primary suppression hides small cells. If only one is hidden, a second cell is withheld. Parent totals become intervals so the hidden value cannot be recovered by subtraction.'),
        r.seat.rank >= 3 ? h('form', { class: 'inline-form', onSubmit: (e) => { e.preventDefault(); const result = ctx.api.setMissionFloor(floor.value); if (notify(result, 'Disclosure floor updated.')) ctx.refresh(); } }, field('Minimum cell size', floor), h('button', { class: 'btn btn-ghost', type: 'submit' }, 'Apply floor')) : null,
        h('p', { class: 'tiny muted' }, 'This is not differential privacy. Re-identification through external information or repeated releases remains a limitation.')) })));
}

async function rehearse(ctx, bundle) {
  if (ui.busy) return;
  ui.busy = true; ui.error = ''; ui.reviewed = false; ctx.refresh();
  try {
    const result = await ctx.rehearseMission(bundle.id);
    if (!result.ok) { ui.error = result.error; return; }
    const saved = ctx.api.saveMissionPreview(bundle.id, result);
    if (!saved.ok) ui.error = saved.error;
    else { ui.bundleId = bundle.id; toast('Rehearsal complete. Review the actual software ripple before adoption.', 'good'); }
  } catch (error) { ui.error = error?.message || 'Rehearsal failed. No live records changed.'; }
  finally { ui.busy = false; ctx.refresh(); }
}
function interventionEditor(ctx, r) {
  const source = select('case', r.eligibleCases.length ? r.eligibleCases.map((c) => ({ value: c.id, label: c.title })) : [{ value: '', label: 'Register a situation first' }], ui.caseId);
  const owner = select('owner', r.owners.map((p) => ({ value: p.id, label: p.name })), r.owners[0]?.id || '');
  const review = input('review', addDays(dayKey(ctx.now), r.profile.reviewDays), 'date', { required: true, min: dayKey(ctx.now), max: addDays(dayKey(ctx.now), 365) });
  const checks = r.profile.commands.map((kind) => h('label', { class: 'mission-command-choice' }, h('input', { type: 'checkbox', name: 'kinds', value: kind, checked: ['decision', 'delegation'].includes(kind) }), h('span', null, h('strong', null, BUNDLE_LABELS[kind]), h('span', { class: 'muted tiny' }, commandHelp[kind]))));
  const budget = select('budget', [{ value: '', label: 'Choose an envelope' }, ...r.budgets.map((b) => ({ value: b.id, label: `${b.label} · ${b.currency}` }))]);
  const amount = input('amount', '', 'number', { min: 0.01, step: 0.01 });
  const budgetFields = h('div', { class: 'form-grid', hidden: true }, field('Existing budget envelope', budget), field('Commitment amount', amount));
  const error = h('p', { class: 'form-error', role: 'alert' });
  const form = h('form', { class: 'stack-sm', onSubmit: (e) => {
    e.preventDefault();
    const kinds = [...form.querySelectorAll('input[name="kinds"]:checked')].map((el) => el.value);
    const result = ctx.api.missionCreateIntervention({ caseId: source.value, ownerId: owner.value, reviewOn: review.value, kinds, budgetId: budget.value, amount: amount.value });
    if (!result.ok) { error.textContent = result.error; return; }
    ui.bundleId = result.id; ui.reviewed = false; notify(result, 'Proposal saved. Rehearse it before any operational action is adopted.'); ctx.refresh();
  } }, field('Source situation', source), h('div', { class: 'form-grid' }, field('Accountable leader', owner), field('Review / due date', review)),
    h('fieldset', { class: 'mission-command-set' }, h('legend', null, 'Choose the operating loop'), ...checks), budgetFields, error,
    h('div', { class: 'form-actions' }, h('button', { class: 'btn btn-primary', type: 'submit', disabled: !r.eligibleCases.length || !r.owners.length }, 'Save proposal · no live actions')));
  form.addEventListener('change', () => { budgetFields.hidden = !form.querySelector('input[value="budget"]')?.checked; });
  return card({ title: 'Compose a bounded intervention', subtitle: `${r.profile.focus}. Commands are filtered by altitude before validation.`, body: form });
}
function previewCard(ctx, r, b) {
  const reviewed = h('input', { id: 'mission-reviewed', type: 'checkbox', checked: ui.reviewed });
  reviewed.addEventListener('change', () => { ui.reviewed = reviewed.checked; const adopt = document.getElementById('mission-adopt'); if (adopt) adopt.disabled = !reviewed.checked || ui.busy; });
  return card({ title: b.name, subtitle: `Review ${b.reviewOn} · ${b.status}${b.stale ? ' · rehearsal stale' : ''}`, body: h('div', { class: 'stack-sm' },
    h('div', { class: 'mission-chip-row' }, ...b.commands.map((c) => badge(BUNDLE_LABELS[c.kind] || c.kind, 'info'))),
    b.preview ? table({ caption: 'Rehearsed software effects', rows: b.preview.changes, columns: [{ label: 'Collection', render: (x) => x.collection }, { label: 'Created', render: (x) => x.created }, { label: 'Updated', render: (x) => x.updated }, { label: 'Removed', render: (x) => x.removed }] }) : banner({ tone: 'info', title: 'No rehearsal yet', body: 'Run the actual commands in a disposable workspace. The page stays responsive; nothing live changes.' }),
    b.preview ? h('p', { class: 'tiny muted' }, `${b.preview.ruleIds.length} rule contracts exercised · ${b.preview.failureCount} failures. ${MISSION_DISCLOSURE.simulation}`) : null,
    ['draft', 'rehearsed'].includes(b.status) ? h('div', { class: 'stack-sm' }, h('div', { class: 'form-actions' }, h('button', { class: 'btn btn-ghost', type: 'button', disabled: ui.busy, onClick: () => rehearse(ctx, b) }, ui.busy ? 'Rehearsing in background…' : 'Rehearse current workspace'), h('button', { class: 'btn btn-ghost', type: 'button', disabled: ui.busy, onClick: () => { const result = ctx.api.missionArchive(b.id); if (notify(result, 'Proposal archived.')) ctx.refresh(); } }, 'Archive proposal')),
      h('label', { class: 'check-row', for: 'mission-reviewed' }, reviewed, h('span', null, 'I reviewed every command and the cross-module effects. I understand this is not a causal forecast.')),
      h('button', { id: 'mission-adopt', class: 'btn btn-primary', type: 'button', disabled: !ui.reviewed || ui.busy || b.status !== 'rehearsed' || b.stale, onClick: () => { const result = ctx.api.missionCommit(b.id, r.revision, ui.reviewed); if (notify(result, 'Intervention adopted atomically. Every action and rule shares one receipt.')) { ui.reviewed = false; ctx.refresh(); } } }, 'Adopt reviewed intervention')) : null,
    b.status === 'committed' ? h('div', { class: 'stack-sm' }, banner({ tone: 'good', title: 'Adopted as one transaction', body: 'Later human changes are protected. Withdrawal is allowed only while every target remains untouched.' }), b.actual ? table({ caption: 'Adoption receipt', rows: b.actual.changes, columns: [{ label: 'Collection', render: (x) => x.collection }, { label: 'Created', render: (x) => x.created }, { label: 'Updated', render: (x) => x.updated }] }) : null,
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => { const reason = h('textarea', { id: 'mission-withdraw-reason', rows: 3, minlength: 10, required: true }); const modal = openModal({ title: 'Withdraw untouched work', body: h('form', { onSubmit: (e) => { e.preventDefault(); const result = ctx.api.missionWithdraw(b.id, reason.value); if (notify(result, 'Untouched actions withdrawn; history retained.')) { modal.close(); ctx.refresh(); } } }, field('Why withdraw? (at least 10 characters)', reason), h('button', { class: 'btn btn-primary', type: 'submit' }, 'Withdraw atomically')) }); } }, 'Review withdrawal')) : null) });
}
function interventionsPanel(ctx, r) {
  const selected = r.bundles.find((b) => b.id === ui.bundleId) || r.bundles.find((b) => ['draft', 'rehearsed'].includes(b.status));
  return h('div', { class: 'stack-sm' }, ui.error ? banner({ tone: 'bad', title: 'No live actions were applied', body: ui.error }) : null,
    h('div', { class: 'mission-layout' }, interventionEditor(ctx, r), card({ title: 'Intervention ledger', subtitle: 'A proposal is not an action. A rehearsal is not a prediction.', body: r.bundles.length ? h('div', { class: 'stack-tight' }, ...r.bundles.map((b) => h('button', { class: `mission-bundle-row${selected?.id === b.id ? ' is-selected' : ''}`, type: 'button', onClick: () => { ui.bundleId = b.id; ui.reviewed = false; ctx.refresh(); } }, h('strong', null, b.name), h('span', null, badge(b.stale ? 'Rehearse again' : b.status, b.stale ? 'caution' : b.status === 'committed' ? 'good' : 'neutral')), h('span', { class: 'tiny muted' }, `${b.commands.length} commands · review ${b.reviewOn}`)))) : emptyState({ title: 'No proposals yet', body: 'Choose a real case and compose the smallest coordinated response.' }) })),
    selected ? previewCard(ctx, r, selected) : null);
}
function briefPanel(ctx, r) {
  const canFreeze = r.seat.rank === 5 && r.seat.isLeader && r.enforced;
  const latest = r.briefs[0];
  return h('div', { class: 'stack-sm' }, banner({ tone: 'info', title: canFreeze ? 'A board line with its evidence boundary attached' : 'Your upward handoff, without the individual detail', body: MISSION_DISCLOSURE.brief }),
    h('div', { class: 'grid-2' }, card({ title: 'Current reading', subtitle: `Revision ${r.revision} · next review ${r.reviewOn}`, body: h('div', { class: 'stack-sm' }, kv('Open work', displayBound(r.hierarchy.totals.open)), kv('Past a recorded date', displayBound(r.hierarchy.totals.overdue)), kv('Beyond the owner’s horizon', displayBound(r.hierarchy.totals.horizonDebt)),
      h('div', { class: 'form-actions' }, h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => { const result = ctx.api.missionHandoffText(r.seat.id); if (!result.ok) { toast(result.error, 'bad'); return; } if (!downloadText({ filename: `leados-handoff-${dayKey(ctx.now)}.md`, text: result.text, mime: 'text/markdown' })) openModal({ title: 'Copy your handoff', body: h('textarea', { rows: 16, readonly: true, value: result.text, 'aria-label': 'Handoff text' }) }); } }, 'Download handoff'),
        canFreeze ? h('button', { class: 'btn btn-primary', type: 'button', onClick: () => { const result = ctx.api.missionFreezeBrief(r.revision); if (notify(result, 'Brief frozen. One governed review and typed span provenance were created.')) ctx.refresh(); } }, 'Freeze enterprise brief') : null),
      !canFreeze ? h('p', { class: 'tiny muted' }, 'Only the declared enterprise root can freeze a board snapshot. Your handoff remains available at this altitude.') : null) }),
      card({ title: 'What this reading cannot tell you', body: h('ul', { class: 'mission-limit-list' }, ...r.limitations.map((s) => h('li', null, s))) })),
    latest ? banner({ tone: 'info', title: `Latest frozen reading · ${latest.createdAt.slice(0, 10)}`, body: `Frozen open work: ${displayBound(latest.open)}. Current reading: ${displayBound(r.hierarchy.totals.open)}. ${latest.open.lower === latest.open.upper && r.hierarchy.totals.open.lower === r.hierarchy.totals.open.upper ? `Change: ${r.hierarchy.totals.open.lower - latest.open.lower >= 0 ? '+' : ''}${r.hierarchy.totals.open.lower - latest.open.lower}.` : 'An exact delta is refused while either reading is an interval.'}` }) : null,
    r.seat.rank >= 4 ? card({ title: 'Immutable brief ledger', body: r.briefs.length ? table({ caption: 'Frozen mission briefs', rows: r.briefs, columns: [
      { label: 'Frozen', render: (b) => b.createdAt.slice(0, 10) },
      { label: 'Open work', render: (b) => displayBound(b.open) },
      { label: 'Evidence fingerprint', render: (b) => h('code', null, b.fingerprint) },
      { label: 'Export', render: (b) => h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', onClick: () => {
        const result = ctx.api.missionBriefText(b.id);
        if (!result.ok) { toast(result.error, 'bad'); return; }
        if (!downloadText({ filename: `leados-brief-${b.id}.md`, text: result.text, mime: 'text/markdown' })) openModal({ title: 'Copy frozen brief', body: h('textarea', { rows: 16, readonly: true, value: result.text, 'aria-label': 'Frozen brief text' }) });
      } }, 'Download brief') },
    ] }) : emptyState({ title: 'Nothing frozen yet', body: 'A live reading is not a historical claim. Freeze one to create a dated evidence packet and a review decision.' }) }) : null);
}

export function renderMission(ctx) {
  const panel = MISSION_PANELS.includes(ctx.query.get('panel')) ? ctx.query.get('panel') : 'now';
  const r = ctx.api.missionRead(ctx.query.get('span') || null);
  if (!r.ok) return h('div', { class: 'page' }, pageHeader({ title: 'Mission Control' }), banner({ tone: 'bad', title: 'This span cannot be opened', body: r.error }), h('a', { class: 'btn btn-primary', href: '#/seat' }, 'Choose a valid seat'));
  return h('div', { class: 'view-stack mission-view', 'data-altitude': r.seat.altitudeKey },
    h('section', { class: 'mission-hero' }, pageHeader({ eyebrow: `LEADOS · MISSION CONTROL / ${r.seat.label.toUpperCase()}`, title: r.profile.title, subtitle: `${r.profile.focus} · ${r.profile.horizon} · ${r.enforced ? 'Scoped operating seat' : 'Local operator preview'}`, actions: [h('a', { class: 'btn btn-ghost', href: '#/seat' }, 'Change altitude'), h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => registerSituation(ctx, r) }, 'Structured intake'), h('a', { class: 'btn btn-primary', href: '#/mission?panel=capture' }, 'Describe a situation')] }),
      h('div', { class: 'mission-stats' }, stat({ label: 'Open work in scope', value: displayBound(r.hierarchy.totals.open), hint: 'Recorded work, not people' }), stat({ label: 'Past a promised date', value: displayBound(r.hierarchy.totals.overdue), hint: 'Exact or disclosure-safe interval' }), stat({ label: 'Beyond owner horizon', value: displayBound(r.hierarchy.totals.horizonDebt), hint: 'Jaques time-span escalation' }), stat({ label: 'Open execution loops', value: displayBound(r.execution.hierarchy.totals.open), hint: 'Evidence-reconciled, suppression-safe' }))),
    h('p', { class: 'mission-boundary tiny' }, MISSION_DISCLOSURE.local),
    tabs({ items: MISSION_PANELS.map((key) => ({ key, label: labels[key] })), active: panel, onSelect: (key) => go(ctx, key), ariaLabel: 'Mission Control panels' }),
    panel === 'now' ? nowPanel(ctx, r) : panel === 'capture' ? renderCommandFlow(ctx, r) : panel === 'execution' ? renderExecutionPanel(ctx, r) : panel === 'hierarchy' ? hierarchyPanel(ctx, r) : panel === 'interventions' ? interventionsPanel(ctx, r) : briefPanel(ctx, r));
}
