// Deterministic in-process provider. Used for (a) unit-testing the
// provider-abstraction mechanics (timeouts/retries/streaming) without
// network calls, and (b) as an explicit opt-in ("provider: mock") for CI
// environments. It is NOT the production degradation path for structured
// tasks — that path is the per-prompt `deterministicFallback` in the prompt
// registry, which is safer because it never invents prose, only restates
// retrieved evidence (see src/lib/agentCore.ts).
import type { CompletionRequest, CompletionResult, ModelProvider, ModelTier, StreamChunk } from "./types";

export class MockProvider implements ModelProvider {
  readonly name = "mock";

  modelFor(tier: ModelTier): string {
    return tier === "cheap" ? "mock-cheap-v1" : "mock-strong-v1";
  }

  estimateCostUsd(): number {
    return 0;
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const start = Date.now();
    const userText = req.messages.filter((m) => m.role === "user").map((m) => m.content).join("\n");
    // Deterministic "completion": echo a minimal, obviously-synthetic JSON
    // shell so callers exercising only the transport layer get *something*
    // schema-shaped back. Real structured tasks should not depend on this
    // producing meaningful content — they use deterministicFallback.
    const text = JSON.stringify({ mock: true, echoLength: userText.length });
    await new Promise((r) => setTimeout(r, 5));
    return {
      text,
      model: this.modelFor(req.tier),
      provider: this.name,
      inputTokens: Math.ceil(userText.length / 4),
      outputTokens: Math.ceil(text.length / 4),
      latencyMs: Date.now() - start,
      degraded: true,
      stopReason: "end_turn",
    };
  }

  async *stream(req: CompletionRequest): AsyncGenerator<StreamChunk> {
    const result = await this.complete(req);
    yield { delta: result.text };
    yield { done: true, result };
  }
}
