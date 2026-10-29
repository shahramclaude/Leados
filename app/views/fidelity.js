/**
 * app/views/fidelity.js — the Implementation Fidelity Ledger (`#/fidelity`,
 * Schema v50).
 *
 * Every other screen in LeadOS answers "what did I decide?" or "did the number
 * move?". This one answers the question in between, which almost nothing in the
 * management-software market asks: *was the thing actually delivered, to whom,
 * at the dose I planned — and does my own account of that agree with my own
 * records?*
 *
 * The page is built around two columns that are never merged: what the dated
 * records show, and what the leader attested. Where they disagree, the
 * disagreement is printed rather than averaged away.
 */

import { h, toast, confirmDialog, openModal } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, table, emptyState, kv } from '../ui/components.js';
import { progressBar } from '../ui/charts.js';
import { downloadText } from '../ui/download.js';
import { formatDate } from '../core/time.js';
import {
  AGREEMENT_LABELS,
  FIDELITY_CALIBRATION_MIN,
  FIDELITY_GRADES,
  FIDELITY_MIN_COVERAGE,
  FIDELITY_STAGES,
  FIDELITY_STAGE_BY_KEY,
  FIDELITY_UNDEREXPOSED,
  FIDELITY_VERDICTS,
  FIDELITY_VERDICT_LABELS,
  buildFidelityBrief,
  fidelityPortfolio,
  implementationEffect,
  instrumentDescription,
  observeFidelity,
  suggestedPlannedUnits,
} from '../core/domain/fidelity.js';
import { INTERVENTION_TYPES } from '../core/domain/interventionTypes.js';
import { FIDELITY_MAX_WINDOW_DAYS, FIDELITY_MAX_NOTE } from '../core/domain/fidelitySchema.js';
import { resolveLinkedEntity } from '../core/domain/cases.js';

const TONE_BY_GRADE = { strong: 'good', adequate: 'neutral', thin: 'warn', weak: 'bad', insufficient: 'warn' };

function pctOr(value, fallback = '—') {
  return Number.isFinite(Number(value)) ? `${Math.round(Number(value) * 10) / 10}%` : fallback;
}

function short(value, n = 120) {
  const text = String(value || '').trim();
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
}

/* ------------------------------------------------------------ declaration */

function openDeclareDialog(ctx) {
  const active = (ctx.state.people || []).filter((person) => person.status !== 'archived');
  const today = ctx.today || new Date().toISOString().slice(0, 10);
  const title = h('input', { id: 'fid-title', type: 'text', maxlength: '160', required: 'required' });
  const type = h('select', { id: 'fid-type' },
    ...INTERVENTION_TYPES.map((row) => h('option', { value: row.id }, row.label)));
  const start = h('input', { id: 'fid-start', type: 'date', value: today, max: today });
  const end = h('input', { id: 'fid-end', type: 'date' });
  const population = h('input', { id: 'fid-population', type: 'number', min: '1', max: '500', value: String(active.length || '') });
  const units = h('input', { id: 'fid-units', type: 'number', min: '1', max: '5000' });
  const owner = h('select', { id: 'fid-owner' },
    h('option', { value: '' }, 'No single owner'),
    ...active.map((person) => h('option', { value: person.id }, person.name)));
  const study = h('select', { id: 'fid-study' },
    h('option', { value: '' }, 'Not linked to a pre-registered study'),
    ...(ctx.state.impactStudies || [])
      .filter((row) => row.status !== 'abandoned')
      .map((row) => h('option', { value: row.id }, short(row.title, 80))));
  const notes = h('textarea', { id: 'fid-notes', rows: '3', maxlength: '1000' });
  const hint = h('p', { class: 'muted small', id: 'fid-instrument-hint' });

  const syncEnd = () => {
    if (!start.value) return;
    const d = new Date(`${start.value}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + 27);
    if (!end.value) end.value = d.toISOString().slice(0, 10);
    const inst = instrumentDescription(type.value);
    hint.textContent = inst
      ? `Records available: ${inst.label}. A unit is one ${inst.unit}, and it meets the declared standard when ${inst.standard}.`
      : 'No dated record instrument exists for this intervention type, so every stage will be human-attested. That is stated on the plan rather than filled in with a plausible proxy.';
  };
  start.addEventListener('change', syncEnd);
  type.addEventListener('change', syncEnd);
  syncEnd();
  if (!end.value) {
    const d = new Date(`${today}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + 27);
    end.value = d.toISOString().slice(0, 10);
  }

  const dialog = openModal({
    title: 'Declare an implementation plan',
    description: 'Declare the denominators before delivery starts. Population and planned units are what every later percentage is read against, and they cannot be edited after settlement.',
    body: h('div', { class: 'view-stack' },
      h('div', { class: 'form-grid' },
        h('div', { class: 'stack-xs' }, h('label', { for: 'fid-title' }, 'What are you delivering?'), title),
        h('div', { class: 'stack-xs' }, h('label', { for: 'fid-type' }, 'Intervention type'), type),
        h('div', { class: 'stack-xs' }, h('label', { for: 'fid-start' }, 'Delivery started'), start),
        h('div', { class: 'stack-xs' }, h('label', { for: 'fid-end' }, 'Window ends'), end),
        h('div', { class: 'stack-xs' }, h('label', { for: 'fid-population' }, 'Intended population'), population),
        h('div', { class: 'stack-xs' }, h('label', { for: 'fid-units' }, 'Planned units'), units),
        h('div', { class: 'stack-xs' }, h('label', { for: 'fid-owner' }, 'Accountable owner'), owner),
        h('div', { class: 'stack-xs' }, h('label', { for: 'fid-study' }, 'Pre-registered study (optional)'), study)),
      hint,
      h('div', { class: 'stack-xs' }, h('label', { for: 'fid-notes' }, 'Anything the next reader needs'), notes)),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const res = ctx.api.addFidelityPlan({
            title: title.value,
            interventionType: type.value,
            windowStart: start.value,
            windowEnd: end.value,
            population: population.value,
            plannedUnits: units.value,
            ownerId: owner.value,
            studyId: study.value,
            notes: notes.value,
          });
          if (!res.ok) { toast(res.error, 'bad'); return; }
          dialog.close();
          toast('Plan declared. The denominators are now fixed evidence.', 'good');
          ctx.navigate(`#/fidelity?plan=${encodeURIComponent(res.id)}`);
        },
      }, 'Declare the plan'),
    ],
  });
}

/* ------------------------------------------------------------- attestation */

function openAttestDialog(ctx, plan, stageRow) {
  const stage = FIDELITY_STAGE_BY_KEY[stageRow.key];
  const verdict = h('select', { id: 'fid-verdict' },
    ...FIDELITY_VERDICTS.map((key) => h('option', { value: key, selected: stageRow.attested?.verdict === key ? 'selected' : undefined }, FIDELITY_VERDICT_LABELS[key])));
  const note = h('textarea', { id: 'fid-verdict-note', rows: '3', maxlength: String(FIDELITY_MAX_NOTE) });
  if (stageRow.attested?.note) note.value = stageRow.attested.note;
  const by = h('select', { id: 'fid-verdict-by' },
    h('option', { value: '' }, 'Not attributed'),
    ...(ctx.state.people || []).filter((p) => p.status !== 'archived')
      .map((person) => h('option', { value: person.id, selected: stageRow.attested?.byId === person.id ? 'selected' : undefined }, person.name)));

  const observedLine = stageRow.observed
    ? `The records show ${stageRow.observed.pct}% — ${stageRow.observed.detail}.`
    : (stageRow.key === 'adaptation'
      ? 'Adaptation has no record instrument by design: the point is whether you wrote down what you changed.'
      : 'No record instrument exists for this stage on this intervention type, so your reading is the only reading and is labelled as such.');

  const dialog = openModal({
    title: `Attest ${stage.label.toLowerCase()}`,
    description: observedLine,
    body: h('div', { class: 'view-stack' },
      h('div', { class: 'form-grid' },
        h('div', { class: 'stack-xs' }, h('label', { for: 'fid-verdict' }, 'Your dated reading'), verdict),
        h('div', { class: 'stack-xs' }, h('label', { for: 'fid-verdict-by' }, 'Who is attesting'), by)),
      h('div', { class: 'stack-xs' }, h('label', { for: 'fid-verdict-note' }, 'What happened (required when you disagree with the records)'), note),
      h('p', { class: 'muted small' },
        'If your reading contradicts the records, a reason is required. Real work that was never logged looks exactly like an overclaim, and writing down which one it was is the only way the next reader can tell the difference.')),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const res = ctx.api.attestFidelityStage(plan.id, stageRow.key, {
            verdict: verdict.value,
            note: note.value,
            byId: by.value || null,
          });
          if (!res.ok) { toast(res.error, 'bad'); return; }
          dialog.close();
          toast(
            res.agreement === 'optimistic' || res.agreement === 'conservative'
              ? 'Attested — the records disagree, and your reason is now part of the reading'
              : 'Attested',
            res.agreement === 'optimistic' || res.agreement === 'conservative' ? 'warn' : 'good',
          );
          ctx.refresh();
        },
      }, 'Record the reading'),
    ],
  });
}

/* ------------------------------------------------------------------- cards */

function stageTable(ctx, plan, reading) {
  const rows = reading.stages.map((row) => {
    const stage = FIDELITY_STAGE_BY_KEY[row.key];
    const observed = row.observed
      ? h('div', null,
        h('div', null, `${Math.round(row.observed.pct * 10) / 10}%`),
        h('div', { class: 'muted small' }, `${row.observed.numerator}/${row.observed.denominator} ${row.observed.unit}`))
      : h('span', { class: 'muted small' }, stage.observed ? 'no records yet' : 'no instrument');
    const attested = row.attested
      ? h('div', null,
        h('div', null, FIDELITY_VERDICT_LABELS[row.attested.verdict]),
        h('div', { class: 'muted small' },
          `${formatDate(row.attested.on, { withYear: false })}${row.attested.note ? ` · ${short(row.attested.note, 70)}` : ''}`))
      : h('span', { class: 'muted small' }, plan.status === 'settled' ? 'not attested' : 'not attested yet');
    const agreement = badge(
      AGREEMENT_LABELS[row.agreement] || row.agreement,
      row.agreement === 'concordant' ? 'good'
        : row.agreement === 'optimistic' ? 'bad'
          : row.agreement === 'conservative' ? 'warn'
            : row.agreement === 'unverifiable' ? 'neutral' : 'warn',
    );
    const cells = {
      key: row.key,
      stage: h('div', null,
        h('div', null, stage.label),
        h('div', { class: 'muted small' }, stage.framework)),
      observed,
      attested,
      agreement,
      action: plan.status === 'active'
        ? h('button', {
          class: 'btn btn-ghost btn-sm',
          type: 'button',
          'aria-label': `Attest ${stage.label} on ${plan.title}`,
          onClick: () => openAttestDialog(ctx, plan, row),
        }, row.attested ? 'Re-attest' : 'Attest')
        : h('span', { class: 'muted small' }, row.score === null ? '—' : `${Math.round(row.score * 100)}%`),
    };
    return { row: cells, className: row.key === reading.weakestStage?.key ? 'row-current' : '' };
  });
  return table({
    columns: [
      { key: 'stage', label: 'Stage', render: ({ row }) => row.stage },
      { key: 'observed', label: 'From the records', render: ({ row }) => row.observed },
      { key: 'attested', label: 'Your reading', render: ({ row }) => row.attested },
      { key: 'agreement', label: 'Agreement', render: ({ row }) => row.agreement },
      { key: 'action', label: 'Action', render: ({ row }) => row.action },
    ],
    rows,
    caption: `Five fidelity stages for ${plan.title}`,
  });
}

function effectPanel(ctx, plan, reading) {
  const study = plan.studyId
    ? (ctx.state.impactStudies || []).find((row) => row && row.id === plan.studyId)
    : null;
  if (!study) {
    return h('p', { class: 'muted small' },
      'No pre-registered study is attached. Delivery can be measured without one, but the per-complier correction only exists once there is an outcome to correct.');
  }
  const evaluation = study.evaluation || null;
  if (!evaluation) {
    return h('p', { class: 'muted small' },
      `The attached study “${short(study.title, 70)}” is still running. When it is scored, this plan's delivery reading is frozen onto it in the same transaction, including the Bloom-adjusted per-complier effect.`);
  }
  const effect = implementationEffect(reading, evaluation);
  const frozen = study.implementationSnapshot || null;
  return h('div', { class: 'view-stack', 'data-testid': 'fidelity-effect-panel' },
    h('div', { class: 'grid-2' },
      h('div', null, kv('Intention-to-treat estimate (as scored)', evaluation.ok ? String(evaluation.estimate) : (evaluation.reason || 'not evaluable'))),
      h('div', null, kv('Compliance used for the adjustment', effect.compliancePct === null ? '—' : `${effect.compliancePct}%`)),
      h('div', null, kv('Per-complier effect (Bloom)', effect.perComplier === null ? '—' : String(effect.perComplier))),
      h('div', null, kv('Per-complier minimum detectable effect', effect.perComplierMde === null ? '—' : String(effect.perComplierMde))),
      h('div', null, kv('Dilution factor', effect.dilutionFactor === null ? '—' : `${effect.dilutionFactor}×`))),
    effect.available
      ? h('p', { class: 'muted small' },
        `The study could only detect a per-complier effect of ${effect.perComplierMde ?? '—'}, not the ${effect.mde ?? '—'} it was designed for: at ${effect.compliancePct}% exposure the observed shift is diluted by roughly that factor. Reported next to the unadjusted number, never instead of it.`)
      : h('p', { class: 'muted small' }, effect.reason || ''),
    effect.available
      ? h('details', null,
        h('summary', null, 'Assumptions behind the adjustment'),
        h('ul', { class: 'list-plain' }, ...(effect.assumptions || []).map((line) => h('li', { class: 'muted small' }, line))))
      : null,
    frozen
      ? h('p', { class: 'muted small' },
        `Frozen on the study at scoring: ${frozen.status}${frozen.exposurePct === null ? '' : ` · ${frozen.exposurePct}% exposure`}${frozen.perComplierEffect === null ? '' : ` · per-complier ${frozen.perComplierEffect}`}.`)
      : null);
}

function fidelityActions(ctx, plan) {
  const actions = [];
  if (plan.status === 'active') {
    actions.push(h('button', {
      class: 'btn btn-primary btn-sm',
      type: 'button',
      onClick: () => {
        const res = ctx.api.settleFidelityPlan(plan.id);
        if (!res.ok) { toast(res.error, 'bad'); return; }
        toast(`Settled: ${res.reading.grade.label}${res.reading.exposurePct === null ? '' : ` · ${res.reading.exposurePct}% exposure`}`, 'good');
        ctx.refresh();
      },
    }, 'Settle the reading'));
    actions.push(h('button', {
      class: 'btn btn-ghost btn-sm',
      type: 'button',
      onClick: () => {
        const res = ctx.api.abandonFidelityPlan(plan.id, 'Abandoned from the ledger.');
        if (!res.ok) { toast(res.error, 'bad'); return; }
        toast('Plan abandoned. Nothing was scored against anyone.', 'neutral');
        ctx.refresh();
      },
    }, 'Abandon'));
  } else if (plan.status === 'settled') {
    actions.push(h('button', {
      class: 'btn btn-ghost btn-sm',
      type: 'button',
      onClick: () => {
        const res = ctx.api.reopenFidelityPlan(plan.id, 'Reopened to correct the record.');
        if (!res.ok) { toast(res.error, 'bad'); return; }
        toast('Reopened. The settlement stays in the history.', 'warn');
        ctx.refresh();
      },
    }, 'Reopen'));
  }
  actions.push(h('button', {
    class: 'btn btn-ghost btn-sm',
    type: 'button',
    onClick: () => confirmDialog({
      title: 'Delete this plan?',
      message: 'Deleting removes the plan and its settlement. The audit log keeps the fact that it existed.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: () => {
        const res = ctx.api.deleteFidelityPlan(plan.id);
        if (!res.ok) { toast(res.error, 'bad'); return; }
        toast('Plan deleted', 'neutral');
        ctx.navigate('#/fidelity');
      },
    }),
  }, 'Delete'));
  return actions;
}

function planCard(ctx, row) {
  const { plan, reading, study } = row;
  const grade = FIDELITY_GRADES[reading.grade.id] || FIDELITY_GRADES.insufficient;
  const intervention = plan.interventionId
    ? resolveLinkedEntity(ctx.state, plan.interventionType === 'hiring' ? 'requisition' : plan.interventionType, plan.interventionId)
    : null;
  const actions = fidelityActions(ctx, plan);

  const chips = [
    badge(grade.label, TONE_BY_GRADE[grade.id] || 'neutral'),
    plan.status === 'settled'
      ? badge('Settled', 'good')
      : plan.status === 'abandoned' ? badge('Abandoned', 'neutral') : badge('Active', 'neutral'),
    reading.instrument ? badge(`Records: ${reading.instrument.label}`, 'neutral') : badge('Attestation only', 'warn'),
    row.overdueStages.length
      ? badge(`${row.overdueStages.length} overdue checkpoint${row.overdueStages.length === 1 ? '' : 's'}`, 'warn')
      : null,
    reading.underExposed ? badge('Underexposed', 'bad') : null,
  ].filter(Boolean);

  const stats = h('div', { class: 'stat-grid' },
    stat({
      label: 'Fidelity index',
      value: reading.index === null ? '—' : pctOr(reading.index * 100),
      hint: `Weighted across ${FIDELITY_STAGES.length} stages; ${Math.round(reading.coverage * 100)}% has evidence (floor ${Math.round(FIDELITY_MIN_COVERAGE * 100)}%)`,
      tone: reading.grade.id === 'strong' ? 'good' : reading.grade.id === 'insufficient' ? 'warn' : '',
    }),
    stat({
      label: 'Exposure (reach × dose × quality)',
      value: reading.exposurePct === null ? '—' : `${reading.exposurePct}%`,
      hint: `Below ${Math.round(FIDELITY_UNDEREXPOSED * 100)}% counts as materially under-delivered`,
      tone: reading.underExposed ? 'bad' : 'good',
    }),
    stat({
      label: 'Units delivered',
      value: String(reading.unitCount),
      hint: reading.plannedUnits ? `of ${reading.plannedUnits} planned` : 'no planned figure declared',
    }),
    stat({
      label: 'Intended people',
      value: String(reading.population.value),
      hint: reading.population.source === 'declared' ? 'declared at the start' : 'derived from the active roster',
    }));

  const exposureBar = reading.instrument
    ? progressBar(Math.round((reading.exposure ?? 0) * 100), {
      label: 'Measured exposure against the declared plan',
      tone: reading.underExposed ? 'warn' : 'good',
    })
    : h('p', { class: 'muted small' }, reading.instrumentMissingReason);

  const weakestLine = reading.weakestStage
    ? h('p', { class: 'muted small' },
      `Binding constraint: ${reading.weakestStage.label.toLowerCase()} at ${Math.round(reading.weakestStage.score * 100)}%. Fixing anything else moves the plan least.`)
    : null;

  const links = h('div', { class: 'row-wrap' },
    intervention ? h('a', { class: 'btn btn-ghost btn-sm', href: intervention.route }, `Open the ${intervention.type} record`) : null,
    study ? h('a', { class: 'btn btn-ghost btn-sm', href: `#/impact?tab=evaluate&study=${encodeURIComponent(study.id)}` }, 'Open the impact study') : null,
    plan.ownerId
      ? h('span', { class: 'muted small' }, `Owner: ${(ctx.state.people || []).find((person) => person.id === plan.ownerId)?.name || 'unknown'}`)
      : null);

  const settlementLine = plan.settlement
    ? h('p', { class: 'muted small' },
      `Frozen on ${formatDate(plan.settlement.on)}: index ${plan.settlement.indexPct ?? '—'}%, exposure ${plan.settlement.exposurePct ?? '—'}%, coverage ${plan.settlement.coveragePct}%. A settled reading is never recomputed from today's records.`)
    : null;

  const body = h('div', { class: 'view-stack' },
    h('div', { class: 'row-wrap' }, ...chips),
    stats,
    exposureBar,
    weakestLine,
    stageTable(ctx, plan, reading),
    links,
    effectPanel(ctx, plan, reading),
    plan.notes ? h('p', { class: 'muted small' }, plan.notes) : null,
    settlementLine);

  return card({
    id: `fidelity-plan-${plan.id}`,
    title: plan.title,
    subtitle: `${INTERVENTION_TYPES.find((t) => t.id === plan.interventionType)?.label || plan.interventionType} · ${formatDate(plan.windowStart)} → ${formatDate(plan.windowEnd)}`,
    actions,
    className: plan.id === ctx.query?.get?.('plan') ? 'lineage-selected' : '',
    body,
  });
}

/* -------------------------------------------------------------- calibration */

function calibrationCard(report) {
  const bias = report.bias;
  if (!bias.measurable) {
    return card({
      title: 'Attestation calibration',
      subtitle: 'Withheld below the sample floor',
      body: h('div', { class: 'view-stack' },
        h('p', { class: 'muted' }, bias.note),
        h('p', { class: 'muted small' },
          `Record-verifiable verdicts so far: ${bias.graded} of ${FIDELITY_CALIBRATION_MIN}. A two-observation rate is a story, so the ledger prints nothing rather than a number nobody should act on.`)),
    });
  }
  return card({
    title: 'Attestation calibration',
    subtitle: `${bias.graded} record-verifiable stage verdicts`,
    body: h('div', { class: 'view-stack' },
      h('div', { class: 'stat-grid' },
        stat({ label: 'Agrees with the records', value: pctOr(bias.concordancePct / 100 * 100), hint: `${bias.concordant} of ${bias.graded}`, tone: bias.concordancePct >= 75 ? 'good' : 'warn' }),
        stat({
          label: 'Claims more than the records show',
          value: `${bias.overclaim.pct}%`,
          hint: `95% interval ${bias.overclaim.lowPct}–${bias.overclaim.highPct}% · Wilson`,
          tone: bias.overclaim.pct >= 25 ? 'bad' : '',
        }),
        stat({
          label: 'Claims less than the records show',
          value: `${bias.underclaim.pct}%`,
          hint: `95% interval ${bias.underclaim.lowPct}–${bias.underclaim.highPct}% · Wilson`,
        }),
        stat({ label: 'Mildly generous / strict', value: `${bias.lenient} / ${bias.strict}`, hint: 'Between the two clear thresholds' })),
      h('p', { class: 'muted small' }, bias.note)),
  });
}

/* ------------------------------------------------------------------- method */

function methodCard(report) {
  return card({
    title: 'How these numbers are produced',
    subtitle: 'Named instruments, stated denominators, no person scoring',
    body: h('div', { class: 'view-stack' },
      h('ul', { class: 'list-plain stack-xs' },
        h('li', null, h('strong', null, 'RE-AIM (Glasgow, Vogt & Boles, 1999): '), 'reach, implementation and maintenance are read from dated records; effectiveness belongs to the Impact Ledger. Setting-level adoption is not claimed, because a single workspace cannot see the settings it does not contain.'),
        h('li', null, h('strong', null, 'Carroll et al. (2007) fidelity dimensions: '), 'dose delivered and adherence/quality are scored separately, and adaptation — reported by roughly one study in seven in the RE-AIM reviews — is a first-class scored artefact here.'),
        h('li', null, h('strong', null, 'Bloom (1984) / Imbens–Angrist LATE: '), 'per-complier effect ≈ ITT ÷ compliance, and the minimum detectable effect inflates by the same factor. Reported as an order-of-magnitude dilution correction under stated assumptions, never as a causal claim.'),
        h('li', null, h('strong', null, 'Wilson (1927) score interval: '), 'the over-claim and under-claim rates carry a 95% interval that stays honest at small n, which is the only kind of n a real team has.'),
        h('li', null, h('strong', null, 'Exposure is multiplicative: '), 'reach × dose × quality. 50% reach and 50% quality is a quarter of the intended exposure, not a half — which is why an under-delivered programme cannot be judged by its outcome.')),
      h('p', { class: 'muted small' },
        `Record instruments exist for ${report.instrumentedTypes} intervention types (${report.instrumentsAvailable.join(', ')}). For every other type the plan says “attestation only” out loud rather than substituting an unvalidated proxy.`),
      h('p', { class: 'muted small' },
        'What this does not do: it does not prove an intervention worked, does not score any person, does not read free text, does not predict attrition and does not claim that a leader who under-records is dishonest. Unlogged work is the most common cause of a disagreement.')),
  });
}

/* ------------------------------------------------------------------ render */

export function renderFidelity(ctx) {
  const report = fidelityPortfolio(ctx.state, ctx.now ? new Date(ctx.now) : new Date());
  const selectedId = ctx.query?.get?.('plan') || null;

  const header = pageHeader({
    eyebrow: 'Implementation · Schema v50',
    title: 'Implementation fidelity',
    subtitle: 'What was actually delivered, against the denominators you declared before delivery — and whether your own account agrees with your own records.',
    actions: [
      h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openDeclareDialog(ctx) }, 'Declare a plan'),
      h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: () => {
          const res = ctx.api.scanFidelity();
          toast(res.changed ? 'Scan complete — overdue checkpoints became owned work' : 'Scan complete: nothing needed creating', res.changed ? 'good' : 'neutral');
          ctx.refresh();
        },
      }, 'Scan for overdue checkpoints'),
      h('a', { class: 'btn btn-ghost', href: '#/impact' }, 'Impact ledger'),
    ],
    meta: badge(`${report.counts.active} active · ${report.counts.settled} settled`, 'neutral'),
  });

  const stats = h('div', { class: 'stat-grid' },
    stat({
      label: 'Portfolio fidelity index',
      value: report.portfolioIndexPct === null ? '—' : `${report.portfolioIndexPct}%`,
      hint: report.counts.gradeable ? `${report.counts.gradeable} gradeable plan(s) · weighted by evidenced stage` : 'nothing gradeable yet',
      tone: report.portfolioIndex !== null && report.portfolioIndex >= 0.75 ? 'good' : report.portfolioIndex === null ? 'warn' : '',
    }),
    stat({
      label: 'Weakest stage',
      value: report.weakestStage ? `${report.weakestStage.meanPct}%` : '—',
      hint: report.weakestStage ? `${report.weakestStage.label} across ${report.weakestStage.n} plan(s)` : 'no evidence yet',
      tone: 'warn',
    }),
    stat({
      label: 'Materially under-delivered',
      value: String(report.counts.underExposed),
      hint: `Below ${Math.round(FIDELITY_UNDEREXPOSED * 100)}% exposure — an untested idea, not a failed one`,
      tone: report.counts.underExposed ? 'bad' : 'good',
    }),
    stat({
      label: 'Overdue checkpoints',
      value: String(report.counts.overdue),
      hint: `${report.counts.disagreeing} plan(s) where the account and the records disagree`,
      tone: report.counts.overdue ? 'warn' : 'good',
    }));

  const body = report.rows.length
    ? h('div', { class: 'view-stack' },
      ...(selectedId
        ? report.rows.filter((row) => row.plan.id === selectedId).map((row) => planCard(ctx, row))
        : []),
      ...report.rows.filter((row) => row.plan.id !== selectedId).map((row) => planCard(ctx, row)))
    : emptyState({
      title: 'No implementation plans yet',
      body: 'Declare one the day delivery starts: how many people, how many units, over what window. The ledger then reads your own dated records against it — and shows you where your memory and your records part company.',
      action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openDeclareDialog(ctx) }, 'Declare a plan'),
    });

  const exportBrief = () => {
    const text = buildFidelityBrief(ctx.state, ctx.now ? new Date(ctx.now) : new Date());
    openModal({
      title: 'Copy the implementation brief',
      body: h('textarea', { readOnly: true, rows: '16', 'aria-label': 'Implementation fidelity brief' }, text),
      footer: [
        h('button', {
          class: 'btn btn-ghost',
          type: 'button',
          onClick: () => downloadText({ filename: 'leados-implementation-fidelity.txt', text, mime: 'text/plain' }),
        }, 'Download'),
      ],
    });
  };

  return h('div', { class: 'page', 'data-testid': 'fidelity-page' },
    header,
    banner({
      tone: 'info',
      title: 'Delivery is not effectiveness — and an undelivered intervention has not failed, it has not been tested',
      body: 'Each plan is read two ways: from the dated records you already keep, and from a dated human judgement. Where they disagree, the disagreement is the finding. Nothing here scores a person, reads free text, or claims an intervention worked.',
      actions: [h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: exportBrief }, 'Copy the board brief')],
    }),
    stats,
    body,
    calibrationCard(report),
    methodCard(report));
}
