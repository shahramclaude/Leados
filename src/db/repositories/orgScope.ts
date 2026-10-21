/**
 * Every repository function in this folder takes `orgId` as its first
 * argument and bakes it into the SQL predicate (not an in-memory filter
 * afterwards). This is the chokepoint the cross-tenant isolation tests in
 * `tests/isolation.test.ts` exercise directly.
 */
export class NotFoundInOrgError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} ${id} not found in this org scope`);
    this.name = "NotFoundInOrgError";
  }
}
