# ADR-0236 — Information-request follow-up lineage: the second demand is not the first

- **Status:** accepted and shipped — Schema v191, the follow-up selector and lineage view, seat-scoped report, and aggregate CSV extension are on this branch.
- **Date:** 2026-11-16
- **Deciders:** The existing director / VP (rank 3+) receive action records a new demand and, optionally, its parent. A parent is selectable only from requests readable by that seat. No new seat right or rule was added.
- **Schema:** **v191** (v190 → v191). Existing information requests migrate as standalone roots with `followsUpOn: null`; no old relationship is inferred, and no new collection is added.
- **Surface:** `#/information-requests` adds a **Follow-up lineage** view and a `followsUpOn` selector to the record-request dialog. CSV scope #178 is extended with identity-free aggregate lineage columns. `RULE-RQR-01` remains rule 151/151 and applies independently to each request.
- **Code:** `rqSchema.js` normalizes the optional parent edge; `rqActions.js` enforces readable-parent, verdict-instant and receipt-day gates; `rqProduction.js` derives relationship states, depth and counts; `rqReport.js` withholds hidden lineage; `rqRegistry.js` owns the closed vocabulary and metadata; `informationRequests.js` renders the selector and view.
- **Tests:** [`information-request-lineage.test.mjs`](../../tests/app/information-request-lineage.test.mjs) — 6/6 focused tests pass. This suite does **not** discharge Session 314's separately deferred lifecycle-verification claims; see §Verification.
- **Builds on:** ADR-0235 (Schema v190, the information-request response register), ADR-0140/0141 (matrix accountability and line scope), and the standing rule that relationships are declared rather than inferred.

## Context

ADR-0235 records the requester's verdict on a released production. `insufficient` is a fact about that production and remains the state of the original demand. But the requester may send a second demand after that verdict — perhaps asking for the omitted exception log, another period, or material from another reporting line. Without a typed relationship, the register cannot distinguish a declared follow-up from two unrelated requests, while reopening or overwriting the first request would erase its own scope, clock and response history.

A shared requester, instrument, date or similar free-text scope is not evidence that two demands are related. Nor does a relationship authorize a seat to read either request. The edge must be explicit, bounded by the recorded verdict, and preserve the two requests as separate obligations.

## Decision

**A follow-up is a new demand with one optional, human-declared parent.** `informationRequests[].followsUpOn` stores the selected prior request id; `null` means an original / standalone request. The receive action is the only supported path that creates the edge. It does not infer lineage from wording, requester, instrument, chronology or matching metadata, and there is no edit action that silently rewrites a request's recorded identity.

**The parent must be readable and already found insufficient.** At record time the action reads the seat-scoped report and refuses a parent that is not visible to the acting seat. It then requires the parent's recorded requester response to be `insufficient`, requires the actual response-act instant to be no later than the new record's creation instant, and refuses a declared child `receivedOn` day before the verdict's calendar day. A same-day receipt is valid only when the verdict was already recorded first. Each refusal writes no child request.

**Stored order is independently checked.** The normalizer accepts a parent only when it exists, is not the child itself, precedes the child in the request ledger and was not created after the child. Dangling, self-referential, later-in-ledger or backwards-created linked rows are dropped and counted. The read model also refuses to substantiate a surviving declared edge when the parent has no insufficient verdict, the child record predates the actual verdict instant, or its declared receipt day predates the verdict day. Those rows are flagged and counted as unsubstantiated; the reader never repairs the link.

**The child remains separate.** Its requester, instrument reference, scope, received day, reply clock, production lines, review, release and requester verdict belong to the child. The original stays `insufficient`; a follow-up does not reopen it, inherit its deadline or certify the same production twice. `RULE-RQR-01` reads each as a distinct demand, so the child owes its own line, review, release and response acts.

**Lineage is a derived read model, never a stored verdict.** The kernel attaches `original`, `follows-up-after-insufficient`, `parent-not-insufficient`, `recorded-before-parent-verdict` or `received-before-parent-verdict` status, supported depth, root and direct-child summaries. A missing parent is dropped by the loader rather than surfaced as a dangling edge. It counts original requests, declared follow-ups, supported and unsubstantiated edges, roots with direct follow-ups, maximum supported depth, and whether every declared edge is supported (`declaredLinksSupported`).

**Completeness claims stay distinct.** `partitionReconciles` still means the state buckets add to the request total. `figuresComplete` still means no request/act rows were dropped and no production line is unassigned. `declaredLinksSupported` is the separate lineage claim; a truthful lineage result does not overwrite or redefine general figures completeness.

**A link never widens access.** The report includes parent or child details only when both linked rows are visible to the seat. If the parent is hidden, the child shows `parent-withheld`, with no parent id/details, root or depth; an unsubstantiated flag is also suppressed so a hidden parent's verdict is not disclosed through the child. If any request is hidden, the whole-register lineage totals are withheld rather than describing a partial graph. The CSV contains only aggregates and no request/parent ids, requester names, scopes, methods or person identities.

**The migration is deliberately inert.** v190 requests receive `followsUpOn: null` in the v190 → v191 migration. No relationship is guessed from existing insufficient verdicts, matching requesters, dates or text. No request, act, verdict, setting or marker is added at upgrade.

## Consequences

- The register can distinguish a human-declared follow-up from a standalone demand while retaining each demand's own deadline and lifecycle.
- A linked follow-up is not proof that its free-text scope is the same as its parent. The relationship is a declared administrative fact, not a semantic comparison or legal conclusion.
- Invalid historical or hand-edited edges fail closed and remain visible as dropped/unsubstantiated evidence; they are never silently repaired.
- The existing aggregate export gains `follow_up_requests`, `follow_ups_after_insufficient`, `follow_ups_unsubstantiated`, `roots_with_follow_ups` and `max_follow_up_depth`. It exports no edge identities or request text.
- No new automation, external document storage, regulator portal, jurisdiction calendar, authentication, or person/team responsiveness score is introduced.

## Verification

`node --test tests/app/information-request-lineage.test.mjs` passes **6/6**. The suite covers the empty-root v190 → v191 migration; parent ordering and dangling-link refusal; a corrupt child record predating the actual insufficient-verdict instant; the API's same-day timestamp gate; a real store/API lifecycle through production, independent review, release, insufficient verdict and a separate linked child; kernel/report/CSV/DOM consistency; the selector's readable-parent list; hidden-parent withholding and action refusal; and regressions where a hidden parent's absent verdict cannot leak through the child's flags or where a visible parent summary cannot expose a hidden grandparent's relationship state. The real lifecycle test exposed and fixed a normalization defect: the producer's canonical no-privilege object (`claimed: false`, zero withheld count, blank basis) was rejected by `normalizePrivilege`, so an ordinary production could not be read back. The normalizer now accepts that exact no-claim shape and still refuses a nonempty claim basis/count without `claimed: true`.

Changed-file ESLint passed. The adjacent wiring suites plus the lineage suite passed **53/53** after one stale head-pin in `domain-sense-wiring.test.mjs` was corrected from 150 to the current 151-rule spine (ADR-0235 added `informationRequestRule`; ADR-0236 adds no rule). `npm run check:boundary` passed (1,056 app modules, 292 test suites, 23 documentation checks, zero leaks); `npm run check:links` passed (1,316 internal links / 356 Markdown files); `npm run check:a11y` passed (138 declared routes). The tracked standalone was rebuilt at **20,352,701 bytes / 1,051 source modules / Schema v191**; its focused suite passes **7/7** after moving the absolute size tripwire to 20,450,000 while retaining the 24,000-bytes-per-module density guard.

These checks do **not** replace the verification debt recorded by Session 314. In particular, this suite set does not pin every privilege-refusal path, lapse and rate denominator, `RULE-RQR-01` ask/marker idempotence, pause/scan behavior, or every persisted-reload claim listed in [ADR-0235 §Verification](./0235-regulator-information-request-response-register.md). Those Session 314 checks remain **[UNVERIFIED]** unless separately run; neither this suite nor the schema-version pin updates clear them. A full canonical test run and a real-browser / assistive-technology walkthrough are not claimed here. The wider stale CSV-count and migration-array pins catalogued in Session 311 also remain outside this change.

## Benchmark

**[BENCHMARK-UNVERIFIED]** — no vendor environment was run. MetricStream's published [Regulatory Engagement Management](https://www.metricstream.com/products/regulatory-engagement-management.htm) description covers examinations and information requests in a connected repository with owners, evidence and response letters, but does not establish a declared parent/child chain for follow-up demands. Relativity's [privilege documentation](https://help.relativity.com/RelativityOne/Content/Relativity/aiR_for_Privilege/aiR_for_Privilege.htm) describes document-centered privilege review, not regulator-demand lineage. ServiceNow's [GRC overview](https://www.servicenow.com/products/governance-risk-and-compliance/what-is-grc.html) is a broad linked-risk/control/evidence workflow, not proof of this specific feature. These pages inform the comparison only; parity is not asserted.
