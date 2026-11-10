/**
 * app/core/domain/matrixCoordinationRegistry.js — Matrix Span Fragmentation &
 * Counterpart-Dyad Coordination Ledger (ADR-0161, Schema v130 unchanged,
 * `#/matrix?panel=coordination`, CSV scope #121).
 *
 * A tree span counts how many people report to a manager. It cannot say whether
 * those people pull that manager into one stable counterpart relationship or
 * many independent cross-line coordination relationships. This registry is the
 * closed vocabulary for that distinct structural reading.
 *
 * Nothing in this module is an hours estimate, a manager score, or a suggested
 * reorganisation. It counts declared manager-to-manager interfaces reached via
 * people on active matrix lines. A span with an incomplete allocation is
 * REFUSED: treating an undeclared line as zero coordination would be a silent
 * claim that the missing agreement has no operational cost.
 */

export const MATRIX_COORDINATION_ENGINE_VERSION = 'matrix-coordination/1';

export const MATRIX_COORDINATION_RULE_ID = 'RULE-MCO-01';
export const MATRIX_COORDINATION_SCAN_EVENT = 'matrix.coordination.scan';

/** Bounds are hard caps, never a hidden truncation. */
export const MATRIX_COORDINATION_LIMITS = Object.freeze({
  rows: 80,
  counterpartsPerRow: 80,
  markers: 400,
});

/**
 * A structural triage threshold, not a universal optimum. Three independent
 * counterpart managers means a manager must negotiate across at least three
 * lateral interfaces before they can describe the span as one stable dyad.
 */
export const MATRIX_COORDINATION_BOUNDS = Object.freeze({
  fragmentedCounterpartFloor: 3,
});

export const MATRIX_COORDINATION_STATES = Object.freeze([
  Object.freeze({
    key: 'refused',
    label: 'Allocation incomplete',
    tone: 'bad',
    detail: 'At least one person in this manager’s active matrix span has an undeclared or unreadable allocation. No counterpart total or dispersion is printed over the remaining people.',
  }),
  Object.freeze({
    key: 'fragmented',
    label: 'Fragmented counterparts',
    tone: 'warn',
    detail: 'The span reaches at least the declared counterpart-manager floor. This is a structural coordination prompt, not a judgement about any manager.',
  }),
  Object.freeze({
    key: 'multiple',
    label: 'Several counterparts',
    tone: 'neutral',
    detail: 'The span reaches two counterpart managers. Counts are exact; no claim is made that two is too many.',
  }),
  Object.freeze({
    key: 'concentrated',
    label: 'One counterpart',
    tone: 'good',
    detail: 'Every measured matrix relationship in this span reaches the same counterpart manager. This is topology, not proof that the interface is healthy.',
  }),
  Object.freeze({
    key: 'none',
    label: 'No counterpart',
    tone: 'neutral',
    detail: 'No active cross-line counterpart reaches this span in the current scope.',
  }),
]);

export const MATRIX_COORDINATION_STATE_KEYS = Object.freeze(MATRIX_COORDINATION_STATES.map((state) => state.key));

const STATE_BY_KEY = new Map(MATRIX_COORDINATION_STATES.map((state) => [state.key, state]));
export function matrixCoordinationState(key) {
  return STATE_BY_KEY.get(String(key || '')) || null;
}

export const MATRIX_COORDINATION_CONVENTIONS = Object.freeze([
  Object.freeze({
    key: 'unit',
    label: 'Unit',
    value: 'a directed manager → counterpart interface reached through one active multi-line person',
    detail: 'A person on three active lines creates two interfaces from each holder to the other holders. The same unordered manager pair reached through several people remains one unique pair in the workspace topology, but each manager’s own span still counts every person-interface it must coordinate.',
  }),
  Object.freeze({
    key: 'allocation',
    label: 'Allocation completeness gate',
    value: 'all active lines for every person in a manager span must carry a readable declared allocation',
    detail: 'The reader never treats an undeclared share as zero coordination. One incomplete person refuses that manager’s aggregate rather than publishing a smaller, reassuring subtotal.',
  }),
  Object.freeze({
    key: 'fragmentation',
    label: 'Fragmentation triage floor',
    value: `${MATRIX_COORDINATION_BOUNDS.fragmentedCounterpartFloor} distinct counterpart managers`,
    detail: 'This is a declared review threshold, not a benchmark or evidence that a particular number of counterparts is good or bad.',
  }),
  Object.freeze({
    key: 'dispersion',
    label: 'Counterpart dispersion',
    value: 'exact inverse-HHI as a rational number: E = T² / Σj wj²',
    detail: 'T is the count of directed person-interface exposures and wj is the number reaching counterpart j. The reader prints the numerator and denominator, never a rounded pseudo-precision score. One counterpart gives E = 1; equally distributed exposure over k counterparts gives E = k.',
  }),
]);

export const MATRIX_COORDINATION_METHOD = Object.freeze([
  Object.freeze({
    name: 'Matrix information-processing (Galbraith, 1973)',
    why: 'A matrix adds lateral information-processing demand that a vertical span count cannot see. This reading makes the declared manager-to-manager interfaces visible without calling any particular interface productive or wasteful.',
  }),
  Object.freeze({
    name: 'Attention-based view (Ocasio, 1997)',
    why: 'A manager’s scarce attention is allocated across coordination relationships as well as direct reports. The unit is an interface in the declared structure, never a measurement of hours or personal effort.',
  }),
  Object.freeze({
    name: 'Graicunas / cross-relationship scaling',
    why: 'Coordination complexity changes with relationships, not only headcount. The report therefore separates people in a span, counterpart managers, and person-interface exposures instead of compressing them into one span number.',
  }),
  Object.freeze({
    name: 'Inverse Herfindahl concentration',
    why: 'The exact rational inverse-HHI describes how dispersed the counterpart exposure is. It is topology: it does not predict latency, quality, or a person’s capacity.',
  }),
  Object.freeze({
    name: 'Refusal instead of zero-fill',
    why: 'An incomplete allocation is a missing agreement about the matrix itself. Omitting that person or treating the missing share as zero would make fragmentation look lower precisely where the record is least complete.',
  }),
  Object.freeze({
    name: 'Shared event spine and matrix roll-up',
    why: 'A reporting-line change or explicit scan reaches RULE-MCO-01 through the same post-commit spine as the matrix fan-out. The rule records an aggregate structural trace only; it never opens work, changes a reporting line, selects a counterpart, or proposes an organisational redesign.',
  }),
]);

/** Aggregate-only CSV columns: no person, manager, line or seat identifiers. */
export const MATRIX_COORDINATION_CSV_COLUMNS = Object.freeze([
  'scope',
  'state',
  'manager_spans_n',
  'matrix_people_n',
  'measured_spans_n',
  'fragmented_spans_n',
  'multiple_spans_n',
  'concentrated_spans_n',
  'no_counterpart_spans_n',
  'refused_spans_n',
  'incomplete_people_n',
  'invalid_line_n',
  'directed_person_interface_n',
  'unique_manager_pair_n',
  'counterpart_manager_n',
  'fragmentation_counterpart_floor',
  'states_reconcile',
  'topology_complete',
  'withheld_reason',
]);

export const MATRIX_COORDINATION_CSV_DESCRIPTOR = Object.freeze({
  key: 'matrix-coordination',
  label: 'Matrix coordination topology (aggregate)',
  group: 'analytics',
  sensitive: false,
  filenameSlug: 'matrix-coordination',
  description: 'One workspace row plus one row per structural state: active manager spans, distinct multi-line people, measured / fragmented / several-counterpart / one-counterpart / refused spans, incomplete people and invalid lines, and exact topology counts. A manager span’s exact rational counterpart dispersion is deliberately not collapsed into a workspace score: unlike counts, those fractions have no declared aggregate denominator, so the aggregate export does not fabricate one. NO person, manager, line, declaration, seat id, title, note or free text. If any manager span has an incomplete allocation, workspace topology totals are BLANK and withheld_reason says why; an incomplete line is never treated as zero coordination.',
});
