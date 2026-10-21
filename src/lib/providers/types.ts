// Section A: typed provider abstraction. Anthropic Claude is the primary
// provider; any other provider implements the same `ModelProvider`
// interface so the rest of the system never imports an SDK directly.

export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type TaskType = "classification" | "extraction" | "synthesis" | "planning" | "qa";

/** Model-per-task policy: cheap model for classification/extraction, strong model for synthesis/planning/qa. */
export const TASK_MODEL_TIER: Record<TaskType, "cheap" | "strong"> = {
  classification: "cheap",
  extraction: "cheap",
  synthesis: "strong",
  planning: "strong",
  qa: "strong",
};

export type ModelTier = "cheap" | "strong";

export type CompletionRequest = {
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  tier: ModelTier;
  /** Abort the call after this many ms. */
  timeoutMs?: number;
};

export type CompletionResult = {
  text: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  /** true if a fallback/mock path was used because the primary provider was unavailable. */
  degraded: boolean;
  stopReason: string;
};

export type StreamChunk = { delta: string } | { done: true; result: CompletionResult };

export interface ModelProvider {
  readonly name: string;
  modelFor(tier: ModelTier): string;
  complete(req: CompletionRequest): Promise<CompletionResult>;
  stream(req: CompletionRequest): AsyncGenerator<StreamChunk>;
  /** USD cost for a given token count on a given tier, so callers can estimate before calling. */
  estimateCostUsd(tier: ModelTier, inputTokens: number, outputTokens: number): number;
}

export class ProviderUnavailableError extends Error {
  constructor(provider: string, cause?: unknown) {
    super(`Provider "${provider}" unavailable: ${cause instanceof Error ? cause.message : String(cause ?? "")}`);
    this.name = "ProviderUnavailableError";
  }
}

export class BudgetExceededError extends Error {
  constructor(spentUsd: number, budgetUsd: number) {
    super(`Org cost budget exceeded: spent $${spentUsd.toFixed(4)} of $${budgetUsd.toFixed(2)} — hard stop engaged.`);
    this.name = "BudgetExceededError";
  }
}
