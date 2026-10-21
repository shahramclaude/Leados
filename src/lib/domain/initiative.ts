import { z } from "zod";
import { BaseEntitySchema } from "./base";

export const ENTITY_TYPE_INITIATIVE = "initiative" as const;

export const MilestoneSchema = z.object({
  name: z.string().min(1),
  dueAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});

export const InitiativeSchema = BaseEntitySchema.extend({
  title: z.string().min(1),
  portfolio: z.string().min(1),
  budgetRef: z.string().uuid().nullable(),
  milestones: z.array(MilestoneSchema).default([]),
  ownerId: z.string().uuid(),
});
export type Initiative = z.infer<typeof InitiativeSchema>;

export function initiativeProjectionColumns(data: Initiative) {
  return {
    ownerId: data.ownerId,
    parentId: data.budgetRef,
    status: data.portfolio,
  };
}
