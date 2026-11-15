/**
 * app/core/domain/flexBudgetSchema.js — fail-closed readers for the
 * Flexible-Budget Variance Statement (ADR-0213, Schema v167).
 *
 * TWO READINGS, NEVER CONFUSED. A TYPED value (what a person entered in a
 * dialog: "1200.5", "650.00") is parsed by `parseFlexDecimal`, which accepts
 * digits and one decimal point and nothing else — no sign, no thousands
 * separator, no exponent — and refuses rather than rounds. A STORED value is a
 * scaled safe integer and is read back as exactly that integer or not at all.
 * The Capital Rationing suite was extended for the defect of re-scaling a stored
 * amount on load; these readers keep the two paths in separate functions for the
 * same reason.
 *
 * ONE SHAPE. Every optional field is stored explicitly as `null`, and an action
 * stores the row this loader returns — never the object it built by hand — so a
 * record is byte-identical before and after a reload. (Session 285 stopped on
 * exactly that difference: a hand-built row without the retirement fields a
 * loader then added.)
 *
 * A row that cannot be read exactly is DROPPED with a counted warning. No
 * standard, quantity, price or cost is ever repaired, clamped or defaulted: a
 * standard nobody declared would print a variance against a fiction.
 */

import {
  FLEX_BUDGET_BOUNDS,
  FLEX_BUDGET_DEFAULTS,
  FLEX_BUDGET_LIMITS,
  FLEX_BUDGET_SETTING_KEYS,
  FLEX_LINE_BEHAVIOUR_KEYS,
} from './flexBudgetRegistry.js';

const L = FLEX_BUDGET_LIMITS;
const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const LINE_KEY_RE = /^L([1-9]\d?)$/;
const POOL_RE = /^[a-z0-9][a-z0-9-]{0,23}$/;
const DAY_MS = 86400000;
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value, max = 400) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const id = (value) => { const c = typeof value === 'string' ? value.trim() : ''; return ID_RE.test(c) ? c : null; };
const optionalId = (value) => (value === null || value === undefined || value === '' ? null : id(value));

export function flexDay(value) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!DAY_RE.test(candidate)) return null;
  const date = new Date(`${candidate}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === candidate ? candidate : null;
}

export function flexDaysBetween(from, to) {
  if (!flexDay(from) || !flexDay(to)) return null;
  return Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / DAY_MS);
}

export function flexAddDays(day, n) {
  if (!flexDay(day) || !Number.isInteger(n)) return null;
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

function stamp(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export function flexCurrency(value) {
  const candidate = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return CURRENCY_RE.test(candidate) ? candidate : null;
}

export function flexReason(value) {
  const candidate = text(value, L.reasonMax);
  return candidate.length >= L.reasonMin ? candidate : null;
}

export function flexTitle(value) {
  const candidate = text(value, L.titleMax);
  return candidate.length >= L.titleMin ? candidate : null;
}

export function flexPool(value) {
  if (value === null || value === undefined || value === '') return null;
  const candidate = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return POOL_RE.test(candidate) ? candidate : undefined; // undefined = typed but unreadable
}

/**
 * A TYPED decimal → a scaled safe integer, or `null`. Digits and at most one
 * point with at most `digits` decimals. Refused, never rounded: `1.2345` at two
 * decimals is not `1.23`.
 */
export function parseFlexDecimal(value, digits) {
  let raw;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return null;
    raw = String(value);
  } else if (typeof value === 'string') {
    raw = value.trim();
  } else {
    return null;
  }
  const match = new RegExp(`^(\\d{1,15})(?:\\.(\\d{1,${digits}}))?$`).exec(raw);
  if (!match) return null;
  const scaled = BigInt(match[1]) * (10n ** BigInt(digits)) + BigInt((match[2] || '').padEnd(digits, '0') || '0');
  return scaled <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(scaled) : null;
}
export const parseFlexMoney = (value) => { const n = parseFlexDecimal(value, 2); return n !== null && n <= L.maxCents ? n : null; };
export const parseFlexQuantity = (value) => { const n = parseFlexDecimal(value, 3); return n !== null && n <= L.maxQtyE3 ? n : null; };
export const parseFlexPrice = (value) => { const n = parseFlexDecimal(value, 4); return n !== null && n <= L.maxPriceE4 ? n : null; };

/** A STORED scaled integer, read exactly or not at all. Never re-scaled. */
function stored(value, max, { positive = false } = {}) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) return null;
  if (value < 0 || value > max) return null;
  if (positive && value === 0) return null;
  return value;
}

/** Scaled integer → the decimal text it was typed as (trailing zeros trimmed past `keep`). */
export function flexDecimalText(scaled, digits, keep = 0) {
  if (typeof scaled !== 'number' || !Number.isSafeInteger(scaled)) return '';
  const negative = scaled < 0;
  const raw = String(Math.abs(scaled)).padStart(digits + 1, '0');
  const whole = raw.slice(0, raw.length - digits);
  let fraction = raw.slice(raw.length - digits);
  while (fraction.length > keep && fraction.endsWith('0')) fraction = fraction.slice(0, -1);
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

/* ----------------------------------------------------------------- settings */

export function normalizeFlexBudgetSettings(raw = {}) {
  const src = isPlainObject(raw) ? raw : {};
  const key = FLEX_BUDGET_SETTING_KEYS.actualsDueDays;
  const [min, max] = FLEX_BUDGET_BOUNDS.actualsDueDays;
  const n = Math.round(Number(src[key]));
  const usable = src[key] !== null && src[key] !== undefined && src[key] !== '' && Number.isFinite(n);
  return { [key]: usable ? Math.min(max, Math.max(min, n)) : FLEX_BUDGET_DEFAULTS.actualsDueDays };
}

/* -------------------------------------------------------------- typed lines */

const OWNER_TOKEN_RE = /^(rate|usage)\s*=\s*(\S+)$/i;

/** One plan line in the text grammar → a typed object, or an error sentence. */
function parsePlanLineText(raw) {
  const parts = raw.split(';').map((part) => part.trim());
  const behaviour = (parts[0] || '').toLowerCase();
  if (!FLEX_LINE_BEHAVIOUR_KEYS.includes(behaviour)) return { ok: false, error: `starts with “${parts[0] || ''}” — start it with “variable” or “fixed”` };
  const out = { behaviour, label: parts[1] || '', rateOwnerId: null, usageOwnerId: null, pool: null };
  let rest;
  if (behaviour === 'variable') {
    const quantity = /^(\S+)\s+(.+)$/.exec(parts[2] || '');
    if (!quantity) return { ok: false, error: 'needs a budgeted quantity and its unit as the third field, e.g. “1200 h”' };
    out.qty = quantity[1];
    out.unit = quantity[2];
    out.price = parts[3] || '';
    rest = parts.slice(4);
  } else {
    out.budget = parts[2] || '';
    rest = parts.slice(3);
  }
  for (const token of rest) {
    if (!token) continue;
    const owner = OWNER_TOKEN_RE.exec(token);
    if (owner) { out[owner[1].toLowerCase() === 'rate' ? 'rateOwnerId' : 'usageOwnerId'] = owner[2]; continue; }
    if (behaviour === 'variable' && out.pool === null) { out.pool = token; continue; }
    return { ok: false, error: `carries a field this register cannot read (“${token}”)` };
  }
  return { ok: true, line: out };
}

/**
 * TYPED plan lines → stored lines. Accepts the text grammar (one line per row)
 * or a list of typed objects. Returns `{ ok, lines }` or `{ ok: false, error }`
 * naming the row. Owner ids are returned as typed; the ACTION proves them.
 */
export function readTypedFlexPlanLines(input) {
  let rows;
  if (typeof input === 'string') {
    rows = [];
    const typed = input.split('\n').map((row) => row.trim()).filter(Boolean);
    for (let index = 0; index < typed.length; index += 1) {
      const read = parsePlanLineText(typed[index]);
      if (!read.ok) return { ok: false, error: `Line ${index + 1} ${read.error}.` };
      rows.push(read.line);
    }
  } else if (Array.isArray(input)) {
    rows = input;
  } else {
    return { ok: false, error: 'State the plan lines one per row, or as a list.' };
  }
  if (!rows.length) return { ok: false, error: 'A standard needs at least one line. A plan with no line has nothing to compare.' };
  if (rows.length > L.linesPerPlan) return { ok: false, error: `A plan carries at most ${L.linesPerPlan} lines; this one has ${rows.length}. Split the cost object.` };
  const lines = [];
  const labels = new Set();
  const poolUnits = new Map();
  for (let index = 0; index < rows.length; index += 1) {
    const row = isPlainObject(rows[index]) ? rows[index] : null;
    const where = `Line ${index + 1}`;
    if (!row) return { ok: false, error: `${where} is not a readable line.` };
    const behaviour = FLEX_LINE_BEHAVIOUR_KEYS.includes(row.behaviour) ? row.behaviour : null;
    if (!behaviour) return { ok: false, error: `${where} must be “variable” or “fixed”.` };
    const label = text(row.label, L.labelMax);
    if (label.length < 2) return { ok: false, error: `${where} needs a label of at least two characters.` };
    if (labels.has(label.toLowerCase())) return { ok: false, error: `${where} repeats the label “${label}”. Two lines with one name cannot be told apart when actuals are recorded.` };
    labels.add(label.toLowerCase());
    const line = {
      key: `L${index + 1}`, label, behaviour,
      unit: null, qtyE3: null, priceE4: null, budgetCents: null, pool: null,
      rateOwnerId: null, usageOwnerId: null,
    };
    if (behaviour === 'variable') {
      const unit = text(row.unit, L.unitMax);
      if (!unit) return { ok: false, error: `${where} needs the unit its quantity is measured in (h, day, kg, seat).` };
      const qty = parseFlexQuantity(row.qty);
      if (qty === null || qty === 0) return { ok: false, error: `${where}: state the budgeted quantity as a positive number with at most three decimals (1200, 37.5). No separator, no exponent; nothing is rounded.` };
      const price = parseFlexPrice(row.price);
      if (price === null || price === 0) return { ok: false, error: `${where}: state the standard price per ${unit} as a positive number with at most four decimals (650, 0.0425).` };
      const pool = flexPool(row.pool);
      if (pool === undefined) return { ok: false, error: `${where}: a pool name is lower-case letters, digits and hyphens, at most ${L.poolMax} characters (labour, cloud-compute).` };
      if (pool) {
        if (poolUnits.has(pool) && poolUnits.get(pool) !== unit) {
          return { ok: false, error: `${where}: pool “${pool}” already holds lines measured in “${poolUnits.get(pool)}”. A pool is substitutable inputs measured in ONE unit — hours cannot stand in for kilograms.` };
        }
        poolUnits.set(pool, unit);
      }
      Object.assign(line, { unit, qtyE3: qty, priceE4: price, pool });
      line.rateOwnerId = row.rateOwnerId ? String(row.rateOwnerId).trim() : null;
    } else {
      const budget = parseFlexMoney(row.budget);
      if (budget === null) return { ok: false, error: `${where}: state the lump for the period as an amount with at most two decimals (180000, 1500.50).` };
      if (row.pool) return { ok: false, error: `${where}: a fixed lump cannot join a pool. Mix and yield exist only between substitutable quantities.` };
      if (row.rateOwnerId) return { ok: false, error: `${where}: a fixed lump has no rate. Name who answers for its spending with “usage=”.` };
      line.budgetCents = budget;
    }
    line.usageOwnerId = row.usageOwnerId ? String(row.usageOwnerId).trim() : null;
    lines.push(line);
  }
  return { ok: true, lines };
}

/**
 * TYPED actual lines → stored rows, checked against the plan they are for.
 * Text grammar: `L1; <quantity>; <cost>` for a variable line, `L4; <cost>` for a
 * fixed one, `unplanned; <label>; <cost>` for cost with no plan line.
 */
export function readTypedFlexActualLines(input, plan, unplannedInput = null) {
  let rows = [];
  let extras = [];
  if (typeof input === 'string') {
    const typed = input.split('\n').map((row) => row.trim()).filter(Boolean);
    for (let index = 0; index < typed.length; index += 1) {
      const parts = typed[index].split(';').map((part) => part.trim());
      const head = parts[0] || '';
      if (head.toLowerCase() === 'unplanned') {
        if (parts.length !== 3) return { ok: false, error: `Row ${index + 1}: an unplanned cost is typed as “unplanned; label; cost”.` };
        extras.push({ label: parts[1], cost: parts[2] });
        continue;
      }
      const key = head.split(/\s/)[0].toUpperCase();
      const line = plan.lines.find((row) => row.key === key);
      if (!line) return { ok: false, error: `Row ${index + 1} names “${head}”, which is not a line of this plan. Start each row with its line code (L1, L2 …).` };
      if (line.behaviour === 'variable') {
        if (parts.length !== 3) return { ok: false, error: `Row ${index + 1} (${line.label}): a variable line is typed as “${line.key}; quantity; cost”.` };
        rows.push({ key, qty: parts[1], cost: parts[2] });
      } else {
        if (parts.length !== 2) return { ok: false, error: `Row ${index + 1} (${line.label}): a fixed line is typed as “${line.key}; cost”.` };
        rows.push({ key, cost: parts[1] });
      }
    }
  } else if (Array.isArray(input)) {
    rows = input;
    extras = Array.isArray(unplannedInput) ? unplannedInput : [];
  } else {
    return { ok: false, error: 'State the actuals one line per row, or as a list.' };
  }
  const byKey = new Map();
  for (const row of rows) {
    const key = isPlainObject(row) && typeof row.key === 'string' ? row.key.trim().toUpperCase() : '';
    if (!plan.lines.some((line) => line.key === key)) return { ok: false, error: `“${key || '?'}” is not a line of this plan.` };
    if (byKey.has(key)) return { ok: false, error: `Line ${key} is recorded twice. One line, one row.` };
    byKey.set(key, row);
  }
  const lines = [];
  for (const line of plan.lines) {
    const row = byKey.get(line.key);
    if (!row) {
      return { ok: false, error: `Line ${line.key} (${line.label}) has no actual. Every line of the plan is recorded or nothing is: a line left out would print as a favourable variance nobody earned.` };
    }
    const cents = parseFlexMoney(row.cost);
    if (cents === null) return { ok: false, error: `Line ${line.key} (${line.label}): state the cost recorded as an amount with at most two decimals. Zero is typed as 0.` };
    let qtyE3 = null;
    if (line.behaviour === 'variable') {
      qtyE3 = parseFlexQuantity(row.qty);
      if (qtyE3 === null) return { ok: false, error: `Line ${line.key} (${line.label}): state the quantity consumed in ${line.unit} with at most three decimals. Zero is typed as 0.` };
    }
    lines.push({ key: line.key, qtyE3, cents });
  }
  if (extras.length > L.unplannedPerActual) return { ok: false, error: `A recording carries at most ${L.unplannedPerActual} unplanned rows. Sum the rest into one row and say so in the source.` };
  const unplanned = [];
  for (let index = 0; index < extras.length; index += 1) {
    const row = isPlainObject(extras[index]) ? extras[index] : {};
    const label = text(row.label, L.labelMax);
    if (label.length < 2) return { ok: false, error: `Unplanned row ${index + 1} needs a label of at least two characters.` };
    const cents = parseFlexMoney(row.cost);
    if (cents === null || cents === 0) return { ok: false, error: `Unplanned row ${index + 1} (${label}): state the cost as a positive amount with at most two decimals.` };
    unplanned.push({ key: `U${index + 1}`, label, cents });
  }
  return { ok: true, lines, unplanned };
}

/* -------------------------------------------------------------------- plans */

function readStoredPlanLines(value) {
  if (!Array.isArray(value) || !value.length || value.length > L.linesPerPlan) return null;
  const out = [];
  const labels = new Set();
  const poolUnits = new Map();
  for (let index = 0; index < value.length; index += 1) {
    const row = isPlainObject(value[index]) ? value[index] : null;
    if (!row) return null;
    const match = LINE_KEY_RE.exec(typeof row.key === 'string' ? row.key : '');
    if (!match || Number(match[1]) !== index + 1) return null;
    const behaviour = FLEX_LINE_BEHAVIOUR_KEYS.includes(row.behaviour) ? row.behaviour : null;
    const label = text(row.label, L.labelMax);
    if (!behaviour || label.length < 2 || labels.has(label.toLowerCase())) return null;
    labels.add(label.toLowerCase());
    const usageOwnerId = optionalId(row.usageOwnerId);
    if (row.usageOwnerId && !usageOwnerId) return null;
    if (behaviour === 'variable') {
      const unit = text(row.unit, L.unitMax);
      const qtyE3 = stored(row.qtyE3, L.maxQtyE3, { positive: true });
      const priceE4 = stored(row.priceE4, L.maxPriceE4, { positive: true });
      const pool = flexPool(row.pool);
      const rateOwnerId = optionalId(row.rateOwnerId);
      if (!unit || qtyE3 === null || priceE4 === null || pool === undefined || (row.rateOwnerId && !rateOwnerId)) return null;
      if (row.budgetCents !== null && row.budgetCents !== undefined) return null;
      if (pool) {
        if (poolUnits.has(pool) && poolUnits.get(pool) !== unit) return null;
        poolUnits.set(pool, unit);
      }
      out.push({ key: row.key, label, behaviour, unit, qtyE3, priceE4, budgetCents: null, pool, rateOwnerId, usageOwnerId });
    } else {
      const budgetCents = stored(row.budgetCents, L.maxCents);
      if (budgetCents === null) return null;
      if ((row.qtyE3 !== null && row.qtyE3 !== undefined) || (row.priceE4 !== null && row.priceE4 !== undefined) || row.pool || row.rateOwnerId) return null;
      out.push({ key: row.key, label, behaviour, unit: null, qtyE3: null, priceE4: null, budgetCents, pool: null, rateOwnerId: null, usageOwnerId });
    }
  }
  return out;
}

export function normalizeFlexBudgetPlans(value, warnings = []) {
  if (!Array.isArray(value)) {
    if (value !== undefined && value !== null) warnings.push('Flexible-budget variance: the plan ledger was not an array; it was read as empty.');
    return [];
  }
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const raw of value) {
    if (out.length >= L.plans) { dropped += 1; continue; }
    const row = isPlainObject(raw) ? raw : null;
    const planId = row && id(row.id);
    const title = row && flexTitle(row.title);
    const ownerId = row && id(row.ownerId);
    const currency = row && flexCurrency(row.currency);
    const periodFrom = row && flexDay(row.periodFrom);
    const periodTo = row && flexDay(row.periodTo);
    const span = periodFrom && periodTo ? flexDaysBetween(periodFrom, periodTo) : null;
    const driverLabel = row ? text(row.driverLabel, L.driverMax) : '';
    const volumeE3 = row ? stored(row.volumeE3, L.maxQtyE3, { positive: true }) : null;
    const materialityBp = row && Number.isInteger(row.materialityBp) && row.materialityBp >= 0 && row.materialityBp <= L.maxMaterialityBp ? row.materialityBp : null;
    const materialityCents = row ? stored(row.materialityCents, L.maxCents) : null;
    const lines = row ? readStoredPlanLines(row.lines) : null;
    const basis = row && flexReason(row.basis);
    const declaredOn = row && flexDay(row.declaredOn);
    const declaredAt = row && stamp(row.declaredAt);
    const declaredById = row && id(row.declaredById);
    const owners = row ? ['volumeOwnerId', 'rateOwnerId', 'usageOwnerId'].map((key) => [key, optionalId(row[key]), Boolean(row[key])]) : [];
    const ownersReadable = owners.every(([, parsed, typed]) => !typed || parsed);
    const retiredOn = row && row.retiredOn ? flexDay(row.retiredOn) : null;
    const retirementReadable = !row || !row.retiredOn || Boolean(retiredOn && id(row.retiredById) && flexReason(row.retireReason));
    const valid = Boolean(planId && !seen.has(planId) && title && ownerId && currency && periodFrom && periodTo
      && span !== null && span >= 0 && span <= L.periodMaxDays
      && driverLabel.length >= 2 && volumeE3 !== null && materialityBp !== null && materialityCents !== null
      && lines && basis && declaredOn && declaredAt && declaredById && ownersReadable && retirementReadable);
    if (!valid) { dropped += 1; continue; }
    seen.add(planId);
    out.push({
      id: planId, title, ownerId, currency, periodFrom, periodTo, driverLabel, volumeE3,
      materialityBp, materialityCents,
      volumeOwnerId: owners[0][1], rateOwnerId: owners[1][1], usageOwnerId: owners[2][1],
      lines, basis, declaredOn, declaredAt, declaredById,
      engineVersion: text(row.engineVersion, 60) || null,
      retiredOn, retiredById: retiredOn ? id(row.retiredById) : null, retireReason: retiredOn ? flexReason(row.retireReason) : null,
    });
  }
  if (dropped) warnings.push(`${dropped} flexible-budget plan row(s) could not be read exactly — an unreadable id, owner, currency, period, planned volume, materiality threshold, line, written basis or retirement, a period ending before it starts or running past ${L.periodMaxDays} days, or a duplicate id — and were dropped. No standard was invented or repaired in their place.`);
  out.sort((a, b) => a.declaredAt.localeCompare(b.declaredAt) || a.id.localeCompare(b.id));
  return out;
}

/* ------------------------------------------------------------------ actuals */

function readStoredActualLines(value, plan) {
  if (!Array.isArray(value) || value.length !== plan.lines.length) return null;
  const out = [];
  for (let index = 0; index < plan.lines.length; index += 1) {
    const line = plan.lines[index];
    const row = isPlainObject(value[index]) ? value[index] : null;
    if (!row || row.key !== line.key) return null;
    const cents = stored(row.cents, L.maxCents);
    if (cents === null) return null;
    if (line.behaviour === 'variable') {
      const qtyE3 = stored(row.qtyE3, L.maxQtyE3);
      if (qtyE3 === null) return null;
      out.push({ key: line.key, qtyE3, cents });
    } else {
      if (row.qtyE3 !== null && row.qtyE3 !== undefined) return null;
      out.push({ key: line.key, qtyE3: null, cents });
    }
  }
  return out;
}

function readStoredUnplanned(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > L.unplannedPerActual) return null;
  const out = [];
  for (let index = 0; index < value.length; index += 1) {
    const row = isPlainObject(value[index]) ? value[index] : null;
    const label = row ? text(row.label, L.labelMax) : '';
    const cents = row ? stored(row.cents, L.maxCents, { positive: true }) : null;
    if (!row || row.key !== `U${index + 1}` || label.length < 2 || cents === null) return null;
    out.push({ key: row.key, label, cents });
  }
  return out;
}

/**
 * Recordings are admitted only through a plan that survived its own reading, so
 * an orphaned row cannot resurrect a statement. A recording whose lines are not
 * EXACTLY the plan's lines is dropped whole — never padded with zeros.
 */
export function normalizeFlexBudgetActuals(value, plans = [], warnings = []) {
  if (!Array.isArray(value)) {
    if (value !== undefined && value !== null) warnings.push('Flexible-budget variance: the actuals ledger was not an array; it was read as empty.');
    return [];
  }
  const planById = new Map((Array.isArray(plans) ? plans : []).map((plan) => [plan.id, plan]));
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const raw of value) {
    if (out.length >= L.actuals) { dropped += 1; continue; }
    const row = isPlainObject(raw) ? raw : null;
    const actualId = row && id(row.id);
    const plan = row ? planById.get(id(row.planId)) || null : null;
    const asOf = row && flexDay(row.asOf);
    const volumeE3 = row ? stored(row.volumeE3, L.maxQtyE3) : null;
    const lines = row && plan ? readStoredActualLines(row.lines, plan) : null;
    const unplanned = row ? readStoredUnplanned(row.unplanned) : null;
    const basis = row && flexReason(row.basis);
    const recordedOn = row && flexDay(row.recordedOn);
    const recordedAt = row && stamp(row.recordedAt);
    const recordedById = row && id(row.recordedById);
    const withdrawnOn = row && row.withdrawnOn ? flexDay(row.withdrawnOn) : null;
    const withdrawalReadable = !row || !row.withdrawnOn || Boolean(withdrawnOn && id(row.withdrawnById) && flexReason(row.withdrawReason));
    const valid = Boolean(actualId && !seen.has(actualId) && plan && asOf
      && asOf >= plan.periodFrom && asOf <= plan.periodTo
      && volumeE3 !== null && lines && unplanned && basis && recordedOn && recordedAt && recordedById && withdrawalReadable);
    if (!valid) { dropped += 1; continue; }
    seen.add(actualId);
    out.push({
      id: actualId, planId: plan.id, asOf, volumeE3, lines, unplanned, basis,
      recordedOn, recordedAt, recordedById,
      withdrawnOn, withdrawnById: withdrawnOn ? id(row.withdrawnById) : null, withdrawReason: withdrawnOn ? flexReason(row.withdrawReason) : null,
    });
  }
  if (dropped) warnings.push(`${dropped} flexible-budget actuals row(s) could not be read exactly — a plan that is not on the record, a cut-off outside the plan’s period, lines that are not exactly the plan’s lines, an unreadable quantity, cost, source or withdrawal, or a duplicate id — and were dropped. No actual was padded, zero-filled or repaired.`);
  out.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt) || a.id.localeCompare(b.id));
  return out;
}
