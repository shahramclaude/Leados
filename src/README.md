# FROZEN — NOT THE LEADOS APP

**Nothing in this directory is built, served, tested, or reachable by any LeadOS user.**

LeadOS has exactly one application: `index.html` + `app/**`, served by `scripts/serve.mjs`
(`npm run app`). It is plain browser ES modules with no build step, no backend, no database and no
network calls.

This `src/**` tree is a **frozen historical quarantine** (`FROZEN-NON-CANONICAL`) under
[ADR-0007](../docs/adr/0007-legacy-next-tree-disposition.md). It is an abandoned Next.js +
PostgreSQL attempt from earlier in the project's lineage. It does not build, it is excluded from
lint and CI, and no canonical module may import from it — the boundary gate
(`npm run check:boundary`) fails the build if anything tries.

| If you came here to… | Do this instead |
|---|---|
| run the app | `npm run app`, then open http://localhost:5173 |
| change a feature | edit `app/**` — start from `app/views/` and `app/actions.js` |
| add a route | `app/views/<name>.js` + `RENDERERS` in `app/main.js` |
| add persistence | `app/core/schema.js` (+ a migration) and `app/actions.js` |
| run the tests | `npm test` (they live in `tests/app/*.test.mjs`) |
| read the architecture | `CONTRIBUTING.md` and `docs/LEGACY-TREES.md` |

Do not add features, fixes, tests or migrations here. If something in this tree is worth keeping,
port the **idea** into `app/**` and say so in the pull request.

Why it still exists at all is documented in `docs/LEGACY-TREES.md`, including the one dependency
was not removed (see that file's "Why not delete it" section).
