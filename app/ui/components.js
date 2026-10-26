/**
 * app/ui/components.js — reusable, boring, accessible building blocks.
 * Views compose these; none of them read global state.
 */

import { h } from './dom.js';
import { progressBar } from './charts.js';
import { initials, displayName } from '../core/domain/people.js';

export function pageHeader({ eyebrow = null, title, subtitle = null, actions = [], meta = null }) {
  return h(
    'header',
    { class: 'page-head' },
    h('div', { class: 'page-head-text' }, eyebrow ? h('p', { class: 'page-eyebrow' }, eyebrow) : null, h('h1', { class: 'page-title' }, title), subtitle ? h('p', { class: 'page-sub' }, subtitle) : null, meta),
    actions.length ? h('div', { class: 'page-actions' }, ...actions) : null,
  );
}

export function badge(text, tone = 'neutral', title = '') {
  return h('span', { class: `badge badge-${tone}`, ...(title ? { title } : {}) }, text);
}

export function stat({ label, value, hint, tone = '', action = null }) {
  return h(
    'div',
    { class: `stat ${tone ? `stat-${tone}` : ''}` },
    h('span', { class: 'stat-label' }, label),
    h('span', { class: 'stat-value' }, value),
    hint ? h('span', { class: 'stat-hint' }, hint) : null,
    action || null,
  );
}

export function card({ title = null, subtitle = null, actions = [], body, className = '', id = null }) {
  return h(
    'section',
    { class: `card ${className}`, ...(id ? { id } : {}) },
    title || actions.length
      ? h(
          'div',
          { class: 'card-head' },
          h('div', null, title ? h('h2', { class: 'card-title' }, title) : null, subtitle ? h('p', { class: 'card-sub' }, subtitle) : null),
          actions.length ? h('div', { class: 'card-actions' }, ...actions) : null,
        )
      : null,
    h('div', { class: 'card-body' }, body),
  );
}

export function avatar(person, size = 'md') {
  return h('span', { class: `avatar avatar-${size}`, 'aria-hidden': 'true' }, initials(person));
}

export function personChip(person, { onClick = null, sub = null, right = null } = {}) {
  const content = [
    avatar(person, 'sm'),
    h('span', { class: 'person-chip-text' }, h('span', { class: 'person-chip-name' }, displayName(person)), sub ? h('span', { class: 'person-chip-sub' }, sub) : null),
    right,
  ];
  if (onClick) {
    return h('button', { class: 'person-chip person-chip-btn', type: 'button', onClick }, ...content);
  }
  return h('span', { class: 'person-chip' }, ...content);
}

export function kv(label, value, tone = '') {
  return h(
    'div',
    { class: `kv ${tone ? `kv-${tone}` : ''}` },
    h('span', { class: 'kv-label' }, label),
    h('span', { class: 'kv-value' }, value),
  );
}

export function barRow({ label, value, hint, tone = null, onClick = null }) {
  const inner = h(
    'div',
    { class: 'bar-row' },
    h('div', { class: 'bar-row-head' }, h('span', { class: 'bar-label' }, label), h('span', { class: 'bar-value' }, value === null ? 'no data' : `${Math.round(value)}`)),
    progressBar(value, { tone, label: `${label} score` }),
    hint ? h('p', { class: 'bar-hint' }, hint) : null,
  );
  if (onClick) {
    return h('button', { class: 'bar-row-btn', type: 'button', onClick }, inner);
  }
  return inner;
}

export function banner({ tone = 'info', title, body = null, actions = [] }) {
  return h(
    'div',
    { class: `banner banner-${tone}`, role: tone === 'bad' ? 'alert' : 'status' },
    h('div', { class: 'banner-text' }, h('strong', null, title), body ? h('p', null, body) : null),
    actions.length ? h('div', { class: 'banner-actions' }, ...actions) : null,
  );
}

export function tabs({ items, active, onSelect, ariaLabel = 'Sections' }) {
  return h(
    'div',
    { class: 'tabs', role: 'tablist', 'aria-label': ariaLabel },
    ...items.map((item) =>
      h(
        'button',
        {
          class: `tab ${item.key === active ? 'is-active' : ''}`,
          type: 'button',
          role: 'tab',
          'aria-selected': item.key === active ? 'true' : 'false',
          onClick: () => onSelect(item.key),
        },
        item.label,
        item.count !== undefined ? h('span', { class: 'tab-count' }, String(item.count)) : null,
      ),
    ),
  );
}

/** One finding, fully explained. Evidence is always visible — never hidden behind a hover. */
export function findingCard(finding, { onAction = null, compact = false } = {}) {
  const tone = finding.severity >= 5 ? 'bad' : finding.severity >= 4 ? 'warn' : finding.severity >= 3 ? 'caution' : 'neutral';
  return h(
    'article',
    { class: `finding finding-${tone} ${compact ? 'finding-compact' : ''}` },
    h(
      'div',
      { class: 'finding-head' },
      h('div', { class: 'finding-head-main' }, h('span', { class: 'finding-rule' }, `${finding.ruleId} · ${finding.domain}`), h('h3', { class: 'finding-title' }, finding.title)),
      h('div', { class: 'finding-badges' }, badge(finding.severityLabel, tone), badge(`${finding.confidence} confidence`, finding.confidence === 'high' ? 'good' : 'neutral')),
    ),
    h('p', { class: 'finding-detail' }, finding.detail),
    h(
      'ul',
      { class: 'evidence-list' },
      ...finding.evidence.map((line) => h('li', null, line)),
    ),
    h(
      'div',
      { class: 'finding-foot' },
      finding.count
        ? h('span', { class: 'finding-person' }, `${finding.count} people affected`)
        : finding.personName
          ? h('span', { class: 'finding-person' }, `About: ${finding.personName}`)
          : h('span'),
      onAction ? h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => onAction(finding) }, finding.action.label) : null,
    ),
  );
}

export function emptyState({ title, body = null, action = null, icon = '◇' }) {
  return h(
    'div',
    { class: 'empty' },
    h('div', { class: 'empty-mark', 'aria-hidden': 'true' }, icon),
    // h2 keeps the heading order valid whether an empty state sits directly
    // under the page h1 or inside an h2-titled card (axe heading-order).
    h('h2', { class: 'empty-title' }, title),
    body ? h('p', null, body) : null,
    action || null,
  );
}

/**
 * Data table.
 *
 * `caption` is optional but strongly preferred: a screen-reader user navigating
 * by table needs to hear what the table is for before hearing its headers, and
 * a caption is the only element that does that from inside the table. It is
 * rendered visually hidden by default so the visual design is unchanged.
 */
export function table({ columns, rows, caption = '', emptyMessage = 'Nothing here yet.' }) {
  if (!rows.length) return emptyState({ title: emptyMessage });
  return h(
    'div',
    { class: 'table-wrap' },
    h(
      'table',
      caption ? { class: 'table', 'aria-label': caption } : { class: 'table' },
      caption ? h('caption', { class: 'sr-only' }, caption) : null,
      h('thead', null, h('tr', null, ...columns.map((c) => h('th', { scope: 'col', class: c.className || '' }, c.label)))),
      h(
        'tbody',
        null,
        ...rows.map((row) =>
          h(
            'tr',
            { class: row.className || '', ...(row.attrs || {}) },
            ...columns.map((col) => h('td', { class: col.className || '', 'data-label': col.label }, col.render(row))),
          ),
        ),
      ),
    ),
  );
}

export function timeline(items, { empty = 'No history yet.' } = {}) {
  if (!items.length) return emptyState({ title: empty });
  return h(
    'ol',
    { class: 'timeline' },
    ...items.map((item) =>
      h(
        'li',
        { class: 'timeline-item' },
        h('span', { class: 'timeline-date' }, item.dateLabel || item.date || ''),
        h('div', { class: 'timeline-body' }, h('span', { class: 'timeline-kind' }, item.kind), h('span', { class: 'timeline-title' }, item.title), item.detail ? h('p', { class: 'timeline-detail' }, item.detail) : null),
      ),
    ),
  );
}

export { progressBar };
