# Validation report — 2026-10-25, session 27

Scope: the three priorities carried over from session 26 — (1) real-browser, screen-reader and
manager-comprehension validation of the three newest modules plus a real hiring round, (2) dependency
audit and remediation before any deployment, (3) large-workspace validation across capacity, cases
and hiring, plus a retention policy for candidate records.

This report states what was **measured**, what was **built because the measurement was impossible**,
and what remains **unmeasured**. It does not claim any validation that did not happen.

---

## 1. Real browser, screen reader, manager comprehension, real hiring round — **blocked**

### What was attempted

| Attempt | Result |
|---|---|
| `npx playwright install chromium` (Playwright 1.64.1 installed from the npm registry) | Browser binaries come from `cdn.playwright.dev` and `storage.googleapis.com`; both are outside this sandbox's network allowlist. `curl` returns `000` with `SSL_ERROR_SYSCALL` on every attempt. |
| `@sparticuz/chromium` (a Chromium build shipped *inside* an npm package, so it arrives through the allowlisted registry) | The package and its `puppeteer-core` driver install fine and the binary is extracted to `/tmp/chromium`. Launch fails: `error while loading shared libraries: libnspr4.so`. NSS/NSPR need a system package install (`libnss3`, `libnspr4`), which needs root and a Debian mirror — `deb.debian.org` is also blocked (`000`, empty reply). |
| System browsers (`chromium`, `google-chrome`, `firefox`) | Not present in the image; `find / -name "chromium*"` returns nothing. |

So a real browser engine cannot be started in this container at all. That is a hard blocker, not a
preference, and it is recorded here rather than worked around by pretending JSDOM is a browser.

Screen readers are in the same position: NVDA/JAWS need Windows, VoiceOver needs macOS, Orca needs a
working GTK/AT-SPI stack and audio — none of which exist here. Manager comprehension needs people.
A real hiring round needs a real manager making a real decision.

### What was built instead — a structural audit that answers the questions axe cannot

`tests/app/access-audit.test.mjs` (12 tests) checks the things a screen-reader or keyboard user
actually runs into, across `#/today`, `#/insights`, `#/cases`, `#/cases/:id`, `#/capacity`,
`#/hiring`, `#/hiring/:id` and `#/settings`:

- **axe-core, zero violations** on every one of those screens and inside an open capacity dialog.
- **One `h1` per screen and no skipped heading levels** — a reader who navigates by heading currently
  gets a truthful outline; a skipped level makes the page lie about its structure.
- **Every interactive control has an accessible name.** Glyph-only buttons are rejected explicitly
  (a speaker reads `✕` as "multiplication sign"), so an icon button must carry `aria-label` or
  screen-reader text. Zero unnamed controls found on the five screens audited.
- **Every table has a caption or accessible name, no empty header cell, every header has `scope`.**
  This found a real defect (see §4).
- **Landmarks and the skip link** are present on every route (`nav[aria-label]`, `main#view`,
  `a.skip-link → #view`).
- **Dialogs**: `role="dialog"`, `aria-modal="true"`, an accessible name from `aria-labelledby`, focus
  moved inside on open, **Tab wraps inside** rather than escaping to the page behind, Escape closes,
  and focus returns to the trigger.
- **State is announced, not just coloured**: toasts are `role="status" aria-live="polite"`, and every
  badge/tone marker carries text.
- **The mobile nav toggle reports `aria-expanded` and points at the sidebar** via `aria-controls`.

### What is still [UNVERIFIED]

Reading order and pronunciation with an actual screen reader; whether the new screens are
*comprehensible* rather than merely well-formed; visual contrast in a real rendering engine
(axe's `color-contrast` rule is disabled in JSDOM because there is no layout); zoom and reflow at
400%; touch target sizes; print output; performance and scroll behaviour on a phone; whether the
validity-weighted hiring read improves a real manager's decision. None of these can be established
here, and none should be inferred from a green test suite.

**Recommendation carried into the roadmap:** the next session that has a GUI browser available (or a
human with 20 minutes) should run this checklist against the three newest modules before anything
else. The tests are written so that a human is only confirming, not discovering.

---

## 2. Dependency audit and remediation

### Before (measured, `npm ci` then `npm audit --omit=dev`)

```
3 vulnerabilities (2 high, 1 critical)
  next    <=16.2.6   (11 advisories: unauthenticated RCE in the Image Optimization API for
                      AVIF/SVG inputs, RCE in next/og ImageResponse, RCE in `use cache`
                      functions returning typed arrays, SSRF in Image Optimization, cache
                      poisoning of SSG/ISR, MCP endpoint disclosure, DoS via Server Actions, …)
  postcss <=8.5.22   (XSS via unescaped </style>; arbitrary file read via attacker-controlled
                      sourceMappingURL, including an incomplete-fix follow-up)
  sharp   <=0.35.5-rc.1 (libvips/libheif/librsvg CVEs inherited by Next's default image pipeline)
```

### After

| Package | From | To | Why |
|---|---|---|---|
| `next` | 16.2.6 | **16.4.3** | The advisory range's fixed release; also pulls `postcss` 8.5.23 and a patched `sharp`. |
| `eslint-config-next` | 16.2.6 | 16.4.3 | Kept in lockstep with `next`; a mismatched lint config is a silent source of false passes. |
| `postcss` (dev) | 8.5.8 | **8.5.31** | Latest; the direct dependency was inside the vulnerable range as well. |
| `drizzle-kit` (dev) | 0.31.10 | 0.31.11 | Minor; pulled while checking whether the remaining dev-only advisory was reachable. |

```
npm audit --omit=dev   → found 0 vulnerabilities
npm audit (incl. dev)  → 4 moderate
```

The remaining four are one chain: `drizzle-kit → @esbuild-kit/esm-loader → @esbuild-kit/core-utils →
esbuild 0.18.20` (GHSA-67mh-4wv8-2f99, "any website can send requests to the development server and
read the response"). That advisory is about `esbuild serve`/watch mode. `drizzle-kit` is a schema
migration CLI — it is not a server, it never binds a port in this repository's scripts, and it is
not in the production dependency tree. `npm audit fix --force` "resolves" it by *downgrading*
`drizzle-kit` to 0.18.1, which is a breaking change to a migration tool; that trade is worse than the
residual risk. An `overrides` entry pinning `esbuild` to `^0.25.12` inside `@esbuild-kit/core-utils`
was attempted and **reverted**: the package pins a platform binary at 0.18.20, so npm reported the
tree as `invalid` and `drizzle-kit`'s own smoke run would have been running an untested combination.
Shipping a knowingly broken dependency tree to make an audit counter read zero is a worse outcome
than an accurate, explained counter.

### The finding that matters more than the CVEs

The non-canonical Next app **does not build**, and did not build before this change:

```
npx next build
  ./src/lib/agent/tools.ts:13:1
  Error: Export toolEffects doesn't exist in target module
  The export toolEffects was not found in module [project]/src/db/schema.ts …
```

Verified against both dependency sets (16.2.6 and 16.4.3) to be sure the upgrade did not cause it —
identical failure. `npx tsc --noEmit` reports **6,977 errors**, 5,974 of them in `src/**`, and the
root `App.tsx` imports `./lib/store`, `./lib/seed`, `./lib/engine` and `./components/*`, none of which
exist. So the legacy tree is not "deployable with a CVE risk"; it is not buildable at all.

Consequence, stated plainly: **the audit is remediated at the dependency level and deployment is
moot.** No claim is made that the Next app is safe to deploy — it cannot be produced. The canonical
zero-build app under `app/**` imports none of these packages, has no server, no build step and no
network calls, so its exposure to every one of the advisories above is nil by construction.

---

## 3. Large-workspace validation (capacity + cases + hiring)

`tests/app/scale.test.mjs` (5 tests) builds a workspace deliberately larger than a realistic
two-year single-leader workspace — **120 people, 240 goals, 300 cases, 180 funded items, 40 roles,
320 candidates with 1,280 evidence observations and 900 typed graph edges** — and asserts
*correctness at size* rather than just "it did not throw":

- every record survives normalization at its expected count, and every edge still resolves at both
  ends (a dangling edge is what a large workspace accumulates);
- normalization removes the duplicate edges the fixture contains and creates none, and the only
  warnings are the fixture's own deliberate vocabulary mistakes;
- a second normalization of the output is a byte-identical no-op, so reloading a large workspace
  cannot drift;
- `casesRollup` partitions every case into open/resolved and carries financial exposure;
  `buildCapacityModel` counts every active person as supply and every funded item as demand;
  `hiringSummary` assigns every candidate to exactly one role and every posterior stays a
  probability; `buildInsights`'s domain roll-up agrees with its finding list;
- all **19 CSV scopes** export at size, and the `hiring` scope's row arithmetic is exact
  (40 requisition rows + 320 candidate rows, separated by `record_type`);
- a stress ratio of **300 roles × 5,000 candidates** completes inside a ceiling that only a quadratic
  pass would breach.

Measured on this container (single core, JSDOM, Node 22):

```
normalizeState (large workspace)          35 ms
casesRollup                               11 ms
buildCapacityModel                         6 ms
hiringSummary                              8 ms
buildInsights                             42 ms
csv (19 scopes, slowest: healthTrends)     48 ms
hiringSummary (300 roles × 5,000 cands)  110 ms
```

### The scale bug this found

Both `hiringSummary` and the `hiring` CSV builder filtered the **entire candidate list inside the
per-role loop** — O(roles × candidates). Invisible on the demo workspace, 1.5 M comparisons at the
stress ratio, and it runs on every render of `#/hiring`, `#/today` and the insights panel, and twice
on every export. Both now index candidates by role once. The stress test prints its timing
(110 ms) so the pattern coming back shows up as a number, not just a red assertion.

### Still unmeasured

Layout, paint and scroll cost in a real browser and on a phone; storage quota behaviour when the
serialized workspace approaches `localStorage` limits (1.5 MB serialized at this size, so roughly a
decade of records before browser quota is plausible, but that is an extrapolation, not a
measurement); import of a large JSON backup through the UI (the parser is exercised, the file picker
is not).

---

## 4. Defects found and fixed during this session

| # | Defect | How it was found | Fix |
|---|---|---|---|
| 1 | **Destructive confirmations did not confirm.** `confirmDialog` is callback-based, but cases, capacity and hiring called `await confirmDialog(...)` and treated the result as a boolean. The promise-shaped call resolved immediately to the modal handle, so the record was deleted the moment the button was clicked — with the confirmation dialog still on screen, and (in cases) with *no message in it*, because the caller passed `body:` and the primitive only rendered `message:`. | The new retention test asserted "nothing is deleted before confirmation" and observed the candidate vanish during the click. | `confirmDialog` now returns a promise that resolves only when the dialog closes (`true` on confirm, `false` on cancel/Escape/close/backdrop), still invokes `onConfirm` for the callback-shaped callers, and renders `message ?? body`. Regression tests cover confirm, cancel, Escape, single execution and the callback shape. |
| 2 | **Focus lost on close when the trigger was re-rendered.** Closing a dialog whose opener had been replaced by a re-render dropped focus on `<body>`, sending a keyboard user to the top of the document. | The focus-restoration assertion in the capacity audit. | `openModal` now falls back to `main#view` (focusable, `tabindex="-1"`) before `<body>`. |
| 3 | **Capacity tables had no accessible name.** Two tables in `#/capacity` (funding decisions via the shared `table()` helper, and the target-risk table) had no caption. | The table audit. | `table()` gained an optional `caption` (rendered as a visually hidden `<caption>`), and the capacity target-risk table got one. |
| 4 | **Retention window normalization could silently disable itself.** A negative or non-numeric value was clamped to `0`, which is the "off" value. A typo would therefore switch off a privacy reminder. | The retention settings test. | `0` still means off; anything invalid now falls back to the default (180), because the safe failure direction for a reminder is "on". |
| 5 | **O(roles × candidates) in two hot paths.** See §3. | The scale suite's stress ratio. | Candidates indexed by role once in `hiringSummary` and in the `hiring` CSV scope. |

---

## 5. Candidate-record retention: what was decided and why

The roadmap item was "a decision on a retention prompt (not auto-delete)". The decision:

**LeadOS prompts; it never deletes on a timer.** Candidate records are the most sensitive data in
the workspace and the least useful once the decision is made. But an automatic eraser inside a local
tool that also holds the audit trail can destroy the reasoning behind a decision someone is still
questioning, and it can fire on a machine that happens to be open at the wrong moment. So:

- **Schema v18** adds `settings.candidateRetentionDays` (default **180**, `0` = off), added by an
  additive `17 → 18` migration that neither deletes nor ages anything and adds no field to any
  candidate record (a retention clock must start from a date that was actually recorded).
- `retentionReview(state, { now })` reports which records are past the window. It is **pure**: it
  never mutates. A candidate still in play on an open role is never flagged; a record marked
  "keep in touch" is **exempt and counted separately**, so an exemption stays a visible decision
  rather than a silent omission; a record with no dates at all is *unknown age*, not due; the clock
  runs from the most recent recorded fact about the person.
- `#/hiring` shows a **Data minimisation** card listing each due record with its age, a *named*
  delete button (`aria-label="Delete the record for …"`) and a confirmation that states exactly what
  will be removed (the record, its evidence, its graph edges) and that it cannot be undone.
- Signal **`HIRE-08`** raises the same fact in the insights panel with the window, the oldest age and
  the exemption count, escalating from severity 2 to 3 when records are more than twice the window.
- When the review is **off**, the card says so and explains what that means — it does not render an
  empty list that reads like "nothing to do".
- Deletion stays where it was: an explicit action, one person at a time, written to the append-only
  event log as `candidate.deleted` with the reason "data minimisation request".

The demo workspace now contains both cases honestly: one record past the window (Marcus Feld, 244
days) and one deliberate exemption (Aisha Bello, silver medallist, kept to call first about the next
finance-ops seat).
