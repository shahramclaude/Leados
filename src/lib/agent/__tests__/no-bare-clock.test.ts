// Second, independent enforcement layer for the Clock contract described in
// clock.ts (the first layer is the eslint no-restricted-syntax rule). This
// test greps the actual source tree so it fails even if someone disables or
// routes around the lint rule (e.g. with an inline eslint-disable comment).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const AGENT_DIR = join(__dirname, "..");

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "__tests__") continue;
      out.push(...listTsFiles(full));
    } else if (entry.endsWith(".ts") && entry !== "clock.ts") {
      out.push(full);
    }
  }
  return out;
}

describe("Clock determinism contract", () => {
  it("contains no direct Date.now() or bare new Date() reads outside clock.ts", () => {
    const violations: string[] = [];
    for (const file of listTsFiles(AGENT_DIR)) {
      const content = readFileSync(file, "utf8");
      const lines = content.split("\n");
      lines.forEach((line, idx) => {
        if (/Date\.now\(\)/.test(line)) violations.push(`${file}:${idx + 1}: Date.now()`);
        if (/new Date\(\s*\)/.test(line)) violations.push(`${file}:${idx + 1}: new Date()`);
      });
    }
    expect(violations).toEqual([]);
  });
});
