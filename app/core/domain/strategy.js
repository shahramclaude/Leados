/**
 * app/core/domain/strategy.js — the Strategy Coherence Terminal (Schema v42).
 *
 * The gap this module fills
 * -------------------------
 * Every other LeadOS terminal measures an *activity*: cases, decisions,
 * delegations, capacity, load, capital. None of them can answer the question
 * that a chief executive actually asks about a management team: **is the
 * strategy we said we were pursuing the same one our resources are funding?**
 *
 * Strategy decks are the best-dressed fiction in business. A leader writes five
 * priorities, then their calendar, their hiring, their WIP and their budget
 * allocate themselves to whatever arrived most loudly. No incumbent tool
 * measures that divergence, because measuring it requires (a) a declared set of
 * bets with explicit shares, (b) the actual resource flows across every other
 * module, and (c) the willingness to print the gap.
 *
 * LeadOS already has (b). This module adds (a) and (c) and computes the
 * **say–do gap** from the records the leader already keeps.
 *
 * Named frameworks, implemented rather than gestured at
 * ----------------------------------------------------
 *  1. Rumelt's strategy kernel (*Good Strategy/Bad Strategy*, 2011):
 *     diagnosis → guiding policy → coherent action. A bet that has no
 *     diagnosis is a goal; a bet with no coherent action is an aspiration. The
 *     kernel is a required structure here, not a template in a slide deck.
 *  2. The negative-space test (Porter, *What Is Strategy?*, HBR 1996). A
 *     strategy without explicit refusals is not a strategy; "we will not do X"
 *     is the only statement that constrains future allocation. A bet with no
 *     declared refusal is graded down, and the terminal says why.
 *  3. Falsifiability (Popper, 1934; Rumelt's "kernel" and the decision-quality
 *     literature's stop rules). Every active bet must carry a dated kill
 *     criterion. A strategy that cannot be wrong cannot be managed — it can
 *     only be narrated.
 *  4. Marginal resource shares and their divergence. Declared weights and
 *     measured resource shares are two distributions over the same support, so
 *     their divergence is the **total variation distance** — half the L1
 *     distance, in percentage points, with the exact bounds 0 (perfectly
 *     aligned) and 100 (every resource is spent on something other than what
 *     was declared). No invented "alignment score".
 *  5. Herfindahl–Hirschman concentration (Hirschman, 1945; DOJ/FTC Horizontal
 *     Merger Guidelines) over the *measured* shares. A portfolio spread across
 *     eight bets has no centre of gravity; the index is reported with the
 *     thresholds labelled as conventions, not laws.
 *  6. Vintage discipline (the same rule LeadOS applies to forecasts): work that
 *     predates the first adopted bet cannot be tagged retrospectively into
 *     strategy and then scored as if it had been funded deliberately. It is
 *     excluded from the denominator and reported as a separate count, so the
 *     gap can never be improved by relabelling history.
 *
 * Honesty boundaries enforced in code
 * -----------------------------------
 *  - Missing money, missing effort and missing dates stay missing. A tag with
 *    no effort estimate contributes to the *count* basis and to a coverage
 *    figure, never to a silent effort total.
 *  - A bet marked `active` without an adoption date is demoted to `draft` on
 *    load: the adoption date is the vintage that separates strategy-era work
 *    from earlier work, and inventing it would let the gap be manufactured.
 *  - Below five post-strategy open work items the report is counts-only and
 *    says so; it never presents a percentage as if it were measured.
 *  - Nothing here rates a person. The unit of allocation is a bet, and the only
 *    person reference is an accountable owner.
 *  - Pure module: no DOM, no storage, no network, no ambient clock.
 */

import { addDays, dayKey, daysBetween, daysSince, round } from '../time.js';
import { OPEN_CASE_STATUSES } from './cases.js';

export const SCO_ENGINE_VERSION = 'strategy-coherence-2026.10-v1';

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

export const STRATEGY_KINDS = Object.freeze([
  {
    key: 'where-to-play',
    label: 'Where to play',
    help: 'The segment, problem or customer the team chooses to serve — and by implication, the ones it does not.',
  },
  {
    key: 'how-to-win',
    label: 'How to win',
    help: 'The advantage that makes the choice pay: cheaper, better, faster, or the only credible option.',
  },
  {
    key: 'capability',
    label: 'Capability to build',
    help: 'Something the team must become good at for the how-to-win to be true.',
  },
  {
    key: 'enabler',
    label: 'System enabler',
    help: 'A management-system change (process, structure, tooling) the other bets depend on.',
  },
]);

export const STRATEGY_KIND_KEYS = STRATEGY_KINDS.map((k) => k.key);

export const ADVANTAGE_TYPES = Object.freeze([
  { key: 'differentiation', label: 'Differentiation', help: 'Winning by being materially better at something the customer values.' },
  { key: 'cost', label: 'Cost', help: 'Winning by delivering the same value at a structurally lower cost.' },
  { key: 'focus', label: 'Focus', help: 'Winning by serving a narrow segment better than a generalist can.' },
  { key: 'speed', label: 'Speed', help: 'Winning by being reliably first, or by responding faster than alternatives.' },
  { key: 'unclear', label: 'Not yet stated', help: 'No advantage has been named. The bet is still an intention.' },
]);

export const ADVANTAGE_TYPE_KEYS = ADVANTAGE_TYPES.map((a) => a.key);

export const BET_STATUSES = Object.freeze(['draft', 'active', 'retired']);

export const BET_STATUS_LABELS = Object.freeze({
  draft: 'Draft',
  active: 'Active',
  retired: 'Retired',
});

export const BET_VERDICTS = Object.freeze([
  { key: 'continue', label: 'Continue', help: 'The evidence still supports the bet; keep funding it.' },
  { key: 'reconsider', label: 'Reconsider', help: 'The bet may still be right, but the stop rule or the share is wrong.' },
  { key: 'retire', label: 'Retire', help: 'The bet did not hold. Retire it deliberately instead of letting it fade.' },
]);

export const BET_VERDICT_KEYS = BET_VERDICTS.map((v) => v.key);

/**
 * Every collection a strategy tag may point at. Each entry says how to answer
 * two questions from the record itself: is it still open, and when did it
 * start? Both matter — closed work is history, not current allocation, and a
 * record with no start date has no trustworthy vintage.
 */
export const WORK_SOURCES = Object.freeze([
  {
    entityType: 'case',
    collection: 'cases',
    label: 'Operational case',
    isOpen: (row) => OPEN_CASE_STATUSES.includes(row.status),
    title: (row) => row.title || 'Untitled case',
    createdOn: (row) => row.createdOn || (typeof row.createdAt === 'string' ? row.createdAt.slice(0, 10) : null),
  },
  {
    entityType: 'goal',
    collection: 'goals',
    label: 'Goal',
    isOpen: (row) => row.status === 'active',
    title: (row) => row.title || 'Untitled goal',
    createdOn: (row) => row.createdOn || (typeof row.createdAt === 'string' ? row.createdAt.slice(0, 10) : null),
  },
  {
    entityType: 'delegation',
    collection: 'delegations',
    label: 'Delegation',
    isOpen: (row) => row.status === 'active',
    title: (row) => row.title || 'Untitled delegation',
    createdOn: (row) => row.delegatedOn || (typeof row.createdAt === 'string' ? row.createdAt.slice(0, 10) : null),
  },
  {
    entityType: 'portfolio',
    collection: 'portfolio',
    label: 'Plan item',
    isOpen: (row) => row.status === 'open',
    title: (row) => row.title || 'Untitled plan item',
    createdOn: (row) => row.createdOn || (typeof row.createdAt === 'string' ? row.createdAt.slice(0, 10) : null),
  },
  {
    entityType: 'decision',
    collection: 'decisions',
    label: 'Open decision',
    isOpen: (row) => !row.chosen,
    title: (row) => row.title || 'Untitled decision',
    createdOn: (row) => row.date || (typeof row.createdAt === 'string' ? row.createdAt.slice(0, 10) : null),
  },
  {
    entityType: 'change',
    collection: 'changes',
    label: 'Org change',
    isOpen: (row) => ['proposed', 'active', 'stabilising', 'paused'].includes(row.status),
    title: (row) => row.title || 'Untitled change',
    createdOn: (row) => row.createdOn || (typeof row.createdAt === 'string' ? row.createdAt.slice(0, 10) : null),
  },
]);

export const WORK_SOURCE_TYPES = WORK_SOURCES.map((s) => s.entityType);

function workSource(entityType) {
  return WORK_SOURCES.find((s) => s.entityType === entityType) || null;
}

/* ------------------------------------------------------------------ */
/* Conventions (stated, editable, never presented as laws)             */
/* ------------------------------------------------------------------ */

/** Below this many post-strategy open work items, shares are counts-only. */
export const SCO_MIN_OPEN_WORK = 5;

/** Effort-weighted shares require at least this share of open tags to carry an effort estimate. */
export const SCO_EFFORT_COVERAGE_FLOOR = 50;

/** Window for the recent-flow view, in days. */
export const SCO_DRIFT_WINDOW_DAYS = 28;

/** Composite weights. Shown in the UI; renormalised when a component is unmeasurable. */
export const SCO_COMPONENT_WEIGHTS = Object.freeze({
  alignment: 0.45,
  falsifiability: 0.35,
  coverage: 0.2,
});

export const SCO_BANDS = Object.freeze([
  { key: 'coherent', label: 'Coherent', min: 75, tone: 'good', help: 'Declared shares, funded work and stop rules broadly agree. Keep it that way by reviewing on the cadence, not by celebrating.' },
  { key: 'drifting', label: 'Drifting', min: 55, tone: 'warn', help: 'The stated strategy and the funded work have diverged in at least one material way. Drift is normal; leaving it unnamed is not.' },
  { key: 'split', label: 'Split', min: 0, tone: 'bad', help: 'The resources are funding a different strategy from the one written down. Either the writing or the funding is wrong, and only a human can say which.' },
]);

export function bandForCoherence(pct) {
  if (pct === null || pct === undefined || !Number.isFinite(Number(pct))) return SCO_BANDS[SCO_BANDS.length - 1];
  const value = Number(pct);
  return SCO_BANDS.find((band) => value >= band.min) || SCO_BANDS[SCO_BANDS.length - 1];
}

/** HHI bands are conventions carried over from the resilience terminal's wording. */
export const SCO_HHI_BANDS = Object.freeze([
  { key: 'diffuse', label: 'Diffuse', max: 0.15, help: 'No bet carries enough of the work to be a centre of gravity. That is often a portfolio of unrelated projects wearing one strategy label.' },
  { key: 'balanced', label: 'Balanced', max: 0.25, help: 'A few bets carry the majority of the work, and none dominates. This is the usual shape of an executable strategy.' },
  { key: 'concentrated', label: 'Concentrated', max: 1, help: 'One bet dominates the measured allocation. Deliberate focus and unacknowledged lock-in look identical from the data; the stop rule is what distinguishes them.' },
]);

export function bandForHhi(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return SCO_HHI_BANDS[0];
  const n = Number(value);
  return SCO_HHI_BANDS.find((band) => n < band.max) || SCO_HHI_BANDS[SCO_HHI_BANDS.length - 1];
}

export const SCO_GRADES = Object.freeze({
  falsifiable: { key: 'falsifiable', label: 'Falsifiable', tone: 'good', min: 1 },
  partial: { key: 'partial', label: 'Partially falsifiable', tone: 'warn', min: 4 / 6 },
  unfalsifiable: { key: 'unfalsifiable', label: 'Unfalsifiable', tone: 'bad', min: 0 },
});

/** The six checks a bet must pass to count as a falsifiable strategic choice. */
export const SCO_CHECKS = Object.freeze([
  { key: 'owner', label: 'An accountable owner', detail: 'A named person answers for the bet. Ownership is not consensus.' },
  { key: 'diagnosis', label: 'A diagnosis', detail: 'The situation is described in at least 20 characters — the obstacle, not the aspiration.' },
  { key: 'guidingPolicy', label: 'A guiding policy', detail: 'The approach that deals with the diagnosis, in the leader’s own words.' },
  { key: 'refusal', label: 'An explicit refusal', detail: 'At least one thing this bet means the team will not do.' },
  { key: 'stopRule', label: 'A dated stop rule', detail: 'A named metric, a direction and a date on which a human must judge it.' },
  { key: 'committedAction', label: 'Committed work', detail: 'At least one open record is tagged to this bet, so it is funded rather than merely stated.' },
]);

/* ------------------------------------------------------------------ */
/* Rule descriptors and ids                                            */
/* ------------------------------------------------------------------ */

export const SCO_RULE_IDS = Object.freeze({
  ADOPT: 'RULE-SCO-01',
  GAP: 'RULE-SCO-02',
  STOP: 'RULE-SCO-03',
  VERDICT: 'RULE-SCO-04',
});

export const SCO_RULES = Object.freeze([
  {
    id: SCO_RULE_IDS.ADOPT,
    name: 'Adopted bet → one DACI commitment, one tagging delegation, one blameless talking point',
    framework: 'Rumelt strategy kernel & accountable ownership',
    trigger: 'strategy.bet.adopted',
    targetModule: 'decisions / delegations / people / tempo',
    description: 'Adopting a bet is an explicit commitment, so it fans out in the same atomic transaction: a DACI commitment decision (which Decision Tempo prices in that same transaction once a value at stake is recorded), an owned delegation to link the work already in flight, and a blameless 1:1 talking point. Nothing is sent and nothing is decided for the leader.',
  },
  {
    id: SCO_RULE_IDS.GAP,
    name: 'Say–do gap over convention → one DACI rebalancing decision',
    framework: 'Total variation distance between declared and measured resource shares',
    trigger: 'any strategy event or an explicit audit',
    targetModule: 'decisions / links',
    description: 'When the divergence between declared share and measured resource share exceeds the workspace convention, one decision is opened with the over-funded and under-funded bets named and three explicit options. The marker includes the bet set, so a new divergence can open a new decision but the same one never re-opens.',
  },
  {
    id: SCO_RULE_IDS.STOP,
    name: 'Active bet with no dated stop rule → one owned delegation',
    framework: 'Falsifiability and stop rules (Popper; decision-quality literature)',
    trigger: 'any strategy event or an explicit audit',
    targetModule: 'delegations / links',
    description: 'A strategy that cannot be wrong cannot be managed. One bounded, blameless delegation per bet asks the owner to write the metric, the direction and the date — not to predict the outcome.',
  },
  {
    id: SCO_RULE_IDS.VERDICT,
    name: 'Stop-rule date passed with no verdict → one retire-or-renew decision',
    framework: 'Pre-registered stopping, the same discipline the Impact Ledger applies to studies',
    trigger: 'any strategy event or an explicit audit',
    targetModule: 'decisions / people / links',
    description: 'When a bet’s stop-rule date has passed without a recorded human verdict, exactly one DACI decision is opened (continue, revise the stop rule, or retire), plus a blameless talking point for the owner. The app never retires a bet by itself.',
  },
]);

/* ------------------------------------------------------------------ */
/* Small pure helpers                                                  */
/* ------------------------------------------------------------------ */

function isObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function text(v, max = 400) {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function dateOnly(v) {
  if (typeof v !== 'string') return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

function isoOrNull(v) {
  if (typeof v !== 'string' || !v) return null;
  const parsed = new Date(v);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function finiteOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function clampText(value, max) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function ownerIdOf(state, raw) {
  const id = typeof raw === 'string' ? raw : '';
  if (!id) return null;
  const person = (state.people || []).find((p) => p && p.id === id && p.status !== 'archived');
  return person ? id : null;
}

/**
 * Normalise a list of non-negative weights into shares summing to 1.
 * Returns null when there is nothing to normalise, and an equal-share
 * convention when every weight is zero — never a division by zero and never a
 * silent 100% for whichever bet happened to be first.
 */
export function normalizeShares(entries) {
  const rows = (entries || []).filter((row) => row && Number.isFinite(Number(row.weight)) && Number(row.weight) > 0);
  if (!rows.length) return null;
  const total = rows.reduce((sum, row) => sum + Number(row.weight), 0);
  if (!(total > 0)) return null;
  return rows.map((row) => ({ key: row.key, share: Number(row.weight) / total }));
}

/** Total variation distance in percentage points between two share vectors. */
export function totalVariationPct(a, b) {
  const left = new Map();
  const right = new Map();
  for (const row of a || []) if (row && row.key) left.set(row.key, Number(row.share) || 0);
  for (const row of b || []) if (row && row.key) right.set(row.key, Number(row.share) || 0);
  const keys = new Set([...left.keys(), ...right.keys()]);
  if (!keys.size) return null;
  let sum = 0;
  for (const key of keys) sum += Math.abs((left.get(key) || 0) - (right.get(key) || 0));
  return round((sum / 2) * 100, 1);
}

/** Herfindahl–Hirschman index over a share vector (0–1). */
export function herfindahl(shares) {
  const rows = (shares || []).filter((row) => row && Number.isFinite(Number(row.share)));
  if (!rows.length) return null;
  return round(rows.reduce((sum, row) => sum + Number(row.share) ** 2, 0), 4);
}

/* ------------------------------------------------------------------ */
/* Normalisers (called from schema.js on load and on import)           */
/* ------------------------------------------------------------------ */

export function normalizeStrategyBetPayload(data = {}, { state = {}, now = new Date(), existing = null } = {}) {
  const source = isObject(data) ? data : {};
  const nowDate = now instanceof Date ? now : new Date(now);
  const nowIso = Number.isFinite(nowDate.getTime()) ? nowDate.toISOString() : new Date().toISOString();
  const title = text(source.title ?? existing?.title, 160);
  if (title.length < 3) return { ok: false, error: 'Give the bet a title of at least 3 characters.', field: 'title' };
  const kind = STRATEGY_KIND_KEYS.includes(source.kind) ? source.kind : (existing?.kind || 'where-to-play');
  const advantage = ADVANTAGE_TYPE_KEYS.includes(source.advantage) ? source.advantage : (existing?.advantage || 'unclear');
  const diagnosis = text(source.diagnosis ?? existing?.diagnosis, 1200);
  const guidingPolicy = text(source.guidingPolicy ?? existing?.guidingPolicy, 1200);
  if (source.diagnosis !== undefined && diagnosis.length > 0 && diagnosis.length < 12) {
    return { ok: false, error: 'Describe the diagnosis in at least 12 characters — the obstacle, not the aspiration.', field: 'diagnosis' };
  }
  if (source.guidingPolicy !== undefined && guidingPolicy.length > 0 && guidingPolicy.length < 12) {
    return { ok: false, error: 'Describe the guiding policy in at least 12 characters.', field: 'guidingPolicy' };
  }
  const weightPct = clampInt(source.weightPct ?? existing?.weightPct ?? 0, 0, 100, 0);
  const horizonWeeks = clampInt(source.horizonWeeks ?? existing?.horizonWeeks ?? 26, 4, 104, 26);
  const ownerId = source.ownerId === undefined ? (existing?.ownerId || null) : ownerIdOf(state, source.ownerId);
  if (source.ownerId && !ownerId) return { ok: false, error: 'Choose an owner from the active roster, or leave it unassigned.', field: 'ownerId' };
  const notDoing = (Array.isArray(source.notDoing) ? source.notDoing : (existing?.notDoing || []))
    .map((entry) => text(entry, 200))
    .filter((entry) => entry.length >= 3)
    .slice(0, 8);
  const rawKill = source.killCriterion === undefined ? existing?.killCriterion : source.killCriterion;
  const killCriterion = normalizeKillCriterion(rawKill);
  return {
    ok: true,
    value: {
      title,
      kind,
      advantage,
      diagnosis,
      guidingPolicy,
      weightPct,
      horizonWeeks,
      ownerId,
      notDoing,
      killCriterion,
      updatedAt: nowIso,
    },
  };
}

export function normalizeKillCriterion(raw) {
  if (!isObject(raw)) return null;
  const metric = text(raw.metric, 160);
  const checkOn = dateOnly(raw.checkOn);
  if (!metric && !checkOn) return null;
  const threshold = finiteOrNull(raw.threshold);
  const direction = raw.direction === 'above' ? 'above' : 'below';
  return {
    metric,
    threshold: threshold === null ? null : Math.round(threshold * 100) / 100,
    direction,
    checkOn,
    note: text(raw.note, 400),
  };
}

export function normalizeStrategyTagPayload(data = {}, { state = {}, now = new Date() } = {}) {
  const source = isObject(data) ? data : {};
  const betId = typeof source.betId === 'string' ? source.betId : '';
  const bet = (state.strategyBets || []).find((row) => row && row.id === betId);
  if (!bet) return { ok: false, error: 'Choose a bet to fund.', field: 'betId' };
  if (bet.status === 'retired') return { ok: false, error: 'A retired bet cannot take new work; reactivate it first.', field: 'betId' };
  const entityType = WORK_SOURCE_TYPES.includes(source.entityType) ? source.entityType : '';
  const sourceSpec = workSource(entityType);
  if (!sourceSpec) return { ok: false, error: 'Choose what kind of record to tag.', field: 'entityType' };
  const entityId = typeof source.entityId === 'string' ? source.entityId : '';
  const record = (state[sourceSpec.collection] || []).find((row) => row && row.id === entityId);
  if (!record) return { ok: false, error: 'That record no longer exists.', field: 'entityId' };
  if (!sourceSpec.isOpen(record)) return { ok: false, error: `${sourceSpec.label} “${sourceSpec.title(record)}” is already closed, so it cannot be funded going forward.`, field: 'entityId' };
  const effortRaw = source.effortWeeks;
  const effortWeeks = effortRaw === null || effortRaw === undefined || effortRaw === ''
    ? null
    : Math.round(Math.min(104, Math.max(0, Number(effortRaw))) * 100) / 100;
  if (effortRaw !== null && effortRaw !== undefined && effortRaw !== '' && !Number.isFinite(effortWeeks)) {
    return { ok: false, error: 'Effort must be a number of weeks, or left blank if unknown.', field: 'effortWeeks' };
  }
  const nowDate = now instanceof Date ? now : new Date(now);
  const nowIso = Number.isFinite(nowDate.getTime()) ? nowDate.toISOString() : new Date().toISOString();
  return {
    ok: true,
    value: {
      betId,
      entityType,
      entityId,
      effortWeeks,
      note: text(source.note, 300),
      createdAt: nowIso,
      createdOn: dayKey(nowDate),
    },
  };
}

export function normalizeStrategyBets(raw, state, now, warnings = []) {
  const rows = Array.isArray(raw) ? raw : [];
  const nowDate = now instanceof Date ? now : new Date(now);
  const nowIso = Number.isFinite(nowDate.getTime()) ? nowDate.toISOString() : new Date().toISOString();
  const seen = new Set();
  const out = [];
  let repairedActive = 0;
  let clearedOwners = 0;
  for (const item of rows) {
    if (!isObject(item)) continue;
    const title = text(item.title, 160);
    if (title.length < 3) continue;
    let id = typeof item.id === 'string' && item.id ? item.id.slice(0, 80) : `bet-${out.length + 1}`;
    while (seen.has(id)) id = `${id}-${out.length + 1}`;
    seen.add(id);
    const ownerId = ownerIdOf(state, item.ownerId);
    if (item.ownerId && !ownerId) clearedOwners += 1;
    const createdAt = isoOrNull(item.createdAt) || nowIso;
    const adoptedOn = dateOnly(item.adoptedOn);
    let status = BET_STATUSES.includes(item.status) ? item.status : 'draft';
    // Doctrine: the adoption date is the vintage. A bet claimed active without
    // one cannot date the strategy era, so it is reopened as a draft rather
    // than letting the terminal invent a start date and score work against it.
    if (status === 'active' && !adoptedOn) {
      status = 'draft';
      repairedActive += 1;
    }
    if (status !== 'active' && status !== 'retired') status = status === 'retired' ? 'retired' : 'draft';
    if (status !== 'retired') {
      // A draft has no adoption; a retired bet keeps the date it was adopted.
    }
    const verdictRaw = isObject(item.verdict) ? item.verdict : null;
    const verdict = verdictRaw && BET_VERDICT_KEYS.includes(verdictRaw.verdict) && dateOnly(verdictRaw.recordedOn)
      ? {
          verdict: verdictRaw.verdict,
          recordedOn: dateOnly(verdictRaw.recordedOn),
          note: text(verdictRaw.note, 600),
          at: isoOrNull(verdictRaw.at) || nowIso,
        }
      : null;
    out.push({
      id,
      title,
      kind: STRATEGY_KIND_KEYS.includes(item.kind) ? item.kind : 'where-to-play',
      advantage: ADVANTAGE_TYPE_KEYS.includes(item.advantage) ? item.advantage : 'unclear',
      diagnosis: text(item.diagnosis, 1200),
      guidingPolicy: text(item.guidingPolicy, 1200),
      weightPct: clampInt(item.weightPct, 0, 100, 0),
      horizonWeeks: clampInt(item.horizonWeeks, 4, 104, 26),
      ownerId,
      notDoing: (Array.isArray(item.notDoing) ? item.notDoing : [])
        .map((entry) => text(entry, 200))
        .filter((entry) => entry.length >= 3)
        .slice(0, 8),
      killCriterion: normalizeKillCriterion(item.killCriterion),
      status,
      adoptedOn: status === 'retired' ? adoptedOn : (status === 'active' ? adoptedOn : null),
      retiredOn: status === 'retired' ? (dateOnly(item.retiredOn) || adoptedOn || createdAt.slice(0, 10)) : null,
      retiredReason: status === 'retired' ? text(item.retiredReason, 400) : '',
      verdict,
      notes: text(item.notes, 1200),
      createdOn: dateOnly(item.createdOn) || createdAt.slice(0, 10),
      createdAt,
      updatedAt: isoOrNull(item.updatedAt) || createdAt,
      history: (Array.isArray(item.history) ? item.history : [])
        .filter((entry) => isObject(entry))
        .map((entry) => ({
          at: isoOrNull(entry.at) || createdAt,
          type: text(entry.type, 40) || 'updated',
          summary: text(entry.summary, 300),
        }))
        .slice(-60),
    });
  }
  if (repairedActive) {
    warnings.push(`Strategy: ${repairedActive} bet(s) were marked active without an adoption date and were reopened as drafts — an invented adoption date would manufacture the gap.`);
  }
  if (clearedOwners) {
    warnings.push(`Strategy: ${clearedOwners} bet owner(s) pointed at a person no longer on the active roster and were cleared.`);
  }
  return out;
}

export function normalizeStrategyTags(raw, state, now, warnings = []) {
  const rows = Array.isArray(raw) ? raw : [];
  const nowDate = now instanceof Date ? now : new Date(now);
  const nowIso = Number.isFinite(nowDate.getTime()) ? nowDate.toISOString() : new Date().toISOString();
  const bets = new Map((state.strategyBets || []).map((row) => [row.id, row]));
  const seen = new Set();
  const out = [];
  let orphanBet = 0;
  let orphanRecord = 0;
  let duplicates = 0;
  for (const item of rows) {
    if (!isObject(item)) continue;
    const betId = typeof item.betId === 'string' ? item.betId : '';
    if (!bets.has(betId)) { orphanBet += 1; continue; }
    const entityType = WORK_SOURCE_TYPES.includes(item.entityType) ? item.entityType : '';
    const spec = workSource(entityType);
    if (!spec) continue;
    const entityId = typeof item.entityId === 'string' ? item.entityId : '';
    const record = (state[spec.collection] || []).find((row) => row && row.id === entityId);
    if (!record) { orphanRecord += 1; continue; }
    const key = `${betId}|${entityType}|${entityId}`;
    if (seen.has(key)) { duplicates += 1; continue; }
    seen.add(key);
    const effort = finiteOrNull(item.effortWeeks);
    out.push({
      id: typeof item.id === 'string' && item.id ? item.id.slice(0, 80) : `tag-${out.length + 1}`,
      betId,
      entityType,
      entityId,
      effortWeeks: effort === null ? null : Math.round(Math.min(104, Math.max(0, effort)) * 100) / 100,
      note: text(item.note, 300),
      createdOn: dateOnly(item.createdOn) || (isoOrNull(item.createdAt) || nowIso).slice(0, 10),
      createdAt: isoOrNull(item.createdAt) || nowIso,
    });
  }
  if (orphanBet) warnings.push(`Strategy: ${orphanBet} tag(s) pointed at a bet that no longer exists and were dropped.`);
  if (orphanRecord) warnings.push(`Strategy: ${orphanRecord} tag(s) pointed at a record that no longer exists and were dropped.`);
  if (duplicates) warnings.push(`Strategy: ${duplicates} duplicate tag(s) were collapsed.`);
  return out;
}

/* ------------------------------------------------------------------ */
/* Report                                                             */
/* ------------------------------------------------------------------ */

/**
 * Records the terminal itself opened — commitment decisions, tagging and
 * stop-rule delegations, retire-or-renew decisions — are governance scaffolding,
 * not funded work. Counting them in the denominator would make the gap
 * self-referential: opening one rebalancing decision would *worsen* the gap it
 * was opened to close. Their markers are stable and printed in the record, so
 * the exclusion is visible rather than magic.
 */
export function isStrategyScaffold(record) {
  if (!record) return false;
  const haystack = `${record.title || ''} ${record.question || ''} ${record.expectedOutcome || ''} ${record.support || ''}`;
  return haystack.includes('[RULE-SCO-');
}

function collectOpenWork(state) {
  const rows = [];
  for (const spec of WORK_SOURCES) {
    for (const record of state[spec.collection] || []) {
      if (!record || !record.id) continue;
      if (!spec.isOpen(record)) continue;
      if (isStrategyScaffold(record)) continue;
      rows.push({
        entityType: spec.entityType,
        entityId: record.id,
        kindLabel: spec.label,
        title: spec.title(record),
        createdOn: spec.createdOn(record) || null,
        key: `${spec.entityType}:${record.id}`,
      });
    }
  }
  return rows;
}

function gradeFor(bet, { openTags, ownerExists }) {
  const checks = [
    { key: 'owner', passed: Boolean(bet.ownerId && ownerExists), detail: bet.ownerId ? 'Owner is on the active roster' : 'No owner recorded' },
    { key: 'diagnosis', passed: text(bet.diagnosis, 1200).length >= 20, detail: `${text(bet.diagnosis, 1200).length} / 20 characters` },
    { key: 'guidingPolicy', passed: text(bet.guidingPolicy, 1200).length >= 20, detail: `${text(bet.guidingPolicy, 1200).length} / 20 characters` },
    { key: 'refusal', passed: (bet.notDoing || []).length > 0, detail: (bet.notDoing || []).length ? `${bet.notDoing.length} refusal(s) declared` : 'No refusal declared' },
    { key: 'stopRule', passed: Boolean(bet.killCriterion?.metric && bet.killCriterion?.checkOn), detail: bet.killCriterion?.checkOn ? `Check on ${bet.killCriterion.checkOn}` : 'No dated stop rule' },
    { key: 'committedAction', passed: openTags > 0, detail: openTags ? `${openTags} open record(s) tagged` : 'Nothing tagged to this bet' },
  ];
  const meta = SCO_CHECKS.map((def) => ({ ...def, ...(checks.find((c) => c.key === def.key) || { passed: false, detail: '' }) }));
  const passed = checks.filter((c) => c.passed).length;
  const score = passed / checks.length;
  const key = score >= 1 ? 'falsifiable' : score >= 4 / 6 ? 'partial' : 'unfalsifiable';
  return {
    key,
    ...SCO_GRADES[key],
    score: round(score, 3),
    passed,
    total: checks.length,
    checks: meta,
    missing: meta.filter((c) => !c.passed).map((c) => c.key),
  };
}

/**
 * Grade one bet against the six checks, drafts included.
 *
 * `buildStrategyReport` grades *active* bets, because the portfolio view only
 * compares bets that are being funded. The adoption dialog needs the opposite
 * case: the bet in front of the leader is a draft by definition, so grading it
 * from `report.bets` rendered every check as missing at the exact moment the
 * leader was deciding whether the bet was worth adopting. A draft is graded on
 * its own payload here — same six checks, same thresholds, no second rubric.
 */
export function strategyBetGrade(bet, state = {}) {
  if (!bet || typeof bet !== 'object') return null;
  const openWork = new Set(collectOpenWork(state).map((row) => row.key));
  const openTags = (Array.isArray(state.strategyTags) ? state.strategyTags : [])
    .filter((tag) => tag && tag.betId === bet.id && openWork.has(`${tag.entityType}:${tag.entityId}`))
    .length;
  const people = new Set((state.people || []).filter((p) => p && p.status !== 'archived').map((p) => p.id));
  return gradeFor(bet, {
    openTags,
    ownerExists: Boolean(bet.ownerId && people.has(bet.ownerId)),
  });
}

/**
 * The whole terminal as one pure value.
 *
 * The report never mutates state, never reads the clock except through `now`,
 * and never converts missing data into a number.
 */
export function buildStrategyReport(state = {}, now = new Date(), settingsOverride = null) {
  const nowDate = now instanceof Date ? now : new Date(now);
  const today = dayKey(nowDate);
  const settings = settingsOverride || state.settings || {};
  const gapThresholdPct = clampInt(settings.strategyGapThresholdPct, 5, 60, 20);
  const blindThresholdPct = clampInt(settings.strategyBlindWipThresholdPct, 10, 100, 40);
  const driftWindowDays = clampInt(settings.strategyDriftWindowDays, 7, 90, SCO_DRIFT_WINDOW_DAYS);

  const betsAll = Array.isArray(state.strategyBets) ? state.strategyBets : [];
  const active = betsAll.filter((bet) => bet.status === 'active');
  const activeById = new Map(active.map((bet) => [bet.id, bet]));
  const people = new Set((state.people || []).filter((p) => p && p.status !== 'archived').map((p) => p.id));
  const openWork = collectOpenWork(state);
  const openWorkByKey = new Map(openWork.map((row) => [row.key, row]));
  const tags = Array.isArray(state.strategyTags) ? state.strategyTags : [];

  // Resolve tags against *open* work. Closed work is history; counting it would
  // let an old project keep claiming a share of a bet forever.
  let closedTagged = 0;
  const openTags = [];
  for (const tag of tags) {
    const key = `${tag.entityType}:${tag.entityId}`;
    const item = openWorkByKey.get(key);
    if (!item) { closedTagged += 1; continue; }
    openTags.push({ ...tag, item });
  }

  // ---- the vintage boundary -------------------------------------------
  // Strategy-era work starts at the earliest adopted bet. Anything older is
  // pre-strategy: it may be tagged, but it is excluded from the denominator
  // because it was funded before the choice existed.
  const adopted = betsAll.filter((bet) => bet.adoptedOn).map((bet) => bet.adoptedOn).sort();
  const vintageStart = adopted[0] || null;
  let preStrategy = 0;
  let unknownVintage = 0;
  const postStrategyWork = [];
  for (const item of openWork) {
    if (!vintageStart) { unknownVintage += 0; postStrategyWork.push(item); continue; }
    if (!item.createdOn) { unknownVintage += 1; continue; }
    if (item.createdOn < vintageStart) { preStrategy += 1; continue; }
    postStrategyWork.push(item);
  }
  const postStrategyKeys = new Set(postStrategyWork.map((row) => row.key));

  // A tag counts as *funding* only if it names an active bet and open work
  // inside the strategy era.
  const fundingTags = openTags.filter((tag) => activeById.has(tag.betId) && (!vintageStart || postStrategyKeys.has(tag.item.key)));

  // ---- basis selection -------------------------------------------------
  const knownEffort = fundingTags.filter((tag) => Number.isFinite(tag.effortWeeks) && tag.effortWeeks > 0);
  const effortCoveragePct = fundingTags.length ? round((knownEffort.length / fundingTags.length) * 100, 1) : null;
  const knownEffortTotal = knownEffort.reduce((sum, tag) => sum + tag.effortWeeks, 0);
  const basis = knownEffort.length > 0 && effortCoveragePct >= SCO_EFFORT_COVERAGE_FLOOR ? 'effort' : 'count';
  const unitOf = (tag) => (basis === 'effort' && Number.isFinite(tag.effortWeeks) && tag.effortWeeks > 0 ? tag.effortWeeks : 1);

  const recentCutoff = addDays(today, -driftWindowDays);
  const isRecent = (tag) => Boolean(tag.createdOn) && tag.createdOn >= recentCutoff;

  // ---- declared vs measured -------------------------------------------
  const declaredWeights = active.map((bet) => ({ key: bet.id, weight: bet.weightPct }));
  const declaredTotal = declaredWeights.reduce((sum, row) => sum + row.weight, 0);
  const declaredBasis = declaredTotal > 0 ? 'declared' : 'equal-convention';
  // Declared shares keep every active bet, including a deliberate 0%, so a bet
  // declared at zero and funded at 15% shows up as a +15pp gap instead of
  // vanishing from the comparison.
  const declaredShares = active.length
    ? active.map((bet) => ({
        key: bet.id,
        share: declaredTotal > 0 ? bet.weightPct / declaredTotal : 1 / active.length,
      }))
    : null;

  const measuredCounts = new Map();
  const measuredEffort = new Map();
  const recentCounts = new Map();
  for (const tag of fundingTags) {
    measuredCounts.set(tag.betId, (measuredCounts.get(tag.betId) || 0) + 1);
    if (Number.isFinite(tag.effortWeeks) && tag.effortWeeks > 0) {
      measuredEffort.set(tag.betId, (measuredEffort.get(tag.betId) || 0) + tag.effortWeeks);
    }
    if (isRecent(tag)) recentCounts.set(tag.betId, (recentCounts.get(tag.betId) || 0) + unitOf(tag));
  }

  const measuredShares = active.length
    ? normalizeShares(active.map((bet) => ({
        key: bet.id,
        weight: basis === 'effort' ? (measuredEffort.get(bet.id) || 0) : (measuredCounts.get(bet.id) || 0),
      })))
    : null;
  const recentShares = active.length
    ? normalizeShares(active.map((bet) => ({ key: bet.id, weight: recentCounts.get(bet.id) || 0 })))
    : null;

  const sayDoGapPct = declaredShares && measuredShares ? totalVariationPct(declaredShares, measuredShares) : null;
  const driftGapPct = measuredShares && recentShares ? totalVariationPct(measuredShares, recentShares) : null;

  const declaredMap = new Map((declaredShares || []).map((row) => [row.key, row.share]));
  const measuredMap = new Map((measuredShares || []).map((row) => [row.key, row.share]));
  const recentMap = new Map((recentShares || []).map((row) => [row.key, row.share]));

  // ---- blind work ------------------------------------------------------
  const taggedOpenKeys = new Set(fundingTags.map((tag) => tag.item.key));
  const taggedAnyBetKeys = new Set(openTags.filter((tag) => activeById.has(tag.betId)).map((tag) => tag.item.key));
  const postStrategyTagged = postStrategyWork.filter((item) => taggedAnyBetKeys.has(item.key)).length;
  const blindCount = postStrategyWork.length - postStrategyTagged;
  const blindPct = postStrategyWork.length ? round((blindCount / postStrategyWork.length) * 100, 1) : null;

  // ---- per-bet rows ----------------------------------------------------
  const betRows = active.map((bet) => {
    const rows = fundingTags.filter((tag) => tag.betId === bet.id);
    const count = rows.length;
    const effort = measuredEffort.get(bet.id) ?? null;
    const declaredSharePct = declaredMap.has(bet.id) ? round(declaredMap.get(bet.id) * 100, 1) : null;
    const measuredSharePct = measuredMap.has(bet.id) ? round(measuredMap.get(bet.id) * 100, 1) : 0;
    const recentSharePct = recentMap.has(bet.id) ? round(recentMap.get(bet.id) * 100, 1) : 0;
    const gapPct = declaredSharePct === null ? null : round(measuredSharePct - declaredSharePct, 1);
    const kill = bet.killCriterion || null;
    const verdictRecordedOn = bet.verdict?.recordedOn || null;
    const verdictDue = Boolean(kill?.checkOn)
      && kill.checkOn <= today
      && (!verdictRecordedOn || verdictRecordedOn < kill.checkOn);
    return {
      ...bet,
      measured: {
        openRecords: count,
        effortWeeks: effort,
        declaredSharePct,
        measuredSharePct,
        recentSharePct,
        gapPct,
        recentGapPct: declaredSharePct === null ? null : round(recentSharePct - declaredSharePct, 1),
        effortCoveragePct: count ? round((rows.filter((tag) => Number.isFinite(tag.effortWeeks) && tag.effortWeeks > 0).length / count) * 100, 1) : null,
      },
      grade: gradeFor(bet, { openTags: count, ownerExists: Boolean(bet.ownerId && people.has(bet.ownerId)) }),
      kill: kill
        ? {
            ...kill,
            due: verdictDue,
            daysUntil: kill.checkOn ? daysBetween(today, kill.checkOn) : null,
            daysOverdue: kill.checkOn && kill.checkOn <= today ? Math.max(0, daysSince(kill.checkOn, nowDate) ?? 0) : 0,
          }
        : null,
      verdictDue,
      lastVerdict: bet.verdict || null,
    };
  });

  const verdictsDue = betRows.filter((row) => row.verdictDue);

  // ---- composite -------------------------------------------------------
  const falsifiabilityPct = betRows.length
    ? round((betRows.reduce((sum, row) => sum + row.grade.score, 0) / betRows.length) * 100, 1)
    : null;
  const components = [];
  if (sayDoGapPct !== null) {
    components.push({
      key: 'alignment',
      label: 'Declared vs funded',
      pct: round(100 - sayDoGapPct, 1),
      weight: SCO_COMPONENT_WEIGHTS.alignment,
      detail: `Total variation distance of ${sayDoGapPct}pp between the declared share and the ${basis === 'effort' ? 'effort-weighted' : 'counted'} measured share.`,
    });
  }
  if (falsifiabilityPct !== null) {
    components.push({
      key: 'falsifiability',
      label: 'Falsifiable bets',
      pct: falsifiabilityPct,
      weight: SCO_COMPONENT_WEIGHTS.falsifiability,
      detail: `${betRows.filter((row) => row.grade.key === 'falsifiable').length} of ${betRows.length} active bet(s) pass all six checks.`,
    });
  }
  if (blindPct !== null) {
    components.push({
      key: 'coverage',
      label: 'Work under a bet',
      pct: round(100 - blindPct, 1),
      weight: SCO_COMPONENT_WEIGHTS.coverage,
      detail: `${postStrategyTagged} of ${postStrategyWork.length} open post-strategy record(s) are tagged to an active bet.`,
    });
  }
  const weightSum = components.reduce((sum, row) => sum + row.weight, 0);
  const coherencePct = weightSum > 0
    ? round(components.reduce((sum, row) => sum + row.pct * (row.weight / weightSum), 0), 1)
    : null;
  const band = bandForCoherence(coherencePct);

  const countsOnly = !active.length
    || postStrategyWork.length < SCO_MIN_OPEN_WORK
    || fundingTags.length < SCO_MIN_OPEN_WORK;
  const confidence = countsOnly
    ? { level: 'counts-only', label: 'Counts-only', reasons: [
        active.length ? null : 'No active bet yet.',
        postStrategyWork.length < SCO_MIN_OPEN_WORK ? `Only ${postStrategyWork.length} open post-strategy record(s); ${SCO_MIN_OPEN_WORK} are needed before a share is treated as measured.` : null,
        fundingTags.length < SCO_MIN_OPEN_WORK ? `Only ${fundingTags.length} funding tag(s) resolve to open strategy-era work.` : null,
      ].filter(Boolean) }
    : basis === 'effort'
      ? { level: 'measured', label: 'Effort-weighted', reasons: [`${effortCoveragePct}% of funding tags carry an effort estimate.`] }
      : { level: 'directional', label: 'Counts only', reasons: [`${effortCoveragePct === null ? 'No' : `${effortCoveragePct}% of`} funding tags carry an effort estimate, so shares count records rather than effort.`] };

  // ---- concentration ---------------------------------------------------
  const hhiMeasured = measuredShares ? herfindahl(measuredShares) : null;
  const hhiDeclared = declaredShares ? herfindahl(declaredShares) : null;

  return {
    engineVersion: SCO_ENGINE_VERSION,
    evaluatedAt: nowDate.toISOString(),
    today,
    settings: { gapThresholdPct, blindThresholdPct, driftWindowDays },
    bets: betRows,
    drafts: betsAll.filter((bet) => bet.status === 'draft').length,
    retired: betsAll.filter((bet) => bet.status === 'retired').length,
    openDecisions: (state.decisions || []).filter((d) => !d.chosen && String(d.question || '').includes('[RULE-SCO-')).length,
    portfolio: {
      basis,
      declaredBasis,
      declaredShares: declaredShares ? declaredShares.map((row) => ({ ...row, sharePct: round(row.share * 100, 1) })) : [],
      measuredShares: measuredShares ? measuredShares.map((row) => ({ ...row, sharePct: round(row.share * 100, 1) })) : [],
      recentShares: recentShares ? recentShares.map((row) => ({ ...row, sharePct: round(row.share * 100, 1) })) : [],
      sayDoGapPct,
      driftGapPct,
      gapBreached: sayDoGapPct !== null && sayDoGapPct > gapThresholdPct,
      effortCoveragePct,
      knownEffortWeeks: knownEffort.length ? round(knownEffortTotal, 2) : null,
      fundingTags: fundingTags.length,
      closedTagged,
      hhi: {
        measured: hhiMeasured,
        declared: hhiDeclared,
        measuredBand: bandForHhi(hhiMeasured),
        declaredBand: bandForHhi(hhiDeclared),
      },
      blind: {
        openWork: openWork.length,
        postStrategy: postStrategyWork.length,
        tagged: postStrategyTagged,
        blindCount,
        blindPct,
        preStrategy,
        unknownVintage,
        vintageStart,
        thresholdPct: blindThresholdPct,
        breached: blindPct !== null && blindPct > blindThresholdPct,
      },
    },
    coherence: {
      pct: coherencePct,
      band,
      components,
      weightsRenormalised: weightSum > 0 && Math.abs(weightSum - 1) > 1e-9,
      missing: [
        sayDoGapPct === null ? 'No declared and measured shares to compare yet.' : null,
        falsifiabilityPct === null ? 'No active bet to grade.' : null,
        blindPct === null ? 'No open post-strategy work to assess.' : null,
      ].filter(Boolean),
    },
    confidence,
    falsifiability: {
      pct: falsifiabilityPct,
      falsifiable: betRows.filter((row) => row.grade.key === 'falsifiable').length,
      partial: betRows.filter((row) => row.grade.key === 'partial').length,
      unfalsifiable: betRows.filter((row) => row.grade.key === 'unfalsifiable').length,
      weakest: [...betRows].sort((a, b) => a.grade.score - b.grade.score).slice(0, 3).map((row) => ({ id: row.id, title: row.title, grade: row.grade })),
    },
    verdictsDue,
    hasBets: betsAll.length > 0,
    rules: SCO_RULES,
  };
}

/* ------------------------------------------------------------------ */
/* Signals                                                            */
/* ------------------------------------------------------------------ */

export function strategySignals(state = {}, now = new Date()) {
  const report = buildStrategyReport(state, now);
  const signals = [];
  const { portfolio, coherence, confidence } = report;

  if (!report.hasBets) {
    if (portfolio.blind.openWork > 0) {
      signals.push({
        ruleId: 'SCO-05',
        domain: 'Strategy',
        title: `${portfolio.blind.openWork} open records are being funded without a stated strategic choice`,
        detail: 'Porter’s negative-space test: until the leader names the bets — and the things the team will not do — every allocation is a reaction. Nothing here scores the leader; the terminal asks for one diagnosis, one guiding policy and one dated stop rule.',
        severity: 3,
        confidence: 'high',
        evidence: [
          `${portfolio.blind.openWork} open work record(s) across cases, goals, delegations, plan items, decisions and changes`,
          'No bet has been adopted, so there is no declared share to compare against',
        ],
        action: { label: 'Declare the first bet', route: '#/strategy' },
      });
    }
    return signals;
  }

  if (report.verdictsDue.length) {
    const worst = [...report.verdictsDue].sort((a, b) => b.kill.daysOverdue - a.kill.daysOverdue)[0];
    signals.push({
      ruleId: 'SCO-04',
      domain: 'Strategy',
      title: `${report.verdictsDue.length} bet(s) passed their stop-rule date with no recorded verdict`,
      detail: 'A stop rule that is never judged is decoration. The app cannot retire a bet for you; it opens exactly one DACI retire-or-renew decision per bet so the choice is made deliberately rather than by drift.',
      severity: 4,
      confidence: 'high',
      evidence: report.verdictsDue.slice(0, 4).map((row) => `${row.title}: stop rule due ${row.kill.checkOn}, ${row.kill.daysOverdue} day(s) overdue`),
      action: { label: worst ? 'Record the verdict' : 'Open Strategy coherence', route: '#/strategy?tab=verdicts' },
    });
  }

  if (portfolio.gapBreached) {
    const over = report.bets.filter((row) => (row.measured?.gapPct ?? 0) > 0).sort((a, b) => b.measured.gapPct - a.measured.gapPct).slice(0, 2);
    const under = report.bets.filter((row) => (row.measured?.gapPct ?? 0) < 0).sort((a, b) => a.measured.gapPct - b.measured.gapPct).slice(0, 2);
    signals.push({
      ruleId: 'SCO-01',
      domain: 'Strategy',
      title: `Say–do gap of ${portfolio.sayDoGapPct}pp exceeds the ${report.settings.gapThresholdPct}pp convention`,
      detail: `Half the L1 distance between declared and measured shares is ${portfolio.sayDoGapPct} percentage points on a ${portfolio.basis === 'effort' ? 'effort' : 'count'} basis (${confidence.label.toLowerCase()}). That is not automatically wrong — it is unnamed, which is what makes it expensive.`,
      severity: 4,
      confidence: confidence.level === 'counts-only' ? 'low' : confidence.level === 'measured' ? 'high' : 'medium',
      evidence: [
        ...over.map((row) => `Over-funded: ${row.title} — declared ${row.measured.declaredSharePct}%, funding ${row.measured.measuredSharePct}%`),
        ...under.map((row) => `Under-funded: ${row.title} — declared ${row.measured.declaredSharePct}%, funding ${row.measured.measuredSharePct}%`),
      ],
      action: { label: 'Open the coherence tab', route: '#/strategy?tab=coherence' },
    });
  }

  const blind = portfolio.blind;
  if (blind.breached) {
    signals.push({
      ruleId: 'SCO-02',
      domain: 'Strategy',
      title: `${blind.blindPct}% of post-strategy open work is not tagged to any active bet`,
      detail: 'Strategy-blind work is how a team ends up executing the strategy nobody chose. The count excludes work that predates the first adopted bet, because relabelling history would make the gap vanish without changing anything.',
      severity: 3,
      confidence: confidence.level === 'counts-only' ? 'low' : 'medium',
      evidence: [
        `${blind.blindCount} of ${blind.postStrategy} post-strategy open record(s) untagged (convention ${blind.thresholdPct}%)`,
        blind.preStrategy ? `${blind.preStrategy} older record(s) excluded as pre-strategy` : null,
        blind.unknownVintage ? `${blind.unknownVintage} record(s) have no start date, so their vintage is unknown and they are excluded` : null,
      ].filter(Boolean),
      action: { label: 'Tag or stop the work', route: '#/strategy?tab=coherence' },
    });
  }

  const unfalsifiable = report.bets.filter((row) => row.grade.key !== 'falsifiable');
  if (unfalsifiable.length) {
    const worst = [...unfalsifiable].sort((a, b) => a.grade.score - b.grade.score)[0];
    signals.push({
      ruleId: 'SCO-03',
      domain: 'Strategy',
      title: `${unfalsifiable.length} active bet(s) cannot yet be proven wrong`,
      detail: 'Each missing check is a way the bet can quietly survive its own failure: no owner, no diagnosis, no refusal, no dated stop rule, or no funded work. The grader names the missing check rather than issuing a score.',
      severity: worst.grade.key === 'unfalsifiable' ? 4 : 3,
      confidence: 'high',
      evidence: unfalsifiable.slice(0, 4).map((row) => `${row.title}: ${row.grade.label} — ${row.grade.missing.length} of 6 checks missing (${row.grade.missing.join(', ')})`),
      action: { label: 'Open falsifiability', route: '#/strategy?tab=falsifiability' },
    });
  }

  if (report.portfolio.driftGapPct !== null && report.portfolio.driftGapPct >= 25 && !report.portfolio.gapBreached) {
    signals.push({
      ruleId: 'SCO-06',
      domain: 'Strategy',
      title: `Recent funding diverges from the standing mix by ${report.portfolio.driftGapPct}pp`,
      detail: 'The stock of work still matches the declared shares, but the newest commitments do not. Direction of travel leads the balance sheet by a quarter, which is exactly when a leader can still choose the outcome.',
      severity: 3,
      confidence: confidence.level === 'counts-only' ? 'low' : 'medium',
      evidence: report.bets
        .filter((row) => Math.abs(row.measured?.recentGapPct ?? 0) >= 5)
        .slice(0, 4)
        .map((row) => `${row.title}: declared ${row.measured.declaredSharePct}%, recent flow ${row.measured.recentSharePct}%`),
      action: { label: 'Compare stock and flow', route: '#/strategy?tab=coherence' },
    });
  }

  return signals;
}

/* ------------------------------------------------------------------ */
/* Brief and attention count                                          */
/* ------------------------------------------------------------------ */

export function strategyAttentionCount(state = {}, now = new Date()) {
  const report = buildStrategyReport(state, now);
  if (!report.hasBets) return report.portfolio.blind.openWork > 0 ? 1 : 0;
  return report.verdictsDue.length
    + (report.portfolio.gapBreached ? 1 : 0)
    + (report.portfolio.blind.breached ? 1 : 0)
    + report.bets.filter((row) => row.grade.key === 'unfalsifiable').length;
}

/**
 * Deterministic plain-text brief. Every number is copied from the report; there
 * is no generated prose and no invented recommendation.
 */
export function strategyBrief(state = {}, now = new Date()) {
  const report = buildStrategyReport(state, now);
  const lines = [];
  lines.push('LEADOS — STRATEGY COHERENCE BRIEF');
  lines.push(`Generated: ${report.evaluatedAt} (workspace-local, no network)`);
  lines.push(`Engine: ${report.engineVersion}`);
  lines.push('');
  lines.push(`Coherence: ${report.coherence.pct === null ? 'not measurable yet' : `${report.coherence.pct}% (${report.coherence.band.label})`}`);
  lines.push(`Confidence: ${report.confidence.label}${report.confidence.reasons.length ? ` — ${report.confidence.reasons.join(' ')}` : ''}`);
  lines.push(`Say–do gap: ${report.portfolio.sayDoGapPct === null ? 'not measurable yet' : `${report.portfolio.sayDoGapPct}pp`} (convention threshold ${report.settings.gapThresholdPct}pp, basis ${report.portfolio.basis})`);
  lines.push(`Strategy-blind work: ${report.portfolio.blind.blindPct === null ? 'not measurable yet' : `${report.portfolio.blind.blindPct}%`} (${report.portfolio.blind.blindCount} of ${report.portfolio.blind.postStrategy} post-strategy open records)`);
  lines.push(`Pre-strategy records excluded: ${report.portfolio.blind.preStrategy}${report.portfolio.blind.unknownVintage ? ` · unknown vintage excluded: ${report.portfolio.blind.unknownVintage}` : ''}`);
  lines.push(`Concentration (measured HHI): ${report.portfolio.hhi.measured === null ? '—' : `${report.portfolio.hhi.measured} (${report.portfolio.hhi.measuredBand.label})`}`);
  lines.push('');
  lines.push('BETS');
  if (!report.bets.length) lines.push('  (none active)');
  for (const bet of report.bets) {
    lines.push(`  • ${bet.title} [${bet.kind}]`);
    lines.push(`    owner: ${bet.ownerId ? (state.people || []).find((p) => p.id === bet.ownerId)?.name || bet.ownerId : 'unassigned'}`);
    lines.push(`    declared ${bet.measured.declaredSharePct === null ? '—' : `${bet.measured.declaredSharePct}%`} · funded ${bet.measured.measuredSharePct}% · drift ${bet.measured.gapPct === null ? '—' : `${bet.measured.gapPct > 0 ? '+' : ''}${bet.measured.gapPct}pp`}`);
    lines.push(`    grade: ${bet.grade.label} (${bet.grade.passed}/${bet.grade.total})${bet.grade.missing.length ? ` — missing: ${bet.grade.missing.join(', ')}` : ''}`);
    lines.push(`    stop rule: ${bet.kill?.metric ? `${bet.kill.metric} ${bet.kill.direction === 'above' ? '↑' : '↓'} ${bet.kill.threshold ?? '—'} by ${bet.kill.checkOn || '—'}` : 'none recorded'}`);
    if (bet.verdictDue) lines.push('    VERDICT DUE: the stop-rule date has passed with no recorded judgement.');
  }
  lines.push('');
  lines.push('WHAT THIS IS NOT');
  lines.push('  The shares are derived from the records in this workspace, and only from them.');
  lines.push('  A missing effort estimate counts as one record, never as zero effort.');
  lines.push('  Divergence is not misalignment: only the leader can say whether the writing or the funding is wrong.');
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* Post-commit rule (ADR-0008) on the shared spine                     */
/* ------------------------------------------------------------------ */

function pushLink(draft, { sourceType, sourceId, targetType, targetId, relation, ruleId, summary }, ctx) {
  draft.links = Array.isArray(draft.links) ? draft.links : [];
  const exists = draft.links.some((link) => link && link.sourceType === sourceType && link.sourceId === sourceId
    && link.targetType === targetType && link.targetId === targetId && link.relation === relation);
  if (exists) return false;
  draft.links.push({
    id: ctx.idFactory('lnk'),
    sourceType,
    sourceId,
    targetType,
    targetId,
    relation,
    ruleId,
    summary: clampText(summary, 300),
    createdOn: ctx.todayStr,
    createdAt: ctx.nowIso,
  });
  return true;
}

function note(ctx, ruleId, action, targetType, targetId, summary, out) {
  out.push({ ruleId, action, targetType, targetId, summary: clampText(summary, 300) });
  if (ctx.logEvent) {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: targetType,
      entityId: targetId,
      summary: `[${ruleId}] ${clampText(summary, 280)}`.slice(0, 300),
    });
  }
}

function markerFor(ruleId, entityId = '') {
  return `[${ruleId}${entityId ? `:${entityId}` : ''}]`;
}

function decisionExists(draft, marker) {
  return (draft.decisions || []).some((decision) => decision && String(decision.question || '').includes(marker));
}

function delegationExists(draft, marker) {
  return (draft.delegations || []).some((delegation) => delegation
    && `${delegation.title || ''} ${delegation.expectedOutcome || ''} ${delegation.support || ''}`.includes(marker));
}

function talkingPointExists(draft, personId, marker) {
  const person = (draft.people || []).find((p) => p && p.id === personId);
  return Boolean(person && (person.talkingPoints || []).some((entry) => String(entry).includes(marker)));
}

function addDecision(draft, ctx, { title, question, options, reversibility = 'reversible', reviewOn = null, date }) {
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  const decision = {
    id: ctx.idFactory('dec'),
    title: title.slice(0, 180),
    question: question.slice(0, 2000),
    date: date || ctx.todayStr,
    reversibility,
    driver: clampText(draft.settings?.leaderName || '', 120),
    approver: '', contributors: '', informed: '',
    options: options.map((option) => ({
      id: ctx.idFactory('dopt'),
      label: clampText(option.label, 200),
      pros: clampText(option.pros, 400),
      cons: clampText(option.cons, 400),
    })),
    chosen: '', rationale: '', reviewOn: reviewOn || null, reviewedOn: null,
    outcome: 'pending', outcomeNotes: '', createdAt: ctx.nowIso,
  };
  draft.decisions.push(decision);
  return decision;
}

function addDelegation(draft, ctx, { personId, title, expectedOutcome, support, dueOn, authority = 'recommend' }) {
  draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
  const delegation = {
    id: ctx.idFactory('delegation'),
    personId,
    title: title.slice(0, 160),
    expectedOutcome: clampText(expectedOutcome, 600),
    authority,
    support: clampText(support, 1200),
    delegatedOn: ctx.todayStr,
    dueOn,
    status: 'active',
    checkins: [],
    completedOn: null, completionNote: '', returnedOn: null, returnReason: '',
    createdAt: ctx.nowIso, updatedAt: ctx.nowIso,
  };
  draft.delegations.push(delegation);
  return delegation;
}

function personName(draft, personId) {
  const person = (draft.people || []).find((p) => p && p.id === personId && p.status !== 'archived');
  return person ? person.name : 'the owner';
}

function openDecisionMarkers(draft, prefix) {
  return (draft.decisions || []).filter((d) => d && !d.chosen && String(d.question || '').includes(prefix));
}

/**
 * Post-commit rule (ADR-0008).
 *
 * Trigger discipline: this rule only runs on `strategy.*` events and on an
 * explicit audit. It deliberately does not hijack `case.created` and friends —
 * a leadership terminal that opens governance decisions while the leader is
 * typing a case note is noise, not automation. The audit action is one click,
 * and its result is the same atomic cascade.
 */
export function strategyRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string') return [];
  const type = event.type;
  const force = ctx.force === true || event.force === true;
  if (!type.startsWith('strategy.') && !force) return [];
  if (!force && draft.settings?.strategyAutoPropagate === false) return [];
  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const runCtx = {
    now,
    todayStr: dayKey(now),
    nowIso: now.toISOString(),
    idFactory: ctx.idFactory || ((prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`),
    logEvent: ctx.logEvent,
  };
  const out = [];

  /* -------- RULE-SCO-01 — adoption fan-out --------------------------- */
  if (type === 'strategy.bet.adopted') {
    const bet = (draft.strategyBets || []).find((row) => row && row.id === event.entityId);
    if (bet && bet.status === 'active') {
      const report = buildStrategyReport(draft, now);
      const row = report.bets.find((entry) => entry.id === bet.id);
      const adoptMarker = markerFor(SCO_RULE_IDS.ADOPT, bet.id);
      if (!decisionExists(draft, adoptMarker)) {
        const missing = row ? row.grade.missing : [];
        const decision = addDecision(draft, runCtx, {
          title: `Commit “${clampText(bet.title, 90)}” as a funded strategic bet`,
          question: [
            `The bet declares ${bet.weightPct}% of the team’s effort for ${bet.horizonWeeks} weeks${row && row.measured.declaredSharePct !== null ? ` and is currently funding ${row.measured.measuredSharePct}%` : ''}.`,
            bet.guidingPolicy ? `Guiding policy: ${clampText(bet.guidingPolicy, 300)}` : 'No guiding policy is recorded yet.',
            missing.length ? `Unfalsifiable as recorded — missing: ${missing.join(', ')}.` : 'All six falsifiability checks pass.',
            'Fund it as declared, fund a staged version behind a stop rule, or decline and retire it.',
            adoptMarker,
          ].filter(Boolean).join(' '),
          options: [
            {
              label: 'Fund it as declared and review at the stop-rule date',
              pros: 'One owner, one share and one dated stop rule make this reviewable, and Decision Tempo prices the commitment in the same transaction.',
              cons: 'Commits the declared share of effort before the stop rule has been judged even once.',
            },
            {
              label: 'Fund a staged version: smallest testable slice first',
              pros: 'Buys evidence at a fraction of the commitment and keeps the rest of the portfolio liquid.',
              cons: 'A staged slice often cannot demonstrate the mechanism the bet depends on.',
            },
            {
              label: 'Decline and retire the bet',
              pros: 'If the team will not fund it, retiring it now keeps the written strategy honest.',
              cons: 'The diagnosis that produced the bet remains unaddressed.',
            },
          ],
          reversibility: bet.weightPct >= 40 ? 'irreversible' : 'reversible',
          reviewOn: bet.killCriterion?.checkOn || addDays(runCtx.todayStr, Math.min(56, bet.horizonWeeks * 7)),
        });
        pushLink(draft, {
          sourceType: 'strategy', sourceId: bet.id, targetType: 'decision', targetId: decision.id,
          relation: 'decides', ruleId: SCO_RULE_IDS.ADOPT,
          summary: `Commitment decision ${adoptMarker}`,
        }, runCtx);
        note(ctx, SCO_RULE_IDS.ADOPT, 'created', 'decision', decision.id,
          `Opened a DACI commitment decision for “${clampText(bet.title, 70)}” (feeds Decision Tempo)`, out);
      }

      const tagMarker = markerFor(`${SCO_RULE_IDS.ADOPT}-tag`, bet.id);
      const owner = (draft.people || []).find((p) => p && p.id === bet.ownerId && p.status !== 'archived');
      if (owner && !delegationExists(draft, tagMarker)) {
        const delegation = addDelegation(draft, runCtx, {
          personId: owner.id,
          title: `Link the work already in flight to “${clampText(bet.title, 80)}”`.slice(0, 160),
          expectedOutcome: `Attach the open cases, goals, delegations and plan items that this bet is actually funding, so the declared share can be compared with the measured one. Leave anything that is not funded by this bet untagged — an inflated tag set makes the gap disappear without changing the work. ${tagMarker}`,
          support: `Tagging is a ten-minute exercise and it is the only way the say–do gap becomes measurable. It is not a performance measure. ${tagMarker}`,
          dueOn: addDays(runCtx.todayStr, 10),
          authority: 'recommend',
        });
        pushLink(draft, {
          sourceType: 'strategy', sourceId: bet.id, targetType: 'delegation', targetId: delegation.id,
          relation: 'tracks-followup', ruleId: SCO_RULE_IDS.ADOPT,
          summary: `Tagging delegation ${tagMarker}`,
        }, runCtx);
        note(ctx, SCO_RULE_IDS.ADOPT, 'created', 'delegation', delegation.id,
          `Opened an owned tagging delegation for “${clampText(bet.title, 70)}”`, out);
      }

      const practiceMarker = markerFor(`${SCO_RULE_IDS.ADOPT}-review`, bet.id);
      if (owner && !talkingPointExists(draft, owner.id, practiceMarker)) {
        const textLine = `${practiceMarker} Bet review, not a performance point: what did we learn that we could only have learned by funding this, and what would make us stop?`.slice(0, 200);
        owner.talkingPoints = [...(Array.isArray(owner.talkingPoints) ? owner.talkingPoints : []), textLine].slice(-12);
        note(ctx, SCO_RULE_IDS.ADOPT, 'updated', 'person', owner.id,
          'Queued a blameless bet-review talking point for the owner', out);
      }
    }
  }

  /* -------- shared evaluation for SCO-02/03/04 ----------------------- */
  const evaluate = type.startsWith('strategy.') || force;
  if (!evaluate) return out;
  const report = buildStrategyReport(draft, now);
  if (!report.bets.length) return out;

  // RULE-SCO-02 — say–do gap over convention.
  if (report.portfolio.gapBreached) {
    const over = report.bets.filter((row) => (row.measured.gapPct ?? 0) > 0).sort((a, b) => b.measured.gapPct - a.measured.gapPct);
    const under = report.bets.filter((row) => (row.measured.gapPct ?? 0) < 0).sort((a, b) => a.measured.gapPct - b.measured.gapPct);
    const setKey = [...over, ...under].map((row) => row.id).sort().join('+').slice(0, 120);
    const gapMarker = markerFor(SCO_RULE_IDS.GAP, setKey);
    if (!decisionExists(draft, gapMarker)) {
      const topOver = over[0] || null;
      const topUnder = under[0] || null;
      const decision = addDecision(draft, runCtx, {
        title: `Rebalance funding between “${clampText((topOver || topUnder || report.bets[0]).title, 60)}” and the declared strategy`.slice(0, 180),
        question: [
          `The declared shares and the funded work diverge by ${report.portfolio.sayDoGapPct}pp on a ${report.portfolio.basis} basis — a total variation distance in percentage points, where 0 is exact agreement.`,
          topOver ? `Most over-funded: “${clampText(topOver.title, 60)}” declared ${topOver.measured.declaredSharePct}% but funding ${topOver.measured.measuredSharePct}%.` : '',
          topUnder ? `Most under-funded: “${clampText(topUnder.title, 60)}” declared ${topUnder.measured.declaredSharePct}% but funding ${topUnder.measured.measuredSharePct}%.` : '',
          'Decide which of the two is wrong — the written share or the work — and what changes this week.',
          gapMarker,
        ].filter(Boolean).join(' '),
        options: [
          {
            label: `Stop or shrink “${clampText(topOver ? topOver.title : 'the over-funded bet', 60)}”`,
            pros: 'Removes the work that is consuming a share nobody chose, and is the only option that frees effort this month.',
            cons: 'Stopping work has a real cost, and the work may be right while the written share is stale.',
          },
          {
            label: `Restate the shares and fund “${clampText(topUnder ? topUnder.title : 'the under-funded bet', 60)}”`,
            pros: 'Keeps the productive work and makes the written strategy match reality, which is what a stop rule needs to be judged against.',
            cons: 'Rewriting the strategy to match the drift is the most common way a strategy quietly dies.',
          },
          {
            label: 'Accept the gap for one horizon and re-measure',
            pros: 'Legitimate when the drift is a deliberate season (a launch, an incident, a hiring wave).',
            cons: 'Without a date, acceptance is indistinguishable from abdication.',
          },
        ],
        reversibility: report.portfolio.sayDoGapPct >= 40 ? 'irreversible' : 'reversible',
        reviewOn: addDays(runCtx.todayStr, 21),
      });
      pushLink(draft, {
        sourceType: 'strategy', sourceId: (topOver || topUnder || report.bets[0]).id, targetType: 'decision', targetId: decision.id,
        relation: 'decides', ruleId: SCO_RULE_IDS.GAP,
        summary: `Say–do rebalancing decision ${gapMarker}`,
      }, runCtx);
      note(ctx, SCO_RULE_IDS.GAP, 'created', 'decision', decision.id,
        `Opened a rebalancing decision at a ${report.portfolio.sayDoGapPct}pp say–do gap`, out);
    }
  }

  // RULE-SCO-03 — no dated stop rule.
  for (const bet of report.bets) {
    if (bet.kill?.metric && bet.kill?.checkOn) continue;
    const marker = markerFor(SCO_RULE_IDS.STOP, bet.id);
    const owner = (draft.people || []).find((p) => p && p.id === bet.ownerId && p.status !== 'archived');
    if (!owner || delegationExists(draft, marker)) continue;
    const delegation = addDelegation(draft, runCtx, {
      personId: owner.id,
      title: `Write the stop rule for “${clampText(bet.title, 80)}”`.slice(0, 160),
      expectedOutcome: `Name the metric, the direction that means the bet is not working, and the date a human will judge it. Do not predict the outcome. ${marker}`,
      support: `A bet without a dated stop rule cannot be wrong, so it cannot be managed — only narrated. This asks for the rule, not the answer. ${marker}`,
      dueOn: addDays(runCtx.todayStr, 7),
      authority: 'recommend',
    });
    pushLink(draft, {
      sourceType: 'strategy', sourceId: bet.id, targetType: 'delegation', targetId: delegation.id,
      relation: 'tracks-followup', ruleId: SCO_RULE_IDS.STOP,
      summary: `Stop-rule delegation ${marker}`,
    }, runCtx);
    note(ctx, SCO_RULE_IDS.STOP, 'created', 'delegation', delegation.id,
      `Asked ${personName(draft, owner.id)} to write the stop rule for “${clampText(bet.title, 70)}”`, out);
  }

  // RULE-SCO-04 — stop-rule date passed with no verdict.
  for (const bet of report.verdictsDue) {
    const marker = markerFor(SCO_RULE_IDS.VERDICT, `${bet.id}:${bet.kill.checkOn}`);
    if (decisionExists(draft, marker)) continue;
    const decision = addDecision(draft, runCtx, {
      title: `Judge “${clampText(bet.title, 80)}” against its stop rule`.slice(0, 180),
      question: [
        `The stop rule was due on ${bet.kill.checkOn}${bet.kill.daysOverdue ? ` (${bet.kill.daysOverdue} day(s) ago)` : ''}${bet.kill.metric ? `: ${bet.kill.metric} ${bet.kill.direction === 'above' ? 'above' : 'below'} ${bet.kill.threshold ?? 'the recorded threshold'}` : ''}.`,
        `Measured funding is ${bet.measured.measuredSharePct}% against a declared ${bet.measured.declaredSharePct ?? '—'}%, and the bet is graded ${bet.grade.label.toLowerCase()}.`,
        'Continue, revise the stop rule, or retire the bet. The app will not retire it for you.',
        marker,
      ].join(' '),
      options: [
        { label: 'Continue the bet as it stands', pros: 'The evidence still supports the bet and the stop rule was met.', cons: 'Continuing past a stop rule is how a bet becomes a sunk cost.' },
        { label: 'Revise the stop rule and set a new date', pros: 'Legitimate when the rule measured the wrong thing, and it keeps the bet falsifiable.', cons: 'Moving the goalposts repeatedly makes the strategy unfalsifiable in practice.' },
        { label: 'Retire the bet', pros: 'Frees the measured share and keeps the written strategy honest.', cons: 'The diagnosis remains, and a successor bet will be needed.' },
      ],
      reversibility: 'irreversible',
      reviewOn: addDays(runCtx.todayStr, 14),
    });
    pushLink(draft, {
      sourceType: 'strategy', sourceId: bet.id, targetType: 'decision', targetId: decision.id,
      relation: 'decides', ruleId: SCO_RULE_IDS.VERDICT,
      summary: `Stop-rule verdict decision ${marker}`,
    }, runCtx);
    note(ctx, SCO_RULE_IDS.VERDICT, 'created', 'decision', decision.id,
      `Opened a retire-or-renew decision for “${clampText(bet.title, 70)}”`, out);
    const owner = (draft.people || []).find((p) => p && p.id === bet.ownerId && p.status !== 'archived');
    const practiceMarker = markerFor(`${SCO_RULE_IDS.VERDICT}-review`, bet.id);
    if (owner && !talkingPointExists(draft, owner.id, practiceMarker)) {
      owner.talkingPoints = [...(Array.isArray(owner.talkingPoints) ? owner.talkingPoints : []),
        `${practiceMarker} Stop-rule review, not a performance point: what did the rule tell us, and what would we do differently at the start?`.slice(0, 200)].slice(-12);
      note(ctx, SCO_RULE_IDS.VERDICT, 'updated', 'person', owner.id,
        'Queued a blameless stop-rule review talking point', out);
    }
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Convention totals (used by tests and the UI)                        */
/* ------------------------------------------------------------------ */

export function strategyTotals(state = {}, now = new Date()) {
  const report = buildStrategyReport(state, now);
  return {
    bets: report.bets.length,
    drafts: report.drafts,
    retired: report.retired,
    coherencePct: report.coherence.pct,
    sayDoGapPct: report.portfolio.sayDoGapPct,
    blindPct: report.portfolio.blind.blindPct,
    verdictsDue: report.verdictsDue.length,
    openDecisions: report.openDecisions,
    gapThresholdPct: report.settings.gapThresholdPct,
  };
}
