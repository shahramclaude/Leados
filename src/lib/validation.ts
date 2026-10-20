import { z } from "zod";

/**
 * Strict, allow-list style runtime validation for every API input. `.strict()`
 * rejects unknown fields (mass-assignment protection); explicit `.max()`
 * bounds on every string field cap memory/storage abuse and reduce XSS/
 * injection payload surface before it ever reaches a query or a response.
 */

export const emailSchema = z.string().trim().toLowerCase().email().max(320);

export const registerSchema = z
  .object({
    orgName: z.string().trim().min(2).max(255),
    email: emailSchema,
    password: z.string().min(12).max(256),
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(256),
  })
  .strict();

const sensitiveDataSchema = z.record(z.string().max(100), z.unknown()).optional();

export const personCreateSchema = z
  .object({
    firstName: z.string().trim().min(1).max(120),
    lastName: z.string().trim().min(1).max(120),
    email: emailSchema.optional().or(z.literal("")),
    phone: z.string().trim().max(40).optional().or(z.literal("")),
    notes: z.string().trim().max(5000).optional().or(z.literal("")),
    sensitiveData: sensitiveDataSchema,
  })
  .strict();

export const personUpdateSchema = personCreateSchema.partial().strict();

export const auditQuerySchema = z
  .object({
    action: z.string().max(100).optional(),
    resourceType: z.string().max(100).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict();

export const sessionRevokeSchema = z
  .object({
    sessionId: z.string().uuid(),
    reason: z.string().trim().max(255).optional(),
  })
  .strict();

export const uuidSchema = z.string().uuid();
