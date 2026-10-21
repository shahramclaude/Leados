import { z } from "zod";

export const EvidenceChunkSchema = z.object({
  id: z.string(),
  kind: z.enum(["entity", "event", "metric", "doc", "memory_note", "finding"]),
  text: z.string(),
  timestamp: z.string().optional(),
});
export type EvidenceChunkT = z.infer<typeof EvidenceChunkSchema>;

export const ClaimSchema = z.object({
  claim: z.string(),
  evidenceRefs: z.array(
    z.object({
      kind: z.enum(["entity", "event", "metric", "doc", "memory_note", "capture_proposal", "finding"]),
      id: z.string(),
      timestamp: z.string().optional(),
      label: z.string().optional(),
      excerpt: z.string().optional(),
    }),
  ),
});
export type ClaimT = z.infer<typeof ClaimSchema>;
