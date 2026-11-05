/**
 * app/views/differencing.js — `#/differencing`, the Differencing Defender
 * (ADR-0092).
 *
 * Five panels, five different questions, one measurement:
 *   Desk        "What does publishing this aggregate actually disclose?"
 *   Register    "What has this span published, release by release?"
 *   Determined  "Which withheld value does the arithmetic hand back — and by what proof?"
 *   Rhythm      "Is the publication RHYTHM the leak, rather than this table?"
 *   Certificate "What can go into a board pack without publishing a person?"
 *
 * Nothing on this screen prints a determined value as a figure. A recovery is a
 * COORDINATE (which span, which measure) and a PROOF (how many equations pin it).
 * That is deliberate: a screen that printed the number would become the disclosure
 * it is warning about.
 */
import { h, toast, openModal } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import { dayKey } from '../core/time.js';
import { manifestFor } from '../core/domain/disclosureManifests.js';
import { DIFFERENCING_VERDICT_META, DIFFERENCING_EXPOSURES } from '../core/domain/differencingRegistry.js';

const PANELS = [
  { key: 'desk', label: 'Desk' },
  { key: 'register', label: 'Register' },
  { key: 'determined', label: 'Determined' },
  { key: 'rhythm', label: 'Rhythm' },
  { key: 'certificate', label: 'Certificate' },
];

const CSV_COLUMNS = [
  'row_kind', 'route', 'label', 'releases_n', 'windowed_n', 'safe_n', 'protected_n',
  'recovered_n', 'withheld_n', 'equation_n', 'inconsistent_n', 'last_released_on',
  'drift_points', 'drift_refused', 'runs_p_value', 'range_statistic', 'direction',
];

const panelFor = (q) => {
  const p = q?.get?.('panel');
  return PANELS.some((item) => item.key === p) ? p : 'desk';
};
const go = (ctx, panel) => ctx.navigate(`#/differencing?panel=${panel}`);
const toneFor = (verdict) => DIFFERENCING_VERDICT_META[verdict]?.tone || 'neutral';
const verdictBadge = (verdict) => badge(
  DIFFERENCING_VERDICT_META[verdict]?.label || verdict,
  toneFor(verdict),
  DIFFERENCING_VERDICT_META[verdict]?.meaning || '',
);
const pct = (value) => (value === null || value === undefined ? 'withheld' : `${value}%`);

function notify(result, message) {
  if (!result?.ok) {
    toast(result?.error || 'The publication action was refused.', 'bad');
    return false;
  }
  toast(result.warning || message, result.warning ? 'bad' : 'good');
  return true;
}

function exportCsv(ctx) {
  const result = ctx.api.differencesCsvRows();
  if (!result.ok) return toast(result.error, 'bad');
  const text = serializeCsv(CSV_COLUMNS, result.rows);
  const filename = `leados-differencing-${dayKey(ctx.now)}.csv`;
  if (!downloadText({ filename, text, mime: 'text/csv' })) {
    openModal({
      title: 'Copy publication register CSV',
      body: h('textarea', { rows: 16, readonly: true, value: text, class: 'input', 'aria-label': 'Publication register CSV' }),
    });
  }
}

function exportBrief(ctx) {
  const result = ctx.api.differencesBriefText();
  if (!result.ok) return toast(result.error, 'bad');
  const filename = `leados-differencing-${dayKey(ctx.now)}.md`;
  if (!downloadText({ filename, text: result.text, mime: 'text/markdown' })) {
    openModal({
      title: 'Copy differencing brief',
      body: h('textarea', { rows: 16, readonly: true, value: result.text, class: 'input', 'aria-label': 'Differencing brief' }),
    });
  }
}

/** The publish planner: pick a module, read the verdict, publish the reduction. */
function openPublishDialog(ctx, report) {
  // Only modules with an adaptive manifest and a real published surface can be
  // registered. A list built from the register would only ever offer modules that
  // have already been published, which is how a safe default becomes a dead end.
  const candidates = report.routes.length
    ? [...new Set(report.routes.map((row) => row.route))]
    : ['cases', 'decisions', 'delegations', 'goals', 'oneonones', 'conflicts'];
  const select = h('select', { class: 'input', 'aria-label': 'Module to publish' },
    ...candidates.map((route) => h('option', { value: route }, manifestFor(route)?.label || route)));
  const preview = h('div', { class: 'stack', 'aria-live': 'polite' });
  let dialog = null;

  const renderPlan = () => {
    preview.replaceChildren();
    const plan = ctx.api.differencesPlan({ route: select.value });
    if (!plan || !plan.ok) {
      preview.append(banner({
        tone: plan?.refused ? 'bad' : 'warn',
        title: plan?.refused ? 'This publication is refused' : 'No plan is available',
        body: plan?.error || 'The plan could not be built for this module.',
      }));
      if (plan?.remedy) preview.append(h('p', { class: 'muted' }, plan.remedy));
      return;
    }
    const rows = (plan.attempts || []).map((attempt) => ({
      pattern: attempt.described,
      recoveredN: attempt.recoveredN,
      withheldCells: attempt.withheldCells,
      withheldTotals: (attempt.withheldTotals || []).join(', ') || '—',
      chosen: false,
    }));
    preview.append(
      h('div', { class: 'stat-grid' },
        stat({ label: 'Verdict', value: verdictBadge(plan.verdict) }),
        stat({ label: 'Cells', value: String((plan.cells || []).length), hint: `${(plan.cells || []).filter((c) => c.state === 'printed').length} printed` }),
        stat({ label: 'Register', value: String(plan.conventions.differencesWindowReleases), hint: 'prior releases audited' }),
        stat({ label: 'Equations', value: String(plan.equationN || 0), hint: 'in the exact system' }),
      ),
      h('p', { class: 'muted' }, plan.determinacy || ''),
      plan.removals && plan.removals.length
        ? banner({
          tone: 'info',
          title: `This publication was reduced by ${plan.removals.length} step(s) to stay unrecoverable`,
          body: plan.removals.map((row) => row.why).join(' '),
        })
        : banner({ tone: 'good', title: 'Nothing needed to be withheld beyond the aggregate\'s own floor', body: 'Publishing this release determines no withheld value, on its own or against the register.' }),
      h('h3', { class: 'card-title' }, 'Patterns considered, cheapest first'),
      table({
        caption: 'Suppression patterns considered for this publication',
        columns: [
          { label: 'Pattern', render: (row) => row.pattern },
          { label: 'Values it would determine', render: (row) => (row.recoveredN ? badge(String(row.recoveredN), 'bad') : badge('none', 'good')) },
          { label: 'Cells withheld', render: (row) => String(row.withheldCells) },
          { label: 'Totals withheld', render: (row) => row.withheldTotals },
        ],
        rows,
        emptyMessage: 'No pattern was considered.',
      }),
      plan.exposures && plan.exposures.length
        ? h('div', { class: 'stack' },
          h('h3', { class: 'card-title' }, 'Differencing channels open on this publication'),
          ...plan.exposures.map((row) => banner({ tone: 'warn', title: row.label, body: row.detail })))
        : null,
    );
  };

  select.addEventListener('change', renderPlan);
  dialog = openModal({
    title: 'Publish a module aggregate',
    description: 'The plan is computed against every release already in the register, at every seat and in every module. It picks the cheapest suppression pattern that determines nothing, and refuses the publication when no pattern can.',
    body: h('div', { class: 'stack' },
      h('label', { class: 'field' }, h('span', null, 'Module'), select),
      preview),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Close'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const result = ctx.api.differencesPublish({ route: select.value });
          if (!result.ok) {
            // A refusal is a real outcome and must be readable, not a toast that
            // vanishes. Keep the dialog open and print the remedy beside the proof.
            renderPlan();
            preview.prepend(banner({
              tone: 'bad',
              title: result.refused ? 'Publication refused' : 'Publication failed',
              body: result.error,
            }));
            if (result.remedy) preview.append(banner({ tone: 'info', title: 'Structural remedy', body: result.remedy }));
            toast(result.refused ? 'Refused: no suppression pattern makes this publication safe.' : (result.error || 'Publication failed.'), 'bad');
            return;
          }
          dialog.close();
          if (notify(result, `Published the ${manifestFor(select.value)?.label || select.value} aggregate (${result.verdict}).`)) ctx.refresh();
        },
      }, 'Publish'),
    ],
    size: 'lg',
  });
  renderPlan();
}

/* -------------------------------------------------------------------- panels */

function deskPanel(ctx, report) {
  const playbook = report.playbook;
  const coverage = report.coverage;
  return h('div', { class: 'stack' },
    banner({
      tone: report.summary.determinedRoutesN ? 'bad' : 'good',
      title: report.summary.determinedRoutesN
        ? `${report.summary.determinedRoutesN} module(s) publish a surface a reader can subtract back out`
        : 'No registered publication determines a withheld value',
      body: report.summary.determinedRoutesN
        ? 'The figures were never printed. They are recoverable from the totals that were, which is the same disclosure with a longer proof. Each finding is a governed decision, not a rating.'
        : 'Exact integer arithmetic over every published total in the window recovers nothing the workspace withheld.',
    }),
    h('div', { class: 'stat-grid' },
      stat({ label: 'Register', value: String(report.summary.releasesN), hint: `${report.summary.routesN} module(s)` }),
      stat({ label: 'Provably safe', value: pct(coverage.pct), hint: coverage.refused ? 'withheld below the floor' : `Wilson 95% ${coverage.lowPct}–${coverage.highPct}%` }),
      stat({ label: 'Protected', value: String(report.summary.protectedN), hint: 'published a reduced version' }),
      stat({ label: 'Determined', value: String(report.summary.determinedRoutesN), tone: report.summary.determinedRoutesN ? 'bad' : '', hint: 'module(s) leaking by subtraction' }),
    ),
    card({
      title: playbook.title,
      subtitle: `${playbook.horizon} · what this altitude is competent to decide`,
      body: h('div', { class: 'stack' },
        h('p', null, h('strong', null, 'The question. '), playbook.question),
        h('p', null, h('strong', null, 'What you see. '), playbook.see),
        h('p', null, h('strong', null, 'What you do. '), playbook.act),
        h('p', { class: 'muted' }, h('strong', null, 'What you hand upward. '), playbook.hand),
        h('div', { class: 'form-actions' },
          h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openPublishDialog(ctx, report) }, 'Plan a publication'),
          h('button', {
            class: 'btn btn-ghost',
            type: 'button',
            onClick: () => {
              const result = ctx.api.differencesScan();
              if (notify(result, 'Re-audited the publication register.')) ctx.refresh();
            },
          }, 'Re-audit the register'),
        ),
      ),
    }),
    report.summary.decisionsN
      ? card({
        title: `Open publication-integrity decisions (${report.summary.decisionsN})`,
        subtitle: 'Opened by RULE-DFR-02/04 on the shared rule spine. The engine never closes one: a person signs it off.',
        body: table({
          caption: 'Open publication-integrity decisions',
          columns: [
            { label: 'Decision', render: (row) => row.title },
            { label: 'Opened', render: (row) => row.openedOn || '—' },
            { label: 'Status', render: (row) => badge(row.status || 'open', 'warn') },
          ],
          rows: report.openDecisions,
          emptyMessage: 'No publication-integrity decision is open.',
        }),
      })
      : null,
    card({
      title: 'The five channels this measures',
      subtitle: 'Named, because an unnamed channel is a guess. Each is a real arithmetic exposure, not a metaphor.',
      body: h('div', { class: 'stack' },
        ...DIFFERENCING_EXPOSURES.map((row) => h('div', { class: 'stack' },
          h('p', null, h('strong', null, row.label), ' — ', row.detail),
          h('p', { class: 'muted' }, h('strong', null, 'Remedy. '), row.remedy)))),
    }),
  );
}

function registerPanel(ctx, report) {
  return h('div', { class: 'stack' },
    card({
      title: 'Published releases',
      subtitle: 'What this span has actually published. A register entry is what went out, not what was considered.',
      body: table({
        caption: 'Registered publications',
        columns: [
          { label: 'Module', render: (row) => row.label },
          { label: 'Published', render: (row) => row.releasedOn },
          { label: 'Verdict', render: (row) => badge(row.verdictLabel, row.tone, DIFFERENCING_VERDICT_META[row.verdict]?.meaning || '') },
          { label: 'Cells', render: (row) => `${row.cellsN} (${row.withheldN} withheld)` },
          { label: 'Totals withheld', render: (row) => (row.withheldTotals.length ? row.withheldTotals.join(', ') : '—') },
          { label: 'Audit', render: (row) => `${row.equationN} equation(s)` },
        ],
        rows: report.releases,
        emptyMessage: 'Nothing has been published from this span yet. An empty register is not a safety claim.',
      }),
    }),
    card({
      title: 'Coverage',
      subtitle: 'The share of registered releases that provably determine nothing — with its interval, and withheld below the floor.',
      body: h('div', { class: 'stack' },
        h('p', null, report.coverage.refused
          ? `Provably safe publications: WITHHELD. ${report.coverage.refusedReason}`
          : `Provably safe publications: ${report.coverage.k} of ${report.coverage.n} (${report.coverage.pct}%, Wilson 95% ${report.coverage.lowPct}–${report.coverage.highPct}%).`),
        h('p', { class: 'muted' }, 'A share computed over two releases would be a confident percentage of two. The floor exists so the screen refuses rather than flatters.'),
      ),
    }),
  );
}

function determinedPanel(ctx, report) {
  const leaking = report.routes.filter((row) => row.recoveredN > 0);
  return h('div', { class: 'stack' },
    banner({
      tone: leaking.length ? 'bad' : 'good',
      title: leaking.length ? `${leaking.length} module(s) determine a withheld value` : 'Nothing is determined by arithmetic',
      body: leaking.length
        ? 'A determined value is reported as a coordinate and a proof, never as the number. The screen must not become the disclosure it is warning about.'
        : 'No withheld value in the register is recoverable from the published totals, at any seat, in any module, across the audited window.',
    }),
    ...report.routes.map((row) => card({
      title: row.label,
      subtitle: `${row.releases} release(s), ${row.equationN} published equation(s) audited, ${row.withheldN} withheld value(s)`,
      actions: [row.recoveredN ? badge(`${row.recoveredN} determined`, 'bad') : badge('nothing determined', 'good')],
      body: h('div', { class: 'stack' },
        h('p', null, row.determinacy),
        row.recovered.length
          ? table({
            caption: `${row.label} determined coordinates`,
            columns: [
              { label: 'Span', render: (item) => item.cellKey },
              { label: 'Measure', render: (item) => item.measureLabel },
              { label: 'Proof', render: (item) => `${item.sources} equation(s) pin this exactly` },
              { label: 'Value', render: () => badge('not printed', 'warn', 'Deliberately omitted: printing it here would be the disclosure this screen reports') },
            ],
            rows: row.recovered,
            emptyMessage: 'Nothing determined.',
          })
          : null,
        row.inconsistentN
          ? banner({ tone: 'bad', title: `${row.inconsistentN} published total(s) disagree with the cells under them`, body: 'The register is not reasoned about exactly until that is corrected by hand. The screen withholds rather than resolving by guessing which end is wrong.' })
          : null,
      ),
    })),
    report.crossAltitude.length
      ? card({
        title: `Same-day cross-altitude pairs (${report.crossAltitude.length})`,
        subtitle: 'A module published twice on one day from different seats. This exposure needs no repeat in time at all — the sibling is whatever the two totals leave over.',
        body: table({
          caption: 'Cross-altitude publication pairs',
          columns: [
            { label: 'Module', render: (row) => row.label },
            { label: 'Day', render: (row) => row.day },
            { label: 'Seats', render: (row) => String(row.seats) },
            { label: 'Determined', render: (row) => (row.recoveredN ? badge(String(row.recoveredN), 'bad') : badge('none', 'good')) },
            { label: 'Coordinates', render: (row) => (row.recovered.length ? row.recovered.map((item) => `${item.cellKey} · ${item.measure}`).join('; ') : '—') },
          ],
          rows: report.crossAltitude,
          emptyMessage: 'No module was published twice on one day from different seats.',
        }),
      })
      : null,
  );
}

function rhythmPanel(ctx, report) {
  return h('div', { class: 'stack' },
    banner({
      tone: 'info',
      title: 'A suppression pattern cannot fix a reprinted stock',
      body: 'Reprinting the same total over time hands a reader the movement between the dates, whatever the cells say. This panel separates "this table is unsafe" from "this publication RHYTHM is unsafe", because the remedies are different.',
    }),
    ...report.routes.map((row) => {
      const drift = row.drift || {};
      return card({
        title: row.label,
        subtitle: `${row.releases} published total(s) registered`,
        actions: [drift.refused
          ? badge('not tested', 'neutral', drift.reason || '')
          : (drift.runs?.drift || drift.range?.shift ? badge('non-stationary', 'bad') : badge('stationary', 'good'))],
        body: h('div', { class: 'stack' },
          h('p', null, drift.refused ? drift.reason : drift.reason),
          drift.refused
            ? h('p', { class: 'muted' }, `Counting a trend from ${drift.points} point(s) would be a figure resting on nothing. The test waits for ${drift.minPoints}.`)
            : table({
              caption: `${row.label} stationarity tests`,
              columns: [
                { label: 'Test', render: (item) => item.test },
                { label: 'Statistic', render: (item) => item.statistic },
                { label: 'Reading', render: (item) => item.reading },
              ],
              rows: [
                {
                  test: 'Wald–Wolfowitz runs about the median',
                  statistic: drift.runs?.runs === null ? '—' : `${drift.runs?.runs} run(s), expected ${drift.runs?.expected}`,
                  reading: drift.runs?.pValue === null || drift.runs?.pValue === undefined ? '—' : (drift.runs.pValue < 0.05 ? `clustered, p=${drift.runs.pValue}` : `no clustering, p=${drift.runs.pValue}`),
                },
                {
                  test: 'Buishand range (level shift)',
                  statistic: drift.range?.statistic === null ? '—' : `${drift.range?.scaled} (5% bound ${drift.range?.threshold})`,
                  reading: drift.range?.shift ? 'level shift detected' : 'no level shift detected',
                },
                {
                  test: 'Direction over the window',
                  statistic: `${drift.direction} by ${drift.delta}`,
                  reading: 'first published total to last',
                },
              ],
            }),
        ),
      });
    }),
    !report.routes.length ? emptyState({ title: 'Nothing has been published yet', body: 'A drift diagnosis needs a series. Publish a few releases and the rhythm test begins.' }) : null,
  );
}

function certificatePanel(ctx, report) {
  return h('div', { class: 'stack' },
    card({
      title: 'What may go into a board pack',
      subtitle: 'A dated, aggregate-only statement. No span name, no person, no title, no amount.',
      body: h('div', { class: 'stack' },
        h('p', null, `${dayKey(ctx.now)} — ${report.seat?.label || 'Operator view'}. ${report.coverage.refused
          ? `Provably safe publications: WITHHELD. ${report.coverage.refusedReason}`
          : `Provably safe publications: ${report.coverage.k} of ${report.coverage.n} registered release(s) (${report.coverage.pct}%, Wilson 95% ${report.coverage.lowPct}–${report.coverage.highPct}%).`}`),
        h('p', null, report.summary.determinedRoutesN
          ? `${report.summary.determinedRoutesN} module(s) currently publish a surface an exact integer audit can subtract a withheld value back out of. Those findings are governed decisions, not ratings of anyone.`
          : 'No module currently publishes a surface from which a withheld value is exactly recoverable by subtraction.'),
        h('p', { class: 'muted' }, report.premise),
        h('div', { class: 'form-actions' },
          h('button', { class: 'btn btn-primary', type: 'button', onClick: () => exportBrief(ctx) }, 'Download brief (Markdown)'),
          h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => exportCsv(ctx) }, 'Download aggregate CSV'),
        ),
      ),
    }),
    card({
      title: 'Boundary statement',
      body: h('ul', { class: 'stack' },
        h('li', null, report.disclosure.local),
        h('li', null, report.disclosure.register),
        h('li', null, report.disclosure.determinacy),
        h('li', null, report.disclosure.people),
        h('li', null, report.disclosure.engine)),
    }),
  );
}

export function renderDifferencing(ctx) {
  const panel = panelFor(ctx.query);
  const report = ctx.api.differencesRead();
  if (!report?.ok) {
    return h('div', { class: 'stack' }, emptyState({ title: 'The publication register could not be built', body: report?.error || 'No report is available.' }));
  }
  const body = panel === 'desk'
    ? deskPanel(ctx, report)
    : panel === 'register'
      ? registerPanel(ctx, report)
      : panel === 'determined'
        ? determinedPanel(ctx, report)
        : panel === 'rhythm'
          ? rhythmPanel(ctx, report)
          : certificatePanel(ctx, report);

  return h('div', { class: 'stack' },
    pageHeader({
      eyebrow: 'Disclosure control',
      title: 'Differencing defender',
      subtitle: 'A table can be safe while a SERIES of tables is not. This audits every published aggregate as one integer system across releases, seats and modules — and proves no withheld value can be subtracted back out.',
      actions: [
        badge(`${report.summary.releasesN} release(s)`, 'neutral', 'Publications in this span\'s register'),
        report.summary.determinedRoutesN
          ? badge(`${report.summary.determinedRoutesN} module(s) determined`, 'bad', 'A withheld value is exactly recoverable by arithmetic')
          : badge('nothing determined', 'good'),
      ],
      meta: h('p', { class: 'muted' }, report.premise),
    }),
    tabs({ items: PANELS.map((item) => ({ key: item.key, label: item.label })), active: panel, onSelect: (key) => go(ctx, key), ariaLabel: 'Differencing panels' }),
    body,
  );
}
