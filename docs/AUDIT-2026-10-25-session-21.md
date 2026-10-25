# Session 21 audit — Chromium and keyboard validation of manager follow-through

**Date:** 2026-10-25  
**Branch/base:** `arena/8e2955d7-leados`, at merged Session 20 baseline `ff37802`  
**Scope:** Follow the roadmap's first priority: validate the Day 30/60/90 manager-owned follow-up in a real browser at selected desktop/mobile sizes, including its check-in source, privacy boundary, keyboard dialog interaction and real-1:1 reconciliation.

## Audit findings

- Session 20 already had API, migration, CSV, snapshot-rewind, review-exclusion and JSDOM UI coverage for manager support. Its audit correctly marked real browser/assistive technology as unverified.
- `scripts/app-onboarding-smoke.mjs` exercised phase queue logging, navigation and mobile overflow; `scripts/app-browser-smoke.mjs` exercised conflict lifecycle and routes. Neither ran the Session 20 manager-support lifecycle.
- Adding the missing scenario to a focused standalone test avoids broadening the two existing smoke scripts. The test installs pinned Playwright, Chromium and axe packages under ignored `tmp/browser`; it does not modify `package.json`, the lockfile or runtime dependencies.
- W3C's Modal Dialog Pattern calls for focus to move into a dialog, remain within it with Tab/Shift+Tab, and return to the invoking control when dismissed. The pattern informed browser assertions, but an automated keyboard check does not establish assistive-technology compatibility. See `RESEARCH.md` §31.

## Work completed

Added `scripts/app-manager-support-smoke.mjs`. In a clean headless Chromium profile with fictional data and a fixed date, it:

1. Records a Day 30 check-in containing a unique candid-blocker marker.
2. Confirms recording the check-in creates no manager-support action.
3. At 390×844, opens and cancels the manager follow-up form, checks source phase/date and keyboard focus behavior, and verifies cancellation writes nothing.
4. Attempts submission without a due date, verifies validation, then submits a manager-authored action with an explicitly chosen due date.
5. Verifies the action keeps the exact person, plan, stable check-in ID, phase and source-date snapshot; the candid blocker is not copied.
6. Follows the source link and checks the 1:1 board shows the manager-owned action but not the blocker.
7. Opens a real 1:1, confirms merely opening the dialog does not create a meeting, explicitly marks the manager action done, then verifies completion is linked to that actual meeting and the open Today obligation is gone.
8. Checks selected viewports for horizontal overflow, runs axe-core scans and asserts no page/console errors or external app requests.

No product code, data schema, runtime dependency, backend, account or network request was added.

## Verification

- Existing `scripts/app-browser-smoke.mjs`: passed on Chromium `153.0.8010.0`.
- Existing `scripts/app-onboarding-smoke.mjs`: passed on Chromium `153.0.8010.0`.
- New `scripts/app-manager-support-smoke.mjs`: passed on Chromium `153.0.8010.0`; 8 axe scans with zero findings; no overflow at 1440×1000 or 390×844; zero page/console errors and external requests.
- Keyboard assertions: focus enters the dialog; Tab and Shift+Tab remain within it; Escape dismisses it and focus returns to the opener.
- Full automated test suite and static checks are recorded in the Session 21 log after completion.

## Limits

This evidence is for one headless Chromium version and selected viewport sizes only. Axe results are automated checks, not certification. No screen reader or other assistive technology, physical mobile device, cross-browser matrix, human comprehension session, print/PDF review, or representative large-workspace performance test was completed. These remain **[UNVERIFIED]**.
