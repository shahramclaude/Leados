import { z } from "zod";
import { BaseEntitySchema } from "./base";

export const ENTITY_TYPE_ROLE = "role" as const;

export const RoleSchema = BaseEntitySchema.extend({
  title: z.string().min(1),
  orgUnitId: z.string().uuid().nullable(),
  skillIds: z.array(z.string().uuid()).default([]),
});
export type Role = z.infer<typeof RoleSchema>;

export function roleProjectionColumns(data: Role) {
  return {
    ownerId: null as string | null,
    parentId: data.orgUnitId,
    status: null as string | null,
  };
}
