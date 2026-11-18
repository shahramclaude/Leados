/**
 * app/views/productNonconformance.js — `#/nonconformance`, the Product
 * Nonconformance & Disposition Register (ADR-0253, Schema v206).
 *
 * ONE reader (`buildProductNonconformance`) stands behind every state this page
 * prints. The page formats what the reader returned; it derives no state, no
 * containment verdict, no approval and no release of its own.
 *
 * THE FOUR THINGS THIS SCREEN KEEPS APART
 *  - the IDENTIFIED OUTPUT (one lot OR one serial, with its requirement, finding
 *    and source evidence) — never "some nonconforming product";
 *  - the CONTAINMENT ATTESTATION — what a named hand says was done, against a
 *    written hold reference. It is NOT a warehouse lock, and the banner says so;
 *  - the JOINT DISPOSITION — every minimal matrix apex signing the same
 *    disposition in the same round, with any disagreement printed rather than
 *    outvoted;
 *  - the RE-VERIFICATION and the RELEASE — a separate passing verification by a
 *    hand strictly senior to the one that did the rework, then a separate release
 *    act. Neither is inferred from the other.
 *
 * WHAT THE SCREEN REFUSES TO SAY. It does not say the lot is released because a
 * note says so, it does not print a majority disposition, it does not treat an
 * earlier `entire` containment as effective after a later partial one, and it
 * never rates a person, a line or a site.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState } from '../ui/components.js';
import { exportWorkspaceCsv } from '../core/csv.js';
import {
  QNC_ACT_KINDS,
  QNC_ACT_KIND_BY_KEY,
  QNC_CONTAINMENT_METHODS,
  QNC_CSV_SCOPE,
  QNC_DISPOSITIONS,
  QNC_HREF,
  QNC_IDENTIFIER_KINDS,
  QNC_IDENTIFIER_KIND_BY_KEY,
  QNC_LIMITS as L,
  QNC_METHOD,
  QNC_SOURCE_BY_KEY,
  QNC_SOURCES,
  QNC_SECTION_TITLES,
  QNC_STATE_BY_KEY,
} from '../core/domain/productNonconformanceRegistry.js';

const VIEWS = [
  { key: 'cases', label: QNC_SECTION_TITLES.cases },
  { key: 'worklist', label: QNC_SECTION_TITLES.worklist },
  { key: 'method', label: QNC_SECTION_TITLES.method },
];

const TONE = { bad: 'bad', warn: 'caution', good: 'good', neutral: 'neutral' };
const options = (rows, { blank = null } = {}) => [
  ...(blank ? [{ value: '', label: blank }] : []),
  ...rows.map((row) => ({ value: row.value, label: row.label })),
];
const todayIso = () => new Date().toISOString().slice(0, 10);
const stateLabel = (key) => QNC_STATE_BY_KEY[key]?.label || 'Unreadable state';

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
    toast(result?.error || 'The product-nonconformance action was refused. Nothing was saved.', 'bad');
    return false;
  }
  closeAllModals();
  toast(result.warning || successText, result.warning ? 'warn' : 'good');
  onDone?.();
  return true;
}

/* ------------------------------------------------------------------ dialogs */

function openCaseDialog(ctx, candidates, onDone) {
  if (!candidates.length) {
    toast('This seat holds no roster person, so it cannot name an accountable hand. Nothing was opened.', 'bad');
    return;
  }
  const form = buildForm([
    { name: 'caseRef', label: 'Case reference', type: 'text', required: true, help: `The reference this case is known by (${L.shortMin}–${L.shortMax} characters). One case per identified output.` },
    { name: 'productRef', label: 'Product or part', type: 'text', required: true },
    { name: 'siteRef', label: 'Site or plant', type: 'text', required: true },
    {
      name: 'identifierKind', label: 'What is identified', type: 'select', required: true,
      options: options(QNC_IDENTIFIER_KINDS.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose lot or serial' }),
      help: 'One case names ONE kind. The register never guesses the kind from the value.',
    },
    { name: 'identifierRef', label: 'Lot or serial identifier', type: 'text', required: true, help: `The identifier as it is written on the traveller, the label or the unit (${L.shortMin}–${L.shortMax} characters).` },
    { name: 'sourceKind', label: 'Source of the finding', type: 'select', required: true, options: options(QNC_SOURCES.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose a source' }) },
    { name: 'specRef', label: 'Requirement / specification reference', type: 'text', required: true, help: `At least ${L.refMin} characters. A finding is a finding against something written.` },
    { name: 'requirement', label: 'The requirement', type: 'textarea', rows: 2, required: true, help: `At least ${L.textMin} characters.` },
    { name: 'finding', label: 'What was observed', type: 'textarea', rows: 3, required: true, help: `At least ${L.textMin} characters. “Nonconforming” on its own is not an observation.` },
    { name: 'evidenceRef', label: 'Source evidence reference', type: 'text', required: true, help: `At least ${L.refMin} characters. The register stores a pointer, never the measurement itself.` },
    { name: 'identifiedOn', label: 'Day identified', type: 'date', required: true, value: todayIso(), help: 'The day the finding was made, not the day it was typed.' },
    {
      name: 'ownerIds', label: 'Accountable hands (one to four)', type: 'boolean-block', required: true,
      options: candidates.map((row) => ({ value: row.id, label: `${row.name}${row.role ? ` — ${row.role}` : ''}` })),
      help: 'Every hand answerable for this output across every reporting line. The disposition authority is computed above ALL of them, so name all of them.',
    },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.qncOpen({ ...values, ownerIds: values.ownerIds });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The case was refused.', 'bad');
      return;
    }
    showResult(result, onDone, 'Case opened. No containment is recorded yet, and nothing has been placed on hold by this screen.');
  };
  openModal({
    title: 'Open a product nonconformance case',
    description: 'One internally identified manufactured lot or serial. The case is an observation, not a hold.',
    size: 'lg',
    body: h('div', { class: 'stack' },
      banner({
        tone: 'caution',
        title: 'A case is a record of an observation',
        body: 'Opening a case does not stop a line, lock a warehouse or block a shipment. Until a containment attestation is on the record the register prints the lot as uncontained.',
      }),
      form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Open case', onClick: submit, primary: true }],
  });
}

function containmentDialog(ctx, row, onDone) {
  const form = buildForm([
    { name: 'scope', label: 'Scope of this attestation', type: 'select', required: true, options: options([{ value: 'entire', label: 'The WHOLE identified lot or serial' }, { value: 'partial', label: 'Only part of the identified output' }], { blank: 'Choose the scope' }), help: 'The NEWEST attestation governs: a later partial act leaves the case uncontained, even if an earlier one claimed the whole output.' },
    { name: 'method', label: 'Control actually applied', type: 'select', required: true, options: options(QNC_CONTAINMENT_METHODS.map((item) => ({ value: item.key, label: item.label })), { blank: 'Choose the control' }) },
    { name: 'scopeRef', label: 'Written hold reference', type: 'text', required: true, help: `At least ${L.refMin} characters — the quarantine sheet, the system block id, the stop notice.` },
    { name: 'evidenceRef', label: 'Evidence reference', type: 'text', required: true, help: `At least ${L.refMin} characters.` },
    { name: 'note', label: 'What was actually done', type: 'textarea', rows: 3, required: true, help: `At least ${L.textMin} characters.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.qncRecordContainment({ caseId: row.case.id, ...form.getValues() });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The containment was refused.', 'bad');
      return;
    }
    showResult(result, onDone, 'Containment attested. This is a record of what was said, not proof that the floor was cleared.');
  };
  openModal({
    title: `Attest containment — ${row.case.caseRef}`,
    description: 'Who says the identified output is under control, on which written reference, on what evidence.',
    size: 'lg',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'An attestation, not an enforced hold', body: 'This ledger has no connection to a warehouse, an MES or a shipping system. A recorded containment means a named hand attested the control and left a reference; it never means the system prevented a pick.' }),
      form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Attest containment', onClick: submit, primary: true }],
  });
}

function dispositionDialog(ctx, row, onDone) {
  const form = buildForm([
    { name: 'disposition', label: 'Disposition', type: 'select', required: true, options: options(QNC_DISPOSITIONS.map((item) => ({ value: item.key, label: item.label })), { blank: 'Choose a disposition' }), help: QNC_DISPOSITIONS.map((item) => `${item.label}: ${item.says}`).join(' ') },
    { name: 'reason', label: 'Written reason', type: 'textarea', rows: 3, required: true, help: `At least ${L.textMin} characters. A signature is a decision, and a decision is written.` },
    { name: 'concessionRef', label: 'Written concession reference (use-as-is only)', type: 'text', help: `Required for use-as-is; at least ${L.refMin} characters. Leave blank otherwise.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.qncSignDisposition({
      caseId: row.case.id,
      decisionRound: row.nextDecisionRound,
      disposition: values.disposition,
      reason: values.reason,
      concessionRef: values.concessionRef || null,
    });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The signature was refused.', 'bad');
      return;
    }
    showResult(result, onDone, 'Signature recorded. The disposition is authorised only when every required joint seat has signed the same one in this round.');
  };
  const apexNames = (row.authority.apexRows || []).map((item) => item.name || item.personId);
  openModal({
    title: `Sign the disposition — ${row.case.caseRef}`,
    description: `Round ${row.nextDecisionRound}. Every required joint seat must sign the same disposition: ${apexNames.join(', ') || 'the matrix apex could not be resolved'}.`,
    size: 'lg',
    body: h('div', { class: 'stack' },
      banner({ tone: 'caution', title: 'A partial signature set authorises nothing', body: 'Signatures are counted by hand, not by majority. Two different dispositions in one round are printed as a disagreement and nothing may be carried out.' }),
      form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Sign disposition', onClick: submit, primary: true }],
  });
}

function actDialog(ctx, row, onDone) {
  const allowed = (row.allowedActKinds || []);
  if (!allowed.length) {
    toast('The current state is not waiting for an act. Nothing to record.', 'bad');
    return;
  }
  const form = buildForm([
    { name: 'kind', label: 'Act', type: 'select', required: true, options: allowed.map((key) => ({ value: key, label: QNC_ACT_KIND_BY_KEY[key]?.label || key })), help: 'Only the act the derived state is waiting for is offered, and the action refuses anything else.' },
    { name: 'evidenceRef', label: 'Evidence reference', type: 'text', required: true, help: `At least ${L.refMin} characters.` },
    { name: 'note', label: 'What was done', type: 'textarea', rows: 3, required: true, help: `At least ${L.textMin} characters.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.qncRecordDispositionAct({ caseId: row.case.id, ...form.getValues() });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The act was refused.', 'bad');
      return;
    }
    showResult(result, onDone, 'Act recorded. A release is its own act and is never inferred from a rework.');
  };
  openModal({
    title: `Record the disposition act — ${row.case.caseRef}`,
    description: 'The act the authorised disposition requires, with its evidence.',
    size: 'lg',
    body: form.node,
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record act', onClick: submit, primary: true }],
  });
}

function verifyDialog(ctx, row, onDone) {
  const completion = row.currentCompletion;
  const form = buildForm([
    { name: 'outcome', label: 'Outcome', type: 'select', required: true, options: options([{ value: 'pass', label: 'Passed re-verification' }, { value: 'fail', label: 'Failed re-verification' }], { blank: 'Choose the outcome' }), help: 'The register never infers a verdict from the presence of evidence. A failure is kept and the output stays held.' },
    { name: 'evidenceRef', label: 'Re-verification evidence', type: 'text', required: true, help: `At least ${L.refMin} characters.` },
    { name: 'note', label: 'What was re-verified, and how', type: 'textarea', rows: 3, required: true, help: `At least ${L.textMin} characters.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.qncVerifyRework({ caseId: row.case.id, ...form.getValues() });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The re-verification was refused.', 'bad');
      return;
    }
    showResult(result, onDone, 'Re-verification recorded. A pass does not release the output; the release is a separate act.');
  };
  openModal({
    title: `Re-verify the rework — ${row.case.caseRef}`,
    description: 'Recorded by a hand strictly senior to the one that completed the rework. The action re-proves that on the live reporting graph.',
    size: 'lg',
    body: h('div', { class: 'stack' },
      banner({ tone: 'bad', title: 'The output is still held', body: `Re-verification is independent by construction: the verifier must be a DIFFERENT hand, strictly senior to ${completion?.performedById || 'the hand that did the rework'}. A peer, a subordinate or the person themselves cannot release this lot.` }),
      form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record re-verification', onClick: submit, primary: true }],
  });
}

/* -------------------------------------------------------------------- cards */

function summaryCard(report) {
  const t = report.totals;
  const value = (item) => (item === null || item === undefined ? 'withheld' : String(item));
  return card({
    title: 'The register at a glance',
    subtitle: report.detailed
      ? 'Exact counts over the cases this seat may read.'
      : `Counts only. Non-zero figures below ${report.privacyFloor} are withheld with a reason, never printed as a small number.`,
    body: h('div', { class: 'grid grid-4' },
      stat({ label: 'Cases', value: value(t.cases) }),
      stat({ label: 'Not fully contained', value: value(t.containmentUnproven) }),
      stat({ label: 'Disposition owed', value: value(t.decisionOwed) }),
      stat({ label: 'Verification owed', value: value(t.verificationOwed) }),
      stat({ label: 'Act owed', value: value(t.releaseOwed) }),
      stat({ label: 'Authority unresolved', value: value(t.unresolvedAuthority) }),
      stat({ label: 'Closed', value: value(t.closed) }),
      stat({ label: 'Open attention', value: value(t.open) }),
    ),
  });
}

function containmentLine(row) {
  const latest = row.latestContainment;
  if (!latest) return h('p', { class: 'small text-warn' }, 'No containment act is on the record. The register has placed no hold — physical or system.');
  const scope = latest.scope === 'entire' ? 'the WHOLE identified output' : 'only part of the identified output';
  return h('div', { class: 'stack' },
    h('p', { class: 'small' }, `Latest attestation (${latest.recordedAt.slice(0, 10)}) covers ${scope}, by method “${latest.method}”, against hold ${latest.scopeRef}. This is an attestation, not an enforced hold.`),
    row.containmentSupersededN
      ? h('p', { class: 'small text-warn' }, `${row.containmentSupersededN} earlier attestation(s) claimed the whole output. An earlier claim does not survive a later partial one.`)
      : null,
  );
}

function caseCard(ctx, row, onDone) {
  const c = row.case;
  const identifier = `${QNC_IDENTIFIER_KIND_BY_KEY[c.identifierKind]?.label || c.identifierKind}: ${c.identifierRef}`;
  const apex = (row.authority.apexRows || []).map((item) => item.name || item.personId).join(', ') || 'none resolved';
  const actions = [];
  if (!row.terminal) {
    actions.push(button('Attest containment', () => containmentDialog(ctx, row, onDone), { testid: `qnc-contain-${c.caseRef}` }));
    if (row.fullContainment && row.authority.resolved && row.canDecide) {
      actions.push(button('Sign disposition', () => dispositionDialog(ctx, row, onDone), { primary: true, testid: `qnc-decide-${c.caseRef}` }));
    }
    if ((row.allowedActKinds || []).length) {
      actions.push(button(`Record ${QNC_ACT_KIND_BY_KEY[row.allowedActKinds[0]]?.label.toLowerCase() || 'act'}`, () => actDialog(ctx, row, onDone), { testid: `qnc-act-${c.caseRef}` }));
    }
    if (row.state.key === 'reverification-pending') {
      actions.push(button('Re-verify rework', () => verifyDialog(ctx, row, onDone), { primary: true, testid: `qnc-verify-${c.caseRef}` }));
    }
  }
  return card({
    title: `${c.caseRef} — ${c.productRef}`,
    subtitle: `${c.siteRef} · ${identifier} · identified ${c.identifiedOn} · source ${QNC_SOURCE_BY_KEY[c.sourceKind]?.label || c.sourceKind}`,
    actions: h('div', { class: 'row gap-2' }, badge(row.state.label, TONE[row.state.tone] || 'neutral'), ...actions),
    body: h('div', { class: 'stack' },
      h('p', null, row.state.says),
      h('p', { class: 'small' }, `Requirement (${c.specRef}): ${c.requirement}`),
      h('p', { class: 'small' }, `Finding (evidence ${c.evidenceRef}): ${c.finding}`),
      containmentLine(row),
      h('p', { class: 'small' }, `Joint decision seats: ${apex}${row.authority.ambiguous ? ' (a matrix tie — every apex must sign)' : ''}.`),
      row.authority.resolved ? null : h('p', { class: 'small text-bad' }, row.authority.reason),
      row.currentDisposition
        ? h('p', { class: 'small' }, `Round ${row.currentRound}: ${row.currentDisposition}${row.currentConcessionRef ? ` under concession ${row.currentConcessionRef}` : ''} — signed by ${row.currentGroup.length} of ${row.authority.apexIds.length} required seat(s).`)
        : null,
      row.currentCompletion ? h('p', { class: 'small' }, `Rework completed ${row.currentCompletion.performedAt.slice(0, 10)} by ${row.currentCompletion.performedById} (evidence ${row.currentCompletion.evidenceRef}).`) : null,
      row.currentVerification ? h('p', { class: 'small' }, `Re-verification ${row.currentVerification.outcome} on ${row.currentVerification.verifiedAt.slice(0, 10)} by ${row.currentVerification.verifiedById}. A pass is not a release.`) : null,
      (row.rejectedVerifications || []).length
        ? h('p', { class: 'small text-bad' }, `${row.rejectedVerifications.length} re-verification row(s) are on the record but count for nothing: ${row.rejectedVerifications[row.rejectedVerifications.length - 1].reason}`)
        : null,
      row.ineffectiveActsN ? h('p', { class: 'small text-bad' }, `${row.ineffectiveActsN} terminal act(s) on this case cannot be tied to a complete disposition and its required evidence. No release is recognised.`) : null,
      row.terminal ? h('p', { class: 'small' }, 'This case is closed. A closed case accepts no further act; a new identification opens a new case.') : null,
    ),
  });
}

function worklistView(report) {
  if (!report.worklist.length) {
    return emptyState({ title: 'Nothing is waiting on this seat', body: 'No case this seat may read is waiting for its containment, signature, act or re-verification.' });
  }
  return h('div', { class: 'stack' }, ...report.worklist.map((row) => card({
    title: `${row.case.caseRef} — ${row.state.label}`,
    subtitle: row.detailed === false ? '' : `${row.case.productRef} · ${row.case.siteRef}`,
    body: h('p', { class: 'small' }, row.state.says),
  })));
}

function methodView() {
  return h('div', { class: 'stack', 'data-testid': 'qnc-method' },
    card({
      title: 'What this register proves, and what it cannot',
      subtitle: `${QNC_METHOD.engine} · ${QNC_METHOD.adr} · ${QNC_CSV_SCOPE}`,
      body: h('p', null, 'The two things this register refuses to merge are *the record holds the acts the control requires* and *the identified output was made safe*. The first is computed here from declared, dated human acts. The second is never claimed: a recorded containment is an attestation, and this ledger is not connected to a warehouse, a production line or a shipping system.'),
    }),
    card({ title: 'Frameworks encoded', body: h('ul', { class: 'list' }, ...QNC_METHOD.frameworks.map((item) => h('li', null, item))) }),
    card({ title: 'What it prints', body: h('ul', { class: 'list' }, ...QNC_METHOD.printed.map((item) => h('li', null, item))) }),
    card({ title: 'Deliberately absent', body: h('ul', { class: 'list' }, ...QNC_METHOD.deliberatelyAbsent.map((item) => h('li', null, item))) }),
    card({
      title: 'Exports and limits',
      body: h('div', { class: 'stack' },
        h('p', { class: 'small' }, `The aggregate export (CSV scope “${QNC_CSV_SCOPE}”) carries counts only: no case reference, product, site, lot or serial, requirement, finding, person, manager, concession, evidence reference or act day. A non-zero count below three is exported blank with a reason, never as a small number.`),
        h('p', { class: 'small muted' }, `Declared limits: ${L.cases} cases, ${L.containments} containment attestations, ${L.decisions} signatures, ${L.dispositionActs} acts, ${L.verifications} re-verifications, at most ${L.ownersMax} accountable hands per case and ${L.approversMax} required apexes.`),
      ),
    }),
  );
}

/* --------------------------------------------------------------------- page */

export function renderProductNonconformance(ctx) {
  const requested = ctx.query?.get?.('view');
  const view = VIEWS.some((row) => row.key === requested) ? requested : 'cases';
  let result;
  try {
    result = ctx.api.qncReport ? ctx.api.qncReport() : null;
  } catch (error) {
    result = { ok: false, error: error?.message || 'Unknown error.' };
  }
  const onDone = () => ctx.refresh?.();
  const header = (extra = {}) => pageHeader({
    eyebrow: 'Frontline through director · single-chain and matrix',
    title: 'A lot is not contained because somebody wrote it down',
    subtitle: 'One identified manufactured lot or serial at a time: the requirement and the finding with their evidence, the containment attestation and its written hold reference, the joint disposition, an independent re-verification by a strictly senior hand, and a separate release. Every state is derived on read.',
    ...extra,
  });

  if (!result?.ok || !result.report?.totals) {
    return h('div', { class: 'page', 'data-testid': 'product-nonconformance-panel' },
      header(),
      banner({ tone: 'bad', title: 'The register could not be read', body: result?.error || 'The declared seat refused the read.' }));
  }
  const report = result.report;
  let candidates = [];
  try { candidates = (ctx.api.qncCandidates ? ctx.api.qncCandidates() : null)?.people || []; } catch { candidates = []; }
  const actions = [
    button('Open a case', () => openCaseDialog(ctx, candidates, onDone), { primary: true, testid: 'qnc-open' }),
    button('Export aggregate CSV', () => exportWorkspaceCsv(QNC_CSV_SCOPE), { testid: 'qnc-export' }),
    button('Conventions', () => {
      const form = buildForm([{
        name: 'qncAutoPropagate', label: 'The rule may file dated asks', type: 'checkbox', value: report.conventions.qncAutoPropagate,
        help: 'A pause is recorded and printed as unpermitted unless a permit is granted on the automation screen. A pause never hides an uncontained lot from this screen.',
      }]);
      const submit = () => {
        const values = form.getValues();
        const saved = ctx.api.qncSetConventions({ qncAutoPropagate: values.qncAutoPropagate === true });
        showResult(saved, onDone, 'Convention saved.');
      };
      openModal({
        title: 'Product nonconformance conventions',
        description: 'The only convention this register carries is whether RULE-QNC-01 may file asks. There is no hold duration, disposition default, concession limit or release authority to set.',
        body: form.node,
        footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Save', onClick: submit, primary: true }],
      });
    }, { testid: 'qnc-conventions' }),
  ];

  return h('div', { class: 'page', 'data-testid': 'product-nonconformance-panel' },
    header({ actions }),
    ctx.persistError ? card({ body: h('p', { class: 'text-warn small' }, `Changes are not being saved: ${ctx.persistError}`) }) : null,
    banner({ tone: 'caution', title: 'A record of what people did — never a hold, and never a release certificate', body: 'A containment attestation says a named hand reported the control and left a reference. It does not mean the warehouse is locked, the line stopped or a shipment was blocked. The register has no ERP, MES or shipping connection, does not replace the site’s own quality system or controlled procedures, and claims no conformity with any edition of ISO 9001.' }),
    !report.detailed ? banner({ tone: 'info', title: 'Detail withheld at this altitude', body: report.disclosure.reason }) : null,
    report.matrixError ? banner({ tone: 'bad', title: 'The reporting graph could not be read', body: report.matrixError }) : null,
    ...(report.warnings || []).slice(0, 4).map((warning) => banner({ tone: 'caution', title: 'A stored row was refused or flagged', body: warning })),
    summaryCard(report),
    tabs({
      items: VIEWS.map((row) => ({
        key: row.key,
        label: row.label,
        count: row.key === 'cases' ? report.totals.cases : row.key === 'worklist' ? report.worklist.length : undefined,
      })),
      active: view,
      ariaLabel: 'Product nonconformance register views',
      onSelect: (key) => ctx.navigate(`${QNC_HREF}?view=${key}`),
    }),
    view === 'cases'
      ? (report.rows.length
        ? h('div', { class: 'stack' }, ...report.rows.map((row) => caseCard(ctx, row, onDone)))
        : emptyState({ title: 'No product nonconformance case is on the record', body: 'A case is opened for one identified lot or serial, with its requirement, finding and source evidence. Nothing here is inferred from production or shipment data.' }))
      : null,
    view === 'worklist' ? worklistView(report) : null,
    view === 'method' ? methodView() : null,
  );
}

export default renderProductNonconformance;
