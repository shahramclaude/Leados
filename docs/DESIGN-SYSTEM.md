# Design System

**Status: stub.** There is no formal design system (tokens, component library, Figma source, or
documented type/color scale) in this repository. What exists is a single server-rendered page
(`src/app/page.tsx`) styled directly with Tailwind CSS v4 utility classes (`src/app/globals.css` just
imports Tailwind).

## What actually exists

- Tailwind CSS v4, wired through `postcss.config.mjs` and `@import "tailwindcss";` in
  `src/app/globals.css`.
- A single visual pattern used today: white rounded cards (`rounded-3xl`, soft shadow) on a light slate
  background, used for the hero section, leads table, and evidence ledger list on the home page.
- Three semantic colors for score bands, defined inline in `src/app/page.tsx` (`bandColor()`): red for
  `hot`, amber for `warm`, slate for `cold`.

## What does not exist (roadmap)

- No shared component library (every element is inline JSX/Tailwind in one file).
- No documented color/spacing/typography tokens beyond Tailwind's defaults.
- No dark mode.
- No accessibility audit has been performed (no automated or manual a11y testing exists yet).

When the UI grows beyond a single dashboard page, this document should be replaced with real token
documentation and component inventory — not before, to avoid describing a design system that doesn't
exist.
