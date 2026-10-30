/**
 * app/views/valueOfInformation.js — the Information Value Terminal (`#/voi`,
 * Schema v54).
 *
 * The page is arranged as an argument rather than a dashboard:
 *
 *   1. **Frames** — each open decision, the options, the states, the payoff
 *      table and the expected value of every option. The refusal to fill a
 *      missing cell with a zero is visible here, not buried.
 *   2. **Investigations** — what a test with *this* declared accuracy, at *this*
 *      declared cost, is actually worth: EVSI, net value, the share of the EVPI
 *      ceiling it captures, and the sensitivity at which it first pays for
 *      itself.
 *   3. **Portfolio** — one premise anchoring several decisions. This is the part
 *      no market tool does: the correlation between decisions that a leader
 *      discovers, expensively, after the fact.
 *   4. **Method** — every convention, every refusal, and what the arithmetic
 *      does not prove.
 *
 * All numbers are derived on render from the declared payoff table; nothing on
 * this page is stored except the declarations themselves and the frozen
 * snapshot taken at the moment a decision was made.
 */

import { h, toast } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, table, emptyState } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import {
  INQUIRY_STATUS_LABELS,
  VOI_DECISION_STATUS_LABELS,
  buildVoiPortfolio,
  formatVoiSwings,
  conventionsFromSettings,
  scoreFrame,
  voiBrief,
} from '../core/domain/valueOfInformation.js';
import {
  buildCalibrationReport,
  calibrationScenarioForFrame,
  lcalBrief,
  lcalConventionsFromSettings,
} from '../core/domain/leaderCalibration.js';
import {
  openVoiFrameDialog,
  openVoiDecideDialog,
  openVoiInvestigationDialog,
  openVoiSettleInquiryDialog,
  openVoiOutcomeDialog,
  openVoiPolicyDialog,
} from '../ui/voi-modals.js';

function money(value, currency = 'USD') {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const rounded = Math.round(Number(value));
  const sign = rounded < 0 ? '−' : '';
  return `${sign}${String(currency || 'USD').toUpperCase()} ${Math.abs(rounded).toLocaleString('en-US')}`;
}

function pct(value, dp = 1) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const f = 10 ** dp;
  return `${Math.round(Number(value) * f) / f}%`;
}

/**
 * A captioned, horizontally scrollable table. The matrix needs a row header per
 * option and a dynamic column set, so the shared `table()` helper (which assumes
 * a render function per column) cannot express it.
 */
function dataTable(caption, headRow, bodyRows) {
  return h('div', { class: 'table-wrap' },
    h('table', { class: 'table', 'aria-label': caption },
      h('caption', { class: 'sr-only' }, caption),
      h('thead', null, headRow),
      h('tbody', null, ...bodyRows)));
}

function optionLabel(frame, optionId) {
  const option = (frame.options || []).find((row) => row && row.id === optionId);
  return option ? option.label : '—';
}

function stateLabel(frame, stateId) {
  const state = (frame.states || []).find((row) => row && row.id === stateId);
  return state ? state.label : '—';
}

/* ------------------------------------------------------------------ frames */

function payoffMatrixCard(row, ctx) {
  const { frame, evaluated } = row;
  const currency = frame.currency || 'USD';
  const cellOf = (optionId, stateId) => (frame.payoffs || []).find((cell) => cell.optionId === optionId && cell.stateId === stateId);

  const head = h('tr', null,
    h('th', { scope: 'col' }, 'Option'),
    ...(frame.states || []).map((state) => h('th', { scope: 'col' },
      h('div', null, state.label),
      h('div', { class: 'muted small' }, `${state.probability}%`) )),
    h('th', { scope: 'col' }, 'Expected value'));
  const body = (frame.options || []).map((option) => h('tr', null,
    h('th', { scope: 'row' }, option.label, option.isStatusQuo ? h('span', { class: 'muted small' }, ' (status quo)') : null),
    ...(frame.states || []).map((state) => {
      const cell = cellOf(option.id, state.id);
      return h('td', { class: cell ? '' : 'muted' }, cell ? money(cell.value, currency) : 'not priced');
    }),
    h('td', null, evaluated.options.find((entry) => entry.optionId === option.id)?.ev === null
      ? badge('unpriced', 'warn')
      : h('strong', null, money(evaluated.options.find((entry) => entry.optionId === option.id)?.ev, currency)))));
  const matrix = dataTable('Declared payoff table — one row per option, one column per state', head, body);

  const regretHead = h('tr', null,
    h('th', { scope: 'col' }, 'State'),
    h('th', { scope: 'col' }, 'Probability'),
    h('th', { scope: 'col' }, 'Best possible'),
    h('th', { scope: 'col' }, 'Regret of the pick'));
  const regretBody = [...evaluated.perState]
    .sort((a, b) => b.probability - a.probability)
    .map((state) => h('tr', null,
      h('th', { scope: 'row' }, state.label),
      h('td', null, `${state.probability}%`),
      h('td', null, state.complete ? `${money(state.bestValue, currency)} (${optionLabel(frame, state.bestOptionId)})` : badge('unpriced', 'warn')),
      h('td', null, state.regretOfPick === null ? '—' : money(state.regretOfPick, currency))));
  const regret = dataTable('Regret by state — what the best option would have paid, and what the current pick gives up', regretHead, regretBody);

  const summary = h('div', { class: 'stat-grid' },
    stat({
      label: 'EVPI — perfect information',
      value: money(evaluated.evpi, currency),
      hint: evaluated.evpi === null
        ? 'refused: the table is incomplete'
        : `an upper bound on what any investigation can be worth (${pct(evaluated.evpiShareOfStakePct, 0)} of stake)`,
      tone: evaluated.evpi === null ? 'warn' : '',
    }),
    stat({
      label: 'Expected-value choice',
      value: evaluated.best ? optionLabel(frame, evaluated.best.optionId) : '—',
      hint: evaluated.best ? money(evaluated.best.ev, currency) : 'no priced option',
    }),
    stat({
      label: 'Robust choice (minimax regret)',
      value: evaluated.minimaxRegret ? optionLabel(frame, evaluated.minimaxRegret.optionId) : '—',
      hint: evaluated.minimaxRegret
        ? `worst case ${money(evaluated.minimaxRegret.maxRegret, currency)}${evaluated.robustChoiceDiffersFromExpected ? ' — differs from the expected-value choice' : ''}`
        : 'not priced',
      tone: evaluated.robustChoiceDiffersFromExpected ? 'warn' : '',
    }),
    stat({
      label: 'Indifference gap',
      value: money(evaluated.gap, currency),
      hint: evaluated.nearTie ? 'near-tie: small evidence moves the ranking' : 'the top two options are separated',
      tone: evaluated.nearTie ? 'warn' : '',
    }));

  const refusals = evaluated.reasons.length
    ? banner({
      tone: 'warn',
      title: 'The arithmetic is refused, not approximated',
      body: `${evaluated.reasons.join(' ')} A zero in place of an unknown payoff would silently become the most persuasive number on this page.`,
    })
    : null;

  return h('div', { class: 'stack-sm' }, summary, refusals, matrix, regret);
}

function frameDetailCard(row, ctx) {
  const frame = row.frame;
  const currency = frame.currency || 'USD';
  const actions = [];
  if (frame.status === 'open') {
    actions.push(h('button', {
      class: 'btn btn-primary',
      type: 'button',
      onClick: () => openVoiDecideDialog(ctx, frame, row.evaluated),
    }, 'Decide'));
    actions.push(h('button', {
      class: 'btn btn-ghost',
      type: 'button',
      onClick: () => openVoiFrameDialog(ctx, { frame }),
    }, 'Edit the table'));
    actions.push(h('button', {
      class: 'btn btn-ghost',
      type: 'button',
      onClick: () => openVoiInvestigationDialog(ctx, frame),
    }, 'Declare an investigation'));
  }
  if (frame.status === 'decided' && !frame.settledOn) {
    actions.push(h('button', {
      class: 'btn btn-primary',
      type: 'button',
      onClick: () => openVoiOutcomeDialog(ctx, frame),
    }, 'Record what happened'));
  }

  const decidedLine = frame.snapshot
    ? h('p', { class: 'muted' },
      `Decided ${frame.decidedOn || '—'} under a frozen EVPI of ${money(frame.snapshot.evpi, currency)} at a stake of ${money(frame.snapshot.stake, currency)}. `
      + `Choice: “${optionLabel(frame, frame.chosenOptionId)}”. Expected-value option at the time: “${optionLabel(frame, frame.snapshot.bestOptionId)}”.`)
    : null;

  const calibrationNotes = (Array.isArray(frame.notes) ? frame.notes : []).filter((note) => note && note.note);
  const calibrationNotesCard = calibrationNotes.length
    ? card({
      title: 'Calibration and decision notes',
      subtitle: 'Append-only automation annotations; declarations and frozen predictions are never rewritten.',
      body: h('ul', { class: 'list-plain stack-xs' }, ...calibrationNotes.map((note) => h('li', null,
        h('span', { class: 'muted small' }, `${note.source || 'Note'} · ${note.at || 'date not recorded'}: `),
        note.note))),
    })
    : null;

  const scored = scoreFrame(frame);
  const scoredBlock = scored.count
    ? h('div', { class: 'stack-xs' },
      h('h4', { class: 'subhead' }, 'Scored against the state that occurred'),
      h('p', { class: 'muted' },
        `Mean multi-class Brier ${scored.meanBrier ?? '—'} (0 is a perfect distribution), mean log loss ${scored.meanLogLoss ?? '—'}. `
        + `Regret actually incurred: ${money(scored.realizedRegret, currency)}. A distribution nobody scores is decoration, which is why this is recorded.`))
    : null;

  return card({
    title: `${frame.label} · ${VOI_DECISION_STATUS_LABELS[frame.status] || frame.status}`,
    subtitle: frame.question || 'No question recorded.',
    actions,
    body: h('div', { class: 'stack-sm' }, decidedLine, calibrationNotesCard, payoffMatrixCard(row, ctx), scoredBlock),
  });
}

function framesPanel(portfolio, selected, ctx) {
  const rows = portfolio.frames;
  if (!rows.length) {
    return card({
      title: 'No decision frames yet',
      subtitle: 'A frame is the smallest honest unit of this module: options, states, prices.',
      body: emptyState({
        title: 'Nothing is priced yet',
        body: 'Declare a decision you are actually facing, the two to six states of the world it depends on, the options you would genuinely consider — including doing nothing — and what each option pays in each state. The app will then tell you what perfect information would be worth, and whether a real test is worth its cost.',
        action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openVoiFrameDialog(ctx) }, 'Declare a decision frame'),
      }),
    });
  }
  const table$ = table({
    caption: 'Decision frames',
    columns: [
      { label: 'Frame', render: (row) => h('div', null, h('strong', null, row.frame.label), h('div', { class: 'muted small' }, `${(row.frame.states || []).length} states · ${(row.frame.options || []).length} options · ${row.studies.length} investigation(s)`)) },
      { label: 'Status', render: (row) => badge(VOI_DECISION_STATUS_LABELS[row.frame.status] || row.frame.status, row.frame.status === 'open' ? 'neutral' : 'good') },
      { label: 'Expected-value choice', render: (row) => (row.evaluated.best ? `${optionLabel(row.frame, row.evaluated.best.optionId)} · ${money(row.evaluated.best.ev, row.frame.currency)}` : badge('unpriced', 'warn')) },
      { label: 'EVPI', render: (row) => (row.evaluated.evpi === null ? '—' : money(row.evaluated.evpi, row.frame.currency)) },
      { label: 'EVPI / stake', render: (row) => pct(row.evaluated.evpiShareOfStakePct, 0) },
      { label: 'Flag', render: (row) => (row.evaluated.nearTie ? badge('near-tie', 'warn') : row.evaluated.robustChoiceDiffersFromExpected ? badge('robust ≠ EV', 'warn') : badge('priced', 'good')) },
      {
        label: 'Open',
        render: (row) => h('button', {
          class: 'btn btn-ghost btn-xs',
          type: 'button',
          onClick: () => ctx.navigate(`#/voi?frame=${encodeURIComponent(row.frame.id)}&panel=frames`),
        }, 'Open'),
      },
    ],
    rows,
    emptyMessage: 'No frames',
  });
  return h('div', { class: 'stack-md' },
    card({ title: 'The register', subtitle: 'Every frame, what it is worth deciding, and what information could be worth', body: table$ }),
    selected ? frameDetailCard(selected, ctx) : null);
}

/* ------------------------------------------------------------ investigations */

function inquiriesPanel(portfolio, selected, ctx) {
  if (!selected) {
    return card({
      title: 'Investigations',
      subtitle: 'Pick a frame first',
      body: emptyState({ title: 'No frame selected', body: 'An investigation is valued against a specific payoff table, so choose a frame in the register.' }),
    });
  }
  const frame = selected.frame;
  const currency = frame.currency || 'USD';
  const conventions = portfolio.conventions;
  const threshold = Math.max(conventions.buyInfoThreshold, ((selected.evaluated.stake || 0) * conventions.buyInfoSharePct) / 100);

  const ceiling = h('div', { class: 'stat-grid' },
    stat({
      label: 'EVPI ceiling',
      value: money(selected.evaluated.evpi, currency),
      hint: selected.evaluated.evpi === null ? 'refused — complete the payoff table' : `the most any test of this frame can be worth`,
      tone: selected.evaluated.evpi === null ? 'warn' : '',
    }),
    stat({
      label: 'Decision threshold',
      value: money(threshold, currency),
      hint: `${conventions.buyInfoSharePct}% of stake or a ${money(conventions.buyInfoThreshold, currency)} floor, whichever is higher`,
    }),
    stat({ label: 'Investigations', value: String(selected.studies.length), hint: `${selected.activeStudies.length} open` }),
    stat({
      label: 'Net value of the best test',
      value: selected.bestStudy ? money(selected.bestStudy.reading.netValue, currency) : '—',
      hint: selected.bestStudy ? selected.bestStudy.study.label : 'nothing declared yet',
      tone: selected.bestStudy && selected.bestStudy.reading.netValue <= 0 ? 'warn' : 'good',
    }));

  const rows = selected.studies.map((entry) => {
    const reading = entry.reading;
    return h('tr', null,
      h('th', { scope: 'row' }, h('div', null, h('strong', null, entry.study.label)), h('div', { class: 'muted small' }, entry.study.method || '—')),
      h('td', null, badge(INQUIRY_STATUS_LABELS[entry.study.status] || entry.study.status,
        entry.study.status === 'settled' ? 'good' : entry.overdue ? 'warn' : 'neutral')),
      h('td', null, `${entry.study.sensitivityPct}% / ${entry.study.specificityPct}%`),
      h('td', null,
        h('div', null, money(entry.study.cost, currency)),
        entry.study.delayCost > 0
          ? h('div', { class: 'muted small' }, `+ ${money(entry.study.delayCost, currency)} waiting`)
          : null),
      h('td', null, reading.ok ? money(reading.evsi, currency) : badge('not valued', 'warn')),
      h('td', null, reading.ok ? h('strong', null, money(reading.netValue, currency)) : '—'),
      h('td', null, reading.ok ? pct(reading.efficiencyPct, 0) : '—'),
      h('td', null, reading.ok
        ? (reading.breakEvenSensitivityPct === null
          ? badge('never pays', 'bad')
          : `${reading.breakEvenSensitivityPct}%`)
        : '—'),
      h('td', null, entry.study.result
        ? `${entry.study.result.signal === 'positive' ? 'fired' : 'did not fire'} · LR ${entry.study.result.lr}`
        : entry.study.dueOn || '—'),
      h('td', null, h('div', { class: 'cluster-xs' },
        ['planned', 'running'].includes(entry.study.status)
          ? h('button', {
            class: 'btn btn-ghost btn-xs',
            type: 'button',
            onClick: () => openVoiSettleInquiryDialog(ctx, frame, entry.study),
          }, 'Record the answer')
          : null,
        ['planned', 'running'].includes(entry.study.status)
          ? h('button', {
            class: 'btn btn-ghost btn-xs',
            type: 'button',
            onClick: () => {
              const result = ctx.api.abandonInformationRequest(entry.study.id);
              if (!result.ok) { toast(result.error, 'bad'); return; }
              toast('Investigation abandoned. The record keeps the cost you already chose to spend.', 'neutral');
              ctx.refresh();
            },
          }, 'Abandon')
          : null)));
  });

  const studies = rows.length
    ? dataTable('Declared investigations and what each is actually worth',
      h('tr', null,
        h('th', { scope: 'col' }, 'Investigation'),
        h('th', { scope: 'col' }, 'Status'),
        h('th', { scope: 'col' }, 'Sens / spec'),
        h('th', { scope: 'col' }, 'Cost of learning'),
        h('th', { scope: 'col' }, 'EVSI'),
        h('th', { scope: 'col' }, 'Net value'),
        h('th', { scope: 'col' }, '% of ceiling'),
        h('th', { scope: 'col' }, 'Break-even sens.'),
        h('th', { scope: 'col' }, 'Answer / due'),
        h('th', { scope: 'col' }, 'Actions')),
      rows)
    : emptyState({
      title: 'No investigation declared for this frame',
      body: 'Declare the test you could actually run: what it detects, the sensitivity and specificity you would defend for it, and what it costs. The app will price it against the EVPI ceiling and tell you the accuracy at which it stops paying for itself.',
    });

  const explanation = banner({
    tone: 'info',
    title: 'What these numbers mean',
    body: `EVSI is the expected value of the better decision you would make after seeing the test’s answer, minus the expected value of the decision you would make now. Net value subtracts two declared numbers, not one: the fee, and what the waiting itself is worth. “% of ceiling” is how much of the perfect-information bound this test captures. `
      + `Break-even sensitivity is found by bisection because EVSI is monotone in sensitivity (Blackwell 1951/1953): a test that is more accurate is never worth less. A test whose sensitivity and specificity sum to 100% is a coin flip and is refused at entry.`,
  });

  return h('div', { class: 'stack-md' },
    card({ title: `Investigations for “${frame.label}”`, subtitle: 'A test is worth what it changes, not what it measures', body: h('div', { class: 'stack-sm' }, ceiling, explanation, studies) }));
}

/* --------------------------------------------------------------- portfolio */

function portfolioPanel(portfolio, ctx) {
  const conventions = portfolio.conventions;
  const stats = h('div', { class: 'stat-grid' },
    stat({ label: 'Open frames', value: String(portfolio.counts.open), hint: `${portfolio.counts.priced} priced, ${portfolio.counts.unpriced} refused` }),
    stat({
      label: 'Frames resting on a premise',
      value: String(portfolio.anchoredFrameCount),
      hint: `${portfolio.unanchoredFrameCount} anchored on nothing but the leader's own prior`,
    }),
    stat({
      label: 'Concentration (HHI)',
      value: portfolio.hhi === null ? '—' : String(portfolio.hhi),
      hint: portfolio.hhi === null ? 'no premise anchors any frame' : '10,000 = every anchored frame on one premise',
      tone: portfolio.concentrationBreach ? 'warn' : '',
    }),
    stat({
      label: 'Would flip if a premise is wrong',
      value: String(portfolio.counts.flipsAtRisk),
      hint: `declared threshold: ${conventions.concentrationThreshold} decisions on one premise`,
      tone: portfolio.counts.flipsAtRisk ? 'warn' : 'good',
    }));

  const rows = portfolio.anchors.map((anchor) => h('tr', null,
    h('th', { scope: 'row' }, anchor.title || anchor.premiseId),
    h('td', null, String(anchor.frames.length)),
    h('td', null, String(anchor.flips)),
    h('td', null, formatVoiSwings(anchor)),
    h('td', null, h('ul', { class: 'list-plain small' },
      ...anchor.frames.slice(0, 6).map((row) => h('li', null,
        `${row.label}: ${row.flips ? 'the preferred option changes' : 'no change in the preferred option'}`))))));

  const anchorTable = portfolio.anchors.length
    ? dataTable('Premises that more than one open decision rests on',
      h('tr', null,
        h('th', { scope: 'col' }, 'Premise'),
        h('th', { scope: 'col' }, 'Open frames'),
        h('th', { scope: 'col' }, 'Would flip'),
        h('th', { scope: 'col' }, 'Swing'),
        h('th', { scope: 'col' }, 'Frames')),
      rows)
    : emptyState({
      title: 'No shared assumptions yet',
      body: 'Link a frame’s states to a premise in the Assumption Ledger. The portfolio view then shows which of your open decisions are really one bet.',
    });

  const nearTies = portfolio.openFrames.filter((row) => row.evaluated.nearTie);
  const nearTieCard = card({
    title: 'Indifference zones',
    subtitle: 'Where a small amount of evidence has unusual leverage — and where deciding on preference is also legitimate',
    body: nearTies.length
      ? h('ul', { class: 'list-plain stack-xs' },
        ...nearTies.map((row) => h('li', null,
          h('strong', null, `${row.frame.label} `),
          `— top two options are ${money(Math.abs(row.evaluated.gap || 0), row.frame.currency)} apart against a range of ${money(row.evaluated.range, row.frame.currency)}.`)))
      : h('p', { class: 'muted' }, 'No open frame is a near-tie.'),
  });

  return h('div', { class: 'stack-md' },
    card({
      title: 'One premise, several decisions',
      subtitle: 'The correlation between decisions that is usually discovered after the fact',
      body: h('div', { class: 'stack-sm' }, stats,
        banner({
          tone: portfolio.concentrationBreach ? 'warn' : 'info',
          title: portfolio.concentrationBreach ? 'Concentrated' : 'Not concentrated by the declared threshold',
          body: portfolio.topPremise
            ? `“${portfolio.topPremise.title || portfolio.topPremise.premiseId}” anchors ${portfolio.topPremise.frames.length} open frame(s); flipping the two states that carry it changes the preferred option in ${portfolio.topPremise.flips} of them. The flip is a declared stress — the two probabilities are swapped — not a probability that the premise is wrong, and no covariance is estimated.`
            : 'No open frame names a premise, so there is nothing to stress.',
        }),
        anchorTable)}),
    nearTieCard,
    card({
      title: 'What this page cannot tell you',
      subtitle: 'Read this before quoting any number on it',
      body: h('ul', { class: 'list-plain stack-xs' },
        h('li', null, 'EVPI is a bound **given your declarations**. If the state list is missing the state that actually happens, every number here is precise and wrong.'),
        h('li', null, 'The payoffs are your estimates. The module never substitutes a market rate, a benchmark or a modelled value for a cell you did not fill.'),
        h('li', null, 'Paying to learn is only rational when the net value is positive. “More data” is not a strategy, and neither is “decide faster”.'),
        h('li', null, 'A settled test writes **one** dated likelihood ratio into the premise ledger. One observation does not settle a belief, and the Sentinel’s own boundaries say so.')),
    }));
}

/* -------------------------------------------------------------------- method */

/* -------------------------------------------------------- calibration */

function calibrationVerdictTone(verdict) {
  switch (verdict) {
    case 'calibrated': return 'good';
    case 'overconfident':
    case 'underconfident':
    case 'miscalibrated': return 'warn';
    default: return 'neutral';
  }
}

function calibrationStressCard(state, report) {
  const openFrames = (Array.isArray(state?.voiDecisions) ? state.voiDecisions : [])
    .filter((frame) => frame && frame.status === 'open');
  if (!openFrames.length) {
    return card({
      title: 'Calibration stress on open decisions',
      subtitle: 'No open decision frames to stress.',
      body: h('p', { class: 'muted' }, 'When a priced frame is open, this panel compares its declared EVPI with a shrinkage-weighted calibration scenario and a Wilson-band sensitivity envelope.'),
    });
  }

  const evaluatedFrames = openFrames.map((frame) => ({ frame, scenario: calibrationScenarioForFrame(state, frame, { report }) }));
  const rows = evaluatedFrames.map(({ frame, scenario }) => {
    const currency = frame.currency || 'USD';
    const options = new Map((frame.options || []).map((option) => [option.id, option.label]));
    const raw = scenario.rawEvpi === null || scenario.rawEvpi === undefined ? '—' : money(scenario.rawEvpi, currency);
    const stress = scenario.status === 'ready'
      ? `${money(scenario.evpiLow, currency)} – ${money(scenario.evpiHigh, currency)}`
      : scenario.detail;
    const point = scenario.status === 'ready' ? money(scenario.scenarioEvpi, currency) : '—';
    const choice = scenario.status === 'ready'
      ? `${options.get(scenario.scenarioChoiceId) || '—'}${scenario.choiceChanges ? ' · may flip' : ' · stable in tested corners'}`
      : 'withheld';
    const evidence = scenario.status === 'ready'
      ? `${scenario.evidenceFrameIds.length} linked source frames · ${scenario.coveredBands.map((band) => `${band.band} n=${band.samples}`).join('; ')}`
      : scenario.detail;
    return h('tr', null,
      h('th', { scope: 'row' }, frame.label || 'Untitled frame'),
      h('td', null, raw),
      h('td', { class: scenario.status === 'ready' && scenario.choiceChanges ? 'text-warn' : '' }, stress),
      h('td', null, point),
      h('td', null, choice),
      h('td', { class: 'muted small' }, evidence));
  });

  const readyCount = evaluatedFrames.filter(({ scenario }) => scenario.status === 'ready').length;
  const caveat = banner({
    tone: 'info',
    title: `${readyCount} of ${openFrames.length} open frame(s) have enough calibration coverage`,
    body: 'The point estimate is a descriptive scenario, not a posterior or corrected belief. Each declared probability is blended toward its historical bin rate with n/(n+10) shrinkage; Wilson bounds are propagated through all probability corners (up to 64), then normalized to 100%. These marginal bounds are not simultaneous confidence limits, and state outcomes from one frame are correlated. Your declared inputs and any frozen prediction remain untouched.',
  });

  return card({
    title: 'Calibration stress on open decisions',
    subtitle: 'The money impact of your own forecasting record — inspect the sensitivity; never auto-correct a belief.',
    body: h('div', { class: 'stack-sm' },
      dataTable('Open-decision calibration sensitivity',
        h('tr', null,
          h('th', { scope: 'col' }, 'Decision frame'),
          h('th', { scope: 'col' }, 'Declared EVPI'),
          h('th', { scope: 'col' }, 'EVPI stress range'),
          h('th', { scope: 'col' }, 'Calibration scenario EVPI'),
          h('th', { scope: 'col' }, 'Expected-value option'),
          h('th', { scope: 'col' }, 'Coverage and evidence')),
        rows),
      caveat),
  });
}

function calibrationPanel(report, ctx) {
  const r = report;
  const hasSamples = r.usableCount > 0 || r.legacyCount > 0;

  const summaryStats = h('div', { class: 'stat-grid' },
    stat({ label: 'Settled samples', value: String(r.usableCount), hint: `${r.legacyCount} legacy excluded from verdict`, tone: r.usableCount >= r.conventions.verdictSamples ? 'good' : '' }),
    stat({ label: 'Signed gap', value: r.signedGapPp === null ? '—' : `${r.signedGapPp >= 0 ? '+' : ''}${r.signedGapPp}pp`, hint: 'positive = overconfident', tone: r.verdict === 'overconfident' ? 'warn' : r.verdict === 'underconfident' ? 'warn' : '' }),
    stat({ label: 'Brier score', value: r.murphy.brier === null ? '—' : String(r.murphy.brier), hint: `reliability ${r.murphy.reliability ?? '—'} · resolution ${r.murphy.resolution ?? '—'}` }),
    stat({ label: 'Cohort drift', value: r.drift ? `PSI ${r.drift.psi ?? '—'}` : '—', hint: r.drift ? r.drift.status : 'not enough samples', tone: r.drift && r.drift.status === 'drifted' ? 'warn' : '' }));

  const verdictBanner = banner({
    tone: calibrationVerdictTone(r.verdict),
    title: `Verdict: ${r.verdictLabel}`,
    body: r.verdictReason,
  });

  // Reliability diagram (5 bins × 20pp) rendered as a simple horizontal bar per bin.
  const binRows = r.bins.map((bin) => {
    const hitPct = bin.hitRate === null ? null : Math.round(bin.hitRate * 100);
    const midPct = bin.midpoint;
    const hitWidth = bin.hitRate === null ? 0 : Math.max(1, Math.round(bin.hitRate * 100));
    const midMarker = midPct; // position from left as %
    const wilsonText = bin.status === 'scored'
      ? `95% Wilson ${Math.round((bin.wilsonLo || 0) * 100)}–${Math.round((bin.wilsonHi || 0) * 100)}%`
      : bin.count < 3 ? `thin (n=${bin.count})` : `n=${bin.count}`;
    return h('tr', null,
      h('td', null, h('strong', null, `${bin.lo}–${bin.hi}%`)),
      h('td', null, String(bin.count)),
      h('td', null,
        h('div', { class: 'lcal-bin', style: 'position:relative;height:18px;background:#f3f4f6;border-radius:4px;overflow:hidden' },
          h('div', { class: 'lcal-bin-hit', style: `position:absolute;left:0;top:0;bottom:0;width:${hitWidth}%;background:${bin.gapPp !== null && bin.gapPp > 10 ? '#ef4444' : bin.gapPp !== null && bin.gapPp < -10 ? '#f59e0b' : '#10b981'};opacity:0.55` }),
          h('div', { class: 'lcal-bin-mid', style: `position:absolute;left:${midMarker}%;top:-2px;bottom:-2px;width:2px;background:#1f2937` }))),
      h('td', null, hitPct === null ? '—' : `${hitPct}%`),
      h('td', null, bin.gapPp === null ? '—' : `${bin.gapPp >= 0 ? '+' : ''}${bin.gapPp}pp`),
      h('td', { class: 'muted small' }, wilsonText));
  });

  const reliabilityTable = card({
    title: 'Reliability diagram',
    subtitle: 'Five 20-percentage-point bins. The vertical line in each band shows the band midpoint (perfect calibration); the bar shows your observed hit rate.',
    body: dataTable('Reliability by probability band',
      h('tr', null,
        h('th', { scope: 'col' }, 'Declared band'),
        h('th', { scope: 'col' }, 'n'),
        h('th', { scope: 'col' }, 'Observed hit rate vs band midpoint'),
        h('th', { scope: 'col' }, 'Hit %'),
        h('th', { scope: 'col' }, 'Gap'),
        h('th', { scope: 'col' }, 'Interval')),
      binRows),
  });

  // Murphy decomposition.
  const murphyCard = card({
    title: 'Murphy decomposition (multi-class)',
    subtitle: 'Brier = reliability − resolution + uncertainty (Murphy 1973). Reliability is how far you are from the diagonal; resolution is how much you discriminate; uncertainty is the irreducible base-rate floor.',
    body: h('div', { class: 'stack-xs' },
      h('div', { class: 'kv-grid' },
        h('div', null, h('div', { class: 'muted small' }, 'Mean Brier'), h('div', { class: 'h3' }, r.murphy.brier ?? '—')),
        h('div', null, h('div', { class: 'muted small' }, 'Reliability'), h('div', { class: 'h3' }, r.murphy.reliability ?? '—')),
        h('div', null, h('div', { class: 'muted small' }, 'Resolution'), h('div', { class: 'h3' }, r.murphy.resolution ?? '—')),
        h('div', null, h('div', { class: 'muted small' }, 'Uncertainty'), h('div', { class: 'h3' }, r.murphy.uncertainty ?? '—')),
        h('div', null, h('div', { class: 'muted small' }, 'Base rate'), h('div', { class: 'h3' }, r.murphy.baseRate === null ? '—' : `${Math.round(r.murphy.baseRate * 100)}%` ))
      )
    ),
  });

  // Advisory remap table.
  const remapCard = card({
    title: 'Advisory remap (not auto-applied)',
    subtitle: 'What your declared probabilities in each band have historically resolved to. Inspect this; it is never applied to your inputs silently.',
    body: dataTable('Advisory probability remap',
      h('tr', null,
        h('th', { scope: 'col' }, 'Declared band'),
        h('th', { scope: 'col' }, 'Observed hit %'),
        h('th', { scope: 'col' }, 'n'),
        h('th', { scope: 'col' }, 'Reading')),
      r.remap.map((a) => h('tr', null,
        h('td', null, `${a.loPct}–${a.hiPct}%`),
        h('td', null, a.observedHitPct === null ? '—' : `${a.observedHitPct}%`),
        h('td', null, String(a.count)),
        h('td', null, a.advisory))),
    ),
  });

  // Per-topic breakdown.
  const topicBody = r.topics.length
    ? dataTable('Calibration by premise topic',
        h('tr', null,
          h('th', { scope: 'col' }, 'Topic'),
          h('th', { scope: 'col' }, 'n'),
          h('th', { scope: 'col' }, 'Mean forecast'),
          h('th', { scope: 'col' }, 'Hit rate'),
          h('th', { scope: 'col' }, 'Gap'),
          h('th', { scope: 'col' }, 'Brier')),
        r.topics.map((t) => h('tr', null,
          h('td', null, t.topic),
          h('td', null, String(t.n)),
          h('td', null, t.meanForecastPct === null ? '—' : `${t.meanForecastPct}%`),
          h('td', null, t.hitRate === null ? '—' : `${Math.round(t.hitRate * 100)}%`),
          h('td', null, t.calibrationGapPp === null ? '—' : `${t.calibrationGapPp >= 0 ? '+' : ''}${t.calibrationGapPp}pp`),
          h('td', null, t.brier === null ? '—' : String(t.brier)))))
    : emptyState({ title: 'No topics', body: 'No settled state carries a premise tag, so the per-topic breakdown is empty.' });
  const topicCard = card({
    title: 'Per-topic calibration',
    subtitle: 'Topics are derived from the premise each state cites (no topic inference from prose). A domain with fewer than three samples is counts-only.',
    body: topicBody,
  });

  // Cohort drift card.
  const driftCard = card({
    title: 'Cohort drift (PSI)',
    subtitle: 'Population Stability Index between the earlier half and the recent half of your samples (10/10 split on settled date). PSI < 0.1 stable; 0.1–0.25 watch; > 0.25 drifted.',
    body: r.drift
      ? h('div', { class: 'stack-xs' },
        h('div', { class: 'kv-grid' },
          h('div', null, h('div', { class: 'muted small' }, 'PSI'), h('div', { class: 'h3' }, String(r.drift.psi ?? '—'))),
          h('div', null, h('div', { class: 'muted small' }, 'Status'), h('div', { class: 'h3' }, r.drift.status)),
          h('div', null, h('div', { class: 'muted small' }, 'Earlier cohort'), h('div', null, `n=${r.drift.earlierN} through ${r.drift.earlierThrough}`)),
          h('div', null, h('div', { class: 'muted small' }, 'Recent cohort'), h('div', null, `n=${r.drift.recentN} from ${r.drift.recentFrom}`))))
      : h('p', { class: 'muted' }, `Need at least 20 settled samples for a 10/10 cohort split. You have ${r.usableCount}.`),
  });

  // Caveats card.
  const caveatsCard = card({
    title: 'What this read does not claim',
    body: h('ul', { class: 'list-plain stack-xs' },
      ...r.caveats.map((c) => h('li', null, c))),
  });

  if (!hasSamples) {
    return h('div', { class: 'stack-md' },
      emptyState({
        title: 'No calibration data yet',
        body: `Settle ${r.conventions.verdictSamples} decision frames (declare → decide → record outcome) and this page will show your calibration curve, Murphy decomposition, per-topic breakdown and cohort drift. Until then there is nothing to grade.`,
      }),
      calibrationStressCard(ctx.state, r),
      caveatsCard);
  }

  return h('div', { class: 'stack-md' },
    summaryStats,
    verdictBanner,
    calibrationStressCard(ctx.state, r),
    murphyCard,
    reliabilityTable,
    remapCard,
    topicCard,
    driftCard,
    caveatsCard);
}

function methodCard(portfolio) {
  const conventions = portfolio.conventions;
  return card({
    title: 'Method and limits',
    subtitle: 'Every number on this page, and what produced it',
    body: h('div', { class: 'stack-sm' },
      h('ul', { class: 'list-plain stack-xs' },
        h('li', null, h('strong', null, 'Evidence safety '), 'New investigation results update a linked assumption only when you explicitly confirm that one target state means the assumption is true. Results from older releases may have created unconfirmed or underweighted negative observations; review those observations in the assumption ledger. Existing observations and generated decisions are not rewritten.'),
        h('li', null, h('strong', null, 'EVPI '), 'is Σ p(s)·max(o,s) − max(o)·Σ p(s)·o(s), computed exactly by enumeration over the declared states (Raiffa & Schlaifer 1961; Howard 1966). It is an upper bound on what any investigation can be worth, not a forecast.'),
        h('li', null, h('strong', null, 'EVSI '), 'conditions on a two-signal test using its declared sensitivity and specificity, applies Bayes’ rule exactly, and takes the expectation over the signal. EVSI is never allowed above EVPI; the share of the ceiling is printed beside it.'),
        h('li', null, h('strong', null, 'Break-even accuracy '), 'is a bisection on sensitivity, which is valid because EVSI is monotone in accuracy (Blackwell 1951, 1953 sufficiency ordering). A test at or below the coin-flip line is refused at entry.'),
        h('li', null, h('strong', null, 'Minimax regret '), 'is reported beside expected value (Savage 1951). When the two disagree the page says so: a leader who cannot absorb the worst case is not being irrational by refusing the highest expected value.'),
        h('li', null, h('strong', null, 'Concentration '), `uses a Herfindahl index over the open frames each premise anchors (Herfindahl 1950) and a declared flip-stress on the two states that carry it. The threshold is ${conventions.concentrationThreshold} decisions on one premise.`),
        h('li', null, h('strong', null, 'Scoring '), 'is multi-class Brier (1950) and log loss over the frozen distribution against the state that actually occurred, plus the regret actually incurred. Withheld until an outcome is recorded — never back-filled.'),
        h('li', null, h('strong', null, 'What is stored '), 'is only what the leader declared: states, probabilities, payoffs, options, investigations and the frozen snapshot at the moment of decision. Posteriors, EVPI, EVSI and regret are re-derived on every load.')),
      banner({
        tone: 'info',
        title: 'Not claimed',
        body: `EVPI assumes the leader is risk-neutral over money and that the payoff table is the decision. Both are frequently false. The declared thresholds (${money(conventions.buyInfoThreshold, 'USD')} or ${conventions.buyInfoSharePct}% of stake before information is worth buying, ${conventions.nearTiePct}% for a near-tie, a ${conventions.reviewHorizonDays}-day review horizon) are conventions, printed and configurable, not validated constants. No competitor-absence, causal or comparative-effectiveness claim is made, and real-browser / assistive-technology behaviour of this page remains a manual review responsibility.`,
      })),
  });
}

/* --------------------------------------------------------------- the page */

export function renderVoi(ctx) {
  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now);
  const portfolio = buildVoiPortfolio(ctx.state, now);
  const calibration = buildCalibrationReport(ctx.state, now);
  const conventions = conventionsFromSettings(ctx.state);
  const lcalConventions = lcalConventionsFromSettings(ctx.state);
  const requestedPanel = ctx.query?.get?.('panel') || 'frames';
  const tabs = ['frames', 'inquiries', 'portfolio', 'calibration', 'method'];
  const panel = tabs.includes(requestedPanel) ? requestedPanel : 'frames';
  const requested = ctx.query?.get?.('frame') || '';
  const selected = portfolio.frames.find((row) => row.frame.id === requested)
    || portfolio.openFrames[0]
    || portfolio.frames[0]
    || null;

  const picker = portfolio.frames.length
    ? h('div', { class: 'stack-xs' },
      h('label', { for: 'voi-frame-select' }, 'Decision frame'),
      h('select', {
        id: 'voi-frame-select',
        onChange: (event) => ctx.navigate(`#/voi?frame=${encodeURIComponent(event.target.value)}&panel=${panel}`),
      },
      ...portfolio.frames.map((row) => h('option', { value: row.frame.id, ...(selected && row.frame.id === selected.frame.id ? { selected: 'selected' } : {}) },
        `${row.frame.label} · ${VOI_DECISION_STATUS_LABELS[row.frame.status] || row.frame.status}`))))
    : null;

  const largest = portfolio.openFrames
    .filter((row) => row.evaluated.evpi !== null)
    .sort((a, b) => b.evaluated.evpi - a.evaluated.evpi)[0] || null;

  const header = pageHeader({
    eyebrow: 'Decisions · Schema v56',
    title: 'Information value',
    subtitle: 'Before you commit: what would it be worth to find out? A priced decision frame, the value of a test that does not exist yet, the assumptions several of your decisions secretly share, and your own calibration as a forecaster.',
    actions: [
      h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openVoiFrameDialog(ctx) }, 'Declare a frame'),
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openVoiPolicyDialog(ctx, conventions) }, 'Conventions'),
      h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: () => {
          const result = ctx.api.scanVoi();
          if (!result.ok) { toast(result.error, 'bad'); return; }
          toast(result.changed ? 'Scan complete — provenance and obligations reconciled' : 'Scan complete: nothing needed opening', result.changed ? 'good' : 'neutral');
          ctx.refresh();
        },
      }, 'Scan'),
      h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: () => downloadText('leados-information-value.txt', `${voiBrief(ctx.state, now)}\n\n\n${lcalBrief(ctx.state, now)}`),
      }, 'Download brief'),
    ],
    meta: badge(`${portfolio.counts.open} open`, portfolio.counts.unpriced ? 'warn' : 'neutral'),
  });

  const stats = h('div', { class: 'stat-grid' },
    stat({ label: 'Largest EVPI', value: largest ? money(largest.evaluated.evpi, largest.frame.currency) : '—', hint: largest ? largest.frame.label : 'no priced frame yet' }),
    stat({ label: 'Open frames', value: String(portfolio.counts.open), hint: `${portfolio.counts.priced} priced · ${portfolio.counts.unpriced} refused` }),
    stat({ label: 'Investigations', value: String(portfolio.counts.studies), hint: `${portfolio.counts.activeStudies} open · ${portfolio.counts.overdueStudies} overdue`, tone: portfolio.counts.overdueStudies ? 'warn' : '' }),
    stat({ label: 'Concentration', value: portfolio.topPremise ? String(portfolio.topPremise.frames.length) : '—', hint: portfolio.topPremise ? 'frames on the busiest premise' : 'no premise links', tone: portfolio.concentrationBreach ? 'warn' : '' }));

  const tabsRow = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Information value sections' },
    ...[
      { key: 'frames', label: 'Frames' },
      { key: 'inquiries', label: 'Investigations' },
      { key: 'portfolio', label: 'Portfolio' },
      { key: 'calibration', label: 'Calibration' },
      { key: 'method', label: 'Method' },
    ].map((item) => h('button', {
      class: `tab ${panel === item.key ? 'is-active' : ''}`,
      type: 'button',
      role: 'tab',
      'aria-selected': panel === item.key ? 'true' : 'false',
      onClick: () => ctx.navigate(`#/voi?panel=${item.key}${selected ? `&frame=${encodeURIComponent(selected.frame.id)}` : ''}`),
    }, item.label)));

  const panelBody = (() => {
    if (panel === 'inquiries') return inquiriesPanel(portfolio, selected, ctx);
    if (panel === 'portfolio') return portfolioPanel(portfolio, ctx);
    if (panel === 'calibration') return calibrationPanel(calibration, ctx);
    if (panel === 'method') return methodCard(portfolio);
    return framesPanel(portfolio, selected, ctx);
  })();

  const topBanner = portfolio.counts.open && !portfolio.counts.priced
    ? banner({
      tone: 'warn',
      title: 'No open frame can be valued yet',
      body: 'Every frame on this page has at least one unpriced cell or probabilities that do not sum to 100%. The arithmetic is refused rather than approximated — fill the table and the numbers appear.',
    })
    : null;

  return h('div', { class: 'page', 'data-testid': 'voi-page' },
    header,
    picker,
    stats,
    topBanner,
    tabsRow,
    panelBody);
}
