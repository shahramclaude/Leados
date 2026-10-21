// Section D: single prompt registry. Nothing in the app should build a
// prompt string outside of this directory.
import { classifyCapturePrompt } from "./classifyCapture";
import { synthesizeNarrativePrompt } from "./synthesizeNarrative";
import { briefingPolishPrompt } from "./briefingPolish";
import { askLeadosPrompt } from "./askLeados";
import type { PromptDef } from "./types";

export * from "./types";
export * from "./common";
export { classifyCapturePrompt } from "./classifyCapture";
export { synthesizeNarrativePrompt } from "./synthesizeNarrative";
export { briefingPolishPrompt } from "./briefingPolish";
export { askLeadosPrompt } from "./askLeados";
export * from "./classifyCapture";
export * from "./synthesizeNarrative";
export * from "./briefingPolish";
export * from "./askLeados";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PROMPT_REGISTRY: Record<string, PromptDef<any, any>> = {
  [classifyCapturePrompt.name]: classifyCapturePrompt,
  [synthesizeNarrativePrompt.name]: synthesizeNarrativePrompt,
  [briefingPolishPrompt.name]: briefingPolishPrompt,
  [askLeadosPrompt.name]: askLeadosPrompt,
};

export function fullChangeLog() {
  return Object.values(PROMPT_REGISTRY).flatMap((p) =>
    p.changelog.map((entry) => ({ prompt: p.name, ...entry })),
  );
}
