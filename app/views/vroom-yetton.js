/**
 * app/views/vroom-yetton.js — `#/vroom-yetton`, the Vroom–Yetton–Jago
 * Decision-Participation Selector (ADR-0230, Schema v183, `RULE-VY-01`,
 * CSV scope #171).
 *
 * ONE reader (`buildVroomYetton`) stands behind every count, style, verdict
 * and figure on this page. Nothing here computes a sum, a state or a
 * recommendation of its own.
 *
 * Four panels: Questions (declare + answer), Selections (select style +
 * grade outcome), Method (frameworks & limits).
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import {
  VY_QUESTIONS,
  VY_PER_LINE_KEYS,
  VY_TREE_VARIANTS,
  VY_STYLES,
  VY_STYLE_KEYS,
  VY_VERDICTS,
  VY_RIGHTS,
  VY_LIMITS as L,
  VY_HREF,
  vyQuestion,
  vyStyle,
  vyVerdict,
  vyIsPerLine,
} from '../core/domain/vyRegistry.js';

const shortStyle = (key) => (VY_STYLES.find((row) => row.key === key)?.shortLabel || key);

const VIEWS = [
  { key: 'questions', label: 'Questions & Answers' },
  { key: 'selections', label: 'Styles & Grades' },
  { key: 'method', label: 'Method' },
];

/* ------------------------------------------------------------------ helpers */

function boolSelect(name, { blank = 'Not answered', value = null } = {}) {
  return h('select', { name }, [
    h('option', { value: '' }, blank),
    h('option', { value: 'true' }, 'Yes'),
    h('option', { value: 'false' }, 'No'),
  ]);
}

function moneyOrBlank(cents) {
  if (cents === null || cents === undefined) return '—';
  return String(cents);
}

/* -------------------------------------------------------------- declare dialog */

function declareDialog(ctx, onDone) {
  const form = buildForm([
    { name: 'title', label: 'Decision', type: 'text', required: true, help: '12–160 chars. Name the decision — not the project, not the vendor, the actual call that needs a participation style.' },
    { name: 'question', label: 'Decision question (one sentence)', type: 'text', required: true, help: 'What exactly is being decided, and who needs to commit to it?' },
    { name: 'treeVariant', label: 'Tree variant', type: 'select', required: true, options: VY_TREE_VARIANTS.map((v) => ({ value: v.key, label: v.label })), help: 'Time-driven minimises time to decision; development-driven develops team judgement and commitment.' },
    { name: 'lineIds', label: 'Lines the decision touches', type: 'multiselect', options: [], help: 'The reporting lines whose people are affected. A decide-alone style is unavailable where another line holds a right over any part of this decision.' },
    { name: 'reason', label: 'Written basis (≥ 24 chars)', type: 'textarea', required: true, help: 'Why this participation question is open, and what is at stake.' },
  ]);
  openFormModal({
    title: 'Declare a decision-participation question',
    submitLabel: 'Declare question',
    form,
    onSubmit(values) {
      const res = ctx.api.declareVyDecision({
        title: values.title,
        question: values.question,
        treeVariant: values.treeVariant,
        lineIds: Array.isArray(values.lineIds) ? values.lineIds : (values.lineIds ? [values.lineIds] : []),
        reason: values.reason,
      });
      if (res?.ok) {
        toast('Participation question declared. Answer the seven diagnostics next.', 'good');
        onDone?.();
      }
      return res;
    },
  });
}

/* ----------------------------------------------------------- record answers dialog */

function answersDialog(ctx, decision, onDone) {
  const perLine = VY_PER_LINE_KEYS;
  const solo = VY_SOLO_DIAGNOSTICS;
  const fields = [];

  // Solo diagnostics: answered once per decision, no line.
  for (const key of solo) {
    const q = vyQuestion(key);
    fields.push({
      name: key,
      label: `${q?.label || key} (all lines)`,
      type: 'select',
      options: [{ value: '', label: 'Not answered' }, { value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }],
      help: q?.question,
    });
  }

  // Per-line diagnostics: answered per line.
  const lineIds = decision.lineIds || [];
  for (const lineId of lineIds) {
    for (const key of perLine) {
      const q = vyQuestion(key);
      fields.push({
        name: `${key}-${lineId}`,
        label: `${q?.label || key} — line ${lineId}`,
        type: 'select',
        options: [{ value: '', label: 'Not answered' }, { value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }],
        help: q?.question,
      });
    }
  }

  if (fields.length === 0) {
    toast('This decision has no lines declared, so no per-line diagnostics can be answered. Answer the solo diagnostics instead.', 'bad');
    return;
  }

  const form = buildForm(fields);
  openFormModal({
    title: `Answer the diagnostics — ${decision.title}`,
    description: `Tree: ${VY_TREE_VARIANTS.find((v) => v.key === decision.treeVariant)?.label}. Per-line diagnostics are answered under each line the decision touches; solo diagnostics are answered once.`,
    submitLabel: 'Record answers',
    form,
    onSubmit(values) {
      const payload = { decisionId: decision.id };
      for (const key of solo) {
        const raw = values[key];
        if (raw === '' || raw === undefined || raw === null) continue;
        payload[key] = raw === 'true';
      }
      const lines = {};
      for (const lineId of lineIds) {
        const lineAnswers = {};
        for (const key of perLine) {
          const raw = values[`${key}-${lineId}`];
          if (raw === '' || raw === undefined || raw === null) continue;
          lineAnswers[key] = raw === 'true';
        }
        if (Object.keys(lineAnswers).length > 0) {
          lines[lineId] = lineAnswers;
        }
      }
      // Record one answer per line (per-line diagnostics) and one solo answer.
      // We record a single combined answer row per line that has per-line answers,
      // plus one solo row if any solo answers exist.
      let ok = true;
      let lastError = null;

      // Solo answers: one row with no lineId.
      const soloAnswers = {};
      for (const key of solo) {
        const raw = values[key];
        if (raw === '' || raw === undefined || raw === null) continue;
        soloAnswers[key] = raw === 'true';
      }
      if (Object.keys(soloAnswers).length > 0) {
        const res = ctx.api.recordVyAnswers({ decisionId: decision.id, ...soloAnswers });
        if (!res?.ok) { ok = false; lastError = res; }
      }

      // Per-line answers: one row per line.
      for (const lineId of lineIds) {
        const lineAnswers = {};
        for (const key of perLine) {
          const raw = values[`${key}-${lineId}`];
          if (raw === '' || raw === undefined || raw === null) continue;
          lineAnswers[key] = raw === 'true';
        }
        if (Object.keys(lineAnswers).length > 0) {
          const res = ctx.api.recordVyAnswers({ decisionId: decision.id, lineId, ...lineAnswers });
          if (!res?.ok) { ok = false; lastError = res; }
        }
      }

      if (!ok) {
        toast(lastError?.error || 'Answers refused.', 'bad');
        return false;
      }
      toast('Diagnostics recorded. The recommended style is re-derived on read.', 'good');
      onDone?.();
      return true;
    },
  });
}

/* ----------------------------------------------------------- select style dialog */

function selectStyleDialog(ctx, decision, reportRow, onDone) {
  const recommended = reportRow.recommended[decision.treeVariant];
  const fields = [
    {
      name: 'chosenStyle',
      label: 'Participation style',
      type: 'select',
      required: true,
      options: VY_STYLES.map((s) => {
        const feasible = !(['A1', 'A2'].includes(s.key) && reportRow.aloneUnavailable);
        return {
          value: s.key,
          label: `${s.shortLabel} — ${s.label}${feasible ? '' : ' (not feasible: another line has answered)'}${s.key === recommended ? ' · recommended' : ''}`,
          disabled: !feasible,
        };
      }),
      help: `Recommended: ${shortStyle(recommended)}. A1/A2 (decide alone) are not feasible where another line has answered the diagnostics for this decision.`,
    },
    {
      name: 'overrideReason',
      label: 'Reason for overriding the recommendation',
      type: 'textarea',
      help: 'Required only when the chosen style differs from the recommendation. This reason and the override are graded later against whether the predicted commitment materialised.',
    },
  ];
  const form = buildForm(fields);
  const chosen = reportRow.chosenStyle || '';
  if (chosen) {
    // Find the field and set its value
  }
  openFormModal({
    title: `Select a participation style — ${decision.title}`,
    description: `Recommended: ${shortStyle(recommended)} on the ${VY_TREE_VARIANTS.find((v) => v.key === decision.treeVariant)?.label} tree. The leader may override with a written reason.`,
    submitLabel: 'Select style',
    form,
    onSubmit(values) {
      const res = ctx.api.selectVyStyle({
        decisionId: decision.id,
        chosenStyle: values.chosenStyle,
        recommendedStyle: recommended,
        overrideReason: values.overrideReason || '',
      });
      if (res?.ok) {
        toast(`Participation style ${shortStyle(values.chosenStyle)} recorded.`, 'good');
        onDone?.();
      }
      return res;
    },
  });
}

/* ------------------------------------------------------------- grade dialog */

function gradeDialog(ctx, decision, styleRecord, onDone) {
  const form = buildForm([
    {
      name: 'commitmentMaterialised',
      label: 'Did the predicted commitment materialise?',
      type: 'select',
      required: true,
      options: [
        { value: '', label: 'Not graded' },
        { value: 'true', label: 'Yes — commitment held' },
        { value: 'false', label: 'No — commitment did not hold' },
      ],
      help: 'Grading is director-and-above and cannot be done by the seat that selected the style.',
    },
    {
      name: 'lesson',
      label: 'What this taught us (≥ 24 chars)',
      type: 'textarea',
      required: true,
      help: 'The written lesson from this participation choice, dated and append-only.',
    },
  ]);
  openFormModal({
    title: `Grade the participation outcome — ${decision.title}`,
    description: `Style ${shortStyle(styleRecord.chosenStyle)} was selected on ${styleRecord.at}. Did the commitment it predicted materialise?`,
    submitLabel: 'Grade outcome',
    form,
    onSubmit(values) {
      const res = ctx.api.recordVyCommitmentOutcome({
        decisionId: decision.id,
        commitmentMaterialised: values.commitmentMaterialised === 'true',
        lesson: values.lesson,
      });
      if (res?.ok) {
        toast('Outcome graded. The calibration figure is re-derived on read.', 'good');
        onDone?.();
      }
      return res;
    },
  });
}

/* --------------------------------------------------------------- panels */

function questionsView(ctx, report, onDone) {
  const open = report.rows.filter((r) => r.state !== 'withdrawn');
  const declared = report.rows.filter((r) => r.state === 'declared');
  const answered = report.rows.filter((r) => r.state === 'answered');
  const selected = report.rows.filter((r) => r.state === 'selected');

  return h('div', { class: 'stack' },
    card({
      title: 'Declare a decision-participation question',
      subtitle: 'Open a question about how much to involve others in a decision. The seven diagnostics are answered per line, and the tree recommends a style.',
      actions: [button('Declare a participation question', () => declareDialog(ctx, onDone), { primary: true })],
    }),
    declared.length ? card({
      title: 'Declared — awaiting diagnostics',
      body: table({
        columns: [
          { key: 'title', label: 'Decision' },
          { key: 'tree', label: 'Tree variant' },
          { key: 'declared', label: 'Declared' },
          { key: 'action', label: 'Next step' },
        ],
        rows: declared.map((row) => ({
          title: h('strong', null, row.title),
          tree: VY_TREE_VARIANTS.find((v) => v.key === row.treeVariant)?.label || row.treeVariant,
          declared: row.declaredOn,
          action: button('Answer diagnostics', () => answersDialog(ctx, row, onDone)),
        })),
        caption: 'Decisions declared but not yet answered',
      }),
    }) : null,
    answered.length ? card({
      title: 'Answered — awaiting style selection',
      subtitle: 'Diagnostics are recorded. A director-or-above seat holding a line the decision touches selects the style.',
      body: table({
        columns: [
          { key: 'title', label: 'Decision' },
          { key: 'recommended', label: 'Recommended style' },
          { key: 'tree', label: 'Tree variant' },
          { key: 'lines', label: 'Lines answered' },
          { key: 'action', label: 'Next step' },
        ],
        rows: answered.map((row) => {
          const rec = row.recommended[row.treeVariant];
          return {
            title: h('strong', null, row.title),
            recommended: rec ? shortStyle(rec) : 'none feasible',
            tree: VY_TREE_VARIANTS.find((v) => v.key === row.treeVariant)?.label || row.treeVariant,
            lines: String(row.lineCount),
            action: button('Select style', () => selectStyleDialog(ctx, row, row, onDone)),
          };
        }),
        caption: 'Decisions answered but no style selected yet',
      }),
    }) : null,
    selected.length ? card({
      title: 'Selected — participation styles on the record',
      body: table({
        columns: [
          { key: 'title', label: 'Decision' },
          { key: 'chosen', label: 'Selected style' },
          { key: 'recommended', label: 'Recommended style' },
          { key: 'override', label: 'Override?' },
          { key: 'graded', label: 'Graded?' },
        ],
        rows: selected.map((row) => {
          const rec = row.recommended[row.treeVariant];
          const overridden = Boolean(row.override);
          const graded = row.chosenStyle && false; // grading tracked in style record, not row
          return {
            title: h('strong', null, row.title),
            chosen: shortStyle(row.chosenStyle),
            recommended: rec ? shortStyle(rec) : '—',
            override: overridden ? h('span', { class: 'small warn' }, row.override.reason.slice(0, 60) + '…') : h('span', { class: 'small muted' }, 'no'),
            graded: h('span', { class: 'small muted' }, 'pending'),
          };
        }),
        caption: 'Decisions with a participation style on the record',
      }),
    }) : null,
    open.length === 0 ? emptyState({
      title: 'No decision-participation questions yet',
      body: 'Declare a question about how much to involve others in a decision — decide alone, consult individually, consult the group, or let the group decide.',
      action: button('Declare a participation question', () => declareDialog(ctx, onDone), { primary: true }),
    }) : null);
}

function selectionsView(report, onDone) {
  const byStyle = {};
  for (const key of VY_STYLE_KEYS) {
    byStyle[key] = report.rows.filter((r) => r.chosenStyle === key);
  }
  const overrides = report.rows.filter((r) => Boolean(r.override));
  const aloneUnavailable = report.rows.filter((r) => r.aloneUnavailable);

  return h('div', { class: 'stack' },
    h('div', { class: 'stat-grid' },
      stat({ label: 'Decisions declared', value: report.counts.total }),
      stat({ label: 'Styles selected', value: report.counts.selected }),
      stat({ label: 'Recommendations overridden', value: report.counts.overridden }),
      stat({ label: 'Decide-alone unavailable', value: report.counts.decideAloneUnavailable }),
    ),
    overrides.length ? card({
      title: 'Overrides — the leader chose differently',
      subtitle: 'An override requires a written reason. The reason and the chosen style are graded later against whether the predicted commitment materialised.',
      body: table({
        columns: [
          { key: 'title', label: 'Decision' },
          { key: 'recommended', label: 'Recommended' },
          { key: 'chosen', label: 'Selected' },
          { key: 'reason', label: 'Written reason' },
        ],
        rows: overrides.map((row) => ({
          title: h('strong', null, row.title),
          recommended: shortStyle(row.recommended[row.treeVariant]),
          chosen: shortStyle(row.chosenStyle),
          reason: h('div', { class: 'stack-xs' }, h('span', null, row.override.reason), h('span', { class: 'small muted' }, `by ${row.override.actor} on ${row.override.at}`)),
        })),
        caption: 'Participation-style overrides',
      }),
    }) : null,
    aloneUnavailable.length ? card({
      title: 'Decide-alone unavailable — another line holds a right',
      subtitle: 'A1/A2 are not feasible where another line has answered the diagnostics. The decision needs consultation or group participation.',
      body: table({
        columns: [
          { key: 'title', label: 'Decision' },
          { key: 'lines', label: 'Lines with answers' },
          { key: 'verdict', label: 'Verdict' },
        ],
        rows: aloneUnavailable.map((row) => ({
          title: h('strong', null, row.title),
          lines: String(row.lineCount),
          verdict: row.verdict.label.split(' — ')[0],
        })),
        caption: 'Decisions where one line may not autocratically decide on another line’s territory',
      }),
    }) : null,
    h('div', { class: 'stack-xs' },
      ...VY_STYLE_KEYS.map((key) => {
        const rows = byStyle[key];
        if (!rows.length) return null;
        return card({
          title: `${shortStyle(key)} (${rows.length})`,
          body: table({
            columns: [
              { key: 'title', label: 'Decision' },
              { key: 'tree', label: 'Tree variant' },
              { key: 'override', label: 'Override?' },
            ],
            rows: rows.map((row) => ({
              title: h('strong', null, row.title),
              tree: VY_TREE_VARIANTS.find((v) => v.key === row.treeVariant)?.label || row.treeVariant,
              override: Boolean(row.override) ? h('span', { class: 'small warn' }, 'yes') : h('span', { class: 'small muted' }, 'no'),
            })),
            caption: `Decisions with style ${key}`,
          }),
        });
      }),
    ));
}

function methodView() {
  const weave = VY_METHOD.frameworks.map((line, i) => h('li', null, line));
  return h('div', { class: 'stack' },
    card({
      title: 'Frameworks applied — named, not paraphrased',
      body: h('ul', { class: 'list' }, ...weave),
    }),
    card({
      title: 'What this page prints, and how',
      body: h('ul', { class: 'list' }, ...VY_METHOD.printed.map((line) => h('li', null, line))),
    }),
    card({
      title: 'What it deliberately does not do',
      body: h('ul', { class: 'list' }, ...VY_METHOD.deliberatelyAbsent.map((line) => h('li', null, line))),
    }));
}

/* -------------------------------------------------------------------- render */

export function renderVroomYetton(ctx) {
  const res = ctx.api.vyReport ? ctx.api.vyReport() : null;
  if (!res || res.ok === false || !res.report) {
    return h('div', { class: 'page' },
      pageHeader({
        eyebrow: 'All altitudes · single-chain and matrix',
        title: 'Decision participation selector',
        subtitle: 'How much should the team be involved in this decision?',
      }),
      banner({ tone: 'bad', title: 'The register could not be read', body: res?.error || 'Resolve a valid operating seat to read this register.' }));
  }
  const report = res.report;
  const requested = ctx.query?.get?.('view');
  const activeTab = VIEWS.some((v) => v.key === requested) ? requested : 'questions';
  const attentionRes = ctx.api.sourcingVyScan ? ctx.api.sourcingVyScan() : { count: 0 };
  const attention = typeof attentionRes === 'number' ? attentionRes : (attentionRes?.count || 0);
  const onDone = () => ctx.refresh?.();

  return h('div', { class: 'page', 'data-testid': 'vy-panel' },
    pageHeader({
      eyebrow: 'All altitudes · single-chain and matrix',
      title: 'How much should the team be involved?',
      subtitle: 'The Vroom–Yetton–Jago normative model turns the participation choice into seven dated, named diagnostics and two trees. The leader decides which style to use — and records the reason if they override the recommendation.',
    }),
    ctx.persistError ? banner({ tone: 'caution', title: 'Persistence warning', body: `Changes are not being persisted: ${ctx.persistError}` }) : null,
    report.matrixError ? banner({ tone: 'bad', title: 'Reporting graph unreadable', body: report.matrixError }) : null,
    ...(report.warnings || []).map((w) => banner({ tone: 'caution', title: 'Malformed stored row refused', body: w })),
    report.withheldN ? banner({ tone: 'info', title: `${report.withheldN} decision(s) withheld from this seat`, body: 'A decision reaches a seat only through a line it holds, or a line it declared. Nothing sideways is disclosed.' }) : null,
    h('div', { class: 'stat-grid' },
      stat({ label: 'Decisions declared', value: report.counts.total }),
      stat({ label: 'Diagnostics owed', value: report.counts.decisionOwed, hint: attention > 0 ? `${attention} ask(s) filed to this seat` : 'none owed' }),
      stat({ label: 'Styles selected', value: report.counts.selected }),
      stat({ label: 'Decide-alone unavailable', value: report.counts.decideAloneUnavailable }),
    ),
    tabs({
      items: VIEWS.map((v) => ({
        key: v.key,
        label: v.label,
        count: v.key === 'questions' ? report.rows.length : undefined,
      })),
      active: activeTab,
      ariaLabel: 'Vroom–Yetton decision participation views',
      onSelect: (key) => ctx.navigate(`${VY_HREF}?view=${key}`),
    }),
    activeTab === 'questions' ? questionsView(ctx, report, onDone) : null,
    activeTab === 'selections' ? selectionsView(report, onDone) : null,
    activeTab === 'method' ? methodView() : null,
    h('p', { class: 'small muted' }, `Engine ${report.engine} · ${report.rule} · as of ${report.asOf} · “the totals add up” is ${report.totalsReconcile ? 'true' : 'FALSE'} and “every printed figure is the computed figure” is ${report.figuresComplete ? 'true' : 'false'} — two different claims, reported apart.`));
}

const VY_METHOD = Object.freeze({
  engine: 'vroom-yetton-2026.11-v1',
  adr: 'ADR-0230',
  frameworks: Object.freeze([
    'Vroom–Yetton–Jago normative decision model (Vroom & Yetton 1973; Vroom & Jago 1988) — the leader chooses how much to involve others by walking seven situational diagnostics to one of five participation styles: autocratic I/II, consultative I/II, group II.',
    'Time-driven vs development-driven trees (Vroom & Jago 1988) — the same diagnostics, two objectives: minimise time to decision, or develop team judgement and commitment.',
    'Matrix accountability (ADR-0140/ADR-0141) — commitment, alignment and conflict diagnostics are answered per line; a decide-alone style is unavailable where another line holds the decision right, and the joint apex reads across all lines.',
    'Bulletproof reliability (NORTH_STAR) — an answer that cannot be read is dropped with a counted reason, never coerced; a style the diagnostics do not support is printed as infeasible, never assigned.',
  ]),
  printed: Object.freeze([
    'Each diagnostic is a dated, named yes/no declaration on a line — never inferred from structure, headcount or title.',
    'The recommended style is the first style whose conditions hold on the chosen tree; when none holds, `no-style-feasible` is printed with the blocking diagnostic named.',
    'Per-line answers are combined by line: if any line needs commitment, the decision needs commitment; if any line reports likely conflict, conflict is printed.',
    'A1/A2 (decide alone) are shown as unavailable where another line holds a decision right over any part of this decision — one line may not autocratically decide on another line’s territory.',
    'The leader may override the recommendation with a written reason; the override and the reason are both printed and graded later against whether the predicted commitment materialised.',
    'Below the declared floor of graded selections, no calibration figure is printed at all.',
  ]),
  deliberatelyAbsent: Object.freeze([
    'No inferred answer from a reporting line, a job title or an org chart.',
    'No automatic style selection that binds the leader.',
    'No per-person performance signal from a participation outcome.',
    'No write to any calendar, project or HR system.',
    'No style is ever "the right answer" — the register prints options and reasons; the leader chooses.',
  ]),
});

function button(label, onClick, { primary = false, testid = null } = {}) {
  return h('button', {
    type: 'button',
    class: `btn btn-small ${primary ? 'btn-primary' : 'btn-ghost'}`,
    ...(testid ? { 'data-testid': testid } : {}),
    onClick,
  }, label);
}

export default renderVroomYetton;
