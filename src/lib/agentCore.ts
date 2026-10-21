// LEADOS Part 08 — agentCore.ts
//
// This is the single place every other module calls into a model provider
// through. It owns: input validation, PII redaction gate, org budget hard
// stop, provider selection, retries/timeouts (delegated to the provider
// implementation), the structured-output repair loop (≤ 2 repair attempts),
// deterministic-fallback degradation, and the audit log write
// (actor.kind="agent", prompt name/version, model, tokens, latency,
// validation result) for every single call — successful, repaired, failed,
// or degraded.
//
// (See file header in src/db/schema.ts for why this file did not already
// exist in the repo snapshot handed to this part.)
import { randomUUID, createHash } from "node:crypto";
import type { z } from "zod";
import type { PromptDef } from "@/lib/promptRegistry/types";
import { getProvider, assertWithinBudget, BudgetExceededError } from "@/lib/providers";
import type { ChatMessage } from "@/lib/providers/types";
import { TASK_MODEL_TIER } from "@/lib/providers/types";
import { logModelCall } from "@/lib/modelCallLogger";
import { FIXED_SYSTEM_PREAMBLE } from "@/lib/promptInjectionGuard";
import { redactPii } from "@/lib/piiRedaction";

export type Actor = { kind: "agent" | "user" | "system"; id: string };

export type RunPromptResult<O> = {
  output: O;
  modelCallId: number | null;
  degraded: boolean;
  validationStatus: "valid" | "repaired" | "failed";
  attempts: number;
  provider: string;
  model: string;
  latencyMs: number;
  costUsd: number;
};

const MAX_REPAIR_ATTEMPTS = 2; // total attempts = 1 initial + MAX_REPAIR_ATTEMPTS

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1] : trimmed;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  const slice = firstBrace >= 0 && lastBrace >= firstBrace ? candidate.slice(firstBrace, lastBrace + 1) : candidate;
  return JSON.parse(slice);
}

/** Recursively redacts any string field whose path looks like freeform text, when a prompt declares allowsRawData=false. Here we conservatively redact every string leaf. */
function redactInput<I>(input: I): I {
  if (typeof input === "string") return redactPii(input).redactedText as unknown as I;
  if (Array.isArray(input)) return input.map((v) => redactInput(v)) as unknown as I;
  if (input && typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] = redactInput(v);
    }
    return out as I;
  }
  return input;
}

export async function runPrompt<I, O>(
  prompt: PromptDef<I, O>,
  rawInput: I,
  actor: Actor = { kind: "agent", id: "system" },
): Promise<RunPromptResult<O>> {
  const parsedInput = prompt.inputSchema.safeParse(rawInput);
  if (!parsedInput.success) {
    throw new Error(
      `Invalid input for prompt "${prompt.name}@${prompt.version}": ${parsedInput.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }
  const input = prompt.allowsRawData ? parsedInput.data : redactInput(parsedInput.data);
  const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 16);

  const fallbackDegraded = async (reason: string): Promise<RunPromptResult<O>> => {
    const output = prompt.deterministicFallback(input);
    const check = prompt.outputSchema.safeParse(output);
    const validationStatus = check.success ? "valid" : "failed";
    const modelCallId = await logModelCall({
      actorKind: actor.kind,
      actorId: actor.id,
      taskType: prompt.taskType,
      promptName: prompt.name,
      promptVersion: prompt.version,
      provider: "fallback",
      model: "deterministic-template",
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      latencyMs: 0,
      attempt: 1,
      validationStatus,
      validationErrors: check.success ? [] : check.error.issues.map((i) => i.message),
      degraded: true,
      requestHash: `${requestHash}:${reason}`,
    });
    return {
      output,
      modelCallId,
      degraded: true,
      validationStatus,
      attempts: 0,
      provider: "fallback",
      model: "deterministic-template",
      latencyMs: 0,
      costUsd: 0,
    };
  };

  try {
    await assertWithinBudget();
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      return fallbackDegraded("budget_exceeded");
    }
    throw err;
  }

  const provider = getProvider();
  if (!provider) {
    return fallbackDegraded("provider_not_configured");
  }

  const tier = TASK_MODEL_TIER[prompt.taskType];
  const messages: ChatMessage[] = [
    { role: "system", content: `${FIXED_SYSTEM_PREAMBLE}\n\n${prompt.systemPrompt}` },
    { role: "user", content: prompt.buildUserPrompt(input) },
  ];

  let attempt = 0;
  let lastErrors: string[] = [];
  let totalCost = 0;
  let totalLatency = 0;

  while (attempt < 1 + MAX_REPAIR_ATTEMPTS) {
    attempt += 1;
    try {
      const completion = await provider.complete({ messages, tier, maxTokens: prompt.maxTokens ?? 1024 });
      totalLatency += completion.latencyMs;
      const cost = provider.estimateCostUsd(tier, completion.inputTokens, completion.outputTokens);
      totalCost += cost;

      let parsedJson: unknown;
      try {
        parsedJson = extractJson(completion.text);
      } catch (e) {
        lastErrors = [`JSON parse error: ${e instanceof Error ? e.message : String(e)}`];
        messages.push({ role: "assistant", content: completion.text });
        messages.push({
          role: "user",
          content: `Your last response was not valid JSON (${lastErrors[0]}). Return ONLY corrected JSON matching the schema, no prose.`,
        });
        continue;
      }

      const validated = prompt.outputSchema.safeParse(parsedJson);
      if (!validated.success) {
        lastErrors = validated.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
        messages.push({ role: "assistant", content: completion.text });
        messages.push({
          role: "user",
          content: `Your JSON failed schema validation: ${lastErrors.join("; ")}. Return ONLY corrected JSON.`,
        });
        continue;
      }

      const validationStatus = attempt === 1 ? "valid" : "repaired";
      const modelCallId = await logModelCall({
        actorKind: actor.kind,
        actorId: actor.id,
        taskType: prompt.taskType,
        promptName: prompt.name,
        promptVersion: prompt.version,
        provider: completion.provider,
        model: completion.model,
        inputTokens: completion.inputTokens,
        outputTokens: completion.outputTokens,
        costUsd: cost,
        latencyMs: completion.latencyMs,
        attempt,
        validationStatus,
        validationErrors: [],
        degraded: completion.degraded,
        requestHash,
      });

      return {
        output: validated.data,
        modelCallId,
        degraded: completion.degraded,
        validationStatus,
        attempts: attempt,
        provider: completion.provider,
        model: completion.model,
        latencyMs: totalLatency,
        costUsd: totalCost,
      };
    } catch (err) {
      lastErrors = [err instanceof Error ? err.message : String(err)];
      break; // provider-level failure (timeout, network, 5xx after its own retries) — don't keep burning repair attempts
    }
  }

  // Exhausted repairs or hit a provider error: log the failure and degrade.
  await logModelCall({
    actorKind: actor.kind,
    actorId: actor.id,
    taskType: prompt.taskType,
    promptName: prompt.name,
    promptVersion: prompt.version,
    provider: provider.name,
    model: provider.modelFor(tier),
    inputTokens: 0,
    outputTokens: 0,
    costUsd: totalCost,
    latencyMs: totalLatency,
    attempt,
    validationStatus: "failed",
    validationErrors: lastErrors,
    degraded: true,
    requestHash,
  });

  return fallbackDegraded(`model_call_failed:${lastErrors[0] ?? "unknown"}`);
}

export function newTraceId() {
  return randomUUID();
}

export type { PromptDef };
export type ZodOf<T> = z.ZodType<T>;
