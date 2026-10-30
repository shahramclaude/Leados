/**
 * app/core/domain/valueOfInformationSchema.js — the stored contract for
 * Schema v54.
 *
 * `valueOfInformation.js` is the analysis; this module decides what a
 * half-written, hand-edited or older frame is allowed to become on load. The
 * house rules apply — nothing is repaired by invention — plus four that are
 * specific to a priced decision:
 *
 *  - **A probability that is not a whole percent is clamped, and a set that
 *    does not sum to 100 is left alone and reported.** Normalization never
 *    renormalises: silently rescaling three typos into a confident-looking 100%
 *    would produce an EVPI from numbers the leader never declared.
 *  - **A missing payoff is absent from storage, never written as 0.** The read
 *    model treats an absent cell as `null` and refuses the arithmetic. Writing
 *    a zero would make every unpriced option look like the cheapest one.
 *  - **A dangling premise reference is cleared, not the state.** The state of
 *    the world is the leader's claim about the world; the premise is a pointer.
 *    Losing the pointer must not delete the claim, so the state survives with
 *    `premiseId: null` and a warning.
 *  - **A frozen snapshot is preserved exactly.** Re-deriving the EVPI a
 *    decision was taken under, from today's payoffs, would rewrite the number
 *    the decision is later held to.
 */

import { dayKey } from '../time.js';
import {
  INQUIRY_SIGNALS,
  INQUIRY_STATUSES,
  VOI_DECISION_STATUSES,
  VOI_MAX_OPTIONS,
  VOI_MAX_PAYOFF,
  VOI_MAX_STATES,
} from './valueOfInformation.js';

export const VOI_SNAPSHOT_VERSION = 1;
export const VOI_MAX_LABEL = 140;
export const VOI_MAX_QUESTION = 1600;
export const VOI_MAX_STATE_LABEL = 160;
export const VOI_MAX_NOTE = 600;
export const VOI_HISTORY_CAP = 40;
export const VOI_MAX_OUTCOMES = 40;
export const VOI_CURRENCIES = Object.freeze([
  'USD', 'EUR', 'GBP', 'DKK', 'SEK', 'NOK', 'CAD', 'AUD', 'CHF', 'JPY', 'INR', 'SGD',
]);

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function clean(text, max) {
  return str(text).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function day(value) {
  const raw = str(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function isoOrNull(value) {
  const raw = str(value).trim();
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function clampMoney(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(VOI_MAX_PAYOFF, Math.max(-VOI_MAX_PAYOFF, Math.round(n * 100) / 100));
}

function currency(value) {
  const code = str(value).trim().toUpperCase();
  return VOI_CURRENCIES.includes(code) ? code : 'USD';
}

export function normalizeVoiStates(raw, state, frameId, warnings) {
  const rows = Array.isArray(raw) ? raw : [];
  const premiseIds = new Set((state?.premises || []).map((row) => row && row.id));
  const seen = new Set();
  const out = [];
  let cleared = 0;
  for (const row of rows) {
    if (!isPlainObject(row)) continue;
    const id = clean(row.id, 80);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const premiseId = row.premiseId ? clean(row.premiseId, 80) : null;
    if (premiseId && !premiseIds.has(premiseId)) {
      cleared += 1;
      out.push({
        id,
        label: clean(row.label, VOI_MAX_STATE_LABEL) || 'Unnamed state',
        probability: clampInt(row.probability, 0, 100, 0),
        premiseId: null,
      });
    } else {
      out.push({
        id,
        label: clean(row.label, VOI_MAX_STATE_LABEL) || 'Unnamed state',
        probability: clampInt(row.probability, 0, 100, 0),
        premiseId,
      });
    }
    if (out.length >= VOI_MAX_STATES) break;
  }
  if (cleared) {
    warnings.push(`Information value: ${cleared} state(s) on frame “${frameId}” referred to a premise that no longer exists; the state is kept and the pointer is cleared`);
  }
  if (rows.length > out.length && !cleared) {
    warnings.push(`Information value: ${rows.length - out.length} duplicate or blank state(s) on frame “${frameId}” were dropped`);
  }
  return out;
}

export function normalizeVoiOptions(raw, frameId, warnings) {
  const rows = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    if (!isPlainObject(row)) continue;
    const id = clean(row.id, 80);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      label: clean(row.label, VOI_MAX_STATE_LABEL) || 'Unnamed option',
      isStatusQuo: Boolean(row.isStatusQuo),
    });
    if (out.length >= VOI_MAX_OPTIONS) break;
  }
  if (rows.length > out.length) {
    warnings.push(`Information value: ${rows.length - out.length} duplicate or blank option(s) on frame “${frameId}” were dropped`);
  }
  return out;
}

export function normalizeVoiPayoffs(raw, states, options) {
  const rows = Array.isArray(raw) ? raw : [];
  const stateIds = new Set(states.map((state) => state.id));
  const optionIds = new Set(options.map((option) => option.id));
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    if (!isPlainObject(row)) continue;
    const optionId = clean(row.optionId, 80);
    const stateId = clean(row.stateId, 80);
    if (!optionId || !stateId) continue;
    if (!optionIds.has(optionId) || !stateIds.has(stateId)) continue;
    const key = `${optionId}::${stateId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const value = clampMoney(row.value);
    if (value === null) continue; // an absent cell is absent, never a zero
    out.push({ optionId, stateId, value });
  }
  return out;
}

function normalizeSnapshot(raw) {
  if (!isPlainObject(raw)) return null;
  const readings = Array.isArray(raw.readings) ? raw.readings : [];
  return {
    version: VOI_SNAPSHOT_VERSION,
    capturedAt: isoOrNull(raw.capturedAt),
    evpi: Number.isFinite(Number(raw.evpi)) ? Number(raw.evpi) : null,
    evpiShareOfStakePct: Number.isFinite(Number(raw.evpiShareOfStakePct)) ? Number(raw.evpiShareOfStakePct) : null,
    bestOptionId: raw.bestOptionId ? str(raw.bestOptionId) : null,
    chosenOptionId: raw.chosenOptionId ? str(raw.chosenOptionId) : null,
    nearTie: Boolean(raw.nearTie),
    stake: Number.isFinite(Number(raw.stake)) ? Number(raw.stake) : null,
    currency: currency(raw.currency),
    probabilities: Array.isArray(raw.probabilities) ? raw.probabilities.slice(0, VOI_MAX_STATES).map((row) => ({
      stateId: str(row?.stateId),
      pct: Number.isFinite(Number(row?.pct)) ? Number(row.pct) : 0,
    })) : [],
    readings: readings.slice(0, VOI_MAX_OPTIONS).map((row) => ({
      optionId: str(row?.optionId),
      ev: Number.isFinite(Number(row?.ev)) ? Number(row.ev) : null,
    })),
  };
}

function normalizeOutcomes(raw) {
  const rows = Array.isArray(raw) ? raw : [];
  return rows.slice(-VOI_MAX_OUTCOMES).map((row) => ({
    on: day(row?.on),
    realizedStateId: row?.realizedStateId ? str(row.realizedStateId) : null,
    chosenOptionId: row?.chosenOptionId ? str(row.chosenOptionId) : null,
    regret: Number.isFinite(Number(row?.regret)) ? Number(row.regret) : null,
    probabilities: Array.isArray(row?.probabilities) ? row.probabilities.slice(0, VOI_MAX_STATES).map((entry) => ({
      stateId: str(entry?.stateId),
      pct: Number.isFinite(Number(entry?.pct)) ? Number(entry.pct) : 0,
    })) : [],
    note: clean(row?.note, VOI_MAX_NOTE),
  }));
}

function normalizeHistory(raw) {
  const rows = Array.isArray(raw) ? raw : [];
  return rows.slice(-VOI_HISTORY_CAP).map((row) => ({
    at: isoOrNull(row?.at),
    type: clean(row?.type, 40) || 'updated',
    summary: clean(row?.summary, 300),
  }));
}

export function normalizeVoiDecisions(raw, state, now = new Date(), warnings = []) {
  const rows = Array.isArray(raw) ? raw : [];
  const personIds = new Set((state?.people || []).map((person) => person && person.id));
  const decisionIds = new Set((state?.decisions || []).map((row) => row && row.id));
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    if (!isPlainObject(row)) continue;
    const id = clean(row.id, 100);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const ownerRaw = clean(row.ownerId, 100);
    if (ownerRaw && !personIds.has(ownerRaw)) {
      warnings.push(`Information value: frame “${id}” named an owner who is no longer in the roster; the owner is unset`);
    }
    const decisionRaw = clean(row.decisionId, 100);
    if (decisionRaw && !decisionIds.has(decisionRaw)) {
      warnings.push(`Information value: frame “${id}” pointed at a decision that no longer exists; the pointer is cleared and the frame is kept`);
    }
    const states = normalizeVoiStates(row.states, state, id, warnings);
    const options = normalizeVoiOptions(row.options, id, warnings);
    const status = VOI_DECISION_STATUSES.includes(row.status) ? row.status : 'open';
    const probabilitySum = states.reduce((acc, entry) => acc + entry.probability, 0);
    if (states.length && probabilitySum !== 100) {
      warnings.push(`Information value: the states on frame “${id}” sum to ${probabilitySum}%, not 100%; the arithmetic is refused rather than rescaled`);
    }
    out.push({
      id,
      label: clean(row.label, VOI_MAX_LABEL) || 'Untitled decision frame',
      question: clean(row.question, VOI_MAX_QUESTION),
      ownerId: ownerRaw && personIds.has(ownerRaw) ? ownerRaw : null,
      decisionId: decisionRaw && decisionIds.has(decisionRaw) ? decisionRaw : null,
      currency: currency(row.currency),
      status,
      states,
      options,
      payoffs: normalizeVoiPayoffs(row.payoffs, states, options),
      chosenOptionId: row.chosenOptionId && options.some((option) => option.id === row.chosenOptionId)
        ? str(row.chosenOptionId)
        : null,
      declaredOn: day(row.declaredOn) || dayKey(now),
      decidedOn: day(row.decidedOn),
      reviewOn: day(row.reviewOn),
      settledOn: day(row.settledOn),
      snapshot: normalizeSnapshot(row.snapshot),
      outcomes: normalizeOutcomes(row.outcomes),
      history: normalizeHistory(row.history),
      createdAt: isoOrNull(row.createdAt),
      updatedAt: isoOrNull(row.updatedAt),
    });
  }
  return out;
}

export function normalizeVoiStudies(raw, state, now = new Date(), warnings = []) {
  const rows = Array.isArray(raw) ? raw : [];
  const frames = new Map((state?.voiDecisions || []).map((row) => [row.id, row]));
  const out = [];
  const seen = new Set();
  let orphaned = 0;
  for (const row of rows) {
    if (!isPlainObject(row)) continue;
    const id = clean(row.id, 100);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const frameId = clean(row.frameId, 100);
    const frame = frames.get(frameId);
    if (!frame) {
      orphaned += 1;
      continue;
    }
    const stateIds = new Set(frame.states.map((entry) => entry.id));
    const targets = (Array.isArray(row.targetStateIds) ? row.targetStateIds : [])
      .map((entry) => clean(entry, 80))
      .filter((entry) => stateIds.has(entry));
    const status = INQUIRY_STATUSES.includes(row.status) ? row.status : 'planned';
    const result = isPlainObject(row.result) ? {
      signal: INQUIRY_SIGNALS.includes(row.result.signal) ? row.result.signal : null,
      on: day(row.result.on),
      lr: Number.isFinite(Number(row.result.lr)) ? Number(row.result.lr) : null,
      evsi: Number.isFinite(Number(row.result.evsi)) ? Number(row.result.evsi) : null,
      netValue: Number.isFinite(Number(row.result.netValue)) ? Number(row.result.netValue) : null,
      note: clean(row.result.note, VOI_MAX_NOTE),
      probabilities: Array.isArray(row.result.probabilities) ? row.result.probabilities.slice(0, VOI_MAX_STATES).map((entry) => ({
        stateId: str(entry?.stateId),
        pct: Number.isFinite(Number(entry?.pct)) ? Number(entry.pct) : 0,
      })) : [],
    } : null;
    out.push({
      id,
      frameId,
      label: clean(row.label, VOI_MAX_LABEL) || 'Untitled investigation',
      method: clean(row.method, 600),
      targetStateIds: targets,
      sensitivityPct: clampInt(row.sensitivityPct, 50, 100, 75),
      specificityPct: clampInt(row.specificityPct, 50, 100, 75),
      cost: clampMoney(row.cost) === null ? 0 : Math.max(0, clampMoney(row.cost)),
      delayCost: clampMoney(row.delayCost) === null ? 0 : Math.max(0, clampMoney(row.delayCost)),
      currency: currency(row.currency || frame.currency),
      dueOn: day(row.dueOn),
      status,
      result: status === 'settled' ? result : (result || null),
      history: normalizeHistory(row.history),
      createdAt: isoOrNull(row.createdAt),
      updatedAt: isoOrNull(row.updatedAt),
    });
  }
  if (orphaned) {
    warnings.push(`Information value: ${orphaned} investigation(s) referred to a decision frame that no longer exists and were dropped with it`);
  }
  return out;
}
