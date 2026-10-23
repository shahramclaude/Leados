import { describe, expect, it } from "vitest";
// @ts-expect-error - plain JS module, no type declarations, used for its
// runtime behavior only (shared with the standalone scripts/uncertainty-lint.mjs CLI).
import { checkUncertaintyDisclosure } from "../scripts/uncertainty-lint.mjs";

describe("uncertainty-displayed lint", () => {
  it("passes on every leader-state surface in the current source tree", () => {
    const violations = checkUncertaintyDisclosure(process.cwd());
    expect(violations).toEqual([]);
  });
});
