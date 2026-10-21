import { z } from "zod";
import { BaseEntitySchema } from "./base";

export const ENTITY_TYPE_HYPOTHESIS = "hypothesis" as const;

export const HypothesisSchema = BaseEntitySchema.extend({
  statement: z.string().min(1),
  prior: z.number().min(0).max(1),
  posterior: z.number().min(0).max(1).nullable(),
  resolutionCriteria: z.string().min(1),
  ownerId: z.string().uuid(),
});
export type Hypothesis = z.infer<typeof HypothesisSchema>;

export function hypothesisProjectionColumns(data: Hypothesis) {
  return {
    ownerId: data.ownerId,
    parentId: null as string | null,
    status: data.posterior === null ? "open" : "resolved",
  };
}
