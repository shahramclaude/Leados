/**
 * app/views/permitToWork.js — `#/permit-to-work`, the Permit-to-Work,
 * Energy-Isolation & Simultaneous-Operations Register (ADR-0246, Schema v200).
 *
 * The page formats ONE derived reader. It never decides that a plant is safe:
 * isolations, proofs of zero energy and gas readings are human-entered
 * declarations, and the strongest claim the register makes is that the record
 * holds the acts the control requires. The permanent banner says so.
 *
 * Four views over the same reading: the PERMITS themselves (state, validity,
 * isolations, atmosphere), the ISOLATIONS ledger (what is on the plant, what was
 * proved, what was restored), the SIMULTANEOUS-OPERATIONS conflicts the record
 * derives, and the METHOD — which frameworks this encodes, what it prints, and what
 * it deliberately refuses to do.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import {
  PTW_ATMOSPHERE_TESTS,
  PTW_AUTHORITY_KINDS,
  PTW_CLOSURE_OUTCOMES,
  PTW_ENERGY_KINDS,
  PTW_HREF,
  PTW_LIMITS as L,
  PTW_METHOD,
  PTW_SETTING_KEYS,
  PTW_STATES,
  PTW_WORK_KINDS,
} from '../core/domain/permitToWorkRegistry.js';
import { durationLabel } from '../core/domain/permitToWorkMath.js';

const VIEWS = [
  { key: 'permits', label: 'Permits' },
  { key: 'isolations', label: 'Isolations' },
  { key: 'conflicts', label: 'Simultaneous operations' },
  { key: 'method', label: 'Method' },
];

const STATE_TONE = Object.fromEntries(PTW_STATES.map((row) => [row.key, row.tone === 'bad' ? 'bad' : row.tone === 'warn' ? 'caution' : row.tone === 'good' ? 'good' : 'neutral']));
const STATE_LABEL = Object.fromEntries(PTW_STATES.map((row) => [row.key, row.label]));
const WORK_KIND_LABEL = Object.fromEntries(PTW_WORK_KINDS.map((row) => [row.key, row.label]));
const ENERGY_LABEL = Object.fromEntries(PTW_ENERGY_KINDS.map((row) => [row.key, row.label]));
const AUTHORITY_LABEL = Object.fromEntries(PTW_AUTHORITY_KINDS.map((row) => [row.key, row.label]));
const OUTCOME_LABEL = Object.fromEntries(PTW_CLOSURE_OUTCOMES.map((row) => [row.key, row.label]));

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

function dateLabel(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? new Date(time).toLocaleString() : 'unreadable date';
}

function localDateTimeValue(date) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

const minutesLabel = (value) => (Number.isInteger(value) ? durationLabel(value) : 'unreadable');

function showResult(result, onDone, successText) {
  if (!result?.ok) {
    toast(result?.error || 'The permit action was refused. Nothing was saved.', 'bad');
    return false;
  }
  closeAllModals();
  toast(result.warning || successText, result.warning ? 'warn' : 'good');
  onDone?.();
  return true;
}

/* ----------------------------------------------------------------- dialogs */

function issueDialog(ctx, report, onDone) {
  const roster = (report.peopleOptions || []).map((person) => ({
    value: person.id,
    label: `${person.name || person.id} · ${person.role || 'roster'}`,
  }));
  const planBlock = h('div', { class: 'stack' });
  const planRows = [];
  const addPlanRow = () => {
    const select = h('select', { class: 'input' });
    for (const test of PTW_ATMOSPHERE_TESTS) select.appendChild(h('option', { value: test.key }, test.label));
    const min = h('input', { class: 'input', type: 'number', step: '0.1', placeholder: 'lower limit' });
    const max = h('input', { class: 'input', type: 'number', step: '0.1', placeholder: 'upper / only limit' });
    const freshness = h('input', { class: 'input', type: 'number', min: String(L.freshnessMin), max: String(L.freshnessMax), placeholder: 'fresh (min)' });
    const row = h('div', { class: 'stack-inline' }, select, min, max, freshness);
    planRows.push({ select, min, max, freshness });
    planBlock.appendChild(row);
  };
  addPlanRow();

  const form = buildForm([
    { name: 'workRef', label: 'Work reference (job / permit number)', type: 'text', required: true, help: `At least ${L.shortMin} characters, as the site knows the job.` },
    { name: 'areaRef', label: 'Plant / area / unit covered', type: 'text', required: true, help: `At least ${L.shortMin} characters. Two permits in the same area are what the conflict engine compares.` },
    {
      name: 'workKind', label: 'Kind of work', type: 'select', required: true,
      options: options(PTW_WORK_KINDS.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose the kind of work' }),
      help: 'The controls each kind requires differ. Hot work needs a named fire watch; confined-space entry needs a declared test plan with limits nobody defaulted.',
    },
    {
      name: 'authorityKind', label: 'How it is permitted', type: 'select', required: true,
      options: options(PTW_AUTHORITY_KINDS.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose single, group or contractor' }),
    },
    {
      name: 'holderId', label: 'Permit holder (who works under it)', type: 'select', required: true,
      options: options(roster, { blank: 'Choose the holder' }),
      help: 'You cannot issue a permit to yourself. One person cannot hold two open permits over the same window.',
    },
    { name: 'basisRef', label: 'Written method / assessment reference', type: 'text', required: true, help: `At least ${L.basisMin} characters — reference and revision. A permit with no method is a signature.` },
    {
      name: 'validityMinutes', label: 'Declared validity (whole minutes)', type: 'number', required: true, min: String(L.validityMin), max: String(L.validityMax),
      help: `${L.validityMin}–${L.validityMax}. There is no default: the end instant must be one a human chose.`,
    },
    { name: 'validFromAt', label: 'Valid from', type: 'datetime-local', required: true, value: localDateTimeValue(new Date()) },
    { name: 'flightFromAt', label: 'First entry (optional)', type: 'datetime-local', help: 'Leave empty if the holder may start as soon as the permit is valid. A declared first entry is what an outside authority will ask for.' },
    {
      name: 'fireWatchId', label: 'Named fire watch (hot work only)', type: 'select',
      options: options(roster, { blank: 'Nobody — refused for hot work' }),
      help: 'Required for an ignition kind. The register refuses to issue hot work with no named fire watch.',
    },
    {
      name: 'crewIds', label: 'Named crew (optional)', type: 'boolean-block', wide: true,
      options: roster.map((row) => ({ value: row.value, label: row.label })),
      help: 'Everyone who will work under this permit. The register records that they were named; it does not verify competence.',
    },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const atmospherePlan = planRows
      .filter((row) => row.max.value !== '' || row.min.value !== '')
      .map((row) => {
        const test = PTW_ATMOSPHERE_TESTS.find((candidate) => candidate.key === row.select.value);
        const min = row.min.value === '' ? (test?.limitDirection === 'at-most' ? 0 : Number.NaN) : Number(row.min.value);
        const max = row.max.value === '' ? (test?.limitDirection === 'between' ? Number.NaN : Number.NaN) : Number(row.max.value);
        return { testKey: row.select.value, limitMin: min, limitMax: max, freshnessMinutes: Number(row.freshness.value) };
      })
      .filter((entry) => Number.isFinite(entry.limitMin) && Number.isFinite(entry.limitMax));
    let validFromAt;
    try { validFromAt = values.validFromAt ? new Date(values.validFromAt).toISOString() : undefined; } catch { validFromAt = undefined; }
    let flightFromAt = null;
    try { flightFromAt = values.flightFromAt ? new Date(values.flightFromAt).toISOString() : null; } catch { flightFromAt = null; }
    const result = ctx.api.permitToWorkIssue({
      ...values,
      validityMinutes: values.validityMinutes === '' ? undefined : Number(values.validityMinutes),
      validFromAt,
      flightFromAt,
      atmospherePlan,
    });
    if (!result?.ok) {
      if (result?.field === 'atmospherePlan') toast(result.error, 'bad');
      else if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The permit was refused.', 'bad');
      return;
    }
    showResult(result, onDone, 'Permit issued. It is live once inside its validity and once every isolation on it is proved at zero energy.');
  };
  openModal({
    title: 'Issue a permit to work',
    body: h('div', { class: 'stack' },
      banner({ tone: 'caution', title: 'This is an authorisation record, not a safety certificate', body: 'The register records what a human declared. It cannot inspect a plant, prove that a lock is on a valve, or certify anything to a regulator.' }),
      form.node,
      card({ title: 'Declared test plan', subtitle: 'Required for confined-space entry. Every limit is typed by you; there are no defaults.', body: h('div', { class: 'stack' }, planBlock, button('Add another test', addPlanRow)) }),
    ),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Issue permit', onClick: submit }],
  });
}

function isolationDialog(ctx, permit, report, onDone) {
  const form = buildForm([
    { name: 'pointRef', label: 'Isolation point', type: 'text', required: true, help: `The valve, breaker, flange or blind — at least ${L.shortMin} characters.` },
    { name: 'lockRef', label: 'Lock / tag reference actually applied', type: 'text', required: true, help: `At least ${L.shortMin} characters. A lock nobody can find is a lock nobody can remove.` },
    {
      name: 'energyKind', label: 'Energy kind', type: 'select', required: true,
      options: options(PTW_ENERGY_KINDS.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose the energy being isolated' }),
      help: 'The proof a human owes differs by energy kind, and the register never substitutes one proof for another.',
    },
    { name: 'appliedAt', label: 'Applied at', type: 'datetime-local', value: localDateTimeValue(new Date()) },
    {
      name: 'verifyWithinMinutes', label: 'Proof window (whole minutes)', type: 'number', required: true, min: String(L.verifyWithinMin), max: String(L.verifyWithinMax),
      help: 'How long this permit allows between applying the isolation and proving zero energy at the point of work. No default — it is a decision about this plant.',
    },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    let appliedAt;
    try { appliedAt = values.appliedAt ? new Date(values.appliedAt).toISOString() : undefined; } catch { appliedAt = undefined; }
    const result = ctx.api.permitToWorkApplyIsolation({
      permitId: permit.id,
      ...values,
      verifyWithinMinutes: Number(values.verifyWithinMinutes),
      appliedAt,
    });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The isolation was refused.', 'bad');
      return;
    }
    showResult(result, onDone, 'Isolation recorded. It is NOT proved: a second hand must record the zero-energy proof inside the declared window.');
  };
  openModal({
    title: `Apply an isolation · ${permit.workRef}`,
    body: h('div', { class: 'stack' }, banner({ tone: 'info', title: 'Applying is not proving', body: 'An applied lock is recorded here. The permit is not safe to work under until a proof of zero energy is recorded inside the window you choose.' }), form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record isolation', onClick: submit }],
  });
}

function verifyDialog(ctx, iso, onDone) {
  const form = buildForm([
    { name: 'verifiedBy', label: 'How the zero-energy state was proved', type: 'textarea', required: true, help: `At least ${L.textMin} characters: what was tested, at the point of work, and what it read. “Verified” is a claim nobody can review.` },
    { name: 'verifiedAt', label: 'Proved at', type: 'datetime-local', value: localDateTimeValue(new Date()), help: `Must fall inside the ${iso.verifyWithinMinutes}-minute window this permit declared from the isolation's application.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    let verifiedAt;
    try { verifiedAt = values.verifiedAt ? new Date(values.verifiedAt).toISOString() : undefined; } catch { verifiedAt = undefined; }
    const result = ctx.api.permitToWorkVerifyIsolation({ isolationId: iso.id, ...values, verifiedAt });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The proof was refused.', 'bad');
      return;
    }
    showResult(result, onDone, 'Proof recorded. The register now holds a claim that the plant is dead at the point of work — not a proof that it is.');
  };
  openModal({
    title: `Prove zero energy · ${iso.pointRef}`,
    body: h('div', { class: 'stack' },
      banner({ tone: 'caution', title: 'A proof is a claim by a named hand', body: 'The register holds who claimed what, when, against which isolation. It cannot test the plant.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record proof', onClick: submit }],
  });
}

function removeDialog(ctx, iso, report, onDone) {
  const roster = (report.peopleOptions || []).map((person) => ({ value: person.id, label: `${person.name || person.id} · ${person.role || 'roster'}` }));
  const form = buildForm([
    { name: 'removedAt', label: 'Removed at', type: 'datetime-local', value: localDateTimeValue(new Date()) },
    { name: 'note', label: 'What was checked before energy was restored', type: 'textarea', required: true, help: `At least ${L.textMin} characters. Restoring energy is the act that hurts people, and this note is the record of who checked what.` },
    {
      name: 'confirmedById', label: 'Confirmed by a second hand (optional)', type: 'select',
      options: options(roster, { blank: 'No second-hand confirmation — the removal reads unconfirmed' }),
      help: 'A removal with no confirmation reads `removed-unconfirmed`: the register cannot say whether the plant is back in service or still dead.',
    },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    let removedAt;
    try { removedAt = values.removedAt ? new Date(values.removedAt).toISOString() : undefined; } catch { removedAt = undefined; }
    const result = ctx.api.permitToWorkRemoveIsolation({ isolationId: iso.id, ...values, removedAt });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The removal was refused.', 'bad');
      return;
    }
    showResult(result, onDone, result.confirmed ? 'Removal recorded and confirmed.' : 'Removal recorded with no confirmation: the register prints it as unconfirmed.');
  };
  openModal({
    title: `Remove an isolation · ${iso.pointRef}`,
    body: h('div', { class: 'stack' }, banner({ tone: 'bad', title: 'Restoring energy', body: 'If another live permit depends on this point, the register will print that conflict — it does not block the act, because the act is a fact that must survive.' }), form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record removal', onClick: submit }],
  });
}

function atmosphereDialog(ctx, permit, onDone) {
  const plan = permit.atmospherePlan || [];
  const form = buildForm([
    {
      name: 'testKey', label: 'Test', type: 'select', required: true,
      options: options(plan.map((entry) => ({ value: entry.testKey, label: `${entry.label} · limit ${entry.limitDirection === 'between' ? `${entry.limitMin}–${entry.limitMax}` : `${entry.limitMin}–${entry.limitMax}`} · fresh ${entry.freshnessMinutes} min` })), { blank: 'Choose the declared test' }),
      help: 'Only the tests this permit declared. A reading of a gas nobody declared has no limit to be held to.',
    },
    { name: 'reading', label: 'Reading exactly as the instrument showed', type: 'number', required: true, step: '0.1' },
    { name: 'instrumentRef', label: 'Instrument reference', type: 'text', required: true, help: `At least ${L.shortMin} characters. A reading with no instrument cannot be checked or recalled.` },
    { name: 'testedAt', label: 'Tested at', type: 'datetime-local', value: localDateTimeValue(new Date()) },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    let testedAt;
    try { testedAt = values.testedAt ? new Date(values.testedAt).toISOString() : undefined; } catch { testedAt = undefined; }
    const result = ctx.api.permitToWorkRecordAtmosphere({
      permitId: permit.id,
      ...values,
      reading: values.reading === '' ? undefined : Number(values.reading),
      testedAt,
    });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The reading was refused.', 'bad');
      return;
    }
    showResult(result, onDone, 'Reading recorded exactly as measured. A reading that fails the limit is kept and printed — the register never hides a bad reading.');
  };
  openModal({
    title: `Record a gas reading · ${permit.workRef}`,
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'A reading is kept even when it fails', body: 'The register compares it exactly against the limit this permit declared and reports the verdict. It never refuses a bad reading, because that would be the reason nobody records one.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record reading', onClick: submit }],
  });
}

function suspendDialog(ctx, permit, onDone) {
  const form = buildForm([
    { name: 'reason', label: 'Why the permit is suspended', type: 'textarea', required: true, help: `At least ${L.textMin} characters. A suspension with no reason cannot be resumed by anybody who reads it.` },
    { name: 'suspendedAt', label: 'Suspended at', type: 'datetime-local', value: localDateTimeValue(new Date()) },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    let suspendedAt;
    try { suspendedAt = values.suspendedAt ? new Date(values.suspendedAt).toISOString() : undefined; } catch { suspendedAt = undefined; }
    const result = ctx.api.permitToWorkSuspend({ permitId: permit.id, ...values, suspendedAt });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The suspension was refused.', 'bad');
      return;
    }
    showResult(result, onDone, 'Permit suspended. Work stops and the isolation is retained; nothing here asserts that it was.');
  };
  openModal({
    title: `Suspend · ${permit.workRef}`,
    body: h('div', { class: 'stack' }, form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Suspend permit', onClick: submit }],
  });
}

function resumeDialog(ctx, permit, onDone) {
  const form = buildForm([
    { name: 'note', label: 'What was re-checked before work restarted', type: 'textarea', required: true, help: `At least ${L.textMin} characters. A resumption that re-asserts the old record is the failure compressing into a press of a button.` },
    { name: 'resumedAt', label: 'Resumed at', type: 'datetime-local', value: localDateTimeValue(new Date()) },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    let resumedAt;
    try { resumedAt = values.resumedAt ? new Date(values.resumedAt).toISOString() : undefined; } catch { resumedAt = undefined; }
    const result = ctx.api.permitToWorkResume({ permitId: permit.id, ...values, resumedAt });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The resumption was refused.', 'bad');
      return;
    }
    showResult(result, onDone, 'Permit resumed. The permit is re-read against the record: an isolation removed while it was suspended reads unproved.');
  };
  openModal({
    title: `Resume · ${permit.workRef}`,
    body: h('div', { class: 'stack' }, form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Resume permit', onClick: submit }],
  });
}

function closeDialog(ctx, permit, report, onDone) {
  const outstanding = permit.isolationRows.filter((row) => !row.isolation.removalConfirmedById).length;
  const form = buildForm([
    {
      name: 'outcome', label: 'How the permit ended', type: 'select', required: true,
      options: options(PTW_CLOSURE_OUTCOMES.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose the outcome' }),
    },
    { name: 'note', label: 'What actually happened', type: 'textarea', required: true, help: `At least ${L.textMin} characters.` },
    { name: 'closedAt', label: 'Closed at', type: 'datetime-local', value: localDateTimeValue(new Date()) },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    let closedAt;
    try { closedAt = values.closedAt ? new Date(values.closedAt).toISOString() : undefined; } catch { closedAt = undefined; }
    const result = ctx.api.permitToWorkClose({ permitId: permit.id, ...values, closedAt });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The closure was refused.', 'bad');
      return;
    }
    showResult(result, onDone, 'Permit closed.');
  };
  openModal({
    title: `Close out · ${permit.workRef}`,
    body: h('div', { class: 'stack' },
      outstanding
        ? banner({ tone: 'bad', title: `${outstanding} isolation(s) still recorded in place`, body: 'This closure will be recorded and the register will print the permit as `closed-isolation-owed`. It will not restore the isolation for you and it will not refuse the closure: the plant may be isolated with nobody aware of it, and that fact has to survive on the record.' })
        : null,
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Close permit', onClick: submit }],
  });
}

function conventionsDialog(ctx, report, onDone) {
  const conventions = report.conventions || {};
  const form = buildForm([
    { name: PTW_SETTING_KEYS.privacyFloor, label: 'Privacy floor (per-state export)', type: 'number', value: conventions[PTW_SETTING_KEYS.privacyFloor], help: 'A per-state or per-conflict count below this is exported blank with its reason, never printed as a small number.' },
    { name: PTW_SETTING_KEYS.horizonDays, label: 'Planning horizon (days)', type: 'number', value: conventions[PTW_SETTING_KEYS.horizonDays], help: 'How far ahead a permit may be declared. Beyond this is a plan, not an authorisation.' },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.permitToWorkSetConventions({
      [PTW_SETTING_KEYS.privacyFloor]: Number(values[PTW_SETTING_KEYS.privacyFloor]),
      [PTW_SETTING_KEYS.horizonDays]: Number(values[PTW_SETTING_KEYS.horizonDays]),
    });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The conventions were refused.', 'bad');
      return;
    }
    showResult(result, onDone, 'Conventions set.');
  };
  openModal({
    title: 'Register conventions',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'There is no default permit validity or limit anywhere', body: 'The only workspace-level numbers are the export floor and the planning horizon. Every validity, every gas limit and every proof window is a decision on the permit itself.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Save conventions', onClick: submit }],
  });
}

/* ------------------------------------------------------------------- views */

/** A stat whose value carries a stable testid, so the display contract can prove itself. */
function provenStat(testid, spec) {
  return h('span', { 'data-testid': testid }, stat(spec));
}

function summaryCard(report) {
  const t = report.totals;
  return card({
    title: 'One permit, one plant, one proved state',
    subtitle: 'Every figure below is re-derived from the declarations on this read, with the injected clock. Nothing on this page is a stored verdict.',
    body: h('div', { class: 'stack' },
      h('div', { class: 'stats-grid' },
        provenStat('ptw-count-open', { label: 'Open permits', value: t.open, hint: `${t.liveN} live · ${t.liveUnverifiedN} live but unproved`, tone: t.open ? 'warn' : 'good' }),
        provenStat('ptw-count-unverified', { label: 'Live, isolation unproved', value: t.liveUnverifiedN, hint: 'Work may be under way on plant the record cannot show is dead', tone: t.liveUnverifiedN ? 'bad' : 'good' }),
        provenStat('ptw-count-atmosphere', { label: 'Live, atmosphere failing', value: t.liveAtmosphereN, hint: 'Outside the limits the permit’s own issuer declared', tone: t.liveAtmosphereN ? 'bad' : 'good' }),
        provenStat('ptw-count-expired', { label: 'Lapsed, never closed', value: t.expiredOpenN, hint: `${t.expiredMinutes} whole minute(s) past their declared ends in total`, tone: t.expiredOpenN ? 'bad' : 'good' }),
        provenStat('ptw-count-conflicts', { label: 'Simultaneous-operations conflicts', value: t.conflicts, hint: `${t.conflictsLive} join a permit that is still open`, tone: t.conflicts ? 'bad' : 'good' }),
        provenStat('ptw-count-isolations', { label: 'Isolations on the record', value: t.isolations, hint: `${t.isolationsUnverifiedN} unproved · ${t.isolationsOverdueN} past the permit's window`, tone: t.isolationsOverdueN ? 'bad' : '' }),
        provenStat('ptw-count-isolation-owed', { label: 'Closed with isolation owed', value: t.closedIsolationOwedN, hint: 'The plant may be isolated with nobody aware', tone: t.closedIsolationOwedN ? 'bad' : 'good' }),
      ),
      banner({
        tone: report.balances.statesReconcile ? 'good' : 'bad',
        title: report.balances.statesReconcile ? 'The printed state counts re-add to the permits' : 'The printed state counts do NOT re-add',
        body: `${report.stateTotal} printed state(s) across ${t.permits} readable permit(s). Isolations attached: ${report.balances.isolationsReconcile ? 'all' : 'NOT all'} to a permit on the record; atmosphere readings: ${report.balances.atmosphereReconcile ? 'all' : 'NOT all'}; closures: ${report.balances.closuresReconcile ? 'all' : 'NOT all'}.`,
      }),
      banner({
        tone: report.figuresComplete ? 'good' : 'caution',
        title: report.figuresComplete ? 'This reading is complete for its scope' : 'A complete claim is withheld — and says why',
        body: report.figuresComplete
          ? 'No unreadable row, unresolved holder, or unreconciled ledger was found in this read.'
          : report.incompleteReasons.join(' '),
      }),
    ),
  });
}

function flagsLine(row) {
  const items = [];
  if (row.permit.selfIssued) items.push(badge('issued by its own holder', 'bad'));
  if (row.permit.noFireWatch) items.push(badge('no fire watch', 'bad'));
  if (row.issuingLineGone) items.push(badge('issuing line no longer holds the holder', 'caution'));
  if (row.unconfirmedRemovalN) items.push(badge(`${row.unconfirmedRemovalN} removal(s) unconfirmed`, 'caution'));
  if (row.permit.requiresIsolation && row.requiredIsolationN === 0) items.push(badge('no isolation on the record', 'bad'));
  return items.length ? h('div', { class: 'stack-inline' }, ...items) : null;
}

function isolationTable(row) {
  if (!row.isolationRows.length) {
    return emptyState({ title: 'No isolation is recorded on this permit.', body: 'If this is energy-control work, that is the finding: nothing on the record proves the plant is dead.' });
  }
  return table({
    caption: 'Isolations on this permit, their declared window and their proof',
    columns: [
      { label: 'Point', render: (r) => r.isolation.pointRef },
      { label: 'Lock / tag', render: (r) => r.isolation.lockRef },
      { label: 'Energy', render: (r) => ENERGY_LABEL[r.isolation.energyKind] || r.isolation.energyKind },
      { label: 'Applied', render: (r) => dateLabel(r.isolation.appliedAt) },
      {
        label: 'Proof',
        render: (r) => {
          if (r.restored) return badge('removed and confirmed', 'neutral');
          if (r.proof.proved) return badge(`proved +${r.proof.minutesAfterApplied} min`, 'good');
          if (r.proof.overdue) return badge(`overdue by ${r.proof.minutesOverWindow} min`, 'bad');
          return badge('no proof recorded', 'bad');
        },
      },
      { label: 'Window', render: (r) => `${r.isolation.verifyWithinMinutes} min` },
      {
        label: 'Removal',
        render: (r) => {
          if (!r.isolation.removedAt) return r.protects ? h('span', { class: 'small muted' }, 'still in place') : '—';
          return r.isolation.removalConfirmedById
            ? badge('confirmed', 'good')
            : badge('never confirmed', 'caution');
        },
      },
    ],
    rows: row.isolationRows,
    emptyMessage: 'No isolation recorded.',
  });
}

function readingsTable(row) {
  if (!row.readings.length) return null;
  return table({
    caption: 'Latest reading per declared test, compared exactly against the permit’s own limit',
    columns: [
      { label: 'Test', render: (r) => r.entry.label },
      { label: 'Declared limit', render: (r) => (r.entry.limitDirection === 'between' ? `${r.entry.limitMin}–${r.entry.limitMax} ${r.entry.unit}` : `≤ ${r.entry.limitMax} ${r.entry.unit}`) },
      { label: 'Latest reading', render: (r) => (r.reading ? `${r.reading.reading} ${r.entry.unit}` : 'never recorded') },
      { label: 'Verdict', render: (r) => (r.verdict.verdict === 'pass' ? badge('inside the limit', 'good') : badge(r.verdict.verdict === 'fail' ? 'outside the limit' : 'nothing to compare', 'bad')) },
      { label: 'Freshness', render: (r) => (r.reading ? (r.freshness.stale === true ? badge(`${r.freshness.minutesOver} min over ${r.entry.freshnessMinutes}`, 'caution') : badge(`${r.freshness.minutesSince} min old`, 'good')) : badge('no reading', 'bad')) },
    ],
    rows: row.readings,
    emptyMessage: 'No tests declared.',
  });
}

function permitCard(ctx, row, report, onDone) {
  const permit = row.permit;
  const actions = [];
  const live = row.closedMs === null;
  if (live) {
    actions.push(button('Apply isolation', () => isolationDialog(ctx, permit, report, onDone), { testid: 'ptw-apply' }));
    if (permit.atmospherePlan.length) actions.push(button('Record gas reading', () => atmosphereDialog(ctx, permit, onDone)));
    if (row.suspensionOpen) actions.push(button('Resume', () => resumeDialog(ctx, permit, onDone)));
    else {
      actions.push(button('Suspend', () => suspendDialog(ctx, permit, onDone)));
      actions.push(button('Close out', () => closeDialog(ctx, permit, report, onDone), { primary: true, testid: 'ptw-close' }));
    }
  }

  return card({
    title: `${permit.workRef} · ${permit.areaRef}`,
    subtitle: `${WORK_KIND_LABEL[permit.workKind] || permit.workKind} · ${AUTHORITY_LABEL[permit.authorityKind] || permit.authorityKind} · issued by ${row.issuerName}`,
    actions,
    attrs: { 'data-testid': 'ptw-permit-card' },
    body: h('div', { class: 'stack' },
      h('div', { class: 'stack-inline' },
        badge(STATE_LABEL[row.state.key] || row.state.key, STATE_TONE[row.state.key] || 'neutral'),
        Number.isInteger(row.remainingMinutes) && row.closedMs === null ? badge(`${minutesLabel(row.remainingMinutes)} remaining`, row.remainingMinutes <= 60 ? 'caution' : 'neutral') : null,
        row.state.key === 'expired-open' ? badge(`${minutesLabel(row.lateMinutes)} past its end`, 'bad') : null,
        row.state.key.startsWith('live') && row.state.key !== 'live' ? badge('work may be under way', 'bad') : null,
      ),
      h('p', { class: 'small' }, row.state.says),
      flagsLine(row),
      h('div', { class: 'stats-grid' },
        stat({ label: 'Holder', value: row.personName || 'not on the graph', hint: row.orphan ? 'No authorising line can be resolved above them' : `${row.lines.length} active line(s) hold them today` }),
        stat({ label: 'Valid from', value: dateLabel(permit.validFromAt), hint: `Validity ${permit.validityMinutes} min${row.flightMs ? ` · first entry declared ${dateLabel(permit.flightFromAt)}` : ''}` }),
        stat({ label: 'Isolations', value: `${row.outstandingIsolationN} outstanding of ${row.requiredIsolationN}`, hint: `${row.unverifiedIsolationN} unproved · ${row.overdueIsolationN} past the permit's window` }),
        stat({ label: 'Fire watch', value: row.fireWatchName || (permit.ignition ? 'NONE — a conflict' : 'not required'), hint: permit.ignition ? 'Required for an ignition kind' : 'This kind produces no ignition source' }),
      ),
      h('p', { class: 'small muted' }, `Written basis: ${permit.basisRef}`),
      row.crewNames.length ? h('p', { class: 'small muted' }, `Named crew: ${row.crewNames.join(', ')}`) : null,
      row.lines.length ? h('p', { class: 'small muted' }, `Reporting lines holding the holder: ${row.lines.map((line) => line.name).join(', ')}${row.apex?.apexNames?.length ? ` · joint apex ${row.apex.apexNames.join(', ')}` : ''}`) : null,
      row.lastHandover ? h('p', { class: 'small muted' }, `Last handover ${dateLabel(row.lastHandover.at)}: ${row.lastHandover.note}`) : null,
      card({ title: 'Energy isolations', body: isolationTable(row) }),
      permit.atmospherePlan.length ? card({ title: 'Atmosphere against the permit’s own limits', body: readingsTable(row) }) : null,
      row.closure ? card({ title: `Closed as ${OUTCOME_LABEL[row.closure.outcome] || row.closure.outcome}`, subtitle: `${dateLabel(row.closure.closedAt)} by ${row.issuerName}`, body: h('p', null, row.closure.note) }) : null,
    ),
  });
}

function permitsView(ctx, report, onDone) {
  const rows = report.rows;
  if (!rows.length) {
    return emptyState({
      title: report.detailed ? 'No readable permit is in this span.' : 'Permit-level rows are withheld at this altitude.',
      body: report.detailed
        ? 'A human must declare a permit. The register never infers one from a shift, a station roster, an incident, a maintenance job or a stop-work hold.'
        : report.disclosure.reason,
    });
  }
  const open = rows.filter((row) => row.closedMs === null);
  const closed = rows.filter((row) => row.closedMs !== null);
  return h('div', { class: 'stack', 'data-testid': 'ptw-permits' },
    open.length ? h('div', { class: 'stack' }, ...open.map((row) => permitCard(ctx, row, report, onDone))) : emptyState({ title: 'No permit is open.' }),
    closed.length ? card({ title: `Closed permits (${closed.length})`, body: h('div', { class: 'stack' }, ...closed.map((row) => permitCard(ctx, row, report, onDone))) }) : null,
  );
}

function isolationsView(ctx, report, onDone) {
  const rows = report.rows.flatMap((row) => row.isolationRows.map((iso) => ({ ...iso, permit: row.permit, personName: row.personName })));
  if (!rows.length) return emptyState({ title: 'No isolation is on the record.', body: 'An energy-control permit with no isolation on it reads `live-unverified`, because nothing proves the plant is dead.' });
  return h('div', { class: 'stack', 'data-testid': 'ptw-isolations' },
    card({
      title: 'Every isolation on the plant, and what the record proves about it',
      subtitle: 'An applied lock is not a proved plant. A proof outside the permit’s own window is not a proof.',
      body: table({
        caption: 'All isolations with their proof and restoration state',
        columns: [
          { label: 'Permit', render: (r) => r.permit.workRef },
          { label: 'Point', render: (r) => r.isolation.pointRef },
          { label: 'Lock', render: (r) => r.isolation.lockRef },
          { label: 'Energy', render: (r) => ENERGY_LABEL[r.isolation.energyKind] || r.isolation.energyKind },
          { label: 'Holder', render: (r) => r.personName || 'not on the graph' },
          {
            label: 'Proof',
            render: (r) => {
              if (r.restored) return badge('restored', 'neutral');
              if (r.proof.proved) return badge('proved', 'good');
              if (r.proof.overdue) return badge(`overdue ${r.proof.minutesOverWindow} min`, 'bad');
              return badge('unproved', 'bad');
            },
          },
          {
            label: '',
            render: (r) => {
              if (r.restored) return null;
              return h('span', { class: 'stack-inline' },
                r.proof.proved ? null : button('Record proof', () => verifyDialog(ctx, r.isolation, onDone)),
                button('Remove', () => removeDialog(ctx, r.isolation, report, onDone)));
            },
          },
        ],
        rows,
      }),
    }),
  );
}

function conflictsView(report) {
  if (!report.conflicts.length) {
    return h('div', { class: 'stack', 'data-testid': 'ptw-conflicts' },
      banner({ tone: 'good', title: 'No simultaneous-operations conflict is derived from this record', body: 'The engine compares every live permit against every isolation release, ignition source, confined-space entry, shared isolation point and double-booked holder on every read. An empty list here means the record does not support a conflict — not that the plant is safe.' }));
  }
  return h('div', { class: 'stack', 'data-testid': 'ptw-conflicts' },
    banner({ tone: 'bad', title: `${report.conflicts.length} conflict(s) derived from the record`, body: 'None of these is stored. Each is recomputed from the permits, the isolations and the readings on every read, so none can be cleared by editing a status — only by a human recording the act that resolves it.' }),
    table({
      caption: 'Simultaneous-operations conflicts with the exact arithmetic that proves each one',
      columns: [
        { label: 'Severity', render: (row) => badge(String(row.severity), row.severity >= 4 ? 'bad' : 'caution') },
        { label: 'Conflict', render: (row) => h('span', { class: 'stack-inline' }, h('strong', null, row.label), row.pointRef ? badge(row.pointRef, 'neutral') : null) },
        { label: 'Where', render: (row) => row.areaRef || 'withheld at this altitude' },
        {
          label: 'Proof',
          render: (row) => h('span', { class: 'small' },
            row.detail,
            Number.isInteger(row.minutes) && row.minutes > 0 ? h('span', { class: 'muted' }, ` · ${row.minutes} whole minute(s)`) : null,
            row.at ? h('span', { class: 'muted' }, ` · at ${dateLabel(row.at)}`) : null),
        },
      ],
      rows: report.conflicts,
    }),
  );
}

function methodView() {
  return h('div', { class: 'stack', 'data-testid': 'ptw-method' },
    card({
      title: 'What this register proves, and what it cannot',
      subtitle: PTW_METHOD.frameworks[1],
      body: h('p', null, 'A permit authorises work. It does not make a plant safe. The two things this register refuses to merge are *the record holds the acts the control requires* and *the plant is safe* — the first is computed here, the second is never claimed. The method figure is deliberately not rendered as a placeholder diagram: the register’s own text is the method.'),
    }),
    card({ title: 'Frameworks encoded', body: h('ul', { class: 'list' }, ...PTW_METHOD.frameworks.map((item) => h('li', null, item))) }),
    card({ title: 'What it prints', body: h('ul', { class: 'list' }, ...PTW_METHOD.printed.map((item) => h('li', null, item))) }),
    card({ title: 'Deliberately absent', body: h('ul', { class: 'list' }, ...PTW_METHOD.deliberatelyAbsent.map((item) => h('li', null, item))) }),
    card({
      title: 'Benchmark position — [BENCHMARK-VERIFIED] at documentation level only',
      body: h('div', { class: 'stack' },
        h('p', null, 'The electronic permit-to-work category — Pro-Sapien, Intelex, EHS Insight, Enablon, Sphera, Cority and PermitVision — sets the bar on five mechanics: a permit with a status, a validity and a lifecycle; energy isolation tied to the permit with lock and tag references; zero-energy verification before work; hot-work and confined-space controls with atmospheric testing; and simultaneous-operations conflict visibility.'),
        h('p', null, 'This register reaches all five, and adds four things the category does not put on the record: conflicts DERIVED from the record on every read and never stored as a status; no default validity, limit, freshness window or verification window anywhere; the person doing the work cannot authorise it, and the hand that applied an isolation cannot be its only verifier; and a closure that leaves a line isolated is kept and printed rather than repaired.'),
        h('p', { class: 'small muted' }, 'Weaker, and said plainly: no live instrument or telematics feed, no valve-line diagram, no mobile app, no contractor competence-scheme checking, no physical lock hardware. Parity is established from vendor documentation fetched on 2026-11-17; no hands-on vendor environment was run, so product parity is [BENCHMARK-UNVERIFIED].'),
        h('p', { class: 'small muted' }, 'Vendor comparison pages: zipdo.co/best/electronic-permit-to-work-software and wifitalents.com/best/lockout-tagout-procedure-software (fetched 2026-11-17). Framework basis: UK HSE HSG250; OSHA 29 CFR 1910.147 and 1910.146; NFPA 51B.'),
      ),
    }),
  );
}

function scan(ctx, onDone) {
  const result = ctx.api.permitToWorkScan();
  if (!result?.ok) {
    toast(result?.error || 'The permit-to-work scan was refused.', 'bad');
    return;
  }
  toast('Scan requested. A permit lapses by the calendar and a proof window runs out with nobody writing anything, so the rule can run on a clock. It never clears a permit.', 'good');
  onDone?.();
}

export function renderPermitToWork(ctx) {
  const requested = ctx.query?.get?.('view');
  const view = VIEWS.some((row) => row.key === requested) ? requested : 'permits';
  let report;
  try {
    const result = ctx.api.permitToWorkReport ? ctx.api.permitToWorkReport() : null;
    if (!result?.ok || !result.report?.totals) {
      return h('div', { class: 'page', 'data-testid': 'permit-to-work-panel' },
        pageHeader({ eyebrow: 'Frontline through director · single-chain and matrix', title: 'Permit to work, energy isolation & simultaneous operations', subtitle: 'A permit authorises work. It does not make a plant safe.' }),
        banner({ tone: 'bad', title: 'The register could not be read', body: result?.error || 'The declared seat refused the read.' }));
    }
    report = result.report;
    report.peopleOptions = result.peopleOptions || [];
  } catch (error) {
    return h('div', { class: 'page', 'data-testid': 'permit-to-work-panel' },
      pageHeader({ eyebrow: 'Frontline through director · single-chain and matrix', title: 'Permit to work, energy isolation & simultaneous operations' }),
      banner({ tone: 'bad', title: 'The register could not be read', body: error?.message || 'Unknown error.' }));
  }
  const onDone = () => ctx.refresh?.();
  const canIssue = Boolean(report.peopleOptions?.length) && report.seat?.rank !== 1;
  const headerActions = [
    ...(canIssue ? [button('Issue a permit', () => issueDialog(ctx, report, onDone), { primary: true, testid: 'ptw-issue' })] : []),
    button('Scan against the clock', () => scan(ctx, onDone), { testid: 'ptw-scan' }),
    button('Conventions', () => conventionsDialog(ctx, report, onDone)),
  ];
  return h('div', { class: 'page', 'data-testid': 'permit-to-work-panel' },
    pageHeader({
      eyebrow: 'Frontline through director · single-chain and matrix',
      title: 'A permit authorises the work. The isolation has to be proved.',
      subtitle: 'Declare the permit, its validity and its limits. Apply every isolation, and prove zero energy at the point of work inside the window the permit itself declares. The register derives every conflict between live permits on every read — and never calls a plant safe.',
      actions: headerActions,
    }),
    ctx.persistError ? card({ body: h('p', { class: 'text-warn small' }, `Changes are not being saved: ${ctx.persistError}`) }) : null,
    banner({ tone: 'caution', title: 'An authorisation record — never a safety certificate', body: 'This local-first ledger cannot inspect a plant, prove a lock is on a valve, verify an instrument’s calibration, or replace the site’s own permit office and hardware lockout system. Use established site safety and emergency procedures. A deadline, an acknowledgement or automation never makes a plant safe.' }),
    report.matrixError ? banner({ tone: 'bad', title: 'Authorising lines cannot be resolved', body: report.matrixError }) : null,
    !report.detailed ? banner({ tone: 'info', title: 'Detail withheld at this altitude', body: report.disclosure.reason }) : null,
    ...(report.warnings || []).slice(0, 4).map((warning) => banner({ tone: 'caution', title: 'A stored row was refused or flagged', body: warning })),
    summaryCard(report),
    tabs({
      items: VIEWS.map((row) => ({
        key: row.key,
        label: row.label,
        count: row.key === 'permits' ? report.totals.open : row.key === 'conflicts' ? report.conflicts.length : undefined,
      })),
      active: view,
      ariaLabel: 'Permit-to-work register views',
      onSelect: (key) => ctx.navigate(`${PTW_HREF}?view=${key}`),
    }),
    view === 'permits' ? permitsView(ctx, report, onDone) : null,
    view === 'isolations' ? isolationsView(ctx, report, onDone) : null,
    view === 'conflicts' ? conflictsView(report) : null,
    view === 'method' ? methodView() : null,
  );
}

export default renderPermitToWork;
