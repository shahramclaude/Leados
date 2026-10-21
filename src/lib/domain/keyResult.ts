import { z } from "zod";
import { BaseEntitySchema } from "./base";

export const ENTITY_TYPE_KEY_RESULT = "key_result" as const;

export const KeyResultSchema = BaseEntitySchema.extend({
  objectiveId: z.string().uuid(),
  title: z.string().min(1),
  baseline: z.number(),
  target: z.number(),
  current: z.number(),
  unit: z.string().min(1),
  confidence: z.number().min(0).max(1),
});
export type KeyResult = z.infer<typeof KeyResultSchema>;

export function keyResultProjectionColumns(data: KeyResult) {
  return {
    ownerId: null as string | null,
    parentId: data.objectiveId,
    status: null as string | null,
  };
}
