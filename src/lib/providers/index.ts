// Section A: provider selection + org cost budget hard stop.
//
// `getProvider()` returns the configured primary provider (Anthropic) if
// `ANTHROPIC_API_KEY` is set, otherwise returns `undefined` — callers must
// treat "no provider" as an expected, first-class state (the degradation
// path), not an error to bubble up raw.
import { AnthropicProvider } from "./anthropic";
import { MockProvider } from "./mock";
import type { ModelProvider } from "./types";
import { BudgetExceededError } from "./types";
import { getOrgBudgetStatus } from "@/lib/costBudget";

export * from "./types";

let cached: ModelProvider | null | undefined;

export function getProvider(): ModelProvider | undefined {
  if (process.env.LEADOS_FORCE_MOCK_PROVIDER === "1") {
    return new MockProvider();
  }
  if (cached !== undefined) return cached ?? undefined;
  const key = process.env.ANTHROPIC_API_KEY;
  cached = key ? new AnthropicProvider(key) : null;
  return cached ?? undefined;
}

export function providerConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY) || process.env.LEADOS_FORCE_MOCK_PROVIDER === "1";
}

/** Throws BudgetExceededError if the org has hit its hard-stop budget. Called before every paid model call. */
export async function assertWithinBudget(): Promise<void> {
  const status = await getOrgBudgetStatus();
  if (status.hardStop && status.spentUsd >= status.budgetUsd) {
    throw new BudgetExceededError(status.spentUsd, status.budgetUsd);
  }
}
