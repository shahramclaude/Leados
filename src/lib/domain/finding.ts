import { z } from "zod";
import { BaseEntitySchema } from "./base";

export const ENTITY_TYPE_FINDING = "finding" as const;

export const FindingSchema = BaseEntitySchema.extend({
  title: z.string().min(1),
  severity: z.number().int().min(1).max(5),
  evidenceRefs: z.array(z.string().min(1)).default([]),
  confidenceClass: z.enum(["low", "medium", "high"]),
  ownerId: z.string().uuid(),
});
export type Finding = z.infer<typeof FindingSchema>;

export function findingProjectionColumns(data: Finding) {
  return {
    ownerId: data.ownerId,
    parentId: null as string | null,
    status: `severity_${data.severity}`,
  };
}
