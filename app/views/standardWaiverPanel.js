/**
 * app/views/standardWaiverPanel.js — `#/standard-work?panel=waivers`, the
 * Temporary Standard Waiver Register (ADR-0212, Schema v166, CSV #154).
 *
 * "The standard says the walk happens at 7. It has not happened as written for
 * three weeks, somebody authorised each week, and nobody has decided whether
 * that is now the job."
 *
 * The view computes NOTHING. Every state, window, share, chain and sentence is
 * a field of the report the reader returned. A figure that cannot be claimed
 * prints a dash with its reason, never a zero. No control here edits a routine,
 * a reason or a stored state: the four acts are a dated request, a dated answer,
 * a dated closing decision and a dated revocation, and each one returns its
 * refusal on the field that caused it rather than saving a near-miss.
 */
import { h, buildForm, openModal, closeAllModals, toast } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { badge, banner, card, stat, table, emptyState } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import {
  STANDARD_WAIVER_BOUNDS,
  STANDARD_WAIVER_CSV_COLUMNS,
  STANDARD_WAIVER_DECISION_KINDS,
  STANDARD_WAIVER_DETAIL_REASONS,
  STANDARD_WAIVER_FRAMEWORKS,
  STANDARD_WAIVER_KINDS,
  STANDARD_WAIVER_LIMITS,
  STANDARD_WAIVER_METHOD,
  STANDARD_WAIVER_REFUSALS,
  STANDARD_WAIVER_REFUSAL_REASONS,
  STANDARD_WAIVER_RULE_ID,
  STANDARD_WAIVER_SETTING_KEYS,
  STANDARD_WAIVER_SETTING_LABELS,
  STANDARD_WAIVER_STATES,
  STANDARD_WAIVER_STATE_BY_KEY,
} from '../core/domain/standardWaiverRegistry.js';

const DIAGRAM_URL = './app/assets/standard-waiver-temporary-departure.jpg';
const L = STANDARD_WAIVER_LIMITS;

const VIEWS = Object.freeze([
  Object.freeze({ key: 'board', label: 'Waivers' }),
  Object.freeze({ key: 'chains', label: 'Renewal chains' }),
  Object.freeze({ key: 'method', label: 'Method & conventions' }),
]);

const dash = (value, suffix = '') => (value === null || value === undefined || value === '' ? '—' : `${value}${suffix}`);
const pct = (value) => (value === null || value === undefined ? '—' : `${value}%`);
const viewFor = (query) => {
  const key = query?.get?.('wview');
  return VIEWS.some((view) => view.key === key) ? key : 'board';
};
const go = (ctx, view) => ctx.navigate(`#/standard-work?panel=waivers&wview=${encodeURIComponent(view)}`);

function refresh(ctx) {
  if (typeof ctx?.refresh === 'function') ctx.refresh();
  else if (typeof ctx?.rerender === 'function') ctx.rerender();
  else if (typeof ctx?.render === 'function') ctx.render();
}

/** A refusal stays on the form, against the field that caused it. */
function finish(ctx, result, message, form = null) {
  if (!result?.ok) {
    if (form && result?.field && form.field(result.field)) form.setErrors({ [result.field]: result.error || '' });
    toast(result?.error || 'The standard-waiver act was refused.', 'bad');
    return false;
  }
  toast(result.warning || message, result.warning ? 'bad' : 'good');
  closeAllModals();
  refresh(ctx);
  return true;
}

const cancelButton = () => h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel');
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00.000Z`) + n * 86400000).toISOString().slice(0, 10);

const routineOptions = (candidates) => candidates.routines
  .filter((routine) => routine.canAsk)
  .map((routine) => ({
    value: routine.routineId,
    label: `${routine.title} — ${routine.cadence}${routine.managerId ? `, authorised by ${routine.managerName}` : ' — nobody can authorise it'}`,
  }));

/* ------------------------------------------------------------------ dialogs */

function requestDialog(ctx) {
  const found = ctx.api.standardWaiverCandidates();
  if (!found?.ok) { toast(found?.error || 'Reading the candidates was refused.', 'bad'); return; }
  const options = routineOptions(found);
  if (!options.length) {
    toast('This seat owes no live routine it may ask a departure for. A waiver is requested by the person who owes the standard.', 'warn');
    return;
  }
  const today = found.today;
  const defaultTo = addDays(today, found.conv.defaultDays - 1);
  const renewalOptions = [{ value: '', label: 'No — this is a new departure' }, ...found.renewalOptions.map((option) => {
    const routine = found.routines.find((row) => row.routineId === option.routineId);
    return { value: option.requestId, label: `${routine ? routine.title : 'A routine'} — its last window ended ${option.endsOn}` };
  })];
  const form = buildForm([
    { name: 'routineId', label: 'Which routine’s standard', type: 'select', required: true, options, value: options[0].value,
      help: 'One routine, one written standard. A routine declared under a line you hold is authorised by that line’s holder and nobody else.' },
    { name: 'kind', label: 'Kind of departure', type: 'select', required: true, options: STANDARD_WAIVER_KINDS.map((kind) => ({ value: kind.key, label: kind.label })), value: STANDARD_WAIVER_KINDS[0].key,
      help: 'Counted, never inferred from your text. A kind is about the WORK, never about a person.' },
    { name: 'reason', label: 'Why the standard cannot be done as written', type: 'textarea', required: true, rows: 3,
      help: `At least ${L.reasonMin} characters. Write what a reader six months from now would need to understand the departure.` },
    { name: 'safeguard', label: 'What stands in for the standard while it is set aside', type: 'textarea', required: true, rows: 2,
      help: `At least ${L.safeguardMin} characters. A departure with no safeguard is an unmonitored gap, and it is refused.` },
    { name: 'from', label: 'First day', type: 'date', required: true, value: today, help: 'A waiver authorises what has not happened yet. A window that starts in the past is refused.' },
    { name: 'to', label: 'Last day', type: 'date', required: true, value: defaultTo, help: `At most ${found.conv.maxDays} days. A departure that needs longer is a change of standard.` },
    { name: 'renewsRequestId', label: 'Does this continue an earlier waiver?', type: 'select', options: renewalOptions, value: '',
      help: 'A renewal must start no later than the day AFTER the earlier window ends. Anything later is a new departure, and the register says so rather than linking it.' },
  ]);
  openModal({
    title: 'Ask to set a written standard aside',
    description: 'Your name goes on the request; the line holder’s name goes on the answer. Nothing departs from a standard until that answer is on the record.',
    size: 'lg',
    body: form.node ?? form,
    footer: [
      cancelButton(),
      h('button', {
        class: 'btn btn-primary', type: 'button', 'data-testid': 'swr-request-save',
        onClick: () => {
          form.clearErrors();
          const v = form.getValues();
          finish(ctx, ctx.api.standardWaiverRequest({
            routineId: v.routineId, kind: v.kind, reason: v.reason, safeguard: v.safeguard,
            from: v.from, to: v.to, renewsRequestId: v.renewsRequestId || null,
          }), 'Request recorded. It is waiting for the line holder, and the standard stands until they answer.', form);
        },
      }, 'Send the request'),
    ],
  });
}

function answerDialog(ctx, requestId = null) {
  const found = ctx.api.standardWaiverCandidates();
  if (!found?.ok) { toast(found?.error || 'Reading the candidates was refused.', 'bad'); return; }
  if (!found.awaitable.length) {
    toast('No request is waiting on this seat. Only the holder of the line a routine is owed under answers a request to depart from it.', 'warn');
    return;
  }
  const options = found.awaitable.map((row) => ({ value: row.requestId, label: `${row.routineTitle} — asked by ${row.ownerName}, ${row.from} to ${row.to}` }));
  const preset = requestId && options.some((option) => option.value === requestId) ? requestId : options[0].value;
  const selected = () => found.awaitable.find((row) => row.requestId === form.getValues().requestId) || found.awaitable[0];
  const form = buildForm([
    { name: 'requestId', label: 'Which request', type: 'select', required: true, options, value: preset,
      help: 'Every one of these was asked by the person who owes the standard, for the line you hold.' },
    { name: 'decision', label: 'Your answer', type: 'select', required: true, value: 'granted',
      options: [{ value: 'granted', label: 'Grant it, for a bounded window' }, { value: 'refused', label: 'Refuse it — the standard stands as written' }] },
    { name: 'basis', label: 'The written basis of your answer', type: 'textarea', required: true, rows: 2,
      help: `At least ${L.basisMin} characters. An authorisation and a refusal are both decisions somebody will have to answer for.` },
    { name: 'from', label: 'First day you authorise', type: 'date', value: '', help: 'Leave blank to accept the window that was asked for. A grant may narrow the request; it can never widen it.' },
    { name: 'to', label: 'Last day you authorise', type: 'date', value: '' },
    { name: 'renewsRequestId', label: 'If this continues an earlier waiver', type: 'select',
      options: [{ value: '', label: 'No — this stands on its own' }, ...found.renewalOptions.map((option) => ({ value: option.requestId, label: `${option.routineId} ended ${option.endsOn}` }))], value: '' },
    { type: 'static', label: 'What you are authorising', value: h('div', { class: 'stack-sm', 'data-testid': 'swr-answer-preview' },
      ...found.awaitable.map((row) => h('div', null,
        h('p', { class: 'small' }, `${row.ownerName} · ${row.kind} · window ${row.from}–${row.to}`),
        h('p', null, row.reason),
        h('p', { class: 'small' }, `Safeguard: ${row.safeguard}`)))) },
  ]);
  openModal({
    title: 'Answer a request to depart from a standard',
    description: 'You are the holder of the line this routine is owed under. The window you grant, the basis you write and your name are the authority — and the register will hold the departure open until a decision closes it.',
    size: 'lg',
    body: form.node ?? form,
    footer: [
      cancelButton(),
      h('button', {
        class: 'btn btn-primary', type: 'button', 'data-testid': 'swr-answer-save',
        onClick: () => {
          form.clearErrors();
          const v = form.getValues();
          finish(ctx, ctx.api.standardWaiverAnswer({
            requestId: v.requestId, decision: v.decision, basis: v.basis,
            from: v.from || undefined, to: v.to || undefined, renewsRequestId: v.renewsRequestId || null,
          }), v.decision === 'granted' ? 'Authority recorded, with its last day.' : 'Refusal recorded. The standard stands exactly as written.', form);
        },
      }, 'Record the answer'),
    ],
  });
}

function decideDialog(ctx, requestId) {
  const found = ctx.api.standardWaiverCandidates();
  if (!found?.ok) { toast(found?.error || 'Reading the candidates was refused.', 'bad'); return; }
  const row = found.closable.find((item) => item.requestId === requestId) || null;
  if (!row) { toast('That waiver is not one this seat can close.', 'warn'); return; }
  const form = buildForm([
    { type: 'static', label: `${row.ownerName} · ${row.routineTitle}`, value: h('p', { class: 'small' }, `Authorised by ${row.authoriserName} for ${row.grantFrom}–${row.grantTo}${row.revoked ? ' (revoked)' : ''}.`) },
    { name: 'kind', label: 'How does it end', type: 'select', required: true, value: 'restored',
      options: STANDARD_WAIVER_DECISION_KINDS.map((kind) => ({ value: kind.key, label: kind.label })), help: 'Both are checkable: a retirement is refused unless the routine’s own retirement is on the record on or before the day you name.' },
    { name: 'decidedOn', label: 'The day it ended', type: 'date', required: true, value: found.today,
      help: 'The day the standard was back in force (or the routine was retired). Not before the departure began, never in the future.' },
    { name: 'basis', label: 'The written basis', type: 'textarea', required: true, rows: 2, help: `At least ${L.basisMin} characters.` },
  ]);
  openModal({
    title: 'Close a departure',
    description: 'A departure does not end because its last day passed. It ends on the day somebody records that the standard is back in force.',
    body: form.node ?? form,
    footer: [
      cancelButton(),
      h('button', {
        class: 'btn btn-primary', type: 'button', 'data-testid': 'swr-decide-save',
        onClick: () => {
          form.clearErrors();
          const v = form.getValues();
          finish(ctx, ctx.api.standardWaiverDecide({ requestId, kind: v.kind, decidedOn: v.decidedOn, basis: v.basis }), 'Decision recorded. The departure now has an end on the record.', form);
        },
      }, 'Record the decision'),
    ],
  });
}

function revokeDialog(ctx, requestId) {
  const form = buildForm([
    { name: 'reason', label: 'Why the authority is withdrawn', type: 'textarea', required: true, rows: 2, help: `At least ${L.basisMin} characters. The standard is back in force from today.` },
  ]);
  openModal({
    title: 'Withdraw an authority before its last day',
    description: 'A revocation ends the departure today and keeps its history. A window that already ended is closed by a decision, not withdrawn.',
    body: form.node ?? form,
    footer: [
      cancelButton(),
      h('button', {
        class: 'btn btn-primary', type: 'button', 'data-testid': 'swr-revoke-save',
        onClick: () => {
          form.clearErrors();
          finish(ctx, ctx.api.standardWaiverRevoke({ requestId, reason: form.getValues().reason }), 'Authority revoked. The standard is back in force from today.', form);
        },
      }, 'Revoke it'),
    ],
  });
}

function briefDialog(ctx) {
  const result = ctx.api.standardWaiverBriefText();
  if (!result?.ok) { toast(result?.error || 'The brief was refused.', 'bad'); return; }
  openModal({
    title: 'Waiver brief',
    size: 'lg',
    body: h('pre', { class: 'brief-text', tabindex: '0', 'data-testid': 'swr-brief' }, result.text),
    footer: [cancelButton()],
  });
}

function exportCsv(ctx) {
  const result = ctx.api.standardWaiverCsvRows();
  if (!result?.ok) { toast(result?.error || 'The export was refused.', 'bad'); return; }
  downloadText('standard-work-waivers.csv', serializeCsv(STANDARD_WAIVER_CSV_COLUMNS.map((key) => ({ key, header: key })), result.rows));
}

function conventionsForm(ctx, report, candidates) {
  const conv = report.conventions;
  const form = buildForm([
    { name: STANDARD_WAIVER_SETTING_KEYS.defaultDays, label: STANDARD_WAIVER_SETTING_LABELS.defaultDays, type: 'number', value: String(conv.defaultDays) },
    { name: STANDARD_WAIVER_SETTING_KEYS.maxDays, label: STANDARD_WAIVER_SETTING_LABELS.maxDays, type: 'number', value: String(conv.maxDays) },
    { name: STANDARD_WAIVER_SETTING_KEYS.renewalReviewAfter, label: STANDARD_WAIVER_SETTING_LABELS.renewalReviewAfter, type: 'number', value: String(conv.renewalReviewAfter) },
    { name: STANDARD_WAIVER_SETTING_KEYS.askDueDays, label: STANDARD_WAIVER_SETTING_LABELS.askDueDays, type: 'number', value: String(conv.askDueDays) },
    { name: STANDARD_WAIVER_SETTING_KEYS.horizonDays, label: STANDARD_WAIVER_SETTING_LABELS.horizonDays, type: 'number', value: String(conv.horizonDays) },
    { name: STANDARD_WAIVER_SETTING_KEYS.minOwedSlots, label: STANDARD_WAIVER_SETTING_LABELS.minOwedSlots, type: 'number', value: String(conv.minOwedSlots) },
    { name: STANDARD_WAIVER_SETTING_KEYS.autoPropagate, label: STANDARD_WAIVER_SETTING_LABELS.autoPropagate, type: 'select', value: conv.autoPropagate ? 'on' : 'off', options: [{ value: 'on', label: 'Raise asks' }, { value: 'off', label: 'Do not raise asks (a pause permit governs this switch)' }] },
  ]);
  return h('div', { class: 'stack-sm' }, form.node ?? form, h('div', { class: 'row-actions' },
    h('button', {
      class: 'btn btn-primary', type: 'button', 'data-testid': 'swr-conventions-save',
      onClick: () => {
        form.clearErrors();
        const v = form.getValues();
        const patch = {};
        for (const key of Object.keys(STANDARD_WAIVER_SETTING_KEYS).map((name) => STANDARD_WAIVER_SETTING_KEYS[name])) {
          if (v[key] === undefined) continue;
          patch[key] = key === STANDARD_WAIVER_SETTING_KEYS.autoPropagate ? v[key] === 'on' : Number(v[key]);
        }
        finish(ctx, ctx.api.standardWaiverSetConventions(patch), 'Conventions saved. Every derived figure re-reads under them on the next render.', form);
      },
    }, 'Save conventions'),
    h('button', { class: 'btn btn-small', type: 'button', 'data-testid': 'swr-scan', onClick: () => finish(ctx, ctx.api.standardWaiverScan(), 'Scan run on the shared spine.') }, `Run ${STANDARD_WAIVER_RULE_ID}`),
    candidates ? null : null,
  ));
}

/* ------------------------------------------------------------------- views */

function boardView(ctx, report, candidates) {
  const t = report.totals;
  const statCards = h('div', { class: 'stat-grid' },
    stat({ label: 'Routines in view', value: t.routinesN, hint: `${t.routinesNeverWaivedN} never waived · ${t.routinesClearN} standard in force` }),
    stat({ label: 'Waived today', value: t.routinesWaivedN, tone: t.routinesWaivedN ? 'warn' : '', hint: 'A live authority covers today' }),
    stat({ label: 'Suspended by silence', value: t.routinesLapsedN, tone: t.routinesLapsedN ? 'bad' : '', hint: 'Ended with no decision — the exception outliving its authority' }),
    stat({ label: 'Awaiting the line holder', value: t.requestedN, hint: `${t.refusedN} refused · ${t.lapsedRequestsN} lapsed unanswered` }),
    stat({ label: 'Renewal reviews due', value: t.chainReviewDueN, tone: t.chainReviewDueN ? 'warn' : '', hint: `Chains of ${report.conventions.renewalReviewAfter}+ unbroken renewals` }),
    stat({ label: 'Closed owed slots waived', value: t.owedSlotsN ? `${t.waivedSlotsN} / ${t.owedSlotsN}` : '—', hint: t.waivedSharePct === null ? 'Share withheld (floor)' : `${t.waivedSharePct}% of closed slots fell wholly inside an authority` }),
  );

  const attention = report.attention.length
    ? card({
      title: 'What the record is asking for',
      subtitle: 'Two different conditions, two different addressees: a lapse is closed by the authority that granted it; a chain is reviewed above that authority.',
      body: h('div', { class: 'stack-sm' }, ...report.attention.map((row) => banner({
        tone: row.kind === 'waiver-lapsed' ? 'bad' : 'warn',
        title: row.title,
        body: row.says,
        actions: row.kind === 'waiver-lapsed' && candidates.closable.some((item) => item.requestId === row.requestId)
          ? [h('button', { class: 'btn btn-small', type: 'button', onClick: () => decideDialog(ctx, row.requestId) }, 'Close it')]
          : row.kind === 'chain-review'
            ? [h('button', { class: 'btn btn-small ghost', type: 'button', onClick: () => ctx.navigate('#/standard-work') }, 'Open standard work')]
            : [],
      }))),
    })
    : banner({ tone: 'good', title: 'Nothing here needs a decision today', body: 'No authority ended unclosed and no renewal chain has reached the review threshold.' });

  const routineRows = report.routines.map((routine) => ({
    routine: h('div', null, h('strong', null, routine.title), h('p', { class: 'small' }, `${routine.ownerName} · ${routine.cadence}${routine.retiredOn ? ` · retired ${routine.retiredOn}` : ''}`)),
    line: h('div', null, h('span', null, routine.lineLabel || '—'), h('p', { class: 'small' }, routine.managerId ? `holder: ${routine.managerName}` : routine.authoritySays || 'no holder')),
    state: badge(routine.stateLabel, routine.stateTone, routine.stateSays),
    coverage: h('div', null, h('span', null, routine.coverageDaysN ? `${routine.coverageDaysN} day(s)` : '—'), h('p', { class: 'small' }, routine.waivedShareWithheld ? routine.waivedShareReason : `${routine.waivedSlotsN} of ${routine.owedSlotsN} closed slot(s)`)),
    share: routine.waivedShareWithheld ? '—' : pct(routine.waivedSharePct),
    chain: routine.longestChainN ? `${routine.longestChainN}${routine.chainReviewDue ? ' · review due' : ''}` : '—',
    until: routine.todayCovered ? dash(routine.liveUntil) : '—',
  }));

  const requestRows = report.requests.map((row) => ({
    routine: h('div', null, h('strong', null, row.routineTitle), h('p', { class: 'small' }, `${row.ownerName} · ${row.kindLabel}`)),
    window: h('div', null, h('span', null, `${row.requestedFrom} → ${row.requestedTo}`), h('p', { class: 'small' }, row.grantFrom ? `authorised ${row.grantFrom} → ${row.grantTo}` : 'not authorised')),
    state: badge(row.stateLabel, row.stateTone, row.stateSays),
    holder: row.authoriserId ? `${row.authoriserName}` : '—',
    safeguard: h('p', { class: 'small' }, row.safeguard),
    closed: row.decidedOn ? `${row.decisionLabel} on ${row.decidedOn}` : row.revokedOn ? `revoked ${row.revokedOn}` : '—',
    acts: h('div', { class: 'row-actions' },
      ['expired-unrestored', 'in-force', 'renewed', 'pending-start'].includes(row.stateKey) && candidates.closable.some((item) => item.requestId === row.id)
        ? h('button', { class: 'btn btn-small', type: 'button', onClick: () => decideDialog(ctx, row.id) }, 'Close')
        : null,
      row.stateKey === 'in-force' && candidates.closable.some((item) => item.requestId === row.id && item.canRevoke)
        ? h('button', { class: 'btn btn-small ghost', type: 'button', onClick: () => revokeDialog(ctx, row.id) }, 'Revoke')
        : null,
      row.stateKey === 'requested' && candidates.awaitable.some((item) => item.requestId === row.id)
        ? h('button', { class: 'btn btn-small', type: 'button', onClick: () => answerDialog(ctx, row.id) }, 'Answer')
        : null),
  }));

  return h('div', { class: 'stack' },
    statCards,
    attention,
    card({
      title: 'Routines and their written standards',
      subtitle: `Drawn from leader standard work; a departure is counted against the routine it sets aside. Reading horizon ${report.periods.horizonFrom} – ${report.periods.today}.`,
      body: table({
        caption: 'Every routine in view with its authority, derived state, coverage and renewal chain',
        columns: [
          { key: 'routine', label: 'Routine' }, { key: 'line', label: 'Line & holder' }, { key: 'state', label: 'State' },
          { key: 'coverage', label: 'Waived days' }, { key: 'share', label: 'Closed-slot share' }, { key: 'chain', label: 'Longest chain' }, { key: 'until', label: 'Covered until' },
        ],
        rows: routineRows,
        emptyMessage: 'No routine is in this seat’s reach, so there is no written standard to depart from here.',
      }),
    }),
    card({
      title: 'Requests, answers and decisions',
      subtitle: 'The whole record, newest request first. A state is derived from these rows on every read; nothing on this screen is stored.',
      body: table({
        caption: 'Every request in view with its answer, window, safeguard and closing decision',
        columns: [
          { key: 'routine', label: 'Routine' }, { key: 'window', label: 'Window asked / granted' }, { key: 'state', label: 'State' },
          { key: 'holder', label: 'Line holder' }, { key: 'safeguard', label: 'Safeguard' }, { key: 'closed', label: 'Closed' }, { key: 'acts', label: 'Acts' },
        ],
        rows: requestRows,
        emptyMessage: 'No waiver has ever been requested here. That is a fact about the record, not a clearance of the work.',
      }),
    }),
    card({
      title: 'Integrity of this reading',
      subtitle: 'Reconciliation and audit are different claims and are never collapsed into one reassuring word.',
      body: h('div', { class: 'stack-sm' },
        h('p', null, `States sum to the requests printed: ${t.statesSum} = ${t.requestsN} — ${t.requestsReconcile ? 'yes' : 'NO'}. The granted total reconciles against the state counts: ${t.balances ? 'yes' : 'NO'}.`),
        h('p', null, `The audit is ${t.auditClean ? 'clean' : 'NOT clean'}: ${t.selfAuthorisedN} self-authorised grant(s), ${t.authorityMovedN} live authority(ies) whose line holder has since changed, ${t.orphanRenewalsN} renewal link(s) that do not resolve, ${t.answeredTwiceN} request(s) with more than one answer, ${t.duplicateDecisionsN} with more than one decision.`),
        h('p', { class: 'small' }, report.scope === 'workspace'
          ? 'This reading covers the whole workspace.'
          : `${t.outsideReachN} routine(s) outside this seat’s reach are not counted. Every figure above is over this seat’s span, and the export says so in its own column.`),
        report.refusals.length ? banner({ tone: 'warn', title: 'What this reading refused to claim', body: report.refusals.join(' ') }) : null,
        h('p', { class: 'small' }, 'A waiver records authority over a departure and the day it ended. It never records whether the departure was wise, and it never rates a person.'),
      ),
    }),
  );
}

function chainsView(report) {
  const t = report.totals;
  const rows = report.routines.filter((routine) => routine.requestsN > 0).map((routine) => ({
    routine: h('div', null, h('strong', null, routine.title), h('p', { class: 'small' }, `${routine.ownerName} · ${routine.cadence}`)),
    chains: routine.chainsN,
    longest: routine.longestChainN ? `${routine.longestChainN}` : '—',
    span: routine.chainStart ? `${routine.chainStart} → ${routine.chainEnd}` : '—',
    review: routine.chainReviewDue ? badge('review due', 'warn', `At or beyond ${routine.chainReviewAfter} unbroken renewals`) : '—',
    broken: routine.chainBroken ? badge('broken link', 'bad', 'A renewal link that does not resolve or is not adjacent') : '—',
    waivers: routine.requests.filter((row) => ['in-force', 'renewed', 'pending-start', 'expired-unrestored', 'restored', 'revoked', 'ended-with-routine'].includes(row.stateKey)).length,
  }));
  return h('div', { class: 'stack' },
    banner({
      tone: 'info',
      title: 'Why a chain is the number that matters',
      body: 'Five separate departures are five decisions. One departure renewed five times is a different fact about the work: nothing was back to standard in between. The register counts only CONTIGUOUS links — a renewal that starts no later than the day after the previous window ends — and a link that fails that test breaks the chain and is counted as broken rather than smoothed over.',
    }),
    h('div', { class: 'stat-grid' },
      stat({ label: 'Chains on the record', value: t.chainsN }),
      stat({ label: 'Longest chain', value: t.longestChainN }),
      stat({ label: 'Chains at or beyond review', value: t.chainReviewDueN, tone: t.chainReviewDueN ? 'warn' : '' }),
      stat({ label: 'Broken links', value: t.orphanRenewalsN, tone: t.orphanRenewalsN ? 'bad' : '' }),
    ),
    card({
      title: 'Chains by routine',
      subtitle: `The review condition fires at ${report.conventions.renewalReviewAfter} unbroken renewals and goes to the seat ABOVE the person who kept renewing, on their home line — never to the renewing manager themselves, and never to a peer line.`,
      body: table({
        caption: 'Renewal chains per routine',
        columns: [{ key: 'routine', label: 'Routine' }, { key: 'chains', label: 'Chains' }, { key: 'longest', label: 'Longest' }, { key: 'span', label: 'Latest open chain' }, { key: 'waivers', label: 'Granted waivers' }, { key: 'review', label: 'Review' }, { key: 'broken', label: 'Continuity' }],
        rows,
        emptyMessage: 'No departure has been requested, so no chain exists.',
      }),
    }),
  );
}

function methodView(ctx, report, candidates) {
  return h('div', { class: 'stack' },
    card({
      title: 'The method, in the order it is applied',
      body: h('ol', { class: 'stack-sm' }, ...STANDARD_WAIVER_METHOD.map((line) => h('li', null, line))),
    }),
    card({
      title: 'Frameworks applied',
      subtitle: 'Named because each one is a design decision above, not a decoration.',
      body: h('div', { class: 'stack-sm' }, ...STANDARD_WAIVER_FRAMEWORKS.map((framework) => h('div', null,
        h('p', null, h('strong', null, framework.name)),
        h('p', { class: 'small' }, framework.applies)))),
    }),
    card({
      title: 'Conventions',
      subtitle: 'A waiver is bounded by the maximum, and the review threshold is what turns a temporary departure into a question about the standard.',
      body: conventionsForm(ctx, report, candidates),
    }),
    card({
      title: 'Every refusal this register can return',
      subtitle: 'Each refusal is a control. A request that fails one is not stored as a near-miss.',
      body: table({
        caption: 'Closed list of refusals with their sentences',
        columns: [{ key: 'key', label: 'Refusal' }, { key: 'says', label: 'What it means' }],
        rows: STANDARD_WAIVER_REFUSALS.map((key) => ({ key: h('code', null, key), says: STANDARD_WAIVER_REFUSAL_REASONS[key] })),
      }),
    }),
    card({
      title: 'Disclosure',
      body: h('p', null, STANDARD_WAIVER_DETAIL_REASONS.visible || 'Every seat reads the routines in its span with their reasons and safeguards; a seat outside the span is not shown the row at all, and the export is identity-free.'),
    }),
    card({
      title: 'The illustration',
      body: h('figure', { class: 'figure' },
        h('img', { src: DIAGRAM_URL, alt: 'A written standard on a board, a dated exception card clipped beside it, and the card being removed on the day the standard is restored', loading: 'lazy' }),
        h('figcaption', { class: 'small' }, 'Generated method illustration, not workspace data.')),
    }),
    card({
      title: 'States this register derives',
      body: table({
        caption: 'Closed list of derived states',
        columns: [{ key: 'key', label: 'State' }, { key: 'says', label: 'What it means' }],
        rows: STANDARD_WAIVER_STATES.map((key) => ({ key: h('code', null, key), says: h('div', null, h('strong', null, STANDARD_WAIVER_STATE_BY_KEY[key].label), h('p', { class: 'small' }, STANDARD_WAIVER_STATE_BY_KEY[key].says)) })),
      }),
    }),
  );
}

/* ------------------------------------------------------------------ render */

export function renderStandardWaiverPanel(ctx) {
  const result = ctx.api.standardWaiverReport();
  if (!result?.ok) {
    return banner({ tone: 'warn', title: 'The waiver register was refused', body: result?.error || 'The read was refused.' });
  }
  const { report } = result;
  const candidates = ctx.api.standardWaiverCandidates();
  const view = viewFor(ctx.query);
  const safeCandidates = candidates?.ok ? candidates : { routines: [], awaitable: [], closable: [], renewalOptions: [] };
  const t = report.totals;
  return h('div', { class: 'stack', 'data-testid': 'standard-waivers-panel' },
    h('div', { class: 'row-actions' },
      h('button', { class: 'btn btn-primary small', type: 'button', 'data-testid': 'swr-request', onClick: () => requestDialog(ctx) }, 'Ask to set a standard aside'),
      safeCandidates.awaitable.length ? h('button', { class: 'btn small', type: 'button', 'data-testid': 'swr-answer', onClick: () => answerDialog(ctx) }, `Answer ${safeCandidates.awaitable.length} request(s)`) : null,
      h('button', { class: 'btn ghost small', type: 'button', 'data-testid': 'swr-csv', onClick: () => exportCsv(ctx) }, 'Export CSV'),
      h('button', { class: 'btn ghost small', type: 'button', 'data-testid': 'swr-brief-open', onClick: () => briefDialog(ctx) }, 'Brief'),
      badge(t.figuresComplete ? 'whole record' : 'seat span', 'neutral', t.figuresComplete ? 'This reading covers every routine on the record' : `${t.outsideReachN} routine(s) outside this seat's reach are not counted`),
      t.auditClean ? badge('reconciles · audit clean', 'good') : badge('audit not clean', 'bad'),
    ),
    h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Waiver views' },
      ...VIEWS.map((item) => h('button', {
        class: `tab ${item.key === view ? 'is-active' : ''}`, type: 'button', role: 'tab',
        'aria-selected': item.key === view ? 'true' : 'false', onClick: () => go(ctx, item.key),
      }, item.label))),
    view === 'chains' ? chainsView(report) : view === 'method' ? methodView(ctx, report, safeCandidates) : boardView(ctx, report, safeCandidates),
  );
}

export default renderStandardWaiverPanel;
