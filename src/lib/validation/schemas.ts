// Strict runtime validation for every route (Part 17-C). Zod schemas are the
// single source of truth for shape, length, and format limits — handlers
// must not do ad-hoc validation.
import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(512),
});

export const personCreateSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  email: emailSchema.optional().nullable(),
  phone: z
    .string()
    .trim()
    .max(32)
    .regex(/^[0-9+().\-\s]*$/, "invalid phone format")
    .optional()
    .nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

export const personUpdateSchema = personCreateSchema.partial();

export const peopleListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

export const userInviteSchema = z.object({
  email: emailSchema,
  role: z.enum(["admin", "manager", "member", "viewer"]),
  temporaryPassword: z.string().min(12).max(512),
});

export const roleChangeSchema = z.object({
  role: z.enum(["owner", "admin", "manager", "member", "viewer"]),
  reason: z.string().trim().min(3).max(500),
});

export const webhookCreateSchema = z.object({
  url: z.string().trim().url().max(2048),
});

export const agentRunSchema = z.object({
  action: z.enum(["summarize_person", "draft_outreach", "score_lead"]),
  personId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

export const auditQuerySchema = z.object({
  action: z.string().trim().max(100).optional(),
  actorUserId: z.string().uuid().optional(),
  resourceType: z.string().trim().max(100).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

// --- Import pipeline (Part 17-C: upload/import limits + quarantine) -------

export const MAX_IMPORT_BYTES = 1 * 1024 * 1024; // 1 MiB
export const MAX_IMPORT_ROWS = 2000;

export const importRowSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  email: emailSchema.optional().or(z.literal("")),
  phone: z.string().trim().max(32).optional().or(z.literal("")),
});
