# ADR-0252 — Trace a failed instrument to the decisions to review

**Date:** 2026-11-18 · **Status:** Accepted for the canonical source app · **Surface:** Instrument look-back (`#/instrument-lookback`), linked from Leader Standard Work · **Storage:** v204 → v205, one source ledger.

## Decision

After a gauge is found out of tolerance, a quality manager needs a list of the inspections or releases that relied on it. A calibration due date does not answer that question. Neither an as-left pass after adjustment nor closing the escalation determines whether earlier measurement results were valid. This is the retrospective question in ISO 9001:2015 §7.1.5.2, not a claim to perform the whole conformity assessment.

Extend the existing [Standard Work abnormal check and tier chain](0190-leader-standard-work-tiered-daily-management.md). Store a versioned instrument-use extract on that check; compute the worklist when it is read. Do not open another case, issue remediation to a guessed manager, infer drift between calibrations, or disposition a lot. The manager can identify what to reopen even before there is enough evidence to state a total.

### Evidence and calculation

- One paper names the instrument, its as-found failure reference and day, an optional **earlier** last-good day and distinct result reference, the versioned use source, coverage statement and an optional independent distinct-use control for the **whole extract**. Same-day good/fail checks cannot establish that order at day precision. No prior-good evidence means an unknown lower bound, not a default look-back period.
- Paste or open a local UTF-8 CSV/TSV with `use_ref`, `instrument_ref`, `used_on`, `decision_ref`, in any order. Qualify identifiers that are only unique within one site or line. Exact matches only: no fuzzy spelling, no join on a person's name. The source identifies one decision per use. Blank instrument/day/decision cells are missing evidence; a missing use ID or conflicting versions of that ID invalidate the extract. Repeated identical rows retain their copy counts. The file adapter refuses malformed quoting, extra columns, ragged and multiline records rather than accepting a readable prefix.
- The bounds are inclusive calendar days. Partition distinct uses once: different known instrument; provably after the failure; provably before the prior good day; known instrument inside the bounded window; otherwise possible. A missing ID need not prevent exclusion when the date alone rules out the window. A post-failure use is **outside this trace, not cleared**.
- Group matched and possible uses by exact inspection/release reference. Count a named decision once even if two lines logged the same use or several uses point to it. List relevant uses without a decision reference separately. Sum of class counts must equal distinct uses; sum of copies must equal source rows; sum of named links plus unlinked uses must equal matched plus possible uses.
- Publish a distinct-decision total only with a bounded window, attested coverage, a matching independent control, all relevant links resolved and all three reconciliations true. Otherwise print the reasons alongside the usable worklist. A header-only extract can support **zero** with complete evidence and an explicit independent zero control. Neither a count nor a reconciliation proves the external records are true. No cross-paper exposure total: revised extracts and different instruments can point to the same decision.

### First-person recording and matrix reach

| Seat relationship | What is available |
| --- | --- |
| Original check recorder | Declare own routine / record an abnormal check if needed; preview, record a new paper and reopen all its source rows. |
| Named recipient on the initial escalation or a recorded subsequent hop | Decision list, relevant/possible use references, source basis and aggregate receipt. Other instruments' and out-of-window source rows are counted but their references are not disclosed. |
| Other seat reaching the recorder through its home span or active line | Counts of readable papers, split by whether a total is supported; no source list or decision IDs. No access from a peer outside that reach. |
| Undeclared local operator | May inspect source. Acts as the workspace leader, not as another person's recorder. |

Existing Standard Work rights, seat resolution, routine slots and escalation actions apply. Count each paper once irrespective of the number of reporting paths. Current line reach is not evidence of a past escalation. The dedicated disclosure manifest opens the guarded reader, **not** the entire Standard Work board; raw workpapers are report-only, unavailable to the generic seat projection, disclosure grants and generic aggregate publisher. Workflow seats on one local browser are not authentication or tenant boundaries.

### Persistence, limits and exports

`instrumentLookbacks` starts empty on ordinary upgrade. Persist evidence, author, parent and capture time only. Never infer a failed instrument from the parent's note. A revised source needs a different version reference; published evidence is not overwritten. One unreadable use rejects its whole paper; ambiguous paper IDs or source versions reject every colliding paper. The loader reports refusals; exceeding the ledger cap refuses the entire ledger rather than keeping a misleading first page.

The limits are 2,000 source rows per paper, 200 papers and 6,000 rows per workspace, 120 characters per reference, and 1 MiB per pasted/opened extract. A browser storage failure leaves a visible **in-memory only** warning; keep the source file and recover/export before reloading. Local JSON backups contain the evidence. The on-screen **Aggregate receipt (CSV)** is per workpaper, not a new workspace CSV scope. It contains counts and withholding reasons, not the identifying worklist; a withheld value is empty in CSV, not zero. Search and paging do not change the receipt.

## Benchmark, asset and limits

[Gaugify's OOT analysis](https://www.gaugify.io/blog/calibration-management-software-for-aerospace-manufacturing) sets the bar: follow gauge uses back to affected inspections and work orders after the last good calibration. The native approach serves that narrow tracing duty offline from an actual extract; a probabilistic match or language model cannot supply a missing measurement record. No live MES/QMS feed, automatic product-risk categorization, calibration-management parity or regulatory certification is claimed. **[BENCHMARK-UNVERIFIED]**: vendor description, not a trial on the same source data.

The method illustration `app/assets/instrument-lookback.jpg` was generated for this workflow with Arena image generation (Higgsfield connector unsupported). It shows a tagged measuring tool and the inspection records to trace. It is labeled as an illustration and supplies no finding, count or evidence.

**In Progress:** accountable-line retest/disposition and return-to-service follow-up. **New, separate Planned duty:** a failed *reference standard* may compromise calibrations of other working gauges. [Beamex CMX](https://www.beamex.com/us/calibration-software/cmx/analytics-dashboard/) describes reference-standard usage and calibrator reverse traceability. That upstream graph needs dated calibration edges, independent recalibration stops and deduplication of converging paths; the direct-use trace does not simulate it. See the [roadmap](../../ROADMAP.md) and [verification record](../../AI-SESSION-LOG.md).
