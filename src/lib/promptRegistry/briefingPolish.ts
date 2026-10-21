// Section E.1: executive briefing. The briefing's CORE is fully
// deterministic (computed in src/lib/briefing.ts straight from DB data) so
// it is diffable week over week. This prompt only rewrites already-cited
// bullet points into readable prose section-by-section — it is never
// allowed to introduce a new fact, and its deterministic fallback is simply
// "join the bullets", which is exactly what ships when no provider is
// configured or when the model fails to keep citations 1:1.
import { z } from "zod";
import { definePrompt } from "./types";
import { ClaimSchema } from "./common";

const SectionInput = z.object({
  heading: z.string(),
  bullets: z.array(ClaimSchema),
});

export const BriefingPolishInput = z.object({
  asOfDate: z.string(),
  sections: z.array(SectionInput),
});
export type BriefingPolishInputT = z.infer<typeof BriefingPolishInput>;

const SectionOutput = z.object({
  heading: z.string(),
  prose: z.string(),
  claims: z.array(ClaimSchema),
});

export const BriefingPolishOutput = z.object({
  sections: z.array(SectionOutput),
});
export type BriefingPolishOutputT = z.infer<typeof BriefingPolishOutput>;

function naivePolish(input: BriefingPolishInputT): BriefingPolishOutputT {
  return {
    sections: input.sections.map((s) => ({
      heading: s.heading,
      prose: s.bullets.length > 0 ? s.bullets.map((b) => `• ${b.claim}`).join("\n") : "Nothing to report.",
      claims: s.bullets,
    })),
  };
}

export const briefingPolishPrompt = definePrompt<BriefingPolishInputT, BriefingPolishOutputT>({
  name: "briefing_polish",
  version: "1.0.0",
  purpose: "Rewrite deterministic, evidence-linked briefing bullets into short readable prose without adding facts.",
  taskType: "synthesis",
  allowsRawData: true,
  inputSchema: BriefingPolishInput,
  outputSchema: BriefingPolishOutput,
  maxTokens: 900,
  systemPrompt:
    "You rewrite bullet points into 1-3 short sentences of prose per section. " +
    "You MUST NOT add any fact, number, or name that is not already present in the bullets you were given. " +
    "Return the exact same claims array you were given for each section, unmodified, alongside your prose. " +
    "Respond with JSON only.",
  buildUserPrompt: (input) =>
    [
      `As of: ${input.asOfDate}`,
      "Sections (already evidence-linked — do not add facts):",
      JSON.stringify(input.sections, null, 2),
      "",
      "Return JSON: { sections: [{ heading, prose, claims }] } — claims must equal the input bullets for that section.",
    ].join("\n"),
  deterministicFallback: naivePolish,
  changelog: [{ version: "1.0.0", date: "2025-12-01", notes: "Initial briefing polish prompt." }],
});
