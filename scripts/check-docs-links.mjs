#!/usr/bin/env node
// Docs freshness CI: verifies every relative markdown link inside docs/ and
// the root *.md files actually resolves to a file on disk. Does not check
// external (http/https) links — that would require network access CI
// shouldn't depend on for a basic freshness gate.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { globSync } from "node:fs";

const files = globSync(["**/*.md"], {
  exclude: (p) => p.includes("node_modules") || p.includes(".next"),
});

const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;
let errorCount = 0;
let checkedLinks = 0;

for (const file of files) {
  const content = readFileSync(file, "utf8");
  const dir = dirname(file);
  let match;
  while ((match = linkPattern.exec(content)) !== null) {
    let target = match[1].trim();

    // Skip external links, mailto, and anchors-only links.
    if (/^(https?:)?\/\//.test(target) || target.startsWith("mailto:") || target.startsWith("#")) {
      continue;
    }

    // Strip a trailing anchor (e.g. "./FOO.md#section").
    const [pathPart] = target.split("#");
    if (!pathPart) continue;

    checkedLinks += 1;
    const resolved = resolve(dir, pathPart);
    if (!existsSync(resolved)) {
      console.error(`Broken link in ${file}: "${target}" -> ${resolved} does not exist`);
      errorCount += 1;
    }
  }
}

console.log(`Checked ${checkedLinks} internal links across ${files.length} markdown files.`);

if (errorCount > 0) {
  console.error(`${errorCount} broken internal link(s) found.`);
  process.exit(1);
}

console.log("All internal docs links resolve.");
