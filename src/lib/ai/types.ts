// =============================================================================
// LEADOS — Part 11: shared LLM-system types
// =============================================================================
// This is the single source of truth for the "grounded generation contract"
// described in the Part 11 brief. Every language surface (briefing, Ask-LEADOS,
// insight synthesis, narrative transforms) imports these types so the schema
// cannot drift between call sites.
// =============================================================================

export type RiskTier = "tier0_read" | "tier1_write_own_org" | "tier2_sensitive" | "tier3_irreversible";

export type Trust = "trusted" | "untrusted";

// ---------------------------------------------------------------------------
// Evidence refs — the only things a citation is allowed to point at.
// ---------------------------------------------------------------------------

export interface EntityRef {
  kind: "entity";
  ref: string; // "entity:<id>"
  id: number;
  name: string;
  type: string;
}

export interface MetricRef {
  kind: "metric";
  ref: string; // "metric:<id>"
  id: number;
  name: string;
  value: number;
  previousValue: number | null;
  unit: string | null;
  entityId: number | null;
  entityName: string | null;
  periodStart: string;
  periodEnd: string;
  deltaAbs: number | null;
  deltaPct: number | null;
}

export interface EventRef {
  kind: "event";
  ref: string; // "event:<id>"
  id: number;
  title: string;
  type: string;
  entityId: number | null;
  entityName: string | null;
  occurredAt: string;
  importance: string;
  description: string | null;
}

export interface DocumentRef {
  kind: "document";
  ref: string; // "doc:<documentId>#chunk<chunkIndex>"
  documentId: number;
  chunkIndex: number;
  title: string;
  text: string;
  trust: Trust;
  sourceType: string;
  score: number; // retrieval score, for transparency/debugging only
}

export type EvidenceRef = EntityRef | MetricRef | EventRef | DocumentRef;

// ---------------------------------------------------------------------------
// GroundingSet — fetched deterministically BEFORE any LLM call.
// ---------------------------------------------------------------------------

export interface GroundingSet {
  orgId: number;
  topic?: string;
  timeframe: { start: string; end: string };
  entities: EntityRef[];
  events: EventRef[];
  metrics: MetricRef[];
  documents: DocumentRef[];
}

export function allEvidence(set: GroundingSet): EvidenceRef[] {
  return [...set.entities, ...set.events, ...set.metrics, ...set.documents];
}

export function findEvidenceByRef(set: GroundingSet, ref: string): EvidenceRef | undefined {
  return allEvidence(set).find((e) => e.ref === ref);
}

// ---------------------------------------------------------------------------
// Output contract
// ---------------------------------------------------------------------------

export type ConfidenceClass = "high" | "medium" | "low";

export interface Citation {
  claim: string; // the sentence / clause being supported
  ref: string; // evidence ref, e.g. "metric:42"
  span: [number, number]; // character offsets into `text`
}

export interface AbstainedInfo {
  reason: string;
  missingEvidence: string[]; // human-readable description of what's needed
}

export interface GenerationResult {
  text: string;
  citations: Citation[];
  confidenceClass: ConfidenceClass;
  abstained?: AbstainedInfo;
  modelCardId: string;
  provider: "composer" | "openai-small" | "openai-large";
  tier: "composer" | "small" | "large";
  degraded: boolean;
  promptTokens: number;
  completionTokens: number;
  costCents: number;
  cacheHit: boolean;
  groundingHash: string;
  lint: CitationLintResult;
}

// ---------------------------------------------------------------------------
// Citation lint result (Part 08 contract, reused here)
// ---------------------------------------------------------------------------

export interface CitationLintViolation {
  type: "uncited_number" | "dangling_ref" | "number_mismatch" | "empty_text" | "overlap_conflict";
  detail: string;
  span?: [number, number];
}

export interface CitationLintResult {
  ok: boolean;
  violations: CitationLintViolation[];
  numericTokensChecked: number;
  citationsChecked: number;
}

// ---------------------------------------------------------------------------
// Tool registry types
// ---------------------------------------------------------------------------

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  riskTier: RiskTier;
  idempotent: boolean;
  inputSchemaDescription: string;
  run: (input: TInput, ctx: ToolContext) => Promise<TOutput>;
}

export interface ToolContext {
  orgId: number;
  userId: number | null;
  requestId: string;
}

export interface ToolCallRecord {
  name: string;
  input: unknown;
  output: unknown;
  riskTier: RiskTier;
  allowed: boolean;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Claim specs — the deterministic "what to say" layer. These are computed by
// each surface (briefing/ask/insight) directly from the GroundingSet, with NO
// model involved. The composer's only job is turning ClaimSpecs into fluent,
// correctly-cited prose — it cannot introduce facts that aren't here.
// ---------------------------------------------------------------------------

export type ClaimTemplateId =
  | "metric_delta"
  | "metric_level"
  | "event"
  | "pattern_correlation"
  | "doc_quote"
  | "narrative_connector";

export interface ClaimSpec {
  id: string;
  templateId: ClaimTemplateId;
  refs: string[];
  data: Record<string, unknown>;
  priority: number;
  whyShown: string; // "why you're seeing this" affordance text
}

// ---------------------------------------------------------------------------
// Composer contract (model-provider-agnostic)
// ---------------------------------------------------------------------------

export interface ComposerRequest {
  task: "briefing" | "ask" | "insight" | "narrative";
  modelCardId: string;
  mode: NarrativeMode;
  claims: ClaimSpec[];
  groundingSet: GroundingSet;
  userQuestion?: string;
  untrustedContext?: DocumentRef[];
  abstainIfNoClaims?: boolean;
}

export interface ComposerResponse {
  text: string;
  citations: Citation[];
  promptTokens: number;
  completionTokens: number;
  abstained?: AbstainedInfo;
}

export type ModelTier = "composer" | "small" | "large";
export type ModelProviderId = "composer" | "openai-small" | "openai-large";

export interface LanguageModel {
  tier: ModelTier;
  providerId: ModelProviderId;
  available: () => Promise<boolean>;
  compose: (req: ComposerRequest) => Promise<ComposerResponse>;
}

// ---------------------------------------------------------------------------
// Narrative modes
// ---------------------------------------------------------------------------

export type NarrativeMode = "executive" | "analyst";

// ---------------------------------------------------------------------------
// Generation phases (for streaming UX — no spinner theater)
// ---------------------------------------------------------------------------

export type GenerationPhase = "retrieve" | "ground" | "compose" | "verify" | "done" | "error";

export interface PhaseEvent {
  phase: GenerationPhase;
  message: string;
  at: number; // ms timestamp
}
