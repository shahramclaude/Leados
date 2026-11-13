# ADR-0181 — Non-Promotable Work Turn Ledger

**Status:** Accepted — 2026-11-11  
**Schema:** v143 → v144 (two additive collections, empty on upgrade)  
**Surface:** `#/matrix?panel=turns` · CSV #135 `work-turns` · `RULE-NPW-01`

## Context

Every team has work that has to be done and advances nobody who does it: taking the notes, onboarding the new starter, sitting on the committee, organising the offsite. A manager is accountable for the pattern of who gets it. The record held every ask (`delegations`) and, since ADR-0178, which reporting line an ask came down. It held nothing about what **kind** of work an ask is, so the pattern could not be read at all.

A matrix makes it worse in a way no single manager can see. Two managers each hand a shared contributor a fair turn of their own team's housework. Each queue looks reasonable. The contributor carries two teams' worth, and neither manager's view shows it.

The practice this implements:

- Babcock, Recalde, Vesterlund & Weingart (2017), *Gender Differences in Accepting and Receiving Requests for Tasks with Low Promotability*, and Babcock, Peyser, Vesterlund & Weingart (2022), *The No Club*: low-promotability work is unevenly distributed, the people who carry it pay for it in advancement, and the remedy is to **allocate it deliberately — by turn — rather than by who says yes**.
- Diekmann (1985), the volunteer's dilemma: when everyone benefits if someone does the task, the person who does it bears the cost alone.
- Holmström & Milgrom (1991), multitask agency: effort moves to what is measured and rewarded, so unrewarded work lands on whoever is asked. Bernheim & Whinston (1986), common agency: several principals each optimise their own ask of one agent.
- Adams (1965) and Leventhal (1980): people judge the fairness of an allocation by a consistent, stated rule, not by any single outcome.

Absence was checked before building: `non-?promotable|glue work|office housework` matched no file under `app/` and no line of `ROADMAP.md`.

## Decision

**Store one thing: a manager's declaration.** `workTurnActs` is an append-only list of dated acts, each declaring ONE ask `non-promotable` or `promotable`. The latest act per ask is effective; earlier acts stay as evidence. An act is made by a seat that reaches the person (their span, or a declared reporting line) or by the full-access operator, and never by the person carrying the ask. `workTurnMarkers` is the rule's bounded idempotency ledger. No pool, turn, share or verdict is stored.

**Nothing is inferred.** No kind is derived from a title, a role, a team or who the person is. An ask nobody classified reads `not classified` and is charged to nobody. The migration adds two empty collections and fabricates no kind, so every existing ask starts unclassified.

**`buildWorkTurns` is the single read model** for the panel, CSV #135 and the rule.

- *Population.* Asks handed over inside the declared look-back window. An ask outside the reading seat is counted as not read. An ask that was handed back is counted apart and carried by nobody. An ask an automation rule issued — recognised by a rule's `issues-obligation` link, or a rule identifier in the ask's support note or bracketed at the head of its title — is counted apart: it is not a manager's choice of person. This also excludes the rule's own asks from the reading that produced them.
- *Placement.* A non-promotable ask is charged to the pool of the manager whose line it came down: the recorded ADR-0178 attribution when it names a line the person still holds, or the person's only line. On a person with two or more lines and no attribution it is charged to **no** pool. An attribution to a line no longer held reads `stale` and is never re-pointed.
- *Pool and fair turn.* A pool is one manager and everyone they hold on an active line. A person's fair turn is `pool total × their share on that line ÷ the pool's total share`, in exact integers. Someone who gives a line 40% of their time owes it 40% of a turn. The figure is printed as the exact fraction with a truncated two-decimal rendering beside it.
- *Over a fair turn.* Two or more of the pool's asks AND `asks × total share × 100 ≥ threshold % × pool total × share` — one integer comparison. A pool below the declared floor, with one person, with a share missing, or partly outside the reading seat makes no claim.
- *Stacked.* A person on two or more lines, every pool they sit in read, none over a fair turn with them, asks on two or more of their lines, and in sum `asks × people read × 100 ≥ threshold % × all non-promotable asks read`, tested only once the asks read reach the floor. This is the finding only a matrix has.
- *Unread.* A person carrying two or more non-promotable asks whose pools could not all be read is `unread`, never `within`. One ask can meet neither test, so `within` is exact for it.
- *Next turn (2026-11-12 addendum).* A member's lower count is the classified, placed non-promotable asks; its upper count also includes recorded unclassified or unplaced/stale asks that could belong to this pool. A valid attribution on an unclassified ask restricts it to that line. The lowest count-to-share set is named only if it is **identical for every resolution** of these bounds; otherwise possible minima and unresolved counts are shown, not a selection. Missing shares, a partial pool, related matrix defects, ambiguous ask ids or fewer than two positive-share members refuse the ranking. All-zero pool shares also refuse the existing fair-turn calculation, rather than divide by zero.

The partial-identification calculation is exact for one pool under those independent recorded-fact bounds: candidate `i` is possible iff `lower_i / share_i ≤ upper_j / share_j` for every other candidate `j`; it is certainly among the minima iff `upper_i / share_i ≤ lower_j / share_j` for every `j`. The complete set is stable iff possible and certain sets match. Integer cross-products and the two smallest bounds avoid rounding and quadratic scans. One unplaced matrix ask may be *possible* in multiple pools but is charged to none; these per-pool upper bounds must not be added across pools.

Every partition (population, classes, placements, verdicts, pools, owners and next-turn evidence) carries its own reconciliation flag. CSV #135 appends identity-free counts of each next-turn state and refusal, plus a separate zero-total-share pool count; the existing missing-share count never includes a declared zero. The method card's conceptual diagram was generated with Arena's image-generation tool on 2026-11-12, inspected for its labels and arrows, then compressed to JPEG; it contains no workspace data. The offline build embeds those same bytes. The Higgsfield connector was unsupported; no Higgsfield skill or subscription was verified or used.

**Conventions are declared and bounded.** Look-back window 90 days [28–365], floor 4 asks [2–50], over-turn threshold 200% [125–500], ask window 7 days [1–30], automation on. The setter refuses an out-of-bounds value with the bound printed and saves nothing; the loader clamps a stored value.

**`RULE-NPW-01` runs on the shared post-commit spine**, registered before `seatRule` and `sealRule`. For a concentrated pool it keeps at most one open dated ask with that pool's manager. For a stacked person it keeps at most one with the single roster seat above every line they hold (`matrixJointApex`). It asks once per finding signature — the exact set of asks behind the finding — so a human who closed the ask is asked again only when the pattern continues. It closes its own ask when the reading clears. An owner that is the workspace leader, off the roster, or tied between incomparable seats is recorded as an observation; nobody is substituted. It is capped at 8 asks per commit with the remainder counted, is pausable (`workTurnAutoPropagate`; an explicit scan still runs), and is inert until the first classification act exists. It reassigns nothing and classifies nothing.

**Rights.** `classify-work-turn` is open at ranks 1–5 because the lead who hands the work out is who knows what kind it is; the action narrows it to a seat that reaches the person. `govern-work-turns` (scan, conventions) is ranks 3–5.

## Reliability and privacy

The panel prints fields of the report the action returned and computes nothing; a render stores nothing. A seat reads its own span: people and pools outside it are counted, never listed. The altitude disclosure ladder applies — a rank-3 seat sees a row only where everyone it names leads a line of their own, and a rank-4/5 seat sees counts only. An unresolved seat is refused on screen and in the file. CSV #135 is one identity-free summary row. Stored acts are normalised fail-closed: a malformed act, an act for an ask that no longer exists, or one naming a person other than the ask's owner is dropped with a counted warning. Compaction evicts superseded acts only; an effective act is never evicted.

The rule's ask is addressed to the one seat accountable for acting and names the person it concerns, as `RULE-DLA-01`'s does: an owner cannot rebalance someone they are not told about. A director who reads counts only on the panel is therefore told one name by the ask they own.

The ledger grades the **allocation a manager made**. It stores no rating of any person, no reason an ask was accepted and no personal characteristic of anyone. The research that motivates it is about who ends up with this work; the ledger deliberately records no demographic field, so it can show concentration on a person and cannot show concentration on a group.

## Known limits

- **It reads declarations, not ground truth.** A manager who classifies nothing, or classifies generously, reads clean. The count of unclassified asks is printed so that silence is visible; nothing forces a classification.
- **It counts asks, not effort.** A ten-minute ask and a ten-day ask weigh the same. A stable recorded-count turn proves neither current capacity, skill, availability nor receiving-line consent; it is not a transfer authorisation. [ADR-0196](./0196-cross-line-work-reassignment-consent-capacity.md) is the separate, bounded gate for a concrete next piece: its source/receiving-line human acts declare effort and test receiving capacity, while this ledger still never moves work itself.
- **Only the next-turn set is bounded against missing classifications and placements.** The existing concentration and stacked findings still describe the classified, placed subset; adding classifications can change them. Existing open automated asks whose finding still stands and which bear the former unconditional next-turn sentence are corrected on the next enabled rule event or explicit scan; scans run even while automation is paused, and all other human text is preserved.
- **It sees recorded asks only.** Work someone volunteered for, or was asked for in a corridor, is not in the record. The cited research finds volunteering is where much of the imbalance arises; this ledger covers the half a manager assigns.
- **Today's graph, applied to the whole window.** Lines and shares are read as of today. An ask handed over before a share changed is weighted by the current share. There is no as-of matrix reader to do better.
- **Automation is recognised by link or stamp.** A rule that issues an ask with neither reads as an ordinary unclassified ask.
- **The stacked test's average is over everyone the seat reads**, managers included.
- **The rule reacts to its listed events** (classification, conventions, scan, attribution, an ask edited or handed back, a reporting line declared, retuned or ended, a person updated, archived or restored). A change that reaches the record by another route — an import, for one — is picked up at the next of those, or by a scan.
- **A re-delegated ask starts unclassified.** Handing an ask back and re-delegating it creates a new ask for the new person; the kind declared for the old one is not carried over.
- **The idempotency ledger is bounded.** Beyond 2,000 markers the oldest markers of asks that are no longer open are evicted, so a finding that old could be asked about again.
- **Two owner states have no test fixture.** `ambiguous` and `off-roster` are implemented and reconciled in the counts; this session's suite exercises `unique` and `leader-held` only.
- **A carrier who has left the roster is counted, not listed.** An ask held by an archived person stays in the window's population. A seat without full access counts it as outside the seat. The full-access operator still reads it and its class: a non-promotable one is shown as on no line and charged to no pool, the person gets no row and no verdict, and the ask row carries their record id where the name would be, because names are read from the active graph. Archiving the person who carried most of a pool's asks therefore shrinks that pool and can end its finding; the rule then closes its own ask. The six identities still hold. This was checked by running it in Session 247; no test pins it.

## Consequences

A frontline lead can open one screen and see who they keep handing the recorded unrewarded work to, what a share-weighted turn over that subset would be, and whether the next-turn set is stable or uncertain under recorded gaps. A project manager who holds 40% of someone is told what 40% of a turn is. A director inherits one ask for the case no line manager can see — fair from each line, too much in sum — instead of nothing. Single-chain workspaces get the pool reading; the stacked and unplaced verdicts cannot occur there.
