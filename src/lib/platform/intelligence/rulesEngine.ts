/**
 * rulesEngine.ts
 *
 * @deprecated Alias of `ruleEngine.ts` kept only because `docs/AUDIT-2026.md`
 * found a historical call site spelled "rulesEngine" (plural). Same
 * singleton, same registry, same evaluation algorithm — see
 * `ruleRegistry.ts` / `ruleStore.ts` for the sibling aliases this program's
 * duplication-cluster resolution introduces. Do not add logic to this file.
 */
export { ruleEngine as rulesEngine } from "./ruleEngine";
export type { Rule, RuleInput } from "./ruleEngine";
