# Focused audit — 2026-10-25, Session 20

## Scope and starting state

- Checkout: `/home/user/Leados`, active branch `arena/ba4903e2-leados`, starting commit
  `d59377d` (merge of PR #18); the working tree was clean before this priority. The feature audit
  inspected onboarding/check-in normalization and actions, Today and plan views, 1:1 modal and
  ledger reconciliation, review evidence, CSV exports, event persistence, snapshot rewind and
  the relevant tests. This is a focused audit, not a manual review of every repository source.
- Check-ins were recorded as one `{heldOn, summary, blockers}` object per Day 30/60/90 horizon.
  There was no separately owned follow-up record. Recording a check-in did not create an action,
  correctly avoiding the conversion of a blocker note into a promise.
- 1:1 actions were nested under actual meeting records. The modal tracked reconciliations by
  meeting/action IDs and `logOneOnOne` validated chronology, person, open status and outcome
  before mutating the source. A phase check-in therefore must not be represented as a fabricated
  meeting.
- `openActions`, `leaderObligations` and the 1:1 board already provided the common follow-through
  ledger. The `actions` CSV was already a union of multiple source types. Review evidence is a
  separate, frozen evidence set; the onboarding blocker text was not among its inputs.
- The active feature gap was an explicit next step for the manager's own follow-through after a
  phase conversation, with source provenance retained through later reconciliation.

## Research and selected design

Official ACAS induction guidance and CIPD induction tools recommend planned, tailored onboarding,
regular manager conversations, feedback and review of training/support needs. MIT HR recommends
shared responsibility, clear expectations/resources, ongoing dialogue, concrete next steps and
planned follow-up. Lattice's action-item documentation illustrates assigned, optionally dated
items that persist until completion. These sources support making a concrete manager promise
trackable; they do not establish a universal deadline or demonstrate that LeadOS improves
outcomes. Full citations and limits are recorded in `RESEARCH.md` §30.

Selected improvement: after a check-in is recorded, the leader may deliberately create a dated
manager-owned action. The action holds a stable source check-in ID, source plan ID, exact phase and
the check-in date captured when the commitment was made. It lives in its own schema collection,
not in a synthetic meeting. It appears in the shared commitment ledger/Today ownership surface;
a later real held 1:1 can explicitly close, carry or drop it. A carried copy preserves its original
check-in provenance and also records the real meeting that carried it.

The form starts blank. The user describes only a concrete action they own; blocker/support notes
are neither prefilled nor copied. The new ledger is not a review-evidence source. Schema v14 adds
an empty collection on migration and stable IDs for existing check-ins during normalization;
older check-ins and 1:1 actions are not converted into commitments. No dependency, backend,
account, network call, reminder or new sensitive field is introduced.

## Verification boundary

- Added migration/normalization, source identity/date, validation, manager ownership, carried
  lineage, done/drop, CSV, timeline, snapshot rewind, performance-review evidence exclusion,
  JSDOM dialog/board and real-1:1 reconciliation coverage.
- The initial test invocation could not load `jsdom` because dependencies were not installed in
  this checkout. `npm ci --no-audit --no-fund` installed the existing lockfile packages. The
  final suite, lint, syntax and diff checks are recorded in the Session 20 log after completion.
- Real-browser/mobile behavior, screen-reader and assistive-technology behavior, manager/employee
  comprehension, privacy/outcome effects, representative large-workspace performance, print/PDF
  layout, and manual review of the full legacy source/build/deployment remain **[UNVERIFIED]**.
