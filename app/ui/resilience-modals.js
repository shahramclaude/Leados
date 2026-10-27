/**
 * app/ui/resilience-modals.js — Accessible dialogs for the Operational
 * Resilience, Dependency & Continuity Terminal (`#/resilience`).
 *
 * Every input carries an explicit label, missing numeric fields stay blank
 * (`null` on save, never fabricated zeros), and a live preview computes
 * Simchi-Levi survival shortfall and verified Bus Factor before saving.
 */

import { h, openModal, toast } from './dom.js';
import { dayKey } from '../core/time.js';
import {
  DEPENDENCY_CRITICALITIES,
  DEPENDENCY_CRITICALITY_LABELS,
  DEPENDENCY_KINDS,
  DEPENDENCY_KIND_LABELS,
  DEPENDENCY_STATUSES,
  DEPENDENCY_STATUS_LABELS,
  DRILL_KINDS,
  DRILL_KIND_LABELS,
  DRILL_OUTCOMES,
  DRILL_OUTCOME_LABELS,
  STEWARD_ROLES,
  STEWARD_ROLE_LABELS,
  SUBSTITUTABILITY_HELP,
  SUBSTITUTABILITY_LABELS,
  SUBSTITUTABILITY_MODES,
} from '../core/domain/resilience.js';

function field({ id, label, hint = null, control, wide = false }) {
  return h(
    'div',
    { class: `field${wide ? ' field-wide' : ''}` },
    h('label', { class: 'field-label', for: id }, label),
    control,
    hint ? h('p', { class: 'field-hint' }, hint) : null,
  );
}

function numVal(input) {
  const raw = String(input.value ?? '').trim();
  if (raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : Number.NaN;
}

function resolveNow(ctx) {
  if (!ctx) return new Date();
  if (ctx.now instanceof Date) return ctx.now;
  if (typeof ctx.now === 'function') return ctx.now();
  return new Date(ctx.now || Date.now());
}

export function openDependencyModal(ctx, existing = null, { onSaved = null } = {}) {
  const state = ctx.state;
  const todayStr = dayKey(resolveNow(ctx));
  const isEdit = Boolean(existing);
  const activePeople = (state.people || []).filter((p) => p.status !== 'archived');
  const otherDeps = (state.dependencies || []).filter((d) => !existing || d.id !== existing.id);
  const activeGoals = (state.goals || []).filter((g) => g.status === 'active' || (existing?.linkedGoalIds || []).includes(g.id));

  const nameInput = h('input', {
    id: 'res-dep-name',
    type: 'text',
    maxlength: '180',
    placeholder: 'e.g. Customer Billing & Invoice Settlement, Aurora Cloud Queue',
    value: existing?.name || '',
  });

  const kindSelect = h(
    'select',
    { id: 'res-dep-kind' },
    ...DEPENDENCY_KINDS.map((k) => h('option', { value: k }, DEPENDENCY_KIND_LABELS[k])),
  );
  kindSelect.value = existing?.kind || 'service';

  const critSelect = h(
    'select',
    { id: 'res-dep-crit' },
    ...DEPENDENCY_CRITICALITIES.map((c) => h('option', { value: c }, DEPENDENCY_CRITICALITY_LABELS[c])),
  );
  critSelect.value = existing?.criticality || 'critical';

  const statusSelect = h(
    'select',
    { id: 'res-dep-status' },
    ...DEPENDENCY_STATUSES.map((s) => h('option', { value: s }, DEPENDENCY_STATUS_LABELS[s])),
  );
  statusSelect.value = existing?.status || 'active';

  const summaryInput = h('textarea', {
    id: 'res-dep-summary',
    rows: 2,
    placeholder: 'What customer outcome, SLA or internal workflow stops if this node fails?',
    value: existing?.summary || '',
  });
  summaryInput.value = existing?.summary || '';

  const ttsInput = h('input', {
    id: 'res-dep-tts',
    type: 'number',
    min: '0',
    step: '0.25',
    placeholder: 'Leave blank if unmeasured',
    value: existing?.ttsDays === null || existing?.ttsDays === undefined ? '' : String(existing.ttsDays),
  });

  const ttrInput = h('input', {
    id: 'res-dep-ttr',
    type: 'number',
    min: '0',
    step: '0.25',
    placeholder: 'Leave blank if unmeasured',
    value: existing?.ttrDays === null || existing?.ttrDays === undefined ? '' : String(existing.ttrDays),
  });

  const subSelect = h(
    'select',
    { id: 'res-dep-sub', 'aria-describedby': 'res-dep-sub-help' },
    ...SUBSTITUTABILITY_MODES.map((m) => h('option', { value: m }, SUBSTITUTABILITY_LABELS[m])),
  );
  subSelect.value = existing?.substitutability || 'none';
  const subHelp = h('p', { class: 'field-hint', id: 'res-dep-sub-help' }, SUBSTITUTABILITY_HELP[subSelect.value] || '');

  const warmSwitchInput = h('input', {
    id: 'res-dep-warm',
    type: 'number',
    min: '0',
    step: '0.25',
    placeholder: 'e.g. 0.5 or 1',
    value: existing?.warmSwitchDays === null || existing?.warmSwitchDays === undefined ? '' : String(existing.warmSwitchDays),
  });

  const exitPlanInput = h('textarea', {
    id: 'res-dep-exit',
    rows: 2,
    placeholder: 'Documented fallback, cache buffer, manual runbook or supplier exit strategy (EU DORA Art. 28/29)',
  });
  exitPlanInput.value = existing?.exitPlanSummary || '';

  const currencyInput = h('input', {
    id: 'res-dep-currency',
    type: 'text',
    maxlength: '6',
    value: existing?.currency || 'USD',
  });

  const dailyOverrideInput = h('input', {
    id: 'res-dep-daily',
    type: 'number',
    min: '0',
    step: 'any',
    placeholder: 'Optional — derived from linked records if blank',
    value: existing?.dailyImpactOverride === null || existing?.dailyImpactOverride === undefined ? '' : String(existing.dailyImpactOverride),
  });

  const annualSpendInput = h('input', {
    id: 'res-dep-spend',
    type: 'number',
    min: '0',
    step: 'any',
    placeholder: 'Optional vendor spend/yr',
    value: existing?.annualSpend === null || existing?.annualSpend === undefined ? '' : String(existing.annualSpend),
  });

  const probInput = h('input', {
    id: 'res-dep-prob',
    type: 'number',
    min: '0',
    max: '100',
    step: '1',
    placeholder: 'Optional 0–100%',
    value: existing?.annualFailureProb === null || existing?.annualFailureProb === undefined ? '' : String(existing.annualFailureProb),
  });

  const mitCostInput = h('input', {
    id: 'res-dep-mitcost',
    type: 'number',
    min: '0',
    step: 'any',
    placeholder: 'Optional standby/buffer cost',
    value: existing?.mitigationCost === null || existing?.mitigationCost === undefined ? '' : String(existing.mitigationCost),
  });

  const reviewOnInput = h('input', {
    id: 'res-dep-review',
    type: 'date',
    value: existing?.reviewOn || '',
  });

  // Stewards dynamic editor
  const stewardRowsState = (existing?.stewards || []).map((s) => ({
    personId: s.personId,
    role: s.role || 'primary',
    verifiedOn: s.verifiedOn || '',
    notes: s.notes || '',
  }));
  const stewardsContainer = h('div', { class: 'stack-sm' });

  const renderStewardRows = () => {
    stewardsContainer.replaceChildren();
    if (!stewardRowsState.length) {
      stewardsContainer.appendChild(
        h('p', { class: 'muted small' }, 'No stewards assigned yet (Bus Factor = 0). Assign at least a primary and a shadow-verified backup steward on critical capabilities.'),
      );
    }
    stewardRowsState.forEach((row, idx) => {
      const pSel = h(
        'select',
        { 'aria-label': `Steward ${idx + 1} person` },
        h('option', { value: '' }, 'Select team member…'),
        ...activePeople.map((p) => h('option', { value: p.id }, `${p.name}${p.role ? ` (${p.role})` : ''}`)),
      );
      pSel.value = row.personId || '';
      pSel.addEventListener('change', () => {
        row.personId = pSel.value;
        updatePreview();
      });

      const rSel = h(
        'select',
        { 'aria-label': `Steward ${idx + 1} role` },
        ...STEWARD_ROLES.map((r) => h('option', { value: r }, STEWARD_ROLE_LABELS[r])),
      );
      rSel.value = row.role;
      rSel.addEventListener('change', () => {
        row.role = rSel.value;
        if (row.role === 'primary' && !row.verifiedOn) {
          row.verifiedOn = todayStr;
          vInput.value = todayStr;
        }
        updatePreview();
      });

      const vInput = h('input', {
        type: 'date',
        'aria-label': `Steward ${idx + 1} verified date`,
        value: row.verifiedOn || '',
      });
      vInput.addEventListener('input', () => {
        row.verifiedOn = vInput.value;
        updatePreview();
      });

      const removeBtn = h(
        'button',
        {
          class: 'btn btn-ghost btn-sm',
          type: 'button',
          onClick: () => {
            stewardRowsState.splice(idx, 1);
            renderStewardRows();
            updatePreview();
          },
        },
        'Remove',
      );

      stewardsContainer.appendChild(
        h('div', { class: 'resilience-steward-row' }, pSel, rSel, vInput, removeBtn),
      );
    });
  };

  const addStewardBtn = h(
    'button',
    {
      class: 'btn btn-secondary btn-sm',
      type: 'button',
      disabled: activePeople.length === 0,
      onClick: () => {
        const unused = activePeople.find((p) => !stewardRowsState.some((r) => r.personId === p.id)) || activePeople[0];
        const isFirst = stewardRowsState.length === 0;
        stewardRowsState.push({
          personId: unused?.id || '',
          role: isFirst ? 'primary' : 'backup',
          verifiedOn: isFirst ? todayStr : '',
          notes: '',
        });
        renderStewardRows();
        updatePreview();
      },
    },
    '+ Add steward',
  );

  // Upstream dependency checkboxes
  const selectedUpstreams = new Set(existing?.upstreamIds || []);
  const upstreamBox = otherDeps.length
    ? h(
        'div',
        { class: 'resilience-check-grid', role: 'group', 'aria-label': 'Upstream dependencies' },
        ...otherDeps.map((dep) => {
          const cid = `res-up-${dep.id}`;
          const cb = h('input', {
            id: cid,
            type: 'checkbox',
            checked: selectedUpstreams.has(dep.id),
            onChange: () => {
              if (cb.checked) selectedUpstreams.add(dep.id);
              else selectedUpstreams.delete(dep.id);
            },
          });
          return h(
            'label',
            { class: 'resilience-check-item', for: cid },
            cb,
            h('span', null, `${dep.name} (${dep.criticality} ${dep.kind})`),
          );
        }),
      )
    : h('p', { class: 'muted small' }, 'Register upstream vendors or platforms to model multi-tier cascades.');

  // Linked Goals checkboxes
  const selectedGoals = new Set(existing?.linkedGoalIds || []);
  const goalsBox = activeGoals.length
    ? h(
        'div',
        { class: 'resilience-check-grid', role: 'group', 'aria-label': 'Underpinned goals' },
        ...activeGoals.map((g) => {
          const cid = `res-goal-${g.id}`;
          const cb = h('input', {
            id: cid,
            type: 'checkbox',
            checked: selectedGoals.has(g.id),
            onChange: () => {
              if (cb.checked) selectedGoals.add(g.id);
              else selectedGoals.delete(g.id);
            },
          });
          return h('label', { class: 'resilience-check-item', for: cid }, cb, h('span', null, g.title));
        }),
      )
    : h('p', { class: 'muted small' }, 'No active goals in workspace.');

  const makeOptionalSelect = (id, items, getLabel, current) => {
    const sel = h(
      'select',
      { id },
      h('option', { value: '' }, '— None linked —'),
      ...items.map((item) => h('option', { value: item.id }, getLabel(item))),
    );
    sel.value = current || '';
    return sel;
  };

  const budgetSelect = makeOptionalSelect('res-dep-budget', state.budgets || [], (b) => `${b.name} (${b.currency})`, existing?.linkedBudgetId);
  const negSelect = makeOptionalSelect('res-dep-neg', state.negotiations || [], (n) => `${n.title} (${n.status})`, existing?.linkedNegotiationId);
  const stkSelect = makeOptionalSelect('res-dep-stk', state.stakeholders || [], (s) => `${s.name} (${s.stance})`, existing?.linkedStakeholderId);
  const portSelect = makeOptionalSelect('res-dep-port', state.portfolio || [], (p) => p.title, existing?.linkedPortfolioId);

  const previewEl = h('div', { class: 'resilience-live-preview', role: 'status', 'aria-live': 'polite' });
  const errorEl = h('p', { class: 'field-error', role: 'alert' });

  const updatePreview = () => {
    subHelp.textContent = SUBSTITUTABILITY_HELP[subSelect.value] || '';
    const tts = numVal(ttsInput);
    const ttr = numVal(ttrInput);
    const warm = numVal(warmSwitchInput);
    const mode = subSelect.value;
    const effTtr = !Number.isFinite(ttr) || ttr === null
      ? null
      : mode === 'dual-active'
        ? 0
        : mode === 'warm-standby'
          ? Math.min(ttr, Number.isFinite(warm) && warm !== null ? warm : 1)
          : ttr;
    const shortfall = effTtr !== null && Number.isFinite(tts) && tts !== null
      ? Math.max(0, Math.round((effTtr - tts) * 100) / 100)
      : null;

    const qualCount = stewardRowsState.filter(
      (r) => r.personId && (r.role === 'primary' || (r.role === 'backup' && Boolean(r.verifiedOn))),
    ).length;
    const unverifiedCount = stewardRowsState.filter(
      (r) => r.personId && ((r.role === 'backup' && !r.verifiedOn) || r.role === 'trainee'),
    ).length;

    const parts = [
      `Verified Bus Factor: ${qualCount}${unverifiedCount ? ` (+${unverifiedCount} unverified/trainee)` : ''}`,
      shortfall === null
        ? 'Continuity gap: unmeasured (record TTS & TTR to compute survival shortfall)'
        : shortfall > 0
          ? `Survival shortfall: ${shortfall}d (effective TTR ${effTtr}d > TTS ${tts}d)`
          : `Within tolerance (effective TTR ${effTtr}d ≤ TTS ${tts}d)`,
    ];
    previewEl.textContent = parts.join(' · ');
  };

  for (const el of [ttsInput, ttrInput, warmSwitchInput, subSelect]) {
    el.addEventListener('input', updatePreview);
    el.addEventListener('change', updatePreview);
  }

  renderStewardRows();
  updatePreview();

  const body = h(
    'div',
    { class: 'stack-md' },
    previewEl,
    h(
      'div',
      { class: 'form-grid' },
      field({ id: 'res-dep-name', label: 'Capability, vendor, system or process name', control: nameInput, wide: true }),
      field({ id: 'res-dep-kind', label: 'Node kind', control: kindSelect }),
      field({ id: 'res-dep-crit', label: 'Continuity criticality', control: critSelect }),
      field({ id: 'res-dep-status', label: 'Status', control: statusSelect }),
      field({ id: 'res-dep-review', label: 'Next continuity review', control: reviewOnInput }),
      field({ id: 'res-dep-summary', label: 'Operational scope & failure effect', control: summaryInput, wide: true }),
    ),
    h('h3', { class: 'section-subhead' }, 'Simchi-Levi Continuity Tolerances & Substitutability'),
    h(
      'div',
      { class: 'form-grid' },
      field({
        id: 'res-dep-tts',
        label: 'Time-to-Survive — TTS (days)',
        hint: 'Max outage absorbed by caches/queues/fallbacks before SLA or goal damage starts.',
        control: ttsInput,
      }),
      field({
        id: 'res-dep-ttr',
        label: 'Time-to-Recover — TTR (days)',
        hint: 'Full restoration or replacement qualification duration if primary fails.',
        control: ttrInput,
      }),
      field({ id: 'res-dep-sub', label: 'Substitutability / failover mode', control: subSelect }),
      field({
        id: 'res-dep-warm',
        label: 'Warm-standby switchover (days)',
        hint: 'Used when substitutability is Qualified warm standby.',
        control: warmSwitchInput,
      }),
      field({ id: 'res-dep-exit', label: 'Exit / fallback strategy (DORA Art. 28/29)', control: exitPlanInput, wide: true }),
    ),
    h('h3', { class: 'section-subhead' }, 'Human Stewardship & Bus Factor'),
    h(
      'p',
      { class: 'muted small' },
      'Backups count toward Bus Factor only once a verification date is recorded — adding a name on paper never hides a single point of failure.',
    ),
    stewardsContainer,
    h('div', null, addStewardBtn),
    h('h3', { class: 'section-subhead' }, 'Upstream Dependencies (Multi-Tier Topology)'),
    upstreamBox,
    h('h3', { class: 'section-subhead' }, 'Financial Exposure & Redundancy Economics (Optional)'),
    h(
      'div',
      { class: 'form-grid' },
      field({ id: 'res-dep-currency', label: 'Currency (ISO)', control: currencyInput }),
      field({
        id: 'res-dep-daily',
        label: 'Daily shortfall impact override',
        hint: 'Leave blank to derive from linked cases, portfolio CoD, negotiations or budgets.',
        control: dailyOverrideInput,
      }),
      field({ id: 'res-dep-spend', label: 'Annual vendor spend', control: annualSpendInput }),
      field({ id: 'res-dep-prob', label: 'Annual disruption probability (%)', control: probInput }),
      field({ id: 'res-dep-mitcost', label: 'Redundancy / mitigation cost', control: mitCostInput }),
    ),
    h('h3', { class: 'section-subhead' }, 'Cross-Module Operational Links'),
    goalsBox,
    h(
      'div',
      { class: 'form-grid' },
      field({ id: 'res-dep-budget', label: 'Linked budget envelope', control: budgetSelect }),
      field({ id: 'res-dep-neg', label: 'Linked supplier negotiation', control: negSelect }),
      field({ id: 'res-dep-stk', label: 'Linked external stakeholder', control: stkSelect }),
      field({ id: 'res-dep-port', label: 'Linked portfolio initiative', control: portSelect }),
    ),
    errorEl,
  );

  const dialog = openModal({
    title: isEdit ? `Edit ${existing.name}` : 'Register operational dependency or capability',
    description: 'Critical Bus-Factor-1 capabilities and unbuffered survival shortfalls (TTR > TTS) automatically propagate blameless cross-training delegations and DACI continuity decisions on save.',
    body,
    size: 'lg',
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h(
        'button',
        {
          class: 'btn btn-primary',
          type: 'button',
          onClick: () => {
            const payload = {
              name: nameInput.value,
              kind: kindSelect.value,
              criticality: critSelect.value,
              status: statusSelect.value,
              summary: summaryInput.value,
              ttsDays: ttsInput.value.trim() === '' ? null : Number(ttsInput.value),
              ttrDays: ttrInput.value.trim() === '' ? null : Number(ttrInput.value),
              substitutability: subSelect.value,
              warmSwitchDays: warmSwitchInput.value.trim() === '' ? null : Number(warmSwitchInput.value),
              exitPlanSummary: exitPlanInput.value,
              currency: currencyInput.value,
              dailyImpactOverride: dailyOverrideInput.value.trim() === '' ? null : Number(dailyOverrideInput.value),
              annualSpend: annualSpendInput.value.trim() === '' ? null : Number(annualSpendInput.value),
              annualFailureProb: probInput.value.trim() === '' ? null : Number(probInput.value),
              mitigationCost: mitCostInput.value.trim() === '' ? null : Number(mitigationCost.value),
              reviewOn: reviewOnInput.value || null,
              upstreamIds: [...selectedUpstreams],
              stewards: stewardRowsState.filter((r) => r.personId),
              linkedGoalIds: [...selectedGoals],
              linkedBudgetId: budgetSelect.value || null,
              linkedNegotiationId: negSelect.value || null,
              linkedStakeholderId: stkSelect.value || null,
              linkedPortfolioId: portSelect.value || null,
            };
            const result = isEdit
              ? ctx.api.updateDependency(existing.id, payload)
              : ctx.api.addDependency(payload);
            if (!result.ok) {
              errorEl.textContent = result.error || 'Could not save dependency.';
              return;
            }
            dialog.close();
            const propCount = (result.propagations || []).length;
            toast(
              propCount
                ? `Saved · ${propCount} cross-module propagation${propCount === 1 ? '' : 's'} applied`
                : isEdit ? 'Dependency updated' : 'Dependency registered',
              'good',
            );
            if (typeof onSaved === 'function') onSaved(result);
            else ctx.refresh();
          },
        },
        isEdit ? 'Save changes' : 'Register dependency',
      ),
    ],
  });
  return dialog;
}

export function openContinuityDrillModal(ctx, dependency, { onSaved = null } = {}) {
  if (!dependency) return null;
  const todayStr = dayKey(resolveNow(ctx));

  const dateInput = h('input', { id: 'res-drill-date', type: 'date', value: todayStr });
  const kindSelect = h(
    'select',
    { id: 'res-drill-kind' },
    ...DRILL_KINDS.map((k) => h('option', { value: k }, DRILL_KIND_LABELS[k])),
  );
  kindSelect.value = 'failover-drill';

  const estInput = h('input', {
    id: 'res-drill-est',
    type: 'number',
    min: '0',
    step: '0.25',
    placeholder: 'Prior estimated TTR (days)',
    value: dependency.ttrDays === null || dependency.ttrDays === undefined ? '' : String(dependency.ttrDays),
  });

  const realInput = h('input', {
    id: 'res-drill-real',
    type: 'number',
    min: '0',
    step: '0.25',
    placeholder: 'Measured recovery duration (days)',
    value: '',
  });

  const outcomeSelect = h(
    'select',
    { id: 'res-drill-outcome' },
    ...DRILL_OUTCOMES.map((o) => h('option', { value: o }, DRILL_OUTCOME_LABELS[o])),
  );

  realInput.addEventListener('input', () => {
    const r = Number(realInput.value);
    if (realInput.value.trim() !== '' && Number.isFinite(r) && dependency.ttsDays !== null && dependency.ttsDays !== undefined) {
      outcomeSelect.value = r > dependency.ttsDays ? 'breached-tolerance' : 'within-tolerance';
    }
  });

  const scenarioInput = h('textarea', {
    id: 'res-drill-scenario',
    rows: 2,
    placeholder: 'What disruption, key-person absence or failover path was tested?',
  });

  const gapInput = h('textarea', {
    id: 'res-drill-gap',
    rows: 2,
    placeholder: 'What slowed recovery or breached survival tolerance? (Used to prefill remediation Case if tolerance was breached.)',
  });

  const errorEl = h('p', { class: 'field-error', role: 'alert' });

  const dialog = openModal({
    title: `Log continuity drill or incident — ${dependency.name}`,
    description: `Recorded survival tolerance (TTS): ${dependency.ttsDays ?? 'unmeasured'}d · Estimated TTR: ${dependency.ttrDays ?? 'unmeasured'}d. If tolerance is breached on a critical/important capability, RULE-RES-05 flags linked goals at-risk and opens a linked Operational Case.`,
    body: h(
      'div',
      { class: 'stack-md' },
      h(
        'div',
        { class: 'form-grid' },
        field({ id: 'res-drill-date', label: 'Drill / incident date', control: dateInput }),
        field({ id: 'res-drill-kind', label: 'Evidence type', control: kindSelect }),
        field({ id: 'res-drill-est', label: 'Estimated TTR before test (days)', control: estInput }),
        field({ id: 'res-drill-real', label: 'Realized recovery time (days)', control: realInput }),
        field({ id: 'res-drill-outcome', label: 'Continuity outcome', control: outcomeSelect, wide: true }),
        field({ id: 'res-drill-scenario', label: 'Scenario tested', control: scenarioInput, wide: true }),
        field({ id: 'res-drill-gap', label: 'Observed friction / systemic gap', control: gapInput, wide: true }),
      ),
      errorEl,
    ),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h(
        'button',
        {
          class: 'btn btn-primary',
          type: 'button',
          onClick: () => {
            const res = ctx.api.recordContinuityDrill(dependency.id, {
              date: dateInput.value,
              kind: kindSelect.value,
              estimatedTtrDays: estInput.value.trim() === '' ? null : Number(estInput.value),
              realizedTtrDays: realInput.value.trim() === '' ? null : Number(realInput.value),
              outcome: outcomeSelect.value,
              scenario: scenarioInput.value,
              gapNote: gapInput.value,
            });
            if (!res.ok) {
              errorEl.textContent = res.error || 'Could not record drill.';
              return;
            }
            dialog.close();
            const propCount = (res.propagations || []).length;
            toast(
              propCount
                ? `Drill logged · ${propCount} remediation propagation${propCount === 1 ? '' : 's'} triggered`
                : 'Continuity drill logged',
              'good',
            );
            if (typeof onSaved === 'function') onSaved(res);
            else ctx.refresh();
          },
        },
        'Record drill',
      ),
    ],
  });
  return dialog;
}

export function openVerifyStewardModal(ctx, dependency, defaultPersonId = null) {
  if (!dependency) return null;
  const activePeople = (ctx.state.people || []).filter((p) => p.status !== 'archived');
  const todayStr = dayKey(resolveNow(ctx));

  const personSelect = h(
    'select',
    { id: 'res-ver-person' },
    ...activePeople.map((p) => h('option', { value: p.id }, `${p.name}${p.role ? ` (${p.role})` : ''}`)),
  );
  if (defaultPersonId && activePeople.some((p) => p.id === defaultPersonId)) {
    personSelect.value = defaultPersonId;
  } else {
    const candidate = (dependency.stewards || []).find((s) => !s.verifiedOn);
    if (candidate && activePeople.some((p) => p.id === candidate.personId)) {
      personSelect.value = candidate.personId;
    }
  }

  const dateInput = h('input', { id: 'res-ver-date', type: 'date', value: todayStr });
  const notesInput = h('textarea', {
    id: 'res-ver-notes',
    rows: 2,
    placeholder: 'How was independent handover or failover verified? (e.g. ran staging recovery solo)',
  });
  const errorEl = h('p', { class: 'field-error', role: 'alert' });

  const dialog = openModal({
    title: `Verify independent steward — ${dependency.name}`,
    description: 'Explicit human verification raises Bus Factor and clears SPOF talking points when a second active steward is confirmed.',
    body: h(
      'div',
      { class: 'stack-md' },
      field({ id: 'res-ver-person', label: 'Team member verified', control: personSelect }),
      field({ id: 'res-ver-date', label: 'Verified on', control: dateInput }),
      field({ id: 'res-ver-notes', label: 'Verification evidence', control: notesInput, wide: true }),
      errorEl,
    ),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h(
        'button',
        {
          class: 'btn btn-primary',
          type: 'button',
          onClick: () => {
            const res = ctx.api.verifyDependencySteward(dependency.id, personSelect.value, {
              verifiedOn: dateInput.value,
              notes: notesInput.value,
            });
            if (!res.ok) {
              errorEl.textContent = res.error || 'Could not verify steward.';
              return;
            }
            dialog.close();
            toast('Steward verified — Bus Factor updated', 'good');
            ctx.refresh();
          },
        },
        'Confirm verification',
      ),
    ],
  });
  return dialog;
}

export function openRetireDependencyModal(ctx, dependency) {
  if (!dependency) return null;
  const reasonInput = h('textarea', {
    id: 'res-retire-reason',
    rows: 2,
    placeholder: 'Why is this service, vendor or runbook retired from active operations?',
  });
  const errorEl = h('p', { class: 'field-error', role: 'alert' });
  const dialog = openModal({
    title: `Retire ${dependency.name}`,
    description: 'Retired nodes leave active SPOF and shortfall counts while preserving historical drills and audit trails.',
    body: h(
      'div',
      { class: 'stack-md' },
      field({ id: 'res-retire-reason', label: 'Retirement note', control: reasonInput, wide: true }),
      errorEl,
    ),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h(
        'button',
        {
          class: 'btn btn-danger',
          type: 'button',
          onClick: () => {
            const res = ctx.api.retireDependency(dependency.id, reasonInput.value);
            if (!res.ok) {
              errorEl.textContent = res.error || 'Could not retire dependency.';
              return;
            }
            dialog.close();
            toast('Dependency retired (history preserved)', 'good');
            ctx.refresh();
          },
        },
        'Retire node',
      ),
    ],
  });
  return dialog;
}
