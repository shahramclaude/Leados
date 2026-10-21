import { z } from "zod";

export const onboardingSchema = z.object({
  name: z.string().trim().min(2).max(120),
});

export const createLeadSchema = z.object({
  name: z.string().trim().min(1).max(200),
  source: z.string().trim().min(1).max(80),
  notes: z.string().trim().max(2000).optional().default(""),
});

export const createFindingSchema = z.object({
  leadId: z.string().uuid(),
  summary: z.string().trim().min(1).max(2000),
  outcome: z.union([z.literal(0), z.literal(1)]).optional(),
});

export const createDecisionSchema = z.object({
  findingId: z.string().uuid(),
  action: z.enum(["pursue", "watch", "discard"]),
  rationale: z.string().trim().min(1).max(2000),
});

export const createApprovalSchema = z.object({
  decisionId: z.string().uuid(),
  approver: z.string().trim().min(1).max(200),
  outcome: z.enum(["approved", "rejected"]),
});

export const createAutomationRunSchema = z.object({
  approvalId: z.string().uuid(),
  trials: z.number().int().min(100).max(200000).optional().default(5000),
  seed: z.number().int().min(0).optional(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
