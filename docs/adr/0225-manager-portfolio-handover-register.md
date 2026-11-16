# ADR-0225 — Managerial portfolio handover & successor-acceptance register

- Date: 2026-11-16
- Status: Accepted
- Primary duty: director / VP (declares and governs a transition; releases outgoing authority); CEO / C-suite oversight; frontline / mid-manager as the outgoing holder or the successor
- Structures: single-chain and matrix
- Source schema: v180; route `#/manager-handover`; CSV #167; rule `RULE-MHH-01`

## Context

When a manager's role ends — a line exit, a reorganisation, a planned succession — the portfolio of live obligations the manager holds does not expire with them. The workspace already measures succession readiness (who could hold a seat), frozen-decision authority (whether the authority that made a frozen decision was in force), the leader's own absence drill, cover during absence, and operational shift-to-shift changeovers. Nothing records the one act those all leave open: the **formal transfer of a manager's live portfolio to a named successor, accepted by that successor in their own name, with the outgoing authority released by the declaring governor**.

Without it, the unit silently loses decision flow: delegations the manager held, goals they owned, open cases they decide, escalations routed to them and operating forums they chair all become unattributed the moment the role changes, and nothing on the record says who now holds them or when the transfer was accepted.

## Decision

Build a local-first, human-act ledger. A handover is a **declared transition plus an append-only act stream**; no stored flag completes it and no date transfers anything.

### Declaration and portfolio

Three collections are added EMPTY at upgrade: `mgrHandovers`, `mgrHandoverActs`, and `mgrHandoverMarkers`. `MIGRATIONS[179]` advances schema v179 → v180 and sets the new `mgrHandoverAutoPropagate` convention to its default (`true`) without inferring a transition from a reorganisation, a roster edit, a line-exit record or any other existing row.

A declaration names the role being transitioned, the outgoing manager, the successor, the declaring governor (all distinct active roster persons, reachable from the operating seat through the declared tree / Matrix scope), a declared-on day, a planned effective date on or after it, at least one portfolio category to transfer, and a closed reason kind. The declared portfolio scope is a closed vocabulary of five categories, each **read from the record the workspace already stores** — active delegations held, active goals owned, open cases owned, escalations routed to the manager, operating forums chaired. The register never re-enters portfolio contents and never invents an obligation. A category whose source is unreadable is refused with its reason printed and counted, never rendered as a zero.

The register keeps two claims apart on purpose: **what the outgoing manager states in the brief** and **what the record actually reads**. The delta between the two is printed, never reconciled away.

### Three keys, in order; no automatic transfer

1. **Portfolio brief** — the outgoing manager, or a manager strictly above them on a live line, records what they hold, the open items and the evidence they checked. This is a statement, not a transfer.
2. **Successor acceptance** — the named successor, first-person, records how many portfolio items they accept. Accepting fewer than the read portfolio prints a **shortfall**; it is never absorbed into a reassuring total, and an acceptance above the read total is refused.
3. **Governor release** — the declaring governor, or a manager strictly above them, releases the outgoing manager's authority. It requires the acceptance already on the record — or, for a disputed transition with no acceptance, a settlement that states its ground. Authority is not inherited by date.

The successor may instead record a **dispute** with a stated ground. A dispute routes to the **lowest joint apex set above EVERY active reporting line of both the outgoing manager and the successor**, computed from the live Matrix graph. A diamond tie is a set of duties, not a winner; the synthetic workspace leader is never an askable seat; a graph that cannot name such a seat prints its reason and asks nobody. A dispute is settled only by a governor release with a stated ground, or by the successor recording an acceptance.

A planned effective date that passes with no acceptance and no dispute prints **`lapsed`**. Lapse is a printed failure state; it never transfers an obligation, never infers an acceptance and never elects a substitute.

### Person-bound obligations and matrix correctness

Escalations routed to the departing manager are person-bound: each names an origin seat. An origin outside the successor's live lines is counted **cross-line**, printed with its reason, and never silently transferred or auto-assigned to a single manager's line. Delegations, goals, cases and forums are role-bound and transfer with the role — but only through the successor's own acceptance. A roll-up never counts an obligation twice, never drops one because a second line was invisible to it, and never silently picks one of several managers as the owner of the resolution: where ownership is genuinely ambiguous, the joint seat is named and asked.

### Access and CSV

Rights are `read-mgr-handover` (rank 1–5), `declare-mgr-handover` (3–5), `brief-mgr-handover` (1–5), `accept-mgr-handover` (1–5), `release-mgr-handover` (3–5) and `dispute-mgr-handover` (1–5); every action re-checks its role, the first-person actor and the live Matrix. The collections are report-only and excluded from the generic seat projection. A dedicated reader exposes a transition only within the declared span / Matrix scope or to a frozen joint reviewer; identities are withheld at rank 4+ without full access.

`RULE-MHH-01` runs on the shared post-commit spine and on an explicit scan. It files at most one opaque `act-inform` delegation per (deterministic `mhh1:…` signature, addressee), bounded to four per commit with the remainder counted, and asks only for the key that is owed: the brief (only while the outgoing manager holds a live line), the acceptance, the release, or one review per frozen joint apex of a dispute. A person no longer on a live line, or a graph that cannot name a joint seat, writes one identity-free `mgrHandoverMarkers` observation and substitutes nobody. Asks self-close when the condition clears or the addressee moves, and respect human closures and returns. `mgrHandoverAutoPropagate` governs both the commit and the explicit-scan path.

CSV scope #167 contains only summary, derived-state and portfolio-category counts; it exports no manager, successor, governor, role reference, portfolio item or act text. A numeric release is withheld with a reason if the claim is incomplete or any cell is nonzero and below the floor of three, with complementary suppression of the whole release so totals cannot recover a small cell by subtraction.

## Consequences

- A role change without a declared handover is visible: the register reads the portfolio the record holds, and an unbriefed, unaccepted or disputed transition stays open and printed until the human keys are recorded.
- The register measures a **transition**, never a person: no handover volume, acceptance rate or performance score for any manager is produced or exported.
- The highest-assurance state the software can display is that the required human acts were recorded in the expected order. It is not evidence that the successor is actually capable, that the portfolio is complete, or that the outgoing manager's authority was properly divested in any legal or HR sense.
- A manager cannot take the successor's acceptance for them; the governor cannot release authority before the acceptance exists; elapsed time cannot complete any key.
- Local self-attestation can be impersonated by anyone with access to the same local workspace. A deployment requiring signed identity, non-repudiation, tenant isolation or legally binding succession needs a separate authenticated service and operational policy.
- The generated four-stage diagram `app/assets/mgr-handover-method.jpg` is a method aid, not an HR or legal document.

## Sources and limits

- High-reliability organizing and boundary-transfer practice: Patterson et al. (2004) on high-reliability-organization handoffs; Starmer et al. (2014, *NEJM*) I-PASS handoff bundle (the two-key readback posture used by the shift-handover ledger, ADR-0223); Weick & Sutcliffe on preoccupation with failure.
- Organization design: Jaques (1956/1964) time-span of discretion; Rummler–Brache (1990/1995) on the work a role exists to perform; Jensen & Meckling (1995) and Aghion & Tirole (1997) on authority and subsidiarity.
- Matrix accountability: ADR-0140 / ADR-0141 (joint apexes above every line; no silent single owner).
- **[BENCHMARK-UNVERIFIED]**: no hands-on comparison with a dedicated managerial-transition or succession-execution tool was performed this session. The bar set by practice — an explicit, rehearsed, two-key boundary transfer with a named governor — is the bar this register is built to; competitive parity with any specific product is not claimed.

Real-browser and assistive-technology behavior, the complete test suite, and the effectiveness of the local process remain **[UNVERIFIED]**. The exact build outcome for this session is recorded in `AI-SESSION-LOG.md`.
