// Section D: prompts are code. Every prompt is a typed, versioned object:
// input schema, output schema, purpose, and a changelog — reviewed like
// code, not a string scattered in a component. `deterministicFallback` is
// the explicit, mandatory degradation path used when no provider is
// configured, the org budget is exhausted, or the model fails to produce
// valid structured output after repair attempts (section A/F — "prove the
// degradation path").
import { z } from "zod";
import type { TaskType } from "@/lib/providers/types";

export type PromptChangeLogEntry = { version: string; date: string; notes: string };

export type PromptDef<I, O> = {
  name: string;
  version: string;
  purpose: string;
  taskType: TaskType;
  /** false => free text fields in the input are PII-redacted before being sent to any provider. */
  allowsRawData: boolean;
  inputSchema: z.ZodType<I>;
  outputSchema: z.ZodType<O>;
  systemPrompt: string;
  buildUserPrompt: (input: I) => string;
  deterministicFallback: (input: I) => O;
  maxTokens?: number;
  changelog: PromptChangeLogEntry[];
};

export function definePrompt<I, O>(def: PromptDef<I, O>): PromptDef<I, O> {
  return def;
}
