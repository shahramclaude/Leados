/**
 * ruleRegistry.ts
 *
 * @deprecated This file exists only so legacy imports keep resolving. The
 * duplication-cluster audit (`docs/AUDIT-2026.md`) identified
 * `ruleEngine.ts` / `ruleRegistry.ts` / `ruleStore.ts` / `rulesEngine.ts` as
 * four competing implementations of the same concept. There is now exactly
 * one implementation — `./ruleEngine.ts` — and this module delegates to it
 * with zero logic of its own. Prefer importing `ruleEngine` directly in new
 * code; this file may be deleted once no call sites reference it.
 */
export { ruleEngine as ruleRegistry } from "./ruleEngine";
export type { Rule, RuleInput } from "./ruleEngine";
