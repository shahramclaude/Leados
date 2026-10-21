import { z } from "zod";
import { BaseEntitySchema } from "./base";

export const ENTITY_TYPE_PERSON = "person" as const;

export const PersonSchema = BaseEntitySchema.extend({
  displayName: z.string().min(1),
  email: z.string().email(),
  orgUnitId: z.string().uuid().nullable(),
  roleIds: z.array(z.string().uuid()).default([]),
  status: z.enum(["active", "inactive"]).default("active"),
});
export type Person = z.infer<typeof PersonSchema>;

export function personProjectionColumns(data: Person) {
  return {
    ownerId: null as string | null,
    parentId: data.orgUnitId,
    status: data.status,
  };
}
