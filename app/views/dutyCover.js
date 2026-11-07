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

const PANELS = DUTY_COVERAGE_PANELS;
const CSV_COLUMNS = ['row_kind', 'scope', 'altitude', 'duty_key', 'band', 'open_n',
  'covers_declared_n', 'covers_eligible_n', 'covers_exercised_n', 'candidates_eligible_n',
  'candidates_refused_n', 'concentration_top_share_pct', 'sole_handed', 'window_days', 'refused_reason'];

let apiRef = null;

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
