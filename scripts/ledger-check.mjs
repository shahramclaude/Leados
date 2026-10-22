// Validates docs/EVIDENCE-LEDGER.md: every row whose Status column is
// "Verified" must carry a non-empty Proof column that references a file
// that actually exists in the repo (a test, a script, or a route file).
// This is what keeps "Verified" honest — Part 40's standing rule.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const LEDGER_PATH = path.join(process.cwd(), "docs", "EVIDENCE-LEDGER.md");

function parseTableRows(markdown) {
  const lines = markdown.split("\n");
  const rows = [];
  let inTable = false;
  let headers = [];
  for (const line of lines) {
    if (!line.trim().startsWith("|")) {
      inTable = false;
      continue;
    }
    const cells = line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());
    if (!inTable) {
      headers = cells.map((h) => h.toLowerCase());
      inTable = true;
      continue;
    }
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue; // separator row
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

function extractProofPaths(proofCell) {
  const matches = proofCell.match(/`([^`]+)`/g) ?? [];
  // Only treat backtick spans that look like real repo-relative file paths
  // as proof references (must contain a "/" and a recognizable extension).
  // This deliberately excludes quoted test-description fragments like
  // `a stale check...` which also appear in backticks for readability.
  return matches
    .map((m) => m.slice(1, -1))
    .filter((p) => p.includes("/") && /\.[a-zA-Z0-9]+$/.test(p) && !p.includes("..."));
}

function main() {
  if (!existsSync(LEDGER_PATH)) {
    console.error(`FAIL: ${LEDGER_PATH} not found`);
    process.exit(1);
  }
  const markdown = readFileSync(LEDGER_PATH, "utf8");
  const rows = parseTableRows(markdown).filter((r) => r.claim && r.status);

  if (rows.length === 0) {
    console.error("FAIL: no ledger rows parsed — check table formatting");
    process.exit(1);
  }

  let failures = 0;
  let verifiedCount = 0;

  for (const row of rows) {
    const status = (row.status ?? "").toLowerCase();
    if (!status.includes("verified")) continue;
    verifiedCount += 1;
    const proofCell = row.proof ?? row["proof ref"] ?? "";
    const proofPaths = extractProofPaths(proofCell);
    if (proofPaths.length === 0) {
      console.error(`FAIL: "${row.claim}" is Verified but has no proof reference`);
      failures += 1;
      continue;
    }
    for (const p of proofPaths) {
      const resolved = path.join(process.cwd(), p);
      if (!existsSync(resolved)) {
        console.error(`FAIL: "${row.claim}" cites proof "${p}" which does not exist`);
        failures += 1;
      }
    }
  }

  console.log(`Ledger rows checked: ${rows.length} (Verified: ${verifiedCount})`);
  if (failures > 0) {
    console.error(`ledger:check FAILED with ${failures} problem(s)`);
    process.exit(1);
  }
  console.log("ledger:check PASSED — every Verified claim has a real, existing proof reference.");
}

main();
