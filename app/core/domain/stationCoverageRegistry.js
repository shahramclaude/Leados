/**
 * app/core/domain/stationCoverageRegistry.js — closed vocabularies for
 * Skill-Constrained Simultaneous Station Coverage (ADR-0201, Schema v157,
 * RULE-SSC-01, CSV scope #148, `#/standard-work?panel=stations`; extended by
 * ADR-0204, Schema v159, with declared station-to-station enabling edges, an
 * exact acyclic check and a precedence-aware witness).
 *
 * WHAT IS BEING MODELLED, AND WHY IT IS NOT SKILL COVERAGE.
 *
 * ADR-0192 answers a counting question: does a task have enough independently
 * qualified people in its pool? Its own reader states the boundary out loud —
 * "Task coverage is not simultaneous staffing, availability, capacity or
 * consent." That boundary is the gap this register closes. Two stations can each
 * be individually covered and still be impossible to run at the same time,
 * because the one person both of them count on cannot stand at two machines on
 * Monday morning.
 *
 * The mathematical object is a CAPACITATED BIPARTITE FEASIBILITY problem, and it
 * is decided exactly, never heuristically:
 *
 *   left  — stations that must be manned at the same declared time, each with
 *           an integer headcount demand (a station needing 2 people needs 2);
 *   right — the people who declared that they are AVAILABLE for that window,
 *           each with an integer capacity (how many of those stations they can
 *           hold at once — normally 1, and always declared, never assumed);
 *   edges — a person is qualified for a station only through a LIVE, unexpired
 *           manager-attested U/O ILUO act on a task that station names.
 *
 * Feasibility of the assignment is decided by the max-flow/min-cut bound
 * (Hall's marriage theorem, capacitated form): an assignment exists IF AND ONLY
 * IF for every subset S of stations, the total demand of S is at most the total
 * capacity of the people who are qualified for at least one station in S. The
 * reader does not merely say "short" — it prints the DEFICIENT SET: the actual
 * subset of stations whose combined demand exceeds the people who could possibly
 * serve them, together with the exact deficit. That witness is the evidence a
 * leader can act on, and it is the reason a greedy "everyone is qualified, so
 * we're fine" check is not used here.
 *
 * WHAT IS NEVER INFERRED. Availability is a dated first-person (or manager-
 * declared, explicitly labelled) statement covering a declared day. Nobody is
 * assumed available for not having said otherwise. Consent is separate from
 * availability and from qualification: being able to stand at a station is not
 * agreeing to. A station's demand is declared by its holder, never derived from
 * the roster. Qualification never transfers between managers' tasks.
 *
 * GOVERNANCE. A shortage that spans more than one leadership line is routed to
 * the LOWEST JOINT APEX of the stations' holders through the shared matrix DAG;
 * where no single apex holds them all, the condition is printed and an
 * identity-free observation is recorded instead of asking a partial set of
 * holders. No person is ever assigned, and no station is ever filled.
 *
 * PRECEDENCE (ADR-0204, Schema v159). A station that can only run when another
 * is manned is NOT modelled as an independent node. The window holder declares
 * enabling edges ("A must come up before B") as append-only dated rows; the
 * reader decides exactly what they imply. Semantics are uniform:
 *
 *   an enabling edge is a prerequisite to start, decided as AT-OR-BEFORE.
 *   Every station in the window's live register occupies a start instant: the
 *   `concurrent` set shares the one instant all of them are up by definition;
 *   a `sequential` station occupies some other instant inside the window (it is
 *   never simultaneous with the concurrent set), but the register holds NO
 *   intra-window clock and claims none.
 *
 * A directed cycle in the live enabling graph forces all of its members to one
 * instant. A cycle whose members are ALL `concurrent` collapses to that shared
 * instant and is satisfiable — it is printed as a declared co-requisite loop,
 * never as a defect and never as infeasibility. A cycle with AT LEAST ONE
 * sequential member is a contradiction: the sequential member cannot be moved
 * onto the shared instant and at least one concurrent member cannot leave it.
 * No running order exists, whatever anyone is assigned — the window reads
 * `unsatisfiable`, a proof from the declarations themselves, not from capacity.
 * The deficient-set witness is then never printed: there is no shortage to
 * name, only declarations that contradict each other.
 *
 * When the enabling graph is acyclic (or only co-requisite loops remain), the
 * enabling order exists and the simultaneous proof is UNCHANGED — every
 * declared station is mandatory, so co-requisites among the concurrent set
 * cannot relax or tighten the matching. What the order DOES refine is the
 * witness: the inclusion-minimal deficient set is shrunk in reverse enabling
 * order (the most-downstream station is dropped first), so whenever an equally
 * small proof exists it names the upstream stations whose failure forces the
 * rest. Whether the printed witness is enabler-closed is COMPUTED AND PRINTED,
 * never forced — Hall's condition needs no closure, and forcing one could drop
 * a load-bearing station.
 */

export const STATION_COVERAGE_ENGINE_VERSION = 'station-coverage-2026.11-v2';
export const STATION_COVERAGE_ADR = 'ADR-0201';
export const STATION_COVERAGE_PRECEDENCE_ADR = 'ADR-0204';
export const STATION_COVERAGE_RULE_ID = 'RULE-SSC-01';
export const STATION_COVERAGE_ROUTE = 'standard-work';
export const STATION_COVERAGE_PANEL = 'stations';
export const STATION_COVERAGE_CSV_SCOPE = 'skill-station-coverage';
export const STATION_COVERAGE_MARKER_KIND = 'skill-station-coverage';

/** Asks this rule files are closed with this prefix, so a human's own close is never confused with one. */
export const STATION_COVERAGE_CLOSED_PREFIX = '[station-coverage cleared]';
export const STATION_COVERAGE_ASK_SUMMARY_PREFIX = 'ssc1:';

export const STATION_COVERAGE_EVENTS = Object.freeze({
  STATION_DECLARED: 'stations.declared',
  STATION_RETIRED: 'stations.retired',
  AVAILABILITY_DECLARED: 'stations.availability.declared',
  AVAILABILITY_WITHDRAWN: 'stations.availability.withdrawn',
  ENABLE_DECLARED: 'stations.enable.declared',
  ENABLE_RETIRED: 'stations.enable.retired',
  CONVENTIONS: 'stations.conventions.set',
  SCAN: 'stations.scan',
});
export const STATION_COVERAGE_EVENT_PREFIX = 'stations.';

/**
 * The people who must be present are frontline and their mid-managers; the
 * reader is open to every altitude so a director can see where a span cannot
 * run. Declaring a window, an availability statement and a station are acts of
 * the person or the line holder the action narrows to. Governing the window
 * length, the ask window and the disclosure floor is the rank 3–5 window every
 * other register uses.
 */
export const STATION_COVERAGE_RIGHTS = Object.freeze({
  READ: 'read-station-coverage',
  DECLARE: 'declare-station-coverage',
  AVAIL: 'declare-station-availability',
  GOVERN: 'govern-station-coverage',
});

/* --------------------------------------------------------------- boundaries */

/**
 * One declared window is one contiguous run of calendar days. It is kept short
 * on purpose: availability is a human statement about a specific stretch of
 * time, and a station register that accepted "all year" would be claiming
 * standing consent nobody gave.
 */
export const STATION_COVERAGE_BOUNDS = Object.freeze({
  windowDays: [1, 31],
  minDemand: [1, 200],
  capacity: [1, 10],
  peoplePerStation: [1, 60],
  stationsPerWindow: [1, 40],
  enablingReason: [10, 400],
  availabilityDays: [1, 366],
  askDays: [1, 30],
  disclosureFloorN: [0, 20],
  windowsPerCommit: [1, 12],
});

export const STATION_COVERAGE_DEFAULTS = Object.freeze({
  askDays: 5,
  disclosureFloorN: 3,
  autoPropagate: true,
});

export const STATION_COVERAGE_SETTING_KEYS = Object.freeze({
  askDays: 'stationCoverageAskDays',
  disclosureFloorN: 'stationCoverageDisclosureFloorN',
  autoPropagate: 'stationCoverageAutoPropagate',
});

/** Settable through the governed action; each key names its own bound. */
export const STATION_COVERAGE_SETTING_BOUNDS = Object.freeze({
  stationCoverageAskDays: [1, 30],
  stationCoverageDisclosureFloorN: [0, 20],
});

export const STATION_COVERAGE_LIMITS = Object.freeze({
  windows: 120,
  stations: 600,
  availability: 4000,
  enables: 2400,
  enablesPerWindow: 120,
  asksPerCommit: 6,
  /** The deficient-set search enumerates bounded subsets; the remainder is declared, never hidden. */
  witnessSubsetSize: 5,
});

/** Who declared an availability row. The difference is printed, never blurred. */
export const STATION_COVERAGE_AVAILABILITY_SOURCES = Object.freeze([
  Object.freeze({ key: 'self', label: 'Declared by the person', says: 'The person stated their own availability for this window.' }),
  Object.freeze({ key: 'manager', label: 'Declared by their line manager', says: 'A manager stated it for them; the register prints that the person did not say it themselves.' }),
]);
export const STATION_COVERAGE_AVAILABILITY_SOURCE_KEYS = Object.freeze(STATION_COVERAGE_AVAILABILITY_SOURCES.map((r) => r.key));

/**
 * What a station's simultaneous requirement is measured over. `concurrent`
 * stations must be manned at the same time and therefore compete for the same
 * people; every other requirement in the window is a separate book that is
 * still added into a person's total so a declared capacity is never exceeded.
 */
export const STATION_COVERAGE_REQUIREMENTS = Object.freeze([
  Object.freeze({ key: 'concurrent', label: 'Concurrent (must run at the same time)', simultaneous: true,
    says: 'This station must be manned in the same window as the others marked concurrent. These are the stations that compete for one person.' }),
  Object.freeze({ key: 'sequential', label: 'Sequential (runs during the window, not at the same time)', simultaneous: false,
    says: 'This station must be manned somewhere in the window, but not simultaneously with the concurrent set. Its demand still counts against a person’s declared capacity.' }),
]);
export const STATION_COVERAGE_REQUIREMENT_KEYS = Object.freeze(STATION_COVERAGE_REQUIREMENTS.map((r) => r.key));

/* ---------------------------------------------------------------- verdicts */

/**
 * The window verdict is exhaustive and each key is a distinct fact. `feasible`
 * is only ever printed after an exact maximum-matching proof, and `infeasible`
 * is only ever printed WITH a deficient set. Neither is read from a percentage.
 */
export const STATION_COVERAGE_VERDICTS = Object.freeze([
  Object.freeze({ key: 'feasible', label: 'Feasible — every station can be manned at once', tone: 'good',
    says: 'An exact assignment of qualified, available people covers every declared demand. It is a proof of possibility, not an assignment: nobody has been scheduled.' }),
  Object.freeze({ key: 'infeasible', label: 'Infeasible — the deficient set is printed', tone: 'bad',
    says: 'No legal assignment exists. The stations named in the witness cannot all be manned from the people qualified and available for them, and the exact deficit is printed.' }),
  Object.freeze({ key: 'unproven', label: 'Unproven — the register cannot answer', tone: 'warn',
    says: 'The record is missing the evidence a feasibility claim would rest on: a station with nobody qualified, nobody available, or an unresolved reporting graph. Nothing is claimed either way.' }),
  Object.freeze({ key: 'unsatisfiable', label: 'Unsatisfiable — an enabling cycle cannot be ordered', tone: 'bad',
    says: 'A cycle of enabling declarations forces at least one station onto an instant the declarations give it no access to: a sequential station onto the shared simultaneous instant, or a concurrent station off it. No running order exists, whatever anyone is assigned. The declarations contradict each other, not the roster.' }),
  Object.freeze({ key: 'inert', label: 'No concurrent station declared', tone: 'neutral',
    says: 'This window declares no simultaneous requirement, or one station alone, which cannot compete with itself. Nothing to prove.' }),
]);
export const STATION_COVERAGE_VERDICT_KEYS = Object.freeze(STATION_COVERAGE_VERDICTS.map((r) => r.key));

/**
 * Per-station states. `covered` and `single-point` are different facts: a station
 * with exactly one qualified available person is manned on paper and is one
 * absence away from being unmanned, so it is never folded into `covered`.
 */
export const STATION_COVERAGE_STATION_STATES = Object.freeze([
  Object.freeze({ key: 'covered', label: 'Covered with a spare', says: 'At least as many qualified, available people as the declared demand, plus one.' }),
  Object.freeze({ key: 'exact', label: 'Exactly met', says: 'Qualified, available people exactly equal the declared demand. No slack.' }),
  Object.freeze({ key: 'single-point', label: 'Single point — one person', says: 'One declared person and one qualified, available holder. One absence empties the station.' }),
  Object.freeze({ key: 'short', label: 'Short of qualified, available people', says: 'Fewer qualified and available people than the declared demand.' }),
  Object.freeze({ key: 'no-qualified', label: 'Nobody qualified', says: 'No live unexpired attestation names this station’s task for anyone in its pool.' }),
  Object.freeze({ key: 'no-available', label: 'Nobody available', says: 'Qualified people exist, but none declared availability covering this window.' }),
  Object.freeze({ key: 'withheld', label: 'Withheld below the disclosure floor', says: 'Too few people to print without identifying them to an ancestor.' }),
  Object.freeze({ key: 'refused', label: 'Refused — the record cannot support a claim', says: 'An invalid ledger row or a reporting-graph defect makes the pool unprovable.' }),
]);
export const STATION_COVERAGE_STATION_STATE_KEYS = Object.freeze(STATION_COVERAGE_STATION_STATES.map((r) => r.key));

/** Why a window could not be proven. Printed one per reason; never collapsed. */
export const STATION_COVERAGE_REFUSALS = Object.freeze([
  Object.freeze({ key: 'graph-defect', says: 'The reporting graph has a defect, so the pool a station draws from cannot be proved complete.' }),
  Object.freeze({ key: 'invalid-row', says: 'A ledger row could not be read exactly and was retained rather than repaired.' }),
  Object.freeze({ key: 'future-row', says: 'A ledger row is dated after the read clock and cannot be used as present evidence.' }),
  Object.freeze({ key: 'no-availability', says: 'Nobody declared availability covering this window. Availability is never assumed.' }),
  Object.freeze({ key: 'no-qualified', says: 'No live unexpired qualification names a demanded station’s task.' }),
  Object.freeze({ key: 'empty-pool', says: 'A station’s holder holds no live line to anyone on the roster.' }),
  Object.freeze({ key: 'holder-off-roster', says: 'A station’s holder is no longer on the active roster.' }),
  Object.freeze({ key: 'window-unreadable', says: 'The declared window is not a readable calendar range.' }),
  Object.freeze({ key: 'subset-cap', says: 'The deficient-set search could not enumerate every subset at this size; the printed witness is the best found and is labelled as such.' }),
  Object.freeze({ key: 'enabling-cycle', says: 'A cycle of enabling declarations contradicts the requirement vocabulary of at least one of its members; no running order exists until one declaration or one station is retired.' }),
]);
export const STATION_COVERAGE_REFUSAL_KEYS = Object.freeze(STATION_COVERAGE_REFUSALS.map((r) => r.key));

/**
 * The CSV is aggregate-only. These columns carry no person, manager, line,
 * station title, task title, note or record id — an export that named a station
 * would leak what the disclosure floor withheld on screen.
 */
export const STATION_COVERAGE_CSV_COLUMNS = Object.freeze([
  'row_type', 'key', 'label', 'generated_on', 'engine_version',
  'windows_n', 'live_windows_n', 'stations_n', 'concurrent_stations_n', 'sequential_stations_n',
  'demand_n', 'qualified_edges_n', 'available_people_n', 'available_capacity_n',
  'feasible_windows_n', 'infeasible_windows_n', 'unproven_windows_n', 'inert_windows_n',
  'unsatisfiable_windows_n', 'enabling_edges_n', 'precedence_cycles_n',
  'deficient_sets_n', 'max_deficit_n', 'witness_complete', 'station_state_n',
  'counts_reconcile', 'figures_complete', 'claim_reason',
]);

export const STATION_COVERAGE_CSV_DESCRIPTOR = Object.freeze({
  key: STATION_COVERAGE_CSV_SCOPE,
  label: 'Skill-constrained simultaneous station coverage (aggregate)',
  group: 'analytics',
  sensitive: false,
  filenameSlug: 'skill-station-coverage',
  description: 'One workspace summary row plus one row per window verdict, station state and refusal reason: declared simultaneous windows, station demand, qualified-attestation edges, declared availability and its exact capacity, whether each window was proven feasible by maximum matching, how many deficient sets were found and the largest exact deficit, plus declarable station-to-station enabling edges, how many windows carry an unsatisfiable enabling cycle, and how many precedence cycles were found. NO person, manager, line, station title, task title, note, reason or record id. A withheld or unprovable figure exports BLANK with its reason — never zero.',
});

/* ------------------------------------------------------------------ method */

export const STATION_COVERAGE_FRAMEWORKS = Object.freeze([
  Object.freeze({ name: 'Hall’s marriage theorem (capacitated form)', citation: 'Hall (1935); Gale (1957)',
    applies: 'An assignment of people to stations exists if and only if every subset of stations demands no more people than are able to serve it. The reader prints the failing subset and its exact deficit rather than a percentage.' }),
  Object.freeze({ name: 'Max-flow / min-cut duality', citation: 'Ford & Fulkerson (1956)',
    applies: 'Feasibility is decided by an augmenting-path search over the station→person bipartite network with integer capacities. Exact and integer: no rounding, no scoring.' }),
  Object.freeze({ name: 'Takt and line-balance discipline', citation: 'Ohno (1988); Rother & Shook (1999)',
    applies: 'A station’s demand is the headcount the work requires at that takt, declared by its holder — never inferred from the roster or the org chart.' }),
  Object.freeze({ name: 'Cognitive/skill job rotation and versatility', citation: 'ILUO / Training-Within-Industry (War Manpower Commission, 1941)',
    applies: 'Qualification is an attested, expiring level (I/L/U/O); only unexpired U and O count toward independent coverage.' }),
  Object.freeze({ name: 'Consent is not capacity', citation: 'Organizational justice: voice and consent (Folger, 1977); Gilbreth (1911) on the worker’s own statement',
    applies: 'Availability and consent are dated human statements about a named window. Showing up is not inferred from being able to.' }),
  Object.freeze({ name: 'Topological ordering and strongly connected components', citation: 'Tarjan (1972); Kahn (1962)',
    applies: 'Enabling declarations induce a precedence graph over the window’s stations. A directed cycle with at least one sequential member is a contradiction with no running order; a cycle of only concurrent stations collapses to their shared instant and is a co-requisite loop, printed as such.' }),
  Object.freeze({ name: 'Interlock and start-up discipline', citation: 'Ohno (1988); IEC 61511 on permit-to-work sequencing',
    applies: 'A station that must wait for another station is a declared interlock, not a hope. The register prints the declaration order contradiction exactly, and asks a human to retire the declaration that is wrong — never to guess an order.' }),
]);
