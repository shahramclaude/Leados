# ADR-0202: Posted-Period Drift Escalation & Restatement Acknowledgement

Date: 2026-11-14 · Session 270 · Schema v157 → v158 · Status: Accepted

## Context

ADR-0194 made a chargeback quarter a dated period fact, and its audit is
honest: every read re-derives the posting's own period and prints FAITHFUL or
DRIFTED with the exact cents then and now. Drift is reported, never corrected —
and there the duty stopped. A restated period fact (a retro retune, a voided
price, a roster repair) therefore waited for someone to *happen to open*
`#/matrix?panel=postings`:

- `RULE-CBP-01` asked only for **unposted complete quarters**; a posting that
  had already been made and then restated generated no ask, to anybody;
- nobody was required to **decide** what the moved figures meant — the panel
  printed the delta and the org carried on with two contradictory numbers in
  circulation (the frozen document and today's re-derivation), one of them
  unofficial;
- an acknowledgement did not exist as a concept, so there was no record that a
  named authority had *accepted* the posted figures as the period fact despite
  the divergence — the exact opposite failure of ADR-0194's "a silently
  restated figure is the failure, not the restatement".

The planned gap was logged at Session 262 (Step 3) and named exactly this:

> **Posted-period drift escalation & restatement acknowledgement** … route one
> dated ask per (posting, drift-signature) to the posting's own apex seat
> demanding an explicit dated act: ACKNOWLEDGE the drift in writing (the posted
> figures stand as the accepted period fact, divergence noted) or REVERSE and
> re-post … a drift that grows past an acknowledgement is a new signature and a
> new ask. Never auto-reverses, never recomputes the posting, never asks twice
> for one signature.

## Decision

One new dated act, one shared fingerprint, one widened rule duty. No figure
moves anywhere.

### The signature — one drift, one exact identity

`auditPostingDrift(post, statement)` in `chargebackPosting.js` is the **single
comparison** the reader, `RULE-CBP-01` and the acknowledgement door all call. It
compares the frozen posting against a re-derivation of its own period as
integer equality over cents, and fingerprints the result:

- one line per moved figure — `c|<accountId>|<field>|<posted>|<current>` — plus
  one line per account that now carries money the posting did not name;
- sorted, joined, hashed with the repo's dual 32-bit FNV-1a into
  `drift1:<n>:<16-hex>` (content addressing, not crypto).

The fingerprint is computed over the **whole-workspace** statement, so every
seat, the rule and the action door see byte-identical signatures. The same
restatement always yields the same signature; a cent moving, an account
appearing or a figure changing yields a different one. Signatures are never
stored as state — they are recomputed on every read, so a stored signature
cannot go stale; only the *decision about* a signature is stored.

### The act — `acknowledge`

`chargebackAcknowledgeDrift(postingId, reason)` is a VP+ act on the same
`post-chargeback` right as posting and reversing: accepting that a restated
period fact still stands is the same class of judgement as creating it. The
door re-derives the signature at the moment of writing and:

- refuses a posting that is not `drifted` (faithful, regressed or unreadable —
  each with its printed reason) and refuses a reversed posting;
- refuses a reason below the written-reason floor;
- refuses a **second** acknowledgement of the same (posting, signature) — an
  acknowledgement covers exactly the signature it names, forever;
- appends `{ kind: 'acknowledge', postingId, signature, reason }` and fires
  `chargeback.posting.acknowledged`.

It never edits the posting, never touches the re-derived statement, never
re-binds an envelope and never reverses anything. The alternative act — reverse
with a written reason and re-post — remains exactly where ADR-0194 put it.

### Load — fail closed

The normalizer accepts `acknowledge` only when: the posting is on the record
**and not yet reversed** at that point in append order, the signature matches
`drift1:<n>:<16-hex>`, the (posting, signature) pair is not already on the
record, and the reason clears the floor. Unknown postings are counted as
orphans; everything else malformed; a load never re-derives or repairs a
signature — only the reader can compare a posting to its period, and an
acknowledgement of a guess is not an acknowledgement.

### The rule — one dated ask per (posting, signature)

`RULE-CBP-01` keeps its first duty and gains a second. On its trigger events
(now including the acts that *create* drift — `matrix.line.declared/retuned/ended`,
`person.updated/archived/restored` — and `chargeback.posting.acknowledged`) it
re-audits every live posting:

- drifted, no acknowledgement for the exact signature → **one** dated
  `act-inform` ask at the **lowest joint apex of the lines the posting froze**
  (not the current statement's lines: the frozen document's), naming the
  signature and the two permissible answers;
- idempotent per `drift|<postingId>|<signature>` marker — one ask per signature,
  **ever**; an acknowledged signature is never re-asked and a drift that clears
  and returns to the same signature is not re-asked either (the register still
  prints it as undecided — the ask was the nudge, the panel is the duty);
- closes its own drift asks with the actual reason: acknowledged in writing on
  <date>; the posting was reversed; the record reproduces the posted figures
  again; the signature moved on (a new signature gets its own ask); or the apex
  seat moved;
- an ambiguous, leader-only or off-roster apex records one identity-free
  observation and substitutes nobody;
- bounded at the existing 4 asks per commit with the remainder counted, and
  pause-governed on every path through `chargebackPostingAutoPropagate`
  (an explicit scan still runs).

### Surface

`#/matrix?panel=postings` prints the decision on the posting card: the
signature, the ACKNOWLEDGED / NOT-ACKNOWLEDGED state with its reason, the
covering act (date, seat, written reason), and a prior acknowledgement of a
different signature printed as history — never as cover. An unacknowledged
drift offers **Acknowledge drift…** beside the existing **Reverse…**. CSV #146
is extended with `drift_signature`, `drift_ack_state`, `drift_ack_on` per
posting and `drift_ack_acknowledged`, `drift_ack_unacknowledged`,
`open_drift_asks` on the workspace row — aggregate, identity-free, reason text
never exported. The brief and the stats grid carry the same counts from the
same reader.

### Migration

Schema v157 → v158 adds no collection: the act vocabulary of the existing
`chargebackPostings` ledger gains `acknowledge`. Nothing is fabricated at
upgrade — an upgraded workspace opens with every drifted posting reading
`unacknowledged`, an absence of decision, never a sign-off.

## Consequences

- A restated period fact now owes a dated human decision to a named seat
  instead of waiting for a reader; the decision, its author, its day and its
  exact signature are append-only history.
- Two claims stay separate and printed: *the figures add up* (the audit) and
  *somebody accepted the divergence* (the acknowledgement). An acknowledgement
  never makes the re-derived statement match the posted one.
- Known limits: the signature fingerprints cents moved and accounts appearing —
  it cannot name which intervening act moved the figures (the audit never
  claimed to); one ask per signature means an ignored ask is not re-issued when
  the identical drift returns (the panel still prints it); a span-scoped
  acknowledgement does not exist (one posting, one workspace fact, one
  decision); seats remain workflow declarations, not authentication.
- Benchmark: financial-close / period-end close management (BlackLine,
  Trintech Cadency, OneStream, SAP CO). Compared from general knowledge of the
  category — `[BENCHMARK-UNVERIFIED]` for hands-on parity; none were reachable
  from this sandbox. Believed exceeded: a post-close variance routed as a dated
  ask to the matrix joint apex per exact drift signature, with a two-answer
  written decision and append-only acknowledgement that never edits the posted
  document.
