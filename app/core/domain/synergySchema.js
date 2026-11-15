/**
 * app/core/domain/synergySchema.js — fail-closed loaders and typed parsers of the
 * Deal Thesis & Synergy Realization Register (ADR-0216, Schema v170).
 *
 * THE RULE THIS FILE ENFORCES. A stored row is the row its own loader returns.
 * Nothing here repairs a value, clamps a promise or guesses a lever: a row that
 * cannot be read exactly is DROPPED with a COUNTED warning and the panel prints
 * the count. The alternative — a plausible default — would put a promise on the
 * board's table that nobody made, or move the day a run-rate was due.
 *
 * THE ×100 TRAP THIS AVOIDS BY CONSTRUCTION. Every amount is stored as whole
 * cents in an integer field (`promisedAnnualCents`, `amountCents`,
 * `targetCents`). The loaders read those fields as INTEGERS ONLY and never route
 * them back through the major-unit parser: the first time a workspace reloads,
 * a stored 9,500,000.00 read as a major-unit string would become
 * 950,000,000.00. A stored amount that is not a whole integer of cents is
 * refused, not repaired (ADR-0211 records the same defect being found in
 * production code; it is not repeated here).
 *
 * THE SAVING KEY IS RECOMPUTED, NEVER TRUSTED. Two promises are contested when
 * they name the same saving on the same deal. That test is only as good as the
 * key it compares, so `savingKey` is derived from `savingRef` on every load: a
 * hand-edited file cannot point two different savings at one key to dodge the
 * double-count test, or split one saving across two keys to hide it.
 */

import { dayKey, daysBetween } from '../time.js';
import {
  SYNERGY_BOUNDS,
  SYNERGY_DEFAULTS,
  SYNERGY_LIMITS,
  SYNERGY_SETTING_KEYS,
} from './synergyRegistry.js';

const L = SYNERGY_LIMITS;
const DECIMAL = /^\d+(\.\d+)?$/;

/** A real calendar day inside the register's range, or null. */
export function synergyDay(value) {
  const key = dayKey(value);
  if (!key || key < L.dayMin || key > L.dayMax) return null;
  return key;
}

/** Whole days from one day key to another, or null when either is unreadable. */
export function synergyDaysBetween(from, to) {
  if (!from || !to) return null;
  const n = daysBetween(`${from}T00:00:00.000Z`, `${to}T00:00:00.000Z`);
  return Number.isInteger(n) ? n : null;
}

/** Collapse whitespace and bound the length. Returns '' rather than a placeholder. */
export function synergyText(value, max = 200) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

/** A person id this record could hold, or null. */
export function synergyPersonId(value) {
  const id = synergyText(value, L.personIdMax);
  return id ? id : null;
}

/** A three-letter currency code, upper-cased, or null. */
export function synergyCurrency(value) {
  const text = synergyText(value, 8).toUpperCase();
  return /^[A-Z]{3}$/.test(text) ? text : null;
}

function decimalToScaled(raw, digits) {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const text = String(raw).trim();
  if (!text || !DECIMAL.test(text) || text.includes('e') || text.includes('E')) return null;
  const dot = text.indexOf('.');
  const whole = dot === -1 ? text : text.slice(0, dot);
  const fraction = dot === -1 ? '' : text.slice(dot + 1);
  if (fraction.length > digits) return null;
  return BigInt(whole) * 10n ** BigInt(digits) + BigInt((fraction || '').padEnd(digits, '0') || '0');
}

/**
 * A typed amount in whole cents. A comma is refused outright (in half of Europe
 * it is the decimal separator, so "1,500" is as likely to be one and a half as
 * fifteen hundred) and more decimals than cents hold is refused, never rounded.
 */
export function parseSynergyMoney(value, { signed = false } = {}) {
  const text = typeof value === 'number' ? String(value) : value;
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  const negative = trimmed.startsWith('-');
  if (negative && !signed) return null;
  const body = negative ? trimmed.slice(1) : trimmed;
  if (!body || !DECIMAL.test(body)) return null;
  const scaled = decimalToScaled(body, 2);
  if (scaled === null) return null;
  const cents = negative ? -scaled : scaled;
  if (cents > BigInt(L.maxCents) || cents < BigInt(-L.maxCents)) return null;
  return Number(cents);
}

/** A stored integer amount of whole cents, or null. Never parsed as a string. */
export function readStoredSynergyCents(value, { signed = true } = {}) {
  if (!Number.isSafeInteger(value)) return null;
  if (!signed && value < 0) return null;
  if (Math.abs(value) > L.maxCents) return null;
  return value;
}

/** The normalised identity of a saving, derived from what the leader typed. */
export function normalizeSavingRef(value) {
  const text = synergyText(value, L.savingRefMax).toLowerCase();
  if (!text) return '';
  return text.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, L.savingRefMax);
}

/**
 * The declared conventions. A value outside its bounds falls back to the
 * documented default — never to zero and never to the bound it missed, because a
 * clamp would let a typo move the materiality line the board reads.
 */
export function normalizeSynergySettings(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const key = SYNERGY_SETTING_KEYS;
  const intIn = (value, [min, max], fallback) => {
    const n = Number(value);
    return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
  };
  return {
    [key.materialityPct]: intIn(source[key.materialityPct], SYNERGY_BOUNDS.materialityPct, SYNERGY_DEFAULTS.materialityPct),
    [key.staleDays]: intIn(source[key.staleDays], SYNERGY_BOUNDS.staleDays, SYNERGY_DEFAULTS.staleDays),
    [key.autoPropagate]: source[key.autoPropagate] === undefined ? SYNERGY_DEFAULTS.autoPropagate : Boolean(source[key.autoPropagate]),
  };
}

/** The same conventions, read out by their short names for every consumer. */
export function readSynergySettings({ settings = null } = {}) {
  const raw = normalizeSynergySettings(settings || {});
  return {
    materialityPct: raw[SYNERGY_SETTING_KEYS.materialityPct],
    staleDays: raw[SYNERGY_SETTING_KEYS.staleDays],
    autoPropagate: raw[SYNERGY_SETTING_KEYS.autoPropagate],
  };
}

/* ------------------------------------------------------------------- deals */

const CURRENCY_SHAPE = /^[A-Z]{3}$/;

/**
 * Load deals. A row that cannot be read exactly is dropped and counted; nothing
 * is repaired and no label, currency or date is defaulted into existence.
 */
export function normalizeDealTheses(value, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const kept = [];
  const seen = new Set();
  let dropped = 0;
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') { dropped += 1; continue; }
    const id = synergyText(raw.id, 80);
    if (!id || seen.has(id)) { dropped += 1; continue; }
    const label = synergyText(raw.label, L.labelMax);
    const currency = typeof raw.currency === 'string' && CURRENCY_SHAPE.test(raw.currency) ? raw.currency : null;
    const signedOn = synergyDay(raw.signedOn);
    const declaredOn = synergyDay(raw.declaredOn);
    const thesis = synergyText(raw.thesis, L.thesisMax);
    const leadId = synergyPersonId(raw.leadId);
    if (!label || label.length < L.labelMin) { dropped += 1; continue; }
    if (!currency) { dropped += 1; continue; }
    if (!signedOn || !declaredOn) { dropped += 1; continue; }
    if (!thesis || thesis.length < L.thesisMin) { dropped += 1; continue; }
    if (!leadId) { dropped += 1; continue; }
    seen.add(id);
    kept.push({
      id, label, currency, signedOn, declaredOn, thesis, leadId,
      declaredById: synergyPersonId(raw.declaredById) || null,
    });
  }
  if (dropped) warnings.push(`${dropped} deal thesis row(s) were unreadable and were dropped rather than repaired.`);
  return kept;
}

/* ------------------------------------------------------------------ claims */

/**
 * Load promises. The phase ladder is validated as a whole: forward-only dates,
 * at most six phases, every phase on or after the signing day, and a final phase
 * that EQUALS the full promised run-rate. A ladder that ended short would be a
 * second, quieter promise, so it is dropped rather than completed.
 */
export function normalizeSynergyClaims(value, deals = [], warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const dealById = new Map((deals || []).map((deal) => [deal.id, deal]));
  const kept = [];
  const seen = new Set();
  let dropped = 0;
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') { dropped += 1; continue; }
    const id = synergyText(raw.id, 80);
    if (!id || seen.has(id)) { dropped += 1; continue; }
    const dealId = synergyText(raw.dealId, 80);
    const deal = dealById.get(dealId) || null;
    if (!deal) { dropped += 1; continue; }
    const leverKey = synergyText(raw.leverKey, 40);
    const effectKey = synergyText(raw.effectKey, 40);
    const ownerId = synergyPersonId(raw.ownerId);
    const savingRef = synergyText(raw.savingRef, L.savingRefMax);
    const savingKey = normalizeSavingRef(savingRef);
    const promisedAnnualCents = readStoredSynergyCents(raw.promisedAnnualCents, { signed: false });
    const declaredOn = synergyDay(raw.declaredOn);
    const withdrawnOn = raw.withdrawnOn ? synergyDay(raw.withdrawnOn) : null;
    if (!leverKey || !effectKey || !ownerId || !savingKey || savingKey.length < L.savingRefMin) { dropped += 1; continue; }
    if (promisedAnnualCents === null || promisedAnnualCents <= 0 || !declaredOn) { dropped += 1; continue; }
    if (raw.withdrawnOn && !withdrawnOn) { dropped += 1; continue; }

    const phasesRaw = Array.isArray(raw.phases) ? raw.phases : [];
    if (!phasesRaw.length || phasesRaw.length > L.phasesMax) { dropped += 1; continue; }
    const phases = [];
    let broken = false;
    for (const phase of phasesRaw) {
      if (!phase || typeof phase !== 'object') { broken = true; break; }
      const dueOn = synergyDay(phase.dueOn);
      const targetCents = readStoredSynergyCents(phase.targetCents, { signed: false });
      if (!dueOn || targetCents === null || targetCents <= 0) { broken = true; break; }
      if (dueOn < deal.signedOn) { broken = true; break; }
      if (phases.length && dueOn <= phases[phases.length - 1].dueOn) { broken = true; break; }
      if (phases.length && targetCents < phases[phases.length - 1].targetCents) { broken = true; break; }
      phases.push({ dueOn, targetCents });
    }
    if (broken || phases.length !== phasesRaw.length) { dropped += 1; continue; }
    if (phases[phases.length - 1].targetCents !== promisedAnnualCents) { dropped += 1; continue; }

    seen.add(id);
    kept.push({
      id,
      dealId,
      leverKey,
      effectKey,
      ownerId,
      savingRef,
      savingKey,
      promisedAnnualCents,
      phases,
      declaredOn,
      declaredById: synergyPersonId(raw.declaredById) || null,
      note: synergyText(raw.note, L.noteMax),
      withdrawnOn,
      withdrawnReason: withdrawnOn ? synergyText(raw.withdrawnReason, L.noteMax) : '',
    });
  }
  if (dropped) warnings.push(`${dropped} synergy promise row(s) were unreadable and were dropped rather than repaired.`);
  return kept;
}

/* ---------------------------------------------------------------- readings */

/**
 * Load readings. A `verified` row must name its verifier and its evidence; a row
 * missing either is dropped, because "verified" with no evidence is a second
 * claim wearing a better word. A `pnl` row must name its period.
 */
export function normalizeSynergyReadings(value, claims = [], warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const claimById = new Map((claims || []).map((claim) => [claim.id, claim]));
  const kept = [];
  const seen = new Set();
  let dropped = 0;
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') { dropped += 1; continue; }
    const id = synergyText(raw.id, 80);
    if (!id || seen.has(id)) { dropped += 1; continue; }
    const claimId = synergyText(raw.claimId, 80);
    if (!claimById.has(claimId)) { dropped += 1; continue; }
    const kindKey = synergyText(raw.kindKey, 20);
    if (kindKey !== 'run-rate' && kindKey !== 'pnl') { dropped += 1; continue; }
    const basisKey = synergyText(raw.basisKey, 20);
    if (basisKey !== 'claimed' && basisKey !== 'verified') { dropped += 1; continue; }
    const asOf = synergyDay(raw.asOf);
    const recordedOn = synergyDay(raw.recordedOn);
    const amountCents = readStoredSynergyCents(raw.amountCents, { signed: true });
    if (!asOf || !recordedOn || amountCents === null) { dropped += 1; continue; }
    const periodKey = kindKey === 'pnl' ? synergyText(raw.periodKey, L.periodKeyMax) : '';
    if (kindKey === 'pnl' && !periodKey) { dropped += 1; continue; }
    const evidenceRef = synergyText(raw.evidenceRef, L.basisMax);
    const verifiedById = synergyPersonId(raw.verifiedById);
    if (basisKey === 'verified' && (!verifiedById || evidenceRef.length < L.basisMin)) { dropped += 1; continue; }
    const withdrawnOn = raw.withdrawnOn ? synergyDay(raw.withdrawnOn) : null;
    if (raw.withdrawnOn && !withdrawnOn) { dropped += 1; continue; }
    seen.add(id);
    kept.push({
      id, claimId, kindKey, basisKey, asOf, periodKey, amountCents,
      verifiedById: basisKey === 'verified' ? verifiedById : null,
      evidenceRef: basisKey === 'verified' ? evidenceRef : '',
      note: synergyText(raw.note, L.noteMax),
      recordedOn,
      recordedById: synergyPersonId(raw.recordedById) || null,
      withdrawnOn,
      withdrawnReason: withdrawnOn ? synergyText(raw.withdrawnReason, L.noteMax) : '',
    });
  }
  if (dropped) warnings.push(`${dropped} synergy reading row(s) were unreadable and were dropped rather than repaired.`);
  return kept;
}

/* ------------------------------------------------------------------- costs */

/**
 * Load one-off costs. A cost allocated to a promise must belong to the same deal
 * as the promise; an allocation that points across deals is dropped rather than
 * silently re-pointed, because it would move money between two theses.
 */
export function normalizeSynergyCosts(value, deals = [], claims = [], warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const dealById = new Map((deals || []).map((deal) => [deal.id, deal]));
  const claimById = new Map((claims || []).map((claim) => [claim.id, claim]));
  const kept = [];
  const seen = new Set();
  let dropped = 0;
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') { dropped += 1; continue; }
    const id = synergyText(raw.id, 80);
    if (!id || seen.has(id)) { dropped += 1; continue; }
    const dealId = synergyText(raw.dealId, 80);
    if (!dealById.has(dealId)) { dropped += 1; continue; }
    const claimId = raw.claimId ? synergyText(raw.claimId, 80) : null;
    if (claimId) {
      const claim = claimById.get(claimId);
      if (!claim || claim.dealId !== dealId) { dropped += 1; continue; }
    }
    const amountCents = readStoredSynergyCents(raw.amountCents, { signed: false });
    const spentOn = synergyDay(raw.spentOn);
    const recordedOn = synergyDay(raw.recordedOn);
    const kindKey = synergyText(raw.kindKey, 30);
    if (amountCents === null || amountCents <= 0 || !spentOn || !recordedOn) { dropped += 1; continue; }
    if (!kindKey) { dropped += 1; continue; }
    seen.add(id);
    kept.push({
      id, dealId, claimId, amountCents, spentOn, kindKey,
      note: synergyText(raw.note, L.noteMax),
      recordedOn,
      recordedById: synergyPersonId(raw.recordedById) || null,
    });
  }
  if (dropped) warnings.push(`${dropped} one-off cost row(s) were unreadable and were dropped rather than repaired.`);
  return kept;
}

/* -------------------------------------------------------------- signatures */

/**
 * The deterministic signature a rule files one ask per. It names the claim and
 * the exact obligation (the due phase, or the stale verified reading), so a new
 * phase re-opens the ask and a fresh reading closes the old one.
 */
export function synergySignature(kind, claimId, basis) {
  return `syn1:${String(kind)}:${String(claimId)}:${String(basis)}`;
}

export function synergyAskSummary(signature) {
  return `synergy-ask ${String(signature)}`;
}

export function parseSynergyAskSummary(summary) {
  const text = String(summary || '').trim();
  if (!text.startsWith('synergy-ask syn1:')) return null;
  const signature = text.slice('synergy-ask '.length);
  const match = /^syn1:([a-z-]+):([^:\s]+):([^:\s]+)$/.exec(signature);
  if (!match) return null;
  return { signature, kind: match[1], claimId: match[2], basis: match[3] };
}

/** The newest first, deterministically — day, then recording day, then id. */
export function compareSynergyReadingsDesc(a, b) {
  if (a.asOf !== b.asOf) return a.asOf < b.asOf ? 1 : -1;
  if (a.recordedOn !== b.recordedOn) return a.recordedOn < b.recordedOn ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}
