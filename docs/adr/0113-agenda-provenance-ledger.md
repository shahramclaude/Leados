# ADR-0113 — The 1:1 Agenda Provenance Ledger: who owes each line on a waiting list

- **Date:** 2026-11-06
- **Session:** 153
- **Schema:** v112 (additive `111 → 112`)
- **Route:** `#/agenda-ledger` (panels `queue`, `build`, `filed`, `receipt`, `rollup`, `method`)
- **Collections:** `agendaEntries`, `agendaMarkers`
- **Rules:** none added to the post-commit spine. Receipts are derived, not written.
- **Rights:** `prepare-agenda` (rank 1–5, span-enforced inside the handler)
- **CSV:** aggregate-only, `agenda-ledger` row kind — BLANK never zero

## 1. The duty, and why it was invisible

A frontline lead's most repeated act of leadership is not a decision. It is the
forty minutes before a 1:1: knowing what to raise, what the person asked to
raise, what was promised last week, and what has already been asked.
Fourteen-plus rules on the shared spine push prompts onto a person's
`talkingPoints` — the same list a person's own topics live in. Four defects
followed from that, all of them real and all of them visible in the record:

1. **The person's own topic is buried.** `buildMeetingAgendaCandidates` puts
   `theirTopics` first, but the *record* cannot tell you which of twelve strings
   a human wrote and which twelve a rule wrote.
2. **The prompt the lead owed is the first thing evicted.** `normalizeTalkingPoints`
   caps the list at 12 and every writer that pushes does so at the end, so the
   oldest — usually an owed obligation — is silently dropped.
3. **A structural duty is filed on a person who owes nothing.** A load-shed
   marker or a horizon-classification prompt is a demand on the *leader's* span,
   filed on a report because that is where the funding line or the overflow
   points. Read as a conversation, it becomes a performance conversation it
   never was.
4. **"I asked them about that" left no trace.** `resolvedTopics` records what was
   covered in a held 1:1, but nothing connected a *promise to raise something*
   to the conversation that did or did not raise it. A lead could not tell
   whether a prompt had been carried for six weeks.

Market survey (public snippets only, snippet-level, gap claim not a market-first
claim): the 1:1 / manager-effectiveness category (Lattice, 15Five, Fellow,
Officevibe, Culture Amp) sells **agenda sharing and talking-point collection**,
and its "AI agenda suggestions" are generic templates, not provenance for lines
the product itself wrote. None of the reviewed products classifies a prompt by
*who owes it*, records a filing, or derives a receipt from the meeting record.
Adopted: the printed agenda and the person's own topics coming first. Rejected:
an AI agenda generator (it would write *more* prompts onto the list this ledger
exists to de-noise) and a per-person "agenda discipline" score (the unit is the
line and the span's own preparation, never a person).

## 2. What ships

**A declared provenance vocabulary (`agendaProvenanceRegistry.js`).** 38 prompt
families, each mapped to the rule that owns it, the marker grammar that writes
it, the framework that justifies it and — the doctrinal part — **who owes it**:
`self` (owed to the person), `above` (a demand on the leader's own span),
`both` (bilateral), `unclassified`. An unrecognised marker is `unknown-marker`
and `unclassified`; it is counted in every denominator and **never** credited to
the person. A parity test asserts every declared prompt-writing rule has a
family, so a new writer cannot land as a silent hole.

**A queue read (`personQueue`, `buildAgendaLedger`).** Per person: which prompts
are theirs, which are owed to them, which are the leader's own, which are
unclassifiable; the cap state and headroom; and the single line the 12-prompt cap
is about to evict — the failure nobody could see.

**A build-the-agenda plan (`buildAgendaPlan`).** A declared order, not a
preference: *their* topics → what the leader owes them (oldest first) → bilateral
→ unclassified → the leader's own span duties, **last and visibly separated**
with a printed instruction that they are not the person's conversation. Each line
carries its family, its framework, the rule that owns it and whether it has been
filed.

**A filed line — the missing object (`agendaEntries`).** The lead's own act: "I
will raise THIS exact prompt with THIS person." Written in one atomic
transaction with one typed `prepares-for` edge to the person and a logged event;
the prompt is copied verbatim so the commitment survives the waiting list being
truncated away. Append-only: a line is never edited or deleted, only withdrawn
with a reason.

**A receipt, derived and never ticked (`entryStatus`).** `raised` only when a
**held** 1:1 on or after the filing date covered the exact prompt
(`resolvedTopics`, or a matching agenda line marked discussed). `dropped` only
when a held 1:1 happened and did not cover it. A missing 1:1 is `open`/`stale` —
never a miss. A skipped or moved meeting is **not** a fair chance.

**Two refusal-honest span measures.** Queue pressure (engine-authored share,
Wilson 1927 interval) and receipt rate (raised ÷ filed lines that have had a fair
chance), the latter **refused below the declared floor** rather than printed on
two observations. Both print their refusals as product output.

**Identity-free roll-up.** `agendaRollUp` returns named rows only inside the
detail boundary; at rank ≥ 4 it returns counts, shares and refusals only, and
`agendaBrief` is identity-free *by construction* — the brief is never built from
prompt text, so no prompt, person or conversation detail can leak upward.

**Route slug.** The route is `#/agenda-ledger`, **not** `#/agenda`: `agenda` is
already an alias for `#/cadence` in the route table, and taking the slug silently
rewrote the navigation to the Operating Cadence Clock. Caught by the render suite.

**Frontline surface.** The card is mounted on the printable prep sheet
(`#/prep/:id`) — the screen that actually gets printed before the meeting —
above the existing suggested agenda, so a lead who reads the engine's suggestions
before the person's own queue has already had the wrong conversation.

## 3. Deliberately rejected

- **A post-commit rule.** Nothing here needs the spine: provenance is a pure
  function of the declared table and the record; a receipt is a pure function of
  the 1:1 the human already logged. Adding a 90th rule would have added an event
  cascade to a read model.
- **Rewriting `talkingPoints`.** The fourteen writers own that collection. The
  ledger reads it and files *alongside* it.
- **Auto-filing from the queue.** A filing is a human commitment; the engine
  never creates one. The one-click "File to raise" button is a human click.
- **A per-person agenda score.** The unit is the line and the span's own
  preparation queue.
- **Back-filling filings at upgrade.** An empty ledger honestly means "nobody has
  committed a line to an agenda here yet", which is a different claim from
  "every prompt was raised".

## 4. Verification (actual)

- `tests/app/agenda-render.test.mjs` — **1/1 PASS**: the real app in jsdom walks
  all six panels, files a line by an actual click (`agendaEntries.length === 1`),
  confirms the refusals are printed rather than a number, and runs **axe over
  every panel**. It caught two defects that no engine test could: the `agenda →
  cadence` alias collision, and an unnamed table-header column failing
  `empty-table-header`.

- `tests/app/agenda-provenance.test.mjs` — **11/11 PASS**: writer/family parity;
  declared classification incl. unrecognised markers; queue provenance and cap
  eviction; derived receipts (open / stale / raised-via-resolved-topic /
  raised-via-agenda / dropped / withdrawn, skipped-is-not-a-chance,
  pre-filing meeting cannot grade); Wilson refusal below the floor and bounds
  above it; agenda ordering (theirs first, leader's duty last); filing
  idempotence, one `prepares-for` edge, append-only withdrawal; a logged 1:1
  producing a receipt while the stored row stays `filed`; v112 additivity with
  malformed-row rejection and a convergent second migrate; the roll-up's
  disclosure form tracking rank; attention counting only genuine drift.
- `tests/app/prep.test.mjs` — 13/13 PASS (the prep sheet the new card mounts on).
- `tests/app/decision-growth-prep.test.mjs` — 4/4 PASS (prep → 1:1 carry-through;
  this suite **caught a real regression**: the new card initially occupied the
  `.prep-list-ordered[0]` slot the topic picker owns).
- `tests/app/cases-automation.test.mjs` — 7/7 PASS (case → 1:1 coaching prompt
  and `buildPrepSheet` topics).
- `tests/app/disclosure-compiler.test.mjs` — 21/21 PASS, including the
  **leak oracle** with the new route registered.
- `npm run lint`: PASS. `npm run check:boundary`: PASS — 552 app ES modules,
  157 suites, 0 leaks.

## 5. Honest limits

- The family table's marker grammars are transcribed from the writers; where a
  writer emits a bare natural-language prompt with no marker
  (`RULE-COACH-01/02` prefixes, `RULE-MIT-*`, `RULE-GROW-*`) the match is on a
  text prefix, so a human who types that exact prefix is classified as engine
  work. The safe direction was chosen deliberately: the ledger never credits a
  machine string to the person.
- `stale` is an aging signal, not a broken promise, and the declared window
  (21 days, bounds 3–120) is a convention a director may re-declare.
- Receipts read `resolvedTopics` and discussed agenda lines only. A conversation
  that covered the topic but was logged without either is counted as not raised;
  the ledger cannot see what the record does not hold.
- Real-browser assistive-technology walkthrough remains `[UNVERIFIED]`; axe ran
  in jsdom only.
- Seats remain local workflow declarations, not authentication.
