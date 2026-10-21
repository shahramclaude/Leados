#!/usr/bin/env node
// Lightweight repo secret scanner: fails CI if a secret-shaped string is
// committed to source (not logs — that's covered by redact.test.ts).
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const IGNORE_DIRS = new Set(["node_modules", ".next", ".git", "backups", "reports", "coverage", "dist"]);
const TEXT_EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".md", ".yml", ".yaml", ".env.example"]);

const PATTERNS = [
  { name: "openai_key", re: /sk-[A-Za-z0-9]{16,}/g },
  { name: "aws_key", re: /AKIA[0-9A-Z]{16}/g },
  { name: "private_key_block", re: /-----BEGIN (RSA|EC|OPENSSH|PGP) PRIVATE KEY-----/g },
  { name: "hardcoded_password_assignment", re: /password\s*=\s*["'][^"'\s]{6,}["']/gi },
];

// Allowlist: files that intentionally contain secret-shaped example/test
// strings for the redaction test suite itself.
const ALLOWLIST = [path.join("src", "lib", "obs", "__tests__", "redact.test.ts"), path.join("scripts", "secret-scan.mjs")];

let findings = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (IGNORE_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    const rel = path.relative(ROOT, full);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full);
    } else if (TEXT_EXT.has(path.extname(full)) || entry === ".env.example") {
      if (ALLOWLIST.includes(rel)) continue;
      const content = readFileSync(full, "utf8");
      for (const { name, re } of PATTERNS) {
        const matches = content.match(re);
        if (matches) findings.push({ file: rel, pattern: name, count: matches.length });
      }
    }
  }
}

walk(ROOT);

if (findings.length) {
  console.error("FAIL: secret-shaped strings found in source:");
  for (const f of findings) console.error(`  ${f.file}: ${f.pattern} x${f.count}`);
  process.exit(1);
}
console.log("OK: no secret-shaped strings found in scanned source files.");
