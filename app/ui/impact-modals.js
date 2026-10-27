/**
 * app/ui/impact-modals.js — declare a study, or score it.
 *
 * Two dialogs, and both exist to make one moment harder than it would otherwise
 * be: the moment the leader writes down what they expect, before they know.
 *
 * The declare dialog refuses to be a form. As the leader chooses a metric and a
 * window, it recomputes — from that metric's own recorded week-to-week noise —
 * the smallest effect the design could possibly detect, and tells them straight
 * away whether the effect they are about to predict is even visible to the
 * instrument they have chosen. Discovering that after four weeks of waiting is
 * the classic wasted study; discovering it in the dialog costs ten seconds.
 *
 * The score dialog shows the evaluation before committing it, then freezes it
 * permanently. There is no second chance, no rescore button and no window
 * adjustment afterwards.
 */

import { h, openModal, toast } from './dom.js';

import { formatDate } from '../core/time.js';
import {
  INTERVENTION_TYPES,
  VERDICTS,
  designPower,
  evaluateStudy,
  gradeOf,
  studyHorizonEnd,
  vitalChoices,
} from '../core/domain/impact.js';
import { VITAL_MIN_POINTS } from '../core/domain/vitals.js';

function num(v, dp = 3) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: dp }).format(Number(v));
}

function fieldRow({ label, id, control, hint = null, required = false }) {
  return h('div', { class: 'field' },
    h('label', { class: 'field-label', for: id }, label, required ? h('span', { class: 'req' }, ' *') : null),
    control,
    hint ? h('p', { class: 'field-hint' }, hint) : null,
  );
}

/* --------------------------------------------------------------- declare */

/**
 * @param {object} options
 * @param {object} options.ctx   app context (state, api, now, refresh)
 * @param {string|null} options.vitalId  preselect a metric
 */
export function openDeclareStudyDialog({ ctx, vitalId = null }) {
  const choices = vitalChoices(ctx.state, ctx.now);
  const usable = choices.filter((c) => c.usable);
  if (!usable.length) {
    openModal({
      title: 'Not enough history to study anything yet',
      description: 'A study compares what happened after an intervention with what was already happening before it. That needs a baseline, and this workspace does not have one yet.',
      body: h('div', { class: 'stack' },
        h('p', null, `A metric becomes studiable once it has been observed across at least ${VITAL_MIN_POINTS} weeks. Vitals are rebuilt from the dates already on your records — 1:1s held, feedback given, delegations completed, cases resolved — so nothing extra needs to be typed in.`),
        h('p', { class: 'muted' }, 'If you are in a hurry: log a few weeks of ordinary work and come back. Declaring a study against a metric with no history would produce a result that means nothing, and the app would rather tell you that now.'),
      ),
      footer: [{ label: 'Close', onClick: (close) => close() }],
    });
    return;
  }

  const state = ctx.state;
  const settings = state.settings || {};
  const todayKey = formatDate(ctx.now, { withYear: true });
  const todayISO = new Date(ctx.now.getTime() - ctx.now.getTime() % 86400000).toISOString().slice(0, 10);

  const selected = usable.find((c) => c.id === vitalId) || usable[0];

  /* --- controls --- */
  const titleInput = h('input', { id: 'imp-title', type: 'text', maxlength: '160', placeholder: 'e.g. Weekly feedback ritual' });
  const metricSelect = h('select', { id: 'imp-metric' },
    ...choices.map((c) => h('option', { value: c.id, disabled: !c.usable ? '' : null },
      `${c.label} — ${c.usable ? `${c.measured} weeks of history` : 'not enough history'}`)),
  );
  metricSelect.value = selected.id;

  const typeSelect = h('select', { id: 'imp-type' },
    ...INTERVENTION_TYPES.map((t) => h('option', { value: t.id }, t.label)),
  );

  const labelInput = h('input', { id: 'imp-label', type: 'text', maxlength: '160', placeholder: 'Optional — what you called it at the time' });

  const dateInput = h('input', { id: 'imp-date', type: 'date', max: todayISO, value: todayISO });
  const baselineInput = h('input', { id: 'imp-baseline', type: 'number', min: '4', max: '26', step: '1', value: String(settings.impactBaselineWeeks ?? 8) });
  const windowInput = h('input', { id: 'imp-window', type: 'number', min: '2', max: '13', step: '1', value: String(settings.impactWindowWeeks ?? 4) });
  const alphaSelect = h('select', { id: 'imp-alpha' },
    h('option', { value: '0.05' }, '0.05 — strict'),
    h('option', { value: '0.1' }, '0.10 — standard'),
    h('option', { value: '0.2' }, '0.20 — exploratory'),
  );
  alphaSelect.value = String(settings.impactAlpha ?? 0.1);

  const hypothesisInput = h('textarea', { id: 'imp-hypothesis', rows: '3', maxlength: '2000', placeholder: 'If I …, then … should move in … direction by about …' });

  const effectInput = h('input', { id: 'imp-effect', type: 'number', min: '0', step: 'any', placeholder: 'optional' });
  const confidenceInput = h('input', { id: 'imp-confidence', type: 'number', min: '50', max: '95', step: '5', placeholder: 'e.g. 70' });

  const errorNode = h('p', { class: 'field-error', role: 'alert' });

  /* --- live preview --- */
  const preview = h('div', { class: 'stack', 'aria-live': 'polite' });

  function current() {
    return {
      vitalId: metricSelect.value,
      windowStart: dateInput.value || todayISO,
      baselineWeeks: Number(baselineInput.value) || 8,
      windowWeeks: Number(windowInput.value) || 4,
      alpha: Number(alphaSelect.value) || 0.1,
      expectedEffect: effectInput.value === '' ? null : Number(effectInput.value),
    };
  }

  function renderPreview() {
    const input = current();
    const choice = choices.find((c) => c.id === input.vitalId);
    const retrospective = input.windowStart < todayISO;
    const plan = designPower(state, input.vitalId, {
      preWeeks: input.baselineWeeks,
      postWeeks: input.windowWeeks,
      alpha: input.alpha,
      asOf: ctx.now,
    });
    const target = Number.isFinite(input.expectedEffect) && input.expectedEffect > 0 ? input.expectedEffect : null;

    const items = [];
    items.push(h('li', null,
      h('span', null, 'Evidence grade'),
      h('strong', { class: retrospective ? 'tone-caution' : 'tone-good' },
        retrospective ? 'Retrospective — hypothesis generation only' : 'Pre-registered — counts as evidence'),
    ));
    if (retrospective) {
      items.push(h('li', null,
        h('span', null, 'Why'),
        h('strong', null, 'The intervention date is before today, so the outcome may already have influenced this hypothesis. The app still evaluates it; it will never call it confirmation.'),
      ));
    }
    if (plan.ok) {
      items.push(h('li', null,
        h('span', null, 'Smallest detectable shift'),
        h('strong', null, `${num(plan.mde)} ${choice.unit} (${num(plan.mdePctOfMean, 0)}% of the current mean)`),
      ));
      items.push(h('li', null,
        h('span', null, 'Your prediction'),
        h('strong', null, target === null
          ? 'no magnitude — a direction only'
          : `${num(target)} ${choice.unit}${plan.detectable ? ' — detectable by this design' : ' — BELOW the noise floor'}`),
      ));
      if (target !== null && !plan.detectable) {
        items.push(h('li', null,
          h('span', null, 'Recommendation'),
          h('strong', null, plan.requiredPostWeeks
            ? `lengthen the window to about ${plan.requiredPostWeeks} weeks, or predict a larger effect`
            : 'this metric is too noisy for the effect you expect — either accept a null result or choose a steadier metric'),
        ));
      }
    } else {
      items.push(h('li', null, h('span', null, 'Precision'), h('strong', null, plan.reason)));
    }
    items.push(h('li', null,
      h('span', null, 'Window closes'),
      h('strong', null, formatDate(studyHorizonEnd({ windowStart: input.windowStart, windowWeeks: input.windowWeeks }))),
    ));

    preview.replaceChildren(h('h3', { class: 'impact-subhead' }, 'Before you commit'), h('ul', { class: 'impact-facts' }, ...items));
  }

  for (const node of [metricSelect, typeSelect, dateInput, baselineInput, windowInput, alphaSelect, effectInput]) {
    node.addEventListener('input', renderPreview);
    node.addEventListener('change', renderPreview);
  }
  renderPreview();

  const body = h('div', { class: 'stack' },
    h('p', { class: 'muted' },
      'A study is one falsifiable sentence, one metric, and one date. Everything else — the counterfactual, the noise floor, the placebo tests — is computed for you. The only thing you cannot delegate is saying what you expected before you saw it.'),
    fieldRow({ label: 'What you called the intervention', id: 'imp-title', control: titleInput, required: true, hint: 'Short. It will appear on the ledger and in the board brief.' }),
    fieldRow({ label: 'Metric it was supposed to move', id: 'imp-metric', control: metricSelect, hint: 'Only metrics with a reconstructed history can be evaluated. Others are listed so you can see what is missing rather than wondering.' }),
    fieldRow({ label: 'Kind of intervention', id: 'imp-type', control: typeSelect }),
    fieldRow({ label: 'Label for the specific record', id: 'imp-label', control: labelInput, hint: 'Optional. If the intervention already exists as a case, change or decision, name it and the ledger can link to it.' }),
    fieldRow({ label: 'Day the intervention started', id: 'imp-date', control: dateInput, hint: 'Not the day you decided to do it — the day the practice actually began. This date anchors every calculation.' }),
    h('div', { class: 'form-grid' },
      fieldRow({ label: 'Baseline weeks', id: 'imp-baseline', control: baselineInput, hint: 'How far back the counterfactual looks.' }),
      fieldRow({ label: 'Evaluation window', id: 'imp-window', control: windowInput, hint: 'Long enough for the effect to show, short enough that it is still about this intervention.' }),
    ),
    fieldRow({ label: 'Evidence threshold (α)', id: 'imp-alpha', control: alphaSelect, hint: 'How much evidence you demand before believing yourself. Loosen it and the ledger will still report p — but a finding at 0.20 is not one to take to a board.' }),
    fieldRow({ label: 'Your hypothesis, in one falsifiable sentence', id: 'imp-hypothesis', control: hypothesisInput, required: true, hint: 'Say what should move and in which direction. "The team will feel better" cannot be wrong, which is why it cannot be tested.' }),
    h('div', { class: 'form-grid' },
      fieldRow({ label: 'Effect you expect (metric units)', id: 'imp-effect', control: effectInput, hint: 'Optional, and the single most useful thing you can record: it is what makes your optimism measurable later.' }),
      fieldRow({ label: 'Confidence (50–95)', id: 'imp-confidence', control: confidenceInput, hint: 'Only with a magnitude. Scored with a Brier score exactly like a decision forecast.' }),
    ),
    preview,
    errorNode,
  );

  const dialog = openModal({
    title: 'Declare a study',
    description: 'Pre-registration, without the jargon.',
    body,
    footer: [
      { label: 'Cancel', onClick: (close) => close() },
      {
        label: 'Declare study',
        primary: true,
        onClick: (close) => {
          errorNode.textContent = '';
          const input = current();
          const title = titleInput.value.trim();
          const hypothesis = hypothesisInput.value.trim();
          if (!title) { errorNode.textContent = 'Give the study a short title.'; titleInput.focus(); return; }
          if (!hypothesis) { errorNode.textContent = 'Write the falsifiable sentence. Without it there is nothing to be right or wrong about.'; hypothesisInput.focus(); return; }
          const result = ctx.api.createImpactStudy({
            title,
            hypothesis,
            vitalId: input.vitalId,
            interventionType: typeSelect.value,
            interventionLabel: labelInput.value,
            windowStart: input.windowStart,
            baselineWeeks: input.baselineWeeks,
            windowWeeks: input.windowWeeks,
            alpha: input.alpha,
            expectedEffect: effectInput.value === '' ? null : effectInput.value,
            expectedConfidence: confidenceInput.value === '' ? null : confidenceInput.value,
          });
          if (!result.ok) {
            errorNode.textContent = result.error;
            if (result.field === 'title') titleInput.focus();
            return;
          }
          close();
          toast(
            input.windowStart < todayISO ? 'Study declared — retrospective, so it cannot confirm anything.' : 'Study pre-registered. Change nothing until the window closes.',
            input.windowStart < todayISO ? 'caution' : 'good',
          );
          ctx.refresh();
        },
      },
    ],
  });
  titleInput.focus();
  return dialog;
}

/* ----------------------------------------------------------------- score */

export function openScoreStudyDialog({ ctx, study }) {
  const vital = vitalChoices(ctx.state, ctx.now).find((c) => c.id === study.vitalId);
  const evaluation = evaluateStudy(study, ctx.state, { now: ctx.now });
  const verdict = VERDICTS[evaluation.verdict] || VERDICTS.inconclusive;
  const grade = gradeOf(study);

  const notes = h('textarea', { id: 'imp-outcome', rows: '3', maxlength: '4000', placeholder: 'What will you do differently next quarter? (optional)' });
  const errorNode = h('p', { class: 'field-error', role: 'alert' });

  const facts = h('ul', { class: 'impact-facts' },
    h('li', null, h('span', null, 'Verdict'), h('strong', { class: `tone-${verdict.tone}` }, verdict.label)),
    h('li', null, h('span', null, 'Evidence grade'), h('strong', { class: grade === 'confirmatory' ? 'tone-good' : 'tone-caution' }, grade === 'confirmatory' ? 'Pre-registered' : 'Retrospective')),
    ...(evaluation.ok
      ? [
        h('li', null, h('span', null, 'Level shift'), h('strong', null, `${num(evaluation.estimate)} ${evaluation.unit}${evaluation.estimatePct !== null ? ` (${num(evaluation.estimatePct, 1)}% of baseline)` : ''}`)),
        h('li', null, h('span', null, 'Noise floor (MDE)'), h('strong', null, `${num(evaluation.its?.mde)} ${evaluation.unit}`)),
        h('li', null, h('span', null, 'Placebo test'), h('strong', null, evaluation.placeboSource ? `p = ${num(evaluation.placeboP, 3)} (${evaluation.placeboSource})` : 'none had the resolution to bind')),
        h('li', null, h('span', null, 'Fitted on'), h('strong', null, `${evaluation.coverage?.observed ?? '—'} of ${evaluation.coverage?.total ?? '—'} periods`)),
      ]
      : [h('li', null, h('span', null, 'Why not'), h('strong', null, evaluation.reason || 'not evaluable'))]),
  );

  const body = h('div', { class: 'stack' },
    h('p', { class: 'muted' },
      `You predicted: “${study.hypothesis || 'no hypothesis recorded'}”`),
    facts,
    h('p', { class: 'impact-plain' }, verdict.plain),
    evaluation.ok && evaluation.coverage && evaluation.coverage.gaps > 0
      ? h('p', { class: 'muted' },
        `${evaluation.coverage.gaps} period(s) in this window had no measurement. They were skipped rather than filled with a zero, which is why the fit rests on ${evaluation.coverage.observed} observations.`)
      : null,
    grade === 'exploratory'
      ? h('p', { class: 'muted' }, 'Because this hypothesis was recorded after the intervention started, it will be filed as retrospective. A retrospective result is worth having — it just cannot be called confirmation.')
      : null,
    fieldRow({ label: 'What changes because of this?', id: 'imp-outcome', control: notes, hint: 'Stored with the frozen result. Optional, but the leader who writes it down acts on it.' }),
    errorNode,
    h('p', { class: 'muted small' }, `Scoring freezes this evaluation permanently. ${vital ? 'The metric, the window and the hypothesis can never be changed afterwards.' : ''}`),
  );

  openModal({
    title: 'Score and lock',
    description: 'This is the last reversible moment.',
    body,
    footer: [
      { label: 'Not yet', onClick: (close) => close() },
      {
        label: 'Lock the result',
        primary: true,
        onClick: (close) => {
          errorNode.textContent = '';
          const result = ctx.api.lockImpactStudy(study.id, { outcomeNotes: notes.value });
          if (!result.ok) { errorNode.textContent = result.error; return; }
          close();
          toast(`Scored: ${(VERDICTS[result.verdict] || verdict).label}.`, result.verdict === 'supported' ? 'good' : result.verdict === 'not-supported' ? 'bad' : 'neutral');
          ctx.refresh();
        },
      },
    ],
  });
}

