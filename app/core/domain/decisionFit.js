/**
 * app/core/domain/decisionFit.js — the Decision-Fit Ledger engine (ADR-0108).
 *
 * One question, two halves, joined on the record the workspace already holds:
 *
 *   HALF ONE — PRICE. For each open call, what does HOLDING it at its owner's
 *   rung cost in expected wait, and what would HOLDING IT ONE RUNG DOWN save,
 *   net of the error price of a rung that holds less of the evidence? Every
 *   alternative is a priced option with its inputs printed, and every refusal
 *   (rights floor, unpriced, thin class) is printed rather than priced at zero.
 *
 *   HALF TWO — MEASURE. Over the leader's own dated decisions, what share did
 *   they hold personally when the record shows a lower rung could have held it,
 *   and does their actual allocation beat the two naive rules ("delegate every
 *   eligible call", "hold every eligible call") on the outcomes the record
 *   contains? This is the only figure on the page that is about the leader, and
 *   it is a share of WORK, not a score of a PERSON: the page says so, the code
 *   has no field for a rating, and the reading refuses below its floor.
 *
 * WHY EVERY NUMBER IS AN ESTIMATE WITH ITS INPUTS ON THE PAGE
 * ----------------------------------------------------------
 * The category prints a latency and calls it insight. A latency is not a
 * decision: it does not say whether waiting was buying information or was
 * simply an authority jam. The three declarations this module adds — the
 * horizon utilisation, the error schedule and the rework fraction — are
 * CONVENTIONS, printed, clamped and never fitted. The two measured inputs —
 * the class median latency and the priced cost of delay — are read off this
 * workspace's own records and carried with their evidence count.
 *
 * PURITY: no DOM, no storage, no network, no clock globals. `now` is injected.
 * Every figure is re-derived on read; nothing is cached into a snapshot.
 */

import { addDays, dayKey, daysBetween, daysSince, weekKey } from '../time.js';
import { buildChain, responsibleNodeId, LEADER_ID } from './chain.js';
import { recordPeople } from './seat.js';
import { ALTITUDES, altitudeByKey, altitudeRank } from './chainRegistry.js';
import { buildDecisionPortfolioReport } from './decisionPortfolio.js';
import { decisionLatencySamples, latencyBand } from './decisionTempo.js';
import {
  AUTHORITY_CLASSES, CLASS_BY_KEY, classFloorRank,
  FIT_CONVENTION_DEFAULTS, FIT_CONVENTION_BOUNDS, FIT_LIMITS, FIT_REFUSALS,
  FIT_ENGINE_VERSION, snapshotKey,
} from './decisionFitRegistry.js';

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const clampInt = (v, min, max, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const round1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);
const pctOf = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);
const unique = (values) => [...new Set(values.filter(Boolean))];

/** Wilson score interval on a binomial share; refused below the caller's floor. */
export function wilsonInterval(successes, n, z = 1.959963984540054) {
  if (!Number.isFinite(n) || n <= 0) return { lo: null, hi: null, pct: null };
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  return { lo: clamp01(centre - margin), hi: clamp01(centre + margin), pct: Math.round(p * 1000) / 10 };
}

/** Declared, bounded, printed. Not fitted. */
export function fitConventions(settings = {}) {
  const out = {};
  for (const [key, fallback] of Object.entries(FIT_CONVENTION_DEFAULTS)) {
    if (typeof fallback === 'boolean') { out[key] = settings?.[key] !== false; continue; }
    const [min, max] = FIT_CONVENTION_BOUNDS[key] || [fallback, fallback];
    const raw = settings?.[key];
    const n = Number(raw);
    out[key] = Number.isFinite(n) && n >= min && n <= max ? n : fallback;
  }
  return Object.freeze(out);
}

/* ------------------------------------------------------------------ */
/* 1. Classification — what KIND of call is this?                      */
/* ------------------------------------------------------------------ */

const NEGATION = new Set([
  'not', 'no', 'never', 'without', 'isnt', 'wasnt', 'dont', 'doesnt', 'didnt',
  'cannot', 'cant', 'neither', 'nor', 'hardly',
]);

const TOKEN_RE = /[A-Za-z0-9]+/g;

function tokensOf(text) {
  const out = [];
  const lower = String(text || '').toLowerCase();
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(lower)) !== null) out.push({ value: m[0], start: m.index });
  return out;
}

/** A cue phrase matches as a token run, so "on call" never matches "once". */
function phraseHits(tokens, phrase) {
  const parts = String(phrase).toLowerCase().split(/[\s-]+/).filter(Boolean);
  if (!parts.length) return [];
  const hits = [];
  for (let i = 0; i + parts.length <= tokens.length; i += 1) {
    let ok = true;
    for (let j = 0; j < parts.length; j += 1) {
      if (tokens[i + j].value !== parts[j]) { ok = false; break; }
    }
    if (!ok) continue;
    let negated = false;
    for (let j = Math.max(0, i - 3); j < i; j += 1) {
      if (NEGATION.has(tokens[j].value)) { negated = true; break; }
    }
    hits.push({ term: phrase, negated, index: i });
    i += parts.length - 1;
  }
  return hits;
}

const MONEY_RE = /(?:[£$€¥]\s?\d[\d,.]*)|(?:\b\d[\d,.]*\s?(?:k|m|bn|million|thousand)\b)/gi;

/** Sum of money-shaped amounts named anywhere in the text (declared parse). */
export function moneyMentions(text) {
  const matches = String(text || '').match(MONEY_RE) || [];
  const values = [];
  for (const raw of matches) {
    const cleaned = raw.replace(/[£$€¥,\s]/g, '').toLowerCase();
    const m = cleaned.match(/^(\d+(?:\.\d+)?)(k|m|bn|million|thousand)?$/);
    if (!m) continue;
    const base = Number(m[1]);
    const mult = { k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, bn: 1e9 }[m[2]] || 1;
    if (Number.isFinite(base)) values.push(base * mult);
  }
  return values;
}

function decisionText(decision) {
  const options = Array.isArray(decision?.options) ? decision.options.map((o) => `${o?.label || ''} ${o?.pros || ''} ${o?.cons || ''}`) : [];
  return [decision?.title, decision?.question, decision?.rationale, ...options].filter(Boolean).join(' . ');
}

/**
 * Structural cues outrank lexical ones: a recorded amount, an irreversible
 * call, a linked reporting-line change. They are read off the record, not guessed
 * from adjectives. `points` is the declared weight; the winner is the class with
 * the highest total and ties fall to the LOWER class (the cheaper delegation),
 * with the tie printed.
 */
export function structuralEvidence(decision) {
  const evidence = [];
  const amounts = moneyMentions(decisionText(decision));
  if (amounts.length) {
    evidence.push({ classKey: 'capital', points: 6, term: 'amount', detail: `A money amount is named in the record (${amounts.length}).` });
  }
  if (decision?.reversibility === 'irreversible') {
    evidence.push({ classKey: 'structural', points: 2, term: 'irreversible', detail: 'The record marks this call one-way. One-way calls need the rung that holds the evidence, whatever the class.' });
  }
  if (decision?.decisionType) {
    evidence.push({ classKey: null, points: 0, term: 'type', detail: `Recorded decision type: ${decision.decisionType}.` });
  }
  return evidence;
}

/**
 * Classify one decision. Returns the winner, the FULL distribution (so the page
 * prints what lost), the evidence and the refusals — never a single opaque
 * label. Deterministic: the same record always classifies the same way.
 */
export function classifyDecision(decision) {
  const text = decisionText(decision);
  const tokens = tokensOf(text);
  const structural = structuralEvidence(decision);
  const scored = AUTHORITY_CLASSES.map((cls) => {
    let points = 0;
    const evidence = [];
    for (const [phrase, weight] of Object.entries(cls.cues)) {
      const hits = phraseHits(tokens, phrase);
      const positive = hits.filter((h) => !h.negated);
      const negated = hits.filter((h) => h.negated);
      if (positive.length) {
        points += weight * Math.min(3, positive.length);
        evidence.push({ term: phrase, weight, hits: positive.length });
      }
      if (negated.length) {
        points -= weight * 0.5 * negated.length;
        evidence.push({ term: phrase, weight, hits: negated.length, negated: true });
      }
    }
    for (const s of structural) {
      if (s.classKey !== cls.key) continue;
      points += s.points;
      evidence.push({ term: s.term, weight: s.points, structural: true, detail: s.detail });
    }
    return { key: cls.key, label: cls.label, rank: cls.rank, floorRank: cls.floorRank, points: Math.max(0, points), evidence };
  });
  const total = scored.reduce((s, c) => s + c.points, 0);
  const distribution = scored
    .map((c) => ({ ...c, sharePct: total > 0 ? Math.round((c.points / total) * 1000) / 10 : null }))
    .sort((a, b) => b.points - a.points || a.floorRank - b.floorRank);
  const winner = distribution[0];
  const runnerUp = distribution[1] || null;
  const declared = CLASS_BY_KEY[decision?.authorityClass] ? decision.authorityClass : null;
  const classKey = declared || (winner.points > 0 ? winner.key : 'sequencing');
  const cls = CLASS_BY_KEY[classKey] || CLASS_BY_KEY.sequencing;
  return {
    classKey,
    classLabel: cls.label,
    floorRank: cls.floorRank,
    defaultRank: cls.defaultRank,
    declared,
    points: declared ? null : winner.points,
    margin: declared || !runnerUp ? null : winner.points - runnerUp.points,
    distribution,
    evidence: (declared ? [] : (distribution[0]?.evidence || [])).slice(0, 8),
    structural,
    textLength: text.length,
    refusal: !declared && winner.points === 0
      ? 'No class cue matched this record; it is treated as sequencing (the cheapest delegable class) and labelled as unclassified.'
      : null,
  };
}

/* ------------------------------------------------------------------ */
/* 2. Latency measurement — this workspace's own actuarial record      */
/* ------------------------------------------------------------------ */

/**
 * Kaplan–Meier style empirical survival over settlement latencies.
 *
 * The mean is taken over the survival curve, NOT over the raw sample, because
 * the raw mean of a censored sample understates the wait: the calls still open
 * are exactly the long ones, and including them as zero would make the ledger
 * recommend delegation on the strength of the calls it cannot yet see the end
 * of. `refused` is set when the workspace has too few settled calls to say
 * anything at all.
 */
export function survivalLatency(samples, { floorN = FIT_CONVENTION_DEFAULTS.fitClassFloorN } = {}) {
  const values = (samples || []).map((s) => num(s?.latencyDays)).filter((v) => v !== null && v >= 0).sort((a, b) => a - b);
  const n = values.length;
  const sorted = values;
  const median = n === 0 ? null
    : n % 2 === 1 ? sorted[(n - 1) / 2]
      : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  if (n < floorN) {
    return { refused: true, n, floorN, medianDays: round1(median), meanDays: null, p80Days: null, maxDays: n ? sorted[n - 1] : null,
      reason: FIT_REFUSALS['insufficient-record'] };
  }
  // Survival-weighted mean: Σ (survival before interval × interval length), the
  // discrete counterpart of ∫S(t)dt for a sample with no censoring inside it.
  let surv = 1;
  let mean = 0;
  let prev = 0;
  for (let i = 0; i < n; i += 1) {
    const atRisk = n - i;
    if (sorted[i] > prev) { mean += surv * (sorted[i] - prev); prev = sorted[i]; }
    surv *= (atRisk - 1) / atRisk;
  }
  const p80Index = Math.min(n - 1, Math.floor(n * 0.8));
  return { refused: false, n, floorN, medianDays: round1(median), meanDays: round1(mean),
    p80Days: round1(sorted[p80Index]), maxDays: sorted[n - 1], reason: null };
}

/**
 * Pooled latency, measured on the part of the record that can measure it.
 *
 * A decision whose `decidedOn` equals its `date` was logged and decided on the
 * same day: it never sat in a queue, so it carries no information about queues.
 * Including those zeros drags the median to zero and makes the delegation saving
 * vanish for every call that DID wait — a silent, flattering error. They are
 * counted and printed as `sameDay` and excluded from the latency estimate, with
 * the alternative printed beside it.
 */
export function pooledLatency(state, { floorN } = {}) {
  const { samples, unmeasured } = decisionLatencySamples(state);
  const sameDay = (samples || []).filter((s) => (num(s?.latencyDays) ?? 0) === 0).length;
  const informative = (samples || []).filter((s) => (num(s?.latencyDays) ?? 0) > 0);
  return {
    ...survivalLatency(informative, { floorN }),
    unmeasured,
    sameDay,
    note: sameDay
      ? `${sameDay} of ${samples.length} settled calls were decided the day they were logged and carry no queue information; they are counted here and excluded from the estimate.`
      : null,
    band: latencyBand(informative),
  };
}

/**
 * Class latency. Refuses per class below the floor and HANDS BACK the pooled
 * figure with its own n, so the page can print "this class has 2 settled calls;
 * the pooled median over 14 is used and labelled as pooled" instead of a number
 * that looks per-class and is not.
 */
export function latencyByClass(state, classifiedById, { conventions = fitConventions() } = {}) {
  const { samples } = decisionLatencySamples(state);
  const byClass = new Map();
  for (const sample of samples) {
    const cls = classifiedById.get(sample.decisionId);
    if (!cls) continue;
    if (!byClass.has(cls)) byClass.set(cls, []);
    byClass.get(cls).push(sample);
  }
  const pooled = pooledLatency(state, { floorN: conventions.fitClassFloorN });
  const rows = AUTHORITY_CLASSES.map((cls) => {
    const ownSamples = byClass.get(cls.key) || [];
    const sameDay = ownSamples.filter((s) => (num(s?.latencyDays) ?? 0) === 0).length;
    const own = survivalLatency(ownSamples.filter((s) => (num(s?.latencyDays) ?? 0) > 0), { floorN: conventions.fitClassFloorN });
    const used = own.refused ? { ...pooled, pooled: true } : { ...own, pooled: false };
    return {
      classKey: cls.key,
      label: cls.label,
      own,
      used,
      sameDay,
      refusedClass: own.refused,
      reason: own.refused ? `Only ${own.n} settled call(s) of this class took more than a day; the floor is ${conventions.fitClassFloorN}. The pooled median over ${pooled.n} settled calls is used instead and labelled pooled.` : null,
    };
  });
  return { pooled, rows, byKey: new Map(rows.map((r) => [r.classKey, r])) };
}

/* ------------------------------------------------------------------ */
/* 3. Expected hold at a rung — Jaques horizon, utilisable portion     */
/* ------------------------------------------------------------------ */

/**
 * The expected days a call of a class SITS at a given rung before it is decided.
 *
 * Two bounds, both real:
 *   - the class's own settled median (this workspace's behaviour), and
 *   - the rung's utilisable horizon (that altitude's time-span of discretion ×
 *     the declared utilisation fraction): a rung judged on a 7-day span does
 *     not sit on a call for 30 days without it becoming the level above's.
 *
 * The MINIMUM is the estimate and the reason names which bound bound: a call
 * held by a chief is bounded by its class median (latency is a property of the
 * work), a call held by a frontline lead is bounded by the week (authority is a
 * property of the altitude). Printing which one bound is the whole point: they
 * are different problems with different fixes.
 */
export function expectedHoldDays({ classMedianDays, rank, conventions = fitConventions() }) {
  const altitude = ALTITUDES.find((a) => a.rank === rank) || null;
  if (!altitude) return { days: null, bound: 'none', horizonDays: null, reason: 'No altitude at that rank.' };
  const utilisable = round1((altitude.horizonDays * conventions.fitHorizonUtilisationPct) / 100);
  const median = num(classMedianDays);
  if (median === null) return { days: utilisable, bound: 'horizon', horizonDays: altitude.horizonDays, utilisableDays: utilisable,
    reason: `No settled latency available; bounded by ${altitude.label}’s ${altitude.horizonDays}-day horizon at the declared ${conventions.fitHorizonUtilisationPct}% utilisation.` };
  const days = Math.min(median, utilisable);
  return {
    days: round1(days),
    bound: median <= utilisable ? 'class-median' : 'horizon',
    horizonDays: altitude.horizonDays,
    utilisableDays: utilisable,
    reason: median <= utilisable
      ? `Bounded by this workspace’s own settled median for the class (${round1(median)}d), which is inside ${altitude.label}’s ${utilisable}d utilisable horizon.`
      : `Bounded by ${altitude.label}’s ${utilisable}d utilisable horizon, not the class median (${round1(median)}d): authority, not the work, is the constraint.`,
  };
}

/* ------------------------------------------------------------------ */
/* 4. The information deficit — what the receiving rung does not hold  */
/* ------------------------------------------------------------------ */

/**
 * The deficit is read off the TYPED evidence the call rests on, never guessed
 * from prose. For each named record, the owning span is resolved in the
 * reporting tree; if the candidate rung cannot see that span's records, the
 * record is outside its reach and the deficit rises.
 *
 * A record is IN REACH for rung k when the node that owns it is inside the
 * subtree of the nearest ancestor of the current owner at rung k. Because the
 * ledger is read from a seat, `built` is built once and reused; the deficit is
 * therefore a property of the tree, not of the prose.
 */
export function evidenceRecords(state, decision) {
  const records = [];
  const links = Array.isArray(state?.links) ? state.links : [];
  for (const link of links) {
    if (!link || link.sourceId !== decision?.id && link.targetId !== decision?.id) continue;
    const other = link.sourceId === decision?.id ? { type: link.targetType, id: link.targetId } : { type: link.sourceType, id: link.sourceId };
    if (other.type && other.id) records.push({ type: other.type, id: other.id, linkType: link.type || link.linkType || null });
  }
  // A decision's own premise references are typed evidence even without a link row.
  if (Array.isArray(decision?.premiseIds)) {
    for (const id of decision.premiseIds) if (id) records.push({ type: 'premise', id, linkType: 'rests-on' });
  }
  // Everyone named on the call is typed evidence the call rests on: the
  // approver (whose authority the call needs), the driver (whose span does the
  // work) and the contributors. Free-text lists are split the way the record
  // stores them.
  const nameField = (value) => String(value || '').split(/[,;]/).map((v) => v.trim()).filter(Boolean);
  for (const name of nameField(decision?.approver)) records.push({ type: 'person', id: null, name, linkType: 'approved-by' });
  for (const name of nameField(decision?.driver)) records.push({ type: 'person', id: null, name, linkType: 'driven-by' });
  for (const name of nameField(decision?.contributors)) records.push({ type: 'person', id: null, name, linkType: 'contributed-by' });
  return records;
}

function resolvePersonByName(chain, name) {
  if (!name) return null;
  const target = String(name).trim().toLowerCase();
  for (const node of chain.nodes.values()) {
    if (String(node.name || '').trim().toLowerCase() === target) return node;
  }
  return null;
}

function recordOwnerNodeId(state, chain, record) {
  if (!record) return null;
  if (record.type === 'person') return null;
  const collections = {
    case: 'cases', premise: 'premises', goal: 'goals', delegation: 'delegations',
    decision: 'decisions', mandate: 'mandates',
  };
  const collection = collections[record.type];
  if (!collection) return null;
  const row = (state?.[collection] || []).find((r) => r?.id === record.id);
  if (!row) return null;
  // `responsibleNodeId` is the LCA of the managers of the people a record
  // names (Tarjan-style lowest common ancestor, reused from `chain.js`). A
  // record that names nobody belongs to no span: it returns the root sentinel,
  // which is the truthful answer and not an error.
  try {
    const owned = responsibleNodeId(chain, recordPeople(row));
    return owned || null;
  } catch {
    return null;
  }
}

/**
 * Deficit in points, 0..100. Zero means the candidate rung holds every record
 * the call rests on. Each unreachable record contributes a declared amount by
 * its link weight: an approver above the candidate rung, a premise it cannot
 * read and a linked case outside its span all matter, but not equally.
 */
export function informationDeficit({ state, chain, decision, ownerNodeId, candidateRank }) {
  const ownerNode = chain.nodes.get(ownerNodeId) || null;
  const ownerRank = altarankOf(ownerNode);
  const records = evidenceRecords(state, decision);
  if (!records.length) {
    // UNKNOWN, not zero. Pricing an unmeasurable deficit at zero would tell the
    // leader that moving this call is risk-free, which the record cannot
    // support. The declared default is applied and the alternative is marked
    // provisional so the page can say so.
    return { points: 0, unknown: true, records: [], unreachable: [], reachable: 0,
      note: 'The call names no typed evidence at all. That is a finding about the record, not about the rung — and it means the deficit cannot be measured.' };
  }
  // The span that owns this call, and the descendant of it that sits at the
  // candidate rung. A candidate further down still sees the records inside its
  // own branch and loses the rest.
  const perRecordPoints = { case: 18, premise: 22, goal: 14, delegation: 12, decision: 16, mandate: 10, person: 14 };
  const out = [];
  for (const record of records) {
    let reachable = true;
    let ownerAt = null;
    if (record.type === 'person') {
      const person = resolvePersonByName(chain, record.name);
      if (person) {
        ownerAt = person.id;
        // A person is in reach when they are inside the candidate's own span or
        // are the candidate themself. Above the owner, everyone is in reach.
        reachable = candidateRank >= ownerRank ? true : insideSubtree(chain, ownerNodeId, candidateRank, person.id);
      }
    } else {
      ownerAt = recordOwnerNodeId(state, chain, record);
      if (ownerAt) reachable = candidateRank >= ownerRank ? true : insideSubtree(chain, ownerNodeId, candidateRank, ownerAt);
    }
    out.push({ ...record, ownerNodeId: ownerAt, reachable, points: perRecordPoints[record.type] ?? 12 });
  }
  const unreachable = out.filter((r) => !r.reachable);
  const points = Math.min(100, unreachable.reduce((s, r) => s + r.points, 0));
  return {
    points,
    unknown: false,
    records: out,
    unreachable,
    reachable: out.length - unreachable.length,
    note: unreachable.length === 0
      ? `All ${out.length} record(s) this call rests on are inside the candidate rung’s own span.`
      : `${unreachable.length} of ${out.length} record(s) sit outside the candidate rung’s span (${unique(unreachable.map((r) => r.type)).join(', ')}); the deficit is the declared points for those records.`,
  };
}

function altarankOf(node) {
  return node?.altitude ? altitudeRank(node.altitude) : 0;
}

/**
 * Is `targetId` inside the branch of `ownerNodeId`'s subtree that sits at
 * `candidateRank`? The rung below the owner that contains the target, if any.
 * A target at or above the candidate rung is NOT in reach (it is the level's
 * own work, not the level below's).
 */
function insideSubtree(chain, ownerNodeId, candidateRank, targetId) {
  const owner = chain.nodes.get(ownerNodeId);
  if (!owner) return false;
  const step = descentToRank(chain, owner, candidateRank);
  if (!step) return false;
  return (step.subtreeIds || []).includes(targetId) || step.id === targetId;
}

/** The descendant of `node` at `rank`, preferring the branch with most span. */
function descentToRank(chain, node, rank) {
  if (altarankOf(node) === rank) return node;
  const children = (node.childIds || []).map((id) => chain.nodes.get(id)).filter(Boolean);
  if (!children.length) return null;
  const sorted = children.slice().sort((a, b) => (b.subtreeIds?.length || 0) - (a.subtreeIds?.length || 0));
  for (const child of sorted) {
    const found = descentToRank(chain, child, rank);
    if (found) return found;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* 5. The priced alternative                                           */
/* ------------------------------------------------------------------ */

/**
 * Price ONE alternative rung for ONE call.
 *
 * Returns either a refusal (with its printed reason) or a priced option with
 * every input exposed. The net weekly benefit is:
 *
 *   (hold days at the owner − hold days at the candidate) × value per week
 *     − probability of error × rework fraction × value per week × hold days
 *
 * The second term is the price of delegating into a rung that does not hold the
 * evidence. It is why "delegate everything" is not the answer the ledger prints,
 * and why the naive-rule comparison in half two has teeth.
 */
export function priceAlternative({
  decision, ownerNodeId, ownerRank, candidateRank, valuePerWeek, currency,
  classLatency, conventions, chain, state, ageDays = 0,
}) {
  const floor = classFloorRank(decision.fitClassKey || 'sequencing');
  const base = {
    candidateRank,
    altitudeKey: (ALTITUDES.find((a) => a.rank === candidateRank) || {}).key || null,
    label: (ALTITUDES.find((a) => a.rank === candidateRank) || {}).label || `Rank ${candidateRank}`,
    currency: currency || null,
  };
  if (candidateRank < floor) {
    return { ...base, available: false, refusal: 'rights-floor', reason: FIT_REFUSALS['rights-floor'],
      floorRank: floor, netSaving: null };
  }
  // ESCALATION, not delegation. A call held BELOW its class floor cannot be
  // fixed by moving it down — there may be no rung beneath the holder at all
  // (a frontline lead holding a capital call is rank 1). The only honest remedy
  // is upward: hand the call to the rung that can grant what it commits. It is
  // priced with the SAME machinery and the sign of the wait difference reversed
  // (authority travels up, the wait it removes is the holder's remaining hold).
  const escalating = candidateRank > ownerRank;
  if (candidateRank >= ownerRank && !escalating) {
    return { ...base, available: false, refusal: 'not-below-owner',
      reason: 'This rung is not below the current owner, so moving the call here transfers no authority.',
      floorRank: floor, netSaving: null };
  }
  if (escalating && (ownerRank >= floor || candidateRank > floor)) {
    return { ...base, available: false, refusal: 'not-above-floor',
      reason: 'Escalation is only priced to the class floor, and only when the holder is below it.',
      floorRank: floor, netSaving: null };
  }
  const ownerHold = expectedHoldDays({ classMedianDays: classLatency?.used?.medianDays, rank: ownerRank, conventions });
  const candidateHold = expectedHoldDays({ classMedianDays: classLatency?.used?.medianDays, rank: candidateRank, conventions });
  // `hold` is the expected TOTAL time from the call being logged. The remaining
  // time is what a delegation can still save: a call already 35 days old cannot
  // save the 35 days it has already spent. Clamped at zero, never negative.
  const age = Math.max(0, Number(ageDays) || 0);
  const ownerRemaining = Math.max(0, (ownerHold.days ?? 0) - age);
  const candidateRemaining = Math.max(0, candidateHold.days ?? 0);
  const daysSaved = escalating
    ? Math.max(0, ownerRemaining)
    : Math.max(0, ownerRemaining - candidateRemaining);
  const deficit = informationDeficit({ state, chain, decision, ownerNodeId, candidateRank });
  const deficitPoints = deficit.unknown ? conventions.fitNoEvidenceDeficitPts : deficit.points;
  const errorPct = Math.min(95, conventions.fitBaseErrorPct + conventions.fitErrorPerDeficitPointPct * deficitPoints);
  // Authority distance: rungs between the owner and the candidate, minus the
  // nearest delegable rung, which is the baseline. Each extra rung adds a
  // monitoring/return-path cost charged against the wait saved.
  const distance = escalating ? Math.max(0, candidateRank - ownerRank) : Math.max(0, ownerRank - candidateRank);
  const extraRungs = Math.max(0, distance - 1);
  const priced = num(valuePerWeek) !== null && valuePerWeek > 0;
  // STOCK, not flow. Every figure below is a currency amount over the remaining
  // expected holding period, not a per-week rate. The old name ("weekly") was a
  // units error: multiplying a per-week value by a number of weeks yields a
  // total, and printing it as a weekly figure makes every saving look 10× its
  // size. `savingWeeks` is printed so the arithmetic is auditable.
  const savingWeeks = Math.round((daysSaved / 7) * 10) / 10;
  const waitSaving = priced ? round1((daysSaved / 7) * valuePerWeek) : null;
  const errorCost = priced
    ? round1((errorPct / 100) * (conventions.fitReworkCostPct / 100) * valuePerWeek * (Math.max(0, (candidateHold.days ?? 0)) / 7))
    : null;
  const monitoringCost = priced ? round1((conventions.fitMonitoringCostPctPerRung / 100) * Math.max(0, waitSaving) * extraRungs) : null;
  const netSaving = priced ? round1(waitSaving - errorCost - monitoringCost) : null;
  const materialityFloor = priced ? (conventions.fitMaterialityPct / 100) * waitSaving : null;
  const irreversible = decision.reversibility === 'irreversible';
  const flags = [];
  if (irreversible && deficit.points > 0) flags.push({ key: 'irreversible-below-floor', text: FIT_REFUSALS['irreversible-below-floor'] });
  if (candidateHold.bound === 'horizon') flags.push({ key: 'horizon-bound', text: `The candidate rung’s own horizon would force a decision inside ${candidateHold.utilisableDays} days.` });
  if (age >= (ownerHold.days ?? 0)) flags.push({ key: 'already-overdue', text: `The call is ${age} days old, which is at or past the ${ownerHold.days}-day expected hold at its own rung. Waiting is no longer buying anything measurable.` });
  if (deficit.unknown) flags.push({ key: 'no-evidence', text: FIT_REFUSALS['no-evidence'] });
  return {
    ...base,
    available: true,
    refusal: null,
    reason: null,
    escalating,
    direction: escalating ? 'escalate' : 'delegate',
    // An escalation is bought for CORRECTNESS, not for time: the holder cannot
    // lawfully grant what the call commits. Its net is usually negative, and
    // that is the honest print — the ledger must never let a negative net read
    // as "leave it where it is".
    complianceFix: escalating,
    floorRank: floor,
    ownerHoldDays: ownerHold.days,
    candidateHoldDays: candidateHold.days,
    ageDays: age,
    ownerRemainingDays: round1(ownerRemaining),
    candidateRemainingDays: round1(candidateRemaining),
    daysSaved: round1(daysSaved),
    savingWeeks,
    waitSaving,
    deficitPoints,
    deficitUnknown: Boolean(deficit.unknown),
    deficitNote: deficit.note,
    monitoringCost,
    extraRungs,
    unreachableRecords: deficit.unreachable.length,
    errorPct: round1(errorPct),
    errorCost,
    netSaving,
    materialityFloor: round1(materialityFloor),
    material: priced ? netSaving > 0 && netSaving >= materialityFloor : null,
    priced,
    refusalNote: priced ? null : FIT_REFUSALS.unpriced,
    provisional: Boolean(deficit.unknown),
    flags,
    inputs: {
      ownerHold, candidateHold,
      conventions: {
        baseErrorPct: conventions.fitBaseErrorPct,
        errorPerDeficitPointPct: conventions.fitErrorPerDeficitPointPct,
        reworkCostPct: conventions.fitReworkCostPct,
        horizonUtilisationPct: conventions.fitHorizonUtilisationPct,
        monitoringCostPctPerRung: conventions.fitMonitoringCostPctPerRung,
        noEvidenceDeficitPts: conventions.fitNoEvidenceDeficitPts,
      },
    },
  };
}

/* ------------------------------------------------------------------ */
/* 6. The book — every open call as a priced option                    */
/* ------------------------------------------------------------------ */

/** Resolve the rung that owns a decision from the reporting tree. */
function ownerForDecision(state, chain, decision) {
  const byName = (name) => {
    if (!name) return null;
    const node = resolvePersonByName(chain, name);
    if (!node) return null;
    return { nodeId: node.id, name: node.name, rank: altarankOf(node) };
  };
  const approver = byName(decision?.approver);
  const driver = byName(decision?.driver);
  const chosen = approver && approver.rank > 0 ? approver : driver;
  if (chosen) return { ...chosen, source: approver && approver.rank > 0 ? 'approver' : 'driver' };
  // Fall back to the resolved lowest common ancestor of the linked records, and
  // finally to the workspace leader. The source is printed either way.
  try {
    const linked = evidenceRecords(state, decision).filter((r) => r.type !== 'person');
    if (linked.length) {
      const ownerId = recordOwnerNodeId(state, chain, linked[0]);
      const node = ownerId ? chain.nodes.get(ownerId) : null;
      if (node) return { nodeId: node.id, name: node.name, rank: altarankOf(node), source: 'linked-record' };
    }
  } catch { /* an unresolvable link is not an error; it falls through to the root */ }
  const root = chain.nodes.get(LEADER_ID);
  return root ? { nodeId: LEADER_ID, name: root.name, rank: altarankOf(root), source: 'workspace-root' } : null;
}

/**
 * Build the whole book: one row per open call, with its class, its owner, its
 * priced ladder of alternatives and the single best available move. A call
 * whose value cannot be priced is reported with `priced: false` and its wait
 * counted in days — never as a zero saving.
 */
export function buildFitBook(state, { now = new Date(), conventions = fitConventions(), chain = null } = {}) {
  const at = now instanceof Date ? now : new Date(now);
  const built = chain || buildChain(state, { now: at, settings: state?.settings });
  const open = (Array.isArray(state?.decisions) ? state.decisions : []).filter((d) => d && d.id && !d.chosen);
  const classifiedById = new Map();
  for (const d of open) classifiedById.set(d.id, classifyDecision(d).classKey);
  // Also classify settled decisions so the class latency ledger can use them.
  for (const d of (state?.decisions || [])) {
    if (d?.id && d.chosen && !classifiedById.has(d.id)) classifiedById.set(d.id, classifyDecision(d).classKey);
  }
  const latency = latencyByClass(state, classifiedById, { conventions });
  const portfolio = buildPortfolioOrNull(state, at);

  const rows = [];
  for (const decision of open) {
    const cls = classifyDecision(decision);
    const owner = ownerForDecision(state, built, decision);
    const valueTerms = portfolio?.byDecisionId?.get(decision.id) || null;
    const priced = Boolean(valueTerms?.priced && num(valueTerms.weeklyCoD) !== null && valueTerms.weeklyCoD > 0);
    const valuePerWeek = priced ? valueTerms.weeklyCoD : null;
    const currency = valueTerms?.currency || null;
    const classLatency = latency.byKey.get(cls.classKey) || null;
    const ageDays = daysSince(decision.date, at) ?? 0;
    const ownerRank = owner?.rank || 1;
    const alternatives = [];
    if (owner) {
      for (let rank = ownerRank - 1; rank >= Math.max(1, cls.floorRank); rank -= 1) {
        alternatives.push(priceAlternative({
          decision: { ...decision, fitClassKey: cls.classKey },
          ownerNodeId: owner.nodeId, ownerRank, candidateRank: rank,
          valuePerWeek, currency, classLatency, conventions, chain: built, state, ageDays,
        }));
      }
      // A rights refusal is printed for the rung directly under the owner
      // whenever that rung is below the class floor — INCLUDING when the owner
      // itself sits below the floor.
      //
      // This branch originally required `ownerRank - 1 >= 1 && ownerRank - 1 <
      // floor`, which silently dropped the single most important case: a
      // frontline lead (rank 1) holding a capital call (floor 4). The upward
      // loop above produces nothing when ownerRank-1 < floor, so the whole
      // `alternatives` array came back EMPTY — and an empty ladder renders as
      // "no alternative exists" when the truth is "every alternative is refused
      // for want of authority". That is exactly the inversion this module
      // exists to prevent, so the refusal row is now unconditional.
      if (ownerRank - 1 >= 1 && ownerRank - 1 < cls.floorRank) {
        alternatives.push(priceAlternative({
          decision: { ...decision, fitClassKey: cls.classKey },
          ownerNodeId: owner.nodeId, ownerRank, candidateRank: ownerRank - 1,
          valuePerWeek, currency, classLatency, conventions, chain: built, state, ageDays,
        }));
      }
      // THE MISSING ROW. When the holder itself sits below the class floor there
      // is no rung beneath it to delegate to, so the upward loop above emits
      // nothing and `alternatives` came back EMPTY — 3 of the demo's 6 governed
      // calls. An empty ladder reads as "no option exists" when the truth is
      // "the holder cannot grant this call at all". Price the escalation instead.
      if (ownerRank < cls.floorRank) {
        alternatives.push(priceAlternative({
          decision: { ...decision, fitClassKey: cls.classKey },
          ownerNodeId: owner.nodeId, ownerRank, candidateRank: cls.floorRank,
          valuePerWeek, currency, classLatency, conventions, chain: built, state, ageDays,
        }));
      }
    }
    // A call held BELOW its class floor is a misfit in the strongest sense: the
    // rung that holds it cannot grant what the call commits. There is no rung
    // below the owner to delegate to, so no delegation saving exists — the
    // remedy is an escalation, and it is reported as its own priced-as-zero
    // finding rather than as silence.
    const heldBelowFloor = ownerRank < cls.floorRank;
    const priced_alternatives = alternatives.filter((a) => a.available && a.priced);
    const best = priced_alternatives.slice().sort((a, b) => (b.netSaving ?? -Infinity) - (a.netSaving ?? -Infinity))[0] || null;
    // A provisional alternative (deficit unmeasurable) is priced and shown,
    // but never becomes the recommendation: the ledger does not move authority
    // on evidence it could not read.
    const materialBest = best && best.netSaving > 0 && best.material && !best.provisional ? best : null;
    rows.push({
      decision,
      id: decision.id,
      title: decision.title || '(untitled call)',
      classKey: cls.classKey,
      classLabel: cls.classLabel,
      classification: cls,
      owner,
      ownerRank,
      openDays: ageDays,
      reversibility: decision.reversibility || 'reversible',
      priced,
      valuePerWeek: valuePerWeek === null ? null : round1(valuePerWeek),
      currency,
      valueRefusal: priced ? null : FIT_REFUSALS.unpriced,
      latency: classLatency,
      alternatives,
      heldBelowFloor,
      best,
      materialBest,
      // The expected cost of the wait this call still owes at its own rung.
      holdingCostRemaining: priced ? round1((Math.max(0, (expectedHoldDays({ classMedianDays: classLatency?.used?.medianDays, rank: ownerRank, conventions }).days ?? 0) - ageDays) / 7) * valuePerWeek) : null,
      heldPastHorizon: owner ? ageDays > ((ALTITUDES.find((a) => a.rank === ownerRank)?.horizonDays || 999)) : false,
      recommendation: materialBest ? {
        rank: materialBest.candidateRank,
        label: materialBest.label,
        netSaving: materialBest.netSaving,
        savingWeeks: materialBest.savingWeeks,
        daysSaved: materialBest.daysSaved,
        currency,
        errorPct: materialBest.errorPct,
        flags: materialBest.flags,
      } : null,
    });
  }
  rows.sort((a, b) => {
    const av = a.materialBest?.netSaving ?? -1;
    const bv = b.materialBest?.netSaving ?? -1;
    if (bv !== av) return bv - av;
    return b.openDays - a.openDays;
  });
  return {
    engineVersion: FIT_ENGINE_VERSION,
    now: at.toISOString(),
    conventions,
    latency,
    rows: rows.slice(0, FIT_LIMITS.callsPerReport),
    totals: {
      open: open.length,
      priced: rows.filter((r) => r.priced).length,
      unpriced: rows.filter((r) => !r.priced).length,
      withRecommendation: rows.filter((r) => r.materialBest).length,
      rightsRefused: rows.reduce((s, r) => s + r.alternatives.filter((a) => a.refusal === 'rights-floor').length, 0),
      heldPastHorizon: rows.filter((r) => r.heldPastHorizon).length,
      classes: AUTHORITY_CLASS_KEYS_PRESENT(rows),
    },
    portfolioAvailable: Boolean(portfolio),
    byId: new Map(rows.map((r) => [r.id, r])),
  };
}

function AUTHORITY_CLASS_KEYS_PRESENT(rows) {
  const out = {};
  for (const cls of AUTHORITY_CLASSES) out[cls.key] = rows.filter((r) => r.classKey === cls.key).length;
  return out;
}

function buildPortfolioOrNull(state, now) {
  try {
    const report = buildDecisionPortfolioReport(state, now);
    const byDecisionId = new Map();
    for (const entry of report?.decisions || []) {
      if (!entry?.decision?.id) continue;
      byDecisionId.set(entry.decision.id, {
        priced: Boolean(entry.priced),
        // Decision Tempo's timing carries the priced rate; the portfolio row's
        // own `weeklyCoD` is a different quantity (a CD3 term) and is null for
        // calls that are nevertheless fully priced.
        weeklyCoD: num(entry.timing?.ratePerWeek) ?? num(entry.weeklyCoD),
        currency: entry.timing?.currency || entry.currency || null,
      });
    }
    return { report, byDecisionId };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* 7. Half two — the span's own contested share and its naive rules    */
/* ------------------------------------------------------------------ */

/**
 * The extent to which a span HELD calls past the point where a lower rung could
 * have finished them.
 *
 * The naive version of this measure is a tautology: every call the span held was
 * held by the span, so the share is always 100%. That number would be honest and
 * useless. The measurable question is: of the settled calls this span held that a
 * lower rung could LAWFULLY have held, how many did the span hold for LONGER than
 * that lower rung's utilisable horizon? That is a dated property of the record,
 * it is refused below its floor, and it is the one figure on this page that is
 * about the leader rather than about the call.
 *
 * It is still a share of WORK: the page says so, the payload has no field for a
 * rating, and above the manager rank the individual call ids never leave this
 * function (see `fitRollUp`).
 */
export function buildContestedShare(state, { now = new Date(), chain = null, nodeId = LEADER_ID, conventions = fitConventions() } = {}) {
  const at = now instanceof Date ? now : new Date(now);
  const built = chain || buildChain(state, { now: at, settings: state?.settings });
  const node = built.nodes.get(nodeId) || built.nodes.get(LEADER_ID);
  if (!node) return { ok: false, error: 'That span is not in the chain.' };
  const rank = altarankOf(node);
  const decided = (state?.decisions || []).filter((d) => d?.chosen && d.decidedOn);
  const classifiedById = new Map();
  for (const d of (state?.decisions || [])) if (d?.id) classifiedById.set(d.id, classifyDecision(d).classKey);
  const latency = latencyByClass(state, classifiedById, { conventions });
  const rows = [];
  for (const decision of decided) {
    const cls = classifyDecision(decision);
    // No lower rung may hold this class: nothing to contest.
    if (cls.floorRank >= rank) continue;
    const owner = ownerForDecision(state, built, decision);
    // OWN-held only. A call a frontline lead held is not evidence about the
    // director's allocation of their own authority, and counting it would let a
    // VP's score float on work they never touched.
    if (!owner || owner.nodeId !== nodeId) continue;
    const measured = daysBetween(decision.date, decision.decidedOn);
    const latencyDays = measured === null ? null : Math.max(0, measured);
    // The highest rung below the owner that may hold the class — the cheapest
    // thing the leader could have done — and the hold it would have achieved.
    const delegableRank = Math.min(rank - 1, 5);
    const lowerHold = expectedHoldDays({
      classMedianDays: (latency.byKey.get(cls.classKey) || {}).used?.medianDays,
      rank: Math.max(1, delegableRank), conventions,
    });
    const overran = latencyDays !== null && lowerHold.days !== null ? Math.max(0, round1(latencyDays - lowerHold.days)) : null;
    rows.push({
      decisionId: decision.id,
      title: decision.title || '',
      classKey: cls.classKey,
      floorRank: cls.floorRank,
      ownerRank: owner.rank,
      decidedOn: decision.decidedOn,
      latencyDays,
      delegableRank,
      lowerHoldDays: lowerHold.days,
      overranDays: overran,
      contested: overran !== null ? overran > 0 : null,
      reversibility: decision.reversibility || 'reversible',
      outcome: decision.outcome || null,
    });
  }
  // A same-day call can never be contested: it never waited at all.
  const measurable = rows.filter((r) => r.contested !== null && r.latencyDays > 0);
  const eligibleN = measurable.length;
  const contestedN = measurable.filter((r) => r.contested === true).length;
  const share = wilsonInterval(contestedN, eligibleN);
  const refused = eligibleN < conventions.fitShareFloorN;
  const byClass = AUTHORITY_CLASSES.map((cls) => {
    const inClass = measurable.filter((r) => r.classKey === cls.key);
    const contested = inClass.filter((r) => r.contested).length;
    const classShare = wilsonInterval(contested, inClass.length);
    return {
      classKey: cls.key,
      label: cls.label,
      floorRank: cls.floorRank,
      eligibleN: inClass.length,
      contestedN: contested,
      sharePct: inClass.length >= conventions.fitShareFloorN ? classShare.pct : null,
      interval: inClass.length >= conventions.fitShareFloorN ? { lo: Math.round(classShare.lo * 1000) / 10, hi: Math.round(classShare.hi * 1000) / 10 } : { lo: null, hi: null },
      refused: inClass.length < conventions.fitShareFloorN,
      reason: inClass.length < conventions.fitShareFloorN
        ? `${inClass.length} measurable call(s) in this class; the floor is ${conventions.fitShareFloorN}.`
        : null,
      meanOverrunDays: inClass.length ? round1(inClass.reduce((a, r) => a + (r.overranDays || 0), 0) / inClass.length) : null,
    };
  });
  return {
    ok: true,
    nodeId,
    nodeName: node.name,
    rank,
    altitudeKey: node.altitude,
    eligibleN,
    contestedN,
    uncontestedN: eligibleN - contestedN,
    sameDayExcluded: rows.filter((r) => r.latencyDays === 0).length,
    notDelegable: (state?.decisions || []).filter((d) => d?.chosen && classifyDecision(d).floorRank >= rank).length,
    sharePct: refused ? null : share.pct,
    interval: refused ? { lo: null, hi: null } : { lo: Math.round(share.lo * 1000) / 10, hi: Math.round(share.hi * 1000) / 10 },
    refused,
    reason: refused
      ? `${eligibleN} measurable eligible call(s); the floor is ${conventions.fitShareFloorN}. A share of ${eligibleN} is a description, not a measurement.`
      : null,
    definition: 'The share of measurable settled calls (a lower rung may lawfully hold the class, and the call took more than a day) that this span held for longer than the rung below could have finished them.',
    byClass,
    rows,
  };
}

/**
 * Score the span's ACTUAL allocation against the two naive rules on the record's
 * own priced calls.
 *
 *   ACTUAL      — what the record did: each call took its measured latency.
 *   HOLD-ALL    — identical in latency to ACTUAL on calls already held here.
 *   DELEGATE-ALL— every eligible call moves to the rung below; latency becomes
 *                 that rung's utilisable hold, and the rule pays the declared
 *                 information-deficit error price on every one of them.
 *
 * All three act on the SAME priced eligible set, so the comparison is paired and
 * needs no population assumption. Where a call has no priced value it is counted
 * as unmeasured — never as a free win — and the verdict refuses below the floor.
 */
export function scoreAllocationRules(share, { book = null, conventions = fitConventions() } = {}) {
  if (!share?.ok) return { refused: true, reason: share?.error || 'No share to score.' };
  const byId = book?.byId || new Map();
  const measurable = share.rows.filter((r) => r.latencyDays > 0);
  const priced = measurable
    .map((r) => {
      const row = byId.get(r.decisionId);
      // A settled call is no longer in the open book; read its priced rate off
      // the book only when present, otherwise it is unmeasured for this rule.
      return row && row.priced ? { ...r, valuePerWeek: row.valuePerWeek, currency: row.currency } : null;
    })
    .filter(Boolean);
  if (priced.length < conventions.fitPricedFloorN) {
    return {
      refused: true,
      paired: priced.length,
      reason: `${priced.length} measurable call(s) with a priced value at stake; the floor is ${conventions.fitPricedFloorN}. The comparison is refused rather than run on calls whose cost of waiting is unknown.`,
      measured: false,
    };
  }
  const totals = {};
  let actualCost = 0;
  let delegateLatencyCost = 0;
  let delegateErrorCost = 0;
  for (const row of priced) {
    const cur = row.currency || 'unpriced';
    const perDay = row.valuePerWeek / 7;
    const actual = Math.max(0, row.latencyDays);
    const lower = Math.max(0, row.lowerHoldDays || 0);
    const deficitPts = 40; // the declared deficit of a call moved to its floor
    const errorPct = Math.min(95, conventions.fitBaseErrorPct + conventions.fitErrorPerDeficitPointPct * deficitPts);
    actualCost += actual * perDay;
    delegateLatencyCost += lower * perDay;
    delegateErrorCost += (errorPct / 100) * (conventions.fitReworkCostPct / 100) * actual * perDay;
    totals[cur] = (totals[cur] || 0) + 1;
  }
  const r1 = (v) => Math.round(v * 10) / 10;
  const actualTotal = r1(actualCost);
  const delegateTotal = r1(delegateLatencyCost + delegateErrorCost);
  const delta = r1(actualTotal - delegateTotal);
  return {
    refused: false,
    measured: true,
    paired: priced.length,
    currencies: totals,
    actual: { label: 'Held at this span', costOfWaiting: actualTotal },
    holdAll: { label: 'Hold every eligible call', costOfWaiting: actualTotal, note: 'Identical to the actual allocation for calls this span already holds.' },
    delegateAll: {
      label: 'Delegate every eligible call',
      waitCost: r1(delegateLatencyCost),
      errorCost: r1(delegateErrorCost),
      costOfWaiting: delegateTotal,
      errorPct: Math.min(95, Math.round(conventions.fitBaseErrorPct + conventions.fitErrorPerDeficitPointPct * 40)),
    },
    // Positive = this record's allocation cost MORE than delegating everything.
    // The page prints the sign, the currency mix and the error price beside it.
    actualMinusDelegate: delta,
    verdict: delta > 0 ? 'delegating-everything-would-have-been-cheaper' : delta < 0 ? 'holding-was-cheaper-after-the-error-price' : 'equal',
    note: `All three rules act on the same ${priced.length} priced, measurable calls, so the comparison is paired. The delegate-everything error rate is the declared schedule at a 40-point deficit; the rework fraction is ${conventions.fitReworkCostPct}% of the value at stake. Neither is fitted.`,
  };
}

/* ------------------------------------------------------------------ */
/* 8. Roll-up — one reading per rung, rendered per altitude            */
/* ------------------------------------------------------------------ */

/**
 * The span reading that rolls up. Identity-free above the manager rank by
 * construction: the row carries counts, rates and the class mix — never a call
 * id, never a person, never a title. The caller (UI and CSV) can therefore not
 * leak detail by accident, because there is no detail to leak.
 */
export function fitRollUp(state, { now = new Date(), chain = null, conventions = fitConventions(), nodeId = LEADER_ID } = {}) {
  const at = now instanceof Date ? now : new Date(now);
  const built = chain || buildChain(state, { now: at, settings: state?.settings });
  const node = built.nodes.get(nodeId);
  if (!node) return { ok: false, error: 'That span is not in the chain.' };
  const rank = altarankOf(node);
  const book = buildFitBook(state, { now: at, conventions, chain: built });
  const subtree = new Set([nodeId, ...(node.subtreeIds || [])]);
  const own = book.rows.filter((r) => r.owner && subtree.has(r.owner.nodeId));
  const share = buildContestedShare(state, { now: at, chain: built, nodeId, conventions });
  const children = (node.childIds || []).map((id) => built.nodes.get(id)).filter(Boolean)
    .filter((child) => altarankOf(child) > 0)
    .map((child) => {
      const childBook = book.rows.filter((r) => r.owner && new Set([child.id, ...(child.subtreeIds || [])]).has(r.owner.nodeId));
      const pricedRows = childBook.filter((r) => r.priced);
      return {
        nodeId: child.id,
        name: child.name,
        rank: altarankOf(child),
        altitudeKey: child.altitude,
        open: childBook.length,
        priced: pricedRows.length,
        recommendationTotal: sumByCurrency(pricedRows.map((r) => r.materialBest).filter(Boolean)),
        heldPastHorizon: childBook.filter((r) => r.heldPastHorizon).length,
      };
    });
  const level = altitudeByKey(node.altitude) || null;
  // Aggregate saving per currency across the material recommendations in scope.
  const saving = sumByCurrency(own.map((r) => r.materialBest).filter(Boolean));
  return {
    ok: true,
    nodeId,
    nodeName: node.name,
    rank,
    altitudeKey: node.altitude,
    altitudeLabel: level?.label || 'Unassigned',
    question: level ? FIT_ALTITUDE_QUESTION(level.key) : '',
    open: own.length,
    priced: own.filter((r) => r.priced).length,
    unpriced: own.filter((r) => !r.priced).length,
    recommendationN: own.filter((r) => r.materialBest).length,
    heldPastHorizon: own.filter((r) => r.heldPastHorizon).length,
    rightsRefused: own.reduce((s, r) => s + r.alternatives.filter((a) => a.refusal === 'rights-floor').length, 0),
    savingByCurrency: saving,
    classes: AUTHORITY_CLASSES.map((cls) => {
      const inClass = own.filter((r) => r.classKey === cls.key);
      return { classKey: cls.key, label: cls.label, floorRank: cls.floorRank, open: inClass.length,
        priced: inClass.filter((r) => r.priced).length,
        recommendations: inClass.filter((r) => r.materialBest).length };
    }),
    share: {
      eligibleN: share.ok ? share.eligibleN : 0,
      sharePct: share.ok ? share.sharePct : null,
      interval: share.ok ? share.interval : { lo: null, hi: null },
      refused: share.ok ? share.refused : true,
      reason: share.ok ? share.reason : share.error,
    },
    children,
    // Composition guard: the naive mean of child recommendations beside the
    // pooled total, exactly as the Command Chain prints both roll-ups.
    compositionWarning: compositionWarning(children, saving),
    detail: rank <= 2 ? own.map((r) => ({ id: r.id, title: r.title, classKey: r.classKey, recommendation: r.recommendation })) : null,
    detailWithheld: rank > 2,
  };
}

function FIT_ALTITUDE_QUESTION(key) {
  // Imported lazily to keep the registry dependency one-directional.
  return FIT_QUESTION_TABLE[key] || '';
}

const FIT_QUESTION_TABLE = Object.freeze({
  frontline: 'What am I holding this week that a deputy or a shadow could take — and what would that give me back?',
  manager: 'What is my span holding at my rung that its own leads should hold, and what is it costing this cycle?',
  director: 'Which authority is accumulating at my rung, what is a boundary change worth, and is my span’s contested share one number or five?',
  exec: 'What is this function paying to hold calls that belong a rung down — and what risk is that buying?',
  chief: 'How much of this enterprise’s decision latency is self-inflicted authority, and which classes would the board see change?',
});

function sumByCurrency(recs) {
  const out = {};
  for (const rec of recs) {
    const cur = rec.currency || 'unpriced';
    out[cur] = Math.round(((out[cur] || 0) + (rec.netSaving || 0)) * 10) / 10;
  }
  return out;
}

function compositionWarning(children, pooled) {
  const priced = children.filter((c) => c.priced > 0);
  if (priced.length < 2) return null;
  const currencies = Object.keys(pooled || {});
  for (const cur of currencies) {
    const childTotal = children.reduce((s, c) => s + (c.recommendationTotal?.[cur] || 0), 0);
    const naiveMean = childTotal / priced.length;
    if (pooled[cur] !== undefined && Math.abs(naiveMean - pooled[cur]) > Math.max(1, Math.abs(pooled[cur]) * 0.2)) {
      return `The naive mean of child spans (${Math.round(naiveMean)} ${cur}) disagrees with the pooled total (${Math.round(pooled[cur])} ${cur}) by more than 20%. The pooled figure is the one that is true of this span; the mean is printed so nobody has to guess which was used.`;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* 9. The upward brief — identity-free by construction                 */
/* ------------------------------------------------------------------ */

export function fitBrief(state, { now = new Date(), chain = null, conventions = fitConventions() } = {}) {
  const at = now instanceof Date ? now : new Date(now);
  const built = chain || buildChain(state, { now: at, settings: state?.settings });
  const root = built.nodes.get(LEADER_ID);
  const top = fitRollUp(state, { now: at, chain: built, conventions, nodeId: LEADER_ID });
  const lines = [];
  if (!top.ok) return { text: 'No span to report.', lines: [] };
  lines.push(`DECISION-FIT BRIEF — ${dayKey(at)} — ${top.nodeName} (span of ${(root?.subtreeIds || []).length} people)`);
  lines.push(`Open calls in scope: ${top.open} (${top.priced} priced, ${top.unpriced} unpriced). Held past the owner’s horizon: ${top.heldPastHorizon}.`);
  lines.push(`Calls with a material delegation saving: ${top.recommendationN}. Rights refusals printed: ${top.rightsRefused}.`);
  for (const [cur, v] of Object.entries(top.savingByCurrency || {})) {
    lines.push(`Material saving available in ${cur}: ${v} (stock, over the remaining holding period — not per week).`);
  }
  lines.push(top.share.refused
    ? `Contested share: refused — ${top.share.reason}`
    : `Contested share of this span’s eligible settled calls: ${top.share.sharePct}% (interval ${top.share.interval.lo}–${top.share.interval.hi}%, n=${top.share.eligibleN}).`);
  if (top.compositionWarning) lines.push(`Composition: ${top.compositionWarning}`);
  lines.push('Class mix:', ...top.classes.filter((c) => c.open > 0).map((c) => `  ${c.label}: ${c.open} open, ${c.recommendations} with a material saving, floor rank ${c.floorRank}.`));
  lines.push('No person is named in this brief. It is a statement about work, not about people.');
  return { text: lines.join('\n'), lines };
}

/* ------------------------------------------------------------------ */
/* 10. CSV rows — aggregate only, BLANK for a refusal                  */
/* ------------------------------------------------------------------ */

export function fitCsvRows(state, { now = new Date(), chain = null, conventions = fitConventions() } = {}) {
  const at = now instanceof Date ? now : new Date(now);
  const built = chain || buildChain(state, { now: at, settings: state?.settings });
  const rows = [];
  for (const cls of AUTHORITY_CLASSES) {
    const roll = fitRollUp(state, { now: at, chain: built, conventions, nodeId: LEADER_ID });
    const c = roll.classes.find((x) => x.classKey === cls.key);
    rows.push({
      scope: 'class', altitude: cls.key, class_key: cls.key, floor_rank: cls.floorRank,
      open: c?.open ?? 0, priced: c?.priced ?? 0, recommendations: c?.recommendations ?? 0,
      held_past_horizon: '', saving_currency: '', saving_weekly: '',
      share_pct: '', share_lo_pct: '', share_hi_pct: '', eligible_n: '',
      verdict: 'aggregate — counts only',
    });
  }
  const roll = fitRollUp(state, { now: at, chain: built, conventions, nodeId: LEADER_ID });
  for (const [cur, value] of Object.entries(roll.savingByCurrency || {})) {
    rows.push({
      scope: 'span', altitude: roll.altitudeKey, class_key: '', floor_rank: '',
      open: roll.open, priced: roll.priced, recommendations: roll.recommendationN,
      held_past_horizon: roll.heldPastHorizon, saving_currency: cur, saving_weekly: value,
      share_pct: roll.share.sharePct === null ? '' : roll.share.sharePct,
      share_lo_pct: roll.share.interval.lo === null ? '' : roll.share.interval.lo,
      share_hi_pct: roll.share.interval.hi === null ? '' : roll.share.interval.hi,
      eligible_n: roll.share.eligibleN,
      verdict: roll.share.refused ? 'contested share refused' : 'contested share holding',
    });
  }
  return rows;
}
