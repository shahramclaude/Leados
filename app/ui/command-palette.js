/**
 * app/ui/command-palette.js — the keyboard-first way to reach 150 tools.
 *
 * The sidebar filters tool names. This reaches tools, safe navigation actions
 * and the records the acting altitude may read, from one input, in two
 * keystrokes (⌘K / Ctrl-K). It is an accessible combobox: focus stays in the
 * text field, the active option is announced through `aria-activedescendant`,
 * and every option is a real button for mouse and assistive-technology users.
 *
 * Recent selections are a convenience, not workspace data: they live in this
 * browser's localStorage, hold only a label/route/type, and can be cleared by
 * clearing site data. They never leave the device and are never exported.
 */

import { h, openModal, uid } from './dom.js';
import { searchCatalog } from '../core/domain/quickSearch.js';

export const PALETTE_RECENT_KEY = 'leados.palette.recent.v1';
export const PALETTE_RECENT_LIMIT = 6;
const VALID_KINDS = new Set(['action', 'tool', 'record']);

function storageOrNull(storage) {
  if (storage) return storage;
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Read the recent strip defensively: malformed state yields an empty list. */
export function readPaletteRecent(storage = null, limit = PALETTE_RECENT_LIMIT) {
  const store = storageOrNull(storage);
  if (!store) return [];
  try {
    const parsed = JSON.parse(store.getItem(PALETTE_RECENT_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    const seen = new Set();
    const out = [];
    for (const row of parsed) {
      if (!row || typeof row.label !== 'string' || typeof row.route !== 'string') continue;
      if (!row.route.startsWith('#/')) continue;
      if (!VALID_KINDS.has(row.kind)) continue;
      if (seen.has(row.route)) continue;
      seen.add(row.route);
      out.push({
        kind: row.kind,
        type: typeof row.type === 'string' ? row.type : row.kind,
        id: typeof row.id === 'string' ? row.id : row.route,
        label: row.label.slice(0, 200),
        hint: typeof row.hint === 'string' ? row.hint.slice(0, 200) : '',
        route: row.route.slice(0, 500),
        moduleRoute: typeof row.moduleRoute === 'string' ? row.moduleRoute.slice(0, 200) : '',
        icon: typeof row.icon === 'string' ? row.icon.slice(0, 8) : '',
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** Remember one selection. Never throws (private mode/quota included). */
export function rememberPaletteRecent(storage, item, limit = PALETTE_RECENT_LIMIT) {
  const store = storageOrNull(storage);
  if (!store || !item || typeof item.route !== 'string' || !item.route.startsWith('#/')) return false;
  try {
    const next = [{
      kind: VALID_KINDS.has(item.kind) ? item.kind : 'tool',
      type: typeof item.type === 'string' ? item.type : 'tool',
      id: typeof item.id === 'string' ? item.id : item.route,
      label: String(item.label || item.route).slice(0, 200),
      hint: String(item.hint || '').slice(0, 200),
      route: item.route.slice(0, 500),
      moduleRoute: String(item.moduleRoute || '').slice(0, 200),
      icon: String(item.icon || '').slice(0, 8),
    }, ...readPaletteRecent(store, limit).filter((row) => row.route !== item.route)]
      .slice(0, limit);
    store.setItem(PALETTE_RECENT_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

const TYPE_LABELS = Object.freeze({
  action: 'Action', tool: 'Tool', record: 'Record', person: 'Person', case: 'Case',
  decision: 'Decision', delegation: 'Delegation', goal: 'Goal', review: 'Review',
  requisition: 'Role', candidate: 'Candidate', negotiation: 'Negotiation',
  budget: 'Budget', stakeholder: 'Stakeholder', change: 'Change',
  dependency: 'Dependency', premise: 'Premise', strategyBet: 'Strategy bet',
  impactStudy: 'Study', recent: 'Recent',
});

function emptyModel(recent, catalog, limits) {
  const groups = [];
  // "Recent" is a shortcut strip, not a second copy of the list below it.
  const recentRoutes = new Set(recent.map((item) => item.route));
  if (recent.length) groups.push({ kind: 'recent', label: 'Recent', items: recent });
  const actions = catalog.actions.filter((item) => !recentRoutes.has(item.route));
  const tools = catalog.tools.filter((item) => !recentRoutes.has(item.route));
  if (actions.length) {
    groups.push({ kind: 'action', label: 'Actions', items: actions.slice(0, limits.action) });
  }
  if (tools.length) {
    groups.push({ kind: 'tool', label: 'Tools', items: tools.slice(0, limits.tool) });
  }
  const flat = groups.flatMap((group) => group.items);
  return { groups, flat, count: flat.length, empty: true, query: '' };
}

/**
 * Open the palette.
 *
 * @param {{catalog: object, recent?: Array, onSelect: Function,
 *          onClose?: Function, shortcutLabel?: string}} options
 * @returns {{close: Function}|null}
 */
export function openCommandPalette({ catalog, recent = [], onSelect, onClose = null, shortcutLabel = 'Ctrl K' }) {
  if (!catalog || typeof onSelect !== 'function') return null;
  const limits = { action: 4, tool: 8, record: 12 };
  let model = emptyModel(recent, catalog, limits);
  let active = 0;
  const listId = uid('palette-list');
  const inputId = uid('palette-input');
  const helpId = uid('palette-help');

  const input = h('input', {
    id: inputId,
    class: 'palette-input',
    type: 'text',
    role: 'combobox',
    autocomplete: 'off',
    spellcheck: 'false',
    placeholder: 'Search tools, people, cases, decisions…',
    'aria-autocomplete': 'list',
    'aria-expanded': 'true',
    'aria-controls': listId,
    'aria-describedby': helpId,
    'aria-labelledby': `${inputId}-label`,
  });

  const list = h('div', { id: listId, class: 'palette-list', role: 'listbox', 'aria-label': 'Search results' });
  const status = h('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
  const countLabel = h('span', { class: 'palette-count', 'aria-hidden': 'true' });

  // Option ids are positional, not derived from a record id: the same tool can
  // appear both in "Recent" and in "Tools", and two collections can legitimately
  // share an id. A DOM id must be unique for aria-activedescendant to name one row.
  const optionId = (index) => `${listId}-opt-${index}`;

  function updateActive(next) {
    if (!model.flat.length) { active = 0; return; }
    active = (next + model.flat.length) % model.flat.length;
    for (const node of list.querySelectorAll('[role="option"]')) {
      const isActive = Number(node.dataset.index) === active;
      node.setAttribute('aria-selected', isActive ? 'true' : 'false');
      node.classList.toggle('is-active', isActive);
    }
    const item = model.flat[active];
    if (item) {
      input.setAttribute('aria-activedescendant', optionId(active));
      const node = list.querySelector(`[data-index="${active}"]`);
      node?.scrollIntoView?.({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function choose(index = active) {
    const item = model.flat[index];
    if (!item) return;
    api.close();
    onSelect(item);
  }

  function render() {
    const rendered = [];
    let flatIndex = 0;
    for (const group of model.groups) {
      rendered.push(h('p', { class: 'palette-group-label', role: 'presentation' }, group.label));
      for (const item of group.items) {
        const index = flatIndex;
        flatIndex += 1;
        rendered.push(h('button', {
          type: 'button',
          role: 'option',
          id: optionId(index),
          class: 'palette-option',
          'aria-selected': index === active ? 'true' : 'false',
          'data-index': String(index),
          tabindex: '-1',
          onMouseenter: () => updateActive(index),
          onClick: () => choose(index),
        },
        h('span', { class: 'palette-icon', 'aria-hidden': 'true' }, item.icon || '·'),
        h('span', { class: 'palette-copy' },
          h('span', { class: 'palette-label' }, item.label),
          item.hint ? h('span', { class: 'palette-hint' }, item.hint) : null),
        h('span', { class: 'palette-type' }, TYPE_LABELS[item.type] || TYPE_LABELS[item.kind] || 'Result')));
      }
    }
    if (!model.flat.length) {
      rendered.push(h('p', { class: 'palette-empty' }, model.empty
        ? 'No tools are readable at this altitude. Try a record name.'
        : 'Nothing matches every word. Try fewer words, or part of a name.'));
    }
    list.replaceChildren(...rendered);
    countLabel.textContent = model.empty ? `${model.flat.length} shortcuts` : `${model.count} result${model.count === 1 ? '' : 's'}`;
    status.textContent = model.empty
      ? `${model.flat.length} quick shortcuts available`
      : `${model.count} result${model.count === 1 ? '' : 's'} for ${model.query}`;
    updateActive(active);
  }

  function refresh() {
    const query = input.value;
    model = query.trim()
      ? searchCatalog(catalog, query, { limits })
      : emptyModel(recent, catalog, limits);
    active = 0;
    render();
  }

  input.addEventListener('input', refresh);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      updateActive(active + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      updateActive(active - 1);
    } else if (event.key === 'Home' && model.flat.length) {
      event.preventDefault();
      updateActive(0);
    } else if (event.key === 'End' && model.flat.length) {
      event.preventDefault();
      updateActive(model.flat.length - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose();
    }
  });

  const body = h('div', { class: 'palette' },
    h('label', { id: `${inputId}-label`, class: 'sr-only', for: inputId }, 'Search LeadOS'),
    h('div', { class: 'palette-search' }, h('span', { class: 'palette-search-icon', 'aria-hidden': 'true' }, '⌕'), input, countLabel),
    h('p', { id: helpId, class: 'palette-help' },
      'Type a name, a record or a tool. Every word must match. Results are limited to what this altitude may open.'),
    list,
    h('div', { class: 'palette-foot' },
      h('span', {}, h('kbd', {}, '↑'), h('kbd', {}, '↓'), ' navigate'),
      h('span', {}, h('kbd', {}, 'Enter'), ' open'),
      h('span', {}, h('kbd', {}, 'Esc'), ' close'),
      h('span', { class: 'palette-scope' }, `Records: ${catalog.stats?.records ?? 0} · Tools: ${catalog.stats?.tools ?? 0}`)),
    status);

  const api = openModal({
    title: 'Search LeadOS',
    description: `Jump to any tool, record or safe action · ${shortcutLabel} from anywhere`,
    body,
    size: 'lg',
    onClose,
  });
  api.dialog.classList.add('palette-modal');
  render();
  input.focus();
  return api;
}
