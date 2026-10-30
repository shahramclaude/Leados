/**
 * app/views/performance.js — Performance Recovery Terminal (`#/performance`).
 *
 * Five panels over one record:
 *
 *   Concerns    every open and closed concern, with the selected one beside it
 *   Evidence    the dated observations, the conversations and the support given
 *   Diagnosis   the seven performance-analysis questions and what they imply
 *   Plan        the adopted objectives, the frozen prediction, and the review
 *   Method      the frameworks, the conventions and — prominently — the limits
 *
 * The screen is deliberately slower than the rest of the app. A performance
 * record is a claim about a person's work, and the tool's job is to make the
 * leader's own evidence visible before it makes any action easy.
 */

import { h, toast } from '../ui/dom.js';
import {
  pageHeader, card, stat, badge, banner, tabs, table, emptyState, kv, timeline,
} from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { formatDate } from '../core/time.js';
import {
  PERFORMANCE_MIN_RESOLVED,
  performanceReport,
} from '../core/domain/performance.js';
import {
  CONCERN_STATUS_LABELS,
  CONVERSATION_KIND_LABELS,
  EXPECTATION_SOURCE_LABELS,
  OBSERVATION_SOURCE_LABELS,
  OUTCOME_VERDICT_LABELS,
  SUPPORT_KIND_LABELS,
} from '../core/domain/performanceSchema.js';
import {
  openConcernDialog,
  openObservationDialog,
  openConversationDialog,
  openSupportDialog,
  openAdoptPlanDialog,
  openReviewPlanDialog,
  openWithdrawConcernDialog,
} from '../ui/performance-modals.js';

const PANELS = [
  { key: 'concerns', label: 'Concerns' },
  { key: 'evidence', label: 'Evidence' },
  { key: 'diagnosis', label: 'Diagnosis' },
  { key: 'plan', label: 'Plan' },
  { key: 'method', label: 'Method' },
];

const STATUS_TONE = {
  assessing: 'caution',
  plan: 'warn',
  monitoring: 'warn',
  resolved: 'good',
  withdrawn: 'neutral',
};

function money(value, currency) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `${currency || ''} ${Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })}`.trim();
}

function pct(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `${Number(value)}%`;
}

function statusBadge(concern) {
  return badge(CONCERN_STATUS_LABELS[concern.status] || concern.status, STATUS_TONE[concern.status] || 'neutral');
}

function justiceBadge(rule) {
  const tone = rule.status === 'met' ? 'good' : rule.status === 'gap' ? 'bad' : 'caution';
  return badge(rule.status === 'met' ? 'Met' : rule.status === 'gap' ? 'Gap' : 'Unknown', tone);
}

function selectedFrom(ctx, report) {
  const id = ctx.query?.get?.('concern') || '';
  const rows = report.concerns;
  const byId = rows.find((row) => row.concern.id === id);
  if (byId) return byId;
  return report.open[0] || rows[0] || null;
}

function go(ctx, concernId, panel = 'concerns') {
  const concern = concernId ? `&concern=${encodeURIComponent(concernId)}` : '';
  ctx.navigate(`#/performance?panel=${panel}${concern}`);
}

/* ------------------------------------------------------------- concerns */

function concernRow(row, ctx, selected) {
  const { concern, assessment } = row;
  return h('tr', {
    class: selected ? 'is-selected' : '',
    style: { cursor: 'pointer' },
    onClick: () => go(ctx, concern.id, 'concerns'),
  },
    h('td', { 'data-label': 'Concern' },
      h('strong', null, concern.label),
      h('div', { class: 'muted small' }, assessment.person ? assessment.person.name : 'Person no longer in the roster')),
    h('td', { 'data-label': 'Status' }, statusBadge(concern)),
    h('td', { 'data-label': 'Evidence', class: 'num' }, `${assessment.evidence.liveCount}`),
    h('td', { 'data-label': 'Due process', class: 'num' }, `${assessment.justice.metCount}/${assessment.justice.total}`),
    h('td', { 'data-label': 'Review' }, assessment.plan.detail),
  );
}

function concernsPanel(ctx, report, selected) {
  const rows = report.concerns.map((row) => ({
    ...row,
    render: () => concernRow(row, ctx, selected && selected.concern.id === row.concern.id),
  }));
  const list = report.counts.total
    ? table({
        caption: 'Performance concerns with evidence and due-process counts',
        columns: [
          { label: 'Concern', render: (r) => r.render() },
          { label: 'Status', render: () => '' },
          { label: 'Evidence', render: () => '' },
          { label: 'Due process', render: () => '' },
          { label: 'Review', render: () => '' },
        ],
        rows,
      })
    : emptyState({
        title: 'No performance concern is recorded',
        body: 'That is not evidence there is none. If someone on your team is not delivering, start with the expectation: write it down, say it out loud, date it. The concern can follow the evidence rather than replace it.',
        action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openConcernDialog(ctx) }, 'Open a concern'),
      });

  const detail = selected ? concernSummary(ctx, selected) : null;
  return h('div', { class: 'stack-lg' }, [list, detail]);
}

function concernSummary(ctx, { concern, assessment }) {
  const observationRows = assessment.evidence.rows.slice(-4).reverse();
  return card({
    title: concern.label,
    subtitle: `${CONCERN_STATUS_LABELS[concern.status]} · opened ${formatDate(concern.openedOn)}${assessment.person ? ` · ${assessment.person.name}${assessment.person.role ? ` (${assessment.person.role})` : ''}` : ''}`,
    actions: [
      h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => openConcernDialog(ctx, concern) }, 'Edit'),
      h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => openObservationDialog(ctx, concern) }, 'Add observation'),
      h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => openConversationDialog(ctx, concern) }, 'Record conversation'),
      h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => openSupportDialog(ctx, concern) }, 'Record support'),
      h('button', { class: 'btn btn-small btn-danger', type: 'button', onClick: () => openWithdrawConcernDialog(ctx, concern) }, 'Withdraw'),
    ],
    body: h('div', { class: 'stack-md' }, [
      banner({
        tone: assessment.canFormalPlan ? 'good' : 'caution',
        title: assessment.canFormalPlan ? 'The record can support a formal plan.' : 'A formal plan is not yet supported by this record.',
        body: assessment.canFormalPlan
          ? 'Every due-process rule is met. The next step is a plan with specific objectives, a review date and your honest probability — or a conversation, which is often the better answer.'
          : assessment.justice.verdict,
        actions: assessment.canFormalPlan
          ? [h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => (concern.plan ? go(ctx, concern.id, 'plan') : openAdoptPlanDialog(ctx, concern)) }, concern.plan ? 'Open the plan' : 'Adopt a plan')]
          : [h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => go(ctx, concern.id, 'evidence') }, 'Work on the evidence')],
      }),
      h('div', { class: 'grid-2' }, [
        h('div', { class: 'stack-xs' }, [
          h('h3', { class: 'subhead' }, 'The gap, as declared'),
          h('p', { class: 'muted small' }, 'Expected'),
          h('p', null, concern.standard.expectation || 'Nothing was ever written down.'),
          h('p', { class: 'muted small' }, `Source: ${EXPECTATION_SOURCE_LABELS[concern.standard.source] || 'not stated'}${concern.standard.recordedOn ? ` · dated ${concern.standard.recordedOn}` : ''}`),
          h('p', { class: 'muted small' }, 'Observed'),
          h('p', null, concern.gap.observed || 'Not described yet.'),
          concern.gap.impact ? h('p', { class: 'muted small' }, `Impact: ${concern.gap.impact}`) : null,
        ]),
        h('div', { class: 'stack-xs' }, [
          h('h3', { class: 'subhead' }, 'Evidence'),
          kv('Live observations', String(assessment.evidence.liveCount)),
          kv('On distinct dates', String(assessment.evidence.distinctDates)),
          kv('Specific enough to answer', `${assessment.evidence.specificCount} of ${assessment.evidence.liveCount}`),
          kv('Outside the window', String(assessment.evidence.staleCount)),
          kv('Recorded conversations', String((concern.conversations || []).length)),
          kv('Support actions', String((concern.supports || []).filter((s) => s.kind !== 'none').length)),
        ]),
      ]),
      observationRows.length ? h('div', { class: 'stack-xs' }, [
        h('h3', { class: 'subhead' }, 'Most recent observations'),
        h('ul', { class: 'list-plain' }, ...observationRows.map((row) => h('li', null,
          h('strong', null, `${row.date} · ${OBSERVATION_SOURCE_LABELS[row.source] || row.source}`),
          h('div', null, row.behavior),
          row.impact ? h('div', { class: 'muted small' }, `Impact: ${row.impact}`) : null))),
      ]) : null,
      h('div', { class: 'row gap-sm' }, [
        h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => go(ctx, concern.id, 'evidence') }, 'Evidence audit'),
        h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => go(ctx, concern.id, 'diagnosis') }, 'Diagnosis'),
        h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => go(ctx, concern.id, 'plan') }, 'Plan'),
      ]),
    ]),
  });
}

/* ------------------------------------------------------------- evidence */

function evidencePanel(ctx, report, selected) {
  if (!selected) return emptyState({ title: 'Choose a concern', body: 'Evidence is recorded against one concern at a time.' });
  const { concern, assessment } = selected;
  const observations = (assessment.evidence.rows || []).slice().reverse();
  const obsTable = table({
    caption: 'Dated observations, their specificity and their source',
    columns: [
      { label: 'Date', render: (r) => r.date },
      { label: 'Source', render: (r) => OBSERVATION_SOURCE_LABELS[r.source] || r.source },
      { label: 'Situation', render: (r) => r.situation || '—' },
      { label: 'Behaviour', render: (r) => r.behavior },
      { label: 'Impact', render: (r) => r.impact || '—' },
      { label: 'Quality', render: (r) => `${r.sbiQuality}/4${r.inWindow ? '' : ' · outside window'}` },
    ],
    rows: observations,
    emptyMessage: 'No observation recorded yet. Without one, nothing on this page can be audited.',
  });

  const conversations = table({
    caption: 'Recorded conversations',
    columns: [
      { label: 'Date', render: (r) => r.date },
      { label: 'Kind', render: (r) => CONVERSATION_KIND_LABELS[r.kind] || r.kind },
      { label: 'What they said', render: (r) => r.note || '—' },
    ],
    rows: (concern.conversations || []).slice().reverse(),
    emptyMessage: 'No conversation recorded. The voice rule stays unmet until one is.',
  });

  const supports = table({
    caption: 'Support provided',
    columns: [
      { label: 'Date', render: (r) => r.date },
      { label: 'Support', render: (r) => SUPPORT_KIND_LABELS[r.kind] || r.kind },
      { label: 'Note', render: (r) => r.note || '—' },
    ],
    rows: (concern.supports || []).slice().reverse(),
    emptyMessage: 'No support recorded. A plan without support is a trap with a calendar.',
  });

  return h('div', { class: 'stack-lg' }, [
    card({
      title: 'Evidence audit',
      subtitle: assessment.evidence.summary,
      actions: [
        h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => openObservationDialog(ctx, concern) }, 'Add observation'),
        h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => openConversationDialog(ctx, concern) }, 'Record conversation'),
        h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => openSupportDialog(ctx, concern) }, 'Record support'),
      ],
      body: h('div', { class: 'stack-md' }, [
        h('div', { class: 'grid-2' }, [
          h('div', { class: 'stack-xs' }, [
            kv('Observations inside the window', `${assessment.evidence.liveCount} (floor ${assessment.evidence.floor})`),
            kv('Distinct dates', String(assessment.evidence.distinctDates)),
            kv('Average specificity', assessment.evidence.averageQuality === null ? '—' : `${assessment.evidence.averageQuality}/4`),
            kv('Window', `${assessment.evidence.windowDays} days`),
          ]),
          h('div', { class: 'stack-xs' }, [
            kv('First observation', assessment.evidence.firstDate ? formatDate(assessment.evidence.firstDate) : '—'),
            kv('Last observation', assessment.evidence.lastDate ? formatDate(assessment.evidence.lastDate) : '—'),
            kv('Outside the window', String(assessment.evidence.staleCount)),
            kv('Distinct sources', String(assessment.evidence.sourceCount)),
          ]),
        ]),
        obsTable,
      ]),
    }),
    card({ title: 'Procedural justice, rule by rule', subtitle: 'Each rule is a fact the record either contains or does not. A gap is a missing fact, not a judgement.', body: h('ul', { class: 'list-plain' }, ...assessment.justice.rules.map((rule) => h('li', null,
      h('div', { class: 'row gap-sm' }, [h('strong', null, rule.label), justiceBadge(rule)]),
      h('div', null, rule.detail),
      rule.fix ? h('div', { class: 'muted small' }, `Fix: ${rule.fix}`) : null,
    ))) }),
    card({
      title: 'Conversations',
      subtitle: 'Voice is a requirement, not a courtesy. Record what they actually said, in their words.',
      actions: [h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => openConversationDialog(ctx, concern) }, 'Record conversation')],
      body: conversations,
    }),
    card({
      title: 'Support provided',
      subtitle: 'What changed to make the expectation achievable — not what was said about it.',
      actions: [h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => openSupportDialog(ctx, concern) }, 'Record support')],
      body: supports,
    }),
  ]);
}

/* ------------------------------------------------------------ diagnosis */

const QUESTION_LABELS = {
  couldDoIfTried: 'Could they do it if their life depended on it?',
  knowsWhat: 'Do they know exactly what “good” looks like?',
  knowsWhen: 'Do they know when it is due?',
  obstacle: 'Is something or someone in the way?',
  consequenceMissing: 'Does good performance here bring no visible consequence — or cost them?',
  capacity: 'Are they out of time given everything else they own?',
  feedbackLoop: 'Have they had usable feedback close enough to the event to act on?',
};

function diagnosisPanel(ctx, report, selected) {
  if (!selected) return emptyState({ title: 'Choose a concern', body: 'The analysis questions are answered per concern.' });
  const { concern, assessment } = selected;
  const diagnosis = assessment.diagnosis;
  const answers = concern.answers || {};

  const rows = Object.keys(QUESTION_LABELS).map((key) => h('li', { class: 'stack-xs' }, [
    h('div', { class: 'row gap-sm' }, [
      h('span', null, QUESTION_LABELS[key]),
      badge(answers[key] === true ? 'Yes' : answers[key] === false ? 'No' : 'Unanswered', answers[key] === true ? 'good' : answers[key] === false ? 'caution' : 'neutral'),
    ]),
    answers[key] === undefined || answers[key] === null
      ? h('span', { class: 'muted small' }, 'Unanswered is not a silent no. The diagnosis stays unnamed until you answer.')
      : null,
  ]));

  return h('div', { class: 'stack-lg' }, [
    banner({
      tone: 'info',
      title: 'This is a diagnosis of the situation you described, not a measurement of the person.',
      body: 'Mager & Pipe’s analysis asks whether the gap is skill, clarity, obstacle, consequence or capacity. Every answer here is yours, and “could not do it” points at training while “could do it” points at something in the system.',
    }),
    card({
      title: 'The seven questions',
      subtitle: 'Answer them from what you have actually seen. A blank is honest; a guess is not.',
      actions: [h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => openConcernDialog(ctx, concern) }, 'Answer the questions')],
      body: h('ul', { class: 'list-plain' }, ...rows),
    }),
    card({
      title: diagnosis.label,
      subtitle: `Confidence: ${diagnosis.confidence} · ${diagnosis.answeredCount} of 7 answered`,
      body: h('div', { class: 'stack-md' }, [
        h('p', null, diagnosis.reading),
        diagnosis.reasons.length ? h('ul', null, ...diagnosis.reasons.map((line) => h('li', null, line))) : null,
        diagnosis.secondary.length ? h('div', { class: 'stack-xs' }, [
          h('h3', { class: 'subhead' }, 'Also declared'),
          h('ul', null, ...diagnosis.secondary.map((row) => h('li', null, row.text))),
        ]) : null,
        h('div', { class: 'stack-xs' }, [
          h('h3', { class: 'subhead' }, 'Support adequacy'),
          kv('Status', assessment.support.status),
          h('p', null, assessment.support.detail),
          assessment.support.expected.length
            ? h('p', { class: 'muted small' }, `Expected remedy: ${assessment.support.expected.map((k) => SUPPORT_KIND_LABELS[k] || k).join(', ')}. Recorded: ${assessment.support.given.map((k) => SUPPORT_KIND_LABELS[k] || k).join(', ') || 'nothing'}.`)
            : h('p', { class: 'muted small' }, 'This cause class implies no specific remedy.'),
          h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => openSupportDialog(ctx, concern) }, 'Record support'),
        ]),
        diagnosis.missing.length ? h('p', { class: 'muted small' }, `Unanswered: ${diagnosis.missing.join(', ')}.`) : null,
      ]),
    }),
    card({
      title: 'The economics of waiting',
      subtitle: 'Arithmetic on declared inputs. Not a recommendation about a person.',
      body: h('div', { class: 'stack-xs' }, [
        kv('Priced', assessment.economics.priced ? 'Yes' : 'No — unpriced, not zero'),
        kv('Daily carrying cost', money(assessment.economics.totalDaily, assessment.economics.currency)),
        kv('Replacement-cost convention', money(assessment.economics.replacementCost, assessment.economics.currency)),
        kv('Break-even', assessment.economics.breakEvenDays === null ? '—' : `${assessment.economics.breakEvenDays} working day(s)`),
        h('p', null, assessment.economics.note),
        assessment.economics.terms.length
          ? table({
              caption: 'Priced terms and their basis',
              columns: [
                { label: 'Term', render: (r) => r.label },
                { label: 'Value', render: (r) => money(r.value, assessment.economics.currency), className: 'num' },
                { label: 'Basis', render: (r) => r.basis },
              ],
              rows: assessment.economics.terms,
            })
          : null,
      ]),
    }),
  ]);
}

/* ------------------------------------------------------------------ plan */

function planPanel(ctx, report, selected) {
  if (!selected) return emptyState({ title: 'Choose a concern', body: 'Plans are adopted per concern.' });
  const { concern, assessment } = selected;
  const plan = concern.plan;
  if (!plan) {
    return card({
      title: 'No plan adopted',
      subtitle: assessment.canFormalPlan
        ? 'The record can support a plan. It can also support the conclusion that a plan is the wrong instrument.'
        : 'The record cannot support a formal plan yet.',
      body: h('div', { class: 'stack-md' }, [
        banner({
          tone: assessment.canFormalPlan ? 'good' : 'caution',
          title: assessment.canFormalPlan ? 'Due process is met' : `${assessment.blockers.length} due-process gap(s) remain`,
          body: assessment.canFormalPlan
            ? 'A plan should be specific, measurable and time-bounded, with the support it depends on recorded beside it.'
            : assessment.justice.verdict,
        }),
        assessment.blockers.length ? h('ul', null, ...assessment.blockers.map((blocker) => h('li', null, `${blocker.label}: ${blocker.detail}`))) : null,
        h('button', {
          class: 'btn btn-primary',
          type: 'button',
          onClick: () => openAdoptPlanDialog(ctx, concern),
        }, 'Adopt a plan'),
      ]),
    });
  }

  const outcome = concern.outcome && concern.outcome.verdict ? concern.outcome : null;
  const prediction = plan.prediction || {};
  const scored = assessment.prediction;
  return h('div', { class: 'stack-lg' }, [
    card({
      title: 'Recovery plan',
      subtitle: `Adopted ${plan.adoptedOn || 'without a date'} · review ${plan.reviewOn || 'not set'} · ${assessment.plan.detail}`,
      actions: outcome
        ? []
        : [h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => openReviewPlanDialog(ctx, concern) }, 'Record the review')],
      body: h('div', { class: 'stack-md' }, [
        table({
          caption: 'Plan objectives and their measures',
          columns: [
            { label: 'Objective', render: (r) => r.text },
            { label: 'Measure', render: (r) => r.measure || '—' },
            { label: 'By when', render: (r) => r.byWhen || '—' },
          ],
          rows: plan.objectives || [],
        }),
        h('div', { class: 'grid-2' }, [
          h('div', { class: 'stack-xs' }, [
            kv('Frozen probability', `${prediction.probabilityPct ?? '—'}% by ${plan.reviewOn || '—'}`),
            kv('Cadence', plan.cadenceDays ? `Every ${plan.cadenceDays} days` : '—'),
            kv('Support at adoption', plan.supportKinds?.length ? plan.supportKinds.map((k) => SUPPORT_KIND_LABELS[k] || k).join(', ') : 'None recorded'),
          ]),
          h('div', { class: 'stack-xs' }, [
            kv('Review status', assessment.plan.state),
            kv('Verdict', outcome ? OUTCOME_VERDICT_LABELS[outcome.verdict] : 'Not yet reviewed'),
            kv('Scored', scored ? `Brier ${scored.brier}` : 'Withheld until reviewed'),
          ]),
        ]),
        plan.overrideReason
          ? banner({
              tone: 'bad',
              title: 'This plan was adopted over an explicit written override',
              body: plan.overrideReason,
            })
          : null,
        outcome ? h('div', { class: 'stack-xs' }, [
          h('h3', { class: 'subhead' }, `Review · ${outcome.reviewedOn || 'no date'}`),
          h('p', null, outcome.notes || 'No notes recorded.'),
        ]) : null,
      ]),
    }),
    card({
      title: 'Calibration',
      subtitle: 'Your plans are graded, not your people.',
      body: h('div', { class: 'stack-xs' }, [
        h('p', null, report.calibration.note),
        report.calibration.ready ? kv('Brier score', String(report.calibration.brier)) : kv('Resolved plans', `${report.calibration.n} of ${PERFORMANCE_MIN_RESOLVED} needed`),
      ]),
    }),
  ]);
}

/* ---------------------------------------------------------------- method */

function methodPanel(report) {
  const c = report.conventions;
  return h('div', { class: 'stack-lg' }, [
    card({
      title: 'What this terminal does',
      body: h('div', { class: 'stack-sm' }, [
        h('p', null, 'It makes the leader’s own process visible before an action is easy: what was expected, when it was said, what was observed, whether the person was heard, whether support was tried, and what the gap costs while it waits.'),
        h('p', null, 'It refuses a formal plan while a due-process gap stands. It never rates a person, never ranks a team, never infers sentiment from text, and never takes an adverse action. It cannot terminate, demote, dock pay or change a role.'),
      ]),
    }),
    card({
      title: 'Named methods',
      body: h('ul', { class: 'list-plain' }, [
        h('li', null, h('strong', null, 'Mager & Pipe (1970, 1997), Analyzing Performance Problems. '), 'The seven questions separate a skill or knowledge deficiency from a performance deficiency, and point at the remedy each implies.'),
        h('li', null, h('strong', null, 'Leventhal (1980) procedural justice; Colquitt et al. (2001). '), 'Notice, accuracy, consistency, voice, bias suppression and support mapped to six checkable facts.'),
        h('li', null, h('strong', null, 'Locke & Latham (1990, 2002) goal-setting theory. '), 'Specific, measurable, time-bounded objectives with feedback — the plan form exists because vague plans fail.'),
        h('li', null, h('strong', null, 'Bies & Moag (1986); Edmondson (1999). '), 'The two-way conversation comes before the verdict because a plan nobody was heard in is a plan people leave.'),
        h('li', null, h('strong', null, 'Brier (1950). '), 'The plan’s own probability is frozen at adoption and scored at review. Below five resolved plans the score is withheld.'),
        h('li', null, h('strong', null, 'Reinertsen (2009) cost of delay; standard replacement-cost convention. '), 'Waiting is priced from recorded pay and a declared share of output. The break-even is arithmetic, not advice.'),
      ]),
    }),
    card({
      title: 'Conventions this terminal uses',
      body: h('div', { class: 'stack-xs' }, [
        kv('Observations needed before a plan', String(c.minObservations)),
        kv('Evidence window', `${c.evidenceWindowDays} days`),
        kv('Specificity floor', `${c.sbiFloor}/4`),
        kv('Default review horizon', `${c.reviewHorizonDays} days`),
        kv('Stale concern threshold', `${c.staleDays} days`),
        kv('Replacement-cost convention', `${c.replacementMonths} months of pay`),
        kv('Employer load', `${c.employerLoadPct}%`),
        kv('Working days per year', String(c.workdaysPerYear)),
        kv('Declared hour of team time', String(c.hourValue)),
      ]),
    }),
    card({
      title: 'What this terminal deliberately does not do',
      body: h('ul', { class: 'list-plain' }, [
        h('li', null, 'It does not rate performance, potential or “fit”, and there is no nine-box grid anywhere in this app.'),
        h('li', null, 'It does not analyse language, sentiment, messages or calendar activity about a person.'),
        h('li', null, 'It does not recommend an exit, a warning or a disciplinary step. A not-met review opens a question about the process.'),
        h('li', null, 'It is not legal advice. The audit is a procedural-fairness checklist; employment law varies by jurisdiction and this page cannot replace a people partner.'),
        h('li', null, 'It does not prevent a leader from acting badly outside the app. It makes the record of what they did visible, which is the most a local-first tool can honestly claim.'),
      ]),
    }),
  ]);
}

/* ---------------------------------------------------------------- render */

export function renderPerformance(ctx) {
  const { state, now } = ctx;
  const report = performanceReport(state, now, state.settings || {});
  const requestedPanel = ctx.query?.get?.('panel') || 'concerns';
  const panel = PANELS.some((p) => p.key === requestedPanel) ? requestedPanel : 'concerns';
  const selected = selectedFrom(ctx, report);

  const carry = report.exposure.length
    ? report.exposure.map((row) => `${row.currency} ${Number(row.perDay).toLocaleString('en-US')}/day`).join(' · ')
    : 'unpriced';

  const header = pageHeader({
    title: 'Performance Recovery',
    subtitle: 'The gap, the evidence, the conversation and the cost of waiting — in that order.',
    actions: [
      stat({ label: 'Open concerns', value: report.counts.open, hint: `${report.counts.total} recorded` }),
      stat({ label: 'Awaiting evidence', value: report.counts.blocked, tone: report.counts.blocked ? 'warn' : '' }),
      stat({ label: 'Overdue reviews', value: report.counts.overdueReviews, tone: report.counts.overdueReviews ? 'warn' : '' }),
      stat({ label: 'Carrying cost', value: carry, hint: 'declared inputs only' }),
      h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openConcernDialog(ctx) }, 'Open a concern'),
      h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: () => {
          const text = ctx.api.performanceBriefText();
          if (!downloadText({ filename: 'leados-performance-brief.txt', text, mime: 'text/plain' })) {
            toast('Could not start the download. Use Data & export instead.', 'bad');
          }
        },
      }, 'Export brief'),
    ],
  });

  const tabBar = tabs({
    items: PANELS.map((p) => ({ ...p })),
    active: panel,
    ariaLabel: 'Performance recovery panels',
    onSelect: (key) => go(ctx, selected?.concern.id, key),
  });

  const notices = [];
  if (report.counts.blocked) {
    notices.push(banner({
      tone: 'caution',
      title: `${report.counts.blocked} concern(s) cannot support a formal plan yet`,
      body: 'Each one is missing a fact a person would need in order to answer the case: notice, specificity, consistency, voice, support or a named cause. The Evidence panel lists the exact missing fact and the fix.',
      actions: [h('a', { class: 'btn btn-small btn-ghost', href: '#/performance?panel=evidence' }, 'Open the audit')],
    }));
  }
  if (report.counts.overdueReviews) {
    notices.push(banner({
      tone: 'bad',
      title: `${report.counts.overdueReviews} plan review(s) have passed without an outcome`,
      body: 'The frozen prediction cannot be scored until the review is recorded, and an unrecorded review is indistinguishable from a plan nobody checked.',
    }));
  }

  const content = panel === 'evidence'
    ? evidencePanel(ctx, report, selected)
    : panel === 'diagnosis'
      ? diagnosisPanel(ctx, report, selected)
      : panel === 'plan'
        ? planPanel(ctx, report, selected)
        : panel === 'method'
          ? methodPanel(report)
          : concernsPanel(ctx, report, selected);

  return h('div', { class: 'view-stack' }, [header, ...notices, tabBar, content]);
}
