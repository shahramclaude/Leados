# ADR-0168 — Cross-line bench-evidence sufficiency: who said the person is ready

- **Status:** Accepted and implemented, 2026-11-10 (Session 231)
- **Decision:** A succession bench claim (`readiness` rating) must be readable together with the evidence gathered from every reporting line the person actually worked on during its evidence window. Where a line was never asked, went silent, or the assessor is contested, the claim says so — it is never scored down, and the person is never rated.
- **Scope:** One pure read model (`benchEvidence.js`) over records the workspace already stores, one rule on the shared spine (`RULE-BNE-01`), one marker collection (Schema v135), one panel (`#/succession?panel=evidence`), one aggregate CSV scope (#123) and one read right. This is a local operating-surface capability, not authentication and not a predictive model.

## Context

A person on a succession slate may hold several reporting lines at once (functional manager, project/product manager, cross-functional lead). The workspace already stores three facts, and had never joined them:

1. the **stored readiness rating** and the behavioural evidence the readiness engine grades it against (`readiness.js`, a 90-day window);
2. the **per-line review stewardship states** — every line that was *asked* for review input and every line that *answered* in its own words (`reviewStewardship.js`, ADR-0147);
3. the **lines in force** during a review period, resolved through the one canonical matrix DAG (`buildMatrix`, `periodLinesFor`).

So a "ready now" claim for a person working across three lines could rest entirely on the home-line manager's impression while the other lines were never asked — and the board would read a name with no way to tell. ADR-0166 closed the equivalent gap for a *pay* decision. Nothing had closed it for a *bench* decision, where the consequence is a seat, not a percentage.

## The problem the design had to solve first

A readiness rating is graded on **a 90-day window ending on the reading's own day** (or today, where the reading is newer). A review's line states are stored against **a review period**. The two windows are not the same, so a join must choose *which review* supplies a claim's line evidence. Doing that per claim, silently, would make two claims incomparable and any rate over them meaningless.

**Decision:** the rule is declared as data — `BENCH_EVIDENCE_CONVENTIONS.reviewWindow = 'nearest-before'` — and printed on every row, in the brief and in the export. It reads the latest **completed** review whose period **ends on or before** the last day of the claim's evidence window, and nothing else. A review whose period had not closed by that day is not eligible: reading it would attribute evidence the window does not cover.

## Rule

1. **One claim, one state.** Every `readiness` record naming a person on the active roster is one bench claim. Its evidence state comes from a **closed, ordered list** with declared precedence (worst first), so the panel, the brief, the CSV and the rule cannot disagree about a word:

   `no-review` → `contested-assessor` → `unowned-assessor` → `line-unasked` → `line-silent` → `line-awaiting` → `home-line-only` → `corroborated` → `single-line`

2. **Never asked is the finding; silence is a different word.** `line-unasked` (no ask on record), `line-silent` (asked, due date passed, no answer) and `line-awaiting` (asked, window still open) are three distinct states. A reasoned **decline counts** toward corroboration and is never missing evidence. A claim whose only non-home line declined reads `corroborated` for the procedure and `home-line-only` is not claimed over it.

3. **No substituted review, no invented share.** A claim with no eligible review reads `no-review`, is excluded from every rate, and no neighbouring review is read in its place. No per-line *contribution* share is ever computed: feedback, 1:1 notes, recognition and delegations carry a subject and no authoring line (ADR-0147's own finding), so any share would be fabricated. What *is* attributable is a line holder's dated, first-person answer — and that is what is printed.

4. **The rate is refused rather than narrowed.** The evidence-complete rate over cross-line claims is BLANK with a printed reason below a declared floor of three claims, over a population with **any** unreadable claim, or when no claim is cross-line. A withheld figure is never a zero.

5. **Two claims are kept apart.** `reconciles` (the printed state counts add up to the claims printed) and `figuresComplete` (every claim in scope was actually readable) are different facts and are reported separately, exactly as the Bulletproof Reliability Mandate requires.

6. **The home line is resolved as-of the window, in three states.** It is read from the dated structure ledger (ADR-0149): `observed` (a recorded period covers the day), `presumed-current` (this person has **no** recorded structure history at all, so today's roster pointer is *presumed* to have held — printed as a presumption), or `unrecorded` (records exist and none covers the day — **unknown**, and no pointer is projected backwards).

7. **The rule writes work, not corrections.** `RULE-BNE-01` fires on `readiness.set`, on `review.completed` and on an explicit scan — never on a read. For each open claim it issues **at most one** owned, dated delegation to the as-of home-line holder: *"obtain the missing observation"*, or *"obtain the outstanding line answer"* where the line's own window is still open — two different asks, because two different things can still be done. Typed provenance only (`concerns`, `issues-obligation`, `rolls-up-to` per leadership ancestor). It never edits a rating, a review or a line. Contested, unowned and no-readable-home-line claims issue **nothing** and are counted, because an ask addressed to nobody can never close.

8. **Disclosure.** The claim register names a person and a bench seat, so it follows the `readiness` record policy's detail ceiling: above rank 2 the rows print a stable claim reference and no name, while every count still includes them. The export (#123) is aggregate-only: no person, name, manager, seat, rating or review id.

## Alternatives rejected

- **Scoring readiness down when a line was silent.** Rejected: that would convert a defect in the *evidence procedure* into a judgement about the *person*, which is exactly the failure mode this product exists to refuse.
- **Picking the review per claim by "most recent" regardless of period end.** Rejected: it silently attributes evidence from a period that had not closed, and makes two claims incomparable.
- **Averaging lines into a per-line contribution share.** Rejected: not computable from the record; ADR-0147 documents why.
- **Issuing an ask to every line manager on a contested assessor.** Rejected: a task addressed to a contested set can never close, and choosing one of two holders would be the silent owner this workspace refuses to invent.

## Consequences

- A leader can now see, per current bench claim, **who said so** — and the reading refuses to print a rate it cannot support.
- A single-chain workspace is unchanged and inert: every claim reads `single-line`, the rule issues nothing, and the register says so.
- Schema v135 adds **one** collection (`benchEvidenceMarkers` — RULE-BNE-01's idempotency ledger) and changes no record; migration `134 → 135` is an empty append.
- The reading stores no verdict. Every figure is re-derived on read, so the screen cannot drift from the record.
- Named framework basis: evidence sufficiency for talent decisions (Silzer & Church 2009; Church & Rotolo 2013), multi-source assessment as additive only across different observation contexts (Borman 1974; Conway 1996), structural holes and evaluator asymmetry (Burt 1992), procedural justice in evaluation (Leventhal 1980; Tyler & Lind 1992), and disclosure control with printed refusals (ADR-0126/0139).

## Verification

`node --test tests/app/bench-evidence.test.mjs` — 16/16 PASS, including: the declared review rule choosing an eligible review and refusing a later one, a draft and a period that had not closed; `no-review` excluding the claim from every rate; the four unasked/silent/awaiting/declined cases kept distinct; the rate printing at exactly the declared floor and BLANK below it (asserted on the CSV cell, never a zero); `reconciles` true while `figuresComplete` false over the same population; **display == stored** across a real reload with reads mutating nothing and bumping no revision; the rule issuing exactly one owed ask idempotently at the as-of home-line holder with the rating untouched; contested assessors issuing nothing and being counted; a single-chain workspace issuing nothing; CSV #123 matching the panel cell for cell with an identity audit over the whole file; migration `134 → 135`; and a JSDOM render printing the blob's own figures.
