/**
 * app/ui/confidence-modals.js — the two dialogs of the Confidence Transport
 * terminal (Schema v72).
 *
 *   openCertificateDialog        freeze the current instrument, previewed before
 *                               the write, to be graded prospectively
 *   openConfidenceConventionsDialog
 *                               the declared conventions, each refused outside
 *                               its band rather than silently clamped
 *
 * Neither dialog can change a declared probability. That is deliberate: the only
 * way a number on a record moves is the leader editing that record.
 */

import { h, toast, openModal } from './dom.js';
import { addDays } from '../core/time.js';
import { CONFIDENCE_MAP_LABELS } from '../core/domain/confidenceRegistry.js';

function field(id, label, control, hint = null) {
  return h('div', { class: 'stack-xs' },
    h('label', { for: id }, label),
    control,
    hint ? h('span', { class: 'muted small' }, hint) : null);
}

const num = (v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : String(v));

/* ----------------------------------------------------------- certificate */

export function openCertificateDialog(ctx, report, preset = {}) {
  const available = report && report.verdict === 'supported' && report.chosen !== 'identity';
  if (!available) {
    toast(report && report.verdict === 'insufficient'
      ? 'This record cannot identify a map yet — settle more forecasts first.'
      : 'Transport is not supported on this record, so there is nothing to certify.', 'neutral');
    return null;
  }
  const open = (ctx.state.confidenceCertificates || []).find((cert) => cert && !cert.graded && !cert.lapsedOn);
  const summary = h('div', { class: 'callout stack-xs', 'aria-live': 'polite' },
    h('strong', null, `${CONFIDENCE_MAP_LABELS[report.chosen]} — Brier ${num(report.race.models.find((m) => m.key === report.chosen)?.brier)} against ${num(report.race.models[0].brier)} for the numbers as written`),
    h('span', { class: 'muted small' },
      `${report.race.scored} out-of-sample settlements. Paired 90% interval ${report.verdicts.interval ? `${report.verdicts.interval.lo} to ${report.verdicts.interval.hi}` : 'unavailable'}. `
      + `Materiality ${Math.round(report.conventions.materialBrier * 10000) / 100} Brier points. The certificate is graded once, on the forecasts that resolve inside its window.`),
    open
      ? h('span', { class: 'muted small' }, `One certificate is already open (${open.issuedOn} → ${open.reviewOn}). Freezing another would test the same claim twice; the terminal will still record it.`)
      : null,
  );
  const reviewOn = h('input', {
    id: 'cft-review',
    type: 'date',
    value: preset.reviewOn || addDays(report.today, report.conventions.reviewDays),
  });
  const label = h('input', {
    id: 'cft-label',
    type: 'text',
    maxlength: '120',
    value: preset.label || '',
    placeholder: `Instrument certificate — ${report.chosen}`,
  });
  const modal = openModal({
    title: 'Freeze a calibration certificate',
    description: 'A certificate fixes the map, its parameters and the scores that justified it, then grades the transported reading against the declared one on whatever resolves inside the window. It is the only prospective test this terminal has.',
    body: h('div', { class: 'stack' },
      summary,
      field('cft-label', 'Label', label, 'Optional. It appears on the ledger and nowhere in exports.'),
      field('cft-review', 'Review day', reviewOn, 'Must be after today. The first forecasts that resolve inside the window are the test.')),
    footer: [
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const result = ctx.api.freezeConfidenceCertificate({
            reviewOn: reviewOn.value,
            label: label.value,
          });
          if (result && result.ok) {
            modal.close();
            toast('Certificate frozen. It will be graded against what resolves inside its window.', 'good');
          } else {
            toast((result && result.error) || 'Could not freeze the certificate.', 'bad');
          }
        },
      }, 'Freeze certificate'),
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => modal.close() }, 'Cancel'),
    ],
  });
  return modal;
}

/* ----------------------------------------------------------- conventions */

const CONVENTION_FIELDS = [
  ['confidenceMinSamples', 'Settled forecasts before a map is fitted', 8, 400, 'minSamples'],
  ['confidenceMinTrain', 'Prequential warm-up (settlements)', 4, 200, 'minTrain'],
  ['confidenceMinScored', 'Out-of-sample settlements before a verdict', 6, 400, 'minScored'],
  ['confidenceMaterialBrierPct', 'Material gain required (×0.01 Brier points)', 0, 500, 'materialBrier'],
  ['confidenceGapPct', 'Gap that flags an open declaration (points)', 5, 40, 'gapPct'],
  ['confidenceReviewDays', 'Certificate window (days)', 7, 180, 'reviewDays'],
  ['confidenceSkillFloor', 'Graded certificates before skill is scored', 2, 40, 'skillFloor'],
  ['confidenceShortDays', 'Short-horizon cut-off (days)', 3, 60, 'shortDays'],
  ['confidenceLongDays', 'Long-horizon cut-off (days)', 30, 365, 'longDays'],
  ['confidenceBins', 'Reliability bins', 3, 20, 'bins'],
  ['confidenceLiveCap', 'Live readings shown per module', 1, 20, 'liveCap'],
  ['confidenceTaskCap', 'Readings listed in one flagged task', 1, 20, 'taskCap'],
];

export function openConfidenceConventionsDialog(ctx, conventions) {
  const inputs = CONVENTION_FIELDS.map(([key, labelText, min, max, prop]) => {
    const value = key === 'confidenceMaterialBrierPct' ? conventions.materialBrier * 10000 : conventions[prop];
    const input = h('input', { id: `cft-conv-${key}`, type: 'number', min: String(min), max: String(max), step: '1', value: String(Math.round(value * 100) / 100) });
    return { key, label: labelText, min, max, input };
  });
  const auto = h('input', { type: 'checkbox', id: 'cft-conv-auto', ...(conventions.autoPropagate ? { checked: true } : {}) });
  const modal = openModal({
    title: 'Confidence transport conventions',
    description: 'Each is a claim about how much evidence you require before a map is allowed to speak. A value outside its band is refused, never quietly clamped.',
    body: h('div', { class: 'stack' },
      ...inputs.map((row) => field(row.input.id, row.label, row.input, `${row.min}–${row.max}`)),
      h('label', { class: 'cre-inline', for: 'cft-conv-auto' }, auto, h('span', null, 'Certify and flag automatically when the evidence arrives (off: explicit scans only)'))),
    footer: [
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const payload = { confidenceAutoPropagate: auto.checked };
          for (const row of inputs) payload[row.key] = row.input.value;
          const result = ctx.api.setConfidenceConventions(payload);
          if (result && result.ok) {
            modal.close();
            toast('Conventions saved.', 'good');
          } else {
            toast((result && result.error) || 'Could not save the conventions.', 'bad');
          }
        },
      }, 'Save'),
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => modal.close() }, 'Cancel'),
    ],
  });
  return modal;
}
