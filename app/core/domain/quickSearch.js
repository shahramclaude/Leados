/**
 * app/core/domain/quickSearch.js — permission-scoped search over tools, records
 * and safe navigation actions.
 *
 * WHY THIS EXISTS
 * ---------------
 * LeadOS ships more than a hundred tools. The sidebar can filter tool *names*,
 * but a leader who remembers the thing ("the Aurora renewal", "Priya", "the
 * billing cutover") has no way to reach it without remembering which screen owns
 * it. A second, record-level search is therefore a real tool, not a decoration.
 *
 * WHAT IT REFUSES
 * ---------------
 * Search is the easiest place in a product to leak what the rest of the app
 * carefully withholds, so this module is deliberately narrower than the store:
 *
 *  - It reads an explicit allowlist of record collections. Confidential
 *    conflicts, anonymous pulses, leader-state notes, seals, credentials and
 *    the vault header are not in it and cannot be added by accident: the list
 *    below is the list.
 *  - A source is only indexed when the caller says the *module* is readable.
 *    The shell passes the router's own verdict, so a declared altitude cannot
 *    search a screen it may not open.
 *  - It never returns record bodies, notes or free text — only the title and a
 *    short structural subtitle (role, status, kind). A person's reflection text
 *    is not a search result.
 *  - It is a pure read. It does not persist, mutate or rank people.
 *
 * The index is built once per (workspace snapshot, acting seat) by the shell;
 * typing only scores an existing array. That is what keeps a 13 MB workspace
 * responsive while the leader types.
 */

const MAX_PER_SOURCE = 400;
const MAX_TOTAL_RECORDS = 5000;

/** Normalise for matching: case, accents and punctuation do not matter. */
export function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Bounded edit distance: one insertion, deletion, substitution or adjacent
 * transposition. "prya" matches "priya"; it does not match every long title
 * that happens to contain those letters in order, which is what a raw
 * subsequence match did (and why "prya" once returned arbitrary decisions).
 */
export function withinOneEdit(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    // adjacent transposition
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  if (a.length > b.length) return a.slice(i + 1) === b.slice(i);
  return b.slice(i + 1) === a.slice(i);
}

const encodeId = (value) => encodeURIComponent(String(value ?? ''));
const text = (value) => (typeof value === 'string' ? value : '');
const joinHint = (...parts) => parts.map((p) => text(p).trim()).filter(Boolean).join(' · ');

/**
 * The whole record surface search may read. Keep this list explicit.
 *
 * `moduleRoute` is the nav route whose verdict gates the source. `route` is the
 * canonical focused destination for one record: the same deep link the module
 * itself uses, so search cannot invent a second navigation tree.
 */
export const SEARCH_SOURCES = Object.freeze([
  {
    key: 'people', type: 'person', moduleRoute: 'people',
    include: (r) => r && r.id && r.name && r.status !== 'archived',
    title: (r) => r.name,
    subtitle: (r) => joinHint(r.role, r.team),
    keywords: () => 'person people roster teammate report lead',
    route: (r) => `#/people/${encodeId(r.id)}`,
  },
  {
    key: 'cases', type: 'case', moduleRoute: 'cases',
    include: (r) => r && r.id && r.title,
    title: (r) => r.title,
    subtitle: (r) => joinHint(r.kind, r.status),
    keywords: (r) => `case operational ${text(r.kind)} ${text(r.status)}`,
    route: (r) => `#/cases/${encodeId(r.id)}`,
  },
  {
    key: 'decisions', type: 'decision', moduleRoute: 'decisions',
    include: (r) => r && r.id && (r.title || r.question),
    title: (r) => r.title || r.question,
    subtitle: (r) => joinHint(r.kind || r.type, r.status),
    keywords: (r) => `decision call daci ${text(r.status)}`,
    route: (r) => `#/decisions?decision=${encodeId(r.id)}`,
  },
  {
    key: 'delegations', type: 'delegation', moduleRoute: 'delegations',
    include: (r) => r && r.id && r.title,
    title: (r) => r.title,
    subtitle: (r) => joinHint(r.status, r.dueOn ? `due ${r.dueOn}` : ''),
    keywords: () => 'delegation task owned work promise',
    route: (r) => `#/delegations?delegation=${encodeId(r.id)}`,
  },
  {
    key: 'goals', type: 'goal', moduleRoute: 'goals',
    include: (r) => r && r.id && r.title,
    title: (r) => r.title,
    subtitle: (r) => joinHint(r.status, r.horizon),
    keywords: () => 'goal objective outcome okr',
    route: (r) => `#/goals?goal=${encodeId(r.id)}`,
  },
  {
    key: 'reviews', type: 'review', moduleRoute: 'reviews',
    include: (r) => r && r.id,
    title: (r, context) => {
      const person = context.peopleById.get(r.personId);
      const period = r.periodStart && r.periodEnd ? `${r.periodStart} → ${r.periodEnd}` : '';
      return joinHint(person?.name || 'Review', period);
    },
    subtitle: (r) => joinHint(r.status, r.rating),
    keywords: () => 'review performance appraisal packet',
    route: (r) => `#/reviews/${encodeId(r.id)}`,
  },
  {
    key: 'requisitions', type: 'requisition', moduleRoute: 'hiring',
    include: (r) => r && r.id && r.title,
    title: (r) => r.title,
    subtitle: (r) => joinHint(r.team, r.level, r.status),
    keywords: () => 'hiring role requisition job opening recruit',
    route: (r) => `#/hiring/${encodeId(r.id)}`,
  },
  {
    key: 'candidates', type: 'candidate', moduleRoute: 'hiring',
    include: (r) => r && r.id && r.name && r.reqId,
    title: (r) => r.name,
    subtitle: (r) => joinHint(r.stage, r.source),
    keywords: () => 'candidate hiring interview offer applicant',
    route: (r) => `#/hiring/${encodeId(r.reqId)}?candidate=${encodeId(r.id)}`,
  },
  {
    key: 'negotiations', type: 'negotiation', moduleRoute: 'negotiations',
    include: (r) => r && r.id && r.title,
    title: (r) => r.title,
    subtitle: (r) => joinHint(r.counterparty, r.status),
    keywords: () => 'negotiation deal contract counterparty vendor',
    route: (r) => `#/negotiations/${encodeId(r.id)}`,
  },
  {
    key: 'budgets', type: 'budget', moduleRoute: 'finance',
    include: (r) => r && r.id && r.name,
    title: (r) => r.name,
    subtitle: (r) => joinHint(r.currency, r.periodLabel, r.status),
    keywords: () => 'budget finance envelope money spend',
    route: (r) => `#/finance/${encodeId(r.id)}`,
  },
  {
    key: 'stakeholders', type: 'stakeholder', moduleRoute: 'stakeholders',
    include: (r) => r && r.id && r.name,
    title: (r) => r.name,
    subtitle: (r) => joinHint(r.org, r.role),
    keywords: () => 'stakeholder sponsor partner influence',
    route: (r) => `#/stakeholders/${encodeId(r.id)}`,
  },
  {
    key: 'changes', type: 'change', moduleRoute: 'changes',
    include: (r) => r && r.id && r.title,
    title: (r) => r.title,
    subtitle: (r) => joinHint(r.kind, r.status),
    keywords: () => 'change programme reorg rollout transition',
    route: (r) => `#/changes/${encodeId(r.id)}`,
  },
  {
    key: 'dependencies', type: 'dependency', moduleRoute: 'resilience',
    include: (r) => r && r.id && r.name,
    title: (r) => r.name,
    subtitle: (r) => joinHint(r.kind, r.criticality, r.status),
    keywords: () => 'dependency resilience continuity service system vendor',
    route: (r) => `#/resilience/${encodeId(r.id)}`,
  },
  {
    key: 'premises', type: 'premise', moduleRoute: 'premises',
    include: (r) => r && r.id && r.title,
    title: (r) => r.title,
    subtitle: (r) => joinHint(r.status, r.signpost),
    keywords: () => 'premise assumption belief test signpost',
    route: (r) => `#/premises?premise=${encodeId(r.id)}`,
  },
  {
    key: 'strategyBets', type: 'strategyBet', moduleRoute: 'strategy',
    include: (r) => r && r.id && r.title,
    title: (r) => r.title,
    subtitle: (r) => joinHint(r.kind, r.status),
    keywords: () => 'strategy bet where to play thesis',
    route: (r) => `#/strategy?bet=${encodeId(r.id)}`,
  },
  {
    key: 'impactStudies', type: 'impactStudy', moduleRoute: 'impact',
    include: (r) => r && r.id && r.title,
    title: (r) => r.title,
    subtitle: (r) => joinHint(r.status, r.interventionType),
    keywords: () => 'impact study hypothesis intervention lesson',
    route: (r) => `#/impact?study=${encodeId(r.id)}`,
  },
]);

/**
 * Safe quick actions. These are destinations, not mutations: the palette never
 * writes a record on Enter. A screen still applies its own gates, so the action
 * is only offered when that screen is readable at the acting altitude.
 */
export const QUICK_ACTIONS = Object.freeze([
  { id: 'capture', label: 'Describe a situation', hint: 'Capture → intake triage → command flow', icon: '⌁', route: '#/mission?panel=capture', moduleRoute: 'mission', keywords: 'capture situation new intake note triage issue risk decision command flow' },
  { id: 'one-on-one', label: 'Log a 1:1', hint: 'Conversation, agenda and follow-through', icon: '❯', route: '#/oneonones', moduleRoute: 'oneonones', keywords: 'one on one 1:1 meeting conversation check in log' },
  { id: 'checkup', label: 'Run a workspace checkup', hint: 'Storage, links, automation and integrity', icon: '✓', route: '#/checkup', moduleRoute: 'checkup', keywords: 'checkup doctor diagnostics integrity health storage schema' },
  { id: 'decision', label: 'Record a decision', hint: 'Options, owner, review date and timing', icon: '⑃', route: '#/decisions', moduleRoute: 'decisions', keywords: 'new decision daci call approve record' },
  { id: 'case', label: 'Open an operational case', hint: 'Risk, issue, decision or opportunity', icon: '⊞', route: '#/cases', moduleRoute: 'cases', keywords: 'new case incident risk issue opportunity' },
  { id: 'export', label: 'Export or back up data', hint: 'JSON, redacted copy, CSV and encrypted backup', icon: '⇩', route: '#/settings', moduleRoute: 'settings', keywords: 'export backup save download json csv restore import' },
  { id: 'automation', label: 'Automation control room', hint: 'Spine integrity, previews and failure receipts', icon: '⚙', route: '#/assurance', moduleRoute: 'assurance', keywords: 'automation rule receipt rehearse preview control room' },
  { id: 'efficiency', label: 'Efficiency & intelligence hub', hint: 'Measured cost, fused signals and automation ledger', icon: '⚡', route: '#/efficiency', moduleRoute: 'efficiency', keywords: 'efficiency performance speed signals intelligence hub' },
]);

/** One-line aliases for tools whose nav label is an abbreviation. */
export const TOOL_SEARCH_ALIASES = Object.freeze({
  oneonones: 'one on one 1:1 conversation check in',
  decisions: 'decision daci call approval',
  delegations: 'delegation task own delegate',
  cases: 'case risk issue incident operational',
  health: 'health pulse mood wellbeing',
  readiness: 'readiness succession bench',
  capacity: 'capacity flow workload planning',
  allocation: 'allocation explore exploit portfolio',
  load: 'load saturation attention governor',
  finance: 'finance budget spend envelope',
  eoy: 'year end',
  checkup: 'checkup doctor diagnostics integrity health status',
  efficiency: 'efficiency performance speed instrumentation automation intelligence',
  assurance: 'assurance automation control room rehearse preview',
  propagation: 'propagation ledger automation cost receipts',
  settings: 'settings export import backup thresholds data',
});

/**
 * Build the record half of the index.
 *
 * @param {object} state canonical workspace snapshot (already seat-projected by
 *   the shell when a seat is enforced)
 * @param {{canReadSource?: (moduleRoute: string) => boolean, maxPerSource?: number,
 *          maxTotal?: number}} [options]
 */
export function buildRecordIndex(state, options = {}) {
  const {
    canReadSource = () => true,
    maxPerSource = MAX_PER_SOURCE,
    maxTotal = MAX_TOTAL_RECORDS,
  } = options;
  const source = state && typeof state === 'object' ? state : {};
  const peopleById = new Map((Array.isArray(source.people) ? source.people : [])
    .filter((p) => p && p.id)
    .map((p) => [p.id, p]));
  const context = { peopleById };
  const items = [];
  const counts = {};
  const skippedSources = [];
  let truncated = 0;

  for (const definition of SEARCH_SOURCES) {
    if (!canReadSource(definition.moduleRoute)) {
      skippedSources.push(definition.moduleRoute);
      continue;
    }
    const rows = Array.isArray(source[definition.key]) ? source[definition.key] : [];
    let used = 0;
    for (const row of rows) {
      let title;
      try {
        if (!definition.include(row)) continue;
        title = definition.title(row, context);
      } catch {
        // A malformed imported row is skipped, never allowed to break search.
        continue;
      }
      if (!title) continue;
      if (used >= maxPerSource) { truncated += 1; continue; }
      const subtitle = (() => {
        try { return definition.subtitle(row, context) || ''; } catch { return ''; }
      })();
      const keywords = (() => {
        try { return definition.keywords(row, context) || ''; } catch { return ''; }
      })();
      const label = String(title);
      const hint = String(subtitle);
      items.push({
        kind: 'record',
        type: definition.type,
        id: String(row.id),
        label,
        hint,
        route: definition.route(row),
        moduleRoute: definition.moduleRoute,
        titleNorm: normalizeSearchText(label),
        hintNorm: normalizeSearchText(hint),
        keywordsNorm: normalizeSearchText(`${keywords} ${definition.type} ${definition.key}`),
      });
      used += 1;
    }
    if (used) counts[definition.key] = used;
  }

  // Per-source caps are counted as we skip them; the total cap is applied last
  // so `truncated` counts every eligible row the index withheld, not merely the
  // first row that crossed the line.
  if (items.length > maxTotal) {
    truncated += items.length - maxTotal;
    items.length = Math.max(0, maxTotal);
  }

  return {
    items,
    total: items.length,
    truncated,
    counts,
    skippedSources: [...new Set(skippedSources)],
    sources: SEARCH_SOURCES.length,
  };
}

/** Flatten the nav into one de-duplicated tool list. Pure. */
export function buildToolIndex(groups, options = {}) {
  const { canReadRoute = () => true } = options;
  const seen = new Set();
  const items = [];
  for (const group of Array.isArray(groups) ? groups : []) {
    for (const entry of Array.isArray(group?.items) ? group.items : []) {
      if (!entry || !entry.route || seen.has(entry.route)) continue;
      seen.add(entry.route);
      if (!canReadRoute(entry.route, entry)) continue;
      const label = entry.label || entry.route;
      const hint = group.section || 'Workspace tool';
      items.push({
        kind: 'tool',
        id: `tool:${entry.route}`,
        type: 'tool',
        label,
        hint,
        route: `#/${entry.route}`,
        moduleRoute: entry.route,
        icon: entry.icon || '·',
        titleNorm: normalizeSearchText(label),
        hintNorm: normalizeSearchText(hint),
        keywordsNorm: normalizeSearchText(`${entry.route} ${hint} ${TOOL_SEARCH_ALIASES[entry.route] || ''} tool screen page`),
      });
    }
  }
  return items;
}

/** Build the safe action half. Rendered command objects are navigation only. */
export function buildActionIndex(actions, options = {}) {
  const { canReadRoute = () => true } = options;
  return (Array.isArray(actions) ? actions : [])
    .filter((action) => action && action.route && canReadRoute(action.moduleRoute || action.route, action))
    .map((action) => ({
      kind: 'action',
      id: action.id || `action:${action.route}`,
      type: 'action',
      label: action.label,
      hint: action.hint || 'Quick action',
      route: action.route,
      moduleRoute: action.moduleRoute || action.route,
      icon: action.icon || '→',
      titleNorm: normalizeSearchText(action.label),
      hintNorm: normalizeSearchText(action.hint || ''),
      keywordsNorm: normalizeSearchText(`${action.keywords || ''} action quick run go`),
    }));
}

/**
 * Build the complete catalog the palette searches. The shell memoises this on
 * (state object, acting seat, UTC day); this function itself is pure.
 */
export function buildSearchCatalog({ state, groups, actions = [], canReadRoute = () => true, canReadSource = canReadRoute, now = null } = {}) {
  const tools = buildToolIndex(groups, { canReadRoute });
  const actionItems = buildActionIndex(actions, { canReadRoute });
  const records = buildRecordIndex(state, { canReadSource });
  return {
    tools,
    actions: actionItems,
    records: records.items,
    stats: {
      tools: tools.length,
      actions: actionItems.length,
      records: records.total,
      recordTruncated: records.truncated,
      recordSources: records.sources,
      skippedRecordSources: records.skippedSources,
      builtAt: now instanceof Date ? now.toISOString() : null,
    },
  };
}

function fieldScore(value, token) {
  if (!value || !token) return 0;
  if (value === token) return 140;
  if (value.startsWith(token)) return 90;
  // A word boundary is a stronger hit than a random substring. Values are
  // already normalised to single spaces, so this is a substring test rather
  // than a compiled regular expression per token per field on every keystroke.
  if (value.startsWith(`${token} `) || value.includes(` ${token}`)) return 70;
  if (value.includes(token)) return 38;
  if (token.length >= 4) {
    for (const word of value.split(' ')) {
      if (word.length >= 3 && withinOneEdit(word, token)) return 26;
    }
  }
  return 0;
}

function itemScore(item, tokens, fullQuery) {
  let total = 0;
  for (const token of tokens) {
    const best = Math.max(
      fieldScore(item.titleNorm, token),
      fieldScore(item.hintNorm, token) * 0.55,
      fieldScore(item.keywordsNorm, token) * 0.4,
    );
    if (best <= 0) return 0;
    total += best;
  }
  if (item.titleNorm === fullQuery) total += 500;
  else if (item.titleNorm.startsWith(fullQuery)) total += 120;
  // Stable, small type preference when the text matches equally: a command
  // named "Cases" should sit above the 40th case whose title contains it.
  if (item.kind === 'action') total += 8;
  if (item.kind === 'tool') total += 4;
  return total;
}

const GROUP_LABELS = Object.freeze({ action: 'Actions', tool: 'Tools', record: 'Records' });
const GROUP_ORDER = Object.freeze(['action', 'tool', 'record']);
const DEFAULT_LIMITS = Object.freeze({ action: 4, tool: 8, record: 12 });

/**
 * Rank an existing catalog. All query tokens must match somewhere: "billing
 * cutover" is two facts, not either one. Returns grouped results plus a flat
 * ordered list for keyboard navigation.
 */
export function searchCatalog(catalog, rawQuery, { limits = DEFAULT_LIMITS } = {}) {
  const fullQuery = normalizeSearchText(rawQuery);
  if (!fullQuery) {
    return { query: rawQuery, tokens: [], groups: [], flat: [], count: 0, empty: true };
  }
  const tokens = queryTokens(fullQuery);
  const byKind = { action: [], tool: [], record: [] };
  for (const kind of GROUP_ORDER) {
    const pool = Array.isArray(catalog?.[`${kind}s`]) ? catalog[`${kind}s`] : [];
    const scored = [];
    for (const item of pool) {
      const score = itemScore(item, tokens, fullQuery);
      if (score > 0) scored.push({ ...item, score });
    }
    scored.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label) || String(a.route).localeCompare(String(b.route)));
    byKind[kind] = scored.slice(0, limits[kind] ?? DEFAULT_LIMITS[kind]);
  }
  const groups = GROUP_ORDER
    .map((kind) => ({ kind, label: GROUP_LABELS[kind], items: byKind[kind] }))
    .filter((group) => group.items.length);
  const flat = groups.flatMap((group) => group.items);
  return { query: rawQuery, tokens, groups, flat, count: flat.length, empty: false };
}

function queryTokens(query) {
  // Kept as a named helper so the token ceiling is explicit and testable.
  return query.split(' ').filter(Boolean).slice(0, 6);
}
