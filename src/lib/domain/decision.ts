import { z } from "zod";
import { BaseEntitySchema } from "./base";

export const ENTITY_TYPE_DECISION = "decision" as const;

export const DecisionSchema = BaseEntitySchema.extend({
  question: z.string().min(1),
  options: z.array(z.string().min(1)).min(1),
  chosen: z.string().nullable(),
  decidedAt: z.string().datetime().nullable(),
  reviewAt: z.string().datetime().nullable(),
  expectedOutcome: z.string().default(""),
  actualOutcome: z.string().nullable().default(null),
  ownerId: z.string().uuid(),
});
export type Decision = z.infer<typeof DecisionSchema>;

export function decisionProjectionColumns(data: Decision) {
  return {
    ownerId: data.ownerId,
    parentId: null as string | null,
    status: data.chosen ? "decided" : "open",
  };
}
