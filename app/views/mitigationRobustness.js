import { h, toast, confirmDialog, openModal } from '../ui/dom.js';
import { card, banner, table, stat, badge } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { analyzeMitigationRobustness, robustnessBrief, robustnessEvidenceKey } from '../core/domain/mitigationRobustness.js';

/** Bounded (8 corners + at most 25 cells), so no worker or sampled solver is
 * needed. All live work goes through the validated API and shared rule spine. */
export function mitigationRobustnessPanel(ctx) {
  const cases = (ctx.state.cases || []).filter((c) => ['open', 'mitigating', 'monitoring'].includes(c.status));
  const owners = (ctx.state.people || []).filter((p) => p.status !== 'archived');
  const output = h('div', { class: 'stack-md', 'aria-live': 'polite', 'data-testid': 'robustness-output' });
  const select = h('select', { id: 'robustness-case', required: true },
    h('option', { value: '' }, 'Choose an open case…'),
    ...cases.map((c) => h('option', { value: c.id }, c.title)));
  const requestedCase = ctx.query?.get?.('case');
  if (cases.some((c) => c.id === requestedCase)) select.value = requestedCase;
  const owner = h('select', { id: 'robustness-owner' },
    h('option', { value: '' }, 'Choose a verification owner…'),
    ...owners.map((p) => h('option', { value: p.id }, p.name)));
  const fields = {};
  const controls = [
    ['currentLow', 'Current event probability — lower (%)', 0, 100, 'any'],
    ['currentHigh', 'Current event probability — upper (%)', 0, 100, 'any'],
    ['proposedLow', 'Proposed event probability — lower (%)', 0, 100, 'any'],
    ['proposedHigh', 'Proposed event probability — upper (%)', 0, 100, 'any'],
    ['incrementalCost', 'Additional cost (case currency; historical spend excluded)', 0, 1e12, 'any'],
    ['horizonDays', 'Shared event-probability horizon (days)', 1, 3650, 1],
  ].map(([key, label, min, max, step]) => {
    fields[key] = h('input', { id: `robustness-${key}`, type: 'number', min, max, step, required: true });
    return h('div', { class: 'stack-xs' }, h('label', { for: `robustness-${key}` }, label), fields[key]);
  });
  let analysis = null;
  let generation = 0;
  let basis = null;
  const exportButton = h('button', { class: 'btn btn-ghost', type: 'button', disabled: true, onClick: () => {
    if (!analysis) return;
    const text = robustnessBrief(analysis);
    if (!downloadText({ filename: 'leados-mitigation-robustness.txt', text, mime: 'text/plain' })) {
      openModal({ title: 'Copy numeric robustness brief', body: h('textarea', { readOnly: true, rows: 16, 'aria-label': 'Robustness brief' }, text) });
    }
  } }, 'Export numeric brief');
  const commission = h('button', { class: 'btn btn-primary', type: 'button', disabled: true, onClick: async () => {
    if (!analysis || !basis) return;
    const ticket = generation;
    const accepted = await confirmDialog({
      title: 'Commission an evidence review?',
      message: 'Creates one DACI decision with captured numeric assumptions, one owned verification delegation due within seven days (or the shorter horizon), and one blameless 1:1 prompt if space remains. Does not apply a mitigation, spend money, send messages or rate a person.',
      confirmLabel: 'Create linked review',
    });
    if (!accepted || ticket !== generation || !basis) return;
    commission.disabled = true;
    const res = ctx.api.requestMitigationReview(basis);
    if (!res.ok) {
      output.append(h('p', { role: 'alert' }, res.error));
      toast(res.error, 'bad');
      return;
    }
    const savedMessage = !res.saved ? 'These records exist in memory only: saving failed. Export a backup before leaving.'
      : res.savePending ? 'Encrypted save is queued; check the workspace save indicator before leaving.'
        : 'Saved locally.';
    output.append(banner({ tone: res.saved ? 'info' : 'warn',
      title: res.existing ? 'Existing evidence gate found — no duplicates' : 'Evidence gate commissioned',
      body: savedMessage }),
    h('div', { class: 'page-actions' },
      h('a', { class: 'btn', href: `#/decisions?decision=${encodeURIComponent(res.id)}` }, 'Open captured decision'),
      h('a', { class: 'btn btn-ghost', href: '#/delegations' }, 'Verification work'),
      h('a', { class: 'btn btn-ghost', href: '#/propagation' }, 'Inspect automation')));
  } }, 'Commission evidence review');
  const invalidate = () => {
    generation += 1; analysis = null; basis = null;
    exportButton.disabled = true; commission.disabled = true; output.replaceChildren();
  };
  select.addEventListener('change', invalidate);
  owner.addEventListener('change', invalidate);
  Object.values(fields).forEach((field) => field.addEventListener('input', invalidate));
  const form = h('form', { class: 'stack-md', onSubmit: (event) => {
    event.preventDefault();
    invalidate();
    const source = cases.find((c) => c.id === select.value);
    if (!source) { output.append(h('p', { role: 'alert' }, 'Choose an open case first.')); return; }
    const raw = Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.value]));
    const report = analyzeMitigationRobustness(source, raw);
    if (!report.ok) { output.append(h('p', { role: 'alert' }, report.error)); return; }
    analysis = report;
    basis = { caseId: source.id, input: report.input, ownerId: owner.value,
      expectedRevision: ctx.state.meta.revision,
      evidenceKey: robustnessEvidenceKey(source.id, report, owner.value) };
    exportButton.disabled = false;
    commission.disabled = !owner.value || source.autoPropagate === false;
    const tone = report.verdict === 'Evidence-sensitive' ? 'warn' : 'info';
    output.append(
      banner({ tone, title: report.verdict,
        body: `Under your declared uncertainty set: ${report.preference} minimizes maximum regret. This is a decision criterion, not a calibrated confidence score or a safety clearance.` }),
      h('div', { class: 'stat-grid' },
        stat({ label: 'Worst → best saving', value: `${report.savingLow} → ${report.savingHigh}`, hint: report.currency }),
        stat({ label: 'Worst regret: hold', value: report.holdRegret, hint: report.currency }),
        stat({ label: 'Worst regret: proposed', value: report.proposedRegret, hint: report.currency })),
      h('p', { class: 'small' }, `Conditional loss: ${report.losses.join(' / ')} ${report.currency}. The full optimistic-to-pessimistic interval is tested; the middle estimate is not an expected-value weight.`),
      table({ caption: 'Break-even and information thresholds — model-only', rows: [
        { label: 'Loss needed for a saving to be possible', value: report.possibleBreakEvenLoss ?? 'None: reduction not possible' },
        { label: 'Loss needed for a saving to be guaranteed', value: report.guaranteedBreakEvenLoss ?? 'None: reduction not guaranteed' },
        { label: 'Additional-cost ceiling: possible / guaranteed', value: `${report.possibleCostCeiling} / ${report.guaranteedCostCeiling}` },
        { label: 'Perfect-information ceiling (not EVSI or a research budget)', value: report.perfectInformationCeiling },
      ], columns: [{ label: 'Threshold', render: (r) => r.label }, { label: `Amount (${report.currency})`, render: (r) => r.value }] }),
      h('p', { class: 'small muted' }, 'A negative cost ceiling means even a free intervention may not help. Perfect information can remove at most the chosen plan’s worst regret in this two-action model; actual evidence may remove none. Delay and research costs are not priced.'),
      h('details', null, h('summary', null, 'Inspect the probability frontier (at most 25 illustrative cells)'),
        table({ caption: 'Probability frontier — no distribution or likelihood is assigned to cells', rows: report.grid, columns: [
          { label: 'Current event (%)', render: (r) => Number(r.current.toFixed(4)) },
          { label: 'Proposed event (%)', render: (r) => Number(r.proposed.toFixed(4)) },
          { label: `Saving range (${report.currency})`, render: (r) => `${r.low} to ${r.high}` },
          { label: 'Conditional verdict', render: (r) => badge(r.verdict, r.verdict === 'Evidence-sensitive' ? 'warn' : 'neutral') },
        ] })),
      h('p', { class: 'small muted' }, report.scope),
      !owner.value ? h('p', null, 'Analysis is available without an owner. Choose an active verification owner and compare again to commission linked work.') : null,
      source.autoPropagate === false ? h('p', { role: 'status' }, 'Case automation is paused. No evidence gate can be commissioned until you explicitly enable it on the case.') : null,
      h('p', { class: 'small muted' }, 'A review captures these numbers in an editable decision record, not a causal verdict or tamper-proof archive. Same inputs and owner reuse the existing gate. Changed workspace revisions require a fresh comparison. This is a local revision check, not cross-tab transaction isolation.'),
    );
  } },
  h('div', { class: 'robustness-input-grid' },
    h('div', { class: 'stack-xs' }, h('label', { for: 'robustness-case' }, 'Operational case'), select),
    h('div', { class: 'stack-xs' }, h('label', { for: 'robustness-owner' }, 'Verification owner (for commissioning only)'), owner),
    ...controls),
  h('div', { class: 'page-actions' }, h('button', { class: 'btn', type: 'submit' }, 'Analyze exact robustness'), exportButton, commission));
  return card({ title: 'Mitigation robustness & evidence gate',
    subtitle: 'Is the choice still defensible when your probability assumption is wrong? Exact Savage minimax regret over declared intervals, then owned evidence-gathering through the real automation spine.',
    body: h('section', { class: 'stack-md', 'aria-label': 'Mitigation robustness analysis' },
      banner({ tone: 'info', title: 'Probabilities must come from you, not an ordinal risk score',
        body: 'Enter independent event-probability ranges for the same future horizon. Case losses must be conditional on that event and comparable under both plans. Do not enter a confidence interval or convert FMEA occurrence ratings into probabilities. No range is prefilled. Safety, compliance and causal validity remain human judgments.' }),
      !cases.length ? h('p', null, 'Start with an open case and conditional loss estimates. ', h('a', { href: '#/cases' }, 'Open operational cases')) : null,
      !owners.length ? h('p', null, 'You can analyze without a team member. ', h('a', { href: '#/people' }, 'Add a verification owner'), ' before commissioning work.') : null,
      form, output) });
}
