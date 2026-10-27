/**
 * app/core/domain/orgNetwork.js — "Constellation": Influence & Collaboration
 * Network Intelligence (Session 48).
 *
 * WHY THIS EXISTS
 * ---------------
 * LeadOS already owns a typed cross-module relationship graph (`links`) and a
 * dozen leadership records that name people. But it never asked the question a
 * chief people officer asks on day one: *who actually holds this team together,
 * where are the structural holes, and what happens to the org if one specific
 * person leaves?* Organizational Network Analysis (ONA) answers that — but the
 * commercial tools that do it (Windmill, Polinode, Microsoft Viva Insights,
 * TrustSphere) infer the network from email/chat/calendar surveillance. That is
 * privacy-invasive, unavailable to a first-time manager, and illegal to deploy
 * casually under GDPR/EU AI Act. LeadOS can do it differently: derive the
 * network *entirely from the leader's own typed records* — no telemetry, no
 * eavesdropping, no scoring of individuals — and fuse it with the succession /
 * operational-stewardship data the app already holds.
 *
 * This is a pure, deterministic computational engine. No DOM, storage, network,
 * LLM or wall-clock globals. An injected clock reaches only the post-commit
 * rule. Every number is derived from records the leader entered; unknown data
 * stays unknown (never a fabricated zero).
 *
 * NAMED METHODS (all implemented, not named in passing)
 * ----------------------------------------------------
 *  - Bipartite co-affiliation projection (Newman, 2001; Latapy et al., 2008):
 *    people are linked when they co-appear in a shared work context (case,
 *    decision, delegation, change, dependency, war-room game, typed link...).
 *    Edge weight = number of distinct shared contexts. No self-edges.
 *  - Freeman (1978/1979) degree, betweenness & closeness centrality.
 *  - Brandes (2001) O(V·E) betweenness (unweighted shortest paths = hops),
 *    normalised by (n-1)(n-2)/2, plus Freeman betweenness centralization.
 *  - Wasserman–Faust normalised closeness for disconnected graphs.
 *  - Page/Brin/Motwani/Winograd (1999) PageRank (weighted, damped power
 *    iteration) as "influence" — the probability a random walk over the
 *    collaboration graph lands on a person. Converges deterministically.
 *  - Watts–Strogatz (1998) local clustering coefficient (weighted generalisation).
 *  - Burt (1992) network constraint / structural holes: c_ij = (p_ij +
 *    Σ_q p_iq·p_qj)². Low constraint = the person bridges otherwise
 *    disconnected groups (a brokerage opportunity / structural hole).
 *  - Tarjan articulation points & bridges: single people/edges whose removal
 *    disconnects the collaboration graph.
 *  - Network efficiency (Latora & Marchiori, 2001) + node-removal criticality:
 *    a deterministic structural key-person stress test — what fraction of the
 *    team's connectivity is lost if one person is unavailable.
 *
 * What the engine deliberately does NOT do: it never rates a person, never
 * infers sentiment, never reads communications, never converts money/utility,
 * never treats a structural position as a performance judgment, and never
 * claims these metrics predict behaviour. They are facts about the recorded
 * work graph, nothing more. All findings are blameless.
 */

import { LINK_ENTITY_TYPES, LINK_RELATIONS, FORBIDDEN_LINK_TYPES } from './cases.js';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

export const ORG_ENGINE_VERSION = 'orgnet-2026.10-v1';
/** Below this many active people the network is not measurable (counts only). */
export const ORG_MIN_TEAM = 2;
/** Hard cap so Brandes / node-removal analysis can never block the main thread. */
export const ORG_MAX_TEAM = 60;
/** Normalised betweenness at/above which a person is a "broker". */
export const ORG_BROKER_BETWEENNESS = 0.12;
/** Freeman betweenness centralization at/above which brokerage is concentrated. */
export const ORG_CENTRALIZATION_WARN = 0.3;
/** Burt constraint at/below which an ego network spans a structural hole. */
export const ORG_HOLE_CONSTRAINT = 0.55;
/** Default minimum shared contexts before two people count as connected. */
export const ORG_MIN_SHARED_DEFAULT = 1;
/** Efficiency loss at/above which a person is structurally "load-bearing". */
export const ORG_CRITICAL_EFFICIENCY_LOSS = 0.18;

export const ORG_FLAGS = Object.freeze([
  'isolated', 'peripheral', 'broker', 'bridge', 'hub', 'key-person', 'structural-hole',
]);
export const ORG_FLAG_LABELS = Object.freeze({
  isolated: 'Isolated — no recorded collaboration tie',
  peripheral: 'Peripheral — few recorded ties',
  broker: 'Broker — sits on many shortest paths',
  bridge: 'Bridge — single point of connection',
  hub: 'Hub — connected to influential people',
  'key-person': 'Structural key-person — hard to replace',
  'structural-hole': 'Structural hole — spans disconnected groups',
});

/** Catalog descriptors for AUTOMATION_RULES (the one rules spine). */
export const ORG_RULES = Object.freeze([
  {
    id: 'RULE-ORG-01',
    name: 'Influence-network derived graph links',
    framework: 'Newman (2001) bipartite co-affiliation projection',
    trigger: 'network.rescan / declared rules:[network]',
    targetModule: 'links / graph',
    description: 'Reconciles typed person↔person collaboration links from the co-affiliation projection, so structural position is navigable in the cross-module relationship graph. Idempotent; writes nothing when a person has no peer ties.',
  },
  {
    id: 'RULE-ORG-02',
    name: 'Structural key-person cross-training delegation',
    framework: 'Burt (1992) structural holes × Simchi-Levi continuity stewardship',
    trigger: 'network.rescan / declared rules:[network]',
    targetModule: 'delegations / people',
    description: 'For a load-bearing broker who is also the sole verified steward of operational dependencies with no verified backup, opens one blameless cross-training delegation plus a 1:1 talking point. Never a performance rating.',
  },
  {
    id: 'RULE-ORG-03',
    name: 'Fragmented-network org-design decision',
    framework: 'Freeman centralization × Tarjan articulation points',
    trigger: 'network.rescan / declared rules:[network]',
    targetModule: 'decisions',
    description: 'When the active team splits into two or more disconnected clusters, opens one DACI org-design decision to reconnect them. It is a first-class decision record, so Decision Tempo and the wider decisions module see it without re-entry — a priced one is timeboxed on their normal triggers.',
  },
  {
    id: 'RULE-ORG-04',
    name: 'Isolated-member 1:1 coaching prompt',
    framework: 'Granovetter (1973) weak ties × Edmondson (1999) psychological safety',
    trigger: 'network.rescan / declared rules:[network]',
    targetModule: 'people / 1:1 prep',
    description: 'Queues a blameless 1:1 talking point for a team member with no recorded collaboration ties, so the leader checks in rather than letting an isolate drift. Self-cleans when a tie appears.',
  },
  {
    id: 'RULE-ORG-05',
    name: 'Broker concentration off-load prompt',
    framework: 'Freeman betweenness centralization × Brooks’s Law',
    trigger: 'network.rescan / declared rules:[network]',
    targetModule: 'people / 1:1 prep',
    description: 'When one person brokers a dominant share of cross-team flow, queues a blameless 1:1 talking point about distributing connections and verifying capacity — a coordination risk, not a judgment.',
  },
]);

/* ------------------------------------------------------------------ */
/* Small pure helpers                                                  */
/* ------------------------------------------------------------------ */

const round = (n, dp = 4) => (Number.isFinite(n) ? Math.round(n * 10 ** dp) / 10 ** dp : null);
const pairKey = (a, b) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);

/** Collections that can name people and therefore act as work contexts. */
const CONTEXT_COLLECTIONS = [
  'cases', 'decisions', 'delegations', 'goals', 'growthPlans', 'oneOnOnes',
  'feedback', 'reviews', 'recognition', 'onboarding', 'readiness',
  'requisitions', 'changes', 'negotiations', 'budgets', 'dependencies',
  'powerGames', 'stakeholders', 'forecastChallenges', 'managerSupport',
];
/** Confidential / anonymous collections never enter the general work graph. */
const SKIP_COLLECTIONS = new Set(['conflicts', 'pulses']);

/** Map a plural collection name to the singular link entity type (for merging). */
const COLLECTION_TYPE = {
  cases: 'case', decisions: 'decision', delegations: 'delegation', goals: 'goal',
  growthPlans: 'growth', oneOnOnes: 'oneonone', feedback: 'feedback',
  reviews: 'review', recognition: 'recognition', onboarding: 'onboarding',
  readiness: 'readiness', requisitions: 'requisition', changes: 'change',
  negotiations: 'negotiation', budgets: 'budget', dependencies: 'dependency',
  powerGames: 'power', stakeholders: 'stakeholder', forecastChallenges: 'forecast',
  managerSupport: 'managerSupport',
};

/** Object keys whose string values may hold a person's name (free text). */
const NAME_HINT = /^(name|personName|displayName|stakeholderName|buddyName|ownerName|contactName|driver|approver|contributors|informed|decider|sponsor|owner|lead|reviewer|counterparty|assignee|member|members|attendee|attendees|contact|stakeholders|coalition|stewards|players|participants|people|team|reviewers|buddies|partners)$/i;
/** Object keys that are known to hold record IDs (excluded from name matching). */
const ID_HINT = /id$/i;

function normName(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildNameIndex(people) {
  const index = new Map();
  const firstCounts = new Map();
  for (const p of people) {
    const full = normName(p.name);
    if (full) index.set(full, p.id);
    const first = full.split(' ')[0];
    if (first && first.length >= 3) firstCounts.set(first, (firstCounts.get(first) || 0) + 1);
  }
  // Only unambiguous first names become aliases (avoids "Sam" -> two people).
  for (const p of people) {
    const first = normName(p.name).split(' ')[0];
    if (first && first.length >= 3 && firstCounts.get(first) === 1 && !index.has(first)) {
      index.set(first, p.id);
    }
  }
  return index;
}

function matchNames(value, nameIndex, acc) {
  const text = String(value);
  // Split on common separators and parenthetical qualifiers.
  const tokens = text.split(/[,;/&·()]|\band\b/i).map(normName).filter((t) => t.length >= 3);
  for (const tok of tokens) {
    if (nameIndex.has(tok)) { acc.add(nameIndex.get(tok)); continue; }
    for (const [nm, pid] of nameIndex) {
      if (nm.length >= 4 && (tok === nm || tok.includes(` ${nm} `) || tok.startsWith(`${nm} `) || tok.endsWith(` ${nm}`))) {
        acc.add(pid);
      }
    }
  }
}

/**
 * Deep-scan a record for person references. Exact person IDs are matched
 * everywhere (safe — IDs are unique tokens). Names are matched only under
 * participant-ish keys, to avoid free-text notes fabricating collaborations.
 */
function scanForPeople(node, nameEligible, depth, acc, ctx) {
  if (node == null || depth > 6) return;
  const t = typeof node;
  if (t === 'string') {
    if (ctx.personIds.has(node)) { acc.add(node); return; }
    if (nameEligible) matchNames(node, ctx.nameIndex, acc);
    return;
  }
  if (t === 'number' || t === 'boolean') return;
  if (Array.isArray(node)) {
    for (const v of node) scanForPeople(v, nameEligible, depth + 1, acc, ctx);
    return;
  }
  if (t === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (SKIP_FIELDS.has(k)) continue;
      // Eligibility is decided per key, not inherited: once inside a
      // participant container (e.g. stakeholders[]), only name-ish leaf keys
      // are name-matched, so free-text `notes`/`purpose` cannot invent ties.
      // Exact person IDs are still matched on every string regardless.
      const eligible = NAME_HINT.test(k) && !ID_HINT.test(k);
      scanForPeople(v, eligible, depth + 1, acc, ctx);
    }
  }
}
const SKIP_FIELDS = new Set(['password', 'passphrase', 'salt', 'cipherText', 'iv']);

/* ------------------------------------------------------------------ */
/* 1. Affiliation collection + bipartite projection                    */
/* ------------------------------------------------------------------ */

/**
 * Build the person↔context bipartite affiliation map from the whole workspace.
 * Returns a Map of contextKey -> { key, type, label, people:Set<string> }.
 * Pure: reads state, writes nothing.
 */
export function collectAffiliations(state = {}) {
  const people = (state.people || []).filter((p) => p && p.status !== 'archived' && p.id);
  const personIds = new Set(people.map((p) => p.id));
  const nameIndex = buildNameIndex(people);
  const ctx = { personIds, nameIndex };
  const contexts = new Map();

  const ensureContext = (key, type, label) => {
    if (!contexts.has(key)) contexts.set(key, { key, type, label: label || type, people: new Set() });
    return contexts.get(key);
  };

  // (a) Person references embedded directly in each collection record.
  for (const collection of CONTEXT_COLLECTIONS) {
    if (SKIP_COLLECTIONS.has(collection)) continue;
    const records = Array.isArray(state[collection]) ? state[collection] : [];
    const type = COLLECTION_TYPE[collection] || collection;
    for (const record of records) {
      if (!record || typeof record !== 'object') continue;
      const key = `${type}:${record.id ?? record.key ?? ''}`;
      const acc = new Set();
      scanForPeople(record, false, 0, acc, ctx);
      for (const id of acc) personIds.has(id) && contextAdd(contexts, ensureContext, key, type, record, id);
    }
  }

  // (b) The typed cross-module relationship graph. A link between two people is
  // a direct tie; a link between a person and an entity adds that person to the
  // entity's context (merged by the same type:id key as (a)). Confidential
  // conflict/pulse endpoints are excluded.
  for (const link of (state.links || [])) {
    if (!link || typeof link !== 'object') continue;
    const sType = link.sourceType; const tType = link.targetType;
    if (FORBIDDEN_LINK_TYPES.includes(sType) || FORBIDDEN_LINK_TYPES.includes(tType)) continue;
    const sPerson = sType === 'person' && personIds.has(link.sourceId);
    const tPerson = tType === 'person' && personIds.has(link.targetId);
    if (sPerson && tPerson) {
      const key = `link:${link.id}`;
      const c = ensureContext(key, 'link', 'Direct person↔person link');
      c.people.add(link.sourceId); c.people.add(link.targetId);
    } else if (sPerson || tPerson) {
      const pid = sPerson ? link.sourceId : link.targetId;
      const eType = sPerson ? tType : sType;
      const eId = sPerson ? link.targetId : link.sourceId;
      const key = `${eType}:${eId}`;
      contextAdd(contexts, ensureContext, key, eType, { summary: link.summary, title: link.summary }, pid);
    }
  }

  return { people, personIds, contexts: [...contexts.values()].filter((c) => c.people.size > 0) };
}

function contextAdd(contexts, ensureContext, key, type, record, id) {
  const c = ensureContext(key, type, record.title || record.name || record.question || record.summary || type);
  c.people.add(id);
  return c;
}

/**
 * Count distinct shared work contexts for each unordered person pair. This is
 * the bipartite co-affiliation projection's weight table, exposed separately so
 * the tie-strength floor can be resolved from the same data (no double work).
 */
export function sharedPairCounts(affiliations) {
  const shared = new Map(); // pairKey -> { a, b, count, contexts:Set }
  for (const context of affiliations.contexts || []) {
    const members = [...context.people].filter((id) => affiliations.personIds.has(id)).sort();
    for (let i = 0; i < members.length; i += 1) {
      for (let j = i + 1; j < members.length; j += 1) {
        const a = members[i]; const b = members[j]; const pk = pairKey(a, b);
        if (!shared.has(pk)) shared.set(pk, { a, b, count: 0, contexts: new Set() });
        const entry = shared.get(pk);
        // A single context counts once even if referenced twice.
        if (!entry.contexts.has(context.key)) { entry.contexts.add(context.key); entry.count += 1; }
      }
    }
  }
  return shared;
}

/**
 * Resolve the tie-strength floor (minimum shared contexts for an edge). Co-
 * affiliation over many contexts tends to produce a near-complete graph that
 * hides real structure. A RELATIVE strong-tie backbone fixes this honestly: a
 * tie must be at least `networkTiePct`% as strong as the team's strongest tie.
 * `minShared` (absolute) is a hard floor. Both are leader-configurable; the
 * rule never invents data, it only decides which real ties to visualise.
 */
export function resolveTieFloor(affiliations, settings = {}, opts = {}) {
  const shared = sharedPairCounts(affiliations);
  const maxW = Math.max(0, ...[...shared.values()].map((e) => e.count));
  const pctRaw = Number(settings.networkTiePct);
  const pct = Number.isFinite(pctRaw) ? Math.min(90, Math.max(0, pctRaw)) / 100 : 0.5;
  const relative = maxW > 0 ? Math.ceil(pct * maxW) : 1;
  const absolute = Number.isFinite(opts.minShared) ? Math.max(1, Math.round(opts.minShared)) : 1;
  const floor = Math.max(1, relative, absolute);
  return { floor, relative, maxWeight: maxW, pct: Math.round(pct * 100), absolute, shared };
}

/**
 * Project the bipartite affiliations onto a weighted, undirected person–person
 * graph. Two people are connected by the number of distinct shared contexts,
 * provided that count clears the tie-strength floor.
 */
export function projectPersonGraph(affiliations, { minShared = ORG_MIN_SHARED_DEFAULT } = {}) {
  const people = affiliations.people || [];
  const ids = people.map((p) => p.id);
  const shared = sharedPairCounts(affiliations);

  const nodes = people.map((p) => ({ id: p.id, name: p.name }));
  const adjacency = new Map(ids.map((id) => [id, new Map()]));
  const edges = [];
  for (const entry of shared.values()) {
    if (entry.count < minShared) continue;
    adjacency.get(entry.a)?.set(entry.b, entry.count);
    adjacency.get(entry.b)?.set(entry.a, entry.count);
    edges.push({ a: entry.a, b: entry.b, weight: entry.count, shared: [...entry.contexts] });
  }
  edges.sort((x, y) => y.weight - x.weight || x.a.localeCompare(y.a) || x.b.localeCompare(y.b));
  return { nodes, ids, edges, adjacency };
}

/* ------------------------------------------------------------------ */
/* 2. Graph primitives (BFS, components, Tarjan)                       */
/* ------------------------------------------------------------------ */

export function bfsDistances(adjacency, source) {
  const dist = new Map([[source, 0]]);
  const queue = [source];
  let head = 0;
  while (head < queue.length) {
    const u = queue[head]; head += 1;
    const du = dist.get(u);
    for (const v of (adjacency.get(u) || new Map()).keys()) {
      if (!dist.has(v)) { dist.set(v, du + 1); queue.push(v); }
    }
  }
  return dist;
}

export function connectedComponents(graph) {
  const seen = new Set();
  const components = [];
  for (const id of graph.ids) {
    if (seen.has(id)) continue;
    const stack = [id]; const comp = [];
    seen.add(id);
    while (stack.length) {
      const u = stack.pop(); comp.push(u);
      for (const v of (graph.adjacency.get(u) || new Map()).keys()) {
        if (!seen.has(v)) { seen.add(v); stack.push(v); }
      }
    }
    comp.sort();
    components.push(comp);
  }
  components.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
  return components;
}

/** Tarjan articulation points and bridges over the binary edge structure. */
export function articulationPointsAndBridges(graph) {
  const disc = new Map(); const low = new Map(); const parent = new Map();
  const articulation = new Set(); const bridges = [];
  let time = 0;
  const adj = graph.adjacency;
  const dfs = (u) => {
    disc.set(u, time); low.set(u, time); time += 1;
    let children = 0;
    for (const v of (adj.get(u) || new Map()).keys()) {
      if (!disc.has(v)) {
        parent.set(v, u); children += 1;
        dfs(v);
        low.set(u, Math.min(low.get(u), low.get(v)));
        if (parent.get(u) === undefined && children > 1) articulation.add(u);
        if (parent.get(u) !== undefined && low.get(v) >= disc.get(u)) articulation.add(u);
        if (low.get(v) > disc.get(u)) bridges.push({ a: u, b: v });
      } else if (v !== parent.get(u)) {
        low.set(u, Math.min(low.get(u), disc.get(v)));
      }
    }
  };
  for (const id of graph.ids) if (!disc.has(id)) dfs(id);
  return { articulation, bridges };
}

/* ------------------------------------------------------------------ */
/* 3. Centrality / position metrics                                    */
/* ------------------------------------------------------------------ */

/** Freeman degree centrality (normalised weighted + unweighted degree). */
export function degreeCentrality(graph) {
  const n = graph.ids.length;
  const out = new Map();
  for (const id of graph.ids) {
    const m = graph.adjacency.get(id) || new Map();
    const degree = m.size;
    const strength = [...m.values()].reduce((s, w) => s + w, 0);
    out.set(id, { degree, strength, degreeNorm: n > 1 ? round(degree / (n - 1)) : 0 });
  }
  return out;
}

/** Brandes (2001) betweenness centrality; returns raw + normalised scores. */
export function betweennessCentrality(graph) {
  const raw = new Map(graph.ids.map((id) => [id, 0]));
  const adj = graph.adjacency;
  for (const s of graph.ids) {
    const stack = []; const pred = new Map(graph.ids.map((w) => [w, []]));
    const sigma = new Map(graph.ids.map((w) => [w, 0])); sigma.set(s, 1);
    const dist = new Map(graph.ids.map((w) => [w, -1])); dist.set(s, 0);
    const queue = [s]; let head = 0;
    while (head < queue.length) {
      const v = queue[head]; head += 1; stack.push(v);
      for (const w of (adj.get(v) || new Map()).keys()) {
        if (dist.get(w) < 0) { queue.push(w); dist.set(w, dist.get(v) + 1); }
        if (dist.get(w) === dist.get(v) + 1) { sigma.set(w, sigma.get(w) + sigma.get(v)); pred.get(w).push(v); }
      }
    }
    const delta = new Map(graph.ids.map((w) => [w, 0]));
    while (stack.length) {
      const w = stack.pop();
      for (const v of pred.get(w)) {
        const c = (sigma.get(v) / sigma.get(w)) * (1 + delta.get(w));
        delta.set(v, delta.get(v) + c);
      }
      if (w !== s) raw.set(w, raw.get(w) + delta.get(w));
    }
  }
  // Undirected: each pair counted twice.
  for (const id of graph.ids) raw.set(id, raw.get(id) / 2);
  const n = graph.ids.length;
  const denom = n > 2 ? ((n - 1) * (n - 2)) / 2 : 1;
  const normalized = new Map(graph.ids.map((id) => [id, round(raw.get(id) / denom)]));
  // Freeman betweenness centralization over raw scores.
  const max = Math.max(0, ...raw.values());
  const denomC = n > 2 ? ((n - 1) ** 2 * (n - 2)) / 2 : 1;
  const sumDiff = graph.ids.reduce((s, id) => s + (max - raw.get(id)), 0);
  const centralization = denomC > 0 ? round(sumDiff / denomC) : 0;
  return { raw, normalized, centralization };
}

/** Wasserman–Faust normalised closeness for disconnected graphs. */
export function closenessCentrality(graph) {
  const n = graph.ids.length;
  const out = new Map();
  for (const id of graph.ids) {
    const dist = bfsDistances(graph.adjacency, id);
    const reachable = [...dist.entries()].filter(([v, d]) => v !== id && d > 0);
    const r = reachable.length + 1;
    const sumD = reachable.reduce((s, [, d]) => s + d, 0);
    out.set(id, r > 1 && sumD > 0 && n > 1 ? round(((r - 1) ** 2) / ((n - 1) * sumD)) : 0);
  }
  return out;
}

/** Weighted PageRank (power iteration) as "influence". Deterministic. */
export function pageRankCentrality(graph, { damping = 0.85, iterations = 100, tolerance = 1e-10 } = {}) {
  const n = graph.ids.length;
  if (!n) return new Map();
  let rank = new Map(graph.ids.map((id) => [id, 1 / n]));
  const outStrength = new Map();
  for (const id of graph.ids) outStrength.set(id, [...(graph.adjacency.get(id) || new Map()).values()].reduce((s, w) => s + w, 0));
  for (let it = 0; it < iterations; it += 1) {
    const next = new Map(graph.ids.map((id) => [id, (1 - damping) / n]));
    // Dangling nodes redistribute their rank uniformly.
    let dangling = 0;
    for (const id of graph.ids) if (!outStrength.get(id)) dangling += rank.get(id);
    for (const id of graph.ids) next.set(id, next.get(id) + damping * dangling / n);
    for (const id of graph.ids) {
      const strength = outStrength.get(id);
      if (!strength) continue;
      for (const [v, w] of graph.adjacency.get(id)) {
        next.set(v, next.get(v) + damping * rank.get(id) * (w / strength));
      }
    }
    let diff = 0;
    for (const id of graph.ids) diff += Math.abs(next.get(id) - rank.get(id));
    rank = next;
    if (diff < tolerance) break;
  }
  return new Map(graph.ids.map((id) => [id, round(rank.get(id))]));
}

/** Weighted local clustering coefficient (0 for degree < 2). */
export function clusteringCoefficient(graph) {
  const out = new Map();
  for (const id of graph.ids) {
    const neigh = [...(graph.adjacency.get(id) || new Map()).keys()];
    if (neigh.length < 2) { out.set(id, 0); continue; }
    const weights = graph.adjacency.get(id);
    const maxW = Math.max(1, ...weights.values());
    let triples = 0; let triangles = 0;
    for (let i = 0; i < neigh.length; i += 1) {
      for (let j = i + 1; j < neigh.length; j += 1) {
        triples += 1;
        const w = graph.adjacency.get(neigh[i])?.get(neigh[j]);
        if (w) triangles += Math.sqrt((weights.get(neigh[i]) / maxW) * (weights.get(neigh[j]) / maxW)) * (w / maxW);
      }
    }
    out.set(id, triples > 0 ? round(Math.min(1, triangles / triples)) : 0);
  }
  return out;
}

/** Burt (1992) network constraint; lower value = more structural holes. */
export function burtConstraint(graph) {
  const out = new Map();
  // p[i][j] = proportion of i's tie strength allocated to j.
  const p = new Map();
  for (const id of graph.ids) {
    const m = graph.adjacency.get(id) || new Map();
    const total = [...m.values()].reduce((s, w) => s + w, 0);
    const row = new Map();
    if (total > 0) for (const [v, w] of m) row.set(v, w / total);
    p.set(id, row);
  }
  for (const id of graph.ids) {
    const row = p.get(id);
    if (row.size === 0) { out.set(id, null); continue; } // unmeasured, not a fabricated 1
    if (row.size === 1) { out.set(id, 1); continue; } // a single alter fully constrains
    let C = 0;
    for (const [j, pij] of row) {
      let local = pij;
      for (const q of row.keys()) {
        if (q === j) continue;
        const pqj = p.get(q)?.get(j) || 0;
        local += (row.get(q) || 0) * pqj;
      }
      C += local ** 2;
    }
    out.set(id, round(C));
  }
  return out;
}

export function graphDensity(graph) {
  const n = graph.ids.length;
  if (n < 2) return 0;
  return round((2 * graph.edges.length) / (n * (n - 1)));
}

/* ------------------------------------------------------------------ */
/* 4. Node-removal criticality (structural key-person stress test)     */
/* ------------------------------------------------------------------ */

/** Latora–Marchiori global efficiency over the current node set (unweighted hops). */
export function networkEfficiency(adjacency, ids) {
  const n = ids.length;
  if (n < 2) return 0;
  let sum = 0;
  for (const id of ids) {
    const dist = bfsDistances(adjacency, id);
    for (const [v, d] of dist) if (v !== id && d > 0) sum += 1 / d;
  }
  return round(sum / (n * (n - 1)));
}

/** Deterministically rewire a graph without one node. */
function graphWithout(graph, removed) {
  const ids = graph.ids.filter((id) => id !== removed);
  const adjacency = new Map(ids.map((id) => [id, new Map()]));
  for (const e of graph.edges) {
    if (e.a === removed || e.b === removed) continue;
    adjacency.get(e.a)?.set(e.b, e.weight);
    adjacency.get(e.b)?.set(e.a, e.weight);
  }
  return { ids, adjacency, edges: graph.edges.filter((e) => e.a !== removed && e.b !== removed) };
}

/**
 * Structural impact of removing one person: how much connectivity is lost.
 * This is a *graph* stress test, not a prediction of anyone's behaviour.
 */
export function removalImpact(graph, nodeId) {
  const compsBefore = connectedComponents(graph);
  const effBefore = networkEfficiency(graph.adjacency, graph.ids);
  const without = graphWithout(graph, nodeId);
  const compsAfter = connectedComponents(without);
  const effAfter = networkEfficiency(without.adjacency, without.ids);
  const largestBefore = compsBefore.length ? compsBefore[0].length : 0;
  const largestAfter = compsAfter.length ? compsAfter[0].length : 0;
  return {
    componentsBefore: compsBefore.length,
    componentsAfter: compsAfter.length,
    fragmentsBy: Math.max(0, compsAfter.length - compsBefore.length),
    largestBefore,
    largestAfter,
    efficiencyBefore: effBefore,
    efficiencyAfter: effAfter,
    efficiencyLoss: effBefore > 0 ? round(Math.max(0, effBefore - effAfter) / effBefore) : 0,
    isolatesAfter: compsAfter.filter((c) => c.length === 1).length,
  };
}

/* ------------------------------------------------------------------ */
/* 5. Succession / stewardship fusion                                 */
/* ------------------------------------------------------------------ */

/**
 * A person is operationally load-bearing when they are the PRIMARY steward of
 * dependencies that have no VERIFIED backup (resilience Bus Factor firewall),
 * or a ready successor is not recorded. Returns a Map of personId -> facts.
 */
export function stewardshipFusion(state = {}) {
  const out = new Map();
  const dependencies = Array.isArray(state.dependencies) ? state.dependencies : [];
  for (const dep of dependencies) {
    if (!dep || !Array.isArray(dep.stewards)) continue;
    const verified = (s) => s && s.personId && s.verifiedOn && s.role !== 'trainee';
    const primary = dep.stewards.find((s) => s && s.role === 'primary' && s.personId);
    const hasBackup = dep.stewards.some((s) => s && s.role === 'backup' && verified(s));
    if (!primary) continue;
    if (!out.has(primary.personId)) out.set(primary.personId, { primaryOf: 0, unverifiedBackup: 0, dependencies: [] });
    const rec = out.get(primary.personId);
    rec.primaryOf += 1;
    rec.dependencies.push(dep.id);
    if (!hasBackup) rec.unverifiedBackup += 1;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 6. Assembled analysis + report                                      */
/* ------------------------------------------------------------------ */

/** Full deterministic network analysis over a workspace. */
export function analyzeNetwork(state = {}, { minShared = ORG_MIN_SHARED_DEFAULT, now = new Date() } = {}) {
  const affiliations = collectAffiliations(state);
  const people = affiliations.people;
  const n = people.length;
  if (n < ORG_MIN_TEAM) {
    return { ok: false, reason: 'too-few-people', engineVersion: ORG_ENGINE_VERSION, people, nodeCount: n, contextCount: affiliations.contexts.length };
  }
  const capped = people.slice(0, ORG_MAX_TEAM);
  const aff = { people: capped, personIds: new Set(capped.map((p) => p.id)), contexts: affiliations.contexts };
  const settings = state.settings || {};
  const tie = resolveTieFloor(aff, settings, { minShared });
  const effectiveFloor = tie.floor;
  const graph = projectPersonGraph(aff, { minShared: effectiveFloor });

  const degree = degreeCentrality(graph);
  const betweenness = betweennessCentrality(graph);
  const closeness = closenessCentrality(graph);
  const pageRank = pageRankCentrality(graph);
  const clustering = clusteringCoefficient(graph);
  const constraint = burtConstraint(graph);
  const components = connectedComponents(graph);
  const { articulation, bridges } = articulationPointsAndBridges(graph);
  const density = graphDensity(graph);
  const stewardship = stewardshipFusion(state);

  // Ranks for "hub" / "broker" detection (relative to the team, not absolute).
  const prMax = Math.max(0, ...pageRank.values());
  const betMax = Math.max(0, ...betweenness.normalized.values());
  const degreeMax = Math.max(1, ...[...degree.values()].map((d) => d.degree));

  const perPerson = capped.map((p) => {
    const id = p.id;
    const deg = degree.get(id);
    const bet = betweenness.normalized.get(id) || 0;
    const con = constraint.get(id);
    const st = stewardship.get(id) || { primaryOf: 0, unverifiedBackup: 0, dependencies: [] };
    const impact = removalImpact(graph, id);
    const flags = [];
    if (deg.degree === 0) flags.push('isolated');
    else if (deg.degree <= Math.max(1, Math.floor(degreeMax / 3))) flags.push('peripheral');
    if (bet >= ORG_BROKER_BETWEENNESS) flags.push('broker');
    if (articulation.has(id)) flags.push('bridge');
    if (prMax > 0 && pageRank.get(id) / prMax >= 0.9) flags.push('hub');
    if (con !== null && deg.degree >= 2 && con <= ORG_HOLE_CONSTRAINT) flags.push('structural-hole');
    const loadBearing = impact.fragmentsBy > 0 || impact.efficiencyLoss >= ORG_CRITICAL_EFFICIENCY_LOSS;
    const keyPerson = loadBearing && (bet >= ORG_BROKER_BETWEENNESS || st.primaryOf > 0);
    if (keyPerson) flags.push('key-person');
    return {
      id, name: p.name,
      degree: deg.degree, degreeNorm: deg.degreeNorm, strength: deg.strength,
      betweenness: bet, betweennessRaw: round(betweenness.raw.get(id) || 0, 3),
      closeness: closeness.get(id) || 0, pageRank: pageRank.get(id) || 0,
      constraint: con, clustering: clustering.get(id) || 0,
      flags,
      loadBearing, keyPerson,
      stewardship: st,
      impact,
      contextCount: affiliations.contexts.filter((c) => c.people.has(id)).length,
      neighbors: [...(graph.adjacency.get(id) || new Map()).keys()],
    };
  });

  perPerson.sort((a, b) => b.pageRank - a.pageRank || b.betweenness - a.betweenness || a.name.localeCompare(b.name));

  const isolates = perPerson.filter((p) => p.flags.includes('isolated'));
  const brokers = perPerson.filter((p) => p.flags.includes('broker'));
  const keyPersons = perPerson.filter((p) => p.keyPerson);
  const holes = perPerson.filter((p) => p.flags.includes('structural-hole'));
  const centralization = betweenness.centralization;
  const totalBetweenness = [...betweenness.normalized.values()].reduce((s, v) => s + v, 0);
  const topBrokerShare = totalBetweenness > 0 ? round(betMax / totalBetweenness) : 0;

  return {
    ok: true,
    engineVersion: ORG_ENGINE_VERSION,
    now: now instanceof Date ? now.toISOString() : String(now),
    graph,
    people: capped,
    nodeCount: n,
    tieFloor: effectiveFloor,
    tie: { floor: effectiveFloor, relative: tie.relative, maxWeight: tie.maxWeight, pct: tie.pct, absolute: tie.absolute },
    allContextCount: affiliations.contexts.length,
    contextCount: affiliations.contexts.filter((c) => c.people.size >= 2).length,
    perPerson,
    metrics: {
      density,
      edgeCount: graph.edges.length,
      components,
      componentCount: components.length,
      largestComponent: components.length ? components[0].length : 0,
      articulation: [...articulation],
      bridges,
      betweennessCentralization: centralization,
      topBrokerShare,
      isolates,
      brokers,
      holes,
      keyPersons,
      // Real fragmentation means the roster is not one connected component.
      // (A fully-isolated roster — every node its own component — also counts,
      // but ORG-01 handles those one by one.)
      fragmented: components.length > 1,
      concentrated: centralization >= ORG_CENTRALIZATION_WARN,
    },
    stewardship,
  };
}

/** Convenience report with a stable `totals.attention` for badges/Today. */
export function buildNetworkReport(state = {}, now = new Date()) {
  const analysis = analyzeNetwork(state, { now });
  if (!analysis.ok) {
    return { ok: false, analysis, totals: { attention: 0, isolates: 0, brokers: 0, keyPerson: 0, bridges: 0 }, people: analysis.people || [] };
  }
  const m = analysis.metrics;
  const attention = m.isolates.length + m.keyPersons.length
    + (m.fragmented ? 1 : 0) + (m.concentrated ? 1 : 0);
  return {
    ok: true,
    analysis,
    people: analysis.people,
    totals: {
      attention,
      isolates: m.isolates.length,
      brokers: m.brokers.length,
      keyPerson: m.keyPersons.length,
      bridges: m.bridges.length,
      holes: m.holes.length,
      components: m.componentCount,
    },
  };
}

/* ------------------------------------------------------------------ */
/* 7. Deterministic force-directed layout (for the SVG map)           */
/* ------------------------------------------------------------------ */

/**
 * Fruchterman–Reingold-style layout with a deterministic circular seed (no
 * Math.random). Returns positions in [0,1]². Pure and testable.
 */
export function networkLayout(graph, { iterations = 120 } = {}) {
  const n = graph.ids.length;
  if (!n) return new Map();
  const pos = new Map();
  graph.ids.forEach((id, i) => {
    const angle = (2 * Math.PI * i) / n;
    pos.set(id, { x: 0.5 + 0.36 * Math.cos(angle), y: 0.5 + 0.36 * Math.sin(angle) });
  });
  if (n === 1) { pos.set(graph.ids[0], { x: 0.5, y: 0.5 }); return pos; }
  const area = 1; const k = Math.sqrt(area / n);
  const maxW = Math.max(1, ...graph.edges.map((e) => e.weight));
  for (let it = 0; it < iterations; it += 1) {
    const disp = new Map(graph.ids.map((id) => [id, { x: 0, y: 0 }]));
    // Repulsion between all pairs.
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const a = graph.ids[i]; const b = graph.ids[j];
        let dx = pos.get(a).x - pos.get(b).x; let dy = pos.get(a).y - pos.get(b).y;
        let d = Math.sqrt(dx * dx + dy * dy);
        if (d < 1e-4) { dx = 1e-3 * ((i + j) % 3 - 1); dy = 1e-3; d = Math.sqrt(dx * dx + dy * dy); }
        const force = (k * k) / d;
        const fx = (dx / d) * force; const fy = (dy / d) * force;
        disp.get(a).x += fx; disp.get(a).y += fy;
        disp.get(b).x -= fx; disp.get(b).y -= fy;
      }
    }
    // Attraction along edges (stronger ties pull harder).
    for (const e of graph.edges) {
      const dx = pos.get(e.a).x - pos.get(e.b).x; const dy = pos.get(e.a).y - pos.get(e.b).y;
      const d = Math.max(1e-4, Math.sqrt(dx * dx + dy * dy));
      const force = (d * d) / k * (0.3 + 0.7 * (e.weight / maxW));
      const fx = (dx / d) * force; const fy = (dy / d) * force;
      disp.get(e.a).x -= fx; disp.get(e.a).y -= fy;
      disp.get(e.b).x += fx; disp.get(e.b).y += fy;
    }
    // Temperature-limited displacement, cooling over iterations.
    const temp = 0.08 * (1 - it / iterations);
    for (const id of graph.ids) {
      const d = disp.get(id);
      const len = Math.max(1e-4, Math.sqrt(d.x * d.x + d.y * d.y));
      const p = pos.get(id);
      pos.set(id, {
        x: Math.min(0.98, Math.max(0.02, p.x + (d.x / len) * Math.min(len, temp))),
        y: Math.min(0.98, Math.max(0.02, p.y + (d.y / len) * Math.min(len, temp))),
      });
    }
  }
  return pos;
}

/* ------------------------------------------------------------------ */
/* 8. Read-side signals (ORG-01..06)                                  */
/* ------------------------------------------------------------------ */

export function networkSignals(state = {}, now = new Date()) {
  const report = buildNetworkReport(state, now);
  if (!report.ok) return [];
  const m = report.analysis.metrics;
  const signals = [];

  // ORG-01 — isolated team members.
  for (const iso of m.isolates.slice(0, 4)) {
    signals.push({
      ruleId: 'ORG-01', domain: 'Org network',
      title: `${iso.name} has no recorded collaboration tie`,
      detail: 'An isolated node in the influence network is a structural fact about the recorded work, not a judgment about the person. It is worth a blameless check-in: are they new, siloed, or simply doing work that is not captured? Granovetter (1973) showed weak ties are how information and opportunity reach people.',
      severity: 3, confidence: iso.contextCount > 0 ? 'medium' : 'high',
      personId: iso.id, personName: iso.name,
      evidence: [`Degree 0 in the collaboration network (${report.analysis.nodeCount} active people)`, `${iso.contextCount} recorded work context(s)`],
      action: { label: 'Open influence network', route: '#/network?tab=positions' },
    });
  }

  // ORG-02 — structural key-person with no verified backup.
  for (const kp of m.keyPersons.slice(0, 4)) {
    signals.push({
      ruleId: 'ORG-02', domain: 'Org network',
      title: `${kp.name} is a structural single point of failure`,
      detail: 'Removing this person from the recorded collaboration graph fragments the team or materially reduces its connectivity, and they are a broker or a primary operational steward. This fuses Brandes betweenness / Tarjan articulation-point analysis with the resilience continuity Bus Factor. Open a blameless cross-training delegation — a continuity risk, never a performance rating.',
      severity: 4, confidence: 'high',
      personId: kp.id, personName: kp.name,
      evidence: [
        `Betweenness ${kp.betweenness}${kp.flags.includes('bridge') ? ' · articulation point' : ''}`,
        `Removal: components ${kp.impact.componentsBefore}→${kp.impact.componentsAfter}, efficiency loss ${Math.round(kp.impact.efficiencyLoss * 100)}%`,
        kp.stewardship.primaryOf ? `Primary steward of ${kp.stewardship.primaryOf} dependency(ies), ${kp.stewardship.unverifiedBackup} without a verified backup` : 'Broker of cross-team flow',
      ],
      action: { label: 'Review key-person stress test', route: '#/network?tab=stress' },
    });
  }

  // ORG-03 — fragmented network.
  if (m.fragmented && report.analysis.nodeCount >= 3) {
    signals.push({
      ruleId: 'ORG-03', domain: 'Org network',
      title: `Your team is split into ${m.componentCount} disconnected clusters`,
      detail: `The collaboration graph has ${m.componentCount} separate components (largest ${m.largestComponent} of ${report.analysis.nodeCount} people). Information cannot flow between clusters without a bridge. Consider a DACI org-design decision: a shared forum, a rotating liaison, or a joint objective.`,
      severity: 3, confidence: 'high',
      evidence: [`${m.componentCount} connected components`, `Density ${m.density}`],
      action: { label: 'See the network map', route: '#/network?tab=map' },
    });
  }

  // ORG-04 — concentrated brokerage.
  if (m.concentrated && m.brokers.length) {
    const top = m.brokers[0];
    signals.push({
      ruleId: 'ORG-04', domain: 'Org network',
      title: `${top.name} brokers most of the cross-team flow`,
      detail: `Freeman betweenness centralization is ${m.betweennessCentralization} (warning at ${ORG_CENTRALIZATION_WARN}) and one person holds ${Math.round(m.topBrokerShare * 100)}% of all betweenness. Concentrated brokerage is a coordination bottleneck and a burnout risk; distribute connections deliberately. This is a structural observation, not a verdict on the person.`,
      severity: 3, confidence: 'medium',
      personId: top.id, personName: top.name,
      evidence: [`Betweenness centralization ${m.betweennessCentralization}`, `Top-broker share ${Math.round(m.topBrokerShare * 100)}%`],
      action: { label: 'Inspect brokers & holes', route: '#/network?tab=holes' },
    });
  }

  // ORG-05 — structural holes / bridges.
  const holePeople = m.holes.filter((p) => p.flags.includes('bridge') || p.flags.includes('broker')).slice(0, 3);
  for (const h of holePeople) {
    signals.push({
      ruleId: 'ORG-05', domain: 'Org network',
      title: `${h.name} spans a structural hole`,
      detail: `Burt (1992) network constraint ${h.constraint ?? '—'} (a value at or below ${ORG_HOLE_CONSTRAINT} means the ego network bridges otherwise-disconnected groups). That position carries information advantage — and load. Make the connecting ties explicit so the org is resilient if they step away.`,
      severity: 2, confidence: 'medium',
      personId: h.id, personName: h.name,
      evidence: [`Burt constraint ${h.constraint ?? 'unmeasured'}`, `Betweenness ${h.betweenness}`, `${h.flags.includes('bridge') ? 'Articulation point' : 'High betweenness'}`],
      action: { label: 'Open structural-hole view', route: '#/network?tab=holes' },
    });
  }

  return signals;
}

/* ------------------------------------------------------------------ */
/* 9. Deterministic board-ready brief                                 */
/* ------------------------------------------------------------------ */

export function buildNetworkBrief(report) {
  if (!report.ok) {
    return 'LeadOS — Influence Network Intelligence\n\nThe network cannot be measured yet: add at least '
      + `${ORG_MIN_TEAM} active people and record work that involves them (cases, decisions, delegations, `
      + 'dependencies, 1:1s). Nothing is inferred or fabricated.';
  }
  const a = report.analysis; const m = a.metrics;
  const lines = [];
  lines.push('LEADOS — INFLUENCE NETWORK INTELLIGENCE (board brief)');
  lines.push(`Engine ${a.engineVersion} · ${a.nodeCount} active people · ${a.contextCount} multi-person work contexts`);
  lines.push('Privacy: derived only from your own typed records. No communications, no sentiment, no employee rating.');
  lines.push('');
  lines.push('NETWORK SHAPE');
  lines.push(`  Density ${m.density} · ${m.edgeCount} collaboration ties · ${m.componentCount} component(s) · largest ${m.largestComponent}/${a.nodeCount}`);
  lines.push(`  Freeman betweenness centralization ${m.betweennessCentralization} (warning ≥ ${ORG_CENTRALIZATION_WARN}) · top-broker share ${Math.round(m.topBrokerShare * 100)}%`);
  lines.push(`  Articulation points ${m.articulation.length} · bridges ${m.bridges.length} · isolates ${m.isolates.length}`);
  lines.push('');
  lines.push('MOST INFLUENTIAL (by weighted PageRank)');
  for (const p of a.perPerson.slice(0, 6)) {
    lines.push(`  · ${p.name}: PageRank ${p.pageRank}, betweenness ${p.betweenness}, closeness ${p.closeness}, Burt constraint ${p.constraint ?? '—'}, degree ${p.degree}${p.flags.length ? ` [${p.flags.join(', ')}]` : ''}`);
  }
  lines.push('');
  lines.push('STRUCTURAL KEY-PERSON STRESS TEST (node-removal)');
  if (!m.keyPersons.length) lines.push('  No single person is currently a structural single point of failure.');
  for (const kp of m.keyPersons.slice(0, 6)) {
    lines.push(`  · ${kp.name}: removal → components ${kp.impact.componentsBefore}→${kp.impact.componentsAfter}, efficiency −${Math.round(kp.impact.efficiencyLoss * 100)}%${kp.stewardship.unverifiedBackup ? `, ${kp.stewardship.unverifiedBackup} dependency(ies) without verified backup` : ''}`);
  }
  lines.push('');
  lines.push('RECOMMENDED FOLLOW-THROUGH (blameless)');
  if (m.isolates.length) lines.push(`  · Check in with ${m.isolates.map((p) => p.name).join(', ')} — no recorded collaboration tie.`);
  if (m.keyPersons.length) lines.push(`  · Cross-train a verified backup around ${m.keyPersons.map((p) => p.name).join(', ')}.`);
  if (m.fragmented) lines.push('  · Reconnect the disconnected clusters (org-design decision).');
  if (m.concentrated) lines.push('  · Distribute brokerage so one person is not the sole conduit.');
  if (!m.isolates.length && !m.keyPersons.length && !m.fragmented && !m.concentrated) lines.push('  · No structural action needed; keep the network under review as work changes.');
  lines.push('');
  lines.push('All figures are facts about the recorded collaboration graph. They are conditional, not predictions.');
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* 10. Atomic post-commit propagation (RULE-ORG-01..05)              */
/* ------------------------------------------------------------------ */

function shouldRunNetworkRule(event) {
  if (!event) return false;
  if (event.networkScan === true) return true;
  if (Array.isArray(event.rules) && event.rules.includes('network')) return true;
  return String(event.type || '').startsWith('network.');
}

function localEnsureLink(draft, spec, ctx) {
  const { sourceType, sourceId, targetType, targetId, relation, ruleId = '', summary = '' } = spec;
  if (!LINK_ENTITY_TYPES.includes(sourceType) || !LINK_ENTITY_TYPES.includes(targetType)
    || FORBIDDEN_LINK_TYPES.includes(sourceType) || FORBIDDEN_LINK_TYPES.includes(targetType)
    || !LINK_RELATIONS.includes(relation) || !sourceId || !targetId) return false;
  draft.links = Array.isArray(draft.links) ? draft.links : [];
  if (draft.links.some((l) => l && l.sourceType === sourceType && l.sourceId === sourceId
    && l.targetType === targetType && l.targetId === targetId && l.relation === relation)) return false;
  draft.links.push({
    id: ctx.idFactory('lnk'), sourceType, sourceId, targetType, targetId, relation,
    ruleId, summary, createdOn: ctx.todayStr, createdAt: ctx.nowIso,
  });
  return true;
}

const orgMarker = (rule, id) => `[${rule}:${id}]`;
function decisionExists(draft, marker) {
  return (draft.decisions || []).some((d) => d && String(d.question || '').includes(marker));
}
function delegationExists(draft, marker) {
  return (draft.delegations || []).some((d) => d && String(d.support || '').includes(marker));
}
function talkingPointExists(draft, personId, marker) {
  const p = (draft.people || []).find((x) => x.id === personId);
  return Boolean(p && (p.talkingPoints || []).some((t) => String(t).includes(marker)));
}
function addTalkingPoint(draft, personId, text, marker) {
  const p = (draft.people || []).find((x) => x.id === personId);
  if (!p || talkingPointExists(draft, personId, marker)) return false;
  p.talkingPoints = [...(Array.isArray(p.talkingPoints) ? p.talkingPoints : []), `${text} ${marker}`].slice(-30);
  return true;
}
/** Every 1:1 talking point this rule owns, so staleness can be reconciled. */
const ORG_TP_MARKER = /\[RULE-ORG-(?:02-TP|04|05):/;
function hasOrgTalkingPoint(draft, personId) {
  const p = (draft.people || []).find((x) => x.id === personId);
  return Boolean(p && (p.talkingPoints || []).some((t) => ORG_TP_MARKER.test(String(t))));
}
function clearOrgTalkingPoints(draft, personId, keepMarkers) {
  const p = (draft.people || []).find((x) => x.id === personId);
  if (!p || !Array.isArray(p.talkingPoints)) return false;
  const before = p.talkingPoints.length;
  p.talkingPoints = p.talkingPoints.filter((t) => {
    if (!ORG_TP_MARKER.test(String(t))) return true;
    return keepMarkers.some((m) => String(t).includes(m));
  });
  return p.talkingPoints.length !== before;
}

/**
 * Generalized post-commit rule (ADR-0008). Runs inside the store transaction
 * and fans ONE influence-network analysis out across modules — typed links,
 * a cross-training delegation, a DACI org-design decision, blameless 1:1
 * talking points and audit events — atomically and idempotently. Triggered on
 * explicit `network` scans or on any event that declares `rules:['network']`,
 * so unrelated writes never cause alert fatigue (the anti-regression posture).
 * The org-design decision is an ordinary DACI record, consumed by the decisions
 * / Decision Tempo modules on their own triggers — no second code path.
 */
export function networkRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || !shouldRunNetworkRule(event)) return [];
  // `networkAutoPropagate` governs AUTOMATIC fan-out (declared rules:['network']
  // events from other modules and network.* bookkeeping events). An explicit
  // human `networkScan` always runs — pausing automation must never trap the
  // leader behind a disabled button.
  const explicitScan = event.networkScan === true;
  if (draft.settings?.networkAutoPropagate === false && !explicitScan) return [];

  const report = buildNetworkReport(draft, ctx.now instanceof Date ? ctx.now : new Date());
  if (!report.ok) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const day = (d) => { try { return d.toISOString().slice(0, 10); } catch { return ''; } };
  const context = {
    ...ctx,
    now,
    todayStr: day(now),
    nowIso: now.toISOString(),
    idFactory: ctx.idFactory || ((prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`),
  };
  const props = [];
  const pushProp = (ruleId, action, targetType, targetId, summary) => {
    props.push({ ruleId, action, targetType, targetId, summary });
    if (context.logEvent) context.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${ruleId}] ${summary}` });
  };

  const m = report.analysis.metrics;
  const activeIds = new Set(report.people.map((p) => p.id));
  // Tracks which 1:1 talking points SHOULD exist this run; used at the end to
  // reconcile (remove) prompts whose structural condition has resolved.
  const orgMarkersByPerson = new Map();

  // RULE-ORG-01 — reconcile typed person↔person collaboration links so the
  // structural position is navigable in the cross-module graph. Additive and
  // idempotent; only for the strongest ties to avoid graph noise.
  const strongTies = report.analysis.graph.edges.filter((e) => e.weight >= 2).slice(0, 40);
  for (const e of strongTies) {
    if (!activeIds.has(e.a) || !activeIds.has(e.b)) continue;
    const created = localEnsureLink(draft, {
      sourceType: 'person', sourceId: e.a, targetType: 'person', targetId: e.b,
      relation: 'involves', ruleId: 'RULE-ORG-01',
      summary: `Collaborate on ${e.weight} shared work context(s)`,
    }, context);
    if (created) pushProp('RULE-ORG-01', 'linked', 'person', e.b, `Reconciled person↔person collaboration tie (${e.weight} contexts)`);
  }

  // RULE-ORG-02 — structural key-person → one blameless cross-training
  // delegation + one 1:1 talking point + a typed link to the delegation.
  for (const kp of m.keyPersons.slice(0, 6)) {
    if (!activeIds.has(kp.id)) continue;
    const marker = orgMarker('RULE-ORG-02', kp.id);
    if (!delegationExists(draft, marker)) {
      const due = new Date(context.now.getTime() + 21 * 86400000);
      draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
      draft.delegations.push({
        id: context.idFactory('delegation'),
        personId: kp.id,
        title: `Cross-train a verified backup around ${kp.name}`.slice(0, 160),
        expectedOutcome: `At least one other person is a verified steward/backup for the ${kp.stewardship.primaryOf || 'key'} context(s) ${kp.name} currently anchors.`.slice(0, 600),
        authority: 'recommend',
        support: `Blameless continuity action (RULE-ORG-02). ${kp.name} is a structural single point in the recorded collaboration graph (betweenness ${kp.betweenness}, removal fragments the team by ${kp.impact.fragmentsBy} component(s), efficiency −${Math.round(kp.impact.efficiencyLoss * 100)}%). Pair a colleague on the work and record a verified backup in Operational Resilience. This is a coordination risk, not a performance rating. ${marker}`.slice(0, 1200),
        delegatedOn: context.todayStr,
        dueOn: day(due),
        status: 'active',
        checkins: [], completedOn: null, completionNote: '', returnedOn: null, returnReason: '',
        createdAt: context.nowIso, updatedAt: context.nowIso,
      });
      const del = draft.delegations[draft.delegations.length - 1];
      localEnsureLink(draft, {
        sourceType: 'person', sourceId: kp.id, targetType: 'delegation', targetId: del.id,
        relation: 'develops', ruleId: 'RULE-ORG-02', summary: `Cross-training continuity for structural key-person ${marker}`,
      }, context);
      pushProp('RULE-ORG-02', 'created', 'delegation', del.id, `Opened blameless cross-training delegation for structural key-person ${kp.name}`);
    }
    const tpMarker = orgMarker('RULE-ORG-02-TP', kp.id);
    if (!orgMarkersByPerson.has(kp.id)) orgMarkersByPerson.set(kp.id, []);
    orgMarkersByPerson.get(kp.id).push(tpMarker);
    if (!talkingPointExists(draft, kp.id, tpMarker)) {
      addTalkingPoint(draft, kp.id,
        `[Influence network] You are a load-bearing connector (betweenness ${kp.betweenness}). Rehearse how to hand off context and grow a verified backup — this is about resilience, not performance.`, tpMarker);
      pushProp('RULE-ORG-02', 'updated', 'person', kp.id, `Queued a blameless cross-training 1:1 talking point`);
    }
  }

  // RULE-ORG-03 — fragmented network → one DACI org-design decision + typed
  // link. It is an ordinary decision record, so the decisions / Decision Tempo
  // modules consume it on their own triggers. Idempotent via marker.
  if (m.fragmented && report.analysis.nodeCount >= 3) {
    const marker = orgMarker('RULE-ORG-03', 'net');
    if (!decisionExists(draft, marker)) {
      draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
      draft.decisions.push({
        id: context.idFactory('dec'),
        title: 'Reconnect the disconnected team clusters'.slice(0, 180),
        question: `The influence network currently has ${m.componentCount} disconnected clusters (largest ${m.largestComponent}/${report.analysis.nodeCount}). Choose how to restore information flow. ${marker}`,
        date: context.todayStr, reversibility: 'reversible',
        driver: (draft.settings?.leaderName || '').slice(0, 120),
        approver: '', contributors: '', informed: '',
        options: [
          { id: context.idFactory('dopt'), label: 'Create a shared cross-team forum or stand-up', pros: 'Low cost, restores weak ties', cons: 'Adds meeting load' },
          { id: context.idFactory('dopt'), label: 'Appoint a rotating liaison between clusters', pros: 'Explicit bridge with an owner', cons: 'Concentrates brokerage if not rotated' },
          { id: context.idFactory('dopt'), label: 'Set a joint objective spanning the clusters', pros: 'Aligns incentives, creates organic ties', cons: 'Slower to show effect' },
          { id: context.idFactory('dopt'), label: 'Accept the split and re-scope team boundaries', pros: 'Honest about structure', cons: 'May cement the silo' },
        ],
        chosen: '', rationale: '', reviewOn: null, reviewedOn: null,
        outcome: 'pending', outcomeNotes: '', createdAt: context.nowIso,
      });
      const dec = draft.decisions[draft.decisions.length - 1];
      // Link the top broker (if any) as the accountable driver of reconnection.
      if (m.brokers.length) {
        localEnsureLink(draft, {
          sourceType: 'person', sourceId: m.brokers[0].id, targetType: 'decision', targetId: dec.id,
          relation: 'decides', ruleId: 'RULE-ORG-03', summary: `Org-design reconnection decision ${marker}`,
        }, context);
      }
      pushProp('RULE-ORG-03', 'created', 'decision', dec.id, `Opened DACI org-design decision for ${m.componentCount} disconnected clusters`);
    }
  }

  // RULE-ORG-04 / RULE-ORG-05 — blameless 1:1 talking points for isolates and
  // over-loaded brokers. Fully self-cleaning: stale ORG talking points are
  // removed when the underlying structural condition resolves.
  for (const iso of m.isolates.slice(0, 8)) {
    if (!activeIds.has(iso.id)) continue;
    const marker = orgMarker('RULE-ORG-04', iso.id);
    if (!orgMarkersByPerson.has(iso.id)) orgMarkersByPerson.set(iso.id, []);
    orgMarkersByPerson.get(iso.id).push(marker);
    if (!talkingPointExists(draft, iso.id, marker)) {
      addTalkingPoint(draft, iso.id,
        `[Influence network] ${iso.name} has no recorded collaboration tie. Use the next 1:1 to check whether they feel connected, informed and able to get help — a blameless inclusion check-in.`, marker);
      pushProp('RULE-ORG-04', 'updated', 'person', iso.id, `Queued a blameless isolation check-in 1:1 talking point`);
    }
  }
  if (m.concentrated && m.brokers.length) {
    for (const b of m.brokers.slice(0, 3)) {
      if (!activeIds.has(b.id)) continue;
      const marker = orgMarker('RULE-ORG-05', b.id);
      if (!orgMarkersByPerson.has(b.id)) orgMarkersByPerson.set(b.id, []);
      orgMarkersByPerson.get(b.id).push(marker);
      if (!talkingPointExists(draft, b.id, marker)) {
        addTalkingPoint(draft, b.id,
          `[Influence network] You broker a large share of cross-team flow (betweenness ${b.betweenness}). Discuss distributing a few connections and confirm the load is sustainable — a coordination risk, not a rating.`, marker);
        pushProp('RULE-ORG-05', 'updated', 'person', b.id, `Queued a blameless broker-load 1:1 talking point`);
      }
    }
  }
  // Reconcile: remove ORG-04/05 talking points whose condition has cleared.
  for (const person of (draft.people || [])) {
    if (!person || !hasOrgTalkingPoint(draft, person.id)) continue;
    const keep = orgMarkersByPerson.get(person.id) || [];
    if (clearOrgTalkingPoints(draft, person.id, keep)) {
      pushProp('RULE-ORG-04', 'updated', 'person', person.id, `Cleared resolved influence-network 1:1 talking point(s)`);
    }
  }

  return props;
}

export default analyzeNetwork;
