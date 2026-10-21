// Primary provider: Anthropic Claude. Only reads the key from
// process.env.ANTHROPIC_API_KEY — never hardcoded, never logged (see
// `redactSecrets` below, applied to any error text before it is logged).
import Anthropic from "@anthropic-ai/sdk";
import type {
  ChatMessage,
  CompletionRequest,
  CompletionResult,
  ModelProvider,
  ModelTier,
  StreamChunk,
} from "./types";

// Per-MTok pricing (USD). Kept in code, not guessed per call, so cost
// accounting is auditable. Update here when Anthropic changes pricing.
const PRICING_USD_PER_MTOK: Record<ModelTier, { input: number; output: number }> = {
  cheap: { input: 1.0, output: 5.0 }, // Haiku tier
  strong: { input: 3.0, output: 15.0 }, // Sonnet tier
};

const MODEL_IDS: Record<ModelTier, string> = {
  cheap: process.env.ANTHROPIC_MODEL_CHEAP ?? "claude-haiku-4-5",
  strong: process.env.ANTHROPIC_MODEL_STRONG ?? "claude-sonnet-4-5",
};

function redactSecrets(input: string): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return input;
  return input.split(key).join("[REDACTED]");
}

function splitSystem(messages: ChatMessage[]): { system: string | undefined; rest: { role: "user" | "assistant"; content: string }[] } {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n") || undefined;
  const rest = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  return { system, rest };
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

async function withRetries<T>(fn: () => Promise<T>, attempts: number): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      // Exponential backoff with jitter: 300ms, 900ms, 2700ms...
      const base = 300 * 3 ** i;
      const jitter = Math.random() * 150;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, base + jitter));
      }
    }
  }
  throw lastErr;
}

export class AnthropicProvider implements ModelProvider {
  readonly name = "anthropic";
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  modelFor(tier: ModelTier): string {
    return MODEL_IDS[tier];
  }

  estimateCostUsd(tier: ModelTier, inputTokens: number, outputTokens: number): number {
    const p = PRICING_USD_PER_MTOK[tier];
    return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const { system, rest } = splitSystem(req.messages);
    const model = this.modelFor(req.tier);
    const start = Date.now();

    const call = () =>
      withTimeout(
        this.client.messages.create({
          model,
          max_tokens: req.maxTokens ?? 1024,
          temperature: req.temperature ?? 0.2,
          system,
          messages: rest,
        }),
        req.timeoutMs ?? 20_000,
      );

    try {
      const res = await withRetries(call, 3);
      const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      return {
        text,
        model,
        provider: this.name,
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
        latencyMs: Date.now() - start,
        degraded: false,
        stopReason: res.stop_reason ?? "end_turn",
      };
    } catch (err) {
      throw new Error(redactSecrets(err instanceof Error ? err.message : String(err)));
    }
  }

  async *stream(req: CompletionRequest): AsyncGenerator<StreamChunk> {
    const { system, rest } = splitSystem(req.messages);
    const model = this.modelFor(req.tier);
    const start = Date.now();
    let fullText = "";
    let inputTokens = 0;
    let outputTokens = 0;

    const stream = this.client.messages.stream({
      model,
      max_tokens: req.maxTokens ?? 1024,
      temperature: req.temperature ?? 0.2,
      system,
      messages: rest,
    });

    try {
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          fullText += event.delta.text;
          yield { delta: event.delta.text };
        }
        if (event.type === "message_start") {
          inputTokens = event.message.usage.input_tokens;
        }
        if (event.type === "message_delta") {
          outputTokens = event.usage.output_tokens;
        }
      }
      yield {
        done: true,
        result: {
          text: fullText,
          model,
          provider: this.name,
          inputTokens,
          outputTokens,
          latencyMs: Date.now() - start,
          degraded: false,
          stopReason: "end_turn",
        },
      };
    } catch (err) {
      throw new Error(redactSecrets(err instanceof Error ? err.message : String(err)));
    }
  }
}
