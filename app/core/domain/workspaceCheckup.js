/**
 * app/core/domain/workspaceCheckup.js — one honest read of the workspace's own
 * health.
 *
 * WHAT THIS IS
 * ------------
 * A pre-flight inspection assembled from facts the app already owns: the exact
 * payload storage charged, the schema version the record declares, the typed
 * link graph's own diagnostics, duplicate record identities, automation failure
 * receipts and durable budget gaps, and the measured interaction samples. The
 * question is narrow: "is anything here broken, missing or about to be lost?"
 *
 * WHAT IT IS NOT
 * --------------
 *  - It is not a security audit. A local browser profile is not an access
 *    control system, and a green check never means the data is safe from
 *    another person with this device.
 *  - It does not fix anything. Every finding names the screen that owns the
 *    decision; a checkup that silently repairs records would be a second,
 *    unaudited write path.
 *  - It never invents a number. A check that could not be measured is
 *    `unknown` with the reason printed, never a zero.
 *
 * Pure: no storage, no DOM, no writes, no imports from views.
 */

import { COLLECTIONS, SCHEMA_VERSION } from '../schema.js';
import { buildAssuranceReport } from './assurance.js';
import { openReceipts } from './automationOrchestrator.js';

export const CHECK_STATUSES = Object.freeze(['pass', 'warn', 'fail', 'unknown']);
const WEIGHT = Object.freeze({ pass: 0, unknown: 1, warn: 2, fail: 3 });

function check({ id, label, status, detail, evidence = '', action = null }) {
  return { id, label, status, detail, evidence, action };
}

function latestTs(events) {
  let latest = null;
  for (const event of events) {
    const ts = typeof event?.ts === 'string' ? event.ts : null;
    if (!ts) continue;
    if (!latest || ts > latest) latest = ts;
  }
  return latest;
}

function duplicateIds(state) {
  const duplicates = [];
  for (const key of COLLECTIONS) {
    const rows = Array.isArray(state?.[key]) ? state[key] : [];
    if (!rows.length) continue;
    const seen = new Set();
    let repeated = 0;
    for (const row of rows) {
      if (!row || typeof row.id !== 'string' || !row.id) continue;
      if (seen.has(row.id)) repeated += 1;
      else seen.add(row.id);
    }
    if (repeated) duplicates.push({ collection: key, repeated });
  }
  return duplicates;
}

/**
 * @param {object} state canonical workspace
 * @param {{now?: Date, storageBytes?: number|null, quotaBytes?: number,
 *          persistError?: string|null, propagationMetrics?: object|null,
 *          perfSamples?: Array<{slow?: boolean, elapsedMs?: number, label?: string}>,
 *          isEncrypted?: boolean, isLocked?: boolean, warnings?: string[]}} [options]
 */
export function buildWorkspaceCheckup(state, options = {}) {
  const {
    now = new Date(),
    storageBytes = null,
    quotaBytes = 5 * 1024 * 1024,
    persistError = null,
    propagationMetrics = null,
    perfSamples = [],
    isEncrypted = false,
    isLocked = false,
    warnings = [],
  } = options;
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const source = state && typeof state === 'object' ? state : {};
  const checks = [];

  // 1. Can a save actually land? This is the only failure that loses work.
  if (persistError) {
    checks.push(check({
      id: 'persistence',
      label: 'Saving to this browser',
      status: 'fail',
      detail: `The last write did not reach storage: ${String(persistError).slice(0, 240)}`,
      evidence: 'The in-memory workspace is ahead of the saved copy. Export before closing the tab.',
      action: { label: 'Export a backup', href: '#/settings' },
    }));
  } else if (storageBytes === 0) {
    checks.push(check({
      id: 'persistence',
      label: 'Saving to this browser',
      status: 'unknown',
      detail: 'Nothing has been written yet, so there is no saved copy to verify.',
      evidence: 'Make one recorded change; the checkup will then price the exact payload.',
    }));
  } else {
    checks.push(check({
      id: 'persistence',
      label: 'Saving to this browser',
      status: 'pass',
      detail: 'This browser holds a saved copy of the workspace.',
      evidence: storageBytes == null ? 'Payload size not measured in this session.' : '',
    }));
  }

  // 2. Headroom. The number is the exact payload length when the store has one.
  if (!Number.isFinite(storageBytes)) {
    checks.push(check({
      id: 'storage',
      label: 'Storage headroom',
      status: 'unknown',
      detail: 'The exact stored payload size is not available in this session.',
    }));
  } else {
    const pct = quotaBytes > 0 ? storageBytes / quotaBytes : 0;
    const kb = Math.round(storageBytes / 1024);
    const quotaKb = Math.round(quotaBytes / 1024);
    checks.push(check({
      id: 'storage',
      label: 'Storage headroom',
      status: pct > 0.9 ? 'fail' : pct > 0.75 ? 'warn' : 'pass',
      detail: pct > 0.9
        ? `${kb} KB of an assumed ${quotaKb} KB browser quota — a write may fail. Export now.`
        : pct > 0.75
          ? `${kb} KB of an assumed ${quotaKb} KB browser quota. Consider archiving closed records.`
          : `${kb} KB of an assumed ${quotaKb} KB browser quota (${Math.round(pct * 100)}%).`,
      evidence: 'Browser storage limits are not standardised; this uses the usual 5 MB floor.',
      action: pct > 0.75 ? { label: 'Export or archive', href: '#/settings' } : null,
    }));
  }

  // 3. Schema. Older means a migration has not run; newer means this browser
  //    must not write over a record it cannot fully understand.
  const declared = Number(source.schemaVersion);
  if (!Number.isFinite(declared)) {
    checks.push(check({
      id: 'schema',
      label: 'Schema version',
      status: 'warn',
      detail: 'The workspace does not declare a schema version.',
      evidence: 'Migration cannot be reasoned about without it.',
    }));
  } else if (declared > SCHEMA_VERSION) {
    checks.push(check({
      id: 'schema',
      label: 'Schema version',
      status: 'warn',
      detail: `This workspace was written by a newer LeadOS (schema v${declared}; this build reads v${SCHEMA_VERSION}). It is protected from implicit writes.`,
      evidence: 'Open it with the newer build, or export it unchanged before editing.',
    }));
  } else if (declared < SCHEMA_VERSION) {
    checks.push(check({
      id: 'schema',
      label: 'Schema version',
      status: 'warn',
      detail: `The record declares schema v${declared}; this build expects v${SCHEMA_VERSION}. Normalisation should have migrated it on load.`,
      evidence: 'Reload once. If this persists, export before making further changes.',
    }));
  } else {
    checks.push(check({
      id: 'schema',
      label: 'Schema version',
      status: 'pass',
      detail: `Schema v${declared} matches this build.`,
    }));
  }

  // 4. Duplicate identities inside one collection. Cross-collection reuse of an
  //    id is allowed; two rows with the same id in one collection is ambiguous
  //    everywhere it is read.
  const duplicates = duplicateIds(source);
  checks.push(check({
    id: 'identity',
    label: 'Record identity',
    status: duplicates.length ? 'fail' : 'pass',
    detail: duplicates.length
      ? `${duplicates.reduce((n, row) => n + row.repeated, 0)} repeated id(s) across ${duplicates.length} collection(s): ${duplicates.slice(0, 4).map((row) => `${row.collection} ×${row.repeated}`).join(', ')}${duplicates.length > 4 ? '…' : ''}.`
      : 'No collection contains two records with the same id.',
    evidence: 'Repeated ids make a typed link or a deep route ambiguous.',
    action: duplicates.length ? { label: 'Export and inspect', href: '#/settings' } : null,
  }));

  // 5. The typed link graph has its own published diagnostics. Reuse them
  //    rather than inventing a second definition of "dangling".
  let assurance = null;
  try {
    assurance = buildAssuranceReport(source);
  } catch (error) {
    checks.push(check({
      id: 'links',
      label: 'Typed link graph',
      status: 'unknown',
      detail: `The link graph could not be read: ${(error && error.message) || error}`,
      evidence: 'This is a reading failure, not evidence that links are broken.',
    }));
  }
  if (assurance) {
    const counts = { dangling: 0, duplicate: 0, 'unknown-relation': 0 };
    for (const finding of assurance.findings) {
      if (Object.hasOwn(counts, finding.kind)) counts[finding.kind] += 1;
    }
    const total = assurance.edges.length;
    const problems = counts.dangling + counts.duplicate + counts['unknown-relation'];
    checks.push(check({
      id: 'links',
      label: 'Typed link graph',
      status: counts.dangling ? 'fail' : counts.duplicate || counts['unknown-relation'] ? 'warn' : total ? 'pass' : 'unknown',
      detail: total === 0 && problems === 0
        ? 'No operational relationships are recorded yet, so link integrity is not measured.'
        : `${total} valid relationship(s); ${counts.dangling} dangling, ${counts.duplicate} duplicate, ${counts['unknown-relation']} with an unregistered relation.`,
      evidence: 'Confidential and private records are excluded from this graph by design.',
      action: problems ? { label: 'Open the automation control room', href: '#/assurance' } : null,
    }));
  }

  // 6. Automation failures that were retained. A receipt is a rule that threw
  //    and whose downstream work may be missing; it is not an incident count.
  const receipts = openReceipts(source);
  const ruleErrors = (Array.isArray(source.events) ? source.events : []).filter((e) => e?.type === 'automation.rule_error');
  checks.push(check({
    id: 'automation-failures',
    label: 'Automation failure receipts',
    status: receipts.length || ruleErrors.length ? 'warn' : 'pass',
    detail: receipts.length || ruleErrors.length
      ? `${receipts.length} open receipt(s) and ${ruleErrors.length} retained rule-error event(s). Downstream work may be absent for those writes.`
      : 'No automation rule has left an unresolved failure receipt.',
    evidence: 'A failure rolls back that rule only; the source write still committed.',
    action: receipts.length || ruleErrors.length ? { label: 'Review and retry receipts', href: '#/assurance' } : null,
  }));

  // 7. Durable budget gaps. Before ADR-0200 a truncated cascade existed only as
  //    a warning on the render that wrote it, so a reload erased the evidence.
  const gaps = (Array.isArray(source.events) ? source.events : []).filter((e) => e?.type === 'automation.gap');
  const gapAt = latestTs(gaps);
  checks.push(check({
    id: 'automation-gaps',
    label: 'Automation budget gaps',
    status: gaps.length ? 'warn' : 'pass',
    detail: gaps.length
      ? `${gaps.length} recorded write(s) withheld derived events when the automation budget was exhausted${gapAt ? `; latest ${gapAt.slice(0, 10)}` : ''}. The source record exists; some downstream work may not.`
      : 'No write has exhausted the automation delivery budget.',
    evidence: 'A gap is not a rule failure: no rule threw, and the source write committed.',
    action: gaps.length ? { label: 'Open the propagation ledger', href: '#/propagation' } : null,
  }));

  // 8. Last cascade, from the spine's own reporter.
  if (propagationMetrics && Number.isFinite(propagationMetrics.events)) {
    const rolled = propagationMetrics.rolledBack || 0;
    const omitted = propagationMetrics.omittedEvents || 0;
    checks.push(check({
      id: 'cascade',
      label: 'Last automation cascade',
      status: rolled || omitted ? 'warn' : 'pass',
      detail: `${propagationMetrics.events} event(s) × ${propagationMetrics.rules || 0} rule(s) in ${Math.round((propagationMetrics.elapsedMs || 0) * 10) / 10} ms; ${propagationMetrics.executed || 0} applied, ${propagationMetrics.declined || 0} declined, ${rolled} rolled back, ${omitted} withheld.`,
      evidence: `Root event: ${propagationMetrics.rootEvent || 'not recorded'}.`,
    }));
  } else {
    checks.push(check({
      id: 'cascade',
      label: 'Last automation cascade',
      status: 'unknown',
      detail: 'No automation cascade has run in this session.',
      evidence: 'Make one recorded change to measure the next cascade.',
    }));
  }

  // 9. Measured interaction cost. Slow is already defined by the perf lane.
  const samples = Array.isArray(perfSamples) ? perfSamples : [];
  if (!samples.length) {
    checks.push(check({
      id: 'performance',
      label: 'Measured interaction cost',
      status: 'unknown',
      detail: 'No performance sample has been recorded in this session.',
      evidence: 'Instrumentation is off by default; readings appear after it is enabled.',
    }));
  } else {
    const slow = samples.filter((s) => s && s.slow === true);
    const worst = samples.reduce((max, s) => Math.max(max, Number(s.elapsedMs) || 0), 0);
    checks.push(check({
      id: 'performance',
      label: 'Measured interaction cost',
      status: slow.length ? 'warn' : 'pass',
      detail: `${samples.length} sample(s); slowest ${Math.round(worst * 10) / 10} ms; ${slow.length} above the slow threshold.`,
      evidence: 'Samples are in-memory only and never exported.',
      action: slow.length ? { label: 'Open the efficiency hub', href: '#/efficiency' } : null,
    }));
  }

  // 10. Storage protection. This is deliberately a warning, not a pass/fail
  //     security verdict: a local browser profile is not an access control.
  checks.push(check({
    id: 'encryption',
    label: 'Storage protection',
    status: isEncrypted ? 'pass' : 'warn',
    detail: isEncrypted
      ? `The workspace is encrypted on this device${isLocked ? ' and currently locked' : ''}.`
      : 'Records are stored as plain text in this browser. Anyone with this device profile can read them.',
    evidence: 'Encryption protects a lost laptop; it does not replace accounts or access control.',
    action: isEncrypted ? null : { label: 'Turn on encryption', href: '#/settings' },
  }));

  // 11. Demo data is not a defect, but a leader must not mistake it for theirs.
  const demo = source.meta?.isDemo === true;
  checks.push(check({
    id: 'workspace-mode',
    label: 'Workspace contents',
    status: demo ? 'warn' : 'pass',
    detail: demo
      ? 'This is the demonstration workspace. Changes are real to this browser but the people and records are synthetic.'
      : 'This workspace holds your own records.',
    evidence: warnings.length ? `${warnings.length} load-time warning(s) are retained; see Settings.` : '',
    action: demo ? { label: 'Open Settings', href: '#/settings' } : null,
  }));

  const counts = { pass: 0, warn: 0, fail: 0, unknown: 0 };
  for (const row of checks) counts[row.status] += 1;
  const status = counts.fail ? 'fail' : counts.warn ? 'warn' : counts.pass ? 'pass' : 'unknown';
  return {
    at: at.toISOString(),
    status,
    checks,
    counts,
    attention: counts.fail + counts.warn,
    total: checks.length,
    measured: {
      storageBytes: Number.isFinite(storageBytes) ? storageBytes : null,
      quotaBytes,
      records: COLLECTIONS.reduce((n, key) => n + (Array.isArray(source[key]) ? source[key].length : 0), 0),
      events: Array.isArray(source.events) ? source.events.length : 0,
      links: assurance ? assurance.edges.length : null,
      receipts: receipts.length,
      gaps: gaps.length,
      ruleErrors: ruleErrors.length,
      perfSamples: samples.length,
    },
  };
}

export const CHECKUP_CAVEATS = Object.freeze([
  'This is a workspace reading, not a security audit. A local browser profile is not an access control system.',
  'It fixes nothing. Every finding names the screen that owns the decision.',
  'A check that could not be measured is shown as unknown with its reason — never as a zero.',
  'It does not test a real browser, assistive technology, backup restoration or the operating system.',
]);

/** A plain-text report for the leader or an IT reviewer. No names, no free text. */
export function checkupBrief(report) {
  if (!report) return 'No workspace checkup was produced.';
  const lines = [
    'LeadOS workspace checkup',
    `At: ${report.at}`,
    `Overall: ${report.status.toUpperCase()} · ${report.counts.fail} fail · ${report.counts.warn} warn · ${report.counts.pass} pass · ${report.counts.unknown} unknown`,
    '',
  ];
  for (const row of report.checks) {
    lines.push(`[${row.status.toUpperCase()}] ${row.label}: ${row.detail}`);
    if (row.evidence) lines.push(`  ${row.evidence}`);
  }
  lines.push('', 'Measured:', ...Object.entries(report.measured).map(([key, value]) => `  ${key}: ${value == null ? 'not measured' : value}`));
  lines.push('', 'Limits:');
  for (const caveat of CHECKUP_CAVEATS) lines.push(`- ${caveat}`);
  return lines.join('\n');
}
