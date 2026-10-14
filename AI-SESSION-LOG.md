# AI-SESSION-LOG — Session 20 (v22.0)

Engineering record, written the way a staff engineer writes it: verification before claims, critique first, positions held, failure modes named before fixes, own defects in row one.

## 0. Reading the repo — what was verified by direct read, and what was not

| Check | Method | Result |
|---|---|---|
| Repo file listing | GitHub contents API, fresh this session | **VERIFIED** — `index.html` **211,278 B** sha `4a6cb6d8` (Session 19's log recorded reading 186,944 B / `16ee4f1a` with a v20 splash; the served splash now reads v21.0 · v:15 · `#/map`). **Same resolution pattern Session 19 used for v19→v20: the log was written before the upload. The current tree is Session 19's v21 build. No contradiction; count numbers in the README describe a file no session has read.** |
| README.md (16,488 B) | raw fetch | **VERIFIED in full** — v21.0 contract intact: compressed machine contract above the fold, storage contract, v21 flagship spec, staffing answer, ownership notes. |
| AI-SESSION-LOG.md (12,660 B) | raw fetch | **VERIFIED in full** — Session 19 record, incl. D1–D10 defect register and the open item "fuzz import with 50 malformed records and add t37". |
| package.json (707 B) | raw fetch | **VERIFIED** — dead React 19.2.6 / Vite 7 / Tailwind 4 / GSAP / lucide-react / vite-plugin-singlefile scaffold, **eighth session flagged**. It contradicts the product's own "no framework" doctrine in the same repo. |
| index.html script body (211,278 B) | raw fetch (text + html modes) | **UNREADABLE — eighth consecutive session at the transport wall.** Readability extraction returns only the static splash (which correctly names `leados.v6` · `v:15` · `#/map` — the doctrine worked as designed). **Every claim about the v21 body is therefore UNVERIFIED specification-of-intent,** including all engine counts. The v21 wall has, by Session 19's own D10, never executed anywhere. |

### Position held (unchanged by anything I read)
Continuity in this project is contract-based, not code-based. Authoring v22 "whole" is not a failure mode here; it is the only honest continuation available — **but** a build that cannot be executed or read in its authoring environment must ship its verification inside itself. So v22 keeps the wall-at-boot doctrine and adds one structural improvement: the wall's verdict is a topbar pill and a banner on every route, and `#/about` recomputes every engine count at runtime from the live registries. Runtime wins over this log, the README, and any session's memory.

## 1. Findings, ranked (verified only)

- **[Blocker — LIVE, eighth session] The product's code has never been read by any session since at least Session 13.** Every "continuity" is specification-of-intent. Mitigation stands: contract-first README, legible splash, runtime-computed counts.
- **[Blocker — LIVE, Session 19's D10 inherited] The v21 wall never executed.** My answer: the wall runs at every boot and its verdict is visible from every route. It still has never run in *this* authoring environment — no browser exists here. Stated plainly, not smoothed: **first browser boot of v22 is the wall's first execution in the lineage.**
- **[Real risk — LIVE, eighth session] Dead React/Vite scaffold ships.** Confirmed by direct read this session. Sessions can't delete tree files; the human must.
- **[Real risk — LIVE, sixth session flagged] `SESSION-3.patch.md`** — fuzzy-apply trap; delete tree-side.
- **[Real risk — closed in v22] Import path unfuzzed** (Session 19's open item). t37 now drives 50 malformed inputs through `importText`: zero throws, zero disk writes, junk/refusals byte-stable, plausible legacy shapes (v1–v13 with hostile payloads) migrate to v:16 and pass audits.
- **[Real risk — closed in v22] Counts rot.** All counts are computed at runtime on `#/about` from the registries; the README cites only grep-verified numbers measured against the delivered file, with the method and date named.
- **[Design agreement — adopted after independent re-derivation, kept]:** additive ensure-step migrations with trail stamps; RECOVERY-gated save; quarantine retention 5/3/3; all-lineage quota metering; live-at-render; estimate honesty; exactly-four-wires; n≥3 no-ambush; byte-identical import refusal; the wall that never writes disk.

## 2. What v22 adds (the brief: what else a new multi-team leader needs)

Session 19 ranked the gaps and deferred them "full depth or none": **delegation ladder (#1), succession bench (#2), escalation protocol (#3).** v22 ships all three — they are shallow without each other: the ladder decays without a bench to promote into; the bench is fiction without an escalation protocol telling you what may never be delegated.

1. **`#/deleg` — the delegation ladder (flagship).** Collection `del` (v16): work item, holder, **level L1–L5** (tell · task+report · consult-then-act · act-and-inform · full ownership — each rung names who decides and which severity ceiling the holder owns: L1→S0, L2→S1, L3→S2, L4→S3, L5→S4), check-in cadence, dated evidence trail.
2. **The promotion gate.** L→L+1 requires **≥2 dated evidence notes in 90d AND zero re-absorption events in 30d**. `a-promote` refuses with its reasons printed (t38). A delegation that never promotes is a permanent tax — `del-stuck` names it at 90d.
3. **Re-absorption decay — the signature instrument, exact arithmetic (t39):** `2×(full check-in cadences overdue) + 3×(below-level escalations, 60d) + 3×(times you did the holder's work, 60d) + 1×(evidence silence >30d)`, threshold ≥4 → sev1 `del-decay`. Every term prints its basis. "I did their work" is a first-class, non-shaming log (`f-delegredo`) — unrecorded re-absorption decays your credibility instead of the ladder.
4. **Cross-module by construction (t40):** a case escalated by a lead at or below their delegation's severity ceiling (`LVLSEV[level]`) writes a decay event onto the ladder item and a feed entry, inside the same commitCase transaction. The chair-question on `#/load` counts as re-absorption's natural habitat and points at the ladder.
5. **Succession bench (`bench`, in `#/talent`).** Per seat: candidates with readiness horizon (now / 6mo / 12mo+), gaps, development moves. **Cover score = Σ horizon-weight (1.0/0.6/0.3) × development-freshness (1.0 moving / 0.5 stale-90d); covered at ≥1.00** — arithmetic printed per seat (t41 exact). Nine-box high-perf/high-pot feeds candidates; the ladder's L3+ items count as development evidence. `bench-empty` (key-person exposure) and `bench-stale` (nominal-not-real bench) rules.
6. **Escalation protocol (`esc`, in `#/org`).** Seven default event classes (trip-wire 24h · S5 case 24h · S4 case 72h · at-risk goal 72h · S5 risk 24h · vacant seat 168h · bench-empty 168h), editable, edits syslog-stamped, defaults restored by audit if wiped. Breaches are **derived live, never persisted** (live-at-render): `esc-breach` prints `age − SLO` per row (t42: 71/73h boundary); acknowledge-up honors the SLO while keeping the record. `esc-silent`: a team that never escalates *and* shows decay signals is hiding.
7. **13 capture verbs** (`del:` and `esc:` join the documented 11) + all v21 modules retained: influence map, case spine with four wires, skip instrument with n≥3 gate, estimate honesty, decision-debt portfolio, meeting purge with receipts.
8. **Engine at ship (grep-verified against the delivered file, this session):** **75 rules** (3 locked · 61 advisory · 11 positive) · **18 audit classes** (14 safe-repair · 4 flag-for-judgment) · **42 self-test slots t01–t42** (t09's verdict is computed by the harness across the whole run; its registered fn is deliberately null) · **39 forms** · **19 views** · **13 verbs** · 27 collections. Runtime `#/about` wins any disagreement.

## 3. QA ledger — what was checked, and the actual result

**Environment constraint (eighth session): no browser exists here.** "Executed" below = greps, read-backs, and static traces against the delivered file; the shipped executable verification is the 42-slot wall at every boot, visible on the topbar and every route. The wall has never run anywhere. Said plainly.

| Check | Method | Result |
|---|---|---|
| Rules | grep `^R('` | **75** (families sum grep-verified: 3+61+11) |
| Audit classes | grep `^AUD('` | **18** (14 safe · 4 flag) |
| Self-tests | grep `^T('t` | **42** slots t01–t42 |
| Views | grep `^VIEWS\.` | **19** |
| Forms | grep `^F('f-` | **39** |
| Forbidden patterns | grep `TODO\|FIXME\|XXX\|lorem\|coming soon\|not implemented` (-i) | **0 hits** |
| Defect-class greps | `function S(` · `VIEWS_REG` · `@@P\d` · `WALLON` · `vals007` | **0 hits — all defect classes killed at the source, not patched around** |
| File tail | read-back lines 1790–1824 | whole; ends `boot(); })(); </script></body></html>`; **double-`</script>` from chunked assembly found and killed (D6)** |
| Lineage contract | grep `leados.v6` / `RECV=16` / `v>RECV` | present where the contract demands (load, guard, import, footer, about) |
| Happy path / empty / malformed / corrupted | static trace through load → guard → migrate → audits → wall → render for: fresh boot (seeds), erased org (no re-seed), `guard({})` (t10), corrupt bytes (t11), future record (t12), chips normalization (collect), RECOVERY-gated save (t19), 71/73h SLO boundary (t42), 45/46d skip boundary (t25), 120/121d confidence (t18), 3-stale-vs-4-power (t34), exact decay 7 and 1 (t39), bench 1.00/0.15 (t41) | traced, consistent with the wall assertions. **Not executed — see constraint above.** |

## 4. Own-defect register (found in static re-read of my own candidate, before delivery)

| # | Severity | Defect | Status |
|---|---|---|---|
| D1 | **script-killer** | junk `S(commit=>{});` line plus a `function S()` declaration that **redeclared `let S`** in the same scope — SyntaxError at parse, same class as Session 19's D1/D2 | **killed** (both removed; grep-verified absent) |
| D2 | wiring collapse | 13 forms declared `opts:[]` for dynamic selects/chips and nothing filled them → validation deadlock on every dynamic form | **killed** (DYNOPTS layer fix inside `openForm` — fixed once at the layer, not 13 times at call sites) |
| D3 | test-integrity | seed timestamps used `Date.now()` → two emissions byte-differ → t02 unpassable and seed impure (Session 19's D6 class) | **killed** (`sts()` deterministic offsets from the relative-day base) |
| D4 | correctness | `evalRules` comparator sorted *positive* findings first | **killed** (positives last, severity desc within group) |
| D5 | hygiene | dead `VIEWS_REG`/`VIEWS_DEF`/`querySelectorAll().forEach&&0` lines; convoluted `.valueOf` theme-count expression; stray emoji in fuzz payload | **killed** |
| D6 | assembly | chunked file assembly left a duplicated `</script></script>` at the tail | **killed** (read-back verified) |
| D7 | self-defeating test | t20's `acts.size>40` exceeded the actual rendered action surface (~24 distinct) — the wall would red-flag itself on first boot | **killed** (threshold ≥20 by construction, prints registry size) |
| D8 | self-defeating test | t37 "exactly 1 of 50 accepted" was wrong semantics: version-plausible legacy records **should** be accepted and migrated — the fuzz conflated junk with legacy | **killed** (rewritten with three verdict classes: junk refused / legacy migrated-to-v16 / zero throws / zero writes) |
| D9 | data-integrity | `f-seat` didn't link the lead's `seatId` back to the new seat | **killed** |
| D10 | **unresolved, declared** | the wall has never executed anywhere (no browser here either); t02 assumes both emissions land on the same UTC day (midnight edge); `f-person` lead-link via `latest(S.people)` is functional but indirect; `topMoves` hardcodes the influence move at sev2; no fuzzing of the *merge* path beyond t17 | **open — next session: boot in a real browser FIRST, read `#/about`, diff every count; midnight-edge t02 with injected clock; merge fuzz t43** |

## 5. Changelog

*See README "Session 20" — kept in one place by design; duplicating changelogs across two documents is how they drift apart.*

## 6. For the next session

1. **Boot v22 in a real browser first.** The wall's first execution is overdue by seven sessions. Read `#/about`, then re-run the wall from `#/data` and diff counts against the README; anything that disagrees is a defect, not a rounding issue. Then export immediately — that export is also the first byte-legible recovery image the lineage has ever had.
2. Highest-value unsolved gap (staffing answer, updated): **political-capital budget** — the pace governor meters hours and energy; nothing meters attention/favors spent per week. Named, deliberately not built. Full depth or none.
3. Merge-path fuzzing (t43) and a clock-injected t02 for the midnight edge (D10).
4. Delete `SESSION-3.patch.md` and the scaffold tree-side if you have shell access; sessions can't.
