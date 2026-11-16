/**
 * app/core/domain/assuranceFinding.js — the pure kernel of the Assurance
 * Finding & Remediation Register (ADR-0232, `RULE-AFR-01`).
 *
 * A finding is DECLARED once and never edited. Four append-only acts move it:
 *
 *   ASSIGN  — the holder of an accountable line names the remediation owner and
 *             the day the fix is owed by. One assignment per line; a second is
 *             refused and the first stands.
 *   ASSERT  — the named owner states what changed and what would be shown to a
 *             reviewer. An assertion is a claim, never a closure; the reader
 *             keeps calling the line `asserted` until somebody else tests it.
 *   VERIFY  — a seat STRICTLY ABOVE the owner on the reporting DAG confirms or
 *             rejects. The owner never verifies their own fix and neither does
 *             anybody below them; a rejection returns the line to remediation
 *             owed and closes nothing.
 *   ACCEPT  — a named authority at rank 4 or above accepts the residual risk,
 *             and never a person who owns remediation on that finding.
 *
 * Every state, flag, count and rate is re-derived here on every call. Nothing
 * derived is stored, so a hand-edited file cannot carry a closure nobody
 * verified or a severity nobody declared.
 *
 * TWO RECURRENCE FACTS, NEVER MERGED.
 *   `recurrent`  — the same control AND scope is on the record again after a
 *                  predecessor that was CLOSED AS VERIFIED. The fix was tested
 *                  and the condition came back: remediation did not hold.
 *   `reobserved` — the same control and scope is back after a predecessor whose
 *                  residual risk was ACCEPTED. That is a carried risk seen
 *                  again, not a failed fix. Different fact, different count.
 */

import { dayKey, daysBetween } from '../time.js';
import {
  AFR_ADR,
  AFR_ENGINE_VERSION,
  AFR_FLAGS,
  AFR_LIMITS as L,
  AFR_METHOD,
  AFR_RULE_ID,
  AFR_STATE_KEYS,
  AFR_SEVERITY_KEYS,
  AFR_SOURCE_KEYS,
} from './assuranceRegistry.js';
import {
  normalizeFindingActs,
  normalizeFindingMarkers,
  normalizeFindings,
} from './assuranceSchema.js';
import { afrAgeBucket, AFR_AGE_BUCKETS, afrBp } from './assuranceFindingMath.js';

const CLOSED_STATES = Object.freeze(['closed-verified', 'closed-accepted']);
const RESOLVED_LINE_STATES = Object.freeze(['asserted', 'verified']);

const list = (value) => (Array.isArray(value) ? value : []);

/**
 * An accountable line resolves when the declared line still exists, is active
 * and covers the read day. The matrix DAG is not rebuilt here: this reader is
 * read on every render, and the question it answers is narrow and exact — does
 * the line the declaration named still exist on the record, yes or no. A line
 * the record no longer carries is PRINTED, never substituted for and never
 * silently dropped from the roll-up.
 */
function lineIndex(state, nowIso) {
  const today = String(nowIso || '').slice(0, 10);
  const map = new Map();
  for (const raw of list(state?.reportingLines)) {
    if (!raw || typeof raw !== 'object') continue;
    if (raw.status && raw.status !== 'active') continue;
    if (raw.fromISO && String(raw.fromISO).slice(0, 10) > today) continue;
    if (raw.toISO && String(raw.toISO).slice(0, 10) < today) continue;
    map.set(`${raw.personId}|${raw.id}`, raw);
  }
  return map;
}

const keyOf = (finding) => `${finding.controlRef}|${finding.scopeRef}`;

/** One accountable line's timeline, read in chronological order. */
/**
 * Two acts carrying the SAME timestamp are ordered by their position in the
 * ledger, not by their id string: an act written later is later. This matters
 * the moment a line re-asserts inside the same instant an earlier test was
 * recorded (a fixture clock, a back-dated paper entry, two acts in one commit).
 * Without it, a rejection dated 10:00 would be read as a test of an assertion
 * appended after it, and a line that owed a fix again would print as still
 * rejected. Ledger order is the honest tiebreak: it is the order the record
 * itself carries.
 */
function actOrder(acts) {
  const ord = new Map();
  let i = 0;
  for (const act of acts) ord.set(act, i++);
  return ord;
}

function compareActs(a, b, ord) {
  const byAt = String(a?.at || '').localeCompare(String(b?.at || ''));
  if (byAt !== 0) return byAt;
  return (ord.get(a) ?? 0) - (ord.get(b) ?? 0);
}

function readLine(finding, acts, lines, { holderId, lineId, resolved }) {
  const source = list(acts).filter((act) => act && act.findingId === finding.id && act.lineHolderId === holderId && act.lineId === lineId);
  const ord = actOrder(source);
  const mine = [...source].sort((a, b) => compareActs(a, b, ord));

  const assigns = mine.filter((act) => act.kind === 'assign');
  const asserts = mine.filter((act) => act.kind === 'assert');
  const verifies = mine.filter((act) => act.kind === 'verify');

  /**
   * The GOVERNING assignment is the FIRST one on the line, not the last. The
   * action refuses a second assignment so that "a second never overwrites the
   * first" is true on the write path; the reader must agree, or a hand-edited
   * file could quietly re-point the accountability at somebody else.
   */
  const governingAssign = assigns.length ? assigns[0] : null;
  // An assertion with no assignment behind it names no owner, so it is not an
  // assertion this line can stand on. Fail closed rather than repair it.
  const assertsAfter = governingAssign ? asserts.filter((act) => compareActs(act, governingAssign, ord) >= 0) : [];
  const firstAssert = assertsAfter.length ? assertsAfter[0] : null;
  const lastAssert = assertsAfter.length ? assertsAfter[assertsAfter.length - 1] : null;
  const verifiesAfter = lastAssert
    ? verifies.filter((act) => compareActs(act, lastAssert, ord) >= 0)
    : [];
  const firstConfirm = verifiesAfter.find((act) => act.decision === 'confirm') || null;
  const lastVerify = verifiesAfter.length ? verifiesAfter[verifiesAfter.length - 1] : null;

  let lineState = 'unassigned';
  if (governingAssign) {
    if (!lastAssert) lineState = 'remediating';
    else if (!lastVerify) lineState = 'asserted';
    else lineState = lastVerify.decision === 'confirm' ? 'verified' : 'rejected';
  }

  return {
    personId: holderId,
    lineId,
    resolved,
    lineState,
    assignCount: assigns.length,
    ownerId: governingAssign?.ownerId || null,
    assignDueOn: governingAssign?.dueOn || null,
    assignedOn: governingAssign ? String(governingAssign.at).slice(0, 10) : null,
    assignedById: governingAssign?.actorId || null,
    assignNote: governingAssign?.note || null,
    assertionCount: assertsAfter.length,
    assertedOn: firstAssert ? String(firstAssert.at).slice(0, 10) : null,
    assertedById: lastAssert?.actorId || null,
    changeText: lastAssert?.changeText || null,
    evidenceRef: lastAssert?.evidenceRef || null,
    verifiedOn: firstConfirm ? String(firstConfirm.at).slice(0, 10) : null,
    verifierId: lastVerify?.actorId || null,
    decision: lastVerify?.decision || null,
    methodText: lastVerify?.methodText || null,
  };
}

function deriveRow(finding, acts, lines, today) {
  const accountable = finding.accountable.map((entry) => readLine(finding, acts, lines, {
    holderId: entry.personId,
    lineId: entry.lineId,
    resolved: lines.has(`${entry.personId}|${entry.lineId}`),
  }));

  const states = accountable.map((row) => row.lineState);
  const allAssigned = states.length > 0 && states.every((key) => key !== 'unassigned');
  const allAsserted = states.length > 0 && states.every((key) => RESOLVED_LINE_STATES.includes(key));
  const allVerified = states.length > 0 && states.every((key) => key === 'verified');
  const anyRejected = states.some((key) => key === 'rejected');

  const accept = list(acts)
    .filter((act) => act && act.findingId === finding.id && act.kind === 'accept')
    .sort((a, b) => String(a.at).localeCompare(String(b.at)) || String(a.id).localeCompare(String(b.id)))
    .pop() || null;

  let state;
  if (accept) state = 'closed-accepted';
  else if (allVerified) state = 'closed-verified';
  else if (anyRejected) state = 'rejected-remediation-owed';
  else if (allAsserted) state = 'asserted-awaiting-verification';
  else if (allAssigned) state = 'remediating';
  else if (states.some((key) => key !== 'unassigned')) state = 'open-partially-assigned';
  else state = 'open-unassigned';

  const assertedDates = accountable.map((row) => row.assertedOn);
  const verifiedDates = accountable.map((row) => row.verifiedOn);
  const maxDate = (values) => (values.length && values.every((value) => Boolean(value))
    ? values.reduce((best, value) => (value > best ? value : best), values[0])
    : null);
  const allAssertedOn = maxDate(assertedDates);
  const allVerifiedOn = maxDate(verifiedDates);

  const flags = [];
  if (accountable.some((row) => !row.resolved)) flags.push(AFR_FLAGS.lineUnresolved);

  const overdue = [];
  const remediationLate = today > finding.remediationDueOn && !allAsserted && !CLOSED_STATES.includes(state);
  const verificationLate = today > finding.verifyDueOn && !CLOSED_STATES.includes(state);
  if (remediationLate) overdue.push(AFR_FLAGS.remediationOverdue);
  if (verificationLate) overdue.push(AFR_FLAGS.verificationOverdue);

  const closed = CLOSED_STATES.includes(state);
  const ageDays = closed ? null : Math.max(0, daysBetween(finding.openedOn, today));

  return {
    id: finding.id,
    controlRef: finding.controlRef,
    scopeRef: finding.scopeRef,
    criteriaRef: finding.criteriaRef,
    source: finding.source,
    severity: finding.severity,
    statement: finding.statement,
    declaredById: finding.declaredById,
    openedOn: finding.openedOn,
    remediationDueOn: finding.remediationDueOn,
    verifyDueOn: finding.verifyDueOn,
    createdAt: finding.createdAt,
    accountable,
    state,
    closed,
    overdue,
    flags,
    ageDays,
    ageBucket: afrAgeBucket(ageDays),
    allAssertedOn,
    allVerifiedOn,
    remediatedOnTime: allAssertedOn ? allAssertedOn <= finding.remediationDueOn : null,
    verifiedOnTime: allVerifiedOn ? allVerifiedOn <= finding.verifyDueOn : null,
    acceptedById: accept?.actorId || null,
    acceptedOn: accept ? String(accept.at).slice(0, 10) : null,
    acceptReason: accept?.reason || null,
    acceptReviewOn: accept?.reviewOn || null,
    recurrence: { recurrent: false, reobserved: false, priorFindingId: null, priorOpenedOn: null, priorState: null, priorClosedOn: null },
  };
}

/**
 * The kernel. `state` is the whole workspace; `now` is injected. Derived
 * nothing is stored and the input is never mutated.
 */
export function buildAssuranceFindings(state, { now = new Date() } = {}) {
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const today = dayKey(at);
  const nowIso = at.toISOString();
  const warnings = [];

  const findings = normalizeFindings(state?.assuranceFindings, warnings);
  const acts = normalizeFindingActs(state?.assuranceFindingActs, findings, warnings);
  const markers = normalizeFindingMarkers(state?.assuranceFindingMarkers, warnings);
  const lines = lineIndex(state, nowIso);

  const rows = findings
    .map((finding) => deriveRow(finding, acts, lines, today))
    .sort((a, b) => String(b.openedOn).localeCompare(String(a.openedOn))
      || String(b.createdAt).localeCompare(String(a.createdAt))
      || String(a.id).localeCompare(String(b.id)));

  /* Recurrence: read from the record, never inferred from wording. */
  const byKey = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(row);
  }
  let recurrentN = 0;
  let reobservedN = 0;
  for (const group of byKey.values()) {
    const ordered = [...group].sort((a, b) => String(a.openedOn).localeCompare(String(b.openedOn))
      || String(a.createdAt).localeCompare(String(b.createdAt))
      || String(a.id).localeCompare(String(b.id)));
    ordered.forEach((row, index) => {
      const priors = ordered.slice(0, index).filter((prior) => (
        daysBetween(prior.openedOn, row.openedOn) <= L.recurrenceWindowDays
      ));
      const verifiedPrior = [...priors].reverse().find((prior) => prior.state === 'closed-verified') || null;
      const acceptedPrior = [...priors].reverse().find((prior) => prior.state === 'closed-accepted') || null;
      if (verifiedPrior) {
        row.recurrence = {
          recurrent: true,
          reobserved: false,
          priorFindingId: verifiedPrior.id,
          priorOpenedOn: verifiedPrior.openedOn,
          priorState: verifiedPrior.state,
          priorClosedOn: verifiedPrior.allVerifiedOn || null,
        };
        row.flags.push(AFR_FLAGS.recurrent);
        recurrentN += 1;
        return;
      }
      if (acceptedPrior) {
        row.recurrence = {
          recurrent: false,
          reobserved: true,
          priorFindingId: acceptedPrior.id,
          priorOpenedOn: acceptedPrior.openedOn,
          priorState: acceptedPrior.state,
          priorClosedOn: acceptedPrior.acceptedOn || null,
        };
        row.flags.push(AFR_FLAGS.reobserved);
        reobservedN += 1;
      }
    });
  }

  const byState = Object.fromEntries(AFR_STATE_KEYS.map((key) => [key, 0]));
  const bySeverity = Object.fromEntries(AFR_SEVERITY_KEYS.map((key) => [key, 0]));
  const bySource = Object.fromEntries(AFR_SOURCE_KEYS.map((key) => [key, 0]));
  const aging = Object.fromEntries(AFR_AGE_BUCKETS.map((row) => [row.key, 0]));
  let openN = 0;
  let closedN = 0;
  let overdueRemediation = 0;
  let overdueVerification = 0;
  let owedRemediation = 0;
  let onTimeRemediation = 0;
  let owedVerification = 0;
  let onTimeVerification = 0;

  for (const row of rows) {
    if (byState[row.state] !== undefined) byState[row.state] += 1;
    if (bySeverity[row.severity] !== undefined) bySeverity[row.severity] += 1;
    if (bySource[row.source] !== undefined) bySource[row.source] += 1;
    if (row.closed) closedN += 1;
    else {
      openN += 1;
      if (row.ageBucket && aging[row.ageBucket] !== undefined) aging[row.ageBucket] += 1;
    }
    if (row.overdue.includes(AFR_FLAGS.remediationOverdue)) overdueRemediation += 1;
    if (row.overdue.includes(AFR_FLAGS.verificationOverdue)) overdueVerification += 1;
    // The on-time rates count only what the calendar has already put to the
    // test, and never a finding closed by acceptance — acceptance is a
    // different route, not a late remediation.
    if (row.state !== 'closed-accepted' && today >= row.remediationDueOn) {
      owedRemediation += 1;
      if (row.remediatedOnTime === true) onTimeRemediation += 1;
    }
    if (row.state !== 'closed-accepted' && today >= row.verifyDueOn) {
      owedVerification += 1;
      if (row.verifiedOnTime === true) onTimeVerification += 1;
    }
  }

  /**
   * The accountable-line roll-up is NON-ADDITIVE by construction: a finding
   * naming two lines is counted under both. The row count is therefore not a
   * partition of the finding total and the page says so.
   */
  const lineMap = new Map();
  for (const row of rows) {
    for (const entry of row.accountable) {
      const key = `${entry.personId}|${entry.lineId}`;
      if (!lineMap.has(key)) {
        lineMap.set(key, {
          key,
          personId: entry.personId,
          lineId: entry.lineId,
          findings: 0,
          open: 0,
          closed: 0,
          overdue: 0,
          recurrent: 0,
          verified: 0,
          unresolved: 0,
        });
      }
      const cell = lineMap.get(key);
      cell.findings += 1;
      if (row.closed) cell.closed += 1;
      else cell.open += 1;
      if (row.state === 'closed-verified') cell.verified += 1;
      if (row.overdue.length) cell.overdue += 1;
      if (row.recurrence.recurrent) cell.recurrent += 1;
      if (!entry.resolved) cell.unresolved += 1;
    }
  }
  const lineRows = [...lineMap.values()].sort((a, b) => (b.findings - a.findings)
    || String(a.key).localeCompare(String(b.key)));

  const totalDropped = (state?.assuranceFindings && Array.isArray(state.assuranceFindings) ? state.assuranceFindings.length - findings.length : 0)
    + (state?.assuranceFindingActs && Array.isArray(state.assuranceFindingActs) ? state.assuranceFindingActs.length - acts.length : 0);

  const counts = {
    findings: rows.length,
    open: openN,
    closed: closedN,
    byState,
    bySeverity,
    bySource,
    aging,
    overdue: { remediation: overdueRemediation, verification: overdueVerification },
    recurrent: recurrentN,
    reobserved: reobservedN,
    rates: {
      remediation: {
        owed: owedRemediation,
        onTime: onTimeRemediation,
        onTimeBp: afrBp(onTimeRemediation, owedRemediation),
      },
      verification: {
        owed: owedVerification,
        onTime: onTimeVerification,
        onTimeBp: afrBp(onTimeVerification, owedVerification),
      },
    },
    droppedRows: totalDropped,
    unresolvedLines: rows.reduce((sum, row) => sum + row.accountable.filter((entry) => !entry.resolved).length, 0),
    markers: markers.length,
  };

  const partitioned = AFR_STATE_KEYS.reduce((sum, key) => sum + (byState[key] || 0), 0);

  return {
    engine: AFR_ENGINE_VERSION,
    adr: AFR_ADR,
    rule: AFR_RULE_ID,
    asOf: today,
    rows,
    lines: lineRows,
    counts,
    markers,
    warnings,
    /** The printed state counts add to the finding total. */
    partitionReconciles: partitioned === rows.length,
    /** No act was refused and no stored row was dropped by the loader. */
    figuresComplete: totalDropped === 0,
    method: AFR_METHOD,
  };
}

export default buildAssuranceFindings;
