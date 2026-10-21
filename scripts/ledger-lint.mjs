#!/usr/bin/env node
// scripts/ledger-lint.mjs
//
// Validates docs/EVIDENCE-LEDGER.md against the schema defined in
// docs/adr/ADR-0002-evidence-ledger-release-gate.md:
//   1. Every markdown table row has all 7 required columns.
//   2. `confidence_class` is one of: observed | estimated | inferred | assumed.
//   3. `status` is one of: verified | unverified | false.
//   4. `claim_id` is unique across the whole file.
//   5. Any row with status "verified" whose proof contains a `file:<path>` reference
//      must resolve to a real, readable file relative to the repo root.
//   6. Any row's proof must contain at least one recognized evidence marker
//      (`file:` or `cmd:`) — an empty or freeform proof is a schema violation.
//
// Exit code 0 only if every check passes. Prints PASS/FAIL per rule, per tenet T7
// ("measured, not claimed") — this script's own output is itself the proof that
// `npm run ledger:check` works, and should be pasted into any Verification Log
// that cites it.
//
// Usage:
//   node scripts/ledger-lint.mjs                 # lint, exit 0/1
//   node scripts/ledger-lint.mjs --stats          # also print claim status counts
//   node scripts/ledger-lint.mjs --file <path>    # lint a different ledger file

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

const REQUIRED_COLUMNS = [
  "claim_id",
  "claim",
  "layer",
  "confidence_class",
  "proof",
  "part",
  "status",
];
const VALID_CONFIDENCE_CLASSES = new Set([
  "observed",
  "estimated",
  "inferred",
  "assumed",
]);
const VALID_STATUSES = new Set(["verified", "unverified", "false"]);

function parseArgs(argv) {
  const args = { stats: false, file: "docs/EVIDENCE-LEDGER.md" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--stats") args.stats = true;
    else if (argv[i] === "--file") args.file = argv[++i];
  }
  return args;
}

function splitRow(line) {
  // Markdown table row: "| a | b | c |" -> ["a", "b", "c"]
  // Trim leading/trailing pipe, split on unescaped "|" (a "\|" inside a cell,
  // e.g. a shell command containing a pipe, is an escaped literal, not a
  // column separator).
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const PLACEHOLDER = "\u0000ESCAPED_PIPE\u0000";
  const protectedStr = trimmed.replace(/\\\|/g, PLACEHOLDER);
  return protectedStr
    .split("|")
    .map((cell) => cell.trim().split(PLACEHOLDER).join("|"));
}

function normalizeHeader(cell) {
  return cell.toLowerCase().replace(/[`*]/g, "").trim();
}

function isSeparatorRow(cells) {
  return cells.every((cell) => /^:?-{2,}:?$/.test(cell.trim()));
}

function extractLedgerTables(markdown) {
  const lines = markdown.split(/\r?\n/);
  const tables = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim().startsWith("|")) continue;
    const headerCells = splitRow(line).map(normalizeHeader);
    const isLedgerHeader = REQUIRED_COLUMNS.every((col) =>
      headerCells.includes(col)
    );
    if (!isLedgerHeader) continue;
    // Next non-blank line must be the separator row.
    const sepLine = lines[i + 1] ?? "";
    if (!sepLine.trim().startsWith("|") || !isSeparatorRow(splitRow(sepLine))) {
      continue;
    }
    const colIndex = {};
    headerCells.forEach((name, idx) => {
      colIndex[name] = idx;
    });
    const rows = [];
    let j = i + 2;
    for (; j < lines.length; j++) {
      const rowLine = lines[j];
      if (!rowLine.trim().startsWith("|")) break;
      const cells = splitRow(rowLine);
      if (cells.length < REQUIRED_COLUMNS.length) {
        rows.push({ lineNumber: j + 1, raw: rowLine, cells: null });
        continue;
      }
      rows.push({ lineNumber: j + 1, raw: rowLine, cells, colIndex });
    }
    tables.push({ headerLine: i + 1, rows });
    i = j;
  }
  return tables;
}

function extractFileRefs(proofText) {
  const refs = [];
  const re = /file:([^\s`),]+)/g;
  let match;
  while ((match = re.exec(proofText)) !== null) {
    refs.push(match[1]);
  }
  return refs;
}

function hasEvidenceMarker(proofText) {
  return /\b(file|cmd):/.test(proofText);
}

function lint(filePath) {
  const failures = [];
  const warnings = [];
  const seenClaimIds = new Map();
  const statusCounts = { verified: 0, unverified: 0, false: 0 };
  const confidenceCounts = { observed: 0, estimated: 0, inferred: 0, assumed: 0 };

  if (!existsSync(filePath)) {
    failures.push(`Ledger file not found: ${filePath}`);
    return { failures, warnings, statusCounts, confidenceCounts, totalRows: 0 };
  }

  const markdown = readFileSync(filePath, "utf8");
  const tables = extractLedgerTables(markdown);

  if (tables.length === 0) {
    failures.push(
      `No table with required columns (${REQUIRED_COLUMNS.join(", ")}) found in ${filePath}`
    );
    return { failures, warnings, statusCounts, confidenceCounts, totalRows: 0 };
  }

  let totalRows = 0;

  for (const table of tables) {
    for (const row of table.rows) {
      if (!row.cells) {
        failures.push(
          `Line ${row.lineNumber}: row has fewer than ${REQUIRED_COLUMNS.length} columns: "${row.raw.trim()}"`
        );
        continue;
      }
      totalRows++;
      const get = (name) => row.cells[row.colIndex[name]] ?? "";

      const claimId = get("claim_id").replace(/[`*]/g, "").trim();
      const confidenceClass = get("confidence_class").replace(/[`*]/g, "").trim();
      const status = get("status").replace(/[`*]/g, "").trim();
      const proof = get("proof").trim();
      const layer = get("layer").trim();
      const part = get("part").trim();
      const claim = get("claim").trim();

      if (!claimId) {
        failures.push(`Line ${row.lineNumber}: empty claim_id`);
      } else if (seenClaimIds.has(claimId)) {
        failures.push(
          `Line ${row.lineNumber}: duplicate claim_id "${claimId}" (first seen at line ${seenClaimIds.get(claimId)})`
        );
      } else {
        seenClaimIds.set(claimId, row.lineNumber);
      }

      if (!claim) {
        failures.push(`Line ${row.lineNumber} (${claimId}): empty claim text`);
      }
      if (!layer) {
        failures.push(`Line ${row.lineNumber} (${claimId}): empty layer`);
      }
      if (!part) {
        failures.push(`Line ${row.lineNumber} (${claimId}): empty part`);
      }

      if (!VALID_CONFIDENCE_CLASSES.has(confidenceClass)) {
        failures.push(
          `Line ${row.lineNumber} (${claimId}): invalid confidence_class "${confidenceClass}" — must be one of ${[...VALID_CONFIDENCE_CLASSES].join(", ")}`
        );
      } else {
        confidenceCounts[confidenceClass]++;
      }

      if (!VALID_STATUSES.has(status)) {
        failures.push(
          `Line ${row.lineNumber} (${claimId}): invalid status "${status}" — must be one of ${[...VALID_STATUSES].join(", ")}`
        );
      } else {
        statusCounts[status]++;
      }

      if (!proof || !hasEvidenceMarker(proof)) {
        failures.push(
          `Line ${row.lineNumber} (${claimId}): proof has no recognized evidence marker ("file:" or "cmd:"): "${proof}"`
        );
        continue;
      }

      if (status === "verified") {
        const fileRefs = extractFileRefs(proof);
        if (fileRefs.length === 0 && !/cmd:/.test(proof)) {
          warnings.push(
            `Line ${row.lineNumber} (${claimId}): status "verified" but proof has neither a checkable file: reference nor a cmd: reference`
          );
        }
        for (const ref of fileRefs) {
          const cleanPath = ref.split("#")[0];
          const absPath = resolve(REPO_ROOT, cleanPath);
          if (!existsSync(absPath)) {
            failures.push(
              `Line ${row.lineNumber} (${claimId}): status "verified" but proof file does not exist: ${cleanPath}`
            );
          }
        }
      }
    }
  }

  return { failures, warnings, statusCounts, confidenceCounts, totalRows };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const filePath = resolve(REPO_ROOT, args.file);

  console.log(`\n=== ledger-lint: ${args.file} ===`);
  const { failures, warnings, statusCounts, confidenceCounts, totalRows } = lint(filePath);

  console.log(`Rows parsed: ${totalRows}`);

  if (args.stats && totalRows > 0) {
    const verifiedPct = ((statusCounts.verified / totalRows) * 100).toFixed(1);
    const unverifiedOrFalsePct = (
      ((statusCounts.unverified + statusCounts.false) / totalRows) *
      100
    ).toFixed(1);
    console.log("\n-- status breakdown --");
    console.log(`  verified:   ${statusCounts.verified} (${verifiedPct}%)`);
    console.log(`  unverified: ${statusCounts.unverified}`);
    console.log(`  false:      ${statusCounts.false}`);
    console.log(`  unverified + false = ${unverifiedOrFalsePct}%`);
    console.log("\n-- confidence_class breakdown --");
    for (const [cls, count] of Object.entries(confidenceCounts)) {
      console.log(`  ${cls}: ${count}`);
    }
  }

  if (warnings.length > 0) {
    console.log(`\n-- warnings (${warnings.length}) --`);
    for (const w of warnings) console.log(`  WARN  ${w}`);
  }

  if (failures.length > 0) {
    console.log(`\n-- failures (${failures.length}) --`);
    for (const f of failures) console.log(`  FAIL  ${f}`);
    console.log(`\nledger-lint: FAIL (${failures.length} violation(s) in ${totalRows} rows)\n`);
    process.exit(1);
  }

  console.log(`\nledger-lint: PASS (0 violations in ${totalRows} rows)\n`);
  process.exit(0);
}

main();
