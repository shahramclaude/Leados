import { z } from "zod";
import { BaseEntitySchema } from "./base";

export const ENTITY_TYPE_SKILL = "skill" as const;

export const SkillSchema = BaseEntitySchema.extend({
  name: z.string().min(1),
  category: z.string().min(1),
});
export type Skill = z.infer<typeof SkillSchema>;

export function skillProjectionColumns(data: Skill) {
  return {
    ownerId: null as string | null,
    parentId: null as string | null,
    status: data.category,
  };
}
