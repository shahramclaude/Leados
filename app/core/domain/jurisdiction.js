/**
 * app/core/domain/jurisdiction.js — the Jurisdiction Compiler engine
 * (ADR-0109, ADR-0111).
 *
 * "When connected work crosses organisational spans, WHICH SEAT can actually
 *  resolve the whole thing — and is a minimal coalition cheaper than escalating
 *  to the lowest common ancestor, or redrawing the boundary?"
 *
 * This is a pure read model over two things LeadOS already owns: the TYPED
 * WORK RECORD (cases / decisions / funded work, each naming an objective by
 * field or `impacts-goal` graph edge) and the REPORTING TREE (`buildChain`,
 * `lowestCommonAncestor`, `responsibleNodeId`). It introduces no poll, no
 * sentiment score, no person rating and no second hierarchy engine.
 *
 * ADR-0111 closes the sample-selection blind spot (Heckman 1979): open work
 * records with NO goal pointer (`unanchored-work`) and records naming a goal id
 * that no longer exists or has been dropped (`dangling-objective`) are counted
 * refusals with Wilson (1927) completeness bounds — never silently excluded and
 * never priced as phantom jurisdiction boundaries.
 *
 * Every figure is re-derived on read from the dated records plus DECLARED,
 * CLAMPED conventions printed on the Method panel. Nothing is fitted. A
 * refused figure is a named reason, never a zero. The unit of analysis is the
 * OBJECTIVE CLUSTER and the BRANCH, never a person.
 *
 * PURITY: no DOM, no storage, no network, no clock globals. `now` is injected.
 * Every special function is exported so a test can check it against hand-computed
 * values.
 */

import { addDays, dayKey, weekKey } from '../time.js';
import {
  buildChain, responsibleNodeId, managerNodeId, lowestCommonAncestor, LEADER_ID,
} from './chain.js';
import { recordPeople, buildSeats, activeSeat, canSee } from './seat.js';
import { altitudeRank } from './chainRegistry.js';
import {
  buildMatrix, matrixLineScope, matrixLineScopeFor, matrixJointApex,
} from './matrix.js';
import {
  JUR_CONVENTION_BOUNDS, JUR_CONVENTION_DEFAULTS, JUR_ENGINE_VERSION,
  JUR_GOVERNANCE_OPTIONS, JUR_LIMITS, JUR_OPTION_KEYS, JUR_REFUSALS,
  JUR_SOURCES, findingKey,
} from './jurisdictionRegistry.js';

const round1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);
const round2 = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
const unique = (xs) => [...new Set(xs.filter(Boolean))];

/** Declared, bounded, printed. Not fitted. */
export function jurConventions(settings = {}) {
  const out = {};
  for (const [key, fallback] of Object.entries(JUR_CONVENTION_DEFAULTS)) {
    if (typeof fallback === 'boolean') { out[key] = settings?.[key] !== false; continue; }
    const [min, max] = JUR_CONVENTION_BOUNDS[key] || [fallback, fallback];
    const n = Number(settings?.[key]);
    out[key] = Number.isFinite(n) && n >= min && n <= max ? n : fallback;
  }
  return Object.freeze(out);
}

/**
 * Wilson (1927) score interval. `pct`, `lo`, `hi` are percentages. Below a
 * caller's evidence floor the caller refuses; the maths never refuses silently.
 */
export function jurWilson(successes, n, z = 1.959963984540054) {
  if (!Number.isFinite(n) || n <= 0) return { pct: null, lo: null, hi: null };
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  return {
    pct: Math.round(clamp01(p) * 1000) / 10,
    lo: Math.round(clamp01(centre - margin) * 1000) / 10,
    hi: Math.round(clamp01(centre + margin) * 1000) / 10,
  };
}

function readPath(obj, path) {
  if (!obj || !path) return undefined;
  return String(path).split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

/**
 * Map `${entityType}:${recordId}` → goal ids connected by persistent
 * `impacts-goal` graph edges. Decisions and non-goal-sourced portfolio items
 * persist their objective anchor on the typed operational graph (`state.links`)
 * rather than duplicating foreign keys that `normalizeState` strips.
 */
export function buildGoalLinkMap(state) {
  const map = new Map();
  const push = (entityType, recordId, goalId) => {
    const key = `${entityType}:${recordId}`;
    if (!map.has(key)) map.set(key, []);
    const list = map.get(key);
    if (!list.includes(goalId)) list.push(goalId);
  };
  for (const link of (Array.isArray(state?.links) ? state.links : [])) {
    if (!link || link.relation !== 'impacts-goal') continue;
    if (link.targetType === 'goal' && link.sourceType && link.sourceId && link.targetId) {
      push(String(link.sourceType), String(link.sourceId), String(link.targetId).trim().slice(0, 120));
    } else if (link.sourceType === 'goal' && link.targetType && link.targetId && link.sourceId) {
      push(String(link.targetType), String(link.targetId), String(link.sourceId).trim().slice(0, 120));
    }
  }
  return map;
}

/**
 * Objective keys from a declared, ordered list of field paths PLUS any typed
 * `impacts-goal` edges in `state.links`.
 */
export function objectiveKeysFor(record, source, linkedGoalIds = []) {
  const keys = [];
  const fieldEligible = !source.objectiveRequires
    || record?.[source.objectiveRequires.field] === source.objectiveRequires.equals;
  if (fieldEligible) {
    for (const path of source.objectivePaths) {
      const value = readPath(record, path);
      if (Array.isArray(value)) {
        for (const v of value) if (typeof v === 'string' && v.trim()) keys.push(`goal:${v.trim().slice(0, 120)}`);
      } else if (typeof value === 'string' && value.trim()) {
        keys.push(`goal:${value.trim().slice(0, 120)}`);
      }
      if (keys.length) break;
    }
  }
  for (const gid of (Array.isArray(linkedGoalIds) ? linkedGoalIds : [])) {
    if (typeof gid === 'string' && gid.trim()) keys.push(`goal:${gid.trim().slice(0, 120)}`);
  }
  return unique(keys).slice(0, 3);
}

/**
 * Verify an objective pointer against `state.goals`. A goal id that no longer
 * exists (`missing`) or whose status is `dropped` (`dropped`) is a dangling
 * pointer — counted as a refusal, never priced as a live mandate boundary.
 */
export function goalPointerStatus(objectiveKey, goalMap, validateGoals = true) {
  const raw = String(objectiveKey || '');
  const goalId = raw.startsWith('goal:') ? raw.slice(5) : raw;
  if (!validateGoals) return { valid: true, status: 'assumed', goalId };
  const goal = goalMap.get(goalId);
  if (!goal) return { valid: false, status: 'missing', goalId };
  if (goal.status === 'dropped') return { valid: false, status: 'dropped', goalId };
  return { valid: true, status: goal.status || 'active', goalId };
}

function isOpen(record, source) {
  const value = readPath(record, source.openField);
  if (source.openWhenEmpty) return value === '' || value === null || value === undefined || value === false;
  if (value === undefined || value === null || value === '') return true;
  return !(source.closedValues || []).includes(String(value));
}

function recordDate(record, source) {
  for (const path of source.datePaths) {
    const v = readPath(record, path);
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  }
  return null;
}

export function isEngineAuditRecord(record) {
  return /\[RULE-[A-Z]{2,4}-\d+[:\]]/.test(String(record?.question || record?.title || ''));
}

/**
 * Resolve every person node id named on a work record. `cases` and `portfolio`
 * carry person ids directly (`recordPeople`); `decisions` store `driver` and
 * `approver` as names in `schema.js`, resolved here against `chain.nodes` so
 * span ownership and attribution work across all three collections.
 */
export function workRecordPeople(record, chain) {
  const direct = recordPeople(record);
  if (direct.length || !record || !chain?.nodes) return direct;
  const out = new Set();
  const resolveName = (raw) => {
    for (const part of String(raw || '').split(/[,;]/).map((s) => s.trim()).filter(Boolean)) {
      if (chain.nodes.has(part)) { out.add(part); continue; }
      const lower = part.toLowerCase();
      for (const node of chain.nodes.values()) {
        if (String(node?.name || '').trim().toLowerCase() === lower) {
          out.add(node.id);
          break;
        }
      }
    }
  };
  resolveName(record.approver);
  resolveName(record.driver);
  return [...out];
}

export function rankOf(chain, nodeId) {
  const node = chain?.nodes?.get(nodeId);
  return node ? altitudeRank(node.altitude) || 0 : 0;
}

/**
 * Resolve the reporting chain plus (when declared additional lines exist) the
 * active matrix DAG and per-manager line scope. Returns `matrix: null, lineScope: null`
 * for single-chain workspaces so single-chain runs keep the exact legacy path.
 */
export function resolveJurisdictionContext(state, { now = new Date(), settings = null, chain = null } = {}) {
  const at = now instanceof Date ? now : new Date(now);
  const effSettings = settings || state?.settings || {};
  const builtChain = chain || buildChain(state, { now: at, settings: effSettings });
  const hasDeclaredLines = Array.isArray(state?.reportingLines) && state.reportingLines.length > 0;
  if (!hasDeclaredLines) return { chain: builtChain, matrix: null, lineScope: null };
  const matrix = buildMatrix(state, { now: at, settings: effSettings });
  const scope = matrixLineScope(matrix);
  const lineScope = scope.byManager.size ? scope.byManager : null;
  return { chain: builtChain, matrix: lineScope ? matrix : null, lineScope };
}

/**
 * Resolve every accountable manager covering `people` on a work record:
 * the home-tree owner (`treeSpan`) plus any active matrix line manager whose
 * (subtree ∪ declared lineScope) covers ALL people named on the record.
 */
export function accountableSitesFor(people, treeSpan, { chain, lineScope = null } = {}) {
  const sites = treeSpan && chain?.nodes?.has(treeSpan) ? [treeSpan] : [];
  const lineSites = [];
  if (lineScope && Array.isArray(people) && people.length) {
    for (const [managerId, entry] of lineScope) {
      const held = new Set(entry?.personIds || []);
      if (!people.some((pid) => held.has(pid))) continue;
      const node = chain?.nodes?.get(managerId);
      const subtree = new Set(node?.subtreeIds || []);
      const covers = people.every((pid) => pid === managerId || subtree.has(pid) || held.has(pid));
      if (!covers) continue;
      if (!sites.includes(managerId)) sites.push(managerId);
      const treeSees = managerId === treeSpan
        || subtree.has(treeSpan)
        || people.some((pid) => subtree.has(pid));
      if (!treeSees) lineSites.push(managerId);
    }
  }
  return { sites, lineSites };
}

/**
 * Harvest objectives AND objective-pointer hygiene from the workspace's own
 * open work records. Every open non-engine work record is accounted for:
 *  - `anchored`: names >= 1 live goal in `state.goals`
 *  - `unanchored`: carries no objective pointer and no `impacts-goal` link
 *  - `dangling`: names a goal id that no longer exists or has been `dropped`
 *
 * A member is a POINTER (id, type, span, attributed, date) — no title, note or
 * person name is copied here. Grouping is by objective key, so a new work
 * source plugs in with one row in JUR_SOURCES and zero changes here.
 */
export function harvestObjectives(state, { chain, conventions = jurConventions(state?.settings || {}), lineScope = null } = {}) {
  const byObjective = new Map();
  const clusterMeta = new Map();
  const validateGoals = Array.isArray(state?.goals);
  const goalMap = new Map((validateGoals ? state.goals : []).filter((g) => g?.id).map((g) => [String(g.id), g]));
  const goalLinkMap = buildGoalLinkMap(state);

  let openWorkN = 0;
  let anchoredWorkN = 0;
  let unanchoredWorkN = 0;
  let danglingWorkN = 0;
  const unanchored = [];
  const dangling = [];
  const records = [];
  const sourceStats = new Map(JUR_SOURCES.map((s) => [s.collection, {
    collection: s.collection, entityType: s.entityType, label: s.label,
    open: 0, anchored: 0, unanchored: 0, dangling: 0,
  }]));

  for (const source of JUR_SOURCES) {
    const rows = Array.isArray(state?.[source.collection]) ? state[source.collection] : [];
    const bucket = sourceStats.get(source.collection);
    for (const record of rows) {
      if (!record?.id || !isOpen(record, source)) continue;
      // GOVERNED FINDINGS ARE AUDIT OUTPUT, NOT WORK. Every rule module stamps a
      // `[RULE-XXXX-NN]` provenance marker into the governed decisions it opens
      // in the same transaction. Pricing those as cross-span work is the
      // Session-143 second-order-decision regression: a scan would measure the
      // engine's own audit output. The exclusion is structural (state-only).
      if (isEngineAuditRecord(record)) continue;
      const recordId = String(record.id).slice(0, 120);
      const people = workRecordPeople(record, chain);
      const span = responsibleNodeId(chain, people);
      const spanRank = rankOf(chain, span);
      const attributed = people.length > 0 && Boolean(chain?.nodes?.get(span));
      const { sites, lineSites } = attributed
        ? accountableSitesFor(people, span, { chain, lineScope })
        : { sites: [], lineSites: [] };
      const date = recordDate(record, source);
      const linkedGoals = goalLinkMap.get(`${source.entityType}:${recordId}`) || [];
      const keys = objectiveKeysFor(record, source, linkedGoals);

      openWorkN += 1;
      bucket.open += 1;

      if (!keys.length) {
        unanchoredWorkN += 1;
        bucket.unanchored += 1;
        const pointer = {
          recordId, entityType: source.entityType, collection: source.collection,
          label: source.label, span, spanRank, attributed, date,
          sites, lineSites, people,
          pointerState: 'unanchored', reasonKey: 'unanchored-work',
          reasonNote: JUR_REFUSALS['unanchored-work'],
          goalStatus: 'unanchored', danglingGoalIds: [],
        };
        records.push(pointer);
        if (unanchored.length < JUR_LIMITS.hygieneRecords) unanchored.push(pointer);
        continue;
      }

      const checks = keys.map((k) => ({ key: k, ...goalPointerStatus(k, goalMap, validateGoals) }));
      const badChecks = checks.filter((c) => !c.valid);
      if (badChecks.length > 0) {
        danglingWorkN += 1;
        bucket.dangling += 1;
        const problem = badChecks.some((c) => c.status === 'missing') ? 'missing' : 'dropped';
        const pointer = {
          recordId, entityType: source.entityType, collection: source.collection,
          label: source.label, span, spanRank, attributed, date,
          sites, lineSites, people,
          pointerState: 'dangling', reasonKey: 'dangling-objective',
          reasonNote: JUR_REFUSALS['dangling-objective'],
          goalStatus: problem,
          danglingGoalIds: badChecks.map((c) => c.goalId),
        };
        records.push(pointer);
        if (dangling.length < JUR_LIMITS.hygieneRecords) dangling.push(pointer);
      } else {
        anchoredWorkN += 1;
        bucket.anchored += 1;
        records.push({
          recordId, entityType: source.entityType, collection: source.collection,
          label: source.label, span, spanRank, attributed, date,
          sites, lineSites, people,
          pointerState: 'anchored', reasonKey: '', reasonNote: '',
          goalStatus: 'active', danglingGoalIds: [],
        });
      }

      for (const check of checks) {
        const key = check.key;
        if (!byObjective.has(key)) {
          byObjective.set(key, []);
          clusterMeta.set(key, { dangling: !check.valid, goalStatus: check.status });
        } else if (!check.valid) {
          clusterMeta.set(key, { dangling: true, goalStatus: check.status });
        }
        const members = byObjective.get(key);
        if (members.length >= JUR_LIMITS.membersPerCluster) continue;
        members.push({
          key,
          recordId,
          entityType: source.entityType,
          collection: source.collection,
          label: source.label,
          span,
          sites,
          lineSites,
          people,
          attributed,
          date,
        });
      }
    }
  }

  const totalObjectives = byObjective.size;
  const objectives = [...byObjective.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, JUR_LIMITS.objectivesCap)
    .map(([objectiveKey, members]) => {
      const meta = clusterMeta.get(objectiveKey) || { dangling: false, goalStatus: 'active' };
      return { objectiveKey, members, dangling: meta.dangling, goalStatus: meta.goalStatus };
    });

  const floor = conventions?.jurEvidenceFloorN ?? JUR_CONVENTION_DEFAULTS.jurEvidenceFloorN;
  const enoughWork = openWorkN >= floor;
  const wilson = enoughWork ? jurWilson(anchoredWorkN, openWorkN) : { pct: null, lo: null, hi: null };
  const refusalN = unanchoredWorkN + danglingWorkN;
  const darkSharePct = enoughWork ? round1((refusalN / openWorkN) * 100) : null;
  const bySource = [...sourceStats.values()].map((row) => {
    const ok = row.open >= floor;
    const w = ok ? jurWilson(row.anchored, row.open) : { pct: null, lo: null, hi: null };
    return {
      ...row,
      refusals: row.unanchored + row.dangling,
      anchoringPct: w.pct,
      anchoringLoPct: w.lo,
      anchoringHiPct: w.hi,
      refusalKey: row.open === 0 ? '' : (ok ? '' : 'thin-anchoring'),
    };
  });

  const hygiene = {
    openWorkN,
    anchoredWorkN,
    unanchoredWorkN,
    danglingWorkN,
    refusalN,
    anchoringPct: wilson.pct,
    anchoringLoPct: wilson.lo,
    anchoringHiPct: wilson.hi,
    darkSharePct,
    anchoringRefusalKey: openWorkN > 0 && !enoughWork ? 'thin-anchoring' : '',
    anchoringRefusalNote: openWorkN > 0 && !enoughWork ? JUR_REFUSALS['thin-anchoring'] : '',
    unanchored,
    dangling,
    records,
    bySource,
    capped: unanchoredWorkN > unanchored.length || danglingWorkN > dangling.length,
  };

  return { objectives, totalObjectives, capped: byObjective.size > JUR_LIMITS.objectivesCap, hygiene };
}

/**
 * The child of `lca` on the path up from `spanId`. If the span IS the LCA, the
 * branch is the LCA itself. This is the minimal antichain that Riker's size
 * principle selects: one seat per branch, no grand coalition.
 */
export function branchChildOf(chain, lca, spanId) {
  if (!spanId || spanId === lca) return lca;
  let cursor = spanId;
  let guard = 0;
  while (cursor && guard < JUR_LIMITS.ancestorsCap) {
    const parent = managerNodeId(chain, cursor);
    if (!parent || parent === cursor) return cursor;
    if (parent === lca) return cursor;
    cursor = parent;
    guard += 1;
  }
  return lca;
}

/**
 * Compatibility name for the Jurisdiction Compiler's coalition boundary.
 * ADR-0120: the shared chain meet now considers every span, so the local
 * workaround is retired. Every module prices the same accountable ancestor.
 */
export function commonAncestorOfAll(chain, spanIds) {
  return lowestCommonAncestor(chain, spanIds);
}

/**
 * Price ONE cross-span objective cluster. Returns the full computation with
 * every input named, or a `refused` result carrying the reason verbatim. A
 * cluster whose spans all sit in one branch is NOT a jurisdiction gap and is
 * returned with `gap: false` (counted, never frozen). A cluster whose goal id
 * no longer exists or was dropped is REFUSED (`dangling-objective`), never
 * priced into a governance decision.
 */
export function priceCluster(cluster, { chain, conventions, matrix = null, lineScope = null } = {}) {
  const members = cluster.members || [];
  const attributed = members.filter((m) => m.attributed);
  const spans = unique(attributed.map((m) => m.span));
  const accountableSpanIds = unique(attributed.flatMap((m) => (Array.isArray(m.sites) && m.sites.length ? m.sites : [m.span])));
  const matrixLineSpanIds = accountableSpanIds.filter((id) => !spans.includes(id));
  const memberPeople = unique(attributed.flatMap((m) => (Array.isArray(m.people) ? m.people : [])));
  const evidenceN = members.length;
  const attribution = jurWilson(attributed.length, evidenceN);
  const dangling = Boolean(cluster.dangling);
  const base = {
    objectiveKey: cluster.objectiveKey,
    dangling,
    goalStatus: cluster.goalStatus || (dangling ? 'missing' : 'active'),
    members,
    memberIds: unique(members.map((m) => m.recordId)),
    memberTypes: unique(members.map((m) => m.entityType)),
    evidenceN,
    attributedN: attributed.length,
    attributionPct: attribution.pct,
    confidencePct: attribution.lo,
    confidenceLoPct: attribution.lo,
    confidenceHiPct: attribution.hi,
    spanNodeIds: spans,
    accountableSpanIds,
    matrixLineSpanIds,
    matrixApexIds: [],
    lcaBasis: 'tree',
    matrixAmbiguous: false,
    matrixLineCount: matrixLineSpanIds.length,
    lcaNodeId: null, lcaRank: 0, maxSpanRank: 0, minSpanRank: 0,
    branchSeatIds: [], coalitionSize: 0, escalationRungs: 0, handoffPairs: 0,
    costCoalition: null, costEscalate: null, costRedraw: null,
    costs: [], predictedOption: null, predictedProbability: null,
    advantagePct: null, gap: false, verdict: 'refused', refusalKey: '', refusalNote: '',
  };
  if (spans.length < 2) {
    const key = dangling ? 'dangling-objective' : 'single-span';
    return { ...base, gap: false, refusalKey: key, refusalNote: JUR_REFUSALS[key] };
  }
  const treeLca = commonAncestorOfAll(chain, spans);
  let lca = treeLca;
  let lcaBasis = 'tree';
  let matrixApexIds = [];
  let matrixAmbiguous = false;

  if (matrix && lineScope && memberPeople.length > 0 && attributed.every((m) => Array.isArray(m.people) && m.people.length > 0)) {
    const apex = matrixJointApex(matrix, memberPeople);
    if (apex.ambiguous && apex.apexIds.length > 1) {
      matrixAmbiguous = true;
      matrixApexIds = apex.apexIds.slice(0, JUR_LIMITS.branchesCap);
      lcaBasis = 'ambiguous-matrix';
    } else if (apex.unique && apex.apexId && chain.nodes.has(apex.apexId)) {
      matrixApexIds = [apex.apexId];
      const apexRank = rankOf(chain, apex.apexId);
      const treeLcaRank = treeLca ? rankOf(chain, treeLca) : 0;
      const otherMaxRank = Math.max(...spans.filter((s) => s !== apex.apexId).map((s) => rankOf(chain, s)), 0);
      const strictlyLowerThanTreeLca = apex.apexId !== treeLca
        && (treeLca === LEADER_ID || !treeLcaRank || apexRank <= treeLcaRank);
      if (strictlyLowerThanTreeLca && apexRank > otherMaxRank) {
        lca = apex.apexId;
        lcaBasis = 'matrix-apex';
      }
    }
  }

  if (!lca || !chain.nodes.get(lca)) {
    return {
      ...base, matrixApexIds, lcaBasis, matrixAmbiguous,
      gap: true, refusalKey: 'no-lca', refusalNote: JUR_REFUSALS['no-lca'],
    };
  }
  const lcaRank = rankOf(chain, lca);
  const maxSpanRank = Math.max(...spans.map((s) => rankOf(chain, s)), 0);
  const minSpanRank = Math.min(...spans.map((s) => rankOf(chain, s)));
  const lcaSubtree = new Set(chain.nodes.get(lca)?.subtreeIds || []);
  const branches = lcaBasis === 'matrix-apex'
    ? unique(spans.map((s) => (s === lca || lcaSubtree.has(s) ? branchChildOf(chain, lca, s) : s))).slice(0, JUR_LIMITS.branchesCap)
    : unique(spans.map((s) => branchChildOf(chain, lca, s))).slice(0, JUR_LIMITS.branchesCap);
  const branchRungs = branches
    .filter((b) => b !== lca)
    .map((b) => Math.max(lcaBasis === 'matrix-apex' ? 1 : 0, lcaRank - rankOf(chain, b)));
  const escalationRungs = branchRungs.reduce((sum, n) => sum + n, 0);
  const coalitionSize = branches.length;
  const handoffPairs = (coalitionSize * (coalitionSize - 1)) / 2;
  const costCoalition = round1(conventions.jurHandoffUnitsPerPair * handoffPairs);
  const costEscalate = round1(conventions.jurEscalationUnitsPerRung * escalationRungs);
  const costRedraw = round1(conventions.jurRedrawUnits);
  const costs = JUR_GOVERNANCE_OPTIONS.map((o) => ({
    key: o.key, label: o.label,
    cost: { coalition: costCoalition, escalate: costEscalate, redraw: costRedraw }[o.key],
  })).sort((a, b) => a.cost - b.cost || JUR_OPTION_KEYS.indexOf(a.key) - JUR_OPTION_KEYS.indexOf(b.key));
  const best = costs[0];
  const runnerUp = costs[1];
  const advantagePct = runnerUp && runnerUp.cost > 0
    ? round1(((runnerUp.cost - best.cost) / runnerUp.cost) * 100)
    : null;
  const pricedBase = {
    ...base,
    lcaNodeId: lca, lcaRank, maxSpanRank, minSpanRank,
    matrixApexIds, lcaBasis, matrixAmbiguous,
    branchSeatIds: branches, coalitionSize, escalationRungs, handoffPairs,
    costCoalition, costEscalate, costRedraw, costs, advantagePct,
    gap: true,
  };
  if (dangling) {
    return {
      ...pricedBase,
      costCoalition: null, costEscalate: null, costRedraw: null, costs: [], advantagePct: null,
      refusalKey: 'dangling-objective', refusalNote: JUR_REFUSALS['dangling-objective'],
    };
  }
  if (evidenceN < conventions.jurEvidenceFloorN) {
    return { ...pricedBase, refusalKey: 'thin-cluster', refusalNote: JUR_REFUSALS['thin-cluster'] };
  }
  if (attribution.pct === null || attribution.pct < conventions.jurAttributionFloorPct) {
    return { ...pricedBase, refusalKey: 'thin-attribution', refusalNote: JUR_REFUSALS['thin-attribution'] };
  }
  if (matrixAmbiguous) {
    return {
      ...pricedBase,
      costCoalition: null, costEscalate: null, costRedraw: null, costs: [], advantagePct: null,
      refusalKey: 'ambiguous-matrix-lca', refusalNote: JUR_REFUSALS['ambiguous-matrix-lca'],
    };
  }
  if (advantagePct === null || advantagePct < conventions.jurMaterialityPct) {
    return { ...pricedBase, refusalKey: 'no-decisive-route', refusalNote: JUR_REFUSALS['no-decisive-route'] };
  }
  // Luce (1959) choice axiom: a softmax over -cost at a declared temperature
  // (the mean route cost). This is the probability the ledger assigns to the
  // route it recommends; it is graded once by Brier against a strictly-prior
  // 0.5 base, never re-fitted.
  const temp = Math.max(1, (costCoalition + costEscalate + costRedraw) / 3);
  const weights = costs.map((c) => Math.exp(-c.cost / temp));
  const total = weights.reduce((a, b) => a + b, 0);
  const predictedProbability = round2(weights[0] / total);
  return {
    ...pricedBase,
    costs: costs.map((c, i) => ({ ...c, probability: round2(weights[i] / total) })),
    verdict: 'priced',
    predictedOption: best.key,
    predictedProbability,
  };
}

/** The full book: every cross-span objective, priced or refused, plus hygiene. */
export function buildJurisdictionBook(state, { now = new Date(), conventions = jurConventions(), chain = null } = {}) {
  const at = now instanceof Date ? now : new Date(now);
  const ctx = resolveJurisdictionContext(state, { now: at, settings: state?.settings, chain });
  const built = ctx.chain;
  const harvest = harvestObjectives(state, { chain: built, conventions, lineScope: ctx.lineScope });
  const all = harvest.objectives.map((cluster) => priceCluster(cluster, {
    chain: built, conventions, matrix: ctx.matrix, lineScope: ctx.lineScope,
  }));
  const gaps = all.filter((c) => c.gap);
  const priced = gaps.filter((c) => c.verdict === 'priced');
  const refused = gaps.filter((c) => c.verdict === 'refused');
  const byId = new Map(gaps.map((c) => [findingKey(c.objectiveKey, weekKey(at)), c]));
  return {
    engineVersion: JUR_ENGINE_VERSION,
    at: at.toISOString(),
    week: weekKey(at),
    conventions,
    chain: built,
    matrixActive: Boolean(ctx.lineScope),
    lineScope: ctx.lineScope,
    // ADR-0115: the cross-week drift reader needs the DENOMINATOR of the
    // cross-branch share. `clusters` is gaps only; `allClusters` is every
    // objective the harvest could place, including single-branch ones. No title,
    // person or note is added — this is the same priced read model.
    allClusters: all,
    clusters: gaps,
    priced,
    refused,
    byId,
    hygiene: harvest.hygiene,
    totals: {
      objectives: harvest.totalObjectives,
      objectivesCapped: harvest.capped,
      singleBranch: all.length - gaps.length,
      crossBranch: gaps.length,
      priced: priced.length,
      refused: refused.length,
      openWork: harvest.hygiene.openWorkN,
      anchoredWork: harvest.hygiene.anchoredWorkN,
      unanchoredWork: harvest.hygiene.unanchoredWorkN,
      danglingWork: harvest.hygiene.danglingWorkN,
      hygieneRefusals: harvest.hygiene.refusalN,
      anchoringPct: harvest.hygiene.anchoringPct,
      anchoringLoPct: harvest.hygiene.anchoringLoPct,
      anchoringHiPct: harvest.hygiene.anchoringHiPct,
      darkSharePct: harvest.hygiene.darkSharePct,
      governed: 0,
      graded: 0,
    },
    refusals: JUR_REFUSALS,
  };
}

/**
 * Identity-free span roll-up. A seat at `nodeId` sees ONLY counts for clusters
 * and pointer-hygiene records whose responsible spans fall in its subtree. No
 * objective key, no member id, no person and no title crosses this boundary. A
 * cell below the declared small-cell floor is SUPPRESSED (not zero), labelled
 * as not differential privacy.
 */
export function jurSpanRollUp(state, { nodeId, now = new Date(), conventions = jurConventions(), chain = null, book = null } = {}) {
  const report = book || buildJurisdictionBook(state, { now, conventions, chain });
  const built = report.chain;
  const node = built.nodes.get(nodeId);
  if (!node) return { ok: false, reason: 'no-node' };
  const subtree = new Set([...(node.subtreeIds || []), nodeId, LEADER_ID === nodeId ? nodeId : null].filter(Boolean));
  const clusterInSubtree = (c) => {
    const spanIds = Array.isArray(c.accountableSpanIds) && c.accountableSpanIds.length
      ? c.accountableSpanIds
      : c.spanNodeIds;
    return spanIds.some((s) => subtree.has(s));
  };
  const own = report.clusters.filter(clusterInSubtree);
  // ADR-0115: every objective in this span's subtree, not only cross-branch
  // gaps. A reading written before this denominator existed has `objectives:
  // null`, and the drift reader REFUSES its share rather than printing 100%.
  const allHere = Array.isArray(report.allClusters)
    ? report.allClusters.filter(clusterInSubtree)
    : null;
  const priced = own.filter((c) => c.verdict === 'priced');
  const refused = own.filter((c) => c.verdict === 'refused');
  const floor = conventions.jurCellFloor;
  const suppressed = own.length < floor;
  const sizes = priced.map((c) => c.coalitionSize).sort((a, b) => a - b);
  const median = sizes.length
    ? (sizes.length % 2 ? sizes[(sizes.length - 1) / 2] : (sizes[sizes.length / 2 - 1] + sizes[sizes.length / 2]) / 2)
    : null;
  const governed = (Array.isArray(state?.decisions) ? state.decisions : [])
    .filter((d) => String(d?.question || '').includes('[JUR-OPTION:') && String(d?.question || '').includes('[RULE-JUR-02:')).length;

  const ownWork = (report.hygiene?.records || []).filter((r) => {
    const sites = Array.isArray(r.sites) && r.sites.length ? r.sites : [r.span];
    return sites.some((s) => subtree.has(s));
  });
  const hygieneSuppressed = ownWork.length < floor;
  const ownAnchored = ownWork.filter((r) => r.pointerState === 'anchored').length;
  const ownUnanchored = ownWork.filter((r) => r.pointerState === 'unanchored').length;
  const ownDangling = ownWork.filter((r) => r.pointerState === 'dangling').length;
  const ownAnchoring = !hygieneSuppressed && ownWork.length >= conventions.jurEvidenceFloorN
    ? jurWilson(ownAnchored, ownWork.length)
    : { pct: null, lo: null, hi: null };

  return {
    ok: true,
    nodeId,
    nodeRank: rankOf(built, nodeId),
    clusters: own.length,
    objectives: allHere ? allHere.length : null,
    crossBranch: own.length,
    priced: suppressed ? null : priced.length,
    governed: suppressed ? null : governed,
    refusals: suppressed ? null : refused.length,
    suppressed,
    cellFloor: floor,
    medianCoalitionSize: suppressed || priced.length < floor ? null : round1(median),
    openWork: ownWork.length,
    hygieneSuppressed,
    anchoredWork: hygieneSuppressed ? null : ownAnchored,
    unanchoredWork: hygieneSuppressed ? null : ownUnanchored,
    danglingWork: hygieneSuppressed ? null : ownDangling,
    hygieneRefusals: hygieneSuppressed ? null : ownUnanchored + ownDangling,
    anchoringLoPct: ownAnchoring.lo,
  };
}

/** Once-only Brier grade against a strictly-prior 0.5 base, computed on demand. */
export function jurGradeFinding(finding, { actualOption, settledOn, frozenAt, now }) {
  if (!finding || finding.status !== 'frozen') return { ok: false, reason: 'not-frozen' };
  if (!JUR_OPTION_KEYS.includes(actualOption)) return { ok: false, reason: 'ungradable', note: JUR_REFUSALS.ungraded };
  if (!settledOn || !/^\d{4}-\d{2}-\d{2}$/.test(settledOn)) return { ok: false, reason: 'ungradable', note: JUR_REFUSALS.ungraded };
  if (Date.parse(`${settledOn}T00:00:00Z`) < Date.parse(String(frozenAt || '').slice(0, 10) + 'T00:00:00Z')) {
    return { ok: false, reason: 'ungradable', note: JUR_REFUSALS.postdated };
  }
  const p = Math.min(0.999, Math.max(0.001, Number(finding.predictedProbability) || 0.5));
  const y = actualOption === finding.predictedOption ? 1 : 0;
  const brier = round2((p - y) ** 2);
  const baseBrier = 0.25; // (0.5 - y)^2 for either outcome
  return {
    ok: true,
    brier,
    baseBrier,
    skill: round2(1 - brier / baseBrier),
    actualOption,
    gradedOn: dayKey(now instanceof Date ? now : new Date(now)),
  };
}

/** Aggregate-only CSV rows (scope #103). A refused/suppressed figure is BLANK. */
export const JUR_CSV_COLUMNS = Object.freeze([
  'row_kind', 'scope', 'altitude_rank', 'option_key', 'objectives',
  'open_work', 'anchored_work', 'unanchored_work', 'dangling_work',
  'cross_branch', 'single_branch', 'priced', 'refused', 'governed', 'graded',
  'coalition_size', 'escalation_rungs', 'cost_units', 'confidence_pct',
  'confidence_lo_pct', 'confidence_hi_pct', 'brier', 'base_brier', 'skill',
  'cell_floor', 'suppressed', 'verdict', 'reason_code',
]);

export function jurCsvRows(state, { now = new Date(), settings = null, conventions = jurConventions(settings || state?.settings || {}) } = {}) {
  const report = buildJurisdictionBook(state, { now, conventions });
  const rows = [];
  const blank = null;
  const findings = Array.isArray(state?.jurFindings) ? state.jurFindings : [];
  const graded = findings.filter((f) => f?.status === 'graded');
  const governed = (Array.isArray(state?.decisions) ? state.decisions : [])
    .filter((d) => String(d?.question || '').includes('[JUR-OPTION:')).length;
  const medians = report.priced.map((c) => c.coalitionSize).sort((a, b) => a - b);
  const median = medians.length ? medians[Math.floor(medians.length / 2)] : null;
  const hyg = report.hygiene;
  rows.push({
    row_kind: 'workspace', scope: 'workspace', altitude_rank: blank, option_key: blank,
    objectives: report.totals.objectives,
    open_work: hyg.openWorkN,
    anchored_work: hyg.anchoredWorkN,
    unanchored_work: hyg.unanchoredWorkN,
    dangling_work: hyg.danglingWorkN,
    cross_branch: report.totals.crossBranch,
    single_branch: report.totals.singleBranch, priced: report.totals.priced,
    refused: report.totals.refused, governed, graded: graded.length,
    coalition_size: median, escalation_rungs: blank, cost_units: blank,
    confidence_pct: hyg.anchoringPct ?? blank,
    confidence_lo_pct: hyg.anchoringLoPct ?? blank,
    confidence_hi_pct: hyg.anchoringHiPct ?? blank,
    brier: blank, base_brier: blank, skill: blank, cell_floor: conventions.jurCellFloor,
    suppressed: blank, verdict: report.totals.crossBranch || hyg.openWorkN ? 'measured' : 'empty',
    reason_code: hyg.anchoringRefusalKey || blank,
  });
  // One identity-free row per leadership rank. A cell below the floor is BLANK.
  for (let rank = 1; rank <= 5; rank += 1) {
    const inRank = report.clusters.filter((c) => c.maxSpanRank === rank);
    const inRankPriced = inRank.filter((c) => c.verdict === 'priced');
    const suppressed = inRank.length < conventions.jurCellFloor;
    const rankWork = hyg.records.filter((r) => r.spanRank === rank);
    const workSuppressed = rankWork.length < conventions.jurCellFloor;
    rows.push({
      row_kind: 'altitude', scope: `rank-${rank}`, altitude_rank: rank, option_key: blank,
      objectives: blank,
      open_work: rankWork.length,
      anchored_work: workSuppressed ? blank : rankWork.filter((r) => r.pointerState === 'anchored').length,
      unanchored_work: workSuppressed ? blank : rankWork.filter((r) => r.pointerState === 'unanchored').length,
      dangling_work: workSuppressed ? blank : rankWork.filter((r) => r.pointerState === 'dangling').length,
      cross_branch: inRank.length, single_branch: blank,
      priced: suppressed ? blank : inRankPriced.length,
      refused: suppressed ? blank : inRank.length - inRankPriced.length,
      governed: blank, graded: blank, coalition_size: suppressed || !inRankPriced.length ? blank
        : round1(inRankPriced.reduce((a, c) => a + c.coalitionSize, 0) / inRankPriced.length),
      escalation_rungs: suppressed || !inRankPriced.length ? blank
        : round1(inRankPriced.reduce((a, c) => a + c.escalationRungs, 0) / inRankPriced.length),
      cost_units: blank, confidence_pct: blank, confidence_lo_pct: blank, confidence_hi_pct: blank,
      brier: blank, base_brier: blank, skill: blank, cell_floor: conventions.jurCellFloor,
      suppressed: suppressed ? 'yes' : blank, verdict: suppressed ? 'withheld' : 'measured',
      reason_code: suppressed ? 'suppressed' : blank,
    });
  }
  // One identity-free pointer-hygiene row per work source (cases / decisions / portfolio).
  for (const src of hyg.bySource) {
    const suppressed = src.open < conventions.jurCellFloor;
    rows.push({
      row_kind: 'hygiene', scope: `source-${src.entityType}`, altitude_rank: blank, option_key: blank,
      objectives: blank,
      open_work: src.open,
      anchored_work: suppressed ? blank : src.anchored,
      unanchored_work: suppressed ? blank : src.unanchored,
      dangling_work: suppressed ? blank : src.dangling,
      cross_branch: blank, single_branch: blank, priced: blank,
      refused: suppressed ? blank : src.refusals,
      governed: blank, graded: blank, coalition_size: blank, escalation_rungs: blank, cost_units: blank,
      confidence_pct: suppressed ? blank : (src.anchoringPct ?? blank),
      confidence_lo_pct: suppressed ? blank : (src.anchoringLoPct ?? blank),
      confidence_hi_pct: suppressed ? blank : (src.anchoringHiPct ?? blank),
      brier: blank, base_brier: blank, skill: blank, cell_floor: conventions.jurCellFloor,
      suppressed: suppressed ? 'yes' : blank,
      verdict: suppressed ? 'withheld' : 'measured',
      reason_code: suppressed ? 'suppressed' : (src.refusalKey || blank),
    });
  }
  // One row per declared governance route: how often it was predicted, how
  // often it was right, and the pooled Brier (BLANK below the evidence floor).
  for (const option of JUR_OPTION_KEYS) {
    const predicted = report.priced.filter((c) => c.predictedOption === option);
    const grades = graded.filter((f) => f.predictedOption === option && Number.isFinite(f.brier));
    const enough = grades.length >= conventions.jurCellFloor;
    rows.push({
      row_kind: 'option', scope: 'workspace', altitude_rank: blank, option_key: option,
      objectives: blank, open_work: blank, anchored_work: blank, unanchored_work: blank, dangling_work: blank,
      cross_branch: blank, single_branch: blank, priced: predicted.length,
      refused: blank, governed: blank, graded: grades.length,
      coalition_size: option === 'coalition' ? (predicted.length ? round1(predicted.reduce((a, c) => a + c.coalitionSize, 0) / predicted.length) : blank) : blank,
      escalation_rungs: option === 'escalate' ? (predicted.length ? round1(predicted.reduce((a, c) => a + c.escalationRungs, 0) / predicted.length) : blank) : blank,
      cost_units: option === 'redraw' ? conventions.jurRedrawUnits : blank,
      confidence_pct: blank, confidence_lo_pct: blank, confidence_hi_pct: blank,
      brier: enough ? round2(grades.reduce((a, g) => a + g.brier, 0) / grades.length) : blank,
      base_brier: enough ? 0.25 : blank,
      skill: enough ? round2(1 - (grades.reduce((a, g) => a + g.brier, 0) / grades.length) / 0.25) : blank,
      cell_floor: conventions.jurCellFloor, suppressed: enough ? blank : 'yes',
      verdict: enough ? 'measured' : 'withheld', reason_code: enough ? blank : 'suppressed',
    });
  }
  // One row per declared convention: the printed bound, never a fitted value.
  for (const [key, value] of Object.entries(conventions)) {
    rows.push({
      row_kind: 'method', scope: 'convention', altitude_rank: blank, option_key: key,
      objectives: blank, open_work: blank, anchored_work: blank, unanchored_work: blank, dangling_work: blank,
      cross_branch: blank, single_branch: blank, priced: blank,
      refused: blank, governed: blank, graded: blank, coalition_size: blank,
      escalation_rungs: blank, cost_units: blank, confidence_pct: blank,
      confidence_lo_pct: blank, confidence_hi_pct: blank, brier: blank,
      base_brier: blank, skill: blank, cell_floor: blank, suppressed: blank,
      verdict: typeof value === 'boolean' ? (value ? 'on' : 'off') : String(value), reason_code: blank,
    });
  }
  return rows;
}

/**
 * AUTO-GENERATED BOARD-READY SYNTHESIS. One paragraph, identity-free, with
 * every refusal named. Includes objective-pointer hygiene (Heckman 1979
 * selection-coverage check) so unanchored dark work is never mistaken for
 * single-branch alignment.
 */
export function jurBrief(state, { now = new Date(), settings = null, conventions = jurConventions(settings || state?.settings || {}) } = {}) {
  const report = buildJurisdictionBook(state, { now, conventions });
  const findings = Array.isArray(state?.jurFindings) ? state.jurFindings : [];
  const graded = findings.filter((f) => f?.status === 'graded');
  const governed = (Array.isArray(state?.decisions) ? state.decisions : [])
    .filter((d) => String(d?.question || '').includes('[JUR-OPTION:')).length;
  const t = report.totals;
  const hygieneText = t.openWork > 0
    ? `Objective-pointer hygiene across ${t.openWork} open work record(s): ${t.anchoredWork} anchored to live objectives, ${t.unanchoredWork} unanchored refusal(s) and ${t.danglingWork} dangling/dropped goal refusal(s)${t.anchoringLoPct !== null ? ` (Wilson completeness lower bound ${t.anchoringLoPct}%)` : ' (completeness rate refused below the evidence floor)'}.`
    : 'No open work records are on file yet.';
  if (!t.crossBranch) {
    return `${t.objectives} objective(s) are on record; none of them is worked across more than one reporting branch. There is no priced jurisdiction gap, though ${hygieneText} Frameworks: Riker (1962), Coase (1937) / Williamson (1975), Heckman (1979) sample-selection coverage, Wilson (1927), Luce (1959), Brier (1950), Ashby (1956).`;
  }
  const best = report.priced.slice().sort((a, b) => b.coalitionSize - a.coalitionSize)[0];
  const top = best ? `The widest needs a ${best.coalitionSize}-branch coalition ${best.escalationRungs} rung(s) below its lowest common ancestor.` : 'No cluster is priced yet.';
  const grades = graded.length ? `${graded.length} frozen governance forecast(s) have been graded once, out of sample.` : 'No governance forecast has been graded yet — an absent outcome is never scored as a miss.';
  return `${t.crossBranch} of ${t.objectives} objective(s) are worked across more than one reporting branch; ${t.singleBranch} sit inside a single branch. ${t.priced} are priced and ${t.refused} are refused with a printed reason. ${top} ${hygieneText} The ledger has opened ${governed} governed boundary decision(s) that a human must accept; silence is never consent. ${grades} Every figure above rank 2 is identity-free with small-cell suppression at ${conventions.jurCellFloor}; suppression is not differential privacy. Frameworks: Riker (1962) minimal coalition, Coase (1937) / Williamson (1975) governance transaction costs, Heckman (1979) sample-selection coverage, Wilson (1927) attribution & anchoring confidence, Luce (1959) route choice, Brier (1950) once-only grading, Ashby (1956) requisite variety.`;
}

/** Role-tiered read. The seat changes WHAT is claimed and what may be anchored. */
export function jurisdictionRead(state, { now = new Date(), settings = null, seatId = null, conventions = jurConventions(settings || state?.settings || {}) } = {}) {
  const at = now instanceof Date ? now : new Date(now);
  const effSettings = settings || state?.settings || {};
  const book = buildJurisdictionBook(state, { now: at, conventions });
  const lineScope = book.lineScope || matrixLineScopeFor(state, { now: at, settings: effSettings });
  const built = buildSeats(state, { now: at, settings: effSettings, ...(lineScope ? { lineScope } : {}) });
  const seat = seatId ? built.seats.find((s) => s.id === seatId) || activeSeat(built) : activeSeat(built);
  const rank = seat?.rank || 0;
  const withheld = Boolean(seat && !seat.fullAccess && rank > 2);
  const findings = Array.isArray(state?.jurFindings) ? state.jurFindings : [];
  const grades = findings.filter((f) => f?.status === 'graded');
  const floor = conventions.jurCellFloor;
  const seatHasNode = (id) => Boolean(seat?.scope instanceof Set && seat.scope.has(id))
    || Boolean(seat?.lineScope instanceof Set && seat.lineScope.has(id));

  // Span-scoped cluster membership for frontline, manager & matrix-line seats.
  const scopedSeat = Boolean(seat && !seat.fullAccess && !seat.readOnly && seat.scope instanceof Set);
  const ownSpanClusterKeys = scopedSeat
    ? book.clusters
      .filter((c) => {
        const spanIds = Array.isArray(c.accountableSpanIds) && c.accountableSpanIds.length
          ? c.accountableSpanIds
          : c.spanNodeIds;
        return spanIds.some((s) => seatHasNode(s));
      })
      .map((c) => c.objectiveKey)
    : book.clusters.map((c) => c.objectiveKey);

  // Above the detail ceiling (rank 3..5 declared seats) the read is compiled
  // cells only — no objective key, no record id, no goal id, no title.
  const cells = [];
  for (let r = 1; r <= 5; r += 1) {
    const inRank = book.clusters.filter((c) => c.maxSpanRank === r);
    const suppressed = inRank.length < floor;
    const rankWork = book.hygiene.records.filter((rec) => rec.spanRank === r);
    const hygieneSuppressed = rankWork.length < floor;
    const anchoredN = rankWork.filter((rec) => rec.pointerState === 'anchored').length;
    const unanchoredN = rankWork.filter((rec) => rec.pointerState === 'unanchored').length;
    const danglingN = rankWork.filter((rec) => rec.pointerState === 'dangling').length;
    const w = !hygieneSuppressed && rankWork.length >= conventions.jurEvidenceFloorN
      ? jurWilson(anchoredN, rankWork.length)
      : { pct: null, lo: null, hi: null };
    cells.push({
      rank: r, clusters: inRank.length, suppressed,
      priced: suppressed ? null : inRank.filter((c) => c.verdict === 'priced').length,
      refused: suppressed ? null : inRank.filter((c) => c.verdict === 'refused').length,
      reason: suppressed ? JUR_REFUSALS.suppressed : null,
      openWork: rankWork.length,
      hygieneSuppressed,
      anchoredWork: hygieneSuppressed ? null : anchoredN,
      unanchoredWork: hygieneSuppressed ? null : unanchoredN,
      danglingWork: hygieneSuppressed ? null : danglingN,
      anchoringLoPct: w.lo,
      hygieneReason: hygieneSuppressed && rankWork.length > 0 ? JUR_REFUSALS.suppressed : null,
    });
  }

  const hygieneBySource = book.hygiene.bySource.map((src) => {
    const suppressed = withheld && src.open < floor;
    return {
      entityType: src.entityType,
      label: src.label,
      open: src.open,
      suppressed,
      anchored: suppressed ? null : src.anchored,
      unanchored: suppressed ? null : src.unanchored,
      dangling: suppressed ? null : src.dangling,
      refusals: suppressed ? null : src.refusals,
      anchoringPct: suppressed ? null : src.anchoringPct,
      anchoringLoPct: suppressed ? null : src.anchoringLoPct,
      reason: suppressed && src.open > 0
        ? JUR_REFUSALS.suppressed
        : (src.refusalKey ? JUR_REFUSALS[src.refusalKey] : ''),
    };
  });

  // Below the detail ceiling (frontline rank 1, mid-manager rank 2, or local
  // operator): build the seat-authorized remediation queue + active goals.
  let hygieneQueue = [];
  let eligibleGoals = [];
  let spanHygiene = null;
  if (!withheld && (!seat || !seat.readOnly)) {
    const recordLookup = new Map();
    for (const src of JUR_SOURCES) {
      for (const rec of (Array.isArray(state?.[src.collection]) ? state[src.collection] : [])) {
        if (rec?.id) recordLookup.set(`${src.collection}:${rec.id}`, rec);
      }
    }
    const candidates = [...book.hygiene.dangling, ...book.hygiene.unanchored];
    for (const item of candidates) {
      const raw = recordLookup.get(`${item.collection}:${item.recordId}`);
      if (!raw) continue;
      if (seat && !seat.fullAccess) {
        if (canSee(raw, item.collection, seat, built).allow !== 'full') continue;
        const people = workRecordPeople(raw, built.chain);
        if (!people.length && !seat.isLeader) continue;
        if (people.length && !people.every((pid) => seatHasNode(pid))) continue;
      }
      hygieneQueue.push({
        recordId: item.recordId,
        entityType: item.entityType,
        collection: item.collection,
        sourceLabel: item.label,
        title: String(raw.title || raw.question || item.recordId).trim().slice(0, JUR_LIMITS.labelChars),
        date: item.date,
        span: item.span,
        pointerState: item.pointerState,
        goalStatus: item.goalStatus,
        reasonKey: item.reasonKey,
        reasonNote: item.reasonNote,
        danglingGoalIds: item.danglingGoalIds,
      });
    }
    eligibleGoals = (Array.isArray(state?.goals) ? state.goals : [])
      .filter((g) => g?.id && g.status !== 'dropped')
      .filter((g) => !seat || seat.fullAccess || canSee(g, 'goals', seat, built).allow === 'full')
      .map((g) => ({
        id: String(g.id),
        title: String(g.title || g.id).trim().slice(0, JUR_LIMITS.labelChars),
        status: g.status || 'active',
      }));
    if (scopedSeat) {
      const inSpan = book.hygiene.records.filter((r) => {
        const sites = Array.isArray(r.sites) && r.sites.length ? r.sites : [r.span];
        if (sites.some((s) => seat.scope.has(s))) return true;
        return Array.isArray(r.people) && r.people.length > 0 && r.people.every((pid) => seatHasNode(pid));
      });
      spanHygiene = {
        openWork: inSpan.length,
        anchoredWork: inSpan.filter((r) => r.pointerState === 'anchored').length,
        unanchoredWork: inSpan.filter((r) => r.pointerState === 'unanchored').length,
        danglingWork: inSpan.filter((r) => r.pointerState === 'dangling').length,
        actionable: hygieneQueue.length,
      };
    }
  }

  return {
    ok: true,
    engineVersion: JUR_ENGINE_VERSION,
    week: book.week,
    conventions,
    seat: seat ? {
      id: seat.id, rank, label: seat.label,
      fullAccess: Boolean(seat.fullAccess), readOnly: Boolean(seat.readOnly),
      lineScopeN: seat.lineScopeN || 0, lineOnlySeat: Boolean(seat.lineOnlySeat),
    } : null,
    withheld,
    ownSpanClusterKeys,
    spanHygiene,
    hygieneBySource,
    hygieneQueue,
    eligibleGoals,
    book: withheld ? {
      ...book,
      clusters: [],
      priced: [],
      refused: [],
      byId: new Map(),
      hygiene: {
        ...book.hygiene,
        unanchored: [],
        dangling: [],
        records: [],
      },
    } : book,
    cells,
    grades: withheld ? [] : grades,
    brief: jurBrief(state, { now: at, conventions }),
    refusals: JUR_REFUSALS,
    reviewOn: addDays(dayKey(at), conventions.jurReviewDays),
  };
}

/** Sidebar badge: priced cross-branch clusters with no governed decision open. */
export function jurAttentionCount(state, now = new Date(), settings = null) {
  try {
    const conventions = jurConventions(settings || state?.settings || {});
    const book = buildJurisdictionBook(state, { now: now instanceof Date ? now : new Date(now), conventions });
    const open = new Set((Array.isArray(state?.decisions) ? state.decisions : [])
      .filter((d) => String(d?.question || '').includes('[JUR-OPTION:') && !d?.chosen)
      .map((d) => String(d.question).match(/\[JUR-OPTION:([^\]:]+):/)?.[1])
      .filter(Boolean));
    const week = weekKey(now instanceof Date ? now : new Date(now));
    return book.priced.filter((c) => !open.has(findingKey(c.objectiveKey, week))).length;
  } catch {
    return 0;
  }
}
