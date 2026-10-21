import { ENTITY_DEFINITIONS } from "../../domain/registry";
import { createEntityRepository, type EntityRepository } from "./entityRepository";
import type { OrgUnit } from "../../domain/orgUnit";
import type { Person } from "../../domain/person";
import type { Role } from "../../domain/role";
import type { Skill } from "../../domain/skill";
import type { Objective } from "../../domain/objective";
import type { KeyResult } from "../../domain/keyResult";
import type { Decision } from "../../domain/decision";
import type { Finding } from "../../domain/finding";
import type { Hypothesis } from "../../domain/hypothesis";
import type { Risk } from "../../domain/risk";
import type { Initiative } from "../../domain/initiative";
import type { Budget, Account, Transaction } from "../../domain/budget";
import type { Policy } from "../../domain/policy";

export const orgUnitRepository: EntityRepository<OrgUnit> = createEntityRepository(ENTITY_DEFINITIONS.org_unit);
export const personRepository: EntityRepository<Person> = createEntityRepository(ENTITY_DEFINITIONS.person);
export const roleRepository: EntityRepository<Role> = createEntityRepository(ENTITY_DEFINITIONS.role);
export const skillRepository: EntityRepository<Skill> = createEntityRepository(ENTITY_DEFINITIONS.skill);
export const objectiveRepository: EntityRepository<Objective> = createEntityRepository(ENTITY_DEFINITIONS.objective);
export const keyResultRepository: EntityRepository<KeyResult> = createEntityRepository(ENTITY_DEFINITIONS.key_result);
export const decisionRepository: EntityRepository<Decision> = createEntityRepository(ENTITY_DEFINITIONS.decision);
export const findingRepository: EntityRepository<Finding> = createEntityRepository(ENTITY_DEFINITIONS.finding);
export const hypothesisRepository: EntityRepository<Hypothesis> = createEntityRepository(ENTITY_DEFINITIONS.hypothesis);
export const riskRepository: EntityRepository<Risk> = createEntityRepository(ENTITY_DEFINITIONS.risk);
export const initiativeRepository: EntityRepository<Initiative> = createEntityRepository(ENTITY_DEFINITIONS.initiative);
export const budgetRepository: EntityRepository<Budget> = createEntityRepository(ENTITY_DEFINITIONS.budget);
export const accountRepository: EntityRepository<Account> = createEntityRepository(ENTITY_DEFINITIONS.account);
export const transactionRepository: EntityRepository<Transaction> = createEntityRepository(ENTITY_DEFINITIONS.transaction);
export const policyRepository: EntityRepository<Policy> = createEntityRepository(ENTITY_DEFINITIONS.policy);

export const REPOSITORIES_BY_ENTITY_TYPE: Record<string, EntityRepository<{ id: string }>> = {
  org_unit: orgUnitRepository as unknown as EntityRepository<{ id: string }>,
  person: personRepository as unknown as EntityRepository<{ id: string }>,
  role: roleRepository as unknown as EntityRepository<{ id: string }>,
  skill: skillRepository as unknown as EntityRepository<{ id: string }>,
  objective: objectiveRepository as unknown as EntityRepository<{ id: string }>,
  key_result: keyResultRepository as unknown as EntityRepository<{ id: string }>,
  decision: decisionRepository as unknown as EntityRepository<{ id: string }>,
  finding: findingRepository as unknown as EntityRepository<{ id: string }>,
  hypothesis: hypothesisRepository as unknown as EntityRepository<{ id: string }>,
  risk: riskRepository as unknown as EntityRepository<{ id: string }>,
  initiative: initiativeRepository as unknown as EntityRepository<{ id: string }>,
  budget: budgetRepository as unknown as EntityRepository<{ id: string }>,
  account: accountRepository as unknown as EntityRepository<{ id: string }>,
  transaction: transactionRepository as unknown as EntityRepository<{ id: string }>,
  policy: policyRepository as unknown as EntityRepository<{ id: string }>,
};
