/**
 * app/core/domain/jurisdiction.js — the Jurisdiction Compiler engine (ADR-0109).
 *
 * "When connected work crosses organisational spans, WHICH SEAT can actually
 *  resolve the whole thing — and is a minimal coalition cheaper than escalating
 *  to the lowest common ancestor, or redrawing the boundary?"
 *
 * This is a pure read model over two things LeadOS already owns: the TYPED
 * WORK RECORD (cases / decisions / funded work, each naming an objective) and
 * the REPORTING TREE (`buildChain`, `lowestCommonAncestor`,
 * `responsibleNodeId`). It introduces no poll, no sentiment score, no person
 * rating and no second hierarchy engine.
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
  buildChain, responsibleNodeId, managerNodeId, LEADER_ID,
} from './chain.js';
import { recordPeople, buildSeats, activeSeat } from './seat.js';
import { altitudeRank } from './chainRegistry.js';
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

/** First non-empty objective key from a declared, ordered list of field paths. */
export function objectiveKeysFor(record, source) {
  if (source.objectiveRequires) {
    const { field, equals } = source.objectiveRequires;
    if (record?.[field] !== equals) return [];
  }
  const keys = [];
  for (const path of source.objectivePaths) {
    const value = readPath(record, path);
    if (Array.isArray(value)) {
      for (const v of value) if (typeof v === 'string' && v.trim()) keys.push(`goal:${v.trim().slice(0, 120)}`);
    } else if (typeof value === 'string' && value.trim()) {
      keys.push(`goal:${value.trim().slice(0, 120)}`);
    }
    if (keys.length) break;
  }
  return unique(keys).slice(0, 3);
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

/**
 * Harvest objectives from the workspace's own work records. A member is a
 * POINTER (id, type, span, attributed, date) — no title, note or person name
 * is copied. Grouping is by objective key, so a new work source plugs in with
 * one row in JUR_SOURCES and zero changes to this function (Section 3).
 */
export function harvestObjectives(state, { chain, conventions }) {
  const byObjective = new Map();
  let totalObjectives = 0;
  for (const source of JUR_SOURCES) {
    const rows = Array.isArray(state?.[source.collection]) ? state[source.collection] : [];
    for (const record of rows) {
      if (!record?.id || !isOpen(record, source)) continue;
      // GOVERNED FINDINGS ARE AUDIT OUTPUT, NOT WORK. Every rule module stamps a
      // `[RULE-XXXX-NN]` provenance marker into the governed decisions it opens
      // in the same transaction. Pricing those as cross-span work is the
      // Session-143 second-order-decision regression: a scan would measure the
      // engine's own audit output. The exclusion is structural (state-only),
      // never an import of another rule module (which would be a silent cycle).
      if (/\[RULE-[A-Z]{2,4}-\d+[:\]]/.test(String(record?.question || record?.title || ''))) continue;
      const keys = objectiveKeysFor(record, source);
      if (!keys.length) continue;
      const people = recordPeople(record);
      const span = responsibleNodeId(chain, people);
      const attributed = people.length > 0 && Boolean(chain.nodes.get(span));
      for (const key of keys) {
        if (!byObjective.has(key)) byObjective.set(key, []);
        const members = byObjective.get(key);
        if (members.length >= JUR_LIMITS.membersPerCluster) continue;
        members.push({
          key,
          recordId: String(record.id).slice(0, 120),
          entityType: source.entityType,
          collection: source.collection,
          label: source.label,
          span,
          attributed,
          date: recordDate(record, source),
        });
      }
    }
  }
  totalObjectives = byObjective.size;
  // Deterministic order; a cap is a refusal to grow without bound, printed.
  const objectives = [...byObjective.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, JUR_LIMITS.objectivesCap)
    .map(([objectiveKey, members]) => ({ objectiveKey, members }));
  return { objectives, totalObjectives, capped: byObjective.size > JUR_LIMITS.objectivesCap };
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
 * The TRUE lowest common ancestor of ALL spans. chain.js's
 * `lowestCommonAncestor` returns on the FIRST pair it can resolve, so with
 * three or more spans whose first two share a branch it reports that branch
 * instead of the ancestor that actually covers every span. A jurisdiction
 * compiler cannot understate the coalition by pricing a phantom sub-branch.
 * We intersect the full ancestor chain of every span and return the DEEPEST
 * node in the first span's chain that all of them share. This is a local,
 * explicitly-documented correction; the shared helper is left untouched so
 * ~80 modules that call it with two ids keep their exact behaviour.
 */
export function commonAncestorOfAll(chain, spanIds) {
  const ids = [...new Set((spanIds || []).filter((id) => id && chain.nodes.has(id)))];
  if (!ids.length) return LEADER_ID;
  const inclusive = (id) => {
    const out = [];
    const seen = new Set();
    let cursor = id;
    while (cursor && !seen.has(cursor) && out.length < JUR_LIMITS.ancestorsCap) {
      seen.add(cursor);
      out.push(cursor);
      const parent = managerNodeId(chain, cursor);
      if (!parent || parent === cursor) break;
      cursor = parent;
    }
    return out;
  };
  const first = inclusive(ids[0]);
  const sets = ids.map((id) => new Set(inclusive(id)));
  for (const candidate of first) {
    if (sets.every((set) => set.has(candidate))) return candidate;
  }
  return LEADER_ID;
}

export function rankOf(chain, nodeId) {
  const node = chain.nodes.get(nodeId);
  return node ? altitudeRank(node.altitude) || 0 : 0;
}

/**
 * Price ONE cross-span objective cluster. Returns the full computation with
 * every input named, or a `refused` result carrying the reason verbatim. A
 * cluster whose spans all sit in one branch is NOT a jurisdiction gap and is
 * returned with `gap: false` (counted, never frozen).
 */
export function priceCluster(cluster, { chain, conventions }) {
  const members = cluster.members || [];
  const attributed = members.filter((m) => m.attributed);
  const spans = unique(attributed.map((m) => m.span));
  const evidenceN = members.length;
  const attribution = jurWilson(attributed.length, evidenceN);
  const base = {
    objectiveKey: cluster.objectiveKey,
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
    lcaNodeId: null, lcaRank: 0, maxSpanRank: 0, minSpanRank: 0,
    branchSeatIds: [], coalitionSize: 0, escalationRungs: 0, handoffPairs: 0,
    costCoalition: null, costEscalate: null, costRedraw: null,
    costs: [], predictedOption: null, predictedProbability: null,
    advantagePct: null, gap: false, verdict: 'refused', refusalKey: '', refusalNote: '',
  };
  if (spans.length < 2) {
    return { ...base, gap: false, refusalKey: 'single-span', refusalNote: JUR_REFUSALS['single-span'] };
  }
  const lca = commonAncestorOfAll(chain, spans);
  if (!lca || !chain.nodes.get(lca)) {
    return { ...base, gap: true, refusalKey: 'no-lca', refusalNote: JUR_REFUSALS['no-lca'] };
  }
  const lcaRank = rankOf(chain, lca);
  const maxSpanRank = Math.max(...spans.map((s) => rankOf(chain, s)), 0);
  const minSpanRank = Math.min(...spans.map((s) => rankOf(chain, s)));
  const branches = unique(spans.map((s) => branchChildOf(chain, lca, s))).slice(0, JUR_LIMITS.branchesCap);
  // Escalation lifts every branch's work up to the common ancestor. The total
  // number of rungs lifted is the declared attention/delay a single decider
  // must absorb (Ashby 1956). A branch that IS the ancestor lifts nothing: it
  // already holds the mandate. Using `lcaRank - maxSpanRank` instead would print
  // a flattering zero whenever the ancestor is one of the spans — which is the
  // normal case — and silently make escalation free. This never does that.
  const branchRungs = branches
    .filter((b) => b !== lca)
    .map((b) => Math.max(0, lcaRank - rankOf(chain, b)));
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
    branchSeatIds: branches, coalitionSize, escalationRungs, handoffPairs,
    costCoalition, costEscalate, costRedraw, costs, advantagePct,
    gap: true,
  };
  if (evidenceN < conventions.jurEvidenceFloorN) {
    return { ...pricedBase, refusalKey: 'thin-cluster', refusalNote: JUR_REFUSALS['thin-cluster'] };
  }
  if (attribution.pct === null || attribution.pct < conventions.jurAttributionFloorPct) {
    return { ...pricedBase, refusalKey: 'thin-attribution', refusalNote: JUR_REFUSALS['thin-attribution'] };
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

/** The full book: every cross-span objective, priced or refused, with totals. */
export function buildJurisdictionBook(state, { now = new Date(), conventions = jurConventions(), chain = null } = {}) {
  const at = now instanceof Date ? now : new Date(now);
  const built = chain || buildChain(state, { now: at, settings: state?.settings });
  const harvest = harvestObjectives(state, { chain: built, conventions });
  const all = harvest.objectives.map((cluster) => priceCluster(cluster, { chain: built, conventions }));
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
    clusters: gaps,
    priced,
    refused,
    byId,
    totals: {
      objectives: harvest.totalObjectives,
      objectivesCapped: harvest.capped,
      singleBranch: all.length - gaps.length,
      crossBranch: gaps.length,
      priced: priced.length,
      refused: refused.length,
      governed: 0,
      graded: 0,
    },
    refusals: JUR_REFUSALS,
  };
}

/**
 * Identity-free span roll-up. A seat at `nodeId` sees ONLY counts for clusters
 * whose responsible spans fall anywhere in its subtree. No objective key, no
 * member id, no person and no title crosses this boundary. A cell below the
 * declared small-cell floor is SUPPRESSED (not zero), labelled as not
 * differential privacy.
 */
export function jurSpanRollUp(state, { nodeId, now = new Date(), conventions = jurConventions(), chain = null, book = null } = {}) {
  const report = book || buildJurisdictionBook(state, { now, conventions, chain });
  const built = report.chain;
  const node = built.nodes.get(nodeId);
  if (!node) return { ok: false, reason: 'no-node' };
  const subtree = new Set([...(node.subtreeIds || []), nodeId, LEADER_ID === nodeId ? nodeId : null].filter(Boolean));
  const own = report.clusters.filter((c) => c.spanNodeIds.some((s) => subtree.has(s)));
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
  return {
    ok: true,
    nodeId,
    nodeRank: rankOf(built, nodeId),
    clusters: own.length,
    crossBranch: own.length,
    priced: suppressed ? null : priced.length,
    governed: suppressed ? null : governed,
    refusals: suppressed ? null : refused.length,
    suppressed,
    cellFloor: floor,
    medianCoalitionSize: suppressed || priced.length < floor ? null : round1(median),
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
  'row_kind', 'scope', 'altitude_rank', 'option_key', 'objectives', 'cross_branch',
  'single_branch', 'priced', 'refused', 'governed', 'graded', 'coalition_size',
  'escalation_rungs', 'cost_units', 'confidence_pct', 'confidence_lo_pct',
  'confidence_hi_pct', 'brier', 'base_brier', 'skill', 'cell_floor',
  'suppressed', 'verdict', 'reason_code',
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
  rows.push({
    row_kind: 'workspace', scope: 'workspace', altitude_rank: blank, option_key: blank,
    objectives: report.totals.objectives, cross_branch: report.totals.crossBranch,
    single_branch: report.totals.singleBranch, priced: report.totals.priced,
    refused: report.totals.refused, governed, graded: graded.length,
    coalition_size: median, escalation_rungs: blank, cost_units: blank,
    confidence_pct: blank, confidence_lo_pct: blank, confidence_hi_pct: blank,
    brier: blank, base_brier: blank, skill: blank, cell_floor: conventions.jurCellFloor,
    suppressed: blank, verdict: report.totals.crossBranch ? 'measured' : 'empty',
    reason_code: blank,
  });
  // One identity-free row per leadership rank. A cell below the floor is BLANK.
  for (let rank = 1; rank <= 5; rank += 1) {
    const inRank = report.clusters.filter((c) => c.maxSpanRank === rank);
    const inRankPriced = inRank.filter((c) => c.verdict === 'priced');
    const suppressed = inRank.length < conventions.jurCellFloor;
    rows.push({
      row_kind: 'altitude', scope: `rank-${rank}`, altitude_rank: rank, option_key: blank,
      objectives: blank, cross_branch: inRank.length, single_branch: blank,
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
  // One row per declared governance route: how often it was predicted, how
  // often it was right, and the pooled Brier (BLANK below the evidence floor).
  for (const option of JUR_OPTION_KEYS) {
    const predicted = report.priced.filter((c) => c.predictedOption === option);
    const grades = graded.filter((f) => f.predictedOption === option && Number.isFinite(f.brier));
    const enough = grades.length >= conventions.jurCellFloor;
    rows.push({
      row_kind: 'option', scope: 'workspace', altitude_rank: blank, option_key: option,
      objectives: blank, cross_branch: blank, single_branch: blank, priced: predicted.length,
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
      objectives: blank, cross_branch: blank, single_branch: blank, priced: blank,
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
 * every refusal named. This is the "leader asks AI to compile the brief" moment
 * (Glean/Workday), but computed from the workspace's own graph — not invented.
 */
export function jurBrief(state, { now = new Date(), settings = null, conventions = jurConventions(settings || state?.settings || {}) } = {}) {
  const report = buildJurisdictionBook(state, { now, conventions });
  const findings = Array.isArray(state?.jurFindings) ? state.jurFindings : [];
  const graded = findings.filter((f) => f?.status === 'graded');
  const governed = (Array.isArray(state?.decisions) ? state.decisions : [])
    .filter((d) => String(d?.question || '').includes('[JUR-OPTION:')).length;
  const t = report.totals;
  if (!t.crossBranch) {
    return `${t.objectives} objective(s) are on record; none of them is worked across more than one reporting branch. There is no jurisdiction gap to price. A single seat holds each objective, so no coalition, escalation or boundary decision is owed.`;
  }
  const best = report.priced.slice().sort((a, b) => b.coalitionSize - a.coalitionSize)[0];
  const top = best ? `The widest needs a ${best.coalitionSize}-branch coalition ${best.escalationRungs} rung(s) below its lowest common ancestor.` : 'No cluster is priced yet.';
  const grades = graded.length ? `${graded.length} frozen governance forecast(s) have been graded once, out of sample.` : 'No governance forecast has been graded yet — an absent outcome is never scored as a miss.';
  return `${t.crossBranch} of ${t.objectives} objective(s) are worked across more than one reporting branch; ${t.singleBranch} sit inside a single branch. ${t.priced} are priced and ${t.refused} are refused with a printed reason. ${top} The ledger has opened ${governed} governed boundary decision(s) that a human must accept; silence is never consent. ${grades} Every figure above rank 2 is identity-free with small-cell suppression at ${conventions.jurCellFloor}; suppression is not differential privacy. Frameworks: Riker (1962) minimal coalition, Coase (1937) / Williamson (1975) governance transaction costs, Wilson (1927) attribution confidence, Luce (1959) route choice, Brier (1950) once-only grading, Ashby (1956) requisite variety.`;
}

/** Role-tiered read. The seat changes WHAT is claimed, not only how much. */
export function jurisdictionRead(state, { now = new Date(), settings = null, seatId = null, conventions = jurConventions(settings || state?.settings || {}) } = {}) {
  const at = now instanceof Date ? now : new Date(now);
  const book = buildJurisdictionBook(state, { now: at, conventions });
  const built = buildSeats(state, { now: at, settings: settings || state?.settings || {} });
  const seat = seatId ? built.seats.find((s) => s.id === seatId) || activeSeat(built) : activeSeat(built);
  const rank = seat?.rank || 0;
  const withheld = Boolean(seat && !seat.fullAccess && rank > 2);
  const findings = Array.isArray(state?.jurFindings) ? state.jurFindings : [];
  const grades = findings.filter((f) => f?.status === 'graded');
  const floor = conventions.jurCellFloor;
  // Above the detail ceiling the read is a compiled cell table, never items.
  const cells = [];
  if (withheld) {
    for (let r = 1; r <= 5; r += 1) {
      const inRank = book.clusters.filter((c) => c.maxSpanRank === r);
      const suppressed = inRank.length < floor;
      cells.push({
        rank: r, clusters: inRank.length, suppressed,
        priced: suppressed ? null : inRank.filter((c) => c.verdict === 'priced').length,
        refused: suppressed ? null : inRank.filter((c) => c.verdict === 'refused').length,
        reason: suppressed ? JUR_REFUSALS.suppressed : null,
      });
    }
  }
  return {
    ok: true,
    engineVersion: JUR_ENGINE_VERSION,
    week: book.week,
    conventions,
    seat: seat ? { id: seat.id, rank, label: seat.label, fullAccess: Boolean(seat.fullAccess) } : null,
    withheld,
    book,
    cells,
    grades,
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
