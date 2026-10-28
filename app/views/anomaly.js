import { h, toast } from '../ui/dom.js';
import { pageHeader, card, stat, banner } from '../ui/components.js';
import { assessAnomaly, generateBoardBrief, extractModuleSeries, ANOMALY_ENGINE_VERSION } from '../core/domain/anomaly.js';

export function renderAnomaly(ctx) {
  const state = ctx?.store?.getState ? ctx.store.getState() : (ctx.state || {});
  const series = extractModuleSeries(state);
  const assessment = assessAnomaly(series);
  const brief = generateBoardBrief([assessment]);
  const limits = assessment.controlLimits;
  const fmt = n => Number.isFinite(n) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n) : '—';
  return h('div', { class: 'view anomaly-view' },
    pageHeader({ title: 'Anomaly intelligence', subtitle: `${ANOMALY_ENGINE_VERSION} · weekly operational case work in progress` }),
    banner({ tone: assessment.severity >= 3 ? 'warning' : 'neutral', text: assessment.recommendation }),
    card({ title: 'Evidence and limitations' },
      h('p', {}, 'Weekly snapshots use recorded case opening and resolution dates, not daily event changes. Detected reopenings or undated cases are withheld. Edited dates and reopenings missing from the capped audit log can still distort history; verify records before acting.'),
      h('p', {}, assessment.calibrationNote),
      h('p', {}, 'No automated decisions, coaching, communications or forecast updates are generated here. Existing case automation operates separately.'),
      h('div', { class: 'stats-row' },
        stat({ value: assessment.measuredPoints, label: 'Measured weeks' }),
        stat({ value: fmt(assessment.latestPoint?.value), label: 'Latest open cases' }),
        stat({ value: fmt(limits?.mean), label: 'Process mean' }),
        stat({ value: fmt(limits?.lnpl), label: 'Lower natural limit' }),
        stat({ value: fmt(limits?.unpl), label: 'Upper natural limit' })),
      h('p', {}, assessment.latestSignal ? `${assessment.latestSignal.type}: ${assessment.latestSignal.reason}` : (assessment.reason || 'No latest-point signal.'))),
    card({ title: 'Weekly evidence' },
      h('table', { class: 'data-table' },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Week ending'), h('th', { scope: 'col' }, 'Open cases'))),
        h('tbody', {}, series.length ? series.map(p => h('tr', {}, h('td', {}, p.date), h('td', {}, fmt(p.value)))) : h('tr', {}, h('td', { colspan: 2 }, 'No reliable dated case history available.'))))),
    card({ title: 'Executive brief', action: h('button', { class: 'btn btn-tiny btn-ghost', onclick: async () => { try { await navigator.clipboard.writeText(brief); toast('Brief copied'); } catch { toast('Copy failed'); } } }, 'Copy brief') },
      h('pre', { class: 'code-block small scrollable' }, brief)));
}
