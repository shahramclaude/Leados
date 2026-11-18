/**
 * app/views/caseToAnswer.js — `#/fair-process`, the Fair-Process Discipline &
 * Grievance Register (ADR-0254, Schema v207).
 *
 * ONE reader (`buildCaseToAnswer`) stands behind every state this page prints. The
 * page formats what the reader returned; it derives no state, no verdict, no
 * sanction, no ladder rung and no appeal outcome of its own.
 *
 * THE FIVE THINGS THIS SCREEN KEEPS APART
 *  - the CASE and the STANDARD OF PROOF it was opened on — printed on every
 *    finding, so a case cannot quietly change its own burden;
 *  - the WRITTEN ALLEGATION and the written standard each one is tested against,
 *    with the evidence reference — never a summary of "what people are saying";
 *  - the INDEPENDENCE and SENIORITY of the hands that act — computed from the live
 *    graph on every read, with the reason printed when a hand no longer qualifies;
 *  - the FINDINGS and the DECISION — a finding is a verdict on the evidence, a
 *    decision is a sanction chosen from a ladder, and the ladder rung the person's
 *    own record computes is printed beside the rung chosen;
 *  - the DECISION and the APPEAL — the decision row is never rewritten, and an
 *    appeal outcome by a different strictly senior hand stands beside it.
 *
 * WHAT THE SCREEN REFUSES TO SAY. It does not say anybody is guilty because a case
 * was opened; it does not say a case is closed because time passed; it does not
 * print "no issues" where the record is silent; and it never rates, ranks or scores
 * a person, a manager or a line. It also prints, in the banner, that seats are
 * workflow declarations rather than authentication.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import { exportWorkspaceCsv } from '../core/csv.js';
import {
  DGI_ALLEGATION_CLASSES,
  DGI_ALLEGATION_CLASS_BY_KEY,
  DGI_BOUNDS,
  DGI_CASE_KINDS,
  DGI_CASE_KIND_BY_KEY,
  DGI_CSV_SCOPE,
  DGI_DIRECTION_KINDS,
  DGI_DIRECTION_KIND_BY_KEY,
  DGI_FINDING_BY_KEY,
  DGI_FINDINGS,
  DGI_HREF,
  DGI_LIMITS as L,
  DGI_METHOD,
  DGI_REVIEW_STATE_BY_KEY,
  DGI_SANCTIONS,
  DGI_SANCTION_BY_KEY,
  DGI_STANDARD_BY_KEY,
  DGI_STANDARDS,
  DGI_WITHDRAWAL_REASON_BY_KEY,
  DGI_WITHDRAWAL_REASONS,
} from '../core/domain/caseToAnswerRegistry.js';

const VIEWS = [
  { key: 'cases', label: 'Cases' },
  { key: 'worklist', label: 'My duties' },
  { key: 'ladder', label: 'Consistency' },
  { key: 'method', label: 'Method & limits' },
];

const TONE = { bad: 'bad', warn: 'caution', good: 'good', neutral: 'neutral' };
const options = (rows, { blank = null } = {}) => [
  ...(blank ? [{ value: '', label: blank }] : []),
  ...rows.map((row) => ({ value: row.key, label: row.label })),
];
const todayIso = () => new Date().toISOString().slice(0, 10);
const stateLabel = (key) => DGI_REVIEW_STATE_BY_KEY[key]?.label || 'Unreadable state';
const personName = (report, personId) => {
  if (!personId) return 'nobody';
  const row = (report.rows || []).flatMap((item) => item.parties || []).find((party) => party.personId === personId);
  return row?.name || personId;
};

function button(label, onClick, { primary = false, testid = null } = {}) {
  return h('button', {
    type: 'button',
    class: `btn btn-small ${primary ? 'btn-primary' : 'btn-ghost'}`,
    ...(testid ? { 'data-testid': testid } : {}),
    onClick,
  }, label);
}

function showResult(result, onDone, successText) {
  if (!result?.ok) {
    toast(result?.error || 'The fair-process action was refused. Nothing was saved.', 'bad');
    return false;
  }
  closeAllModals();
  toast(result.warning || successText, result.warning ? 'warn' : 'good');
  onDone?.();
  return true;
}

const fieldError = (form, result) => {
  if (result?.field && typeof form.setFieldError === 'function') form.setFieldError(result.field, result.error || '');
};

/* ------------------------------------------------------------------ dialogs */

/**
 * THE ALLEGATION BUILDER IS ITS OWN CONTROL, because an allegation carries four
 * required facts and `buildForm` renders a static field list. Adding an allegation
 * is a button that appends a numbered block; the submit reads the blocks back and
 * refuses any incomplete one before the action is called.
 */
function allegationBuilder() {
  const container = h('div', { class: 'stack' });
  const blocks = [];
  let seq = 0;

  const addBlock = () => {
    seq += 1;
    const index = seq;
    const classSelect = h('select', { name: `allegation-${index}-class`, 'aria-label': `Allegation ${index} class` },
      h('option', { value: '' }, 'Choose the class'),
      ...DGI_ALLEGATION_CLASSES.map((row) => h('option', { value: row.key }, row.label)));
    const statement = h('textarea', { rows: 3, name: `allegation-${index}-statement`, 'aria-label': `Allegation ${index} — what is said to have happened`, placeholder: `At least ${L.textMin} characters.` });
    const standardRef = h('input', { type: 'text', name: `allegation-${index}-standardRef`, 'aria-label': `Allegation ${index} — reference of the written standard it is tested against` });
    const standardText = h('textarea', { rows: 2, name: `allegation-${index}-standardText`, 'aria-label': `Allegation ${index} — the standard in written terms` });
    const evidenceRef = h('input', { type: 'text', name: `allegation-${index}-evidenceRef`, 'aria-label': `Allegation ${index} — evidence reference` });
    const remove = h('button', {
      type: 'button', class: 'btn btn-small btn-ghost',
      onClick: () => { block.remove(); const at = blocks.indexOf(entry); if (at >= 0) blocks.splice(at, 1); },
    }, 'Remove this allegation');
    const block = h('div', { class: 'stack', 'data-allegation': String(index) },
      h('h4', null, `Allegation ${index}`),
      h('label', { class: 'field-label' }, h('span', null, 'Class'), classSelect),
      h('label', { class: 'field-label' }, h('span', null, 'What is said to have happened'), statement),
      h('label', { class: 'field-label' }, h('span', null, 'Written standard reference'), standardRef),
      h('label', { class: 'field-label' }, h('span', null, 'The standard, in written terms'), standardText),
      h('label', { class: 'field-label' }, h('span', null, 'Evidence reference'), evidenceRef),
      remove);
    const entry = { index, classSelect, statement, standardRef, standardText, evidenceRef, block };
    blocks.push(entry);
    container.appendChild(block);
  };
  addBlock();
  const add = h('button', { type: 'button', class: 'btn btn-small', onClick: addBlock, 'data-testid': 'dgi-add-allegation' }, 'Add another allegation');
  const node = h('div', { class: 'stack' },
    banner({
      tone: 'caution',
      title: 'Every allegation carries its own written standard and its own evidence',
      body: 'An allegation with no written standard has nothing to fall short of, and one with no evidence reference is a rumour with a date on it. This screen will refuse to open the case without both.',
    }),
    container, add);
  const read = () => blocks.map((entry) => ({
    classKey: entry.classSelect.value,
    statement: entry.statement.value,
    standardRef: entry.standardRef.value,
    standardText: entry.standardText.value,
    evidenceRef: entry.evidenceRef.value,
  }));
  return { node, read };
}

function openCaseDialog(ctx, candidates, onDone) {
  if (!candidates.length) {
    toast('This seat holds no roster person, so it cannot name a subject. Nothing was opened.', 'bad');
    return;
  }
  const builder = allegationBuilder();
  const form = buildForm([
    { name: 'caseRef', label: 'Case reference', type: 'text', required: true, help: `The reference this case is known by (${L.shortMin}–${L.shortMax} characters). One case per matter.` },
    { name: 'caseKind', label: 'What kind of case', type: 'select', required: true, options: options(DGI_CASE_KINDS, { blank: 'Choose the case kind' }), help: DGI_CASE_KINDS.map((row) => `${row.label}: ${row.says}`).join(' ') },
    { name: 'subjectId', label: 'The subject of the case', type: 'select', required: true, options: candidates.map((row) => ({ value: row.id, label: `${row.name}${row.role ? ` — ${row.role}` : ''}` })), help: 'The person the case is about. Their manager cannot investigate, decide or hear an appeal.' },
    { name: 'raisedById', label: 'Who raised it (leave blank where nobody is named)', type: 'select', options: options(candidates.map((row) => ({ value: row.id, label: row.name })), { blank: 'Nobody is named' }), help: 'One person cannot be both the subject and the person who raised it; the door refuses that.' },
    { name: 'standardOfProof', label: 'Standard of proof', type: 'select', required: true, options: options(DGI_STANDARDS, { blank: 'Choose the standard' }), value: 'balance-of-probabilities', help: 'FIXED AT OPENING. A case that moves its own burden after seeing the evidence has changed the test.' },
    { name: 'basisRef', label: 'Written basis reference', type: 'text', required: true, help: `At least ${L.refMin} characters — the procedure, instruction or report this case rests on.` },
    { name: 'basisText', label: 'The basis in one line (optional)', type: 'textarea', rows: 2, help: 'Optional. What the reference says, for a reader who does not hold the document.' },
    { name: 'openedOn', label: 'Day opened', type: 'date', required: true, value: todayIso(), help: 'The day the case was opened, not the day it was typed.' },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.dgiOpen({ ...values, allegations: builder.read() });
    if (!result?.ok) {
      fieldError(form, result);
      toast(result?.error || 'The case was refused.', 'bad');
      return;
    }
    showResult(result, onDone, 'Case opened. No investigator is assigned yet, and nothing has been decided.');
  };
  openModal({
    title: 'Open a fair-process case',
    description: 'One matter, one standard of proof, and at least one written allegation against a written standard.',
    size: 'lg',
    body: h('div', { class: 'stack' },
      banner({
        tone: 'info',
        title: 'A case is a record of a written allegation — not a finding',
        body: 'Opening a case decides nothing about anybody. The register refuses to proceed without an investigator independent of both parties and strictly senior to the subject, and every finding is a separate dated act on the case’s own standard.',
      }),
      form.node,
      h('h3', null, 'The allegations'),
      builder.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Open case', onClick: submit, primary: true }],
  });
}

function assignDialog(ctx, row, candidates, onDone) {
  const form = buildForm([
    { name: 'investigatorId', label: 'Investigator', type: 'select', required: true, options: candidates.map((item) => ({ value: item.id, label: `${item.name}${item.role ? ` — ${item.role}` : ''}` })), help: 'The door recomputes independence from BOTH parties and strict seniority over the subject on the live graph. A hand that fails either test is refused, whatever this list shows.' },
    { name: 'termsRef', label: 'Terms of reference reference', type: 'text', required: true, help: `At least ${L.refMin} characters. An investigator without written terms is investigating something nobody defined.` },
    { name: 'termsText', label: 'What they are asked to decide', type: 'textarea', rows: 3, required: true, help: `At least ${L.textMin} characters.` },
    { name: 'assignedOn', label: 'Day assigned', type: 'date', required: true, value: todayIso() },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.dgiAssignInvestigator({ caseId: row.case.id, ...form.getValues() });
    if (!result?.ok) {
      fieldError(form, result);
      toast(result?.error || 'The assignment was refused.', 'bad');
      return;
    }
    showResult(result, onDone, 'Investigator assigned. Their independence and seniority were computed from the live graph, not taken on trust.');
  };
  openModal({
    title: `Assign an investigator — ${row.case.caseRef}`,
    description: 'Nobody decides their own case: the hand must hold neither party and must be able to conclude above the subject.',
    size: 'lg',
    body: h('div', { class: 'stack' },
      banner({
        tone: 'caution',
        title: 'Independence is computed, not declared',
        body: row.case.raisedById
          ? 'The investigator must hold neither the subject nor the person who raised the case on any active line, must not be held by either of them, and must be strictly senior to the subject.'
          : 'The investigator must hold neither the subject nor be held by them, and must be strictly senior to the subject.',
      }),
      form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Assign', onClick: submit, primary: true }],
  });
}

function directionDialog(ctx, row, onDone) {
  const form = buildForm([
    { name: 'kind', label: 'Which direction', type: 'select', required: true, options: options(DGI_DIRECTION_KINDS, { blank: 'Choose the direction' }), help: DGI_DIRECTION_KINDS.map((item) => `${item.label}: ${item.says}`).join(' ') },
    { name: 'note', label: 'What was recorded', type: 'textarea', rows: 3, required: true, help: `At least ${L.textMin} characters.` },
    { name: 'recordedOn', label: 'Day', type: 'date', required: true, value: todayIso() },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.dgiRecordDirection({ caseId: row.case.id, ...form.getValues() });
    if (!result?.ok) {
      fieldError(form, result);
      toast(result?.error || 'The direction was refused.', 'bad');
      return;
    }
    showResult(result, onDone, 'Direction recorded. An interim measure is never a sanction and never a finding.');
  };
  openModal({
    title: `Record a direction — ${row.case.caseRef}`,
    description: 'The safeguard the procedure owes: the subject told, a companion offered, an interim measure, a recusal.',
    body: form.node,
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record', onClick: submit, primary: true }],
  });
}

function findingDialog(ctx, row, onDone) {
  const open = (row.allegations || []).filter((item) => !item.finding);
  if (!open.length) {
    toast('Every allegation on this case already carries a written finding. A revision is a new case, never a silent overwrite.', 'bad');
    return;
  }
  const form = buildForm([
    { name: 'allegationId', label: 'Which allegation', type: 'select', required: true, options: open.map((item) => ({ value: item.allegation.id, label: `#${item.allegation.sequence || '—'} ${DGI_ALLEGATION_CLASS_BY_KEY[item.allegation.classKey]?.label || item.allegation.classKey}` })), help: 'One finding per allegation. This case’s standard of proof applies to every finding in it.' },
    { name: 'outcome', label: 'Finding', type: 'select', required: true, options: options(DGI_FINDINGS, { blank: 'Choose the finding' }), help: DGI_FINDINGS.map((item) => `${item.label}: ${item.says}`).join(' ') },
    { name: 'reason', label: 'Written reason', type: 'textarea', rows: 3, required: true, help: `At least ${L.textMin} characters. A verdict with no written reason cannot be appealed and cannot be reviewed.` },
    { name: 'evidenceRef', label: 'Evidence reference', type: 'text', required: true, help: `At least ${L.refMin} characters.` },
    { name: 'foundOn', label: 'Day of the finding', type: 'date', required: true, value: todayIso() },
    { name: 'standardOfProof', label: 'Standard of proof applied', type: 'static', value: DGI_STANDARD_BY_KEY[row.case.standardOfProof]?.label || row.case.standardOfProof, help: 'Declared at opening and fixed. The door refuses a finding on any other standard.' },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.dgiRecordFinding({ caseId: row.case.id, ...form.getValues() });
    if (!result?.ok) {
      fieldError(form, result);
      toast(result?.error || 'The finding was refused.', 'bad');
      return;
    }
    showResult(result, onDone, 'Finding recorded. It is a verdict on the evidence, not a sanction.');
  };
  openModal({
    title: `Record a written finding — ${row.case.caseRef}`,
    description: `Standard of proof: ${DGI_STANDARD_BY_KEY[row.case.standardOfProof]?.label || row.case.standardOfProof}`,
    size: 'lg',
    body: h('div', { class: 'stack' },
      banner({
        tone: 'info',
        title: 'The finding is one allegation at a time',
        body: 'Each allegation gets its own written finding. The register never infers a finding from the presence of evidence, and never accepts a finding on a standard the case did not declare.',
      }),
      form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record finding', onClick: submit, primary: true }],
  });
}

function decisionDialog(ctx, row, onDone) {
  const ladder = row.ladder;
  const form = buildForm([
    { name: 'sanction', label: 'Sanction from the declared ladder', type: 'select', required: true, options: options(DGI_SANCTIONS, { blank: 'Choose the rung' }), help: DGI_SANCTIONS.map((item) => `${item.label} (rung ${item.rank}): ${item.says}`).join(' ') },
    { name: 'reason', label: 'Written reason', type: 'textarea', rows: 3, required: true, help: `At least ${L.textMin} characters.` },
    { name: 'decidedOn', label: 'Day of the decision', type: 'date', required: true, value: todayIso() },
    { name: 'expiresOn', label: 'Warning expiry (optional)', type: 'date', help: 'Where the rung carries an end, declare it. Nothing is defaulted: a warning with no declared expiry is printed as having none.' },
    { name: 'effectiveOn', label: 'Effective day (required for a dismissal)', type: 'date', help: 'A dismissal with no effective day has no clock, and the limitation register cannot derive an accrual from it.' },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.dgiDecideSanction({ caseId: row.case.id, ...form.getValues() });
    if (!result?.ok) {
      fieldError(form, result);
      toast(result?.error || 'The decision was refused.', 'bad');
      return;
    }
    showResult(result, onDone, 'Decision recorded.');
  };
  openModal({
    title: `Decide the sanction — ${row.case.caseRef}`,
    description: 'A hand strictly senior to the investigator, on a declared ladder, with the consistency reading printed beside it.',
    size: 'lg',
    body: h('div', { class: 'stack' },
      ladder ? banner({
        tone: ladder.isDeparture ? 'caution' : 'info',
        title: ladder.isDeparture ? 'This case’s chosen rung departs from the computed ladder' : 'The ladder from this person’s own record',
        body: ladder.previous
          ? `The most recent live sanction of the same class is ${DGI_SANCTION_BY_KEY[ladder.previous.sanction]?.label || ladder.previous.sanction} (rung ${ladder.previousRank}), decided ${ladder.previous.decidedOn}. The lowest declared rung above it is ${ladder.computed?.label || 'n/a'} (rung ${ladder.computedRank}).`
          : `No live sanction of the same class is on this person’s record, so the computed rung is ${ladder.computed?.label || 'n/a'} (rung ${ladder.computedRank}). A decision to impose nothing is a decision and is printed as a departure with its reason.`,
      }) : null,
      form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record decision', onClick: submit, primary: true }],
  });
}

function appealDialog(ctx, row, onDone) {
  const form = buildForm([
    { name: 'grounds', label: 'Grounds of the appeal', type: 'textarea', rows: 3, required: true, help: `At least ${L.textMin} characters. An appeal with no stated grounds asks a senior hand to re-decide without saying what was wrong.` },
    { name: 'lodgedOn', label: 'Day lodged', type: 'date', required: true, value: todayIso(), help: row.appealDaysLeft !== null && row.appealDaysLeft >= 0 ? `The declared window closes in ${row.appealDaysLeft} whole day(s). A late appeal is kept and printed as late.` : 'The declared window has closed; an appeal lodged now is kept and printed as late.' },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.dgiLodgeAppeal({ caseId: row.case.id, ...form.getValues() });
    if (!result?.ok) {
      fieldError(form, result);
      toast(result?.error || 'The appeal was refused.', 'bad');
      return;
    }
    showResult(result, onDone, 'Appeal lodged. It now waits for a different hand strictly senior to the decision-maker.');
  };
  openModal({
    title: `Lodge an appeal — ${row.case.caseRef}`,
    description: 'The decision below stands unless and until a different senior hand decides otherwise.',
    body: form.node,
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Lodge appeal', onClick: submit, primary: true }],
  });
}

function appealDecisionDialog(ctx, row, onDone) {
  const form = buildForm([
    { name: 'outcome', label: 'Appeal outcome', type: 'select', required: true, options: options([{ key: 'allowed', label: 'Allowed — the sanction is removed' }, { key: 'refused', label: 'Refused — the decision stands' }, { key: 'varied', label: 'Varied — a substituted sanction' }], { blank: 'Choose the outcome' }), help: 'The decision below is never rewritten. Allowing removes the sanction; refusing leaves it standing; varying substitutes another.' },
    { name: 'sanction', label: 'Substituted sanction (a varied appeal only)', type: 'select', options: options(DGI_SANCTIONS, { blank: 'None — not a variation' }) },
    { name: 'reason', label: 'Written reason', type: 'textarea', rows: 3, required: true, help: `At least ${L.textMin} characters.` },
    { name: 'decidedOn', label: 'Day decided', type: 'date', required: true, value: todayIso() },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.dgiDecideAppeal({ caseId: row.case.id, ...values, sanction: values.sanction || null });
    if (!result?.ok) {
      fieldError(form, result);
      toast(result?.error || 'The appeal decision was refused.', 'bad');
      return;
    }
    showResult(result, onDone, 'Appeal decided. The appeal outcome stands.');
  };
  openModal({
    title: `Decide the appeal — ${row.case.caseRef}`,
    description: 'A different hand, strictly senior to the decision-maker. The action refuses the hand that decided the case.',
    size: 'lg',
    body: h('div', { class: 'stack' },
      banner({
        tone: 'caution',
        title: 'An appeal decided by the person who decided the case is not an appeal',
        body: 'The door recomputes this: the appeal decider must be a different seat AND strictly senior to the decision-maker on the live graph, and independent of both parties.',
      }),
      form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Decide appeal', onClick: submit, primary: true }],
  });
}

function withdrawDialog(ctx, row, onDone) {
  const form = buildForm([
    { name: 'reasonKey', label: 'Reason', type: 'select', required: true, options: options(DGI_WITHDRAWAL_REASONS, { blank: 'Choose the reason' }), help: DGI_WITHDRAWAL_REASONS.map((item) => `${item.label}: ${item.says}`).join(' ') },
    { name: 'successorRef', label: 'Case that replaced it (superseded only)', type: 'text', help: `Required where the case was superseded. “Superseded” with no reference is the case quietly disappearing.` },
    { name: 'basis', label: 'Written basis', type: 'textarea', rows: 3, required: true, help: `At least ${L.textMin} characters.` },
    { name: 'withdrawnOn', label: 'Day', type: 'date', required: true, value: todayIso() },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.dgiWithdraw({ caseId: row.case.id, ...form.getValues() });
    if (!result?.ok) {
      fieldError(form, result);
      toast(result?.error || 'The withdrawal was refused.', 'bad');
      return;
    }
    showResult(result, onDone, 'Withdrawal recorded. No finding was made and the subject is not cleared.');
  };
  openModal({
    title: `Withdraw the case — ${row.case.caseRef}`,
    description: 'A withdrawal is a decision with a reason. It is never a clearance of the subject.',
    body: form.node,
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record withdrawal', onClick: submit, primary: true }],
  });
}

/* ------------------------------------------------------------------- panels */

function summaryCard(report) {
  const t = report.totals;
  const a = report.attention || {};
  // THREE states, and they are not the same statement: a withheld figure is
  // withheld by the privacy floor, and a figure that is neither a number nor
  // `null` is a DEFECT — it prints as an em dash so a missing count can never
  // disguise itself as a deliberate withholding.
  const show = (value) => (value === null ? 'withheld' : value === undefined ? '—' : value);
  // One printed figure, addressable by name. A withheld figure says "withheld" and
  // never prints a number, so the check can tell a real zero from a floor.
  const count = (testid, value) => h('span', { 'data-testid': testid }, String(value));
  return card({
    title: 'The register at a glance',
    subtitle: `As at ${report.asOf} · ${report.detailed ? 'detailed reading' : 'aggregate reading — counts and reasons only'}`,
    // EVERY figure the card prints carries its own testid, on a wrapper span —
    // `stat()` accepts no testid and silently drops one, so a figure named only by
    // its surrounding card cannot be addressed by a check. The displayed count is
    // therefore addressable one figure at a time, which is what "displayed equals
    // stored" has to mean.
    body: h('div', { class: 'grid grid-4', 'data-testid': 'dgi-summary' },
      stat({ label: 'Cases', value: count('dgi-stat-cases', show(t.cases)), hint: `${show(t.open)} still moving` }),
      // THE OWED FIGURES COME FROM `attention`, NOT FROM `totals`. `totals` carries
      // eighteen published counts and not one of them is an owed count; reading
      // `totals.decisionOwed` printed the literal word "undefined" on the card. The
      // owed counts are `attention.*` and they are the reader's own derivation of
      // what the procedure still needs, so the card reads them there.
      stat({ label: 'Findings owed', value: count('dgi-stat-findings-owed', show((a.assignmentOwedN || 0) + (a.findingsOwedN || 0))), hint: 'waiting on the procedure', tone: 'caution' }),
      stat({ label: 'Decisions owed', value: count('dgi-stat-decision-owed', show(a.decisionOwedN || 0)), hint: 'findings complete, no decision', tone: 'caution' }),
      stat({ label: 'Record conflicts', value: count('dgi-stat-conflicts', show(t.recordConflict)), hint: 'acts out of fair order', tone: t.recordConflict ? 'bad' : '' }),
      stat({ label: 'Upheld', value: count('dgi-stat-upheld', show(t.upheld)), hint: `${show(t.notUpheld)} found not upheld` }),
      stat({ label: 'Appeals open', value: count('dgi-stat-appeals', show(t.appealLodged)), hint: `${show(t.appealDecided)} decided` }),
      stat({ label: 'Ladder departures', value: count('dgi-stat-departures', show(t.ladderDeparture)), hint: 'printed with their reasons', tone: t.ladderDeparture ? 'caution' : '' }),
      stat({ label: 'Investigator invalid', value: count('dgi-stat-investigator-invalid', show(t.investigatorInvalid)), hint: 'no longer independent or senior', tone: t.investigatorInvalid ? 'bad' : '' }),
    ),
  });
}

function allegationBlock(item, row) {
  const finding = item.finding;
  return h('div', { class: 'stack', style: 'border-left: 3px solid var(--border); padding-left: 12px;' },
    h('p', { class: 'small' },
      h('strong', null, `#${item.allegation.sequence || '—'} ${DGI_ALLEGATION_CLASS_BY_KEY[item.allegation.classKey]?.label || item.allegation.classKey}: `),
      item.allegation.statement),
    h('p', { class: 'small muted' }, `Tested against ${item.allegation.standardRef}: ${item.allegation.standardText}`),
    h('p', { class: 'small muted' }, `Evidence: ${item.allegation.evidenceRef}`),
    finding
      ? h('p', { class: 'small' },
        badge(DGI_FINDING_BY_KEY[finding.outcome]?.label || finding.outcome, item.reliable ? 'neutral' : 'bad'),
        ` recorded ${finding.foundOn} on ${DGI_STANDARD_BY_KEY[finding.standardOfProof]?.label || finding.standardOfProof}. ${finding.reason}`)
      : h('p', { class: 'small text-warn' }, 'No written finding is recorded against this allegation yet.'),
    finding && !item.reliable
      ? h('p', { class: 'small text-bad' },
        item.standardMismatch
          ? 'This finding applies a standard of proof the case did not declare, so it does not count. A finding on a different burden has changed the test.'
          : 'This finding does not count: it was not recorded by the independent investigator the live graph supports, so it cannot be relied on. The row is kept and printed rather than deleted.')
      : null);
}

function caseCard(ctx, report, row, onDone) {
  const c = row.case;
  const candidates = safeCandidates(ctx);
  const acts = [];
  if (row.canAssign) acts.push(button('Assign an investigator', () => assignDialog(ctx, row, candidates, onDone), { primary: true, testid: `dgi-assign-${c.caseRef}` }));
  if (row.canFind) acts.push(button('Record a finding', () => findingDialog(ctx, row, onDone), { primary: true, testid: `dgi-find-${c.caseRef}` }));
  if (row.canDecide) acts.push(button('Decide the sanction', () => decisionDialog(ctx, row, onDone), { primary: true, testid: `dgi-decide-${c.caseRef}` }));
  if (row.canLodge) acts.push(button('Lodge an appeal', () => appealDialog(ctx, row, onDone), { testid: `dgi-appeal-${c.caseRef}` }));
  if (row.canDecideAppeal) acts.push(button('Decide the appeal', () => appealDecisionDialog(ctx, row, onDone), { primary: true, testid: `dgi-appeal-decide-${c.caseRef}` }));
  if (!row.terminal && !row.decision) acts.push(button('Withdraw', () => withdrawDialog(ctx, row, onDone), { testid: `dgi-withdraw-${c.caseRef}` }));
  if (row.state.key !== 'record-conflict') acts.push(button('Record a direction', () => directionDialog(ctx, row, onDone), { testid: `dgi-direction-${c.caseRef}` }));

  const parties = (row.parties || []).map((party) => `${party.name || party.personId} (${party.role})${party.onGraph ? '' : ' — no longer on the graph'}`).join(' · ');
  const apexLabel = row.authority.apexIds.length
    ? row.authority.apexIds.map((id) => personName(report, id)).join(', ')
    : 'no resolvable joint seat';

  return card({
    title: `${c.caseRef} — ${DGI_CASE_KIND_BY_KEY[c.caseKind]?.label || c.caseKind}`,
    subtitle: `${parties} · opened ${c.openedOn} · basis ${c.basisRef} · standard: ${DGI_STANDARD_BY_KEY[c.standardOfProof]?.label || c.standardOfProof}`,
    actions: h('div', { class: 'row gap-2' }, badge(row.state.label, TONE[row.state.tone] || 'neutral'), ...acts),
    body: h('div', { class: 'stack' },
      h('p', null, row.state.says),
      row.nextOwed
        ? h('p', { class: 'small' }, `Owed next: ${row.nextOwed.key.replace(/-/g, ' ')}${Number.isInteger(row.nextOwed.owedN) ? ` (${row.nextOwed.owedN} owed)` : ''}${Number.isInteger(row.nextOwed.daysLeft) ? ` · ${row.nextOwed.daysLeft} whole day(s) left in the window` : ''} — to ${row.nextOwed.to?.length ? row.nextOwed.to.map((id) => personName(report, id)).join(', ') : 'a seat the graph cannot resolve'}.`)
        : null,
      h('div', { class: 'stack' }, ...(row.allegations || []).map((item) => allegationBlock(item, row))),
      row.investigator
        ? h('p', { class: 'small' },
          `Investigator: ${personName(report, row.investigator.investigatorId)} from ${row.investigator.assignedOn}, on terms ${row.investigator.termsRef}. `,
          row.investigatorValid
            ? h('span', null, 'Computed independent of both parties and strictly senior to the subject on the live graph.')
            : h('span', { class: 'text-bad' }, row.investigatorInvalidReason || 'This investigator no longer passes the independence or seniority test.'))
        : h('p', { class: 'small text-warn' }, 'No investigator is assigned. Nothing on this case has been looked into yet.'),
      row.directions.length
        ? h('p', { class: 'small muted' }, `Directions recorded: ${row.directions.map((item) => DGI_DIRECTION_KIND_BY_KEY[item.kind]?.label || item.kind).join(' · ')}.`)
        : h('p', { class: 'small muted' }, 'No direction is recorded — the register cannot say whether the subject was informed or a companion offered.'),
      row.decision
        ? h('div', { class: 'stack' },
          h('p', { class: 'small' }, `Decision ${row.decision.decidedOn}: ${DGI_SANCTION_BY_KEY[row.decision.sanction]?.label || row.decision.sanction} by ${personName(report, row.decision.decidedById)}. ${row.decision.reason}`),
          row.decision.expiresOn ? h('p', { class: 'small muted' }, `Declared expiry: ${row.decision.expiresOn}.`) : null,
          row.decision.effectiveOn ? h('p', { class: 'small muted' }, `Effective day of termination: ${row.decision.effectiveOn} — the accrual the limitation register reads.`) : null,
          row.ladder
            ? h('p', { class: 'small' },
              `Consistency: rung ${row.ladder.chosenRank} chosen, rung ${row.ladder.computedRank} computed from this person’s own live record (${row.ladder.computed?.label || 'n/a'}).`,
              row.ladder.isDeparture ? h('span', { class: 'text-warn' }, ` Departure of ${row.ladder.departure > 0 ? '+' : ''}${row.ladder.departure} printed and counted.`) : h('span', null, ' No departure.'))
            : null)
        : null,
      row.appeal
        ? h('div', { class: 'stack' },
          h('p', { class: 'small' }, `Appeal lodged ${row.appeal.lodgedOn} by ${personName(report, row.appeal.lodgedById)}${row.appealLate ? ' — AFTER the declared window, kept and printed as late' : ''}. Grounds: ${row.appeal.grounds}`),
          row.appealOutcome
            ? h('p', { class: 'small' },
              `Appeal ${row.appealOutcome.outcome} on ${row.appealOutcome.decidedOn} by ${personName(report, row.appealOutcome.decidedById)}. ${row.appealOutcome.reason}`,
              row.appealOutcome.sanction ? ` Substituted sanction: ${DGI_SANCTION_BY_KEY[row.appealOutcome.sanction]?.label || row.appealOutcome.sanction}.` : '',
              row.appealValid ? '' : ' This outcome does not stand: the hand that recorded it was not a different, strictly senior seat independent of both parties.')
            : h('p', { class: 'small text-warn' }, 'The appeal is lodged and undecided. The decision below stands until a different senior hand decides otherwise.'))
        : null,
      row.withdrawal
        ? h('p', { class: 'small' }, `Withdrawn ${row.withdrawal.withdrawnOn}: ${row.withdrawalReason?.label || row.withdrawal.reasonKey}${row.withdrawal.successorRef ? ` (replaced by ${row.withdrawal.successorRef})` : ''}. ${row.withdrawal.basis} No finding was made and the subject is not cleared.`)
        : null,
      row.conflicts.length
        ? h('div', { class: 'stack' }, ...row.conflicts.map((item) => h('p', { class: 'small text-bad' }, `Record conflict (${item.key}): ${item.detail}`)))
        : null,
      row.authority.resolved
        ? h('p', { class: 'small muted' }, `Joint decision seat above the lines holding the parties: ${apexLabel}${row.authority.ambiguous ? ' (a matrix tie — every one of them is asked)' : ''}.`)
        : h('p', { class: 'small text-bad' }, `No joint decision seat: ${row.authority.reason}`),
    ),
  });
}

function safeCandidates(ctx) {
  try { return (ctx.api.dgiCandidates ? ctx.api.dgiCandidates() : null)?.people || []; } catch { return []; }
}

function worklistView(report) {
  if (!report.worklist.length) {
    return emptyState({
      title: 'Nothing is waiting on this seat',
      body: 'No case this seat may read is waiting for its investigator, its findings, its decision, its appeal or its withdrawal. A case somebody else owes does not appear here.',
    });
  }
  return h('div', { class: 'stack' }, ...report.worklist.map((row) => card({
    title: `${row.case.caseRef} — ${row.state.label}`,
    subtitle: `${DGI_CASE_KIND_BY_KEY[row.case.caseKind]?.label || row.case.caseKind} · owed: ${row.nextOwed?.key?.replace(/-/g, ' ') || 'nothing this seat can act on'}`,
    body: h('p', { class: 'small' }, row.state.says),
  })));
}

/**
 * THE CONSISTENCY PANEL. This is the panel the register exists for: a director can
 * see, from the record alone, whether the same class of allegation produced the same
 * rung across the team — as counts and rates, never as a name.
 */
function ladderView(report) {
  if (!report.detailed) {
    return banner({ tone: 'info', title: 'Consistency is read at the manager altitude', body: report.disclosure.reason });
  }
  const decided = (report.rows || []).filter((row) => row.decision);
  if (!decided.length) {
    return emptyState({
      title: 'No decision has been made yet',
      body: 'The consistency reading compares the rung each decision chose against the rung the person’s own live record computes. With no decisions on the register there is nothing to compare, and the register does not print a reassuring zero.',
    });
  }
  const byClass = new Map();
  for (const row of decided) {
    for (const classKey of row.classKeys.length ? row.classKeys : ['unspecified']) {
      const bucket = byClass.get(classKey) || [];
      bucket.push(row);
      byClass.set(classKey, bucket);
    }
  }
  const rows = [...byClass.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([classKey, bucket]) => {
    const rungs = bucket.map((row) => row.ladder?.chosenRank).filter((value) => Number.isInteger(value));
    const departures = bucket.filter((row) => row.ladder?.isDeparture).length;
    return {
      classLabel: DGI_ALLEGATION_CLASS_BY_KEY[classKey]?.label || 'Class not on the closed list',
      decidedN: bucket.length,
      minRung: rungs.length ? Math.min(...rungs) : null,
      maxRung: rungs.length ? Math.max(...rungs) : null,
      departures,
      withheld: bucket.length < report.privacyFloor,
    };
  });
  return h('div', { class: 'stack', 'data-testid': 'dgi-ladder' },
    banner({
      tone: 'info',
      title: 'Like cases, like answers — computed, not promised',
      body: `The register computes the LOWEST declared rung above each person’s most recent live sanction of the same class, prints it beside the rung the decision-maker chose, and counts every departure. It never imposes the computed rung: a departure is permitted, recorded and visible. A class with fewer than ${report.privacyFloor} decided cases is withheld rather than shown as a rate nobody can read.`,
    }),
    card({
      title: 'Decisions by allegation class',
      subtitle: 'Counts and rung bands only. No person, case reference, sanction reason or date appears in this panel.',
      body: table({
        caption: 'Decision rungs by allegation class',
        columns: [
          { key: 'classLabel', label: 'Class' },
          { key: 'decidedN', label: 'Decided cases', className: 'num' },
          { key: 'minRung', label: 'Lowest rung', className: 'num' },
          { key: 'maxRung', label: 'Highest rung', className: 'num' },
          { key: 'departures', label: 'Departures from the ladder', className: 'num' },
        ],
        rows: rows.map((row) => ({
          ...row,
          decidedN: row.withheld ? 'withheld' : row.decidedN,
          minRung: row.withheld || row.minRung === null ? '—' : row.minRung,
          maxRung: row.withheld || row.maxRung === null ? '—' : row.maxRung,
          departures: row.withheld ? 'withheld' : row.departures,
        })),
        emptyMessage: 'No allegation class has a decided case on the record.',
      }),
    }));
}

function methodView() {
  return h('div', { class: 'stack', 'data-testid': 'dgi-method' },
    card({
      title: 'What this register proves, and what it cannot',
      subtitle: `${DGI_METHOD.engine} · ${DGI_METHOD.adr} · ${DGI_CSV_SCOPE}`,
      body: h('p', null, 'The two claims this screen keeps apart are *the acts a fair procedure requires are on the record, in that order, by hands able to make them* and *the outcome was just*. The first is computed here from dated human acts, the live reporting graph and a declared ladder. The second is never claimed: a register can show that nobody decided their own case, and it cannot make anybody whole.'),
    }),
    card({ title: 'Frameworks encoded', body: h('ul', { class: 'list' }, ...DGI_METHOD.frameworks.map((item) => h('li', null, item))) }),
    card({ title: 'What it prints', body: h('ul', { class: 'list' }, ...DGI_METHOD.printed.map((item) => h('li', null, item))) }),
    card({ title: 'Deliberately absent', body: h('ul', { class: 'list' }, ...DGI_METHOD.deliberatelyAbsent.map((item) => h('li', null, item))) }),
    card({
      title: 'Exports and limits',
      body: h('div', { class: 'stack' },
        h('p', { class: 'small' }, `The aggregate export (CSV scope “${DGI_CSV_SCOPE}”) carries counts only: no case reference, person, manager, allegation, written standard, finding, sanction reason, investigator or day. A non-zero count below the declared privacy floor is exported blank with a reason, never as a small number.`),
        h('p', { class: 'small muted' }, `Declared limits: ${L.cases} cases, ${L.allegations} allegations, ${L.investigators} investigator assignments, ${L.findings} findings, ${L.decisions} decisions, ${L.appeals} appeals, at most ${L.allegationsPerCaseMax} allegations on one case. Conventions: appeal window ${DGI_BOUNDS.dgiAppealWindowDays.min}–${DGI_BOUNDS.dgiAppealWindowDays.max} days, finding window ${DGI_BOUNDS.dgiFindingWindowDays.min}–${DGI_BOUNDS.dgiFindingWindowDays.max} days, privacy floor ${DGI_BOUNDS.dgiPrivacyFloor.min}–${DGI_BOUNDS.dgiPrivacyFloor.max}.`),
      ),
    }));
}

/* --------------------------------------------------------------------- page */

export function renderCaseToAnswer(ctx) {
  const requested = ctx.query?.get?.('view');
  const view = VIEWS.some((row) => row.key === requested) ? requested : 'cases';
  let result;
  try {
    result = ctx.api.dgiReport ? ctx.api.dgiReport() : null;
  } catch (error) {
    result = { ok: false, error: error?.message || 'Unknown error.' };
  }
  const onDone = () => ctx.refresh?.();
  const header = (extra = {}) => pageHeader({
    eyebrow: 'Manager altitude · frontline to mid-manager · single-chain and matrix',
    title: 'Nobody decides their own case',
    subtitle: 'One case at a time: the written allegation and the written standard it is tested against, an investigator independent of both parties and strictly senior to the subject, a written finding on the case’s own standard of proof, a sanction decision from a declared ladder by a hand senior to the investigator, and an appeal by a different senior hand. Every state is derived on read.',
    ...extra,
  });

  if (!result?.ok || !result.report?.totals) {
    return h('div', { class: 'page', 'data-testid': 'fair-process-panel' },
      header(),
      banner({ tone: 'bad', title: 'The register could not be read', body: result?.error || 'The declared seat refused the read.' }));
  }
  const report = result.report;
  const candidates = safeCandidates(ctx);
  const actions = [
    button('Open a case', () => openCaseDialog(ctx, candidates, onDone), { primary: true, testid: 'dgi-open' }),
    button('Export aggregate CSV', () => exportWorkspaceCsv(DGI_CSV_SCOPE), { testid: 'dgi-export' }),
    button('Conventions', () => {
      const form = buildForm([
        { name: 'dgiAutoPropagate', label: 'The rule may file dated asks', type: 'checkbox', value: report.conventions.dgiAutoPropagate, help: 'A pause is recorded and printed as unpermitted unless a permit is granted on the automation screen. A pause never hides a case from this screen.' },
        { name: 'dgiAppealWindowDays', label: 'Appeal window (days)', type: 'number', value: report.conventions.dgiAppealWindowDays, help: `A declared convention, ${DGI_BOUNDS.dgiAppealWindowDays.min}–${DGI_BOUNDS.dgiAppealWindowDays.max}. It is a workspace setting and never a statutory period.` },
        { name: 'dgiFindingWindowDays', label: 'Finding window (days)', type: 'number', value: report.conventions.dgiFindingWindowDays, help: `How long a written finding is expected within. A workspace convention, ${DGI_BOUNDS.dgiFindingWindowDays.min}–${DGI_BOUNDS.dgiFindingWindowDays.max}; it is never printed as a legal deadline.` },
        { name: 'dgiDecisionWindowDays', label: 'Decision window (days)', type: 'number', value: report.conventions.dgiDecisionWindowDays, help: `How long a decision is expected within after the findings. ${DGI_BOUNDS.dgiDecisionWindowDays.min}–${DGI_BOUNDS.dgiDecisionWindowDays.max}.` },
        { name: 'dgiPrivacyFloor', label: 'Privacy floor for exports', type: 'number', value: report.conventions.dgiPrivacyFloor, help: `Below this many cases a non-zero count is withheld in the export. ${DGI_BOUNDS.dgiPrivacyFloor.min}–${DGI_BOUNDS.dgiPrivacyFloor.max}.` },
      ]);
      const submit = () => {
        form.clearErrors();
        const values = form.getValues();
        const saved = ctx.api.dgiSetConventions({
          dgiAutoPropagate: values.dgiAutoPropagate === true,
          dgiAppealWindowDays: Number(values.dgiAppealWindowDays),
          dgiFindingWindowDays: Number(values.dgiFindingWindowDays),
          dgiDecisionWindowDays: Number(values.dgiDecisionWindowDays),
          dgiPrivacyFloor: Number(values.dgiPrivacyFloor),
        });
        if (!saved?.ok) {
          fieldError(form, saved);
          toast(saved?.error || 'The conventions were refused.', 'bad');
          return;
        }
        showResult(saved, onDone, 'Conventions saved.');
      };
      openModal({
        title: 'Fair-process conventions',
        description: 'There is no default sanction, default standard of proof or presumed outcome to set — every one of those is decided on the case.',
        body: form.node,
        footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Save', onClick: submit, primary: true }],
      });
    }, { testid: 'dgi-conventions' }),
  ];

  return h('div', { class: 'page', 'data-testid': 'fair-process-panel' },
    header({ actions }),
    ctx.persistError ? card({ body: h('p', { class: 'text-warn small' }, `Changes are not being saved: ${ctx.persistError}`) }) : null,
    banner({
      tone: 'caution',
      title: 'A record of what named people decided — never a finding about anybody, and never a substitute for a procedure',
      body: 'The register stores written allegations and dated human acts. It does not investigate, does not collect evidence, does not interview anybody and does not claim compliance with any statute or code. Seats are workflow declarations, not authentication: independence and seniority are computed from the reporting graph this workspace holds and printed, which is a rendering contract rather than a security boundary.',
    }),
    !report.detailed ? banner({ tone: 'info', title: 'Detail withheld at this altitude', body: report.disclosure.reason }) : null,
    report.matrixError ? banner({ tone: 'bad', title: 'The reporting graph could not be read', body: report.matrixError }) : null,
    ...(report.warnings || []).slice(0, 4).map((warning) => banner({ tone: 'caution', title: 'A stored row was refused or flagged', body: warning })),
    !report.balances.recordClean
      ? banner({
        tone: 'caution',
        title: 'The record is not clean, and this is printed rather than resolved',
        body: `${report.totals.recordConflict || 0} case(s) carry acts that cannot all be true in a fair order, ${report.totals.unreliableFindings || 0} finding(s) do not count, and ${report.totals.appealInvalid || 0} appeal outcome(s) were not recorded by a different senior seat. Each is kept on the record.`,
      })
      : null,
    summaryCard(report),
    tabs({
      items: VIEWS.map((row) => ({
        key: row.key,
        label: row.label,
        count: row.key === 'cases' ? report.totals.cases : row.key === 'worklist' ? report.worklist.length : undefined,
      })),
      active: view,
      ariaLabel: 'Fair-process register views',
      onSelect: (key) => ctx.navigate(`${DGI_HREF}?view=${key}`),
    }),
    view === 'cases'
      ? (report.rows.length
        ? h('div', { class: 'stack' }, ...report.rows.map((row) => caseCard(ctx, report, row, onDone)))
        : emptyState({
          title: 'No fair-process case is on the record',
          body: 'A case is opened for one matter, with the standard of proof it will be judged on and at least one written allegation against a written standard. Nothing here is inferred from an incident, a concern, an absence or a review.',
        }))
      : null,
    view === 'worklist' ? worklistView(report) : null,
    view === 'ladder' ? ladderView(report) : null,
    view === 'method' ? methodView() : null,
  );
}

export default renderCaseToAnswer;
