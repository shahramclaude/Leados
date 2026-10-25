/**
 * app/ui/charts.js — small, dependency-free SVG charts.
 *
 * Rules: every chart carries a text alternative (role="img" + aria-label), and
 * a chart never draws a point it does not have. Missing or suppressed data is
 * rendered as a gap, not interpolated, so the picture cannot imply more
 * knowledge than exists.
 */

import { h } from './dom.js';

const CHART_W = 640;
const CHART_H = 200;
const PAD = { top: 16, right: 16, bottom: 28, left: 32 };

/** Circular score gauge, 0–100. */
export function ringGauge({ value, size = 132, grade = '', caption = '' }) {
  const radius = size / 2 - 10;
  const circumference = 2 * Math.PI * radius;
  const safeValue = typeof value === 'number' ? Math.max(0, Math.min(100, value)) : 0;
  const offset = circumference * (1 - safeValue / 100);
  const color = safeValue >= 75 ? 'var(--good)' : safeValue >= 55 ? 'var(--warn)' : 'var(--bad)';
  const label = value === null || value === undefined ? 'Not yet measurable' : `${safeValue} out of 100${grade ? `, grade ${grade}` : ''}`;

  return h(
    'div',
    { class: 'gauge', role: 'img', 'aria-label': `Team health ${label}` },
    h(
      'svg',
      { viewBox: `0 0 ${size} ${size}`, width: size, height: size, 'aria-hidden': 'true' },
      h('circle', { cx: size / 2, cy: size / 2, r: radius, fill: 'none', stroke: 'var(--line)', 'stroke-width': 10 }),
      value === null || value === undefined
        ? null
        : h('circle', {
            cx: size / 2,
            cy: size / 2,
            r: radius,
            fill: 'none',
            stroke: color,
            'stroke-width': 10,
            'stroke-linecap': 'round',
            'stroke-dasharray': `${circumference}`,
            'stroke-dashoffset': `${offset}`,
            transform: `rotate(-90 ${size / 2} ${size / 2})`,
            style: { transition: 'stroke-dashoffset 400ms ease' },
          }),
    ),
    h(
      'div',
      { class: 'gauge-center' },
      h('strong', { class: 'gauge-value' }, value === null || value === undefined ? '—' : Math.round(safeValue)),
      grade ? h('span', { class: 'gauge-grade' }, grade) : null,
      caption ? h('span', { class: 'gauge-caption' }, caption) : null,
    ),
  );
}

/** Horizontal 0–100 bar used for dimensions and goal progress. */
export function progressBar(value, { tone = null, label = '', thin = false } = {}) {
  const safe = typeof value === 'number' ? Math.max(0, Math.min(100, value)) : null;
  const resolved = tone || (safe === null ? 'neutral' : safe >= 75 ? 'good' : safe >= 55 ? 'warn' : 'bad');
  return h(
    'div',
    {
      class: `bar bar-${resolved}${thin ? ' bar-thin' : ''}`,
      role: 'progressbar',
      'aria-valuemin': 0,
      'aria-valuemax': 100,
      'aria-valuenow': safe === null ? 0 : Math.round(safe),
      'aria-label': label || 'Progress',
    },
    h('span', { class: 'bar-fill', style: { width: `${safe === null ? 0 : safe}%` } }),
  );
}

/**
 * Pulse trend: up to three series over weeks, 1–5 scale.
 * @param {Array<{weekStart:string, overall:number|null, safety:number|null, blocked:boolean, n:number}>} series
 */
export function pulseChart(series, { height = CHART_H } = {}) {
  if (!series || !series.length) {
    return h('p', { class: 'muted' }, 'No pulse history yet.');
  }
  const width = CHART_W;
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const yFor = (v) => PAD.top + innerH - ((v - 1) / 4) * innerH;
  const xFor = (i) => PAD.left + (series.length === 1 ? innerW / 2 : (i / (series.length - 1)) * innerW);

  const grid = [1, 2, 3, 4, 5].map((tick) =>
    h(
      'g',
      null,
      h('line', { x1: PAD.left, x2: width - PAD.right, y1: yFor(tick), y2: yFor(tick), stroke: 'var(--line)', 'stroke-width': tick === 3 ? 1.2 : 0.6, 'stroke-dasharray': tick === 3 ? '' : '3 4' }),
      h('text', { x: PAD.left - 8, y: yFor(tick) + 4, 'text-anchor': 'end', class: 'chart-tick' }, String(tick)),
    ),
  );

  const lineFor = (key, color, { dash = '', shape = 'circle' } = {}) => {
    const segments = [];
    let current = [];
    series.forEach((row, i) => {
      const v = row[key];
      if (typeof v === 'number') {
        current.push({ x: xFor(i), y: yFor(v), v });
      } else if (current.length) {
        segments.push(current);
        current = [];
      }
    });
    if (current.length) segments.push(current);

    const marker = (p) => (shape === 'square'
      ? h('rect', { x: p.x - 2.6, y: p.y - 2.6, width: 5.2, height: 5.2, fill: color })
      : h('circle', { cx: p.x, cy: p.y, r: 2.8, fill: color }));

    return h(
      'g',
      null,
      ...segments.map((seg) =>
        seg.length === 1
          ? marker(seg[0])
          : h('polyline', {
              points: seg.map((p) => `${p.x},${p.y}`).join(' '),
              fill: 'none',
              stroke: color,
              'stroke-width': 2,
              'stroke-dasharray': dash,
              'stroke-linejoin': 'round',
              'stroke-linecap': 'round',
            }),
      ),
      ...segments.flatMap((seg) => seg.map((p) => marker(p))),
    );
  };

  const labels = series.map((row, i) =>
    h(
      'text',
      { x: xFor(i), y: height - 8, 'text-anchor': 'middle', class: 'chart-tick' },
      row.weekStart ? row.weekStart.slice(8, 10) : '',
    ),
  );

  const blocked = series.filter((r) => r.blocked);
  const lastWithData = [...series].reverse().find((r) => typeof r.overall === 'number');
  const lastCountText = lastWithData
    ? (typeof lastWithData.usableResponses === 'number' && lastWithData.usableResponses !== lastWithData.n
      ? `${lastWithData.usableResponses} complete responses (${lastWithData.n} total)`
      : `${lastWithData.n} responses`)
    : '';
  const summary = [
    `Pulse trend over ${series.length} weeks.`,
    lastWithData ? `Latest readable week ${lastWithData.weekStart}: overall ${lastWithData.overall}/5 from ${lastCountText}.` : 'No week had enough responses to report.',
    blocked.length ? `${blocked.length} week(s) suppressed for anonymity.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return h(
    'figure',
    { class: 'chart' },
    h(
      'svg',
      { viewBox: `0 0 ${width} ${height}`, class: 'chart-svg', role: 'img', 'aria-label': summary },
      ...grid,
      lineFor('safety', 'var(--accent-2)', { dash: '5 3', shape: 'square' }),
      lineFor('overall', 'var(--accent)', { dash: '', shape: 'circle' }),
      ...labels,
    ),
    h(
      'figcaption',
      { class: 'chart-legend' },
      h('span', { class: 'legend-item' }, h('span', { class: 'legend-dot', style: { background: 'var(--accent)' } }), 'Overall (solid)'),
      h('span', { class: 'legend-item' }, h('span', { class: 'legend-swatch legend-swatch-dashed', style: { borderColor: 'var(--accent-2)' } }), 'Safety (dashed)'),
      blocked.length ? h('span', { class: 'legend-note' }, `${blocked.length} week(s) hidden below the anonymity floor`) : null,
    ),
    h('p', { class: 'sr-only' }, summary),
  );
}

/** Column chart for a small set of labelled values (0–100). */
export function columnChart(rows, { height = 160 } = {}) {
  const width = CHART_W;
  const innerH = height - 44;
  const barW = Math.min(64, (width - 40) / Math.max(rows.length, 1) - 16);
  const gap = (width - 40 - barW * rows.length) / Math.max(rows.length - 1, 1);
  const max = Math.max(100, ...rows.map((r) => r.value || 0));
  const summary = rows.map((r) => `${r.label}: ${r.value === null ? 'no data' : `${Math.round(r.value)}%`}`).join('. ');

  return h(
    'figure',
    { class: 'chart' },
    h(
      'svg',
      { viewBox: `0 0 ${width} ${height}`, class: 'chart-svg', role: 'img', 'aria-label': summary },
      h('line', { x1: 20, x2: width - 20, y1: innerH, y2: innerH, stroke: 'var(--line)' }),
      ...rows.map((row, i) => {
        const x = 20 + i * (barW + gap);
        const value = row.value === null ? 0 : Math.max(0, Math.min(100, row.value));
        const barH = (value / max) * (innerH - 12);
        const tone = row.value === null ? 'var(--line-strong)' : value >= 75 ? 'var(--good)' : value >= 55 ? 'var(--warn)' : 'var(--bad)';
        return h(
          'g',
          null,
          h('rect', { x, y: innerH - barH, width: barW, height: Math.max(barH, row.value === null ? 2 : 3), rx: 5, fill: tone }),
          h('text', { x: x + barW / 2, y: innerH - barH - 6, 'text-anchor': 'middle', class: 'chart-value' }, row.value === null ? '—' : String(Math.round(value))),
          h('text', { x: x + barW / 2, y: height - 14, 'text-anchor': 'middle', class: 'chart-tick' }, row.label),
        );
      }),
    ),
    h('p', { class: 'sr-only' }, summary),
  );
}

/** Tiny inline trend line, no axes. */
export function sparkline(values, { width = 120, height = 32, color = 'var(--accent)' } = {}) {
  const nums = values.filter((v) => typeof v === 'number');
  if (nums.length < 2) return h('span', { class: 'muted tiny' }, '—');
  const max = Math.max(...nums);
  const min = Math.min(...nums);
  const span = max - min || 1;
  const points = values
    .map((v, i) =>
      typeof v === 'number'
        ? `${(i / (values.length - 1)) * (width - 4) + 2},${height - 3 - ((v - min) / span) * (height - 6)}`
        : null,
    )
    .filter(Boolean)
    .join(' ');
  return h(
    'svg',
    { viewBox: `0 0 ${width} ${height}`, width, height, class: 'spark', 'aria-hidden': 'true' },
    h('polyline', { points, fill: 'none', stroke: color, 'stroke-width': 1.8, 'stroke-linejoin': 'round' }),
  );
}

export const SERIES_STYLES = {
  overall: { color: '#0f6b5c', dash: '', shape: 'circle', strokeWidth: 2.6, patternLabel: 'solid circle' },
  cadence: { color: '#4a6fa5', dash: '', shape: 'square', strokeWidth: 2, patternLabel: 'solid square' },
  feedback: { color: '#8a5609', dash: '6 3', shape: 'diamond', strokeWidth: 2, patternLabel: 'dashed diamond' },
  clarity: { color: '#2d5a7b', dash: '2 3', shape: 'triangle', strokeWidth: 2, patternLabel: 'dotted triangle' },
  growth: { color: '#6b4c8c', dash: '7 3 2 3', shape: 'circle', strokeWidth: 2, patternLabel: 'dash-dot circle' },
  wellbeing: { color: '#a02f29', dash: '4 4', shape: 'square', strokeWidth: 2, patternLabel: 'short-dash square' },
  delegation: { color: '#0f6b5c', dash: '', shape: 'circle', strokeWidth: 2.2, patternLabel: 'solid circle' },
};

function renderSeriesMarker(pt, style) {
  const hollow = pt.fidelity === 'approximate';
  const fill = hollow ? 'var(--panel)' : style.color;
  const strokeProps = { stroke: style.color, 'stroke-width': hollow ? 2 : 1.2 };
  if (style.shape === 'square') {
    return h('rect', { x: pt.x - 3, y: pt.y - 3, width: 6, height: 6, fill, ...strokeProps });
  }
  if (style.shape === 'diamond') {
    return h('polygon', {
      points: `${pt.x},${pt.y - 3.8} ${pt.x + 3.8},${pt.y} ${pt.x},${pt.y + 3.8} ${pt.x - 3.8},${pt.y}`,
      fill,
      ...strokeProps,
    });
  }
  if (style.shape === 'triangle') {
    return h('polygon', {
      points: `${pt.x},${pt.y - 4} ${pt.x + 3.8},${pt.y + 3} ${pt.x - 3.8},${pt.y + 3}`,
      fill,
      ...strokeProps,
    });
  }
  return h('circle', { cx: pt.x, cy: pt.y, r: 3.2, fill, ...strokeProps });
}

/**
 * Multi-series 0–100 trend chart with non-color stroke/shape encoding,
 * hollow markers for approximate reconstructions, gap preservation for
 * suppressed/unmeasured periods, and an accessible HTML data table.
 */
export function trendChart(periods, seriesList, { height = 220, title = 'Health trends', unit = '/100' } = {}) {
  if (!periods || !periods.length || !seriesList || !seriesList.length) {
    return h('p', { class: 'muted' }, 'No historical checkpoints available yet.');
  }
  const width = CHART_W;
  const pad = { top: 16, right: 20, bottom: 30, left: 38 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const yFor = (v) => pad.top + innerH - (Math.max(0, Math.min(100, v)) / 100) * innerH;
  const xFor = (i) => pad.left + (periods.length === 1 ? innerW / 2 : (i / (periods.length - 1)) * innerW);

  const grid = [0, 25, 50, 75, 100].map((tick) =>
    h(
      'g',
      null,
      h('line', {
        x1: pad.left,
        x2: width - pad.right,
        y1: yFor(tick),
        y2: yFor(tick),
        stroke: 'var(--line)',
        'stroke-width': tick === 50 || tick === 75 ? 1 : 0.6,
        'stroke-dasharray': tick === 75 ? '' : '3 4',
      }),
      h('text', { x: pad.left - 8, y: yFor(tick) + 4, 'text-anchor': 'end', class: 'chart-tick' }, String(tick)),
    ),
  );

  let hasApproximate = false;
  let suppressedCount = 0;

  const renderedSeries = seriesList.map((serie) => {
    const style = SERIES_STYLES[serie.key] || SERIES_STYLES.overall;
    const segments = [];
    let current = [];
    serie.values.forEach((cell, idx) => {
      if (cell && cell.status === 'suppressed') suppressedCount += 1;
      if (cell && typeof cell.value === 'number') {
        if (cell.fidelity === 'approximate') hasApproximate = true;
        current.push({
          x: xFor(idx),
          y: yFor(cell.value),
          v: cell.value,
          fidelity: cell.fidelity || 'exact',
        });
      } else if (current.length) {
        segments.push(current);
        current = [];
      }
    });
    if (current.length) segments.push(current);

    return h(
      'g',
      { 'data-series': serie.key },
      ...segments.map((seg) => (
        seg.length === 1
          ? null
          : h('polyline', {
              points: seg.map((p) => `${p.x},${p.y}`).join(' '),
              fill: 'none',
              stroke: style.color,
              'stroke-width': style.strokeWidth,
              'stroke-dasharray': style.dash,
              'stroke-linejoin': 'round',
              'stroke-linecap': 'round',
            })
      )),
      ...segments.flatMap((seg) => seg.map((p) => renderSeriesMarker(p, style))),
    );
  });

  const xLabels = periods.map((p, idx) =>
    h(
      'text',
      { x: xFor(idx), y: height - 8, 'text-anchor': 'middle', class: 'chart-tick' },
      p.label,
    ),
  );

  const summaryParts = [`${title} across ${periods.length} checkpoints (${periods[0].label} to ${periods[periods.length - 1].label}).`];
  for (const serie of seriesList) {
    const measured = serie.values.filter((c) => c && typeof c.value === 'number');
    if (measured.length) {
      const latest = measured[measured.length - 1];
      summaryParts.push(`${serie.label}: latest ${Math.round(latest.value)}${unit} (${measured.length}/${periods.length} checkpoints measured).`);
    } else {
      summaryParts.push(`${serie.label}: not yet measurable.`);
    }
  }
  if (suppressedCount > 0) summaryParts.push(`${suppressedCount} checkpoint(s) suppressed for pulse anonymity.`);
  if (hasApproximate) summaryParts.push('Hollow markers denote approximate historical checkpoints.');
  const summary = summaryParts.join(' ');

  const formatCell = (cell) => {
    if (!cell || cell.value === null || cell.value === undefined) {
      if (cell?.status === 'suppressed') return 'Hidden (privacy)';
      if (cell?.status === 'pre-history') return 'Before records';
      return '—';
    }
    const base = `${Math.round(cell.value * 10) / 10}${unit}`;
    return cell.fidelity === 'approximate' ? `${base} (approx.)` : base;
  };

  return h(
    'figure',
    { class: 'chart' },
    h(
      'svg',
      { viewBox: `0 0 ${width} ${height}`, class: 'chart-svg', role: 'img', 'aria-label': summary },
      ...grid,
      ...renderedSeries,
      ...xLabels,
    ),
    h(
      'figcaption',
      { class: 'chart-legend' },
      ...seriesList.map((serie) => {
        const style = SERIES_STYLES[serie.key] || SERIES_STYLES.overall;
        return h(
          'span',
          { class: 'legend-item' },
          h('span', {
            class: `legend-swatch ${style.dash ? 'legend-swatch-dashed' : ''}`,
            style: { borderColor: style.color, background: style.dash ? 'transparent' : style.color },
          }),
          `${serie.label}`,
        );
      }),
      hasApproximate ? h('span', { class: 'legend-note' }, 'Hollow point = approximate history') : null,
      suppressedCount > 0 ? h('span', { class: 'legend-note' }, 'Gaps = suppressed or unmeasured') : null,
    ),
    h(
      'details',
      { class: 'chart-table-details' },
      h('summary', null, `Data table: ${title}`),
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          { class: 'table' },
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              h('th', { scope: 'col' }, 'Series'),
              ...periods.map((p) => h('th', { scope: 'col' }, p.label)),
            ),
          ),
          h(
            'tbody',
            null,
            ...seriesList.map((serie) =>
              h(
                'tr',
                null,
                h('th', { scope: 'row' }, serie.label),
                ...serie.values.map((cell) => h('td', null, formatCell(cell))),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

/**
 * Feedback observation-to-conversation latency chart (lower is faster) with
 * target convention line and accessible data table.
 */
export function latencyChart(points, { targetDays = 7, height = 188 } = {}) {
  if (!points || !points.length) {
    return h('p', { class: 'muted' }, 'No feedback windows yet.');
  }
  const width = CHART_W;
  const pad = { top: 18, right: 20, bottom: 30, left: 38 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const measuredValues = points.map((p) => p.averageDays).filter((v) => typeof v === 'number');
  const maxY = Math.max(targetDays + 3, 10, ...measuredValues.map((v) => Math.ceil(v + 1)));
  const yFor = (v) => pad.top + innerH - (Math.max(0, Math.min(maxY, v)) / maxY) * innerH;
  const xFor = (i) => pad.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);

  const ticks = [0, targetDays, maxY].filter((v, idx, arr) => arr.indexOf(v) === idx).sort((a, b) => a - b);
  const grid = ticks.map((tick) =>
    h(
      'g',
      null,
      h('line', {
        x1: pad.left,
        x2: width - pad.right,
        y1: yFor(tick),
        y2: yFor(tick),
        stroke: tick === targetDays ? 'var(--warn)' : 'var(--line)',
        'stroke-width': tick === targetDays ? 1.2 : 0.7,
        'stroke-dasharray': tick === targetDays ? '5 3' : '2 4',
      }),
      h('text', { x: pad.left - 8, y: yFor(tick) + 4, 'text-anchor': 'end', class: 'chart-tick' }, `${tick}d`),
    ),
  );

  const segments = [];
  let current = [];
  points.forEach((p, idx) => {
    if (typeof p.averageDays === 'number') {
      current.push({ x: xFor(idx), y: yFor(p.averageDays), v: p.averageDays, over: p.averageDays > targetDays });
    } else if (current.length) {
      segments.push(current);
      current = [];
    }
  });
  if (current.length) segments.push(current);

  const latest = [...points].reverse().find((p) => typeof p.averageDays === 'number');
  const summary = [
    `Feedback observation-to-conversation latency over ${points.length} periods (convention ${targetDays} days or fewer).`,
    latest ? `Latest measured window (${latest.label}): ${latest.averageDays} days average across ${latest.measured} note(s).` : 'No given feedback with an observed date yet.',
  ].join(' ');

  return h(
    'figure',
    { class: 'chart' },
    h(
      'svg',
      { viewBox: `0 0 ${width} ${height}`, class: 'chart-svg', role: 'img', 'aria-label': summary },
      ...grid,
      ...segments.map((seg) => (
        seg.length === 1
          ? null
          : h('polyline', {
              points: seg.map((p) => `${p.x},${p.y}`).join(' '),
              fill: 'none',
              stroke: '#4a6fa5',
              'stroke-width': 2.2,
              'stroke-linejoin': 'round',
              'stroke-linecap': 'round',
            })
      )),
      ...segments.flatMap((seg) =>
        seg.map((p) =>
          h('circle', {
            cx: p.x,
            cy: p.y,
            r: 3.6,
            fill: p.over ? 'var(--warn)' : 'var(--accent)',
            stroke: 'var(--panel)',
            'stroke-width': 1.2,
          }),
        ),
      ),
      ...points.map((p, idx) =>
        h('text', { x: xFor(idx), y: height - 8, 'text-anchor': 'middle', class: 'chart-tick' }, p.label),
      ),
    ),
    h(
      'figcaption',
      { class: 'chart-legend' },
      h('span', { class: 'legend-item' }, h('span', { class: 'legend-dot', style: { background: 'var(--accent)' } }), `Within ${targetDays}d convention`),
      h('span', { class: 'legend-item' }, h('span', { class: 'legend-dot', style: { background: 'var(--warn)' } }), `Above ${targetDays}d`),
      h('span', { class: 'legend-note' }, 'Gaps = no observed-date samples in window'),
    ),
    h(
      'details',
      { class: 'chart-table-details' },
      h('summary', null, 'Data table: Feedback latency'),
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          { class: 'table' },
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              h('th', { scope: 'col' }, 'Period end'),
              h('th', { scope: 'col' }, 'Avg latency'),
              h('th', { scope: 'col' }, 'Measured'),
              h('th', { scope: 'col' }, 'Missing observed date'),
              h('th', { scope: 'col' }, `Above ${targetDays}d`),
            ),
          ),
          h(
            'tbody',
            null,
            ...points.map((p) =>
              h(
                'tr',
                null,
                h('th', { scope: 'row' }, p.label),
                h('td', null, typeof p.averageDays === 'number' ? `${p.averageDays}d` : p.status === 'pre-history' ? 'Before records' : '—'),
                h('td', null, String(p.measured)),
                h('td', null, String(p.unmeasured)),
                h('td', null, p.measured > 0 ? String(p.delayed) : '—'),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

/**
 * Shewhart / Wheeler Individuals & Moving Range (XmR) Process Behaviour Chart.
 * Renders the Individuals (X) chart with Center Line X̄, Upper/Lower Natural
 * Process Limits (X̄ ± 2.66 mR̄), optional target line, special-cause markers,
 * and an accessible data table including Moving Ranges (mR).
 */
export function xmrChart(spc, { title = 'Process metric', unit = '', targetValue = null, height = 210 } = {}) {
  if (!spc || !Array.isArray(spc.points) || spc.points.length === 0) {
    return h('p', { class: 'muted' }, 'No observations recorded yet.');
  }

  const pts = spc.points;
  if (!spc.available) {
    return h(
      'div',
      { class: 'stack-sm' },
      h('p', { class: 'muted small' }, spc.reason || 'At least 4 observations and 3 adjacent moving ranges are needed before XmR natural process limits can be computed.'),
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          { class: 'table', 'aria-label': `Observations for ${title}` },
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              h('th', { scope: 'col' }, 'Date'),
              h('th', { scope: 'col' }, `Value${unit ? ` (${unit})` : ''}`),
              h('th', { scope: 'col' }, 'Note'),
            ),
          ),
          h(
            'tbody',
            null,
            ...pts.map((p) =>
              h(
                'tr',
                null,
                h('th', { scope: 'row' }, p.label || p.date || '—'),
                h('td', null, p.value !== null ? `${p.value}${unit ? ` ${unit}` : ''}` : '—'),
                h('td', { class: 'muted small' }, p.note || '—'),
              ),
            ),
          ),
        ),
      ),
    );
  }

  const width = CHART_W;
  const padLeft = 44;
  const innerW = width - padLeft - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;

  const numericVals = [
    ...pts.filter((p) => p.value !== null).map((p) => p.value),
    spc.mean,
    spc.unpl,
    spc.lnpl,
    ...(typeof targetValue === 'number' && Number.isFinite(targetValue) ? [targetValue] : []),
  ].filter((v) => typeof v === 'number' && Number.isFinite(v));

  let minY = Math.min(...numericVals);
  let maxY = Math.max(...numericVals);
  if (minY === maxY) {
    minY -= 1;
    maxY += 1;
  } else {
    const pad = (maxY - minY) * 0.12;
    minY -= pad;
    maxY += pad;
  }

  const yFor = (v) => PAD.top + innerH - ((v - minY) / (maxY - minY)) * innerH;
  const xFor = (i) => padLeft + (pts.length === 1 ? innerW / 2 : (i / (pts.length - 1)) * innerW);

  const signalByIndex = new Map();
  for (const sig of spc.signals || []) {
    if (!signalByIndex.has(sig.index)) {
      signalByIndex.set(sig.index, sig);
    }
  }
  const mrByIndex = new Map();
  for (const mr of spc.movingRanges || []) {
    mrByIndex.set(mr.index, mr.range);
  }

  const segments = [];
  let current = [];
  pts.forEach((p, idx) => {
    if (p.value !== null) {
      current.push({ x: xFor(idx), y: yFor(p.value), pt: p, sig: signalByIndex.get(idx) || null });
    } else if (current.length) {
      segments.push(current);
      current = [];
    }
  });
  if (current.length) segments.push(current);

  const fmtVal = (v) => (v === null || v === undefined ? '—' : `${v}${unit ? ` ${unit}` : ''}`);
  const summary = [
    `XmR process behaviour chart for ${title}: ${spc.measuredCount} observations.`,
    `Center line ${fmtVal(spc.mean)}, lower natural limit ${fmtVal(spc.lnpl)}, upper natural limit ${fmtVal(spc.unpl)}.`,
    spc.regime === 'common-cause'
      ? 'Process is in statistical control (common-cause variation only).'
      : `${spc.signals.length} special-cause signal(s) detected.`,
  ].join(' ');

  const refLine = (val, labelText, stroke, dash = '') => {
    if (typeof val !== 'number' || !Number.isFinite(val)) return null;
    const y = yFor(val);
    return h(
      'g',
      null,
      h('line', {
        x1: padLeft,
        x2: width - PAD.right,
        y1: y,
        y2: y,
        stroke,
        'stroke-width': dash ? 1.1 : 1.5,
        'stroke-dasharray': dash,
      }),
      h('text', { x: padLeft - 6, y: y + 3.5, 'text-anchor': 'end', class: 'chart-tick' }, String(Math.round(val * 10) / 10)),
      labelText
        ? h('text', { x: width - PAD.right - 2, y: y - 4, 'text-anchor': 'end', class: 'chart-tick' }, labelText)
        : null,
    );
  };

  const labelStride = pts.length > 8 ? Math.ceil(pts.length / 6) : 1;

  return h(
    'figure',
    { class: 'chart' },
    h(
      'svg',
      { viewBox: `0 0 ${width} ${height}`, class: 'chart-svg', role: 'img', 'aria-label': summary },
      refLine(spc.unpl, 'UNPL', 'var(--warn)', '4 4'),
      refLine(spc.mean, 'X̄', 'var(--muted)', ''),
      refLine(spc.lnpl, 'LNPL', 'var(--warn)', '4 4'),
      typeof targetValue === 'number' && Number.isFinite(targetValue)
        ? refLine(targetValue, 'Target', 'var(--good)', '2 3')
        : null,
      ...segments.map((seg) =>
        seg.length === 1
          ? null
          : h('polyline', {
              points: seg.map((p) => `${p.x},${p.y}`).join(' '),
              fill: 'none',
              stroke: 'var(--accent)',
              'stroke-width': 2.1,
              'stroke-linejoin': 'round',
              'stroke-linecap': 'round',
            }),
      ),
      ...segments.flatMap((seg) =>
        seg.map((p) => {
          const fill = p.sig
            ? p.sig.polarity === 'favorable'
              ? 'var(--good)'
              : p.sig.polarity === 'adverse'
                ? 'var(--bad)'
                : 'var(--warn)'
            : 'var(--accent)';
          return h('circle', {
            cx: p.x,
            cy: p.y,
            r: p.sig ? 5 : 3.5,
            fill,
            stroke: 'var(--panel)',
            'stroke-width': 1.3,
          });
        }),
      ),
      ...pts.map((p, idx) =>
        idx % labelStride === 0 || idx === pts.length - 1
          ? h('text', { x: xFor(idx), y: height - 8, 'text-anchor': 'middle', class: 'chart-tick' }, (p.label || p.date || '').slice(-5))
          : null,
      ),
    ),
    h(
      'figcaption',
      { class: 'chart-legend' },
      h('span', { class: 'legend-item' }, h('span', { class: 'legend-dot', style: { background: 'var(--accent)' } }), `Common-cause (X̄ = ${fmtVal(spc.mean)}, mR̄ = ${fmtVal(spc.avgMovingRange)})`),
      h('span', { class: 'legend-item' }, h('span', { class: 'legend-dot', style: { background: 'var(--warn)' } }), `Natural limits [${fmtVal(spc.lnpl)}, ${fmtVal(spc.unpl)}]`),
      spc.signals.length > 0
        ? h('span', { class: 'legend-item' }, h('span', { class: 'legend-dot', style: { background: spc.regime === 'special-cause-adverse' ? 'var(--bad)' : 'var(--good)' } }), `${spc.signals.length} special-cause signal(s)`)
        : h('span', { class: 'legend-note' }, 'In statistical control'),
    ),
    h(
      'details',
      { class: 'chart-table-details' },
      h('summary', null, `Data table: ${title} (X & mR)`),
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          { class: 'table', 'aria-label': `XmR data table for ${title}` },
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              h('th', { scope: 'col' }, 'Date'),
              h('th', { scope: 'col' }, `Individual X${unit ? ` (${unit})` : ''}`),
              h('th', { scope: 'col' }, 'Moving range mR'),
              h('th', { scope: 'col' }, 'Process signal'),
            ),
          ),
          h(
            'tbody',
            null,
            ...pts.map((p, idx) => {
              const sig = signalByIndex.get(idx);
              const mr = mrByIndex.get(idx);
              return h(
                'tr',
                null,
                h('th', { scope: 'row' }, p.date || p.label || '—'),
                h('td', null, p.value !== null ? fmtVal(p.value) : '—'),
                h('td', null, typeof mr === 'number' ? fmtVal(mr) : '—'),
                h('td', null, sig ? `${sig.ruleCode}: ${sig.summary}` : p.value !== null ? 'Common-cause' : 'Gap'),
              );
            }),
          ),
        ),
      ),
    ),
  );
}
