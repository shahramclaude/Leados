/**
 * app/ui/forecast-modals.js — leader response to an outside-view challenge.
 *
 * The dialog deliberately never offers an "edit estimate" field. The recorded
 * forecast is evidence of what was believed at commitment time; changing it
 * would destroy the very calibration record the band is computed from. The
 * leader can accept, adapt or dismiss the outside view with a written reason.
 */

import { h, openModal, toast } from './dom.js';
import { FORECAST_CHALLENGE_LABELS } from '../core/domain/forecastIntegrity.js';

const RESPONSE_HELP = {
  accepted: 'Use the reference-class central estimate as the planning assumption for this commitment. The source estimate stays unchanged.',
  adapted: 'Use part of the outside view, with your own case-specific evidence written into the note. The band remains visible.',
  dismissed: 'Keep the recorded estimate. A short written reason is required so the next review can see why the outside view was rejected.',
};

export function openForecastChallengeDialog(ctx, challenge, onSaved = null) {
  if (!challenge) return null;
  const select = h(
    'select',
    { id: 'forecast-response', name: 'response', 'aria-label': 'Response to outside-view challenge' },
    ...['accepted', 'adapted', 'dismissed'].map((value) =>
      h('option', { value }, FORECAST_CHALLENGE_LABELS[value])),
  );
  select.value = 'accepted';
  const note = h('textarea', {
    id: 'forecast-response-note',
    name: 'note',
    rows: 4,
    placeholder: 'What did you decide, and what evidence makes this class comparable (or not)?',
    'aria-label': 'Written rationale for this response',
  });
  const help = h('p', { class: 'muted small', id: 'forecast-response-help' }, RESPONSE_HELP.accepted);
  select.addEventListener('change', () => { help.textContent = RESPONSE_HELP[select.value] || ''; });
  const error = h('p', { class: 'field-error', id: 'forecast-response-error', role: 'alert' });

  const form = h(
    'form',
    { class: 'form', novalidate: true },
    h('div', { class: 'field' },
      h('label', { class: 'field-label', for: 'forecast-response' }, 'Your response'),
      select,
      help,
    ),
    h('div', { class: 'field field-wide' },
      h('label', { class: 'field-label', for: 'forecast-response-note' }, 'Written rationale'),
      note,
    ),
    error,
  );

  const dialog = openModal({
    title: `Outside view · ${challenge.title}`,
    description: `Recorded ${formatNumber(challenge.recordedForecast)} ${challenge.unit || ''} · reference-class central ${formatNumber(challenge.referenceClassCentral)} · ${Math.round((challenge.coverageTarget || 0.8) * 100)}% band ${formatNumber(challenge.bandLow)}–${formatNumber(challenge.bandHigh)} ${challenge.unit || ''}.`,
    body: h('div', { class: 'stack-md' },
      h('p', { class: 'muted small' }, 'The band is distribution-free and assumes future outcomes are exchangeable with the settled class. It is a planning range, not a guarantee, a performance rating, or a rewritten estimate.'),
      form,
    ),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const result = ctx.api.respondForecastChallenge(challenge.id, {
            response: select.value,
            note: note.value,
          });
          if (!result.ok) {
            error.textContent = result.error || 'The response could not be saved.';
            note.setAttribute('aria-invalid', result.field === 'note' ? 'true' : 'false');
            return;
          }
          dialog.close();
          toast('Forecast challenge response recorded — the source estimate is unchanged', 'good');
          if (typeof onSaved === 'function') onSaved(result);
          else ctx.refresh();
        },
      }, 'Save response'),
    ],
    size: 'md',
  });
  return dialog;
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n);
}
