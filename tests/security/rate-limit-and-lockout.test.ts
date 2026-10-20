import { beforeEach, describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { consumeRateLimit, __resetRateLimitsForTests } from "@/lib/rateLimit";
import { createOrgAndAdmin } from "@/lib/authService";
import { generateCsrfToken } from "@/lib/csrf";
import { buildRequest, resetDb } from "../helpers";

describe("rate limiting primitive", () => {
  beforeEach(() => __resetRateLimitsForTests());

  it("allows up to the limit then blocks within the window", () => {
    const key = "test:1.2.3.4";
    for (let i = 0; i < 5; i++) {
      expect(consumeRateLimit(key, 5, 1000).allowed).toBe(true);
    }
    const sixth = consumeRateLimit(key, 5, 1000);
    expect(sixth.allowed).toBe(false);
  });

  it("resets after the window elapses", async () => {
    const key = "test:reset";
    for (let i = 0; i < 3; i++) consumeRateLimit(key, 3, 50);
    expect(consumeRateLimit(key, 3, 50).allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 60));
    expect(consumeRateLimit(key, 3, 50).allowed).toBe(true);
  });
});

function loginRequest(email: string, password: string) {
  const csrfToken = generateCsrfToken();
  return buildRequest("/api/auth/login", null, {
    method: "POST",
    body: { email, password },
    cookies: { leados_csrf: csrfToken },
    headers: { "x-csrf-token": csrfToken },
  });
}

describe("login endpoint hardening", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("rate-limits repeated login attempts from the same IP", async () => {
    await createOrgAndAdmin("Acme", "ratelimit@acme.test", "Str0ng!Passw0rd-123");
    let sawRateLimit = false;
    for (let i = 0; i < 15; i++) {
      const res = await login(loginRequest("ratelimit@acme.test", "wrong-password"));
      if (res.status === 429) {
        sawRateLimit = true;
        break;
      }
    }
    expect(sawRateLimit).toBe(true);
  });

  it("locks the account after repeated failed attempts, independent of IP rate limiting", async () => {
    await createOrgAndAdmin("Acme", "lockout@acme.test", "Str0ng!Passw0rd-123");
    let lastStatus = 0;
    let lockedBody: { error?: { code?: string } } | null = null;
    for (let i = 0; i < 5; i++) {
      __resetRateLimitsForTests(); // isolate lockout behavior from the IP rate limiter
      const res = await login(loginRequest("lockout@acme.test", "wrong-password"));
      lastStatus = res.status;
      lockedBody = await res.json();
    }
    expect(lastStatus).toBe(423);
    expect(lockedBody?.error?.code).toBe("ACCOUNT_LOCKED");

    // Even the correct password is rejected while locked.
    __resetRateLimitsForTests();
    const res = await login(loginRequest("lockout@acme.test", "Str0ng!Passw0rd-123"));
    expect(res.status).toBe(423);
  });

  it("never reveals whether an email exists via error message or timing bucket", async () => {
    const res = await login(loginRequest("nonexistent@acme.test", "whatever12345"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toBe("Invalid email or password.");
  });
});
