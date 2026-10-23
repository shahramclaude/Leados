// ⚠️ DEMO / ILLUSTRATIVE DATA ONLY.
// Every number in this file is a hand-authored sample used to render the UI.
// None of it was produced by a real eval runner, CI gate, contrast compiler,
// or production telemetry. Swap this module for real API calls when wiring
// this console to an actual backend + measurement pipeline.

import type {
  ActionPolicy,
  EvalSuiteRow,
  MutationOperator,
  DriftAlertRow,
  SelfAuditFindingRow,
  GrandGateRow,
  DesignTokenRow,
  PipelineHealthRow,
} from '../types';

export const actionPolicies: ActionPolicy[] = [
  { actionId: 'act.email.send', label: 'Send stakeholder email', tier: 'T2', budgetUsdPerDay: 0, budgetCountPerDay: 200, approvalMode: 'none', undoWindowMin: 10, burnPct: 42 },
  { actionId: 'act.price.change', label: 'Change SKU price', tier: 'T3', budgetUsdPerDay: 5000, budgetCountPerDay: 20, approvalMode: 'single', undoWindowMin: 60, burnPct: 61 },
  { actionId: 'act.budget.reallocate', label: 'Reallocate team budget', tier: 'T3', budgetUsdPerDay: 25000, budgetCountPerDay: 5, approvalMode: 'dual', undoWindowMin: null, burnPct: 18 },
  { actionId: 'act.vendor.renew', label: 'Auto-renew vendor contract', tier: 'T4', budgetUsdPerDay: 10000, budgetCountPerDay: 3, approvalMode: 'none', undoWindowMin: null, burnPct: 73 },
  { actionId: 'act.org.restructure', label: 'Execute org restructure step', tier: 'T5', budgetUsdPerDay: 0, budgetCountPerDay: 1, approvalMode: 'dual', undoWindowMin: null, burnPct: 0 },
  { actionId: 'act.report.draft', label: 'Draft board communication', tier: 'T1', budgetUsdPerDay: 0, budgetCountPerDay: 50, approvalMode: 'none', undoWindowMin: null, burnPct: 29 },
];

export const evalSuites: EvalSuiteRow[] = [
  { id: 'suite-exec-copilot', surface: 'Executive copilot chat', target: 'pipeline', golden: 34, adversarial: 22, meanScore: 0.88, p10: 0.71, mutationScore: 0.74, pass: true },
  { id: 'suite-comms-drafts', surface: 'Stakeholder comms drafting', target: 'prompt', golden: 31, adversarial: 20, meanScore: 0.83, p10: 0.65, mutationScore: 0.69, pass: false },
  { id: 'suite-viz-recommender', surface: 'Chart recommender', target: 'pipeline', golden: 40, adversarial: 25, meanScore: 0.91, p10: 0.80, mutationScore: 0.77, pass: true },
  { id: 'suite-forecast-narrative', surface: 'Forecast narrative generator', target: 'model', golden: 30, adversarial: 21, meanScore: 0.86, p10: 0.68, mutationScore: 0.72, pass: true },
  { id: 'suite-ui-empty-states', surface: 'Empty/loading/error states', target: 'ui', golden: 30, adversarial: 20, meanScore: 0.95, p10: 0.89, mutationScore: 0.81, pass: true },
  { id: 'suite-self-audit', surface: 'Nightly self-audit job', target: 'pipeline', golden: 28, adversarial: 18, meanScore: 0.79, p10: 0.58, mutationScore: 0.66, pass: false },
];

export const mutationOperators: MutationOperator[] = [
  { id: 'op-order-swap', name: 'Instruction order swap', description: 'Reorders system-prompt instructions to test order sensitivity.', difficulty: 'low', catchRatePct: 92 },
  { id: 'op-constraint-weaken', name: 'Constraint weakening', description: 'Softens a hard constraint (e.g. "must cite source" → "should cite source").', difficulty: 'medium', catchRatePct: 78 },
  { id: 'op-example-removal', name: 'Few-shot example removal', description: 'Strips one or more in-context examples.', difficulty: 'low', catchRatePct: 88 },
  { id: 'op-negation-flip', name: 'Negation flip', description: 'Flips a negation in a rule ("never" → "always").', difficulty: 'high', catchRatePct: 61 },
  { id: 'op-number-perturb', name: 'Numeric perturbation', description: 'Changes a threshold/number embedded in the prompt.', difficulty: 'medium', catchRatePct: 70 },
  { id: 'op-role-drop', name: 'Role/persona drop', description: 'Removes persona or audience framing.', difficulty: 'low', catchRatePct: 85 },
  { id: 'op-format-strip', name: 'Output format removal', description: 'Removes required output schema/format instructions.', difficulty: 'medium', catchRatePct: 74 },
  { id: 'op-synonym-sub', name: 'Synonym substitution', description: 'Replaces domain terms with near-synonyms to test robustness.', difficulty: 'high', catchRatePct: 58 },
  { id: 'op-context-trunc', name: 'Context truncation', description: 'Truncates retrieved context mid-fact.', difficulty: 'medium', catchRatePct: 69 },
  { id: 'op-tone-shift', name: 'Tone/hedging shift', description: 'Forces more confident phrasing than evidence supports.', difficulty: 'high', catchRatePct: 55 },
  { id: 'op-injection-insert', name: 'Prompt injection insert', description: 'Inserts an adversarial instruction inside user data.', difficulty: 'high', catchRatePct: 64 },
  { id: 'op-dup-clause', name: 'Duplicate clause', description: 'Duplicates a clause to test redundancy handling.', difficulty: 'low', catchRatePct: 90 },
];

export const driftAlerts: DriftAlertRow[] = [
  { target: 'Executive copilot — tone embedding', method: 'embedding', statistic: 0.041, threshold: 0.08, status: 'stable', since: '2026-10-01' },
  { target: 'Comms drafting — length distribution', method: 'ks', statistic: 0.19, threshold: 0.15, status: 'watch', since: '2026-10-18' },
  { target: 'Viz recommender — chart-type mix', method: 'psi', statistic: 0.27, threshold: 0.20, status: 'breach', since: '2026-10-20' },
  { target: 'Forecast narrative — hedge-word rate', method: 'ks', statistic: 0.06, threshold: 0.15, status: 'stable', since: '2026-10-01' },
];

export const selfAuditFindings: SelfAuditFindingRow[] = [
  { id: 'SAF-104', severity: 'high', area: 'Data quality', evidence: 'Vendor dataset "spend_ledger" freshness breached SLA 3x in 7 days', owner: 'data-platform', dueDate: '2026-11-03', status: 'open', goodhartFlag: false },
  { id: 'SAF-105', severity: 'critical', area: 'Unproven claims', evidence: 'Board memo draft cited "40% faster" without a linked FactSet claim', owner: 'comms-eng', dueDate: '2026-10-29', status: 'in-progress', goodhartFlag: false },
  { id: 'SAF-106', severity: 'low', area: 'Stale model', evidence: 'Chart-recommender scoring model last retrained 97 days ago', owner: 'ml-platform', dueDate: '2026-11-10', status: 'open', goodhartFlag: false },
  { id: 'SAF-107', severity: 'medium', area: 'Gate status', evidence: 'suite-self-audit mutation score 0.66 < 0.70 floor', owner: 'quality-fabric', dueDate: '2026-11-01', status: 'open', goodhartFlag: false },
  { id: 'SAF-108', severity: 'low', area: 'Formatting', evidence: 'Dashboard footer uses inconsistent date format on 2 routes', owner: 'design-systems', dueDate: '2026-11-15', status: 'resolved', goodhartFlag: true },
];

export const grandGateMatrix: GrandGateRow[] = [
  { id: 'gate-contrast', part: 65, statement: 'Every emitted token pair meets WCAG contrast', accept: '≥ 4.5:1 (3:1 large text), 100%', measured: '100% of 212 pairs (demo sample)', status: 'pass' },
  { id: 'gate-table-equiv', part: 65, statement: 'Every chart ships a table equivalent', accept: '100% of chart instances', measured: '100% of 41 chart instances (demo sample)', status: 'pass' },
  { id: 'gate-eval-coverage', part: 66, statement: 'Eval coverage of AI-bearing surfaces', accept: '≥ 85%, per-surface ≥ 30 golden + ≥ 20 adversarial', measured: '6/6 surfaces meet minimums; 2/6 below score floor', status: 'fail' },
  { id: 'gate-mutation-score', part: 66, statement: 'Mutation score per suite', accept: '≥ 70%', measured: '4/6 suites ≥ 70%, 2/6 below (demo)', status: 'fail' },
  { id: 'gate-action-gate-chokepoint', part: 67, statement: 'All side-effecting calls pass the Action Gate', accept: '100%, 50/50 bypass attempts denied', measured: 'not instrumented in this environment', status: 'never-run' },
  { id: 'gate-kill-switch', part: 67, statement: 'Kill-switch latency', accept: '≤ 30s', measured: 'not instrumented in this environment', status: 'never-run' },
  { id: 'gate-dataops-heal', part: 69, statement: 'Self-heal success on injected faults', accept: '≥ 90% per fault class', measured: 'fault harness not run in this environment', status: 'never-run' },
  { id: 'gate-drift-false-alarm', part: 66, statement: 'Drift false-alarm rate on 30-day stable replay', accept: '≤ 10%', measured: 'no 30-day replay available', status: 'unknown' },
  { id: 'gate-replay-determinism', part: 73, statement: 'Deterministic replay of agent runs', accept: '≥ 99% of 200 runs', measured: 'not instrumented in this environment', status: 'never-run' },
];

export const designTokens: DesignTokenRow[] = [
  { name: 'color.surface.raised', kind: 'color', semantic: 'surface/raised', light: '#FFFFFF', dark: '#15161B', highContrast: '#000000', contrastVsBg: 1.05, contrastPass: true },
  { name: 'color.text.primary', kind: 'color', semantic: 'text/primary', light: '#14151A', dark: '#F4F5F7', highContrast: '#FFFFFF', contrastVsBg: 15.8, contrastPass: true },
  { name: 'color.text.critical', kind: 'color', semantic: 'text/critical', light: '#B3261E', dark: '#FFB4AB', highContrast: '#FF6B61', contrastVsBg: 5.1, contrastPass: true },
  { name: 'color.chart.series-1', kind: 'color', semantic: 'chart/categorical-1', light: '#5B5BD6', dark: '#8A8AF0', highContrast: '#B3B3FF', contrastVsBg: 4.6, contrastPass: true },
  { name: 'color.chart.series-2', kind: 'color', semantic: 'chart/categorical-2', light: '#C2410C', dark: '#FDBA74', highContrast: '#FFD9B3', contrastVsBg: 4.9, contrastPass: true },
  { name: 'space.4', kind: 'space', semantic: 'layout/gap-sm', light: '8px', dark: '8px', highContrast: '8px', contrastVsBg: 0, contrastPass: true },
  { name: 'radius.card', kind: 'radius', semantic: 'surface/card-radius', light: '14px', dark: '14px', highContrast: '4px', contrastVsBg: 0, contrastPass: true },
  { name: 'motion.transition.base', kind: 'motion', semantic: 'motion/standard', light: '160ms', dark: '160ms', highContrast: '0ms', contrastVsBg: 0, contrastPass: true },
];

export const pipelineHealth: PipelineHealthRow[] = [
  { dataset: 'revenue_events', owner: 'finance-data', freshnessSlaMin: 15, observedLagMin: 6, status: 'on-time', lastHeal: '—' },
  { dataset: 'crm_pipeline_snapshot', owner: 'rev-ops', freshnessSlaMin: 60, observedLagMin: 142, status: 'degraded', lastHeal: '2026-10-22 03:14 — retry x2' },
  { dataset: 'spend_ledger', owner: 'data-platform', freshnessSlaMin: 30, observedLagMin: 410, status: 'quarantined', lastHeal: '2026-10-21 22:02 — quarantined, referential break' },
  { dataset: 'hr_roster', owner: 'people-data', freshnessSlaMin: 240, observedLagMin: 51, status: 'on-time', lastHeal: '—' },
  { dataset: 'support_tickets', owner: 'cx-data', freshnessSlaMin: 10, observedLagMin: 4, status: 'on-time', lastHeal: '—' },
];

export const evalScoreTrend = [
  { day: 'Mon', mean: 0.81, mutation: 0.63 },
  { day: 'Tue', mean: 0.83, mutation: 0.66 },
  { day: 'Wed', mean: 0.82, mutation: 0.68 },
  { day: 'Thu', mean: 0.86, mutation: 0.70 },
  { day: 'Fri', mean: 0.85, mutation: 0.71 },
  { day: 'Sat', mean: 0.87, mutation: 0.72 },
  { day: 'Sun', mean: 0.88, mutation: 0.74 },
];

export const gateSummary = {
  totalGates: grandGateMatrix.length,
  pass: grandGateMatrix.filter((g) => g.status === 'pass').length,
  fail: grandGateMatrix.filter((g) => g.status === 'fail').length,
  unknown: grandGateMatrix.filter((g) => g.status === 'unknown').length,
  neverRun: grandGateMatrix.filter((g) => g.status === 'never-run').length,
};
