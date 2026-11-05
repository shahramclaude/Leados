import { h, uid } from '../ui/dom.js';
import { pageHeader, card, banner, stat, table } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { addDays, dayKey } from '../core/time.js';
import { analyzeRobustness, robustnessCaseInput, robustnessWorksheet, parseRobustnessWorksheet, ROBUSTNESS_DUTIES } from '../core/domain/decisionRobustness.js';

const amount = (n) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
const region = (row) => `${(Math.floor(row.low * 100 + 1e-9) / 100).toFixed(2)}–${(Math.ceil(row.high * 100 - 1e-9) / 100).toFixed(2)}`;
const preference = (key) => ({ act: 'Intervene', wait: 'Wait + review', tie: 'Tie — no unique choice' })[key];

/** No record-level survey reads, API report calls or automatic data prefill. */
export function renderDecisionRobustness(ctx) {
  const seat = ctx.seatContext?.seat;
  const altitude = seat?.altitude?.key || seat?.altitudeKey || ctx.state.settings.chainLeaderAltitude || 'manager';
  const duty = ROBUSTNESS_DUTIES[altitude] || ROBUSTNESS_DUTIES.manager;
  const controls = {};
  let analysis = null;
  let committed = false;
  const output = h('div', { class: 'stack', 'data-testid': 'robustness-results' });
  const status = h('p', { role: 'status', 'aria-live': 'polite' });
  const commitStatus = h('div', { role: 'status', 'aria-live': 'polite' });
  const downloadFallback = h('div');

  function field(key, label, { type = 'number', min, max, value = '', hint = '', required = true } = {}) {
    const id = uid('robust');
    const hintId = `${id}-hint`;
    const input = type === 'textarea'
      ? h('textarea', { id, name: key, rows: 3, required, maxLength: 600 })
      : h('input', { id, name: key, type, min, max, step: 'any', value, required });
    controls[key] = input;
    if (hint) input.setAttribute('aria-describedby', hintId);
    return h('div', { class: 'form-field' }, h('label', { for: id }, label), input,
      hint ? h('p', { id: hintId, class: 'muted small' }, hint) : null);
  }

  const numericKeys = ['mean', 'coverage', 'missingLow', 'missingHigh', 'target', 'cost', 'loss', 'effectiveness'];
  const commit = h('button', { type: 'submit', class: 'btn btn-primary', disabled: true }, 'Create reviewed case + decision + task');
  const exportButton = h('button', { type: 'button', class: 'btn btn-ghost', disabled: true, onClick: () => {
    if (!analysis?.ok) return;
    const text = robustnessWorksheet(analysis);
    if (!downloadText({ filename: 'private-robustness-scenario.json', text, mime: 'application/json' })) {
      downloadFallback.replaceChildren(h('label', null, 'Download unavailable — copy your private worksheet', h('textarea', { rows: 10, readonly: true, value: text })));
    }
  } }, 'Export private scenario worksheet');

  function invalidate() {
    if (!analysis) return;
    analysis = null;
    output.replaceChildren();
    downloadFallback.replaceChildren();
    commit.disabled = true;
    exportButton.disabled = true;
    status.textContent = 'Assumptions changed. Analyze again before approving work.';
  }

  const importId = uid('robust-import');
  const importStatus = h('p', { role: 'status' });
  const importControl = h('input', { id: importId, type: 'file', accept: '.json,application/json', onChange: async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = file.size > 65536 ? { ok: false, error: 'Choose a scenario worksheet smaller than 64 KiB.' }
        : parseRobustnessWorksheet(await file.text());
      if (!parsed.ok) { importStatus.textContent = parsed.error; return; }
      invalidate();
      numericKeys.forEach((key) => { controls[key].value = parsed.assumptions[key]; });
      importStatus.textContent = 'Assumptions loaded locally. Stored result claims were ignored; analyze to recompute.';
    } catch { importStatus.textContent = 'The file could not be read. No scenario was imported.'; }
    finally { event.target.value = ''; }
  } });

  const form = h('form', { class: 'stack', onSubmit: (event) => {
    event.preventDefault();
    const result = analyzeRobustness(Object.fromEntries(numericKeys.map((key) => [key, controls[key].value])));
    if (!result.ok) {
      analysis = null; commit.disabled = true; exportButton.disabled = true; output.replaceChildren();
      status.textContent = result.error;
      controls[result.field]?.focus();
      return;
    }
    analysis = result;
    commit.disabled = committed;
    exportButton.disabled = false;
    status.textContent = 'Scenario analyzed. All results are conditional on your declarations, not a finding about employees.';
    output.replaceChildren(
      h('div', { class: 'stat-row' },
        stat({ label: 'Possible group mean', value: region(result), hint: 'Identification bounds, rounded outward — not a confidence interval' }),
        stat({ label: 'Minimax-regret choice', value: preference(result.preferred), hint: result.dominance === 'none' ? 'No strict dominance across the entire region' : `${preference(result.dominance)} has lower loss throughout this region` }),
        stat({ label: 'Residual worst-case regret', value: amount(result.regretCeiling), hint: 'Declared loss units; not expected loss' }),
      ),
      banner({ tone: result.threshold === 'crosses' ? 'warn' : 'info', title: result.threshold === 'crosses' ? 'The region crosses your target' : result.threshold === 'below' ? 'The whole region is below your target' : 'The whole region meets your target',
        body: `With unrestricted missing-group scores (1–5), the region is ${region(result.unrestricted)} and the minimax choice is ${preference(result.unrestricted.preferred)}. If that changes your decision, the narrower missing-group assumption is doing consequential work.` }),
      card({ title: 'What could make this the wrong choice?', subtitle: 'Savage minimax regret compares each action with the better action in the same possible world. Loss is linear in shortfall; effectiveness is your causal assumption, not an estimate.',
        body: table({ caption: 'Two-action regret comparison', columns: [
          { label: 'Action', render: (r) => r.action },
          { label: 'Loss at lower mean', render: (r) => amount(r.low) },
          { label: 'Loss at upper mean', render: (r) => amount(r.high) },
          { label: 'Maximum regret', render: (r) => amount(r.regret) },
        ], rows: [
          { action: 'Intervene', low: result.losses[0].act, high: result.losses[1].act, regret: result.actRegret },
          { action: 'Wait + review', low: result.losses[0].wait, high: result.losses[1].wait, regret: result.waitRegret },
        ] }) }),
      card({ title: 'Decision boundary & evidence budget', body: h('div', { class: 'stack' },
        h('p', null, `The minimax choice switches at intervention cost ${amount(result.costSwitch)} (all other assumptions fixed); at that cost the two regrets tie.`),
        h('p', null, `Even perfect information can remove at most ${amount(result.regretCeiling)} of this model’s current worst-case regret. This is an optimistic ceiling on a measurement budget in the same loss units, not an expected value or a recommendation to buy a survey.`),
        h('p', { class: 'muted' }, 'Model: group mean = coverage × respondent mean + (1 − coverage) × missing-group mean. Wait loss = loss-per-point × max(0, target − group mean). Intervention loss = cost + (1 − effectiveness) × wait loss.'),
      ) }),
      card({ title: 'Coverage stress test', subtitle: 'These are hypothetical distinct-coverage levels, never inferred from submission counts. The missing-group bounds and all costs stay fixed.',
        body: table({ caption: 'Coverage sensitivity', columns: [
          { label: 'Assumed coverage', render: (r) => `${r.coverage}%` },
          { label: 'Possible mean', render: region },
          { label: 'Minimax choice', render: (r) => preference(r.preferred) },
          { label: 'Worst-case regret', render: (r) => amount(r.regretCeiling) },
        ], rows: result.sensitivity }) }),
    );
  } },
    card({ title: '1 · Declare the evidence you are willing to assume', subtitle: 'No values are silently taken from your survey. Anonymous, repeated or self-declared responses do not establish distinct coverage.',
      body: h('div', { class: 'grid grid-2' },
        field('mean', 'Scenario respondent mean (1–5)', { min: 1, max: 5 }),
        field('coverage', 'Assumed distinct coverage (%)', { min: 0, max: 100, hint: 'Must describe the same population and window as the mean. A hypothetical assumption, not a verified response rate.' }),
        field('missingLow', 'Missing-group lower mean', { min: 1, max: 5, value: 1 }),
        field('missingHigh', 'Missing-group upper mean', { min: 1, max: 5, value: 5, hint: 'Keep 1–5 unless you can justify narrower bounds without guessing who answered.' }),
      ) }),
    card({ title: '2 · Price a reversible intervention', subtitle: 'Use one common unit and horizon throughout (for example hours of capacity this month). No defaults are invented for costs or effectiveness.',
      body: h('div', { class: 'grid grid-2' },
        field('target', 'Desired score (1–5)', { min: 1, max: 5 }),
        field('cost', 'Intervention cost (loss units)', { min: 0, max: 1000000000 }),
        field('loss', 'Loss per point below target (same units)', { min: 0, max: 1000000000 }),
        field('effectiveness', 'Assumed shortfall-loss reduction (%)', { min: 0, max: 100, hint: 'A declared causal scenario. This calculator cannot estimate an intervention’s effectiveness.' }),
      ) }),
    h('div', { class: 'form-actions' }, h('button', { type: 'submit', class: 'btn btn-primary' }, 'Analyze decision robustness'), exportButton), status,
  );
  numericKeys.forEach((key) => controls[key].addEventListener('input', invalidate));

  const ownerId = uid('robust-owner');
  const owners = (ctx.state.people || []).filter((p) => p.status !== 'archived' && (!seat || seat.fullAccess || seat.scope?.has(p.id)));
  const owner = h('select', { id: ownerId, name: 'ownerId', required: true },
    h('option', { value: '' }, 'Choose an owner'), ...owners.map((p) => h('option', { value: p.id }, p.name)));
  const choiceId = uid('robust-choice');
  const choice = h('select', { id: choiceId, name: 'choice', required: true }, h('option', { value: '' }, 'Choose independently of the model'), h('option', { value: 'act' }, 'Intervene reversibly'), h('option', { value: 'wait' }, 'Wait with an observable review criterion'));
  const approval = h('form', { class: 'stack', onSubmit: (event) => {
    event.preventDefault();
    if (committed) return;
    const prepared = robustnessCaseInput({ analysis, choice: choice.value, ownerId: owner.value,
      reviewOn: controls.reviewOn.value, plan: controls.plan.value, rationale: controls.rationale.value, altitude });
    if (!prepared.ok) { commitStatus.textContent = prepared.error; return; }
    commit.disabled = true;
    try {
      const result = ctx.api.addCase(prepared.data);
      if (!result.ok) { commit.disabled = false; commitStatus.textContent = result.error || 'The case was not created.'; return; }
      committed = true;
      const failed = (result.propagations || []).filter((p) => p.status === 'rolled-back');
      commitStatus.replaceChildren(h('p', null, failed.length
        ? 'Case created, but an automation rule rolled back. Review Automation Control Room; do not assume every linked record exists.'
        : 'Reviewed case created. Inspect its generated decision, task and hierarchy links; the numerical worksheet stayed out of the operational graph.'),
      h('a', { href: `#/case/${encodeURIComponent(result.id)}`, class: 'btn btn-primary' }, 'Open case & links'),
      h('a', { href: '#/assurance', class: 'btn btn-ghost' }, 'Automation Control Room'));
      // Store subscribers re-render synchronously; navigate the live tree rather
      // than leaving the receipt on the old detached form.
      ctx.navigate?.(failed.length ? '#/assurance' : `#/case/${encodeURIComponent(result.id)}`);
    } catch (error) {
      // A store listener can throw after a commit. Do not enable a blind retry.
      committed = true;
      commitStatus.textContent = `The write could not be confirmed: ${error.message}. Check Cases and storage warnings before retrying to avoid duplicates.`;
    }
  } }, card({ title: `3 · ${duty.title}`, subtitle: 'Explicit approval creates ordinary operational work. Do not put private survey comments, identities or scores in the plan or rationale. The numerical worksheet is not saved with the case.',
    body: h('div', { class: 'stack' },
      h('div', { class: 'grid grid-2' }, h('div', { class: 'form-field' }, h('label', { for: ownerId }, 'Accountable owner'), owner), h('div', { class: 'form-field' }, h('label', { for: choiceId }, 'Your chosen response'), choice)),
      field('reviewOn', 'Review date', { type: 'date', min: dayKey(ctx.now), value: dayKey(addDays(ctx.now, duty.reviewDays)) }),
      field('plan', 'Action + observable review criterion', { type: 'textarea' }),
      field('rationale', 'Why this choice (including any model override)', { type: 'textarea' }),
      h('p', { class: 'muted' }, 'The existing event engine creates the DACI decision and owned task, and rolls work up the declared reporting tree. It does not spend money, contact staff or certify survey privacy. Follow-through and closure remain in the linked case.'),
      owners.length ? null : h('p', { role: 'status' }, 'No active owner is available in this span. Add or restore a person through your permitted roster workflow first.'),
      commit, commitStatus,
    ) }));

  return h('div', { class: 'page stack robustness-lab' },
    pageHeader({ eyebrow: 'Evidence → decision → accountable work', title: 'Decision robustness lab', subtitle: duty.question }),
    banner({ tone: 'info', title: 'Missing voices are uncertainty, not a diagnosis', body: 'Manski partial-identification bounds and Savage minimax regret, calculated locally. This sandbox does not read pulse answers, identify respondents, infer resignation risk or claim a representative sample. Assumptions remain unsaved unless you export the private worksheet; only your approved operational plan is recorded.' }),
    h('details', { class: 'card' }, h('summary', null, 'Replay a saved private scenario'),
      h('div', { class: 'stack' }, h('label', { for: importId }, 'Scenario worksheet (JSON, up to 64 KiB)'), importControl, importStatus)),
    form, output, downloadFallback, approval,
  );
}
