// Section E.4: assisted capture classification. Cheap model tier
// (classification). Raw text does NOT get sent — classify.ts redacts PII
// first (allowsRawData=false) because capture input is unvetted freeform
// text from outside LEADOS (notes/emails).
import { z } from "zod";
import { definePrompt } from "./types";

export const ClassifyCaptureInput = z.object({
  redactedText: z.string().min(1).max(4000),
  knownEntityNames: z.array(z.string()).default([]),
});
export type ClassifyCaptureInputT = z.infer<typeof ClassifyCaptureInput>;

export const ClassifyCaptureOutput = z.object({
  proposedEntityType: z.string(),
  proposedEntityName: z.string(),
  eventType: z.string(),
  summary: z.string().min(1).max(500),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(500),
});
export type ClassifyCaptureOutputT = z.infer<typeof ClassifyCaptureOutput>;

const EVENT_TYPE_KEYWORDS: [RegExp, string][] = [
  [/\b(risk|blocked|delay|slip|concern)\b/i, "risk_flagged"],
  [/\b(meeting|call|synced?|discuss(ed)?)\b/i, "meeting"],
  [/\b(email|mail|sent|replied)\b/i, "email"],
  [/\b(closed|won|signed|contract)\b/i, "status_change"],
  [/\b(decision|decided|approved|agreed)\b/i, "decision"],
];

function naiveClassify(input: ClassifyCaptureInputT): ClassifyCaptureOutputT {
  const text = input.redactedText;
  const matchedType = EVENT_TYPE_KEYWORDS.find(([re]) => re.test(text));
  const knownMatch = input.knownEntityNames.find((n) => text.toLowerCase().includes(n.toLowerCase()));
  const firstSentence = text.split(/[.!?]\s/)[0]?.slice(0, 280) ?? text.slice(0, 280);
  return {
    proposedEntityType: knownMatch ? "existing" : "unknown",
    proposedEntityName: knownMatch ?? "Unclassified",
    eventType: matchedType?.[1] ?? "note",
    summary: firstSentence,
    // Deterministic fallback is intentionally conservative: capped below the
    // auto-suggest display threshold so it always routes to full human
    // review rather than implying machine confidence it doesn't have.
    confidence: knownMatch && matchedType ? 0.4 : 0.25,
    reasoning: "Deterministic keyword-based fallback (no model call was made).",
  };
}

export const classifyCapturePrompt = definePrompt<ClassifyCaptureInputT, ClassifyCaptureOutputT>({
  name: "classify_capture",
  version: "1.1.0",
  purpose: "Turn a raw captured note/email into a proposed structured event for human review.",
  taskType: "classification",
  allowsRawData: false,
  inputSchema: ClassifyCaptureInput,
  outputSchema: ClassifyCaptureOutput,
  maxTokens: 400,
  systemPrompt:
    "You classify short organizational notes into a structured event proposal. " +
    "Always respond with strict JSON matching the given schema and nothing else. " +
    "Never invent an entity name that is not plausibly derived from the text.",
  buildUserPrompt: (input) =>
    [
      `Known entity names in the org: ${input.knownEntityNames.join(", ") || "(none yet)"}`,
      "",
      "Captured text (already PII-redacted):",
      input.redactedText,
      "",
      "Return JSON: { proposedEntityType, proposedEntityName, eventType, summary, confidence (0-1), reasoning }.",
    ].join("\n"),
  deterministicFallback: naiveClassify,
  changelog: [
    { version: "1.0.0", date: "2025-11-02", notes: "Initial classification prompt." },
    {
      version: "1.1.0",
      date: "2025-12-14",
      notes: "Lowered fallback confidence ceiling so keyword fallback never masquerades as a confident model call.",
    },
  ],
});
