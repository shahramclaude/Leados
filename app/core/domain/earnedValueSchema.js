/**
 * app/core/domain/earnedValueSchema.js — fail-closed loaders and typed parsers of
 * the Earned-Value Delivery & Estimate-at-Completion Register (ADR-0217,
 * Schema v171).
 *
 * THE RULE THIS FILE ENFORCES. A stored row is the row its own loader returns.
 * Nothing here repairs a value, clamps a budget or guesses a share: a row that
 * cannot be read exactly is DROPPED with a COUNTED warning and the panel prints
 * the count. The alternative — a plausible default — would put a delivery number
 * on a board pack that nobody declared.
 *
 * THE ×100 TRAP THIS AVOIDS BY CONSTRUCTION. Every amount is stored as whole
 * cents in an integer field (`plannedCents`, `phaseCents`, `amountCents`). The
 * loaders read those fields as INTEGERS ONLY and never route them back through
 * the major-unit parser. A stored amount that is not a whole integer of cents is
 * refused, not repaired.
 *
 * THE BASELINE IS RE-PROVED ON EVERY LOAD. A package's increments must sum to
 * its budget to the cent; a package that fails is dropped with a warning rather
 * than scaled into compliance. Line shares must sum to exactly 100 when
 * declared; otherwise the SHARES are dropped (the package keeps no line
 * attribution) — never renormalised, because a re-scaled split is an allocation
 * nobody agreed to.
 */

import { dayKey, daysBetween } from '../time.js';
import {
  EV_BOUNDS,
  EV_DEFAULTS,
  EV_LIMITS,
  EV_METHOD_KEYS,
  EV_SETTING_KEYS,
  evMethodByKey,
} from './earnedValueRegistry.js';

const L = EV_LIMITS;
const DECIMAL = /^\d+(\.\d+)?$/;

/** A real calendar day inside the register's range, or null. */
export function evDay(value) {
  const key = dayKey(value);
  if (!key || key < L.dayMin || key > L.dayMax) return null;
  return key;
}

/** Whole days from one day key to another, or null when either is unreadable. */
export function evDaysBetween(from, to) {
  if (!from || !to) return null;
  const n = daysBetween(`${from}T00:00:00.000Z`, `${to}T00:00:00.000Z`);
  return Number.isInteger(n) ? n : null;
}

/** Collapse whitespace and bound the length. Returns '' rather than a placeholder. */
export function evText(value, max = 200) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

/** A person id this record could hold, or null. */
export function evPersonId(value) {
  const id = evText(value, L.personIdMax);
  return id ? id : null;
}

/** A three-letter currency code, upper-cased, or null. */
export function evCurrency(value) {
  const text = evText(value, 8).toUpperCase();
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
 * A typed amount in whole cents. A comma is refused outright and more decimals
 * than cents hold is refused, never rounded.
 */
export function parseEvMoney(value, { signed = false } = {}) {
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
export function readStoredEvCents(value, { signed = true } = {}) {
  if (!Number.isSafeInteger(value)) return null;
  if (!signed && value < 0) return null;
  if (Math.abs(value) > L.maxCents) return null;
  return value;
}

/** The normalized identity of a WBS code, for duplicate detection. */
export function normalizeEvCode(value) {
  const text = evText(value, L.codeMax).toUpperCase();
  return text.replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, L.codeMax);
}

/**
 * Parse the typed increments of one package: one line per increment,
 * `YYYY-MM-DD <amount>`. Returns { phases, error } — phases null on any failure,
 * with the offending line number named, so "nothing was saved" can be said
 * truthfully.
 */
export function parseEvPhases(text) {
  if (typeof text !== 'string') return { phases: null, error: 'phases-required' };
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return { phases: null, error: 'phases-required' };
  if (lines.length > L.phasesMax) return { phases: null, error: 'phases-too-many', line: lines.length };
  const phases = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = /^(\d{4}-\d{2}-\d{2})\s+(.+)$/.exec(lines[i]);
    if (!match) return { phases: null, error: 'phase-unparseable', line: i + 1 };
    const phaseEnd = evDay(match[1]);
    if (!phaseEnd) return { phases: null, error: 'phase-date-out-of-range', line: i + 1 };
    const cents = parseEvMoney(match[2]);
    if (cents === null || cents <= 0) return { phases: null, error: 'phase-not-positive', line: i + 1 };
    phases.push({ phaseEnd, cents });
  }
  phases.sort((a, b) => (a.phaseEnd < b.phaseEnd ? -1 : a.phaseEnd > b.phaseEnd ? 1 : 0));
  return { phases, error: null };
}

/**
 * Parse the typed line split of one package: one line per share,
 * `lineKey <pct>` or `lineKey <pct>%`. Integer percents only. Returns
 * { shares, error }; shares may be [] when the text is empty (unattributed).
 */
export function parseEvLineShares(text, knownLineKeys) {
  if (text === null || text === undefined) return { shares: [], error: null };
  if (typeof text !== 'string') return { shares: null, error: 'line-share-out-of-range' };
  const trimmed = text.trim();
  if (!trimmed) return { shares: [], error: null };
  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const shares = [];
  const seen = new Set();
  for (let i = 0; i < lines.length; i += 1) {
    const match = /^([A-Za-z0-9][A-Za-z0-9._-]{0,80})\s+(\d{1,3})%?$/.exec(lines[i]);
    if (!match) return { shares: null, error: 'line-share-out-of-range', line: i + 1 };
    const lineKey = match[1];
    const pct = Number(match[2]);
    if (!Number.isInteger(pct) || pct < 0 || pct > 100) return { shares: null, error: 'line-share-out-of-range', line: i + 1 };
    if (seen.has(lineKey)) return { shares: null, error: 'line-share-duplicate', line: i + 1 };
    seen.add(lineKey);
    shares.push({ lineKey, pct });
  }
  if (shares.length) {
    const total = shares.reduce((acc, row) => acc + row.pct, 0);
    if (total !== 100) return { shares: null, error: 'line-shares-do-not-add' };
    if (knownLineKeys instanceof Set && knownLineKeys.size) {
      for (const share of shares) {
        if (!knownLineKeys.has(share.lineKey)) return { shares: null, error: 'line-unknown', lineKey: share.lineKey };
      }
    }
  }
  return { shares, error: null };
}

/* ------------------------------------------------------------ normalizers */

export function normalizeEvSettings(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const key = EV_SETTING_KEYS;
  const intIn = (value, [min, max], fallback) => {
    const n = Number(value);
    return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
  };
  return {
    [key.staleDays]: intIn(source[key.staleDays], EV_BOUNDS.staleDays, EV_DEFAULTS.staleDays),
    [key.cpiFloorPpm]: intIn(source[key.cpiFloorPpm], EV_BOUNDS.cpiFloorPpm, EV_DEFAULTS.cpiFloorPpm),
    [key.autoPropagate]: source[key.autoPropagate] === undefined ? EV_DEFAULTS.autoPropagate : Boolean(source[key.autoPropagate]),
  };
}

/** The same conventions, read out by their short names for every consumer. */
export function readEvSettings({ settings = null } = {}) {
  const raw = normalizeEvSettings(settings || {});
  return {
    staleDays: raw[EV_SETTING_KEYS.staleDays],
    cpiFloorPpm: raw[EV_SETTING_KEYS.cpiFloorPpm],
    autoPropagate: raw[EV_SETTING_KEYS.autoPropagate],
  };
}

export function evAskSummary(signature) {
  return `Earned value: ${String(signature || '').trim()}`;
}

export function parseEvAskSummary(summary) {
  if (typeof summary !== 'string') return null;
  const trimmed = summary.trim();
  const prefix = 'Earned value: ';
  if (!trimmed.startsWith(prefix)) return null;
  const candidate = trimmed.slice(prefix.length).trim();
  return /^ev1:[0-9a-f]{16}$/.test(candidate) ? { signature: candidate } : null;
}

/** A stored case row, or null. */
export function normalizeEvCase(raw = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const id = evText(raw.id, 80);
  const label = evText(raw.label, L.labelMax);
  const currency = evCurrency(raw.currency);
  const methodKey = EV_METHOD_KEYS.includes(raw.methodKey) ? raw.methodKey : null;
  const ownerId = evPersonId(raw.ownerId);
  const status = raw.status === 'withdrawn' ? 'withdrawn' : 'open';
  const declaredOn = evDay(raw.declaredOn);
  if (!id || label.length < L.labelMin || !currency || !methodKey || !ownerId || !declaredOn) return null;
  const baselineVersion = Number.isSafeInteger(raw.baselineVersion) && raw.baselineVersion >= 0 ? raw.baselineVersion : 0;
  return {
    id,
    label,
    currency,
    methodKey,
    ownerId,
    note: evText(raw.note, L.noteMax),
    source: evText(raw.source, L.sourceMax),
    status,
    withdrawnOn: status === 'withdrawn' ? evDay(raw.withdrawnOn) : null,
    withdrawnReason: status === 'withdrawn' ? evText(raw.withdrawnReason, L.reasonMax) : '',
    declaredOn,
    declaredById: evPersonId(raw.declaredById),
    baselineVersion,
  };
}

export function normalizeEvCases(raw, warnings = []) {
  const out = [];
  if (!Array.isArray(raw)) return out;
  for (const row of raw) {
    const loaded = normalizeEvCase(row);
    if (loaded) out.push(loaded);
    else warnings.push('A stored earned-value case row could not be read exactly and was dropped.');
  }
  return out.slice(0, L.cases);
}

/** A stored package row, or null (with a reason when the failure is structural). */
export function normalizeEvPackage(raw = {}, caseRow, warnings = []) {
  if (!raw || typeof raw !== 'object' || !caseRow) return null;
  const id = evText(raw.id, 80);
  const caseId = evText(raw.caseId, 80);
  if (caseId !== caseRow.id) return null;
  const code = normalizeEvCode(raw.code);
  const name = evText(raw.name, L.labelMax);
  const plannedCents = readStoredEvCents(raw.plannedCents, { signed: false });
  const plannedStart = evDay(raw.plannedStart);
  const plannedFinish = evDay(raw.plannedFinish);
  const status = raw.status === 'superseded' ? 'superseded' : 'live';
  if (!id || !code || name.length < 3 || !plannedCents || plannedCents <= 0 || !plannedStart || !plannedFinish) {
    warnings.push('A stored work package row was dropped: unreadable code, budget or dates.');
    return null;
  }
  if (plannedFinish < plannedStart) {
    warnings.push(`A stored work package (${code}) ends before it starts and was dropped.`);
    return null;
  }
  // Increments are re-proved: they must sum to the package budget to the cent.
  const phasesRaw = Array.isArray(raw.phases) ? raw.phases : [];
  const phases = [];
  let phaseTotal = 0;
  for (const phase of phasesRaw) {
    const phaseEnd = evDay(phase?.phaseEnd);
    const cents = readStoredEvCents(phase?.cents, { signed: false });
    if (!phaseEnd || !cents || cents <= 0) {
      warnings.push(`A stored increment of package ${code} was dropped: unreadable date or amount.`);
      continue;
    }
    phases.push({ phaseEnd, cents });
    phaseTotal += cents;
  }
  if (!phases.length) {
    warnings.push(`A stored work package (${code}) carried no readable increment and was dropped.`);
    return null;
  }
  if (phaseTotal !== plannedCents) {
    warnings.push(`A stored work package (${code}) increments sum to ${phaseTotal} cents against a budget of ${plannedCents}; the row was dropped.`);
    return null;
  }
  phases.sort((a, b) => (a.phaseEnd < b.phaseEnd ? -1 : a.phaseEnd > b.phaseEnd ? 1 : 0));
  // Line shares are re-proved: sum must be exactly 100 or the split is refused wholesale.
  let lineShares = [];
  const sharesRaw = Array.isArray(raw.lineShares) ? raw.lineShares : [];
  if (sharesRaw.length) {
    const seen = new Map();
    let bad = false;
    let total = 0;
    for (const share of sharesRaw) {
      const lineKey = evText(share?.lineKey, 80);
      const pct = Number(share?.pct);
      if (!lineKey || !Number.isInteger(pct) || pct < 0 || pct > 100 || seen.has(lineKey)) { bad = true; break; }
      seen.set(lineKey, pct);
      total += pct;
    }
    if (bad || total !== 100) {
      warnings.push(`A stored work package (${code}) carried a line split that does not sum to exactly 100; the split was refused wholesale and the package now carries NO line attribution.`);
      lineShares = [];
    } else {
      lineShares = [...seen.entries()].map(([lineKey, pct]) => ({ lineKey, pct }))
        .sort((a, b) => (a.lineKey < b.lineKey ? -1 : 1));
    }
  }
  const validFrom = Number.isSafeInteger(raw.validFrom) && raw.validFrom >= 1 ? raw.validFrom : 1;
  return {
    id,
    caseId,
    code,
    name,
    plannedCents,
    plannedStart,
    plannedFinish,
    phases,
    lineShares,
    status,
    supersededOn: status === 'superseded' ? evDay(raw.supersededOn) : null,
    supersededReason: status === 'superseded' ? evText(raw.supersededReason, L.reasonMax) : '',
    validFrom,
    note: evText(raw.note, L.noteMax),
  };
}

export function normalizeEvPackages(raw, cases, warnings = []) {
  const out = [];
  if (!Array.isArray(raw)) return out;
  const byCase = new Map(cases.map((row) => [row.id, row]));
  const seenCodes = new Map(); // caseId → Set of codes (live rows only)
  for (const row of raw) {
    const caseId = evText(row?.caseId, 80);
    const caseRow = byCase.get(caseId) || null;
    const loaded = normalizeEvPackage(row, caseRow, warnings);
    if (!loaded) continue;
    if (loaded.status === 'live') {
      const seen = seenCodes.get(loaded.caseId) || new Set();
      const key = loaded.code;
      if (seen.has(key)) {
        warnings.push(`Two live work packages of one case carry the code ${loaded.code}; the second was dropped.`);
        continue;
      }
      seen.add(key);
      seenCodes.set(loaded.caseId, seen);
    }
    out.push(loaded);
  }
  return out.slice(0, L.packages);
}

export function normalizeEvReading(raw = {}, caseRow, packages, warnings = []) {
  if (!raw || typeof raw !== 'object' || !caseRow) return null;
  const id = evText(raw.id, 80);
  const caseId = evText(raw.caseId, 80);
  if (caseId !== caseRow.id) return null;
  const cutoffDay = evDay(raw.cutoffDay);
  const methodKey = EV_METHOD_KEYS.includes(raw.methodKey) ? raw.methodKey : caseRow.methodKey;
  const method = evMethodByKey(methodKey);
  const evidenceNote = evText(raw.evidenceNote, L.evidenceMax);
  const decidedOn = evDay(raw.decidedOn) || cutoffDay;
  const declaredById = evPersonId(raw.declaredById);
  const status = raw.withdrawnOn ? 'withdrawn' : 'live';
  if (!id || !cutoffDay || evidenceNote.length < L.evidenceMin) {
    warnings.push('A stored earned-value reading was dropped: unreadable date or missing evidence note.');
    return null;
  }
  const knownPackages = new Map(packages.filter((pkg) => pkg.caseId === caseId).map((pkg) => [pkg.id, pkg]));
  const shares = [];
  const seen = new Set();
  const sharesRaw = Array.isArray(raw.shares) ? raw.shares : [];
  for (const share of sharesRaw) {
    const packageId = evText(share?.packageId, 80);
    const pct = Number(share?.sharePct);
    if (!packageId || !Number.isInteger(pct) || pct < 0 || pct > 100) {
      warnings.push('A stored earned-value share was dropped: unreadable package or percent.');
      continue;
    }
    const pkg = knownPackages.get(packageId);
    if (!pkg) {
      warnings.push('A stored earned-value share names a package this record does not hold and was dropped.');
      continue;
    }
    if (method.admits && !method.admits.includes(pct)) {
      warnings.push(`A stored earned-value share of ${pct} is not admitted by the case’s method and was dropped.`);
      continue;
    }
    if (seen.has(packageId)) {
      warnings.push('A stored earned-value reading carried two shares for one package; the duplicate was dropped.');
      continue;
    }
    seen.add(packageId);
    shares.push({ packageId, sharePct: pct });
  }
  const baselineSignature = evText(raw.baselineSignature, 40);
  return {
    id,
    caseId,
    cutoffDay,
    methodKey,
    shares,
    evidenceNote,
    declaredById,
    decidedOn,
    baselineSignature: baselineSignature.startsWith('evbl:') ? baselineSignature : '',
    status,
    withdrawnOn: status === 'withdrawn' ? evDay(raw.withdrawnOn) : null,
    withdrawnReason: status === 'withdrawn' ? evText(raw.withdrawnReason, L.reasonMax) : '',
  };
}

export function normalizeEvReadings(raw, cases, packages, warnings = []) {
  const out = [];
  if (!Array.isArray(raw)) return out;
  const byCase = new Map(cases.map((row) => [row.id, row]));
  for (const row of raw) {
    const caseRow = byCase.get(evText(row?.caseId, 80)) || null;
    const loaded = normalizeEvReading(row, caseRow, packages, warnings);
    if (loaded) out.push(loaded);
  }
  return out.slice(0, L.readings);
}

export function normalizeEvActual(raw = {}, caseRow, packages, warnings = []) {
  if (!raw || typeof raw !== 'object' || !caseRow) return null;
  const id = evText(raw.id, 80);
  const caseId = evText(raw.caseId, 80);
  if (caseId !== caseRow.id) return null;
  const amountCents = readStoredEvCents(raw.amountCents, { signed: false });
  const date = evDay(raw.date);
  const packageId = raw.packageId ? evText(raw.packageId, 80) : null;
  if (!id || !amountCents || amountCents <= 0 || !date) {
    warnings.push('A stored earned-value actual was dropped: unreadable amount or date.');
    return null;
  }
  if (packageId && !packages.some((pkg) => pkg.caseId === caseId && pkg.id === packageId)) {
    warnings.push('A stored earned-value actual names a package this record does not hold and was dropped.');
    return null;
  }
  const status = raw.withdrawnOn ? 'withdrawn' : 'live';
  return {
    id,
    caseId,
    packageId,
    date,
    amountCents,
    note: evText(raw.note, L.noteMax),
    source: evText(raw.source, L.sourceMax),
    declaredById: evPersonId(raw.declaredById),
    status,
    withdrawnOn: status === 'withdrawn' ? evDay(raw.withdrawnOn) : null,
    withdrawnReason: status === 'withdrawn' ? evText(raw.withdrawnReason, L.reasonMax) : '',
  };
}

export function normalizeEvActuals(raw, cases, packages, warnings = []) {
  const out = [];
  if (!Array.isArray(raw)) return out;
  const byCase = new Map(cases.map((row) => [row.id, row]));
  for (const row of raw) {
    const caseRow = byCase.get(evText(row?.caseId, 80)) || null;
    const loaded = normalizeEvActual(row, caseRow, packages, warnings);
    if (loaded) out.push(loaded);
  }
  return out.slice(0, L.actuals);
}

export function normalizeEvMarkers(raw, warnings = []) {
  const out = [];
  if (!Array.isArray(raw)) return out;
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const key = evText(row.key, 160);
    if (!key) { warnings.push('A stored earned-value marker was dropped: no key.'); continue; }
    out.push({
      key,
      at: typeof row.at === 'string' ? row.at.slice(0, 40) : '',
      ruleId: evText(row.ruleId, 40),
      kind: evText(row.kind, 40),
      detail: evText(row.detail, 300),
    });
  }
  return out.slice(-L.markers);
}

