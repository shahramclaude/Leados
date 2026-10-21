import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DOMAIN_DIR = join(process.cwd(), "src", "lib", "domain");

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts"))
    .map((entry) => join(dir, entry.name));
}

/**
 * Strips /** *\/ block comments and // line comments before scanning so that
 * documentation *talking about* the banned APIs (e.g. "use a Prng instead of
 * Math.random()") doesn't trip the convention check — only executable code
 * calling the banned APIs should fail. This was caught by actually running
 * the suite: the first version of this test flagged prng.ts/clock.ts for
 * banned calls that only appeared in their own explanatory JSDoc comments.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("Determinism convention for src/lib/domain", () => {
  const files = listSourceFiles(DOMAIN_DIR);

  it("found at least one domain source file to check (sanity guard against a vacuous pass)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s does not call Math.random()", (file) => {
    const content = stripComments(readFileSync(file, "utf8"));
    expect(content).not.toMatch(/Math\.random\s*\(/);
  });

  it.each(files)("%s does not call Date.now() or `new Date()` directly", (file) => {
    const content = stripComments(readFileSync(file, "utf8"));
    // clock.ts is the single sanctioned wrapper allowed to touch the real
    // clock; everything else in the domain layer must go through it.
    if (file.endsWith(`${join("domain", "clock.ts")}`)) {
      return;
    }
    expect(content).not.toMatch(/Date\.now\s*\(/);
    expect(content).not.toMatch(/new Date\s*\(/);
  });
});
