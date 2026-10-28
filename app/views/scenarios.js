/**
 * app/views/scenarios.js — Counterfactual Scenario Sandbox, Multi-Objective
 * Pareto Trade-Off Matrix & One-at-a-Time (OAT) Tornado Sensitivity Lab.
 *
 * Non-persisted What-If sandbox (`structuredClone`): toggling scope, owner
 * assignments, case mitigations, org-change sequences, hiring start dates
 * (Brooks's Law adjusted), or operating reserves never mutates `store.state`
 * or the audit log until the leader explicitly clicks "Record DACI decision"
 * or "Commit levers & record DACI".
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { pageHeader, card, stat, badge, emptyState } from '../ui/components.js';
import { tornadoChart } from '../ui/charts.js';
import { downloadText } from '../ui/download.js';
import { addDays, dayKey } from '../core/time.js';
import { isCaseOpen } from '../core/domain/cases.js';
import { isChangeOpen } from '../core/domain/changes.js';
import { pertTriple } from '../core/domain/capacity.js';
import {
  DEFAULT_MENTORING_DRAG_DAYS,
  buildSuggestedScenarios,
  compareScenarios,
  computeSensitivityTornado,
  countScenarioLevers,
} from '../core/domain/scenarios.js';

const SANDBOX_BY_API = new WeakMap();

function emptySandboxSpec() {
  return {
    id: 'custom-sandbox',
    name: 'Custom what-if sandbox',
    category: 'custom',
    description: 'Interactive counterfactual adjustments evaluated in memory against Live Baseline.',
    levers: {
      portfolioDecisions: [],
      hypotheticalItems: [],
      caseMitigations: [],
      changeActions: [],
      hiringActions: [],
      dependencyHardening: [],
      settingsPatch: {},
      absenceCount: 0,
    },
  };
}

function getSandboxSession(ctx) {
  let session = SANDBOX_BY_API.get(ctx.api);
  if (!session) {
    session = {
      spec: emptySandboxSpec(),
      appliedQuerySignature: '',
    };
    SANDBOX_BY_API.set(ctx.api, session);
  }

  const qSig = ctx.query ? ctx.query.toString() : '';
  if (qSig && qSig !== session.appliedQuerySignature) {
    session.appliedQuerySignature = qSig;
    const presetId = ctx.query.get('preset');
    const deferId = ctx.query.get('defer');
    const mitigateCase = ctx.query.get('mitigateCase');
    const pauseChange = ctx.query.get('pauseChange');
    const alignChange = ctx.query.get('alignChange');
    const hireReq = ctx.query.get('hireReq');
    const hardenDep = ctx.query.get('hardenDep');

    if (presetId) {
      const presets = buildSuggestedScenarios(ctx.state, { now: ctx.now });
      const found = presets.find((p) => p.id === presetId);
      if (found) {
        session.spec = {
          ...emptySandboxSpec(),
          name: found.name,
          description: found.description,
          levers: {
            ...emptySandboxSpec().levers,
            ...structuredClone(found.levers || {}),
          },
        };
      }
    } else if (deferId || mitigateCase || pauseChange || alignChange || hireReq || hardenDep) {
      const next = emptySandboxSpec();
      const parts = [];
      if (deferId) {
        next.levers.portfolioDecisions.push({ itemId: deferId, decision: 'deferred' });
        parts.push('defer scope');
      }
      if (mitigateCase) {
        next.levers.caseMitigations.push(mitigateCase);
        parts.push('mitigate case');
      }
      if (pauseChange) {
        next.levers.changeActions.push({ changeId: pauseChange, action: 'pause' });
        parts.push('pause change');
      }
      if (alignChange) {
        next.levers.changeActions.push(
          { changeId: alignChange, action: 'align-coalition' },
          { changeId: alignChange, action: 'mitigate-barriers' },
        );
        parts.push('align coalition');
      }
      if (hireReq) {
        next.levers.hiringActions.push({
          reqId: hireReq,
          hireStartOn: addDays(dayKey(ctx.now), 7),
          mentoringDragDays: DEFAULT_MENTORING_DRAG_DAYS,
        });
        parts.push('fill role');
      }
      if (hardenDep) {
        next.levers.dependencyHardening.push(hardenDep);
        parts.push('harden dependency');
      }
      next.name = `Custom: ${parts.join(' + ')}`;
      session.spec = next;
    }
  }
  return session;
}

function fmtPct(v) {
  return v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`;
}

function fmtMoney(currency, amount) {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return '—';
  const n = Math.round(Number(amount));
  const abs = Math.abs(n).toLocaleString('en-US');
  return n < 0 ? `−${currency} ${abs}` : `${currency} ${abs}`;
}

function fmtSigned(n, suffix = '') {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  const v = Math.round(Number(n) * 10) / 10;
  if (v === 0) return `0${suffix}`;
  return `${v > 0 ? '+' : '−'}${Math.abs(v)}${suffix}`;
}

function openCommitScenarioDialog(ctx, scenarioEval, peerScenarios, { commitLevers = false } = {}) {
  const defaultReviewOn = addDays(dayKey(ctx.now), ctx.state.settings?.decisionReviewDays ?? 14);
  const form = buildForm([
    {
      name: 'title',
      label: 'Decision title',
      type: 'text',
      required: true,
      value: `${commitLevers ? 'Committed scenario' : 'Scenario trade-off'}: ${scenarioEval.name}`.slice(0, 160),
    },
    {
      name: 'reversibility',
      label: 'Reversibility (Bezos Type 1 / Type 2)',
      type: 'select',
      value: 'reversible',
      options: [
        { value: 'reversible', label: 'Reversible (two-way door)' },
        { value: 'irreversible', label: 'Irreversible / structural (one-way door)' },
      ],
    },
    {
      name: 'reviewOn',
      label: 'Outcome review date',
      type: 'date',
      value: defaultReviewOn,
    },
    {
      name: 'rationale',
      label: 'Trade-off rationale & stakeholder notes',
      type: 'textarea',
      rows: 3,
      placeholder: 'Why this trade-off beats holding the live baseline or peer options…',
      value: scenarioEval.description || '',
    },
  ]);

  const submit = () => {
    form.clearErrors();
    const data = form.getValues();
    const actionFn = commitLevers ? ctx.api.commitScenarioLevers : ctx.api.recordScenarioDecision;
    const res = actionFn({
      title: data.title,
      reversibility: data.reversibility,
      reviewOn: data.reviewOn || null,
      rationale: data.rationale,
      scenarioSpec: scenarioEval.spec,
      peerScenarios: peerScenarios.map((p) => p.spec),
    });
    if (!res.ok) {
      if (res.field) form.setFieldError(res.field, res.error);
      else toast(res.error, 'bad');
      return;
    }
    if (commitLevers && scenarioEval.id === 'custom-sandbox') {
      const s = SANDBOX_BY_API.get(ctx.api);
      if (s) s.spec = emptySandboxSpec();
    }
    closeAllModals();
    toast(
      commitLevers
        ? `Committed scenario levers and logged DACI decision (${res.propagations.length} RULE-SCN-01 propagation(s)).`
        : `Recorded scenario DACI decision (${res.propagations.length} RULE-SCN-01 link(s)).`,
      'good',
    );
    ctx.navigate(`#/decisions`);
  };

  openModal({
    title: commitLevers
      ? 'Commit scenario levers & record DACI decision'
      : 'Record scenario trade-off in DACI log',
    description: commitLevers
      ? 'Applies this scenario’s portfolio, case, org-change, and operating-reserve levers atomically to the live workspace, logs a DACI decision with Common-Random-Numbers deltas, and cascades RULE-SCN-01.'
      : 'Logs an auditable DACI decision comparing this scenario against Live Baseline and peer options via RULE-SCN-01, while leaving live portfolio, case, and change records untouched.',
    body: h(
      'div',
      { class: 'stack-sm' },
      scenarioEval.appliedLevers.length
        ? h(
            'div',
            { class: 'callout callout-info' },
            h('strong', null, `${scenarioEval.appliedLevers.length} active lever(s): `),
            scenarioEval.appliedLevers.map((l) => l.summary).join(' · '),
          )
        : null,
      form.node,
    ),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h(
        'button',
        { class: 'btn btn-primary', type: 'button', onClick: submit },
        commitLevers ? 'Commit levers & save DACI' : 'Save DACI decision',
      ),
    ],
  });
}

export function renderScenarios(ctx) {
  const { state, now } = ctx;
  const activePeople = (state.people || []).filter((p) => p && p.status !== 'archived');

  if (activePeople.length === 0) {
    return h(
      'div',
      { class: 'page' },
      pageHeader({
        eyebrow: 'Counterfactual decision lab',
        title: 'What-if scenarios & sensitivity',
        subtitle: 'Test scope deferrals, owner reassignments, case mitigations, org-change pacing, and hiring ramps in memory before committing.',
      }),
      emptyState({
        title: 'Add team members and commitments first',
        detail: 'Scenario sandboxing and tornado sensitivity require at least one active team member on the roster.',
        action: h('a', { class: 'btn btn-primary', href: '#/people' }, 'Open People roster'),
      }),
    );
  }

  const session = getSandboxSession(ctx);
  const sandboxSpec = session.spec;
  const sandboxLeverCount = countScenarioLevers(sandboxSpec);
  const presets = buildSuggestedScenarios(state, { now });

  // Build comparison suite: Custom Sandbox (when configured or always shown as interactive slot) + Presets
  const specsToCompare = [
    sandboxSpec,
    ...presets,
  ];
  const comparison = compareScenarios(state, specsToCompare, { now });
  const baseline = comparison.baseline;
  const customEval = comparison.scenarios[1];
  const presetEvals = comparison.scenarios.slice(2);
  const tornado = computeSensitivityTornado(state, { now });

  const exportSensitivityCsv = () => {
    const res = ctx.exportCSV('sensitivity');
    if (!res.ok) {
      toast(res.error || 'Could not export scenario sensitivity CSV.', 'bad');
      return;
    }
    const downloaded = downloadText({
      filename: res.filename,
      text: res.csv,
      mime: 'text/csv;charset=utf-8',
    });
    if (downloaded) {
      toast(`Downloaded ${res.filename} (${res.rowCount} rows)`, 'good');
      return;
    }
    const copyForm = buildForm([
      { name: 'csv', label: res.filename, type: 'textarea', rows: 10, value: res.csv },
    ]);
    openModal({
      title: `Scenario & tornado CSV (${res.rowCount} rows)`,
      description: 'Copy the RFC 4180 / CWE-1236 formula-safe CSV below.',
      body: copyForm.node,
      footer: [h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Close')],
      size: 'lg',
    });
  };

  // --- Sandbox mutators (strictly in-memory on session.spec, never store.state) ---
  const resetSandbox = () => {
    session.spec = emptySandboxSpec();
    ctx.refresh();
  };

  const loadPresetIntoSandbox = (preset) => {
    session.spec = {
      ...emptySandboxSpec(),
      name: `Sandbox: ${preset.name}`.slice(0, 120),
      description: preset.description,
      levers: {
        ...emptySandboxSpec().levers,
        ...structuredClone(preset.levers || {}),
      },
    };
    toast(`Loaded “${preset.name}” into the non-persisted sandbox.`, 'good');
    ctx.refresh();
  };

  const setPortfolioDecisionLever = (itemId, nextDecision, baseDecision) => {
    const list = sandboxSpec.levers.portfolioDecisions.filter((x) => x.itemId !== itemId);
    const existing = sandboxSpec.levers.portfolioDecisions.find((x) => x.itemId === itemId) || {};
    const merged = { ...existing, itemId, decision: nextDecision };
    const baseItem = (state.portfolio || []).find((i) => i.id === itemId);
    const ownerUnchanged = merged.ownerId === undefined || (merged.ownerId || null) === (baseItem?.ownerId || null);
    if (merged.decision === baseDecision && ownerUnchanged) {
      sandboxSpec.levers.portfolioDecisions = list;
    } else {
      sandboxSpec.levers.portfolioDecisions = [...list, merged];
    }
    ctx.refresh();
  };

  const setPortfolioOwnerLever = (itemId, nextOwnerId, baseOwnerId) => {
    const list = sandboxSpec.levers.portfolioDecisions.filter((x) => x.itemId !== itemId);
    const existing = sandboxSpec.levers.portfolioDecisions.find((x) => x.itemId === itemId) || {};
    const baseItem = (state.portfolio || []).find((i) => i.id === itemId);
    const merged = { ...existing, itemId, ownerId: nextOwnerId || null };
    const decUnchanged = !merged.decision || merged.decision === baseItem?.decision;
    if ((merged.ownerId || null) === (baseOwnerId || null) && decUnchanged) {
      sandboxSpec.levers.portfolioDecisions = list;
    } else {
      sandboxSpec.levers.portfolioDecisions = [...list, merged];
    }
    ctx.refresh();
  };

  const toggleCaseMitigation = (caseId, checked) => {
    const cur = new Set(sandboxSpec.levers.caseMitigations);
    if (checked) cur.add(caseId);
    else cur.delete(caseId);
    sandboxSpec.levers.caseMitigations = [...cur];
    ctx.refresh();
  };

  const setChangeActionLever = (changeId, actionValue) => {
    const others = sandboxSpec.levers.changeActions.filter((x) => x.changeId !== changeId);
    if (!actionValue) {
      sandboxSpec.levers.changeActions = others;
    } else if (actionValue === 'align-and-mitigate') {
      sandboxSpec.levers.changeActions = [
        ...others,
        { changeId, action: 'align-coalition' },
        { changeId, action: 'mitigate-barriers' },
      ];
    } else {
      sandboxSpec.levers.changeActions = [...others, { changeId, action: actionValue }];
    }
    ctx.refresh();
  };

  const setHiringLever = (reqId, enabled, hireStartOn, mentoringDragDays) => {
    const others = sandboxSpec.levers.hiringActions.filter((x) => x.reqId !== reqId);
    if (!enabled) {
      sandboxSpec.levers.hiringActions = others;
    } else {
      sandboxSpec.levers.hiringActions = [
        ...others,
        {
          reqId,
          hireStartOn: hireStartOn || addDays(dayKey(now), 7),
          mentoringDragDays: Number.isFinite(Number(mentoringDragDays)) ? Number(mentoringDragDays) : DEFAULT_MENTORING_DRAG_DAYS,
        },
      ];
    }
    ctx.refresh();
  };

  // --- Data slices for Sandbox Builder ---
  const openProjects = (state.portfolio || []).filter(
    (i) => i && i.status === 'open' && i.kind !== 'capacity-reserve',
  );
  const openCases = (state.cases || []).filter((c) => c && isCaseOpen(c));
  const openChanges = (state.changes || []).filter((c) => c && isChangeOpen(c));
  const openReqs = (state.requisitions || []).filter((r) => r && ['open', 'offer'].includes(r.status));
  const hardenableDeps = (state.dependencies || []).filter(
    (d) => d && d.status !== 'retired' && d.substitutability !== 'dual-active' && Number(d.annualFailureProb) > 0,
  );

  const toggleDependencyHardening = (depId, checked) => {
    const cur = Array.isArray(sandboxSpec.levers.dependencyHardening)
      ? sandboxSpec.levers.dependencyHardening
      : [];
    const others = cur.filter((x) => (typeof x === 'string' ? x : x?.dependencyId) !== depId);
    sandboxSpec.levers.dependencyHardening = checked ? [...others, depId] : others;
    ctx.refresh();
  };

  // --- Summary KPIs ---
  const bestOption = comparison.bestRelief;
  const topTornado = tornado.available ? tornado.bars[0] : null;
  const shadowPrice = baseline.economics.marginalShadowValuePerDay;

  return h(
    'div',
    { class: 'page' },
    pageHeader({
      eyebrow: 'Counterfactual decision lab · Non-persisted sandbox',
      title: 'What-if scenarios & sensitivity',
      subtitle:
        'Test scope deferrals, Critical-Chain owner moves, case mitigations, org-change pacing, and Brooks’s-Law-adjusted hires on Common Random Numbers — zero live data changes until you commit.',
      actions: [
        h('a', { class: 'btn btn-ghost', href: '#/capacity' }, 'Capacity & flow'),
        h(
          'button',
          { class: 'btn btn-ghost', type: 'button', onClick: exportSensitivityCsv },
          'Export sensitivity CSV',
        ),
        sandboxLeverCount > 0
          ? h(
              'button',
              { class: 'btn btn-ghost', type: 'button', onClick: resetSandbox },
              `Reset sandbox (${sandboxLeverCount})`,
            )
          : null,
      ],
    }),

    h(
      'div',
      { class: 'callout callout-info scenario-isolation-banner', role: 'status' },
      h('strong', null, 'Sandbox isolation active: '),
      sandboxLeverCount === 0
        ? 'No counterfactual levers active yet. Toggle levers below or load a suggested preset — live storage and the audit trail remain untouched until you record or commit a decision.'
        : `${sandboxLeverCount} counterfactual lever(s) active in memory. Overload risk shifts ${fmtPct(baseline.monteCarlo.overloadProbability)} → ${fmtPct(customEval.monteCarlo.overloadProbability)} (${fmtSigned(Math.round(customEval.deltas.overloadProbability * 100), 'pp')}); P80 shifts ${baseline.monteCarlo.effectiveP80Date || `${baseline.monteCarlo.effectiveP80Days}d`} → ${customEval.monteCarlo.effectiveP80Date || `${customEval.monteCarlo.effectiveP80Days}d`} (${fmtSigned(customEval.deltas.effectiveP80Days, 'd')}).`,
    ),

    h(
      'div',
      { class: 'stats-grid' },
      stat({
        label: 'Live baseline overload odds',
        value: fmtPct(baseline.monteCarlo.overloadProbability),
        hint: `P80 finish ${baseline.monteCarlo.effectiveP80Date || `${baseline.monteCarlo.effectiveP80Days}d`} · ${baseline.paretoOptimal === null ? 'Pareto comparison unavailable: case rating missing' : baseline.paretoOptimal ? 'On Pareto frontier' : 'Pareto-dominated'}`,
        tone: baseline.monteCarlo.overloadProbability >= 0.5 ? 'bad' : baseline.monteCarlo.overloadProbability >= 0.25 ? 'warn' : 'good',
      }),
      stat({
        label: 'Custom sandbox overload odds',
        value: fmtPct(customEval.monteCarlo.overloadProbability),
        hint: sandboxLeverCount > 0
          ? `${fmtSigned(Math.round(customEval.deltas.overloadProbability * 100), 'pp')} vs baseline · P80 ${customEval.monteCarlo.effectiveP80Date || `${customEval.monteCarlo.effectiveP80Days}d`}`
          : 'Configure levers below to test relief',
        tone: customEval.monteCarlo.overloadProbability < baseline.monteCarlo.overloadProbability ? 'good' : '',
      }),
      stat({
        label: 'Best Pareto-optimal relief',
        value: bestOption ? fmtPct(bestOption.monteCarlo.overloadProbability) : 'Baseline',
        hint: bestOption
          ? `${bestOption.name.slice(0, 42)} (${fmtSigned(bestOption.deltas.effectiveP80Days, 'd')} P80)`
          : 'No single preset strictly beats baseline',
        tone: bestOption ? 'good' : '',
      }),
      stat({
        label: '#1 Tornado schedule lever',
        value: topTornado ? `${topTornado.p80SwingDays}d swing` : '—',
        hint: topTornado
          ? `${topTornado.label.slice(0, 40)}${shadowPrice !== null ? ` · Shadow ${fmtMoney(baseline.economics.currency, shadowPrice)}/d` : ''}`
          : 'Add PERT effort ranges to rank levers',
      }),
    ),

    // 1. Multi-Scenario Pareto Comparison Matrix
    card({
      title: 'Common-Random-Numbers scenario & Pareto frontier matrix',
      subtitle: `Paired across identical Monte Carlo trials (seed ${comparison.seed}, ${comparison.trials} trials) so every delta reflects causal levers rather than sampling noise (Law & Kelton, 2000; Pareto, 1906).`,
      body: h(
        'div',
        { class: 'stack-md' },
        h(
          'div',
          { class: 'table-wrap' },
          h(
            'table',
            { class: 'table', 'aria-label': 'Counterfactual scenario comparison and Pareto frontier matrix' },
            h(
              'thead',
              null,
              h(
                'tr',
                null,
                h('th', { scope: 'col' }, 'Scenario'),
                h('th', { scope: 'col' }, 'Pareto status'),
                h('th', { scope: 'col' }, 'Committed / Slack'),
                h('th', { scope: 'col' }, 'Overload odds (Δ)'),
                baseline.continuityCoupling?.available ? h('th', { scope: 'col' }, 'All-weather fit (Δ)') : null,
                h('th', { scope: 'col' }, 'Owner-constrained P80 (Δ)'),
                h('th', { scope: 'col' }, 'Risk-adj. net value (Δ)'),
                h('th', { scope: 'col' }, 'Governance & sandbox actions'),
              ),
            ),
            h(
              'tbody',
              null,
              ...comparison.scenarios.map((row) => {
                const isCustom = row.id === 'custom-sandbox';
                if (isCustom && sandboxLeverCount === 0) return null;
                const peerList = comparison.scenarios.filter((s) => !s.isBaseline && s.id !== row.id && !(s.id === 'custom-sandbox' && sandboxLeverCount === 0));
                const matchingPreset = presets.find((p) => p.id === row.id);
                return h(
                  'tr',
                  { class: isCustom ? 'scenario-row-active' : '' },
                  h(
                    'th',
                    { scope: 'row' },
                    h('div', { class: 'stack-xs' },
                      h('span', { class: 'strong' }, row.name),
                      row.description ? h('span', { class: 'muted small' }, row.description) : null,
                      row.brooksLawTrap
                        ? badge('Brooks’s Law: mentoring drag > ramp supply', 'caution')
                        : null,
                    ),
                  ),
                  h(
                    'td',
                    null,
                    row.paretoOptimal === null
                      ? badge('Not comparable — case rating needed', 'caution')
                      : row.paretoOptimal
                        ? badge('Pareto-optimal', 'good', 'No evaluated option strictly improves reliability, P80 speed, and net value simultaneously.')
                        : h(
                          'div',
                          { class: 'stack-xs' },
                          badge('Dominated', 'caution'),
                          h('span', { class: 'muted small' }, `Beaten by ${row.dominatedBy[0]?.name} (${row.dominatedBy[0]?.reasons.join(', ')})`),
                        ),
                  ),
                  h(
                    'td',
                    null,
                    `${row.capacity.committedDays}d / ${fmtSigned(row.capacity.slackDays, 'd')} slack`,
                  ),
                  h(
                    'td',
                    null,
                    row.isBaseline
                      ? fmtPct(row.monteCarlo.overloadProbability)
                      : `${fmtPct(row.monteCarlo.overloadProbability)} (${fmtSigned(Math.round(row.deltas.overloadProbability * 100), 'pp')})`,
                  ),
                  baseline.continuityCoupling?.available
                    ? h(
                        'td',
                        null,
                        !row.continuityCoupling?.available
                          ? '—'
                          : row.isBaseline
                            ? fmtPct(row.continuityCoupling.allWeatherFitProbability)
                            : `${fmtPct(row.continuityCoupling.allWeatherFitProbability)} (${fmtSigned(Math.round((row.continuityCoupling.allWeatherFitProbability - baseline.continuityCoupling.allWeatherFitProbability) * 100), 'pp')})`,
                      )
                    : null,
                  h(
                    'td',
                    null,
                    row.isBaseline
                      ? (row.monteCarlo.effectiveP80Date || `${row.monteCarlo.effectiveP80Days}d`)
                      : `${row.monteCarlo.effectiveP80Date || `${row.monteCarlo.effectiveP80Days}d`} (${fmtSigned(row.deltas.effectiveP80Days, 'd')})`,
                  ),
                  h(
                    'td',
                    null,
                    !row.economics.measured
                      ? (row.economics.unratedCaseCount ? 'Unknown — case occurrence not rated' : '—')
                      : row.isBaseline
                        ? fmtMoney(row.economics.currency, row.economics.netRiskAdjustedValue)
                        : `${fmtMoney(row.economics.currency, row.economics.netRiskAdjustedValue)} (${row.deltas.netRiskAdjustedValue === null ? 'baseline unavailable' : fmtSigned(row.deltas.netRiskAdjustedValue, '')})`,
                  ),
                  h(
                    'td',
                    null,
                    row.isBaseline
                      ? h('span', { class: 'muted small' }, 'Reference baseline')
                      : h(
                          'div',
                          { class: 'row-gap wrap' },
                          matchingPreset
                            ? h(
                                'button',
                                {
                                  class: 'btn btn-xs btn-ghost',
                                  type: 'button',
                                  onClick: () => loadPresetIntoSandbox(matchingPreset),
                                },
                                'Edit in sandbox',
                              )
                            : null,
                          h(
                            'button',
                            {
                              class: 'btn btn-xs btn-ghost',
                              type: 'button',
                              onClick: () => openCommitScenarioDialog(ctx, row, peerList, { commitLevers: false }),
                            },
                            'Log DACI only',
                          ),
                          h(
                            'button',
                            {
                              class: 'btn btn-xs btn-primary',
                              type: 'button',
                              onClick: () => openCommitScenarioDialog(ctx, row, peerList, { commitLevers: true }),
                            },
                            'Commit levers',
                          ),
                        ),
                  ),
                );
              }),
            ),
          ),
        ),
        presetEvals.length === 0 && sandboxLeverCount === 0
          ? h('p', { class: 'muted small' }, 'Use the interactive sandbox controls below to configure a counterfactual option and compare it against Live Baseline.')
          : null,
      ),
    }),

    // 2. Interactive What-If Sandbox Builder
    card({
      title: 'Interactive what-if sandbox builder',
      subtitle: 'Argyris & Schön (1978) double-loop parameters + cross-module scope, risk, org-change, and Brooks’s-Law hiring levers.',
      actions: sandboxLeverCount > 0
        ? [
            h(
              'button',
              {
                class: 'btn btn-ghost',
                type: 'button',
                onClick: () =>
                  openCommitScenarioDialog(
                    ctx,
                    customEval,
                    presetEvals,
                    { commitLevers: false },
                  ),
              },
              'Record sandbox DACI only',
            ),
            h(
              'button',
              {
                class: 'btn btn-primary',
                type: 'button',
                onClick: () =>
                  openCommitScenarioDialog(
                    ctx,
                    customEval,
                    presetEvals,
                    { commitLevers: true },
                  ),
              },
              `Commit ${sandboxLeverCount} sandbox lever(s)`,
            ),
          ]
        : [],
      body: h(
        'div',
        { class: 'stack-lg' },

        // 2a. Scenario Name + Double-loop Operating Physics
        h(
          'div',
          { class: 'scenario-controls-grid' },
          h(
            'div',
            { class: 'field' },
            h('label', { for: 'scn-custom-name' }, 'Sandbox scenario name'),
            h('input', {
              id: 'scn-custom-name',
              type: 'text',
              value: sandboxSpec.name,
              onChange: (e) => {
                sandboxSpec.name = e.target.value.trim() || 'Custom what-if sandbox';
                ctx.refresh();
              },
            }),
          ),
          h(
            'div',
            { class: 'field' },
            h('label', { for: 'scn-op-reserve' }, 'Operational interrupt reserve (%)'),
            h('input', {
              id: 'scn-op-reserve',
              type: 'number',
              min: 0,
              max: 80,
              value: String(sandboxSpec.levers.settingsPatch.operationalLoadPct ?? state.settings.operationalLoadPct ?? 20),
              onChange: (e) => {
                const v = Math.min(80, Math.max(0, Math.round(Number(e.target.value) || 0)));
                if (v === (state.settings.operationalLoadPct ?? 20)) {
                  delete sandboxSpec.levers.settingsPatch.operationalLoadPct;
                } else {
                  sandboxSpec.levers.settingsPatch.operationalLoadPct = v;
                }
                ctx.refresh();
              },
            }),
          ),
          h(
            'div',
            { class: 'field' },
            h('label', { for: 'scn-focus-hours' }, 'Protected focus hours / person / week'),
            h('input', {
              id: 'scn-focus-hours',
              type: 'number',
              min: 8,
              max: 50,
              value: String(sandboxSpec.levers.settingsPatch.capacityHoursPerWeek ?? state.settings.capacityHoursPerWeek ?? 32),
              onChange: (e) => {
                const v = Math.min(50, Math.max(8, Math.round(Number(e.target.value) || 32)));
                if (v === (state.settings.capacityHoursPerWeek ?? 32)) {
                  delete sandboxSpec.levers.settingsPatch.capacityHoursPerWeek;
                } else {
                  sandboxSpec.levers.settingsPatch.capacityHoursPerWeek = v;
                }
                ctx.refresh();
              },
            }),
          ),
          h(
            'div',
            { class: 'field' },
            h('label', { for: 'scn-absence-shock' }, 'Unplanned absence / attrition shock (people)'),
            h('input', {
              id: 'scn-absence-shock',
              type: 'number',
              min: 0,
              max: Math.max(0, activePeople.length - 1),
              value: String(sandboxSpec.levers.absenceCount || 0),
              onChange: (e) => {
                sandboxSpec.levers.absenceCount = Math.max(0, Math.min(activePeople.length - 1, Math.round(Number(e.target.value) || 0)));
                ctx.refresh();
              },
            }),
          ),
        ),

        // 2b. Portfolio Scope & Critical-Chain Owner Levers
        h(
          'div',
          { class: 'stack-sm' },
          h('h3', { class: 'section-subhead' }, 'Portfolio commitments & owner assignment levers'),
          openProjects.length === 0
            ? h('p', { class: 'muted small' }, 'No open planned commitments in the portfolio yet.')
            : h(
                'div',
                { class: 'table-wrap' },
                h(
                  'table',
                  { class: 'table', 'aria-label': 'Sandbox portfolio scope and owner levers' },
                  h(
                    'thead',
                    null,
                    h(
                      'tr',
                      null,
                      h('th', { scope: 'col' }, 'Commitment'),
                      h('th', { scope: 'col' }, 'PERT effort'),
                      h('th', { scope: 'col' }, 'Counterfactual decision'),
                      h('th', { scope: 'col' }, 'Counterfactual owner'),
                    ),
                  ),
                  h(
                    'tbody',
                    null,
                    ...openProjects.map((item) => {
                      const ov = sandboxSpec.levers.portfolioDecisions.find((x) => x.itemId === item.id);
                      const eff = pertTriple(item.effortDays);
                      const curDec = ov?.decision || item.decision;
                      const curOwner = ov && ov.ownerId !== undefined ? (ov.ownerId || '') : (item.ownerId || '');
                      return h(
                        'tr',
                        null,
                        h('th', { scope: 'row' }, item.title),
                        h('td', null, eff.measured ? `${eff.expected}d (${eff.optimistic}/${eff.mostLikely}/${eff.pessimistic}d)` : 'Unestimated'),
                        h(
                          'td',
                          null,
                          h(
                            'select',
                            {
                              'aria-label': `Counterfactual decision for ${item.title}`,
                              value: curDec,
                              onChange: (e) => setPortfolioDecisionLever(item.id, e.target.value, item.decision),
                            },
                            h('option', { value: 'funded' }, 'Funded'),
                            h('option', { value: 'deferred' }, 'Deferred'),
                            h('option', { value: 'cut' }, 'Cut'),
                            h('option', { value: 'undecided' }, 'Undecided / wanted'),
                          ),
                        ),
                        h(
                          'td',
                          null,
                          h(
                            'select',
                            {
                              'aria-label': `Counterfactual owner for ${item.title}`,
                              value: curOwner,
                              onChange: (e) => setPortfolioOwnerLever(item.id, e.target.value, item.ownerId),
                            },
                            h('option', { value: '' }, 'Shared team pool'),
                            ...activePeople.map((p) => h('option', { value: p.id }, p.name)),
                          ),
                        ),
                      );
                    }),
                  ),
                ),
              ),
        ),

        // 2c. Hypothetical Uncommitted Demand ("What if we say yes?")
        h(
          'div',
          { class: 'stack-sm' },
          h('h3', { class: 'section-subhead' }, 'Hypothetical uncommitted work (“What if we say yes?”)'),
          sandboxSpec.levers.hypotheticalItems.length > 0
            ? h(
                'ul',
                { class: 'plain-list stack-xs' },
                ...sandboxSpec.levers.hypotheticalItems.map((hyp, idx) =>
                  h(
                    'li',
                    { class: 'row-between card-subtle' },
                    h(
                      'span',
                      null,
                      `${hyp.title} — PERT ${hyp.effortDays.optimistic}/${hyp.effortDays.mostLikely}/${hyp.effortDays.pessimistic}d`,
                      hyp.ownerId
                        ? ` · Owner: ${activePeople.find((p) => p.id === hyp.ownerId)?.name || 'Pool'}`
                        : ' · Shared pool',
                    ),
                    h(
                      'button',
                      {
                        class: 'btn btn-xs btn-ghost',
                        type: 'button',
                        'aria-label': `Remove hypothetical item ${hyp.title}`,
                        onClick: () => {
                          sandboxSpec.levers.hypotheticalItems.splice(idx, 1);
                          ctx.refresh();
                        },
                      },
                      'Remove',
                    ),
                  ),
                ),
              )
            : null,
          h(
            'form',
            {
              class: 'scenario-hyp-form',
              onSubmit: (e) => {
                e.preventDefault();
                const formEl = e.currentTarget;
                const readField = (fieldName) => formEl.elements?.namedItem?.(fieldName)?.value ?? '';
                const title = String(readField('hypTitle')).trim();
                if (!title) {
                  toast('Enter a title for the hypothetical request.', 'bad');
                  return;
                }
                const opt = Math.max(0, Number(readField('hypOpt')) || 2);
                const ml = Math.max(opt, Number(readField('hypMl')) || 5);
                const pess = Math.max(ml, Number(readField('hypPess')) || 10);
                const ownerId = String(readField('hypOwner')).trim() || null;
                sandboxSpec.levers.hypotheticalItems.push({
                  id: `hyp-${Date.now()}-${sandboxSpec.levers.hypotheticalItems.length + 1}`,
                  title,
                  ownerId,
                  effortDays: { optimistic: opt, mostLikely: ml, pessimistic: pess },
                });
                ctx.refresh();
              },
            },
            h(
              'div',
              { class: 'scenario-controls-grid' },
              h(
                'div',
                { class: 'field' },
                h('label', { for: 'scn-hyp-title' }, 'Hypothetical request title'),
                h('input', { id: 'scn-hyp-title', name: 'hypTitle', type: 'text', placeholder: 'e.g., Urgent enterprise SSO ask' }),
              ),
              h(
                'div',
                { class: 'field' },
                h('label', { for: 'scn-hyp-opt' }, 'Optimistic (days)'),
                h('input', { id: 'scn-hyp-opt', name: 'hypOpt', type: 'number', min: 0, step: '0.5', value: '3' }),
              ),
              h(
                'div',
                { class: 'field' },
                h('label', { for: 'scn-hyp-ml' }, 'Most likely (days)'),
                h('input', { id: 'scn-hyp-ml', name: 'hypMl', type: 'number', min: 0.5, step: '0.5', value: '6' }),
              ),
              h(
                'div',
                { class: 'field' },
                h('label', { for: 'scn-hyp-pess' }, 'Pessimistic (days)'),
                h('input', { id: 'scn-hyp-pess', name: 'hypPess', type: 'number', min: 0.5, step: '0.5', value: '12' }),
              ),
              h(
                'div',
                { class: 'field' },
                h('label', { for: 'scn-hyp-owner' }, 'Assign owner'),
                h(
                  'select',
                  { id: 'scn-hyp-owner', name: 'hypOwner' },
                  h('option', { value: '' }, 'Shared team pool'),
                  ...activePeople.map((p) => h('option', { value: p.id }, p.name)),
                ),
              ),
            ),
            h('button', { class: 'btn btn-ghost btn-sm', type: 'submit' }, '+ Inject hypothetical request'),
          ),
        ),

        // 2d. Operational Cases, Org Changes & Brooks's Law Hiring Levers
        h(
          'div',
          { class: 'grid-2' },
          h(
            'div',
            { class: 'stack-sm' },
            h('h3', { class: 'section-subhead' }, 'Operational cases & org-change levers'),
            openCases.length === 0 && openChanges.length === 0 && hardenableDeps.length === 0
              ? h('p', { class: 'muted small' }, 'No open operational cases, organizational changes, or shock-modeled dependencies.')
              : h(
                  'div',
                  { class: 'stack-xs' },
                  ...openCases.map((c) => {
                    const checked = sandboxSpec.levers.caseMitigations.includes(c.id);
                    const chkId = `scn-case-${c.id}`;
                    return h(
                      'label',
                      { class: 'check-row', for: chkId },
                      h('input', {
                        id: chkId,
                        type: 'checkbox',
                        checked,
                        onChange: (e) => toggleCaseMitigation(c.id, e.target.checked),
                      }),
                      h('span', null, `Mitigate case “${c.title}” (releases RULE-CAP-01 incident reserve)`),
                    );
                  }),
                  ...hardenableDeps.map((dep) => {
                    const checked = (sandboxSpec.levers.dependencyHardening || []).some(
                      (x) => (typeof x === 'string' ? x : x?.dependencyId) === dep.id,
                    );
                    const nextMode = dep.substitutability === 'warm-standby' ? 'dual-active' : 'warm-standby';
                    const chkId = `scn-dep-${dep.id}`;
                    return h(
                      'label',
                      { class: 'check-row', for: chkId },
                      h('input', {
                        id: chkId,
                        type: 'checkbox',
                        checked,
                        onChange: (e) => toggleDependencyHardening(dep.id, e.target.checked),
                      }),
                      h('span', null, `Harden dependency “${dep.name}” (${dep.substitutability || 'none'} → ${nextMode})`),
                    );
                  }),
                  ...openChanges.map((chg) => {
                    const actionsForChg = sandboxSpec.levers.changeActions.filter((x) => x.changeId === chg.id);
                    const hasAlign = actionsForChg.some((x) => x.action === 'align-coalition');
                    const curVal = hasAlign ? 'align-and-mitigate' : (actionsForChg[0]?.action || '');
                    const selId = `scn-chg-${chg.id}`;
                    return h(
                      'div',
                      { class: 'field' },
                      h('label', { for: selId }, `Org change: “${chg.title}” (${chg.status})`),
                      h(
                        'select',
                        {
                          id: selId,
                          value: curVal,
                          onChange: (e) => setChangeActionLever(chg.id, e.target.value),
                        },
                        h('option', { value: '' }, 'Keep current status & forces'),
                        h('option', { value: 'align-and-mitigate' }, 'Align veto coalition & mitigate Lewin barriers'),
                        chg.status !== 'paused' ? h('option', { value: 'pause' }, 'Pause change (free transition reserve)') : null,
                        chg.status !== 'active' ? h('option', { value: 'activate' }, 'Activate change (commit transition reserve)') : null,
                      ),
                    );
                  }),
                ),
          ),
          h(
            'div',
            { class: 'stack-sm' },
            h('h3', { class: 'section-subhead' }, 'Hiring & Brooks’s Law onboarding drag'),
            openReqs.length === 0
              ? h('p', { class: 'muted small' }, 'No open requisitions on record.')
              : h(
                  'div',
                  { class: 'stack-sm' },
                  ...openReqs.map((req) => {
                    const existing = sandboxSpec.levers.hiringActions.find((x) => x.reqId === req.id);
                    const enabled = Boolean(existing);
                    const startVal = existing?.hireStartOn || addDays(dayKey(now), 7);
                    const dragVal = existing?.mentoringDragDays ?? DEFAULT_MENTORING_DRAG_DAYS;
                    const diag = customEval.brooksDiagnostics.find((b) => b.reqId === req.id);
                    const chkId = `scn-req-${req.id}`;
                    const dateId = `scn-req-date-${req.id}`;
                    const dragId = `scn-req-drag-${req.id}`;
                    return h(
                      'div',
                      { class: 'card-subtle stack-xs' },
                      h(
                        'label',
                        { class: 'check-row', for: chkId },
                        h('input', {
                          id: chkId,
                          type: 'checkbox',
                          checked: enabled,
                          onChange: (e) => setHiringLever(req.id, e.target.checked, startVal, dragVal),
                        }),
                        h('span', { class: 'strong' }, `Simulate filling “${req.title}”`),
                      ),
                      enabled
                        ? h(
                            'div',
                            { class: 'scenario-controls-grid' },
                            h(
                              'div',
                              { class: 'field' },
                              h('label', { for: dateId }, 'Counterfactual start date'),
                              h('input', {
                                id: dateId,
                                type: 'date',
                                value: startVal,
                                onChange: (e) => setHiringLever(req.id, true, e.target.value, dragVal),
                              }),
                            ),
                            h(
                              'div',
                              { class: 'field' },
                              h('label', { for: dragId }, 'Mentoring drag on tenured team (days)'),
                              h('input', {
                                id: dragId,
                                type: 'number',
                                min: 0,
                                max: 20,
                                step: '0.5',
                                value: String(dragVal),
                                onChange: (e) => setHiringLever(req.id, true, startVal, Number(e.target.value)),
                              }),
                            ),
                          )
                        : null,
                      diag
                        ? h(
                            'p',
                            { class: `small ${diag.brooksLawTrap ? 'text-bad' : 'muted'}` },
                            `Watkins 45% ramp supply: +${diag.allocatableAddedDays}d · Interview reserve freed: +${diag.interviewDaysFreed}d · Mentoring drag: −${diag.mentoringDragDays}d ⇒ Net horizon effect: ${fmtSigned(diag.netCapacityDeltaDays, 'd')}${diag.brooksLawTrap ? ' (Brooks’s Law: adding this hire late reduces net capacity inside the current horizon).' : '.'}`,
                          )
                        : null,
                    );
                  }),
                ),
          ),
        ),
      ),
    }),

    // 3. One-at-a-Time (OAT) Tornado Sensitivity Analysis
    card({
      title: 'One-at-a-Time (OAT) Tornado sensitivity ranking',
      subtitle: 'Ronald Howard (1988) decision analysis: ranks every uncertain commitment, reserve, and operating assumption by its total swing on owner-constrained P80 completion and horizon overload probability.',
      body: tornadoChart(tornado, { title: 'Workspace P80 completion sensitivity' }),
    }),
  );
}
