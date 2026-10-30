/**
 * app/ui/voi-modals.js — the dialogs of the Information Value Terminal
 * (Schema v54).
 *
 * Each dialog changes exactly one kind of thing:
 *
 *   - `openVoiFrameDialog` declares or edits a frame: the states with their
 *     probabilities, the options, and the payoff table. It never decides.
 *   - `openVoiDecideDialog` records the choice. It shows the expected value of
 *     every option and requires a written reason when the choice disagrees with
 *     the arithmetic — not to push the leader towards the arithmetic, but so the
 *     disagreement is a recorded judgement rather than a default.
 *   - `openVoiInvestigationDialog` declares a test and shows, live, what it
 *     would be worth before it is saved.
 *   - `openVoiSettleInquiryDialog` records which signal arrived and shows the
 *     likelihood ratio that will be written into the premise ledger.
 *   - `openVoiOutcomeDialog` records which state actually happened, so the
 *     declared distribution is scored instead of rewritten.
 *   - `openVoiPolicyDialog` changes the workspace conventions and says so.
 *
 * All are keyboard-operable, every control has a bound label, and no destructive
 * action is behind a single unlabelled control.
 */

import { h, toast, openModal } from './dom.js';
import {
  VOI_CONVENTIONS,
  INQUIRY_SIGNAL_LABELS,
  conventionsFromSettings,
  evaluateFrame,
  evaluateInquiry,
  likelihoodRatioFor,
} from '../core/domain/valueOfInformation.js';
import { VOI_CURRENCIES } from '../core/domain/valueOfInformationSchema.js';

function activePeople(ctx) {
  return (ctx.state.people || []).filter((person) => person && person.status !== 'archived');
}

function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function money(value, currency = 'USD') {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `${String(currency || 'USD').toUpperCase()} ${Math.round(Number(value)).toLocaleString('en-US')}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/* --------------------------------------------------------------- the frame */

export function openVoiFrameDialog(ctx, { frame = null } = {}) {
  const editing = Boolean(frame);
  const draft = {
    label: frame?.label || '',
    question: frame?.question || '',
    ownerId: frame?.ownerId || '',
    currency: frame?.currency || 'USD',
    states: (frame?.states || [
      { id: uid('vs'), label: 'It works', probability: 70, premiseId: null },
      { id: uid('vs'), label: 'It does not', probability: 30, premiseId: null },
    ]).map((state) => ({ ...state })),
    options: (frame?.options || [
      { id: uid('vo'), label: 'Commit now', isStatusQuo: false },
      { id: uid('vo'), label: 'Do nothing yet', isStatusQuo: true },
    ]).map((option) => ({ ...option })),
    payoffs: new Map((frame?.payoffs || []).map((cell) => [`${cell.optionId}::${cell.stateId}`, cell.value])),
  };

  const label = h('input', { id: 'voi-label', type: 'text', maxlength: '140', required: 'required', value: draft.label });
  const question = h('textarea', { id: 'voi-question', rows: '3', maxlength: '1600' });
  question.value = draft.question;
  const owner = h('select', { id: 'voi-owner' },
    h('option', { value: '' }, 'No single owner'),
    ...activePeople(ctx).map((person) => h('option', { value: person.id, ...(person.id === draft.ownerId ? { selected: 'selected' } : {}) }, person.name)));
  const currency = h('select', { id: 'voi-currency' },
    ...VOI_CURRENCIES.map((code) => h('option', { value: code, ...(code === draft.currency ? { selected: 'selected' } : {}) }, code)));

  const statesHost = h('div', { class: 'stack-sm' });
  const optionsHost = h('div', { class: 'stack-sm' });
  const payoffsHost = h('div', { class: 'stack-sm' });
  const sumLine = h('p', { class: 'muted small', role: 'status', 'aria-live': 'polite' });

  const premiseOptions = () => (ctx.state.premises || []).filter((row) => row && row.status !== 'retired');

  const renderStates = () => {
    statesHost.replaceChildren();
    draft.states.forEach((state, index) => {
      const nameInput = h('input', {
        id: `voi-state-label-${index}`,
        type: 'text',
        maxlength: '160',
        value: state.label,
        onInput: (event) => { state.label = event.target.value; },
      });
      const probInput = h('input', {
        id: `voi-state-prob-${index}`,
        type: 'number',
        min: '0',
        max: '100',
        step: '1',
        value: String(state.probability),
        onInput: (event) => {
          state.probability = Number(event.target.value);
          renderSum();
        },
      });
      const premiseSelect = h('select', {
        id: `voi-state-premise-${index}`,
        onChange: (event) => { state.premiseId = event.target.value || null; },
      },
      h('option', { value: '' }, 'Not tied to an assumption'),
      ...premiseOptions().map((premise) => h('option', {
        value: premise.id,
        ...(premise.id === state.premiseId ? { selected: 'selected' } : {}),
      }, premise.title)));
      statesHost.append(h('div', { class: 'form-grid' },
        h('div', { class: 'stack-xs' }, h('label', { for: `voi-state-label-${index}` }, `State ${index + 1}`), nameInput),
        h('div', { class: 'stack-xs' }, h('label', { for: `voi-state-prob-${index}` }, 'Probability %'), probInput),
        h('div', { class: 'stack-xs' }, h('label', { for: `voi-state-premise-${index}` }, 'Rests on assumption'), premiseSelect),
        h('div', { class: 'stack-xs' }, h('button', {
          class: 'btn btn-ghost btn-xs',
          type: 'button',
          disabled: draft.states.length <= 2 ? 'disabled' : null,
          onClick: () => {
            if (draft.states.length <= 2) return;
            draft.states = draft.states.filter((row) => row.id !== state.id);
            renderStates();
          },
        }, 'Remove'))));
    });
    renderSum();
  };

  const renderSum = () => {
    const sum = draft.states.reduce((acc, state) => acc + (Number(state.probability) || 0), 0);
    sumLine.textContent = sum === 100
      ? `Probabilities sum to 100%. Good.`
      : `Probabilities sum to ${sum}%. They have to sum to exactly 100 — the app will not rescale them, because then they would not be the numbers you declared.`;
    sumLine.className = sum === 100 ? 'muted small' : 'field-error small';
  };

  const renderOptions = () => {
    optionsHost.replaceChildren();
    draft.options.forEach((option, index) => {
      const nameInput = h('input', {
        id: `voi-option-label-${index}`,
        type: 'text',
        maxlength: '160',
        value: option.label,
        onInput: (event) => { option.label = event.target.value; },
      });
      const statusQuo = h('input', {
        id: `voi-option-sq-${index}`,
        type: 'checkbox',
        ...(option.isStatusQuo ? { checked: 'checked' } : {}),
        onChange: (event) => { option.isStatusQuo = event.target.checked; },
      });
      optionsHost.append(h('div', { class: 'form-grid' },
        h('div', { class: 'stack-xs' }, h('label', { for: `voi-option-label-${index}` }, `Option ${index + 1}`), nameInput),
        h('div', { class: 'stack-xs' },
          h('label', { for: `voi-option-sq-${index}` }, 'This is the status quo'),
          h('div', null, statusQuo)),
        h('div', { class: 'stack-xs' }, h('button', {
          class: 'btn btn-ghost btn-xs',
          type: 'button',
          disabled: draft.options.length <= 2 ? 'disabled' : null,
          onClick: () => {
            if (draft.options.length <= 2) return;
            draft.options = draft.options.filter((row) => row.id !== option.id);
            [...draft.payoffs.keys()].forEach((key) => {
              if (key.startsWith(`${option.id}::`)) draft.payoffs.delete(key);
            });
            renderOptions();
          },
        }, 'Remove'))));
    });
  };

  const renderPayoffs = () => {
    payoffsHost.replaceChildren();
    if (!draft.states.length || !draft.options.length) return;
    payoffsHost.append(h('p', { class: 'muted small' },
      'Leave a cell blank if the payoff is genuinely unknown. A blank cell is stored as unpriced and the arithmetic is refused — it is never treated as zero, because a zero would make the unknown option look free.'));
    const head = h('tr', null,
      h('th', { scope: 'col' }, 'Option / state'),
      ...draft.states.map((state, index) => h('th', { scope: 'col' }, state.label || `State ${index + 1}`)));
    const rows = draft.options.map((option, optionIndex) => h('tr', null,
      h('th', { scope: 'row' }, option.label || `Option ${optionIndex + 1}`),
      ...draft.states.map((state, stateIndex) => {
        const key = `${option.id}::${state.id}`;
        const value = draft.payoffs.get(key);
        return h('td', null, h('input', {
          id: `voi-payoff-${optionIndex}-${stateIndex}`,
          type: 'number',
          step: 'any',
          'aria-label': `${option.label || `Option ${optionIndex + 1}`} in ${state.label || `state ${stateIndex + 1}`}`,
          value: value === undefined || value === null ? '' : String(value),
          onInput: (event) => {
            const raw = event.target.value;
            if (raw === '') draft.payoffs.delete(key);
            else draft.payoffs.set(key, Number(raw));
          },
        }));
      })));
    payoffsHost.append(h('div', { class: 'table-wrap' },
      h('table', { class: 'table' },
        h('caption', { class: 'sr-only' }, 'Payoff table in the frame currency'),
        h('thead', null, head),
        h('tbody', null, ...rows))));
  };

  const all = () => {
    renderStates();
    renderOptions();
    renderPayoffs();
  };

  const dialog = openModal({
    title: editing ? 'Edit the decision frame' : 'Declare a decision frame',
    description: 'A frame is the smallest honest unit of this module: the states of the world you are pricing against, the options you would genuinely consider, and what each option pays in each state.',
    size: 'lg',
    body: h('div', { class: 'view-stack' },
      h('div', { class: 'form-grid' },
        h('div', { class: 'stack-xs' }, h('label', { for: 'voi-label' }, 'What is the decision?'), label),
        h('div', { class: 'stack-xs' }, h('label', { for: 'voi-owner' }, 'Accountable owner'), owner)),
      h('div', { class: 'stack-xs' },
        h('label', { for: 'voi-question' }, 'What is the question, exactly?'),
        question,
        h('span', { class: 'muted small' }, 'The outcome review restates this a horizon later. “Should we take the €400k commitment on the strength of the pilot?” is a frame. “Vendor decision” is a label.')),
      h('div', { class: 'stack-xs' }, h('label', { for: 'voi-currency' }, 'Currency'), currency),
      h('h3', { class: 'subhead' }, 'States of the world'),
      h('p', { class: 'muted small' }, 'Two to six mutually exclusive states, exhaustive enough that the one that happens is in the list. Probabilities are your priors and must sum to exactly 100%.'),
      statesHost,
      h('button', {
        class: 'btn btn-ghost btn-xs',
        type: 'button',
        disabled: draft.states.length >= 6 ? 'disabled' : null,
        onClick: () => {
          if (draft.states.length >= 6) return;
          draft.states.push({ id: uid('vs'), label: '', probability: 0, premiseId: null });
          renderStates();
          renderPayoffs();
        },
      }, 'Add a state'),
      sumLine,
      h('h3', { class: 'subhead' }, 'Options'),
      h('p', { class: 'muted small' }, 'Include the option you would take by doing nothing. An option set without the status quo makes the decision look more consequential than it is.'),
      optionsHost,
      h('button', {
        class: 'btn btn-ghost btn-xs',
        type: 'button',
        disabled: draft.options.length >= 5 ? 'disabled' : null,
        onClick: () => {
          if (draft.options.length >= 5) return;
          draft.options.push({ id: uid('vo'), label: '', isStatusQuo: false });
          renderOptions();
          renderPayoffs();
        },
      }, 'Add an option'),
      h('h3', { class: 'subhead' }, 'Payoff table'),
      payoffsHost),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const states = draft.states.map((state) => ({
            id: state.id,
            label: state.label,
            probability: Number(state.probability),
            premiseId: state.premiseId,
          }));
          const options = draft.options.map((option) => ({ id: option.id, label: option.label, isStatusQuo: Boolean(option.isStatusQuo) }));
          const payoffs = [...draft.payoffs.entries()].map(([key, value]) => {
            const [optionId, stateId] = key.split('::');
            return { optionId, stateId, value };
          });
          const payload = {
            label: label.value,
            question: question.value,
            ownerId: owner.value,
            currency: currency.value,
            states,
            options,
            payoffs,
          };
          const result = editing
            ? ctx.api.updateVoiDecision(frame.id, payload)
            : ctx.api.addVoiDecision(payload);
          if (!result.ok) { toast(result.error, 'bad'); return; }
          dialog.close();
          if (editing) {
            toast('Frame updated. The arithmetic re-derives on every load.', 'good');
            ctx.refresh();
          } else {
            toast('Frame declared. The expected values and the EVPI ceiling are on the page now.', 'good');
            ctx.navigate(`#/voi?frame=${encodeURIComponent(result.id)}&panel=frames`);
          }
        },
      }, editing ? 'Save the frame' : 'Declare the frame'),
    ],
  });

  all();
}

/* ---------------------------------------------------------------- decide */

export function openVoiDecideDialog(ctx, frame, evaluated) {
  const currency = frame.currency || 'USD';
  const reading = evaluated || evaluateFrame(frame, { conventions: conventionsFromSettings(ctx.state) });
  if (!reading.priced) {
    toast(`This frame cannot be valued yet: ${reading.reasons.join(' ')}`, 'bad');
    return;
  }
  const selected = { optionId: reading.best?.optionId || '' };
  const radios = (frame.options || []).map((option, index) => {
    const row = reading.options.find((entry) => entry.optionId === option.id);
    const input = h('input', {
      type: 'radio',
      name: 'voi-choice',
      id: `voi-choice-${index}`,
      value: option.id,
      ...(option.id === selected.optionId ? { checked: 'checked' } : {}),
      onChange: () => { selected.optionId = option.id; refresh(); },
    });
    return h('div', { class: 'stack-xs' }, h('label', { for: `voi-choice-${index}` },
      h('strong', null, option.label),
      option.id === reading.best?.optionId ? h('span', { class: 'muted small' }, ' — expected-value choice') : null,
      ` · ${money(row ? row.ev : null, currency)}`), input);
  });
  const note = h('textarea', { id: 'voi-decide-note', rows: '3', maxlength: '600' });
  const noteWrap = h('div', { class: 'stack-xs' },
    h('label', { for: 'voi-decide-note' }, 'Why this option?'),
    note,
    h('span', { class: 'muted small' }, 'Required when you choose against the expected-value option. A deliberate disagreement with the arithmetic is a judgement worth recording; an unrecorded one is indistinguishable from an accident.'));
  const status = h('p', { class: 'muted small', role: 'status', 'aria-live': 'polite' });
  const refresh = () => {
    const against = selected.optionId && reading.best && selected.optionId !== reading.best.optionId;
    noteWrap.style.display = against ? '' : 'none';
    status.textContent = against
      ? 'You are choosing against the expected-value option. That can be right — the robust or reversible option often is — but say why.'
      : `EVPI is ${money(reading.evpi, currency)}: the most perfect information could add to this decision.`;
  };

  const dialog = openModal({
    title: `Decide: ${frame.label}`,
    description: `EVPI ${money(reading.evpi, currency)} · stake ${money(reading.stake, currency)} · ${reading.nearTie ? 'a near-tie, so a small amount of evidence moves the ranking' : 'the top two options are separated'}. Deciding freezes these numbers against the record; it does not stop you revising the frame later.`,
    body: h('div', { class: 'view-stack' }, h('div', { class: 'stack-sm' }, ...radios), noteWrap, status),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const result = ctx.api.decideVoiDecision(frame.id, { chosenOptionId: selected.optionId, note: note.value });
          if (!result.ok) { toast(result.error, 'bad'); return; }
          dialog.close();
          toast('Decision recorded with its EVPI frozen. A dated review now holds it to that number.', 'good');
          ctx.refresh();
        },
      }, 'Record the decision'),
    ],
  });
  refresh();
}

/* ----------------------------------------------------------- investigate */

export function openVoiInvestigationDialog(ctx, frame) {
  const currency = frame.currency || 'USD';
  const label = h('input', { id: 'voi-study-label', type: 'text', maxlength: '140', required: 'required' });
  const method = h('textarea', { id: 'voi-study-method', rows: '2', maxlength: '600' });
  const sensitivity = h('input', { id: 'voi-study-se', type: 'number', min: '50', max: '100', step: '1', value: '75' });
  const specificity = h('input', { id: 'voi-study-sp', type: 'number', min: '50', max: '100', step: '1', value: '75' });
  const cost = h('input', { id: 'voi-study-cost', type: 'number', min: '0', step: 'any', value: '0' });
  const delay = h('input', { id: 'voi-study-delay', type: 'number', min: '0', step: 'any', value: '0' });
  const dueOn = h('input', { id: 'voi-study-due', type: 'date', min: todayIso() });
  const targets = new Set(frame.states?.length ? [frame.states[0].id] : []);
  const premiseEquivalent = h('input', { id: 'voi-premise-equivalent', type: 'checkbox' });
  const targetBoxes = (frame.states || []).map((state, index) => {
    const input = h('input', {
      id: `voi-study-target-${index}`,
      type: 'checkbox',
      ...(index === 0 ? { checked: 'checked' } : {}),
      onChange: (event) => {
        if (event.target.checked) targets.add(state.id);
        else targets.delete(state.id);
        preview();
      },
    });
    return h('div', { class: 'stack-xs' }, h('label', { for: `voi-study-target-${index}` }, state.label || 'Unnamed state'), input);
  });
  const previewHost = h('div', { role: 'status', 'aria-live': 'polite' });

  const preview = () => {
    const reading = evaluateInquiry(frame, {
      targetStateIds: [...targets],
      sensitivityPct: Number(sensitivity.value),
      specificityPct: Number(specificity.value),
      cost: Number(cost.value) || 0,
      delayCost: Number(delay.value) || 0,
    }, { conventions: conventionsFromSettings(ctx.state) });
    previewHost.replaceChildren();
    if (!reading.ok) {
      previewHost.append(h('p', { class: 'muted small' }, `Not valued: ${reading.reason}`));
      return;
    }
    previewHost.append(
      h('p', { class: reading.verdict === 'buy' ? '' : 'field-error' },
        `EVSI ${money(reading.evsi, currency)} · total cost of learning ${money(reading.totalCost, currency)} · net value ${money(reading.netValue, currency)} · ${reading.efficiencyPct === null ? 'no ceiling' : `${reading.efficiencyPct}% of the EVPI ceiling`}. `),
      h('p', { class: 'muted small' },
        reading.breakEvenSensitivityPct === null
          ? 'At this specificity, no achievable sensitivity makes this test worth its declared cost. That is an answer, not a missing number.'
          : `It first pays for itself at ${reading.breakEvenSensitivityPct}% sensitivity, holding specificity at ${specificity.value}%.`));
  };

  [sensitivity, specificity, cost, delay].forEach((input) => input.addEventListener('input', preview));

  const dialog = openModal({
    title: `Declare an investigation for “${frame.label}”`,
    description: 'State the accuracy you would defend, not the accuracy you hope for. EVSI is a function of these two numbers, so a flattering estimate is the easiest way to make an expensive test look worth buying.',
    size: 'lg',
    body: h('div', { class: 'view-stack' },
      h('div', { class: 'form-grid' },
        h('div', { class: 'stack-xs' }, h('label', { for: 'voi-study-label' }, 'What would you run?'), label),
        h('div', { class: 'stack-xs' }, h('label', { for: 'voi-study-cost' }, `Fee (${currency})`), cost),
        h('div', { class: 'stack-xs' }, h('label', { for: 'voi-study-delay' }, `What the wait costs (${currency})`), delay)),
      h('div', { class: 'stack-xs' }, h('label', { for: 'voi-study-method' }, 'How would it work?'), method),
      h('h3', { class: 'subhead' }, 'Which state of the world is the test designed to detect?'),
      h('div', { class: 'stack-sm' }, ...targetBoxes),
      h('div', { class: 'stack-xs' }, premiseEquivalent, h('label', { for: 'voi-premise-equivalent' }, 'I confirm the single selected state means exactly that its linked assumption is true. Apply this result to that assumption.')),
      h('p', { class: 'muted small' }, 'Without this confirmation, the result stays in the investigation and does not change an assumption. Multiple target states cannot update an assumption.'),
      h('div', { class: 'form-grid' },
        h('div', { class: 'stack-xs' }, h('label', { for: 'voi-study-se' }, 'Sensitivity %'), sensitivity),
        h('div', { class: 'stack-xs' }, h('label', { for: 'voi-study-sp' }, 'Specificity %'), specificity),
        h('div', { class: 'stack-xs' }, h('label', { for: 'voi-study-due' }, 'Answer due by'), dueOn)),
      h('p', { class: 'muted small' },
        'Sensitivity is the share of true cases the test catches; specificity is the share of true non-cases it clears. A test whose two sum to 100% is a coin flip and is refused.'),
      previewHost),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const result = ctx.api.addInformationRequest(frame.id, {
            label: label.value,
            method: method.value,
            targetStateIds: [...targets],
            premiseEquivalent: premiseEquivalent.checked,
            sensitivityPct: Number(sensitivity.value),
            specificityPct: Number(specificity.value),
            cost: Number(cost.value) || 0,
            delayCost: Number(delay.value) || 0,
            dueOn: dueOn.value || null,
          });
          if (!result.ok) { toast(result.error, 'bad'); return; }
          dialog.close();
          toast(result.reading?.ok
            ? `Investigation declared: net value ${money(result.reading.netValue, currency)} against a total cost of learning of ${money(result.reading.totalCost, currency)}.`
            : 'Investigation declared, but it cannot be valued against this frame yet.', result.reading?.ok ? 'good' : 'neutral');
          ctx.refresh();
        },
      }, 'Declare the investigation'),
    ],
  });
  preview();
}

/* --------------------------------------------------------------- settle */

export function openVoiSettleInquiryDialog(ctx, frame, study) {
  const currency = frame.currency || 'USD';
  const selected = { signal: '' };
  const radios = ['positive', 'negative'].map((signal) => h('div', { class: 'stack-xs' },
    h('label', { for: `voi-signal-${signal}` }, INQUIRY_SIGNAL_LABELS[signal]),
    h('input', {
      type: 'radio',
      name: 'voi-signal',
      id: `voi-signal-${signal}`,
      value: signal,
      onChange: () => { selected.signal = signal; refresh(); },
    })));
  const note = h('textarea', { id: 'voi-settle-note', rows: '3', maxlength: '600' });
  const status = h('p', { class: 'muted small', role: 'status', 'aria-live': 'polite' });
  const refresh = () => {
    if (!selected.signal) {
      status.textContent = 'Record which way the test came out. A test whose answer is "not yet" has not settled.';
      return;
    }
    const { lr, clamped } = likelihoodRatioFor({
      signal: selected.signal,
      sensitivityPct: study.sensitivityPct,
      specificityPct: study.specificityPct,
    });
    const direction = selected.signal === 'positive' ? 'for' : 'against';
    status.textContent = `This will be written into the assumption ledger as one dated observation ${direction} the premise, at a likelihood ratio of ${lr}${clamped ? ' — clamped at the maximum, because a perfect test would claim infinite certainty and the ledger refuses that' : ''}.`;
  };

  const dialog = openModal({
    title: `Record the answer: ${study.label}`,
    description: `Declared at ${study.sensitivityPct}% sensitivity and ${study.specificityPct}% specificity, fee ${money(study.cost, currency)}${study.delayCost > 0 ? ` plus ${money(study.delayCost, currency)} of waiting` : ''}. Settling writes the diagnostic likelihood ratio into the premise ledger as one dated observation.`,
    body: h('div', { class: 'view-stack' },
      h('div', { class: 'stack-sm' }, ...radios),
      h('div', { class: 'stack-xs' }, h('label', { for: 'voi-settle-note' }, 'What did you actually find?'), note),
      status),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          if (!selected.signal) { toast('Record whether the test fired or not.', 'bad'); return; }
          const result = ctx.api.settleInformationRequest(study.id, { signal: selected.signal, note: note.value });
          if (!result.ok) { toast(result.error, 'bad'); return; }
          dialog.close();
          toast(`Answer recorded at a likelihood ratio of ${result.lr}. The premise it tests has one more dated observation.`, 'good');
          ctx.refresh();
        },
      }, 'Settle the investigation'),
    ],
  });
  refresh();
}

/* --------------------------------------------------------------- outcome */

export function openVoiOutcomeDialog(ctx, frame) {
  const currency = frame.currency || 'USD';
  const selected = { stateId: '' };
  const radios = (frame.states || []).map((state, index) => h('div', { class: 'stack-xs' },
    h('label', { for: `voi-realised-${index}` }, state.label),
    h('input', {
      type: 'radio',
      name: 'voi-realised',
      id: `voi-realised-${index}`,
      value: state.id,
      onChange: () => { selected.stateId = state.id; },
    })));
  const note = h('textarea', { id: 'voi-outcome-note', rows: '3', maxlength: '600' });

  const dialog = openModal({
    title: `What actually happened: ${frame.label}`,
    description: `Decided under a frozen EVPI of ${money(frame.snapshot?.evpi, currency)} with “${(frame.options || []).find((option) => option.id === frame.chosenOptionId)?.label || 'no option'}” chosen. Recording the realised state is what makes the declared distribution falsifiable.`,
    body: h('div', { class: 'view-stack' },
      h('p', { class: 'muted small' }, 'If the state that happened is not in the list, that is a finding: the frame was mis-specified. Add the state by editing the frame after this is recorded, and say so in the note.'),
      h('div', { class: 'stack-sm' }, ...radios),
      h('div', { class: 'stack-xs' }, h('label', { for: 'voi-outcome-note' }, 'What happened, and was the payoff you assumed in that state the payoff you got?'), note)),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const result = ctx.api.settleVoiDecision(frame.id, { realizedStateId: selected.stateId, note: note.value });
          if (!result.ok) { toast(result.error, 'bad'); return; }
          dialog.close();
          toast(result.regret === null
            ? 'Realised state recorded. Regret is not priced for that state.'
            : `Realised state recorded. Regret actually incurred: ${money(result.regret, currency)}.`, 'good');
          ctx.refresh();
        },
      }, 'Record what happened'),
    ],
  });
}

/* ---------------------------------------------------------------- policy */

export function openVoiPolicyDialog(ctx, conventions) {
  const current = conventions || conventionsFromSettings(ctx.state);
  const threshold = h('input', { id: 'voi-policy-threshold', type: 'number', min: '0', step: '100', value: String(current.buyInfoThreshold) });
  const share = h('input', { id: 'voi-policy-share', type: 'number', min: '0', max: '100', step: '1', value: String(current.buyInfoSharePct) });
  const concentration = h('input', { id: 'voi-policy-concentration', type: 'number', min: '2', max: '50', step: '1', value: String(current.concentrationThreshold) });
  const nearTie = h('input', { id: 'voi-policy-neartie', type: 'number', min: '0', max: '50', step: '1', value: String(current.nearTiePct) });
  const horizon = h('input', { id: 'voi-policy-horizon', type: 'number', min: '30', max: '730', step: '1', value: String(current.reviewHorizonDays) });

  const dialog = openModal({
    title: 'Information-value conventions',
    description: 'These are the declared thresholds this page uses. They are conventions, printed beside the numbers they produced — not validated constants.',
    body: h('div', { class: 'view-stack' },
      h('div', { class: 'form-grid' },
        h('div', { class: 'stack-xs' }, h('label', { for: 'voi-policy-threshold' }, 'EVPI floor before information is worth buying'), threshold),
        h('div', { class: 'stack-xs' }, h('label', { for: 'voi-policy-share' }, '…or this share of the declared stake, whichever is higher'), share),
        h('div', { class: 'stack-xs' }, h('label', { for: 'voi-policy-concentration' }, 'Open decisions on one premise before the portfolio is concentrated'), concentration),
        h('div', { class: 'stack-xs' }, h('label', { for: 'voi-policy-neartie' }, 'Indifference band, as a share of the payoff range'), nearTie),
        h('div', { class: 'stack-xs' }, h('label', { for: 'voi-policy-horizon' }, 'Outcome review horizon, days'), horizon)),
      h('p', { class: 'muted small' },
        `Defaults are ${money(VOI_CONVENTIONS.buyInfoThreshold, 'USD')} or ${VOI_CONVENTIONS.buyInfoSharePct}% of stake, ${VOI_CONVENTIONS.concentrationThreshold} decisions on one premise, a ${VOI_CONVENTIONS.nearTiePct}% indifference band and a ${VOI_CONVENTIONS.reviewHorizonDays}-day review. Raising the floor makes the app quieter; it does not make the information less valuable.`)),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const result = ctx.api.updateSettings({
            voiBuyInfoThreshold: Number(threshold.value),
            voiBuyInfoSharePct: Number(share.value),
            voiConcentrationThreshold: Number(concentration.value),
            voiNearTiePct: Number(nearTie.value),
            voiReviewHorizonDays: Number(horizon.value),
          });
          if (!result.ok) { toast(result.error, 'bad'); return; }
          dialog.close();
          toast('Conventions updated. Every figure re-derives.', 'good');
          ctx.refresh();
        },
      }, 'Save the conventions'),
    ],
  });
}
