/**
 * app/views/informationRequests.js — `#/information-requests`, the Regulator
 * Information-Request & Examination Response Register (ADR-0235/0236, Schema v191).
 *
 * ONE reader (`buildInformationRequestReport`, standing on the
 * `buildInformationRequests` kernel) behind every state, flag, count and rate
 * this page prints. The page formats what the reader returned; it computes no
 * state, no lapse, no review verdict, no privilege position and no rate of its
 * own.
 *
 * THE FOUR THINGS THIS SCREEN KEEPS APART, because collapsing them is how a
 * demand gets answered that was never actually answered:
 *   1. THE DEMAND — who asked, under which instrument, for what scope, on their
 *      own declared clock, which fixes the reply day.
 *   2. THE LINES — each production line, the person producing it, whether they
 *      certified the list complete, and how many items they say they withheld
 *      under privilege.
 *   3. THE REVIEW — whether a seat OUTSIDE the parties has tested each line and
 *      ruled on its privilege claim.
 *   4. THE RELEASE — the one written act that puts the production in the
 *      requester's hands, and what they said back.
 *
 * A line that "produced everything" while a privilege claim over 214 items sits
 * unreviewed is the exact sentence this screen refuses to print as `complete`.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, table } from '../ui/components.js';
import {
  RQR_HREF,
  RQR_INSTRUMENTS,
  RQR_LINEAGE_ADR,
  RQR_LIMITS,
  RQR_METHOD,
  RQR_STATES,
  RQR_REQUESTER_KINDS,
  RQR_RESPONSES,
} from '../core/domain/rqRegistry.js';

const L = RQR_LIMITS;
const DIAGRAM_URL = './app/assets/information-request-response-method.jpg';
const VIEWS = [
  { key: 'rows', label: 'Requests' },
  { key: 'lines', label: 'Production lines' },
  { key: 'lineage', label: 'Follow-up lineage' },
  { key: 'counts', label: 'Counts, clocks & coverage' },
  { key: 'refusals', label: 'Refused acts' },
  { key: 'method', label: 'Method' },
];

const STATE_TONE = {
  'reply-lapsed': 'bad',
  'reply-insufficient': 'bad',
  refused: 'bad',
  'released-answered': 'good',
  'cleared-unreleased': 'caution',
  'produced-unreviewed': 'info',
  working: 'neutral',
  received: 'neutral',
};
const STATE_SHORT = Object.fromEntries(RQR_STATES.map((row) => [row.key, row.label.split(' — ')[0]]));
const LINE_TONE = { unassigned: 'warn', working: 'neutral', produced: 'info', cleared: 'good', refused: 'bad' };
const RESPONSE_SHORT = Object.fromEntries(RQR_RESPONSES.map((row) => [row.key, row.label.split(' — ')[0]]));
const KIND_SHORT = Object.fromEntries(RQR_REQUESTER_KINDS.map((row) => [row.key, row.label]));
const INSTRUMENT_SHORT = Object.fromEntries(RQR_INSTRUMENTS.map((row) => [row.key, row.label]));

function button(label, onClick, { primary = false, testid = null } = {}) {
  return h('button', {
    type: 'button',
    class: `btn btn-small ${primary ? 'btn-primary' : 'btn-ghost'}`,
    ...(testid ? { 'data-testid': testid } : {}),
    onClick,
  }, label);
}

const options = (rows, { blank = null } = {}) => [
  ...(blank ? [{ value: '', label: blank }] : []),
  ...rows.map((row) => ({ value: row.value, label: row.label })),
];

const modalFooter = (label, submit) => [
  h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => closeAllModals() }, 'Cancel'),
  h('button', { type: 'button', class: 'btn btn-primary', onClick: submit }, label),
];

const when = (day) => (day ? String(day) : '—');
const pct = (bp) => (bp === null || bp === undefined ? '—' : `${(bp / 100).toFixed(2)}%`);
const count = (value) => (value === null || value === undefined ? '—' : String(value));

/** A single field renderer that reports a refusal against the field it names. */
function submitVia(ctx, fn, payload, form, onDone, successToast, tone = 'good') {
  form.clearErrors();
  const values = form.getValues();
  const result = fn({ ...payload, ...values });
  if (!result?.ok) {
    if (result?.field) form.setFieldError(result.field, result.error || '');
    toast(result?.error || 'The act was refused.', 'bad');
    return false;
  }
  closeAllModals();
  toast(typeof successToast === 'function' ? successToast(values) : successToast, tone);
  onDone?.();
  return true;
}

/* ------------------------------------------------------------------ dialogs */

function receiveDialog(ctx, candidates, onDone) {
  const form = buildForm([
    { name: 'requester', label: 'Who asked', type: 'text', required: true, help: `At least ${L.requesterMin} characters — the supervisor, the auditor, the inspectorate, the court. This is who the register will hold the answer to.` },
    {
      name: 'requesterKind', label: 'What kind of body', type: 'select', required: true,
      options: options(RQR_REQUESTER_KINDS.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose the kind' }),
      help: 'A closed list, because who asked decides what a missed day costs and who has to be told when it passes.',
    },
    {
      name: 'instrument', label: 'Under which instrument', type: 'select', required: true,
      options: options(RQR_INSTRUMENTS.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose the instrument' }),
      help: 'A subpoena or an order is not the entity’s to re-date, and an extension of it is refused outright here. A supervisor’s information request may be varied by agreement.',
    },
    { name: 'instrumentRef', label: 'The instrument reference', type: 'text', required: true, help: `At least ${L.refMin} characters — the request number, the notice, the letter a reviewer could go and read.` },
    { name: 'scope', label: 'What was asked for', type: 'textarea', required: true, help: `At least ${L.textMin} characters — the material, the period, the units, and what it does NOT cover. A production built on an undeclared scope cannot be certified complete.` },
    { name: 'receivedOn', label: 'The day it arrived', type: 'date', required: true, help: 'The day on the letter. The reply clock runs from it, so it is not assumed and not defaulted.' },
    { name: 'replyClockDays', label: 'The reply clock, in days, as the instrument states it', type: 'text', required: true, help: `A whole number between ${L.clockMinDays} and ${L.clockMaxDays}, read off the demand. This workspace has no jurisdiction table and no default window — a typed-in guess would be an invented deadline, and the register would then print a lapse nobody set.` },
    ...((candidates?.followUpParents || []).length ? [{
      name: 'followsUpOn',
      label: 'If this is a follow-up, which earlier insufficient demand does it answer?',
      type: 'select',
      options: options((candidates.followUpParents || []).map((row) => ({
        value: row.id,
        label: `${row.requester} · ${row.instrumentRef} · insufficient ${row.respondedOn}`,
      })), { blank: 'No prior request — record this as an original demand' }),
      help: 'Optional, and never inferred. Only earlier requests readable from this seat with a recorded insufficient verdict appear. The new demand keeps its own scope, lines, clock, review and release; its receipt day must be on or after the prior verdict.',
    }] : []),
  ]);
  const lineFields = [
    { name: 'roleLabel_0', label: 'Line 1 — which part of the demand this line carries', type: 'text', help: 'A short label — “operations”, “legal”, “finance”, “IT”. Optional.' },
    { name: 'subject_0', label: 'Line 1 — what this line has to search and produce', type: 'textarea', required: true, help: `At least ${L.textMin} characters. The material, not the intention.` },
    { name: 'dueOn_0', label: 'Line 1 — produced by', type: 'date', required: true, help: 'Inside the request’s own reply day.' },
    {
      name: 'producer_0', label: 'Line 1 — the named producer (optional)', type: 'select',
      options: options((candidates?.people || []).map((p) => ({ value: p.id, label: `${p.name}${p.role ? ` · ${p.role}` : ''}` })), { blank: 'Leave unfilled — name a producer later' }),
      help: 'A producer is NAMED, never inferred from the org chart. Leave it blank if the line is not yet staffed; the register prints `unassigned` rather than guessing a name.',
    },
  ];
  const form2 = buildForm(lineFields);
  const submit = () => {
    form.clearErrors();
    form2.clearErrors();
    const values = form.getValues();
    const lineValues = form2.getValues();
    const lines = [{
      lineId: 'ln-1',
      roleLabel: lineValues.roleLabel_0 || '',
      subject: lineValues.subject_0 || '',
      dueOn: lineValues.dueOn_0 || '',
      producerId: lineValues.producer_0 || undefined,
    }];
    const result = ctx.api.informationRequestReceive({ ...values, lines });
    if (!result?.ok) {
      const target = result?.field && result.field.startsWith('lines') ? form2 : form;
      if (result?.field) target.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The request was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Recorded. It closes only when every line is reviewed by a seat outside the parties and the production is released to the requester.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Record a demand for records from an authority',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'Recorded, never inferred', body: 'No information request is inferred from a case, an assurance finding, a risk statement or a calendar. A demand is a dated human declaration naming the requester, the instrument, the scope and the requester’s own clock — and the record keeps your name on it.' }),
      form.node,
      banner({ tone: 'caution', title: 'More than one line?', body: 'A production usually lands on operations, legal, finance and IT at once. Record this request with its first line, then add further lines from the request row — each names its own producer and its own day.' }),
      form2.node),
    footer: modalFooter('Record the request', submit),
  });
}

function assignDialog(ctx, row, candidates, onDone) {
  const unfilled = row.lines.filter((line) => !line.producerId);
  const lineRows = unfilled.map((line) => ({ value: line.lineId, label: `${line.lineId}${line.roleLabel ? ` · ${line.roleLabel}` : ''} — owed ${line.dueOn}` }));
  const people = (candidates?.people || []).map((p) => ({ value: p.id, label: `${p.name}${p.role ? ` · ${p.role}` : ''}` }));
  const form = buildForm([
    {
      name: 'lineId', label: 'The line to staff', type: 'select', required: true,
      options: options(lineRows, { blank: 'Choose the line' }),
      help: 'Only lines that carry no producer appear here. A line that already has one is re-assigned by a human decision on the decision log, not silently here.',
    },
    { name: 'producerId', label: 'The person who produces it', type: 'select', required: true, options: options(people, { blank: 'Choose the producer' }), help: 'Named, never inferred from the org chart. Naming them as a producer also disqualifies them from reviewing this request.' },
    { name: 'subject', label: 'What the line has to search and produce', type: 'textarea', required: true, help: `At least ${L.textMin} characters.` },
    { name: 'dueOn', label: 'Produced by', type: 'date', required: true, help: `Inside the request’s own reply day (${row.effectiveReplyDay}).` },
  ]);
  const submit = () => submitVia(ctx, ctx.api.informationRequestAssign.bind(ctx.api), { requestId: row.id }, form, onDone,
    'Producer named. They answer with their own dated certification — an independent review is owed once they assert it.');
  openModal({
    title: 'Name a producer on a production line',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'A duty is placed, not assumed', body: 'The register never infers a producer from position, tenure or the reporting graph. Naming one is a human act, and the person named is the only one who can certify that line — and is thereby barred from reviewing it.' }),
      form.node),
    footer: modalFooter('Name the producer', submit),
  });
}

function produceDialog(ctx, row, line, onDone) {
  const form = buildForm([
    { name: 'methodText', label: 'What you searched, and how', type: 'textarea', required: true, help: `At least ${L.textMin} characters. An impression is not a production; the reviewer reads this and then goes and looks.` },
    { name: 'searchWindow', label: 'The period and systems the search covered', type: 'text', required: true, help: `At least ${L.refMin} characters — e.g. “2026-01-01..2026-03-31, reconciliation drive + rota tool”. Without it, completeness cannot be questioned.` },
    { name: 'itemCount', label: 'How many items you are producing', type: 'text', required: true, help: 'A whole number. Zero is a real and allowed answer — it says you searched and found nothing.' },
    {
      name: 'complete', label: 'Has this line produced EVERYTHING within the requested scope?', type: 'select', required: true,
      options: options([{ value: 'true', label: 'Yes — this line’s production is complete' }, { value: 'false', label: 'No — the line has not covered the scope' }], { blank: 'Answer yes or no' }),
      help: 'A closed list, and required. Nobody can certify completeness for you, and “we think so” is not a fact the register can hold anyone to.',
    },
    {
      name: 'privilegeClaimed', label: 'Does this line withhold anything under privilege?', type: 'select', required: true,
      options: options([{ value: 'no', label: 'No — this line withholds nothing' }, { value: 'yes', label: 'Yes — items are withheld under a privilege claim' }], { blank: 'Answer' }),
      help: 'The claim is a separate fact from the production, and an independent seat must rule on it. A claim you cannot count and describe is refused here.',
    },
    { name: 'withheldCount', label: 'If yes: how many items are withheld', type: 'text', help: 'A whole number above zero.' },
    { name: 'privilegeBasis', label: 'If yes: on what basis they are withheld', type: 'textarea', help: `At least ${L.textMin} characters — the privilege asserted and why it covers these items. The reviewer tests the claim against this sentence.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const v = form.getValues();
    const payload = {
      requestId: row.id,
      lineId: line.lineId,
      methodText: v.methodText,
      searchWindow: v.searchWindow,
      itemCount: v.itemCount,
      complete: v.complete === 'true',
      privilege: v.privilegeClaimed === 'yes'
        ? { claimed: true, withheldCount: v.withheldCount, basis: v.privilegeBasis || '' }
        : { claimed: false },
    };
    const result = ctx.api.informationRequestProduce(payload);
    if (!result?.ok) {
      const field = String(result?.field || '').split('.')[0];
      if (field) form.setFieldError(field, result.error || '');
      toast(result?.error || 'The certification was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast(v.privilegeClaimed === 'yes'
      ? 'Certified. It closes nothing: an independent seat must review BOTH the list and the privilege claim before anything can be released.'
      : 'Certified. It closes nothing: an independent completeness review is now owed.', 'caution');
    onDone?.();
  };
  openModal({
    title: 'Certify this line’s production',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'Your line, your name, your count', body: `This line is held by you and owed ${line.dueOn}. Your certification opens the independent review; it does not close the request, and it is not a grade of anyone. You will not be allowed to review it yourself.` }),
      form.node),
    footer: modalFooter('Certify the production', submit),
  });
}

function reviewDialog(ctx, row, line, onDone) {
  const form = buildForm([
    {
      name: 'verdict', label: 'Is the line’s production complete and accurately described?', type: 'select', required: true,
      options: options([
        { value: 'clear', label: 'Clear — the search, the count and the completeness statement hold up' },
        { value: 'refuse', label: 'Refuse — the line has not produced what was asked, or cannot show it has' },
      ], { blank: 'Choose the verdict' }),
      help: 'A closed list. A refusal returns the line to its producer; it closes nothing.',
    },
    { name: 'methodText', label: 'How you tested it', type: 'textarea', required: true, help: `At least ${L.textMin} characters — what you asked for, what you saw, what you sampled against the stated search window.` },
    ...(line.privilegeClaimed ? [{
      name: 'privilegeVerdict', label: `Your ruling on the privilege claim over ${line.privilegeWithheldCount} withheld item(s)`, type: 'select', required: true,
      options: options([
        { value: 'sustain', label: 'Sustain — the claim covers these items on the basis stated' },
        { value: 'refuse', label: 'Refuse — the claim does not hold, and the withheld material is unaccounted for' },
      ], { blank: 'Rule on the claim' }),
      help: 'REQUIRED. You are not a party to this request, so you are the only kind of seat that can rule on it. Leaving the claim untested has not reviewed the line.',
    }] : []),
  ]);
  const submit = () => submitVia(ctx, ctx.api.informationRequestReview.bind(ctx.api), { requestId: row.id, lineId: line.lineId }, form, onDone,
    (v) => (v.verdict === 'refuse'
      ? 'Refused. The line is owed again, and nothing is released to the requester over it.'
      : (v.privilegeVerdict === 'refuse'
        ? 'Cleared, with the privilege claim struck out. The line’s withheld material now prints as unaccounted for.'
        : 'Cleared. When every line is cleared, the release to the requester is owed.')), 'good');
  openModal({
    title: 'Review this line’s production',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'An independent key, defined by conflict — not by rank', body: 'Only a seat that recorded nothing, produces nothing and holds no act on this request may review it, and it must hold standing over at least one producer. That is the separation that makes a completeness certificate and a privilege log worth anything to the requester.' }),
      form.node),
    footer: modalFooter('Record the review', submit),
  });
}

function releaseDialog(ctx, row, onDone) {
  const form = buildForm([
    { name: 'transmissionRef', label: 'The transmission the requester was sent it through', type: 'text', required: true, help: `At least ${L.refMin} characters — the secure portal reference, the covering letter, the filing. This register does not send anything; it records that it went and how.` },
    { name: 'releaseText', label: 'What was sent', type: 'textarea', required: true, help: `At least ${L.textMin} characters. Every line is independently reviewed — this is the act that turns that into an answer.` },
    { name: 'itemCount', label: 'How many items went out', type: 'text', required: true, help: `A whole number, and no more than the ${row.producedItemCount} item(s) the certified productions add up to. The register will not print a release larger than the work certified behind it.` },
  ]);
  const submit = () => submitVia(ctx, ctx.api.informationRequestRelease.bind(ctx.api), { requestId: row.id }, form, onDone,
    'Released. The requester’s verdict is now owed — a production sent and never accepted is not known to have answered anything.');
  openModal({
    title: 'Release the production to the requester',
    body: h('div', { class: 'stack' },
      banner({ tone: 'caution', title: 'Searching is not answering', body: 'A demand is discharged by producing to the requester and having them say what they got. Every production line is independently reviewed, so this release is supported.' }),
      form.node),
    footer: modalFooter('Record the release', submit),
  });
}

function respondDialog(ctx, row, onDone) {
  const form = buildForm([
    {
      name: 'response', label: 'What the requester said', type: 'select', required: true,
      options: options(RQR_RESPONSES.map((r) => ({ value: r.key, label: r.label })), { blank: 'Choose the verdict' }),
      help: 'A closed list. “Received and complete”, “no response yet” and “insufficient” are three different facts and the register never averages them.',
    },
    { name: 'responseRef', label: 'The written record of their reply — or of its absence', type: 'text', required: true, help: `At least ${L.refMin} characters.` },
    { name: 'responseText', label: 'What they said about the production', type: 'textarea', required: true, help: `At least ${L.textMin} characters.` },
  ]);
  const submit = () => submitVia(ctx, ctx.api.informationRequestRespond.bind(ctx.api), { requestId: row.id }, form, onDone,
    (v) => (v.response === 'insufficient'
      ? 'Recorded as insufficient. The request reads as insufficient, never as answered, until the record says otherwise.'
      : 'Verdict recorded.'), 'good');
  openModal({
    title: 'Record the requester’s verdict',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'Sent is not the same as accepted', body: 'A production the requester does not accept has not answered the ask. The register prints it as insufficient and never as answered.' }),
      form.node),
    footer: modalFooter('Record the verdict', submit),
  });
}

function extendDialog(ctx, row, onDone) {
  const compelled = RQR_INSTRUMENTS.find((i) => i.key === row.instrument)?.movableByAgreement === false;
  const form = buildForm([
    { name: 'newReplyDay', label: 'The day the reply moves to', type: 'date', required: true, help: `Must move forward from ${row.effectiveReplyDay}. A lapsed request is refused: a passed day is not un-lapsed by moving the date.` },
    {
      name: 'requesterAgreementRef', label: 'The requester’s written agreement (required on every movable instrument)', type: 'text',
      help: compelled
        ? 'THIS INSTRUMENT CANNOT BE EXTENDED HERE at all. A compelled date is not the entity’s to move; if the requester moved it themselves, record it as their own restated clock.'
        : `REQUIRED. The reply day belongs to the requester — at least ${L.refMin} characters naming their written agreement.`,
    },
    { name: 'reason', label: 'Why the day is moving', type: 'textarea', required: true, help: `At least ${L.textMin} characters.` },
  ]);
  const submit = () => submitVia(ctx, ctx.api.informationRequestExtend.bind(ctx.api), { requestId: row.id }, form, onDone,
    'Reply day moved. It closes nothing — the request is still open until every line is reviewed and the production is released.', 'caution');
  openModal({
    title: 'Move the reply day',
    body: h('div', { class: 'stack' },
      compelled
        ? banner({ tone: 'bad', title: 'This demand is compelled', body: 'An order, a notice or a subpoena carries a date the requester holds you to. The register refuses an extension of it outright — a moved day must arrive as the requester’s own restated clock, cited to their letter.' })
        : banner({ tone: 'caution', title: 'The day belongs to the requester', body: 'A supervisor’s information request may be varied by agreement. Moving it without their own recorded agreement is refused; the register will not record a unilateral postponement of a deadline an authority set.' }),
      form.node),
    footer: modalFooter('Move the reply day', submit),
  });
}

function restateClockDialog(ctx, row, onDone) {
  const form = buildForm([
    { name: 'requesterReference', label: 'The requester’s own dated letter, email or minute', type: 'text', required: true, help: `At least ${L.refMin} characters. A moved deadline with nothing behind it is an extension the entity granted itself, and this register will not record one.` },
    { name: 'newClockDays', label: 'The restated clock, in days, as they state it', type: 'text', required: true, help: `A whole number between ${L.clockMinDays} and ${L.clockMaxDays}, read off their letter.` },
    { name: 'restatedReplyDay', label: 'The day they moved the reply to', type: 'date', required: true, help: 'It must follow from the receipt day plus their own clock; the register derives rather than accept a number matching neither.' },
  ]);
  const submit = () => submitVia(ctx, ctx.api.informationRequestRestateClock.bind(ctx.api), { requestId: row.id }, form, onDone,
    'The requester’s own restated clock is on the record, cited to their letter.');
  openModal({
    title: 'Record the requester restating the clock',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'Their figure, cited', body: 'This is the only path on which a deadline moves that the entity did not ask for — a granted extension or a moved date in a follow-up letter. The register stores their day and their reference; it computes nothing about their jurisdiction.' }),
      form.node),
    footer: modalFooter('Record their restatement', submit),
  });
}

/* -------------------------------------------------------------------- views */

function summaryCard(report) {
  const c = report.counts;
  return card({
    title: 'The register in eight numbers',
    subtitle: 'States, flags and counts are re-derived on every read; nothing here is stored.',
    body: h('div', { class: 'stat-row' },
      stat({ label: 'Requests', value: String(c.requests) }),
      stat({ label: 'Open', value: String(c.open), tone: c.open ? 'warn' : undefined }),
      stat({ label: 'Reply day within 14 days', value: String(c.closing), tone: c.closing ? 'warn' : undefined }),
      stat({ label: 'Lapsed — nothing released', value: String(c.lapsed), tone: c.lapsed ? 'bad' : undefined }),
      stat({ label: 'Reviewed, not released', value: String(c.unreleased), tone: c.unreleased ? 'warn' : undefined }),
      stat({ label: 'Refused in review', value: String(c.refused), tone: c.refused ? 'bad' : undefined }),
      stat({ label: 'Privilege claims unreviewed', value: String(c.privilegeUnreviewed), tone: c.privilegeUnreviewed ? 'bad' : undefined }),
      stat({ label: 'Dropped rows', value: String(c.droppedRows || 0), tone: c.droppedRows ? 'warn' : undefined }),
    ),
  });
}

function claimsBanners(report) {
  return h('div', { class: 'stack' },
    report.partitionReconciles
      ? banner({ tone: 'good', title: 'The rows add up', body: 'Every printed state count sums to the request total (`partitionReconciles`).' })
      : banner({ tone: 'bad', title: 'The rows do NOT add up', body: 'The printed state counts do not sum to the request total. Do not read a figure from this page until the record is repaired.' }),
    report.figuresComplete
      ? banner({ tone: 'good', title: 'Nothing refused, nothing dropped, every line staffed', body: 'No dropped row and no unstaffed line sits behind these figures (`figuresComplete`).' })
      : banner({ tone: 'caution', title: 'These figures carry an incomplete record behind them', body: `${report.counts.droppedRows} stored row(s) were refused by the loader and ${report.counts.unassignedLines} production line(s) carry no named producer. Both are counted, not repaired, and nothing on this page was invented from them.` }),
    report.counts.privilegeUnreviewed > 0
      ? banner({
        tone: 'bad',
        title: `${report.counts.privilegeUnreviewed} privilege claim(s) have never been reviewed`,
        body: `Material totalling ${report.counts.privilegeItems} declared item(s) is withheld on a claim no seat outside the parties has tested. Those lines do not read as complete and nothing releases over them.${report.counts.noReviewer > 0 ? ` ${report.counts.noReviewer} request(s) have NO eligible reviewer on the graph at all — the review is refused, not waived.` : ''}`,
      })
      : null,
  );
}

function rowActionButtons(ctx, row, candidates, onDone) {
  const self = ctx.state?.settings?.activeSeatId || null;
  const isReceiver = self && row.receivedById === self;
  const mayReview = (candidates?.reviewable || []).find((r) => r.id === row.id);
  const cells = [];
  if (isReceiver && row.unassignedLineCount > 0 && !row.released) {
    cells.push(button('Name a producer', () => assignDialog(ctx, row, candidates, onDone), { testid: `rq-assign-${row.id}` }));
  }
  if (!row.released) {
    for (const line of row.lines) {
      if (line.producerId === self && line.lineState === 'working') {
        cells.push(button('Certify production', () => produceDialog(ctx, row, line, onDone), { primary: true, testid: `rq-produce-${row.id}-${line.lineId}` }));
      }
      if (line.lineState === 'produced' && mayReview?.mayReview) {
        cells.push(button('Review it', () => reviewDialog(ctx, row, line, onDone), { primary: true, testid: `rq-review-${row.id}-${line.lineId}` }));
      }
    }
  }
  if (isReceiver && row.allReviewed && !row.released) {
    cells.push(button('Release to requester', () => releaseDialog(ctx, row, onDone), { primary: true, testid: `rq-release-${row.id}` }));
  }
  if (isReceiver && row.released && !row.respondedOn) {
    cells.push(button('Record their verdict', () => respondDialog(ctx, row, onDone), { testid: `rq-respond-${row.id}` }));
  }
  if (isReceiver && !row.released && !row.lapsed) {
    cells.push(button('Move the reply day', () => extendDialog(ctx, row, onDone), { testid: `rq-extend-${row.id}` }));
    cells.push(button('Their restated clock', () => restateClockDialog(ctx, row, onDone), { testid: `rq-restate-${row.id}` }));
  }
  return h('div', { class: 'row gap-s' }, ...cells);
}

function linesCellMarkup(ctx, row, candidates, onDone) {
  const self = ctx.state?.settings?.activeSeatId || null;
  const mayReview = (candidates?.reviewable || []).find((r) => r.id === row.id)?.mayReview;
  return h('div', { class: 'stack-tight' }, ...row.lines.map((line) => h('div', { class: 'small' },
    badge(line.lineState, LINE_TONE[line.lineState] || 'neutral'),
    ` ${line.roleLabel || line.lineId}`,
    line.producerId ? h('span', { class: 'muted' }, ` · ${line.producerName}`) : h('span', { class: 'text-warn' }, ' · no producer named'),
    h('span', { class: 'muted' }, ` · owed ${line.dueOn}`),
    line.produced ? h('span', { class: 'muted' }, ` · ${count(line.itemCount)} item(s)`) : null,
    line.complete === false ? h('span', { class: 'text-warn' }, ' · PRODUCER SAYS NOT COMPLETE') : null,
    line.privilegeClaimed
      ? h('span', { class: line.privilegeUnreviewed ? 'text-warn' : 'muted' }, ` · privilege over ${line.privilegeWithheldCount} item(s)${line.privilegeVerdict ? ` — ${line.privilegeVerdict}` : ' — UNREVIEWED'}`)
      : null,
    line.lineState === 'produced' ? h('span', { class: 'text-warn' }, ' · awaits independent review') : null,
    line.producerId === self && line.lineState === 'working'
      ? h('span', null, ' ', button('Certify', () => produceDialog(ctx, row, line, onDone), { primary: true, testid: `rq-inline-produce-${row.id}-${line.lineId}` }))
      : null,
    line.lineState === 'produced' && mayReview
      ? h('span', null, ' ', button('Review', () => reviewDialog(ctx, row, line, onDone), { primary: true, testid: `rq-inline-review-${row.id}-${line.lineId}` }))
      : null)));
}

function rowsView(ctx, report, candidates, onDone) {
  const canReceive = Boolean(ctx.state?.settings?.activeSeatId);
  const columns = [
    {
      label: 'The demand',
      render: (r) => h('div', { class: 'stack-tight' },
        h('strong', null, r.requester),
        h('span', { class: 'small muted' }, `${KIND_SHORT[r.requesterKind] || r.requesterKind} · ${INSTRUMENT_SHORT[r.instrument] || r.instrument}`),
        h('span', { class: 'small muted' }, `${r.instrumentRef} · recorded by ${r.receiverName}`)),
    },
    { label: 'What was asked for', render: (r) => h('span', { class: 'small' }, r.scope) },
    { label: 'Production lines', render: (r) => linesCellMarkup(ctx, r, candidates, onDone) },
    {
      label: 'Reply day',
      render: (r) => {
        const day = `${when(r.effectiveReplyDay)} · their ${r.replyClockDays}d clock`;
        if (r.released) return h('span', null, `${day} · released ${r.releasedOn}`);
        if (r.lapsed) return h('span', { class: 'text-warn' }, `${day} · LAPSED`);
        if (r.closing) return h('span', { class: 'text-warn' }, `${day} · DUE IN ${r.daysRemaining}d`);
        return h('span', null, `${day} · ${r.daysRemaining}d left`);
      },
    },
    {
      label: 'State',
      render: (r) => h('div', { class: 'stack-tight' },
        badge(STATE_SHORT[r.state] || r.state, STATE_TONE[r.state] || 'neutral'),
        r.accountability === 'no-authority' ? h('span', { class: 'small text-warn' }, 'no seat above every line — none invented') : null,
        r.accountability === 'joint-apex' ? h('span', { class: 'small muted' }, 'answered at the joint apex above every line') : null,
        r.flags.includes('no-independent-reviewer') ? h('span', { class: 'small text-warn' }, 'no seat outside the parties can review this — the review is refused, not waived') : null,
        r.flags.includes('privilege-claim-refused') ? h('span', { class: 'small text-warn' }, 'a privilege claim was struck out; the withheld material is unaccounted for') : null,
        r.lines.some((l) => l.producerId && !l.producerActive) ? h('span', { class: 'small text-warn' }, 'a line producer is no longer active on the roster') : null,
        r.clockRestatedOn ? h('span', { class: 'small muted' }, `requester restated the day ${r.clockRestatedOn}`) : null,
        r.respondedOn ? h('span', { class: 'small muted' }, `verdict: ${RESPONSE_SHORT[r.response] || r.response} ${r.respondedOn}`) : null,
        r.releaseOverdue ? h('span', { class: 'small text-warn' }, 'released, verdict owed') : null),
    },
    { label: '', render: (r) => rowActionButtons(ctx, r, candidates, onDone) },
  ];
  return h('div', { class: 'stack', 'data-testid': 'rq-rows' },
    h('div', { class: 'row gap-s' },
      button('Record an information request', () => receiveDialog(ctx, candidates, onDone), { primary: true, testid: 'rq-receive' }),
      button('Scan the register', () => {
        const result = ctx.api.informationRequestScan();
        if (!result?.ok) { toast(result?.error || 'The scan was refused.', 'bad'); return; }
        toast('Register scanned. Unreviewed productions, untested privilege claims, unreleased reviews and lapsed reply days were re-read from the record.', 'good');
        onDone?.();
      }, { testid: 'rq-scan' })),
    canReceive ? null : banner({ tone: 'caution', title: 'Declare a seat to act', body: 'The register reads from any seat. Recording a demand, releasing to a requester and moving a reply day need a declared seat that carries the right — the undeclared operator view speaks for nobody.' }),
    report.counts.hidden > 0
      ? banner({ tone: 'info', title: `${report.counts.hidden} request(s) withheld from this seat`, body: 'A request is readable by the seats that are parties to it — its receiver, its producers, the seats that reviewed its lines and the seat that released — and by the span or lines that hold them. Everything else is withheld and counted — never printed and never dropped.' })
      : null,
    table({
      caption: 'Information requests — the demand, its production lines, the reviewer’s verdict, the requester’s day and the release that answers it',
      columns,
      rows: report.rows.map((row) => ({
        ...row,
        attrs: {
          'data-testid': `rq-row-${row.id}`,
          'data-state': row.state,
          'data-lapsed': String(row.lapsed),
          'data-released': String(row.released),
          'data-privilege-unreviewed': String(row.privilegeUnreviewedCount),
          'data-response': row.response || '',
        },
      })),
      emptyMessage: 'No information request is readable from this seat. Until one is recorded, a supervisor’s demand with a date on it stays invisible — which is exactly the failure this register exists to prevent.',
    }),
  );
}

function linesView(ctx, report, candidates, onDone) {
  const rows = report.rows.flatMap((row) => row.lines.map((line) => ({ ...line, row })));
  const self = ctx.state?.settings?.activeSeatId || null;
  const columns = [
    { label: 'Demand', render: (r) => h('div', { class: 'stack-tight' }, h('strong', null, `${r.row.requester} · ${r.row.id}`), h('span', { class: 'small muted' }, r.row.instrumentRef)) },
    { label: 'Line', render: (r) => (r.roleLabel || String(r.lineId)) },
    { label: 'Producer', render: (r) => (r.producerId ? h('span', null, r.producerName, r.producerActive ? null : h('span', { class: 'text-warn' }, ' · not active')) : h('span', { class: 'text-warn' }, 'unnamed')) },
    { label: 'Line state', render: (r) => badge(r.lineState, LINE_TONE[r.lineState] || 'neutral') },
    { label: 'Owed by', render: (r) => when(r.dueOn) },
    { label: 'Produced', render: (r) => (r.producedOn ? `${r.producedOn} · ${count(r.itemCount)} item(s) · ${r.complete ? 'complete' : 'NOT COMPLETE'}` : '—') },
    { label: 'Privilege claim', render: (r) => (r.privilegeClaimed ? `${r.privilegeWithheldCount} withheld · ${r.privilegeVerdict || 'UNREVIEWED'}` : '—') },
    { label: 'Independently reviewed', render: (r) => (r.reviewed ? `${r.verdict} ${r.reviewedOn}` : '—') },
    {
      label: 'Act',
      render: (r) => {
        if (r.producerId === self && r.lineState === 'working') {
          return button('Certify production', () => produceDialog(ctx, r.row, r, onDone), { primary: true, testid: `rq-lines-produce-${r.row.id}-${r.lineId}` });
        }
        if (r.lineState === 'produced' && (candidates?.reviewable || []).find((x) => x.id === r.row.id)?.mayReview) {
          return button('Review it', () => reviewDialog(ctx, r.row, r, onDone), { testid: `rq-lines-review-${r.row.id}-${r.lineId}` });
        }
        return '—';
      },
    },
  ];
  return h('div', { class: 'stack', 'data-testid': 'rq-lines' },
    banner({ tone: 'info', title: 'One demand, many producers — each line reviewed by somebody who produced nothing', body: 'A production lands on several lines at once, held by different people under different managers. Every line names its own producer, every certification is tested by a seat outside the parties, and a privilege claim is ruled on by that same independent hand — never by the seat that withheld the material.' }),
    table({
      caption: 'Production lines — every line of every readable request',
      columns,
      rows,
      emptyMessage: 'No production line is on the record from this seat.',
    }),
  );
}

const FOLLOW_UP_LABEL = Object.freeze({
  original: 'Original demand',
  'follows-up-after-insufficient': 'Follow-up after an insufficient verdict',
  'parent-withheld': 'Declared follow-up · prior demand withheld',
  'parent-not-insufficient': 'Unsubstantiated · no prior insufficient verdict',
  'recorded-before-parent-verdict': 'Unsubstantiated · recorded before prior verdict',
  'received-before-parent-verdict': 'Unsubstantiated · received before prior verdict',
  'parent-unavailable': 'Unsubstantiated · prior demand unavailable',
});

function lineageView(ctx, report) {
  const lineageCounts = report.lineageCounts || null;
  const rows = report.rows.map((row) => ({
    ...row,
    attrs: {
      'data-testid': `rq-lineage-${row.id}`,
      'data-follow-up-status': row.followUp?.status || 'original',
      'data-follow-up-depth': row.followUp?.depth ?? '',
    },
  }));
  const columns = [
    {
      label: 'Demand',
      render: (row) => h('div', { class: 'stack-tight' },
        h('strong', null, `${row.requester} · ${row.id}`),
        h('span', { class: 'small muted' }, `${INSTRUMENT_SHORT[row.instrument] || row.instrument} · ${row.instrumentRef}`),
        h('span', { class: 'small muted' }, `received ${row.receivedOn}`)),
    },
    {
      label: 'Declared relationship',
      render: (row) => {
        const status = row.followUp?.status || 'original';
        const tone = status === 'original' ? 'neutral'
          : status === 'follows-up-after-insufficient' ? 'info'
            : status === 'parent-withheld' ? 'caution' : 'bad';
        return h('div', { class: 'stack-tight' },
          badge(FOLLOW_UP_LABEL[status] || status, tone),
          row.followUp?.parentWithheld ? h('span', { class: 'small muted' }, 'The declared link does not grant access to the prior demand.') : null,
          row.flags?.includes('follow-up-not-supported-by-prior-insufficient-verdict')
            ? h('span', { class: 'small text-warn' }, 'Lineage is not substantiated; the prior demand remains unchanged.')
            : null);
      },
    },
    {
      label: 'Prior demand',
      render: (row) => {
        const parent = row.followUp?.parent;
        if (!parent) return row.followUp?.parentWithheld ? 'Withheld from this seat' : '—';
        return h('div', { class: 'stack-tight' },
          h('strong', null, `${parent.requester} · ${parent.id}`),
          h('span', { class: 'small muted' }, `${parent.instrumentRef} · received ${parent.receivedOn}`),
          h('span', { class: 'small' }, `${RESPONSE_SHORT[parent.response] || parent.response || 'no recorded verdict'}${parent.respondedOn ? ` · ${parent.respondedOn}` : ''}`));
      },
    },
    {
      label: 'Direct follow-ups',
      render: (row) => {
        const children = row.followUp?.children || [];
        const parts = children.map((child) => h('div', { class: 'stack-tight' },
          h('strong', null, `${child.requester} · ${child.id}`),
          h('span', { class: 'small muted' }, `${child.instrumentRef} · received ${child.receivedOn}`),
          h('span', { class: 'small' }, FOLLOW_UP_LABEL[child.relationshipState] || child.relationshipState)));
        if (row.followUp?.childrenWithheld) {
          parts.push(h('span', { class: 'small muted' }, 'Additional linked demand(s) are withheld from this seat.'));
        }
        return parts.length ? h('div', { class: 'stack-tight' }, ...parts) : '—';
      },
    },
    {
      label: 'Supported depth',
      render: (row) => {
        const depth = row.followUp?.depth;
        if (depth === null || depth === undefined) return 'Not shown — unsubstantiated or an ancestor is withheld';
        return depth === 0 ? 'Root demand' : String(depth);
      },
    },
  ];
  return h('div', { class: 'stack', 'data-testid': 'rq-lineage' },
    banner({
      tone: 'info',
      title: `${RQR_LINEAGE_ADR} · a follow-up is a new demand, never a reopened answer`,
      body: 'A director records the relationship only after the actual requester verdict is insufficient; the child’s declared receipt day may not precede that verdict’s date. Each follow-up keeps its own scope, clock, production lines, independent review and release. The link is human-declared; matching words, requester names or instruments never create it, and it never widens seat access.',
    }),
    report.lineageCountsWithheld
      ? banner({ tone: 'caution', title: 'Whole-register lineage counts are withheld', body: report.lineageCountsWithheldReason || 'Some requests are outside this seat’s visibility, so no partial relationship count is shown.' })
      : (lineageCounts ? card({
        title: 'Whole-register lineage',
        subtitle: 'Counts describe the declared graph, not the semantic similarity of free-text scopes.',
        body: h('div', { class: 'stat-row' },
          stat({ label: 'Follow-up demands', value: String(lineageCounts.followUpRequests) }),
          stat({ label: 'After an insufficient verdict', value: String(lineageCounts.followUpsAfterInsufficient) }),
          stat({ label: 'Unsubstantiated links', value: String(lineageCounts.followUpsUnsubstantiated), tone: lineageCounts.followUpsUnsubstantiated ? 'bad' : undefined }),
          stat({ label: 'Maximum supported depth', value: lineageCounts.maxFollowUpDepth === null ? '—' : String(lineageCounts.maxFollowUpDepth) })),
      }) : null),
    table({
      caption: 'Declared follow-up lineage — each demand stays a separate record and obligation',
      columns,
      rows,
      emptyMessage: 'No information request is readable from this seat.',
    }),
  );
}

function countsView(report) {
  const c = report.counts;
  const rates = report.rates || {};
  const ratesWithheld = Boolean(report.ratesWithheld);
  return h('div', { class: 'stack', 'data-testid': 'rq-counts' },
    ratesWithheld
      ? banner({ tone: 'caution', title: 'The rate is withheld from this seat', body: report.ratesWithheldReason || 'A rate built from part of the population would read as the enterprise’s.' })
      : h('div', { class: 'stat-row' },
        stat({ label: 'Requests whose reply day has passed', value: String(rates.releasedInsideWindow?.owed ?? 0) }),
        stat({ label: 'Released on or before the day', value: String(rates.releasedInsideWindow?.onTime ?? 0) }),
        stat({ label: 'On-time rate', value: pct(rates.releasedInsideWindow?.onTimeBp), hint: 'the denominator is the passed-day count above; a lapsed request is never in the numerator' })),
    card({
      title: 'Requests by state',
      body: h('div', { class: 'stat-row' }, ...Object.entries(c.byState || {}).map(([key, value]) => stat({ label: STATE_SHORT[key] || key, value: String(value) }))),
    }),
    card({
      title: 'The privilege position',
      subtitle: 'Declared counts, never verified: the register does not hold the material and cannot check what a line says it withheld.',
      body: h('div', { class: 'stat-row' },
        stat({ label: 'Lines claiming privilege', value: String(c.privilegeClaims ?? 0) }),
        stat({ label: 'Claims never reviewed', value: String(c.privilegeUnreviewed ?? 0), tone: c.privilegeUnreviewed ? 'bad' : undefined }),
        stat({ label: 'Claims struck out', value: String(c.privilegeRefused ?? 0), tone: c.privilegeRefused ? 'warn' : undefined }),
        stat({ label: 'Items withheld on claim', value: String(c.privilegeItems ?? 0) }),
        stat({ label: 'Items produced', value: String(c.producedItems ?? 0) })),
    }),
    card({
      title: 'By requester kind',
      subtitle: 'A count below the privacy floor of three is withheld in the CSV export rather than printed as a small number that would name a relationship with a specific authority.',
      body: h('div', { class: 'stat-row' }, ...RQR_REQUESTER_KINDS.map((row) => stat({ label: row.label, value: String(c.byRequesterKind?.[row.key] ?? 0) }))),
    }),
    card({
      title: 'By instrument',
      subtitle: 'A compelled instrument’s day cannot be moved by the entity at all; the others only with the requester’s own agreement.',
      body: h('div', { class: 'stat-row' }, ...RQR_INSTRUMENTS.map((row) => stat({ label: row.label, value: String(c.byInstrument?.[row.key] ?? 0) }))),
    }),
    card({
      title: 'Open requests by days to the reply day',
      subtitle: 'The `past` band is the lapsed band: the requester’s day has gone and nothing has been released.',
      body: h('div', { class: 'stat-row' }, ...Object.entries(c.windows || {}).map(([key, value]) => stat({ label: key, value: String(value) }))),
    }),
    card({
      title: 'Unanswerable readings, counted',
      body: h('div', { class: 'stat-row' },
        stat({ label: 'No seat above every line', value: String(c.noAuthority ?? 0) }),
        stat({ label: 'No eligible reviewer', value: String(c.noReviewer ?? 0), tone: c.noReviewer ? 'bad' : undefined }),
        stat({ label: 'Lines without a producer', value: String(c.unassignedLines ?? 0), tone: c.unassignedLines ? 'warn' : undefined }),
        stat({ label: 'Clock moves recorded', value: String(c.clockMoves ?? 0) })),
    }),
    card({
      title: 'The separation this register exists to make',
      body: h('div', { class: 'stack' },
        h('div', { class: 'stat-row' },
          stat({ label: 'Produced, unreviewed', value: String(c.byState?.['produced-unreviewed'] ?? 0) }),
          stat({ label: 'Reviewed, not released', value: String(c.unreleased ?? 0), tone: c.unreleased ? 'warn' : undefined }),
          stat({ label: 'Found insufficient', value: String(c.insufficient ?? 0), tone: c.insufficient ? 'bad' : undefined })),
        h('p', { class: 'small muted' }, 'Searching the material, having it independently reviewed, and releasing it to the requester are three different facts. This register holds them apart on the record, and only `released-answered` asserts that the requester received it and said so.')),
    }),
  );
}

function refusalsView(report) {
  return h('div', { class: 'stack', 'data-testid': 'rq-refusals' },
    banner({ tone: 'info', title: 'Refused acts are never applied', body: 'A release while one line is unreviewed is refused rather than recorded; a privilege claim without a count and a basis is refused rather than accepted on the word “privileged”; a review by a party to the request is refused rather than waived; a compelled instrument’s day is refused rather than moved; a restated clock without the requester’s own citation is refused rather than believed. The refusal is the control.' }),
    report.warnings?.length
      ? card({ title: 'Rows the loader refused at the door', subtitle: 'Malformed or duplicate rows are dropped and counted; nothing is repaired', body: h('ul', { class: 'list' }, ...report.warnings.map((w) => h('li', { class: 'small' }, w))) })
      : null,
    card({
      title: 'Identity-free observations from RULE-RQR-01',
      subtitle: 'Where the record owes an ask and the reporting graph names nobody who can be asked',
      body: (report.markers || []).length
        ? h('ul', { class: 'list' }, ...report.markers.map((m) => h('li', { class: 'small' }, `${m.at.slice(0, 10)} — ${m.detail}`)))
        : h('p', { class: 'small muted' }, 'No observation recorded.'),
    }),
  );
}

function methodView() {
  return h('div', { class: 'stack', 'data-testid': 'rq-method' },
    card({
      title: 'One demand, four separate facts, one release',
      subtitle: 'Record → staff the lines → certify production and claim privilege → review from outside the parties → release to the requester → their verdict. The day never decides.',
      body: h('figure', { class: 'figure' },
        h('img', {
          src: DIAGRAM_URL,
          alt: 'Information-request response flow: a seat records a demand from an authority, naming the requester, the instrument, the requested scope, the day it arrived and the reply clock stated in the instrument, which fixes the reply day. The demand carries one or more production lines. Each line’s named producer certifies what it searched, the item count, whether the production is complete, and separately whether it withholds items under a privilege claim with a count and a basis. A seat that produced nothing on the request then reviews each line and rules on every privilege claim; a producer is structurally barred from reviewing. Only when EVERY line is reviewed may the receiving seat release the production to the requester under a named transmission, and the requester’s verdict is recorded as received and complete, no response, or insufficient. A reply day that passes with nothing released reads lapsed; the register never substitutes the passage of time for a decision, and never lets the hands that assembled a production certify it.',
          class: 'figure-img',
          'data-testid': 'rq-diagram',
        }),
        h('figcaption', { class: 'small muted' }, 'Searching, having it independently reviewed, and releasing it to the requester are three different facts — and a privilege claim is a fourth that somebody outside the parties must rule on.')),
    }),
    card({ title: 'Frameworks encoded', body: h('ul', { class: 'list' }, ...RQR_METHOD.frameworks.map((f) => h('li', null, f))) }),
    card({ title: 'Invariants', body: h('ul', { class: 'list' }, ...RQR_METHOD.invariants.map((f) => h('li', null, f))) }),
    card({ title: 'What it deliberately does not do', body: h('ul', { class: 'list' }, ...RQR_METHOD.deliberatelyAbsent.map((f) => h('li', null, f))) }),
  );
}

const viewKey = (value) => (VIEWS.some((row) => row.key === value) ? value : 'rows');

export function renderInformationRequests(ctx) {
  const report = ctx.api.informationRequestReport ? ctx.api.informationRequestReport() : null;
  if (!report || report.ok === false || !report.counts) {
    return h('div', { class: 'page' },
      pageHeader({ eyebrow: 'director / VP · general counsel’s office · matrix and single-chain', title: 'Information requests', subtitle: 'The demand that came in — what an authority asked for, on whose clock, and whether the answer was ever reviewed and released.' }),
      banner({ tone: 'bad', title: 'The register could not be read', body: report?.error || 'The seat refused the read.' }));
  }
  const candidates = ctx.api.informationRequestCandidates ? ctx.api.informationRequestCandidates() : null;
  const view = viewKey(ctx.query?.get?.('view'));
  const onDone = () => ctx.refresh?.();
  return h('div', { class: 'page', 'data-testid': 'information-request-panel' },
    pageHeader({
      eyebrow: 'director / VP × general counsel’s office · single-chain and matrix',
      title: 'The demand that came in — and whether it was ever answered',
      subtitle: 'A supervisor’s information request, an examination scope letter, a production notice or a privacy query is discharged by producing to the requester on THEIR day — after a seat that produced nothing has reviewed every line and ruled on every privilege claim. Each follow-up demand links only to a recorded insufficient verdict and keeps its own scope, clock, production, review and release. A reply day that passes unreleased is printed `lapsed` — the register never converts a passed day into an answered request.',
    }),
    ctx.persistError ? card({ body: h('p', { class: 'text-warn small' }, `Changes are not being saved: ${ctx.persistError}`) }) : null,
    ...(report.warnings || []).map((warning) => banner({ tone: 'caution', title: 'A stored row was refused', body: warning })),
    summaryCard(report),
    claimsBanners(report),
    tabs({
      items: VIEWS.map((row) => ({
        key: row.key,
        label: row.label,
        count: row.key === 'rows' ? report.rows.length
          : row.key === 'lines' ? report.rows.reduce((sum, r) => sum + r.lines.length, 0)
            : row.key === 'lineage' && report.lineageCounts ? report.lineageCounts.followUpRequests : undefined,
      })),
      active: view,
      ariaLabel: 'Information-request register views',
      onSelect: (key) => ctx.navigate?.(`${RQR_HREF}?view=${key}`),
    }),
    view === 'rows' ? rowsView(ctx, report, candidates, onDone) : null,
    view === 'lines' ? linesView(ctx, report, candidates, onDone) : null,
    view === 'lineage' ? lineageView(ctx, report) : null,
    view === 'counts' ? countsView(report) : null,
    view === 'refusals' ? refusalsView(report) : null,
    view === 'method' ? methodView() : null,
  );
}

export default renderInformationRequests;
