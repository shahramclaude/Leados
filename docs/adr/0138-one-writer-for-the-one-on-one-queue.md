# ADR-0138 — One writer for the 1:1 waiting list: a local cap is not a policy

**Status:** Accepted — 2026-11-08 (Session 187)
**Schema:** v118 unchanged (no new collection, node, relation, rule, event, action, CSV scope or setting)
**Altitude:** Frontline (rank 1) / mid-manager (rank 2) **PRIMARY**; every altitude that holds a 1:1 reads the same bounded queue.

## The duty

The most repeated act of frontline leadership is not a decision. It is the forty minutes before a 1:1, working from the list of topics the person asked to raise.

ADR-0134 declared one retention policy for that list and wired two readers to it: the storage normalizer and the agenda ledger. It did **not** wire the writers. Every rule that adds a prompt kept its own door — `person.talkingPoints = [...pts, prompt].slice(-30)` in seven modules, `.slice(-12)` or `.slice(-MAX_TOPICS)` in nine more — and each of those doors is a private cap the policy has never seen.

A person's own topics sit at the **front** of the list. A blind newest-wins cut therefore deletes them first. That is not a manifestation of the policy; it is its contradiction, and it was still live in shipped code a full six sessions after the policy was declared.

## Reproduced before any change

Driven through the real `loadRule`, on a draft holding three topics the person raised and a backlog of 27 engine prompts — 30 lines, exactly what the writers' own `.slice(-30)` allows a long session to accumulate:

```
before   ['My mother is ill and I need to talk about leave',   ← theirs
          'I want a clearer promotion path',                   ← theirs
          'The on-call rotation is not sustainable',           ← theirs
          … 27 older engine prompts]
after    one RULE-LOAD-02 write  →  their first topic is GONE,
         the remaining 29 lines shifted up,
         findings recorded "Queued a WIP-limit talking point",
         warnings: []
```

The rule reported success. The leader's next 1:1 lost the single most important line a person can bring to it, and the product said nothing. That is the exact failure `NORTH_STAR.md` forbids — no silent failures — and it is worst at the altitude with the least slack: a frontline lead has one forty-minute window, not a board pack.

## What was built

**One door.** `appendTalkingPoint(lines, line, cap)` in `talkingPointPolicy.js` applies the declared policy AT WRITE TIME and returns a structured outcome — `appended`, `refused`, `duplicate`, `reason`, the resulting `points`, and what was `displaced` (with authorship). A refused write is a **true no-op**: nothing added and nothing removed, so a full queue can never cost the person a topic.

**One channel.** `recordQueueRefusal(warnings, name)` records a refusal in the store's existing transaction-scoped warning channel: at most one line per person per transaction, at most `QUEUE_REFUSAL_WARNING_CAP` (3) named people, with the remainder counted in one printed line. The bound exists because a rule re-fires on every transaction while its condition holds; state is derived from the warnings array itself, so nothing is stored and nothing drifts.

**Every destructive writer converted.** Eighteen modules now call the shared door instead of cutting their own array: `load`, `allocation`, `orgNetwork`, `power`, `premises`, `dynamics`, `carryoverRules`, `catchballRules`, `escalationRules`, `compRules`, `fidelityRules`, `measurementRule`, `orgDesignRules`, `parityRules`, `performanceRules`, `survivalRules`, `transitionRules`, `learning`, `impactRules`, `strategy`, `policyPortfolio`, `autopilot`, `leaderContinuityRule`, `mitigationReview`. Nine local `MAX_TOPICS` constants were deleted; the cap now has exactly one source.

**Two honesty repairs on the path.**
1. A refused write no longer reports a queued prompt. `addTalkingPoint` returns `false` when the shared writer refused, so the rule's own `if (added) note(...)` guard cannot log work it did not do, and `autopilot`'s `blocked` result now comes from the writer rather than a hand-rolled length check.
2. `leaderContinuityRule`'s two writers and `mitigationReview` already refused — but silently, with a hardcoded `12`. They now refuse through the same door and print the same sentence.

**A guard, so the door stays single.** `tests/app/agenda-queue-writers.test.mjs` scans every module under `app/` and fails if any file bounds a `talkingPoints` statement with a local `.slice(-n)` — including the multi-line idiom several files used, which is why the earlier roadmap note ("the `slice(-30)` writers") under-counted the breach by half.

## What is deliberately NOT in this slice

Six sites in `automation.js`, one in `settlementRules.js` and one in `continuityCouplingRule.js` still gate an append with a local `length < 12`. They **refuse** rather than delete — the failure this ADR closes is destruction — so they are not a live defect, only a remaining consistency debt: a local number that must follow the declared cap if the cap ever moves. Recorded as In Progress on the roadmap, not claimed as done.

## Honest limits

- The cap is 12 and remains a product convention, displayed as such; the policy decides membership, never presentation.
- Authorship is the registry's marker grammar (`[RULE-…]` / `; ref …)`), not a heuristic. A hand-typed line that imitates a marker would be treated as engine-authored.
- Carrying a topic's own wording is unchanged: lines are still normalised to 200 characters and de-duplicated on reload.
- Verification is one focused pass: 11/11 new tests, ~500 tests across the affected modules with every failure re-confirmed pre-existing on the base commit, lint, boundary. Full canonical suite, real-browser AT and standalone execution remain **[UNVERIFIED]**.
- Seats remain workflow declarations, not authentication.
