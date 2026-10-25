# Real-Browser, Accessibility & Cross-Domain Validation — Session 29 (2026-10-25)

## 1. Environment & Capability Disclosure

Earlier validation reports (`docs/VALIDATION-2026-10-25-session-27.md`) noted that Playwright's default
browser CDN was outside the outbound allowlist and `@sparticuz/chromium` failed to launch without
system NSS/NSPR shared libraries (`libnspr4.so`, `libnss3.so`).

In **Session 29**, we unlocked real Headless Chromium execution inside the sandbox **without modifying
`package.json` or tracking binaries inside the Git repository**:

- Installed `playwright-core@1.58.2` and `@sparticuz/chromium@143.0.4` into ephemeral `/tmp/browser-probe`
  via the permitted `registry.npmjs.org` host.
- Extracted the bundled Amazon Linux 2023 shared-library archive (`al2023.tar.br` → `/tmp/al2023`) and
  font configuration (`fonts.tar.br` → `/tmp/fonts`), supplying `LD_LIBRARY_PATH` and `FONTCONFIG_PATH`
  to launch **Headless Chromium `143.0.7499.0`** against the live canonical static server (`node scripts/serve.mjs`).

### Verified vs. `[UNVERIFIED]` boundaries

| Verification surface | Session 29 status | Evidence |
|---|---|---|
| Real Blink/Chromium `143.0.7499.0` CSS layout, computed colors & `axe-core` WCAG 2.1 AA (`color-contrast` & `label-content-name-mismatch` enabled) | **VERIFIED** | 11 routes × 2 viewports (`1440×1000`, `390×844`) + 4 live modal dialogs → **0 `axe-core` violations** |
| Responsive reflow & horizontal-overflow protection (`1440×1000`, `390×844` mobile, and `320×800` WCAG 1.4.10 Reflow) | **VERIFIED** | `document.documentElement.scrollWidth <= window.innerWidth` across all 11 routes × 3 viewports → **0 overflows** |
| Real Chromium Accessibility Tree (`locator('main#view').ariaSnapshot()`) & keyboard dialog `Tab` trap + `Escape` focus restoration | **VERIFIED** | Verified across `#/cases/:id`, `#/changes/:id`, `#/capacity`, `#/hiring`, and 4 open dialogs |
| Canonical automated verification gate (`npm run verify:canonical`) | **VERIFIED** | `eslint .` (`0` issues) + `check:boundary` (`73` ES modules, `34` suites, `0` leaks) + `check:links` + `427/427` passing tests |
| Spoken screen-reader output & reading rhythm (NVDA, JAWS, VoiceOver, Orca) | **[UNVERIFIED]** | Requires OS speech-synthesis / AT-SPI / Cocoa / UIA stacks absent in Linux container |
| Non-Chromium browser engines (Firefox Gecko, Safari WebKit) & physical print/PDF pagination | **[UNVERIFIED]** | Only Chromium `143.0.7499.0` executed in container |
| Field comprehension & longitudinal decision quality with real managers/teams | **[UNVERIFIED]** | Requires human user studies on live team portfolios, hiring rounds, and org changes |

---

## 2. Real-Browser Defects Discovered & Fixed in Session 29

Running real Chromium `143.0.7499.0` (with real CSS cascade, alpha compositing, flex layout, and WCAG 2.1 AA
rules that `jsdom` cannot compute) uncovered **7 concrete UI/accessibility defects** across `#/today`,
`#/insights`, `#/capacity`, `#/changes`, `#/changes/:id`, `#/hiring`, and `#/settings` — every one of
which was fixed and re-verified to `0`:

1. **WCAG 1.4.3 `color-contrast` failure on `#/capacity` parked portfolio rows (`app/styles.css`)**:
   `.row-muted { opacity: 0.72 }` composited muted cell text to `3.67:1` and `.btn-secondary` buttons inside
   parked rows to `4.22:1` (below the `4.5:1` AA threshold). Replaced whole-row opacity compositing with an
   explicit `background: var(--panel-2)` surface and darkened `.btn-secondary` border/text tokens.
2. **WCAG 1.4.3 `color-contrast` failure on active sidebar `.nav-count` (`app/styles.css`)**:
   `.nav-item.is-active .nav-count` used `#ffffff` text over `#e0675c` (`3.35:1`). Darkened to `#a82e28`
   (`> 6.0:1` contrast).
3. **WCAG 1.4.3 `color-contrast` failure on active filter `.tab-count` (`app/styles.css`)**:
   `.tab-count { opacity: 0.75 }` reduced active tab badge contrast (`#c3dad6` on `#0f6b5c`) to `4.36:1`.
   Removed opacity attenuation on `.tab-count` (`> 6.1:1`).
4. **WCAG 2.5.3 `label-content-name-mismatch` on `#/today` 30-60-90 queue (`app/ui/onboarding-checkins.js`)**:
   Visible link text `"Open plan"` did not appear contiguously inside `aria-label="Open 30-60-90 plan for …"`,
   breaking voice-control activation (`"Click Open plan"`). Updated to `"Open plan — 30-60-90 plan for …"`.
5. **WCAG 2.5.3 `label-content-name-mismatch` on `#/hiring` retention card (`app/views/hiring.js`)**:
   Visible button text `"Delete record"` did not appear contiguously inside `aria-label="Delete the record for …"`.
   Updated to `"Delete record — Delete the record for …"`.
6. **Mobile (`390×844`) & WCAG 1.4.10 Reflow (`320×800`) horizontal overflow across `.card-head` / `.card-actions` & `.page-head` (`app/styles.css`)**:
   `.card-head` lacked `flex-wrap: wrap` while `.card-actions` set `flex: none`, pushing action toolbars to
   `606px` on `#/changes` and `#/hiring` and `493px` on `#/capacity`. Enabled flex wrapping on `.card-head`
   and `.card-actions` plus responsive stacking at `≤700px`.
7. **IEEE-754 floating-point precision artifact in `#/capacity` accessible chart legend (`app/views/capacity.js`)**:
   Chromium's `ariaSnapshot()` surfaced `"Undecided demand: 0.480000000000004d"` in the capacity bar list.
   Rounded residual capacity segments to 2 decimal places (`0.48d`).

Also discovered and fixed a store-level bug during pre-export audit:
- **`store.clearDemo()` omitted `state.changes` (`app/core/store.js`)**: Demo organizational changes
  (`chg-demo-1`, `chg-demo-2`) were left behind after *Clear demo records* and omitted from
  `remainingByType.change`. Fixed and covered by `tests/app/export-disclosure.test.mjs`.

---

## 3. Verified Chromium 143 Post-Fix Audit Matrix

Executed against `http://127.0.0.1:4399` (`scripts/serve.mjs`) with the full demo workspace loaded:

- **Routes audited (`11`)**: `#/today`, `#/insights`, `#/cases`, `#/cases/case-demo-174`, `#/changes`,
  `#/changes/chg-demo-1`, `#/changes/chg-demo-2`, `#/capacity`, `#/hiring`, `#/hiring/req-demo-1`, `#/settings`.
- **Viewports audited per route**: `1440×1000` (desktop), `390×844` (mobile), `320×800` (WCAG 1.4.10 Reflow).
- **axe-core WCAG 2.1 AA (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`) violations**: **`0`** across all routes & viewports.
- **Horizontal overflows (`scrollWidth > innerWidth + 1`)**: **`0`** across all 33 route × viewport combinations.
- **Open modal dialog audits (`4`)**:
  1. `#/settings` → *Export JSON* pre-export retention & sensitivity disclosure (`0` axe violations, `Tab` trapped inside dialog, `Escape` closes and restores focus to `Export JSON`).
  2. `#/hiring` → *Export hiring CSV* pre-export disclosure (`0` axe violations, `Tab` trapped, `Escape` restores focus to `Export hiring CSV`).
  3. `#/changes` → *+ Design change* modal (`0` axe violations, `Tab` trapped, `Escape` restores focus to `+ Design change`).
  4. `#/capacity` → *Add work* modal (`0` axe violations, `Tab` trapped, `Escape` restores focus to `Add work`).
- **Console / uncaught page errors**: **`0`**.
