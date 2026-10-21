// src/lib/hypothesis.ts
//
// Compat shim: the upstream checkout had both `hypotheses.ts` (plural, the
// module this part owns) and a singular `hypothesis.ts` referenced from a
// completely different, unrelated rule-calibration subsystem (entity/claim/
// resolveBy/ruleId — see AI-SESSION-LOG.md for the disclosure). Rather than
// collide with that subsystem's route (`src/app/api/hypothesis/route.ts`),
// this file is kept as a pure re-export of the Part 11 module so any new
// code that imports "@/lib/hypothesis" (singular) by mistake still gets a
// single source of truth instead of a second, drifting implementation.
export * from "./hypotheses";
