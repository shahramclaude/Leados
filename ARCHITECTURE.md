# LeadOS canonical architecture

**Current as of 2026-10-29.** The canonical product is the local-first, zero-build browser app rooted at `index.html`. It is not the older Next.js starter under `src/**`. Do not use legacy-tree descriptions as evidence of the running product. The active boundary is checked by `scripts/check-canonical-boundary.mjs` and recorded in [ADR-0006](docs/adr/0006-canonical-zero-build-app.md) and [ADR-0007](docs/adr/0007-legacy-next-tree-disposition.md).

## Runtime shape

```text
index.html
  └── app/main.js              hash routing, navigation, render orchestration
       ├── app/views/**        feature screens and destination focus
       ├── app/ui/**           shared DOM, dialogs, components, charts, downloads
       ├── app/actions.js      validated application commands and read APIs
       └── app/core/**         state, schema, domain calculations and automation
```

The browser loads native ES modules directly. Canonical `app/**` imports are relative `.js` paths; the app has no server-side application layer and makes no outbound network calls. `scripts/build-standalone.mjs` creates the single-file offline distribution from the same canonical sources; the generated HTML is an output, not a second hand-maintained implementation.

## State and write path

- **`app/core/store.js`** owns the browser workspace lifecycle: load, normalize, transact, persist, import/export and explicit demo-data cleanup.
- **`app/core/schema.js`** is the data contract. It defines the current schema, version-by-version additive migrations, normalization and typed-link validation. The current schema is **v53**.
- **`app/actions.js`** is the command boundary used by views. Mutations validate inputs and commit through the store rather than writing from a screen.
- **`app/core/domain/**`** contains domain calculations, rule logic, read models and link resolution. **`app/core/domain/postCommit.js`** runs the synchronous event-driven rule chain in savepoints, commits only successful effects, and records failures separately as propagation receipts.
- **`app/views/**`** renders local state and links to records through typed resolver routes. Query parameters focus an exact destination record; opening a deep link does not itself apply a domain mutation.

The normal flow is:

```text
view → action/API → store transaction → post-commit rules → persisted workspace
     → derived read model → view

The versioned schema normalizer runs when workspaces are loaded or imported; an ordinary write keeps its validated draft and its post-commit effects within the same store update before persistence.
```

## Cross-module relationships and automation provenance

`LINK_ENTITY_TYPES`, `LINK_ENTITY_COLLECTIONS` and `LINK_RELATIONS` in `app/core/domain/cases.js` define the allowed typed graph. One resolver maps a valid type/ID pair to its owner and route. Confidential conflicts and anonymous pulse responses are not general graph nodes.

Schema v48 adds `propagationLineage`, a bounded record of successful event-driven effects. A transaction stores the source event, applied rule steps, changed collection/type/ID references, newly created typed edges and emitted event types—not record bodies, titles, notes or score inputs. It is capped at 250 transactions, 32 steps and 48 target/link/event references per transaction. No pre-v48 success history is inferred. `propagationReceipts` remains the distinct failure/retry record. Demo cleanup scrubs deleted IDs; candidate-linked transactions are omitted from redacted exports; CSV scope #43 is counts/types-only.

Schema v49 adds a frozen `executionSnapshot` to an Impact study when it is scored. It matches exact typed source IDs in retained lineage root/step events from the declared start through scoring, preserves aggregate counts and at most 12 navigation references, and leaves v48 studies unbackfilled. The snapshot is not an outcome, fidelity or causal claim. Demo cleanup clears removed source pointers without rewriting frozen counts; redacted export removes navigation IDs for omitted traces; Impact CSV scope #32 exports aggregate status/counts only.

Schema v50 adds `fidelityPlans`: a declared delivery denominator, five weighted stages, and two readings that are never merged. Four stages are derived from dated typed collections by `app/core/domain/fidelity.js` (1:1s, feedback, delegations, goals) with an explicit per-instrument standard; adaptation has no instrument and is attested only. Exposure is the product reach × dose × quality; grading is refused below 60% coverage. `app/core/domain/fidelityRules.js` runs `RULE-FID-01..05` on the same spine: typed `measures-delivery` links, a disagreement prompt, one repair decision plus one owned delegation per under-delivered settlement, one overdue-checkpoint task per plan, and a frozen `implementationSnapshot` on a scored Impact study. The snapshot carries ITT, the Bloom/LATE per-complier estimate and the inflated MDE as `null` when no counterfactual was fitted, and `RULE-IMP-02` branches on measured exposure when a contradicted study was materially under-delivered. The plan is a graph node (`fidelity` → `fidelityPlans`, route `#/fidelity?plan=<id>`), so an intervention record and its delivery reading are navigable from either end.

Schema v51 adds `compBands` (a declared level range) and `meritCycles` (a declared budget, one comparison dimension, an owner, nested pay rows, a frozen `audit` and resolved `outcomes`). `app/core/domain/comp.js` is a pure read model: band positioning and integrity, relative-pay findings, a twofold log-pay Oaxaca–Blinder decomposition with an adjusted-gap interval from the group coefficient's standard error, a four-fifths screen over the decision, a printed four-term retention hazard, a replacement-cost model weighted by the succession bench, three priced policies with regret, and Brier-scored calibration once departures resolve a frozen prediction. `app/core/domain/compRules.js` runs `RULE-COMP-01..05` on the same spine: typed `compensates` provenance, exactly one DACI *mechanism* decision (never an individual adjustment) plus one owned evidence task when the audit is flagged, one relative-pay task per cycle, one dated outcome review, and a resolved prediction on `person.archived`. The cycle is a graph node (`merit` → `meritCycles`, route `#/merit?cycle=<id>`). No protected characteristic is stored anywhere in the workspace, which is why the audit runs on a declared, non-sensitive comparison and says so.

Schema v53 adds `orgDesigns`: one record per declared structural design, holding the proposed
reporting moves, the conventions the reading used, the previous reporting lines captured at commit
and the frozen prediction the design is later graded against. `app/core/domain/orgDesign.js` is a
pure read model over the roster, the decision record, recorded pay and each person's own completion
history: span and layers from the reporting graph, coordination channels as `n(n−1)/2` per unit,
priced coordination from the latest effective merit cycle (absent, never zero, where no pay exists),
and Kingman's (1961) diffusion approximation per manager with `λ`, `Ts` and `Cs` measured from that
manager's own completed commitments. `app/core/domain/orgDesignRules.js` runs `RULE-ORD-01..05` on
the same spine: typed `structures`/`resizes` provenance, one residual span decision plus one owned
scope task when a unit remains over the declared band, at most three blameless prompts for the
people whose line moved, one dated outcome review, and the score that grades the queue model out of
sample. Committing applies the moves to `people.managerId` in the same transaction that freezes the
snapshot; `revertOrgDesign` restores exactly the recorded line and refuses to overwrite a later
decision. The design is a graph node (`orgdesign` → `orgDesigns`, route `#/orgdesign?design=<id>`).

The trace establishes *what the rule committed*, not causality or effectiveness. A typed edge proves provenance/association as recorded by the app; it is not a claim that the downstream intervention worked. Historical events are not replayed from this ledger.

## Enforced canonical boundary

`npm run check:boundary` verifies that:

1. The canonical entry point is `index.html` → `app/main.js`.
2. Canonical modules do not import from quarantined legacy trees, use bare package imports or make outbound network API calls.
3. Canonical tests and the serving script do not pull the quarantined legacy implementation into the running product.

`npm run verify:canonical` adds ESLint, internal documentation-link checking and the app test suite. `npm run verify:standalone` rebuilds and tests the self-contained offline file. These checks do not certify real-browser assistive-technology behavior or audit every historical source file; those remain explicit manual-review responsibilities.

## Legacy and non-goals

- **`src/**` and other quarantined trees are non-canonical.** Their prior Next.js/TypeScript architecture notes were retired because they contradicted the running app. The legacy implementation is not asserted to be production-ready or fully audited.
- This architecture does not imply hosted accounts, a backend, cross-device synchronization, telemetry, a distributed job runner or external tracing integration.
- Local JSON backups can carry workspace IDs and prose by design. “Content-free lineage” means the lineage row does not copy record prose; it does not make all workspace identifiers anonymous. Users remain responsible for the sensitivity of full backups.
