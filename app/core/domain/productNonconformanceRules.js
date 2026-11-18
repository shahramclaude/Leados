/**
 * app/core/domain/productNonconformanceRules.js — `RULE-QNC-01` on the shared
 * post-commit spine (ADR-0253, Schema v206).
 *
 * FIVE CONDITIONS, each read from the ONE reader (`buildProductNonconformance`) and
 * the live reporting graph, and never re-derived here:
 *
 *   1. `containment-owed` — a case is on the record with no containment act, or
 *      with a LATEST attestation that covers only part of the identified output.
 *      This is the condition the register exists for: a lot nobody has held is on
 *      the floor right now.
 *
 *   2. `decision-owed` — the output is contained but the current joint matrix apex
 *      has not recorded a disposition, has only partly signed, or has signed two
 *      different dispositions.
 *
 *   3. `authority-unresolved` — the live matrix yields no joint decision seat above
 *      every accountable line. Nobody is substituted, so the ask goes to the lines
 *      that do exist and the condition is printed as the register's own defect.
 *
 *   4. `verification-owed` — rework is complete with no independent, STRICTLY
 *      SENIOR pass on the record, so the output remains held.
 *
 *   5. `act-owed` — a complete disposition is waiting for the act that carries it
 *      out (the rework, the return, the scrap, or the separate release), or a failed
 *      re-verification owes a new disposition round.
 *
 * ONE ASK PER OBLIGATION, NEVER ONE PER SCREEN. The signature is per (condition,
 * case), so clearing one case cannot clear another. A seat receives each ask once,
 * and at most four new asks arrive per commit with the remainder counted.
 *
 * THE ASK SAYS NOTHING IT DOES NOT HAVE TO. A delegation is readable above the
 * addressee, so no title names a case reference, a product, a site, a lot, a serial,
 * a requirement, a finding, an evidence reference or a person. The opaque signature
 * lives only in the typed `issues-obligation` link.
 *
 * WHAT IT NEVER DOES. It never opens a case, records containment, signs a
 * disposition, carries one out, verifies rework, releases anything, or writes a
 * state. It does not treat a recorded containment attestation as a physical hold —
 * the ask exists precisely because the ledger cannot lock a warehouse. Where nobody
 * can be asked — a disconnected graph, a case whose hands are all off the graph, an
 * unresolvable apex — it writes ONE identity-free observation per condition and
 * asks nobody.
 */

import { dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { matrixJointApex } from './matrix.js';
import { buildProductNonconformance } from './productNonconformance.js';
import {
  QNC_EVENT_PREFIX,
  QNC_MARKER_KIND,
  QNC_ROUTE,
  QNC_RULE_ID,
  QNC_SETTING_KEYS,
} from './productNonconformanceRegistry.js';
import { normalizeQncSettings } from './productNonconformanceSchema.js';

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);
const list = (value) => (Array.isArray(value) ? value : []);
const ASKS_PER_COMMIT = 4;

/** The literal key this rule reads, named here so the pause-permit census greps it. */
export const QNC_PAUSE_SWITCH = 'qncAutoPropagate';

export function qncAskSignature(kind, caseId) {
  return `qnc1:${kind}:${caseId}`;
}

const SIGNATURE_RE = /^qnc1:(containment-owed|decision-owed|authority-unresolved|verification-owed|act-owed|record-conflict):([^:]+)$/;

export function parseQncAskSummary(summary) {
  if (typeof summary !== 'string') return null;
  const match = SIGNATURE_RE.exec(summary.trim());
  if (!match) return null;
  return { signature: match[0], kind: match[1], subjectId: match[2] };
}

/** Every ask this rule ever filed, found through its typed `issues-obligation` link. */
export function indexQncAsks(state) {
  const tasks = new Map(list(state?.delegations).filter((task) => task && typeof task.id === 'string').map((task) => [task.id, task]));
  const asks = [];
  for (const link of list(state?.links)) {
    if (!link || link.ruleId !== QNC_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parseQncAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({ signature: parsed.signature, kind: parsed.kind, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

const TITLES = Object.freeze({
  'containment-owed': 'A product case is on the record with no complete containment attestation',
  'decision-owed': 'A contained output still owes its joint disposition',
  'authority-unresolved': 'A product case has no joint decision seat the live matrix can prove',
  'verification-owed': 'Re-work is complete and the output has no independent senior re-verification',
  'act-owed': 'An authorised disposition is waiting for the act that carries it out',
  'record-conflict': 'The acts on a product case conflict and no release is recognised',
});

const OUTCOMES = Object.freeze({
  'containment-owed': 'Open the product nonconformance register (#/nonconformance) and record the containment attestation for the identified lot or serial: the control applied, the written hold reference and the evidence. The newest attestation governs, and a partial one leaves the case uncontained. A recorded attestation is not an enforced physical or system hold — check the floor as well.',
  'decision-owed': 'Open #/nonconformance and sign the disposition in the open round: rework, return, scrap, or use-as-is under a written concession. Every required joint apex must sign the same disposition in the same round; a partial signature set authorises nothing.',
  'authority-unresolved': 'Open #/nonconformance and correct the record the matrix cannot resolve — an accountable hand with no active reporting line, a common seat that cannot be proved, or a synthetic root — or re-declare the case’s accountable hands. The register substitutes nobody.',
  'verification-owed': 'Open #/nonconformance and record the independent re-verification of the reworked output. The verifier must be a different hand, strictly senior to the person who completed the rework on the live reporting graph. A pass does not release the output; the release is its own act.',
  'act-owed': 'Open #/nonconformance and record the act the disposition requires — the rework completion, the return, the scrap, or the separate release after a passing senior re-verification. Where re-verification failed, record a new disposition round.',
  'record-conflict': 'Open #/nonconformance and read the conflicting acts. No release is recognised until the source record is resolved; preserve the hold and record the correct act rather than editing history.',
});

const URGENCY = Object.freeze({
  'containment-owed': 0,
  'authority-unresolved': 0,
  'record-conflict': 0,
  'decision-owed': 1,
  'verification-owed': 1,
  'act-owed': 2,
});
const DUE_DAYS = Object.freeze({
  'containment-owed': 1,
  'authority-unresolved': 1,
  'record-conflict': 1,
  'decision-owed': 2,
  'verification-owed': 2,
  'act-owed': 2,
});

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: QNC_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: QNC_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${QNC_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

/**
 * The conditions the current record creates. Pure over (report); exported so the
 * suite can pin every branch without a store.
 */
export function qncConditions(report) {
  const conditions = [];
  const observations = [];
  if (!report?.ok) return { conditions, observations };

  const askFor = (kind, caseId, managerIds, matrix) => {
    const ids = list(managerIds).filter(Boolean);
    if (!ids.length) {
      observations.push({
        signature: qncAskSignature(kind, caseId),
        detail: `A product-conformance condition (${kind}) is on the record, but none of the case’s accountable hands has an active reporting line, so no seat can be asked to answer for it.`,
      });
      return;
    }
    const apex = matrixJointApex(matrix, ids);
    const apexIds = list(apex?.apexIds).filter(Boolean);
    if (!apexIds.length) {
      observations.push({
        signature: qncAskSignature(kind, caseId),
        detail: `A product-conformance condition (${kind}) is on the record, but the reporting graph yields no joint seat above the lines that hold its accountable hands.`,
      });
      return;
    }
    for (const seatId of apexIds) {
      if (!seatId) continue;
      conditions.push({
        kind,
        subjectId: caseId,
        signature: qncAskSignature(kind, caseId),
        seatIds: [seatId],
        dueInDays: DUE_DAYS[kind] ?? 1,
        ambiguous: Boolean(apex?.ambiguous) || apexIds.length > 1,
        urgency: URGENCY[kind] ?? 9,
      });
    }
  };

  const matrix = report.matrix || null;
  for (const row of report.rows || []) {
    const caseId = row?.case?.id;
    if (!caseId) continue;
    const stateKey = row.state?.key || '';
    const managers = row.managerIds || [];
    if (stateKey === 'containment-missing' || stateKey === 'containment-partial') askFor('containment-owed', caseId, managers, matrix);
    else if (stateKey === 'authority-unresolved') askFor('authority-unresolved', caseId, managers, matrix);
    else if (stateKey === 'record-conflict') askFor('record-conflict', caseId, managers, matrix);
    else if (['decision-pending', 'awaiting-joint-approval', 'decision-disagreement', 'authority-changed'].includes(stateKey)) {
      askFor('decision-owed', caseId, managers, matrix);
    } else if (stateKey === 'reverification-pending') askFor('verification-owed', caseId, managers, matrix);
    else if (['rework-pending', 'release-pending', 'return-pending', 'scrap-pending', 'reverification-failed'].includes(stateKey)) {
      askFor('act-owed', caseId, managers, matrix);
    }
  }

  conditions.sort((a, b) => a.urgency - b.urgency
    || String(a.signature).localeCompare(String(b.signature))
    || String(a.seatIds[0]).localeCompare(String(b.seatIds[0])));
  return { conditions, observations };
}

/**
 * `RULE-QNC-01`. Runs on the shared spine after every commit that is not its own
 * automation output, and on the explicit scan. Pause-governed on every path.
 */
export function productNonconformanceRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  if (event.type.startsWith('automation.')) return [];
  if (ctx.derived && !event.type.startsWith(QNC_EVENT_PREFIX)) return [];

  const conv = normalizeQncSettings(draft.settings || {});
  // Named by its FULL literal key below because the pause-permit census greps the
  // source that reads it.
  if (conv[QNC_SETTING_KEYS.autoPropagate] === false || conv.qncAutoPropagate === false) return [];

  const existing = indexQncAsks(draft);
  const hasActiveAsk = existing.some((ask) => ask.task && ask.task.status === 'active');
  if (!list(draft.qncCases).length && !hasActiveAsk) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];

  let report;
  try {
    report = buildProductNonconformance(draft, { now, settings: draft.settings || {}, seat: null });
  } catch {
    return [];
  }
  if (!report?.ok) return [];

  // The reader builds its own matrix for the register; reuse it so the rule and
  // the screen resolve the SAME apex for the same case.
  const { conditions, observations } = qncConditions(report);
  const out = [];
  const idFactory = typeof ctx.idFactory === 'function' ? ctx.idFactory : (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
  const nowIso = now.toISOString();
  const dueOn = (days) => new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10);

  const covered = new Set(existing.filter((ask) => ask.task && ask.task.status === 'active').map((ask) => `${ask.signature}::${ask.seatId}`));
  const linkCtx = { idFactory, todayStr: today, nowIso };

  let issued = 0;
  let deferred = 0;
  for (const condition of conditions) {
    for (const seatId of condition.seatIds) {
      const key = `${condition.signature}::${seatId}`;
      if (covered.has(key)) continue;
      // A human who closed or returned the ask while the condition stands has
      // ANSWERED it; re-filing would nag somebody who has already replied.
      const answered = existing.some((ask) => ask.task && ask.signature === condition.signature && ask.seatId === seatId
        && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(QNC_RULE_ID)) || ask.task.status === 'returned'));
      if (answered) continue;
      if (issued >= ASKS_PER_COMMIT) { deferred += 1; continue; }

      const taskId = idFactory('dlg');
      if (!Array.isArray(draft.delegations)) draft.delegations = [];
      draft.delegations.unshift({
        id: taskId,
        personId: seatId,
        title: clip(TITLES[condition.kind] || 'A dated act is owed on the product nonconformance register', 200),
        expectedOutcome: clip(OUTCOMES[condition.kind] || 'Open the product nonconformance register (#/nonconformance).', 2000),
        authority: 'act-inform',
        support: `Issued by ${QNC_RULE_ID} from the product nonconformance register (#/nonconformance). It reads declared cases, containment attestations, joint signatures, acts and re-verifications only; a recorded containment is not an enforced physical or system hold; nothing here is a finding about any person or line and nothing here is a rating of any of them.`,
        delegatedOn: today,
        dueOn: dueOn(condition.dueInDays),
        status: 'active',
        checkins: [],
        completedOn: null,
        completionNote: '',
        returnedOn: null,
        returnReason: '',
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      ensureEntityLink(draft, {
        sourceType: 'person',
        sourceId: seatId,
        targetType: 'delegation',
        targetId: taskId,
        relation: 'issues-obligation',
        ruleId: QNC_RULE_ID,
        summary: clip(condition.signature, 240),
      }, linkCtx);
      covered.add(key);
      issued += 1;
      noteEffect(ctx, out, 'delegated', 'delegation', taskId, `${TITLES[condition.kind] || 'Filed a product-conformance ask.'} Due ${dueOn(condition.dueInDays)}.`);
    }
  }

  if (observations.length) {
    draft.qncMarkers = Array.isArray(draft.qncMarkers) ? draft.qncMarkers : [];
    const have = new Set(draft.qncMarkers.map((row) => row && row.key));
    let wrote = 0;
    for (const observation of observations) {
      if (have.has(observation.signature)) continue;
      draft.qncMarkers.push({
        key: observation.signature,
        at: nowIso,
        ruleId: QNC_RULE_ID,
        kind: QNC_MARKER_KIND,
        detail: clip(observation.detail, 400),
      });
      have.add(observation.signature);
      wrote += 1;
    }
    if (wrote) noteEffect(ctx, out, 'observed', 'workspace', QNC_ROUTE, `${wrote} condition(s) could not be asked of any seat and were recorded as identity-free observations.`);
  }

  if (deferred) {
    noteEffect(ctx, out, 'deferred', 'workspace', QNC_ROUTE, `${deferred} product-conformance ask(s) were deferred (cap ${ASKS_PER_COMMIT} per commit); they follow on the next write or scan.`);
  }

  // Close this rule's own asks whose condition has cleared.
  const live = new Set();
  for (const condition of conditions) {
    for (const seatId of condition.seatIds) live.add(`${condition.signature}::${seatId}`);
  }
  for (const ask of existing) {
    if (!ask.task || ask.task.status !== 'active') continue;
    if (live.has(`${ask.signature}::${ask.seatId}`)) continue;
    const task = list(draft.delegations).find((row) => row && row.id === ask.task.id);
    if (!task) continue;
    task.status = 'done';
    task.completedOn = today;
    task.completionNote = clip(`${QNC_RULE_ID}: the condition this ask reported is no longer on the record. Closed by the register, not by a human answer.`, 300);
    task.updatedAt = nowIso;
    noteEffect(ctx, out, 'closed', 'delegation', task.id, 'The product-conformance condition cleared; the register closed its own ask.');
  }

  return out;
}

productNonconformanceRule.id = 'productNonconformanceRule';

export default productNonconformanceRule;
