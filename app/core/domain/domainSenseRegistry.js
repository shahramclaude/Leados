/**
 * app/core/domain/domainSenseRegistry.js — closed vocabulary for the
 * Decision-Domain Sensing Register (Cynefin, ADR-0228, `RULE-DSN-01`).
 *
 * This is a leadership discipline record, not a classifier that decides for
 * anyone. A director in a matrix declares a decision; a panel drawn from more
 * than one line states which kind of problem it believes the matter is, and
 * shows the evidence it has for saying so; the owner then commits to a decision
 * mode. The reader reports whether the panel agrees, whether the committed mode
 * fits the agreed domain, and where it does not. It never overrides either.
 */

export const DSN_ENGINE_VERSION = 'decision-domain-sensing-2026.11-v1';
export const DSN_ADR = 'ADR-0228';
export const DSN_RULE_ID = 'RULE-DSN-01';

export const DSN_LIMITS = Object.freeze({
  decisions: 300,
  acts: 3000,
  panelMin: 2,
  panelMax: 8,
  titleMin: 24,
  titleMax: 200,
  textMin: 24,
  textMax: 600,
  refMin: 3,
  refMax: 120,
  senseMinDays: 1,
  senseMaxDays: 60,
  staleDays: 30,
  quorumAssessors: 2,
  quorumLines: 2,
  precedentMin: 3,
  precedentMax: 500,
  probeMin: 1,
  probeMax: 500,
  dayMin: '2000-01-01',
  dayMax: '2100-12-31',
});

export const DSN_ACT_KINDS = Object.freeze(['assess', 'commit']);

/**
 * Cynefin's five domains (Snowden & Boone, "A Leader's Framework for Decision
 * Making", HBR, 2007). `clear` was previously named `obvious`.
 */
export const DSN_DOMAINS = Object.freeze([
  Object.freeze({ key: 'clear', label: 'Clear — cause and effect are obvious and repeatable', sequence: 'sense → categorise → respond' }),
  Object.freeze({ key: 'complicated', label: 'Complicated — cause and effect are knowable by expert analysis', sequence: 'sense → analyse → respond' }),
  Object.freeze({ key: 'complex', label: 'Complex — cause and effect are visible only in retrospect', sequence: 'probe → sense → respond' }),
  Object.freeze({ key: 'chaotic', label: 'Chaotic — no cause-and-effect relationship can be perceived', sequence: 'act → sense → respond' }),
  Object.freeze({ key: 'disorder', label: 'Disorder — the panel cannot yet say which domain applies', sequence: 'decompose, then sense each part' }),
]);
export const DSN_DOMAIN_KEYS = Object.freeze(DSN_DOMAINS.map((row) => row.key));

/** The decision modes an owner may commit to. Closed vocabulary. */
export const DSN_MODES = Object.freeze([
  Object.freeze({ key: 'standard-practice', label: 'Apply the established good practice' }),
  Object.freeze({ key: 'expert-analysis', label: 'Analyse with named expertise before committing' }),
  Object.freeze({ key: 'safe-to-fail-probe', label: 'Run small reversible probes and read the results before scaling' }),
  Object.freeze({ key: 'stabilise-first', label: 'Act at once to restore order, then sense again' }),
  Object.freeze({ key: 'decompose', label: 'Split the matter into parts and sense each part on its own' }),
]);
export const DSN_MODE_KEYS = Object.freeze(DSN_MODES.map((row) => row.key));

/**
 * The mode that fits an AGREED domain. One mode per domain, by construction:
 * a mode that fits two domains would let an owner pick the reading after the fact.
 */
export const DSN_FIT = Object.freeze({
  clear: 'standard-practice',
  complicated: 'expert-analysis',
  complex: 'safe-to-fail-probe',
  chaotic: 'stabilise-first',
  disorder: 'decompose',
});

/**
 * The evidence basis each domain requires. A vote whose basis does not support
 * its domain is refused with a printed reason and never counted.
 */
export const DSN_BASIS_FOR_DOMAIN = Object.freeze({
  clear: 'precedent',
  complicated: 'analysis',
  complex: 'probe',
  chaotic: 'onset',
  disorder: 'unsorted',
});
export const DSN_BASIS_KINDS = Object.freeze(['precedent', 'analysis', 'probe', 'onset', 'unsorted']);

export const DSN_STATES = Object.freeze([
  Object.freeze({ key: 'awaiting-readings', label: 'No panel reading yet' }),
  Object.freeze({ key: 'awaiting-quorum', label: 'Too few readings, or every reading comes from one line — no domain can be stated' }),
  Object.freeze({ key: 'domain-contested', label: 'Quorum met — the panel disagrees on the domain; the split is printed, nobody picks' }),
  Object.freeze({ key: 'domain-agreed', label: 'Quorum met — every counted reading names the same domain' }),
]);
export const DSN_STATE_KEYS = Object.freeze(DSN_STATES.map((row) => row.key));

export const DSN_FIT_STATES = Object.freeze([
  Object.freeze({ key: 'fit', label: 'Committed mode fits the agreed domain' }),
  Object.freeze({ key: 'mismatch', label: 'Committed mode does not fit the agreed domain — printed with the mode that would fit' }),
  Object.freeze({ key: 'owed', label: 'Domain agreed; the owner has not yet committed a mode' }),
  Object.freeze({ key: 'not-readable', label: 'Fit cannot be judged until the domain is agreed' }),
]);
export const DSN_FIT_KEYS = Object.freeze(DSN_FIT_STATES.map((row) => row.key));

export const DSN_FLAGS = Object.freeze({
  senseOverdue: 'sense-overdue',
  readingStale: 'reading-stale',
});

export const DSN_REFUSALS = Object.freeze({
  unknownDecision: 'unknown-decision',
  beforeOpened: 'before-opened',
  notOnPanel: 'not-on-panel',
  lineMismatch: 'line-mismatch',
  ownerSelfAssessment: 'owner-self-assessment',
  alreadyAssessed: 'already-assessed-by-actor',
  basisNotSupportingDomain: 'basis-does-not-support-domain',
  notOwner: 'not-owner',
  alreadyCommitted: 'already-committed',
});

export const DSN_METHOD = Object.freeze({
  engine: DSN_ENGINE_VERSION,
  adr: DSN_ADR,
  frameworks: Object.freeze([
    'Cynefin (Snowden & Boone, HBR 2007): five domains — clear, complicated, complex, chaotic, disorder — each with a prescribed decision sequence. The domain is a property of the problem as sensed, so it is read from evidence and can change.',
    'Evidence matched to domain: clear needs repeated precedent; complicated needs a named analysis; complex needs dated probe results (cause visible only in retrospect); chaotic needs a declared onset. A vote without matching evidence is refused, so a feeling cannot pass as a domain.',
    'Matrix accountability (ADR-0140): a cross-line decision cannot be sensed from one line. Quorum requires readings from at least two distinct lines, each reading carrying the line it was given in the panel. A split is printed, never resolved by majority.',
    'Separation of duties: the decision owner commits a mode but cannot assess their own decision. The party who benefits from calling a matter clear or complicated does not grade it.',
    'Fit reading, not enforcement: a committed mode is compared with the one mode that fits the agreed domain. A mismatch is printed with both; no decision is blocked or changed.',
  ]),
  invariants: Object.freeze([
    'A decision is declared once. Its panel, owner and sensing deadline are never edited; a correction is a new decision.',
    'A reading counts only from a declared panel member, once, on the line declared for that member, and never from the owner.',
    'A reading is counted only when its evidence basis supports its domain. A refused reading is printed with the reason and is not applied.',
    'A domain is stated only when quorum is met AND every counted reading names the same domain. Majority is never used.',
    'One mode commitment per decision, by the owner, once. A second commitment is refused and the first stands.',
    'Fit is judged only against an agreed domain. Before agreement the reader prints `not-readable`, never `fit`.',
    'Counts are re-derived from the stored records on every read. The reader reports whether the state counts add to the decision total (`stateCountsReconcile`) and separately whether every row was printed (`figuresComplete`, which counts refused acts and dropped rows). The two are never merged into one claim.',
    'This register does not authenticate identity, does not verify that a cited precedent, analysis or probe exists in the record, and does not score any person. The local-first workspace is a declared seat, not an authenticated identity system.',
  ]),
  deliberatelyAbsent: Object.freeze([
    'No automatic domain classification from prose, keywords or metrics. The domain is only what a panel states and evidences.',
    'No majority vote, weighting or seniority-weighted reading. A senior panel member does not count for more.',
    'No override, block or auto-change of a committed mode when fit is a mismatch.',
    'No per-person score, ranking, or accuracy rate for any assessor. Counts describe decisions and readings, never persons.',
    'No automatic re-sensing or domain change on the passage of time. Staleness is printed; it changes nothing.',
  ]),
});

export const DSN_SECTION_TITLES = Object.freeze({
  rows: 'Decisions',
  counts: 'State and fit counts',
  refusals: 'Refused acts',
  method: 'Method & limits',
});
