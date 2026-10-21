// Single home for every typed error LEADOS throws. Consistent error-handling
// pattern (part of the Part 20 coherence checklist): every failure mode is a
// named class here, caught exactly once in src/lib/api-result.ts, and never
// re-declared per route or per service.

export class ValidationError extends Error {}
export class ForbiddenServiceError extends Error {}
export class NotFoundServiceError extends Error {}
export class ConflictServiceError extends Error {}
