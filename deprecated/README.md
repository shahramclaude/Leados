# `deprecated/`

This directory exists because the Part 00 standing order requires it, and because an empty
directory with this README is cheaper for future sessions to find than a question in a group chat.

**Nothing has been moved here.** The standing order for this program describes a legacy Vite-era
single-file build living at the repository root (`App.tsx`, `main.tsx`, `vite.config.ts`,
`index.html`, `engine.ts`, `store.ts`, `ui.tsx`, `leados-cli.html`) alongside the canonical Next.js
app, plus compiled `*.js` twins of `*.ts` sources. Part 00's audit (`docs/AUDIT-2026.md`, section
"B. Legacy duality search") searched the actual repository for all of those filenames at the
repository root and one level down, before any file in this delivery was created, and found none of
them. The repository, as received, was the generic `nextjs-postgresql-template` starter: five
source files under `src/`, plus standard Next.js/Tailwind/Drizzle config at the root. There was no
second app to retire.

If a future session finds a legacy Vite app re-appear (for example, from a different branch being
merged in), the rule stands: canonical app is the Next.js app rooted at `src/`
(see `docs/adr/0001-canonical-app.md`). Anything historically valuable from a retired surface should
be moved into this directory with a one-paragraph README explaining what it was and why it was kept,
exactly as this file does for the (empty) search result.
