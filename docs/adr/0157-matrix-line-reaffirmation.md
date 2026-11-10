# ADR-0157: Matrix line re-affirmation — a declared line has a term, and the answer can end it

- **Status:** Accepted
- **Date:** 2026-11-10
- **Schema:** v129
- **Surface:** `#/matrix?panel=renewal` (Board / Register / Method), `RULE-LRF-01`, CSV scope #118
- **Altitude:** frontline / mid-manager primary (the line holder and the person whose hours are taken);
  the same board is the director's and the VP's roll-up of what anyone has actually agreed to *today*
- **Structure:** matrix; single-chain workspaces remain byte-for-byte inert

## Context

ADR-0140 lets one manager declare that another holds 40% of a person. ADR-0148 made the
declaration an *ask*: the line's manager accepts it for a window and the person acknowledges it.
ADR-0152 reads the work an *ended* line left behind.

None of them answers the ordinary question a leader asks in year two:

> Priya has held 40% of Sam since September 2023. Priya's project finished in 2024. The share is
> still charged to Sam every single day — because a declaration stands until somebody ends it —
> and nobody ever put the question back to either of them. **Which of Sam's commitments has anyone
> actually agreed to today?**

Three failures compound, and each is a different kind of silence:

1. **Inheritance by absence.** The ledger is right to keep charging a declared share; a declaration
   ends by a human act, not by neglect. But nothing makes *continuing* an act. Continuation is the
   default, so nobody re-examines it (omission bias, status-quo effect).
2. **Consent with no clock.** ADR-0148's acceptance carries a window, and when it closes the line
   reads `lapsed` — an accurate reading of an *old question*. Nothing asks it again, and the two
   sides are never re-put in front of each other with the current number.
3. **No way to say no.** The person whose hours are taken can acknowledge, and a manager can decline
   a share they were given. But once a line is agreed, there is no dated path for either of them to
   say *this no longer holds* short of somebody deleting or ending the declaration.

In matrix design terms, **duration is a design variable** (Goold & Campbell 2002; Hardy 1994). A
temporary line that is never closed becomes a permanent cost nobody chose. Sunset-clause governance
exists precisely because an authority granted for a period should lapse at the end of it unless it is
re-authorised — and the burden of renewal belongs to the holder of the authority, not to the person
whose capacity it consumes.

## Decision

LeadOS gives every declared line a **term of office** and the re-asking protocol that term implies,
in ADR-0148's shape with the one difference that makes it a re-affirmation rather than a reminder:
**the answer can end the line.**

- **line side** — the manager who holds the line **re-affirms** it (at the share the line currently
  carries, for a term they state) or **releases** it with a stated reason and a day.
- **person side** — the person whose hours are taken **accepts** or **objects**, in their own words.

The register is a derived read model over the dated answers plus the live matrix. Nothing derived is
stored: every state, day count, verdict and total is recomputed on every read.

### Seven states, ten verdicts, declared precedence

| state | meaning |
| --- | --- |
| `no-term` | nobody has ever given this line a term, and the declaration carries none of its own |
| `term-lapsed` | the re-affirmed term ended on or before today; the share is still charged |
| `reaffirmation-due` | the term is live and ends inside the declared warning window |
| `awaiting-person` | the line re-affirmed; the person has not answered this term |
| `person-objected` | the person said, in their own words, that it no longer holds |
| `released` | the line decided its accountability ended; the charge has not followed |
| `changed-share` | the line was re-affirmed at a different number than it now declares |
| `in-term` | a live re-affirmed term covering today, with the person's answer inside it |

Verdict precedence is declared in the registry (`released` → `objected` → `changed-share` →
`over-term` → `lapsed` → `due` → `awaiting-person` → `no-term` → `in-term` → `single-line`) so the
rule, the panel, the brief and the CSV cannot disagree about which word a row gets.

### The refusals that are the product

1. **No renewal by arithmetic.** A lapsed term is not extended because the work continued. No engine
   writes an extension; `term-lapsed` stays printed beside the still-charged share until a human
   answers. A renewal with no end date is **dropped at load** with a printed warning, because it
   cannot be told apart from one nobody revisited.
2. **A release does not end the charge.** `lineRelease` records that the line decided its
   accountability ended, on a day, with words. The declaration is untouched and the ledger keeps
   charging the share until a human runs the governed `matrixEndLine`. The receipt prints
   `stillCharged` and the percentage, and the register counts released-but-charged lines separately.
   An engine that quietly subtracted a released share would report capacity no declaration supports;
   an engine that ended lines would be silently removing accountability.
3. **An objection is not a resolution.** The person whose hours are taken can object, and the
   objection is recorded, counted and *escalated to that person's home line* — because ending
   somebody else's accountability is the line manager's act, not the informed party's. Nobody's
   charge disappears because they said no.
4. **A changed share is not a re-affirmed share.** The answer stores the share it was given for; the
   declaration is read live on every render. A line retuned afterwards reads `changed-share` with
   both numbers printed.
5. **No re-affirmation past one whole person.** The action refuses with the arithmetic printed
   (`70% + 40% = 110% of Sam`), and refuses the check entirely rather than guessing when any share is
   undeclared.
6. **No total over a part.** If any line in scope has no allocation, both share totals are refused
   with the reason. The board's two figures — `reaffirmedShareH` (covered by a live term) and
   `uncoveredShareH` (charged with no live answer) — are exact integers, and their sum to
   `declaredShareH` is printed as a *claim* (`reconciles`), not as a reassurance.
7. **No answering for somebody.** Only the line's manager may re-affirm or release; only the person
   may accept or object. Where the person has no leadership seat the operator view may capture their
   statement, the row is marked `operator`, and it is never printed as an authenticated identity.
8. **No future answer read as in force.** Answers dated after today are counted (`futureAnswerN`) and
   excluded from every state, never silently treated as current.

### `RULE-LRF-01`

Fires on a declaration, a retune, any answer, or an explicit scan — never on a read. It issues at
most one owned, dated delegation per finding:

- **to the manager who holds the line** for `no-term`, `term-lapsed`, `reaffirmation-due` and
  `changed-share` (re-affirm for a stated term, or release with a reason);
- **to the person** once a re-affirmation has stood past the declared ask window unanswered;
- **to the person's home line** for an objection, since the seat that can end or change the line is
  not the objecting person's own inbox;
- **to the manager** for a released line that still charges a share, naming the governed End action.

Typed provenance only (`concerns`, `issues-obligation`, `rolls-up-to`). It never re-affirms,
releases, accepts, objects or ends anything on anybody's behalf; it is idempotent through a per-line
marker, bounded by a per-transaction cap whose remainder is counted and retried by the scan, and
inert in a single-chain workspace.

## Alternatives considered

- **Reuse ADR-0148's acceptance window as the term.** Rejected: it would silently re-define the
  meaning of every stored consent row, and a `lapsed` consent (an old question that expired) is a
  different fact from an untermed line nobody ever asked about.
- **Auto-end a line when its term lapses.** Rejected outright: removing accountability is a leadership
  decision with named consequences, and an engine that does it would violate the same principle the
  matrix ledger exists to protect. The register reports, and the governed End action executes.
- **Let the person's objection end the line.** Rejected: it would let the party who benefits from
  capacity decide a structural question alone, and it would produce a roll-up that silently lost an
  accountability because somebody objected. The objection is a finding plus a named ask instead.
- **Store the derived state on the declaration row.** Rejected: a stored state is a verdict waiting
  to disagree with the answers it was computed from, and the Bulletproof Reliability Mandate forbids
  that class of divergence.

## Consequences

- **Easier:** a director can now answer "which of these commitments does anyone agree to today?" with
  two integers and a printed reconciliation; a delinquent line is put in front of the person who holds
  it, on a date, before the next capacity plan or pay cycle; and a person finally has a recorded way
  to say *this no longer holds* without anybody deleting a record.
- **Harder / debt this creates:** a workspace that upgrades reads every line as `no-term` and
  therefore looks worse than it did yesterday, which is the honest reading and must be communicated;
  the register adds a second "line answered" ladder beside ADR-0148's consent ladder, so a reader has
  to keep *first answer* and *standing term* apart — the Method tab says which is which.
- **Revisit when:** a workspace shows a high `no-term` count that does not fall after the rule has run
  for a full cycle (which would mean the ask is not reaching the manager), or when line exits start
  originating from releases rather than from deliberate design changes (which would mean releases are
  being used as a substitute for the End action).
