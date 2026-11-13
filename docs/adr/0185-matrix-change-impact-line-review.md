# ADR-0185 — Matrix Change-Impact Line Review

**Status:** Accepted — 2026-11-12 (Session 253)
**Schema:** v146 → v147 — two empty append-only collections (`changeImpactRequests`, `changeImpactResponses`); no historical requests or responses are inferred
**Surface:** `#/matrix?panel=change-impacts` · CSV #139 `matrix-change-impact` (one aggregate row) · safe reads `changeImpactReview*` · `RULE-CIL-01`
**Altitude / structure:** frontline, mid-manager, director, VP and CEO × matrix. The general `#/changes` route keeps its existing rank-3 floor; the dedicated Matrix surface is separately seat-scoped.

## Context

A change can name impacted people, while the Matrix can carry more than one active reporting line for each person. Before this register, the workspace had no dated record showing which active line was asked to review that person's impact, what the line reviewed, or whether it answered. The change's open status is not evidence that every line considered the same facts. Nor is a manager's review employee consent, an approval, or permission to proceed.

The existing Matrix line-consent register covers declared reporting-line shares; it does not establish that a line reviewed a particular change impact. Retrofitting that meaning onto line consent, or synthesizing requests from old changes, would create a human act that never occurred.

## Decision

### 1. A request is an explicit, dated human act

Schema v147 adds `changeImpactRequests` and `changeImpactResponses`. Both start empty for existing workspaces. A request is created only for an open change and an impacted person with at least two verifiable active Matrix lines. The requester chooses the line and an explicit due date (today through 30 days); no issuer, request date, deadline, or request is back-filled from an existing change or line.

Each per-line request freezes the same full snapshot: the material change brief and target structure (including `currentType`), all five STAR pillars, the impacted-person row and roster context, and the complete active Matrix line set with its declared manager, role, kind, share, rights, dates and note. The request names the one line being asked, but the entire line set is frozen so a moved, added, removed or materially edited line invalidates the old context consistently. Snapshot comparison is canonical; line allocation is not used to choose who must review.

### 2. A response belongs to the named line holder

Only the active seat named as manager on the requested line may answer. A response is either:

- `reviewed`, with a first-person description of what the line examined and an explicit valid-through date (tomorrow through 365 days); or
- `declined`, with a first-person reason.

Each request accepts one append-only response. A late answer can be recorded and is marked late; it does not rewrite the due date. An unanswered overdue request may be superseded by a new explicit request. Refreshes, declines and expiries append history rather than replace or erase it.

### 3. RULE-CIL-01 is a coverage invariant, not an approval rule

The live reader counts a line as currently reviewed only when its latest dated request and first-person response match the unchanged live change, impact and complete active-line snapshot, and a `reviewed` response is still inside its explicit valid-through date. Silence, a decline, an overdue unanswered request, an expired response, an unreadable line set, a changed snapshot, and a closed change never count as current review coverage. Superseded requests and responses remain historical.

`RULE-CIL-01` is enforced by the request/response guards and the derived reader. This slice does not auto-create requests, invent a due date, open escalation work, close a change, or gate implementation. A `covered` reading means only that each in-scope line has a current review record; it is never sign-off or permission to proceed.

### 4. Keep the read boundary separate from the general Changes portfolio

The Matrix panel has its own seat-checked reads and actions. Frontline and mid-manager seats see their own line and requests they issued; director-and-above seats see the complete in-tree impact rows; workspace full access sees the workspace. A request may follow a declared Matrix line outside the requester's tree, but cannot cross into an unrelated peer span. A line holder cannot request a response for their own line, and a workspace operator cannot answer in a line holder's name. Raw request and response collections have `detailCeiling: 0` and are not projected to declared seats.

The `#/changes` route remains rank-3-gated. No general route floor is lowered to expose the Matrix-specific line task.

### 5. Withhold an incomplete coverage percentage; export aggregates only

The panel prints current obligations, unrequested/pending/overdue/declined/expired/stale states, retained history and explicit refusal reasons. A percentage is withheld below the code-declared three-row floor, or whenever line scope is incomplete, unreadable, hidden, truncated or non-reconciling. An unreadable active line set is reported as an issue without guessing how many lines it contains.

CSV scope #139 emits one aggregate row only. It contains counts, coverage/refusal metadata and no change title, person, manager, line, record id, request prompt, response basis or decline reason. The panel's CSV adapter applies the caller's seat scope; the workspace export is likewise identity- and prose-free.

## Alternatives considered

- **Back-fill requests or responses from existing change records, line consent, or a manager's role:** rejected. Those records do not prove a dated request or a first-person review of this change snapshot.
- **Create requests automatically when an impact appears:** rejected for this slice. A deadline and issuer must be explicit; automation must not impersonate a human ask.
- **Let an operator or another manager answer for the named line:** rejected. Review is attributable to the line-holder seat, not the workspace administrator or a peer.
- **Treat `covered` as approval or a release gate:** rejected. Review coverage is evidence of review only; implementation authority and employee consent are separate decisions.

## Consequences

- Existing workspaces migrate additively to v147 with empty request and response ledgers. No historical request, review, decline, consent, approval or permission to proceed is invented.
- Changed facts make earlier responses stale without deleting them. Explicit dates make overdue and expiry states reproducible on read.
- Users must initiate a request and choose its due date. This avoids silent auto-routing but does not provide a post-commit escalation rule or workflow gate.
- The ledgers are bounded at 1,200 requests and 1,200 responses; each snapshot supports at most 12 active lines, and the panel report is capped at 200 rows. Overflow/incomplete reads withhold coverage rather than print a partial percentage.
- If a later governed change-execution workflow needs automated routing or a gate, it must define the responsible authority separately and must not reinterpret `covered` as consent or approval.
