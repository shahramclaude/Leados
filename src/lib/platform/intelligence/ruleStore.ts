/**
 * ruleStore.ts
 *
 * @deprecated Same resolution as `ruleRegistry.ts` — see that file's header
 * and `docs/AUDIT-2026.md` for the duplication-cluster finding this closes.
 * `ruleStore` used to imply "the place rules are persisted"; that is now
 * simply the `ruleEngine` singleton's internal map, exposed through its
 * `list`/`get`/`register`/`remove` methods. No separate storage layer
 * exists or is needed in this sandbox (no DB is reachable — see
 * `eventLog.ts` header for the same note applied to events).
 */
export { ruleEngine as ruleStore } from "./ruleEngine";
export type { Rule, RuleInput } from "./ruleEngine";
