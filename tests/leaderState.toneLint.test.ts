import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { violatesNeedsRespectingTone } from "@/lib/humanNeeds";

const SCAN_DIRS = ["src/app/my-state", "src/components/leaderState", "src/lib/leaderState"];

function listFiles(rootDir: string, dirs: string[]): string[] {
  const files: string[] = [];
  for (const dir of dirs) {
    const abs = path.join(rootDir, dir);
    let entries;
    try {
      entries = readdirSync(abs, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(abs, entry.name);
      if (entry.isDirectory()) files.push(...listFiles(rootDir, [path.join(dir, entry.name)]));
      else if (/\.(tsx|ts)$/.test(entry.name)) files.push(full);
    }
  }
  return files;
}

describe("coaching-tone lint — never pressure language on leader-state surfaces", () => {
  it("no visible copy in My State surfaces uses pressure-coded phrasing", () => {
    const files = listFiles(process.cwd(), SCAN_DIRS);
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const hits = violatesNeedsRespectingTone(source);
      if (hits.length > 0) offenders.push(`${path.relative(process.cwd(), file)}: ${hits.join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });
});
