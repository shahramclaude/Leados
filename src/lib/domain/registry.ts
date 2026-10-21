import type { z } from "zod";
import { ENTITY_TYPE_ORG_UNIT, OrgUnitSchema, orgUnitProjectionColumns } from "./orgUnit";
import { ENTITY_TYPE_PERSON, PersonSchema, personProjectionColumns } from "./person";
import { ENTITY_TYPE_ROLE, RoleSchema, roleProjectionColumns } from "./role";
import { ENTITY_TYPE_SKILL, SkillSchema, skillProjectionColumns } from "./skill";
import { ENTITY_TYPE_OBJECTIVE, ObjectiveSchema, objectiveProjectionColumns } from "./objective";
import { ENTITY_TYPE_KEY_RESULT, KeyResultSchema, keyResultProjectionColumns } from "./keyResult";
import { ENTITY_TYPE_DECISION, DecisionSchema, decisionProjectionColumns } from "./decision";
import { ENTITY_TYPE_FINDING, FindingSchema, findingProjectionColumns } from "./finding";
import { ENTITY_TYPE_HYPOTHESIS, HypothesisSchema, hypothesisProjectionColumns } from "./hypothesis";
import { ENTITY_TYPE_RISK, RiskSchema, riskProjectionColumns } from "./risk";
import { ENTITY_TYPE_INITIATIVE, InitiativeSchema, initiativeProjectionColumns } from "./initiative";
import {
  ENTITY_TYPE_BUDGET,
  ENTITY_TYPE_ACCOUNT,
  ENTITY_TYPE_TRANSACTION,
  BudgetSchema,
  AccountSchema,
  TransactionSchema,
  budgetProjectionColumns,
  accountProjectionColumns,
  transactionProjectionColumns,
} from "./budget";
import { ENTITY_TYPE_POLICY, PolicySchema, policyProjectionColumns } from "./policy";

export type ProjectionColumns = { ownerId: string | null; parentId: string | null; status: string | null };

export type EntityDefinition<T extends { id: string }> = {
  entityType: string;
  schema: z.ZodType<T>;
  projectionColumns: (data: T) => ProjectionColumns;
};

/** Type-erased view used where the concrete entity shape doesn't matter. */
export type EntityDefinitionAny = {
  entityType: string;
  schema: z.ZodTypeAny;
  projectionColumns: (data: never) => ProjectionColumns;
};

function defineEntity<T extends { id: string }>(def: EntityDefinition<T>): EntityDefinition<T> {
  return def;
}

export const ENTITY_DEFINITIONS = {
  [ENTITY_TYPE_ORG_UNIT]: defineEntity({
    entityType: ENTITY_TYPE_ORG_UNIT,
    schema: OrgUnitSchema,
    projectionColumns: orgUnitProjectionColumns,
  }),
  [ENTITY_TYPE_PERSON]: defineEntity({
    entityType: ENTITY_TYPE_PERSON,
    schema: PersonSchema,
    projectionColumns: personProjectionColumns,
  }),
  [ENTITY_TYPE_ROLE]: defineEntity({
    entityType: ENTITY_TYPE_ROLE,
    schema: RoleSchema,
    projectionColumns: roleProjectionColumns,
  }),
  [ENTITY_TYPE_SKILL]: defineEntity({
    entityType: ENTITY_TYPE_SKILL,
    schema: SkillSchema,
    projectionColumns: skillProjectionColumns,
  }),
  [ENTITY_TYPE_OBJECTIVE]: defineEntity({
    entityType: ENTITY_TYPE_OBJECTIVE,
    schema: ObjectiveSchema,
    projectionColumns: objectiveProjectionColumns,
  }),
  [ENTITY_TYPE_KEY_RESULT]: defineEntity({
    entityType: ENTITY_TYPE_KEY_RESULT,
    schema: KeyResultSchema,
    projectionColumns: keyResultProjectionColumns,
  }),
  [ENTITY_TYPE_DECISION]: defineEntity({
    entityType: ENTITY_TYPE_DECISION,
    schema: DecisionSchema,
    projectionColumns: decisionProjectionColumns,
  }),
  [ENTITY_TYPE_FINDING]: defineEntity({
    entityType: ENTITY_TYPE_FINDING,
    schema: FindingSchema,
    projectionColumns: findingProjectionColumns,
  }),
  [ENTITY_TYPE_HYPOTHESIS]: defineEntity({
    entityType: ENTITY_TYPE_HYPOTHESIS,
    schema: HypothesisSchema,
    projectionColumns: hypothesisProjectionColumns,
  }),
  [ENTITY_TYPE_RISK]: defineEntity({
    entityType: ENTITY_TYPE_RISK,
    schema: RiskSchema,
    projectionColumns: riskProjectionColumns,
  }),
  [ENTITY_TYPE_INITIATIVE]: defineEntity({
    entityType: ENTITY_TYPE_INITIATIVE,
    schema: InitiativeSchema,
    projectionColumns: initiativeProjectionColumns,
  }),
  [ENTITY_TYPE_BUDGET]: defineEntity({
    entityType: ENTITY_TYPE_BUDGET,
    schema: BudgetSchema,
    projectionColumns: budgetProjectionColumns,
  }),
  [ENTITY_TYPE_ACCOUNT]: defineEntity({
    entityType: ENTITY_TYPE_ACCOUNT,
    schema: AccountSchema,
    projectionColumns: accountProjectionColumns,
  }),
  [ENTITY_TYPE_TRANSACTION]: defineEntity({
    entityType: ENTITY_TYPE_TRANSACTION,
    schema: TransactionSchema,
    projectionColumns: transactionProjectionColumns,
  }),
  [ENTITY_TYPE_POLICY]: defineEntity({
    entityType: ENTITY_TYPE_POLICY,
    schema: PolicySchema,
    projectionColumns: policyProjectionColumns,
  }),
} as const;

export type EntityTypeName = keyof typeof ENTITY_DEFINITIONS;

export const ENTITY_TYPE_NAMES = Object.keys(ENTITY_DEFINITIONS) as EntityTypeName[];

export function getEntityDefinition(entityType: string): EntityDefinitionAny | undefined {
  return (ENTITY_DEFINITIONS as unknown as Record<string, EntityDefinitionAny>)[entityType];
}
