/**
 * app/core/domain/automationOrchestrator.js — the automation layer's shared
 * vocabulary and its honest diagnostics.
 *
 * What used to be here: a priority queue, an event-coalescing helper and a
 * repetition miner, none of which any production module imported. The hub
 * screen printed their behaviour as if it were running ("derived events are
 * ordered by urgency", "auto-classification"), while the real spine drained a
 * breadth-first, budgeted queue in emission order and had no priority pass at
 * all. That is the exact failure mode this repository forbids: a surface that
 * describes work the system does not do.
 *
 * So the file now holds only what is genuinely shared or genuinely measured:
 *
 *  1. `eventKey` — the single definition of "the same event" (type, entity,
 *     entityId). The post-commit spine imports it, so the write path and the
 *     read-side diagnostics can never disagree about what a duplicate is.
 *  2. `automationHealth` / `orchestratorRead` — readings over the spine's own
 *     reporter: what ran, what declined, what rolled back, and how many
 *     duplicate deliveries the spine suppressed.
 *
 * The speculatively-exported helpers were deleted rather than left in place:
 * dead code that a dashboard describes as live is worse than no code.
 */

/**
 * The canonical duplicate identity for an automation event.
 *
 * Two events are the same delivery when they share type, entity and entityId.
 * Kept byte-identical to the key the spine has always used so existing
 * lineage and receipt behaviour is unchanged.
 */
export function eventKey(event) {
  return JSON.stringify([event?.type, event?.entity, event?.entityId]);
}

/**
 * Automation health: a one-line reading of the propagation reporter's ledger
 * for one cascade. `duplicates` is the number of duplicate deliveries the
 * spine refused to process — real coalescing, measured on the write path.
 */
export function automationHealth(reporter, { budget = null } = {}) {
  if (!reporter) return { ok: true, executed: 0, declined: 0, rolledBack: 0, duplicates: 0, budget: null };
  return {
    ok: (reporter.rolledBack || 0) === 0,
    executed: reporter.executed || 0,
    declined: reporter.declined || 0,
    rolledBack: reporter.rolledBack || 0,
    skipped: reporter.skipped || 0,
    indexSkipped: reporter.indexSkipped || 0,
    duplicates: reporter.duplicates || 0,
    events: reporter.events || 0,
    rules: reporter.rules || 0,
    elapsedMs: reporter.elapsedMs || 0,
    budget: budget ?? reporter.budget ?? null,
  };
}

/**
 * Orchestrator read: the automation facts a screen may honestly print.
 * Everything here comes from the last committed cascade or the rule registry —
 * nothing is simulated, nothing is inferred.
 */
export function orchestratorRead({ reporter = null, budget = null } = {}) {
  return {
    at: new Date().toISOString(),
    health: automationHealth(reporter, { budget }),
  };
}

/**
 * Open propagation receipts: the automations that ran, failed and were not
 * retried. Counted from the retained record, never synthesised.
 */
export function openReceipts(state = {}) {
  const rows = Array.isArray(state.propagationReceipts) ? state.propagationReceipts : [];
  return rows.filter((receipt) => receipt && (receipt.status === 'open' || receipt.status === 'retried'));
}
