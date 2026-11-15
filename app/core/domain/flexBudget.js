/**
 * app/core/domain/flexBudget.js — the reader of the Flexible-Budget Variance
 * Statement (ADR-0213, Session 286, Schema v167, CSV scope #155).
 *
 * ONE READER behind the panel, the brief, the CSV and the navigation badge, so
 * the four cannot disagree. Nothing derived is stored: every flexible budget,
 * every variance, every materiality verdict and every attribution is re-derived
 * on read from the declared standard and the recorded actuals by the exact
 * kernel in `flexBudgetMath.js`.
 *
 * WHAT THE READER ADDS TO THE KERNEL.
 *   1. The seat projection: a statement is shown to a seat that holds its
 *      budget holder (tree or declared line), or that the statement names as an
 *      owner of one of its variances. Everything else is a count.
 *   2. The life of a statement: no actuals / unreadable / interim / final, in
 *      that order, one state each.
 *   3. Materiality on the declared thresholds, tested on the exact figures.
 *   4. Attribution strictly by declaration — and the joint price × quantity
 *      term shared by name where the rate and the usage answer to two people.
 *   5. A roll-up per currency over FINAL statements only, re-added from the
 *      printed cents, with the same two claims kept apart.
 *
 * The returned report holds plain data only — no rational leaves this module —
 * so it can be serialised, compared and exported as it stands.
 *
 * Pure module: no DOM, no storage; the clock is the `now` argument.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { canAct } from './seat.js';
import {
  computeFlexStatement,
  direction,
  isMaterial,
  rAbs,
  rCmp,
  rIsInt,
  rRound,
  shareBp,
} from './flexBudgetMath.js';
import {
  FLEX_BRIDGE_STEPS,
  FLEX_BUDGET_CSV_COLUMNS,
  FLEX_BUDGET_ENGINE_VERSION,
  FLEX_BUDGET_FRAMEWORKS,
  FLEX_BUDGET_LIMITS,
  FLEX_BUDGET_METHOD,
  FLEX_BUDGET_REFUSALS,
  FLEX_BUDGET_RIGHTS,
  FLEX_BUDGET_SETTING_KEYS,
  FLEX_REACH_LABELS,
  FLEX_VARIANCE_CLASSES,
  flexStatementStateByKey,
} from './flexBudgetRegistry.js';
import {
  flexAddDays,
  flexDecimalText,
  normalizeFlexBudgetActuals,
  normalizeFlexBudgetPlans,
  normalizeFlexBudgetSettings,
} from './flexBudgetSchema.js';

const L = FLEX_BUDGET_LIMITS;
const REFUSAL_BY_KEY = Object.freeze(Object.fromEntries(FLEX_BUDGET_REFUSALS.map((row) => [row.key, row])));
const CAUSE_KEYS = Object.freeze(['price', 'joint', 'efficiency', 'spending', 'unplanned']);
const CLASS_KEYS = Object.freeze(['activity', ...CAUSE_KEYS]);
const MONEY_KEYS = Object.freeze(['static', 'activity', 'flex', 'price', 'joint', 'efficiency', 'mix', 'yield', 'spending', 'unplanned', 'actual', 'flexVariance', 'total']);

/* --------------------------------------------------------------- formatting */

/** Whole cents → `DKK 1,234.50`; a figure that cannot be claimed is a dash. */
export function flexMoney(currency, cents) {
  if (cents === null || cents === undefined || !Number.isSafeInteger(cents)) return '—';
  const negative = cents < 0;
  const a = Math.abs(cents);
  const whole = String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '−' : ''}${currency ? `${currency} ` : ''}${whole}.${String(a % 100).padStart(2, '0')}`;
}

/** A cost variance with its direction in words — never a bare sign. */
export function flexVarianceText(currency, cents) {
  if (cents === null || cents === undefined || !Number.isSafeInteger(cents)) return '—';
  if (cents === 0) return `${flexMoney(currency, 0)} (none)`;
  return `${flexMoney(currency, Math.abs(cents))} ${cents > 0 ? 'unfavourable' : 'favourable'}`;
}

/** Whole basis points → `12.34%` (signed); `null` is a dash. */
export function flexPercent(bp) {
  if (bp === null || bp === undefined || !Number.isInteger(bp)) return '—';
  const a = Math.abs(bp);
  return `${bp < 0 ? '−' : ''}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}%`;
}

/** Thousandths → `1,200.5`. */
export function flexQuantity(e3) {
  if (e3 === null || e3 === undefined || !Number.isSafeInteger(e3)) return '—';
  const raw = flexDecimalText(e3, 3);
  const [whole, fraction] = raw.split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction ? `.${fraction}` : ''}`;
}

/** Ten-thousandths of a currency unit → `650.00` / `0.0425`. */
export function flexPrice(e4) {
  if (e4 === null || e4 === undefined || !Number.isSafeInteger(e4)) return '—';
  const raw = flexDecimalText(e4, 4, 2);
  const [whole, fraction] = raw.split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction || '00'}`;
}

const dirWord = (cents) => (cents > 0 ? 'U' : cents < 0 ? 'F' : 'none');
const sumOrNull = (values) => {
  const present = values.filter((value) => value !== null && value !== undefined);
  if (!present.length) return null;
  const total = present.reduce((a, b) => a + b, 0);
  return Number.isSafeInteger(total) ? total : null;
};

/* ------------------------------------------------------------ seat plumbing */

function seatProjection(seat) {
  const operator = !seat || seat.fullAccess === true;
  const actorId = operator ? LEADER_ID : (seat.nodeId || seat.id || null);
  const may = (right) => operator || (Number.isInteger(seat?.rank) && canAct(right, seat).allow === true);
  const holds = (personId) => {
    if (operator) return 'operator';
    if (seat.scope instanceof Set && seat.scope.has(personId)) return 'tree';
    if (seat.lineScope instanceof Set && seat.lineScope.has(personId)) return 'line';
    return null;
  };
  return {
    operator,
    actorId,
    canDeclare: may(FLEX_BUDGET_RIGHTS.DECLARE),
    canRecord: may(FLEX_BUDGET_RIGHTS.RECORD),
    canGovern: may(FLEX_BUDGET_RIGHTS.GOVERN),
    holds,
  };
}

/** Every person a plan names as an owner of a variance (never the budget holder as such). */
export function flexPlanNamedOwners(plan) {
  const out = new Set();
  for (const key of ['volumeOwnerId', 'rateOwnerId', 'usageOwnerId']) if (plan[key]) out.add(plan[key]);
  for (const line of plan.lines) {
    if (line.rateOwnerId) out.add(line.rateOwnerId);
    if (line.usageOwnerId) out.add(line.usageOwnerId);
  }
  return out;
}

/** The live recording a plan is read from: the latest one not withdrawn. */
export function flexCurrentActual(actuals, planId) {
  let current = null;
  for (const row of actuals) {
    if (row.planId !== planId || row.withdrawnOn) continue;
    if (!current || row.recordedAt > current.recordedAt || (row.recordedAt === current.recordedAt && row.id > current.id)) current = row;
  }
  return current;
}

/* --------------------------------------------------------------- statements */

/** A declared owner for one role on one line: the line's own, else the plan's, else nobody. */
function declaredOwner(plan, line, role) {
  const key = `${role}OwnerId`;
  if (line && line[key]) return { id: line[key], source: 'line' };
  if (plan[key]) return { id: plan[key], source: 'plan' };
  return { id: null, source: null };
}

function buildStatement(plan, current, { today, dueDays, nameOf }) {
  const meta = (key) => flexStatementStateByKey(key);
  const base = {
    planId: plan.id,
    title: plan.title,
    ownerId: plan.ownerId,
    ownerName: nameOf(plan.ownerId),
    currency: plan.currency,
    periodFrom: plan.periodFrom,
    periodTo: plan.periodTo,
    period: `${plan.periodFrom} → ${plan.periodTo}`,
    driverLabel: plan.driverLabel,
    plannedVolumeE3: plan.volumeE3,
    materialityBp: plan.materialityBp,
    materialityCents: plan.materialityCents,
    basis: plan.basis,
    declaredOn: plan.declaredOn,
    declaredById: plan.declaredById,
    declaredByName: nameOf(plan.declaredById),
    owners: {
      volume: plan.volumeOwnerId ? { id: plan.volumeOwnerId, name: nameOf(plan.volumeOwnerId) } : null,
      rate: plan.rateOwnerId ? { id: plan.rateOwnerId, name: nameOf(plan.rateOwnerId) } : null,
      usage: plan.usageOwnerId ? { id: plan.usageOwnerId, name: nameOf(plan.usageOwnerId) } : null,
    },
    planLines: plan.lines.map((line) => ({ ...line })),
    periodEnded: today > plan.periodTo,
    finalDueOn: flexAddDays(plan.periodTo, dueDays),
    actualId: current ? current.id : null,
    asOf: current ? current.asOf : null,
    actualBasis: current ? current.basis : null,
    recordedOn: current ? current.recordedOn : null,
    recordedById: current ? current.recordedById : null,
    recordedByName: current ? nameOf(current.recordedById) : null,
  };
  const overdue = (stateKey) => stateKey !== 'final' && today > base.finalDueOn;

  if (!current) {
    return { ...base, stateKey: 'no-actuals', stateMeta: meta('no-actuals'), final: false, finalOverdue: overdue('no-actuals'), lines: [], pools: [], totals: null, exceptions: [], attribution: [], commentary: [], rounding: null, checks: [], balances: null, printedExact: null, attributionBalances: null, bridge: [], refusalKey: 'no-actuals' };
  }
  const final = current.asOf === plan.periodTo;
  const computed = computeFlexStatement(
    { volumeE3: plan.volumeE3, lines: plan.lines },
    { volumeE3: current.volumeE3, final, lines: current.lines, unplanned: current.unplanned },
  );
  if (!computed.ok) {
    return { ...base, stateKey: 'unreadable', stateMeta: meta('unreadable'), final: false, finalOverdue: overdue('unreadable'), lines: [], pools: [], totals: null, exceptions: [], attribution: [], commentary: [], rounding: null, checks: [], balances: null, printedExact: null, attributionBalances: null, bridge: [], refusalKey: 'unreadable-actuals', unreadableReason: computed.reason };
  }
  const stateKey = final ? 'final' : 'interim';
  const threshold = { floorCents: plan.materialityCents, bp: plan.materialityBp };
  const planLineByKey = new Map(plan.lines.map((line) => [line.key, line]));
  const actualLineByKey = new Map(current.lines.map((row) => [row.key, row]));
  const unplannedByKey = new Map(current.unplanned.map((row) => [row.key, row]));

  /* ---- rows ---- */
  const exceptions = [];
  const buckets = new Map();
  const credit = (bucketKey, descriptor, classKey, cents) => {
    if (cents === null || cents === undefined || cents === 0) return;
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, { key: bucketKey, ...descriptor, cents: Object.fromEntries(CLASS_KEYS.map((key) => [key, 0])), totalCents: 0 });
    const bucket = buckets.get(bucketKey);
    bucket.cents[classKey] += cents;
    bucket.totalCents += cents;
  };
  const personBucket = (personId) => [`person:${personId}`, { kind: 'person', ids: [personId], names: [nameOf(personId)] }];
  const sharedBucket = (a, b) => {
    const ids = [a, b].sort();
    return [`shared:${ids.join('+')}`, { kind: 'shared', ids, names: ids.map((personId) => nameOf(personId)) }];
  };
  const UNDECLARED = ['undeclared', { kind: 'undeclared', ids: [], names: [] }];
  let undeclaredCells = 0;
  let sharedCells = 0;
  let combinedSplitN = 0;
  let poolOfOneN = 0;
  let shareOfNothing = false;

  const lines = computed.lines.map((row) => {
    const planLine = planLineByKey.get(row.key) || null;
    const actualLine = actualLineByKey.get(row.key) || null;
    const extra = unplannedByKey.get(row.key) || null;
    const material = {};
    const dir = {};
    const share = {};
    for (const key of ['activity', 'price', 'joint', 'efficiency', 'mix', 'yield', 'spending', 'unplanned', 'flexVariance', 'total']) {
      const value = row.exact[key];
      if (value === null) { material[key] = null; dir[key] = null; share[key] = null; continue; }
      const against = key === 'activity' || key === 'total' ? row.exact.static : row.exact.flex;
      material[key] = isMaterial(value, against, threshold);
      dir[key] = direction(value);
      share[key] = shareBp(value, against);
      if (share[key] === null && row.kind !== 'unplanned' && dir[key] !== 'none') shareOfNothing = true;
    }
    const rate = row.kind === 'variable' ? declaredOwner(plan, planLine, 'rate') : { id: null, source: null };
    const usage = row.kind === 'unplanned' ? { id: null, source: null } : declaredOwner(plan, planLine, 'usage');
    const jointShared = row.kind === 'variable' && Boolean(rate.id && usage.id && rate.id !== usage.id);

    /* attribution: strictly by declaration */
    if (row.kind === 'variable') {
      if (row.split === 'combined') {
        // No quantity, no actual price: the whole conventional price variance
        // follows the joint rule, because it cannot be split.
        const target = !rate.id || !usage.id ? UNDECLARED : (rate.id === usage.id ? personBucket(rate.id) : sharedBucket(rate.id, usage.id));
        credit(...target, 'price', row.cents.price);
        if (!rate.id || !usage.id) { if (row.cents.price) undeclaredCells += 1; } else if (rate.id !== usage.id && row.cents.price) sharedCells += 1;
        combinedSplitN += 1;
      } else {
        credit(...(rate.id ? personBucket(rate.id) : UNDECLARED), 'price', row.cents.price);
        if (!rate.id && row.cents.price) undeclaredCells += 1;
        const target = !rate.id || !usage.id ? UNDECLARED : (rate.id === usage.id ? personBucket(rate.id) : sharedBucket(rate.id, usage.id));
        credit(...target, 'joint', row.cents.joint);
        if ((!rate.id || !usage.id) && row.cents.joint) undeclaredCells += 1;
        else if (jointShared && row.cents.joint) sharedCells += 1;
      }
      credit(...(usage.id ? personBucket(usage.id) : UNDECLARED), 'efficiency', row.cents.efficiency);
      if (!usage.id && row.cents.efficiency) undeclaredCells += 1;
      if (final) {
        credit(...(plan.volumeOwnerId ? personBucket(plan.volumeOwnerId) : UNDECLARED), 'activity', row.cents.activity);
        if (!plan.volumeOwnerId && row.cents.activity) undeclaredCells += 1;
      }
      if (row.poolReason === 'pool-of-one') poolOfOneN += 1;
    } else if (row.kind === 'fixed') {
      if (final) {
        credit(...(usage.id ? personBucket(usage.id) : UNDECLARED), 'spending', row.cents.spending);
        if (!usage.id && row.cents.spending) undeclaredCells += 1;
      }
    } else {
      credit(...personBucket(plan.ownerId), 'unplanned', row.cents.unplanned);
    }

    const label = planLine ? planLine.label : (extra ? extra.label : row.key);
    for (const key of CAUSE_KEYS) {
      if (material[key]) {
        exceptions.push({
          lineKey: row.key, label, classKey: key,
          classLabel: FLEX_VARIANCE_CLASSES.find((entry) => entry.key === key)?.label || key,
          cents: row.cents[key], direction: dir[key], shareBp: share[key],
          magnitude: rAbs(row.exact[key]),
        });
      }
    }
    const stdQtyAllowedE3 = row.stdQtyAllowed ? Number(rRound(row.stdQtyAllowed)) : null;
    const actualPriceE4 = row.actualPriceE4 ? Number(rRound(row.actualPriceE4)) : null;
    return {
      key: row.key, label, kind: row.kind,
      unit: planLine?.unit || null,
      pool: row.pool, pooled: row.pooled, poolReason: row.poolReason, split: row.split,
      budgetQtyE3: planLine?.qtyE3 ?? null,
      stdPriceE4: planLine?.priceE4 ?? null,
      stdQtyAllowedE3,
      stdQtyAllowedExact: row.stdQtyAllowed ? rIsInt(row.stdQtyAllowed) : null,
      actualQtyE3: actualLine?.qtyE3 ?? null,
      actualPriceE4,
      actualPriceExact: row.actualPriceE4 ? rIsInt(row.actualPriceE4) : null,
      cents: { ...row.cents },
      material, direction: dir, shareBp: share,
      owners: {
        rate: rate.id ? { id: rate.id, name: nameOf(rate.id), source: rate.source } : null,
        usage: usage.id ? { id: usage.id, name: nameOf(usage.id), source: usage.source } : null,
      },
      jointShared,
    };
  });
  exceptions.sort((a, b) => rCmp(b.magnitude, a.magnitude) || a.lineKey.localeCompare(b.lineKey) || a.classKey.localeCompare(b.classKey));
  const exceptionRows = exceptions.map(({ magnitude, ...rest }) => { void magnitude; return rest; });

  /* ---- totals ---- */
  const tExact = computed.totals.exact;
  const tCents = computed.totals.cents;
  const totalMaterial = {};
  const totalDir = {};
  const totalShare = {};
  for (const key of ['activity', 'price', 'joint', 'efficiency', 'mix', 'yield', 'spending', 'unplanned', 'flexVariance', 'total']) {
    const value = tExact[key];
    if (value === null || value === undefined) { totalMaterial[key] = null; totalDir[key] = null; totalShare[key] = null; continue; }
    const against = key === 'activity' || key === 'total' ? tExact.static : tExact.flex;
    totalMaterial[key] = against ? isMaterial(value, against, threshold) : null;
    totalDir[key] = direction(value);
    totalShare[key] = against ? shareBp(value, against) : null;
  }
  const totals = { cents: { ...tCents }, material: totalMaterial, direction: totalDir, shareBp: totalShare };

  /* ---- attribution, re-added ---- */
  const attribution = [...buckets.values()]
    .map((bucket) => ({ ...bucket, label: bucket.kind === 'person' ? bucket.names[0] : (bucket.kind === 'shared' ? `Shared: ${bucket.names.join(' & ')}` : 'Undeclared — nobody was named') }))
    .sort((a, b) => Math.abs(b.totalCents) - Math.abs(a.totalCents) || a.key.localeCompare(b.key));
  const attributedCents = attribution.reduce((acc, bucket) => acc + bucket.totalCents, 0);
  const attributionTarget = final ? tCents.total : tCents.flexVariance;
  const attributionBalances = attributionTarget === null ? attribution.length === 0 : attributedCents === attributionTarget;

  /* ---- bridge, in walk order ---- */
  const bridge = FLEX_BRIDGE_STEPS
    .filter((step) => final || !step.finalOnly)
    .map((step) => {
      const cents = step.key === 'actual' ? tCents.comparedActual : (step.key === 'flex' ? tCents.comparedFlex : tCents[step.key]);
      return { key: step.key, label: step.label, kind: step.kind, cents: cents ?? null };
    })
    .filter((step) => step.kind === 'level' || step.cents !== null);

  /* ---- commentary, from the printed cents only ---- */
  const money = (cents) => flexMoney(plan.currency, cents);
  const varText = (cents) => flexVarianceText(plan.currency, cents);
  const commentary = [];
  if (final) {
    commentary.push(`Actual cost was ${money(tCents.actual)} against a static budget of ${money(tCents.static)}: ${varText(tCents.total)}${totalShare.total === null ? '' : ` (${flexPercent(totalShare.total)} of the static budget)`}.`);
    commentary.push(`The activity ran at ${flexPercent(computed.volume.ratioBp)} of the planned volume (${flexQuantity(computed.volume.actualE3)} against ${flexQuantity(computed.volume.plannedE3)} ${plan.driverLabel}), which by itself moves the standard by ${varText(tCents.activity)}: the flexible budget for the work actually done is ${money(tCents.flex)}.`);
  } else {
    commentary.push(`Interim reading to ${current.asOf}, before the period ends on ${plan.periodTo}. ${flexQuantity(computed.volume.actualE3)} ${plan.driverLabel} were done; the standard restated for that work is ${money(tCents.comparedFlex)} on the variable lines, and ${money(tCents.comparedActual)} was recorded against it${tCents.unplanned ? ' including unplanned cost' : ''}.`);
  }
  if (tCents.flexVariance !== null) {
    const parts = [];
    if (tCents.price !== null) parts.push(`price ${varText(tCents.price)}`);
    if (tCents.joint !== null) parts.push(`joint price × quantity ${varText(tCents.joint)}`);
    if (tCents.efficiency !== null) parts.push(`efficiency ${varText(tCents.efficiency)}`);
    if (final && tCents.spending !== null) parts.push(`fixed spending ${varText(tCents.spending)}`);
    if (tCents.unplanned !== null) parts.push(`unplanned ${varText(tCents.unplanned)}`);
    commentary.push(`Against the flexible budget, cost is ${varText(tCents.flexVariance)}${parts.length ? ` — ${parts.join('; ')}` : ''}.`);
  }
  for (const pool of computed.pools) {
    if (!pool.pooled) continue;
    commentary.push(`Pool “${pool.key}”: its efficiency variance of ${varText(pool.cents.efficiency)} is ${varText(pool.cents.mix)} of mix (the blend actually used against the budgeted blend, at standard prices) and ${varText(pool.cents.yield)} of yield (total quantity against the total the standard allows).`);
  }
  if (exceptionRows.length) {
    const top = exceptionRows.slice(0, 3).map((row) => `${row.label} — ${row.classLabel.toLowerCase()} ${varText(row.cents)}`);
    commentary.push(`Material on the declared threshold (${money(plan.materialityCents)} and ${flexPercent(plan.materialityBp)} of the flexible budget): ${top.join('; ')}${exceptionRows.length > 3 ? `; and ${exceptionRows.length - 3} more` : ''}.`);
  } else {
    commentary.push(`No line-level cause reaches the declared threshold (${money(plan.materialityCents)} and ${flexPercent(plan.materialityBp)} of the flexible budget).`);
  }
  if (!final) commentary.push('Withheld until the period ends: the activity variance, the static-budget variance and every fixed-cost variance — the static budget and the lumps are full-period figures and no phasing was declared.');

  return {
    ...base,
    stateKey, stateMeta: meta(stateKey), final, finalOverdue: overdue(stateKey),
    volume: { plannedE3: computed.volume.plannedE3, actualE3: computed.volume.actualE3, ratioBp: computed.volume.ratioBp, ratioExact: computed.volume.ratioExact },
    lines,
    pools: computed.pools.map((pool) => (pool.pooled
      ? { key: pool.key, pooled: true, lineKeys: pool.lineKeys, budgetQtyE3: pool.budgetQtyE3, actualQtyE3: pool.actualQtyE3, cents: { ...pool.cents } }
      : { key: pool.key, pooled: false, reason: pool.reason, lineKeys: pool.lineKeys })),
    totals,
    exceptions: exceptionRows,
    attribution,
    attributionBalances,
    undeclaredCells, sharedCells, combinedSplitN, poolOfOneN, shareOfNothing,
    bridge,
    commentary,
    rounding: { ...computed.rounding },
    checks: computed.checks.map((check) => ({ ...check })),
    balances: computed.balances,
    printedExact: computed.rounding.roundedCells === 0,
    refusalKey: final ? null : 'interim-withheld',
  };
}

/* -------------------------------------------------------------------- reader */

/**
 * The whole register, projected for one seat. `seat: null` is the undeclared
 * operator view — the whole workspace.
 */
export function buildFlexBudget(state = {}, { now = new Date(), settings = null, seat = null } = {}) {
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const today = dayKey(at) || new Date().toISOString().slice(0, 10);
  const cfg = settings || state.settings || {};
  const conv = normalizeFlexBudgetSettings(cfg);
  const dueDays = conv[FLEX_BUDGET_SETTING_KEYS.actualsDueDays];
  const warnings = [];
  const plans = normalizeFlexBudgetPlans(state.flexBudgetPlans, warnings);
  const actuals = normalizeFlexBudgetActuals(state.flexBudgetActuals, plans, warnings);
  const { operator, actorId, canDeclare, canRecord, canGovern, holds } = seatProjection(seat);

  const people = new Map((Array.isArray(state.people) ? state.people : []).filter((p) => p && p.id).map((p) => [p.id, p]));
  const nameOf = (personId) => (personId === LEADER_ID ? 'Workspace leader' : (people.get(personId)?.name || 'Someone no longer on the roster'));

  let outsideN = 0;
  let retiredN = 0;
  const statements = [];
  for (const plan of plans) {
    let reach = holds(plan.ownerId);
    if (!operator && actorId && actorId === plan.ownerId) reach = 'own';
    if (!reach && actorId && flexPlanNamedOwners(plan).has(actorId)) reach = 'named';
    if (!reach) { outsideN += 1; continue; }
    if (plan.retiredOn) { retiredN += 1; continue; }
    const current = flexCurrentActual(actuals, plan.id);
    const statement = buildStatement(plan, current, { today, dueDays, nameOf });
    const holdsOwner = reach === 'operator' || reach === 'tree' || reach === 'line';
    const isOwner = actorId === plan.ownerId;
    const history = actuals.filter((row) => row.planId === plan.id);
    statements.push({
      ...statement,
      code: '',
      reach,
      reachLabel: FLEX_REACH_LABELS[reach],
      recordingsN: history.length,
      withdrawnN: history.filter((row) => row.withdrawnOn).length,
      canRecord: canRecord && (holdsOwner || isOwner),
      canWithdraw: Boolean(current) && canRecord && (holdsOwner || current.recordedById === actorId),
      canRetire: canDeclare && holdsOwner && !isOwner,
    });
  }
  statements.sort((a, b) => a.currency.localeCompare(b.currency) || b.periodTo.localeCompare(a.periodTo) || a.title.localeCompare(b.title) || a.planId.localeCompare(b.planId));
  statements.forEach((row, index) => { row.code = `S${String(index + 1).padStart(2, '0')}`; });

  /* ---- roll-up per currency: FINAL statements only, re-added from printed cents ---- */
  const currencyKeys = [...new Set(statements.map((row) => row.currency))].sort();
  const currencies = currencyKeys.map((currency) => {
    const mine = statements.filter((row) => row.currency === currency);
    const finals = mine.filter((row) => row.stateKey === 'final');
    const cents = {};
    for (const key of MONEY_KEYS) cents[key] = finals.length ? sumOrNull(finals.map((row) => row.totals.cents[key])) : null;
    const buckets = new Map();
    for (const row of finals) {
      for (const bucket of row.attribution) {
        if (!buckets.has(bucket.key)) buckets.set(bucket.key, { key: bucket.key, kind: bucket.kind, ids: bucket.ids, names: bucket.names, label: bucket.label, cents: Object.fromEntries(CLASS_KEYS.map((key) => [key, 0])), totalCents: 0, statementsN: 0 });
        const target = buckets.get(bucket.key);
        for (const key of CLASS_KEYS) target.cents[key] += bucket.cents[key];
        target.totalCents += bucket.totalCents;
        target.statementsN += 1;
      }
    }
    const attribution = [...buckets.values()].sort((a, b) => Math.abs(b.totalCents) - Math.abs(a.totalCents) || a.key.localeCompare(b.key));
    const causes = ['activity', ...CAUSE_KEYS].reduce((acc, key) => acc + (cents[key] ?? 0), 0);
    const bridgeBalances = finals.length ? (cents.static !== null && cents.actual !== null && cents.static + causes === cents.actual && cents.total === causes) : null;
    const attributed = attribution.reduce((acc, bucket) => acc + bucket.totalCents, 0);
    return {
      currency,
      statementsN: mine.length,
      finalN: finals.length,
      interimN: mine.filter((row) => row.stateKey === 'interim').length,
      noActualsN: mine.filter((row) => row.stateKey === 'no-actuals').length,
      unreadableN: mine.filter((row) => row.stateKey === 'unreadable').length,
      cents,
      attribution,
      // Two claims, never merged: the roll-up adds up; every statement in it is exact.
      balances: finals.length ? Boolean(bridgeBalances) && finals.every((row) => row.balances === true) : null,
      attributionBalances: finals.length ? attributed === cents.total : null,
      printedExact: finals.length ? finals.every((row) => row.printedExact === true) : null,
      roundedCells: finals.reduce((acc, row) => acc + (row.rounding?.roundedCells || 0), 0),
      undeclaredCents: attribution.filter((bucket) => bucket.kind === 'undeclared').reduce((acc, bucket) => acc + bucket.totalCents, 0),
      sharedCents: attribution.filter((bucket) => bucket.kind === 'shared').reduce((acc, bucket) => acc + bucket.totalCents, 0),
    };
  });

  const count = (key) => statements.filter((row) => row.stateKey === key).length;
  const totals = {
    statementsN: statements.length,
    finalN: count('final'),
    interimN: count('interim'),
    noActualsN: count('no-actuals'),
    unreadableN: count('unreadable'),
    retiredN,
    outsideN,
    overdueN: statements.filter((row) => row.finalOverdue).length,
    materialN: statements.filter((row) => row.exceptions.length > 0).length,
    exceptionsN: statements.reduce((acc, row) => acc + row.exceptions.length, 0),
    unbalancedN: statements.filter((row) => row.balances === false).length,
    roundedStatementsN: statements.filter((row) => row.printedExact === false).length,
    currenciesN: currencyKeys.length,
  };

  const refusalKeys = [];
  if (totals.noActualsN) refusalKeys.push('no-actuals');
  if (totals.interimN) refusalKeys.push('interim-withheld', 'interim-not-rolled-up');
  if (statements.some((row) => row.combinedSplitN)) refusalKeys.push('no-quantity-no-split');
  if (statements.some((row) => row.poolOfOneN)) refusalKeys.push('pool-of-one');
  if (statements.some((row) => row.undeclaredCells)) refusalKeys.push('owner-undeclared');
  if (statements.some((row) => row.sharedCells)) refusalKeys.push('joint-shared');
  if (currencyKeys.length > 1) refusalKeys.push('currencies-not-pooled');
  if (outsideN) refusalKeys.push('outside-span');
  if (totals.unreadableN) refusalKeys.push('unreadable-actuals');
  if (statements.some((row) => row.shareOfNothing)) refusalKeys.push('share-of-nothing');

  return {
    today,
    actorId,
    seat: {
      operator,
      rank: operator ? null : (seat.rank ?? null),
      label: operator ? 'Workspace leader (operator view)' : (seat.label || ''),
      canDeclare, canRecord, canGovern,
    },
    conventions: conv,
    statements: statements.slice(0, L.statementsShown),
    allStatements: statements,
    statementsNotShown: Math.max(0, statements.length - L.statementsShown),
    currencies: currencies.slice(0, L.currenciesShown),
    allCurrencies: currencies,
    totals,
    refusals: refusalKeys.map((key) => REFUSAL_BY_KEY[key]),
    warnings,
    method: FLEX_BUDGET_METHOD,
    frameworks: FLEX_BUDGET_FRAMEWORKS,
    classes: FLEX_VARIANCE_CLASSES,
    engineVersion: FLEX_BUDGET_ENGINE_VERSION,
    settingKeys: FLEX_BUDGET_SETTING_KEYS,
    limits: L,
  };
}

/* ------------------------------------------------------------------- briefs */

/** Identity-free summary text. No person, no title, no label, no basis. */
export function flexBudgetBriefText(report) {
  const out = [];
  out.push(`Flexible-budget variance — ${report.today}`);
  out.push(`${report.totals.statementsN} statement(s): ${report.totals.finalN} final, ${report.totals.interimN} interim, ${report.totals.noActualsN} with no actuals, ${report.totals.unreadableN} unreadable. ${report.totals.overdueN} past the day their final actuals were due. ${report.totals.outsideN} outside this span, counted only.`);
  for (const row of report.allCurrencies) {
    if (!row.finalN) { out.push(`${row.currency}: no final statement — nothing is rolled up.`); continue; }
    const c = row.cents;
    out.push(`${row.currency} (${row.finalN} final): static budget ${flexMoney(row.currency, c.static)}; activity ${flexVarianceText(row.currency, c.activity)}; flexible budget ${flexMoney(row.currency, c.flex)}; price ${flexVarianceText(row.currency, c.price)}; joint ${flexVarianceText(row.currency, c.joint)}; efficiency ${flexVarianceText(row.currency, c.efficiency)}; fixed spending ${flexVarianceText(row.currency, c.spending)}; unplanned ${flexVarianceText(row.currency, c.unplanned)}; actual ${flexMoney(row.currency, c.actual)}; total ${flexVarianceText(row.currency, c.total)}.`);
    out.push(`  The printed cents ${row.balances ? 'add up' : 'DO NOT add up — read this as a defect'}; ${row.printedExact ? 'every printed figure is the exact computed figure' : `${row.roundedCells} printed cell(s) are exact rationals shown to the cent`}. Undeclared ownership: ${flexMoney(row.currency, row.undeclaredCents)}. Joint term shared between two owners: ${flexMoney(row.currency, row.sharedCents)}.`);
  }
  out.push(`${report.totals.exceptionsN} line-level cause(s) reach a declared materiality threshold, in ${report.totals.materialN} statement(s).`);
  out.push('Currencies are never pooled. Interim statements are never rolled up. A variance is not a verdict on a person.');
  return out.join('\n');
}

/* ---------------------------------------------------------------------- CSV */

const blank = (value) => (value === null || value === undefined ? '' : String(value));
const yesNo = (value) => (value === null || value === undefined ? '' : (value ? 'yes' : 'no'));

/** CSV rows from the SAME report the panel renders. Identity-free. */
export function flexBudgetCsvRows(report) {
  const empty = Object.fromEntries(FLEX_BUDGET_CSV_COLUMNS.map((key) => [key, '']));
  const rows = [];
  rows.push({
    ...empty,
    row_type: 'workspace',
    statements_n: report.totals.statementsN,
    final_n: report.totals.finalN,
    interim_n: report.totals.interimN,
    no_actuals_n: report.totals.noActualsN,
    unreadable_n: report.totals.unreadableN,
    outside_span_n: report.totals.outsideN,
    engine_version: report.engineVersion,
  });
  const money = (c, final) => ({
    static_budget_cents: final ? blank(c.static) : '',
    activity_variance_cents: final ? blank(c.activity) : '',
    flexible_budget_cents: blank(c.flex),
    price_variance_cents: blank(c.price),
    joint_variance_cents: blank(c.joint),
    efficiency_variance_cents: blank(c.efficiency),
    mix_variance_cents: blank(c.mix),
    yield_variance_cents: blank(c.yield),
    fixed_spending_variance_cents: final ? blank(c.spending) : '',
    unplanned_cents: blank(c.unplanned),
    actual_cents: blank(c.actual),
    flexible_budget_variance_cents: blank(c.flexVariance),
    total_variance_cents: final ? blank(c.total) : '',
  });
  for (const row of report.allCurrencies) {
    rows.push({
      ...empty,
      row_type: 'currency',
      currency: row.currency,
      ...(row.finalN ? money(row.cents, true) : {}),
      direction: row.finalN && row.cents.total !== null ? dirWord(row.cents.total) : '',
      rounded_cells: row.finalN ? row.roundedCells : '',
      balances: yesNo(row.balances),
      printed_exact: yesNo(row.printedExact),
      statements_n: row.statementsN,
      final_n: row.finalN,
      interim_n: row.interimN,
      no_actuals_n: row.noActualsN,
      unreadable_n: row.unreadableN,
      refusal_key: row.finalN ? '' : 'interim-not-rolled-up',
      engine_version: report.engineVersion,
    });
  }
  for (const row of report.allStatements) {
    const computed = row.stateKey === 'final' || row.stateKey === 'interim';
    const headline = computed ? (row.final ? row.totals.cents.total : row.totals.cents.flexVariance) : null;
    rows.push({
      ...empty,
      row_type: 'statement',
      statement_code: row.code,
      currency: row.currency,
      state: row.stateKey,
      period_from: row.periodFrom,
      period_to: row.periodTo,
      as_of: blank(row.asOf),
      volume_planned_e3: row.plannedVolumeE3,
      volume_actual_e3: computed ? row.volume.actualE3 : '',
      volume_ratio_bp: computed ? blank(row.volume.ratioBp) : '',
      ...(computed ? money(row.totals.cents, row.final) : {}),
      direction: headline === null ? '' : dirWord(headline),
      material: computed ? yesNo(row.exceptions.length > 0) : '',
      materiality_bp: row.materialityBp,
      materiality_floor_cents: row.materialityCents,
      rate_owner_declared: yesNo(Boolean(row.owners.rate)),
      usage_owner_declared: yesNo(Boolean(row.owners.usage)),
      volume_owner_declared: yesNo(Boolean(row.owners.volume)),
      joint_shared: computed ? yesNo(row.sharedCells > 0) : '',
      derived_cells: computed ? row.rounding.cells : '',
      rounded_cells: computed ? row.rounding.roundedCells : '',
      apportioned_cells: computed ? row.rounding.apportionedCells : '',
      balances: yesNo(row.balances),
      printed_exact: yesNo(row.printedExact),
      refusal_key: blank(row.refusalKey),
      engine_version: report.engineVersion,
    });
    if (!computed) continue;
    row.lines.forEach((line, index) => {
      const lineHeadline = row.final ? line.cents.total : line.cents.flexVariance;
      const anyMaterial = CAUSE_KEYS.some((key) => line.material[key] === true);
      rows.push({
        ...empty,
        row_type: 'line',
        statement_code: row.code,
        line_code: `${row.code}-${String(index + 1).padStart(2, '0')}`,
        currency: row.currency,
        state: row.stateKey,
        behaviour: line.kind,
        pooled: line.kind === 'variable' ? yesNo(line.pooled) : '',
        split: blank(line.split),
        ...money(line.cents, row.final),
        direction: lineHeadline === null || lineHeadline === undefined ? '' : dirWord(lineHeadline),
        material: yesNo(anyMaterial),
        rate_owner_declared: line.kind === 'variable' ? yesNo(Boolean(line.owners.rate)) : '',
        usage_owner_declared: line.kind === 'unplanned' ? '' : yesNo(Boolean(line.owners.usage)),
        joint_shared: line.kind === 'variable' ? yesNo(line.jointShared) : '',
        refusal_key: line.split === 'combined' ? 'no-quantity-no-split' : (line.poolReason === 'pool-of-one' ? 'pool-of-one' : (!row.final && line.kind === 'fixed' ? 'interim-withheld' : '')),
        engine_version: report.engineVersion,
      });
    });
  }
  return rows;
}

/* -------------------------------------------------------------------- badge */

/**
 * The attention count the navigation badge reads: statements this seat may
 * record against whose final actuals are past due. Counted from lifecycle and
 * reach alone — a badge that sits on every route never runs the exact kernel.
 */
export function flexBudgetAttentionCount(state = {}, { now = new Date(), settings = null, seat = null } = {}) {
  try {
    if (!Array.isArray(state.flexBudgetPlans) || !state.flexBudgetPlans.length) return 0;
    const at = now instanceof Date ? now : new Date(now || Date.now());
    const today = dayKey(at);
    if (!today) return 0;
    const conv = normalizeFlexBudgetSettings(settings || state.settings || {});
    const dueDays = conv[FLEX_BUDGET_SETTING_KEYS.actualsDueDays];
    const plans = normalizeFlexBudgetPlans(state.flexBudgetPlans, []);
    const actuals = normalizeFlexBudgetActuals(state.flexBudgetActuals, plans, []);
    const { actorId, canRecord, holds } = seatProjection(seat);
    if (!canRecord) return 0;
    let n = 0;
    for (const plan of plans) {
      if (plan.retiredOn) continue;
      if (!holds(plan.ownerId) && actorId !== plan.ownerId) continue;
      const due = flexAddDays(plan.periodTo, dueDays);
      if (!due || today <= due) continue;
      const current = flexCurrentActual(actuals, plan.id);
      if (!current || current.asOf !== plan.periodTo) n += 1;
    }
    return n;
  } catch {
    return 0;
  }
}
