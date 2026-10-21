#!/usr/bin/env node
// Dependency-free secret-scan fallback (Part 17-D).
//
// HONESTY NOTE: this is a pattern-matching safety net, not a replacement for
// gitleaks. This sandbox has no outbound access to download the gitleaks
// binary, so this script is what actually ran for this submission's
// verification log (see .gitleaks.toml header). CI must run real gitleaks
// (`.github/workflows/security.yml`) in addition to this script.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const RULES = [
  { name: "AWS Access Key ID", re: /AKIA[0-9A-Z]{16}/ },
  { name: "Generic AWS secret assignment", re: /aws(.{0,20})?(secret|access)?key['"]?\s*[:=]\s*['"][A-Za-z0-9/+=]{30,}['"]/i },
  { name: "Private key block", re: /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { name: "Slack token", re: /xox[baprs]-[0-9A-Za-z-]{10,}/ },
  { name: "GitHub token", re: /gh[pousr]_[A-Za-z0-9]{36,}/ },
  { name: "Generic bearer/API key assignment", re: /(api[_-]?key|secret|token|password)['"]?\s*[:=]\s*['"][A-Za-z0-9_\-/.+]{20,}['"]/i },
  { name: "Stripe secret key", re: /sk_live_[0-9a-zA-Z]{20,}/ },
  { name: "JWT-looking literal", re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
];

// Lines that are themselves the detection rules/allowlist/docs explaining
// the patterns must not trigger on their own source.
const SELF_EXCLUDE_FILES = new Set(["scripts/secret-scan.mjs", ".gitleaks.toml", "docs/SECURITY.md"]);

const ALLOWLIST_SUBSTRINGS = [
  "dev-insecure-session-secret-change-me",
  "postgresql://postgres:postgres@127.0.0.1:5432/app_db",
  "scrypt$32768$8$1$AAAA",
  "AAAAAAAAAAAAAAAAAAAAAA", // dummy hash filler used for timing-safe comparison
];

function listTrackedFiles() {
  try {
    const out = execSync("git ls-files", { encoding: "utf8" });
    return out.split("\n").filter(Boolean);
  } catch {
    // Not a git repo in this sandbox step — fall back to a conservative
    // directory walk excluding node_modules/.next.
    const { execSync: ex } = { execSync };
    const out = ex(
      "find . -type f \\( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.mjs' -o -name '*.json' -o -name '*.env*' -o -name '*.toml' -o -name '*.md' -o -name '*.yml' -o -name '*.yaml' \\) -not -path './node_modules/*' -not -path './.next/*' -not -path './.git/*'",
      { encoding: "utf8" },
    );
    return out.split("\n").filter(Boolean).map((p) => p.replace(/^\.\//, ""));
  }
}

function scan() {
  const files = listTrackedFiles();
  const findings = [];

  for (const file of files) {
    if (SELF_EXCLUDE_FILES.has(file)) continue;
    if (file.includes("node_modules/") || file.includes(".next/") || file.endsWith(".lock") || file === "package-lock.json") continue;
    let content;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue; // binary or unreadable, skip
    }
    const lines = content.split("\n");
    lines.forEach((line, idx) => {
      if (ALLOWLIST_SUBSTRINGS.some((s) => line.includes(s))) return;
      for (const rule of RULES) {
        if (rule.re.test(line)) {
          findings.push({ file, line: idx + 1, rule: rule.name, excerpt: line.trim().slice(0, 120) });
        }
      }
    });
  }

  return findings;
}

const findings = scan();
if (findings.length > 0) {
  console.error(`\n❌ secret-scan found ${findings.length} potential secret(s):\n`);
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}  [${f.rule}]  ${f.excerpt}`);
  }
  console.error("\nIf this is a false positive, add a narrow allowlist entry to .gitleaks.toml");
  console.error("and scripts/secret-scan.mjs ALLOWLIST_SUBSTRINGS with a comment explaining why.\n");
  process.exit(1);
}

console.log(`✅ secret-scan: 0 findings across ${listTrackedFiles().length} tracked file(s).`);
