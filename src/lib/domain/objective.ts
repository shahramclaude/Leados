import { z } from "zod";
import { BaseEntitySchema } from "./base";

export const ENTITY_TYPE_OBJECTIVE = "objective" as const;

export const ObjectiveSchema = BaseEntitySchema.extend({
  title: z.string().min(1),
  description: z.string().default(""),
  cascadeParentId: z.string().uuid().nullable(),
  ownerId: z.string().uuid(),
  status: z.enum(["draft", "active", "at_risk", "achieved", "abandoned"]).default("draft"),
});
export type Objective = z.infer<typeof ObjectiveSchema>;

export function objectiveProjectionColumns(data: Objective) {
  return {
    ownerId: data.ownerId,
    parentId: data.cascadeParentId,
    status: data.status,
  };
}
