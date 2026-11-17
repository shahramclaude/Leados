/**
 * app/views/mutualAid.js — `#/mutual-aid`, the Mutual-Aid Activation &
 * Resource-Commitment Register (ADR-0244, Schema v198).
 *
 * ONE reader (`buildMutualAid`) stands behind every state, validity, days-overdue
 * figure, days-late figure, coverage verdict, shortfall and count this page
 * prints. The page formats what the reader returned; it computes no validity, no
 * promise and no verdict of its own.
 *
 * THE FIVE THINGS THIS SCREEN KEEPS APART
 *  - the bilateral agreement a request is made under, and whether it was live;
 *  - the request, its declared validity, and whether the partner ever answered;
 *  - the partner's acceptance as its own cited act, with the promise it made;
 *  - the arrival compared against the promise, line by line, with exact
 *    shortfalls and exact days late;
 *  - the withdrawal that ends the help and the release that ends the
 *    commitment, in order, with the exact days past the declared grace.
 *
 * WHAT THE SCREEN REFUSES TO SAY. It never reads a request as a promise, never
 * treats a promise whose day has passed as help that is on its way, never
 * sums a shortfall into a percentage, and never scores a partner, an external
 * hand or a requesting line.
 *
 * DISCLOSURE LADDER. Above rank 3 the reader withholds partner names, agreement
 * references, subjects, confirmations, external hands and notes, and the page
 * prints that narrowing as a rendering contract rather than an authentication
 * boundary — this workspace has no authentication, and implying otherwise would
 * be the lie that hurts people.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { pageHeader, card, stat, banner, tabs, emptyState, table } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { exportWorkspaceCsv } from '../core/csv.js';
import {
  MAA_CSV_SCOPE,
  MAA_HREF,
  MAA_LIMITS,
  MAA_METHOD,
  MAA_REQUEST_KINDS,
  MAA_SECTION_TITLES,
} from '../core/domain/mutualAidRegistry.js';

const L = MAA_LIMITS;
const PANELS = [
  { key: 'board', label: MAA_SECTION_TITLES.board },
  { key: 'requests', label: MAA_SECTION_TITLES.requests },
  { key: 'lines', label: MAA_SECTION_TITLES.lines },
  { key: 'method', label: MAA_SECTION_TITLES.method },
];

const TONE = { bad: 'bad', warn: 'warn', good: 'good', neutral: 'neutral' };
const options = (rows, { blank = null } = {}) => [
  ...(blank ? [{ value: '', label: blank }] : []),
  ...rows.map((row) => ({ value: row.value, label: row.label })),
];

/** Parse the resource-line textarea: one `kind quantity` per line. */
function parseResourceLines(value) {
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/);
      return { kind: parts[0], quantity: Number(parts[1]) };
    })
    .filter((row) => row.kind && Number.isInteger(row.quantity));
}

const formatLines = (lines) => (lines && lines.length
  ? lines.map((line) => `${line.kind} × ${line.quantity}`).join(', ')
  : '—');

function button(label, onClick, { primary = false, testid = null } = {}) {
  return h('button', {
    type: 'button',
    class: `btn btn-small ${primary ? 'btn-primary' : 'btn-ghost'}`,
    ...(testid ? { 'data-testid': testid } : {}),
    onClick,
  }, label);
}

function stateBadge(state, testid) {
  return h('span', {
    class: `badge badge-${TONE[state.tone] || 'neutral'}`,
    title: state.says,
    ...(testid ? { 'data-testid': testid } : {}),
  }, state.label);
}

const dayLabel = (value) => (typeof value === 'string' && value.length >= 10 ? value.slice(0, 10) : '—');
const daysLabel = (n) => (n === null || n === undefined ? '—' : n === 0 ? 'today' : n > 0 ? `${n} day${n === 1 ? '' : 's'} ago` : `in ${-n} day${n === -1 ? '' : 's'}`);

/* ------------------------------------------------------------------ dialogs */

/** One submit path for every dialog: refuse, show the field error, or close. */
function submitVia(form, call, { success, onDone }) {
  form.clearErrors();
  const result = call(form.getValues());
  if (!result?.ok) {
    if (result?.field) form.setFieldError(result.field, result.error || '');
    toast(result?.error || 'The act was refused.', 'bad');
    return;
  }
  closeAllModals();
  toast(success(result), 'good');
  onDone?.();
}

function dialog({ title, description, fields, call, success, onDone }) {
  const form = buildForm(fields);
  openModal({
    title,
    description,
    body: form.node,
    footer: [
      button('Cancel', () => closeAllModals()),
      button('Record', () => submitVia(form, call, { success, onDone }), { primary: true }),
    ],
  });
}

function declareAgreementDialog(ctx, local, onDone) {
  dialog({
    title: 'Declare a bilateral agreement',
    description: 'With whom help may be asked for, on what written reference, and until when.',
    fields: [
      { name: 'partnerOrg', label: 'Partner organisation', type: 'text', required: true, help: `At least ${L.nameMin} characters. The organisation whose name the counterparty holds.` },
      { name: 'agreementRef', label: 'The written agreement', type: 'text', required: true, help: `At least ${L.agreementRefMin} characters: the agreement’s name and the clause. A partnership with no written reference is a request nobody was bound to answer.` },
      { name: 'agreedOn', label: 'Day it was agreed (YYYY-MM-DD)', type: 'text', required: true },
      { name: 'expiresOn', label: 'Day it ends (optional, may be future)', type: 'text' },
      { name: 'scopeNote', label: 'Scope note (optional)', type: 'textarea', rows: 2, help: 'What the agreement covers, in one line.' },
    ],
    call: (values) => ctx.api.maaDeclareAgreement(values),
    success: () => 'Bilateral agreement declared.',
    onDone,
  });
}

function openRequestDialog(ctx, local, onDone) {
  dialog({
    title: 'Request help',
    description: 'Under a live agreement, with a declared validity and the lines the request is made from.',
    fields: [
      { name: 'agreementId', label: 'Agreement', type: 'select', required: true, value: local.agreements?.[0]?.id || '', options: options(local.agreements?.filter((row) => row.termState === 'open-term') || [], { blank: 'Choose an agreement' }) },
      { name: 'subject', label: 'What help is being asked for', type: 'text', required: true, help: `At least ${L.subjectMin} characters.` },
      { name: 'kind', label: 'Kind of help', type: 'select', required: true, options: options(MAA_REQUEST_KINDS.map((row) => ({ value: row.key, label: row.label }))) },
      { name: 'validityDays', label: 'Days the request stays open awaiting an answer', type: 'number', min: L.validityMin, max: L.validityMax, required: true, help: 'Declared per request. The register holds no default validity.' },
      { name: 'requestingLineIds', label: 'Requesting line(s) — comma-separated ids', type: 'text', required: true, help: 'The reporting lines the request is made from. The joint seat above them answers for it.' },
      { name: 'askedLines', label: 'What is being asked for — one `kind quantity` per line', type: 'textarea', rows: 4, required: true, help: 'For example: personnel 2 / pump 1. Each line must be a kind and a whole quantity.' },
    ],
    call: (values) => ctx.api.maaOpenRequest({
      ...values,
      requestingLineIds: String(values.requestingLineIds || '').split(',').map((part) => part.trim()).filter(Boolean),
      askedLines: parseResourceLines(values.askedLines),
    }),
    success: () => 'Request opened under the agreement.',
    onDone,
  });
}

function recordAcceptanceDialog(ctx, local, requestId, onDone) {
  const request = (local.requests || []).find((row) => row.id === requestId);
  dialog({
    title: 'Record the partner’s acceptance',
    description: 'The partner’s own dated act, cited to its written confirmation, with what it promised and when.',
    fields: [
      { name: 'requestId', label: 'Request', type: 'select', required: true, value: requestId, options: options((local.requests || []).filter((row) => !row.hasAcceptance).map((row) => ({ value: row.id, label: row.subject })), { blank: 'Choose a request' }) },
      { name: 'acceptedOn', label: 'Day the partner accepted (YYYY-MM-DD)', type: 'text', required: true },
      { name: 'confirmationRef', label: 'The partner’s written confirmation', type: 'text', required: true, help: `At least ${L.confirmationRefMin} characters: the message, the call log reference, the letter. An acceptance with no confirmation is a promise inferred from a request.` },
      { name: 'acceptingHand', label: 'The hand that accepted on the partner’s side', type: 'text', required: true },
      { name: 'promisedArrivalOn', label: 'Day the help is promised to arrive (YYYY-MM-DD, may be future)', type: 'text', required: true },
      { name: 'promisedLines', label: 'What was promised — one `kind quantity` per line', type: 'textarea', rows: 4, required: true, help: 'Compared line by line against what was asked for.' },
    ],
    call: (values) => ctx.api.maaRecordAcceptance({
      ...values,
      promisedLines: parseResourceLines(values.promisedLines),
    }),
    success: () => 'Acceptance recorded with its confirmation.',
    onDone,
  });
}

function recordArrivalDialog(ctx, local, acceptanceId, onDone) {
  dialog({
    title: 'Record the arrival',
    description: 'What actually arrived, line by line, against the promise.',
    fields: [
      { name: 'acceptanceId', label: 'Acceptance', type: 'select', required: true, value: acceptanceId, options: options((local.acceptances || []).filter((row) => !row.hasArrival).map((row) => ({ value: row.id, label: `accepted ${row.acceptedOn}, promised ${row.promisedArrivalOn}` })), { blank: 'Choose an acceptance' }) },
      { name: 'arrivedOn', label: 'Day the help arrived (YYYY-MM-DD)', type: 'text', required: true },
      { name: 'arrivedLines', label: 'What arrived — one `kind quantity` per line', type: 'textarea', rows: 4, required: true, help: 'Compared line by line against the promise; a shortfall prints with the exact numbers.' },
      { name: 'note', label: 'Note (optional)', type: 'textarea', rows: 2 },
    ],
    call: (values) => ctx.api.maaRecordArrival({
      ...values,
      arrivedLines: parseResourceLines(values.arrivedLines),
    }),
    success: () => 'Arrival recorded against the promise.',
    onDone,
  });
}

function recordWithdrawalDialog(ctx, local, acceptanceId, onDone) {
  dialog({
    title: 'Record the withdrawal',
    description: 'The partner’s help has left. The release that ends the commitment is owed after it.',
    fields: [
      { name: 'acceptanceId', label: 'Acceptance', type: 'select', required: true, value: acceptanceId, options: options((local.acceptances || []).filter((row) => !row.hasWithdrawal).map((row) => ({ value: row.id, label: `accepted ${row.acceptedOn}` })), { blank: 'Choose an acceptance' }) },
      { name: 'withdrawnOn', label: 'Day the help left (YYYY-MM-DD)', type: 'text', required: true },
      { name: 'note', label: 'Note (optional)', type: 'textarea', rows: 2 },
    ],
    call: (values) => ctx.api.maaRecordWithdrawal(values),
    success: () => 'Withdrawal recorded; the release is now owed.',
    onDone,
  });
}

function recordReleaseDialog(ctx, local, acceptanceId, onDone) {
  dialog({
    title: 'Record the release',
    description: 'The commitment ends. It can only be dated on or after the day the help left.',
    fields: [
      { name: 'acceptanceId', label: 'Acceptance', type: 'select', required: true, value: acceptanceId, options: options((local.acceptances || []).filter((row) => row.hasWithdrawal && !row.hasRelease).map((row) => ({ value: row.id, label: `accepted ${row.acceptedOn}` })), { blank: 'Choose a withdrawn commitment' }) },
      { name: 'releasedOn', label: 'Day the commitment is released (YYYY-MM-DD)', type: 'text', required: true },
      { name: 'note', label: 'Note (optional)', type: 'textarea', rows: 2 },
    ],
    call: (values) => ctx.api.maaRecordRelease(values),
    success: () => 'Release recorded; the commitment is closed.',
    onDone,
  });
}

function cancelRequestDialog(ctx, local, requestId, onDone) {
  dialog({
    title: 'Cancel the request',
    description: 'Closes a request that was still awaiting an answer. A request that has been accepted cannot be cancelled.',
    fields: [
      { name: 'requestId', label: 'Request', type: 'select', required: true, value: requestId, options: options((local.requests || []).filter((row) => !row.hasAcceptance && !row.cancelledOn).map((row) => ({ value: row.id, label: row.subject })), { blank: 'Choose a request' }) },
      { name: 'cancelledOn', label: 'Day of cancellation (YYYY-MM-DD)', type: 'text', required: true },
    ],
    call: (values) => ctx.api.maaCancelRequest(values),
    success: () => 'Request cancelled before any acceptance.',
    onDone,
  });
}

function conventionsDialog(ctx, report, onDone) {
  dialog({
    title: 'Register conventions',
    description: 'The release grace and the privacy floor. Neither is fitted from the record.',
    fields: [
      { name: 'maaReleaseGraceDays', label: 'Days after a withdrawal to release the commitment', type: 'number', min: 0, max: 60, required: true, value: report.conventions.maaReleaseGraceDays },
      { name: 'maaPrivacyFloor', label: 'Privacy floor for the per-state export', type: 'number', min: 2, max: 20, required: true, value: report.conventions.maaPrivacyFloor },
    ],
    call: (values) => ctx.api.maaSetConventions({
      patch: {
        maaReleaseGraceDays: Number(values.maaReleaseGraceDays),
        maaPrivacyFloor: Number(values.maaPrivacyFloor),
      },
    }),
    success: () => 'Conventions re-declared.',
    onDone,
  });
}

/* ------------------------------------------------------------------- panels */

function summaryCard(report) {
  return card({
    title: 'What the register is carrying',
    subtitle: 'Every figure is the reader’s own; nothing is stored and nothing is rounded.',
    body: h('div', { class: 'stat-grid' },
      stat({ label: 'Agreements', value: String(report.totals.agreements), hint: `${report.totals.liveAgreements} live · ${report.totals.expiredAgreements} expired` }),
      stat({ label: 'Requests', value: String(report.totals.requests), hint: `${report.totals.awaitingAcceptanceN} awaiting an answer` }),
      stat({ label: 'Window closed, no acceptance', value: String(report.totals.requestLapsedN), tone: report.totals.requestLapsedN ? 'bad' : '', hint: 'A request is never a promise', action: h('span', { 'data-testid': 'maa-count-lapsed', class: 'sr-only' }, String(report.totals.requestLapsedN)) }),
      stat({ label: 'Promised help not arrived', value: String(report.totals.notArrivedOverdueN), tone: report.totals.notArrivedOverdueN ? 'bad' : '', hint: 'Past the promised day', action: h('span', { 'data-testid': 'maa-count-not-arrived', class: 'sr-only' }, String(report.totals.notArrivedOverdueN)) }),
      stat({ label: 'Release owed', value: String(report.totals.withdrawnN), tone: report.totals.withdrawnN ? 'warn' : '', hint: 'Help left, commitment open', action: h('span', { 'data-testid': 'maa-count-withdrawn', class: 'sr-only' }, String(report.totals.withdrawnN)) }),
      stat({ label: 'Acts out of order', value: String(report.totals.breachesN), tone: report.totals.breachesN ? 'bad' : '', hint: 'Kept and printed, never repaired', action: h('span', { 'data-testid': 'maa-count-breaches', class: 'sr-only' }, String(report.totals.breachesN)) }),
    ),
  });
}

function claimsBanners(report) {
  const nodes = [];
  if (!report.figuresComplete) {
    nodes.push(banner({
      tone: 'warn',
      title: 'The figures on this page are not complete',
      body: report.incompleteReasons.join(' '),
    }));
  }
  if (report.breaches.length) {
    nodes.push(banner({
      tone: 'bad',
      title: `${report.breaches.length} request(s) carry an act dated out of order`,
      body: 'The commands cannot create these. They arrived in the record — imported or hand-edited — and the register keeps them rather than hiding them. Each one prints the exact days by which the act preceded the duty.',
    }));
  }
  nodes.push(banner({
    tone: 'info',
    title: 'Two claims, reported apart',
    body: `${report.balances.statesReconcile ? 'The printed state counts re-add to the requests they summarise.' : 'The printed state counts do NOT re-add to the requests.'} ${report.figuresComplete ? 'Every figure here is complete.' : 'Some figures are incomplete for the reasons above.'} They are different facts and neither one is folded into the other.`,
  }));
  return h('div', { class: 'stack' }, ...nodes);
}

function boardView(report) {
  const agreementRows = report.agreementRows.length
    ? table({
      caption: 'Bilateral agreements',
      columns: [
        { label: 'Partner', render: (row) => (report.detailed ? row.agreement.partnerOrg : 'withheld at this disclosure level') },
        { label: 'Written reference', render: (row) => (report.detailed ? row.agreement.agreementRef : 'withheld') },
        { label: 'Agreed', key: 'agreedOn' },
        { label: 'Ends', render: (row) => (row.agreement.expiresOn ? (row.termState === 'expired' ? `ended ${row.agreement.expiresOn}` : `to ${row.agreement.expiresOn}`) : 'open-ended') },
        { label: 'Requests', key: 'requestsN' },
        { label: 'Accepted', key: 'acceptancesN' },
        { label: 'Lapsed', key: 'lapsedN' },
        { label: 'Overdue', key: 'overdueN' },
      ],
      rows: report.agreementRows,
      emptyMessage: 'No bilateral agreement is declared. An agreement is a written instrument, so none is inferred.',
    })
    : emptyState({ title: 'No bilateral agreement yet', body: 'Declare the agreement first: the partner, the written reference and the term. Nothing is inferred from a prior arrangement or a phone call.' });

  return h('div', { class: 'stack' },
    agreementRows,
    report.breaches.length
      ? card({
        title: 'Acts recorded out of order',
        subtitle: 'Unreachable through the door, kept when imported, printed permanently.',
        body: h('ul', null, ...report.breaches.slice(0, 20).map((row) => h('li', { class: 'small' },
          `${report.detailed ? row.request.subject : 'a request'} — ${row.state.label} (${row.breaches.map((b) => (b.earlyDays ? `${b.key}: ${b.earlyDays} day(s)` : `${b.key}: ${b.afterDays || 0} day(s)`)).join('; ')})`))),
      })
      : null,
  );
}

function requestsView(ctx, local, report, onDone) {
  const rows = report.rows.map((row) => ({
    ...row,
    subjectLabel: report.detailed ? row.request.subject : 'withheld at this disclosure level',
    partnerLabel: report.detailed ? (row.agreement?.partnerOrg || '—') : 'withheld',
    kindLabel: row.request.kind,
    opened: row.request.openedOn,
    closes: row.closesOn || '—',
    validityLeft: row.validityRemaining === null ? '—' : (row.validityRemaining > 0 ? `${row.validityRemaining}d left` : `${row.validityLapsed || 0}d over`),
    promiseLabel: row.acceptance ? (row.coverage?.covered ? 'as asked' : `different (${row.coverage.shortfalls.map((s) => `${s.kind} −${s.shortfall}`).join(', ') || 'short'})`) : '—',
    arrivalLabel: row.arrival ? (row.arrivalLate ? `${row.arrivalLate}d late` : (row.arrivalVerdict?.covered ? 'in full' : `short (${row.arrivalVerdict?.shortfalls.map((s) => `${s.kind} −${s.shortfall}`).join(', ') || 'short'})`)) : '—',
    apexLabel: row.apexNames.length ? row.apexNames.join(', ') : 'unresolved',
  }));

  return card({
    title: 'Requests',
    subtitle: 'The request and its validity, the acceptance with its promise, the arrival compared against it, and the withdrawal and release that close the commitment.',
    actions: [
      button('Declare agreement', () => declareAgreementDialog(ctx, local, onDone)),
      button('Request help', () => openRequestDialog(ctx, local, onDone), { primary: true }),
    ],
    body: rows.length
      ? table({
        caption: 'Mutual-aid requests',
        columns: [
          { label: 'State', render: (row) => stateBadge(row.state) },
          { label: 'Subject', key: 'subjectLabel' },
          { label: 'Partner', key: 'partnerLabel' },
          { label: 'Kind', key: 'kindLabel' },
          { label: 'Opened', key: 'opened' },
          { label: 'Validity', key: 'validityLeft' },
          { label: 'Promise', key: 'promiseLabel' },
          { label: 'Arrival', key: 'arrivalLabel' },
          { label: 'Joint seat', key: 'apexLabel' },
          {
            label: 'Act',
            render: (row) => h('div', { class: 'row-actions' },
              !row.acceptance ? button('Record acceptance', () => recordAcceptanceDialog(ctx, local, row.request.id, onDone)) : null,
              row.acceptance && !row.arrival ? button('Record arrival', () => recordArrivalDialog(ctx, local, row.acceptance.id, onDone)) : null,
              row.acceptance && row.arrival && !row.withdrawal ? button('Record withdrawal', () => recordWithdrawalDialog(ctx, local, row.acceptance.id, onDone)) : null,
              row.withdrawal && !row.release ? button('Record release', () => recordReleaseDialog(ctx, local, row.acceptance.id, onDone)) : null,
              !row.acceptance ? button('Cancel', () => cancelRequestDialog(ctx, local, row.request.id, onDone)) : null),
          },
        ],
        rows,
      })
      : emptyState({ title: 'No request for help is open', body: 'A request is a dated human act: the agreement it is made under, the validity declared for it, and the lines whose work it commits.' }),
  });
}

function linesView(report) {
  const rows = report.lineRows.length
    ? table({
      caption: 'Requesting lines',
      columns: [
        { label: 'Line', render: (row) => (report.detailed ? (row.name || row.lineId) : 'withheld at this disclosure level') },
        { label: 'Requests', key: 'requestsN' },
        { label: 'Open', key: 'openN' },
        { label: 'Lapsed', key: 'lapsedN' },
        { label: 'Not arrived', key: 'overdueN' },
        { label: 'Accepted', key: 'acceptedN' },
        { label: 'Arrived', key: 'arrivedN' },
        { label: 'Breaches', key: 'breachN' },
        { label: 'Partners', key: 'partnersN' },
      ],
      rows: report.lineRows,
      emptyMessage: 'No request names a requesting line.',
    })
    : emptyState({ title: 'No requesting line yet', body: 'A request is made from a reporting line; the joint seat above the lines answers for it.' });

  return card({
    title: 'Lines',
    subtitle: 'Each requesting line once, with the requests it made and the state they carry.',
    body: rows,
  });
}

function methodView(report) {
  return card({
    title: 'Method',
    subtitle: `Engine ${report.engineVersion} · ${MAA_METHOD.adr}`,
    body: h('div', { class: 'stack' },
      h('div', { class: 'stack' },
        h('h3', null, 'The framework basis'),
        h('ul', null, ...MAA_METHOD.frameworks.map((line) => h('li', { class: 'small' }, line)))),
      h('div', { class: 'stack' },
        h('h3', null, 'What the register prints'),
        h('ul', null, ...MAA_METHOD.printed.map((line) => h('li', { class: 'small' }, line)))),
      h('div', { class: 'stack' },
        h('h3', null, 'What it deliberately does not do'),
        h('ul', null, ...MAA_METHOD.deliberatelyAbsent.map((line) => h('li', { class: 'small' }, line)))),
    ),
  });
}

/* ------------------------------------------------------------------ render */

export function renderMutualAid(ctx) {
  const panel = PANELS.some((row) => row.key === ctx.query?.get?.('panel')) ? ctx.query.get('panel') : 'board';
  let report;
  try {
    const result = ctx.api.maaReport();
    if (!result?.ok) {
      return h('div', { class: 'stack' },
        pageHeader({ eyebrow: 'Operations · mutual aid', title: 'Mutual aid', subtitle: 'The request, the acceptance, the arrival and the release that closes the commitment.' }),
        banner({ tone: 'bad', title: 'The register could not be read', body: result?.error || 'The seat could not be resolved.' }));
    }
    report = result.report;
  } catch (error) {
    return h('div', { class: 'stack' },
      pageHeader({ eyebrow: 'Operations · mutual aid', title: 'Mutual aid' }),
      banner({ tone: 'bad', title: 'The register could not be read', body: error?.message || 'Unknown error.' }));
  }

  let candidates = { agreements: [], requests: [], acceptances: [], people: [] };
  try {
    const result = ctx.api.maaCandidates();
    if (result?.ok) candidates = result;
  } catch { /* an unreadable candidate list narrows the dialogs, never the screen */ }

  const onDone = () => {
    document.dispatchEvent(new CustomEvent('leados:navigate', { detail: { route: MAA_HREF } }));
    ctx.rerender?.();
  };
  const local = { ...candidates, api: ctx.api };

  const exportCsv = () => {
    try {
      const file = exportWorkspaceCsv(ctx.api.getState ? ctx.api.getState() : ctx.state, MAA_CSV_SCOPE);
      if (!file?.ok) { toast(file?.error || 'The export produced no file.', 'bad'); return; }
      downloadText(file.filename, file.csv, 'text/csv');
      toast('Exported. Counts and state keys only: no partner, agreement reference, subject, confirmation, external hand, resource line or day crosses this boundary.', 'good');
    } catch (error) {
      toast(error?.message || 'The export failed.', 'bad');
    }
  };

  const header = pageHeader({
    eyebrow: 'Operations · mutual aid',
    title: 'Mutual aid',
    subtitle: 'The bilateral agreement a request is made under, the request and its declared validity, the partner’s acceptance with its written confirmation and promise, the arrival compared against the promise line by line, and the withdrawal and release that close the commitment in order.',
    actions: [
      { label: 'Declare agreement', onClick: () => declareAgreementDialog(ctx, local, onDone), primary: true },
      { label: 'Request help', onClick: () => openRequestDialog(ctx, local, onDone) },
      { label: 'Export (counts)', onClick: exportCsv },
      { label: 'Conventions', onClick: () => conventionsDialog(ctx, report, onDone) },
    ],
    meta: [
      `As at ${report.asOf}`,
      `${report.totals.agreements} agreement(s) · ${report.totals.requests} request(s)`,
      `${report.totals.acceptances} acceptance(s) · ${report.totals.arrivals} arrival(s)`,
      report.detailed ? 'names shown' : 'counts only at this altitude',
    ],
  });

  const body = h('div', { class: 'stack' },
    summaryCard(report),
    claimsBanners(report),
    tabs({
      items: PANELS,
      active: panel,
      onSelect: (key) => { window.location.hash = `${MAA_HREF}?panel=${key}`; },
      ariaLabel: 'Mutual aid sections',
    }),
    panel === 'requests' ? requestsView(ctx, local, report, onDone)
      : panel === 'lines' ? linesView(report)
        : panel === 'method' ? methodView(report)
          : boardView(report),
    report.warnings.length
      ? card({
        title: 'Unreadable rows, counted and refused',
        subtitle: 'Nothing here was repaired: a stored row this register cannot read exactly is dropped with a count rather than guessed at.',
        body: h('ul', null, ...report.warnings.slice(0, 20).map((line) => h('li', { class: 'small' }, line))),
      })
      : null,
  );

  return h('div', { class: 'stack' }, header, body);
}
