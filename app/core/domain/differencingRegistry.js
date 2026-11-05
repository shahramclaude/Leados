/**
 * app/core/domain/differencingRegistry.js — leaf vocabulary for the Differencing
 * Defender (`#/differencing`, Schema v96, ADR-0092).
 *
 * Zero imports, so `schema.js`, `disclosureManifests.js`, `seatRegistry.js`,
 * `csv.js` and this module's own rules share one canonical vocabulary without a
 * circular dependency.
 *
 * THE QUESTION THIS TERMINAL ANSWERS
 * ----------------------------------
 * ADR-0091 closed the VERTICAL axis of statistical disclosure control: one
 * published table, one moment, every printed total checked by exact integer
 * arithmetic. It closed nothing about TIME, and the roadmap said so out loud.
 * Its own honest-limits paragraph is the specification for this module:
 *
 *   "the TEMPORAL half of differencing: the same aggregate released again later
 *    with a different suppression pattern … plus reorganisation comparability
 *    across a freeze line."
 *
 * A single safe table is not a safe series. This is the oldest attack in
 * disclosure control and it needs no cleverness from the attacker:
 *
 *   Release 1   span A 6,  span B ✗withheld,  total 7    (ADR-0091 is satisfied:
 *                                                        A and B are both ≥ the
 *                                                        integer boxes the print
 *                                                        permits … no, it is not)
 *   Release 2   span A 6,  span B ✗withheld,  total 9
 *
 * The first release already leaks (7 − 6 = 1), and if it did not, the second one
 * finishes the job: B grew by exactly 2 between two dated releases, so a reader
 * knows B's count to the unit at both dates without it ever being printed. Each
 * table was audited. The pair was not. The release is the unit of disclosure,
 * not the table.
 *
 * The same arithmetic crosses ALTITUDES and needs no repeats at all: a director
 * reads their span's table, a VP reads the parent's table for the same day, and
 * the sibling span is whatever the two totals leave over. LeadOS ships a scoped
 * aggregate renderer at every altitude (ADR-0086), so this is a live exposure,
 * not a hypothetical one.
 *
 * WHAT THIS MODULE DECIDES
 * ------------------------
 *   1. A RELEASE REGISTER. Every published aggregate is a dated, immutable row
 *      that keeps nothing but structure: module, day, altitude, the cell
 *      geometry, which cells were printed, which totals were printed and why.
 *      No name, no title, no note, no money, no free text.
 *   2. THE PLAIN-READING ALGEBRA. The reader-facing surface of a WHOLE SEQUENCE
 *      is solved as one integer system: each printed total is a linear equation
 *      over the same latent cell values the earlier releases described. A cell
 *      whose feasible interval collapses to a single integer was *determined*,
 *      which is disclosure even though it was never printed.
 *   3. A PLANNER THAT BUYS SAFETY. When a publication would pin a cell, the
 *      planner withholds the smallest cost first — the total, then the cell —
 *      and prints exactly which figure it removed and how many cells that
 *      protects. It never over-suppresses a table that determines nothing.
 *   4. AN INDEPENDENT AUDITOR. The planner decides; the auditor re-solves from
 *      the rows as they stand. If they disagree, the screen prints the
 *      disagreement instead of calling the register safe.
 *   5. A DIAGNOSIS. When repeated publication is what leaks, the fix is not a
 *      bigger floor — it is a different publication rhythm. This module reads
 *      the total series with two named stationarity tests (Wald–Wolfowitz runs,
 *      Buishand range) and names the structural remedy: publish period-by-period
 *      changes (safe, information-rich) or hold a total (unsafe to reprint).
 *
 * WHAT IT MAY NEVER DO
 * --------------------
 *  - It never prints a determined value as a public figure. A recovery is
 *    reported as a COORDINATE and a PROOF, so the leader can act on it without
 *    the screen becoming the disclosure.
 *  - It never rates, ranks or scores a person. A cell is a span.
 *  - It never sends anything, edits a reporting line, or closes a decision a
 *    human opened. It opens governed decisions and owned work on the shared
 *    spine like every other module.
 *  - It never claims differential privacy, noise injection or formal privacy.
 *    It claims exact integer determinacy over what this workspace has actually
 *    published, and it says so in those words.
 */

export const DIFFERENCING_ENGINE_VERSION = 'differencing-defender-v1';

export const DIFFERENCING_LIMITS = Object.freeze({
  releases: 400,
  releasesPerRoute: 120,
  cellsPerRelease: 120,
  markers: 1200,
  decisionsPerScan: 40,
  windowReleasesMin: 2,
  windowReleasesMax: 60,
  cellFloorMin: 2,
  cellFloorMax: 10,
  minPointsMin: 4,
  minPointsMax: 40,
  notesPerRelease: 12,
});

export const DIFFERENCING_DEFAULTS = Object.freeze({
  differencesCellFloor: 3,
  differencesWindowReleases: 12,
  differencesMinPoints: 8,
  differencesAutoProtect: true,
  differencesAutoPropagate: true,
});

export const DIFFERENCING_RULE_IDS = Object.freeze({
  register: 'RULE-DFR-01',
  recover: 'RULE-DFR-02',
  protect: 'RULE-DFR-03',
  drift: 'RULE-DFR-04',
});

export const DIFFERENCING_EVENTS = Object.freeze({
  RELEASED: 'differences.released',
  SCAN: 'differences.scan',
  CONVENTIONS: 'differences.conventions',
});

export const DIFFERENCING_TRIGGER_PREFIX = 'differences.';

/** Serial events + the explicit scan. The spine admits only declared prefixes. */
export const DIFFERENCING_TRIGGER_EVENTS = Object.freeze([
  DIFFERENCING_EVENTS.RELEASED,
  DIFFERENCING_EVENTS.SCAN,
  DIFFERENCING_EVENTS.CONVENTIONS,
]);

/**
 * The additive measures a release publishes. Named, not discovered: a measure
 * that is not on this list is never modelled, so a future surface that prints a
 * new figure must declare it here rather than silently escape the audit.
 */
export const DIFFERENCING_MEASURES = Object.freeze(['count', 'open', 'overdue']);

export const DIFFERENCING_MEASURE_LABELS = Object.freeze({
  count: 'record count',
  open: 'open load',
  overdue: 'overdue load',
});

/**
 * Verdicts. `determined` is the failure state and it is never dressed up: a
 * value the workspace withheld and a reader could recover by subtraction is a
 * disclosure with a longer proof, not a near miss.
 */
export const DIFFERENCING_VERDICTS = Object.freeze({
  SAFE: 'safe',
  PROTECTED: 'protected',
  DETERMINED: 'determined',
  INCONSISTENT: 'inconsistent',
  REFUSED: 'refused',
});

export const DIFFERENCING_VERDICT_META = Object.freeze({
  safe: Object.freeze({
    label: 'Safe to publish',
    tone: 'good',
    meaning: 'Publishing this release pins no withheld value, on its own or against every release already in the register.',
    next: 'Publish. Record it in the register so the next release is audited against this one.',
  }),
  protected: Object.freeze({
    label: 'Protected',
    tone: 'neutral',
    meaning: 'Publishing this release would have pinned a withheld value, so one further figure was withheld to make the sequence determine nothing.',
    next: 'Publish the protected version. The screen names the figure it removed and the cells that figure protected.',
  }),
  determined: Object.freeze({
    label: 'Determined',
    tone: 'bad',
    meaning: 'A withheld value is exactly recoverable by arithmetic from the releases in the register. The number was never printed; it was determined, which is the same disclosure with a longer proof.',
    next: 'Do not reprint this figure. Open the governed decision the screen prepared: change the publication rhythm, or hold the total.',
  }),
  inconsistent: Object.freeze({
    label: 'Inconsistent',
    tone: 'bad',
    meaning: 'A published total does not agree with the cells under it, so the register cannot be reasoned about exactly.',
    next: 'Find the release whose cells and total disagree and correct it by hand. This screen withholds rather than resolving by guessing which end is wrong.',
  }),
  refused: Object.freeze({
    label: 'Not published',
    tone: 'warn',
    meaning: 'The release was refused: the register is full, the scope is unresolved, or the declared seat may not publish this module.',
    next: 'Export or prune the register, resolve the seat, or publish from a seat the module admits.',
  }),
});

/** How a single cell stood in one release. */
export const DIFFERENCING_CELL_STATES = Object.freeze({
  PRINTED: 'printed',
  WITHHELD: 'withheld',
  COMPLEMENTARY: 'complementary',
  ABSENT: 'absent',
});

/**
 * Why a cell carries information across a series. Printed for the reader: a
 * stock reprinted later is not just "another datapoint", it is the interval's
 * net change handed over for free once the two dates are known.
 */
export const DIFFERENCING_EXPOSURES = Object.freeze([
  Object.freeze({
    key: 'pairwise-total',
    label: 'Total differencing',
    detail: 'Two releases of the same table with a different suppression pattern. The difference of the two totals is an equation about the cells whose state changed.',
    remedy: 'Keep the suppression pattern stable across a series, or publish the per-period change instead of the level.',
  }),
  Object.freeze({
    key: 'cross-altitude',
    label: 'Cross-altitude differencing',
    detail: 'A child span\'s table and its parent\'s table published the same day. Whatever the parent total does not account for is the sibling the child could not see.',
    remedy: 'Suppress a complementary cell at both altitudes, against the same geometry.',
  }),
  Object.freeze({
    key: 'growth',
    label: 'Growth (stock reprint)',
    detail: 'The same cell and measure printed at two dated releases. The reader learns the exact net change between the dates even when neither level is small.',
    remedy: 'Publish period-by-period flows where the flow itself is not small, or hold the level.',
  }),
  Object.freeze({
    key: 'cross-module',
    label: 'Cross-module coincidence',
    detail: 'Two modules over overlapping record populations published the same day. One module\'s total can account for part of the other\'s.',
    remedy: 'Treat the register as one publication surface: audit the day, not the module.',
  }),
  Object.freeze({
    key: 'reorganisation',
    label: 'Reorganisation comparability',
    detail: 'A reporting line changed between two releases. The cells are different objects, so the arithmetic is not a delta — but a reader who knows the move can still subtract the surviving parts.',
    remedy: 'Freeze a comparability line: publish the re-expressed prior release beside the current one, or withhold both until the geometry is stable.',
  }),
]);

export const DIFFERENCING_EXPOSURE_KEYS = Object.freeze(DIFFERENCING_EXPOSURES.map((row) => row.key));

/**
 * Five altitude-specific readings of ONE measurement. The arithmetic is
 * identical everywhere; what changes is who is competent to hold a total, what
 * they are asked, and what they may hand upward.
 */
export const DIFFERENCING_PLAYBOOK = Object.freeze({
  frontline: Object.freeze({
    title: 'Did I just publish a number I was not meant to?',
    horizon: 'Today',
    question: 'Before this table goes into a review deck, does the arithmetic in it hand back a cell that was blanked?',
    see: 'This release, its protection verdict, and any cell the sequence would pin.',
    act: 'Publish the protected version the screen prepared, or withhold the one figure it named. Nothing is sent on your behalf.',
    hand: 'A table that states what it withheld and why — never a person and never a rating.',
  }),
  manager: Object.freeze({
    title: 'Is my series safe release by release?',
    horizon: 'Next 30 days',
    question: 'Across the last several releases of my modules, does any pair of them determine a value that neither printed?',
    see: 'The register for your span, each release\'s verdict, and the cells under permanent protection.',
    act: 'Fix the publication rhythm for the module that leaks: a stable suppression pattern, or a change rather than a level.',
    hand: 'The count of safe releases and the one module to change — with the proof, not an assurance.',
  }),
  director: Object.freeze({
    title: 'What did my chain publish that can be subtracted?',
    horizon: '90–180 days',
    question: 'Which modules published the same day at two altitudes, and which sibling span does the difference between them expose?',
    see: 'Cross-altitude pairs inside your span, with the exact subtraction and the cell it pins.',
    act: 'Decide the geometry for the span: one suppression pattern applied at every altitude for a given day.',
    hand: 'A dated statement of which publication practices are safe, and which were changed.',
  }),
  exec: Object.freeze({
    title: 'Portfolio publication risk',
    horizon: '180–365 days',
    question: 'How much of the portfolio\'s published surface is provably free of inferential disclosure — and where is the residue?',
    see: 'Share of releases that determine nothing, with an interval, refused below the release floor; per-module counts with small cells suppressed.',
    act: 'Authorise a publication standard for the portfolio, or accept that the aggregates are indicative rather than confidential.',
    hand: 'A bounded share and the explicit statement of what the aggregate cannot scope.',
  }),
  chief: Object.freeze({
    title: 'Enterprise publication integrity',
    horizon: '365–730 days',
    question: 'Is every figure this house publishes to its board and investors provably undetermined by arithmetic?',
    see: 'Enterprise counts by module and altitude; no span name, no person, no title, no amount.',
    act: 'Record the enterprise decision. A number that is withheld but recoverable is a number that was published.',
    hand: 'A dated, aggregate-only certificate that a withheld cell is unrecoverable — not an assurance that it is.',
  }),
});

export const DIFFERENCING_DISCLOSURE = Object.freeze({
  local: 'Operating seats are local workflow declarations, not authenticated multi-user security. This register covers publications made inside THIS workspace; a figure published from the same data elsewhere cannot be seen or defended by it.',
  register: 'A stored release keeps structure only: module, day, altitude, cell geometry, which cells and totals were printed. It keeps no person\'s name, no record title, no note, no amount and no currency. The span labels on screen are resolved live from the tree the reader may already see; they are never copied into the row.',
  determinacy: 'Recoverability is exact integer arithmetic over what was actually published. It is not differential privacy, not noise injection and not a formal privacy guarantee: it proves this sequence does not determine a withheld value by subtraction, and says nothing about auxiliary data held outside the workspace.',
  people: 'Nothing here rates, ranks or scores a person. A cell is a span; a finding is about a PUBLICATION, never about the people inside it.',
  engine: 'The engine opens governed decisions and owned work on the shared rule spine. It never sends a message, never edits a reporting line, never reprints a figure on its own, and never closes a decision a human opened.',
});

export const DIFFERENCING_PREMISE =
  'A withheld cell is only withheld if a reader cannot recover it — and a table can be safe while a SERIES of tables is not, because disclosure is a property of the release, not of the page.';
