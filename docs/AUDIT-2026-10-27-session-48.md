# Session 48 audit — 2026-10-27

## Identity and actual scope

Verified origin `https://github.com/shahramclaude/Leados.git` before any action;
branch `arena/b2cc0d19-leados`, clean starting tree at `6479b1a`
(`Merge pull request #47`). `git ls-remote` for this branch returned no match —
the branch did not exist on the remote at session start (must be created with
`git push -u`). Repository inventory: 3,785 tracked files at session start.

**Entire-repository personal source read: [UNVERIFIED], not completed.** This
session performed a targeted audit: canonical entry point, all `app/**`
integration seams (schema, store, actions, post-commit registry, insights,
automation catalog, CSV exports, main, today/settings views, DOM/component
helpers, styles), the newest domain modules (power, resilience, decisionTempo,
forecastIntegrity, cases, stakeholders), the demo seed, and ~40 version/count
pins across the test suite. The large quarantined legacy Next/TypeScript trees
were not exhaustively read; `LEADOS-STATE.md` and `ARCHITECTURE.md` are stale
historical documents and were NOT trusted as architecture sources.

## Blunt current-state assessment

LeadOS is a genuinely deep, browser-native, local-first leadership OS: 100 ES
modules / 47 suites / 673 tests at baseline (Schema v30), a real typed
cross-module relationship graph, and a real ADR-0008 event-driven post-commit
automation spine with four registered rules chaining in one atomic transaction.
It already ships conformal/Brier/FAIR/PERT/FMEA/Banzhaf/Nash/minimax machinery
and passphrase encryption. The gap is not "more forms" — it is that the app had
**no structural view of the organisation it models**. It stored who is involved
in what but never computed who holds the team together. Commercial ONA does
this from communications surveillance (GDPR / EU AI Act friction) or from a
cloud warehouse (unaffordable, not local-first). That is the ahead-of-market
opening this session took.

## Findings

- Canonical app is browser-native localStorage software; the legacy server trees
  are not the product exercised by `npm run app` or canonical tests.
- Real post-commit rules fan out within one draft transaction. They run
  sequentially for dependency ordering, not in concurrent worker threads.
  "Parallel propagation" means multi-target fan-out, not literal CPU parallelism.
- `store.lastPropagations` is referenced by several existing actions but is
  never set by `store.js` (always resolves to `[]`). New `rescanNetwork`
  follows the same convention and reports `changed` by before/after counts, not
  by a fabricated propagation array. This is a pre-existing quirk, not a defect
  introduced this session; it is documented here for honesty.
- Co-affiliation over many contexts produces a near-complete graph that hides
  structure (measured: the 5-person demo had weight 2–9 across all 10 possible
  ties). A relative strong-tie backbone was required — and is explicitly a
  tunable visualisation threshold, not invented data.
- A broad post-commit trigger would re-add talking points during unrelated
  writes (the Session 46 alert-fatigue regression). The new rule therefore uses
  a narrow, power-style trigger; talking-point counts elsewhere in the suite
  remain untouched (verified by the full gate).
- Node-removal criticality is `O(n²(n+e))`; capped at 60 active people, measured
  ~1.7 ms on the demo. Larger rosters are truncated deterministically, not
  silently mis-scored.
- No backend, network dependency, LLM, communications telemetry, financial
  transfer, or personnel score introduced.

## Verified

- Canonical test gate (before docs): `npm test` → **698/698 tests pass, 0 fail**
  across 48 suites (673 baseline + 25 new), zero regressions from the settings,
  CSV-count, rule-catalog-count and spine changes.
- New `tests/app/org-network.test.mjs`: exact Brandes/Freeman on path/star/
  complete graphs, PageRank summing to 1, Burt constraint 1/k on a star,
  Tarjan bridges, node-removal efficiency loss, deterministic layout, purity
  (no state mutation), projection/backbone honesty, report determinism,
  signals + board brief, idempotent atomic fan-out, pause semantics,
  self-cleaning prompts preserving employee-authored topics, settings/validation/
  normalization parity, CSV data-minimisation (no leaked names), and JSDOM+axe
  across all five tabs + empty state + Today card.
- Manual propagation example (demo workspace): one `rescanNetwork()` produced
  exactly one `RULE-ORG-03` DACI org-design decision (4 options), one
  `RULE-ORG-02` blameless cross-training delegation, 6 `RULE-ORG-*` typed links,
  3 blameless 1:1 talking points, and 9 audited `automation.propagated` events;
  a second scan was a no-op; widening the tie focus to 0 cleared all resolved
  prompts while employee-owned topics survived; pausing automation blocked a
  declared event but an explicit scan still ran.
- ESLint 0 errors on all new/modified files; boundary gate 0 leaks
  (102 app modules / 48 suites); `check:links` and `verify:standalone` in the
  final gate (see session log).

## Unverified / limitations

Actual graphical-browser rendering, contrast, screen-reader speech,
Firefox/Safari, whole-repository legacy build, live competitor product trials
(secondary sources only), human comprehension, and longitudinal network drift.
Co-affiliation is a proxy for collaboration, not observed communication;
name-matching under participant keys is a heuristic (exact person IDs are
always preferred); centralities describe recorded structure, not behaviour or
performance. A leader can still misread a structural position as a judgment —
the UI, signals, brief and rules repeatedly disclaim this. No probability
model, no attrition prediction, no sentiment inference, no ratings.
