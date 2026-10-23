// Lint gate (Phase 4, gate 5): every UI surface and API route that
// renders a strategy-time classification (strategic/operational/reactive)
// MUST also render/return its confidence/uncertainty. This is enforced
// both at the type level (ClassificationResult.confidence is a required
// field, not optional — see types.ts) and here, by scanning the actual
// source files that touch classification for the token "confidence".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");

const SURFACES_THAT_MUST_SHOW_CONFIDENCE = [
  "src/app/time/strategy-mirror/page.tsx",
  "src/app/api/time-economics/strategy-mirror/self/route.ts",
  "src/lib/time-economics/strategyClassifier.ts",
];

test("classification uncertainty is rendered/returned on every surface that touches it", () => {
  for (const relativePath of SURFACES_THAT_MUST_SHOW_CONFIDENCE) {
    const contents = readFileSync(resolve(repoRoot, relativePath), "utf8");
    assert.ok(
      /confidence/i.test(contents),
      `${relativePath} must reference 'confidence' — strategy-time classification uncertainty must be visible on every surface (Phase 4 gate 5)`,
    );
  }
});

test("ClassificationResult type requires a numeric confidence field (not optional)", () => {
  const typesSrc = readFileSync(resolve(repoRoot, "src/lib/time-economics/types.ts"), "utf8");
  assert.match(typesSrc, /confidence:\s*number;/, "ClassificationResult.confidence must be a required (non-optional) number field");
});
