import { describe, expect, it } from "vitest";
import { redactString, redactValue } from "../redact";

describe("secret/PII redaction", () => {
  it("redacts a planted OpenAI-shaped API key", () => {
    const planted = "sk-THISISAPLANTEDTESTSECRETKEY1234567890";
    const line = `calling provider with key ${planted} for request`;
    const redacted = redactString(line);
    expect(redacted).not.toContain(planted);
    expect(redacted).toContain("[REDACTED]");
  });

  it("redacts a planted bearer token", () => {
    const line = "Authorization: Bearer abc123.def456-PLANTED_SECRET_TOKEN";
    const redacted = redactString(line);
    expect(redacted).not.toContain("PLANTED_SECRET_TOKEN");
  });

  it("redacts a planted AWS access key id", () => {
    const planted = "AKIAABCDEFGHIJKLMNOP";
    const redacted = redactString(`aws_access_key_id=${planted}`);
    expect(redacted).not.toContain(planted);
  });

  it("redacts a password embedded in a connection string", () => {
    const planted = "postgresql://appuser:SuperSecretPW123@db.internal:5432/app";
    const redacted = redactString(planted);
    expect(redacted).not.toContain("SuperSecretPW123");
    expect(redacted).toContain("appuser:[REDACTED]@");
  });

  it("partially masks an email so the domain stays debuggable but the identity doesn't leak", () => {
    const redacted = redactString("contact jane.doe@example.com for approval");
    expect(redacted).not.toContain("jane.doe@example.com");
    expect(redacted).toContain("@example.com");
  });

  it("redacts sensitive object keys outright, recursively", () => {
    const input = { user: { name: "Jane", password: "hunter2", nested: { apiKey: "sk-nested-secret-value" } } };
    const out = redactValue(input) as typeof input;
    expect(out.user.password).toBe("[REDACTED]");
    expect(JSON.stringify(out)).not.toContain("hunter2");
    expect(JSON.stringify(out)).not.toContain("sk-nested-secret-value");
    expect(out.user.name).toBe("Jane");
  });

  it("leaves ordinary, non-sensitive log fields untouched", () => {
    const out = redactValue({ route: "health", durationMs: 42, status: 200 });
    expect(out).toEqual({ route: "health", durationMs: 42, status: 200 });
  });
});
