# ADR-0167 — Per-line feedback-body confidentiality

- **Status:** Accepted and implemented, 2026-11-10 (Session 230)
- **Decision:** A declared reporting line carries accountability for a person's work; it does not grant readership of another manager's feedback conversation.
- **Scope:** Feedback body (`situation`, `behavior`, `impact`, `tags`) in the local seat projection and its mutation doors. This is a local disclosure boundary, not authentication or a defence against the browser owner.

## Context

A person may report to a home manager and one or more project/product managers. Before this decision, the individual-record seat policy let any rank-eligible line manager who reached the person read every feedback body's SBI narrative. The manager needed to see whether feedback existed and its dated factual state, but not another manager's confidential coaching conversation. Feedback records have no historical author for old rows; assigning one during migration would fabricate provenance.

## Rule

1. A non-operator seat whose id matches `authoredById` may read and mutate that feedback body.
2. A different recorded author means the conversation room is known and its body is withheld from both tree and matrix-line readers.
3. A legacy row with no author remains readable through the reporting tree, preserving single-chain behavior; a reader reaching it only through an additional line receives its factual fields and an explicit withheld reason, never body text.
4. A row outside both tree and declared lines is not projected. Unresolved seats fail closed.
5. The factual projection preserves, verbatim, `id`, `personId`, `direction`, `kind`, `date`, `observedOn`, follow-up dates/status and author attribution. It removes SBI text and tags, and carries a render-only `bodyWithheld` marker. No stored record is changed by reading.
6. The create action stamps the active declared seat and timestamp; caller-supplied authorship is ignored. Historical records stay unattributed. A local seat is not a verified identity.
7. `updateFeedback` and `completeFollowUp` re-check the same verdict at the write door. Reassignment and caller-authored attribution changes are refused/ignored. A scoped line may log for a person in its canonical active line scope; all resulting events continue through the existing store/post-commit automation spine.

## Implementation

`feedbackPrivacy.js` is a pure policy/projection helper. `viewScope.js` applies the body stub after canonical seat projection; `accessGateway.js` grants `addFeedback` through the existing `log-feedback` right and direct-line boundary; `actions.js` stamps and rechecks authorship on create, edit and follow-up. The existing `buildMatrix`/`matrixLineScopeFor` and seat engine remain the only hierarchy. No parallel reporting tree, roll-up, or new automation rule is introduced: privacy is enforced at the shared read/write boundary, while feedback events remain on the existing post-commit spine.

Schema v134 adds nullable `authoredById`, `authoredByBasis` and `authoredAt`; migration 133→134 fills null only. No historical author, line, manager or conversation is inferred.

## Consequences and limits

- A line manager sees that another line's feedback exists and the preserved factual fields, but not its narrative, even if the person is also reachable through the tree under a different recorded holder.
- The recorded author can read their body through their active seat. The undeclared operator retains its existing full-workspace view.
- Existing cross-boundary consent grants remain the established release mechanism; this implementation does not add a feedback-specific release flow.
- This does not prove who typed a note; seats are declarations unless the separate identity-attestation feature is enforced.
- Browser review, assistive-technology review, and full-suite validation remain unverified in this session.
