import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkAuth } from "@/lib/platform/auth";

describe("auth", () => {
  const originalToken = process.env.API_TOKEN;

  beforeEach(() => {
    process.env.API_TOKEN = "test-token";
  });

  afterEach(() => {
    process.env.API_TOKEN = originalToken;
  });

  function request(headers: Record<string, string> = {}) {
    return new Request("http://localhost/api/events", { headers });
  }

  it("rejects a request with no Authorization header (401)", () => {
    const result = checkAuth(request());
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });

  it("rejects a malformed Authorization header (401)", () => {
    const result = checkAuth(request({ authorization: "Basic abc123" }));
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });

  it("rejects an incorrect bearer token (403)", () => {
    const result = checkAuth(request({ authorization: "Bearer wrong-token" }));
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
  });

  it("accepts the correct bearer token", () => {
    const result = checkAuth(request({ authorization: "Bearer test-token" }));
    expect(result.ok).toBe(true);
  });
});
