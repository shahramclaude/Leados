/**
 * /catalog.ts (project root) — BACKWARD-COMPATIBILITY SHIM.
 *
 * The real repo's root-level `catalog.ts` opened with this exact header
 * (verified by reading the file directly this session):
 *
 *   "FABRICATED: the real repo (verified this session) has exactly 40
 *   rules (R1-R40, in js/engine.js) ... Only a subset ("wired: true") has
 *   live firing logic below in engine.ts; the rest exist so search/
 *   explain/mute have a believable 40-rule surface to query against."
 *
 * That is gone. There is nothing fabricated left to disclose here: this
 * file now re-exports the real, fully-wired 48-rule catalog from
 * `src/lib/catalog.ts` / `src/lib/ruleEngine.ts`. Every rule has a live
 * `evaluate()` implementation — see ruleEngine.ts for the full list.
 */

export { DOMAINS, RULES, PLAYBOOKS, DEFAULT_SETTINGS } from "@/lib/catalog";
