/**
 * app/views/dutyCover.js — `#/duty-cover`, the Duty Coverage Register
 * (ADR-0121, Schema v114).
 *
 * Five panels, five different questions, one per duty line:
 *   Desk          "If I am not here tomorrow, which of my duties stops?"
 *   Register      "Who is declared answerable for each duty, and is that reachable?"
 *   Gaps          "Which duty carries open work and has no cover at all — and why?"
 *   Concentration "Which duty is being carried by one hand above the declared share?"
 *   Method        what is declared, what is derived, and what is refused.
 *
 * The screen never prints a coverage score for a person. Its rate is about the
 * REGISTER (named + eligible + exercised), and a refused or thin cell is printed
 * with its reason, never as a reassuring blank or a zero.
 */
import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import { recordFocus, isFocused, focusRowProps, focusCardClass, focusAbsentNote } from '../ui/recordFocus.js';
import { serializeCsv } from '../core/csv.js';
import { DUTY_BRANCH_DISCLOSURE_PREMISE, DUTY_COVERAGE_PANELS, DUTY_HANDOVER_DIGEST_PREMISE, DUTY_PREMISE, DUTY_READING_ROLLUP_PREMISE, SPAN_READINGS_CSV_COLUMNS } from '../core/domain/dutyCoverageRegistry.js';
import { DUTY_ABSENCE_PREMISE } from '../core/domain/dutyAbsenceRegistry.js';
import { DUTY_REHEARSAL_MODES, DUTY_REHEARSAL_MODE_LABELS, DUTY_REHEARSAL_PREMISE } from '../core/domain/dutyRehearsalRegistry.js';
import { BRANCH_READING_BAND_LABELS, BRANCH_READING_PREMISE, BRANCH_READING_STATE_LABELS } from '../core/domain/branchReadingRegistry.js';

const PANELS = DUTY_COVERAGE_PANELS;
const CSV_COLUMNS = ['row_kind', 'scope', 'altitude', 'duty_key', 'band', 'open_n',
  'covers_declared_n', 'covers_eligible_n', 'covers_exercised_n', 'candidates_eligible_n',
  'candidates_refused_n', 'concentration_top_share_pct', 'sole_handed', 'window_days', 'refused_reason',
  'absence_seat_rank', 'absence_from', 'absence_to', 'absence_duties_n', 'absence_covered_n',
  'absence_thin_n', 'absence_cover_absent_n', 'absence_ineligible_n', 'absence_gap_n', 'absence_exposed_open_n',
  'absence_rehearsed_n', 'absence_rehearsal_gaps_n',
  // ADR-0132: inference-only handover counts on the existing absence row kind.
  'absence_handover_checks_n', 'absence_handover_open_work_n', 'absence_handover_cutoff_passed_n',
  'branch_seats_n', 'duties_n', 'branch_covered_n', 'branch_gap_n', 'branch_open_gap_n', 'branch_readiness_pct',
  'branch_withheld', 'branch_floor_n', 'branch_rate_floor_n',
  'branch_released_n', 'branch_released_seats_n', 'branch_withheld_n', 'branch_deferred_n', 'branch_pooled_pct', 'branch_mean_pct',
  // ADR-0129: the hand-off's derived state on the cell, plus its counts. A cell
  // nobody asked about exports BLANK, never 0 and never "fine".
  'branch_reading_state', 'branch_reading_band', 'branch_reading_asked_on', 'branch_reading_published_on',
  'branch_reading_published_n', 'branch_reading_declined_n', 'branch_reading_outstanding_n',
  'branch_reading_lapsed_n', 'branch_reading_not_asked_n',
  // ADR-0133: the span-wide roll-up counts, on the existing row kinds. One
  // shared list keeps the Desk download and the workspace export in step.
  ...SPAN_READINGS_CSV_COLUMNS];

let apiRef = null;
/** Scratch for the planning form's preview window (a read, never a write). */
let planPreview = null;

const panelFor = (query) => {
  const key = query?.get?.('panel');
  return PANELS.some((p) => p.key === key) ? key : 'desk';
};
const go = (ctx, panel) => ctx.navigate(`#/duty-cover?panel=${encodeURIComponent(panel)}`);
const num = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));
const pctText = (v) => (v === null || v === undefined ? 'refused' : `${v}%`);

function notify(result, message) {
  if (!result?.ok) { toast(result?.error || 'The duty-cover action was refused.', 'bad'); return false; }
  toast(result.warning || message, result.warning ? 'bad' : 'good');
  return true;
}

function exportCsv() {
  const result = apiRef?.dutyCoverageCsvRows?.();
  if (!result?.ok) { toast(result?.error || 'The duty-coverage export was refused.', 'bad'); return; }
  downloadText({
    filename: `leados-duty-cover-${new Date().toISOString().slice(0, 10)}.csv`,
    text: serializeCsv({ columns: CSV_COLUMNS.map((key) => ({ key, header: key })), rows: result.rows }),
    mime: 'text/csv',
  });
}

function copyBrief() {
  const brief = apiRef?.dutyCoverageBriefText?.();
  const text = brief?.text || '';
  if (!text) { toast('No brief is available yet.', 'bad'); return; }
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => toast('Upward brief copied.', 'good')).catch(() => toast('Could not copy — use the desk panel instead.', 'warn'));
  } else toast('Clipboard unavailable — the brief is on the desk panel.', 'warn');
}

const bandBadge = (band) => {
  if (band === 'covered') return badge('covered', 'good', 'A declared cover is eligible and has recorded work inside this span in the window');
  if (band === 'thin') return badge('thin', 'warn', 'Declared and eligible, but no recorded exercise inside the window');
  if (band === 'ineligible') return badge('ineligible', 'bad', 'A declared cover cannot answer at this altitude');
  return badge('no cover', 'bad', 'No one is declared answerable for this duty line');
};

/* ------------------------------------------------------------------ dialogs */

function designateDialog(ctx, row) {
  const candidates = ctx.api.dutyCoverageCandidates?.(row.reading.dutyId);
  if (!candidates?.ok) { toast(candidates?.error || 'That duty line is not open to you.', 'bad'); return; }
  const eligible = candidates.candidates.filter((c) => c.eligible);
  const refused = candidates.candidates.filter((c) => !c.eligible);
  const form = buildForm([
    {
      name: 'coverId', label: 'Who is answerable when the seat is absent?', type: 'select', value: eligible[0]?.personId || '',
      help: eligible.length
        ? 'Only people whose altitude can answer this duty at this seat are offered.'
        : 'No one in this branch can answer at this altitude. Declare cover from the level above or record a stand-in on the roster first.',
      options: eligible.map((c) => ({ value: c.personId, label: `${c.name} · ${c.label} (rank ${c.rank})${c.isSelf ? ' — the seat itself' : ''}` })),
    },
    { name: 'note', label: 'What would they be answerable for?', type: 'textarea', value: '', rows: 3, help: 'One line. This is the words the next reader sees, not a summary.' },
    { name: 'failureMode', label: 'If the cover fails, what stops? (optional)', type: 'textarea', value: '', rows: 2, help: 'Left blank, the register states the default: the duty’s open work stalls until the holder returns.' },
  ]);
  openModal({
    title: `Declare cover — “${row.reading.label}”`,
    description: `Held by ${row.seat.name} (${row.seat.label}). ${row.reading.openN} open item(s) sit in this duty line today.`,
    body: h('div', { class: 'stack' },
      form.node,
      refused.length
        ? h('div', { class: 'stack-xs' },
          h('p', { class: 'muted small' }, 'Refused by the engine, with the reason printed:'),
          h('ul', { class: 'plain-list' }, ...refused.slice(0, 6).map((c) => h('li', { class: 'muted small' }, `${c.name} · ${c.label} — ${c.reason}`))))
        : null),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button', disabled: !eligible.length ? true : null,
        onClick: () => {
          const values = form.getValues();
          const result = ctx.api.dutyCoverageDesignate({ dutyId: row.reading.dutyId, coverId: values.coverId, note: values.note, failureMode: values.failureMode });
          if (!notify(result, 'Cover declared — and the consequence is now a governed decision.')) return;
          closeAllModals();
          ctx.refresh();
        },
      }, 'Declare the cover'),
    ],
  });
}

function revokeDialog(ctx, cover) {
  const form = buildForm([
    { name: 'reason', label: 'Why does this cover no longer hold?', type: 'textarea', value: '', rows: 3, help: 'Append-only: the row is marked revoked with this reason and never deleted.' },
  ]);
  openModal({
    title: 'Revoke a declared cover',
    description: `${cover.name || 'This cover'} is currently declared answerable. Revoking leaves the duty line without a cover until one is declared again — and the gap will print again.`,
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const result = ctx.api.dutyCoverageRevoke({ id: cover.id, reason: form.getValues().reason });
          if (!notify(result, 'Cover revoked.')) return;
          closeAllModals();
          ctx.refresh();
        },
      }, 'Revoke the cover'),
    ],
  });
}

function absenceRevokeDialog(ctx, plan) {
  const form = buildForm([
    { name: 'reason', label: 'Why does this absence no longer hold?', type: 'textarea', value: '', rows: 3, help: 'Append-only: the row is marked revoked with this reason and never deleted.' },
  ]);
  openModal({
    title: 'Revoke a declared absence',
    description: `${plan.from} → ${plan.to} is currently declared. Revoking returns the seat to the standing register — and any cover that was reading as unavailable on those dates becomes available again.`,
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const result = ctx.api.dutyAbsenceRevoke({ id: plan.id, reason: form.getValues().reason });
          if (!notify(result, 'Absence revoked.')) return;
          closeAllModals();
          ctx.refresh();
        },
      }, 'Revoke the absence'),
    ],
  });
}

/* --------------------------------------- ADR-0128: explicit rehearsal records */

function rehearsalDialog(ctx, cover) {
  const form = buildForm([
    { name: 'rehearsedOn', label: 'When was the rehearsal run? (ISO date)', type: 'date', value: '', help: `The day the practice happened — not after today, and at most 60 days behind the recording. A rehearsal is an attestation about a dated day.` },
    {
      name: 'mode', label: 'What kind of practice was run?', type: 'select', value: 'supervised',
      help: 'A declared vocabulary, not free text: the strength of the evidence depends on what kind of practice happened.',
      options: DUTY_REHEARSAL_MODES.map((m) => ({ value: m, label: DUTY_REHEARSAL_MODE_LABELS[m] })),
    },
    {
      name: 'outcome', label: 'What did the rehearsal show?', type: 'select', value: 'ready',
      help: '“Ready” certifies the cover for this duty inside the preparation window. “Gaps” does NOT certify — it opens a governed decision naming what must change before the window.',
      options: [
        { value: 'ready', label: 'Ready — the cover can answer this duty' },
        { value: 'gaps', label: 'Gaps found — name what must change first' },
      ],
    },
    { name: 'note', label: 'What was practised, and what did it show? (required when gaps were found)', type: 'textarea', value: '', rows: 3, help: 'Your own words, kept verbatim. A gaps attestation without words opens a decision with nothing in it.' },
  ]);
  openModal({
    title: `Record a rehearsal — “${cover.dutyLabel || 'this duty line'}”`,
    description: `Cover: ${cover.name || cover.label || 'the declared cover'}. You are attesting that this declared cover practised this duty on a dated day, and saying what it showed. This is a dated human act: it lands on the record with your seat as the observer, rolls up the holder's chain, and grades the dated plan's preparation window.`,
    body: h('div', { class: 'stack' },
      form.node,
      h('p', { class: 'muted small' }, DUTY_REHEARSAL_PREMISE)),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const v = form.getValues();
          const result = ctx.api.dutyRehearsalRecord({
            coverRowId: cover.id, rehearsedOn: v.rehearsedOn, mode: v.mode, outcome: v.outcome, note: v.note,
          });
          if (!notify(result, result?.decisionId
            ? 'Rehearsal recorded — the gaps it found are now a governed decision.'
            : 'Rehearsal recorded — the dated plan now grades this cover on an explicit attestation.')) return;
          closeAllModals();
          ctx.refresh();
        },
      }, 'Record the rehearsal'),
    ],
  });
}

function rehearsalRevokeDialog(ctx, row) {
  const form = buildForm([
    { name: 'reason', label: 'Why does this attestation no longer hold?', type: 'textarea', value: '', rows: 3, help: 'Append-only: the row is marked revoked with this reason and never deleted. A certification that quietly disappeared would masquerade as a rehearsal that never happened.' },
  ]);
  openModal({
    title: 'Revoke a rehearsal record',
    description: `${row.rehearsedOn} · ${row.modeLabel} · outcome ${row.outcome}. Revoking removes it from the window-exercise evidence on the next read; the dated plan re-grades without it.`,
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const result = ctx.api.dutyRehearsalRevoke({ id: row.id, reason: form.getValues().reason });
          if (!notify(result, 'Rehearsal record revoked.')) return;
          closeAllModals();
          ctx.refresh();
        },
      }, 'Revoke the record'),
    ],
  });
}

const attestationBadge = (attestation) => {
  if (attestation === 'holder') return badge('holder-attested', 'good', 'The duty holder recorded the practice — the strongest attestation');
  if (attestation === 'supervisor') return badge('supervisor-attested', 'good', 'A leader above the holder observed and recorded it');
  if (attestation === 'self') return badge('self-reported', 'warn', 'The cover recorded their own rehearsal — an accountable dated claim, printed as self-reported, never as an attestation');
  return badge('outside the line', 'bad', 'A seat with no position at this duty recorded it — the schema drops such rows on reload');
};

function rehearsalsCard(ctx) {
  const result = ctx.api.dutyRehearsalList?.();
  if (!result || result.ok === false) return null;
  const { rows, namesVisible, summary } = result;
  // ADR-0131: `?rehearsal=` focuses one attestation. The ledger prints the 40
  // most recent rows; if the linked record is older, it is brought into view
  // rather than silently missed — the link must land on the exact row.
  const rehearsalFocus = recordFocus(ctx.query, 'rehearsal', rows, (row) => row.id);
  const absentNote = focusAbsentNote(rehearsalFocus, 'rehearsal record');
  const shown = rows.slice(0, 40);
  const focusedOutsideSlice = rehearsalFocus.matched && !shown.some((r) => r.id === rehearsalFocus.id)
    ? rows.find((r) => r.id === rehearsalFocus.id) : null;
  if (focusedOutsideSlice) shown.unshift(focusedOutsideSlice);
  return card({
    title: `Explicit rehearsal records — ${summary.activeN} active`,
    subtitle: 'Practice somebody recorded, not practice inferred. A ready rehearsal inside the preparation window grades ABOVE dated-work evidence; a rehearsal that found GAPS keeps the line thin and opens a governed decision instead.',
    actions: [
      h('button', {
        class: 'btn btn-small', type: 'button',
        onClick: () => { const r = ctx.api.dutyRehearsalScan(); if (notify(r, 'Scan complete — nothing was certified.')) ctx.refresh(); },
      }, 'Scan'),
    ],
    body: h('div', { class: 'stack' },
      absentNote ? banner({ tone: 'warn', title: 'The linked record is not here', body: absentNote }) : null,
      focusedOutsideSlice ? h('p', { class: 'muted small' }, 'The linked rehearsal is older than the 40 most recent records; it is printed first so the link lands on the exact row.') : null,
      h('div', { class: 'stat-grid' },
        stat({ label: 'Ready', value: String(summary.readyN), tone: summary.readyN ? 'good' : '', hint: `${summary.attestedN} holder/supervisor-attested · ${summary.selfReportedN} self-reported` }),
        stat({ label: 'Gaps found', value: String(summary.gapsN), tone: summary.gapsN ? 'bad' : 'good', hint: 'each opened a governed decision naming what must change before the window' }),
        stat({ label: 'Revoked', value: String(summary.rowsN - summary.activeN), hint: 'append-only: marked revoked with a reason, never deleted' })),
      shown.length
        ? table({
          caption: 'Dated rehearsal attestations visible to this seat',
          columns: [
            { label: 'Rehearsed', render: (r) => r.rehearsedOn },
            { label: 'Duty', render: (r) => r.dutyLabel },
            { label: 'Holder', render: (r) => (namesVisible ? (r.holderName || r.holderLabel) : r.holderLabel) },
            { label: 'Cover', render: (r) => (namesVisible ? (r.coverName || r.coverLabel) : r.coverLabel) },
            { label: 'Practice', render: (r) => h('span', { class: 'muted small' }, r.modeLabel) },
            { label: 'Outcome', render: (r) => (r.outcome === 'ready' ? badge('ready', 'good') : badge('gaps found', 'bad', 'The governed decision opened at the recording names what must change')) },
            { label: 'Recorded by', render: (r) => h('span', null, attestationBadge(r.attestation), h('span', { class: 'muted small' }, ` ${r.recordedByLabel}, ${r.recordedOn}`)) },
            { label: 'Act', render: (r) => (r.status === 'active' && r.canRevoke
              ? h('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => rehearsalRevokeDialog(ctx, r) }, 'Revoke')
              : h('span', { class: 'muted small' }, r.status === 'revoked' ? `revoked ${r.revokedOn || ''}` : '—')) },
          ],
          rows: shown.map((row) => ({ ...row, ...focusRowProps(rehearsalFocus, row.id, 'data-rehearsal-id') })),
          emptyMessage: 'No rehearsal recorded yet.',
        })
        : emptyState({
          title: 'No rehearsal has been recorded in this span',
          body: 'The dated plan currently grades cover exercise from INFERRED evidence: dated work of the duty’s sources touching the holder’s span with the cover on the record. Recording a rehearsal — from a duty line’s cover list — replaces inference with a dated attestation for that cover. No rehearsal is not a failure; an unrecorded rehearsal is.',
        }),
      shown.length && rows.length > shown.length
        ? h('p', { class: 'muted small' }, `${rows.length - shown.length} further record(s) are in the ledger; the card prints the 40 most recent rehearsals.`)
        : null,
      namesVisible
        ? h('ul', { class: 'plain-list' }, ...shown.filter((r) => r.note).slice(0, 6).map((r) => h('li', { class: 'muted small' }, `${r.rehearsedOn} · ${r.dutyLabel} · ${r.outcome === 'ready' ? 'ready' : 'GAPS'} — “${r.note}”`)))
        : h('p', { class: 'muted small' }, 'Above the manager altitude the notes and names are withheld at construction; dates, modes, outcomes, attestation strength and counts survive.')),
  });
}

/* ------------------------------------------------- ADR-0122: the plan panel */

const windowBandBadge = (band) => {
  if (band === 'covered') return badge('covered in window', 'good', 'An available, eligible cover has duty-specific evidence recorded before the absence starts');
  if (band === 'thin') return badge('thin in window', 'warn', 'Available and eligible, but no duty-specific evidence inside the preparation window');
  if (band === 'cover-absent') return badge('cover absent', 'bad', 'Every declared cover is themselves absent during the window');
  if (band === 'ineligible') return badge('ineligible', 'bad', 'A declared cover cannot answer at this altitude');
  return badge('no cover', 'bad', 'Nobody is declared answerable for this duty line');
};

const windowExerciseBadge = (exercise) => {
  if (!exercise) return badge('not graded', 'warn', 'No window-specific exercise reading is available');
  const day = exercise.evidence?.day || exercise.lastEvidence?.day || null;
  // ADR-0128: an explicit rehearsal record outranks inferred dated work — and a
  // rehearsal that FOUND GAPS is its own printed state, never a green badge.
  if (exercise.status === 'rehearsed') return badge(`rehearsed ${day}`, 'good', exercise.reason);
  if (exercise.status === 'gaps') return badge(`rehearsal found gaps ${day}`, 'bad', exercise.reason);
  if (exercise.status === 'valid') return badge(`evidence ${day}`, 'good', exercise.reason);
  if (exercise.status === 'stale') return badge(`stale ${day}`, 'warn', exercise.reason);
  if (exercise.status === 'future') return badge(`future ${day}`, 'warn', exercise.reason);
  if (exercise.status === 'late') return badge(`after cutoff ${day}`, 'warn', exercise.reason);
  return badge('no duty evidence', 'warn', exercise.reason);
};

function windowPlanCard(ctx, plan, namesShown) {
  const s = plan.summary;
  const windowText = `${plan.window.from} → ${plan.window.to}`;
  return h('div', { class: 'stack' },
    card({
      title: `Window plan — ${windowText}`,
      subtitle: `${s.dutiesN} duty line(s) this seat holds, graded against the exact dates the seat will not be there. Preparation evidence must be duty-specific and recorded by today inside ${plan.exerciseWindow.from} → ${plan.exerciseWindow.to}.`,
      body: h('div', { class: 'stat-grid' },
        stat({ label: 'Duty lines', value: String(s.dutiesN), hint: `${s.coveredN} covered · ${s.thinN} thin · ${s.coverAbsentN} cover-absent · ${s.gapN} no cover in window` }),
        stat({ label: 'Exposed lines', value: String(s.exposedN), tone: s.exposedN ? 'bad' : 'good', hint: 'duty lines with no available, eligible cover on these dates' }),
        stat({ label: 'Open work exposed', value: String(s.exposedOpenN), tone: s.exposedOpenN ? 'bad' : 'good', hint: 'open items sitting in lines with no available cover during the window' }),
        stat({ label: 'Cover conflicts', value: String(s.conflictsN), tone: s.conflictsN ? 'bad' : '', hint: 'declared covers who are themselves absent during the window' }),
        stat({ label: 'Pre-window evidence', value: String((s.exercise?.rehearsedCoversN ?? 0) + (s.exercise?.validCoversN ?? 0)), tone: s.exercise?.thinLinesN ? 'bad' : 'good', hint: `${s.exercise?.rehearsedCoversN ?? 0} rehearsed by explicit record (${s.exercise?.attestedRehearsalsN ?? 0} attested, ${s.exercise?.selfReportedRehearsalsN ?? 0} self-reported) · ${s.exercise?.validCoversN ?? 0} valid on inferred work · ${s.exercise?.gapsCoversN ?? 0} gaps found · ${s.exercise?.thinLinesN ?? 0} thin line(s) · ${s.exercise?.staleCoversN ?? 0} stale · ${s.exercise?.missingCoversN ?? 0} missing · ${s.exercise?.futureCoversN ?? 0} future · ${s.exercise?.lateCoversN ?? 0} after cutoff` })),
    }),
    ...plan.rows.map((row) => card({
      title: `${row.label} — ${windowBandBadge(row.windowBand)}`,
      subtitle: row.question,
      actions: [bandBadge(row.band)],
      body: h('div', { class: 'stack' },
        h('p', { class: 'muted small' }, row.windowReason),
        h('div', { class: 'stat-grid' },
          stat({ label: 'Open work', value: String(row.openN), hint: row.oldestOn ? `oldest open since ${row.oldestOn}` : 'nothing open in this duty line' }),
          stat({ label: 'Available covers', value: String(row.availableCoversN), hint: `${row.exercisedAvailableN} with valid pre-window duty evidence` }),
          stat({ label: 'Conflicts', value: String(row.conflicts.length), tone: row.conflicts.length ? 'bad' : '', hint: 'covers who are themselves absent on these dates' })),
        row.covers.length
          ? table({
            caption: `Declared covers for ${row.label}, graded on ${windowText}`,
            columns: [
              { label: 'Cover', render: (c) => h('span', null, namesShown ? (c.name || '—') : 'Name withheld above the manager altitude') },
              { label: 'Rank', render: (c) => num(c.rank) },
              { label: 'Available', render: (c) => (c.available ? badge('present', 'good') : badge(`absent ${c.absence.from} → ${c.absence.to}`, 'bad')) },
              { label: 'Eligible', render: (c) => (c.eligible ? badge('eligible', 'good') : badge('ineligible', 'bad')) },
              { label: 'Exercise', render: (c) => windowExerciseBadge(c.windowExercise) },
              { label: 'Act', render: (c) => h('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => rehearsalDialog(ctx, { id: c.id, name: c.name, label: c.label, dutyLabel: row.label }) }, 'Rehearse') },
            ],
            rows: row.covers,
            emptyMessage: 'No cover declared.',
          })
          : h('p', { class: 'muted small' }, 'No cover is declared for this duty line — it reads exposed on every date of the window.'),
        row.covers.length
          ? h('ul', { class: 'plain-list' }, ...row.covers.map((c) => {
            const ex = c.windowExercise;
            const evidence = ex?.evidence || ex?.lastEvidence;
            const source = evidence && namesShown && evidence.sourceId
              ? ` Record ${evidence.sourceId}${evidence.route ? ` (${evidence.route})` : ''}.`
              : '';
            return h('li', { class: 'muted small' }, `${namesShown ? (c.name || 'cover') : 'cover'} — ${ex?.reason || 'No window-specific exercise reading.'}${source}`);
          }))
          : null,
        row.cascade.length
          ? h('div', { class: 'stack-xs' },
            h('p', { class: 'field-label' }, 'The cascade: is an absent cover’s own absence covered?'),
            h('ul', { class: 'plain-list' }, ...row.cascade.map((c) => h('li', { class: 'muted small' }, `${namesShown ? (c.name || 'the cover') : 'the cover'} is out ${c.from} → ${c.to} — their own absence reads ${c.selfCoverage === 'covered' ? 'covered' : (c.selfCoverage === 'exposed' ? 'EXPOSED as well: their own duty lines have no available cover on those dates' : 'without duties to grade')}.`))))
          : null,
      ),
    })),
    h('p', { class: 'muted small' }, 'Availability is derived from the declared windows, never stored: change either window and this plan re-grades on the next read. A plan is a read — declaring the window is the only write.'),
  );
}

function planningFormCard(ctx, namesShown) {
  const form = buildForm([
    { name: 'from', label: 'Absence starts (ISO date)', type: 'date', value: '', help: 'The first day the seat will not be there.' },
    { name: 'to', label: 'Absence ends (ISO date, inclusive)', type: 'date', value: '', help: 'The last day. The window is capped at 90 days.' },
    { name: 'reason', label: 'Why will the seat not be there?', type: 'textarea', value: '', rows: 3, help: 'One line. This is the words the next reader sees, not a summary.' },
    { name: 'note', label: 'Note (optional)', type: 'textarea', value: '', rows: 2 },
  ]);
  const previewCard = () => planPreview
    ? card({
      title: 'Preview — not yet declared',
      subtitle: `${planPreview.window.from} → ${planPreview.window.to} · this is a read of the current declarations, nothing is written.`,
      body: windowPlanCard(ctx, planPreview.result, namesShown),
      actions: [
        h('button', {
          class: 'btn btn-primary', type: 'button',
          onClick: () => {
            const values = planPreview.values;
            const result = ctx.api.dutyAbsenceDeclare({ from: values.from, to: values.to, reason: values.reason, note: values.note });
            if (!notify(result, 'Absence declared — the exposure is now a governed decision.')) return;
            planPreview = null;
            ctx.refresh();
          },
        }, 'Declare this absence'),
      ],
    })
    : null;
  return card({
    title: 'Plan an absence',
    subtitle: DUTY_ABSENCE_PREMISE,
    body: h('div', { class: 'stack' },
      form.node,
      h('div', { class: 'row-actions' },
        h('button', {
          class: 'btn btn-small', type: 'button',
          onClick: () => {
            const values = form.getValues();
            const result = ctx.api.dutyAbsencePlan({ window: { from: values.from, to: values.to } });
            if (!result?.ok) { toast(result?.error || 'That window could not be graded.', 'bad'); return; }
            if (!result.window) { toast('Choose two dates inside the declared span.', 'warn'); return; }
            // Capture the values NOW: the preview re-renders the view, and a
            // rebuilt form would start empty. The declare button grades the
            // same window the preview showed.
            planPreview = { window: result.window, result: result.plan, values };
            ctx.refresh();
          },
        }, 'Preview this window'),
        h('button', {
          class: 'btn btn-ghost btn-small', type: 'button',
          onClick: () => { planPreview = null; ctx.refresh(); },
        }, 'Clear preview')),
      previewCard()),
  });
}

function rollupCard(ctx, rollup, namesShown) {
  // ADR-0131: the same `?plan=` focus reaches the rolled-up rows.
  const planFocus = recordFocus(ctx.query, 'plan', rollup?.rows || [], (row) => row.id);
  if (!rollup?.rows?.length) {
    return card({
      title: 'Absences in this span',
      body: emptyState({
        title: 'No dated absence is declared below this seat',
        body: 'Every duty line in the span reads its standing cover. When a seat declares an absence window, this card grades that window against the span’s declared covers — counts only, never a name above the manager altitude.',
      }),
    });
  }
  return card({
    title: `Absences in this span — ${rollup.rows.length}`,
    subtitle: 'Each absence is graded against its own window. Counts only: no person, no seat id, no reason above the manager altitude.',
    body: h('div', { class: 'stack' },
      table({
        caption: 'Dated absence plans, rolled up',
        columns: [
          { label: 'Seat', render: (r) => h('span', null, namesShown ? `${r.label}` : `${r.label} (rank ${r.rank})`) },
          { label: 'Window', render: (r) => `${r.from} → ${r.to}` },
          { label: 'Duties', render: (r) => String(r.summary.dutiesN) },
          { label: 'Covered', render: (r) => String(r.summary.coveredN) },
          { label: 'Thin', render: (r) => String(r.summary.thinN) },
          { label: 'Cover absent', render: (r) => String(r.summary.coverAbsentN) },
          { label: 'No cover', render: (r) => String(r.summary.gapN) },
          { label: 'Open, exposed', render: (r) => String(r.summary.exposedOpenN) },
            { label: 'Pre-window evidence', render: (r) => `${r.summary.exercise?.rehearsedCoversN ?? 0} rehearsed / ${r.summary.exercise?.validCoversN ?? 0} valid / ${r.summary.exercise?.gapsCoversN ?? 0} gaps / ${r.summary.exercise?.thinLinesN ?? 0} thin` },
          ],
          rows: rollup.rows.map((row) => ({ ...row, ...focusRowProps(planFocus, row.id, 'data-plan-id') })),
          emptyMessage: 'No absences.',
        }),
      rollup.exposedOpenN
        ? banner({ tone: 'bad', title: `${rollup.exposedOpenN} duty line(s) below this seat carry open work with no available cover on the absence dates`, body: 'This is not a scoring failure; it is an unrecorded stand-in on specific dates. Declaring cover is a dated human act, and the exposure prints until one is declared or the window passes.' })
        : null),
  });
}

/* ------------------------------------ ADR-0123: concurrent absence exposure */

const concurrencyBandBadge = (band) => {
  if (band === 'covered') return badge('distinct covers', 'good', 'Every duty line has an available cover that is not shared with another absent seat');
  if (band === 'concentrated') return badge('one cover, several absences', 'warn', 'A declared cover is the only answerable person for two or more absent seats');
  if (band === 'exposed') return badge('no cover on shared dates', 'bad', 'A duty line has no available cover while the seats are out together');
  return badge('open work uncovered', 'bad', 'A duty line with open work has no available cover on the shared dates');
};

/* ADR-0124: the cover's own open work plus the work inherited from the absent
 * seats, graded against the peak open-work load actually observed in the span. */
const coverLoadBandBadge = (band) => {
  if (band === 'over-envelope') return badge('past observed load', 'bad', 'More open work than any seat in this span is carrying today');
  if (band === 'at-envelope') return badge('no recorded headroom', 'warn', 'Exactly matches the observed envelope');
  if (band === 'within-envelope') return badge('inside observed load', 'good', 'Inside the peak open-work load observed in this span');
  return badge('capacity refused', 'warn', 'The reading refuses rather than treating zero as spare capacity');
};

function concurrencyCard(concurrency) {
  if (!concurrency) return null;
  const s = concurrency.summary;
  if (!s.participantsN) {
    return card({
      title: 'Concurrent absence exposure',
      body: emptyState({
        title: 'No dated absence is declared in this span yet',
        body: concurrency.refused || 'Concurrency is graded from declared absence windows. With none on the record there is nothing to sweep — which is not a claim that absences will not collide.',
      }),
    });
  }
  if (concurrency.refused) {
    return card({
      title: 'Concurrent absence exposure — refused',
      subtitle: 'The sweep prints its refusal rather than a reassuring zero.',
      body: h('div', { class: 'stack' },
        banner({ tone: 'warn', title: 'Concurrency could not be graded', body: concurrency.refused }),
        table({
          caption: 'Declared absence windows in this span',
          columns: [
            { label: 'Seat', render: (p) => `${p.label} (rank ${p.rank})` },
            { label: 'Window', render: (p) => `${p.from} → ${p.to}` },
            { label: 'Days', render: (p) => String(p.days) },
            { label: 'Includes this seat', render: (p) => (p.self ? 'yes' : 'no') },
          ],
          rows: concurrency.participants,
          emptyMessage: 'No absences.',
        })),
    });
  }
  return card({
    title: `Concurrent absence exposure — ${s.windowsN} overlapping window(s)`,
    subtitle: concurrency.premise,
    body: h('div', { class: 'stack' },
      h('div', { class: 'stat-grid' },
        stat({ label: 'Windows', value: String(s.windowsN), hint: `${s.participantsN} declared absence(s) swept` }),
        stat({ label: 'Most seats out at once', value: String(s.maxConcurrent), tone: s.maxConcurrent > 2 ? 'bad' : '', hint: `${s.seatsInOverlapN} distinct seat(s) appear in an overlap` }),
        stat({ label: 'Open work, no cover', value: String(s.exposedOpenN), tone: s.exposedOpenN ? 'bad' : 'good', hint: `${s.exposedN} exposed duty line(s) across the windows` }),
        stat({ label: 'Single-cover points', value: String(s.singleCoverN), tone: s.singleCoverN ? 'bad' : 'good', hint: 'one person is the only answerable cover for 2+ absent seats' }),
        stat({ label: 'Covers past observed load', value: String(s.coverLoadOverN), tone: s.coverLoadOverN ? 'bad' : 'good', hint: `envelope ${concurrency.coverLoad?.envelopeN ?? 0} open item(s); largest graded union ${s.coverLoadMaxN}` }),
        stat({ label: 'Thin on pre-window evidence', value: String(s.exerciseThinLinesN ?? 0), tone: s.exerciseThinLinesN ? 'bad' : 'good', hint: `${s.exerciseValidCoversN ?? 0} available cover(s) have duty-specific evidence recorded by the preparation cutoff` })),
      table({
        caption: 'Overlapping absence windows',
        columns: [
          { label: 'Shared dates', render: (w) => `${w.from} → ${w.to}` },
          { label: 'Days', render: (w) => String(w.days) },
          { label: 'Seats out', render: (w) => w.seats.map((x) => x.ref).join(', ') },
          { label: 'Reading', render: (w) => concurrencyBandBadge(w.band) },
          { label: 'Exposed lines', render: (w) => String(w.exposedN) },
          { label: 'Open, exposed', render: (w) => String(w.exposedOpenN) },
          { label: 'Single cover', render: (w) => String(w.singleCovers.length) },
          { label: 'Pre-window evidence', render: (w) => `${w.exercise?.validCoversN ?? 0} valid / ${w.exercise?.thinLinesN ?? 0} thin` },
        ],
        rows: concurrency.windows,
        emptyMessage: 'No overlap.',
      }),
      table({
        caption: 'Cover capacity on the shared dates (ADR-0124)',
        columns: [
          { label: 'Shared dates', render: (r) => r.window },
          { label: 'Available cover', render: (r) => (concurrency.namesVisible ? (r.name || r.label) : `${r.label} (rank ${r.rank})`) },
          { label: 'Own open', render: (r) => String(r.ownN) },
          { label: 'Inherited', render: (r) => String(r.inheritedN) },
          { label: 'In both spans', render: (r) => String(r.overlapN) },
          { label: 'Distinct union', render: (r) => String(r.combinedN) },
          { label: 'Observed envelope', render: (r) => String(r.envelopeN) },
          { label: 'Ratio', render: (r) => (r.ratio === null ? 'refused' : `${r.ratio}×`) },
          { label: 'Reading', render: (r) => coverLoadBandBadge(r.band) },
          { label: 'Absent seats', render: (r) => r.refs.join(', ') || 'none' },
        ],
        rows: concurrency.windows.flatMap((w) => w.coverLoads.map((c) => ({ ...c, window: `${w.from} → ${w.to}` }))),
        emptyMessage: 'No available, eligible cover was declared for a duty line in a shared window.',
      }),
      concurrency.coverLoad?.refusal
        ? banner({ tone: 'warn', title: 'Cover capacity could not be graded', body: concurrency.coverLoad.refusal })
        : null,
      s.coverLoadDeferredN
        ? banner({ tone: 'warn', title: `${s.coverLoadDeferredN} further available cover(s) were not graded`, body: `The capacity sweep is capped at ${concurrency.coverLoad?.coverCap ?? 24} covers per window so a large ledger cannot be compressed into one comfortable number. The remainder is counted, not hidden.` })
        : null,
      ...concurrency.windows.map((w) => h('div', { class: 'stack-xs' },
        h('p', { class: 'field-label' }, `${w.from} → ${w.to} — ${w.seats.map((x) => x.ref).join(', ')}`),
        h('p', { class: 'muted small' }, w.reason),
        w.singleCovers.length
          ? h('ul', { class: 'plain-list' }, ...w.singleCovers.map((c) => h('li', { class: 'muted small' },
            `${concurrency.namesVisible ? (c.name || c.label) : c.label} (rank ${c.rank}) would be the only answerable cover for ${c.dutiesN} duty line(s) across ${c.seatsN} absent seats — ${c.refs.join(', ')}. Declaring a second cover for one of those lines removes the single point of failure; the register will not assign one. ${c.capacity ? `Capacity: ${c.capacity.band.replace(/-/g, ' ')}, ${c.capacity.combinedN} distinct open item(s) against an envelope of ${c.capacity.envelopeN}. ${c.capacity.reason}` : 'Capacity: refused — no reading is stored.'}`)))
          : null,
        w.coverLoads.length
          ? h('ul', { class: 'plain-list' }, ...w.coverLoads.map((c) => h('li', { class: 'muted small' }, c.reason)))
          : null,
        w.conflicts.length
          ? h('ul', { class: 'plain-list' }, ...w.conflicts.map((c) => h('li', { class: 'muted small' },
            `${concurrency.namesVisible ? (c.name || c.label) : c.label} is themselves absent ${c.from} → ${c.to} — a declared cover who cannot answer on the shared dates.`)))
          : null)),
      s.deferredWindowsN
        ? banner({ tone: 'warn', title: `${s.deferredWindowsN} further overlapping window(s) were not graded`, body: 'The concurrency sweep is capped so a large ledger cannot be summarised into one comfortable number. Grading the remainder needs a narrower span or fewer simultaneous absences.' })
        : null,
      h('p', { class: 'muted small' }, 'Derived on every read from the declared absence windows, the declared covers and the open work the shared harvester already holds: nothing here is stored, scheduled or auto-assigned. Cover capacity counts each open item once (work inside the cover’s own span is not added twice) and grades the union against the highest open-work load any seat in this span is carrying today — a revealed envelope, not a productivity constant. Adjacency is not overlap, and above the manager altitude a cover is named by rank and seat only.')),
  });
}

function planPanel(ctx, report) {
  const result = ctx.api.dutyAbsencePlan?.();
  if (!result || result.ok === false) {
    return card({ title: 'Absence plan unavailable', body: emptyState({ title: 'The absence plan could not be built', body: result?.error || 'No plan is available.' }) });
  }
  const { window, plan, own, rollup } = result;
  const namesShown = report.namesVisible;
  // ADR-0131: `?plan=` addresses ONE absence record — the seat's own card or
  // one rolled-up row. Both sets are already seat-scoped by the engine, so a
  // plan outside the span prints the honest absent note instead of widening.
  const planRows = [...(own ? [own] : []), ...(rollup?.rows || [])];
  const planFocus = recordFocus(ctx.query, 'plan', planRows, (row) => row.id);
  const absentNote = focusAbsentNote(planFocus, 'absence plan');
  return h('div', { class: 'stack' },
    absentNote ? banner({ tone: 'warn', title: 'The linked record is not here', body: absentNote }) : null,
    own
      ? card({
        title: `Declared absence — ${own.from} → ${own.to}`,
        subtitle: own.reason,
        className: focusCardClass(planFocus, own.id),
        id: `absence-plan-${own.id}`,
        actions: [
          h('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => absenceRevokeDialog(ctx, own) }, 'Revoke'),
        ],
        body: h('div', { class: 'stack' },
          h('p', { class: 'muted small' }, `Declared ${own.declaredOn}. The plan below grades every duty line this seat holds against these exact dates; the exposure it names is the governed decision opened with the declaration.`),
          own.summary
            ? h('div', { class: 'stat-grid' },
              stat({ label: 'Duty lines', value: String(own.summary.dutiesN), hint: `${own.summary.coveredN} covered · ${own.summary.thinN} thin · ${own.summary.coverAbsentN} cover-absent · ${own.summary.gapN} no cover` }),
              stat({ label: 'Exposed lines', value: String(own.summary.exposedN), tone: own.summary.exposedN ? 'bad' : 'good', hint: 'no available, eligible cover on these dates' }),
              stat({ label: 'Open work exposed', value: String(own.summary.exposedOpenN), tone: own.summary.exposedOpenN ? 'bad' : 'good' }),
              stat({ label: 'Cover conflicts', value: String(own.summary.conflictsN), tone: own.summary.conflictsN ? 'bad' : '' }))
            : h('p', { class: 'muted small' }, 'This seat holds no declared duty line, so no duty is graded against the window.'),
          plan ? windowPlanCard(ctx, plan, namesShown) : null),
      })
      : planningFormCard(ctx, namesShown),
    rehearsalsCard(ctx),
    concurrencyCard(report.absences?.concurrency),
    rollupCard(ctx, rollup, namesShown),
    card({
      title: 'What is declared, and what is derived',
      body: h('ul', { class: 'plain-list' },
        h('li', null, h('strong', null, 'Declared:'), ' the absence window itself — two ISO dates, the reason the seat holder wrote, and the governed decision naming what stops. A human declares an absence; nothing schedules one.'),
        h('li', null, h('strong', null, 'Derived on every read:'), ' whether each declared cover is AVAILABLE on the window’s dates (a cover with their own absence overlapping the window is not), the window band per duty line, the cascade — whether an absent cover’s own absence is covered — and whether the cover has duty-specific evidence recorded by today inside the preparation window ending the day before the absence starts.'),
        h('li', null, h('strong', null, 'Concurrency (ADR-0123):'), ' overlapping absence windows are swept from the same declared dates. The sweep prints the shared dates, the duty lines with no available cover on them, and the cover who would be the only answerable person for two or more absent seats — the single point of failure a per-absence reading cannot show. Adjacency is not overlap, and above the manager altitude the cover is named by rank and seat only.'),
        h('li', null, h('strong', null, 'Cover capacity (ADR-0124):'), ' on the shared dates, the cover’s own open work and the open work they alone would inherit are counted as one set union (items already inside the cover’s own span are not added twice) and graded against the peak open-work load actually observed in this span. With no open work on the record there is no envelope and the reading refuses; a duty line with several available covers is printed as shared rather than split by guess.'),
        h('li', null, h('strong', null, 'Pre-window exercise (ADR-0125):'), ' a cover counts as exercised for THIS absence only when a record of THIS duty’s declared sources touches the holder’s span, is dated inside the preparation window (the declared exercise days ending the day before the absence starts), and is already recorded by today. Closed work counts; future-dated work, work after the cutoff, and unrelated duty sources do not. The standing register remains a separate, today-anchored reading.'),
        h('li', null, h('strong', null, 'Explicit rehearsals (ADR-0128):'), ' dated-work evidence is INFERRED — a cover named on one case grades the same as a cover the holder walked through the duty. A rehearsal record is the human act itself: a seat that was there (the holder, a leader above, or the cover) attests that a declared cover practised THIS duty on a dated day, in a declared mode. A ready rehearsal inside the preparation window grades ABOVE inferred work (', h('em', null, 'rehearsed'), '); a rehearsal that FOUND GAPS grades as its own state, keeps the line thin, and opens a governed decision quoting the recorder verbatim. The attestation strength — holder, supervisor, self-reported — is derived from the roster on every read and printed; a third-party attestation is dropped on reload. Nothing about the verdict is stored.'),
        h('li', null, h('strong', null, 'Refused:'), ' a stored availability flag, an engine-assigned absence, an auto-assigned second cover and a “covered during the window” tick. Availability is a function of two declared windows; a stored copy would drift the moment either window changed.'),
        h('li', null, h('strong', null, 'Schema v115 is additive.'), ' An upgraded workspace opens with an empty absence ledger — “no absence has been declared here yet”, which is not the same claim as “every absence is covered”.')),
    }),
  );
}

/* ------------------------------------------------- ADR-0129: branch readings */

const bandTone = (band) => (band === 'holding' ? 'good' : band === 'exposed' ? 'bad' : band === 'thin' ? 'warn' : 'neutral');

function requestReadingDialog(ctx, reading, pos) {
  const form = buildForm([
    {
      name: 'note', label: 'Why do you need this branch’s own reading?', type: 'textarea', value: '', rows: 3,
      help: 'Sent to the branch’s own leader with the request. Name what you are deciding and why the withheld cell is not enough — they are being asked to disclose something about their own people.',
    },
  ]);
  openModal({
    title: 'Request a branch reading',
    description: `The cell for ${reading.label} is withheld at the declared disclosure floor, so this table prints no figure for it. Its own leader can publish the BAND their register grades into — holding, thin, exposed or cannot say — with their own words, on a dated day. You receive the band and the words; no count crosses. The reading lapses after the declared validity window and can be asked for again.`,
    body: h('div', { class: 'stack' }, form.node, h('p', { class: 'muted small' }, BRANCH_READING_PREMISE)),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const result = ctx.api.branchReadingRequest({ branchPos: pos, note: form.getValues().note });
          if (!notify(result, 'Reading requested. The cell now shows who owes an answer and by when.')) return;
          closeAllModals();
          ctx.refresh();
        },
      }, 'Send the request'),
    ],
  });
}

function withdrawReadingDialog(ctx, reading) {
  const form = buildForm([
    { name: 'reason', label: 'Why does the question no longer stand?', type: 'textarea', value: '', rows: 3, help: 'Append-only: the ask is marked withdrawn with this reason and never deleted.' },
  ]);
  openModal({
    title: 'Withdraw a branch reading request',
    description: `Asked on ${reading.askedOn}${reading.responseBy ? `, answer expected by ${reading.responseBy}` : ''}. Withdrawing returns the cell to “not asked” — it does not restore any figure.`,
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const result = ctx.api.branchReadingWithdraw({ id: reading.askId, reason: form.getValues().reason });
          if (!notify(result, 'Request withdrawn.')) return;
          closeAllModals();
          ctx.refresh();
        },
      }, 'Withdraw the request'),
    ],
  });
}

function publishReadingDialog(ctx, ask) {
  const preview = ask.preview;
  const form = buildForm([
    {
      name: 'note', label: 'Put the reading in your own words', type: 'textarea', value: '', rows: 4,
      help: 'Sent to the seat that asked, verbatim. The band below is computed from your own register and frozen with today’s date — it is not a field you can set.',
    },
  ]);
  openModal({
    title: 'Publish this branch’s reading',
    description: 'You are answering for your own branch. The counts stay in this seat’s register; the band and your words are the whole disclosure.',
    body: h('div', { class: 'stack' },
      preview
        ? h('div', { class: 'stack-xs' },
          h('p', null, `Your register grades today as ${badge(preview.bandLabel, bandTone(preview.band))}.`),
          h('p', { class: 'muted small' }, `${preview.why} (${preview.dutiesN} duty line(s): ${preview.holdingN} holding, ${preview.thinN} thin, ${preview.exposedN} exposed or no cover.)`),
          h('p', { class: 'muted small' }, 'Those counts are shown to YOU, here, so you know exactly what you are publishing. Only the band and your words travel.'))
        : h('p', { class: 'muted' }, 'No preview is available for this seat.'),
      form.node),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const result = ctx.api.branchReadingPublish({ id: ask.id, note: form.getValues().note });
          if (!notify(result, `Reading published (${result.band}).`)) return;
          closeAllModals();
          ctx.refresh();
        },
      }, 'Publish the reading'),
    ],
  });
}

function declineReadingDialog(ctx, ask) {
  const form = buildForm([
    { name: 'reason', label: 'Why are you declining?', type: 'textarea', value: '', rows: 4, help: 'Sent to the seat that asked, verbatim. Declining is an answer: it is recorded, printed and counted, and it opens no governed decision against you.' },
  ]);
  openModal({
    title: 'Decline a branch reading request',
    description: 'A refusal is recorded as a refusal, not as a blank cell — the requesting seat sees that the reading was declined and why, rather than assuming the branch is fine or that nobody asked.',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const result = ctx.api.branchReadingDecline({ id: ask.id, reason: form.getValues().reason });
          if (!notify(result, 'Declined, with your reason recorded.')) return;
          closeAllModals();
          ctx.refresh();
        },
      }, 'Decline the request'),
    ],
  });
}

function revokeReadingDialog(ctx, ask) {
  const form = buildForm([
    { name: 'reason', label: 'Why does this reading no longer stand?', type: 'textarea', value: '', rows: 3, help: 'Append-only. The cell falls back to asked or overdue rather than keeping a band you no longer stand behind.' },
  ]);
  openModal({
    title: 'Revoke a published reading',
    description: 'The requesting seat is reading this band as your branch’s condition. Revoking removes it from their table.',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const result = ctx.api.branchReadingRevoke({ readingId: ask.answer.id, reason: form.getValues().reason });
          if (!notify(result, 'Reading revoked.')) return;
          closeAllModals();
          ctx.refresh();
        },
      }, 'Revoke the reading'),
    ],
  });
}

/** The desk's reading cell: what the withheld cell is currently holding, and the one act open on it. */
function readingCell(ctx, reading, pos) {
  if (!reading) return h('span', { class: 'muted small' }, '—');
  const label = BRANCH_READING_STATE_LABELS[reading.state] || reading.state;
  const askAgain = h('button', {
    class: 'btn btn-small', type: 'button',
    onClick: () => requestReadingDialog(ctx, reading, pos),
  }, reading.state === 'not-asked' ? 'Request reading' : 'Request again');
  if (reading.state === 'not-asked') {
    return h('div', { class: 'stack-xs' }, badge('not asked', 'warn', reading.why), askAgain);
  }
  if (reading.state === 'asked' || reading.state === 'overdue') {
    return h('div', { class: 'stack-xs' },
      badge(label, reading.state === 'overdue' ? 'bad' : 'neutral', reading.why),
      h('span', { class: 'muted small' }, reading.state === 'overdue' ? `${reading.daysPast} day(s) past ${reading.responseBy}` : `answer expected by ${reading.responseBy}`),
      h('button', {
        class: 'btn btn-ghost btn-small', type: 'button',
        onClick: () => withdrawReadingDialog(ctx, reading),
      }, 'Withdraw'));
  }
  if (reading.state === 'published') {
    return h('div', { class: 'stack-xs' },
      badge(reading.bandLabel, bandTone(reading.band), reading.why),
      h('span', { class: 'muted small' }, `published ${reading.publishedOn} · valid until ${reading.why.match(/valid until (\d{4}-\d{2}-\d{2})/)?.[1] || 'the declared window'}`),
      reading.note ? h('span', { class: 'muted small' }, `“${reading.note}”`) : null);
  }
  if (reading.state === 'lapsed') {
    return h('div', { class: 'stack-xs' },
      badge('reading lapsed', 'bad', reading.why),
      h('span', { class: 'muted small' }, `${reading.bandLabel || 'reading'} published ${reading.publishedOn} — past the declared validity`),
      askAgain);
  }
  if (reading.state === 'declined') {
    return h('div', { class: 'stack-xs' },
      badge('declined', 'warn', reading.why),
      h('span', { class: 'muted small' }, `declined ${reading.answeredOn}${reading.note ? `: “${reading.note}”` : ''}`),
      askAgain);
  }
  return h('div', { class: 'stack-xs' }, badge('withdrawn', 'neutral', reading.why), askAgain);
}

function readingsPanel(ctx, report) {
  const board = ctx.api.branchReadingBoard?.();
  if (!board?.ok) {
    return card({
      title: 'Branch readings could not be read',
      body: emptyState({ title: 'The hand-off is unavailable at this seat', body: board?.error || 'No reading board is available.' }),
    });
  }
  const summaries = board.summary;
  const consequence = report.branchCoverage?.readings || null;
  // ADR-0131: `?ask=` / `?reading=` focus one record on whichever chair holds
  // it. Both chairs are resolved against the ACTING seat by the engine, so a
  // peer holding the link sees the absent note, never the sibling's ask —
  // and still no seat id or table position travels on the row (ADR-0129).
  const askFocus = recordFocus(ctx.query, 'ask',
    [...board.askedOfMe, ...board.askedOfSpan], (row) => row.id);
  const readingFocus = recordFocus(ctx.query, 'reading',
    [...board.askedOfMe.map((a) => a.answer), ...board.askedOfSpan.map((a) => ({ id: a.answerId }))],
    (row) => row?.id || null);
  const absentNote = focusAbsentNote(askFocus, 'branch reading request') || focusAbsentNote(readingFocus, 'branch reading');
  return h('div', { class: 'stack' },
    absentNote ? banner({ tone: 'warn', title: 'The linked record is not here', body: absentNote }) : null,
    card({
      title: `Readings asked of this seat — ${board.seat.label}`,
      subtitle: 'Every request addressed to this seat as a branch’s own leader, with the exact window it is about. Publishing sends a BAND computed from this seat’s register and your own words; the counts stay here.',
      body: board.askedOfMe.length
        ? h('div', { class: 'stack' }, ...board.askedOfMe.map((ask) => {
          const selected = isFocused(askFocus, ask.id) || isFocused(readingFocus, ask.answer?.id);
          return card({
            className: selected ? 'lineage-selected' : '',
            attrs: { 'data-ask-id': ask.id, ...(ask.answer?.id ? { 'data-reading-id': ask.answer.id } : {}), ...(selected ? { 'aria-current': 'true' } : {}) },
            title: `${ask.askedByLabel} asked for a reading on ${ask.askedOn}`,
          subtitle: ask.state === 'overdue'
            ? `Overdue: the declared response window closed on ${ask.responseBy}, ${ask.daysPast} day(s) ago.`
            : (ask.canAnswer ? `An answer is expected by ${ask.responseBy}.` : ask.why),
          body: h('div', { class: 'stack' },
            h('p', null, `“${ask.note}”`),
            ask.preview
              ? h('div', { class: 'stat-grid' },
                stat({ label: 'Band this register grades', value: ask.preview.bandLabel, hint: ask.preview.why }),
                stat({ label: 'Duty lines', value: String(ask.preview.dutiesN), hint: `${ask.preview.holdingN} holding · ${ask.preview.thinN} thin · ${ask.preview.exposedN} exposed` }),
                stat({ label: 'What travels', value: 'band + words', hint: 'no count, no rate, no per-duty figure' }))
              : null,
            ask.answer
              ? h('p', { class: 'muted small' }, `Answered ${ask.answer.answeredOn}: ${ask.answer.answer === 'declined' ? 'declined' : `published “${ask.answer.bandLabel}”`} — “${ask.answer.note}”`)
              : null),
          actions: [
            ask.canAnswer
              ? h('button', { class: 'btn btn-primary btn-small', type: 'button', onClick: () => publishReadingDialog(ctx, ask) }, 'Publish the branch reading')
              : null,
            ask.canAnswer
              ? h('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => declineReadingDialog(ctx, ask) }, 'Decline, with a reason')
              : null,
            ask.answer && ask.answer.answer === 'published'
              ? h('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => revokeReadingDialog(ctx, ask) }, 'Revoke this reading')
              : null,
          ].filter(Boolean),
          });
        }))
        : emptyState({
          title: 'No reading has been requested of this seat',
          body: 'A branch reading is asked of a branch by the seat whose own table withholds its cell. Nothing is owed here today — and nothing has been silently answered in your name either.',
        }),
    }),
    card({
      title: 'Readings this seat has asked for',
      subtitle: 'One row per request made from this seat, with the derived state and the branch’s answer. Nothing is chased, escalated or auto-assigned.',
      body: h('div', { class: 'stack' },
        h('div', { class: 'stat-grid' },
          stat({ label: 'Outstanding', value: String(board.askedOfSpan.filter((a) => a.state === 'asked' || a.state === 'overdue').length), hint: `${board.askedOfSpan.filter((a) => a.state === 'overdue').length} past the declared response window` }),
          stat({ label: 'Published', value: String(board.askedOfSpan.filter((a) => a.state === 'published').length), hint: 'band + words received; no figure crossed' }),
          stat({ label: 'Declined', value: String(board.askedOfSpan.filter((a) => a.state === 'declined').length), hint: 'an answer, printed with its reason' }),
          stat({ label: 'Lapsed', value: String(board.askedOfSpan.filter((a) => a.state === 'lapsed').length), hint: `older than the declared ${board.conventions.dutyCoverageReadingValidDays}-day validity` })),
        h('p', { class: 'muted small' }, `Response window ${board.conventions.dutyCoverageReadingResponseDays} day(s); reading validity ${board.conventions.dutyCoverageReadingValidDays} day(s). Both are declared, printed and re-declarable only by a rank-4+ full-access seat.`),
        table({
          caption: 'Branch reading requests from this seat',
          columns: [
            { label: 'Branch', render: (r) => `${r.targetLabel}${r.targetRank ? ` · rank ${r.targetRank}` : ''}` },
            { label: 'Asked', render: (r) => r.askedOn },
            { label: 'Answer by', render: (r) => r.responseBy || '—' },
            { label: 'State', render: (r) => badge(r.stateLabel, r.state === 'published' ? 'good' : r.state === 'overdue' || r.state === 'lapsed' ? 'bad' : r.state === 'declined' ? 'warn' : 'neutral', r.why) },
            { label: 'Band', render: (r) => (r.bandLabel ? badge(r.bandLabel, bandTone(r.band)) : '—') },
            { label: 'The branch’s words', render: (r) => (r.answerNote ? `“${r.answerNote}”` : (r.note ? `asked: “${r.note}”` : '')) },
            {
              label: 'Open act', render: (r) => (r.canWithdraw
                ? h('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => withdrawReadingDialog(ctx, r) }, 'Withdraw')
                : '—'),
            },
          ],
          rows: board.askedOfSpan.map((row) => {
            // One row can be addressed by the ask OR by its answer; either
            // focus selects the same row, and the row carries both anchors.
            const selected = isFocused(askFocus, row.id) || isFocused(readingFocus, row.answerId);
            return {
              ...row,
              className: selected ? 'lineage-selected' : '',
              attrs: { 'data-ask-id': row.id, ...(row.answerId ? { 'data-reading-id': row.answerId } : {}), ...(selected ? { 'aria-current': 'true' } : {}) },
            };
          }),
          emptyMessage: 'This seat has not asked any branch for a reading.',
        })),
      actions: consequence
        ? [h('a', { class: 'btn btn-small', href: '#/duty-cover?panel=desk' }, 'Back to the branch table')]
        : [],
    }),
    card({
      title: 'What a branch reading is, and what it refuses to be',
      body: h('div', { class: 'stack' },
        h('p', null, BRANCH_READING_PREMISE),
        h('ul', { class: 'plain-list' },
          h('li', null, h('strong', null, 'The band is derived, never typed.'), ' The publish command computes it from the publisher’s own register and freezes it with the day. No field in any form can set a reassuring band.'),
          h('li', null, h('strong', null, 'Only a band and words cross.'), ' The counts behind the band stay in the branch’s own register, which is the whole reason the cell was withheld.'),
          h('li', null, h('strong', null, 'A reading lapses.'), ' It is valid for the declared window and then prints LAPSED; the chief must ask again, because a reading about last month is not today’s condition.'),
          h('li', null, h('strong', null, 'A decline is an answer.'), ' It is recorded, printed with its reason and counted — and it opens no governed decision. A refusal that escalates itself is not a refusal.'),
          h('li', null, h('strong', null, 'Nothing is chased.'), ' No reminder, no auto-reassignment, no escalation. An ask past its window is printed as overdue so the chief knows to walk over.')),
      ),
    }),
  );
}

/* ------------------------------------------------------------------ panels */

function dutyCard(ctx, row, namesShown) {
  const r = row.reading;
  return card({
    title: `${r.label} — ${row.seat.name} (${row.seat.label})`,
    subtitle: r.question,
    actions: [bandBadge(r.band)],
    body: h('div', { class: 'stack' },
      h('p', { class: 'muted small' }, r.bandReason),
      h('div', { class: 'stat-grid' },
        stat({ label: 'Open work', value: String(r.openN), hint: r.oldestOn ? `oldest open since ${r.oldestOn}` : 'nothing open in this duty line today' }),
        stat({ label: 'Eligible candidates', value: String(r.eligibleCandidates.length), hint: `${r.ineligibleCandidates.length} refused (including the duty holder)` }),
        stat({ label: 'Declared covers', value: String(r.covers.length), hint: `${r.exercisedCoversN} exercised inside the window` }),
        stat({
          label: 'Top hand', value: r.concentration.top ? pctText(r.concentration.top.sharePct) : '—',
          tone: r.concentration.soleHanded ? 'bad' : '',
          hint: r.concentration.top
            ? `${namesShown ? r.concentration.top.name : 'one person'} of ${r.concentration.totalN} recorded work item(s); threshold ${r.concentration.thresholdPct}%`
            : 'no recorded work names anyone in this span',
        })),
      r.covers.length
        ? h('div', { class: 'stack-xs' },
          h('p', { class: 'field-label' }, 'Declared covers, each with its exercise evidence'),
          table({
            caption: `Declared covers for ${r.label}`,
            columns: [
              { label: 'Cover', render: (c) => h('span', null, namesShown ? (c.name || '—') : 'Name withheld above the manager altitude') },
              { label: 'Rank', render: (c) => num(c.rank) },
              { label: 'Declared', render: (c) => c.declaredOn },
              { label: 'Eligible', render: (c) => (c.eligible ? badge('eligible', 'good') : badge('ineligible', 'bad')) },
              { label: 'Exercise', render: (c) => (c.exercised ? badge(`last ${c.lastWorkDay}`, 'good') : badge(c.lastWorkDay ? `stale ${c.lastWorkDay}` : 'never recorded', 'warn')) },
              { label: 'Action', render: (c) => h('span', { class: 'row-actions' },
                h('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => rehearsalDialog(ctx, { id: c.id, name: c.name, label: c.label, dutyLabel: r.label }) }, 'Rehearse'),
                h('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => revokeDialog(ctx, c) }, 'Revoke')) },
            ],
            rows: r.covers,
            emptyMessage: 'No cover declared.',
          }),
          h('ul', { class: 'plain-list' }, ...r.covers.map((c) => h('li', { class: 'muted small' }, `${namesShown ? (c.name || 'cover') : 'cover'} — ${c.exerciseNote}`))))
        : null,
      h('div', { class: 'row-actions' },
        h('button', { class: 'btn btn-small', type: 'button', disabled: !r.eligibleCandidates.length, onClick: () => designateDialog(ctx, row) }, 'Declare a cover'),
        h('a', { class: 'btn btn-ghost btn-small', href: r.routes[0] || '#/today' }, `Open ${r.label.toLowerCase()}`)),
    ),
  });
}

/* ADR-0132: the seat's daily handover triage. One row is one cover × duty ×
 * unended absence whose only in-window evidence is inferred work. The engine
 * has already scoped and redacted it; this card only prints and offers the
 * existing ADR-0128 rehearsal act to a seat positioned to record it. */
function handoverDigestCard(ctx, digest) {
  if (!digest) return null;
  const s = digest.summary;
  if (!s.checksN) {
    return card({
      title: 'Handover checks — inference-only covers',
      body: emptyState({
        title: 'No inference-only cover needs a handover check',
        body: 'No available, eligible cover on an unended absence window is resting on inferred work alone. This is not a claim that every handover was rehearsed: gaps, missing evidence and ended windows keep their own states elsewhere.',
      }),
    });
  }
  return card({
    title: `Handover checks — ${s.checksN} inference-only cover check(s)`,
    subtitle: `${s.windowsN} unended absence window(s) · ${s.openWorkChecksN} check(s) on duty lines carrying open work · ${s.cutoffPassedN} past the preparation cutoff. Ordered by open work, then earliest cutoff.`,
    body: h('div', { class: 'stack' },
      h('p', { class: 'muted small' }, DUTY_HANDOVER_DIGEST_PREMISE),
      s.cutoffPassedN
        ? banner({ tone: 'warn', title: `${s.cutoffPassedN} check(s) are already past the preparation cutoff`, body: 'The absence has started or the pre-window cutoff has passed. A rehearsal recorded now is still a dated human act, but it cannot back-date readiness; the row keeps printing until the evidence or the window changes.' })
        : null,
      table({
        caption: 'Inference-only handover checks, scoped to this seat',
        rows: digest.rows,
        emptyMessage: 'No check is printed in this slice.',
        columns: [
          { label: 'Duty', render: (r) => h('span', null, h('strong', null, r.dutyLabel), h('span', { class: 'muted small' }, ` · ${r.holderName ? `${r.holderName} (${r.holderLabel})` : r.holderLabel}`)) },
          { label: 'Cover', render: (r) => (digest.namesVisible ? (r.coverName || r.coverLabel || '—') : `Name withheld · ${r.coverLabel || `rank ${r.coverRank}`}`) },
          { label: 'Absence', render: (r) => `${r.from} → ${r.to}` },
          { label: 'Prepare by', render: (r) => h('span', null, r.preparationTo, r.cutoffPassed ? badge('cutoff passed', 'warn') : badge(`${Math.max(0, r.startsInDays)}d to start`, 'neutral')) },
          { label: 'Inferred evidence', render: (r) => `${r.evidenceOn || '—'}${r.evidenceType ? ` · ${r.evidenceType}` : ''}` },
          { label: 'Open work', render: (r) => String(r.openN) },
          { label: 'Act', render: (r) => h('span', { class: 'row-actions' },
            h('a', { class: 'btn btn-ghost btn-small', href: `#/duty-cover?panel=plan&plan=${encodeURIComponent(r.planId)}` }, 'Open plan'),
            r.canRecord
              ? h('button', { class: 'btn btn-small', type: 'button', onClick: () => rehearsalDialog(ctx, { id: r.coverRowId, name: r.coverName, label: r.coverLabel, dutyLabel: r.dutyLabel }) }, 'Record rehearsal')
              : h('span', { class: 'muted small' }, 'Holder, cover or leader above records')) },
        ],
      }),
      s.deferredN
        ? h('p', { class: 'muted small' }, `${s.deferredN} further check(s) are counted but not printed: the Desk digest is capped at ${s.rowCap} row(s). The full count travels in the brief and the per-absence CSV counts; nothing is silently dropped.`)
        : null,
      h('p', { class: 'muted small' }, 'A check clears when a ready rehearsal is recorded, the cover or absence is revoked, the roster changes, or the window ends. A gaps rehearsal leaves this queue and opens its own governed decision. Nothing here assigns a cover, sends a reminder or changes the navigation badge.')),
  });
}

/* ADR-0133: the director / VP span-wide reading roll-up. The engine has
 * already derived, scoped and redacted it; this card only prints counts and the
 * bounded review queue. No name, note, band, person id or record id crosses
 * above rank 2 — only a rank number and an anonymous branch position. */
function spanReadingsCard(roll) {
  if (!roll) return null;
  const s = roll.summary;
  const stateCell = (n) => String(n);
  return card({
    title: `Continuity signal across the whole span — ${s.attentionN} governed hand-off(s) need a human`,
    subtitle: `${s.actsN} dated hand-off(s) from ${s.desksN} leadership seat(s) across ${s.branchesN} direct branch(es), read from the two append-only reading ledgers. ${s.ownN} sit on this seat’s own desk. The oldest overdue ask is listed first; a published reading is the one state that needs nobody.`,
    body: h('div', { class: 'stack' },
      h('p', { class: 'muted small' }, DUTY_READING_ROLLUP_PREMISE),
      s.attentionN
        ? banner({
          tone: 'warn',
          title: `${s.attentionN} hand-off(s) in this span have gone dark or terminal`,
          body: `${s.overdueN} overdue · ${s.lapsedN} lapsed · ${s.declinedN} declined · ${s.withdrawnN} withdrawn. A branch two levels down can let a reading lapse without this seat ever seeing it on its own one-level table. This is a governed review queue — nothing is assigned, chased, reminded or opened, and a decline stays a legitimate answer.`,
        })
        : h('p', { class: 'muted small' }, 'No governed hand-off in this span is overdue, lapsed, declined or withdrawn. That is a statement about the dated acts on the ledger, not a claim that every withheld cell has a reading.'),
      h('div', { class: 'stat-grid' },
        stat({ label: 'Hand-offs in span', value: String(s.actsN), hint: `${s.desksN} leadership seat(s) wrote them · ${s.outsideN} outside this span are not read` }),
        stat({ label: 'Need a human', value: String(s.attentionN), tone: s.attentionN ? 'bad' : 'good', hint: 'overdue + lapsed + declined + withdrawn' }),
        stat({ label: 'Inside the window', value: String(s.askedN), hint: `asked, answer expected inside the declared ${roll.conventions.responseDays}-day window` }),
        stat({ label: 'Published', value: String(s.publishedN), hint: `valid for ${roll.conventions.validDays} day(s); a July reading is not a September reading` }),
        stat({ label: 'On your own desk', value: String(s.ownN), hint: 'also on the Branch readings panel — this card adds the desks below you' }),
        stat({ label: 'Review queue', value: String(s.queueN), hint: `bounded at ${roll.rowCap} row(s); ${s.deferredN} counted but not printed` })),
      table({
        caption: 'Reading hand-off states by this seat’s direct branches — counts only, branch numbers are anonymous positions',
        rows: roll.branches,
        emptyMessage: 'No direct leadership branches in this seat.',
        columns: [
          { label: 'Branch', render: (r) => r.label },
          { label: 'Desks', render: (r) => stateCell(r.desksN) },
          { label: 'Hand-offs', render: (r) => stateCell(r.actsN) },
          { label: 'Overdue', render: (r) => stateCell(r.overdueN) },
          { label: 'Lapsed', render: (r) => stateCell(r.lapsedN) },
          { label: 'Declined', render: (r) => stateCell(r.declinedN) },
          { label: 'Answered', render: (r) => stateCell(r.publishedN) },
        ],
      }),
      table({
        caption: 'Governed review queue — oldest overdue ask first, then the earliest deadline; identity-free above rank 2',
        rows: roll.queue,
        emptyMessage: 'Nothing is on the review queue: every recorded hand-off either has a valid published reading or is inside its declared window.',
        columns: [
          { label: 'Branch', render: (r) => (r.branchPos ? `Branch ${r.branchPos}` : 'Own desk') },
          { label: 'Desk rank', render: (r) => (r.deskRank === null ? '—' : `rank ${r.deskRank}`) },
          { label: 'State', render: (r) => badge(r.stateLabel, r.state === 'overdue' || r.state === 'lapsed' ? 'bad' : 'warn') },
          { label: 'Asked', render: (r) => r.askedOn || '—' },
          { label: 'Answer by', render: (r) => r.responseBy || '—' },
          { label: 'Age / lateness', render: (r) => (r.state === 'overdue' ? `${r.daysPast} day(s) past` : r.state === 'lapsed' ? `${r.ageDays} day(s) old` : r.state === 'asked' ? `${r.daysLeft} day(s) left` : r.publishedOn || r.answeredOn || '—') },
        ],
      }),
      s.deferredBranchesN
        ? h('p', { class: 'muted small' }, `${s.deferredBranchesN} further direct branch(es) were not rolled up: the table is capped at ${roll.conventions.branchCap}. The remainder is counted, not silently dropped.`)
        : null,
      s.deferredN
        ? h('p', { class: 'muted small' }, `${s.deferredN} further review row(s) are counted but not printed: the queue is capped at ${roll.rowCap} row(s). The full count travels in the brief and the aggregate CSV counts.`)
        : null,
      h('ul', { class: 'plain-list' }, ...roll.refusals.slice(0, 6).map((reason) => h('li', { class: 'muted small' }, reason))),
      h('div', { class: 'row-actions' },
        h('a', { class: 'btn btn-ghost btn-small', href: '#/duty-cover?panel=readings' }, 'Open the Branch readings panel'),
        h('span', { class: 'muted small' }, 'Only the seat that was asked may answer; a roll-up never answers for a seat below it.')),
      h('p', { class: 'muted small' }, 'Counts, a rank (a position number), an anonymous branch position, dates and derived states only. No name, note, band, person id, seat id or record id crosses above rank 2. The navigation badge is deliberately unchanged: this is a governed review queue, not a second obligation on the person who owes the answer.')),
  });
}

function deskPanel(ctx, report) {
  const s = report.summary;
  const brief = ctx.api.dutyCoverageBriefText?.();
  // The desk shows what needs a decision: the two most at-risk duty lines, plus
  // any line that already carries a declared cover — a lead needs to see both
  // the gap they have not closed and the cover they did declare (and whether it
  // has been exercised), not only the failures.
  const ranked = [...report.rows].sort((a, b) => {
    const band = { gap: 0, ineligible: 1, thin: 2, covered: 3 };
    return band[a.reading.band] - band[b.reading.band] || b.reading.openN - a.reading.openN;
  });
  const worst = [...ranked.slice(0, 2), ...ranked.filter((r) => r.reading.covers.length)]
    .filter((row, i, all) => all.findIndex((x) => x.reading.dutyId === row.reading.dutyId) === i)
    .slice(0, 3);
  if (!report.seat.fullAccess && !report.rows.length) {
    return card({
      title: 'No declared duty line at this seat',
      body: emptyState({
        title: 'Declare a seat first',
        body: 'The duty table belongs to an altitude. Declare an operating seat on the Altitude Lens and this register lists the duties that seat must answer for — and who answers when it is absent.',
        action: h('a', { class: 'btn btn-primary', href: '#/seat' }, 'Open the Altitude Lens'),
      }),
    });
  }
  return h('div', { class: 'stack' },
    card({
      title: `This altitude's question — ${report.seat.label}`,
      subtitle: report.seat.fullAccess
        ? 'Operator view: every declared seat’s duty register, as the whole workspace.'
        : `Reading the duty lines you hold and the ${Math.max(0, report.rows.length - (report.rows.filter((r) => r.seat.id === report.seat.id).length))} held below you in this span.`,
      body: h('div', { class: 'stat-grid' },
        stat({ label: 'Duty lines', value: String(s.dutiesN), hint: `${s.byBand.covered} covered · ${s.byBand.thin} thin · ${s.byBand.ineligible} ineligible · ${s.byBand.gap} uncovered` }),
        stat({ label: 'Register readiness', value: pctText(s.readinessPct), tone: s.readinessPct === null ? '' : (s.readinessPct >= 70 ? 'good' : 'bad'), hint: s.interval ? `Wilson 95% ${s.interval.low}–${s.interval.high}% · measures the REGISTER, not a person` : 'refused: no declared duty line' }),
        stat({ label: 'Open work with no cover', value: String(s.openGapN), tone: s.openGapN ? 'bad' : 'good', hint: 'a duty carrying open items and answerable by nobody' }),
        stat({ label: 'Single-hand duties', value: String(s.soleHandedN), tone: s.soleHandedN ? 'bad' : '', hint: `one hand carries ≥ ${report.conventions.dutyCoverageConcentrationPct}% of the recorded work` }),
        stat({ label: 'Handover checks', value: String(report.absences?.handoverDigest?.summary?.checksN ?? 0), tone: report.absences?.handoverDigest?.summary?.checksN ? 'warn' : 'good', hint: 'inference-only covers on unended absence windows · review prompt, not a badge' }),
        stat({ label: 'Span reading gaps', value: String(report.spanReadings?.summary?.attentionN ?? 0), tone: report.spanReadings?.summary?.attentionN ? 'warn' : 'good', hint: 'governed branch-reading hand-offs anywhere in this span that are overdue, lapsed, declined or withdrawn · review queue, not a badge' }),
        stat({ label: 'Exercise window', value: `${report.conventions.dutyCoverageExerciseDays}d`, hint: `since ${s.windowStart}; re-declarable by a rank-4+ full-access seat` })),
    }),
    handoverDigestCard(ctx, report.absences?.handoverDigest),
    spanReadingsCard(report.spanReadings),
    report.branchCoverage ? card({
      title: 'Continuity across direct branches',
      subtitle: `Each duty line belongs to one direct leadership branch; your own duties are excluded. Branch numbers are anonymous and may change when the roster changes. They are not division names. A cell below the declared floor of ${report.branchCoverage.floor} duty line(s) is withheld, and an additional cell may be withheld to reduce recovery by subtraction from a parent total.`,
      body: h('div', { class: 'stack' },
        report.branchCoverage.refusal
          ? h('p', { class: 'muted' }, report.branchCoverage.refusal)
          : h('p', null, `Pooled: ${pctText(report.branchCoverage.pooledPct)} · mean of branch rates: ${pctText(report.branchCoverage.meanPct)}. Different branch sizes can make these differ (Yule–Simpson aggregation). These describe the register, not a forecast of an absence.`),
        report.branchCoverage.suppressedN
          ? banner({
            tone: 'warn',
            title: `${report.branchCoverage.suppressedN} branch cell(s) withheld at the disclosure floor of ${report.branchCoverage.floor} contributing seat(s)`,
            body: `${report.branchCoverage.pooledRefused || ''} ${report.branchCoverage.meanRefused || ''} Withheld is not zero: a blank cell prints its reason here rather than a small number that would describe a person.`.trim(),
          })
          : null,
        table({
          caption: 'Direct branch duty coverage',
          columns: [
            { label: 'Branch', render: (r) => r.label },
            { label: 'Seats / duties', render: (r) => `${r.seatsN} / ${r.dutiesN}` },
            { label: 'Covered / duties', render: (r) => (r.suppressed ? 'WITHHELD' : `${r.coveredN} / ${r.dutiesN}`) },
            { label: 'Readiness', render: (r) => (r.suppressed ? 'WITHHELD' : pctText(r.readinessPct)) },
            { label: 'No cover', render: (r) => (r.suppressed ? 'WITHHELD' : String(r.gapN)) },
            { label: 'Open work, no cover', render: (r) => (r.suppressed ? 'WITHHELD' : String(r.openGapN)) },
            { label: 'Why the cell is blank', render: (r) => r.refused || '' },
            { label: 'Reading from the branch', render: (r) => (r.suppressed ? readingCell(ctx, r.reading, r.pos) : h('span', { class: 'muted small' }, 'released')) },
          ],
          rows: report.branchCoverage.branches,
          emptyMessage: 'No direct leadership branches in this seat.',
        }),
        report.branchCoverage.deferredN
          ? h('p', { class: 'muted small' }, `${report.branchCoverage.deferredN} further branch(es) are not compared: the table is capped at ${report.conventions.dutyCoverageBranchCap}. The cap is declared, and the remainder is counted rather than silently dropped.`)
          : null,
        h('p', { class: 'muted small' }, DUTY_BRANCH_DISCLOSURE_PREMISE),
        report.branchCoverage.readings
          ? h('p', { class: 'muted small' }, `${report.branchCoverage.readings.cellsN} withheld cell(s): ${report.branchCoverage.readings.publishedN} have a published reading (${report.branchCoverage.readings.bands.holding} holding, ${report.branchCoverage.readings.bands.thin} thin, ${report.branchCoverage.readings.bands.exposed} exposed, ${report.branchCoverage.readings.bands.unknown} cannot say), ${report.branchCoverage.readings.declinedN} were declined, ${report.branchCoverage.readings.outstandingN} are outstanding (${report.branchCoverage.readings.overdueN} overdue) and ${report.branchCoverage.readings.notAskedN} have never been asked. Open the readings panel to ask, answer or withdraw.`)
          : null,
        h('p', { class: 'muted small' }, 'A missing or unexercised declaration is not evidence that an absence will cause failure. Ask the relevant leaders to review their own registers; no cover is assigned here. The withheld-cell hand-off lives on the Branch readings panel.')),
    }) : null,
    report.absences?.own || (report.absences?.inSpan?.length || 0)
      ? card({
        title: 'Dated absence plans',
        subtitle: 'Windows the register grades every duty line against, on the dates the seats will not be there.',
        body: h('div', { class: 'stack' },
          h('p', { class: 'muted small' }, `${report.absences.own ? 1 : 0} own, ${report.absences.inSpan.length} in span — ${report.absences.exposedOpenN} duty line(s) carry open work with no available cover on the absence dates. Availability is derived from the declared windows; the plan is a read, declaring the window is the write.`),
          h('a', { class: 'btn btn-small', href: '#/duty-cover?panel=plan' }, 'Open the absence plan')),
      })
      : null,
    s.openGapN
      ? banner({
        tone: 'bad',
        title: `${s.openGapN} duty line(s) carry open work and nobody is declared answerable`,
        body: 'This is not a scoring failure; it is an unrecorded responsibility. Declaring cover is a dated human act and opens a governed decision naming the consequence if it fails.',
      })
      : (s.gapN
        ? banner({ tone: 'warn', title: `${s.gapN} duty line(s) have no declared cover`, body: 'Their open work is empty today, so nothing is currently stalling — but the register keeps printing the gap rather than assuming the absence will be quiet.' })
        : null),
    card({
      title: 'The identity-free upward brief',
      subtitle: 'Counts, bands and every refusal named. Safe to carry upward unchanged.',
      body: h('pre', { class: 'brief-block' }, brief?.text || 'No brief available.'),
      actions: [h('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: copyBrief }, 'Copy brief')],
    }),
    ...worst.map((row) => dutyCard(ctx, row, report.namesVisible)),
    card({
      title: 'Why this is not a cover-rota app',
      body: h('ul', { class: 'plain-list' },
        h('li', null, h('strong', null, 'The duty table is already declared.'), ' This screen does not invent duties: it reads ADR-0075’s altitude table and asks the one question the table could not answer — who is answerable when the holder is absent.'),
        h('li', null, h('strong', null, '“Exercised” is derived, never ticked.'), ' A cover counts as live only when that person recorded work inside the duty’s span inside the declared window — or, stronger, when a seat that was there recorded an explicit rehearsal (ADR-0128). A declaration nobody exercises prints as “thin”, not “covered”; a rehearsal that found gaps prints as a governed decision, not a badge.'),
        h('li', null, h('strong', null, 'A duty rises, it never falls sideways.'), ' Candidates include a higher-ranked span inside it or a reporting-tree ancestor. The holder cannot cover their own absence; peers are never offered and a lower rank is refused with the reason printed (Jaques 1956; Aghion & Tirole 1997).'),
        h('li', null, h('strong', null, 'One declaration, one transaction.'), ' The cover, its `prepares-for` edge, the governed decision naming the consequence and one `rolls-up-to` edge per ancestor all commit atomically through the shared spine.')),
    }),
  );
}

function registerPanel(ctx, report) {
  const rows = report.rows;
  // ADR-0131: a typed edge names ONE cover declaration. The row that carries
  // it is selected; the id survives the above-rank-2 redaction (it addresses
  // the declaration, never the person), so focus works at every altitude.
  const coverFocus = recordFocus(ctx.query, 'cover', rows, (row) => (row.reading.covers || []).map((c) => c.id));
  const absentNote = focusAbsentNote(coverFocus, 'cover declaration');
  if (!rows.length) {
    return h('div', { class: 'stack' },
      absentNote ? banner({ tone: 'warn', title: 'The linked record is not here', body: absentNote }) : null,
      card({ title: 'Nothing to register', body: emptyState({ title: 'No declared duty line', body: 'Declare an operating seat to populate the duty register.' }) }));
  }
  const focusedRows = rows.map((row) => {
    const ids = (row.reading.covers || []).map((c) => c.id);
    const focusId = coverFocus.matched && ids.includes(coverFocus.id) ? coverFocus.id : null;
    return {
      ...row,
      ...focusRowProps(coverFocus, focusId, 'data-cover-id', { attrs: { 'data-duty-id': row.reading.dutyId } }),
    };
  });
  return h('div', { class: 'stack' },
    absentNote ? banner({ tone: 'warn', title: 'The linked record is not here', body: absentNote }) : null,
    card({
      title: 'Duty lines and their covers',
      subtitle: report.namesVisible
        ? 'Names are shown because this seat’s altitude needs them to make a call.'
        : 'Names are withheld above the manager altitude: the register prints counts, bands and labels — never a person.',
      body: table({
        caption: 'Duty lines and their declared covers',
        columns: [
          { label: 'Seat', render: (row) => h('span', null, `${report.namesVisible ? row.seat.name : row.seat.label}`) },
          { label: 'Duty', render: (row) => row.reading.label },
          { label: 'Band', render: (row) => bandBadge(row.reading.band) },
          { label: 'Open', render: (row) => String(row.reading.openN) },
          { label: 'Covers', render: (row) => `${row.reading.exercisedCoversN}/${row.reading.covers.length}` },
          {
            label: 'Covered by',
            render: (row) => (row.reading.covers.length
              ? (report.namesVisible
                ? (row.reading.covers.map((c) => c.name).filter(Boolean).join(', ') || '—')
                : badge('withheld at this altitude', 'neutral', 'Above the manager altitude a cover is a count, not a name'))
              : h('span', { class: 'muted' }, 'nobody declared')),
          },
          { label: 'Candidates', render: (row) => `${row.reading.eligibleCandidates.length} ok · ${row.reading.ineligibleCandidates.length} refused` },
          { label: 'Top hand', render: (row) => (row.reading.concentration.top ? pctText(row.reading.concentration.top.sharePct) : '—') },
          { label: 'Act', render: (row) => h('button', { class: 'btn btn-ghost btn-small', type: 'button', disabled: !row.reading.eligibleCandidates.length, onClick: () => designateDialog(ctx, row) }, row.reading.covers.length ? 'Add cover' : 'Declare cover') },
        ],
        rows: focusedRows,
        emptyMessage: 'No duty lines.',
      }),
    }),
    card({
      title: 'By seat',
      subtitle: 'The same register read as a hierarchy: which seat’s duty lines are answerable, and which are not.',
      body: table({
        caption: 'Duty coverage by seat',
        columns: [
          { label: 'Seat', render: (row) => h('span', null, report.namesVisible ? `${row.name || row.seatId}` : row.label) },
          { label: 'Rank', render: (row) => String(row.rank) },
          { label: 'Duties', render: (row) => String(row.dutiesN) },
          { label: 'Covered', render: (row) => String(row.covered) },
          { label: 'Thin', render: (row) => String(row.thin) },
          { label: 'Ineligible', render: (row) => String(row.ineligible) },
          { label: 'No cover', render: (row) => String(row.gap) },
          { label: 'Sole-hand', render: (row) => String(row.soleHandedN) },
        ],
        rows: report.seatRows,
        emptyMessage: 'No seats.',
      }),
    }),
  );
}

function gapsPanel(ctx, report) {
  const rows = [...report.gaps, ...report.ineligible, ...report.thin];
  if (!rows.length) {
    return card({
      title: 'No gaps printed',
      body: emptyState({
        title: 'Every declared duty line has an eligible, exercised cover',
        icon: '✓',
        body: 'This is the register’s own claim about itself: not that nothing will go wrong, but that a named person is answerable for every duty line and the workspace has seen them work inside it.',
      }),
    });
  }
  return h('div', { class: 'stack' },
    card({
      title: `${rows.length} duty line(s) need attention`,
      subtitle: 'Each row prints why it is here. A gap is not a scandal — an unprinted gap is.',
      body: table({
        caption: 'Duty lines needing attention',
        columns: [
          { label: 'Seat', render: (row) => h('span', null, report.namesVisible ? row.seat.name : row.seat.label) },
          { label: 'Duty', render: (row) => row.reading.label },
          { label: 'Band', render: (row) => bandBadge(row.reading.band) },
          { label: 'Open', render: (row) => String(row.reading.openN) },
          { label: 'Why', render: (row) => h('span', { class: 'muted small' }, row.reading.bandReason) },
          { label: 'Act', render: (row) => h('button', { class: 'btn btn-ghost btn-small', type: 'button', disabled: !row.reading.eligibleCandidates.length, onClick: () => designateDialog(ctx, row) }, 'Declare cover') },
        ],
        rows,
        emptyMessage: 'No gaps.',
      }),
    }),
    report.refusals.length
      ? card({
        title: 'Printed refusals',
        subtitle: 'A candidate the engine will not offer, and the exact rule that refused them.',
        body: h('ul', { class: 'plain-list' }, ...report.refusals.map((r) => h('li', { class: 'muted small' }, r.reason))),
      })
      : null);
}

function concentrationPanel(ctx, report) {
  const rows = report.rows.filter((row) => row.reading.concentration.totalN > 0);
  if (!rows.length) {
    return card({ title: 'No recorded work to concentrate', body: emptyState({ title: 'Nothing dated in these duty lines', body: 'Concentration is derived from dated records: a 1:1 held, a case updated, a decision reviewed, a delegation checked in. With none recorded the register says so rather than claiming balance.' }) });
  }
  const ordered = [...rows].sort((a, b) => (b.reading.concentration.top?.sharePct || 0) - (a.reading.concentration.top?.sharePct || 0));
  return h('div', { class: 'stack' },
    card({
      title: 'Who actually carries each duty line',
      subtitle: `Share of recorded work items per person, inside this span. Above ${report.conventions.dutyCoverageConcentrationPct}% the duty reads as single-handed. Derived from dated records; it never rates anyone.`,
      body: table({
        caption: 'Work concentration per duty line',
        columns: [
          { label: 'Duty', render: (row) => row.reading.label },
          { label: 'Seat', render: (row) => h('span', null, report.namesVisible ? row.seat.name : row.seat.label) },
          { label: 'Work items', render: (row) => String(row.reading.concentration.totalN) },
          { label: 'Top hand', render: (row) => (report.namesVisible ? (row.reading.concentration.top?.name || '—') : 'withheld') },
          { label: 'Share', render: (row) => pctText(row.reading.concentration.top?.sharePct ?? null) },
          { label: 'Reading', render: (row) => (row.reading.concentration.soleHanded ? badge('single-handed', 'bad', 'One hand carries the duty above the declared share') : badge('spread', 'good', 'No single hand dominates the recorded work')) },
        ],
        rows: ordered,
        emptyMessage: 'No recorded work.',
      }),
    }),
    ...ordered.slice(0, 6).map((row) => card({
      title: `${row.reading.label} — every hand`,
      body: table({
        caption: `Hands recorded in ${row.reading.label}`,
        columns: [
          { label: 'Person', render: (p) => (report.namesVisible ? p.name : 'withheld above the manager altitude') },
          { label: 'Items', render: (p) => String(p.n) },
          { label: 'Share', render: (p) => pctText(p.sharePct) },
        ],
        rows: row.reading.concentration.rows,
        emptyMessage: 'No hands recorded.',
      }),
    })),
  );
}

function methodPanel(ctx, report) {
  const conventions = report.conventions;
  const editable = report.seat.fullAccess && (report.seat.rank ?? 0) >= 4;
  return h('div', { class: 'stack' },
    card({ title: 'The premise', body: h('p', null, DUTY_PREMISE) }),
    card({
      title: 'Declared conventions (printed, clamped, never fitted)',
      body: h('div', { class: 'stack' },
        h('div', { class: 'stat-grid' },
          stat({ label: 'Exercise window', value: `${conventions.dutyCoverageExerciseDays} day(s)`, hint: `bounds ${report.bounds.dutyCoverageExerciseDays.join('–')}` }),
          stat({ label: 'Concentration threshold', value: `${conventions.dutyCoverageConcentrationPct}%`, hint: `bounds ${report.bounds.dutyCoverageConcentrationPct.join('–')}%` }),
          stat({ label: 'Branch cell floor', value: `${conventions.dutyCoverageBranchFloorN}`, hint: `a branch cell below this many duty lines is WITHHELD, not printed small; bounds ${report.bounds.dutyCoverageBranchFloorN.join('–')}` }),
          stat({ label: 'Branch rate floor', value: `${conventions.dutyCoverageBranchRateFloorN}`, hint: `a per-branch rate is quoted only at or above this many duty lines; bounds ${report.bounds.dutyCoverageBranchRateFloorN.join('–')}` }),
          stat({ label: 'Branches compared', value: `${conventions.dutyCoverageBranchCap}`, hint: `the table is capped and the remainder counted; bounds ${report.bounds.dutyCoverageBranchCap.join('–')}` }),
          stat({ label: 'Reading response window', value: `${conventions.dutyCoverageReadingResponseDays}d`, hint: `how long a branch leader has to answer a reading request; bounds ${report.bounds.dutyCoverageReadingResponseDays.join('–')}` }),
          stat({ label: 'Reading validity', value: `${conventions.dutyCoverageReadingValidDays}d`, hint: `a published band is DERIVED, frozen on the day, and lapses after this; bounds ${report.bounds.dutyCoverageReadingValidDays.join('–')}` }),
          stat({ label: 'Covers per duty', value: '3', hint: 'a duty is not a committee; the cap is declared, not discovered' })),
        editable
          ? h('div', { class: 'row-actions' },
            h('button', {
              class: 'btn btn-small', type: 'button',
              onClick: () => {
                const form = buildForm([
                  { name: 'dutyCoverageExerciseDays', label: 'Exercise window (days)', type: 'number', min: 7, max: 180, value: conventions.dutyCoverageExerciseDays },
                  { name: 'dutyCoverageConcentrationPct', label: 'Concentration threshold (%)', type: 'number', min: 50, max: 100, value: conventions.dutyCoverageConcentrationPct },
                  { name: 'dutyCoverageBranchFloorN', label: 'Branch disclosure floor (contributing seats per cell)', type: 'number', min: 2, max: 25, value: conventions.dutyCoverageBranchFloorN },
                  { name: 'dutyCoverageBranchRateFloorN', label: 'Branch rate floor (contributing seats before a rate prints)', type: 'number', min: 2, max: 40, value: conventions.dutyCoverageBranchRateFloorN },
                  { name: 'dutyCoverageBranchCap', label: 'Branches compared per table', type: 'number', min: 4, max: 64, value: conventions.dutyCoverageBranchCap },
                  { name: 'dutyCoverageReadingResponseDays', label: 'Branch reading response window (days)', type: 'number', min: 1, max: 30, value: conventions.dutyCoverageReadingResponseDays },
                  { name: 'dutyCoverageReadingValidDays', label: 'Branch reading validity (days before it lapses)', type: 'number', min: 7, max: 180, value: conventions.dutyCoverageReadingValidDays },
                ]);
                openModal({
                  title: 'Re-declare the duty-coverage conventions',
                  description: 'These move every duty line’s reading at once. Declared deliberately, then printed everywhere.',
                  body: form.node,
                  footer: [
                    h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
                    h('button', {
                      class: 'btn btn-primary', type: 'button',
                      onClick: () => {
                        const v = form.getValues();
                        const result = ctx.api.dutyCoverageSetConventions({
                          dutyCoverageExerciseDays: Number(v.dutyCoverageExerciseDays),
                          dutyCoverageConcentrationPct: Number(v.dutyCoverageConcentrationPct),
                          dutyCoverageBranchFloorN: Number(v.dutyCoverageBranchFloorN),
                          dutyCoverageBranchRateFloorN: Number(v.dutyCoverageBranchRateFloorN),
                          dutyCoverageBranchCap: Number(v.dutyCoverageBranchCap),
                          dutyCoverageReadingResponseDays: Number(v.dutyCoverageReadingResponseDays),
                          dutyCoverageReadingValidDays: Number(v.dutyCoverageReadingValidDays),
                        });
                        if (!notify(result, 'Conventions re-declared.')) return;
                        closeAllModals();
                        ctx.refresh();
                      },
                    }, 'Re-declare'),
                  ],
                });
              },
            }, 'Re-declare conventions'))
          : h('p', { class: 'muted small' }, 'Only a rank-4 and above seat with full access may re-declare these. Below that they are read, not edited.')),
    }),
    card({
      title: 'What is stored, and what is derived',
      body: h('ul', { class: 'plain-list' },
        h('li', null, h('strong', null, 'Stored:'), ' the human declaration — duty line, named cover, the declaring words, the day, the governed decision, the revocation reason. Nothing else.'),
        h('li', null, h('strong', null, 'Derived on every read:'), ' the duty’s span holder, the eligible pool and its refusals, whether the cover has exercised access, and who actually carried the work.'),
        h('li', null, h('strong', null, 'Refused:'), ' a coverage score for a person, an automation that assigns a stand-in, and a “verified” tick-box. A tick would be a second, decaying record of a fact the workspace can re-derive.'),
        h('li', null, h('strong', null, 'Withheld, not zeroed:'), ' a direct-branch cell below the declared disclosure floor, and one further released cell beside it, so the blank cannot be recovered by subtracting the released cells from a known total. This is primary + complementary suppression, not differential privacy.'),
        h('li', null, h('strong', null, 'A withheld cell is not a closed question.'), ' ADR-0129 gives it a governed hand-off: the branch’s own leader publishes the BAND their own register grades into, with their own words — the band is derived by the register and never typed, no count crosses, the reading lapses after its declared validity, and a decline is recorded as an answer with no decision opened against the person. The withheld figure stays withheld either way.'),
        h('li', null, h('strong', null, 'Handover checks (ADR-0132):'), ' the Desk lists available, eligible covers whose only evidence inside an unended absence’s preparation window is inferred work. One row is one cover × duty × absence; open work on the duty comes first, then the earliest preparation cutoff (constraint-first dispatching, Goldratt). It is a review prompt, not a readiness verdict and not a person score. The existing rehearsal act clears a ready check; a gaps rehearsal opens its own governed decision. Counts roll up into the brief and the existing absence CSV rows; names and person ids do not cross above rank 2. The navigation badge is deliberately unchanged.'),
        h('li', null, h('strong', null, 'Span reading roll-up (ADR-0133):'), ' the two append-only branch-reading ledgers are written once, on the shared event spine, with a roll-up edge for every ancestor span. The Desk now reads those edges back across the WHOLE span, not only this seat’s own one-level table: every governed hand-off is re-derived under the same day and the same declared windows, grouped by this seat’s own direct branches, and the ones needing a human are listed oldest-overdue-first (constraint-first dispatching, Goldratt). A director two levels down whose reading lapsed is no longer dark to the VP above them. Counts travel into the identity-free brief and the existing register / branch-summary CSV rows; no name, note, band, person id or record id crosses above rank 2. Nothing is assigned, reminded or opened, a decline stays a legitimate answer, and the navigation badge is unchanged. A withheld cell nobody asked about leaves no ledger row, so this roll-up refuses to count silence as health.'),
        h('li', null, h('strong', null, 'Schema v114 is additive.'), ' An upgraded workspace starts with an empty cover ledger — “no duty here has a declared cover yet”, which is not the same claim as “every duty is covered”.')),
    }),
    card({
      title: 'Run an explicit scan',
      subtitle: 'Re-derives the register and logs what it sees. Assigns nothing.',
      body: h('button', {
        class: 'btn btn-small', type: 'button',
        onClick: () => { const result = ctx.api.dutyCoverageScan(); if (notify(result, 'Scan complete — nothing was assigned.')) ctx.refresh(); },
      }, 'Scan now'),
    }),
  );
}

/* ------------------------------------------------------------------ render */

export function renderDutyCover(ctx) {
  apiRef = ctx.api;
  const panel = panelFor(ctx.query);
  const result = ctx.api.dutyCoverageReport?.();
  if (!result || result.ok === false || !result.report) {
    return h('div', { class: 'stack' }, emptyState({ title: 'The duty-coverage register could not be built', body: result?.error || 'No report is available.' }));
  }
  const report = result.report;
  const body = panel === 'desk' ? deskPanel(ctx, report)
    : panel === 'register' ? registerPanel(ctx, report)
      : panel === 'gaps' ? gapsPanel(ctx, report)
        : panel === 'concentration' ? concentrationPanel(ctx, report)
          : panel === 'plan' ? planPanel(ctx, report)
            : panel === 'readings' ? readingsPanel(ctx, report)
              : methodPanel(ctx, report);

  return h('div', { class: 'stack duty-cover-view' },
    pageHeader({
      eyebrow: 'Continuity · ADR-0121',
      title: 'The Duty Coverage Register',
      subtitle: 'If this seat is absent tomorrow, which duty stops — and does the person who would pick it up know, have the span, and have used their access?',
      actions: [
        badge(`${report.summary.dutiesN} duty line(s)`, 'neutral', 'Declared by the altitude table, not invented here'),
        report.summary.readinessPct === null
          ? badge('readiness refused', 'warn', 'No declared duty line at this seat')
          : badge(`${pctText(report.summary.readinessPct)} covered`, report.summary.readinessPct >= 70 ? 'good' : 'bad', 'Share of duty lines with an eligible, exercised cover'),
        report.summary.openGapN ? badge(`${report.summary.openGapN} open gap(s)`, 'bad', 'Duty lines carrying open work with no cover') : null,
        report.summary.soleHandedN ? badge(`${report.summary.soleHandedN} single-hand`, 'warn', 'Duty lines concentrated in one hand') : null,
        h('button', { class: 'btn small', type: 'button', onClick: () => { const r = ctx.api.dutyCoverageScan(); if (notify(r, 'Scan complete — nothing was assigned.')) ctx.refresh(); } }, 'Scan'),
        h('button', { class: 'btn small', type: 'button', onClick: exportCsv }, 'Export CSV'),
        h('button', { class: 'btn small', type: 'button', onClick: copyBrief }, 'Copy brief'),
      ].filter(Boolean),
      meta: h('p', { class: 'muted' }, DUTY_PREMISE),
    }),
    tabs({ items: PANELS.map((p) => ({ key: p.key, label: p.label })), active: panel, onSelect: (key) => go(ctx, key), ariaLabel: 'Duty coverage panels' }),
    body,
  );
}
