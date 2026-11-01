/**
 * app/views/intake.js — Natural-Language Intake Terminal (`#/intake`).
 *
 * The triage workspace: paste a free-form situation note, watch the on-device
 * engine explain its confidence-scored classification with full evidence
 * spans and extracted entities, then either save the analysis as a draft or
 * hand a pre-filled Operational Case to the standard case dialog. Every case
 * created here flows through the same event-driven propagation engine as a
 * manually registered case — the intake layer never writes to other modules
 * directly.
 *
 * Privacy is structural, not promised in marketing copy: the engine is a pure
 * local module with no network surface (ADR-0006/0007 boundary), and conflict
 * language is routed to the confidential workspace by the leader themselves.
 */

import { h, toast, confirmDialog, openModal } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, emptyState, tabs } from '../ui/components.js';
import { progressBar } from '../ui/charts.js';
import { formatDate } from '../core/time.js';
import {
  CALIBRATION_MIN_SAMPLES,
  analyzeIntakeText,
  intakeCalibration,
  pendingIntakeDrafts,
  toCaseInput,
} from '../core/domain/intake.js';
import { previewCasePropagations } from '../core/domain/automation.js';
import { openCaseDialog } from '../ui/case-modals.js';

/** Ephemeral workbench state; resets on reload and never enters the store. */
const workbench = { text: '', analysis: null };

const EXAMPLES = [
  {
    label: 'Vendor delivery slippage',
    text: 'Priya missed the second deadline in a row on the billing migration. Our supplier contract is already three weeks late and is costing about $40,000 in penalty fees, and the team says they are overloaded and burnt out. We need to escalate this to the VP this week.',
  },
  {
    label: 'Safety & compliance incident',
    text: 'There was a safety incident in the warehouse yesterday — a near-miss with a forklift in aisle four. Legal says this could be a compliance breach and we may have a GDPR exposure if the incident log was not completed.',
  },
  {
    label: 'Attrition risk',
    text: 'Samuel told me in the 1:1 that he is seriously considering resigning because he has no successor and is the single point of failure for the escalation rota. Morale in the support pod is low and two people have mentioned burnout.',
  },
];

const BAND_TONE = { high: 'good', medium: 'caution', low: 'warn', none: 'neutral' };
const BAND_LABEL = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence — verify every field',
  none: 'Insufficient evidence',
};

function confidenceBar(probability) {
  const pctValue = Math.round(probability * 100);
  const tone = pctValue >= 55 ? 'good' : pctValue >= 38 ? 'caution' : 'neutral';
  return h(
    'div',
    { class: 'intake-prob-row' },
    h('div', { class: 'intake-prob-track', 'aria-hidden': 'true' }, progressBar(pctValue, { tone, thin: true })),
    h('span', { class: 'intake-prob-pct' }, `${pctValue}%`),
  );
}

function evidenceChips(evidence, sourceText) {
  const positive = evidence.filter((e) => !e.negated).slice(0, 4);
  const negated = evidence.filter((e) => e.negated).slice(0, 2);
  if (!positive.length && !negated.length) return h('p', { class: 'muted tiny' }, 'No direct term matches.');
  return h(
    'div',
    { class: 'stack-xs' },
    ...positive.map((e) =>
      h(
        'div',
        { class: 'intake-evidence' },
        badge(`+${e.weight}`, 'good', 'Evidence weight'),
        h('code', { class: 'intake-evidence-term' }, e.term),
        h('span', { class: 'muted tiny intake-evidence-sentence' }, `“${(e.sentence || sourceText.slice(e.start, e.end)).slice(0, 110)}”`),
      ),
    ),
    ...negated.map((e) =>
      h(
        'div',
        { class: 'intake-evidence intake-evidence-negated' },
        badge('negated', 'warn', 'NegEx negation cue'),
        h('code', { class: 'intake-evidence-term' }, e.term),
      ),
    ),
  );
}

function entityCard({ title, tone = 'neutral', items, empty = 'None detected' }) {
  return h(
    'div',
    { class: 'intake-entity' },
    h('div', { class: 'intake-entity-head' }, h('strong', { class: 'small' }, title), items.length ? badge(String(items.length), tone) : null),
    items.length
      ? h('ul', { class: 'intake-entity-list' }, ...items.map((item) => h('li', null, item)))
      : h('p', { class: 'muted tiny' }, empty),
  );
}

function renderEntities(analysis, ctx) {
  const e = analysis.entities;
  const personById = new Map(ctx.state.people.map((p) => [p.id, p]));
  const moneyItems = e.money.map((m) =>
    h('span', null,
      h('strong', null, `${m.currency} ${m.amount.toLocaleString('en-US')}`),
      ` — “${m.raw}”`,
      m.currencyAssumed ? badge('currency assumed', 'caution', 'Verify the currency before saving') : null,
    ),
  );
  const durationItems = e.durations.map((d) =>
    h('span', null, h('strong', null, d.raw), d.type === 'duration' ? ` ≈ ${d.approxDays} calendar days` : ` (${d.days} person-days)`),
  );
  const peopleItems = e.people.map((p) =>
    h('span', null,
      h('strong', null, p.name),
      ` (${p.matchKind.replace('-', ' ')})`,
    ),
  );
  const ambiguityItems = e.peopleAmbiguities.map((a) =>
    h('span', { class: 'text-warn' },
      h('strong', null, `“${a.raw}” is ambiguous`),
      ` — could be ${a.candidates.map((c) => c.name).join(' or ')}; not auto-selected`,
    ),
  );
  const recurrenceItems = e.recurrence.map((r) =>
    h('span', null, h('strong', null, r.raw), r.weak ? ' (ordinal — weak repeat signal)' : ` (occurrence #${r.count})`),
  );
  const severityItems = e.severitySignals.map((s) =>
    h('span', { class: s.level === 'critical' ? 'text-bad' : 'text-warn' },
      h('strong', null, s.marker), ` — ${s.level} stakes marker`,
    ),
  );
  const percentItems = e.percents.map((p) => h('strong', null, p.raw));
  const weekdayItems = e.weekdays.map((w) => h('span', null, h('strong', null, w.raw), w.qualifier ? ` (${w.qualifier})` : ''));
  return h(
    'div',
    { class: 'intake-entity-grid' },
    entityCard({ title: 'People matched', tone: 'good', items: [...peopleItems, ...ambiguityItems] }),
    entityCard({ title: 'Money exposure', tone: 'warn', items: moneyItems }),
    entityCard({ title: 'Durations & effort', items: durationItems }),
    entityCard({ title: 'Recurrence', tone: 'caution', items: recurrenceItems }),
    entityCard({ title: 'Severity markers', tone: 'bad', items: severityItems }),
    entityCard({ title: 'Percentages', items: percentItems }),
    entityCard({ title: 'Date language', items: weekdayItems, empty: 'No weekday hints' }),
  );
}

function renderVerdictBanner(analysis) {
  if (analysis.insufficient) {
    return banner({
      tone: 'warn',
      title: 'Not enough evidence to route this confidently',
      body: analysis.insufficientReasons.join(' ') + ' Add concrete details: what happened, who was involved, any money or dates, and why it matters. The text is kept in the composer.',
    });
  }
  const notices = [];
  if (analysis.stakesReviewRequired) {
    notices.push(banner({
      tone: 'bad',
      title: 'Mandatory human review (RULE-INTAKE-05)',
      body: 'Safety, legal, regulatory or confidentiality stakes were detected. High-stakes labels are never auto-routed regardless of confidence score — the leader must confirm the record.',
    }));
  }
  if (analysis.conflictPrivacyWall) {
    notices.push(banner({
      tone: 'caution',
      title: 'Confidential conflict language — privacy wall (RULE-INTAKE-04)',
      body: 'LeadOS never auto-creates conflict records or links them to operational cases. If a private record is appropriate, open the Conflict resolution workspace yourself. No case suggestion was generated from the conflict reading.',
      actions: [h('a', { class: 'btn btn-small btn-ghost', href: '#/conflicts' }, 'Open conflict workspace')],
    }));
  }
  if (analysis.ambiguous) {
    notices.push(banner({
      tone: 'info',
      title: 'Two readings are almost equally likely',
      body: `The top-1/top-2 probability margin is only ${Math.round(analysis.margin * 100)}%. Check both category rows and their evidence before routing.`,
    }));
  }
  return h('div', { class: 'stack-sm' }, ...notices);
}

function renderCategoryPanel(analysis) {
  const primary = analysis.categories[0];
  const rows = analysis.categories.map((cat) =>
    h(
      'div',
      {
        class: `intake-cat-row ${cat.id === analysis.primaryCategoryId ? 'is-primary' : ''}`,
        'data-testid': `intake-cat-${cat.id}`,
      },
      h('div', { class: 'intake-cat-head' },
        h('span', { class: 'intake-cat-label' },
          cat.id === analysis.primaryCategoryId ? badge('primary', 'good') : null,
          cat.label,
          cat.privacyWall ? badge('confidential', 'warn') : null,
          cat.stakes ? badge('stakes', 'bad') : null,
        ),
        h('span', { class: 'muted tiny' }, `${cat.hits} match${cat.hits === 1 ? '' : 'es'}${cat.negatedHits ? ` · ${cat.negatedHits} negated` : ''}`),
      ),
      confidenceBar(cat.probability),
      cat.id === primary.id || analysis.secondaryCategoryIds.includes(cat.id)
        ? evidenceChips(cat.evidence, analysis.sourceText || workbench.text)
        : null,
    ),
  );
  return card({
    title: 'Classification evidence',
    subtitle: 'Weighted on-device lexicon scoring with NegEx negation; softmax probabilities are shrunk toward uniform so thin evidence cannot look certain.',
    body: h('div', { class: 'stack-md', 'data-testid': 'intake-categories' }, ...rows),
  });
}

function renderSuggestionPanel(analysis, ctx, draftId) {
  const s = analysis.caseSuggestion;
  if (!s) {
    return card({
      title: 'Routing plan',
      body: h('div', { class: 'stack-sm' },
        ...analysis.routingPlan.map((route) => renderRouteRow(route)),
        h('p', { class: 'muted small' }, 'No operational case will be auto-created from this triage.'),
      ),
    });
  }
  const caseInput = toCaseInput(analysis);
  const previews = previewCasePropagations(caseInput, ctx.state, { now: ctx.now });
  return card({
    title: 'Suggested operational case',
    subtitle: 'Every field is a suggestion with an evidence basis — the case dialog opens for full review before anything is written.',
    body: h('div', { class: 'stack-md' },
      h('div', { class: 'intake-suggestion-grid' },
        h('div', null, h('span', { class: 'field-label' }, 'Case type'), h('strong', null, s.kind), h('p', { class: 'muted tiny' }, s.kindBasis)),
        h('div', null, h('span', { class: 'field-label' }, 'Suggested title'), h('strong', null, analysis.suggestedTitle)),
        h('div', null, h('span', { class: 'field-label' }, 'FMEA priors'), h('strong', null, `S${analysis.fmeaPrior?.severity} · P${analysis.fmeaPrior?.probability} · D${analysis.fmeaPrior?.detectability}`),
          h('ul', { class: 'plain-list tiny muted' }, ...analysis.fmeaPrior.basis.map((b) => h('li', null, b)))),
        s.financial
          ? h('div', null, h('span', { class: 'field-label' }, `PERT exposure (${s.financial.currency})`),
              h('strong', null, `${s.financial.optimistic.toLocaleString('en-US')} / ${s.financial.mostLikely.toLocaleString('en-US')} / ${s.financial.pessimistic.toLocaleString('en-US')}`),
              h('p', { class: 'muted tiny' }, s.financialBasis))
          : h('div', null, h('span', { class: 'field-label' }, 'PERT exposure'), h('span', { class: 'muted' }, 'No money detected')),
        s.involvedPersonIds.length
          ? h('div', null, h('span', { class: 'field-label' }, 'Involved people'),
              h('strong', null, s.involvedPersonIds.map((pid) => ctx.state.people.find((p) => p.id === pid)?.name || pid).join(', ')))
          : null,
        s.linkedGoalId
          ? h('div', null, h('span', { class: 'field-label' }, 'Goal link'), h('strong', null, ctx.state.goals.find((g) => g.id === s.linkedGoalId)?.title || s.linkedGoalId), h('p', { class: 'muted tiny' }, s.goalLinkBasis))
          : null,
      ),
      h('div', { class: 'stack-sm' },
        h('h3', { class: 'habit-title' }, 'Parallel propagation preview (before you confirm)'),
        previews.length
          ? h('ul', { class: 'intake-preview-list', 'data-testid': 'intake-propagation-preview' },
              ...previews.map((p) => h('li', null,
                h('div', { class: 'intake-preview-head' }, badge(p.ruleId, 'neutral'), h('strong', { class: 'small' }, p.summary)),
                h('p', { class: 'muted tiny' }, p.detail),
              )),
            )
          : h('p', { class: 'muted small' }, 'No cross-module propagations would fire yet — add an owner, exposure or stakeholders in the case dialog to engage the rules.'),
      ),
      h('div', { class: 'stack-sm' }, ...analysis.routingPlan.map((route) => renderRouteRow(route))),
      renderActionButtons(analysis, ctx, draftId),
    ),
  });
}

function renderRouteRow(route) {
  return h(
    'div',
    { class: 'intake-route-row' },
    h('div', { class: 'intake-route-main' },
      h('span', { class: 'intake-route-rule muted tiny' }, route.ruleId),
      h('strong', { class: 'small' }, route.label),
      route.privacyNotice ? h('p', { class: 'tiny text-warn' }, route.privacyNotice) : null,
      route.note ? h('p', { class: 'muted tiny' }, route.note) : null,
    ),
    h('div', { class: 'intake-route-side' },
      badge(route.confidence, BAND_TONE[route.confidence] || 'neutral'),
      route.autoCreatable ? badge('auto on confirm', 'good') : badge('manual only', 'caution'),
      h('a', { class: 'btn btn-tiny btn-ghost', href: route.route }, route.module),
    ),
  );
}

function renderActionButtons(analysis, ctx, draftId = null) {
  const openCaseReview = (persistedDraftId) => {
    const prefill = toCaseInput(analysis);
    openCaseDialog(ctx, {
      prefill: {
        ...prefill,
        title: analysis.suggestedTitle,
        summary: workbench.text || analysis.caseSuggestion?.summary || '',
      },
      onSaved: (res) => {
        if (res?.ok && persistedDraftId) {
          const marked = ctx.api.markIntakeDraftRouted(persistedDraftId, { caseId: res.id, caseInput: prefill });
          if (!marked.ok) toast(marked.error, 'bad');
        }
        toast(`Case registered — ${(res.propagations || []).length} cross-module update(s) propagated`, 'good');
        ctx.refresh();
      },
    });
  };

  return h('div', { class: 'intake-actions' },
    h('button', {
      class: 'btn btn-primary',
      type: 'button',
      'data-testid': 'intake-review-case',
      onClick: () => {
        if (draftId) {
          openCaseReview(draftId);
          return;
        }
        const saved = ctx.api.saveIntakeDraft(workbench.text);
        if (!saved.ok) {
          toast(saved.error || 'The triage could not be saved.', 'bad');
          return;
        }
        openCaseReview(saved.id);
      },
    }, 'Review & create case'),
    h('button', {
      class: 'btn', type: 'button', 'data-testid': 'intake-rehearse-response',
      onClick: () => {
        const persisted = draftId ? { ok: true, id: draftId } : ctx.api.saveIntakeDraft(workbench.text);
        if (!persisted.ok) { toast(persisted.error || 'The triage could not be saved.', 'bad'); return; }
        ctx.navigate(`#/responses?draft=${encodeURIComponent(persisted.id)}`);
      },
    }, 'Rehearse coordinated response'),
    h('button', {
      class: 'btn btn-ghost',
      type: 'button',
      'data-testid': 'intake-save-draft',
      onClick: () => {
        const res = ctx.api.saveIntakeDraft(workbench.text);
        if (!res.ok) {
          toast(res.error || 'The triage could not be saved.', 'bad');
          return;
        }
        toast('Triage saved to your drafts queue', 'good');
        ctx.refresh();
      },
    }, 'Save for later'),
  );
}

function renderWorkbench(ctx) {
  const analysis = workbench.analysis;
  return h('div', { class: 'stack-lg' },
    banner({
      tone: 'info',
      title: 'On-device triage — your text never leaves this browser',
      body: 'Classification, entity extraction and confidence scoring run in a pure local engine with no network calls. Conflict and pulse content is never auto-linked. Confidence bands are heuristic until the calibration ledger has enough confirmed drafts to measure agreement.',
    }),
    card({
      title: 'Describe the situation',
      subtitle: 'Paste a message, email, meeting note or voice-to-text dump. Aim for what happened, who is involved, and what is at stake.',
      body: h('div', { class: 'stack-md' },
        h('textarea', {
          class: 'intake-composer',
          rows: 7,
          placeholder: 'e.g. The supplier migration slipped again — Priya says the vendor is three weeks late, the penalty clause is worth about DKK 250.000, and the support pod is overloaded…',
          'data-testid': 'intake-composer',
          value: workbench.text,
          'aria-label': 'Situation note for natural-language triage',
          onInput: (event) => { workbench.text = event.target.value; },
        }),
        h('div', { class: 'intake-example-row' },
          h('span', { class: 'muted tiny' }, 'Try an example:'),
          ...EXAMPLES.map((ex) => h('button', {
            class: 'btn btn-tiny btn-ghost',
            type: 'button',
            onClick: () => {
              workbench.text = ex.text;
              workbench.analysis = null;
              ctx.refresh();
              const ta = document.querySelector('[data-testid="intake-composer"]');
              if (ta) ta.value = ex.text;
            },
          }, ex.label)),
        ),
        h('div', { class: 'intake-composer-actions' },
          h('button', {
            class: 'btn btn-primary',
            type: 'button',
            'data-testid': 'intake-analyze',
            onClick: () => {
              const text = workbench.text.trim();
              if (!text) {
                toast('Describe the situation before running triage.', 'bad');
                return;
              }
              workbench.analysis = analyzeIntakeText(text, ctx.state, { now: ctx.now });
              ctx.refresh();
            },
          }, 'Analyze with LeadOS triage'),
          workbench.analysis ? h('button', {
            class: 'btn btn-ghost',
            type: 'button',
            onClick: () => { workbench.analysis = null; ctx.refresh(); },
          }, 'Clear analysis') : null,
        ),
      ),
    }),
    analysis ? renderAnalysis(ctx, analysis) : renderEmptyAnalysis(),
  );
}

function renderEmptyAnalysis() {
  return card({
    body: emptyState({
      icon: '⌖',
      title: 'The triage engine is waiting',
      body: 'LeadOS will classify the situation across fourteen operational categories, extract people, money, dates and recurrence, score its confidence with full evidence, and prepare a human-confirmed routing plan into the operational case engine.',
    }),
  });
}

function renderAnalysis(ctx, analysis, draftId = null) {
  workbench.analysis = analysis;
  return h('div', { class: 'stack-lg', 'data-testid': 'intake-analysis' },
    h('div', { class: 'stat-row' },
      stat({ label: 'Verdict', value: BAND_LABEL[analysis.confidenceBand] || analysis.verdict, tone: BAND_TONE[analysis.confidenceBand] || '' }),
      stat({ label: 'Primary category', value: analysis.categories[0]?.label.split(' &')[0] || '—', hint: `margin ${Math.round(analysis.margin * 100)}%` }),
      stat({ label: 'Evidence weight', value: analysis.totalEvidenceWeight, hint: `${analysis.meaningfulTokenCount} meaningful tokens` }),
      stat({ label: 'Entities found', value: countEntities(analysis), hint: analysis.stakesReviewRequired ? 'mandatory review' : 'see breakdown below' }),
    ),
    renderVerdictBanner(analysis),
    renderCategoryPanel(analysis),
    card({
      title: 'Extracted entities',
      subtitle: 'Every extraction shows the exact source span. Ambiguous names and assumed currencies are never silently accepted.',
      body: renderEntities(analysis, ctx),
    }),
    renderSuggestionPanel(analysis, ctx, draftId),
  );
}

function countEntities(analysis) {
  const e = analysis.entities;
  return e.money.length + e.durations.length + e.percents.length + e.people.length
    + e.peopleAmbiguities.length + e.recurrence.length + e.severitySignals.length + e.weekdays.length;
}

/** Accessible dismiss dialog (no blocking window.prompt). */
function openDismissDialog(ctx, draftId) {
  const reasonInput = h('textarea', { class: 'intake-composer', rows: 3, placeholder: 'Why is this triage not worth routing? (optional)', 'aria-label': 'Dismiss reason' });
  const dialog = openModal({
    title: 'Dismiss this triage?',
    description: 'The analysis stays in the ledger as a dismissed draft, which teaches the calibration report. No operational record is created.',
    body: reasonInput,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const res = ctx.api.dismissIntakeDraft(draftId, reasonInput.value);
          dialog.close();
          if (res.ok) { toast('Triage dismissed', 'neutral'); ctx.refresh(); }
          else toast(res.error, 'bad');
        },
      }, 'Dismiss triage'),
    ],
    size: 'sm',
  });
}

/* ------------------------------------------------------------- drafts queue */

function renderDrafts(ctx) {
  const drafts = pendingIntakeDrafts(ctx.state, ctx.now);
  const allDrafts = (ctx.state.intakeDrafts || []).slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const calibration = intakeCalibration(ctx.state);

  const bandCard = (band) => h('div', { class: 'intake-cal-band' },
    h('strong', null, band.band),
    h('span', { class: 'muted tiny' }, band.countsOnly
      ? `${band.n} confirmed — counts only below n=${CALIBRATION_MIN_SAMPLES}`
      : `${band.n} confirmed · ${Math.round(band.agreementRate * 100)}% agreement`),
  );

  const calibrationCard = card({
    title: 'Calibration ledger (RULE-INTAKE-07)',
    subtitle: `Measured construct: ${calibration.measuredConstruct}. Agreement means the human confirmed the engine's top-1 suggestion; it is not claimed to be ground-truth accuracy.`,
    body: h('div', { class: 'stack-md' },
      h('div', { class: 'stat-row' },
        stat({ label: 'Confirmed', value: calibration.totalConfirmed }),
        stat({ label: 'Pending', value: calibration.pending, tone: calibration.pending ? 'warn' : '' }),
        stat({ label: 'Dismissed', value: calibration.dismissed }),
        stat({
          label: 'Entity agreement',
          value: calibration.entityCountsOnly ? 'Building' : `${Math.round(calibration.entityAgreementRate * 100)}%`,
          hint: calibration.entityCountsOnly ? `${calibration.entitySuggestions.offered} offered — floor n=${CALIBRATION_MIN_SAMPLES}` : `${calibration.entitySuggestions.accepted}/${calibration.entitySuggestions.offered} accepted`,
        }),
      ),
      h('div', { class: 'intake-cal-bands' }, ...calibration.bands.map(bandCard)),
      h('p', { class: 'muted tiny' }, `Engine versions in ledger: ${calibration.engineVersions.join(', ') || 'none yet'}`),
    ),
  });

  if (!allDrafts.length) {
    return h('div', { class: 'stack-lg' }, calibrationCard, card({
      body: emptyState({
        icon: '⌖',
        title: 'No triage drafts yet',
        body: 'Run a triage from the Triage tab and save it for later, or confirm it straight into an operational case.',
        action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => ctx.navigate('#/intake') }, 'New triage'),
      }),
    }));
  }

  const statusBadge = (draft) => {
    if (draft.status === 'confirmed') return badge('confirmed', 'good');
    if (draft.status === 'dismissed') return badge('dismissed', 'neutral');
    return draft.stale ? badge('stale', 'bad') : badge('pending', 'caution');
  };

  const rows = allDrafts.map((draft) => {
    const a = draft.analysis || {};
    const pending = draft.status === 'analyzed';
    return h('article', {
      class: `intake-draft-row ${draft.stale && pending ? 'is-stale' : ''}`,
      'data-testid': `intake-draft-${draft.id}`,
    },
      h('div', { class: 'intake-draft-main' },
        h('div', { class: 'intake-draft-head' },
          statusBadge(draft),
          h('strong', { class: 'small' }, a.suggestedTitle || draft.sourceText.slice(0, 80)),
          h('span', { class: 'muted tiny' }, `${formatDate(draft.createdAt)} · ${a.engineVersion || draft.engineVersion}`),
        ),
        h('p', { class: 'muted tiny intake-draft-text' }, draft.sourceText.slice(0, 220)),
        h('div', { class: 'intake-draft-meta' },
          a.primaryCategoryId ? badge(String(a.categories?.find((c) => c.id === a.primaryCategoryId)?.label || a.primaryCategoryId), 'neutral') : null,
          a.confidenceBand ? badge(BAND_LABEL[a.confidenceBand] || a.confidenceBand, BAND_TONE[a.confidenceBand] || 'neutral') : null,
          a.stakesReviewRequired ? badge('mandatory review', 'bad') : null,
          draft.status === 'confirmed' && draft.confirmedCaseId
            ? h('a', { class: 'btn btn-tiny btn-ghost', href: `#/cases/${draft.confirmedCaseId}` }, 'Open case')
            : null,
          draft.outcomes?.editedFields?.length
            ? h('span', { class: 'muted tiny' }, `Edited: ${draft.outcomes.editedFields.join(', ')}`)
            : null,
          draft.status === 'dismissed' && draft.dismissReason
            ? h('span', { class: 'muted tiny' }, `Reason: ${draft.dismissReason}`)
            : null,
        ),
      ),
      pending ? h('div', { class: 'intake-draft-actions' },
        h('button', {
          class: 'btn btn-small btn-primary',
          type: 'button',
          'data-testid': `intake-open-${draft.id}`,
          onClick: () => {
            workbench.text = draft.sourceText;
            workbench.analysis = draft.analysis;
            ctx.navigate(`#/intake?tab=review&id=${draft.id}`);
          },
        }, 'Review'),
        h('button', {
          class: 'btn btn-small btn-ghost',
          type: 'button',
          onClick: () => openDismissDialog(ctx, draft.id),
        }, 'Dismiss'),
        h('button', {
          class: 'btn btn-small btn-ghost btn-danger-text',
          type: 'button',
          onClick: async () => {
            const ok = await confirmDialog({
              title: 'Delete this triage draft?',
              message: 'The source text and its analysis are removed. Any case already created from it is untouched.',
              confirmLabel: 'Delete draft',
              danger: true,
            });
            if (ok) {
              const res = ctx.api.deleteIntakeDraft(draft.id);
              if (res.ok) { toast('Draft deleted', 'neutral'); ctx.refresh(); }
              else toast(res.error, 'bad');
            }
          },
        }, 'Delete'),
      ) : null,
    );
  });

  return h('div', { class: 'stack-lg' },
    calibrationCard,
    card({
      title: `Triage ledger (${allDrafts.length})`,
      subtitle: `${drafts.length} pending routing decision(s). Drafts older than three days surface on Today and in Signals (RULE-INTAKE-06).`,
      body: h('div', { class: 'stack-md' }, ...rows),
    }),
  );
}

/* ------------------------------------------------------------------- entry */

export function renderIntake(ctx) {
  const tab = ctx.query?.get('tab') || 'triage';
  const reviewId = ctx.query?.get('id') || null;
  const header = pageHeader({
    eyebrow: 'Natural-language intake',
    title: 'Intake triage terminal',
    subtitle: 'Free-form situation note → confidence-scored, evidence-explained, human-confirmed routing across LeadOS.',
    actions: [
      h('a', { class: 'btn btn-ghost', href: '#/cases' }, 'All cases'),
    ],
  });

  const tabBar = tabs({
    ariaLabel: 'Intake sections',
    active: tab === 'drafts' ? 'drafts' : tab === 'review' ? 'review' : 'triage',
    items: [
      { key: 'triage', label: 'New triage', count: undefined },
      { key: 'review', label: 'Review draft' },
      { key: 'drafts', label: 'Drafts & calibration', count: pendingIntakeDrafts(ctx.state, ctx.now).length || undefined },
    ],
    onSelect: (key) => ctx.navigate(key === 'triage' ? '#/intake' : `#/intake?tab=${key}`),
  });

  let body;
  if (tab === 'drafts') {
    body = renderDrafts(ctx);
  } else if (tab === 'review' && reviewId) {
    const draft = (ctx.state.intakeDrafts || []).find((d) => d.id === reviewId);
    if (!draft || draft.status !== 'analyzed' || !draft.analysis) {
      body = card({ body: emptyState({ title: 'Draft not found', body: 'It may have been confirmed, dismissed or deleted.', action: h('a', { class: 'btn btn-primary', href: '#/intake?tab=drafts' }, 'Open drafts') }) });
    } else {
      workbench.text = draft.sourceText;
      body = renderAnalysis(ctx, draft.analysis, draft.id);
    }
  } else {
    body = renderWorkbench(ctx);
  }

  return h('div', { class: 'page page-intake' }, header, tabBar, body);
}
