/**
 * app/views/diligence.js — `#/diligence`, the Diligence Ledger (ADR-0104).
 *
 * Six panels, six questions:
 *   Desk          "What is this altitude supposed to do about the frontier?"
 *   Knowable set  "Which dated facts existed when I decided, and did I look?"
 *   Class cells   "Which evidence classes do we systematically walk past?"
 *   Forecasts     "Was my own process prediction better than a coin?"
 *   Findings      "What governed work did the spine open, and how is it bounded?"
 *   Conventions   "What is declared, clamped and printed — and what is refused?"
 *
 * This screen never rates a person, never asks how anyone feels and never prints
 * a raw consultation reason above the manager altitude. A refused cell is BLANK,
 * never zero. Above its disclosure ceiling the shell serves the compiled span
 * aggregate instead of this screen (ADR-0086), so no raw fact pointer ever
 * reaches a seat it was not scoped for.
 */
import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import {
  CONSULT_DISPOSITIONS,
  DILIGENCE_BOUNDS,
  DILIGENCE_PANELS,
  EVIDENCE_CLASSES,
  EVIDENCE_CLASS_KEYS,
  GRADE_VERDICTS,
} from '../core/domain/diligenceRegistry.js';

const PANELS = DILIGENCE_PANELS;

const CSV_COLUMNS = ['row_kind', 'scope', 'checklists_n', 'settled_n', 'open_n', 'knowable_n',
  'consulted_n', 'unconsulted_n', 'coverage_pct', 'lo_pct', 'hi_pct', 'band',
  'class_key', 'dark', 'graded_n', 'claims_n', 'brier', 'base_brier', 'skill',
  'verdict', 'refused', 'reason_code', 'altitude'];

let apiRef = null;

const panelFor = (query) => {
  const key = query?.get?.('panel');
  return PANELS.some((item) => item.key === key) ? key : 'desk';
};
const go = (ctx, panel, extra = '') => ctx.navigate(`#/diligence?panel=${panel}${extra}`);
const num = (value) => (value === null || value === undefined || value === '' ? '—' : String(value));
const pctText = (value) => (value === null || value === undefined ? 'refused' : `${value}%`);

function notify(result, message) {
  if (!result?.ok) {
    toast(result?.error || 'The diligence action was refused.', 'bad');
    return false;
  }
  toast(result.warning || message, result.warning ? 'bad' : 'good');
  return true;
}

function exportCsv() {
  const result = apiRef?.diligenceCsvRows?.();
  if (!result?.ok) { toast(result?.error || 'The diligence export was refused.', 'bad'); return; }
  downloadText({
    filename: `leados-diligence-${new Date().toISOString().slice(0, 10)}.csv`,
    text: serializeCsv({ columns: CSV_COLUMNS.map((key) => ({ key, header: key })), rows: result.rows }),
    mime: 'text/csv',
  });
}

function copyBrief(ctx) {
  const brief = ctx.api.diligenceBriefText?.();
  const text = brief?.text || '';
  if (!text) { toast('No brief is available yet.', 'bad'); return; }
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => toast('Upward brief copied.', 'good')).catch(() => toast('Could not copy — use the brief panel instead.', 'warn'));
  } else toast('Clipboard unavailable — the brief is on the desk panel.', 'warn');
}

const bandBadge = (key) => {
  if (key === 'refused') return badge('refused', 'neutral', 'Below the knowable floor — no rate is printed');
  if (key === 'sound') return badge('sound', 'good', 'At or above 75% of the knowable set consulted');
  if (key === 'partial') return badge('partial', 'warn', 'Between 40% and 75% consulted');
  return badge('thin', 'bad', 'Under 40% of the frozen knowable set was consulted');
};

/* ---------------------------------------------------------------- desk */

function deskPanel(ctx, report) {
  const s = report.summary;
  const brief = ctx.api.diligenceBriefText?.();
  return h('div', { class: 'stack' },
    card({
      title: `This altitude's question — ${report.seat.label}`,
      subtitle: report.seat.playbook,
      body: h('div', { class: 'stat-grid' },
        stat({ label: 'Frozen frontiers', value: String(s.checklistsN), hint: `${s.settledN} settled · ${s.openN} open` }),
        stat({ label: 'Knowable facts', value: String(s.knowableN), hint: `${s.consultedN} consulted · ${s.unconsultedN} never opened` }),
        stat({ label: 'Consulted coverage', value: pctText(s.coveragePct), tone: s.refused ? '' : (s.coveragePct >= report.conventions.diligenceCoverageFloorPct ? 'good' : 'bad'), hint: s.refused ? `Refused below the floor of ${report.conventions.diligenceKnowableFloor} knowable facts` : `Wilson 95% ${s.loPct}–${s.hiPct}%` }),
        stat({ label: 'Thin settled calls', value: String(s.thinN), tone: s.thinN ? 'bad' : '', hint: `Settled decisions below the ${report.conventions.diligenceCoverageFloorPct}% diligence floor` }),
        stat({ label: 'Dark classes', value: String(s.darkN), tone: s.darkN ? 'bad' : '', hint: `${report.cells.measurableN} of ${report.cells.rows.length} classes are measurable` }),
        stat({ label: 'Forecast skill', value: num(s.pooledSkill), tone: Number.isFinite(s.pooledSkill) && s.pooledSkill < 0 ? 'bad' : '', hint: `${s.gradedN} process forecast(s) graded once, out of sample` })),
    }),
    s.refused ? banner({
      tone: 'warn', title: 'A coverage rate is refused, not estimated',
      body: `Only ${s.knowableN} knowable fact(s) are frozen in scope against a declared floor of ${report.conventions.diligenceKnowableFloor}. At that sample any rate is a coin flip, so the ledger prints the floor it refused to cross instead of a number.`,
    }) : null,
    card({
      title: 'The identity-free upward brief',
      subtitle: 'Counts, the direction of the gap, and every refusal named. Safe to carry upward unchanged.',
      body: h('pre', { class: 'brief-block' }, brief?.text || 'No brief available.'),
      actions: [h('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => copyBrief(ctx) }, 'Copy brief')],
    }),
    card({
      title: 'Why this is not a checklist app',
      body: h('ul', { class: 'plain-list' },
        h('li', null, h('strong', null, 'The knowable set is frozen at decision time.'), ' RULE-DLG-01 harvests dated pointers from five evidence classes other modules own, in the same transaction as the decision, so coverage cannot drift as the workspace grows.'),
        h('li', null, h('strong', null, 'Ruling a fact out WITH A REASON counts as diligence.'), ' The Hindsight Lock can only see a link that was made and charges everything else as missed; this ledger records the judgement itself.'),
        h('li', null, h('strong', null, 'Wilson (1927), Jeffreys (1946) and Brier (1950).'), ' A Wilson interval on coverage, an exact Beta(½,½) credible interval on class inattention, and once-only Brier skill against a strictly-prior base rate. Names, not vibes.'),
        h('li', null, h('strong', null, 'Vertical roll-up is the same engine.'), ' One `rolls-up-to` edge per leadership ancestor is written in the SAME atomic write that freezes the frontier — altitude is a dimension of the shared spine, not a second system.')),
    }),
  );
}

/* ------------------------------------------------------- knowable set */

function consultDialog(ctx, checklist, fact) {
  const form = buildForm([
    { name: 'disposition', label: 'What did you do with this fact?', type: 'select', value: 'used', help: '"Ruled out with a reason" counts as diligence: you looked, then judged.', options: Object.entries(CONSULT_DISPOSITIONS).map(([value, meta]) => ({ value, label: meta.label })) },
    { name: 'reason', label: 'Reason (required when ruling out)', type: 'textarea', value: '', help: 'One line. Why was it read, used, dismissed or deferred?', rows: 3 },
  ]);
  openModal({
    title: `Consult a ${fact.evidenceClass} fact`,
    description: `Dated ${fact.evidencesOn}. This fact was frozen in the knowable set of the decision on ${checklist.decisionOn}.`,
    body: h('div', { class: 'stack' }, form.node),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const values = form.getValues();
          const result = ctx.api.diligenceConsult({ checklistId: checklist.id, sourceType: fact.sourceType, sourceId: fact.sourceId, disposition: values.disposition, reason: values.reason });
          if (!notify(result, 'Consultation recorded.')) return;
          closeAllModals();
          ctx.refresh();
        },
      }, 'Record the consultation'),
    ],
  });
}

function forecastDialog(ctx, checklist) {
  const form = buildForm([
    { name: 'classes', label: 'Which evidence classes do you expect to consult?', type: 'boolean-block', value: [], help: 'Declared BEFORE the decision settles. Graded once, out of sample, after it does.', options: EVIDENCE_CLASS_KEYS.map((key) => ({ value: key, label: EVIDENCE_CLASSES[key].label })) },
    { name: 'confidencePct', label: 'Confidence (%)', type: 'number', min: 1, max: 99, value: 70, help: 'Your probability that you will consult them AND reach the declared diligence floor.' },
  ]);
  openModal({
    title: 'Pre-register a process forecast',
    description: `Frozen against the frontier of the ${checklist.decisionOn} decision. It cannot be edited after the outcome — a forecast declared after the fact is a memory.`,
    body: h('div', { class: 'stack' }, form.node),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const values = form.getValues();
          const result = ctx.api.diligenceForecast({ checklistId: checklist.id, classes: values.classes, confidencePct: Number(values.confidencePct) });
          if (!notify(result, 'Process forecast frozen.')) return;
          closeAllModals();
          ctx.refresh();
        },
      }, 'Freeze the forecast'),
    ],
  });
}

function frontierPanel(ctx, report) {
  const rows = report.ledger;
  if (!rows.length) {
    return card({
      title: 'No frozen frontier yet',
      body: emptyState({ title: 'Decide something', body: 'RULE-DLG-01 freezes a knowable set for every decision on the shared spine, in the same transaction that records the call. Add a decision, or run an explicit scan.' }),
    });
  }
  const wanted = ctx.query?.get?.('frontier');
  const selected = rows.find((row) => row.id === wanted) || rows.find((row) => row.status === 'open') || rows[0];
  const consulted = new Set(selected.consultedKeys || []);
  const factRows = (selected.facts || []).map((fact) => ({ ...fact, key: `${fact.sourceType}:${fact.sourceId}`, done: consulted.has(`${fact.sourceType}:${fact.sourceId}`) }));
  return h('div', { class: 'stack' },
    card({
      title: 'Frozen diligence frontiers',
      subtitle: 'One per decision. The knowable set is frozen on the decision date and never re-harvested.',
      body: table({
        caption: 'Frozen diligence frontiers',
        columns: [
          { label: 'Decision date', render: (row) => h('a', { href: `#/diligence?panel=frontier&frontier=${encodeURIComponent(row.id)}` }, row.decisionOn) },
          { label: 'State', render: (row) => badge(row.status, row.status === 'settled' ? 'neutral' : 'warn', '') },
          { label: 'Knowable', render: (row) => String(row.knowableN) },
          { label: 'Consulted', render: (row) => String(row.consultedN) },
          { label: 'Coverage', render: (row) => row.refused ? h('span', { class: 'muted' }, 'refused') : `${row.coveragePct}%` },
          { label: 'Frontier', render: (row) => bandBadge(row.band) },
          { label: 'Forecast', render: (row) => row.forecast ? badge('frozen', 'neutral', 'A pre-decision process forecast is frozen') : h('span', { class: 'muted' }, 'none') },
        ],
        rows,
        emptyMessage: 'No frontiers in scope.',
      }),
    }),
    card({
      title: `Knowable set · decision ${selected.decisionOn}`,
      subtitle: `${selected.knowableN} dated facts from five evidence classes were available on the decision date. No titles or notes are copied — only pointers.`,
      actions: [
        selected.forecast
          ? badge(`${selected.forecast.confidencePct}% forecast frozen ${selected.forecast.declaredOn}`, 'neutral', '')
          : (!selected.settled ? h('button', { class: 'btn btn-small', type: 'button', onClick: () => forecastDialog(ctx, selected) }, 'Pre-register a process forecast') : null),
        h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => notify(ctx.api.diligenceScan(), 'Scan complete.') || ctx.refresh() }, 'Scan'),
      ].filter(Boolean),
      body: selected.refused
        ? banner({ tone: 'info', title: 'Coverage is refused for this frontier', body: selected.reason })
        : h('div', { class: 'stack' },
          h('p', { class: 'muted' }, `Consulted ${selected.consultedN} of ${selected.knowableN} knowable facts · ${selected.usedN} used · ${selected.ruledOutN} ruled out with a reason · ${selected.deferredN} deferred · ${selected.unconsultedN} never opened. Wilson 95% interval ${num(selected.loPct)}–${num(selected.hiPct)}%.`),
          table({
            caption: 'The frozen knowable set',
            columns: [
              { label: 'Evidence class', render: (row) => h('div', { class: 'stack-tight' }, h('strong', null, EVIDENCE_CLASSES[row.evidenceClass]?.label || row.evidenceClass), h('span', { class: 'muted' }, EVIDENCE_CLASSES[row.evidenceClass]?.discipline || '')) },
              { label: 'Dated', render: (row) => row.evidencesOn },
              { label: 'Severity', render: (row) => String(row.severity) },
              { label: 'Looked at', render: (row) => row.done ? badge('consulted', 'good', '') : badge('unconsulted', 'bad', 'No consultation has been recorded for this fact') },
              { label: 'Action', render: (row) => row.done ? h('span', { class: 'muted' }, 'recorded once') : h('button', { class: 'btn btn-tiny btn-primary', type: 'button', onClick: () => consultDialog(ctx, selected, row) }, 'Consult') },
            ],
            rows: factRows,
            emptyMessage: 'No dated facts were knowable on the decision date.',
          })),
    }),
  );
}

/* --------------------------------------------------------- class cells */

function cellsPanel(ctx, report) {
  const cells = report.cells.rows;
  return h('div', { class: 'stack' },
    card({
      title: 'Evidence-class diligence cells',
      subtitle: `Jeffreys Beta(½,½) 90% credible interval on the consulted share. A class is DARK when the whole interval sits below the declared ${report.conventions.diligenceDarkCeilingPct}% ceiling.`,
      body: table({
        caption: 'Evidence-class diligence cells',
        columns: [
          { label: 'Class', render: (row) => h('div', { class: 'stack-tight' }, h('strong', null, row.label), h('span', { class: 'muted' }, row.discipline)) },
          { label: 'Knowable', render: (row) => String(row.knowableN) },
          { label: 'Consulted', render: (row) => String(row.consultedN) },
          { label: 'Share', render: (row) => row.refused ? h('span', { class: 'muted' }, 'refused') : pctText(row.sharePct) },
          { label: 'Jeffreys 90%', render: (row) => row.refused ? h('span', { class: 'muted' }, 'refused') : `${row.loPct}–${row.hiPct}%` },
          { label: 'Reading', render: (row) => row.refused ? badge('refused', 'neutral', row.reason) : row.dark ? badge('dark', 'bad', 'Systematically unconsulted across frozen frontiers') : badge('measurable', 'good', 'Inside the declared ceiling') },
        ],
        rows: cells,
        emptyMessage: 'No class cells yet.',
      }),
    }),
    card({
      title: 'Altitude roll-up (identity-free)',
      subtitle: 'Counts by altitude only. No decision id, no person, no note and no individual consultation climbs the tree.',
      body: table({
        caption: 'Altitude diligence roll-up',
        columns: [
          { label: 'Altitude', render: (row) => h('strong', null, row.altitudeKey) },
          { label: 'Frontiers', render: (row) => String(row.checklistsN) },
          { label: 'Settled', render: (row) => String(row.settledN) },
          { label: 'Knowable', render: (row) => String(row.knowableN) },
          { label: 'Consulted', render: (row) => String(row.consultedN) },
          { label: 'Coverage', render: (row) => row.refused ? h('span', { class: 'muted' }, 'refused') : pctText(row.coveragePct) },
        ],
        rows: report.altitudes,
        emptyMessage: 'No altitude rows yet.',
      }),
    }),
  );
}

/* ---------------------------------------------------------- forecasts */

function forecastsPanel(ctx, report) {
  const grades = report.grades.rows;
  const declared = report.ledger.filter((row) => row.forecast);
  return h('div', { class: 'stack' },
    card({
      title: 'Pre-declared process forecasts',
      subtitle: 'Frozen before the decision settles. Graded exactly ONCE, out of sample, by Brier (1950) skill against a strictly-prior 0.5 base rate.',
      body: table({
        caption: 'Process forecasts and their once-only grades',
        columns: [
          { label: 'Decision', render: (row) => row.decisionOn },
          { label: 'Declared', render: (row) => row.forecast?.declaredOn || '—' },
          { label: 'Classes', render: (row) => (row.forecast?.classes || []).join(', ') || '—' },
          { label: 'Confidence', render: (row) => row.forecast ? `${row.forecast.confidencePct}%` : '—' },
          { label: 'Graded', render: (row) => row.gradedOn ? badge(`graded ${row.gradedOn}`, 'good', '') : row.gradeable ? badge('due to grade', 'warn', '') : h('span', { class: 'muted' }, 'awaiting settlement') },
        ],
        rows: declared,
        emptyMessage: 'No process forecast has been pre-registered. Open a frontier and freeze one before deciding.',
      }),
    }),
    card({
      title: 'Once-only grades',
      subtitle: report.grades.scoredN
        ? `Pooled Brier skill ${report.grades.pooledSkill}${report.grades.pooledSkill < 0 ? ' — negative, the forecasts were overconfident, printed rather than hidden' : ''}.`
        : 'No forecast has been graded yet. A grade is written once, after the decision settles.',
      body: table({
        caption: 'Once-only Brier grades',
        columns: [
          { label: 'Graded', render: (row) => row.gradedOn },
          { label: 'Claims', render: (row) => String(row.claimsN) },
          { label: 'Brier', render: (row) => num(row.brier) },
          { label: 'Base', render: (row) => num(row.baseBrier) },
          { label: 'Skill', render: (row) => num(row.skill) },
          { label: 'Verdict', render: (row) => badge(row.verdictLabel || row.verdict, row.verdict === 'worse-than-coin' ? 'bad' : row.verdict === 'better-than-coin' ? 'good' : 'neutral', GRADE_VERDICTS[row.verdict]?.note || '') },
        ],
        rows: grades,
        emptyMessage: 'No grades yet.',
      }),
    }),
  );
}

/* ----------------------------------------------------------- findings */

function findingsPanel(ctx, report) {
  return card({
    title: 'Governed findings the spine opened',
    subtitle: 'At most one deliberation-gap decision per span per ISO week, and one redesign decision per dark class per ISO week. Marker-idempotent, bounded and pausable.',
    body: table({
      caption: 'Governed diligence findings',
      columns: [
        { label: 'Kind', render: (row) => badge(row.kind === 'gap' ? 'coverage gap' : 'dark class', row.kind === 'gap' ? 'warn' : 'bad', '') },
        { label: 'Week', render: (row) => row.weekKey || '—' },
        { label: 'Recorded', render: (row) => row.recordedOn || '—' },
        { label: 'Why', render: (row) => h('span', { class: 'muted' }, row.note || 'A bounded governed finding.') },
      ],
      rows: report.findings.rows,
      emptyMessage: 'No governed findings. A thin settled frontier or a dark class opens one.',
    }),
  });
}

/* -------------------------------------------------------- conventions */

function conventionsPanel(ctx, report) {
  const conv = report.conventions;
  const fields = [
    ['diligenceKnowableFloor', 'Knowable floor', DILIGENCE_BOUNDS.diligenceKnowableFloor[0], DILIGENCE_BOUNDS.diligenceKnowableFloor[1], 'Facts required before a coverage rate is printed.'],
    ['diligenceCoverageFloorPct', 'Diligence floor (%)', DILIGENCE_BOUNDS.diligenceCoverageFloorPct[0], DILIGENCE_BOUNDS.diligenceCoverageFloorPct[1], 'A settled frontier below this opens one governed gap decision per span per week.'],
    ['diligenceClassFloor', 'Class cell floor', DILIGENCE_BOUNDS.diligenceClassFloor[0], DILIGENCE_BOUNDS.diligenceClassFloor[1], 'Facts required in a class before a Jeffreys interval is printed.'],
    ['diligenceDarkCeilingPct', 'Dark ceiling (%)', DILIGENCE_BOUNDS.diligenceDarkCeilingPct[0], DILIGENCE_BOUNDS.diligenceDarkCeilingPct[1], 'A class whose whole 90% bound sits below this is declared dark.'],
    ['diligenceGradeClaimFloor', 'Grade claim floor', DILIGENCE_BOUNDS.diligenceGradeClaimFloor[0], DILIGENCE_BOUNDS.diligenceGradeClaimFloor[1], 'Scoreable claims required before a Brier grade is written. Separate from the knowable floor: a forecast can declare at most five classes plus one coverage claim.'],
    ['diligenceForecastHorizonDays', 'Forecast horizon (days)', DILIGENCE_BOUNDS.diligenceForecastHorizonDays[0], DILIGENCE_BOUNDS.diligenceForecastHorizonDays[1], 'The declared window a process forecast is graded within.'],
    ['diligenceReviewDays', 'Review horizon (days)', DILIGENCE_BOUNDS.diligenceReviewDays[0], DILIGENCE_BOUNDS.diligenceReviewDays[1], 'The review date on every governed finding this module opens.'],
    ['diligenceStaleDays', 'Stale horizon (days)', DILIGENCE_BOUNDS.diligenceStaleDays[0], DILIGENCE_BOUNDS.diligenceStaleDays[1], 'A still-pending decision older than this cannot be graded against an outcome that never came.'],
  ];
  const form = buildForm(fields.map(([name, label, min, max, help]) => ({ name, label, type: 'number', min, max, value: conv[name], help })));
  const settings = ctx.api.diligenceSettings?.();
  return h('div', { class: 'stack' },
    card({
      title: 'What is claimed, exactly',
      body: h('ul', { class: 'plain-list' },
        h('li', null, h('strong', null, 'Wilson (1927) score interval'), ' on every consulted-share proportion; refused below the knowable floor.'),
        h('li', null, h('strong', null, 'Jeffreys Beta(½,½) posterior'), ' with an equal-tailed 90% credible interval by bisection on the regularized incomplete beta — exact, not a normal approximation.'),
        h('li', null, h('strong', null, 'Brier (1950) proper scoring'), ' with skill against a strictly-prior maximum-entropy 0.5 base rate; a negative skill is allowed and printed.'),
        h('li', null, h('strong', null, 'Jaques (1956) time-span of discretion'), ' as the altitude ladder, and ADR-0076/0086 as the ONLY roll-up and disclosure mechanisms.'),
        h('li', null, h('strong', null, 'Kahneman & Klein (2009) premortem / premortem-style pre-registration'), ' applied to the leader\'s OWN process, not to an invented risk.'),
      ),
    }),
    card({
      title: 'What is refused',
      body: h('ul', { class: 'plain-list' },
        h('li', null, report.disclosure.refusal),
        h('li', null, 'A class cell below its floor, and any suppressed cell — BLANK, never zero.'),
        h('li', null, 'A forecast declared AFTER the decision settled: hindsight is not graded as foresight.'),
        h('li', null, 'A per-person "diligence score", a composite index, and any sentiment survey. The unit is the fact, the class, the span and the frozen frontier.'),
        h('li', null, 'Locking this module\'s own governed findings: they are audit output, not operational work — the Hindsight Lock skips them.'),
      ),
    }),
    card({
      title: 'The conventions',
      subtitle: `Declared, clamped and printed — never fitted. Rank 4–5 (VP+) and a full-access seat. Engine ${settings?.engineVersion || 'diligence-ledger'}.`,
      body: h('div', { class: 'stack' },
        h('div', { class: 'field-grid' }, form.node),
        h('div', { class: 'form-actions' },
          h('button', {
            class: 'btn btn-primary', type: 'button',
            onClick: () => {
              const values = form.getValues();
              const patch = {};
              for (const [name] of fields) patch[name] = Number(values[name]);
              const result = ctx.api.diligenceSetConventions(patch);
              if (notify(result, 'Conventions re-declared.')) ctx.refresh();
            },
          }, 'Re-declare conventions'),
          h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => { const result = ctx.api.diligenceScan(); if (notify(result, 'Scan complete.')) ctx.refresh(); } }, 'Run an explicit scan'))),
    }),
    card({
      title: 'How this is stored',
      body: h('ul', { class: 'plain-list' },
        h('li', null, report.disclosure.frontier),
        h('li', null, report.disclosure.cells),
        h('li', null, report.disclosure.brief),
        h('li', null, 'Schema v106 is additive: an existing workspace starts with empty ledgers — "no frontier has been frozen here yet", a different claim from "every decision was fully diligent".'),
      ),
    }),
  );
}

/* --------------------------------------------------------------- render */

export function renderDiligence(ctx) {
  apiRef = ctx.api;
  const panel = panelFor(ctx.query);
  const report = ctx.api.diligenceReport?.();
  if (!report || report.ok === false || !report.summary) {
    return h('div', { class: 'stack' }, emptyState({ title: 'The diligence ledger could not be built', body: report?.error || 'No report is available.' }));
  }
  const body = panel === 'desk' ? deskPanel(ctx, report)
    : panel === 'frontier' ? frontierPanel(ctx, report)
      : panel === 'cells' ? cellsPanel(ctx, report)
        : panel === 'forecasts' ? forecastsPanel(ctx, report)
          : panel === 'findings' ? findingsPanel(ctx, report)
            : conventionsPanel(ctx, report);

  return h('div', { class: 'stack diligence-view' },
    pageHeader({
      eyebrow: 'Integrity · ADR-0104',
      title: 'The Diligence Ledger',
      subtitle: 'Before you decided, what was knowable — and did the organisation actually look?',
      actions: [
        badge(`${report.summary.checklistsN} frontier(s)`, 'neutral', 'One frozen knowable set per decision'),
        report.summary.refused
          ? badge('coverage refused', 'warn', 'Below the knowable floor — no rate is printed')
          : badge(`${pctText(report.summary.coveragePct)} consulted`, report.summary.coveragePct >= report.conventions.diligenceCoverageFloorPct ? 'good' : 'bad', 'Wilson-bounded consulted share over every frozen frontier'),
        report.cells.darkN ? badge(`${report.cells.darkN} dark class(es)`, 'bad', 'Systematically unconsulted evidence classes') : badge('no dark classes', 'good', 'Every measurable class is inside the declared ceiling'),
        report.summary.dueGradesN ? badge(`${report.summary.dueGradesN} grade(s) due`, 'warn', 'A settled decision with a frozen forecast awaits its once-only grade') : null,
        h('button', { class: 'btn small', type: 'button', onClick: () => { const result = ctx.api.diligenceScan(); if (notify(result, 'Scan complete.')) ctx.refresh(); } }, 'Scan'),
        h('button', { class: 'btn small', type: 'button', onClick: exportCsv }, 'Export CSV'),
        h('button', { class: 'btn small', type: 'button', onClick: () => copyBrief(ctx) }, 'Copy brief'),
      ].filter(Boolean),
      meta: h('p', { class: 'muted' }, report.premise),
    }),
    tabs({ items: PANELS.map((item) => ({ key: item.key, label: item.label })), active: panel, onSelect: (key) => go(ctx, key), ariaLabel: 'Diligence ledger panels' }),
    body,
  );
}
