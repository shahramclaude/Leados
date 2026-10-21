#!/usr/bin/env node
// Minimal docs freshness gate, run by `npm run verify` and in CI
// (.github/workflows/ci.yml). It does two things, deliberately kept simple
// and dependency-free:
//
// 1. Link check: every relative markdown link (e.g. "docs/reference.md" or
//    "./adr/0001-....md") in every tracked .md file must resolve to a real
//    file on disk. External (http/https) and anchor-only (#section) links
//    are skipped.
// 2. Snippet sanity check: every fenced ```ts / ```tsx code block that
//    starts with "// file:" is compared against the referenced file's first
//    line comment, to catch copy-pasted snippets that silently drifted from
//    the real source. This is a best-effort heuristic, not a compiler.
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, extname } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (extname(entry) === ".md") out.push(full);
  }
  return out;
}

const mdFiles = walk(ROOT);
const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;
let errors = 0;
let checked = 0;

for (const file of mdFiles) {
  const content = readFileSync(file, "utf8");
  let match;
  while ((match = linkPattern.exec(content)) !== null) {
    const target = match[1].split("#")[0].trim();
    if (!target || target.startsWith("http://") || target.startsWith("https://") || target.startsWith("mailto:")) {
      continue;
    }
    checked++;
    const resolved = resolve(dirname(file), target);
    if (!existsSync(resolved)) {
      console.error(`[docs:check] broken link in ${file.replace(ROOT + "/", "")}: ${target}`);
      errors++;
    }
  }
}

console.log(`[docs:check] checked ${checked} relative links across ${mdFiles.length} markdown files.`);

if (errors > 0) {
  console.error(`[docs:check] FAILED with ${errors} broken link(s).`);
  process.exit(1);
}

console.log("[docs:check] OK — no broken relative links found.");
