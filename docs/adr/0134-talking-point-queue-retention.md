# ADR-0134 — One declared retention policy for the 1:1 waiting list

**Status:** Accepted — 2026-11-08 (Session 181)
**Schema:** v118 unchanged (no new collection, node, relation, rule, event, action, CSV scope or setting)
**Altitude:** Frontline (rank 1) / mid-manager (rank 2) **PRIMARY**; every altitude that holds a 1:1 reads the same corrected queue.

## The duty

A frontline lead's most repeated act of leadership is not a decision. It is the forty minutes before a 1:1. ADR-0113 built an agenda provenance ledger for exactly that duty and described the queue as a FIFO that "truncates from the oldest end", with row 0 flagged as the line about to disappear. That description was wrong, and the storage behaviour it described was worse than wrong.

## Two live defects, both reproduced before any change

Both were reproduced against the shipped code with a three-line probe, not inferred from reading it.

### 1. Write-then-delete

Twenty-odd rules on the shared spine push a 1:1 prompt onto a person's `talkingPoints`, each appending at the end and bounding its own write with `.slice(-30)` — newest wins, thirty is the writer's ceiling. `normalizeTalkingPoints` (schema.js) then kept the **first** twelve and stopped. Two independent caps, contradicted, resolved in opposite directions.

Measured:

```
in memory after a rule writes (queue already full at 12)
  ['Personal topic 1' … 'Personal topic 12', 'Case support (…) [RULE-COACH-01:case-1]']
after the next reload / import
  ['Personal topic 1' … 'Personal topic 12']     ← the prompt the rule just wrote is GONE
```

A queue that holds thirteen lines in memory and twelve after a reload is a silent write-then-delete. The casualty was the **newest** line — the prompt the engine raised today, the one a lead is most likely to act on — and nothing said so. This directly violates the NORTH_STAR technical baseline ("No stubs, no fake data, **no silent failures**").

### 2. The printed warning named the wrong line

Because the ledger believed the cap truncated from the oldest end, `capWarning` and the `evictionRisk` badge pointed at row 0. Under the real storage rule row 0 was the line that **always survived**, and the line the badge offered to protect was the one that had already been deleted. The UI compound the error in five places (`#/agenda` stat hint, cap banner, eviction badge, plan badge, and the upward brief), all saying "truncates from the oldest end".

## The decision

The cap is a product decision and stays: a forty-minute conversation cannot carry thirty topics. What was never declared is **which lines survive it**. One module now declares it, and both the storage layer and the ledger read it:

`app/core/domain/talkingPointPolicy.js`

1. **The person's own topics claim capacity first.** A line with no engine marker is never evicted while any capacity remains. Their words are the one thing on the list the leader did not author, and burying them is the exact failure ADR-0113 exists to expose.
2. **Engine prompts survive newest-first.** A prompt a rule wrote today outranks one it wrote three weeks ago; the oldest engine prompt is what goes.
3. **Survivors keep their original relative order.** The policy decides membership, never presentation — a queue that reshuffled on reload would be its own bug.
4. **What is refused is RETURNED, never discarded.** `applyTalkingPointPolicy` returns the dropped lines with their authorship, and the reload emits a named warning through the existing `warnings` channel that `Today` already surfaces as "Saved data needed repair". The person action layer (`addPerson`, `updatePerson`) returns the same sentence as a `warning` on its result.

The eviction answer is **derived by simulation**, not asserted from one end: `nextEvictedIndex` appends a sentinel engine prompt, re-applies the policy, and diffs survivors. The badge therefore names the line a reload will actually take, by the policy's own arithmetic. One shared `queueCapSentence` generates the printed warning for the desk, the prep sheet and the storage normalizer, so the three can never describe the cap differently again.

## What deliberately did not change

- **No schema bump.** The stored shape is unchanged; only which twelve strings are stored.
- **No new collection, node, relation, rule, event, action, setting or CSV scope.** This is a defect on the shared spine, corrected in place.
- **No reader was rewritten.** The ledger, the plan, the prep sheet, the roll-up and the brief consume the same fields; two of them now receive values from the policy instead of a guess.
- **Not an isolated surface.** The policy sits under `normalizeState`, which every load and every import passes through, and under `personQueue`, which every agenda reading passes through.
- An ordinary short list is untouched, and a workspace that never exceeded twelve prompts sees no behavioural change and no warning.

## Honest limits

- **Twelve is a declared convention, not a measured threshold.** Nothing here establishes that twelve is the right number for a given span; it is displayed as the declared cap, and the sentence says so.
- **Refusal is reported, not prevented.** When every line at the cap is the person's own, an arriving engine prompt is refused rather than displacing one of their topics — and that refusal is reported through the same channel, but no rule is taught to retry later, so a refused prompt is not rescheduled. It is visible, not recovered.
- **Authorship is detected from the marker grammar** declared in `agendaProvenanceRegistry.js`. A person who types a bracketed rule id by hand is classified as engine-authored — the safe direction (their line is protected, not the engine's), and consistent with ADR-0113's existing refusal to credit a marker as a person's own topic.
- **Seats remain workflow declarations, not authentication.** This ADR changes no access boundary.
- **Untested surfaces remain `[UNVERIFIED]`**; the focused and adjacent suites are the verification evidence, and the real-browser assistive-technology walkthrough was not performed.
