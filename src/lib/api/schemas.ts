import { z } from "zod";

export const createFindingSchema = z.object({
  title: z.string().trim().min(1, "title is required").max(240),
  description: z.string().trim().max(5000).optional().default(""),
});

export const updateFindingSchema = z.object({
  status: z.enum(["open", "triaged", "closed"]).optional(),
  observeOutcome: z.boolean().optional(),
});

export const createDecisionSchema = z
  .object({
    findingId: z.number().int().positive(),
    title: z.string().trim().min(1).max(240),
    rationale: z.string().trim().max(5000).optional().default(""),
    optimisticEstimate: z.number().finite(),
    likelyEstimate: z.number().finite(),
    pessimisticEstimate: z.number().finite(),
  })
  .refine(
    (v) => v.optimisticEstimate <= v.likelyEstimate,
    { message: "optimisticEstimate must be <= likelyEstimate", path: ["optimisticEstimate"] },
  )
  .refine(
    (v) => v.likelyEstimate <= v.pessimisticEstimate,
    { message: "likelyEstimate must be <= pessimisticEstimate", path: ["likelyEstimate"] },
  );

export const updateDecisionSchema = z.object({
  status: z.enum(["proposed", "approved", "rejected"]).optional(),
});

export const createApprovalSchema = z.object({
  decisionId: z.number().int().positive(),
});

export const decideApprovalSchema = z.object({
  status: z.enum(["approved", "rejected"]),
});

export const createAutomationRunSchema = z.object({
  decisionId: z.number().int().positive(),
});

export const createBoardPackSchema = z.object({
  title: z.string().trim().min(1).max(240),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
});
