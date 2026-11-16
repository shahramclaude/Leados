/**
 * app/core/domain/domainSense.js — the pure reader for ADR-0228
 * (Decision-Domain Sensing Register, Cynefin, `RULE-DSN-01`).
 *
 * `buildDomainSense(state, { now })` is a pure function of the stored decisions
 * and acts plus an injected clock. Acts replay in chronological order (ties by
 * act id, so input order never matters). Nothing is written and no domain or
 * fit status is stored; both are re-derived on every read.
 *
 * Rules, in order:
 *   assess  — a declared panel member, on the line declared for them, once, and
 *             never the owner. The stated domain must be supported by the evidence
 *             basis that goes with it. Anything else is refused and printed.
 *   state   — quorum is two readings from two distinct lines. A domain is stated
 *             only when every counted reading names the same domain. A split is
 *             printed as `domain-contested` and nobody is picked.
 *   commit  — the owner only, once. A second commitment is refused.
 *   fit     — judged only against an AGREED domain, comparing the committed mode
 *             with the one mode that fits it. Reported, never enforced.
 */

import {
  DSN_ADR,
  DSN_DOMAINS,
  DSN_ENGINE_VERSION,
  DSN_FIT,
  DSN_FIT_STATES,
  DSN_BASIS_FOR_DOMAIN,
  DSN_FLAGS,
  DSN_LIMITS as L,
  DSN_METHOD,
  DSN_REFUSALS,
  DSN_RULE_ID,
  DSN_STATES,
  DSN_DOMAIN_KEYS,
} from './domainSenseRegistry.js';
import { normalizeDecisionActs, normalizeDecisions } from './domainSenseSchema.js';

const DAY_MS = 86400000;
const STATE_LABEL = Object.freeze(Object.fromEntries(DSN_STATES.map((row) => [row.key, row.label])));
const FIT_LABEL = Object.freeze(Object.fromEntries(DSN_FIT_STATES.map((row) => [row.key, row.label])));
const DOMAIN_LABEL = Object.freeze(Object.fromEntries(DSN_DOMAINS.map((row) => [row.key, row.label])));

function toMs(value, name) {
  const ms = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(ms)) throw new TypeError(`buildDomainSense: \`${name}\` must be a valid instant`);
  return ms;
}

function countBy(list, key, init) {
  const out = { ...init };
  for (const row of list) out[row[key]] = (out[row[key]] || 0) + 1;
  return out;
}

function basisSummary(basis) {
  if (basis.kind === 'precedent') return `${basis.cases} comparable dated cases`;
  if (basis.kind === 'analysis') return `analysis: ${basis.analysisRef}`;
  if (basis.kind === 'probe') return `${basis.probes} dated probe(s) read`;
  if (basis.kind === 'onset') return `onset ${basis.onsetAt}`;
  return 'no basis named';
}

function evaluateAssessment(act, decision, readingsByAssessor, refusals) {
  const refuse = (reason) => { refusals.push({ actId: act.id, decisionId: decision.id, kind: act.kind, reason }); return false; };
  if (Date.parse(act.at) < Date.parse(decision.openedAt)) return refuse(DSN_REFUSALS.beforeOpened);
  if (act.actorId === decision.ownerId) return refuse(DSN_REFUSALS.ownerSelfAssessment);
  const seat = decision.panel.find((row) => row.memberId === act.actorId);
  if (!seat) return refuse(DSN_REFUSALS.notOnPanel);
  if (seat.lineId !== act.lineId) return refuse(DSN_REFUSALS.lineMismatch);
  if (readingsByAssessor.has(act.actorId)) return refuse(DSN_REFUSALS.alreadyAssessed);
  if (act.basis.kind !== DSN_BASIS_FOR_DOMAIN[act.domain]) return refuse(DSN_REFUSALS.basisNotSupportingDomain);
  readingsByAssessor.set(act.actorId, act);
  return true;
}

function evaluateDecision(decision, acts, asOfMs, refusals) {
  const openedMs = Date.parse(decision.openedAt);
  const senseByMs = Date.parse(decision.senseByAt);
  const readingsByAssessor = new Map();
  let commit = null;

  for (const act of acts) {
    if (act.kind === 'assess') {
      evaluateAssessment(act, decision, readingsByAssessor, refusals);
      continue;
    }
    const refuse = (reason) => refusals.push({ actId: act.id, decisionId: decision.id, kind: act.kind, reason });
    if (Date.parse(act.at) < openedMs) { refuse(DSN_REFUSALS.beforeOpened); continue; }
    if (act.actorId !== decision.ownerId) { refuse(DSN_REFUSALS.notOwner); continue; }
    if (commit) { refuse(DSN_REFUSALS.alreadyCommitted); continue; }
    commit = { id: act.id, actorId: act.actorId, mode: act.mode, rationale: act.rationale, at: act.at };
  }

  const readings = [...readingsByAssessor.values()].sort((a, b) => (a.actorId < b.actorId ? -1 : a.actorId > b.actorId ? 1 : 0));
  const readingLines = new Set(readings.map((row) => row.lineId));
  const panelLines = new Set(decision.panel.map((row) => row.lineId));
  const quorumMet = readings.length >= L.quorumAssessors && readingLines.size >= L.quorumLines;
  const domainCounts = countBy(readings, 'domain', Object.fromEntries(DSN_DOMAIN_KEYS.map((key) => [key, 0])));
  const distinctDomains = Object.keys(domainCounts).filter((key) => domainCounts[key] > 0);

  let state;
  let reason = '';
  let domain = null;
  if (readings.length === 0) {
    state = 'awaiting-readings';
  } else if (!quorumMet) {
    state = 'awaiting-quorum';
    if (panelLines.size < L.quorumLines) reason = 'panel-single-line: the declared panel sits on one line, so quorum cannot be met';
    else if (readings.length < L.quorumAssessors) reason = 'too-few-readings';
    else reason = 'every-reading-from-one-line';
  } else if (distinctDomains.length === 1) {
    state = 'domain-agreed';
    domain = distinctDomains[0];
  } else {
    state = 'domain-contested';
    reason = `panel disagrees: ${distinctDomains.sort().join(' / ')} — nobody is picked`;
  }

  const flags = [];
  if (state !== 'domain-agreed' && asOfMs > senseByMs) flags.push(DSN_FLAGS.senseOverdue);
  if (readings.length > 0) {
    const latestMs = Math.max(...readings.map((row) => Date.parse(row.at)));
    if (state !== 'awaiting-readings' && asOfMs - latestMs > L.staleDays * DAY_MS) flags.push(DSN_FLAGS.readingStale);
  }

  let fit;
  let fitReason = '';
  let expectedMode = null;
  if (state !== 'domain-agreed') {
    fit = 'not-readable';
    fitReason = 'domain not agreed';
  } else {
    expectedMode = DSN_FIT[domain];
    if (!commit) fit = 'owed';
    else if (commit.mode === expectedMode) fit = 'fit';
    else { fit = 'mismatch'; fitReason = `committed ${commit.mode}; the ${domain} domain fits ${expectedMode}`; }
  }

  return {
    id: decision.id,
    title: decision.title,
    ownerId: decision.ownerId,
    openedAt: decision.openedAt,
    senseByAt: decision.senseByAt,
    panel: decision.panel.map((seat) => {
      const reading = readingsByAssessor.get(seat.memberId);
      return { memberId: seat.memberId, lineId: seat.lineId, read: Boolean(reading) };
    }),
    readings: readings.map((row) => ({
      assessorId: row.actorId,
      lineId: row.lineId,
      domain: row.domain,
      basisKind: row.basis.kind,
      basisSummary: basisSummary(row.basis),
      at: row.at,
    })),
    quorum: {
      readings: readings.length,
      lines: readingLines.size,
      requiredReadings: L.quorumAssessors,
      requiredLines: L.quorumLines,
      met: quorumMet,
    },
    domainCounts,
    state,
    stateLabel: STATE_LABEL[state],
    reason,
    domain,
    domainLabel: domain ? DOMAIN_LABEL[domain] : null,
    flags,
    commit: commit ? { mode: commit.mode, actorId: commit.actorId, rationale: commit.rationale, at: commit.at } : null,
    expectedMode,
    fit,
    fitLabel: FIT_LABEL[fit],
    fitReason,
  };
}

/**
 * Build the sensing register from stored state.
 *   state.domainDecisions — declared decisions
 *   state.domainSenseActs — readings and commitments
 */
export function buildDomainSense(state, { now } = {}) {
  const asOfMs = toMs(now, 'now');
  const warnings = [];
  const decisions = normalizeDecisions(state?.domainDecisions, warnings);
  const acts = normalizeDecisionActs(state?.domainSenseActs, decisions, warnings);
  const sortedActs = [...acts].sort((a, b) => {
    const diff = Date.parse(a.at) - Date.parse(b.at);
    if (diff !== 0) return diff;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const refusals = [];
  const rows = decisions
    .map((decision) => evaluateDecision(decision, sortedActs.filter((act) => act.decisionId === decision.id), asOfMs, refusals))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const stateCounts = countBy(rows, 'state', Object.fromEntries(DSN_STATES.map((row) => [row.key, 0])));
  const fitCounts = countBy(rows, 'fit', Object.fromEntries(DSN_FIT_STATES.map((row) => [row.key, 0])));
  const agreedDomains = countBy(rows.filter((row) => row.domain), 'domain', Object.fromEntries(DSN_DOMAIN_KEYS.map((key) => [key, 0])));
  const refusalCounts = countBy(refusals, 'reason', {});
  const stateCountsReconcile = DSN_STATES.reduce((sum, row) => sum + stateCounts[row.key], 0) === rows.length
    && Object.values(agreedDomains).reduce((sum, n) => sum + n, 0) === stateCounts['domain-agreed'];
  const fitCountsReconcile = DSN_FIT_STATES.reduce((sum, row) => sum + fitCounts[row.key], 0) === rows.length;

  return {
    engine: DSN_ENGINE_VERSION,
    adr: DSN_ADR,
    rule: DSN_RULE_ID,
    asOf: new Date(asOfMs).toISOString(),
    rows,
    counts: {
      decisions: rows.length,
      states: stateCounts,
      fit: fitCounts,
      agreedDomains,
      readings: rows.reduce((sum, row) => sum + row.readings.length, 0),
      commitments: rows.filter((row) => row.commit).length,
    },
    refusals,
    refusalCounts,
    warnings,
    // Two separate claims, reported separately (Bulletproof mandate).
    stateCountsReconcile,
    fitCountsReconcile,
    figuresComplete: refusals.length === 0 && warnings.length === 0,
    method: DSN_METHOD,
  };
}
