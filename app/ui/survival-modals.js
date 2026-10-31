/**
 * app/ui/survival-modals.js — the three dialogs of the Delivery Survival
 * terminal (Schema v63).
 *
 *   openFreezeReadingDialog   choose a horizon and a review date, see exactly
 *                             what will be frozen, then freeze it
 *   openGradeReadingDialog    show what the reading predicted and what each item
 *                             did, then grade once
 *   confirmDeleteReading      delete an *ungraded* reading (a graded one is
 *                             evidence and cannot be removed)
 *
 * The freeze dialog previews the predictions before committing them. That is
 * deliberate: a frozen reading is immutable, so the leader should see the
 * numbers — including the ones that will look bad — before they become a record.
 */

import { h, toast, openModal } from './dom.js';
import { addDays, dayKey } from '../core/time.js';
import { buildPredictionSet, conventionsFromSettings, survivalReport } from '../core/domain/survival.js';

function field(id, label, control, hint = null) {
  return h('div', { class: 'stack-xs' },
    h('label', { for: id }, label),
    control,
    hint ? h('span', { class: 'muted small' }, hint) : null);
}

function pct(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `${Number(value).toFixed(1)}%`;
}

export function openFreezeReadingDialog(ctx) {
  const conventions = conventionsFromSettings(ctx.state.settings || {});
  const today = dayKey(ctx.now);
  const horizon = h('input', {
    id: 'surv-horizon',
    type: 'number',
    min: '1',
    max: '180',
    step: '1',
    value: String(conventions.horizonDays),
  });
  const reviewOn = h('input', {
    id: 'surv-review',
    type: 'date',
    value: addDays(today, conventions.horizonDays),
  });
  const label = h('input', {
    id: 'surv-label',
    type: 'text',
    maxlength: '200',
    value: `Delivery reading, ${conventions.horizonDays} day horizon`,
  });
  const preview = h('div', { class: 'stack-sm' });

  function renderPreview() {
    const days = Number(horizon.value) || conventions.horizonDays;
    const report = survivalReport(ctx.state, ctx.now, ctx.state.settings || {});
    const predictions = buildPredictionSet(report, { ...conventions, horizonDays: days }, conventions.maxPredictions);
    preview.replaceChildren();
    if (!predictions.length) {
      preview.appendChild(h('p', { class: 'muted' },
        'No open item has a reading yet, so nothing can be frozen. A probability needs at least the declared at-risk floor in its class at the item’s current age — and freezing an empty reading would be a receipt for a page view, not a forecast.'));
      return;
    }
    preview.appendChild(h('p', { class: 'muted' },
      `${predictions.length} item(s) would be frozen at a ${days}-day horizon. Every probability below is conditional on the item having already survived its current age, and none of them can be edited after this dialog closes.`));
    preview.appendChild(h('ul', { class: 'stack-xs' },
      ...predictions.slice(0, 12).map((row) => h('li', null,
        h('strong', null, row.title || row.sourceId),
        ` · ${row.elapsedDays}d old · ${pct(row.probabilityPct)} (at risk ${row.atRisk ?? '—'})`)),
      predictions.length > 12 ? h('li', { class: 'muted' }, `…and ${predictions.length - 12} more`) : null));
  }

  horizon.addEventListener('input', renderPreview);
  renderPreview();

  const dialog = openModal({
    title: 'Freeze a delivery reading',
    description: 'A frozen reading is a prediction with a date. It is scored later, not revised later.',
    body: h('div', { class: 'stack' },
      field('surv-label', 'What is this reading called?', label, 'A name you will recognise on the review date.'),
      field('surv-horizon', 'Forward horizon (days)', horizon, 'How far ahead each item’s chance of finishing is measured.'),
      field('surv-review', 'Review date', reviewOn, 'The date the claim is settled. It must be in the future.'),
      preview),
    footer: [
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const result = ctx.api.freezeSurvivalReading({
            label: label.value,
            horizonDays: horizon.value,
            reviewOn: reviewOn.value,
          });
          if (result && result.ok) {
            dialog.close();
            toast('Reading frozen. It will be graded on its review date — not before.', 'good');
            ctx.navigate(`#/survival?panel=readings&reading=${encodeURIComponent(result.id)}`);
          } else {
            toast((result && result.error) || 'Could not freeze the reading.', 'bad');
          }
        },
      }, 'Freeze it'),
    ],
  });
}

export function openGradeReadingDialog(ctx, reading) {
  const reviewOn = reading.reviewOn || '—';
  const predictions = reading.predictions || [];
  const body = h('div', { class: 'stack' },
    h('p', null,
      `This reading was frozen on ${reading.frozenOn || '—'} with ${predictions.length} item prediction(s), to be settled on ${reviewOn}. Grading attaches the outcome from each source record and scores the probabilities with the Brier rule. The probabilities themselves are not touched.`),
    h('ul', { class: 'stack-xs' },
      ...predictions.slice(0, 15).map((prediction) => h('li', null,
        `${prediction.title || prediction.sourceId} · frozen at ${pct(prediction.probabilityPct)} after ${prediction.elapsedDays}d`))),
    h('p', { class: 'muted small' },
      'Below five settled items the skill score is withheld: four items cannot demonstrate that a model beats a base rate. An item still open at review is not settled and is excluded rather than counted as a miss.'));

  const dialog = openModal({
    title: 'Grade this reading',
    description: 'One grade. After this the record is evidence and cannot be deleted or re-scored.',
    body,
    footer: [
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const result = ctx.api.gradeSurvivalReading(reading.id);
          if (result && result.ok) {
            const grade = result.grade || {};
            dialog.close();
            toast(`Graded: Brier ${grade.brier} against a ${grade.baselineBrier} base rate over ${grade.settledCount} item(s).`, 'good');
            ctx.navigate(`#/survival?panel=readings&reading=${encodeURIComponent(reading.id)}`);
          } else {
            toast((result && result.error) || 'Could not grade the reading.', 'bad');
          }
        },
      }, 'Grade it'),
    ],
  });
}

export function confirmDeleteReading(ctx, reading) {
  const dialog = openModal({
    title: 'Delete this frozen reading?',
    description: 'Only an ungraded reading can be deleted.',
    body: h('p', null,
      `“${reading.label}” has not been graded yet. Deleting it removes the freeze and its typed links to the items it named. A graded reading cannot be deleted at all — a scored forecast is the only evidence the workspace has that its curve was ever right or wrong.`),
    footer: [
      h('button', {
        class: 'btn btn-danger',
        type: 'button',
        onClick: () => {
          const result = ctx.api.deleteSurvivalReading(reading.id);
          if (result && result.ok) {
            dialog.close();
            toast('Reading deleted.', 'neutral');
            ctx.navigate('#/survival?panel=readings');
          } else {
            toast((result && result.error) || 'Could not delete the reading.', 'bad');
          }
        },
      }, 'Delete it'),
    ],
  });
}
