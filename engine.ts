/**
 * /engine.ts (project root) — BACKWARD-COMPATIBILITY SHIM.
 *
 * AUDIT NOTE: the real github.com/shahramclaude/Leados repo has a
 * root-level `engine.ts` that is imported by a root-level `App.tsx` via
 * `./lib/engine` — a path that does not exist (the real file sits flat
 * at repo root, not under a `lib/` folder; `App.tsx`'s own import is
 * broken as shipped). That root Vite single-page app (App.tsx, Shell.tsx,
 * router.ts, store.ts, seed.ts, prefill.ts, hygiene.ts, maintenance.ts,
 * sampleData.ts, orgPhysics.ts, catalog.ts, health.ts, types.ts) is not
 * present in this sandbox project and is not part of what this platform
 * builds/serves (only `src/app/**` under Next.js is). It is also a
 * *third*, separately-themed app from the single-file `public/index.html`
 * sandbox build that also lives in that repo.
 *
 * The one coherent, buildable brain for this project lives in
 * `src/lib/eventBrain.ts`, shared by the Next.js UI and every API route.
 * This file re-exports it so that `engine.ts` (the filename the task
 * brief points at) resolves to real, non-fabricated logic rather than
 * dead code, in case any future module reintroduces a root-level caller.
 */

export {
  project,
  run,
  projectAt,
  delta,
  replay,
  eventBrain,
  DECAY,
  CORRELATION_WINDOW_DAYS,
  DECISION_MAX_OPEN_DAYS,
} from "@/lib/eventBrain";
