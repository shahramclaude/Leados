/**
 * ADR-0106 — role-first workspace navigation.
 * The catalogue still exists (search + disclosed sections), but the default
 * surface is the acting altitude's duties, not 150 links. Pure builder is
 * exported for tests; the renderer owns only DOM state (query/open sections).
 */
import { h } from './dom.js';

const PINNED = Object.freeze([
  Object.freeze({ route: 'mission', label: 'Mission Control', icon: '◉', href: '#/mission' }),
  Object.freeze({ route: 'mission', label: 'Describe a situation', icon: '⌁', href: '#/mission?panel=capture' }),
  Object.freeze({ route: 'mission', label: 'Execution evidence', icon: '✓', href: '#/mission?panel=execution' }),
  Object.freeze({ route: 'seat', label: 'Altitude & access', icon: '◈', href: '#/seat' }),
]);
const CORE = Object.freeze(['today', 'cases', 'decisions', 'delegations', 'oneonones', 'feedback', 'goals', 'health', 'finance', 'settings']);
const ui = { query: '', open: new Set(['Core workflow', 'Overview']), touched: false };
const routeKey = (href) => String(href || '').replace(/^#\/?/, '').split(/[?/]/)[0];
const unique = (items) => [...new Map(items.map((i) => [i.href || i.route, i])).values()];

/** Build a altitude-specific map. `allowed` is the SAME gate the router uses. */
export function buildWorkspaceNav(groups, { route = '', seat = null, allowed = () => true, query = '' } = {}) {
  const all = unique(groups.flatMap((g) => g.items.map((i) => ({ ...i, section: g.section, href: `#/${i.route}` }))));
  const byRoute = new Map(all.map((i) => [i.route, i]));
  const q = String(query || '').trim().toLowerCase();
  const matches = (i) => !q || `${i.label} ${i.route} ${i.section || ''}`.toLowerCase().includes(q);
  const permitted = all.filter((i) => allowed(i));
  if (q) return { mode: 'search', pinned: PINNED, sections: [{ section: `Search results`, items: permitted.filter(matches) }], resultCount: permitted.filter(matches).length };
  const sections = [];
  const duties = Array.isArray(seat?.duties) ? seat.duties : [];
  if (duties.length) {
    for (const duty of duties) {
      const items = unique((duty.routes || []).map(routeKey).map((r) => byRoute.get(r)).filter(Boolean).filter(allowed));
      if (items.length) sections.push({ section: duty.label, question: duty.question, items });
    }
  } else {
    sections.push({ section: 'Core workflow', items: CORE.map((r) => byRoute.get(r)).filter(Boolean).filter(allowed) });
  }
  // The full permitted catalogue remains reachable, collapsed. Declared seats
  // never see a withheld route here because `allowed` is the router's verdict.
  for (const group of groups) {
    const items = group.items.filter(allowed).map((i) => ({ ...i, href: `#/${i.route}` }));
    if (items.length) sections.push({ section: group.section || 'Workspace tools', items, catalogue: true });
  }
  const activeSections = new Set(sections.filter((s) => s.items.some((i) => i.route === route)).map((s) => s.section));
  return { mode: duties.length ? 'altitude' : 'operator', pinned: PINNED, sections, activeSections, resultCount: permitted.length };
}

function navLink(item, { route, counts = {}, isAggregate = () => false, activeHref = null }) {
  const href = item.href || `#/${item.route}`;
  const active = activeHref ? href === activeHref : item.route === route;
  const count = item.badge ? counts[item.badge] : 0;
  return h('a', { class: `nav-item ${active ? 'is-active' : ''}`, href, 'aria-current': active ? 'page' : null },
    h('span', { class: 'nav-icon', 'aria-hidden': 'true' }, item.icon || '·'),
    h('span', { class: 'nav-label' }, item.label),
    isAggregate(item) ? h('span', { class: 'nav-posture', title: 'Aggregate only at this altitude', 'aria-label': 'aggregate only at this altitude' }, '◌') : null,
    count ? h('span', { class: 'nav-count', 'aria-label': `${count} needing attention` }, String(count)) : null);
}

export function renderWorkspaceNav(options) {
  const { groups, route, seat, allowed, counts, isAggregate, hiddenN = 0, currentHref = '' } = options;
  const model = buildWorkspaceNav(groups, { route, seat, allowed, query: ui.query });
  const search = h('input', { id: 'workspace-nav-search', type: 'search', class: 'nav-search', placeholder: 'Search permitted tools…', value: ui.query, autocomplete: 'off', 'aria-label': 'Search permitted tools', 'aria-describedby': 'workspace-nav-help' });
  search.addEventListener('input', () => { ui.query = search.value; const pos = search.selectionStart; const next = renderWorkspaceNav(options); const parent = search.closest('#sidebar-nav'); if (parent) { parent.replaceChildren(next); const input = parent.querySelector('#workspace-nav-search'); input?.focus(); try { input?.setSelectionRange(pos, pos); } catch { /* search input may not support range */ } } });
  const pinned = h('div', { class: 'nav-pinned' }, ...model.pinned.map((i) => navLink(i, { route, counts, isAggregate, activeHref: currentHref || null })));
  const sections = model.sections.map((section) => {
    const open = model.mode === 'search' || ui.open.has(section.section) || model.activeSections?.has(section.section);
    const details = h('details', { class: `nav-group${section.catalogue ? ' nav-catalogue' : ''}`, open },
      h('summary', { class: 'nav-section nav-summary' }, h('span', null, section.section || 'Workspace tools'), h('span', { class: 'nav-section-count', 'aria-hidden': 'true' }, String(section.items.length))),
    section.question ? h('p', { class: 'nav-duty-question' }, section.question) : null,
    ...section.items.map((i) => navLink(i, { route, counts, isAggregate })));
    details.addEventListener('toggle', () => { if (model.mode === 'search') return; if (details.open) ui.open.add(section.section); else ui.open.delete(section.section); ui.touched = true; });
    return details;
  });
  return h('div', { class: 'nav-inner nav-workspace' },
    h('div', { class: 'nav-search-wrap' }, search, h('p', { id: 'workspace-nav-help', class: 'sr-only' }, 'Filters the tools this altitude may open. The router still enforces the same boundary on navigation.')),
    pinned,
    model.mode === 'search' ? h('p', { class: 'nav-result-count', role: 'status' }, `${model.resultCount} permitted tool(s) match`) : h('p', { class: 'nav-mode tiny' }, model.mode === 'altitude' ? `${seat.label} duties first · ${model.resultCount} tools permitted` : 'Core workflow first · search opens the full catalogue'),
    ...sections,
    model.mode === 'search' && !model.resultCount ? h('p', { class: 'nav-empty' }, 'No permitted tool matches. Clear the search or change altitude.') : null,
    hiddenN ? h('p', { class: 'nav-section' }, `${hiddenN} section(s) withheld at this altitude · `, h('a', { href: '#/seat?panel=boundary', class: 'sidebar-link' }, 'see the boundary')) : null);
}
