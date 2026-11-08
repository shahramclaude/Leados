/**
 * app/core/domain/boardRegistry.js — Schema v91 / ADR-0085.
 *
 * "The Board Room": the one surface the chief altitude's own charter names and
 * the app never had. `chainRegistry` has declared a chief duty called
 * "Board-ready synthesis" since ADR-0075 and pointed it at `#/board`; that route
 * did not exist. Two registries linked to a dead end. This file is the contract
 * that closes it — and it does so as a measurement problem, not a document
 * generator.
 *
 * THE IDEA NOBODY SHIPS
 * ---------------------
 * Every board pack is a set of sentences written by the people being measured,
 * after they have seen the numbers. The oldest fix for that in science is
 * PRE-REGISTRATION: declare the claim and the threshold that would refute it
 * *before* looking, then report the verdict either way. LeadOS already holds the
 * records those sentences summarise (bench certification, promise solvency,
 * authority calibration, expectation concordance, culture signal, seal
 * integrity). So the board line here is not written; it is *adjudicated*:
 *
 *   - each claim declares a THRESHOLD and a DIRECTION before the first look;
 *   - a figure is quoted only with its interval, and a claim can only be
 *     reported as HOLDING when the conservative end of that interval clears the
 *     threshold — not when the point estimate does;
 *   - a threshold edited after the first look is permanently marked
 *     `revised-after-looking`, and the memo must print how many were;
 *   - a claim whose interval straddles its threshold is INCONCLUSIVE, and the
 *     terminal computes how many more observations would settle it — or states
 *     that no sample this workspace can produce would;
 *   - every figure carries a disclosure tag: recomputed, attested, asserted,
 *     withheld, or refused.
 *
 * None of that is a chart. It is the difference between a number a board can
 * rely on and a number a board can be shown.
 *
 * This registry declares every id, threshold default, source, cross-check and
 * convention. It adds NO second workflow engine: memos live in one additive
 * collection, propagation rides the shared post-commit spine (ADR-0008), the
 * hierarchy is `buildChain`/`buildSeats` (ADR-0075/0076), and the seal it cites
 * is the one ADR-0082 already writes.
 */

export const BOARD_VERSION = 'board-room-2026.11-v1';

/** Post-commit rule ids surfaced in the UI, the audit log and the brief. */
export const BOARD_RULES = Object.freeze({
  OBLIGATION: 'RULE-BRD-01', // a failing claim → one governed decision + one owned obligation
  ROLLUP: 'RULE-BRD-02',     // a committed memo → typed provenance edges to the spans it reports on
  ADVISORY: 'RULE-BRD-03',   // advisory marker when the memo's own evidence floor is reached
});

export const BOARD_EVENTS = Object.freeze({
  MEMO_OPENED: 'board.memo_opened',
  CLAIM_DECLARED: 'board.claim_declared',
  LOOKED: 'board.looked',
  COMMITTED: 'board.committed',
  FROZEN: 'board.frozen',
  SUPERSEDED: 'board.superseded',
  CONVENTIONS_SET: 'board.conventions_set',
  SCAN: 'board.scan',
  TRIGGER: 'board.trigger',
});

export const BOARD_LIMITS = Object.freeze({
  memos: 40,        // bounded memo ledger
  claims: 12,       // max claims declared on one memo
  markers: 600,     // idempotency markers
  thresholdMin: 0,
  thresholdMax: 100,
  titleChars: 120,
  noteChars: 280,
  history: 8,
});

export const BOARD_PANELS = Object.freeze(['memo', 'claims', 'rollup', 'cycle', 'discrepancies', 'method']);

/**
 * The claim register. Each row is a sentence a management team would put in a
 * pack, the module that can actually measure it, and the declared convention
 * that would refute it.
 *
 * `comparator` is how the number is read: `gte` = higher is better (a coverage
 * or a hold rate), `lte` = lower is better (a concentration or a breach rate).
 * `unit` is `pct` for proportion intervals, `score` for a bounded index, and
 * `binary` for a fact with no sampling error (the seal either verifies or not).
 */
export const BOARD_CLAIMS = Object.freeze([
  Object.freeze({
    key: 'bench-coverage',
    label: 'Bench coverage',
    assertion: 'Every leadership span whose bench can be measured has a tested successor today.',
    question: 'If two of your directors left this quarter, who takes their spans — and does the record show it?',
    module: 'Leadership bench (succession)',
    source: 'succession',
    unit: 'pct',
    comparator: 'gte',
    defaultThreshold: 60,
    class: 'fiduciary',
    cost: 'A span with no tested successor is an uninsured key-person exposure; the pack would be restating capacity the organisation does not have.',
    route: '#/succession',
    partition: 'span',
    blank: 'counted, not named',
  }),
  Object.freeze({
    key: 'bench-concentration',
    label: 'Bench concentration',
    assertion: 'No leadership span depends on one holder for most of its work.',
    question: 'Which seat, if it emptied tomorrow, takes the most work with it?',
    module: 'Leadership bench (succession)',
    source: 'succession',
    unit: 'pct',
    comparator: 'lte',
    defaultThreshold: 25,
    class: 'fiduciary',
    cost: 'A concentrated span is single-point failure the pack describes as a strong bench.',
    route: '#/succession',
    partition: 'span',
    blank: 'counted, not named',
  }),
  Object.freeze({
    key: 'promise-reliability',
    label: 'Promise reliability',
    assertion: 'The dated promises this organisation has made are still inside their own record.',
    question: 'Which commitment to a customer, regulator or board is implicitly priced as free?',
    module: 'Promise solvency',
    source: 'solvency',
    unit: 'pct',
    comparator: 'gte',
    defaultThreshold: 75,
    class: 'fiduciary',
    cost: 'A board told delivery is on track, against a book containing overdue promises, is being told a rate where it needs a list.',
    route: '#/solvency',
    partition: 'altitude',
    blank: 'counted, not named',
  }),
  Object.freeze({
    key: 'authority-hold',
    label: 'Delegated authority holds',
    assertion: 'The authority this organisation delegates to a span is, in the record, actually used and delivered.',
    question: 'Which decisions are we still routing upward that we said we had delegated?',
    module: 'Authority calibration',
    source: 'authority',
    unit: 'pct',
    comparator: 'gte',
    defaultThreshold: 70,
    class: 'strategic',
    cost: 'Delegated-but-recovered authority is a queue wearing a governance diagram; the pack reads it as decision speed.',
    route: '#/authority-calibration',
    partition: 'altitude',
    blank: 'counted, not named',
  }),
  Object.freeze({
    key: 'expectation-alignment',
    label: 'Expectation alignment',
    assertion: 'Leaders and their reports are using the same standard for the same words.',
    question: 'Where will a review arrive as a surprise to the person receiving it?',
    module: 'Expectation concordance',
    source: 'concordance',
    unit: 'pct',
    comparator: 'gte',
    defaultThreshold: 60,
    class: 'people',
    cost: 'A performance system with two gauges produces surprise, appeals and regretted attrition — a people cost the pack reports as engagement.',
    route: '#/concordance',
    partition: 'span',
    blank: 'counted, not named',
  }),
  Object.freeze({
    key: 'culture-signal',
    label: 'Culture signal',
    assertion: 'The measured culture signal is inside the band this organisation says it is betting on.',
    question: 'Is the culture signal the aggregate says we have the one we are betting on?',
    module: 'Health & pulse',
    source: 'health',
    unit: 'score',
    comparator: 'gte',
    defaultThreshold: 55,
    class: 'people',
    cost: 'A culture claim on a stale or thin instrument is a board assertion, not a measurement.',
    route: '#/health',
    partition: 'none',
    blank: 'a single workspace index, not a person',
  }),
  Object.freeze({
    key: 'record-integrity',
    label: 'Record integrity',
    assertion: 'The audit trail behind these figures is unaltered since the workspace sealed it.',
    question: 'Which number in this pack would we have to mark unverified if the chain were checked in the room?',
    module: 'Integrity & seals',
    source: 'seal',
    unit: 'binary',
    comparator: 'gte',
    defaultThreshold: 100,
    class: 'fiduciary',
    cost: 'A figure whose provenance cannot be replayed is an assertion with a chart around it.',
    route: '#/seal',
    partition: 'none',
    blank: 'the chain is verified, never summarised about a person',
  }),
]);

export const BOARD_CLAIM_KEYS = Object.freeze(BOARD_CLAIMS.map((c) => c.key));
export const boardClaim = (key) => BOARD_CLAIMS.find((c) => c.key === key) || null;

/**
 * The cross-examination matrix: declared pairs of modules that must agree, and
 * the finding when they do not. Each check exists because the two figures are
 * produced by different machinery — a count and a flow, a rate and a list, a
 * chain and an examination — so agreement is evidence and disagreement is the
 * finding. Nothing here is a composite score; a composite is exactly how a
 * board is shown one green number while two red ones persist.
 */
export const BOARD_CROSS_CHECKS = Object.freeze([
  Object.freeze({
    key: 'bench-count-vs-flow',
    label: 'Coverage is a snapshot; the bench is a flow',
    left: 'bench-coverage',
    right: 'succession-certification',
    rightModule: 'Leadership bench (succession)',
    statement: 'A coverage count can pass while the joint probability of at least one untested gap says a gap is likely before the review date. Both are true; only one is a sentence a board can act on.',
    route: '#/succession',
  }),
  Object.freeze({
    key: 'promise-rate-vs-book',
    label: 'A rate is not a list',
    left: 'promise-reliability',
    right: 'solvency-book',
    rightModule: 'Promise solvency',
    statement: 'The reliability rate can clear its floor while the book still holds overdue promises. The rate summarises; the list is what a board is actually asking about.',
    route: '#/solvency',
  }),
  Object.freeze({
    key: 'integrity-vs-examination',
    label: 'An unaltered record is not a true one',
    left: 'record-integrity',
    right: 'sceptic-coverage',
    rightModule: 'Cross-examination',
    statement: 'The seal proves the record was not altered after it was written. It says nothing about whether any claim in it was ever examined. Both must hold for the memo to be relied on.',
    route: '#/sceptic',
  }),
]);

/**
 * Every number is a declared, editable convention — never a measured fact. The
 * defaults follow the rest of the app: counts below a small-cell floor are
 * refused rather than rounded, and the re-check window is honest about how
 * often a board actually reads the same claim.
 */
export const BOARD_CONVENTION_DEFAULTS = Object.freeze({
  boardCellFloor: 5,          // records required before a proportion is quoted
  boardEvidenceFloor: 4,      // evaluated claims required before a memo may be committed
  boardMaterialityPct: 10,    // distance below the threshold that counts as material
  boardRecheckDays: 90,       // a committed claim is stale after this
  boardAutoPropagate: true,   // pausable; an explicit scan always runs
});

/**
 * The carry-forward ledger (Session 182, ADR-0135). One declared convention and
 * one declared vocabulary — no setting, because a chief does not need to tune
 * how long "still broken" means before the board has asked twice.
 *
 * `streakFloor` is the number of CONSECUTIVE frozen packs a claim must carry the
 * same verdict before it reaches the review queue. Two is a convention, not a
 * measured optimum: the second pack is the first moment the record can show
 * movement at all (see boardContinuity.js).
 */
export const BOARD_CONTINUITY = Object.freeze({
  streakFloor: 2,     // consecutive frozen packs before a claim is carried
  looks: 24,          // bounded look window; older looks are counted, not printed
  queue: 40,          // bounded review queue; the remainder is counted, not dropped
  unverified: Object.freeze(['withheld', 'refused']),
  transitions: Object.freeze({
    FIRST_LOOK: 'first-look',
    STEADY: 'steady',
    SEPARATED: 'separated',
    INSIDE_NOISE: 'inside-noise',
    RULER_MOVED: 'ruler-moved',
    UNCLASSIFIED: 'unclassified',
  }),
  method: Object.freeze([
    Object.freeze({
      name: 'Interval screen (Wilson 1927)',
      note: 'Movement is called only when the two stored 95% intervals do not overlap. Non-overlap is evidence of difference; overlap is NOT evidence of sameness, and consecutive looks share the record they are drawn from, so no p-value is printed.',
    }),
    Object.freeze({
      name: 'Pre-registration carried forward (ADR-0085)',
      note: 'A claim whose declared threshold changed between looks is classified ruler-moved: the movement belongs to the bar, not to the record.',
    }),
    Object.freeze({
      name: 'Measurement debt, not performance',
      note: 'A figure the workspace REFUSED to produce in consecutive packs is carried as a measurement debt — the organisation has had that many cycles to make the number producible — and never as a judgement about a person.',
    }),
    Object.freeze({
      name: 'Declared carry convention',
      note: `Two consecutive frozen packs is a declared convention, not a measured optimum. It is printed wherever the queue is used.`,
    }),
  ]),
});

export const BOARD_DISCLOSURE = Object.freeze({
  names: 'The Board Room reports on SPANS and on the workspace. It never prints a person, a 1:1, a coaching note or an individual rating — the enterprise altitude\'s unit of analysis is the enterprise.',
  unit: 'At executive rank the memo is readable and the claim thresholds are visible; committing and freezing are chief-altitude acts.',
  aggregate: 'Exports are aggregate-only: one row per claim, no memo id, no operator, no note, no name.',
  local: 'A local workspace boundary, not authenticated multi-user security. Anyone controlling this browser or a full backup can read and edit a memo.',
  preregistration: 'A threshold proves it was declared before the first look only if the look was recorded. The terminal records the look; editing the threshold afterwards marks the claim revised-after-looking forever.',
  interval: 'A claim is reported as HOLDING only when the conservative end of its interval clears the threshold, and FAILING only when the optimistic end does not. In between it is INCONCLUSIVE, and no wording in this app turns that into a verdict.',
  integrity: 'A verified seal proves non-alteration since the seal was written. It does not prove the underlying claim is true, the actor is who they say, or the record is complete.',
  truth: 'An UNVERIFIED figure is not a small number. It is a figure this workspace cannot currently produce, and the memo marks it as such rather than guessing.',
});

/** FNV-1a 32-bit — content addressing for memo fingerprints, not crypto. */
export function boardFingerprint(text) {
  const input = String(text ?? '');
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export const BOARD_STATUSES = Object.freeze(['draft', 'committed', 'frozen', 'superseded']);

export const BOARD_VERDICTS = Object.freeze(['holding', 'failing', 'inconclusive', 'withheld', 'refused']);

/** Human labels for the disclosure tag on every figure. */
export const BOARD_TAGS = Object.freeze({
  recomputed: 'Recomputed from the record now',
  attested: 'Record present, seal could not attest it',
  asserted: 'Declared by an operator, not computed',
  withheld: 'Below the declared floor — counts only',
  refused: 'This workspace cannot produce it',
});
