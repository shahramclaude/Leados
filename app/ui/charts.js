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

  const lineFor = (key, color) => {
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

    return h(
      'g',
      null,
      ...segments.map((seg) =>
        seg.length === 1
          ? h('circle', { cx: seg[0].x, cy: seg[0].y, r: 3, fill: color })
          : h('polyline', {
              points: seg.map((p) => `${p.x},${p.y}`).join(' '),
              fill: 'none',
              stroke: color,
              'stroke-width': 2,
              'stroke-linejoin': 'round',
              'stroke-linecap': 'round',
            }),
      ),
      ...segments.flatMap((seg) => seg.map((p) => h('circle', { cx: p.x, cy: p.y, r: 2.6, fill: color }))),
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
  const summary = [
    `Pulse trend over ${series.length} weeks.`,
    lastWithData ? `Latest readable week ${lastWithData.weekStart}: overall ${lastWithData.overall}/5 from ${lastWithData.n} responses.` : 'No week had enough responses to report.',
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
      lineFor('safety', 'var(--accent-2)'),
      lineFor('overall', 'var(--accent)'),
      ...labels,
    ),
    h(
      'figcaption',
      { class: 'chart-legend' },
      h('span', { class: 'legend-item' }, h('span', { class: 'legend-dot', style: { background: 'var(--accent)' } }), 'Overall'),
      h('span', { class: 'legend-item' }, h('span', { class: 'legend-dot', style: { background: 'var(--accent-2)' } }), 'Safety'),
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
