// src/lib/hypothesis.ts
//
// Compat shim: an earlier iteration of this codebase had both `hypotheses.ts`
// (plural, the module) and `hypothesis.ts` (singular) referenced from
// different call sites. Rather than keep two parallel implementations that
// can drift, `hypothesis.ts` now simply re-exports the single source of
// truth in `hypotheses.ts`. Keep importing from `@/lib/hypotheses` in new
// code — this file exists only so older imports of `@/lib/hypothesis` keep
// working.
export * from "./hypotheses";
