/**
 * /types.ts (project root) — BACKWARD-COMPATIBILITY SHIM.
 *
 * AUDIT NOTE: the real repo's root `types.ts` defines `Domain = "people"
 * | "finance" | "ops" | "strategy" | "legal"` (5 values, including
 * "legal" which no other root file uses) while its own `catalog.ts`
 * defines a DOMAINS constant with 7 different values ("finance",
 * "people", "ops", "strategy", "rd", "compliance", "manufacturing" — no
 * "legal", and "rd"/"compliance"/"manufacturing" aren't valid `Domain`
 * values at all). A third shape lives under the Next.js `src/lib/types.ts`
 * in that repo, where `LeadosEvent` has no `ts`/`meta` fields and uses
 * `occurredAt`/`personId`/`teamId` instead. None of these three
 * agree with each other.
 *
 * This project uses exactly one: `DomainKey` (8 values) and one
 * `LeadosEvent` shape, both defined in `src/lib/types.ts` and re-exported
 * here for any caller still importing the root `types` path.
 */

export type {
  DomainKey,
  LeadosEvent,
  Person,
  Goal,
  Decision,
  Commitment,
  Finding,
  Projection,
  BrainProjection,
  BrainFindings,
  BrainDelta,
  RuleId,
  RuleDef,
  RuleEvaluation,
  RuleState,
  PlaybookDef,
  DomainMetricState,
  OrgPhysicsSnapshot,
  HypothesisState,
  KnowledgeLink,
  CausalLinkDef,
  CausalCascade,
} from "@/lib/types";

export { DOMAIN_KEYS, DOMAIN_LABELS } from "@/lib/types";
