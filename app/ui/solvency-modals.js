/**
 * app/ui/solvency-modals.js — the three dialogs of the Promise Solvency Terminal
 * (Schema v80).
 *
 *   openFreezeSolvencyDialog      quote the book's breach probability, with the
 *                                 assumption-free interval and the expected count
 *                                 shown before anything is written
 *   openSolvencyConventionsDialog declare the numbers the engine cannot derive —
 *                                 the correlation, the alarm, the on-time bar and
 *                                 the price of a late breach
 *   openRenegotiatePromiseDialog  move one promise's date, with a reason, under
 *                                 the leader's own move cap
 *
 * All three preview the effect before writing, because each one fires the rule
 * spine: a freeze opens repair tasks, typed edges and (on a coverage deficit) one
 * governed decision in the same transaction.
 */

import { h, toast, openModal } from './dom.js';
import {
  findPromise,
  jointBreachRisk,
  promiseMoves,
  solvencyReport,
} from '../core/domain/solvency.js';
import { addDays, dayKey } from '../core/time.js';

function field(id, label, control, hint = null) {
  return h('div', { class: 'stack-xs' },
    h('label', { for: id }, label),
    control,
    hint ? h('span', { class: 'muted small' }, hint) : null);
}

const pct = (v, dp = 1) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : `${Number(v).toFixed(dp)}%`);
const num = (v, dp = 2) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : Number(v).toFixed(dp));

export function openFreezeSolvencyDialog(ctx) {
  const report = solvencyReport(ctx.state, ctx.now, ctx.state.settings || {});
  const reviewDays = h('input', {
    id: 'solvency-review-days',
    type: 'number',
    min: '7',
    max: '365',
    step: '1',
    value: String(report.conventions.solvencyReviewHorizonDays),
  });
  const preview = h('div', { class: 'stack-xs' });

  const render = () => {
    preview.replaceChildren();
    if (!report.exposures.length) {
      preview.append(h('p', { class: 'muted' },
        'Nothing to freeze: no promise falls due inside the horizon with a measurable history. A reading with no exposure would be a quote with no claim.'));
      return;
    }
    const pds = report.exposures.map((p) => p.pd);
    const atDeclared = jointBreachRisk({ pds, rho: report.conventions.solvencyRhoPct / 100 });
    const atZero = jointBreachRisk({ pds, rho: 0 });
    preview.append(
      h('p', { class: 'small' },
        h('strong', {}, `${report.exposures.length} exposure(s) priced. `),
        `The quoted probability of at least one breach is ${pct(atDeclared.pAny * 100)} at your declared ρ of ${report.conventions.solvencyRhoPct}%, `
        + `and ${pct(atZero.pAny * 100)} if every promise were independent. The assumption-free Fréchet interval is `
        + `${pct(atDeclared.frechetLow * 100)} to ${pct(atDeclared.frechetHigh * 100)}; the ceiling is stored and graded beside the model, so the price of the correlation assumption is measured later.`),
      h('div', { class: 'kv' }, h('span', {}, 'Expected breaches'), h('span', { class: 'muted' },
        `${num(report.joint.expectedBreaches, 2)} across ${report.exposures.length} promise(s) — needs no dependence assumption`)),
      h('div', { class: 'kv' }, h('span', {}, 'Coverage'), h('span', { class: 'muted' },
        report.capacity.coverageRatio === null ? 'refused' : `${num(report.capacity.coverageRatio, 2)}× · ${report.capacity.dueNext28} due in 28d`)),
      h('div', { class: 'kv' }, h('span', {}, 'Already late'), h('span', { class: 'muted' },
        `${report.counts.overdue} promise(s) — counted separately, never folded into the forward probability`)),
      ...report.exposures.slice(0, 6).map((p) => h('div', { class: 'kv' },
        h('span', {}, `${p.sourceLabel} · ${p.obligationOn}`),
        h('span', { class: 'muted' }, pct(p.pdPct)))),
    );
  };
  render();

  const dialog = openModal({
    title: 'Freeze a promise reading',
    description: 'A frozen reading is a claim you can be graded on: these named promises, this probability, this horizon. Nothing is written to another module by freezing — the rules open work, they never move a date.',
    size: 'lg',
    body: h('div', { class: 'stack' },
      field('solvency-review-days', 'Review in (days)', reviewDays,
        'The reading can only be graded after this window closes.'),
      preview),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn',
        type: 'button',
        onClick: () => {
          const result = ctx.api.freezeSolvencyReading({ reviewDays: Number(reviewDays.value) });
          if (result && result.ok) {
            dialog.close();
            toast(`Reading frozen for ${result.reviewOn}: ${pct(result.record.predictedAnyBreachPct)} any breach, ${num(result.record.expectedBreaches, 2)} expected.`, 'good');
            ctx.refresh();
            return;
          }
          toast((result && result.error) || 'Could not freeze the reading.', 'bad');
        },
      }, 'Freeze reading'),
    ],
  });
}

export function openSolvencyConventionsDialog(ctx) {
  const settings = ctx.state.settings || {};
  const report = solvencyReport(ctx.state, ctx.now, settings);
  const c = report.conventions;
  const numberInput = (id, label, value, min, max, step = '1', hint = null) => field(
    id,
    label,
    h('input', {
      id, type: 'number', min: String(min), max: String(max), step, value: String(value),
    }),
    hint,
  );

  const windowInput = numberInput('solvency-window', 'Settlement window (days)', c.solvencyWindowDays, 28, 730, '7',
    'The window the settlement history — and therefore every probability — is measured over.');
  const horizonInput = numberInput('solvency-horizon', 'Pricing horizon (days)', c.solvencyHorizonDays, 7, 365, '7',
    'Only promises falling due inside this window enter the joint probability.');
  const rhoInput = numberInput('solvency-rho', 'Declared correlation ρ (%)', c.solvencyRhoPct, 0, 95, '5',
    'How much promises break together rather than independently. Declared, never derived; the assumption-free interval is printed beside it.');
  const alarmInput = numberInput('solvency-alarm', 'Alarm — share of the book expected to break (%)', c.solvencyAlarmPct, 5, 95, '5',
    'Set on the share rather than on P(at least one), which saturates near 100% for any book of a dozen promises.');
  const barInput = numberInput('solvency-bar', 'On-time bar for a source to count as reliable (%)', c.solvencyOnTimeBarPct, 30, 99, '5');
  const historyInput = numberInput('solvency-history', 'Settled promises before a source prices anything', c.solvencyMinHistory, 3, 40, '1',
    'Below this floor a source is unproven and prices nothing from its own record.');
  const multiplierInput = numberInput('solvency-multiplier', 'Cost of a late breach ÷ cost of an early ask', c.solvencyBreachMultiplier, 1.5, 10, '0.5',
    'A declared convention grounded in trust-repair asymmetry, not a measurement. It decides when a renegotiation is worth the ask.');
  const movesInput = numberInput('solvency-moves', 'Move cap before a promise needs a decision', c.solvencyMaxMoves, 1, 5, '1',
    'At the cap the repair is a decision — cut the scope, hand it over, or withdraw it — not another date.');
  const reviewInput = numberInput('solvency-review', 'Default review horizon for a frozen reading (days)', c.solvencyReviewHorizonDays, 7, 365, '7');
  const poolingInput = h('input', { id: 'solvency-pooling', type: 'checkbox' });
  poolingInput.checked = c.solvencyAllowPooling;
  const autoInput = h('input', { id: 'solvency-auto', type: 'checkbox' });
  autoInput.checked = c.solvencyAutoPropagate;

  const dialog = openModal({
    title: 'Promise solvency conventions',
    description: 'Every number here is declared, not measured. Changing one changes what the terminal reports — the method panel prints the values in force.',
    size: 'lg',
    body: h('div', { class: 'stack' },
      windowInput,
      horizonInput,
      rhoInput,
      alarmInput,
      barInput,
      historyInput,
      multiplierInput,
      movesInput,
      reviewInput,
      field('solvency-pooling', 'Allow counterparty-class pooling',
        h('label', { class: 'inline-check' }, poolingInput, h('span', {}, 'A source with no history may borrow its counterparty class’s settlement curve, labelled as such')),
        'Refusing pooling leaves those promises unpriced — listed and counted, never assumed safe.'),
      field('solvency-auto', 'Automatic propagation',
        h('label', { class: 'inline-check' }, autoInput, h('span', {}, 'Open repair tasks and edges when a reading is frozen')),
        'Pausing automation never blocks an explicit scan.'),
    ),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn',
        type: 'button',
        onClick: () => {
          const result = ctx.api.setSolvencyConventions({
            solvencyWindowDays: Number(windowInput.querySelector('input').value),
            solvencyHorizonDays: Number(horizonInput.querySelector('input').value),
            solvencyRhoPct: Number(rhoInput.querySelector('input').value),
            solvencyAlarmPct: Number(alarmInput.querySelector('input').value),
            solvencyOnTimeBarPct: Number(barInput.querySelector('input').value),
            solvencyMinHistory: Number(historyInput.querySelector('input').value),
            solvencyBreachMultiplier: Number(multiplierInput.querySelector('input').value),
            solvencyMaxMoves: Number(movesInput.querySelector('input').value),
            solvencyReviewHorizonDays: Number(reviewInput.querySelector('input').value),
            solvencyAllowPooling: poolingInput.checked,
            solvencyAutoPropagate: autoInput.checked,
          });
          if (result && result.ok) {
            dialog.close();
            toast('Promise solvency conventions updated.', 'good');
            ctx.refresh();
            return;
          }
          toast((result && result.error) || 'Could not save the conventions.', 'bad');
        },
      }, 'Save conventions'),
    ],
  });
}

export function openRenegotiatePromiseDialog(ctx, { sourceKey, promiseId }) {
  const report = solvencyReport(ctx.state, ctx.now, ctx.state.settings || {});
  const promise = findPromise(ctx.state, sourceKey, promiseId);
  if (!promise) {
    toast('That promise no longer exists on its source record.', 'bad');
    return;
  }
  const moves = promiseMoves(ctx.state, sourceKey, promiseId);
  const maxMoves = report.method.maxMoves;
  const atCap = moves >= maxMoves;
  const exposure = report.book.find((p) => p.sourceKey === sourceKey && p.promiseId === promiseId);
  const today = dayKey(ctx.now);
  const suggested = addDays(promise.obligationOn > today ? promise.obligationOn : today, 7);
  const dateInput = h('input', {
    id: 'solvency-new-date', type: 'date', value: suggested, min: addDays(today, 1),
  });
  const reasonInput = h('textarea', {
    id: 'solvency-reason', rows: '3',
    placeholder: 'What changed, and what you are giving up to hold the new date.',
  });

  const body = h('div', { class: 'stack' },
    h('div', { class: 'stack-xs' },
      h('p', {}, h('strong', {}, promise.label)),
      h('div', { class: 'kv' }, h('span', {}, 'Owed for'), h('span', {}, promise.obligationOn)),
      h('div', { class: 'kv' }, h('span', {}, 'Source'), h('span', {}, sourceKey)),
      h('div', { class: 'kv' }, h('span', {}, 'P(breaks)'), h('span', {}, exposure && exposure.pdPct !== null ? pct(exposure.pdPct) : 'unpriced')),
      h('div', { class: 'kv' }, h('span', {}, 'Moves used'), h('span', {}, `${moves} of ${maxMoves}`)),
    ),
    atCap
      ? h('p', { class: 'small' },
        'This promise has reached your own move cap. Moving it again is not a renegotiation — decide whether to cut the scope, hand it over with the authority it needs, or withdraw it and say what will not happen. Record that decision on the decision record instead; this dialog will refuse the move.')
      : h('p', { class: 'small' },
        'Renegotiating early costs one unit of trust; a breach discovered late costs several. Say what changed, what the new date is, and what you are giving up to hold it — the reason is stored verbatim on an append-only ledger.'),
    field('solvency-new-date', 'New date', dateInput, atCap ? 'Disabled at the move cap.' : 'Must be later than the current date and inside a year.'),
    field('solvency-reason', 'What changed', reasonInput, 'At least a sentence. A date moved without a reason is the same promise made again with less credibility.'),
  );

  const dialog = openModal({
    title: atCap ? 'At the move cap — decide instead' : 'Renegotiate this promise',
    description: 'This is the only write in the module that touches another module\u2019s record: it changes the date on the source record and appends to the renegotiation ledger, in one transaction.',
    size: 'md',
    body,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn',
        type: 'button',
        onClick: () => {
          const result = ctx.api.renegotiatePromise({
            sourceKey,
            promiseId,
            toOn: dateInput.value,
            reason: reasonInput.value,
          });
          if (result && result.ok) {
            dialog.close();
            toast(`Moved from ${result.fromOn} to ${result.toOn}. The ledger now holds ${moves + 1} of ${maxMoves} move(s).`, 'good');
            ctx.refresh();
            return;
          }
          toast((result && result.error) || 'Could not move the date.', 'bad');
        },
      }, 'Move the date'),
    ],
  });
  if (atCap) {
    dateInput.disabled = true;
    reasonInput.disabled = true;
  }
}
