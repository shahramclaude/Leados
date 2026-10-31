/**
 * app/ui/integrity-modals.js — the three dialogs of the Signal Integrity Board
 * (Schema v70).
 *
 *   openVerdictDialog      judge one surfaced signal with the same four words
 *                          the early-warning ledger uses
 *   openDeclarePlanDialog  declare α, the look plan, the spending function and
 *                          the dependence convention — with a live preview of
 *                          the bar each of those choices produces
 *   openFreezeReviewDialog freeze the state of the budget plus exactly one
 *                          prospective claim, with the probability shown before
 *                          it is committed
 *
 * Every dialog previews the arithmetic before the write, because these are
 * declarations about how much error the leader is prepared to tolerate, and a
 * declaration made blind is a number nobody chose.
 */

import { h, toast, openModal } from './dom.js';
import { addDays, dayKey } from '../core/time.js';
import {
  SIGNAL_VERDICT_LABELS,
  SIGNAL_VERDICTS,
} from '../core/domain/integrityRegistry.js';
import {
  effectiveTests,
  integrityConventions,
  integrityReport,
  lookBoundary,
} from '../core/domain/integrity.js';

function field(id, label, control, hint = null) {
  return h('div', { class: 'stack-xs' },
    h('label', { for: id }, label),
    control,
    hint ? h('span', { class: 'muted small' }, hint) : null);
}

const fmtP = (v) => {
  if (!Number.isFinite(Number(v))) return '—';
  const n = Number(v);
  if (n <= 0) return 'unreachable';
  if (n < 1e-4) return n.toExponential(2);
  return n.toFixed(5);
};

/* ------------------------------------------------------------------ verdict */

export function openVerdictDialog(ctx, finding) {
  const options = SIGNAL_VERDICTS.map((verdict) => {
    const inputId = `verdict-${verdict}`;
    return h('div', { class: 'stack-xs' },
      h('label', { class: 'row gap-xs', for: inputId },
        h('input', {
          type: 'radio',
          name: 'signal-verdict',
          id: inputId,
          value: verdict,
          ...(verdict === 'confirmed' ? { checked: true } : {}),
        }),
        h('span', null, SIGNAL_VERDICT_LABELS[verdict])),
      h('span', { class: 'muted small' }, verdict === 'false-alarm'
        ? 'Counts against the detector. The strongest verdict there is: it takes courage and it is the only one that improves the suite.'
        : verdict === 'confirmed'
          ? 'Counts for detection precision and for actionable precision.'
          : 'Counts for detection precision only — the signal was real, so it was not noise.'));
  });

  const note = h('input', {
    id: 'verdict-note',
    type: 'text',
    maxlength: '300',
    placeholder: 'What made you say so (optional, stored without names)',
  });

  const modal = openModal({
    title: `Judge “${finding.title}”`,
    description: `${finding.ruleId} · ${finding.domain} · severity ${finding.severity}. A verdict is about the rule, never about a person: it is stored against a de-identified digest and no name enters the ledger.`,
    body: h('div', { class: 'stack' },
      h('p', { class: 'muted small' }, finding.detail),
      h('div', { class: 'stack' }, ...options),
      field('verdict-note', 'Note', note)),
    footer: [
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const checked = modal.dialog.querySelector('input[name="signal-verdict"]:checked');
          const verdict = checked ? checked.value : '';
          const result = ctx.api.recordSignalVerdict({
            domain: finding.domain,
            ruleId: finding.ruleId,
            title: finding.title,
            personId: finding.personId || '',
            severity: finding.severity,
            verdict,
            note: note.value,
          });
          if (result && result.ok) {
            modal.close();
            toast('Verdict recorded. The family’s precision has been re-scored.', 'good');
          } else {
            toast((result && result.error) || 'Could not record the verdict.', 'bad');
          }
        },
      }, 'Record the verdict'),
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => modal.close() }, 'Cancel'),
    ],
  });
}

/* -------------------------------------------------------------------- plan */

export function openDeclarePlanDialog(ctx) {
  const conventions = integrityConventions(ctx.state.settings || {});
  const report = integrityReport(ctx.state, ctx.now, ctx.state.settings || {});

  const alpha = h('input', {
    id: 'int-alpha', type: 'number', min: '1', max: '50', step: '1', value: String(conventions.alphaPct),
  });
  const looks = h('input', {
    id: 'int-looks', type: 'number', min: '2', max: '260', step: '1', value: String(conventions.plannedLooks),
  });
  const spending = h('select', { id: 'int-spending' },
    h('option', { value: 'pocock', ...(conventions.spending === 'pocock' ? { selected: true } : {}) }, 'Pocock-like — a roughly constant bar at every look'),
    h('option', { value: 'obf', ...(conventions.spending === 'obf' ? { selected: true } : {}) }, 'O’Brien–Fleming-like — very strict early, almost nothing held back late'));
  const rho = h('input', {
    id: 'int-rho', type: 'number', min: '0', max: '90', step: '5', value: String(conventions.rhoPct),
  });
  const floor = h('input', {
    id: 'int-floor', type: 'number', min: '20', max: '95', step: '5', value: String(conventions.precisionFloorPct),
  });
  const minVerdicts = h('input', {
    id: 'int-verdicts', type: 'number', min: '2', max: '40', step: '1', value: String(conventions.minVerdicts),
  });
  const horizon = h('input', {
    id: 'int-horizon', type: 'number', min: '1', max: '40', step: '1', value: String(conventions.horizonAlerts),
  });
  const preview = h('div', { class: 'stack-xs' });
  const seriesTested = report.looks.seriesTested || 0;

  function renderPreview() {
    const a = Number(alpha.value) / 100;
    const k = Number(looks.value);
    const r = Number(rho.value) / 100;
    const mEff = effectiveTests(seriesTested || 1, r);
    preview.replaceChildren();
    if (!Number.isFinite(a) || a <= 0 || !Number.isFinite(k) || k < 2) {
      preview.appendChild(h('p', { class: 'muted' }, 'Enter a whole α between 1% and 50% and at least two looks.'));
      return;
    }
    const first = lookBoundary({ spending: spending.value, alpha: a, plannedLooks: k, lookIndex: 1, mEff });
    const mid = lookBoundary({
      spending: spending.value, alpha: a, plannedLooks: k, lookIndex: Math.max(1, Math.round(k / 2)), mEff,
    });
    const last = lookBoundary({ spending: spending.value, alpha: a, plannedLooks: k, lookIndex: k, mEff });
    preview.appendChild(h('p', { class: 'muted small' },
      `At ${seriesTested || 'no recorded'} series (m_eff ${mEff} at a declared ρ of ${(Number(rho.value) || 0).toFixed(0)}%), this plan's per-test bar would be:`));
    preview.appendChild(h('ul', { class: 'evidence-list' },
      h('li', null, `Look 1 — p < ${fmtP(first.perTestThreshold)} (z ${first.zBoundary ?? 'unreachable'})`),
      h('li', null, `Look ${Math.max(1, Math.round(k / 2))} — p < ${fmtP(mid.perTestThreshold)} (z ${mid.zBoundary ?? 'unreachable'})`),
      h('li', null, `Look ${k} — p < ${fmtP(last.perTestThreshold)} (z ${last.zBoundary ?? 'unreachable'})`)));
    if (first.effectivelyUnreachable) {
      preview.appendChild(h('p', { class: 'muted small' },
        'The first boundary is effectively unreachable at this look count. That is the O’Brien–Fleming trade-off working as designed: it protects the final look by making early stopping nearly impossible. A Pocock-like plan is the honest default for a weekly habit.'));
    }
  }

  for (const control of [alpha, looks, spending, rho]) {
    control.addEventListener('input', renderPreview);
    control.addEventListener('change', renderPreview);
  }
  renderPreview();

  const dialog = openModal({
    title: 'Declare the monitoring plan',
    description: 'Four numbers decide what this Board can tell you. They are declarations about tolerable error, not preferences — the Board will hold you to them in the arithmetic.',
    body: h('div', { class: 'stack' },
      field('int-alpha', 'Family-wise α (%)', alpha,
        'The chance of at least one false alert across the whole plan. 10% is the common default; 5% is stricter and makes every bar harder to clear.'),
      field('int-looks', 'Planned looks', looks,
        'How many times you intend to look across the programme. Twelve is one weekly look per quarter. More looks means a stricter bar at each.'),
      field('int-spending', 'Spending function', spending,
        'How α is shared across the looks. Both are standard Lan–DeMets functions; neither is "more correct".'),
      field('int-rho', 'Declared dependence ρ (%)', rho,
        'Your detectors read overlapping records, so Bonferroni over-counts independent tests. This is a declared convention — the Board never estimates it from your data.'),
      field('int-floor', 'Actionable-precision floor (%)', floor,
        'The share of judged signals that should be worth acting on. A family is called over-claiming only when the upper end of its interval falls below this.'),
      field('int-verdicts', 'Minimum verdicts before scoring', minVerdicts,
        'Below this, counts are printed and no precision is claimed.'),
      field('int-horizon', 'Review horizon (signals)', horizon,
        'The number of upcoming signals a frozen review makes its claim about.'),
      preview),
    footer: [
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const result = ctx.api.declareIntegrityPlan({
            integrityAlphaPct: alpha.value,
            integrityPlannedLooks: looks.value,
            integritySpending: spending.value,
            integrityRhoPct: rho.value,
            integrityPrecisionFloorPct: floor.value,
            integrityMinVerdicts: minVerdicts.value,
            integrityHorizonAlerts: horizon.value,
          });
          if (result && result.ok) {
            dialog.close();
            toast('Monitoring plan declared. Every bar on this page has been recomputed.', 'good');
          } else {
            toast((result && result.error) || 'Could not declare the plan.', 'bad');
          }
        },
      }, 'Declare the plan'),
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
    ],
  });
}

/* ------------------------------------------------------------------ freeze */

export function openFreezeReviewDialog(ctx) {
  const report = integrityReport(ctx.state, ctx.now, ctx.state.settings || {});
  const today = dayKey(ctx.now);
  const pooled = report.precision.pooled;

  const label = h('input', {
    id: 'int-label', type: 'text', maxlength: '200', value: `Signal integrity review — ${today}`,
  });
  const reviewOn = h('input', { id: 'int-review', type: 'date', value: addDays(today, 28) });
  const horizon = h('input', {
    id: 'int-horizon', type: 'number', min: '1', max: '40', step: '1',
    value: String(report.conventions.horizonAlerts),
  });
  const preview = h('div', { class: 'stack-xs' });

  function renderPreview() {
    preview.replaceChildren();
    if (!pooled.n) {
      preview.appendChild(h('p', { class: 'muted' },
        'There are no verdicts, so there is no false-alarm rate to freeze a claim from. The freeze will be refused rather than writing a guess with a date on it.'));
      return;
    }
    const fdr = (pooled.falseAlarmPct || 0) / 100;
    const hz = Math.max(1, Number(horizon.value) || report.conventions.horizonAlerts);
    const predicted = 1 - (1 - fdr) ** hz;
    preview.appendChild(h('p', { class: 'muted small' },
      `From ${pooled.n} verdict(s), ${pooled.falseAlarmPct}% were noise (Wilson 95% ${pooled.detectionLoPct === null ? '—' : (100 - pooled.detectionHiPct).toFixed(1)}–${pooled.detectionHiPct === null ? '—' : (100 - pooled.detectionLoPct).toFixed(1)}%). `,
      'The frozen claim would be: ',
      h('strong', null, `${(predicted * 100).toFixed(2)}%`),
      ` chance of at least one false alarm among the next ${hz} surfaced signal(s).`));
    preview.appendChild(h('p', { class: 'muted small' },
      'Grading waits until the review date, counts only verdicts recorded after this freeze, and is withheld entirely if none lands — an ungraded forecast is more honest than an invented outcome.'));
  }

  horizon.addEventListener('input', renderPreview);
  renderPreview();

  const dialog = openModal({
    title: 'Freeze a signal-integrity review',
    description: 'Freezing records the state of the error budget today and exactly one prospective claim. It cannot be edited afterwards; that is what makes the grade worth anything.',
    body: h('div', { class: 'stack' },
      field('int-label', 'Label', label),
      field('int-review', 'Review on', reviewOn, 'The day the claim is settled. It must be in the future.'),
      field('int-horizon', 'Horizon (signals)', horizon),
      preview),
    footer: [
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const result = ctx.api.freezeIntegrityReview({
            label: label.value,
            reviewOn: reviewOn.value,
            horizonAlerts: horizon.value,
          });
          if (result && result.ok) {
            dialog.close();
            toast(`Frozen: ${result.record.predictedAnyFalseAlarmPct}% chance of at least one false alarm in the next ${result.record.horizonAlerts}.`, 'good');
            ctx.navigate('#/integrity?panel=ledger');
          } else {
            toast((result && result.error) || 'Could not freeze the review.', 'bad');
          }
        },
      }, 'Freeze the review'),
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
    ],
  });
}
