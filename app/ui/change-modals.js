/**
 * app/ui/change-modals.js — Organizational Design, Team Topologies & Change dialogs.
 *
 * Interactive, WCAG-accessible capture and update dialogs with live readouts for:
 *  - Lewin Force-Field equilibrium & high-tension stalemate warning
 *  - Team Topologies & Sweller Cognitive Load + Brooks coordination channels
 *  - Beta-PERT transition effort & J-Curve economics
 *  - Cross-Module Parallel + Vertical Propagation Preview (`RULE-CHG-01`..`05`)
 */

import { h, openModal, buildForm, toast, uid } from './dom.js';
import { badge } from './components.js';
import { addDays, dayKey } from '../core/time.js';
import { personOptions, goalOptions } from './options.js';
import {
  STAKEHOLDER_STANCES,
  STAKEHOLDER_STANCE_LABELS,
} from '../core/domain/cases.js';
import {
  CHANGE_IMPACT_KINDS,
  CHANGE_IMPACT_LABELS,
  CHANGE_KINDS,
  CHANGE_KIND_LABELS,
  CHANGE_STATUSES,
  CHANGE_STATUS_LABELS,
  FORCE_CATEGORIES,
  FORCE_CATEGORY_LABELS,
  KOTTER_STEPS,
  KOTTER_STEP_META,
  TEAM_TOPOLOGY_TYPES,
  TEAM_TOPOLOGY_LABELS,
  TOPOLOGY_INTERACTION_MODES,
  TOPOLOGY_INTERACTION_LABELS,
  evaluateChangeEconomics,
  evaluateForceField,
  evaluateTopologyAndLoad,
} from '../core/domain/changes.js';
import { previewChangePropagations } from '../core/domain/automation.js';

function modalFooter(formNode, onSubmit, { submitLabel = 'Save', cancelLabel = 'Cancel', onClose } = {}) {
  const cancelBtn = h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => onClose() }, cancelLabel);
  const submitBtn = h('button', { class: 'btn btn-primary', type: 'button', onClick: () => onSubmit() }, submitLabel);
  formNode.addEventListener('submit', (e) => {
    e.preventDefault();
    onSubmit();
  });
  return [cancelBtn, submitBtn];
}

function labeledField(idStr, labelText, control, { wide = false, help = '' } = {}) {
  return h(
    'div',
    { class: `field${wide ? ' field-wide' : ''}` },
    h('label', { class: 'field-label', for: idStr }, labelText),
    control,
    help ? h('p', { class: 'field-help' }, help) : null,
  );
}

function buildForcesEditor(initialForces = [], onChange) {
  const rows = [];
  const listNode = h('div', { class: 'stack-sm', 'data-change-forces': 'true' });

  function readForces() {
    return rows
      .filter((r) => !r.removed)
      .map((r) => ({
        id: r.id,
        side: r.sideSelect.value === 'restraining' ? 'restraining' : 'driving',
        label: r.labelInput.value.trim(),
        weight: Number(r.weightSelect.value) || 3,
        category: r.catSelect.value || 'governance',
        mitigation: r.mitInput.value.trim(),
        mitigated: r.mitigatedCheck.checked,
      }))
      .filter((f) => f.label);
  }

  function addRow(seed = {}) {
    const rUid = uid('chgf');
    const state = { id: seed.id || '', removed: false };

    const sideSelect = h(
      'select',
      { id: `${rUid}-side` },
      h('option', { value: 'driving' }, 'Driving (+)'),
      h('option', { value: 'restraining' }, 'Restraining (−)'),
    );
    sideSelect.value = seed.side === 'restraining' ? 'restraining' : 'driving';

    const labelInput = h('input', {
      id: `${rUid}-label`,
      type: 'text',
      placeholder: 'e.g. Eliminate 5-way deploy sign-off / Manual Finance gate',
      value: seed.label || '',
    });

    const weightSelect = h(
      'select',
      { id: `${rUid}-weight` },
      ...[1, 2, 3, 4, 5].map((n) => h('option', { value: String(n) }, `${n} / 5`)),
    );
    weightSelect.value = String(seed.weight || 3);

    const catSelect = h(
      'select',
      { id: `${rUid}-cat` },
      ...FORCE_CATEGORIES.map((c) => h('option', { value: c }, FORCE_CATEGORY_LABELS[c])),
    );
    catSelect.value = FORCE_CATEGORIES.includes(seed.category) ? seed.category : 'governance';

    const mitInput = h('input', {
      id: `${rUid}-mit`,
      type: 'text',
      placeholder: 'How to weaken/remove this barrier (for restraining forces)',
      value: seed.mitigation || '',
    });

    const mitigatedCheck = h('input', {
      id: `${rUid}-mitigated`,
      type: 'checkbox',
      checked: Boolean(seed.mitigated),
    });

    const rowNode = h(
      'div',
      { class: 'subcard stack-sm' },
      h(
        'div',
        { class: 'form-grid' },
        labeledField(`${rUid}-side`, 'Force side', sideSelect),
        labeledField(`${rUid}-weight`, 'Strength (1–5)', weightSelect),
        labeledField(`${rUid}-cat`, 'Category', catSelect),
        labeledField(`${rUid}-label`, 'Force description', labelInput, { wide: true }),
        labeledField(`${rUid}-mit`, 'Mitigation / guardrail', mitInput, { wide: true }),
      ),
      h(
        'div',
        { class: 'row-between' },
        h(
          'label',
          { class: 'check-inline small', for: `${rUid}-mitigated` },
          mitigatedCheck,
          h('span', null, 'Barrier mitigated (halves effective restraining drag)'),
        ),
        h(
          'button',
          {
            class: 'btn btn-ghost btn-sm',
            type: 'button',
            onClick: () => {
              state.removed = true;
              rowNode.remove();
              onChange();
            },
          },
          'Remove force',
        ),
      ),
    );

    for (const el of [sideSelect, labelInput, weightSelect, catSelect, mitInput, mitigatedCheck]) {
      el.addEventListener('input', onChange);
      el.addEventListener('change', onChange);
    }

    rows.push({ ...state, sideSelect, labelInput, weightSelect, catSelect, mitInput, mitigatedCheck, get removed() { return state.removed; } });
    listNode.appendChild(rowNode);
  }

  for (const f of initialForces) addRow(f);

  const root = h(
    'div',
    { class: 'stack-sm' },
    listNode,
    h(
      'div',
      { class: 'row-wrap' },
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => { addRow({ side: 'driving', weight: 4 }); onChange(); } }, '+ Add driving force'),
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => { addRow({ side: 'restraining', weight: 4 }); onChange(); } }, '+ Add restraining barrier'),
    ),
  );

  return { node: root, readForces };
}

function buildCoalitionEditor(initialCoalition = [], statePeople = [], onChange) {
  const rows = [];
  const listNode = h('div', { class: 'stack-sm', 'data-change-coalition': 'true' });

  function readCoalition() {
    return rows
      .filter((r) => !r.removed)
      .map((r) => ({
        id: r.id,
        personId: r.personSelect.value || null,
        name: r.nameInput.value.trim(),
        role: r.roleInput.value.trim(),
        power: Number(r.powerSelect.value) || 3,
        interest: Number(r.interestSelect.value) || 3,
        stance: r.stanceSelect.value || 'neutral',
        vetoPlayer: r.vetoCheck.checked,
        keyMessage: r.msgInput.value.trim(),
        lastBriefedOn: r.lastBriefedOn,
        nextBriefOn: r.nextInput.value || null,
      }))
      .filter((s) => s.name || s.personId);
  }

  function addRow(seed = {}) {
    const rUid = uid('chgs');
    const st = { id: seed.id || '', lastBriefedOn: seed.lastBriefedOn || null, removed: false };
    const activePeople = (statePeople || []).filter((p) => p.status !== 'archived');

    const personSelect = h(
      'select',
      { id: `${rUid}-person` },
      h('option', { value: '' }, 'External / cross-org stakeholder'),
      ...activePeople.map((p) => h('option', { value: p.id }, `${p.name}${p.role ? ` (${p.role})` : ''}`)),
    );
    personSelect.value = seed.personId || '';

    const nameInput = h('input', {
      id: `${rUid}-name`,
      type: 'text',
      placeholder: 'Name (e.g. VP Engineering / Finance Controller)',
      value: seed.name || '',
    });
    const roleInput = h('input', {
      id: `${rUid}-role`,
      type: 'text',
      placeholder: 'Role / boundary authority',
      value: seed.role || '',
    });

    personSelect.addEventListener('change', () => {
      const p = activePeople.find((x) => x.id === personSelect.value);
      if (p) {
        if (!nameInput.value.trim()) nameInput.value = p.name;
        if (!roleInput.value.trim() && p.role) roleInput.value = p.role;
      }
      onChange();
    });

    const powerSelect = h(
      'select',
      { id: `${rUid}-power` },
      ...[1, 2, 3, 4, 5].map((n) => h('option', { value: String(n) }, `${n} / 5`)),
    );
    powerSelect.value = String(seed.power || 4);

    const interestSelect = h(
      'select',
      { id: `${rUid}-interest` },
      ...[1, 2, 3, 4, 5].map((n) => h('option', { value: String(n) }, `${n} / 5`)),
    );
    interestSelect.value = String(seed.interest || 4);

    const stanceSelect = h(
      'select',
      { id: `${rUid}-stance` },
      ...STAKEHOLDER_STANCES.map((s) => h('option', { value: s }, STAKEHOLDER_STANCE_LABELS[s])),
    );
    stanceSelect.value = STAKEHOLDER_STANCES.includes(seed.stance) ? seed.stance : 'neutral';

    const nextInput = h('input', {
      id: `${rUid}-next`,
      type: 'date',
      value: seed.nextBriefOn || '',
    });

    const msgInput = h('input', {
      id: `${rUid}-msg`,
      type: 'text',
      placeholder: 'Core commitment / WIIFM message',
      value: seed.keyMessage || '',
    });

    const vetoCheck = h('input', {
      id: `${rUid}-veto`,
      type: 'checkbox',
      checked: Boolean(seed.vetoPlayer),
    });

    const rowNode = h(
      'div',
      { class: 'subcard stack-sm' },
      h(
        'div',
        { class: 'form-grid' },
        labeledField(`${rUid}-person`, 'Roster link (optional)', personSelect),
        labeledField(`${rUid}-name`, 'Stakeholder name', nameInput),
        labeledField(`${rUid}-role`, 'Role / title', roleInput),
        labeledField(`${rUid}-power`, 'Power (1–5)', powerSelect),
        labeledField(`${rUid}-interest`, 'Interest (1–5)', interestSelect),
        labeledField(`${rUid}-stance`, 'Current stance', stanceSelect),
        labeledField(`${rUid}-next`, 'Next briefing date', nextInput),
        labeledField(`${rUid}-msg`, 'Key alignment message', msgInput, { wide: true }),
      ),
      h(
        'div',
        { class: 'row-between' },
        h(
          'label',
          { class: 'check-inline small', for: `${rUid}-veto` },
          vetoCheck,
          h('span', null, 'Veto player / gatekeeper (agreement required to anchor change)'),
        ),
        h(
          'button',
          {
            class: 'btn btn-ghost btn-sm',
            type: 'button',
            onClick: () => {
              st.removed = true;
              rowNode.remove();
              onChange();
            },
          },
          'Remove stakeholder',
        ),
      ),
    );

    for (const el of [nameInput, roleInput, powerSelect, interestSelect, stanceSelect, nextInput, msgInput, vetoCheck]) {
      el.addEventListener('input', onChange);
      el.addEventListener('change', onChange);
    }

    rows.push({
      id: st.id,
      lastBriefedOn: st.lastBriefedOn,
      personSelect,
      nameInput,
      roleInput,
      powerSelect,
      interestSelect,
      stanceSelect,
      nextInput,
      msgInput,
      vetoCheck,
      get removed() { return st.removed; },
    });
    listNode.appendChild(rowNode);
  }

  for (const c of initialCoalition) addRow(c);

  const root = h(
    'div',
    { class: 'stack-sm' },
    listNode,
    h(
      'button',
      { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => { addRow({ power: 4, interest: 4 }); onChange(); } },
      '+ Add coalition / veto stakeholder',
    ),
  );

  return { node: root, readCoalition };
}

function buildImpactsEditor(initialImpacts = [], statePeople = [], onChange) {
  const rows = [];
  const listNode = h('div', { class: 'stack-sm', 'data-change-impacts': 'true' });
  const activePeople = (statePeople || []).filter((p) => p.status !== 'archived');

  function readImpacts() {
    return rows
      .filter((r) => !r.removed && r.personSelect.value)
      .map((r) => ({
        id: r.id,
        personId: r.personSelect.value,
        impactKind: r.kindSelect.value || 'scope-shift',
        newRoleLabel: r.labelInput.value.trim(),
        createTransitionPlan: r.planCheck.checked,
      }));
  }

  function addRow(seed = {}) {
    const rUid = uid('chgi');
    const st = { id: seed.id || '', removed: false };

    const personSelect = h(
      'select',
      { id: `${rUid}-person` },
      h('option', { value: '' }, 'Choose team member…'),
      ...activePeople.map((p) => h('option', { value: p.id }, `${p.name}${p.role ? ` — ${p.role}` : ''}`)),
    );
    personSelect.value = seed.personId || '';

    const kindSelect = h(
      'select',
      { id: `${rUid}-kind` },
      ...CHANGE_IMPACT_KINDS.map((k) => h('option', { value: k }, CHANGE_IMPACT_LABELS[k])),
    );
    kindSelect.value = CHANGE_IMPACT_KINDS.includes(seed.impactKind) ? seed.impactKind : 'scope-shift';

    const labelInput = h('input', {
      id: `${rUid}-label`,
      type: 'text',
      placeholder: 'e.g. Billing Pod Tech Lead',
      value: seed.newRoleLabel || '',
    });

    const planCheck = h('input', {
      id: `${rUid}-plan`,
      type: 'checkbox',
      checked: Boolean(seed.createTransitionPlan),
    });

    const rowNode = h(
      'div',
      { class: 'subcard stack-sm' },
      h(
        'div',
        { class: 'form-grid' },
        labeledField(`${rUid}-person`, 'Team member', personSelect),
        labeledField(`${rUid}-kind`, 'Boundary impact', kindSelect),
        labeledField(`${rUid}-label`, 'New role / charter label', labelInput),
      ),
      h(
        'div',
        { class: 'row-between' },
        h(
          'label',
          { class: 'check-inline small', for: `${rUid}-plan` },
          planCheck,
          h('span', null, 'Auto-create 30-60-90 role-transition plan when change is Active (RULE-CHG-03)'),
        ),
        h(
          'button',
          {
            class: 'btn btn-ghost btn-sm',
            type: 'button',
            onClick: () => {
              st.removed = true;
              rowNode.remove();
              onChange();
            },
          },
          'Remove impact',
        ),
      ),
    );

    for (const el of [personSelect, kindSelect, labelInput, planCheck]) {
      el.addEventListener('input', onChange);
      el.addEventListener('change', onChange);
    }

    rows.push({ id: st.id, personSelect, kindSelect, labelInput, planCheck, get removed() { return st.removed; } });
    listNode.appendChild(rowNode);
  }

  for (const imp of initialImpacts) addRow(imp);

  const root = h(
    'div',
    { class: 'stack-sm' },
    listNode,
    activePeople.length
      ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => { addRow({}); onChange(); } }, '+ Add impacted team member')
      : h('p', { class: 'muted small' }, 'Add team members in Roster first to link role transitions.'),
  );

  return { node: root, readImpacts };
}

export function openChangeDialog(ctx, existing = null) {
  const todayStr = dayKey(ctx.now);
  const fUid = uid('chgform');
  const defaultReview = addDays(todayStr, ctx.state.settings.changeReviewDays ?? 21);

  const titleInput = h('input', { id: `${fUid}-title`, type: 'text', required: true, value: existing?.title || '', placeholder: 'e.g. Extract Billing & Ledger into a stream-aligned pod' });
  const kindSelect = h('select', { id: `${fUid}-kind` }, ...CHANGE_KINDS.map((k) => h('option', { value: k }, CHANGE_KIND_LABELS[k])));
  kindSelect.value = existing?.kind || 'topology';

  const statusSelect = h('select', { id: `${fUid}-status` }, ...CHANGE_STATUSES.map((s) => h('option', { value: s }, CHANGE_STATUS_LABELS[s])));
  statusSelect.value = existing?.status || 'proposed';

  const revSelect = h(
    'select',
    { id: `${fUid}-rev` },
    h('option', { value: 'irreversible' }, 'Irreversible / Type-1 (requires DACI charter)'),
    h('option', { value: 'reversible' }, 'Reversible / Type-2 experiment'),
  );
  revSelect.value = existing?.reversibility || 'irreversible';

  const ownerOpts = personOptions(ctx.state, { includeNone: 'Leader / unassigned' });
  const ownerSelect = h('select', { id: `${fUid}-owner` }, ...ownerOpts.map((o) => h('option', { value: o.value }, o.label)));
  ownerSelect.value = existing?.ownerId || '';

  const goalOpts = goalOptions(ctx.state, { includeNone: 'No linked goal' });
  const goalSelect = h('select', { id: `${fUid}-goal` }, ...goalOpts.map((o) => h('option', { value: o.value }, o.label)));
  goalSelect.value = existing?.linkedGoalId || '';

  const openedInput = h('input', { id: `${fUid}-opened`, type: 'date', value: existing?.openedOn || todayStr });
  const targetInput = h('input', { id: `${fUid}-target`, type: 'date', value: existing?.targetOn || '' });
  const reviewInput = h('input', { id: `${fUid}-review`, type: 'date', value: existing?.reviewOn || defaultReview });

  const summaryArea = h('textarea', { id: `${fUid}-summary`, rows: 2, placeholder: 'Why the current boundary or ritual is failing (problem statement)…' }, existing?.summary || '');
  const visionArea = h('textarea', { id: `${fUid}-vision`, rows: 2, placeholder: 'Clear 1-paragraph picture of how the team operates once anchored…' }, existing?.vision || '');
  const nonGoalsArea = h('textarea', { id: `${fUid}-nongoals`, rows: 2, placeholder: 'Explicit Porter trade-offs: what this team will STOP doing or NOT take on…' }, existing?.nonGoals || '');

  // Kotter stage + completed steps
  const kotterSelect = h(
    'select',
    { id: `${fUid}-kotter` },
    ...KOTTER_STEPS.map((key) => h('option', { value: key }, KOTTER_STEP_META[key].label)),
  );
  kotterSelect.value = existing?.kotterStage || 'urgency';

  const stepChecks = KOTTER_STEPS.map((key) => {
    const chk = h('input', {
      id: `${fUid}-step-${key}`,
      type: 'checkbox',
      checked: Array.isArray(existing?.completedSteps) ? existing.completedSteps.includes(key) : key === 'urgency',
    });
    return { key, chk, label: KOTTER_STEP_META[key].label };
  });

  // Team Topologies & Cognitive load
  const topoTeamInput = h('input', { id: `${fUid}-topoteam`, type: 'text', value: existing?.topology?.teamName || ctx.state.settings.teamName || '' });
  const curTypeSelect = h('select', { id: `${fUid}-curtype` }, ...TEAM_TOPOLOGY_TYPES.map((t) => h('option', { value: t }, TEAM_TOPOLOGY_LABELS[t])));
  curTypeSelect.value = existing?.topology?.currentType || 'complicated-subsystem';
  const tgtTypeSelect = h('select', { id: `${fUid}-tgttype` }, ...TEAM_TOPOLOGY_TYPES.map((t) => h('option', { value: t }, TEAM_TOPOLOGY_LABELS[t])));
  tgtTypeSelect.value = existing?.topology?.targetType || 'stream-aligned';
  const modeSelect = h('select', { id: `${fUid}-mode` }, ...TOPOLOGY_INTERACTION_MODES.map((m) => h('option', { value: m }, TOPOLOGY_INTERACTION_LABELS[m])));
  modeSelect.value = existing?.topology?.interactionMode || 'x-as-a-service';

  const collabTeamsInput = h('input', { id: `${fUid}-collab`, type: 'number', min: 0, max: 20, value: existing?.topology?.collaboratingTeamsCount ?? 1 });
  const curDepInput = h('input', { id: `${fUid}-curdep`, type: 'number', min: 0, max: 50, value: existing?.topology?.blockingHandoffsBefore ?? '' });
  const tgtDepInput = h('input', { id: `${fUid}-tgtdep`, type: 'number', min: 0, max: 50, value: existing?.topology?.blockingHandoffsTarget ?? '' });

  const loadBeforeSelect = h(
    'select',
    { id: `${fUid}-load-before` },
    h('option', { value: '' }, 'Unmeasured'),
    ...[1, 2, 3, 4, 5].map((n) => h('option', { value: String(n) }, `${n} / 5`)),
  );
  loadBeforeSelect.value = existing?.topology?.cognitiveLoadBefore != null ? String(existing.topology.cognitiveLoadBefore) : '4';

  const loadTargetSelect = h(
    'select',
    { id: `${fUid}-load-target` },
    h('option', { value: '' }, 'Unmeasured'),
    ...[1, 2, 3, 4, 5].map((n) => h('option', { value: String(n) }, `${n} / 5`)),
  );
  loadTargetSelect.value = existing?.topology?.cognitiveLoadTarget != null ? String(existing.topology.cognitiveLoadTarget) : '2';

  // Galbraith Star
  const starStrategy = h('input', { id: `${fUid}-star-strat`, type: 'text', value: existing?.star?.strategy || '', placeholder: 'Winning mission & scope boundary' });
  const starStructure = h('input', { id: `${fUid}-star-struct`, type: 'text', value: existing?.star?.structure || '', placeholder: 'Pod shape, roles & reporting lines' });
  const starProcesses = h('input', { id: `${fUid}-star-proc`, type: 'text', value: existing?.star?.processes || '', placeholder: 'APIs, handoff contracts & rituals' });
  const starRewards = h('input', { id: `${fUid}-star-rew`, type: 'text', value: existing?.star?.rewards || '', placeholder: 'OKRs, metrics & recognition aligned to new boundary' });
  const starPeople = h('input', { id: `${fUid}-star-ppl`, type: 'text', value: existing?.star?.people || '', placeholder: 'Skills, pairing & 30-60-90 support' });

  // PERT Effort & Economics
  const effOpt = h('input', { id: `${fUid}-eff-o`, type: 'number', min: 0, step: '0.5', value: existing?.effortDays?.optimistic ?? 0 });
  const effMl = h('input', { id: `${fUid}-eff-m`, type: 'number', min: 0, step: '0.5', value: existing?.effortDays?.mostLikely ?? 0 });
  const effPess = h('input', { id: `${fUid}-eff-p`, type: 'number', min: 0, step: '0.5', value: existing?.effortDays?.pessimistic ?? 0 });

  const transCost = h('input', { id: `${fUid}-tcost`, type: 'number', min: 0, step: '100', value: existing?.economics?.transitionCost ?? 0 });
  const horizonMonths = h('input', { id: `${fUid}-horizon`, type: 'number', min: 1, max: 60, value: existing?.economics?.horizonMonths ?? 12 });
  const benOpt = h('input', { id: `${fUid}-ben-o`, type: 'number', min: 0, step: '100', value: existing?.economics?.monthlyBenefit?.optimistic ?? 0 });
  const benMl = h('input', { id: `${fUid}-ben-m`, type: 'number', min: 0, step: '100', value: existing?.economics?.monthlyBenefit?.mostLikely ?? 0 });
  const benPess = h('input', { id: `${fUid}-ben-p`, type: 'number', min: 0, step: '100', value: existing?.economics?.monthlyBenefit?.pessimistic ?? 0 });

  const autoDecCheck = h('input', {
    id: `${fUid}-autodec`,
    type: 'checkbox',
    checked: existing ? existing.autoCreateDecision !== false : true,
  });

  const liveReadout = h('div', { class: 'callout stack-sm', 'aria-live': 'polite' });
  const errorBanner = h('p', { class: 'field-error', hidden: true });

  let forcesEditor;
  let coalitionEditor;
  let impactsEditor;

  function collectDraftPayload() {
    return {
      title: titleInput.value.trim(),
      kind: kindSelect.value,
      status: statusSelect.value,
      reversibility: revSelect.value,
      ownerId: ownerSelect.value || null,
      linkedGoalId: goalSelect.value || null,
      openedOn: openedInput.value || todayStr,
      targetOn: targetInput.value || null,
      reviewOn: reviewInput.value || null,
      summary: summaryArea.value.trim(),
      vision: visionArea.value.trim(),
      nonGoals: nonGoalsArea.value.trim(),
      kotterStage: kotterSelect.value,
      completedSteps: stepChecks.filter((s) => s.chk.checked).map((s) => s.key),
      topology: {
        teamName: topoTeamInput.value.trim(),
        currentType: curTypeSelect.value,
        targetType: tgtTypeSelect.value,
        interactionMode: modeSelect.value,
        collaboratingTeamsCount: Number(collabTeamsInput.value) || 0,
        blockingHandoffsBefore: curDepInput.value === '' ? null : Number(curDepInput.value),
        blockingHandoffsTarget: tgtDepInput.value === '' ? null : Number(tgtDepInput.value),
        cognitiveLoadBefore: loadBeforeSelect.value === '' ? null : Number(loadBeforeSelect.value),
        cognitiveLoadTarget: loadTargetSelect.value === '' ? null : Number(loadTargetSelect.value),
      },
      star: {
        strategy: starStrategy.value.trim(),
        structure: starStructure.value.trim(),
        processes: starProcesses.value.trim(),
        rewards: starRewards.value.trim(),
        people: starPeople.value.trim(),
      },
      forces: forcesEditor ? forcesEditor.readForces() : [],
      coalition: coalitionEditor ? coalitionEditor.readCoalition() : [],
      impacts: impactsEditor ? impactsEditor.readImpacts() : [],
      effortDays: {
        optimistic: Number(effOpt.value) || 0,
        mostLikely: Number(effMl.value) || 0,
        pessimistic: Number(effPess.value) || 0,
      },
      economics: {
        currency: existing?.economics?.currency || 'USD',
        transitionCost: Number(transCost.value) || 0,
        horizonMonths: Number(horizonMonths.value) || 12,
        monthlyBenefit: {
          optimistic: Number(benOpt.value) || 0,
          mostLikely: Number(benMl.value) || 0,
          pessimistic: Number(benPess.value) || 0,
        },
      },
      autoCreateDecision: autoDecCheck.checked,
    };
  }

  function refreshLivePreview() {
    const draft = collectDraftPayload();
    const ff = evaluateForceField(draft);
    const topo = evaluateTopologyAndLoad(draft);
    const econ = evaluateChangeEconomics(draft);
    const previews = previewChangePropagations(draft, ctx.state, {
      now: ctx.now,
      existingChangeId: existing?.id || null,
    });

    liveReadout.replaceChildren(
      h(
        'div',
        { class: 'row-wrap' },
        badge(
          `Force-field: ${ff.equilibrium} (+${ff.drivingSum} vs −${ff.effectiveRestrainingSum})`,
          ff.equilibrium === 'favorable' ? 'good' : ff.equilibrium === 'blocked' ? 'bad' : 'caution',
        ),
        badge(
          topo.loadMeasured ? `Load: ${topo.cognitiveLoadBefore}/5 → ${topo.cognitiveLoadTarget}/5` : 'Cognitive load unrated',
          (topo.cognitiveLoadTarget ?? 0) >= 4 ? 'bad' : 'good',
        ),
        badge(`${topo.coordinationChannels} inter-team path(s)`, topo.antiPatterns.length > 0 ? 'caution' : 'neutral'),
        econ.effort.measured ? badge(`PERT effort: ${econ.effort.expected}d (P90 ${econ.effort.p90}d)`, 'accent') : null,
      ),
      previews.length
        ? h(
            'ul',
            { class: 'compact-list small' },
            ...previews.map((p) =>
              h('li', null, h('strong', null, `[${p.ruleId} → ${p.targetModule}] `), p.summary),
            ),
          )
        : h('p', { class: 'muted small' }, 'No cross-module propagations queued for the current settings.'),
    );
  }

  forcesEditor = buildForcesEditor(existing?.forces || [], refreshLivePreview);
  coalitionEditor = buildCoalitionEditor(existing?.coalition || [], ctx.state.people, refreshLivePreview);
  impactsEditor = buildImpactsEditor(existing?.impacts || [], ctx.state.people, refreshLivePreview);

  const allWatched = [
    titleInput, kindSelect, statusSelect, revSelect, ownerSelect, goalSelect,
    openedInput, targetInput, reviewInput, summaryArea, visionArea, nonGoalsArea,
    kotterSelect, ...stepChecks.map((s) => s.chk),
    topoTeamInput, curTypeSelect, tgtTypeSelect, modeSelect, collabTeamsInput, curDepInput, tgtDepInput,
    loadBeforeSelect, loadTargetSelect,
    starStrategy, starStructure, starProcesses, starRewards, starPeople,
    effOpt, effMl, effPess, transCost, horizonMonths, benOpt, benMl, benPess,
    autoDecCheck,
  ];
  for (const el of allWatched) {
    el.addEventListener('input', refreshLivePreview);
    el.addEventListener('change', refreshLivePreview);
  }
  refreshLivePreview();

  const formNode = h(
    'form',
    { class: 'form stack' },
    errorBanner,
    h(
      'div',
      { class: 'form-grid' },
      labeledField(`${fUid}-title`, 'Change title', titleInput, { wide: true }),
      labeledField(`${fUid}-kind`, 'Design kind', kindSelect),
      labeledField(`${fUid}-status`, 'Lifecycle status', statusSelect),
      labeledField(`${fUid}-rev`, 'Reversibility', revSelect),
      labeledField(`${fUid}-owner`, 'Change owner', ownerSelect),
      labeledField(`${fUid}-goal`, 'Strategic goal (OKR)', goalSelect),
      labeledField(`${fUid}-opened`, 'Opened on', openedInput),
      labeledField(`${fUid}-target`, 'Target anchor date', targetInput),
      labeledField(`${fUid}-review`, 'Next review date', reviewInput),
      labeledField(`${fUid}-summary`, 'Problem & boundary friction', summaryArea, { wide: true }),
      labeledField(`${fUid}-vision`, 'Target operating vision (Kotter Step 3)', visionArea, { wide: true }),
      labeledField(`${fUid}-nongoals`, 'Explicit non-goals & trade-offs (Porter)', nonGoalsArea, { wide: true }),
    ),

    h(
      'fieldset',
      { class: 'subcard stack-sm' },
      h('legend', { class: 'eyebrow' }, 'Kotter 8-Step Progression'),
      labeledField(`${fUid}-kotter`, 'Current focus step', kotterSelect),
      h(
        'div',
        { class: 'row-wrap' },
        ...stepChecks.map((s) =>
          h('label', { class: 'check-inline small', for: s.chk.id }, s.chk, h('span', null, s.label)),
        ),
      ),
    ),

    h(
      'fieldset',
      { class: 'subcard stack-sm' },
      h('legend', { class: 'eyebrow' }, 'Team Topologies & Sweller Cognitive Load'),
      h(
        'div',
        { class: 'form-grid' },
        labeledField(`${fUid}-topoteam`, 'Target team / pod name', topoTeamInput),
        labeledField(`${fUid}-collab`, 'Collaborating external teams', collabTeamsInput),
        labeledField(`${fUid}-curtype`, 'Current topology', curTypeSelect),
        labeledField(`${fUid}-tgttype`, 'Target topology', tgtTypeSelect),
        labeledField(`${fUid}-mode`, 'Primary interaction mode', modeSelect, { wide: true }),
        labeledField(`${fUid}-curdep`, 'Blocking handoffs before', curDepInput),
        labeledField(`${fUid}-tgtdep`, 'Blocking handoffs target', tgtDepInput),
        labeledField(`${fUid}-load-before`, 'Cognitive load before (1–5)', loadBeforeSelect),
        labeledField(`${fUid}-load-target`, 'Cognitive load target (1–5)', loadTargetSelect),
      ),
    ),

    h(
      'fieldset',
      { class: 'subcard stack-sm' },
      h('legend', { class: 'eyebrow' }, 'Galbraith 5-Point Star & Incentive Alignment'),
      h(
        'div',
        { class: 'form-grid' },
        labeledField(`${fUid}-star-strat`, '1. Strategy', starStrategy),
        labeledField(`${fUid}-star-struct`, '2. Structure', starStructure),
        labeledField(`${fUid}-star-proc`, '3. Processes & APIs', starProcesses),
        labeledField(`${fUid}-star-rew`, '4. Rewards & KPI alignment', starRewards),
        labeledField(`${fUid}-star-ppl`, '5. People & capabilities', starPeople, { wide: true }),
      ),
    ),

    h(
      'fieldset',
      { class: 'subcard stack-sm' },
      h('legend', { class: 'eyebrow' }, 'Lewin Force-Field Analysis (Driving vs Restraining)'),
      forcesEditor.node,
    ),

    h(
      'fieldset',
      { class: 'subcard stack-sm' },
      h('legend', { class: 'eyebrow' }, 'Guiding Coalition & Tsebelis Veto Players'),
      coalitionEditor.node,
    ),

    h(
      'fieldset',
      { class: 'subcard stack-sm' },
      h('legend', { class: 'eyebrow' }, 'Impacted Team Members & 30-60-90 Role Transitions'),
      impactsEditor.node,
    ),

    h(
      'fieldset',
      { class: 'subcard stack-sm' },
      h('legend', { class: 'eyebrow' }, 'PERT Transition Effort & J-Curve Economics'),
      h(
        'div',
        { class: 'form-grid' },
        labeledField(`${fUid}-eff-o`, 'Effort optimistic (person-days)', effOpt),
        labeledField(`${fUid}-eff-m`, 'Effort most likely (person-days)', effMl),
        labeledField(`${fUid}-eff-p`, 'Effort pessimistic (person-days)', effPess),
        labeledField(`${fUid}-tcost`, 'Transition cost ($)', transCost),
        labeledField(`${fUid}-horizon`, 'Payback horizon (months)', horizonMonths),
        labeledField(`${fUid}-ben-o`, 'Monthly benefit optimistic ($)', benOpt),
        labeledField(`${fUid}-ben-m`, 'Monthly benefit most likely ($)', benMl),
        labeledField(`${fUid}-ben-p`, 'Monthly benefit pessimistic ($)', benPess),
      ),
      h(
        'label',
        { class: 'check-inline small', for: `${fUid}-autodec` },
        autoDecCheck,
        h('span', null, 'Auto-open linked DACI charter decision for structural/irreversible changes (RULE-CHG-02)'),
      ),
    ),

    h(
      'div',
      { class: 'stack-sm' },
      h('p', { class: 'eyebrow' }, 'Cross-Module Automation Preview'),
      liveReadout,
    ),
  );

  let closeDialog = () => {};
  const handleSubmit = () => {
    errorBanner.hidden = true;
    const payload = collectDraftPayload();
    const res = existing
      ? ctx.api.updateChange(existing.id, payload)
      : ctx.api.addChange(payload);
    if (!res.ok) {
      errorBanner.textContent = res.error;
      errorBanner.hidden = false;
      toast(res.error, 'bad');
      return;
    }
    closeDialog();
    const count = (res.propagations || []).length;
    toast(
      existing
        ? `Change updated${count ? ` · ${count} cross-module sync(s)` : ''}`
        : `Change created${count ? ` · ${count} cross-module propagation(s)` : ''}`,
      'good',
    );
    if (!existing && res.id) {
      ctx.navigate(`#/changes/${res.id}`);
    }
  };

  const { close } = openModal({
    title: existing ? `Edit change — ${existing.title}` : 'Design an organizational change',
    description: 'Synthesize Team Topologies, Kotter 8-Step execution, Lewin Force-Field barriers, and PERT capacity reserves in one connected record.',
    size: 'lg',
    body: formNode,
    footer: modalFooter(formNode, handleSubmit, {
      submitLabel: existing ? 'Save changes' : 'Create change',
      onClose: () => close(),
    }),
  });
  closeDialog = close;
}

export function openSetChangeStatusDialog(ctx, change, initialStatus = 'anchored') {
  if (!change) return;
  const form = buildForm([
    {
      name: 'status',
      label: 'Lifecycle status',
      type: 'select',
      value: initialStatus,
      options: CHANGE_STATUSES.map((s) => ({ value: s, label: CHANGE_STATUS_LABELS[s] })),
    },
    {
      name: 'anchoredOn',
      label: 'Anchored date (when anchoring)',
      type: 'date',
      value: change.anchoredOn || dayKey(ctx.now),
    },
    {
      name: 'closedReason',
      label: 'Verification / status rationale',
      type: 'textarea',
      rows: 3,
      required: initialStatus === 'anchored' || initialStatus === 'abandoned',
      wide: true,
      value: change.closedReason || '',
      help: 'Anchoring marks the capacity reserve delivered and logs a verification note on any linked OKR. Pausing or abandoning releases reserved capacity back to the plan.',
    },
  ]);

  let closeDialog = () => {};
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const res = ctx.api.setChangeStatus(change.id, values);
    if (!res.ok) {
      if (res.field) form.setFieldError(res.field, res.error);
      else toast(res.error, 'bad');
      return;
    }
    closeDialog();
    const propCount = (res.propagations || []).length;
    toast(`Status → ${CHANGE_STATUS_LABELS[values.status]}${propCount ? ` (${propCount} update(s))` : ''}`, 'good');
  };

  const { close } = openModal({
    title: `Update status — ${change.title}`,
    body: form.node,
    footer: modalFooter(form.node, submit, { submitLabel: 'Update status', onClose: () => close() }),
  });
  closeDialog = close;
}

export function openCoalitionBriefDialog(ctx, change, stakeholder) {
  if (!change || !stakeholder) return;
  const todayStr = dayKey(ctx.now);
  const form = buildForm([
    { name: 'date', label: 'Briefed on', type: 'date', value: todayStr, required: true },
    {
      name: 'stance',
      label: 'Updated stance',
      type: 'select',
      value: stakeholder.stance || 'neutral',
      options: STAKEHOLDER_STANCES.map((s) => ({ value: s, label: STAKEHOLDER_STANCE_LABELS[s] })),
    },
    {
      name: 'nextBriefOn',
      label: 'Next briefing date',
      type: 'date',
      value: addDays(todayStr, stakeholder.vetoPlayer ? 7 : 14),
    },
    {
      name: 'keyMessage',
      label: 'Key takeaway / commitment agreed',
      type: 'textarea',
      rows: 2,
      wide: true,
      value: stakeholder.keyMessage || '',
    },
  ]);

  let closeDialog = () => {};
  const submit = () => {
    form.clearErrors();
    const res = ctx.api.recordCoalitionBrief(change.id, stakeholder.id, form.getValues());
    if (!res.ok) {
      if (res.field) form.setFieldError(res.field, res.error);
      else toast(res.error, 'bad');
      return;
    }
    closeDialog();
    toast(`Briefing logged for ${stakeholder.name}`, 'good');
  };

  const { close } = openModal({
    title: `Log coalition briefing — ${stakeholder.name}`,
    description: stakeholder.vetoPlayer ? 'Veto player / gatekeeper — explicit alignment protects execution.' : 'Guiding coalition member.',
    body: form.node,
    footer: modalFooter(form.node, submit, { submitLabel: 'Save briefing', onClose: () => close() }),
  });
  closeDialog = close;
}

export function openAddChangeWinDialog(ctx, change) {
  if (!change) return;
  const form = buildForm([
    { name: 'text', label: 'Short-term win achieved', required: true, wide: true, placeholder: 'e.g. First decoupled deploy shipped without shared freeze (cut wait from 4d to 35m)' },
    { name: 'achievedOn', label: 'Achieved on', type: 'date', value: dayKey(ctx.now), required: true },
  ]);

  let closeDialog = () => {};
  const submit = () => {
    form.clearErrors();
    const res = ctx.api.addChangeWin(change.id, form.getValues());
    if (!res.ok) {
      if (res.field) form.setFieldError(res.field, res.error);
      else toast(res.error, 'bad');
      return;
    }
    closeDialog();
    toast('Short-term win recorded', 'good');
  };

  const { close } = openModal({
    title: `Record short-term win — ${change.title}`,
    description: 'Kotter Step 6: visible, unambiguous early wins build credibility and disarm skeptics.',
    body: form.node,
    footer: modalFooter(form.node, submit, { submitLabel: 'Record win', onClose: () => close() }),
  });
  closeDialog = close;
}

export function openAddChangeMetricDialog(ctx, change) {
  if (!change) return;
  const form = buildForm([
    { name: 'name', label: 'Metric name', required: true, wide: true, placeholder: 'e.g. Mean P1 triage handoff time' },
    { name: 'unit', label: 'Unit', placeholder: 'min / handoffs / %' },
    {
      name: 'desirableDirection',
      label: 'Improvement direction',
      type: 'select',
      value: 'lower',
      options: [
        { value: 'lower', label: 'Lower is better (latency, defects, handoffs)' },
        { value: 'higher', label: 'Higher is better (throughput, stability, safety)' },
      ],
    },
  ]);

  let closeDialog = () => {};
  const submit = () => {
    form.clearErrors();
    const res = ctx.api.addChangeMetric(change.id, form.getValues());
    if (!res.ok) {
      if (res.field) form.setFieldError(res.field, res.error);
      else toast(res.error, 'bad');
      return;
    }
    closeDialog();
    toast('SPC metric added — log observations to compute XmR limits', 'good');
  };

  const { close } = openModal({
    title: `Add Shewhart XmR metric — ${change.title}`,
    description: 'Track before/after operational observations to verify whether the change produced a real signal shift vs routine noise.',
    body: form.node,
    footer: modalFooter(form.node, submit, { submitLabel: 'Add metric', onClose: () => close() }),
  });
  closeDialog = close;
}

export function openRecordMetricPointDialog(ctx, change, metric) {
  if (!change || !metric) return;
  const form = buildForm([
    { name: 'date', label: 'Observation date', type: 'date', value: dayKey(ctx.now), required: true },
    { name: 'value', label: `Observed value${metric.unit ? ` (${metric.unit})` : ''}`, type: 'number', step: 'any', required: true },
    {
      name: 'phase',
      label: 'Observation phase',
      type: 'select',
      value: 'post',
      options: [
        { value: 'baseline', label: 'Pre-change baseline' },
        { value: 'post', label: 'Post-change observation' },
      ],
    },
    { name: 'note', label: 'Context note (optional)', wide: true, placeholder: 'e.g. Week 2 post-cutover' },
  ]);

  let closeDialog = () => {};
  const submit = () => {
    form.clearErrors();
    const res = ctx.api.recordChangeMetricPoint(change.id, metric.id, form.getValues());
    if (!res.ok) {
      if (res.field) form.setFieldError(res.field, res.error);
      else toast(res.error, 'bad');
      return;
    }
    closeDialog();
    toast('Observation recorded', 'good');
  };

  const { close } = openModal({
    title: `Log observation — ${metric.name}`,
    description: 'At least 4 observations and 3 adjacent moving ranges unlock Shewhart XmR natural process limits.',
    body: form.node,
    footer: modalFooter(form.node, submit, { submitLabel: 'Record observation', onClose: () => close() }),
  });
  closeDialog = close;
}
