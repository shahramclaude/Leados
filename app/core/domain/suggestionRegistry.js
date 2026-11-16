/**
 * app/core/domain/suggestionRegistry.js — closed vocabulary for the Frontline
 * Improvement-Suggestion Ledger (kaizen *teian*, ADR-0227, `RULE-KZT-01`).
 *
 * This is a leadership accountability record for small, frontline improvement
 * suggestions. It is NOT a voting tool, a crowdsourcing platform, an approval
 * for a process change, or a measured-benefit system. A suggestion is declared
 * once and never edited; a triage decision, an owner's effect claim and a
 * submitter's or reviewer's confirmation are separate, append-only acts. No
 * stored status can close a suggestion: the state is re-derived on every read.
 */

export const KZT_ENGINE_VERSION = 'kaizen-teian-2026.11-v1';
export const KZT_ADR = 'ADR-0227';
export const KZT_RULE_ID = 'RULE-KZT-01';

export const KZT_LIMITS = Object.freeze({
  suggestions: 400,
  acts: 2400,
  routeMin: 1,
  routeMax: 6,
  areaMin: 3,
  areaMax: 120,
  textMin: 24,
  textMax: 600,
  responseMinDays: 1,
  responseMaxDays: 30,
  targetMaxDays: 180,
  privacyFloor: 3,
  dayMin: '2000-01-01',
  dayMax: '2100-12-31',
});

export const KZT_DECISIONS = Object.freeze(['accept', 'decline']);
export const KZT_ACT_KINDS = Object.freeze(['triage', 'claim', 'confirm']);

export const KZT_STATES = Object.freeze([
  Object.freeze({ key: 'awaiting-triage', label: 'Submitted — no triage decision yet' }),
  Object.freeze({ key: 'awaiting-joint-triage', label: 'Shared route — some route members have decided; the rest still owe their decision' }),
  Object.freeze({ key: 'triage-split', label: 'Shared route — route members disagree; nobody decides, the split is printed' }),
  Object.freeze({ key: 'declined', label: 'Declined by the whole route, with a stated reason' }),
  Object.freeze({ key: 'accepted-awaiting-claim', label: 'Accepted by the whole route — the named owner has not yet claimed an effect' }),
  Object.freeze({ key: 'claimed-awaiting-confirmation', label: 'Owner claimed an effect — independent confirmation still owed' }),
  Object.freeze({ key: 'closed-confirmed', label: 'Effect confirmed by someone other than the owner' }),
]);
export const KZT_STATE_KEYS = Object.freeze(KZT_STATES.map((row) => row.key));

export const KZT_OVERDUE = Object.freeze({
  response: 'response-overdue',
  target: 'target-overdue',
});

export const KZT_REFUSALS = Object.freeze({
  unknownSuggestion: 'unknown-suggestion',
  beforeSubmission: 'before-submission',
  notInRoute: 'not-in-route',
  alreadyDecided: 'already-decided-by-actor',
  routeSettled: 'route-settled',
  routeSplit: 'route-split',
  notAccepted: 'not-accepted',
  notOwner: 'not-owner',
  alreadyClaimed: 'already-claimed',
  notClaimed: 'not-yet-claimed',
  selfConfirmation: 'self-confirmation',
  notConfirmer: 'not-confirmer',
  alreadyConfirmed: 'already-confirmed',
});

export const KZT_METHOD = Object.freeze({
  engine: KZT_ENGINE_VERSION,
  adr: KZT_ADR,
  frameworks: Object.freeze([
    'Kaizen teian (Toyota suggestion system): frontline people propose small improvements; the proposal is answered, not merely collected. Respect for people is the operating premise.',
    'Deming PDCA: plan (proposal), do (owner claims an effect), check (someone other than the owner confirms it), act (the record closes or stays open). Check is a separate key, never the owner.',
    'Matrix accountability (ADR-0140): a suggestion from a person with several lines is routed to the joint apex set above every active line. A shared route answers only when every member has decided the same way; a disagreement is printed, never resolved by picking a winner.',
    'Just Culture (ADR-0218 posture): counts describe suggestions and states, never a person. No per-person volume, ranking or recognition score is produced.',
    'Response-time governance: every suggestion carries a declared response-by instant; an unanswered suggestion past it prints `response-overdue`. Elapsed time never triages or closes a suggestion.',
  ]),
  invariants: Object.freeze([
    'A suggestion is declared once. Its text, submitter and route are never edited; a correction is a new suggestion.',
    'A triage decision counts only from a member of the declared route, once per member, and only before the route has settled.',
    'An acceptance names one owner and one target day; a decline carries a reason and names neither.',
    'Only the named owner may claim an effect, and only after acceptance. A claim is never accepted from anyone else.',
    'Confirmation is an independent key: it must come from the submitter or a route member, never from the owner, and only after the claim.',
    'Refused acts are never applied, and are printed with a reason. A second triage, claim or confirmation never overwrites the first.',
    '`partitionReconciles` proves the printed state counts add to the ledger total. `figuresComplete` separately reports refused acts, dropped rows and malformed records. Both are reported, neither implies the other.',
    'This ledger does not measure benefit, verify that a process changed, approve a standard, or authenticate identity. The local-first workspace is a declared seat, not an authenticated identity system.',
  ]),
  deliberatelyAbsent: Object.freeze([
    'No benefit, savings, ROI or productivity figure is inferred from a suggestion count or an effect note.',
    'No vote, popularity, sentiment or idea-quality score is computed from prose.',
    'No owner, route or triager is chosen when the record names several; ambiguity is printed.',
    'No automatic decline on overdue, and no automatic close on the passage of time.',
    'No person-level suggestion count, ranking or recognition output is produced.',
  ]),
});

export const KZT_SECTION_TITLES = Object.freeze({
  rows: 'Suggestions',
  counts: 'State counts',
  refusals: 'Refused acts',
  method: 'Method & limits',
});
