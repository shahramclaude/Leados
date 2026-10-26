/**
 * app/core/domain/export-governance.js — Pre-export Data Minimisation,
 * Retention & Contextual-Integrity Disclosure Engine.
 *
 * Theoretical & Regulatory Foundations:
 *  - GDPR Art. 5(1)(c) Data Minimisation & Art. 5(1)(e) Storage Limitation:
 *    personal data (especially rejected/closed candidate evaluations, HIRE-08)
 *    should not be serialized out into portable unencrypted files beyond its
 *    active decision purpose without deliberate review or pruning.
 *  - Nissenbaum (2004, 2009) Contextual Integrity:
 *    information recorded safely inside a manager's private local notebook
 *    (confidential mediation notes, or candid Mendelow/Tsebelis stakeholder
 *    assessments naming organizational "blockers" and "skeptical" veto players)
 *    violates contextual norms when exported upwards or shared across devices
 *    without explicit scope awareness or redaction.
 *
 * Pure module: inspects `state` and returns deterministic structured findings;
 * never mutates `state` or touches DOM/storage.
 */

import { isOpenCandidate, retentionReview } from './hiring.js';

export const SENSITIVE_STANCES = Object.freeze(['skeptical', 'blocker']);

export const EXPORT_FORMATS = Object.freeze([
  'json-full',
  'json-operational',
  'json-encrypted',
  'csv',
]);

export function isConflictAuditEvent(event) {
  if (!event || typeof event !== 'object') return false;
  return event.entity === 'conflict' || (typeof event.type === 'string' && event.type.startsWith('conflict.'));
}

export function isCandidateAuditEvent(event, candidateIdSet = null) {
  if (!event || typeof event !== 'object') return false;
  const isCandidateType = event.entity === 'candidate' || (typeof event.type === 'string' && event.type.startsWith('candidate.'));
  if (!isCandidateType) return false;
  if (!candidateIdSet) return true;
  return Boolean(event.entityId && candidateIdSet.has(event.entityId));
}

/**
 * Scan case & organizational-change stakeholder coalitions for politically
 * sensitive assessments (skeptical/blocker stances, explicit Tsebelis veto
 * flags, or private briefing/key-message notes).
 */
export function scanSensitiveStakeholders(state) {
  const caseRows = [];
  let caseStakeholderTotal = 0;
  for (const c of state?.cases || []) {
    if (!c || !Array.isArray(c.stakeholders)) continue;
    for (const s of c.stakeholders) {
      if (!s || !String(s.name || '').trim()) continue;
      caseStakeholderTotal += 1;
      const sensitiveStance = SENSITIVE_STANCES.includes(s.stance);
      const hasNotes = Boolean(String(s.keyMessage || s.notes || '').trim());
      if (sensitiveStance || hasNotes) {
        caseRows.push({
          sourceType: 'case',
          sourceId: c.id,
          sourceTitle: c.title,
          stakeholderName: s.name,
          stance: s.stance || 'neutral',
          vetoPlayer: false,
          sensitiveStance,
          hasNotes,
        });
      }
    }
  }

  const changeRows = [];
  let changeCoalitionTotal = 0;
  for (const chg of state?.changes || []) {
    if (!chg || !Array.isArray(chg.coalition)) continue;
    for (const m of chg.coalition) {
      if (!m || !String(m.name || '').trim()) continue;
      changeCoalitionTotal += 1;
      const sensitiveStance = SENSITIVE_STANCES.includes(m.stance);
      const vetoPlayer = Boolean(m.vetoPlayer);
      const hasNotes = Boolean(String(m.keyMessage || '').trim());
      if (sensitiveStance || vetoPlayer || hasNotes) {
        changeRows.push({
          sourceType: 'change',
          sourceId: chg.id,
          sourceTitle: chg.title,
          stakeholderName: m.name,
          stance: m.stance || 'neutral',
          vetoPlayer,
          sensitiveStance,
          hasNotes,
        });
      }
    }
  }

  const allSensitive = [...caseRows, ...changeRows];
  const adverseStanceCount = allSensitive.filter((r) => r.sensitiveStance).length;
  const vetoPlayerCount = changeRows.filter((r) => r.vetoPlayer).length;
  const unalignedVetoCount = changeRows.filter((r) => r.vetoPlayer && !['champion', 'supportive'].includes(r.stance)).length;
  const notesCount = allSensitive.filter((r) => r.hasNotes).length;

  return {
    totalMapped: caseStakeholderTotal + changeCoalitionTotal,
    caseStakeholderTotal,
    changeCoalitionTotal,
    sensitiveRecords: allSensitive,
    caseSensitiveCount: caseRows.length,
    changeSensitiveCount: changeRows.length,
    adverseStanceCount,
    vetoPlayerCount,
    unalignedVetoCount,
    notesCount,
    hasPoliticalRisk: adverseStanceCount > 0 || unalignedVetoCount > 0,
  };
}

/**
 * Evaluate what sensitive, retention-overdue, or confidential records will be
 * included in a proposed JSON or CSV export under the chosen redaction flags.
 */
export function inspectExportGovernance(
  state,
  {
    format = 'json-full',
    csvScope = null,
    redactConflicts = false,
    pruneOverdueCandidates = false,
    redactStakeholderStances = false,
    now = new Date(),
  } = {},
) {
  const safeState = state && typeof state === 'object' ? state : {};
  const isJson = format === 'json-full' || format === 'json-operational' || format === 'json-encrypted';
  const effectiveRedactConflicts = format === 'json-operational' ? true : Boolean(redactConflicts);

  const retention = retentionReview(safeState, { now, settings: safeState.settings || {} });
  const candidates = Array.isArray(safeState.candidates) ? safeState.candidates : [];
  const openCandidateCount = candidates.filter(isOpenCandidate).length;
  const settledCandidateCount = candidates.length - openCandidateCount;
  const signalCount = candidates.reduce((sum, c) => sum + (Array.isArray(c?.signals) ? c.signals.length : 0), 0);
  const overdueCandidateIds = retention.due.map((row) => row.candidate.id);

  const conflicts = Array.isArray(safeState.conflicts) ? safeState.conflicts : [];
  const events = Array.isArray(safeState.events) ? safeState.events : [];
  const conflictEventCount = events.filter(isConflictAuditEvent).length;

  const stakeholderScan = scanSensitiveStakeholders(safeState);

  const includesConflicts =
    (isJson && !effectiveRedactConflicts) ||
    (format === 'csv' && csvScope === 'conflicts');

  const includesCandidates =
    isJson ||
    (format === 'csv' && csvScope === 'hiring');

  const includesCaseStakeholders =
    isJson ||
    (format === 'csv' && csvScope === 'cases');

  const includesChangeStakeholders =
    isJson ||
    (format === 'csv' && csvScope === 'changes');

  const findings = [];

  // 1. Confidential interpersonal conflicts (CFL privacy wall)
  if (includesConflicts && conflicts.length > 0) {
    findings.push({
      code: 'EXPORT-CFL-01',
      category: 'conflicts',
      severity: format === 'json-encrypted' ? 'caution' : 'high',
      count: conflicts.length,
      title: `${conflicts.length} confidential conflict record${conflicts.length === 1 ? '' : 's'} included`,
      detail: format === 'json-encrypted'
        ? `This encrypted backup carries ${conflicts.length} private mediation record${conflicts.length === 1 ? '' : 's'} and ${conflictEventCount} conflict log trace${conflictEventCount === 1 ? '' : 's'}. Anyone given the passphrase can read both participants' perspectives.`
        : `This file serializes ${conflicts.length} confidential conflict record${conflicts.length === 1 ? '' : 's'} in plaintext. Use an Operational copy if moving workspace data across devices or sharing upwards.`,
      route: '#/conflicts',
      canRedactInPlace: isJson,
      redactFlag: 'redactConflicts',
    });
  }

  // 2. Overdue candidate retention records (HIRE-08 / GDPR storage limitation)
  if (includesCandidates && !pruneOverdueCandidates && retention.enabled && retention.due.length > 0) {
    findings.push({
      code: 'EXPORT-RET-01',
      category: 'retention',
      severity: 'high',
      count: retention.due.length,
      title: `${retention.due.length} candidate record${retention.due.length === 1 ? '' : 's'} past your ${retention.windowDays}-day retention window (HIRE-08)`,
      detail: `Oldest overdue evaluation is ${retention.oldestDays} days old${retention.exempt.length ? ` (${retention.exempt.length} additional “keep in touch” record${retention.exempt.length === 1 ? ' is' : 's are'} retained on purpose)` : ''}. Exporting copies stale candidate PII and interview ratings into an external file that LeadOS can no longer help you clean up later.`,
      route: '#/hiring',
      canRedactInPlace: true,
      redactFlag: 'pruneOverdueCandidates',
    });
  } else if (includesCandidates && !retention.enabled && settledCandidateCount > 0) {
    findings.push({
      code: 'EXPORT-RET-02',
      category: 'retention',
      severity: 'caution',
      count: settledCandidateCount,
      title: `Candidate retention reminder is switched off (${settledCandidateCount} closed candidate record${settledCandidateCount === 1 ? '' : 's'} included)`,
      detail: 'Because candidate retention is set to 0 days, closed candidate evaluations are exported indefinitely without an age check.',
      route: '#/hiring',
      canRedactInPlace: false,
      redactFlag: null,
    });
  }

  // 3. Named candidate & interviewer assessments on Hiring CSV
  if (format === 'csv' && csvScope === 'hiring') {
    const exportedCandidates = pruneOverdueCandidates
      ? Math.max(0, candidates.length - overdueCandidateIds.length)
      : candidates.length;
    findings.push({
      code: 'EXPORT-HIR-01',
      category: 'hiring',
      severity: 'caution',
      count: exportedCandidates,
      title: `Sensitive selection & candidate dataset (${exportedCandidates} candidate${exportedCandidates === 1 ? '' : 's'}, ${signalCount} scored signal${signalCount === 1 ? '' : 's'})`,
      detail: 'Contains named applicants, Bayesian posterior estimates, evidence-gap acknowledgements, and written hiring/rejection rationales.',
      route: '#/hiring',
      canRedactInPlace: false,
      redactFlag: null,
    });
  }

  // 4. Sensitive stakeholder stances & Tsebelis veto-player assessments
  if (!redactStakeholderStances && (includesCaseStakeholders || includesChangeStakeholders)) {
    const relevantRecords = stakeholderScan.sensitiveRecords.filter((r) =>
      (r.sourceType === 'case' && includesCaseStakeholders) ||
      (r.sourceType === 'change' && includesChangeStakeholders),
    );
    const relevantAdverse = relevantRecords.filter((r) => r.sensitiveStance).length;
    const relevantUnalignedVeto = relevantRecords.filter(
      (r) => r.sourceType === 'change' && r.vetoPlayer && !['champion', 'supportive'].includes(r.stance),
    ).length;
    const relevantNotes = relevantRecords.filter((r) => r.hasNotes).length;

    if (relevantAdverse > 0 || relevantUnalignedVeto > 0 || relevantNotes > 0) {
      const scopePhrase = format === 'csv'
        ? `the ${csvScope} CSV`
        : 'this workspace export';
      findings.push({
        code: 'EXPORT-STK-01',
        category: 'stakeholders',
        severity: format === 'json-encrypted' ? 'info' : 'caution',
        count: relevantRecords.length,
        title: `Candid stakeholder coalition assessments in ${scopePhrase} (${relevantAdverse} skeptical/blocker stance${relevantAdverse === 1 ? '' : 's'}${relevantUnalignedVeto ? `, ${relevantUnalignedVeto} unaligned veto gatekeeper${relevantUnalignedVeto === 1 ? '' : 's'}` : ''}${relevantNotes ? `, ${relevantNotes} private briefing note${relevantNotes === 1 ? '' : 's'}` : ''})`,
        detail: 'Mendelow Power × Interest and Tsebelis veto-player notes are designed for private leadership planning. Scrubbing stances resets exported stances to neutral and clears private briefing notes in the exported copy.',
        route: includesChangeStakeholders && stakeholderScan.changeSensitiveCount > 0 ? '#/changes' : '#/cases',
        canRedactInPlace: true,
        redactFlag: 'redactStakeholderStances',
      });
    }
  }

  const hasHigh = findings.some((f) => f.severity === 'high');
  const hasCaution = findings.some((f) => f.severity === 'caution');
  const severity = hasHigh ? 'high' : hasCaution ? 'caution' : findings.length ? 'info' : 'clean';

  // Require an explicit pre-export disclosure step whenever high or caution
  // governance findings apply to the file about to leave the browser.
  const requiresDisclosure = findings.some((f) => f.severity === 'high' || f.severity === 'caution');

  return {
    format,
    csvScope,
    redactions: {
      redactConflicts: effectiveRedactConflicts,
      pruneOverdueCandidates: Boolean(pruneOverdueCandidates),
      redactStakeholderStances: Boolean(redactStakeholderStances),
    },
    requiresDisclosure,
    severity,
    findings,
    overdueCandidateIds,
    retention,
    counts: {
      conflicts: conflicts.length,
      conflictEvents: conflictEventCount,
      candidatesTotal: candidates.length,
      candidatesOpen: openCandidateCount,
      candidatesSettled: settledCandidateCount,
      candidatesOverdue: retention.due.length,
      candidatesExempt: retention.exempt.length,
      candidateSignals: signalCount,
      stakeholdersMapped: stakeholderScan.totalMapped,
      stakeholdersAdverseStance: stakeholderScan.adverseStanceCount,
      vetoPlayersTotal: stakeholderScan.vetoPlayerCount,
      vetoPlayersUnaligned: stakeholderScan.unalignedVetoCount,
    },
  };
}
