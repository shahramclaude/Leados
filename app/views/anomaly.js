/**
 * app/views/anomaly.js — Predictive Anomaly Intelligence (`#/anomaly`).
 *
 * Renders the predictive intelligence terminal: XmR control charts,
 * calibrated prediction windows, severity-rated recommendations, and
 * auto-generated board briefs — all derived from the pure anomaly engine.
 */

import { h, toast } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, progressBar, emptyState } from '../ui/components.js';
import { formatDate } from '../core/time.js';
import { assessAnomaly, generateBoardBrief, extractModuleSeries, ANOMALY_ENGINE_VERSION, ANOMALY_RULE_ID } from '../core/domain/anomaly.js';

function nf(n) { return (Number.isFinite(Number(n)) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(n)) : '—'); }

export function renderAnomaly(ctx) {
  const state = ctx?.store?.getState ? ctx.store.getState() : (ctx.state || {});
  // Pull recent series from cases / decisions / delegations approximated from store
  const series = extractModuleSeries(state, 'openCases');
  const assessment = (series && series.length >= 4) ? assessAnomaly(series, { label: 'Cross-module operational metric', desirableDirection: 'lower' }) : null;
  const brief = assessment ? generateBoardBrief([assessment]) : null;

  const header = pageHeader({ title: 'Anomaly Intelligence', subtitle: `Engine ${ANOMALY_ENGINE_VERSION} · ${ANOMALY_RULE_ID} · Shewhart XmR + linear bands + Brier calibration` });

  // Severity color
  const sev = assessment ? assessment.severity : 0;
  const sevClass = sev >= 4 ? 'danger' : (sev >= 3 ? 'warning' : (sev >= 2 ? 'note' : 'ok'));
  const sevLabel = sev >= 4 ? 'Critical' : (sev >= 3 ? 'Moderate' : (sev >= 2 ? 'Watch' : 'Normal'));

  // Prediction table (first 5 windows)
  const predRows = (assessment?.predictions || []).slice(0, 5).map((p) =>
    h('tr', {},
      h('td', {}, `+${p.windowDay}d`),
      h('td', {}, `P50 = ${nf(p.p50)}`),
      h('td', {}, `[${nf(p.p95Lower)} , ${nf(p.p95Upper)}]`),
      h('td', {}, p.confidence),
    )
  );

  const controlTable = assessment && assessment.controlLimits ? h('div', { class: 'stats-row' },
    stat({ value: nf(assessment.controlLimits.mean), label: 'Process mean' }),
    stat({ value: nf(assessment.controlLimits.unpl), label: 'Upper natural limit' }),
    stat({ value: nf(assessment.controlLimits.lnpl), label: 'Lower natural limit' }),
    stat({ value: assessment.measuredPoints, label: 'Measured points' }),
  ) : h('p', { class: 'muted' }, 'Need ≥4 measured points with ≥3 adjacent moving ranges to establish statistical limits (Shewhart Wheler invariant).');

  return h('div', { class: 'view anomaly-view' },
    header,
    banner({ tone: sev >= 4 ? 'danger' : (sev >= 3 ? 'warning' : 'neutral'), text: assessment ? `${sevLabel} signal — severity ${sev}/5. ${assessment.recommendation}` : 'No anomaly signal detected in current series.' }),

    h('div', { class: 'grid-2' },
      card({ title: 'Current assessment', action: assessment ? h('span', { class: `badge ${sevClass}` }, sevLabel) : null },
        h('div', { class: 'stats-row' },
          stat({ value: assessment ? nf(assessment.latestPoint?.value) : '—', label: 'Latest value' }),
          stat({ value: assessment ? assessment.trend?.slope : '—', label: 'Trend slope' }),
          stat({ value: assessment ? (assessment.trend?.r2 != null ? nf(assessment.trend.r2) : '—') : '—', label: 'R²' }),
        ),
        assessment ? h('div', { class: 'small muted' }, assessment.calibrationNote) : null,
        assessment && assessment.latestSignal ? h('div', { class: 'small' },
          h('strong', {}, 'Latest signal: '), assessment.latestSignal.type, ' — ', assessment.latestSignal.polarity, '. ', assessment.latestSignal.reason || '') : null,
      ),

      card({ title: 'Control limits (XmR)' }, controlTable),
    ),

    h('div', { class: 'grid-2' },
      card({ title: 'Prediction windows (next 7d)' },
        h('table', { class: 'data-table small' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Day'), h('th', {}, 'P50'), h('th', {}, '95% band'), h('th', {}, 'Confidence'))),
          h('tbody', {}, predRows.length ? predRows : h('tr', {}, h('td', { colspan: 4 }, 'Not enough history for projection.'))),
        ),
        assessment ? h('p', { class: 'small muted' }, assessment.calibrationNote) : null,
      ),

      card({ title: 'Cross-module propagation (if signal fires)' },
        h('ul', { class: 'small' },
          h('li', {}, 'DACI decision opened (critical severity ≥4)'),
          h('li', {}, 'Blameless 1:1 coaching prep queued (moderate ≥3)'),
          h('li', {}, 'Stakeholder brief drafted (moderate ≥3)'),
          h('li', {}, 'Forecast integrity note appended (always on signal)'),
        ),
        h('p', { class: 'small muted' }, `Rule: ${ANOMALY_RULE_ID}. Pure event-driven savepoint inside store transaction; no silent failures.`),
      ),
    ),

    card({ title: 'Board-ready brief (auto-generated)', action: h('button', { class: 'btn btn-tiny btn-ghost', onclick: () => { try { navigator.clipboard.writeText(brief || ''); toast('Brief copied'); } catch (e) { toast('Copy failed'); } } }, 'Copy brief') },
      h('pre', { class: 'code-block small scrollable' }, brief || 'No assessment available — need ≥4 measured series points.')
    ),
  );
}
