import { z } from "zod";
import { BaseEntitySchema } from "./base";

export const ENTITY_TYPE_ORG_UNIT = "org_unit" as const;

export const OrgUnitSchema = BaseEntitySchema.extend({
  name: z.string().min(1),
  parentOrgUnitId: z.string().uuid().nullable(),
  kind: z.enum(["company", "division", "department", "team"]),
});
export type OrgUnit = z.infer<typeof OrgUnitSchema>;

export function orgUnitProjectionColumns(data: OrgUnit) {
  return {
    ownerId: null as string | null,
    parentId: data.parentOrgUnitId,
    status: data.kind,
  };
}
