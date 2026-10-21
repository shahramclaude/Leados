// Contract test: every API route returns the `{ data }` / `{ error }`
// envelope defined in src/lib/api-result.ts — never a bare value. This is
// the coherence rule from the Part 20 checklist (consistent result pattern).
import { describe, expect, it } from "vitest";
import { ok, fail, withApiResult } from "@/lib/api-result";
import { ValidationError, ForbiddenServiceError, NotFoundServiceError, ConflictServiceError } from "@/lib/errors";
import { BudgetExceededError } from "@/lib/budget";
import { UnauthorizedError, ForbiddenError } from "@/lib/tenancy";

describe("contract: API result envelope", () => {
  it("ok() wraps the payload in { data }", async () => {
    const res = ok({ hello: "world" });
    const body = await res.json();
    expect(body).toEqual({ data: { hello: "world" } });
  });

  it("fail() wraps the payload in { error }", async () => {
    const res = fail("NOT_FOUND", "nope", 404);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: { code: "NOT_FOUND", message: "nope" } });
  });

  const cases: Array<[Error, number, string]> = [
    [new ValidationError("bad input"), 400, "VALIDATION_ERROR"],
    [new UnauthorizedError("no token"), 401, "UNAUTHORIZED"],
    [new ForbiddenError("nope"), 403, "FORBIDDEN"],
    [new ForbiddenServiceError("nope"), 403, "FORBIDDEN"],
    [new BudgetExceededError("org-1", "2026-01"), 402, "BUDGET_EXCEEDED"],
    [new NotFoundServiceError("missing"), 404, "NOT_FOUND"],
    [new ConflictServiceError("conflict"), 409, "CONFLICT"],
  ];

  it.each(cases)("maps %o to the right status/code", async (error, status, code) => {
    const res = await withApiResult(async () => {
      throw error;
    });
    expect(res.status).toBe(status);
    const body = await res.json();
    expect(body.error.code).toBe(code);
  });

  it("maps unknown errors to a generic 500 without leaking internals", async () => {
    const res = await withApiResult(async () => {
      throw new Error("super secret stack detail");
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(body)).not.toContain("super secret stack detail");
  });
});
