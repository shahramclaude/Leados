// Every input boundary in this app goes through one of these schemas —
// `.strict()` everywhere so mass-assignment (extra fields like `role` or
// `orgId` smuggled into a body) is rejected outright rather than silently
// dropped. Field length caps bound storage/memory abuse from fuzzing.
import { z } from "zod";
import { PASSWORD_MIN_LENGTH } from "@/lib/password";

export const EMAIL_MAX = 254;
export const NAME_MAX = 120;
export const NOTES_MAX = 10_000;

const email = z.string().trim().toLowerCase().email().max(EMAIL_MAX);
const strongPassword = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(256)
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v) && /[0-9]/.test(v), {
    message: "Password must contain upper, lower, and a digit",
  });

export const registerSchema = z
  .object({
    orgName: z.string().trim().min(1).max(NAME_MAX),
    email,
    password: strongPassword,
  })
  .strict();

export const loginSchema = z
  .object({
    email,
    password: z.string().min(1).max(256),
  })
  .strict();

export const personCreateSchema = z
  .object({
    firstName: z.string().trim().min(1).max(NAME_MAX),
    lastName: z.string().trim().min(1).max(NAME_MAX),
    email: email.optional(),
    notes: z.string().max(NOTES_MAX).optional(),
  })
  .strict();

export const personUpdateSchema = personCreateSchema.partial().strict();

export const personSearchSchema = z
  .object({
    q: z.string().trim().min(1).max(200),
  })
  .strict();

export const roleChangeSchema = z
  .object({
    role: z.enum(["admin", "manager", "member", "viewer"]),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export const incidentBannerSchema = z
  .object({
    enabled: z.boolean(),
    message: z.string().trim().max(500).optional(),
  })
  .strict();

export const exportConsentSchema = z
  .object({
    scope: z.enum(["people_export", "self_data_export"]),
    acknowledge: z.literal(true),
  })
  .strict();

export const webhookUrlCheckSchema = z
  .object({
    url: z.string().trim().min(1).max(2048),
  })
  .strict();

export const importRowSchema = personCreateSchema;

export const importCreateSchema = z
  .object({
    rows: z.array(importRowSchema).min(1).max(500),
  })
  .strict();

export const sessionRevokeSchema = z
  .object({
    sessionId: z.string().uuid(),
  })
  .strict();
