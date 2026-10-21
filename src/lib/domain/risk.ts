import { z } from "zod";
import { BaseEntitySchema } from "./base";

export const ENTITY_TYPE_RISK = "risk" as const;

export const RiskSchema = BaseEntitySchema.extend({
  title: z.string().min(1),
  likelihood: z.number().min(0).max(1),
  impact: z.number().min(0).max(1),
  velocity: z.enum(["slow", "moderate", "fast"]),
  owner: z.string().uuid(),
  mitigations: z.array(z.string().min(1)).default([]),
});
export type Risk = z.infer<typeof RiskSchema>;

export function riskProjectionColumns(data: Risk) {
  return {
    ownerId: data.owner,
    parentId: null as string | null,
    status: data.velocity,
  };
}
