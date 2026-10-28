import { h, toast, openModal } from '../ui/dom.js';
import { card, table, banner } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { rehearseCaseMitigation, rehearsalBrief } from '../services/caseRehearsal.js';

function compute(state, caseId, input, now) {
  if (typeof Worker === 'undefined' || (typeof window !== 'undefined' && window.__LEADOS_STANDALONE__)) return Promise.resolve(rehearseCaseMitigation(state, caseId, input, { now }));
  return new Promise((resolve) => {
    const worker = new Worker(new URL('./app/services/caseRehearsal.worker.js', document.baseURI), { type: 'module' });
    const finish = (value) => { clearTimeout(timer); worker.terminate(); resolve(value); };
    const timer = setTimeout(() => finish({ ok: false, error: 'Rehearsal exceeded 30 seconds. No live data changed.' }), 30000);
    worker.onmessage = ({ data }) => finish(data);
    worker.onerror = () => finish({ ok: false, error: 'Rehearsal worker failed to start. No live data changed.' });
    worker.postMessage({ state, caseId, input, now: now.toISOString() });
  });
}

export function caseRehearsalPanel(ctx) {
  const output = h('div', { 'aria-live': 'polite' });
  const cases = (ctx.state.cases || []).filter((c) => ['open', 'mitigating', 'monitoring'].includes(c.status));
  const select = h('select', { id: 'rehearsal-case' }, h('option', { value: '' }, 'Choose an open case…'),
    ...cases.map((c) => h('option', { value: c.id }, c.title)));
  const fields = {};
  const inputs = [
    ['residualSeverity', 'Proposed residual severity', 1, 10, 1],
    ['residualProbability', 'Proposed residual occurrence', 1, 10, 1],
    ['residualDetectability', 'Proposed residual detection gap', 1, 10, 1],
    ['mitigationCost', 'Additional mitigation cost (case currency)', 0, 1e12, 0.01],
  ].map(([key, label, min, max, step]) => {
    fields[key] = h('input', { id: `rehearsal-${key}`, type: 'number', min, max, step, required: true });
    return h('div', null, h('label', { for: `rehearsal-${key}` }, label), fields[key]);
  });
  let result = null; let generation = 0;
  const exportButton = h('button', { class: 'btn', type: 'button', disabled: true, onClick: () => {
    if (!result) return;
    const text = rehearsalBrief(result);
    if (!downloadText({ filename: 'leados-mitigation-rehearsal.txt', text, mime: 'text/plain' })) {
      openModal({ title: 'Copy rehearsal brief', body: h('textarea', { readOnly: true, rows: 16, 'aria-label': 'Rehearsal brief' }, text) });
    }
  } }, 'Export comparison');
  const invalidate = () => { generation += 1; result = null; exportButton.disabled = true; output.replaceChildren(); };
  select.addEventListener('change', invalidate);
  Object.values(fields).forEach((field) => field.addEventListener('input', invalidate));
  const run = h('button', { class: 'btn btn-primary', type: 'button', onClick: async () => {
    invalidate();
    if (!select.value) { toast('Choose an open case first.', 'bad'); return; }
    const ticket = generation;
    const caseId = select.value;
    const input = Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.value]));
    run.disabled = true;
    // Yield for a paint before bounded synchronous domain work.
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      const value = await compute(ctx.state, caseId, input, ctx.now);
      if (ticket !== generation) return;
      if (!value.ok) { output.replaceChildren(h('p', { role: 'alert' }, value.error)); return; }
      result = value; exportButton.disabled = false;
      const failures = value.baseline.failureCount + value.proposed.failureCount;
      const rows = ['baseline', 'proposed'].flatMap((variant) => value[variant].changes.map((r) => ({ variant, ...r })));
      const links = ['baseline', 'proposed'].flatMap((variant) => value[variant].graphDelta.relationships.map((r) => ({ variant, ...r })));
      const s = value.sensitivity;
      output.replaceChildren(
        h('p', { class: 'small muted' }, value.scope),
        failures ? banner({ tone: 'warn', title: 'Incomplete rehearsal', body: `${failures} post-commit rule failures were isolated. Do not treat this comparison as a complete automation result.` }) : null,
        !value.proposed.automationEnabled ? banner({ tone: 'warn', title: 'Case automation is paused', body: 'This rehearsal respects the pause; it does not silently enable propagation.' }) : null,
        table({ caption: 'Action-level cross-module changes', rows, columns: [
          { label: 'Alternative', render: (r) => r.variant }, { label: 'Collection', render: (r) => r.collection },
          { label: 'Created', render: (r) => r.created }, { label: 'Updated', render: (r) => r.updated }, { label: 'Removed', render: (r) => r.removed },
        ], emptyMessage: 'No operational collection changes.' }),
        table({ caption: 'Action-level relationship changes', rows: links, columns: [
          { label: 'Alternative', render: (r) => r.variant }, { label: 'From', render: (r) => r.sourceType },
          { label: 'Relationship', render: (r) => r.relation }, { label: 'To', render: (r) => r.targetType },
          { label: 'Added', render: (r) => r.added }, { label: 'Removed', render: (r) => r.removed },
        ], emptyMessage: 'No valid operational relationship changes.' }),
        h('p', null, `Residual RPN: current ${value.baseline.residualRpn ?? 'not rated'} → proposed ${value.proposed.residualRpn ?? 'not rated'}. RPN is an ordinal prioritization aid, not a probability or a safety clearance.`),
        s.available ? h('div', null,
          h('h3', null, 'Savage minimax-regret sensitivity'),
          h('p', null, `Conditional preference: ${s.preference}. Maximum regret: hold ${s.holdRegret}; proposed ${s.proposedRegret} ${s.currency}. No probabilities are assigned to these three scenarios.`),
          h('p', null, `Baseline uses ${s.baselineSource} (${s.baselineOccurrence}/10). Break-even loss: ${s.breakEvenLoss === null ? 'none: occurrence does not improve' : `${s.breakEvenLoss} ${s.currency}`}.`),
          table({ caption: 'Declared loss scenarios — not confidence intervals', rows: s.rows, columns: [
            { label: 'Scenario', render: (r) => r.scenario }, { label: 'Loss', render: (r) => r.loss },
            { label: 'Hold cost proxy', render: (r) => r.hold }, { label: 'Proposed cost proxy', render: (r) => r.proposed },
            { label: 'Saving', render: (r) => r.saving },
          ] }),
          s.safetyWarning ? h('p', { role: 'alert' }, s.safetyWarning) : null,
        ) : h('p', null, s.reason),
        h('p', { class: 'small muted' }, 'No live edits were made. To adopt, edit the original case after reviewing its current facts. This lab deliberately cannot apply stale preview state.'),
      );
    } catch { output.replaceChildren(h('p', { role: 'alert' }, 'Unable to run rehearsal. No live records changed.'));
    } finally { run.disabled = false; }
  } }, 'Compare actual action paths');
  return card({ title: 'Counterfactual mitigation lab', subtitle: 'Two isolated workspaces, identical facts and clock: refresh the current plan versus record your proposed mitigation. Both run the real validated case-edit action and its entire rule cascade.',
    body: h('div', null,
      banner({ tone: 'info', title: 'Assumptions, not predictions', body: 'Occurrence rating ÷ 10 is an uncalibrated economic sensitivity proxy, not measured probability. Proposed cost is an additional investment; historical spending is sunk. Severity and detection changes do not mechanically reduce financial loss. Safety and compliance override financial rankings.' }),
      h('label', { for: 'rehearsal-case' }, 'Case to rehearse'), select, ...inputs,
      h('div', { class: 'page-actions' }, run, exportButton), output) });
}
