/**
 * app/ui/supply-modals.js — the two dialogs of the Evidence Supply Chain
 * (Schema v79).
 *
 *   openFreezeSupplyPlanDialog   commit leader hours to the lines the record says
 *                                are starving, with a live preview of the
 *                                assumption-free probability before committing
 *   openSupplyConventionsDialog  declare the one input the engine cannot derive —
 *                                the leader minutes one more unit costs — and the
 *                                floors that decide what counts as starved
 *
 * Both preview the effect before writing, because a freeze fires a scan: capture
 * tasks, typed edges and (on a manual scan) a governed capacity decision all
 * update in the same transaction.
 */

import { h, toast, openModal } from './dom.js';
import { supplyReport } from '../core/domain/supply.js';
import { SUPPLY_LINES } from '../core/domain/supplyRegistry.js';

function field(id, label, control, hint = null) {
  return h('div', { class: 'stack-xs' },
    h('label', { for: id }, label),
    control,
    hint ? h('span', { class: 'muted small' }, hint) : null);
}

function pct(value, dp = 1) {
  if (value === null || value === undefined) return '—';
  return `${Number(value).toFixed(dp)}%`;
}

export function openFreezeSupplyPlanDialog(ctx) {
  const report = supplyReport(ctx.state, ctx.now, ctx.state.settings || {});
  const scope = h('select', { id: 'supply-scope' },
    h('option', { value: 'planned' }, `Only the lines the schedule fits (${report.preview.chosen.length})`),
    h('option', { value: 'all' }, `Every line below its floor (${report.lines.filter((l) => l.shortfall > 0).length})`));
  const reviewDays = h('input', {
    id: 'supply-review-days',
    type: 'number',
    min: '7',
    max: '365',
    step: '1',
    value: String(report.conventions.supplyReviewHorizonDays),
  });
  const preview = h('div', { class: 'stack-xs' });

  const renderPreview = () => {
    preview.replaceChildren();
    const members = scope.value === 'all'
      ? report.lines.filter((line) => line.shortfall > 0)
      : report.lines.filter((line) => line.shortfall > 0
        && report.preview.chosen.some((row) => row.key === line.key));
    if (!members.length) {
      preview.append(h('p', { class: 'muted' },
        'Nothing to plan: every line is either already at its floor or has no open work waiting on it.'));
      return;
    }
    const perMember = members.map((line) => Math.max(0, Math.min(1, line.pClearBeforeHorizonPct / 100)));
    const frechet = Math.max(...perMember);
    const independence = 1 - perMember.reduce((product, p) => product * (1 - p), 1);
    const hours = members.reduce((sum, line) => sum + line.captureHours, 0);
    preview.append(
      h('p', { class: 'small' },
        h('strong', {}, `${members.length} line(s), ${hours.toFixed(2)} hour(s) committed. `),
        `The quoted probability that at least one clears is ${pct(frechet * 100)} — the Fréchet lower bound, which holds with no independence assumption. `
        + `Combining the same numbers as if the lines were independent would give ${pct(independence * 100)}; the gap is what the assumption is worth.`),
      ...members.map((line) => h('div', { class: 'kv' },
        h('span', {}, line.label),
        h('span', { class: 'muted' },
          `${line.n}/${line.required} · ${line.captureHours}h · ${pct(line.pClearBeforeHorizonPct)} inside ${line.horizonDays}d`))),
    );
  };
  scope.addEventListener('change', renderPreview);
  renderPreview();

  const dialog = openModal({
    title: 'Freeze an evidence plan',
    description: 'A frozen plan is a promise you can be graded on: it records what you committed to manufacture, the hours it costs and one probability. The lines are never filled by the plan — only by real records.',
    size: 'lg',
    body: h('div', { class: 'stack' },
      field('supply-scope', 'Which lines does the plan commit to?', scope),
      field('supply-review-days', 'Review in (days)', reviewDays,
        'The plan can only be graded after this window closes.'),
      preview),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn',
        type: 'button',
        onClick: () => {
          const result = ctx.api.freezeSupplyPlan({ lines: scope.value, reviewDays: Number(reviewDays.value) });
          if (result && result.ok) {
            dialog.close();
            toast(`Plan frozen for ${result.reviewOn}: ${result.record.hoursCommitted}h committed at ${pct(result.record.predictedAnyClearPct)}.`, 'good');
            ctx.rerender();
            return;
          }
          toast((result && result.error) || 'Could not freeze the plan.', 'bad');
        },
      }, 'Freeze plan'),
    ],
  });
}

export function openSupplyConventionsDialog(ctx) {
  const settings = ctx.state.settings || {};
  const report = supplyReport(ctx.state, ctx.now, settings);
  const minutesInputs = SUPPLY_LINES.map((line) => ({
    key: line.key,
    input: h('input', {
      id: `supply-min-${line.key}`,
      type: 'number',
      min: '5',
      max: '480',
      step: '5',
      value: String(report.conventions.supplyMinutesPerUnit[line.key] ?? line.defaultMinutes),
    }),
  }));
  const hoursInput = h('input', {
    id: 'supply-hours',
    type: 'number',
    min: '0.5',
    max: '40',
    step: '0.25',
    value: String(report.conventions.supplyWeeklyHours),
  });
  const starveInput = h('input', {
    id: 'supply-starve',
    type: 'number',
    min: '10',
    max: '95',
    step: '5',
    value: String(report.conventions.supplyStarvePct),
  });
  const ratioInput = h('input', {
    id: 'supply-ratio',
    type: 'number',
    min: '0.1',
    max: '20',
    step: '0.1',
    value: String(report.conventions.supplyCaptureRatio),
  });

  const dialog = openModal({
    title: 'Supply conventions',
    description: 'These are declarations, not statistics — the exchange rate you are willing to accept between your own hours and weeks of waiting.',
    size: 'lg',
    body: h('div', { class: 'stack' },
      h('div', { class: 'grid-cards' },
        field('supply-hours', 'Evidence hours per week', hoursInput, 'The rope: no plan may commit more than this.'),
        field('supply-starve', 'Starved below (%)', starveInput,
          'A line is starved when its chance of reaching the floor inside the horizon falls below this.'),
        field('supply-ratio', 'Weeks saved per hour', ratioInput,
          'Capture beats waiting only when one hour of your time buys at least this many weeks of wait.')),
      h('h4', {}, 'Minutes to manufacture one unit'),
      h('p', { class: 'muted small' },
        'The engine cannot derive what your time costs. It can only price the wait. Declare the honest number: time to settle an assumption, put a date on a call, close a delegation.'),
      ...minutesInputs.map((row) => {
        const meta = SUPPLY_LINES.find((line) => line.key === row.key);
        return field(`supply-min-${row.key}`, meta.label, row.input, `One ${meta.unitLabel}.`);
      })),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn',
        type: 'button',
        onClick: () => {
          const minutes = {};
          for (const row of minutesInputs) minutes[row.key] = Number(row.input.value);
          const result = ctx.api.setSupplyConventions({
            supplyMinutesPerUnit: minutes,
            supplyWeeklyHours: Number(hoursInput.value),
            supplyStarvePct: Number(starveInput.value),
            supplyCaptureRatio: Number(ratioInput.value),
          });
          if (result && result.ok) {
            dialog.close();
            toast('Supply conventions updated — the schedule and every verdict were recomputed.', 'good');
            ctx.rerender();
            return;
          }
          toast((result && result.error) || 'Could not save the conventions.', 'bad');
        },
      }, 'Save conventions'),
    ],
  });
}
