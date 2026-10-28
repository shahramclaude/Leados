/**
 * app/core/domain/propagationLedger.js — price and audit the automation chain.
 *
 * ADR-0026. The generalized rule spine (ADR-0008) is the reason LeadOS can take
 * one case and produce decisions, delegations, goals, coaching, capacity and
 * comms in a single transaction. It is also the reason a store write can cost
 * seconds on a large workspace, and until now nothing in the product said so.
 * A leader was told "automation propagated 6 things" and never told that 42
 * rule invocations were attempted, that 37 of them declined, or that two of
 * them account for most of the wall clock.
 *
 * This module turns the engine's per-(rule, event) measurements into three
 * things a leader can act on:
 *
 *   1. PRICE — what the chain cost, split by rule, so a hotspot has a name.
 *   2. WASTE — rules that were invoked and declined, ranked by time. This is
 *      the honest version of "the automation is efficient": it is a measured
 *      claim with a denominator, not a adjective.
 *   3. COVERAGE — which event types actually caused something to happen. An
 *      event type that no rule ever acts on is either a missing capability or
 *      dead vocabulary, and both are worth knowing.
 *
 * Pure module: every input is an argument, no storage, no clock, no randomness.
 */

/** Rules whose measured work never produced a write, sorted by cost. */
export function rankWaste(rules) {
  return rules
    .filter((row) => row.calls > 0 && row.applied === 0)
    .sort((a, b) => b.ms - a.ms);
}

/** Rules with the largest share of the chain's time, applied or not. */
export function rankCost(rules) {
  return [...rules].sort((a, b) => b.ms - a.ms);
}

/**
 * Fold the engine's flat pair list into one row per rule.
 * `share` is measured against the sum of pair durations, never the transaction
 * total, so an unattributed millisecond is never silently assigned to a rule.
 */
export function summarizeByRule(pairs) {
  const byRule = new Map();
  for (const pair of Array.isArray(pairs) ? pairs : []) {
    if (!pair || typeof pair.rule !== 'string') continue;
    const row = byRule.get(pair.rule) || {
      rule: pair.rule, calls: 0, applied: 0, declined: 0, rolledBack: 0,
      ms: 0, effects: 0, emitted: 0, events: new Set(), collections: new Set(),
    };
    row.calls += 1;
    if (pair.status === 'applied') row.applied += 1;
    else if (pair.status === 'rolled-back') row.rolledBack += 1;
    else row.declined += 1;
    row.ms += Number.isFinite(pair.ms) ? pair.ms : 0;
    row.effects += Number.isFinite(pair.effects) ? pair.effects : 0;
    row.emitted += Number.isFinite(pair.emitted) ? pair.emitted : 0;
    if (pair.event) row.events.add(pair.event);
    for (const key of Array.isArray(pair.collections) ? pair.collections : []) row.collections.add(key);
    byRule.set(pair.rule, row);
  }
  const rows = [...byRule.values()].map((row) => ({
    ...row,
    events: [...row.events].sort(),
    collections: [...row.collections].sort(),
  }));
  const total = rows.reduce((sum, row) => sum + row.ms, 0);
  for (const row of rows) {
    row.sharePct = total > 0 ? round1((row.ms / total) * 100) : 0;
    row.avgMs = row.calls > 0 ? round1(row.ms / row.calls) : 0;
  }
  return rows;
}

/**
 * Which event types actually moved the workspace. Distinct from "which event
 * types exist": a type that was delivered but never caused an application is
 * cost without effect, and is reported as such rather than assumed useful.
 */
export function summarizeByEvent(pairs) {
  const byEvent = new Map();
  for (const pair of Array.isArray(pairs) ? pairs : []) {
    if (!pair || typeof pair.event !== 'string' || !pair.event) continue;
    const row = byEvent.get(pair.event) || { event: pair.event, pairs: 0, applied: 0, ms: 0, rules: new Set() };
    row.pairs += 1;
    if (pair.status === 'applied') row.applied += 1;
    row.ms += Number.isFinite(pair.ms) ? pair.ms : 0;
    if (pair.rule) row.rules.add(pair.rule);
    byEvent.set(pair.event, row);
  }
  return [...byEvent.values()]
    .map((row) => ({
      ...row,
      ms: round1(row.ms),
      rules: [...row.rules].sort(),
    }))
    .sort((a, b) => b.ms - a.ms);
}

/**
 * Build the whole ledger from a metrics snapshot plus the receipt collection.
 *
 * `metrics` is whatever the engine measured; anything missing is reported as
 * `null` rather than zero, because "we did not measure" and "it cost nothing"
 * are different statements and only one of them is true here.
 */
export function buildPropagationLedger({ metrics, receipts = [], contracts = [], now } = {}) {
  if (!metrics || !Array.isArray(metrics.pairs)) {
    return {
      measured: false,
      reason: 'No transaction has been measured in this session yet.',
      rules: [], events: [], waste: [], costRanked: [],
      totals: null, receipts: summarizeReceipts(receipts), contracts: describeContracts(contracts),
    };
  }
  const rules = summarizeByRule(metrics.pairs);
  const events = summarizeByEvent(metrics.pairs);
  const costRanked = rankCost(rules);
  const waste = rankWaste(rules);
  const pairMs = rules.reduce((sum, row) => sum + row.ms, 0);
  const wasteMs = waste.reduce((sum, row) => sum + row.ms, 0);
  return {
    measured: true,
    at: metrics.at || now || null,
    rootEvent: metrics.rootEvent || null,
    revision: Number.isFinite(metrics.revision) ? metrics.revision : null,
    totals: {
      events: Number.isFinite(metrics.events) ? metrics.events : 0,
      pairs: metrics.pairs.length,
      applied: Number.isFinite(metrics.executed) ? metrics.executed : rules.reduce((s, r) => s + r.applied, 0),
      declined: Number.isFinite(metrics.declined) ? metrics.declined : rules.reduce((s, r) => s + r.declined, 0),
      rolledBack: Number.isFinite(metrics.rolledBack) ? metrics.rolledBack : rules.reduce((s, r) => s + r.rolledBack, 0),
      collapsed: Number.isFinite(metrics.skipped) ? metrics.skipped : 0,
      // Wall clock and the sum of pair durations are different quantities: the
      // difference is engine overhead (queueing, logging, clone) and is
      // reported rather than folded into a rule's share.
      elapsedMs: Number.isFinite(metrics.elapsedMs) ? round1(metrics.elapsedMs) : null,
      pairMs: round1(pairMs),
      wasteMs: round1(wasteMs),
      wastePct: pairMs > 0 ? round1((wasteMs / pairMs) * 100) : 0,
    },
    rules,
    events,
    waste,
    costRanked,
    receipts: summarizeReceipts(receipts),
    contracts: describeContracts(contracts),
  };
}

/** Receipt rollup: open failures are the only ones that need a human. */
export function summarizeReceipts(receipts) {
  const rows = Array.isArray(receipts) ? receipts.filter((r) => r && r.id) : [];
  const count = (status) => rows.filter((r) => r.status === status).length;
  return {
    total: rows.length,
    open: count('open'),
    retried: count('retried'),
    resolved: count('resolved'),
    dismissed: count('dismissed'),
    items: [...rows].sort((a, b) => String(b.at).localeCompare(String(a.at))),
  };
}

/**
 * Contract coverage: which rules declare a purpose, and which of them the
 * engine is allowed to collapse when they provably decline twice.
 */
export function describeContracts(contracts) {
  const rows = Array.isArray(contracts) ? contracts : [];
  return {
    total: rows.length,
    documented: rows.filter((c) => c && c.purpose).length,
    memoized: rows.filter((c) => c && c.declineMemoizable).length,
    scanning: rows.filter((c) => c && c.scansWorkspace).length,
    rows: rows.map((c) => ({
      rule: c.name || c.module,
      module: c.module || '',
      purpose: c.purpose || '',
      scansWorkspace: c.scansWorkspace === true,
      declineMemoizable: c.declineMemoizable === true,
    })),
  };
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

/** Find a receipt by id, or null. Never throws on a malformed workspace. */
export function propagationReceiptById(state, id) {
  const rows = Array.isArray(state && state.propagationReceipts) ? state.propagationReceipts : [];
  return rows.find((row) => row && row.id === id) || null;
}

/**
 * Work out everything needed to retry a receipt, or say precisely why it
 * cannot be retried. Returns a plan rather than performing the write, so the
 * decision is testable without a store.
 *
 * The rule is resolved by NAME against the live rule chain. A receipt from a
 * build whose rules have since been renamed or removed is reported as such
 * instead of being silently retried against the wrong rule.
 */
export function propagationRetryPlan(state, receiptId, rules) {
  if (!receiptId || typeof receiptId !== 'string') {
    return { ok: false, error: 'Pick a propagation receipt to retry.', field: 'id' };
  }
  const receipt = propagationReceiptById(state, receiptId);
  if (!receipt) {
    return { ok: false, error: 'That propagation receipt is no longer in this workspace. Reload and try again.', field: 'id' };
  }
  if (receipt.status === 'resolved') {
    return { ok: false, error: 'That propagation already succeeded on a retry; there is nothing left to run.' };
  }
  if (receipt.status === 'dismissed') {
    return { ok: false, error: 'That propagation receipt was dismissed. It is kept in the ledger but will not be retried.' };
  }
  const rule = (Array.isArray(rules) ? rules : []).find((r) => r && r.name === receipt.rule);
  if (!rule) {
    return {
      ok: false,
      error: `“${receipt.rule}” is not a rule in this build. The receipt is kept so the failure is not hidden, but it cannot be re-run here.`,
    };
  }
  return {
    ok: true,
    receipt,
    rule,
    // Reconstructed from the receipt alone. Receipts never stored record
    // content, so this carries identity and type and nothing else.
    event: {
      type: receipt.eventType || '',
      entity: receipt.entity || '',
      entityId: receipt.entityId || '',
    },
  };
}
