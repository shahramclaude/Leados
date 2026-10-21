import { z } from "zod";
import { BaseEntitySchema } from "./base";

export const ENTITY_TYPE_POLICY = "policy" as const;

export const PolicySchema = BaseEntitySchema.extend({
  name: z.string().min(1),
  description: z.string().default(""),
  rules: z.array(z.object({ key: z.string().min(1), value: z.unknown() })).default([]),
  status: z.enum(["draft", "active", "retired"]).default("draft"),
  ownerId: z.string().uuid(),
});
export type Policy = z.infer<typeof PolicySchema>;

export function policyProjectionColumns(data: Policy) {
  return {
    ownerId: data.ownerId,
    parentId: null as string | null,
    status: data.status,
  };
}
