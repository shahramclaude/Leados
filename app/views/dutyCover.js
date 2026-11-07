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
import { serializeCsv } from '../core/csv.js';
import { DUTY_COVERAGE_PANELS, DUTY_PREMISE } from '../core/domain/dutyCoverageRegistry.js';
import { DUTY_ABSENCE_PREMISE } from '../core/domain/dutyAbsenceRegistry.js';

const PANELS = DUTY_COVERAGE_PANELS;
const CSV_COLUMNS = ['row_kind', 'scope', 'altitude', 'duty_key', 'band', 'open_n',
  'covers_declared_n', 'covers_eligible_n', 'covers_exercised_n', 'candidates_eligible_n',
  'candidates_refused_n', 'concentration_top_share_pct', 'sole_handed', 'window_days', 'refused_reason',
  'absence_seat_rank', 'absence_from', 'absence_to', 'absence_duties_n', 'absence_covered_n',
  'absence_thin_n', 'absence_cover_absent_n', 'absence_ineligible_n', 'absence_gap_n', 'absence_exposed_open_n'];

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

/* ------------------------------------------------- ADR-0122: the plan panel */

const windowBandBadge = (band) => {
  if (band === 'covered') return badge('covered in window', 'good', 'An available, eligible cover has recorded work inside this span');
  if (band === 'thin') return badge('thin in window', 'warn', 'Available and eligible, but no recorded exercise inside the window');
  if (band === 'cover-absent') return badge('cover absent', 'bad', 'Every declared cover is themselves absent during the window');
  if (band === 'ineligible') return badge('ineligible', 'bad', 'A declared cover cannot answer at this altitude');
  return badge('no cover', 'bad', 'Nobody is declared answerable for this duty line');
};

function windowPlanCard(ctx, plan, namesShown) {
  const s = plan.summary;
  const windowText = `${plan.window.from} → ${plan.window.to}`;
  return h('div', { class: 'stack' },
    card({
      title: `Window plan — ${windowText}`,
      subtitle: `${s.dutiesN} duty line(s) this seat holds, graded against the exact dates the seat will not be there.`,
      body: h('div', { class: 'stat-grid' },
        stat({ label: 'Duty lines', value: String(s.dutiesN), hint: `${s.coveredN} covered · ${s.thinN} thin · ${s.coverAbsentN} cover-absent · ${s.gapN} no cover in window` }),
        stat({ label: 'Exposed lines', value: String(s.exposedN), tone: s.exposedN ? 'bad' : 'good', hint: 'duty lines with no available, eligible cover on these dates' }),
        stat({ label: 'Open work exposed', value: String(s.exposedOpenN), tone: s.exposedOpenN ? 'bad' : 'good', hint: 'open items sitting in lines with no available cover during the window' }),
        stat({ label: 'Cover conflicts', value: String(s.conflictsN), tone: s.conflictsN ? 'bad' : '', hint: 'declared covers who are themselves absent during the window' })),
    }),
    ...plan.rows.map((row) => card({
      title: `${row.label} — ${windowBandBadge(row.windowBand)}`,
      subtitle: row.question,
      actions: [bandBadge(row.band)],
      body: h('div', { class: 'stack' },
        h('p', { class: 'muted small' }, row.windowReason),
        h('div', { class: 'stat-grid' },
          stat({ label: 'Open work', value: String(row.openN), hint: row.oldestOn ? `oldest open since ${row.oldestOn}` : 'nothing open in this duty line' }),
          stat({ label: 'Available covers', value: String(row.availableCoversN), hint: `${row.exercisedAvailableN} exercised inside the window` }),
          stat({ label: 'Conflicts', value: String(row.conflicts.length), tone: row.conflicts.length ? 'bad' : '', hint: 'covers who are themselves absent on these dates' })),
        row.covers.length
          ? table({
            caption: `Declared covers for ${row.label}, graded on ${windowText}`,
            columns: [
              { label: 'Cover', render: (c) => h('span', null, namesShown ? (c.name || '—') : 'Name withheld above the manager altitude') },
              { label: 'Rank', render: (c) => num(c.rank) },
              { label: 'Available', render: (c) => (c.available ? badge('present', 'good') : badge(`absent ${c.absence.from} → ${c.absence.to}`, 'bad')) },
              { label: 'Eligible', render: (c) => (c.eligible ? badge('eligible', 'good') : badge('ineligible', 'bad')) },
              { label: 'Exercise', render: (c) => (c.exercised ? badge(`last ${c.lastWorkDay}`, 'good') : badge(c.lastWorkDay ? `stale ${c.lastWorkDay}` : 'never recorded', 'warn')) },
            ],
            rows: row.covers,
            emptyMessage: 'No cover declared.',
          })
          : h('p', { class: 'muted small' }, 'No cover is declared for this duty line — it reads exposed on every date of the window.'),
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
        ],
        rows: rollup.rows,
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
        stat({ label: 'Covers past observed load', value: String(s.coverLoadOverN), tone: s.coverLoadOverN ? 'bad' : 'good', hint: `envelope ${concurrency.coverLoad?.envelopeN ?? 0} open item(s); largest graded union ${s.coverLoadMaxN}` })),
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
  return h('div', { class: 'stack' },
    own
      ? card({
        title: `Declared absence — ${own.from} → ${own.to}`,
        subtitle: own.reason,
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
    concurrencyCard(report.absences?.concurrency),
    rollupCard(ctx, rollup, namesShown),
    card({
      title: 'What is declared, and what is derived',
      body: h('ul', { class: 'plain-list' },
        h('li', null, h('strong', null, 'Declared:'), ' the absence window itself — two ISO dates, the reason the seat holder wrote, and the governed decision naming what stops. A human declares an absence; nothing schedules one.'),
        h('li', null, h('strong', null, 'Derived on every read:'), ' whether each declared cover is AVAILABLE on the window’s dates (a cover with their own absence overlapping the window is not), the window band per duty line, and the cascade — whether an absent cover’s own absence is covered.'),
        h('li', null, h('strong', null, 'Concurrency (ADR-0123):'), ' overlapping absence windows are swept from the same declared dates. The sweep prints the shared dates, the duty lines with no available cover on them, and the cover who would be the only answerable person for two or more absent seats — the single point of failure a per-absence reading cannot show. Adjacency is not overlap, and above the manager altitude the cover is named by rank and seat only.'),
        h('li', null, h('strong', null, 'Cover capacity (ADR-0124):'), ' on the shared dates, the cover’s own open work and the open work they alone would inherit are counted as one set union (items already inside the cover’s own span are not added twice) and graded against the peak open-work load actually observed in this span. With no open work on the record there is no envelope and the reading refuses; a duty line with several available covers is printed as shared rather than split by guess.'),
        h('li', null, h('strong', null, 'Refused:'), ' a stored availability flag, an engine-assigned absence, an auto-assigned second cover and a “covered during the window” tick. Availability is a function of two declared windows; a stored copy would drift the moment either window changed.'),
        h('li', null, h('strong', null, 'Schema v115 is additive.'), ' An upgraded workspace opens with an empty absence ledger — “no absence has been declared here yet”, which is not the same claim as “every absence is covered”.')),
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
              { label: 'Action', render: (c) => h('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => revokeDialog(ctx, c) }, 'Revoke') },
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
        stat({ label: 'Exercise window', value: `${report.conventions.dutyCoverageExerciseDays}d`, hint: `since ${s.windowStart}; re-declarable by a rank-4+ full-access seat` })),
    }),
    report.branchCoverage ? card({
      title: 'Continuity across direct branches',
      subtitle: 'Each duty line belongs to one direct leadership branch; your own duties are excluded. Branch numbers are anonymous and may change when the roster changes. They are not division names.',
      body: h('div', { class: 'stack' },
        report.branchCoverage.refusal
          ? h('p', { class: 'muted' }, report.branchCoverage.refusal)
          : h('p', null, `Pooled: ${pctText(report.branchCoverage.pooledPct)} · mean of branch rates: ${pctText(report.branchCoverage.meanPct)}. Different branch sizes can make these differ (Yule–Simpson aggregation). These describe the register, not a forecast of an absence.`),
        table({
          caption: 'Direct branch duty coverage',
          columns: [
            { label: 'Branch', render: (r) => r.label },
            { label: 'Covered / duties', render: (r) => `${r.coveredN} / ${r.dutiesN}` },
            { label: 'Readiness', render: (r) => pctText(r.readinessPct) },
            { label: 'No cover', render: (r) => String(r.gapN) },
            { label: 'Open work, no cover', render: (r) => String(r.openGapN) },
          ],
          rows: report.branchCoverage.branches,
          emptyMessage: 'No direct leadership branches in this seat.',
        }),
        h('p', { class: 'muted small' }, 'A missing or unexercised declaration is not evidence that an absence will cause failure. Ask the relevant leaders to review their own registers; no cover is assigned here.')),
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
        h('li', null, h('strong', null, '“Exercised” is derived, never ticked.'), ' A cover counts as live only when that person recorded work inside the duty’s span inside the declared window. A declaration nobody exercises prints as “thin”, not “covered”.'),
        h('li', null, h('strong', null, 'A duty rises, it never falls sideways.'), ' Candidates include a higher-ranked span inside it or a reporting-tree ancestor. The holder cannot cover their own absence; peers are never offered and a lower rank is refused with the reason printed (Jaques 1956; Aghion & Tirole 1997).'),
        h('li', null, h('strong', null, 'One declaration, one transaction.'), ' The cover, its `prepares-for` edge, the governed decision naming the consequence and one `rolls-up-to` edge per ancestor all commit atomically through the shared spine.')),
    }),
  );
}

function registerPanel(ctx, report) {
  const rows = report.rows;
  if (!rows.length) return card({ title: 'Nothing to register', body: emptyState({ title: 'No declared duty line', body: 'Declare an operating seat to populate the duty register.' }) });
  return h('div', { class: 'stack' },
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
        rows,
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
          stat({ label: 'Covers per duty', value: '3', hint: 'a duty is not a committee; the cap is declared, not discovered' })),
        editable
          ? h('div', { class: 'row-actions' },
            h('button', {
              class: 'btn btn-small', type: 'button',
              onClick: () => {
                const form = buildForm([
                  { name: 'dutyCoverageExerciseDays', label: 'Exercise window (days)', type: 'number', min: 7, max: 180, value: conventions.dutyCoverageExerciseDays },
                  { name: 'dutyCoverageConcentrationPct', label: 'Concentration threshold (%)', type: 'number', min: 50, max: 100, value: conventions.dutyCoverageConcentrationPct },
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
                        const result = ctx.api.dutyCoverageSetConventions({ dutyCoverageExerciseDays: Number(v.dutyCoverageExerciseDays), dutyCoverageConcentrationPct: Number(v.dutyCoverageConcentrationPct) });
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
