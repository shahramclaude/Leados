/**
 * app/views/preStartup.js — Pre-Startup Safety Review & Commissioning
 * Readiness Register (`#/pre-startup`, ADR-0258, Schema v210, `RULE-PSR-01`,
 * CSV scope #195).
 *
 * FIVE TABS:
 *   1. `reviews`  — Derived state overview, per-review gate ledger, per-line
 *                   matrix roll-up (single identity count; never summed across
 *                   lines) and state/trigger partition.
 *   2. `punch`    — Category A pre-startup blockers and Category B post-startup
 *                   dated conditions with independent closure controls.
 *   3. `gates`    — Discipline gate matrix, operator pre-startup readiness
 *                   coverage, and full immutable sign-off history.
 *   4. `startups` — Joint-apex Startup Authorisations, physical energisation
 *                   log, unsafe-startup breaches, and temporary-change revert
 *                   countdowns / physical restoration records.
 *   5. `method`   — Illustrated 5-stage method diagram, OSHA 29 CFR 1910.119(i)
 *                   & CCPS/Flixborough/Holmström basis, separate `balances` vs
 *                   `figuresComplete` proof, scope limits and conventions.
 *
 * ZERO RECOMPUTATION IN THE VIEW. Every count, state badge, overdue day,
 * revert countdown, joint apex and reconciliation flag renders directly from
 * `actions.psrReport()` (the single pure reader `buildPreStartupSafety`).
 */

import { h, clear, toast, openModal, buildForm } from '../ui/dom.js';
import { pageHeader, card, badge, banner, emptyState, table, tabs } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { exportWorkspaceCsv } from '../core/csv.js';
import { dayWindowLabel } from '../core/domain/psrMath.js';
import {
  PSR_ADR,
  PSR_BOUNDS,
  PSR_CSV_SCOPE,
  PSR_DISCIPLINES,
  PSR_DISCIPLINE_BY_KEY,
  PSR_ENGINE_VERSION,
  PSR_HREF,
  PSR_METHOD,
  PSR_PUNCH_CATEGORIES,
  PSR_RULE_ID,
  PSR_SECTION_TITLES,
  PSR_SIGNOFF_VERDICTS,
  PSR_TRIGGERS,
} from '../core/domain/psrRegistry.js';

const SECTION_KEYS = Object.freeze(['reviews', 'punch', 'gates', 'startups', 'method']);

function activeSection(params) {
  const candidate = params?.get?.('view') || 'reviews';
  return SECTION_KEYS.includes(candidate) ? candidate : 'reviews';
}

function makeStat(label, value, sub, testId, tone = 'neutral') {
  return h(
    'div',
    { className: `card stat-card stat-${tone}`, 'data-testid': testId },
    h('div', { className: 'stat-label muted small' }, label),
    h('div', { className: 'stat-value', 'data-testid': `${testId}-value` }, String(value)),
    sub ? h('div', { className: 'stat-sub muted small' }, sub) : null,
  );
}

function submitModal({ title, fields, submitLabel, onSubmit }) {
  const form = buildForm(fields);
  const errorBox = h('p', { className: 'form-error bad small', role: 'alert', hidden: true });
  let handle = null;
  const run = () => {
    const raw = form.getValues();
    const res = onSubmit(raw);
    if (!res?.ok) {
      errorBox.textContent = res?.message || 'The action was refused.';
      errorBox.hidden = false;
      return;
    }
    handle?.close();
    toast(res.toast || 'Saved to pre-startup safety register.', 'good');
  };
  form.node.addEventListener('submit', (event) => {
    event.preventDefault();
    run();
  });
  const cancelBtn = h('button', { type: 'button', className: 'btn btn-ghost', onClick: () => handle?.close() }, 'Cancel');
  const saveBtn = h('button', { type: 'button', className: 'btn btn-primary', onClick: run }, submitLabel);
  handle = openModal({
    title,
    body: h('div', { className: 'stack' }, errorBox, form.node),
    footer: [cancelBtn, saveBtn],
  });
  return handle;
}

function personOptions(candidates, { excludeIds = [] } = {}) {
  const excluded = new Set(excludeIds.filter(Boolean));
  return (candidates?.people || [])
    .filter((p) => !excluded.has(p.id))
    .map((p) => ({ value: p.id, label: p.role ? `${p.name} — ${p.role}` : p.name }));
}

function reviewOptions(rows, filterFn = () => true) {
  return rows
    .filter(filterFn)
    .map((r) => ({ value: r.review.id, label: `${r.review.reviewRef} — ${r.review.unitRef}` }));
}

/* ------------------------------------------------------------------- modals */

function openReviewModal(actions, report, candidates, rerender) {
  const people = personOptions(candidates);
  if (people.length < 2) {
    toast('At least two active people inside this seat’s reach are needed (separate proposer and unit holder).', 'warn');
    return;
  }
  const discChecks = new Map();
  const discBox = h(
    'fieldset',
    { className: 'form-fieldset' },
    h('legend', { className: 'form-label' }, 'Required verification disciplines (choose 1–6)'),
    ...PSR_DISCIPLINES.map((d, idx) => {
      const cb = h('input', {
        type: 'checkbox',
        name: `disc-${d.key}`,
        value: d.key,
        ...(idx < 3 ? { checked: 'checked' } : {}),
      });
      discChecks.set(d.key, cb);
      return h('label', { className: 'check-row small' }, cb, ` ${d.label}`);
    }),
  );
  const opChecks = new Map();
  const opBox = h(
    'fieldset',
    { className: 'form-fieldset' },
    h('legend', { className: 'form-label' }, 'Affected operators requiring pre-startup briefing (choose 1–12)'),
    ...people.map((p, idx) => {
      const cb = h('input', {
        type: 'checkbox',
        name: `op-${p.value}`,
        value: p.value,
        ...(idx === people.length - 1 ? { checked: 'checked' } : {}),
      });
      opChecks.set(p.value, cb);
      return h('label', { className: 'check-row small' }, cb, ` ${p.label}`);
    }),
  );

  const form = buildForm([
    { name: 'reviewRef', label: 'Review reference', required: true, placeholder: 'PSSR-2026-041' },
    { name: 'unitRef', label: 'Unit / line / equipment boundary', required: true, placeholder: 'Reactor R-401 feed loop' },
    {
      name: 'triggerKind',
      label: 'Trigger kind',
      type: 'select',
      options: PSR_TRIGGERS.map((t) => ({ value: t.key, label: t.label })),
      value: 'modification',
    },
    {
      name: 'changeBasisRef',
      label: 'Change / commissioning specification & hazard-review basis (min 24 chars)',
      type: 'textarea',
      required: true,
      placeholder: 'MOC-2026-118 & HAZOP-44: replaced R-401 high-level trip transmitter and updated relief piping isometric.',
    },
    { name: 'proposerId', label: 'Modification / project proposer (barred from signing gates)', type: 'select', options: people, value: people[0].value },
    { name: 'unitHolderId', label: 'Receiving operating unit holder (must differ from proposer)', type: 'select', options: people, value: people[1].value },
    { name: 'plannedStartDay', label: 'Planned startup day (YYYY-MM-DD)', type: 'date', required: true, value: report.asOf },
    { name: 'revertByDay', label: 'Revert-by day (required ONLY for temporary modification)', type: 'date', value: '' },
  ]);

  const errorBox = h('p', { className: 'form-error bad small', role: 'alert', hidden: true });
  let handle = null;
  const run = () => {
    const raw = form.getValues();
    const requiredDisciplines = [...discChecks.entries()].filter(([, el]) => el.checked).map(([key]) => key);
    const affectedOperatorIds = [...opChecks.entries()].filter(([, el]) => el.checked).map(([id]) => id);
    const res = actions.psrOpenReview({
      ...raw,
      revertByDay: raw.revertByDay ? raw.revertByDay : null,
      requiredDisciplines,
      affectedOperatorIds,
    });
    if (!res?.ok) {
      errorBox.textContent = res?.message || 'Review could not be opened.';
      errorBox.hidden = false;
      return;
    }
    handle?.close();
    toast(`Opened ${res.review.reviewRef}.`, 'good');
    rerender();
  };
  const cancelBtn = h('button', { type: 'button', className: 'btn btn-ghost', onClick: () => handle?.close() }, 'Cancel');
  const saveBtn = h('button', { type: 'button', className: 'btn btn-primary', onClick: run }, 'Open review');
  handle = openModal({
    title: 'Open pre-startup safety review',
    body: h('div', { className: 'stack' }, errorBox, form.node, discBox, opBox),
    footer: [cancelBtn, saveBtn],
  });
}

function openPunchModal(actions, report, candidates, presetReviewId, rerender) {
  const revOpts = reviewOptions(report.rows, (r) => !r.restored);
  const people = personOptions(candidates);
  if (!revOpts.length || !people.length) {
    toast('Open a review with reachable owners before logging punch items.', 'warn');
    return;
  }
  submitModal({
    title: 'Record punch-list item (Category A or B)',
    submitLabel: 'Record punch item',
    fields: [
      { name: 'reviewId', label: 'Review', type: 'select', options: revOpts, value: presetReviewId || revOpts[0].value },
      { name: 'itemRef', label: 'Item reference', required: true, placeholder: 'PA-01 or PB-01' },
      {
        name: 'category',
        label: 'CCPS punch category',
        type: 'select',
        options: PSR_PUNCH_CATEGORIES.map((c) => ({ value: c.key, label: c.label })),
        value: 'pre-startup',
      },
      {
        name: 'discipline',
        label: 'Discipline',
        type: 'select',
        options: PSR_DISCIPLINES.map((d) => ({ value: d.key, label: d.label })),
        value: 'safety',
      },
      { name: 'ownerId', label: 'Action owner', type: 'select', options: people, value: people[0].value },
      { name: 'dueDay', label: 'Due day (mandatory for Category B; optional for Category A)', type: 'date', value: '' },
      {
        name: 'finding',
        label: 'Field finding & acceptance criterion (min 24 chars)',
        type: 'textarea',
        required: true,
        placeholder: 'High-level trip LSHH-401 loop stroke test incomplete; verify valve closes within 3 seconds before feed-in.',
      },
    ],
    onSubmit(raw) {
      const res = actions.psrRecordPunchItem({ ...raw, dueDay: raw.dueDay || null });
      if (!res?.ok) return res;
      rerender();
      return { ok: true, toast: `Recorded punch item ${res.item.itemRef}.` };
    },
  });
}

function openClosePunchModal(actions, report, candidates, row, item, rerender) {
  const fields = [
    { name: 'closureEvidenceRef', label: 'Verification evidence reference', required: true, placeholder: 'LOOP-LSHH401-CERT-09' },
    { name: 'closedDay', label: 'Verified closed date', type: 'date', required: true, value: report.asOf },
    {
      name: 'closureBasis',
      label: 'Physical verification note (min 24 chars)',
      type: 'textarea',
      required: true,
      placeholder: 'Witnessed full wet-stroke trip test from transmitter to XV-401 shutoff in 1.8 seconds against P&ID r12.',
    },
  ];
  if (candidates?.fullAccess) {
    const verifiers = [
      { value: '', label: 'Workspace leader (unscoped seat)' },
      ...personOptions(candidates, { excludeIds: item.category === 'pre-startup' ? [row.review.proposerId, item.ownerId] : [] }),
    ];
    fields.unshift({ name: 'closedById', label: 'Independent verifier', type: 'select', options: verifiers, value: '' });
  }
  submitModal({
    title: `Verify closure — ${row.review.reviewRef} / ${item.itemRef} (${item.categoryDef?.code || item.category})`,
    submitLabel: 'Verify closed',
    fields,
    onSubmit(raw) {
      const res = actions.psrClosePunchItem({
        reviewId: row.review.id,
        itemId: item.id,
        closedById: raw.closedById || undefined,
        closureEvidenceRef: raw.closureEvidenceRef,
        closureBasis: raw.closureBasis,
        closedDay: raw.closedDay,
      });
      if (!res?.ok) return res;
      rerender();
      return { ok: true, toast: `Verified ${item.itemRef} closed.` };
    },
  });
}

function openSignoffModal(actions, report, candidates, row, presetDiscipline, rerender) {
  const discOpts = row.review.requiredDisciplines.map((key) => ({
    value: key,
    label: PSR_DISCIPLINE_BY_KEY[key]?.label || key,
  }));
  const fields = [
    { name: 'discipline', label: 'Required discipline gate', type: 'select', options: discOpts, value: presetDiscipline || discOpts[0].value },
    {
      name: 'verdict',
      label: 'Gate verdict',
      type: 'select',
      options: PSR_SIGNOFF_VERDICTS.map((v) => ({ value: v.key, label: v.label })),
      value: 'cleared',
    },
    { name: 'signedDay', label: 'Walkdown / sign-off date', type: 'date', required: true, value: report.asOf },
    { name: 'evidenceRef', label: 'Walkdown / test pack reference', required: true, placeholder: 'WALKDOWN-R401-SAF-03' },
    {
      name: 'basisRef',
      label: 'Independent verification basis or rejection reason (min 24 chars)',
      type: 'textarea',
      required: true,
      placeholder: 'Walked unit against redlined P&ID, verified relief valve tag, fire/gas detectors live and PHA actions closed.',
    },
  ];
  if (candidates?.fullAccess) {
    const signers = [
      { value: '', label: 'Workspace leader' },
      ...personOptions(candidates, { excludeIds: [row.review.proposerId] }),
    ];
    fields.unshift({ name: 'signedById', label: 'Discipline signer (proposer excluded)', type: 'select', options: signers, value: signers[1]?.value || '' });
  }
  submitModal({
    title: `Sign discipline gate — ${row.review.reviewRef}`,
    submitLabel: 'Record gate sign-off',
    fields,
    onSubmit(raw) {
      const res = actions.psrRecordSignoff({
        reviewId: row.review.id,
        signedById: raw.signedById || undefined,
        discipline: raw.discipline,
        verdict: raw.verdict,
        signedDay: raw.signedDay,
        evidenceRef: raw.evidenceRef,
        basisRef: raw.basisRef,
      });
      if (!res?.ok) return res;
      rerender();
      return { ok: true, toast: `Recorded ${raw.discipline} gate verdict (${raw.verdict}).` };
    },
  });
}

function openReadinessModal(actions, report, candidates, row, rerender) {
  const unbriefed = row.operatorRows
    .filter((o) => !o.attested)
    .map((o) => {
      const person = row.personRows.find((p) => p.personId === o.operatorId);
      return { value: o.operatorId, label: person?.name || o.operatorId };
    });
  if (!unbriefed.length) {
    toast('Every affected operator on this review is already independently attested.', 'info');
    return;
  }
  const fields = [
    { name: 'operatorId', label: 'Affected operator', type: 'select', options: unbriefed, value: unbriefed[0].value },
    { name: 'procedureRef', label: 'Operating / emergency procedure revision', required: true, placeholder: 'SOP-R401-STARTUP-r8' },
    { name: 'evidenceRef', label: 'Briefing / competency walkdown record', required: true, placeholder: 'TRN-SHIFT-B-2026-114' },
    { name: 'attestedDay', label: 'Attestation date', type: 'date', required: true, value: report.asOf },
  ];
  if (candidates?.fullAccess) {
    const attesters = [
      { value: '', label: 'Workspace leader' },
      ...personOptions(candidates, { excludeIds: [row.review.proposerId] }),
    ];
    fields.unshift({ name: 'attestedById', label: 'Attesting supervisor / trainer (proposer & self excluded)', type: 'select', options: attesters, value: '' });
  }
  submitModal({
    title: `Attest operator readiness — ${row.review.reviewRef}`,
    submitLabel: 'Attest readiness',
    fields,
    onSubmit(raw) {
      const res = actions.psrAttestReadiness({
        reviewId: row.review.id,
        attestedById: raw.attestedById || undefined,
        operatorId: raw.operatorId,
        procedureRef: raw.procedureRef,
        evidenceRef: raw.evidenceRef,
        attestedDay: raw.attestedDay,
      });
      if (!res?.ok) return res;
      rerender();
      return { ok: true, toast: 'Operator pre-startup readiness attested.' };
    },
  });
}

function openAuthoriseModal(actions, candidates, refRow, rerender) {
  const reviewId = refRow.review?.id || refRow.reviewId;
  const label = refRow.review?.reviewRef || refRow.reviewRef;
  const requiredApexId = refRow.apexId || null;
  const requiredApexName = refRow.apexName || null;
  const fields = [
    { name: 'permitClearanceRef', label: 'Permit-to-work return, LOTO removal & blind-list reference', required: true, placeholder: 'PTW-CLR-401 & BLIND-09' },
    {
      name: 'basisRef',
      label: 'Joint-apex startup authorisation basis (min 24 chars)',
      type: 'textarea',
      required: true,
      placeholder: `All Cat A items independently verified closed, required disciplines cleared, affected operators briefed and isolations cleared${requiredApexName ? ` (joint apex: ${requiredApexName})` : ''}.`,
    },
  ];
  if (candidates?.fullAccess && requiredApexId) {
    fields.unshift({
      name: 'authorisedById',
      label: 'Computed joint startup apex',
      type: 'select',
      options: [{ value: requiredApexId, label: requiredApexName || requiredApexId }],
      value: requiredApexId,
    });
  }
  submitModal({
    title: `Grant Startup Authorisation — ${label}`,
    submitLabel: 'Authorise startup',
    fields,
    onSubmit(raw) {
      const res = actions.psrAuthoriseStartup({
        reviewId,
        authorisedById: raw.authorisedById || undefined,
        permitClearanceRef: raw.permitClearanceRef,
        basisRef: raw.basisRef,
      });
      if (!res?.ok) return res;
      rerender();
      return { ok: true, toast: `Startup Authorisation granted for ${label}.` };
    },
  });
}

function openStartupModal(actions, report, row, rerender) {
  submitModal({
    title: `Log physical startup / energisation — ${row.review.reviewRef}`,
    submitLabel: 'Record physical startup',
    fields: [
      { name: 'energisedAt', label: 'Energisation timestamp (ISO-8601 UTC/offset)', required: true, value: report.nowIso },
      { name: 'startupLogRef', label: 'Control-room / breaker / feed-in log reference', required: true, placeholder: 'DCR-LOG-2026-1118-0615' },
      {
        name: 'basisRef',
        label: 'Factual energisation conditions (min 24 chars — premature startup is recorded as a gate breach)',
        type: 'textarea',
        required: true,
        placeholder: 'Master isolation lock cleared, nitrogen purge confirmed complete and process feed introduced at 25% rate under SOP-R401.',
      },
    ],
    onSubmit(raw) {
      const res = actions.psrRecordStartup({
        reviewId: row.review.id,
        energisedAt: raw.energisedAt,
        startupLogRef: raw.startupLogRef,
        basisRef: raw.basisRef,
      });
      if (!res?.ok) return res;
      rerender();
      return {
        ok: true,
        toast: res.safeStartup
          ? `Recorded lawful startup for ${row.review.reviewRef}.`
          : `BREACH RECORDED: ${row.review.reviewRef} energised with ${res.breaches.length} unmet pre-startup safety gate(s).`,
      };
    },
  });
}

function openRestorationModal(actions, report, row, rerender) {
  submitModal({
    title: `Record physical restoration to baseline — ${row.review.reviewRef}`,
    submitLabel: 'Record physical restoration',
    fields: [
      { name: 'restoredAt', label: 'Physical restoration timestamp (ISO-8601 UTC/offset)', required: true, value: report.nowIso },
      { name: 'restorationRef', label: 'Bypass-removal / baseline re-verification reference', required: true, placeholder: 'RESTORE-BYP-204-CERT' },
      {
        name: 'restorationBasis',
        label: 'Verified baseline restoration description (min 24 chars)',
        type: 'textarea',
        required: true,
        placeholder: 'Temporary spool removed, permanent ASME B16.5 spool hydro-tested and reinstalled, and baseline interlock restored to service.',
      },
    ],
    onSubmit(raw) {
      const res = actions.psrRecordRestoration({
        reviewId: row.review.id,
        restoredAt: raw.restoredAt,
        restorationRef: raw.restorationRef,
        restorationBasis: raw.restorationBasis,
      });
      if (!res?.ok) return res;
      rerender();
      return { ok: true, toast: `Recorded baseline restoration for ${row.review.reviewRef}.` };
    },
  });
}

function openConventionsModal(actions, report, rerender) {
  const c = report.conventions;
  submitModal({
    title: 'Pre-startup safety register conventions',
    submitLabel: 'Save conventions',
    fields: [
      {
        name: 'psrPrivacyFloor',
        label: `CSV privacy floor (exact integer ${PSR_BOUNDS.privacyFloor.min}–${PSR_BOUNDS.privacyFloor.max})`,
        required: true,
        value: String(c.psrPrivacyFloor),
      },
      {
        name: 'psrRevertHorizonDays',
        label: `Temporary-change revert warning horizon in days (${PSR_BOUNDS.revertHorizonDays.min}–${PSR_BOUNDS.revertHorizonDays.max})`,
        required: true,
        value: String(c.psrRevertHorizonDays),
      },
      {
        name: 'psrAutoPropagate',
        label: `Automatic ${PSR_RULE_ID} post-commit propagation`,
        type: 'select',
        options: [
          { value: 'true', label: 'Enabled — issue & self-close joint-apex asks' },
          { value: 'false', label: 'Paused — record facts without issuing asks' },
        ],
        value: c.psrAutoPropagate ? 'true' : 'false',
      },
    ],
    onSubmit(raw) {
      const res = actions.psrSetConventions({
        psrPrivacyFloor: raw.psrPrivacyFloor,
        psrRevertHorizonDays: raw.psrRevertHorizonDays,
        psrAutoPropagate: raw.psrAutoPropagate === 'true',
      });
      if (!res?.ok) return res;
      rerender();
      return { ok: true, toast: 'Updated pre-startup safety conventions.' };
    },
  });
}

/* ----------------------------------------------------------- tab renderers */

function renderReviewsTab({ report, actions, candidates, canOpen, canAct, canAuth, rerender }) {
  const blocks = [];

  if (report.detailed) {
    if (!report.rows.length) {
      blocks.push(
        card({
          title: 'Pre-startup safety reviews',
          body: emptyState({
            title: 'No pre-startup safety reviews in scope',
            body: 'Open a review before energising any new facility, permanent modification (MOC), temporary modification/bypass, turnaround restart or post-incident restart.',
            action: canOpen
              ? h('button', { type: 'button', className: 'btn btn-primary', onClick: () => openReviewModal(actions, report, candidates, rerender) }, 'Open first review')
              : null,
          }),
        }),
      );
    } else {
      blocks.push(
        card({
          title: 'Pre-startup safety reviews',
          subtitle: 'One derived state per review; proposer barred from gates, Cat A closure, readiness and authorisation; startup authority sits at the computed matrix joint apex.',
          body: table({
            columns: [
              { label: 'Review & unit', render: (r) => h('div', {}, h('strong', {}, r.review.reviewRef), h('div', { className: 'muted small' }, r.review.unitRef)) },
              {
                label: 'Trigger',
                render: (r) => h(
                  'div',
                  {},
                  h('span', {}, r.triggerDef?.label || r.review.triggerKind),
                  r.isTemporary
                    ? h('div', { className: 'muted small' }, `Revert by ${r.review.revertByDay}`)
                    : h('div', { className: 'muted small' }, `Planned ${r.review.plannedStartDay}`),
                ),
              },
              {
                label: 'Derived state',
                render: (r) => h(
                  'div',
                  { className: 'stack-xs' },
                  badge(r.state.label, r.state.tone),
                  r.temporaryExpiring ? h('div', { className: 'warn small' }, `Revert in ${dayWindowLabel(r.daysToRevert)}`) : null,
                  r.flags.includes('unverified-self-closure') ? h('div', { className: 'bad small' }, 'Disqualified Cat A closure on file') : null,
                  r.flags.includes('proposer-signed-discipline') ? h('div', { className: 'bad small' }, 'Disqualified proposer sign-off on file') : null,
                ),
              },
              {
                label: 'Punch (Cat A / B)',
                render: (r) => h(
                  'div',
                  { className: 'small' },
                  h('div', {}, `Cat A: ${r.openCatAN} open / ${r.closedCatAN} closed`),
                  h('div', {}, `Cat B: ${r.openCatBN} open (${r.overdueCatBN} overdue) / ${r.closedCatBN} closed`),
                ),
              },
              {
                label: 'Gates & briefing',
                render: (r) => h(
                  'div',
                  { className: 'small' },
                  h('div', {}, `Gates: ${r.clearedDisciplines.length}/${r.review.requiredDisciplines.length} cleared${r.rejectedDisciplines.length ? ` (${r.rejectedDisciplines.length} rejected)` : ''}`),
                  h('div', {}, `Operators: ${r.briefedOperators.length}/${r.review.affectedOperatorIds.length} attested`),
                ),
              },
              {
                label: 'Joint startup apex',
                render: (r) => {
                  if (r.apexAmbiguous) return badge('Ambiguous matrix apex', 'bad');
                  if (r.incompleteLineCoverage) return badge('Incomplete line coverage', 'warn');
                  if (!r.apexId) return badge('No shared apex', 'warn');
                  return h(
                    'div',
                    { className: 'small' },
                    h('strong', {}, r.apexName || r.apexId),
                    h('div', { className: 'muted' }, `${r.lineManagerIds.length} active line(s), ${r.involvedPersonIds.length} person(s)`),
                  );
                },
              },
              {
                label: 'Actions',
                render: (r) => {
                  const btns = [];
                  if (canAct && !r.startup) {
                    btns.push(h('button', { type: 'button', className: 'btn btn-ghost btn-sm', onClick: () => openSignoffModal(actions, report, candidates, r, null, rerender) }, 'Gate'));
                    if (r.unbriefedOperators.length) {
                      btns.push(h('button', { type: 'button', className: 'btn btn-ghost btn-sm', onClick: () => openReadinessModal(actions, report, candidates, r, rerender) }, 'Brief'));
                    }
                  }
                  if (canAuth && r.state.key === 'ready-for-authorisation' && r.apexId) {
                    btns.push(h('button', { type: 'button', className: 'btn btn-primary btn-sm', onClick: () => openAuthoriseModal(actions, candidates, r, rerender) }, 'Authorise'));
                  }
                  if (canAct && !r.startup) {
                    btns.push(h('button', { type: 'button', className: 'btn btn-ghost btn-sm', onClick: () => openStartupModal(actions, report, r, rerender) }, 'Start'));
                  }
                  if (canAct && r.isTemporary && r.startup && !r.restored) {
                    btns.push(h('button', { type: 'button', className: 'btn btn-primary btn-sm', onClick: () => openRestorationModal(actions, report, r, rerender) }, 'Restore'));
                  }
                  return btns.length ? h('div', { className: 'row wrap gap-xs' }, ...btns) : h('span', { className: 'muted small' }, 'Complete');
                },
              },
            ],
            rows: report.rows,
          }),
        }),
      );

      if (report.lineRows.length) {
        blocks.push(
          card({
            title: 'Reporting-line visibility (matrix-aware, never summed across lines)',
            subtitle: `Each active reporting line sees every review touching its people and counts each person once. Register headline counts (${report.totals.reviews} review(s), ${report.totals.peopleN} distinct people across ${report.totals.linesN} active line(s)) deduplicate dual-line relationships.`,
            body: table({
              columns: [
                { label: 'Line manager', render: (lr) => lr.managerName },
                { label: 'Reviews touching line', render: (lr) => String(lr.reviewsN) },
                { label: 'Distinct people on line', render: (lr) => String(lr.peopleN) },
                { label: 'Unsafe breaches', render: (lr) => String(lr.unsafeBreachN) },
                { label: 'Temp expired', render: (lr) => String(lr.tempExpiredN) },
                { label: 'Cat B overdue', render: (lr) => String(lr.postOverdueN) },
                { label: 'Blocked / rejected', render: (lr) => String(lr.blockedOrRejectedN) },
                { label: 'Ready for auth', render: (lr) => String(lr.readyForAuthN) },
              ],
              rows: report.lineRows,
            }),
          }),
        );
      }
    }
  } else if (report.apexActionableRefs.length && canAuth) {
    blocks.push(
      card({
        title: 'Ready reviews where this seat is the computed matrix joint apex',
        subtitle: 'Individual names and findings stay withheld at this altitude; verified gate counts are shown so you can exercise your non-delegable joint-apex gate.',
        body: table({
          columns: [
            { label: 'Review ref', render: (ar) => ar.reviewRef },
            { label: 'Trigger', render: (ar) => ar.triggerLabel },
            { label: 'Verified gates', render: (ar) => `${ar.clearedGatesN} cleared, ${ar.closedCatAN} Cat A closed, ${ar.briefedOperatorsN} briefed` },
            {
              label: 'Joint-apex gate',
              render: (ar) => h('button', { type: 'button', className: 'btn btn-primary btn-sm', onClick: () => openAuthoriseModal(actions, candidates, ar, rerender) }, 'Authorise startup'),
            },
          ],
          rows: report.apexActionableRefs,
        }),
      }),
    );
  }

  // Exact ten-state partition & five-trigger breakdown (visible at every rank 1..5).
  blocks.push(
    card({
      title: 'Ten-state partition (exact single-count reconciliation)',
      subtitle: `Sums to ${report.totals.reviews} review(s); balances = ${report.balances ? 'yes' : 'no'}, complete = ${report.figuresComplete ? 'yes' : 'no'}.`,
      body: table({
        columns: [
          { label: 'Derived state', render: (sr) => badge(sr.label, sr.tone) },
          { label: 'State key', render: (sr) => h('code', {}, sr.key) },
          { label: 'Reviews', render: (sr) => h('span', { 'data-testid': `psr-state-${sr.key}` }, String(sr.count)) },
        ],
        rows: report.stateRows,
      }),
    }),
  );

  blocks.push(
    card({
      title: 'Trigger breakdown',
      body: table({
        columns: [
          { label: 'Trigger kind', render: (tr) => tr.label },
          { label: 'Reviews', render: (tr) => h('span', { 'data-testid': `psr-trigger-${tr.key}` }, String(tr.count)) },
        ],
        rows: report.triggerRows,
      }),
    }),
  );

  return h('div', { className: 'stack' }, ...blocks);
}

function renderPunchTab({ report, actions, candidates, canAct, rerender }) {
  if (!report.detailed) {
    return card({
      title: 'Punch-list summary by discipline (aggregate altitude)',
      subtitle: `Category A blockers: ${report.totals.catAOpen} open / ${report.totals.catAClosed} verified closed. Category B conditions: ${report.totals.catBOpen} open (${report.totals.catBOverdue} overdue) / ${report.totals.catBClosed} closed.`,
      body: table({
        columns: [
          { label: 'Discipline', render: (d) => d.label },
          { label: 'Cat A open', render: (d) => String(d.catAOpenN) },
          { label: 'Cat A closed', render: (d) => String(d.catAClosedN) },
          { label: 'Cat B open', render: (d) => String(d.catBOpenN) },
          { label: 'Cat B overdue', render: (d) => String(d.catBOverdueN) },
          { label: 'Cat B closed', render: (d) => String(d.catBClosedN) },
        ],
        rows: report.disciplineRows,
      }),
    });
  }

  const allItems = report.rows.flatMap((row) => row.punchItems.map((item) => ({ row, item })));
  return card({
    title: 'Punch-list ledger (CCPS Category A blockers vs Category B dated conditions)',
    subtitle: 'Category A items block Startup Authorisation and require closure by someone other than both the modification proposer and the item owner. Category B items require a declared due day.',
    actions: canAct && report.rows.length
      ? [h('button', { type: 'button', className: 'btn btn-primary btn-sm', onClick: () => openPunchModal(actions, report, candidates, null, rerender) }, 'Record punch item')]
      : [],
    body: !allItems.length
      ? emptyState({ title: 'No punch items recorded', body: 'Log Category A pre-startup blockers and Category B dated post-startup conditions discovered during walkdown and loop checks.' })
      : table({
        columns: [
          { label: 'Review / item', render: ({ row, item }) => h('div', {}, h('strong', {}, `${row.review.reviewRef} · ${item.itemRef}`), h('div', { className: 'muted small' }, item.disciplineDef?.label || item.discipline)) },
          {
            label: 'Category',
            render: ({ item }) => badge(
              item.category === 'pre-startup' ? 'Cat A — pre-startup blocker' : 'Cat B — post-startup condition',
              item.category === 'pre-startup' ? 'bad' : 'warn',
            ),
          },
          { label: 'Finding', render: ({ item }) => h('span', { className: 'small' }, item.finding) },
          {
            label: 'Owner & due',
            render: ({ row, item }) => {
              const ownerName = row.personRows.find((p) => p.personId === item.ownerId)?.name || item.ownerId;
              return h(
                'div',
                { className: 'small' },
                h('div', {}, ownerName),
                item.dueDay ? h('div', { className: item.overdue ? 'bad' : 'muted' }, `${item.dueDay}${!item.verifiedClosed && item.daysToDue !== null ? ` (${dayWindowLabel(item.daysToDue)})` : ''}`) : h('div', { className: 'muted' }, 'Before startup'),
              );
            },
          },
          {
            label: 'Verification status',
            render: ({ item }) => {
              if (item.verifiedClosed) {
                return h('div', { className: 'small' }, badge('Verified closed', 'good'), h('div', { className: 'muted' }, `${item.closedDay} · ${item.closureEvidenceRef}`));
              }
              if (item.closureDisqualifiedReason) {
                return h('div', { className: 'small' }, badge('Disqualified closure — still open', 'bad'), h('div', { className: 'bad' }, item.closureDisqualifiedReason));
              }
              return item.overdue ? badge(`Overdue (${item.overdueDays}d)`, 'bad') : badge('Open', 'warn');
            },
          },
          {
            label: 'Action',
            render: ({ row, item }) => (
              canAct && !item.verifiedClosed
                ? h('button', { type: 'button', className: 'btn btn-ghost btn-sm', onClick: () => openClosePunchModal(actions, report, candidates, row, item, rerender) }, 'Verify close')
                : h('span', { className: 'muted small' }, '—')
            ),
          },
        ],
        rows: allItems,
      }),
  });
}

function renderGatesTab({ report, actions, candidates, canAct, rerender }) {
  const disciplineCard = card({
    title: 'Verification discipline coverage',
    subtitle: 'Latest independent (non-proposer) sign-off governs each required gate; a subsequent rejection revokes an earlier clearance while retaining both records.',
    body: table({
      columns: [
        { label: 'Discipline', render: (d) => d.label },
        { label: 'Reviews requiring', render: (d) => String(d.reviewsRequiredN) },
        { label: 'Gates cleared', render: (d) => String(d.gatesClearedN) },
        { label: 'Gates rejected', render: (d) => String(d.gatesRejectedN) },
        { label: 'Gates unsigned', render: (d) => String(d.gatesUnsignedN) },
      ],
      rows: report.disciplineRows,
    }),
  });

  if (!report.detailed) return disciplineCard;

  const gateFlat = report.rows.flatMap((row) => row.gateRows.map((gate) => ({ row, gate })));
  const opFlat = report.rows.flatMap((row) => row.operatorRows.map((op) => ({ row, op })));

  return h(
    'div',
    { className: 'stack' },
    disciplineCard,
    card({
      title: 'Per-review required discipline gates',
      body: !gateFlat.length
        ? emptyState({ title: 'No discipline gates in scope', body: 'Required disciplines are declared when a review is opened.' })
        : table({
          columns: [
            { label: 'Review', render: ({ row }) => `${row.review.reviewRef} — ${row.review.unitRef}` },
            { label: 'Discipline', render: ({ gate }) => gate.label },
            {
              label: 'Governing verdict',
              render: ({ gate }) => {
                if (gate.status === 'cleared') return badge('Cleared', 'good');
                if (gate.status === 'rejected') return badge('Rejected — hold', 'bad');
                return badge('Unsigned', 'warn');
              },
            },
            {
              label: 'Evidence & date',
              render: ({ gate }) => (gate.governing
                ? h('span', { className: 'small' }, `${gate.governing.signedDay} · ${gate.governing.evidenceRef}`)
                : h('span', { className: 'muted small' }, 'Awaiting independent walkdown')),
            },
            {
              label: 'Action',
              render: ({ row, gate }) => (
                canAct && !row.startup
                  ? h('button', { type: 'button', className: 'btn btn-ghost btn-sm', onClick: () => openSignoffModal(actions, report, candidates, row, gate.discipline, rerender) }, 'Sign gate')
                  : h('span', { className: 'muted small' }, 'Locked')
              ),
            },
          ],
          rows: gateFlat,
        }),
    }),
    card({
      title: 'Affected-operator pre-startup procedure readiness (OSHA 1910.119(i)(4))',
      subtitle: 'Every listed operator must hold a pre-startup procedure attestation from someone other than themselves and other than the modification proposer.',
      body: !opFlat.length
        ? emptyState({ title: 'No operator briefings in scope', body: 'Affected operators are named on each review.' })
        : table({
          columns: [
            { label: 'Review', render: ({ row }) => row.review.reviewRef },
            { label: 'Affected operator', render: ({ row, op }) => row.personRows.find((p) => p.personId === op.operatorId)?.name || op.operatorId },
            {
              label: 'Readiness status',
              render: ({ op }) => {
                if (op.attested) return badge('Attested', 'good');
                if (op.attestation?.disqualifiedReason) return badge(`Disqualified (${op.attestation.disqualifiedReason})`, 'bad');
                return badge('Unbriefed — blocks startup', 'warn');
              },
            },
            {
              label: 'Procedure & evidence',
              render: ({ op }) => (op.attested
                ? h('span', { className: 'small' }, `${op.attestation.procedureRef} · ${op.attestation.evidenceRef} (${op.attestation.attestedDay})`)
                : h('span', { className: 'muted small' }, '—')),
            },
            {
              label: 'Action',
              render: ({ row, op }) => (
                canAct && !row.startup && !op.attested
                  ? h('button', { type: 'button', className: 'btn btn-ghost btn-sm', onClick: () => openReadinessModal(actions, report, candidates, row, rerender) }, 'Attest')
                  : h('span', { className: 'muted small' }, '—')
              ),
            },
          ],
          rows: opFlat,
        }),
    }),
  );
}

function renderStartupsTab({ report, actions, candidates, canAct, canAuth, rerender }) {
  if (!report.detailed) {
    return card({
      title: 'Startup authorisation & temporary-modification posture (aggregate)',
      body: h(
        'div',
        { className: 'stack-sm' },
        h('p', {}, `Ready for joint-apex authorisation: ${report.totals.readyForAuth}. Authorised awaiting startup: ${report.totals.authorisedWaiting}. Unsafe-startup breaches: ${report.totals.unsafeBreach}.`),
        h('p', {}, `Expired live temporary modifications: ${report.totals.temporaryExpired}. Approaching temporary revert deadline (within ${report.conventions.psrRevertHorizonDays} day(s)): ${report.totals.temporaryExpiring}.`),
        h('p', {}, `Closed verified complete: ${report.totals.closedVerified}.`),
      ),
    });
  }

  return card({
    title: 'Startup authorisations, physical energisation & temporary modifications',
    subtitle: 'Startup Authorisation refuses any unmet pre-startup gate or non-apex signer. The physical startup log accepts past energisation reports honestly and flags any premature energisation as a permanent breach. Temporary changes exit live status only when physically restored.',
    body: !report.rows.length
      ? emptyState({ title: 'No reviews on register', body: 'Open a pre-startup safety review to track startup authorisation, energisation and temporary-change reversal.' })
      : table({
        columns: [
          { label: 'Review & unit', render: (r) => h('div', {}, h('strong', {}, r.review.reviewRef), h('div', { className: 'muted small' }, r.review.unitRef)) },
          { label: 'State', render: (r) => badge(r.state.label, r.state.tone) },
          {
            label: 'Authorisation',
            render: (r) => {
              if (r.authorisationValid) {
                return h('div', { className: 'small' }, badge('Valid joint-apex auth', 'good'), h('div', { className: 'muted' }, `${r.authorisation.authorisedDay} · ${r.authorisation.permitClearanceRef}`));
              }
              if (r.authorisation) {
                return h('div', { className: 'small' }, badge('Disqualified auth', 'bad'), h('div', { className: 'bad' }, r.authorisationInvalidReasons.join(', ')));
              }
              return h('span', { className: 'muted small' }, r.apexName ? `Awaiting ${r.apexName}` : 'Not authorised');
            },
          },
          {
            label: 'Physical startup & breaches',
            render: (r) => {
              if (!r.startup) return h('span', { className: 'muted small' }, `Not energised (planned ${r.review.plannedStartDay})`);
              return h(
                'div',
                { className: 'small' },
                h('div', {}, `${r.startup.energisedDay} · ${r.startup.startupLogRef}`),
                r.breachLabels.length
                  ? h('div', { className: 'bad' }, r.breachLabels.join('; '))
                  : h('div', { className: 'good' }, 'Zero gate breaches at startup'),
              );
            },
          },
          {
            label: 'Temporary-change reversal',
            render: (r) => {
              if (!r.isTemporary) return h('span', { className: 'muted small' }, 'Permanent scope');
              if (r.restored) return h('div', { className: 'small good' }, `Restored ${r.startup.restoredDay} (${r.startup.restorationRef})`);
              if (!r.startup) return h('span', { className: 'small' }, `Revert by ${r.review.revertByDay}`);
              const toneClass = r.revertOverdueDays ? 'bad' : (r.temporaryExpiring ? 'warn' : '');
              return h('div', { className: `small ${toneClass}` }, `${r.review.revertByDay} (${dayWindowLabel(r.daysToRevert)})`);
            },
          },
          {
            label: 'Actions',
            render: (r) => {
              const btns = [];
              if (canAuth && r.state.key === 'ready-for-authorisation' && r.apexId) {
                btns.push(h('button', { type: 'button', className: 'btn btn-primary btn-sm', onClick: () => openAuthoriseModal(actions, candidates, r, rerender) }, 'Authorise'));
              }
              if (canAct && !r.startup) {
                btns.push(h('button', { type: 'button', className: 'btn btn-ghost btn-sm', onClick: () => openStartupModal(actions, report, r, rerender) }, 'Log startup'));
              }
              if (canAct && r.isTemporary && r.startup && !r.restored) {
                btns.push(h('button', { type: 'button', className: 'btn btn-primary btn-sm', onClick: () => openRestorationModal(actions, report, r, rerender) }, 'Log restoration'));
              }
              return btns.length ? h('div', { className: 'row wrap gap-xs' }, ...btns) : h('span', { className: 'muted small' }, '—');
            },
          },
        ],
        rows: report.rows,
      }),
  });
}

function renderMethodTab({ report, actions, canOpen, rerender }) {
  return h(
    'div',
    { className: 'stack' },
    card({
      title: 'Five-stage pre-startup safety review & temporary-change method',
      subtitle: `${PSR_ADR} · Engine ${PSR_ENGINE_VERSION} · Spine rule ${PSR_RULE_ID} · CSV scope ${PSR_CSV_SCOPE}`,
      body: h(
        'figure',
        { className: 'method-figure' },
        h('img', {
          src: './assets/pre-startup-safety-method.jpg',
          alt: 'Five-stage pre-startup safety review method: 1 Declare unit, basis and gates; 2 Close Cat A blockers first; 3 Independent gates and briefing; 4 Joint-apex startup authority; 5 Energise and revert temporary.',
          className: 'method-diagram',
          loading: 'lazy',
        }),
        h('figcaption', { className: 'muted small' }, 'Every stage produces append-only or independently verified operational records. Derived states, overdue clocks, unsafe-startup breaches and joint startup apexes are computed on read and never stored.'),
      ),
    }),
    card({
      title: 'Published safety, organisational & governance frameworks',
      body: h('ul', { className: 'prose-list' }, ...PSR_METHOD.frameworks.map((item) => h('li', {}, item))),
    }),
    card({
      title: 'What this register prints vs what it deliberately refuses to claim',
      body: h(
        'div',
        { className: 'stack-sm' },
        h('h3', { className: 'section-subhead' }, 'Printed from verified record'),
        h('ul', { className: 'prose-list' }, ...PSR_METHOD.printed.map((item) => h('li', {}, item))),
        h('h3', { className: 'section-subhead' }, 'Out of scope — never faked or silently defaulted'),
        h('ul', { className: 'prose-list' }, ...PSR_METHOD.deliberatelyAbsent.map((item) => h('li', {}, item))),
      ),
    }),
    card({
      title: 'Register conventions & separate reconciliation proof',
      actions: canOpen
        ? [h('button', { type: 'button', className: 'btn btn-ghost btn-sm', onClick: () => openConventionsModal(actions, report, rerender) }, 'Edit conventions')]
        : [],
      body: h(
        'div',
        { className: 'stack-sm small' },
        h('p', {}, `As-of day: ${report.asOf} · CSV privacy floor: ${report.conventions.psrPrivacyFloor} · Temporary-change revert warning horizon: ${report.conventions.psrRevertHorizonDays} day(s) · ${PSR_RULE_ID} automatic propagation: ${report.conventions.psrAutoPropagate ? 'enabled' : 'paused'}.`),
        h('p', {}, `Partition balances: ${report.balances ? 'YES (states, triggers, punch categories, gates and child ledgers all reconcile)' : 'NO'}. Record complete: ${report.figuresComplete ? 'YES (zero dropped rows, zero off-graph hands, unambiguous matrix reach)' : `NO — ${report.incompleteReasons.join(' ')}`}.`),
        report.markers.length
          ? h('p', { className: 'warn' }, `${report.markers.length} identity-free ${PSR_RULE_ID} reach observation marker(s) recorded where a joint apex could not be certified.`)
          : null,
      ),
    }),
  );
}

/* --------------------------------------------------------------- main view */

export function renderPreStartup(ctx = {}) {
  const api = ctx.api || ctx.actions;
  const root = h('div', { className: 'stack', 'data-testid': 'psr-page' });
  let currentSection = activeSection(ctx.query || ctx.params);

  const onRefresh = () => {
    draw();
    ctx.rerender?.();
  };

  function draw() {
    clear(root);
    const report = api?.psrReport ? api.psrReport() : { ok: false, message: 'Pre-startup API unavailable.' };

    if (!report?.ok) {
      root.append(
        pageHeader({
          eyebrow: 'Operations · pre-startup safety',
          title: 'Pre-startup safety review',
          subtitle: 'Accountability gate before energising new, modified, temporary or turnaround units.',
        }),
        banner({ tone: 'bad', title: 'Register unavailable', body: report?.message || 'This seat cannot read the pre-startup safety register.' }),
      );
      return;
    }

    const canOpen = Boolean(report.rights?.canOpen);
    const canAct = Boolean(report.rights?.canAct);
    const canAuth = Boolean(report.rights?.canAuth);
    const candidates = report.detailed && api?.psrCandidates ? api.psrCandidates() : { ok: true, people: [], fullAccess: false };

    const headerActions = [];
    if (canOpen && report.detailed) {
      headerActions.push(
        h('button', { type: 'button', className: 'btn btn-primary', 'data-testid': 'psr-open-btn', onClick: () => openReviewModal(api, report, candidates, onRefresh) }, 'Open review'),
      );
    }
    if (canAct && report.detailed && report.rows.length) {
      headerActions.push(
        h('button', { type: 'button', className: 'btn btn-ghost', 'data-testid': 'psr-punch-btn', onClick: () => openPunchModal(api, report, candidates, null, onRefresh) }, 'Log punch item'),
      );
    }
    if (canAct) {
      headerActions.push(
        h('button', {
          type: 'button',
          className: 'btn btn-ghost',
          'data-testid': 'psr-scan-btn',
          onClick: () => {
            const res = api.psrScan();
            if (!res?.ok) { toast(res?.message || 'Scan refused.', 'bad'); return; }
            toast(res.paused ? res.message : `Ran ${PSR_RULE_ID} pre-startup safety scan.`, res.paused ? 'warn' : 'good');
            onRefresh();
          },
        }, 'Run safety scan'),
      );
    }
    if (canOpen) {
      headerActions.push(
        h('button', { type: 'button', className: 'btn btn-ghost', 'data-testid': 'psr-conventions-btn', onClick: () => openConventionsModal(api, report, onRefresh) }, 'Conventions'),
      );
    }
    headerActions.push(
      h('button', {
        type: 'button',
        className: 'btn btn-ghost',
        'data-testid': 'psr-export-btn',
        onClick: () => {
          const liveState = ctx.store?.state || ctx.store?.getState?.() || api?.getState?.() || ctx.state;
          const file = exportWorkspaceCsv(liveState, PSR_CSV_SCOPE);
          if (!file?.ok) { toast(file?.error || 'Nothing exported.', 'bad'); return; }
          downloadText({ filename: file.filename, text: file.csv, mime: 'text/csv' });
          toast('Exported identity-free aggregate pre-startup safety CSV.', 'good');
        },
      }, 'Export CSV'),
    );

    const t = report.totals;
    const stats = h(
      'div',
      { className: 'grid grid-4 gap-sm', 'data-testid': 'psr-stats' },
      makeStat('Reviews in scope', t.reviews, `${t.peopleN} distinct people · ${t.linesN} active line(s)`, 'psr-stat-reviews'),
      makeStat('Unsafe-startup breaches', t.unsafeBreach, 'Energised with unmet gate / no auth', 'psr-stat-unsafe', t.unsafeBreach ? 'bad' : 'good'),
      makeStat('Expired temp changes', t.temporaryExpired, `${t.temporaryExpiring} inside ${report.conventions.psrRevertHorizonDays}d horizon`, 'psr-stat-temp-expired', t.temporaryExpired ? 'bad' : 'good'),
      makeStat('Live Cat B overdue', t.postOverdue, `${t.catBOverdue} overdue of ${t.catBOpen} open Cat B`, 'psr-stat-post-overdue', t.postOverdue ? 'bad' : 'good'),
      makeStat('Held before startup', t.gateRejected + t.blockedCatA, `${t.gateRejected} gate rejected · ${t.blockedCatA} Cat A blocked`, 'psr-stat-held', (t.gateRejected + t.blockedCatA) ? 'warn' : 'good'),
      makeStat('Cat A blockers open', t.catAOpen, `${t.catAClosed} independently verified closed`, 'psr-stat-cata-open', t.catAOpen ? 'warn' : 'good'),
      makeStat('Ready for authorisation', t.readyForAuth, `${t.authorisedWaiting} authorised awaiting startup`, 'psr-stat-ready', t.readyForAuth ? 'warn' : 'neutral'),
      makeStat('Closed verified', t.closedVerified, `${t.liveConditionsOpen} live in-window`, 'psr-stat-closed', 'good'),
    );

    const reconBar = h(
      'div',
      { className: 'row wrap gap-xs align-center', 'data-testid': 'psr-reconciliation' },
      h('span', { 'data-testid': 'psr-balances' }, badge(report.balances ? 'Balances: yes' : 'Balances: no', report.balances ? 'good' : 'bad')),
      h('span', { 'data-testid': 'psr-complete' }, badge(report.figuresComplete ? 'Figures complete: yes' : 'Figures complete: no', report.figuresComplete ? 'good' : 'warn')),
      badge(`As of ${report.asOf}`, 'neutral'),
      badge(`Privacy floor ${report.conventions.psrPrivacyFloor}`, 'neutral'),
      badge(report.conventions.psrAutoPropagate ? `${PSR_RULE_ID}: active` : `${PSR_RULE_ID}: paused`, report.conventions.psrAutoPropagate ? 'neutral' : 'warn'),
    );

    const notices = [];
    notices.push(
      banner({
        tone: 'info',
        title: 'Governance record — not a physical interlock or emergency control',
        body: 'Records pre-startup verification, independent discipline gates, affected-operator briefings, matrix joint-apex Startup Authorisations, physical energisation timestamps and temporary-change restorations (OSHA 29 CFR 1910.119(i), AIChE CCPS, Flixborough). Never operates plant equipment or certifies legal compliance.',
      }),
    );
    if (!report.detailed && report.disclosure.reason) {
      notices.push(banner({ tone: 'info', title: 'Aggregate executive disclosure', body: report.disclosure.reason }));
    }
    if (!report.figuresComplete) {
      notices.push(banner({ tone: 'warn', title: 'Record integrity notice (printed separately from partition balance)', body: report.incompleteReasons.join(' ') }));
    }
    if (report.warnings.length) {
      notices.push(banner({ tone: 'warn', title: 'Dropped unreadable stored rows', body: report.warnings.join(' ') }));
    }

    const navTabs = tabs({
      items: SECTION_KEYS.map((key) => ({ key, label: PSR_SECTION_TITLES[key] })),
      active: currentSection,
      ariaLabel: 'Pre-startup safety review sections',
      onSelect: (key) => {
        currentSection = key;
        if (typeof ctx.navigate === 'function') {
          ctx.navigate(key === 'reviews' ? 'pre-startup' : `pre-startup?view=${key}`);
        } else if (typeof window !== 'undefined' && window.location) {
          window.location.hash = key === 'reviews' ? PSR_HREF : `${PSR_HREF}?view=${key}`;
        }
        draw();
      },
    });

    const panelCtx = { report, actions: api, candidates, canOpen, canAct, canAuth, rerender: onRefresh };
    let body;
    if (currentSection === 'punch') body = renderPunchTab(panelCtx);
    else if (currentSection === 'gates') body = renderGatesTab(panelCtx);
    else if (currentSection === 'startups') body = renderStartupsTab(panelCtx);
    else if (currentSection === 'method') body = renderMethodTab(panelCtx);
    else body = renderReviewsTab(panelCtx);

    root.append(
      pageHeader({
        eyebrow: 'Operations · pre-startup safety',
        title: 'Pre-startup safety review',
        subtitle: 'Verify design conformance, Category A blockers, independent discipline gates, operator readiness, joint-apex authorisation and temporary-change reversal before and after energisation.',
        actions: headerActions,
      }),
      ...notices,
      reconBar,
      stats,
      navTabs,
      body,
    );
  }

  draw();
  return root;
}

export default renderPreStartup;
