import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  decodeCursor,
  DEFAULT_PAGE_LIMIT,
  encodeCursor,
  MAX_PAGE_LIMIT,
  parseLimit,
} from "@/lib/platform/pagination";

describe("pagination", () => {
  it("parseLimit defaults when missing, invalid, or non-positive", () => {
    expect(parseLimit(new URLSearchParams())).toBe(DEFAULT_PAGE_LIMIT);
    expect(parseLimit(new URLSearchParams("limit=abc"))).toBe(DEFAULT_PAGE_LIMIT);
    expect(parseLimit(new URLSearchParams("limit=0"))).toBe(DEFAULT_PAGE_LIMIT);
    expect(parseLimit(new URLSearchParams("limit=-5"))).toBe(DEFAULT_PAGE_LIMIT);
  });

  it("parseLimit caps at MAX_PAGE_LIMIT", () => {
    expect(parseLimit(new URLSearchParams("limit=999999"))).toBe(MAX_PAGE_LIMIT);
  });

  it("parseLimit passes through valid values under the cap", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: MAX_PAGE_LIMIT }), (limit) => {
        expect(parseLimit(new URLSearchParams(`limit=${limit}`))).toBe(limit);
      }),
    );
  });

  it("encodeCursor/decodeCursor round-trip any non-negative integer id", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }), (id) => {
        const encoded = encodeCursor({ id });
        expect(decodeCursor(encoded)).toEqual({ id });
      }),
    );
  });

  it("decodeCursor returns null for null, garbage, or malformed input", () => {
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor("not-base64-json!!")).toBeNull();
    expect(decodeCursor(Buffer.from("{}").toString("base64url"))).toBeNull();
  });
});
